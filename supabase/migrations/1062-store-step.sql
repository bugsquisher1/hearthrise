-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1062-store-step.sql — A STORE USE IS PRICED AT THE BUYER'S STORE STEP (lane/econ-followups, backend-architect,
--   2026-11-22; 04-math-strategy.md sections 3 and 11, 09-crafting.md 2.5 and 4.6; Tyler 2026-11-22: goods are priced by DEPTH).
--
-- STATUS: supabase/migration-notes/1062-store-step.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1061-store-step-catalogue.generated.sql (hr_store_price and its
--   tables) and after 1056/1057 (the Danger scale it reads). Applied as ONE transaction by the apply tool; never begin/commit here.
--   Ends with its §5 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A store row was priced once, at its own made-at Level, so a hero far deeper than a row's step paid that row's price: the store, the
-- standing sink (04 section 11: supplies are sized as a share of gross coin), faded as depth grew. 04 says every repeating price is hours
-- of the wage at the BUYER's step, and Tyler ruled goods are priced by depth. Supplies are kit burned while hunting at a depth, so a use
-- is priced at the depth the hunt stands at: the bill then follows what the hour pays, at every depth.
--
-- ── THE DECISION: WHICH STEP (src/core/wage.js depthStep and levelStep are the spec; hr_store_step its twin) ───────────────────────────────
--   ON THE DANGER SCALE: the step the hunt stands at as each settle window opens (the instance's stored world; the frozen start before
--     its first world), in the wage's unit (wage.js depthStep: gearLevel + min(step - refStep, gap_max)). NOT the hero's held step on
--     the ground (hunt_density.danger_held): that is written only as a hunt ends, so a company could end a short Careful hunt shallow,
--     then hunt Bold deep for a whole day at the shallow price. NOT the frozen start step either (the start sits a margin under the
--     party's LOWEST hold, so a carried hero drags everyone's price down, and a first hunt climbs from 0 at the floor price all day).
--     The window's own depth is shared by every seat of the party, as its pay is. Shallow hunting is cheap, as Tyler accepted (2026-11-22:
--     "who cares about that let them do it"): it also pays less.
--   OFF THE SCALE (a tier ground, the Tower, a hall, a call, town): the hero's Level (wage.js levelStep), the fallback Tyler named for
--     a hero with no held step. NOT the row's step: one rule, so a Level 400 hero eating Salted Shrimp pays a Level 400 price per point.
--   THE ROW'S OWN STEP stays its LIST price only (supply-basics.js `price`, hr_hunt_basic_supplies.price): the shop's buy-back cap for
--     the crafted partner reads it. A use never does (§5 (b), tests/store-step.mjs SS-CLASS).
--   Every floor is step-free (the crafted partner's), so no step prices a use under what keeps buy-then-vendor a loss.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- NEW (internal, SECURITY DEFINER, no client grant)
--   hr_store_step(p_instance uuid | null, p_user uuid, p_slot int) -> int, 1..step_max. p_instance null: the hero's open session's.
-- RESTATED WHOLE (each chain was at or past the patch-chain limit, or is restated to keep one reader of the price)
--   hr_hunt_apply_member   the step taken ONCE, before any credit; each store unit charged hr_store_price(row, step) (journalled per
--                          item in supply_buy's meta, as before)
--   hr_hunt_member_read    the engine's `basics` priced at the same step (the purse the engine walks is the one the server debits)
-- SPLICED (one anchor each, marker STORE-STEP)
--   hr_hunt_settle_session gold_out proven against the dearest row at the hero's step (recomputed: the Level may have risen in this
--                          window, which only raises the price, so the proof is never stricter than the engine's)
--   hr_boss_call_plan      a called room's next-fight check prices this fight's buys at the step (before any member lands)
--   hr_hunt_settings_view  the client's `store` list priced at the hero's step now (its hunt's depth, else its Level): display only
-- ERRORS: none new. A row with no terms prices null, and the bill refuses it not_for_sale as before.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The step reads the instance row hr_hunt_apply_instance holds FOR UPDATE, under its world-swing CAS, and the stored world it reads is
-- the one the edge read for this window (the new world is written after every member): the member read and the bill price the same
-- step, and a settle that raced another is refused session_moved before any member lands. Nothing here writes. A replayed settle key
-- lands nothing (hr_apply). A second apply restates the same bodies and finds each splice's marker: byte-identical (schema-drift).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No new verb, no grant, no client value: the step is the server's (its stored world, re-proved by hr_danger_bound; its catalogue; the
-- hero's own Level row). The price can only be moved by playing: a shallower stance holds shallower and pays less. Every price is at
-- least the row's floor (>= 1), and at most the row at step_max (tools/gen-store-prices.mjs refuses one past a safe integer).
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- No table, no column, no row written. A member read and a settle each parse the stored world once more on the scale (~0.1 ms, 1056's
-- measure) and price 49 rows (hr_wage is a dozen float multiplies); off the scale one PK read of player_state. A settings view while
-- hunting on the scale adds one world parse.
--
-- EDGE: none required. The engine prices from the member read. REVERSIBLE: restate hr_hunt_apply_member and hr_hunt_member_read from
--   their pre images (§0 pins them), take the STORE-STEP lines out of the three splices, drop hr_store_step.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each body is the image this file was written against (the replayed chain on set/v0.2.144) or this file's own (a second apply): md5
-- of prosrc with carriage returns removed.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_store_price(text,integer)') is null or to_regclass('public.hr_store_grounds') is null then
    raise exception 'PRECONDITION: apply 1061-store-step-catalogue.generated.sql first'; end if;
  if to_regprocedure('public.hr_danger_world(text)') is null or to_regclass('public.hr_danger_rules') is null
     or to_regclass('public.hr_danger_grounds') is null then
    raise exception 'PRECONDITION: apply 1055-danger-scale-danger-catalogue.generated.sql and 1056-danger-scale.sql first'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'bdf1e6f5d5bf7266b64b82b2b9f7e5c1', '209f8462d94db3fc386a12980342f2e8'),
    ('public.hr_hunt_member_read(public.hunt_sessions)', '037ffba44e5d14d04af6abb053656d72', '8cf75f1bce69a3273f3490e52650354c'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', '0960aa8565d01e4e28b8357f15634f90', 'a2991dfe16b083693b702f7a910ede1e'),
    ('public.hr_boss_call_plan(uuid,jsonb,timestamp with time zone)', 'ff8dcc80f17175fbba64b249772d3195', 'cf66efbe4a059800e8331f462c63f55b'),
    ('public.hr_hunt_settings_view(uuid,integer)', '17840bc8ba0a0e097cc4eda0f1b37851', '5922a5ff5d2ff8a651f9c73d648d0272')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-pin', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE BUYER'S STORE STEP (internal) ─────────────────────────────────────
create or replace function public.hr_store_step(p_instance uuid, p_user uuid, p_slot int)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  v_inst uuid := p_instance;
  v_i    record;
  v_w    jsonb;
  v_step numeric;
  v_g    record;
  v_max  int := coalesce((select r.step_max from public.hr_danger_rules r where r.id), 1);
  v_lv   int;
begin
  -- STORE-STEP (1062-store-step.sql; src/core/wage.js depthStep, levelStep): the step a store use is priced at.
  if v_inst is null then
    select h.instance_id into v_inst from public.hunt_sessions h
     where h.user_id = p_user and h.slot = p_slot and h.ended_at is null order by h.hunt_from desc limit 1;
  end if;
  if v_inst is not null then
    select i.hunt_id, i.risk, i.danger, i.world into v_i from public.hunt_instances i where i.id = v_inst;
    -- ON THE SCALE: the stored world's step (the depth the window opens at; hr_danger_bound re-proves it), else the frozen start. A world
    -- off the scale on a frozen instance (a scaled window, a restart: hr_danger_world's empty risk) plays the tier, and so prices by Level.
    if found and v_i.risk is not null then
      v_w := public.hr_danger_world(v_i.world);
      if v_w is null or coalesce(v_w->>'risk', '') <> '' then
        v_step := case when v_w is not null and jsonb_typeof(v_w->'step') = 'number' then floor((v_w->>'step')::numeric) else v_i.danger end;
        select g.ref_step, s.ref_wage_step, r.gap_max into v_g
          from public.hr_danger_grounds g join public.hr_store_grounds s on s.hunt_id = g.hunt_id cross join public.hr_danger_rules r
         where g.hunt_id = v_i.hunt_id and r.id;
        -- the ground's reference depth in the wage's unit, one wage step a Danger step, no deeper than the pay's ceiling (gap_max)
        if found and v_step is not null then
          return least(v_max::numeric, greatest(1::numeric, v_g.ref_wage_step + least(v_step - v_g.ref_step, v_g.gap_max::numeric)))::int;
        end if;
      end if;
    end if;
  end if;
  -- OFF THE SCALE: the hero's Level (wage.js levelStep)
  select public.hr_char_level(ps.level_xp) into v_lv from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  return least(v_max, greatest(1, coalesce(v_lv, 1)));
end $fn$;
comment on function public.hr_store_step(uuid, uuid, integer) is '1062-store-step.sql: the step a store use is priced at (src/core/wage.js depthStep, levelStep): on the Danger scale the depth the hunt stands at as the window opens, in the wage''s unit; off it the hero''s Level. Internal.';
do $mig$
declare v_role text;
begin
  revoke execute on function public.hr_store_step(uuid, uuid, integer) from public, anon, authenticated, service_role;
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function public.hr_store_step(uuid, uuid, integer) from %I', v_role); end if;
  end loop;
end $mig$;

-- ── §2 hr_hunt_apply_member, RESTATED WHOLE (its chain was 2 deep since 1005-lever-horizon.sql; this file's lines are marked STORE-STEP) ──
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
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dz jsonb;  -- DANGER-SCALE (1056-danger-scale.sql): the scale's bound inputs, null off it
  v_sstep int;  -- STORE-STEP (1062-store-step.sql): the step this window's store uses are priced at (hr_store_step)
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): step (7)'s five locals went with it to hr_hunt_resume.
  v_train boolean;  -- TRAINING (2027-04-16-combat-training.sql): this session trains on a training ground (hr_training_grounds)
  v_call  boolean;  -- CALL-SERIES (2027-04-24-boss-call-series.sql): this session fights in a called room (hr_boss_calls)
  v_mode  public.hr_session_modes%rowtype;  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance's mode, frozen at its start
  v_tw    jsonb;  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): this window's climb (hr_tower_check), or null off the Tower
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
  -- STORE-STEP (1062-store-step.sql): THE STEP THIS WINDOW'S STORE USES ARE PRICED AT, taken once and before any credit (hr_apply
  -- moves the Level below): on the Danger scale the depth the stored world stood at as the window opened (hr_hunt_apply_instance
  -- writes the new world only after every member has landed), off it the hero's Level. The member read priced the engine's store at
  -- the same step, so the bill below is the one the engine spent from the purse.
  v_sstep := public.hr_store_step(p_instance, p_user, p_slot);
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  -- TOWER-CLIMB: `tower` is this member's own (its cleared floors, re-proved below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event' - 'tower';
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
  -- TRAINING (2027-04-16-combat-training.sql): a training session spends no stamina and proposes none (a JSON null, src/core/combat-sim.js);
  -- the pool is never written here, so it rests while the hero trains (hr_stamina_of from its last stamp).
  v_train := exists (select 1 from public.hr_training_grounds t where t.hunt_id = v_s.hunt_id);
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): a called room's TIME spends no stamina (each fight is charged as it starts: hr_boss_call,
  -- hr_boss_call_step), so its window's pool is the server's alone: whatever the engine proposes (null; a number from an engine that
  -- predates this file) is ignored. Unlike training the pool does NOT rest in the room: it is stamped unchanged below.
  v_call := exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id);
  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
  elsif v_call then
    if v_stam is not null and jsonb_typeof(v_stam) not in ('null', 'number') then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'call')); end if;
  elsif v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
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
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight', 'report'))
          -- HUNT-REPORT (1053-hunt-report.sql): the report's counters, shape only; the database adds `dry` from its own rows
          or (p_analyzer ? 'report' and not public.hr_hunt_report_ok(p_analyzer->'report'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- SESSION-MODES (2027-04-23-session-modes.sql): THE INSTANCE'S MODE, frozen by the server when it started (hunt_instances.session_mode,
  -- hr_hunt_mode_freeze, from its own ground catalogue), never an intent's or the edge's. Its row bounds the death (6) and its Blessings.
  select m.* into v_mode from public.hunt_instances i join public.hr_session_modes m on m.mode_id = i.session_mode where i.id = p_instance;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'session_mode')); end if;
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): WHAT THE MODE PAYS (its coin, drops and Bestiary; the engine's one door is src/core/hunt-rewards.js):
  -- a window that pays what its mode does not is refused whole, before hr_apply writes a thing (hr_mode_pays names the first thing it pays).
  v_k := public.hr_mode_pays(v_mode.mode_id, p_delta);
  if v_k is not null then perform public.hr_reject('mode_pays', jsonb_build_object('mode', v_mode.mode_id, 'what', v_k)); end if;
  v_k := null;
  -- TOWER-CLIMB: THE CLIMB'S FLOORS, re-proved against the run's own record before anything is written (hr_tower_check: the floors one after
  -- another from the run's next floor, no faster than the stair; the most one kill of the floors it stood on). Null off the Tower.
  v_tw := public.hr_tower_check(p_session, p_hunt, v_s.settled_to, v_to);
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  -- DANGER-SCALE (1056-danger-scale.sql): a hunt on the scale presents its step's pull (at most a full box a pocket), and a cleared pack
  -- stands again after the scale's short wait; null off the scale, and nothing moves.
  v_dz := public.hr_danger_of(p_instance);
  if v_dz is not null then
    v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * greatest(v_dmax, (v_dz->>'pull_max')::bigint);
    v_ground.respawn_ms := least(v_ground.respawn_ms, (v_dz->>'respawn_ms')::int);
  end if;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- TRAINING (2027-04-16-combat-training.sql): A TRAINING WINDOW PAYS ITS SKILL AND NOTHING ELSE, refused whole before hr_apply writes a thing
  -- (hr_training_window: an allowlist, the trained skill's key only, no Level XP, no coin, no item, no kill, no death, a time bound).
  if v_train then perform public.hr_training_window(p_user, p_slot, v_s.hunt_id, v_s.settled_to, v_to, p_delta); end if;

  -- BOSS-DAILY (2027-04-25-boss-daily.sql): A KEYED HALL'S BOSS PAYS HIS DROPS ONCE A DAY PER HERO. The window's claim (its journal's
  -- `prize`, said only when the engine made this hero's roll) stamps today's row or finds it taken (hr_boss_prize_take): a prize row passes
  -- only on a fresh stamp, one piece at most, beside the boss's journalled kill; otherwise it is taken off the delta here, before hr_apply
  -- writes a thing. Any other hunt costs this one comparison (a hall's room is its ground's id and _hall) and one key test of its journal.
  if right(v_s.hunt_id, 5) = '_hall' or coalesce(p_delta #> '{journal,meta}', '{}'::jsonb) ? 'prize' then
    p_delta := public.hr_boss_prize_take(p_user, p_slot, p_session, p_intent, v_s.hunt_id, p_delta);
  end if;

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
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): a climb's kills are bounded by the floors it stood on (hr_tower_floors, through hr_tower_check),
  -- and EVERY mode's XP by its share of a kill (hr_session_modes.xp_pm; a hunt's 1000 moves nothing).
  if v_tw is not null then v_vb_xp := greatest(v_vb_xp, (v_tw->>'xp_max')::bigint); end if;
  if v_mode.xp_pm <> 1000 then v_vb_xp := ceil(v_vb_xp * v_mode.xp_pm / 1000.0)::bigint; end if;
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
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0),
                           -- TOWER-CLIMB: a climb's monsters stand at the floor's Level
                           coalesce((v_tw->>'level')::bigint, 0))
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  -- DANGER-SCALE (1056-danger-scale.sql): the stored world's stance and step re-proved (hr_danger_bound raises on one it cannot accept),
  -- and what one kill on the scale may pay: XP at the step's health, Level XP at the hero's own Level share, coin at the depth ratio.
  -- Each only widens the tier bound; a world that plays the tier keeps it.
  if v_dz is not null then
    v_dz := public.hr_danger_bound(p_instance, p_user, p_slot, v_win);
    if v_dz is not null then
      v_vb_gold := greatest(v_vb_gold, ceil(v_vb_gold * (v_dz->>'coin_pm')::numeric / 1000.0)::bigint);
      v_vb_xp := greatest(v_vb_xp, ceil(v_vb_xp * (v_dz->>'hp_pm')::numeric / 1000.0)::bigint, (v_dz->>'level_xp_max')::bigint);
    end if;
  end if;
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
  -- CALL-SERIES: a called room journals no kill, so its items are held by its own bound instead (hr_boss_call_pays above: only the window
  -- his kill fell in, only his table, at most its count), never by kills x the ground's spawns.
  if jsonb_typeof(p_delta->'items') = 'object' and not v_call then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
           -- SCALED-LOOT (2027-05-17-scaled-loot.sql): a window the commit proved scaled rolls each row ceil(loot_pm / 1000) times
           * coalesce((select ceil(b.loot_pm / 1000.0) from public.hunt_instances i join public.hr_scaled_kill_bounds b
                        on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 1)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): THE CLIMB, WRITTEN (hr_tower_write: each floor a room of the run's kills, then the run's top (the
  -- chest's key mint) and the hero's best), after every bound above held and before the session half can end the session.
  if v_tw is not null then perform public.hr_tower_write(p_user, p_slot, p_session, v_tw, v_kills, v_to); end if;

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
  -- TRAINING (2027-04-16-combat-training.sql): a training window drains nothing and stamps nothing (the clock above is still re-proved).
  -- CALL-SERIES: a called room's window drains nothing and RESTS nothing: the pool as it stood at the window's start, stamped at its end.
  if v_call then
    v_e := v_s0;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  elsif not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
    if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  end if;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  -- LEVER-HORIZON (1005-lever-horizon.sql): the WINDOW'S setup (hr_hunt_setup_of: held past a lever inside the seed horizon), the
  -- one the engine played; its supply keys are hr_hunt_supply_of's.
  v_supply := public.hr_hunt_setup_of(v_s);
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
      -- STORE-STEP (1062-store-step.sql): a use costs the row's price at the buyer's store step, never the row's list price.
      select public.hr_store_price(q.basic_id, v_sstep), q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
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
    -- MEMBER-WRITE-ONCE (2027-04-08-member-write-once.sql): the bill's tally increments (bought, supply_gold) are written
    -- with the analyzer's, in the one tally write after the session half (THE ANALYZER TALLY below). Nothing reads them between.
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
  -- TRAINING (2027-04-16-combat-training.sql): THE YARD'S NEXT HOUR, at its first instant (the edge cuts a yard window there, src/core/hunt/training.js
  -- trainingStopMs): paid from the account purse out of what this window's own store bill and the hero's floor leave, or the session ends gold_out
  -- right there (hr_training_hour). Its end, if any, rides the answer, so the resume below and the edge read it as any end.
  if v_train then v_h := public.hr_training_hour(p_user, p_slot, p_session, v_to, v_cost, v_floor, v_h); end if;
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): THE ROOM'S WIN AND ITS NEXT FIGHT (hr_boss_call_step): the win is proved from this window's
  -- own kill and counted; a held end is charged its next fight or closed, as the room's plan says. Its end, if any, rides the answer.
  if v_call then v_h := public.hr_boss_call_step(p_user, p_slot, p_session, p_delta, v_h); end if;
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
  if not v_train and v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  -- SESSION-MODES: a mode whose death uses no Blessing (one that costs nothing: the Burning Tower) never calls the hook; they stay held.
  if v_nd > 0 and v_mode.blessings then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-11-09, CORE_MODEL.md §6):
  --     DEATH-SHARE: every bound is hr_death_xp_max, the one rule: the LEVEL loses at most
  --     death_xp_permille of its TOTAL XP, and that may take a Level (never below 0 XP, Level 1);
  --     each combat skill loses at most the permille of its progress into its level, never a level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  --     SESSION-MODES: each bound is that rule at the instance mode's share (hr_death_xp_mode_max): the rule itself in a hunt, and 0 in
  --     a mode whose death costs nothing, so there any death XP at all is refused (the engine proposes none: two locks).
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        if v_n > public.hr_death_xp_mode_max('level', v_cur, v_mode.death_loss_pm) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', public.hr_char_level(v_cur))); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      if v_n > public.hr_death_xp_mode_max(v_k, v_cur, v_mode.death_loss_pm) then
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

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home), by the job's kind.
  --     BENCH-RESUME (2027-04-24-bench-resume.sql): the step is hr_hunt_resume, whole, so a new kind of job never restates this body.
  perform public.hr_hunt_resume(p_user, p_slot, p_session, v_h->>'ended', v_ev0);
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  -- MEMBER-WRITE-ONCE: the store bill (v_cost > 0) rides this one write; each column keeps its own condition.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' or v_cost > 0 then
    update public.hunt_session_tally t
       set bought = case when v_cost > 0 then public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                                                from jsonb_each(v_items) i)) else t.bought end,
           supply_gold = t.supply_gold + v_cost,
           xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)) else t.dealt end,
           taken = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)) else t.taken end,
           healed = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                         then public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)) else t.healed end,
           -- HUNT-REPORT (1053-hunt-report.sql): the report's counters and each own stack this window ran dry (its slot_dry rows,
           -- the server's own instants), folded in this same write: the lowest health, counts added, the bar and gear as last played
           report = public.hr_hunt_report_add(t.report,
             coalesce(case when jsonb_typeof(p_analyzer->'report') = 'object' then p_analyzer->'report' end, '{}'::jsonb)
             || coalesce((select jsonb_build_object('dry', jsonb_object_agg(x.item, x.at))
                            from (select e.data->>'item' as item, min(floor(extract(epoch from e.at) * 1000))::bigint as at
                                    from public.hunt_session_events e
                                   where e.session_id = p_session and e.id > v_ev0 and e.type = 'slot_dry' and e.data->>'item' ~ '^[a-z0-9_]{1,64}$'
                                   group by 1) x
                          having count(*) > 0), '{}'::jsonb)),
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  -- SCALED-BEST (2027-05-17-scaled-best.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  --   hr_hunt_apply_instance before any member lands) keeps its span on THIS session's tally, so its personal best is never folded
  --   (hr_hunt_best_fold): a scaled run is not the ground's own.
  if exists (select 1 from public.hunt_instances i where i.id = p_instance and i.scale_level is not null) then
    insert into public.hunt_session_tally as t (session_id, user_id, slot, scaled_ms) values (p_session, p_user, p_slot, greatest(v_win, 1))
      on conflict (session_id) do update set scaled_ms = t.scaled_ms + excluded.scaled_ms;
  end if;
  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end
   where id = p_session and unit_id is distinct from (case when ended_at is null then v_unit_id end);
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- ── §3 hr_hunt_member_read, RESTATED WHOLE (this file's lines are marked STORE-STEP) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_member_read(p_s hunt_sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- LEVER-HORIZON (1005-lever-horizon.sql): the preset, options, bar, supply setting and First target are the WINDOW'S setup
  -- (hr_hunt_setup_of: a lever pulled inside the seed horizon plays from the first window past it); target_kind is the instance
  -- read's to overlay and drop.
  select jsonb_build_object(
    'id', p_s.id, 'hunt', p_s.hunt_id, 'preset', (st.v->>'preset')::int, 'version', p_s.version,
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): in a called room the engine's hunt starts with the FIGHT in progress (its limit and
    -- its quiet clock are a fight's); the series is the server's and the engine never counts one.
    'hunt_from_ms', ceil(extract(epoch from coalesce(p_s.fight_from, p_s.hunt_from)) * 1000)::bigint,
    'settled_to_ms', ceil(extract(epoch from p_s.settled_to) * 1000)::bigint,
    'next_swing_at_ms', ceil(extract(epoch from p_s.next_swing_at) * 1000)::bigint,
    'swing_index', p_s.swing_index,
    'hours_limit', p_s.hours_limit,
    'leave_at_ms', case when p_s.leave_at is null then null else ceil(extract(epoch from p_s.leave_at) * 1000)::bigint end,
    'change_at_ms', case when p_s.change_at is null then null else ceil(extract(epoch from p_s.change_at) * 1000)::bigint end,
    'change_to', p_s.change_to,
    'bag', coalesce((select jsonb_object_agg(b.item_id, jsonb_build_object(
                       'loaded', b.qty_loaded, 'left', b.qty_left, 'essential', b.essential))
                     from public.hunt_bag b where b.session_id = p_s.id), '{}'::jsonb),
    'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
    -- THE STAMINA POOL AT THE WINDOW START and the cap it rests to (premium).
    'stamina_ms', public.hr_stamina_of(p_s.user_id, p_s.slot, p_s.settled_to),
    'stamina_max_ms', public.hr_stamina_cap(p_s.user_id, p_s.slot, p_s.settled_to),
    -- TRAINING-GEAR (2027-04-23-training-gear.sql): on a training ground, the item time this window may play (hr_training_gear_budget of
    -- its trained skill); null on any other ground.
    'train_boost_ms', (select public.hr_training_gear_budget(p_s.user_id, p_s.slot, t.skill) from public.hr_training_grounds t where t.hunt_id = p_s.hunt_id),
    -- THE STORE (catalogue). STORE-BY-SLOT (2026-11-04): a bar slot names the ONE item a
    -- use spends (Tyler 2026-10-21); no hunt tier picks one.
    -- STORE-STEP (1062-store-step.sql): each row at the price a use costs THIS hero this window (hr_store_price at hr_store_step,
    -- taken once: the scalar sub-select is an init plan), the price hr_hunt_apply_member charges.
    'basics', coalesce((select jsonb_object_agg(b.basic_id, jsonb_build_object('kind', b.kind,
                          'price', public.hr_store_price(b.basic_id, (select public.hr_store_step(p_s.instance_id, p_s.user_id, p_s.slot))),
                          'heals', b.heals, 'mana', b.mana, 'partner', b.partner))
                          from public.hr_hunt_basic_supplies b), '{}'::jsonb),
    -- THE HERO'S SETTINGS (options) and BAR, its supply setting and floor: the window's (LEVER-HORIZON).
    'options', st.v->'options',
    'bar', st.v->'bar',
    'gold_floor', (st.v->>'gold_floor')::bigint,
    'supply_source', st.v->>'supply_source',
    'on_empty', st.v->>'on_empty',
    'target_kind', st.v->'target_kind',
    -- WHAT SELL-TO-COVER MAY SELL: this session's own loot of the cover items, still in the bag.
    'cover', coalesce((select jsonb_object_agg(c.item_id, jsonb_build_object('unit', c.unit,
                 'avail', greatest(0, least(
                   coalesce((select pi.qty from public.player_inventory pi
                              where pi.user_id = p_s.user_id and pi.slot = p_s.slot and pi.item_id = c.item_id), 0),
                   coalesce((t.loot->>c.item_id)::numeric, 0)::bigint - coalesce((t.covered->>c.item_id)::bigint, 0)))))
                 from public.hr_hunt_cover_items c
                 left join public.hunt_session_tally t on t.session_id = p_s.id
                -- NEVER A LOCKED ITEM (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
                where not public.hr_item_locked(p_s.user_id, p_s.slot, c.item_id)), '{}'::jsonb))
    from (select public.hr_hunt_setup_of(p_s) as v offset 0) st
$function$;

-- ── §4 THE SPLICES: hr_hunt_settle_session, hr_boss_call_plan, hr_hunt_settings_view (one anchor each, marker STORE-STEP) ──────────
do $mig$
declare v_r record; v_def text; v_n int;
begin
  for v_r in select * from (values
    (1, 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
     $a$                         < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
$a$,
     $b$                         -- STORE-STEP (1062-store-step.sql): the dearest row at the hero's store step (taken once; after this window's
                         -- credits the Level can only have risen, so this is never dearer to prove than the engine's own reading)
                         < coalesce((select max(public.hr_store_price(q.basic_id, (select public.hr_store_step(v_s.instance_id, p_user, p_slot))))
                                       from public.hr_hunt_basic_supplies q
$b$),
    (2, 'public.hr_boss_call_plan(uuid,jsonb,timestamp with time zone)',
     $a$      select coalesce(sum((x.value #>> '{}')::bigint * q.price), 0) into v_b
$a$,
     $b$      -- STORE-STEP (1062-store-step.sql): this fight's buys at the hero's store step, the price its settle charges (taken before any member lands)
      select coalesce(sum((x.value #>> '{}')::bigint * public.hr_store_price(q.basic_id, (select public.hr_store_step(p_instance, v_m.user_id, v_m.slot)))), 0) into v_b
$b$),
    (3, 'public.hr_hunt_settings_view(uuid,integer)',
     $a$                                                             'heals', q.heals, 'mana', q.mana, 'price', q.price) order by q.kind, q.price, q.basic_id)
                         from public.hr_hunt_basic_supplies q), '[]'::jsonb),
$a$,
     $b$                                                             'heals', q.heals, 'mana', q.mana, 'price', q.price_at) order by q.kind, q.price_at, q.basic_id)
                         -- STORE-STEP (1062-store-step.sql): each row at what a use costs this hero now (its hunt's depth, else its Level)
                         from (select b.basic_id, b.kind, b.partner, b.heals, b.mana,
                                      public.hr_store_price(b.basic_id, (select public.hr_store_step(null, p_user, p_slot))) as price_at
                                 from public.hr_hunt_basic_supplies b) q), '[]'::jsonb),
$b$)) t(n, fn, find, repl)
    order by n loop
    v_def := replace(pg_get_functiondef(v_r.fn::regprocedure), chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_r.find, ''))) / length(v_r.find);
    -- a second apply: the body already holds the replacement and the old text is gone
    if v_n = 0 and strpos(v_def, v_r.repl) > 0 then continue; end if;
    if v_n <> 1 then raise exception 'STORE-STEP splice %: % holds its anchor % times, want 1', v_r.n, v_r.fn, v_n; end if;
    execute replace(v_def, v_r.find, v_r.repl);
  end loop;
