-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1063-tower-formula.sql — THE BURNING TOWER PAYS BY THE ONE PAY RULE: a climb's Level XP is bounded by the Level-share
-- ceiling beside its floors' bound (lane/tower-boss-formula, systems-engineer, 2026-11-22).
--
-- STATUS: supabase/migration-notes/1063-tower-formula.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base. It reads hr_danger_level_xp_max
--   (1055/1061) and restates hr_tower_check (2027-05-08-catacombs.sql). BEFORE the edge deploy that carries src/core/hunt/tower.js
--   towerShareXp: a high hero on a low floor earns its own Level's share there, over that floor's row bound.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- WHY (docs/design/redesign/04-math-strategy.md section 7, one pay rule; 02-architecture.md package 7, the Tower as the Danger scale with no
--   top): a kill in the Tower now pays each hero the hours table's share of its OWN Level over the Tower's reference rate (src/data/tower.js
--   pay.refKillsHead, never under the scale's PAY.refKillsHead), times the depth ratio at the gap (the floor's Level - the hero's, held to
--   PAY.gapMax), times pay.payPm (at most 1000) and the room's share, split over the heroes at the kill. The settle widens the window's
--   per-kill bound to what this returns and THEN cuts it to the session mode's xp_pm (1005-lever-horizon.sql, the Tower's 375), so the engine
--   refuses to load a run whose most a kill can pay passes that cut: (PAY.refKillsHead / refKillsHead) x payPm x (roomSize / roomMin) of the
--   scale's ceiling a kill, hr_danger_level_xp_max (as built 120/300 x 0.5 x 5/4 = 0.25, under 0.375; src/core/hunt/tower.js at load). The
--   floors' table (hr_tower_floors) still bounds a kill's ROW XP: the window's bound is the greater of the two. Read at the hero's Level and
--   the two under it, as hr_danger_bound does (a Level gained inside the window).
-- WHAT MOVES: only hr_tower_check's returned xp_max, which can only rise (greatest of the old bound and the Level ceiling). Nothing else in the
--   body. A forged floor, order, pace or shape is refused exactly as before. No table, no grant, no client verb. Pre-EA Security list (XP credit).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ──────────────────────────────────────────────────────────────────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_danger_level_xp_max(integer)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regclass('public.tower_runs') is null or to_regclass('public.hr_tower_floors') is null then
    raise exception 'PRECONDITION: hr_danger_level_xp_max (1061), hr_level_of, tower_runs and hr_tower_floors must exist first'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)'::regprocedure),
                              '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '45f561cd77691498f242de5f482dba10' and v_md5 is distinct from '72e18d6f8427894f6a12fc6f5761475f' then
    raise exception 'PIN: hr_tower_check is neither 2027-05-08-catacombs.sql''s image nor this file''s: md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE CLIMB'S FLOORS, RE-PROVED (2027-05-08-catacombs.sql's body; only the bound moves: the Level-share ceiling joins it) ──────────────
create or replace function public.hr_tower_check(p_session uuid, p_hunt jsonb, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare v_run public.tower_runs%rowtype; v_r public.hr_tower_rules%rowtype; v_f jsonb; v_n int; v_lo int; v_win bigint; v_xp bigint; v_lv int;
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql); CATACOMBS (2027-05-08-catacombs.sql): the rules are the run's ground's
  select * into v_run from public.tower_runs where session_id = p_session for update;
  if not found then
    if p_hunt ? 'tower' then perform public.hr_reject('bad_tower', jsonb_build_object('why', 'not_a_climb')); end if;
    return null;
  end if;
  select * into v_r from public.hr_tower_rules where hunt_id = v_run.hunt_id;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'tower_rules')); end if;
  if p_hunt ? 'tower' and (jsonb_typeof(p_hunt->'tower') <> 'object'
                           or exists (select 1 from jsonb_object_keys(p_hunt->'tower') k where k <> 'floors')) then
    perform public.hr_reject('bad_tower', jsonb_build_object('why', 'shape')); end if;
  v_f := coalesce(p_hunt->'tower'->'floors', '[]'::jsonb);
  if jsonb_typeof(v_f) <> 'array' or jsonb_array_length(v_f) > 64
     or exists (select 1 from jsonb_array_elements(v_f) e where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-9]{1,7}$') then
    perform public.hr_reject('bad_tower', jsonb_build_object('why', 'shape')); end if;
  v_n := jsonb_array_length(v_f);
  -- THE FLOOR STANDING at this window's start is the server's own: the run's start, or the highest floor it cleared + 1. Never a skip,
  -- a repeat or a floor the run did not stand on.
  v_lo := coalesce(v_run.top_floor + 1, v_run.start_floor);
  if exists (select 1 from jsonb_array_elements(v_f) with ordinality e(v, i) where (e.v #>> '{}')::bigint <> v_lo + e.i - 1) then
    perform public.hr_reject('tower_floor_forged', jsonb_build_object('why', 'order', 'from', v_lo, 'floors', v_f)); end if;
  -- NO FASTER THAN THE STAIR: the engine stands each room stair_ms after the last one fell (src/data/tower.js stairMs).
  v_win := greatest(0, floor(extract(epoch from (p_to - p_from)) * 1000))::bigint;
  if v_n > v_win / v_r.stair_ms + 1 then
    perform public.hr_reject('tower_too_fast', jsonb_build_object('floors', v_n, 'window_ms', v_win, 'stair_ms', v_r.stair_ms)); end if;
  -- THE MOST ONE KILL OF THIS WINDOW CAN PAY: every floor it stood on, from the floor standing to the one after the last it cleared.
  select max(f.xp_max) into v_xp from public.hr_tower_floors f
   where f.floor between least(v_lo, v_r.floor_top) and least(v_lo + v_n, v_r.floor_top);
  if v_xp is null then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'tower_floors')); end if;
  -- TOWER-FORMULA (1063-tower-formula.sql): a kill's Level XP is a share of the hero's own Level (src/core/hunt/tower.js towerShareXp), at most
  -- the scale's ceiling a kill at its Level or the two under it (a Level gained inside the window).
  v_lv := greatest(1, coalesce(public.hr_level_of(v_run.user_id, v_run.slot), 1));
  v_xp := greatest(v_xp, public.hr_danger_level_xp_max(v_lv), public.hr_danger_level_xp_max(greatest(1, v_lv - 1)),
                   public.hr_danger_level_xp_max(greatest(1, v_lv - 2)));
  return jsonb_build_object('lo', v_lo, 'n', v_n, 'xp_max', v_xp, 'level', (select f.level from public.hr_tower_floors f
                                                                              where f.floor = least(v_lo + v_n, v_r.floor_top)));
