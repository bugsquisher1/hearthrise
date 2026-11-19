-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-29-tower-party-floor.sql — ONE PARTY, ONE CLIMB, ONE FLOOR: THE TOWER WINDOW'S PARTY SEATS STAND WHERE THE CLIMB STANDS
--   (lane/a-tower-andy, systems-engineer, 2026-11-19; Andy on live 0.2.140: "Other party members showed 1 floor less than the character I was
--   focused on"). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §2.
--   Not a money surface: a display read, no value, no grant, no client verb.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- The Tower window draws the hero on the floor it climbs now (the section's run.floor = hr_tower_floor_of(its instance): the highest floor
-- the instance's open runs cleared + 1) and every other seat of its party at that seat's BEST floor (tower_progress.best_floor: the highest
-- floor cleared). A party climbs as one instance, so mid-climb those are the same climb read two ways: the room standing (N) for the hero, the
-- room just cleared (N - 1) for everyone else. It was never a lag: the window read two quantities as one.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_tower_section(user, slot) RESTATED WHOLE (2027-05-08-catacombs.sql's image, §0 pins it; TOWER-PARTY-FLOOR marks the one change): each
--   `party` row's `floor` is the floor that seat stands on: its open climb's (hr_tower_floor_of of its newest open run on the Tower's ground,
--   the same rule run.floor reads), else its best floor, else 0. Every other key, and every key's meaning, is the image's. The client reads it
--   unchanged (src/session/tower-sections.js `party`, src/shell/windows/tower.js climbHeroes).
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- A STABLE read, no write and no lock: it reads the rows the settle writes (tower_runs) as of the envelope's snapshot, like run.floor. A
-- second apply restates the same bytes (§0 accepts this file's own image).
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- None added. The section is owner-only (no client role executes it: §2(c)), reads only the caller's own party's rows through the existing
-- hr_hunt_party_of, and moves nothing. The floor a seat is drawn on is display; no door or gate reads it (hr_tower_start reads
-- hr_tower_record, never the section).
--
-- ── COST (rows and bytes at 100x players) ─────────────────────────────────
-- Per envelope of a hero in a party: one probe of tower_runs_hero (user_id, slot, started_at desc) a seat (three at most), and for a seat that
-- is climbing one probe of the partial index tower_runs_open_instance (hr_tower_floor_of). No new row, table or index.
--
-- EDGE: none. CLIENT: none (the window already draws `party[].floor`; its comments say the new meaning).
-- ORDER: any time after 2027-05-08-catacombs.sql (APPLIED), the image §0 pins; no STAGED file touches hr_tower_section.
-- After apply: live-hash-drift --live --write (hr_tower_section moves). restore-census unchanged (no table, no seeded row).
-- REVERSIBLE: restate hr_tower_section from 2027-05-08-catacombs.sql (§0 accepts that image as its own pre-image).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- md5 of pg_get_functiondef with every run of whitespace one space (tests/live-hash-drift.baseline.json's normalisation): the image this
-- file restates (2027-05-08-catacombs.sql's, measured live 2026-11-19) or this file's own (a second apply).
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_tower_floor_of(uuid)') is null or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null
     or to_regclass('public.tower_runs') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tower_runs' and column_name = 'hunt_id') then
    raise exception 'PRECONDITION: apply 2027-05-08-catacombs.sql first (hr_tower_floor_of, tower_runs.hunt_id)'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_tower_section(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from 'f9a4695524bd34b4a23e560410285c3c' and v_md5 is distinct from 'f45f1abab32a433bf479d1f70bbfbc25' then
    raise exception 'PIN: hr_tower_section is neither 2027-05-08-catacombs.sql''s image (f9a46955) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
      left('f45f1abab32a433bf479d1f70bbfbc25', 8), v_md5; end if;
end $mig$;

-- ── §1 THE SECTION (RESTATED WHOLE: the image with the TOWER-PARTY-FLOOR change) ─────────────────────────────────────────────────────────
create or replace function public.hr_tower_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_tower_rules%rowtype; m public.hr_session_modes%rowtype; v_best int := 0; v_rec int;
  v_run public.tower_runs%rowtype; v_last public.tower_runs%rowtype; v_run_j jsonb := null; v_last_j jsonb := null;
  v_party uuid; v_party_j jsonb := '[]'::jsonb; v_before int := null; v_field jsonb;
begin
  -- TOWER-SECTION (2027-04-28-tower-section.sql); CATACOMBS (2027-05-08-catacombs.sql): the Tower's ground's rows only
  if not public.hr_feature_on('burning_tower', p_user) then return null; end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into r from public.hr_tower_rules where id;
  if not found then return null; end if;
  select s.* into m from public.hr_ground_session_modes g join public.hr_session_modes s on s.mode_id = g.mode_id where g.hunt_id = r.hunt_id;
  if not found then return null; end if;
  select p.best_floor into v_best from public.tower_progress p where p.user_id = p_user and p.slot = p_slot and p.hunt_id = r.hunt_id;
  v_best := coalesce(v_best, 0);
  -- the record the door reads its checkpoints from (a hero in a party: the lowest best of its seats)
  v_rec := public.hr_tower_record(p_user, p_slot);
  select * into v_run from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.hunt_id = r.hunt_id and t.ended_at is null
   order by t.started_at desc limit 1;
  if v_run.session_id is not null then
    v_run_j := jsonb_build_object('session', v_run.session_id, 'start', v_run.start_floor, 'top', v_run.top_floor, 'floors', v_run.floors,
                                  'floor', public.hr_tower_floor_of(v_run.instance_id));
  end if;
  -- the newest climb STARTED that has ended (a run's end is its session's, the instant the engine stopped, which a late settle can put
  -- before a newer run's; its start is the door's own now()); its keys are the mint's own ledger rows for that session
  select * into v_last from public.tower_runs t where t.user_id = p_user and t.slot = p_slot and t.hunt_id = r.hunt_id and t.ended_at is not null
   order by t.started_at desc limit 1;
  if v_last.session_id is not null then
    -- TOWER-SECTION-A: the best before that climb, read only when that climb holds the record (it reached the hero's best floor)
    if v_last.top_floor is not null and v_last.top_floor >= v_best then
      select coalesce(max(t.top_floor), 0) into v_before from public.tower_runs t
       where t.user_id = p_user and t.slot = p_slot and t.hunt_id = r.hunt_id and t.started_at < v_last.started_at and t.top_floor is not null;
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
                      and l.at >= v_last.started_at)::int,
      -- TOWER-BOARD (2027-04-30-tower-board.sql): that climb's place on the board (rank, heroes passed, the best of them), or null
      'board', public.hr_mode_board_end(m.mode_id, p_user, p_slot, v_last.session_id));
  end if;
  -- TOWER-SECTION-A: the hero's party, every OTHER seat with its own name (as the party shows it), its floor and its worn outfit
  -- TOWER-PARTY-FLOOR (2027-05-29-tower-party-floor.sql): a seat in an open climb stands on its run's floor (hr_tower_floor_of, the rule the
  -- hero's own run.floor reads, so one party's climb reads one floor for every seat); a seat that is not climbing stands at its best floor
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select coalesce(jsonb_agg(jsonb_build_object('seat', pm.seat, 'name', public.hr_character_name(pm.user_id, pm.slot),
             'floor', coalesce((select public.hr_tower_floor_of(t.instance_id) from public.tower_runs t
                                 where t.user_id = pm.user_id and t.slot = pm.slot and t.hunt_id = r.hunt_id and t.ended_at is null
                                 order by t.started_at desc limit 1), tp.best_floor, 0),
             'outfit', po.outfit_id) order by pm.seat), '[]'::jsonb)
      into v_party_j
      from public.hunt_party_members pm
      left join public.tower_progress tp on tp.user_id = pm.user_id and tp.slot = pm.slot and tp.hunt_id = r.hunt_id
      left join public.player_outfits po on po.user_id = pm.user_id and po.slot = pm.slot
     where pm.party_id = v_party and not (pm.user_id = p_user and pm.slot = p_slot);
  end if;
  -- TOWER-BOARD (2027-04-30-tower-board.sql): the hero's place and the heroes just above and below; absent (not null) with no board row
  v_field := public.hr_mode_board_field(m.mode_id, p_user, p_slot);
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
    'chest', public.hr_chest_section(p_user, p_slot))
    || case when v_field is null then '{}'::jsonb else jsonb_build_object('field', v_field) end;
end $fn$;
revoke all on function public.hr_tower_section(uuid, integer) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────────────────────────────────────────────────────────────────
do $chk$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-00007f100c01';
  v_u2  constant uuid := '000000c0-0000-4000-a000-00007f100c02';
  v_inst constant uuid := '000000c0-0000-4000-b000-00007f100c0a';
  v_s1  constant uuid := '000000c0-0000-4000-b000-00007f100c11';
  v_s2  constant uuid := '000000c0-0000-4000-b000-00007f100c12';
  r public.hr_tower_rules%rowtype; v jsonb; s jsonb; s2 jsonb; v_scope text; v_accts uuid[]; v_pid uuid; v_on int;
begin
  select * into r from public.hr_tower_rules where id;
  select scope, accounts into v_scope, v_accts from public.hr_feature_switches where switch_id = 'burning_tower';
  if r.hunt_id is null or v_scope is null then raise exception 'tower-party-floor §2: the Tower''s rules or its switch are not there to probe with'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u, v_u2] where switch_id = 'burning_tower';
    foreach v_pid in array array[v_u, v_u2] loop
      perform set_config('request.jwt.claim.sub', v_pid::text, true);
      insert into auth.users (id) values (v_pid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_pid, 'Probe Floor') on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_pid, 'tower-party-floor §2 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-party-floor §2: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    -- the two bests differ (30 and 12): the window's old read drew each seat there
    insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing) values (v_u, 0, r.hunt_id, 30, 30), (v_u2, 0, r.hunt_id, 12, 10);
    v_pid := public.hr_party_open(v_u, 0);
    perform public.hr_party_seat_into(v_pid, v_u2, 0);

    -- (a) NOT CLIMBING: each seat stands at its best, as before.
    s := public.hr_tower_section(v_u, 0); s2 := public.hr_tower_section(v_u2, 0);
    if s->'run' <> 'null'::jsonb or (s->'party'->0->>'floor')::int <> 12 or (s2->'party'->0->>'floor')::int <> 30 then
      raise exception 'tower-party-floor §2(a): out of a climb the seats read % and %', s->'party', s2->'party'; end if;

    -- (b) ONE CLIMB: both seats' runs in one instance, from floor 11 with floors 11..24 cleared, so the room standing is 25. Each hero's own
    --     run.floor and the other seat's floor read the same 25 on both sides (Andy's window: 25 for the hero, 24 and its best for the rest).
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor, top_floor, floors, party, hunt_id)
      values (v_s1, v_u, 0, v_inst, 11, 24, 14, 2, r.hunt_id), (v_s2, v_u2, 0, v_inst, 11, 24, 14, 2, r.hunt_id);
    s := public.hr_tower_section(v_u, 0); s2 := public.hr_tower_section(v_u2, 0);
    if (s->'run'->>'floor')::int <> 25 or (s2->'run'->>'floor')::int <> 25
       or (s->'party'->0->>'floor')::int is distinct from (s->'run'->>'floor')::int
       or (s2->'party'->0->>'floor')::int is distinct from (s2->'run'->>'floor')::int then
      raise exception 'tower-party-floor §2(b): one climb reads run % / party % for the hero and run % / party % for the seat',
        s->'run'->'floor', s->'party', s2->'run'->'floor', s2->'party'; end if;
    -- every other key of the row is the image's: the seat, its name, its outfit
    if (s->'party'->0->>'seat')::int <> 1 or s->'party'->0->>'name' is distinct from public.hr_character_name(v_u2, 0)
       or s->'party'->0->'outfit' <> 'null'::jsonb or (select count(*) from jsonb_object_keys(s->'party'->0)) <> 4 then
      raise exception 'tower-party-floor §2(b): the seat''s row reads %', s->'party'->0; end if;

    -- (c) A SEAT WHOSE CLIMB ENDED (a fall with its box unticked): it stands at its best again; the climbing hero still reads its room.
    update public.tower_runs set ended_at = now(), end_reason = 'died' where session_id = v_s2;
    s := public.hr_tower_section(v_u, 0);
    if (s->'party'->0->>'floor')::int <> 12 or (s->'run'->>'floor')::int <> 25 then
      raise exception 'tower-party-floor §2(c): after the seat''s climb ended the hero reads run % party %', s->'run'->'floor', s->'party'; end if;

    raise exception using errcode = 'HRS01', message = 'tower-party-floor §2 complete - rolling back';
  exception when sqlstate 'HRS01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'burning_tower') is distinct from v_scope then
    raise exception 'tower-party-floor §2: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id in (v_u, v_u2)) or exists (select 1 from public.tower_runs where user_id in (v_u, v_u2))
     or exists (select 1 from public.tower_progress where user_id in (v_u, v_u2)) or exists (select 1 from public.hunt_party_members where user_id in (v_u, v_u2)) then
    raise exception 'tower-party-floor §2: a probe row leaked'; end if;
  -- (d) THE GRANTS: no client role reads the section directly; it is plpgsql; the envelope still names it.
  foreach v_scope in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_scope, 'public.hr_tower_section(uuid,integer)', 'execute') then
      raise exception 'tower-party-floor §2(d): % reaches the section', v_scope; end if;
  end loop;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_tower_section(uuid,integer)'::regprocedure) <> 'plpgsql'
     or (select fn from public.hr_state_sections where key = 'tower') is distinct from 'hr_tower_section' then
    raise exception 'tower-party-floor §2(d): the section is not plpgsql or the envelope no longer reads it'; end if;
  raise notice 'tower-party-floor §2 OK: out of a climb each seat at its best; in one climb every seat on the run''s floor, the hero''s run.floor; a seat whose climb ended at its best; owner-only';
end $chk$;