end $mig$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_fn  text;
  v_g   record;
  v_s   int;
  v_lvl int;
  v_u   constant uuid := '000000c0-0000-4000-a000-00005707e001';
begin
  -- (a) the grants: the step is the server's; no client role runs it or any reader it was spliced into
  foreach v_fn in array array['public.hr_store_step(uuid,uuid,integer)', 'public.hr_store_price(text,integer)',
                              'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'public.hr_hunt_member_read(public.hunt_sessions)',
                              'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'public.hr_boss_call_plan(uuid,jsonb,timestamp with time zone)',
                              'public.hr_hunt_settings_view(uuid,integer)'] loop
    if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'VERIFY(a): a client role executes %', v_fn; end if;
  end loop;
  -- (b) THE CLASS: no function that reads the store's rows prices a use from a row's list price (a `.price` of hr_hunt_basic_supplies)
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosrc like '%hr_hunt_basic_supplies%' and p.prosrc ~ '[a-z_]\.price\M') then
    raise exception 'VERIFY(b): % still read a store row''s list price for a use', (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc like '%hr_hunt_basic_supplies%' and p.prosrc ~ '[a-z_]\.price\M'); end if;
  foreach v_fn in array array['public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'public.hr_hunt_member_read(public.hunt_sessions)',
                              'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'public.hr_boss_call_plan(uuid,jsonb,timestamp with time zone)',
                              'public.hr_hunt_settings_view(uuid,integer)'] loop
    if strpos(pg_get_functiondef(v_fn::regprocedure), 'hr_store_price(') = 0 or strpos(pg_get_functiondef(v_fn::regprocedure), 'hr_store_step(') = 0 then
      raise exception 'VERIFY(b): % does not price at the buyer''s store step', v_fn; end if;
  end loop;
  -- (c) THE STEP, on a probe hero made by the real verb (rolled back): in town it is the hero's Level, held to 1..step_max
  perform set_config('request.jwt.claim.sub', v_u::text, true);
  insert into auth.users (id) values (v_u) on conflict (id) do nothing;
  insert into public.hr_access_allowlist (user_id, note) values (v_u, 'store-step §5 probe') on conflict (user_id) do nothing;
  if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the probe hero was refused'; end if;
  v_lvl := greatest(1, coalesce(public.hr_level_of(v_u, 0), 1));
  v_s := public.hr_store_step(null, v_u, 0);
  if v_s is distinct from v_lvl then raise exception 'VERIFY(c): a Level % hero in town prices at step %, want its Level', v_lvl, v_s; end if;
  if (select jsonb_agg(x->'price' order by x->>'id') from jsonb_array_elements(public.hr_hunt_settings_view(v_u, 0)->'store') x)
     is distinct from (select jsonb_agg(to_jsonb(public.hr_store_price(q.basic_id, v_s)) order by q.basic_id) from public.hr_hunt_basic_supplies q) then
    raise exception 'VERIFY(c): the settings view''s store is not every row at the hero''s store step'; end if;
  -- (d) THE BRIDGE: every scale ground's reference depth prices at its reference wage step (the sum the step function takes is checked
  -- on the catalogue's own numbers; tests/store-step.mjs SS-STEP holds it on a real hunt's stored world)
  for v_g in select g.hunt_id, g.ref_step, s.ref_wage_step, r.gap_max, r.step_max from public.hr_danger_grounds g
               join public.hr_store_grounds s on s.hunt_id = g.hunt_id cross join public.hr_danger_rules r where r.id loop
    if v_g.ref_wage_step < 1 or v_g.ref_wage_step + v_g.gap_max > v_g.step_max then
      raise exception 'VERIFY(d): % prices its depths outside 1..step_max (reference % + gap %)', v_g.hunt_id, v_g.ref_wage_step, v_g.gap_max; end if;
  end loop;
  -- (e) a use is never under its floor at the bottom step, and a deeper step never prices a row cheaper
  if exists (select 1 from public.hr_store_terms t where public.hr_store_price(t.basic_id, 1) < t.floor_gold
              or public.hr_store_price(t.basic_id, 200) < public.hr_store_price(t.basic_id, 100)) then
    raise exception 'VERIFY(e): a store row prices under its floor or falls with depth'; end if;
  raise exception 'STORE-STEP-PROBE-ROLLBACK';
exception when raise_exception then
  if sqlerrm <> 'STORE-STEP-PROBE-ROLLBACK' then raise; end if;
end $chk$;