end $fn$;

do $mig$
declare v_role text;
begin
  execute 'revoke all on function public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone) from public, anon, authenticated, service_role';
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone) from %I', v_role); end if;
  end loop;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ───────────────────────────────────────────────────────────────────────
do $chk$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-00000000a063';
  v_sid constant uuid := '000000c0-0000-4000-a000-00000000b063';
  v_role text; v jsonb; v_lv int; v_hunt text; v_top int;
begin
  -- (a) THE WALLS: no client role runs it
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_tower_check(uuid,jsonb,timestamp with time zone,timestamp with time zone)', 'execute') then
      raise exception 'tower-formula §4(a): % can execute hr_tower_check', v_role; end if;
  end loop;
  -- (b) THE BOUND: a run on the Tower's ground from floor 1 bounds its window at the Level ceiling of its hero's Level, and never under the
  --     floors' own bound; a run of a hero three Levels on reads the higher ceiling. Every row is this block's and rolled back.
  select hunt_id, floor_top into v_hunt, v_top from public.hr_tower_rules where id;
  begin
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor, hunt_id) values (v_sid, v_u, 0, v_sid, 1, v_hunt);
    v_lv := greatest(1, coalesce(public.hr_level_of(v_u, 0), 1));
    v := public.hr_tower_check(v_sid, '{"tower":{"floors":[1,2]}}'::jsonb, now() - interval '20 seconds', now());
    if (v->>'lo')::int <> 1 or (v->>'n')::int <> 2 then raise exception 'tower-formula §4(b): the floors read % ', v; end if;
    if (v->>'xp_max')::bigint < public.hr_danger_level_xp_max(v_lv)
       or (v->>'xp_max')::bigint < (select max(xp_max) from public.hr_tower_floors where floor between 1 and 3) then
      raise exception 'tower-formula §4(b): the bound % is under the Level ceiling % or the floors'' %', v->>'xp_max',
        public.hr_danger_level_xp_max(v_lv), (select max(xp_max) from public.hr_tower_floors where floor between 1 and 3); end if;
    if (v->>'level')::int is distinct from (select level from public.hr_tower_floors where floor = 3) then
      raise exception 'tower-formula §4(b): the window''s Level % is not its last room''s', v->>'level'; end if;
    -- a forged order is still refused
    begin
      perform public.hr_tower_check(v_sid, '{"tower":{"floors":[2]}}'::jsonb, now() - interval '20 seconds', now());
      raise exception 'tower-formula §4(b): a skipped floor was not refused';
    exception when others then
      if sqlerrm not like '%tower_floor_forged%' then raise; end if;
    end;
    raise exception using errcode = 'P0001', message = 'tower-formula-probe-done';
  exception when others then
    if sqlerrm <> 'tower-formula-probe-done' then raise; end if;
  end;
  if exists (select 1 from public.tower_runs where session_id = v_sid) then raise exception 'tower-formula §4: the probe left a row'; end if;
end $chk$;
