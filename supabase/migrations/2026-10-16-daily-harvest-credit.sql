-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-16-daily-harvest-credit.sql — THE HARVEST DAILY QUEST PAYS.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Moves gold (a daily quest payout),
-- so it moves only on a Security GO and the Coordinator applies it.
-- APPLY ORDER: any time after 2026-09-04-goal-gold-retune.sql; the CLIENT half
-- (legacy.js DAILY_TASK_POOL's fixed harvest row, the daily list paying it)
-- rides the same cut. An old client against this database still shows the old
-- dynamic goal and simply never fires the claim; nothing is over-paid.
--
-- ── WHY (Security, 2026-10-10, P1 player-visible) ───────────────────────────
-- `daily_harvest` is in the server's offered draw (17 of the last 31 days) and
-- hr_claim_daily__ungated answered it `not_creditable` every time: its goal and
-- gold were computed from the CLIENT's farm-plot cap, which the server cannot
-- see. A quest that is dealt and can never pay breaks the Designer's standing
-- rule. It becomes a FIXED row like the other seven: "Harvest 6 crops" (one
-- harvest round at the starting camp's two plots) for 300 gold, graded on the
-- daily ev:harvest counter hr_farm_harvest already stamps in the same
-- transaction as the produce. The pool ORDER is unchanged, so every day's draw
-- is unchanged.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 RESTATES hr_claim_daily__ungated from its chain-end body (2026-09-04's
--      retuned arms, extracted from a replay) with ONE arm changed: harvest
--      pays. Signature, grants, the offered-set gate, the once-guard and the
--      journal are byte-for-byte the installed ones. src/data/goal-catalogue.js
--      DAILY_TASK_REWARDS and legacy.js DAILY_TASK_POOL carry the same row;
--      tests/goal-catalogue-drift.mjs binds all three to THIS body.
--   §2 self-check by execution, net-zero.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- None new: one more arm in a CASE. At most one harvest claim per character
-- per day, 300 gold, under the existing once-guard and 12/min gate.
-- REVERSIBILITY: re-apply 2026-09-04-goal-gold-retune.sql's body (the arm
--   returns not_creditable again). No data moves.
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_claim_daily__ungated.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_claim_daily__ungated(text,int)') is null
     or to_regprocedure('public.hr_daily_task_set_for(text,uuid,int)') is null then
    raise exception 'hr_claim_daily__ungated / hr_daily_task_set_for missing — apply the goal chain first'; end if;
  if strpos(pg_get_functiondef('public.hr_claim_daily__ungated(text,int)'::regprocedure), 'not_creditable') = 0
     and strpos(pg_get_functiondef('public.hr_claim_daily__ungated(text,int)'::regprocedure),
                'when ''daily_harvest''    then v_type := ''harvest''') = 0 then
    raise exception 'hr_claim_daily__ungated is neither the 2026-09-04 body nor this one — re-read before restating'; end if;
end $mig$;

-- ── 1. THE RESTATEMENT ─────────────────────────────────────────────────────
create or replace function public.hr_claim_daily__ungated(p_task_id text, p_slot integer)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_day    text := public.hr_utc_day_key(now());
  v_set    text[];
  v_elig   text[];
  v_type   text;
  v_goal   bigint;
  v_gold   bigint;
  v_have   bigint;
  v_rows   int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-DERIVED offered set for TODAY. `v_elig` is what an up-to-date client
  -- offers (the eligibility filter); `v_set` is the raw base 3 the pre-b45x
  -- client offered and which a client whose room ownership the server cannot yet
  -- see will still offer. The gate is the UNION — see this file's header for why
  -- narrowing it would refuse legitimate claims today. A task in NEITHER is still
  -- refused, so cherry-picking a richer unoffered task remains blocked, and the
  -- King's Renown 4th slot still lands here as not_offered (no server Renown
  -- model — src/data/goal-catalogue.js BLOCKED_DAILY).
  v_set  := public.hr_daily_task_set(v_day);
  v_elig := public.hr_daily_task_set_for(v_day, auth.uid(), v_slot);
  if not (p_task_id = any (v_set)) and not (p_task_id = any (v_elig)) then
    return jsonb_build_object('ok', false, 'error', 'not_offered',
      'task', p_task_id, 'day_key', v_day,
      'offered', to_jsonb(v_elig), 'base', to_jsonb(v_set));
  end if;

  -- SERVER-OWNED CATALOGUE (every pool task is a fixed goal since 2026-10-16).
  case p_task_id
    -- b497 RETUNE (Designer, balance audit). Kept in lockstep with
    -- 2026-08-20-goal-reward-rpc-credit.sql §6, which this file restates, and
    -- with src/data/goal-catalogue.js DAILY_TASK_REWARDS. This file runs LATER
    -- in the apply order, so on a REBUILD these are the numbers that install;
    -- on PRODUCTION the installed body is moved by
    -- 2026-09-04-goal-gold-retune.sql instead.
    when 'daily_kill'       then v_type := 'kill_any'; v_goal := 25;  v_gold := 600;
    when 'daily_kill_big'   then v_type := 'kill_any'; v_goal := 60;  v_gold := 1400;
    when 'daily_gather'     then v_type := 'gather';   v_goal := 50;  v_gold := 400;
    when 'daily_gather_big' then v_type := 'gather';   v_goal := 120; v_gold := 800;
    when 'daily_cook'       then v_type := 'cooked';   v_goal := 12;  v_gold := 400;
    when 'daily_smith'      then v_type := 'smithed';  v_goal := 40;  v_gold := 500;
    when 'daily_craft'      then v_type := 'crafted';  v_goal := 40;  v_gold := 500;
    -- W0 (2026-10-16-daily-harvest-credit.sql): a FIXED goal, graded on the
    -- daily ev:harvest counter hr_farm_harvest stamps. It was offered and never
    -- paid (not_creditable) because its goal scaled with the client's plot cap.
    when 'daily_harvest'    then v_type := 'harvest';  v_goal := 6;   v_gold := 300;
    else return jsonb_build_object('ok', false, 'error', 'unknown_task', 'task', p_task_id);
  end case;

  -- VERIFY from today's daily counter.
  select value into v_have from public.player_progress
   where user_id = auth.uid() and slot = v_slot
     and kind = 'daily' and key = 'ev:' || v_type and period_key = v_day;
  if coalesce(v_have, 0) < v_goal then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'task', p_task_id, 'have', coalesce(v_have, 0), 'goal', v_goal, 'day_key', v_day);
  end if;

  -- CONSUME (once per day per task). key=<task_id>, distinct from 'ev:<type>'.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'daily', p_task_id, 1, v_day, 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed',
      'task', p_task_id, 'day_key', v_day);
  end if;

  -- CREDIT.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold, version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'daily', 'daily_claim:' || v_day || ':' || p_task_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('task', p_task_id, 'type', v_type, 'goal', v_goal, 'day_key', v_day));

  return jsonb_build_object('ok', true, 'task', p_task_id, 'gold', v_gold,
    'day_key', v_day, 'slot', v_slot, 'credited', true);
