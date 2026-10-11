-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-16-daily-harvest-eligibility.sql — THE HARVEST DAILY IS DEALT ONLY
-- TO A CHARACTER WHO CAN DO IT.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Decides which gold-paying daily a
-- character is offered, so it moves only on a Security GO; the Coordinator
-- applies it. APPLY ORDER: after 2026-10-16-daily-harvest-credit.sql (the
-- harvest row pays from there on; this file decides who is dealt it).
--
-- ── WHY (game-designer, 2026-10-10, the condition on the harvest row) ───────
-- "daily_harvest may be offered only when the character holds plantable seeds
-- AND has a plot; a quest that can't be done is the 2026-08-23 wall again."
-- Until now the row was ungated (the 2026-08-29 eligibility filter gates only
-- the two bench tasks), so a character who had sold or planted out every seed
-- was still dealt "Harvest 6 crops" with nothing to harvest.
--
-- ── THE RULE (server-projected rows only, never a client value) ─────────────
--   hr_daily_harvest_ready(day, user, slot) is TRUE iff
--     A PLOT    — the property plot cap hr_farm_plant enforces, (tier+1)*2 from
--                 hr_unlock_levels' property:* rung, is > 0
--     AND ONE OF
--       SEEDS   — player_inventory holds a seed_item of an hr_crops row whose
--                 req_lv <= the farming level (hr_level_from_xp over
--                 player_skills) and whose hr_crop_plot_tier <= player_state.
--                 plot_level: exactly the gates hr_farm_plant refuses on
--       GROWING — a player_farm plot has a crop in the ground. Planting the
--                 last seed must not take the quest away from the player who
--                 just started doing it; the crop IS the harvest.
--       ENGAGED — today's ev:planted or ev:harvest counter is > 0. Same reason
--                 one step later: harvesting the last crop of a round with the
--                 bag empty must not pull a half-done quest off the sheet (and
--                 off the claim gate) before the player can buy more seed.
--   GROWING and ENGAGED keep the offer MONOTONE within a day once farming has
--   started; the designer's "seeds AND a plot" is the rule for the deal.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 hr_daily_harvest_rule (pure, IMMUTABLE — the JS twin is goal-catalogue
--      harvestReady) and hr_daily_harvest_ready (STABLE, SECURITY DEFINER),
--      which reads the four inputs from server rows. No client grant on either.
--   §2 hr_daily_task_set_caps gains p_harvest boolean: the same date-seeded
--      shuffle, with daily_harvest skipped (pass 1 AND the back-fill) when it
--      is false. §2b proves, against the still-installed 5-arg form over 400
--      day keys, that p_harvest = true is the identity — so no character who
--      can farm sees a different slate.
--   §3 hr_daily_task_set_for restated to pass hr_daily_harvest_ready.
--   §4 drops the 5-arg form: it is the old shuffle with no harvest gate, and a
--      privileged caller that reached it would deal the wall again.
--   §5 self-check by execution, net-zero.
--   The claim gate (hr_claim_daily__ungated) is untouched: it reads
--   hr_daily_task_set_for, so the offer and the gate move together, and
--   hr_tally_state's `offered` (what the sheet shows) moves with them.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- Three indexed existence probes on (user_id, slot) per call; called by
-- hr_tally_state (≤120/min/user) and hr_claim_daily (≤12/min/user). No rows.
-- REVERSIBILITY: restate the 2026-08-29 5-arg hr_daily_task_set_caps and
--   hr_daily_task_set_for bodies, drop the 6-arg form and the two harvest helpers.
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_daily_task_set_for, the 6-arg
--   hr_daily_task_set_caps, hr_daily_harvest_rule, hr_daily_harvest_ready, and
--   loses the 5-arg form.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_daily_task_set_for(text,uuid,int)') is null
     or to_regprocedure('public.hr_daily_task_eligible(text,bigint,bigint,bigint,bigint)') is null
     or to_regprocedure('public.hr_goal_daily_seed(text)') is null then
    raise exception 'the 2026-08-29 daily-task eligibility chain is missing — apply it first'; end if;
  if to_regprocedure('public.hr_unlock_levels(uuid,int)') is null
     or to_regprocedure('public.hr_level_from_xp(bigint)') is null
     or to_regclass('public.hr_crops') is null or to_regclass('public.hr_crop_plot_tier') is null
     or to_regclass('public.player_farm') is null or to_regclass('public.player_inventory') is null then
    raise exception 'the server farming chain (hr_crops, hr_crop_plot_tier, player_farm) is missing — apply it first'; end if;
  if to_regprocedure('public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint)') is null
     and to_regprocedure('public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint,boolean)') is null then
    raise exception 'hr_daily_task_set_caps is absent in both forms — re-read before applying'; end if;
