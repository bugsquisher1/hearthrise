-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-02-level-xp-ceiling.sql — RANKED LEVEL XP HAS A CEILING BY THE CLOCK
--   (lane/c-server-debt, backend-architect, 2026-11-10; .claude/coordination/DISCOVERIES.md 2026-11-10 row 4: "level_xp
--   (ranked Level XP) is an hr_apply delta key with a per-call clamp, a hunt-only gate and a kills x per-kill-XP bound, but
--   ... no daily dimension").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §3. ON THE EA SECURITY LIST: Level XP feeds a ranked board, and this restates the settle's
-- member half.
-- ORDER: after 2027-03-25-death-share.sql (§0 pins ITS hr_hunt_apply_member image) and after
-- 2027-04-02-level-xp-ceiling.generated.sql (the ceiling's one row; §0 refuses without it). It does not touch hr_apply,
-- hr_state_of, hr_load, the hunt-sessions catalogue or the instance read (the ask path): free of 2027-03-27 / -28 / -29 /
-- -30 / -31 in either order, unless one of them restates hr_hunt_apply_member first (§0 then refuses, by name).
-- DB-ONLY: no hr-accrue change (pack-edge --hash unmoved), no client change.
--
-- ── THE GAP ──────────────────────────────────────────────────────────────────
-- One settle's Level XP is bounded by its journalled kills x the most one kill of the ground pays x value_headroom (x the
-- account's live dial). The most one kill pays is a boss's (10,332 at Coppercap Warrens), the headroom is 3, and the kill
-- bound carries two spare packs every window, which add up over a day of ten-second windows. So a faulty or forged engine
-- could credit a hero tens of millions of Level XP an hour inside every existing bound: the real engine's best measured
-- hour is 222,774 (tools/balance-sim/level-pace.json). Nothing bounded an hour or a day.
--
-- ── THE RULE (two bounds, one generated row) ─────────────────────────────────
-- hr_level_xp_ceiling (tools/gen-level-xp-ceiling.mjs) holds the most Level XP an hour the balance sheet lets the top
-- ground pay with every dial at its best, doubled, and 24 of those for a day. With today's sheet: 1,210,000 and 29,040,000.
--   THE CALL  one settle credits at most hour_max x its window's span, an hour at the least (a kill lands whole, so a short
--             window is not held to a fraction of an hour).
--   THE DAY   what the hero's settles journalled this UTC day, this one included, is at most day_max (hr_apply writes the
--             window's Level XP on its ledger row as meta.delta.lx; the day is the ledger's, as hr_day_budget_used reads it).
--             Read only for a hero whose WHOLE Level XP would be past day_max: at or under it, today's part cannot be over.
--             Level 50 is 16,018,945 XP in all, so no hero the content can produce today pays for the read.
-- Past either, the member's settle is refused value_over (what: level_xp_hour / level_xp_day), exactly as its kill bound
-- refuses: nothing of that member is written, the refusal is journalled by the settle as every value_over is.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_level_xp_over(user, slot, level_xp, window_ms, level_xp_before) NEW, server-only, stable: THE RULE, in one place.
--       Null when the call is inside both bounds, else the refusal's detail ({what, max, ...}; {error: catalogue_missing}
--       with no ceiling row: a bound that cannot be read refuses, the house rule of every hunt limit).
--   hr_hunt_apply_member RESTATED WHOLE from 2027-03-25-death-share.sql's image (tests/patch-chain-guard.mjs: never an
--       anchored patch on this chain): five lines added, each marked `-- LEVEL-XP-CEILING` (one variable, two comment lines,
--       the ask, the refusal), right under the kill bound's own Level XP check. §3(g) takes them back out and requires the
--       pinned pre-image. tests/alpha-server.mjs MEMBER_LAST moves to this file.
--
-- ── AN HONEST HERO NEVER MEETS IT ───────────────────────────────────────────
-- The hour is twice the sheet's own best (the contract at the top Level x the Normal band's top x the party ceiling x the
-- Deadly dial x the whole event range) and about 5.4x the real engine's best measured hour; the generator refuses to write
-- a ceiling under 2x the measured one. A new top ground, tier or event dial moves the generated row (its --check fails
-- until a new dated file is cut), and that file applies before the engine that pays the new rate.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Narrows what a forged or faulty engine deploy can credit; opens nothing. hr_level_xp_over and the ceiling row hold no
-- client or engine grant. It reads the caller-supplied Level XP only to compare it; the day's sum is the server's ledger.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Runs inside the member's settle, under the hero's lock hr_hunt_apply_member already holds, after hr_apply wrote the
-- window's ledger row: the day's sum sees it and no other writer of that hero's ledger can interleave. A refusal raises
-- (hr_reject), so the member's subtransaction rolls back whole, as for every bound beside it. A second apply: §0 accepts
-- this file's own image; `create or replace` (byte-identical).
--
-- ── COST AT 100x ────────────────────────────────────────────────────────────
-- Every Level-XP-paying member settle: one PK read of a one-row table. The day's ledger sum (an index range scan of the
-- hero's rows today, player_ledger_user_idx) runs only for a hero past 29 M Level XP in all: none today, the far end of
-- the curve later, and for them it is the scan hr_day_budget_used already makes once inside hr_apply. No row, no index.
--
-- REVERSIBILITY: re-apply 2027-03-25-death-share.sql's hr_hunt_apply_member (the pre-image §0 pins) and drop
-- hr_level_xp_over; the ceiling row may stay. No data moves. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text; v_src text;
begin
  if to_regclass('public.hr_level_xp_ceiling') is null or not exists (select 1 from public.hr_level_xp_ceiling where id) then
    raise exception 'PRECONDITION: the Level XP ceiling is absent (2027-04-02-level-xp-ceiling.generated.sql first): every Level-XP-paying settle would be refused'; end if;
  if to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null or to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'PRECONDITION: hr_utc_day_start / hr_reject are absent'; end if;
  -- WHERE THE DAY IS READ FROM: hr_apply journals a window's Level XP on its ledger row as meta.delta.lx. A later hr_apply that
  -- moves or drops it would leave the day's sum reading nothing, so this file refuses to apply over one that does.
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)');
  if v_src is null or position('''lx'', case when p_delta ? ''level_xp'' then p_delta->''level_xp'' end' in v_src) = 0
     or position('jsonb_build_object(''delta'', v_meta)' in v_src) = 0 then
    raise exception 'PIN: hr_apply no longer journals a window''s Level XP as its ledger row''s meta.delta.lx (the day''s ceiling reads it)'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('08f063d34d560f794709263a860c0124', '43f5f8d28bedb9d149e5a69eaee5e6be') then
    raise exception 'PIN: hr_hunt_apply_member is neither 2027-03-25-death-share.sql''s image (08f063d34d560f794709263a860c0124) nor this file''s: md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE RULE, ONE PLACE ───────────────────────────────────────────────────
-- Null when `p_level_xp` credited over a window of `p_window_ms` to a hero holding `p_before` Level XP is inside the hour's
-- and the day's ceiling; else the refusal's detail. Called AFTER hr_apply wrote the window's ledger row, so the day's sum
-- holds this call. PURE over the catalogue and the hero's own ledger.
create or replace function public.hr_level_xp_over(p_user uuid, p_slot integer, p_level_xp numeric, p_window_ms bigint, p_before bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_hour bigint; v_day bigint; v_call numeric; v_today numeric;
begin
  if p_level_xp is null or p_level_xp <= 0 then return null; end if;
  select c.hour_max, c.day_max into v_hour, v_day from public.hr_level_xp_ceiling c where c.id;
  if v_hour is null or v_day is null then
    return jsonb_build_object('error', 'catalogue_missing', 'limit', 'level_xp_ceiling'); end if;
  -- THE CALL: the hour's ceiling over the window's own span, an hour at the least (a kill lands whole).
  v_call := ceil(v_hour::numeric * greatest(coalesce(p_window_ms, 0), 3600000) / 3600000.0);
  if p_level_xp > v_call then
    return jsonb_build_object('what', 'level_xp_hour', 'level_xp', p_level_xp, 'window_ms', p_window_ms, 'max', v_call); end if;
  -- THE DAY (UTC), read only for a hero whose whole Level XP is past one day's ceiling.
  if coalesce(p_before, 0) + p_level_xp > v_day then
    select coalesce(sum((l.meta->'delta'->>'lx')::numeric), 0) into v_today from public.player_ledger l
     where l.user_id = p_user and l.slot = p_slot and jsonb_typeof(l.meta->'delta'->'lx') = 'number'
       and l.at >= public.hr_utc_day_start(now()) and l.at < public.hr_utc_day_start(now()) + interval '1 day';
    if v_today > v_day then
      return jsonb_build_object('what', 'level_xp_day', 'day_xp', v_today, 'max', v_day); end if;
  end if;
  return null;
end $fn$;
revoke all on function public.hr_level_xp_over(uuid, integer, numeric, bigint, bigint) from public, anon, authenticated, service_role;
comment on function public.hr_level_xp_over(uuid, integer, numeric, bigint, bigint) is
  '2027-04-02-level-xp-ceiling.sql: null when a settle''s Level XP is inside the hour''s ceiling (over its window, an hour at the least) and the UTC day''s (the hero''s ledger meta.delta.lx today, read only past day_max in all); else the value_over detail. The ceiling is hr_level_xp_ceiling (generated). Server-only.';

-- ── §2 hr_hunt_apply_member RESTATED WHOLE (each `-- LEVEL-XP-CEILING` line is this file's; nothing else differs) ──

CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS: the catalogue's `combat` rows, so a renamed or new
  -- combat skill is priced with no body edit; 2027-01-31-inner-flame.sql); the Level is priced as `level`.
  c_xp_skills constant text[] := array(select k.skill_id from public.hr_skills k where k.cat = 'combat' order by k.skill_id);
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_lfrom int; v_lto int;  -- DEATH-SHARE (2027-03-25-death-share.sql): the hero's Level before and after the death's debit
  v_lxo jsonb;  -- LEVEL-XP-CEILING (2027-04-02-level-xp-ceiling.sql): null, or why this call's Level XP is past the hour's or the day's ceiling
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    -- DEATH-SHARE: one formula, a share of the TOTAL Level XP (no alternative base row).
    v_rate := public.hr_hunt_limit('death_xp_permille');
    if v_rate is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Inner Flame rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0))
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  -- LIVE-EVENTS: the Level XP bound grows by this account's own live dial over this window's span, and by nothing else.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric
       > v_kills * v_vb_xp * v_vb_h * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  -- THE LEVEL XP CEILING, BY THE CLOCK: the bound above is by the kill (a boss's XP, three times over, a slack every window). Ranked  -- LEVEL-XP-CEILING
  -- Level XP is also held to an hour's and a UTC day's ceiling (hr_level_xp_over; hr_level_xp_ceiling, generated from the sheet).  -- LEVEL-XP-CEILING
  v_lxo := case when jsonb_typeof(p_delta->'level_xp') = 'number' then public.hr_level_xp_over(p_user, p_slot, (p_delta->>'level_xp')::numeric, v_win, v_lx0) end;  -- LEVEL-XP-CEILING
  if v_lxo is not null then perform public.hr_reject(coalesce(v_lxo->>'error', 'value_over'), v_lxo - 'error'); end if;  -- LEVEL-XP-CEILING
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  if v_e <> greatest(0, v_s0 - v_paid) then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
  if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
  update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    if v_cost > 0 then
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- LIVE-EVENTS: THE EVENT'S PART of this window's Level XP, apart on the tally (a best leaves it out). Never more than the window's Level XP,
  --   nor more than the account's own dial could add to it (a floor a kill, so the window's kills on top), and none with no event live.
  if p_hunt ? 'xp_event' then
    if jsonb_typeof(p_hunt->'xp_event') is distinct from 'number' or (p_hunt->>'xp_event') !~ '^[0-9]{1,15}$'
       or (p_hunt->>'xp_event')::numeric > coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0)
       or (p_hunt->>'xp_event')::numeric > (select case when q.m = 1000 then 0
              else coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0) * (q.m - 1000) / q.m + v_kills end
            from (select public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) as m) q) then
      perform public.hr_reject('bad_xp_event', jsonb_build_object('xp_event', p_hunt->'xp_event', 'level_xp', p_delta->'level_xp')); end if;
  end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-11-09, CORE_MODEL.md §6):
  --     DEATH-SHARE: every bound is hr_death_xp_max, the one rule: the LEVEL loses at most
  --     death_xp_permille of its TOTAL XP, and that may take a Level (never below 0 XP, Level 1);
  --     each combat skill loses at most the permille of its progress into its level, never a level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        if v_n > public.hr_death_xp_max('level', v_cur) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', public.hr_char_level(v_cur))); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      if v_n > public.hr_death_xp_max(v_k, v_cur) then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', public.hr_skill_level(v_k, v_cur))); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  -- DEATH-SHARE: the death names the Level it took the hero from and to (equal when it took none), off the debited Level XP.
  if v_nd > 0 then
    select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot;
    v_lto := public.hr_char_level(v_cur);
    v_lfrom := public.hr_char_level(v_cur + coalesce((v_lost->>'level')::bigint, 0));
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x),
                                             'level_from', v_lfrom, 'level_to', v_lto)
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
      -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): a bench resumes only with the inputs for one action; else idle.
      and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' then
    update public.hunt_session_tally t
       set xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)),
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

revoke all on function public.hr_hunt_apply_member(uuid, uuid, integer, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
do $chk$
declare
  c_u    constant uuid := '000000c0-0000-4000-a000-0000402d0001';
  c_over constant text := 'public.hr_level_xp_over(uuid,integer,numeric,bigint,bigint)';
  c_mem  constant text := 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)';
  v_hour bigint; v_day bigint; v jsonb; r text; v_def text; v_md5 text; v_n bigint;
begin
  -- (a) THE SHAPE: nothing here is a client's or the engine's to call; the settle's member half is still the owner's only.
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(r, c_over, 'execute') then raise exception 'level-xp-ceiling §3(a): % can execute hr_level_xp_over', r; end if;
    if has_function_privilege(r, c_mem, 'execute') then raise exception 'level-xp-ceiling §3(a): % can execute hr_hunt_apply_member', r; end if;
  end loop;
  if not exists (select 1 from pg_proc p where p.oid = c_over::regprocedure and p.prosecdef and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'level-xp-ceiling §3(a): hr_level_xp_over is not a security definer with a pinned search_path'; end if;
  perform public.hr_assert_grant_hygiene(true);
  select c.hour_max, c.day_max into v_hour, v_day from public.hr_level_xp_ceiling c where c.id;

  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Level Ceiling') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'level-xp-ceiling §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'level-xp-ceiling §3-harness: hr_create_character(0) refused: %', v; end if;

    -- (b) ★ THE CALL: the hour's ceiling over the window's span, an hour at the least.
    if public.hr_level_xp_over(c_u, 0, v_hour, 10000, 0) is not null or public.hr_level_xp_over(c_u, 0, 1, 10000, 0) is not null
       or public.hr_level_xp_over(c_u, 0, 0, 10000, 0) is not null or public.hr_level_xp_over(c_u, 0, null, 10000, 0) is not null then
      raise exception 'level-xp-ceiling §3(b): a ten-second window at or under the hour''s ceiling is refused: %', public.hr_level_xp_over(c_u, 0, v_hour, 10000, 0); end if;
    v := public.hr_level_xp_over(c_u, 0, v_hour + 1, 10000, 0);
    if v->>'what' is distinct from 'level_xp_hour' or (v->>'max')::numeric is distinct from v_hour or v ? 'error' then
      raise exception 'level-xp-ceiling §3(b): one XP past the hour''s ceiling in a ten-second window answered %', v; end if;
    if public.hr_level_xp_over(c_u, 0, v_hour * 2, 7200000, 0) is not null
       or public.hr_level_xp_over(c_u, 0, v_hour * 2 + 1, 7200000, 0)->>'what' is distinct from 'level_xp_hour' then
      raise exception 'level-xp-ceiling §3(b): a two-hour window is not held to two hours of the ceiling'; end if;
    if public.hr_level_xp_over(c_u, 0, v_hour + 1, null, 0)->>'what' is distinct from 'level_xp_hour' then
      raise exception 'level-xp-ceiling §3(b): a window with no span is not held to one hour'; end if;

    -- (c) ★ THE DAY: the hero's own ledger meta.delta.lx of this UTC day (where hr_apply journals a window's Level XP), and only that.
    --     Yesterday's XP, another hero's of the account, a row with no lx there and an lx that is not a number do not count.
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at) values
      (c_u, 0, 'admin', 'level-xp-ceiling probe', jsonb_build_object('delta', jsonb_build_object('lx', v_day * 10)), public.hr_utc_day_start(now()) - interval '1 second'),
      (c_u, 1, 'admin', 'level-xp-ceiling probe', jsonb_build_object('delta', jsonb_build_object('lx', v_day * 10)), now()),
      (c_u, 0, 'admin', 'level-xp-ceiling probe', jsonb_build_object('delta', jsonb_build_object('lx', 'not a number')), now()),
      (c_u, 0, 'admin', 'level-xp-ceiling probe', jsonb_build_object('lx', v_day * 10, 'kills', 7), now()),
      (c_u, 0, 'admin', 'level-xp-ceiling probe', jsonb_build_object('delta', jsonb_build_object('lx', v_day - 6)), now()),
      (c_u, 0, 'admin', 'level-xp-ceiling probe', jsonb_build_object('delta', jsonb_build_object('lx', 6)), now());
    if public.hr_level_xp_over(c_u, 0, 6, 10000, v_day * 3) is not null then
      raise exception 'level-xp-ceiling §3(c): a day that sums to its ceiling exactly is refused (yesterday, another hero or a row with no lx was counted): %',
        public.hr_level_xp_over(c_u, 0, 6, 10000, v_day * 3); end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, at) values
      (c_u, 0, 'admin', 'level-xp-ceiling probe', jsonb_build_object('delta', jsonb_build_object('lx', 1)), now());
    v := public.hr_level_xp_over(c_u, 0, 1, 10000, v_day * 3);
    if v->>'what' is distinct from 'level_xp_day' or (v->>'day_xp')::numeric is distinct from v_day + 1 or (v->>'max')::numeric is distinct from v_day then
      raise exception 'level-xp-ceiling §3(c): one XP past the day''s ceiling answered %', v; end if;
    --     A hero whose WHOLE Level XP is at or under one day's ceiling is not read at all (today's part cannot be over it).
    if public.hr_level_xp_over(c_u, 0, 6, 10000, v_day - 6) is not null then
      raise exception 'level-xp-ceiling §3(c): a hero holding no more than a day''s ceiling in all was refused by the day'; end if;
    if public.hr_level_xp_over(c_u, 0, 6, 10000, v_day - 5)->>'what' is distinct from 'level_xp_day' then
      raise exception 'level-xp-ceiling §3(c): a hero one XP past a day''s ceiling in all is not read against the day'; end if;

    -- (d) NO CEILING ROW: the bound cannot be read, so it refuses (never passes).
    delete from public.hr_level_xp_ceiling;
    v := public.hr_level_xp_over(c_u, 0, 1, 10000, 0);
    if v->>'error' is distinct from 'catalogue_missing' then raise exception 'level-xp-ceiling §3(d): with no ceiling row a Level XP credit answered %', v; end if;

    raise exception using errcode = 'HRL42', message = 'level-xp-ceiling §3 complete - rolling back';
  exception when sqlstate 'HRL42' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u)
     or exists (select 1 from public.player_ledger where user_id = c_u) or not exists (select 1 from public.hr_level_xp_ceiling where id) then
    raise exception 'level-xp-ceiling §3: LEAKED a probe row, or the ceiling did not come back'; end if;

  -- (e) THE SETTLE ASKS IT, right under its kill bound, with the window's span and the hero's Level XP before the credit.
  v_def := replace(pg_get_functiondef(c_mem::regprocedure), E'\r', '');
  if position('public.hr_level_xp_over(p_user, p_slot, (p_delta->>''level_xp'')::numeric, v_win, v_lx0)' in v_def) = 0
     or position('perform public.hr_reject(coalesce(v_lxo->>''error'', ''value_over''), v_lxo - ''error'')' in v_def) = 0 then
    raise exception 'level-xp-ceiling §3(e): hr_hunt_apply_member does not ask the ceiling, or does not refuse on its answer'; end if;
  if position('public.hr_level_xp_over(' in v_def) < position('v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);' in v_def) then
    raise exception 'level-xp-ceiling §3(e): the ceiling is asked before hr_apply wrote the window''s ledger row (the day would miss this call)'; end if;
  -- (g) ★ THE DIFF IS ONLY THIS FILE'S LINES, judged LAST: the installed body is this file's image, and with its marked lines
  --     taken back out it is 2027-03-25-death-share.sql's.
  v_md5 := md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '43f5f8d28bedb9d149e5a69eaee5e6be' then raise exception 'level-xp-ceiling §3(g): hr_hunt_apply_member is not this file''s image (md5 %)', v_md5; end if;
  v_def := regexp_replace(v_def, '\n[^\n]*-- LEVEL-XP-CEILING[^\n]*(?=\n)', '', 'g');
  if position('LEVEL-XP-CEILING' in v_def) > 0 or position('hr_level_xp_over' in v_def) > 0 then
    raise exception 'level-xp-ceiling §3(g): a line of this file stands after the reverse edit'; end if;
  v_md5 := md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '08f063d34d560f794709263a860c0124' then
    raise exception 'level-xp-ceiling §3(g): hr_hunt_apply_member differs from its pre-image by more than this file''s marked lines (md5 % after the reverse edit, wanted 08f063d34d560f794709263a860c0124)', v_md5; end if;
  raise notice 'level-xp-ceiling: one settle is held to % Level XP an hour of its window, a hero''s UTC day to %; yesterday, another hero and a row with no lx do not count; no ceiling row refuses; hr_hunt_apply_member is its pre-image plus five marked lines; all green', v_hour, v_day;
end $chk$;