end $fn$;
revoke execute on function public.hr_claim_daily__ungated(text, int) from public, anon, authenticated, service_role;

-- ── 2. SELF-CHECK (§4) — BY EXECUTION, NET-ZERO ────────────────────────────
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-c000-0000010a1d05';
  v_day  text := public.hr_utc_day_key(now());
  v_def  text := pg_get_functiondef('public.hr_claim_daily__ungated(text,int)'::regprocedure);
  v_r jsonb; v_g0 bigint; v_g1 bigint; v_offered boolean;
begin
  if strpos(v_def, 'not_creditable') > 0
     or strpos(v_def, 'when ''daily_harvest''    then v_type := ''harvest'';  v_goal := 6;   v_gold := 300;') = 0 then
    raise exception 'daily-harvest-credit self-check (a): the harvest arm is not the fixed 6 crops / 300 gold'; end if;
  if has_function_privilege('authenticated', 'public.hr_claim_daily__ungated(text,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_daily__ungated(text,int)', 'execute') then
    raise exception 'daily-harvest-credit self-check (a): a client role can call the ungated body'; end if;
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform public.hr_create_character(0);
    v_offered := 'daily_harvest' = any (public.hr_daily_task_set(v_day))
              or 'daily_harvest' = any (public.hr_daily_task_set_for(v_day, v_uid, 0));
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'ev:harvest', v_day, 5, 'active');
    v_r := public.hr_claim_daily__ungated('daily_harvest', 0);
    if v_offered and v_r->>'error' is distinct from 'incomplete' then
      raise exception 'daily-harvest-credit self-check (b): 5 of 6 crops answered %', v_r; end if;
    if not v_offered and v_r->>'error' is distinct from 'not_offered' then
      raise exception 'daily-harvest-credit self-check (b): an undealt harvest quest answered %', v_r; end if;
    update public.player_progress set value = 6
     where user_id = v_uid and kind = 'daily' and key = 'ev:harvest' and period_key = v_day;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_claim_daily__ungated('daily_harvest', 0);
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = 0;
    if v_offered and (coalesce(v_r->>'ok', 'false') <> 'true' or v_g1 - v_g0 <> 300) then
      raise exception 'daily-harvest-credit self-check (c): 6 crops on a dealt day returned % and paid %', v_r, v_g1 - v_g0; end if;
    if v_offered then
      v_r := public.hr_claim_daily__ungated('daily_harvest', 0);
      if v_r->>'error' is distinct from 'already_claimed' then
        raise exception 'daily-harvest-credit self-check (c): a second claim answered %', v_r; end if;
    elsif v_g1 <> v_g0 then
      raise exception 'daily-harvest-credit self-check (c): an undealt quest paid % gold', v_g1 - v_g0; end if;
    raise exception using errcode = 'HR950', message = 'daily-harvest-credit §4 complete — rolling back';
  exception when sqlstate 'HR950' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'daily-harvest-credit self-check: §4 LEAKED a probe row'; end if;
  raise notice 'daily-harvest-credit self-check PASSED: the fixed arm, no client path, incomplete / paid once / already_claimed on a dealt day (not_offered and unpaid otherwise)';
end $$;