end $mig$;

-- ── 1. THE RULE (pure) AND ITS INPUTS (server rows) ─────────────────────────
-- The rule is a pure function so both languages can be held to it by running
-- them: src/data/goal-catalogue.js harvestReady is the JS twin, and
-- tests/daily-harvest-eligibility.mjs compares the two over every input.
create or replace function public.hr_daily_harvest_rule(
  p_plots int, p_plantable boolean, p_growing int, p_today bigint)
returns boolean language sql immutable set search_path = pg_catalog as $fn$
  select coalesce(p_plots, 0) > 0
     and (coalesce(p_plantable, false) or coalesce(p_growing, 0) > 0 or coalesce(p_today, 0) > 0);
$fn$;
revoke execute on function public.hr_daily_harvest_rule(int, boolean, int, bigint)
  from public, anon, authenticated, service_role;

create or replace function public.hr_daily_harvest_ready(p_day_key text, p_user uuid, p_slot int)
returns boolean language plpgsql stable security definer
set search_path = public, pg_catalog as $fn$
declare
  v_slot      int := coalesce(p_slot, 0);
  v_prop_tier int;
  v_farm_lv   int;
  v_plantable boolean;
  v_growing   int;
  v_today     bigint;
begin
  -- A PLOT: hr_farm_plant's property cap, (tier+1)*2. Its floor is 2 today;
  -- the rule asks the question rather than assuming the answer.
  select coalesce(max(level) filter (where unlock_id like 'property:%'), 0)::int
    into v_prop_tier from public.hr_unlock_levels(p_user, v_slot);
  v_farm_lv := public.hr_level_from_xp(coalesce((
    select k.xp from public.player_skills k
     where k.user_id = p_user and k.slot = v_slot and k.skill_id = 'farming'), 0));
  -- SEEDS the character can plant right now: hr_farm_plant's level and
  -- plot-tier gates, against the server bag.
  select exists (
    select 1
      from public.player_inventory i
      join public.hr_crops c          on c.seed_item = i.item_id
      join public.hr_crop_plot_tier t on t.crop_id   = c.crop_id
      join public.player_state s      on s.user_id = i.user_id and s.slot = i.slot
     where i.user_id = p_user and i.slot = v_slot and i.qty > 0
       and c.req_lv <= v_farm_lv and t.plot_tier <= s.plot_level)
    into v_plantable;
  -- GROWING: a crop already in the ground is a harvest to come.
  select count(*)::int into v_growing from public.player_farm f
   where f.user_id = p_user and f.slot = v_slot and f.crop_id is not null;
  -- ENGAGED today: never pull a started quest off the sheet mid-day.
  select coalesce(sum(p.value), 0) into v_today from public.player_progress p
   where p.user_id = p_user and p.slot = v_slot and p.kind = 'daily'
     and p.key in ('ev:planted', 'ev:harvest') and p.period_key = p_day_key;
  return public.hr_daily_harvest_rule((v_prop_tier + 1) * 2, v_plantable, v_growing, v_today);
end $fn$;
revoke execute on function public.hr_daily_harvest_ready(text, uuid, int)
  from public, anon, authenticated, service_role;

-- ── 2. THE SHUFFLE, WITH THE HARVEST GATE ──────────────────────────────────
create or replace function public.hr_daily_task_set_caps(
  p_day_key text, p_workshop bigint, p_forge bigint, p_crafting_xp bigint, p_smithing_xp bigint,
  p_harvest boolean)
returns text[] language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  -- MUST equal src/data/goal-catalogue.js DAILY_TASK_POOL_ORDER and the authored
  -- order of legacy.js DAILY_TASK_POOL (tests/goal-catalogue-drift.mjs binds all three).
  c_pool constant text[] := array['daily_kill','daily_kill_big','daily_gather',
    'daily_gather_big','daily_harvest','daily_cook','daily_smith','daily_craft'];
  c_mask constant bigint := 4294967295;
  c_want constant int    := 3;                    -- DAILY_TASK_BASE_COUNT
  v_seed bigint := public.hr_goal_daily_seed(p_day_key);
  v_idx  int[]  := array[0,1,2,3,4,5,6,7];
  v_i    int; v_j int; v_tmp int;
  v_out  text[] := '{}';
  v_id   text;
  k      int;
