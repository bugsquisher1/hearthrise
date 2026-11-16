-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-28-tower-section.sql — THE BURNING TOWER REACHES THE PAGE, BEHIND ITS SWITCH (lane/b-tower-window, systems-engineer,
--   2026-11-16; Tyler 2026-11-14, the board's "2026-11-14 The Burning Tower" §5 (c) "one menu that shows all of it", §8 the window's words;
--   the server half is 2027-04-24-tower-climb.sql ("NOT HERE: ... the window and its section") and 2027-04-27-tower-chest.sql
--   ("hr_chest_section ... the window lane projects it")).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §3. ON THE EA SECURITY LIST with the Tower's verbs (it reads only). ORDER: right after 2027-04-27-tower-chest.sql (§0
-- refuses without it). EDGE: none. CLIENT: src/session/tower-sections.js reads the section, src/session/tower-intents.js sends the verbs.
--
-- ── WHAT IT DOES ─────────────────────────────────────────────────────────────
-- THE SECTION `tower` = hr_tower_section(user, slot): NULL while the `burning_tower` switch is off for the account (the page then draws no
-- Tower window, the Great Hearth's tap opens the bag as before, and nothing is pressable), else every number the window draws:
--   { hunt,                                   the Tower's hunt id (the hunt section names it while a climb runs)
--     rules { room_size, landing_every, floor_limit_ms, landing_limit_ms, week_back, floor_top },     hr_tower_rules
--     pays { xp_pm, coin, drops, bestiary, death_loss_pm, blessings, stamina },                     the Tower's own mode row
--     best_floor, best_landing,               tower_progress (0 for a hero who never climbed)
--     week, week_ends_at,                     this UTC week's Monday and the instant the next week starts (hr_tower_week)
--     base,                                   the week's base: a landing over it gives its key once this week (hr_tower_write's rule)
--     starts [floor],                         the floors this hero may start from now (hr_tower_starts: the one list hr_tower_start reads)
--     landings [{ landing, key }],            this week's landings taken, and the key each one gave (the key table's row at or under it)
--     open [landing],                         the landings in (base, best_landing] not taken yet this week: a key each, waiting
--     next_landing,                           the first landing over the hero's best: a new best gives its key too
--     run { session, start, top, floors, floor } | null,                 the climb now (floor: hr_tower_floor_of, the room standing)
--     last { session, start, top, floors, end_reason, ended_at, keys [{ landing, key }] } | null,   the newest climb that ended
--     chest }                                 hr_chest_section (2027-04-27-tower-chest.sql), unchanged
-- Every envelope replaces it, and nothing in it is a client value. Two verbs already answer it as `chest_section`; the window re-reads
-- the character after each press, so the window's numbers only ever come from here.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- The settle reads every section: off, ONE primary-key read of hr_feature_switches per settle. On: two one-row catalogue reads, one
-- progress row, this week's landing rows (at most a few dozen), the open run (tower_runs_hero index), the newest ended run and its landing
-- rows, and hr_chest_section (the key table's few rows). No per-floor or per-kill read.
--
-- REVERSIBILITY: delete the section row, drop hr_tower_section. No player value moves with any of it.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.tower_progress') is null or to_regclass('public.tower_runs') is null or to_regclass('public.tower_landings') is null
     or to_regprocedure('public.hr_tower_starts(uuid,integer)') is null or to_regprocedure('public.hr_tower_floor_of(uuid)') is null
     or to_regprocedure('public.hr_tower_week(timestamp with time zone)') is null then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb.sql first (the climb''s tables and helpers)'; end if;
  if to_regprocedure('public.hr_chest_section(uuid,integer)') is null or to_regclass('public.hr_chest_keys') is null then
    raise exception 'PRECONDITION: apply 2027-04-27-tower-chest.sql first (hr_chest_section, the key table)'; end if;
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regclass('public.hr_state_sections') is null
     or not exists (select 1 from public.hr_feature_switches where switch_id = 'burning_tower') then
    raise exception 'PRECONDITION: the feature switches, the burning_tower switch and the section registry first'; end if;
end $mig$;

-- ── §1 THE SECTION ───────────────────────────────────────────────────────────
-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_tower_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_tower_rules%rowtype; m public.hr_session_modes%rowtype; v_best int := 0; v_land int := 0; v_week date; v_base int;
  v_run public.tower_runs%rowtype; v_last public.tower_runs%rowtype; v_run_j jsonb := null; v_last_j jsonb := null;
begin
  -- TOWER-SECTION (2027-04-28-tower-section.sql)
  if not public.hr_feature_on('burning_tower', p_user) then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into r from public.hr_tower_rules where id;
  if not found then return null; end if;
  select s.* into m from public.hr_ground_session_modes g join public.hr_session_modes s on s.mode_id = g.mode_id where g.hunt_id = r.hunt_id;
  if not found then return null; end if;
  select p.best_floor, p.best_landing into v_best, v_land from public.tower_progress p where p.user_id = p_user and p.slot = p_slot;
  v_best := coalesce(v_best, 0); v_land := coalesce(v_land, 0);
  v_week := public.hr_tower_week(now());
  v_base := greatest(0, v_land - r.week_back);
  select * into v_run from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.ended_at is null order by t.started_at desc limit 1;
  if v_run.session_id is not null then
    v_run_j := jsonb_build_object('session', v_run.session_id, 'start', v_run.start_floor, 'top', v_run.top_floor, 'floors', v_run.floors,
                                  'floor', public.hr_tower_floor_of(v_run.instance_id));
  end if;
  -- the newest climb STARTED that has ended (a run's end is its session's, the instant the engine stopped, which a late settle can put
  -- before a newer run's; its start is the door's own now())
  select * into v_last from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.ended_at is not null
   order by t.started_at desc limit 1;
  if v_last.session_id is not null then
    v_last_j := jsonb_build_object('session', v_last.session_id, 'start', v_last.start_floor, 'top', v_last.top_floor, 'floors', v_last.floors,
      'end_reason', v_last.end_reason, 'ended_at', v_last.ended_at,
      'keys', coalesce((select jsonb_agg(jsonb_build_object('landing', l.landing,
                                         'key', (select k.key_id from public.hr_chest_keys k where k.from_landing <= l.landing order by k.from_landing desc limit 1))
                                         order by l.landing)
                          from public.tower_landings l where l.user_id = p_user and l.slot = p_slot and l.session_id = v_last.session_id), '[]'::jsonb));
  end if;
  return jsonb_build_object(
    'hunt', r.hunt_id,
    'rules', jsonb_build_object('room_size', r.room_size, 'landing_every', r.landing_every, 'floor_limit_ms', r.floor_limit_ms,
                                'landing_limit_ms', r.landing_limit_ms, 'week_back', r.week_back, 'floor_top', r.floor_top),
    'pays', jsonb_build_object('xp_pm', m.xp_pm, 'coin', m.coin, 'drops', m.drops, 'bestiary', m.bestiary, 'death_loss_pm', m.death_loss_pm,
                               'blessings', m.blessings, 'stamina', m.stamina),
    'best_floor', v_best, 'best_landing', v_land,
    'week', v_week, 'week_ends_at', ((v_week + 7)::timestamp at time zone 'UTC'),
    'base', v_base,
    'starts', to_jsonb(public.hr_tower_starts(p_user, p_slot)),
    'landings', coalesce((select jsonb_agg(jsonb_build_object('landing', l.landing,
                                   'key', (select k.key_id from public.hr_chest_keys k where k.from_landing <= l.landing order by k.from_landing desc limit 1))
                                   order by l.landing)
                            from public.tower_landings l where l.user_id = p_user and l.slot = p_slot and l.week = v_week), '[]'::jsonb),
    'open', coalesce((select jsonb_agg(f order by f) from generate_series(v_base + r.landing_every, v_land, r.landing_every) f
                       where f % r.landing_every = 0
                         and not exists (select 1 from public.tower_landings l where l.user_id = p_user and l.slot = p_slot and l.week = v_week and l.landing = f)),
                     '[]'::jsonb),
    'next_landing', (v_land / r.landing_every + 1) * r.landing_every,
    'run', v_run_j,
    'last', v_last_j,
    'chest', public.hr_chest_section(p_user, p_slot));
end $fn$;
revoke all on function public.hr_tower_section(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_tower_section(uuid, int) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('tower', 'hr_tower_section', '2027-04-28-tower-section.sql: the Burning Tower''s window (the floors this hero may start from, this week''s landings and keys, the climb now and the last one, what a climb pays, the Hearth Chest''s menu), while the `burning_tower` switch is on for the account')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 (no verb: the window sends hr_tower_start, hr_chest_open and hr_chest_stoke_default, already on the client baseline) ─

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u     constant uuid := '000000c0-0000-4000-a000-0000704e5ec1';
  k       constant text := '000000c0-0000-4000-b000-5ec1';
  v       jsonb; s jsonb; v_scope text; v_hunt text; v_sid uuid; v_tw jsonb; v_t0 timestamptz; r public.hr_tower_rules%rowtype; v_key text;
begin
  select * into r from public.hr_tower_rules where id;
  select scope into v_scope from public.hr_feature_switches where switch_id = 'burning_tower';
  if r.hunt_id is null or v_scope is null then raise exception 'tower-section §3: the Tower''s rules or its switch are not there to probe with'; end if;
  select key_id into v_key from public.hr_chest_keys order by from_landing limit 1;
  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Section') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tower-section §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-section §3: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;

    -- (a) OFF: no section on either channel.
    update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower';
    if public.hr_tower_section(v_u, 0) is not null then raise exception 'tower-section §3(a): the switch is off and the section reads %', public.hr_tower_section(v_u, 0); end if;
    if (public.hr_state_of(v_u, 0) ? 'tower') and public.hr_state_of(v_u, 0)->'tower' <> 'null'::jsonb then
      raise exception 'tower-section §3(a): the switch is off and the envelope carries %', public.hr_state_of(v_u, 0)->'tower'; end if;

    -- (b) ON, A NEW HERO: the catalogue's rules, the Tower's own mode, floor 1 the one start, no landing, no run, the chest's menu.
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = 'burning_tower';
    s := public.hr_state_of(v_u, 0)->'tower';
    if s is null or s->>'hunt' is distinct from r.hunt_id or (s->'rules'->>'landing_every')::int <> r.landing_every
       or (s->'rules'->>'floor_limit_ms')::int <> r.floor_limit_ms or (s->'rules'->>'landing_limit_ms')::int <> r.landing_limit_ms
       or (s->'pays'->>'xp_pm')::int is distinct from (select sm.xp_pm from public.hr_ground_session_modes g join public.hr_session_modes sm using (mode_id) where g.hunt_id = r.hunt_id)
       or (s->'pays'->>'coin')::boolean or (s->'pays'->>'drops')::boolean or (s->'pays'->>'death_loss_pm')::int <> 0
       or s->'starts' <> '[1]'::jsonb or (s->>'best_floor')::int <> 0 or s->'landings' <> '[]'::jsonb or s->'open' <> '[]'::jsonb
       or (s->>'next_landing')::int <> r.landing_every or s->'run' <> 'null'::jsonb or s->'last' <> 'null'::jsonb
       or jsonb_array_length(s->'chest'->'keys') <> (select count(*) from public.hr_chest_keys)
       or (s->>'week_ends_at')::timestamptz <= now() or (s->>'week_ends_at')::timestamptz > now() + interval '7 days' then
      raise exception 'tower-section §3(b): a new hero''s section reads %', s; end if;

    -- (c) A CLIMB: the run shows the room standing; a landing taken shows in the week and gives its key; the end makes it the last run.
    v := public.hr_tower_start(0, 1, (k || '00000001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-section §3(c): floor 1 answered %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    s := public.hr_tower_section(v_u, 0);
    if (s->'run'->>'session')::uuid is distinct from v_sid or (s->'run'->>'start')::int <> 1 or (s->'run'->>'floor')::int <> 1 then
      raise exception 'tower-section §3(c): the open climb reads %', s->'run'; end if;
    select h.settled_to into v_t0 from public.hunt_sessions h where h.id = v_sid;
    v_tw := public.hr_tower_check(v_sid, ('{"tower": {"floors": ' || (select jsonb_agg(f) from generate_series(1, r.landing_every) f)::text || '}}')::jsonb,
                                  v_t0, v_t0 + make_interval(secs => r.landing_every * r.stair_ms / 1000.0));
    perform public.hr_tower_write(v_u, 0, v_sid, v_tw, r.landing_every * r.room_size, v_t0 + make_interval(secs => r.landing_every * r.stair_ms / 1000.0));
    s := public.hr_tower_section(v_u, 0);
    if (s->'run'->>'top')::int <> r.landing_every or (s->'run'->>'floor')::int <> r.landing_every + 1 or (s->>'best_landing')::int <> r.landing_every
       or s->'landings' <> jsonb_build_array(jsonb_build_object('landing', r.landing_every, 'key', v_key))
       or not (s->'starts' @> to_jsonb(array[r.landing_every + 1])) or s->'open' <> '[]'::jsonb
       or (s->>'next_landing')::int <> 2 * r.landing_every then
      raise exception 'tower-section §3(c): after a landing the section reads %', s; end if;
    perform public.hr_hunt_close(v_sid, 'died', now(), true);
    s := public.hr_tower_section(v_u, 0);
    if s->'run' <> 'null'::jsonb or (s->'last'->>'session')::uuid is distinct from v_sid or s->'last'->>'end_reason' is distinct from 'died'
       or (s->'last'->>'top')::int <> r.landing_every
       or s->'last'->'keys' <> jsonb_build_array(jsonb_build_object('landing', r.landing_every, 'key', v_key))
       or ((s->'chest'->'keys'->0->'held'->>'bag')::int) <> 1 then
      raise exception 'tower-section §3(c): after the climb ended the section reads %', s; end if;

    -- (d) A NEW WEEK'S OPEN LANDINGS: the landing row moved to last week leaves it open (a key waiting) this week.
    update public.tower_landings set week = week - 7 where user_id = v_u;
    s := public.hr_tower_section(v_u, 0);
    if s->'open' <> jsonb_build_array(r.landing_every) or s->'landings' <> '[]'::jsonb then
      raise exception 'tower-section §3(d): a landing taken last week reads open %, this week %', s->'open', s->'landings'; end if;

    raise exception using errcode = 'HRS01', message = 'tower-section §3 complete - rolling back';
  exception when sqlstate 'HRS01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'burning_tower') is distinct from v_scope then
    raise exception 'tower-section §3: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.tower_runs where user_id = v_u)
     or exists (select 1 from public.tower_landings where user_id = v_u) or exists (select 1 from public.player_intents where user_id = v_u) then
    raise exception 'tower-section §3: a probe row leaked'; end if;
  -- (e) THE GRANTS: no client role reads the section directly; it is plpgsql (planned once a backend).
  if has_function_privilege('anon', 'public.hr_tower_section(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_tower_section(uuid,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_tower_section(uuid,integer)', 'execute') then
    raise exception 'tower-section §3(e): a client role reaches the section'; end if;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_tower_section(uuid,integer)'::regprocedure) <> 'plpgsql' then
    raise exception 'tower-section §3(e): the section is not plpgsql'; end if;
  raise notice 'tower-section §3 OK: off hides the section, on serves the rules, the mode, the starts, the week, the climb now and the last one, the chest; the grants';
end $chk$;
