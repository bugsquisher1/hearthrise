-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-28-tower-section.sql — THE BURNING TOWER REACHES THE PAGE, BEHIND ITS SWITCH (lane/b-tower-window, systems-engineer,
--   2026-11-16; Tyler 2026-11-14, the board's "2026-11-14 The Burning Tower" §5 (c) "one menu that shows all of it", §8 the window's words;
--   the server half is 2027-04-24-tower-climb.sql ("NOT HERE: ... the window and its section") and 2027-04-27-tower-chest.sql
--   ("hr_chest_section ... the window lane projects it")). Re-cut the same day for Tyler's 2026-11-16 rulings: 10-floor CHECKPOINTS replace
--   the week that started 60 floors under your best (lane/c-tower-checkpoints), and KEY FAMILIES cap chests OPENED a week, not keys earned
--   (lane/c-tower-chest), so the section carries no week of landings any more.
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §3. ON THE EA SECURITY LIST with the Tower's verbs (it reads only). ORDER: right after 2027-04-27-tower-chest.sql (§0
-- refuses without it). EDGE: none. CLIENT: src/session/tower-sections.js reads the section, src/session/tower-intents.js sends the verbs.
--
-- ── WHAT IT DOES ─────────────────────────────────────────────────────────────
-- THE SECTION `tower` = hr_tower_section(user, slot): NULL while the `burning_tower` switch is off for the account (the page then draws no
-- Tower window, the Great Hearth's tap opens the bag as before, and nothing is pressable), else every number the window draws:
--   { hunt,                                   the Tower's hunt id (the hunt section names it while a climb runs)
--     rules { room_size, landing_every, floor_limit_ms, landing_limit_ms, floor_top },     hr_tower_rules
--     pays { xp_pm, coin, drops, bestiary, death_loss_pm, blessings, stamina },            the Tower's own mode row
--     best_floor,                             tower_progress (0 for a hero who never climbed)
--     record,                                 hr_tower_record: the best floor the checkpoints are read from (in a party, its lowest seat's)
--     checkpoints [landing],                  hr_mode_checkpoints(the Tower's mode, record): the landings a climb may start after, 0 = floor 1,
--                                             the ONE list hr_tower_start(p_slot, p_landing, p_idem) checks p_landing against
--     run { session, start, top, floors, floor } | null,                 the climb now (floor: hr_tower_floor_of, the room standing)
--     last { session, start, top, floors, end_reason, ended_at, keys [{ landing, key }], withheld, best_before } | null,   the newest
--                                             climb that ended, the keys its landings minted and how many the held limit kept back (the
--                                             ledger's tower_key / tower_key_withheld rows of that session: the mint's own journal), and
--                                             best_before: the hero's best floor before that climb (the highest top of its EARLIER runs, 0
--                                             for none) when that climb reached the hero's best, else null (it set no record): the end
--                                             card's "New Best +N" (lane/b-tower-window, direction A, Tyler 2026-11-16)
--     party [{ seat, name, floor, outfit }],  the OTHER seats of the hero's open party (hr_hunt_party_of): each seat's own name as the
--                                             party already shows it (hr_character_name), its best floor (tower_progress, 0 if never) and its
--                                             worn outfit (player_outfits.outfit_id, null: its role's): the Climb tab's party markers and
--                                             the "Party start" the record already reads; [] alone
--     chest }                                 hr_chest_section (2027-04-27-tower-chest.sql), unchanged: families [], week_ends, keys
-- NOT HERE (the field: a rank, the heroes just above and below): those are a Tower BOARD's rows (a `tower` arm of leaderboard_ranked,
-- refreshed with the others, its hidden list and name checks), not a per-settle count over every hero's progress. Until that board
-- lands the window draws no rank and no rivals (src/session/tower-sections.js fieldOf: absent, nothing drawn).
-- Every envelope replaces it, and nothing in it is a client value. Two verbs already answer it as `chest_section`; the window re-reads
-- the character after each press, so the window's numbers only ever come from here.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- The settle reads every section: off, ONE primary-key read of hr_feature_switches per settle. On: two one-row catalogue reads, one
-- progress row, the record (one progress row, or a party's seats: at most four), the open run (tower_runs_hero index), the newest ended run
-- and its ledger rows (player_ledger_session: one session's rows), and hr_chest_section (the key table's few rows). No per-floor read.
-- The party: hr_hunt_party_of (one index read), then at most three other seats, each a primary-key read of tower_progress and
-- player_outfits and its name. best_before: only while the newest ended run holds the hero's record (it reached its best), the
-- hero's earlier runs on the tower_runs_hero index (one hero's runs, never another's); every other read answers null with no scan.
--
-- REVERSIBILITY: delete the section row, drop hr_tower_section. No player value moves with any of it.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.tower_progress') is null or to_regclass('public.tower_runs') is null
     or to_regprocedure('public.hr_mode_checkpoints(text,integer)') is null or to_regprocedure('public.hr_tower_record(uuid,integer)') is null
     or to_regprocedure('public.hr_tower_floor_of(uuid)') is null then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb.sql first (the climb''s tables, its checkpoints and record)'; end if;
  if to_regprocedure('public.hr_chest_section(uuid,integer)') is null or to_regclass('public.hr_chest_keys') is null then
    raise exception 'PRECONDITION: apply 2027-04-27-tower-chest.sql first (hr_chest_section, the key table)'; end if;
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regclass('public.hr_state_sections') is null
     or not exists (select 1 from public.hr_feature_switches where switch_id = 'burning_tower') then
    raise exception 'PRECONDITION: the feature switches, the burning_tower switch and the section registry first'; end if;
  if to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null or to_regclass('public.hunt_party_members') is null
     or to_regprocedure('public.hr_character_name(uuid,integer)') is null or to_regclass('public.player_outfits') is null
     or to_regprocedure('public.hr_party_open(uuid,integer)') is null or to_regprocedure('public.hr_party_seat_into(uuid,uuid,integer)') is null then
    raise exception 'PRECONDITION: the party (hr_hunt_party_of, its seats and helpers), the hero''s name and outfit tables first'; end if;
end $mig$;

-- ── §1 THE SECTION ───────────────────────────────────────────────────────────
-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_tower_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_tower_rules%rowtype; m public.hr_session_modes%rowtype; v_best int := 0; v_rec int;
  v_run public.tower_runs%rowtype; v_last public.tower_runs%rowtype; v_run_j jsonb := null; v_last_j jsonb := null;
  v_party uuid; v_party_j jsonb := '[]'::jsonb; v_before int := null;
begin
  -- TOWER-SECTION (2027-04-28-tower-section.sql)
  if not public.hr_feature_on('burning_tower', p_user) then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into r from public.hr_tower_rules where id;
  if not found then return null; end if;
  select s.* into m from public.hr_ground_session_modes g join public.hr_session_modes s on s.mode_id = g.mode_id where g.hunt_id = r.hunt_id;
  if not found then return null; end if;
  select p.best_floor into v_best from public.tower_progress p where p.user_id = p_user and p.slot = p_slot;
  v_best := coalesce(v_best, 0);
  -- the record the door reads its checkpoints from (a hero in a party: the lowest best of its seats)
  v_rec := public.hr_tower_record(p_user, p_slot);
  select * into v_run from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.ended_at is null order by t.started_at desc limit 1;
  if v_run.session_id is not null then
    v_run_j := jsonb_build_object('session', v_run.session_id, 'start', v_run.start_floor, 'top', v_run.top_floor, 'floors', v_run.floors,
                                  'floor', public.hr_tower_floor_of(v_run.instance_id));
  end if;
  -- the newest climb STARTED that has ended (a run's end is its session's, the instant the engine stopped, which a late settle can put
  -- before a newer run's; its start is the door's own now()); its keys are the mint's own ledger rows for that session
  select * into v_last from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.ended_at is not null
   order by t.started_at desc limit 1;
  if v_last.session_id is not null then
    -- TOWER-SECTION-A: the best before that climb, read only when that climb holds the record (it reached the hero's best floor)
    if v_last.top_floor is not null and v_last.top_floor >= v_best then
      select coalesce(max(t.top_floor), 0) into v_before from public.tower_runs t
       where t.user_id = p_user and t.slot = p_slot and t.started_at < v_last.started_at and t.top_floor is not null;
    end if;
    v_last_j := jsonb_build_object('session', v_last.session_id, 'start', v_last.start_floor, 'top', v_last.top_floor, 'floors', v_last.floors,
      'end_reason', v_last.end_reason, 'ended_at', v_last.ended_at, 'best_before', v_before,
      -- the run's own ledger rows, never older than the run (player_ledger is pruned at retain_days: tests/ledger-rollup.mjs (5))
      'keys', coalesce((select jsonb_agg(jsonb_build_object('landing', (l.meta->>'landing')::int, 'key', l.meta->>'key') order by (l.meta->>'landing')::int)
                          from public.player_ledger l
                         where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'tower_key'
                           and l.at >= v_last.started_at), '[]'::jsonb),
      'withheld', (select count(*) from public.player_ledger l
                    where l.session_id = v_last.session_id and l.user_id = p_user and l.slot = p_slot and l.intent = 'tower_key_withheld'
                      and l.at >= v_last.started_at)::int);
  end if;
  -- TOWER-SECTION-A: the hero's party, every OTHER seat with its own name (as the party shows it), its best floor and its worn outfit
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select coalesce(jsonb_agg(jsonb_build_object('seat', pm.seat, 'name', public.hr_character_name(pm.user_id, pm.slot),
             'floor', coalesce(tp.best_floor, 0), 'outfit', po.outfit_id) order by pm.seat), '[]'::jsonb)
      into v_party_j
      from public.hunt_party_members pm
      left join public.tower_progress tp on tp.user_id = pm.user_id and tp.slot = pm.slot
      left join public.player_outfits po on po.user_id = pm.user_id and po.slot = pm.slot
     where pm.party_id = v_party and not (pm.user_id = p_user and pm.slot = p_slot);
  end if;
  return jsonb_build_object(
    'hunt', r.hunt_id,
    'rules', jsonb_build_object('room_size', r.room_size, 'landing_every', r.landing_every, 'floor_limit_ms', r.floor_limit_ms,
                                'landing_limit_ms', r.landing_limit_ms, 'floor_top', r.floor_top),
    'pays', jsonb_build_object('xp_pm', m.xp_pm, 'coin', m.coin, 'drops', m.drops, 'bestiary', m.bestiary, 'death_loss_pm', m.death_loss_pm,
                               'blessings', m.blessings, 'stamina', m.stamina),
    'best_floor', v_best,
    'record', v_rec,
    'checkpoints', to_jsonb(public.hr_mode_checkpoints(m.mode_id, v_rec)),
    'run', v_run_j,
    'last', v_last_j,
    'party', v_party_j,
    'chest', public.hr_chest_section(p_user, p_slot));
end $fn$;
revoke all on function public.hr_tower_section(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_tower_section(uuid, int) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('tower', 'hr_tower_section', '2027-04-28-tower-section.sql: the Burning Tower''s window (the checkpoints this hero may start after, the climb now and the last one with its keys, what a climb pays, the Hearth Chest''s menu), while the `burning_tower` switch is on for the account')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 (no verb: the window sends hr_tower_start, hr_chest_open and hr_chest_stoke_default, already on the client baseline) ─

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u     constant uuid := '000000c0-0000-4000-a000-0000704e5ec1';
  v_u2    constant uuid := '000000c0-0000-4000-a000-0000704e5ec2';
  k       constant text := '000000c0-0000-4000-b000-5ec1';
  v       jsonb; s jsonb; v_scope text; v_sid uuid; v_pid uuid; v_tw jsonb; v_t0 timestamptz; r public.hr_tower_rules%rowtype; v_key text; v_item text;
begin
  select * into r from public.hr_tower_rules where id;
  select scope into v_scope from public.hr_feature_switches where switch_id = 'burning_tower';
  if r.hunt_id is null or v_scope is null then raise exception 'tower-section §3: the Tower''s rules or its switch are not there to probe with'; end if;
  select key_id, item_id into v_key, v_item from public.hr_chest_keys where key_family = 'tower' order by from_landing limit 1;
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

    -- (b) ON, A NEW HERO: the catalogue's rules, the Tower's own mode, checkpoint 0 (floor 1) the one start, no run, no last, the chest's
    --     menu with its key families and the week it resets on, and no word of the old week.
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = 'burning_tower';
    s := public.hr_state_of(v_u, 0)->'tower';
    if s is null or s->>'hunt' is distinct from r.hunt_id or (s->'rules'->>'landing_every')::int <> r.landing_every
       or (s->'rules'->>'floor_limit_ms')::int <> r.floor_limit_ms or (s->'rules'->>'landing_limit_ms')::int <> r.landing_limit_ms
       or (s->'pays'->>'xp_pm')::int is distinct from (select sm.xp_pm from public.hr_ground_session_modes g join public.hr_session_modes sm using (mode_id) where g.hunt_id = r.hunt_id)
       or (s->'pays'->>'coin')::boolean or (s->'pays'->>'drops')::boolean or (s->'pays'->>'death_loss_pm')::int <> 0
       or s->'checkpoints' <> '[0]'::jsonb or (s->>'best_floor')::int <> 0 or (s->>'record')::int <> 0
       or s->'run' <> 'null'::jsonb or s->'last' <> 'null'::jsonb or s->'party' <> '[]'::jsonb or s ? 'field'
       or s ? 'starts' or s ? 'landings' or s ? 'week_ends_at' or s->'rules' ? 'week_back'
       or jsonb_array_length(s->'chest'->'keys') <> (select count(*) from public.hr_chest_keys)
       or jsonb_array_length(s->'chest'->'families') <> (select count(*) from public.hr_chest_key_families)
       or (s->'chest'->>'week_ends')::timestamptz <= now() or (s->'chest'->>'week_ends')::timestamptz > now() + interval '7 days' then
      raise exception 'tower-section §3(b): a new hero''s section reads %', s; end if;

    -- (c) A CLIMB from checkpoint 0: the run shows the room standing; a landing cleared raises the record and adds its checkpoint; the end
    --     makes it the last run, with the key its landing minted (the ledger's) in the hero's hands.
    v := public.hr_tower_start(0, 0, (k || '00000001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'checkpoints' <> '[0]'::jsonb then raise exception 'tower-section §3(c): checkpoint 0 answered %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    s := public.hr_tower_section(v_u, 0);
    if (s->'run'->>'session')::uuid is distinct from v_sid or (s->'run'->>'start')::int <> 1 or (s->'run'->>'floor')::int <> 1 then
      raise exception 'tower-section §3(c): the open climb reads %', s->'run'; end if;
    select h.settled_to into v_t0 from public.hunt_sessions h where h.id = v_sid;
    v_tw := public.hr_tower_check(v_sid, ('{"tower": {"floors": ' || (select jsonb_agg(f) from generate_series(1, r.landing_every) f)::text || '}}')::jsonb,
                                  v_t0, v_t0 + make_interval(secs => r.landing_every * r.stair_ms / 1000.0));
    perform public.hr_tower_write(v_u, 0, v_sid, v_tw, r.landing_every * r.room_size, v_t0 + make_interval(secs => r.landing_every * r.stair_ms / 1000.0));
    s := public.hr_tower_section(v_u, 0);
    if (s->'run'->>'top')::int <> r.landing_every or (s->'run'->>'floor')::int <> r.landing_every + 1 or (s->>'best_floor')::int <> r.landing_every
       or (s->>'record')::int <> r.landing_every or s->'checkpoints' <> jsonb_build_array(0, r.landing_every) then
      raise exception 'tower-section §3(c): after a landing the section reads %', s; end if;
    perform public.hr_hunt_close(v_sid, 'died', now(), true);
    s := public.hr_tower_section(v_u, 0);
    if s->'run' <> 'null'::jsonb or (s->'last'->>'session')::uuid is distinct from v_sid or s->'last'->>'end_reason' is distinct from 'died'
       or (s->'last'->>'top')::int <> r.landing_every
       or s->'last'->'keys' <> jsonb_build_array(jsonb_build_object('landing', r.landing_every, 'key', v_key)) or (s->'last'->>'withheld')::int <> 0
       or (select coalesce(sum(x::int), 0) from jsonb_each_text((select e->'held' from jsonb_array_elements(s->'chest'->'keys') e where e->>'key' = v_key)) j(f, x)) <> 1
       or (select (e->>'held')::int from jsonb_array_elements(s->'chest'->'families') e where e->>'family' = 'tower') <> 1 then
      raise exception 'tower-section §3(c): after the climb ended the section reads %', s; end if;
    -- the first climb set the record: the best before it is 0 (no earlier run), so the end card says New Best +landing_every
    if s->'last'->'best_before' is distinct from '0'::jsonb then
      raise exception 'tower-section §3(c): a record climb''s best_before reads %', s->'last'->'best_before'; end if;

    -- (d) A CLIMB THAT SETS NO RECORD: from the landing, ended before it clears a floor; best_before is null (no New Best), the record kept.
    --     (One transaction gives both climbs one now(): the first is moved a minute back so "the newest" means what it does live.)
    update public.tower_runs set started_at = started_at - interval '1 minute' where session_id = v_sid;
    v := public.hr_tower_start(0, r.landing_every, (k || '00000002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-section §3(d): checkpoint % answered %', r.landing_every, v; end if;
    perform public.hr_hunt_close((v->>'session_id')::uuid, 'died', now(), true);
    s := public.hr_tower_section(v_u, 0);
    if (s->'last'->>'session')::uuid is distinct from (v->>'session_id')::uuid or s->'last'->'best_before' <> 'null'::jsonb
       or (s->>'best_floor')::int <> r.landing_every then
      raise exception 'tower-section §3(d): a climb that set no record reads %', s->'last'; end if;

    -- (e) THE PARTY: a second hero seated with this one is in the section with its own name, its best and its outfit (null: none chosen);
    --     the hero itself is not; the record is the lower seat's. Each side sees the other.
    perform set_config('request.jwt.claim.sub', v_u2::text, true);
    insert into auth.users (id) values (v_u2) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u2, 'Probe Seat') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u2, 'tower-section §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-section §3(e): the second hero was refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into public.tower_progress (user_id, slot, best_floor, best_landing) values (v_u2, 0, 7, 0);
    v_pid := public.hr_party_open(v_u, 0);
    perform public.hr_party_seat_into(v_pid, v_u2, 0);
    s := public.hr_tower_section(v_u, 0);
    if s->'party' <> jsonb_build_array(jsonb_build_object('seat', 1, 'name', public.hr_character_name(v_u2, 0), 'floor', 7, 'outfit', null))
       or (s->>'record')::int <> 7 or (s->>'best_floor')::int <> r.landing_every then
      raise exception 'tower-section §3(e): the party reads % (record %)', s->'party', s->'record'; end if;
    s := public.hr_tower_section(v_u2, 0);
    if s->'party' <> jsonb_build_array(jsonb_build_object('seat', 0, 'name', public.hr_character_name(v_u, 0), 'floor', r.landing_every, 'outfit', null)) then
      raise exception 'tower-section §3(e): the second seat''s party reads %', s->'party'; end if;

    raise exception using errcode = 'HRS01', message = 'tower-section §3 complete - rolling back';
  exception when sqlstate 'HRS01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'burning_tower') is distinct from v_scope then
    raise exception 'tower-section §3: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id in (v_u, v_u2)) or exists (select 1 from public.tower_runs where user_id = v_u)
     or exists (select 1 from public.tower_progress where user_id in (v_u, v_u2)) or exists (select 1 from public.hunt_party_members where user_id in (v_u, v_u2))
     or exists (select 1 from public.player_ledger where user_id = v_u) or exists (select 1 from public.player_intents where user_id = v_u) then
    raise exception 'tower-section §3: a probe row leaked'; end if;
  -- (f) THE GRANTS: no client role reads the section directly; it is plpgsql (planned once a backend).
  if has_function_privilege('anon', 'public.hr_tower_section(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_tower_section(uuid,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_tower_section(uuid,integer)', 'execute') then
    raise exception 'tower-section §3(f): a client role reaches the section'; end if;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_tower_section(uuid,integer)'::regprocedure) <> 'plpgsql' then
    raise exception 'tower-section §3(f): the section is not plpgsql'; end if;
  raise notice 'tower-section §3 OK: off hides the section, on serves the rules, the mode, the checkpoints and record, the climb now and the last one with its keys and the best before it, the party seats with their bests, the chest; the grants';
end $chk$;