begin
  for v_i in reverse 7..1 loop                       -- JS: for i = len-1; i>0; i--
    v_seed := ((v_seed * 1664525) + 1013904223) & c_mask;
    v_j := (v_seed % (v_i + 1))::int;
    v_tmp := v_idx[v_i + 1];
    v_idx[v_i + 1] := v_idx[v_j + 1];
    v_idx[v_j + 1] := v_tmp;
  end loop;

  -- PASS 1 — eligible rows, in shuffle order.
  for k in 1..8 loop
    exit when coalesce(array_length(v_out, 1), 0) >= c_want;
    v_id := c_pool[v_idx[k] + 1];
    if public.hr_daily_task_eligible(v_id, p_workshop, p_forge, p_crafting_xp, p_smithing_xp)
       and (v_id <> 'daily_harvest' or coalesce(p_harvest, false)) then
      v_out := v_out || v_id;
    end if;
  end loop;

  -- PASS 2 — the BACK-FILL (unreachable: five pool rows are never gated). It
  -- still never deals the harvest row to a character who cannot farm — a back-
  -- filled wall is still a wall.
  if coalesce(array_length(v_out, 1), 0) < c_want then
    for k in 1..8 loop
      exit when coalesce(array_length(v_out, 1), 0) >= c_want;
      v_id := c_pool[v_idx[k] + 1];
      if not (v_id = any (v_out)) and (v_id <> 'daily_harvest' or coalesce(p_harvest, false)) then
        v_out := v_out || v_id;
      end if;
    end loop;
  end if;

  return v_out;
end $fn$;
revoke execute on function public.hr_daily_task_set_caps(text, bigint, bigint, bigint, bigint, boolean)
  from public, anon, authenticated, service_role;

-- ── 2b. IDENTITY PROOF while the 5-arg form is still installed ──────────────
-- p_harvest = true must deal exactly what the 2026-08-29 shuffle dealt, for a
-- fresh and a fully unlocked account, over 400 day keys. Skipped (and proved by
-- §5's own sweep) on a re-apply, where the 5-arg form is already gone.
do $mig$
declare v_d date := date '2026-01-01'; v_k text; v_n int := 0; v_a text[]; v_b text[];
begin
  if to_regprocedure('public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint)') is null then
    raise notice 'daily-harvest-eligibility §2b: 5-arg form already dropped (re-apply) — skipped'; return; end if;
  while v_d < date '2027-02-05' loop
    v_k := public.hr_utc_day_key((v_d::text || ' 12:00:00+00')::timestamptz);
    execute 'select public.hr_daily_task_set_caps($1, 0, 0, 0, 0)' into v_a using v_k;
    v_b := public.hr_daily_task_set_caps(v_k, 0, 0, 0, 0, true);
    if v_a is distinct from v_b then
      raise exception 'daily-harvest-eligibility §2b: fresh slate on % moved % -> % with harvest allowed', v_k, v_a, v_b; end if;
    execute 'select public.hr_daily_task_set_caps($1, 1, 1, 0, 0)' into v_a using v_k;
    v_b := public.hr_daily_task_set_caps(v_k, 1, 1, 0, 0, true);
    if v_a is distinct from v_b then
      raise exception 'daily-harvest-eligibility §2b: full slate on % moved % -> % with harvest allowed', v_k, v_a, v_b; end if;
    v_n := v_n + 1; v_d := v_d + 1;
  end loop;
  if v_n < 400 then raise exception 'daily-harvest-eligibility §2b: only % day(s) swept', v_n; end if;
end $mig$;

-- ── 3. THE OFFERED SET READS THE GATE ──────────────────────────────────────
create or replace function public.hr_daily_task_set_for(p_day_key text, p_user uuid, p_slot int)
returns text[] language plpgsql stable security definer
set search_path = public, pg_catalog as $fn$
declare
  v_workshop bigint; v_forge bigint; v_craft bigint; v_smith bigint;
begin
  select coalesce(max(case when key = 'room:workshop' then value end), 0),
         coalesce(max(case when key = 'room:forge'    then value end), 0)
    into v_workshop, v_forge
    from public.player_progress
   where user_id = p_user and slot = coalesce(p_slot, 0) and kind = 'unlock'
     and key in ('room:workshop', 'room:forge');

  select coalesce(max(case when skill_id = 'crafting' then xp end), 0),
         coalesce(max(case when skill_id = 'smithing' then xp end), 0)
    into v_craft, v_smith
    from public.player_skills
   where user_id = p_user and slot = coalesce(p_slot, 0)
     and skill_id in ('crafting', 'smithing');

  return public.hr_daily_task_set_caps(p_day_key,
    coalesce(v_workshop, 0), coalesce(v_forge, 0), coalesce(v_craft, 0), coalesce(v_smith, 0),
    public.hr_daily_harvest_ready(p_day_key, p_user, p_slot));
end $fn$;
revoke execute on function public.hr_daily_task_set_for(text, uuid, int)
  from public, anon, authenticated, service_role;

-- ── 4. THE UNGATED SHUFFLE GOES ────────────────────────────────────────────
drop function if exists public.hr_daily_task_set_caps(text, bigint, bigint, bigint, bigint);

-- ── 5. SELF-CHECK (§4) — BY EXECUTION, NET-ZERO ────────────────────────────
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-c000-0000010a1d06';
  v_day  text;
  v_d    date := date '2026-01-01';
  v_k    text;
  v_n    int := 0;
  v_on   text[]; v_off text[];
  v_fn   regprocedure;
begin
  -- (a) nothing new reaches a client, and the ungated form is gone.
  foreach v_fn in array array[
      'public.hr_daily_harvest_rule(int,boolean,int,bigint)'::regprocedure,
      'public.hr_daily_harvest_ready(text,uuid,int)'::regprocedure,
      'public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint,boolean)'::regprocedure,
      'public.hr_daily_task_set_for(text,uuid,int)'::regprocedure] loop
    if has_function_privilege('authenticated', v_fn, 'execute')
       or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'daily-harvest-eligibility self-check (a): % is client-executable', v_fn; end if;
  end loop;
  if to_regprocedure('public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint)') is not null then
    raise exception 'daily-harvest-eligibility self-check (a): the ungated 5-arg shuffle is still installed'; end if;

  -- (b) THE SHUFFLE: over 400 day keys, harvest = false never deals the row and
  --     never a short slate; harvest = true deals it on the days the draw does.
  while v_d < date '2027-02-05' loop
    v_k := public.hr_utc_day_key((v_d::text || ' 12:00:00+00')::timestamptz);
    v_on  := public.hr_daily_task_set_caps(v_k, 0, 0, 0, 0, true);
    v_off := public.hr_daily_task_set_caps(v_k, 0, 0, 0, 0, false);
    if 'daily_harvest' = any (v_off) then
      raise exception 'daily-harvest-eligibility self-check (b): % deals harvest to a character who cannot farm: %', v_k, v_off; end if;
    if coalesce(array_length(v_off, 1), 0) <> 3 then
      raise exception 'daily-harvest-eligibility self-check (b): % deals a short slate %', v_k, v_off; end if;
    if 'daily_harvest' = any (v_on) then v_n := v_n + 1;
    elsif v_on is distinct from v_off then
      raise exception 'daily-harvest-eligibility self-check (b): the gate moved a slate with no harvest in it on %: % vs %', v_k, v_on, v_off; end if;
    v_d := v_d + 1;
  end loop;
  if v_n = 0 then raise exception 'daily-harvest-eligibility self-check (b): harvest never drawn in 400 days — the sweep proves nothing'; end if;

  -- (b2) THE RULE's truth table: no plot deals nothing whatever else holds; a
  --      plot deals it only with plantable seeds, a crop growing, or a start today.
  if public.hr_daily_harvest_rule(0, true, 1, 1)
     or public.hr_daily_harvest_rule(2, false, 0, 0)
     or not public.hr_daily_harvest_rule(2, true, 0, 0)
     or not public.hr_daily_harvest_rule(2, false, 1, 0)
     or not public.hr_daily_harvest_rule(2, false, 0, 1) then
    raise exception 'daily-harvest-eligibility self-check (b2): the rule is not "a plot AND (seeds OR growing OR started today)"'; end if;

  -- (c) THE PREDICATE on a real probe character, on a day the draw deals harvest.
  v_d := current_date;
  loop
    v_day := public.hr_utc_day_key((v_d::text || ' 12:00:00+00')::timestamptz);
    exit when 'daily_harvest' = any (public.hr_daily_task_set_caps(v_day, 0, 0, 0, 0, true));
    v_d := v_d + 1;
  end loop;
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform public.hr_create_character(0);

    -- NO SEEDS, nothing growing, nothing done today → not offered.
    delete from public.player_inventory i using public.hr_crops c
     where i.user_id = v_uid and i.slot = 0 and i.item_id = c.seed_item;
    delete from public.player_farm where user_id = v_uid and slot = 0;
    delete from public.player_progress where user_id = v_uid and slot = 0 and kind = 'daily';
    if public.hr_daily_harvest_ready(v_day, v_uid, 0)
       or 'daily_harvest' = any (public.hr_daily_task_set_for(v_day, v_uid, 0)) then
      raise exception 'daily-harvest-eligibility self-check (c): no seeds and no crops, yet harvest is offered on %', v_day; end if;

    -- A SEED THE CHARACTER CANNOT PLANT (above its farming level) → still not offered.
    -- The plot tier is raised to the top first, so the LEVEL gate is the only one
    -- standing between this seed and a plot.
    update public.player_state set plot_level = 5 where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_uid, 0, c.seed_item, 5 from public.hr_crops c order by c.req_lv desc limit 1;
    if public.hr_daily_harvest_ready(v_day, v_uid, 0) then
      raise exception 'daily-harvest-eligibility self-check (c): an unplantable seed made harvest offered'; end if;

    -- PLANTABLE SEEDS + the camp's plots → offered.
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_uid, 0, c.seed_item, 5 from public.hr_crops c
        join public.hr_crop_plot_tier t on t.crop_id = c.crop_id
       where c.req_lv <= 1 and t.plot_tier <= 1 order by c.crop_id limit 1;
    if not public.hr_daily_harvest_ready(v_day, v_uid, 0)
       or not ('daily_harvest' = any (public.hr_daily_task_set_for(v_day, v_uid, 0))) then
      raise exception 'daily-harvest-eligibility self-check (c): plantable seeds + a plot, yet harvest is not offered on %', v_day; end if;

    -- PLANTED THE LAST SEED → a crop in the ground keeps it offered.
    delete from public.player_inventory i using public.hr_crops c
     where i.user_id = v_uid and i.slot = 0 and i.item_id = c.seed_item;
    insert into public.player_farm (user_id, slot, plot_idx, crop_id, planted_at, watered_at, waterings, regrow_count)
      select v_uid, 0, 0, c.crop_id, now(), null, '{}', 0 from public.hr_crops c order by c.req_lv, c.crop_id limit 1;
    if not public.hr_daily_harvest_ready(v_day, v_uid, 0) then
      raise exception 'daily-harvest-eligibility self-check (c): planting the last seed took the quest away'; end if;

    -- HARVESTED IT, bag empty → today's counter keeps it offered.
    delete from public.player_farm where user_id = v_uid and slot = 0;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'ev:harvest', v_day, 2, 'active');
    if not public.hr_daily_harvest_ready(v_day, v_uid, 0) then
      raise exception 'daily-harvest-eligibility self-check (c): a half-done harvest quest left the sheet'; end if;
    -- …but YESTERDAY's harvest does not deal today's quest.
    update public.player_progress set period_key = 'not-' || v_day
     where user_id = v_uid and slot = 0 and kind = 'daily' and key = 'ev:harvest';
    if public.hr_daily_harvest_ready(v_day, v_uid, 0) then
      raise exception 'daily-harvest-eligibility self-check (c): another day''s counter dealt the quest'; end if;

    raise exception using errcode = 'HR951', message = 'daily-harvest-eligibility §4 complete — rolling back';
  exception when sqlstate 'HR951' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'daily-harvest-eligibility self-check: §4 LEAKED a probe row'; end if;
  raise notice 'daily-harvest-eligibility self-check PASSED: no client path, ungated shuffle gone, harvest never dealt without seeds/crops, dealt with plantable seeds + a plot, monotone once started';
end $$;
