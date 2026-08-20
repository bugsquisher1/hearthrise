-- 2026-08-20-goal-reward-rpc-credit.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- Tyler/the coordinator applies this by hand via the Supabase MCP (execute_sql,
-- wrapped in begin/commit) as part of a coordinated deploy. It ADDS two money-
-- surface RPCs and must pass Security review before authority moves. Read the
-- change contract in the PR body before applying.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- The DAILY-TASK payout (legacy.js updateDaily) and the QUEST payout
-- (legacy.js completeQuest) are client-authored gold grants. Under the gold arm
-- (clientMayWriteRecordField('gold') → false) their credit no-ops, so b411
-- DEFERRED the whole completion — the task/quest would sit un-completed forever.
-- This migration is the real fix: two SECURITY DEFINER RPCs that VERIFY
-- completion from the server's OWN progress counters (src/core/goals.js
-- `ev:<type>` rows the live-settle accrual already writes) and CREDIT the
-- server-owned gold into player_state, once-guarded and journalled. The client
-- calls the RPC and renders the returned/enveloped gold; it never authors it.
--
-- The amount is SERVER-AUTHORITATIVE: goal + gold live in an embedded catalogue
-- (kept in lockstep with src/data/goal-catalogue.js and legacy.js by
-- tests/goal-catalogue-drift.mjs). No client value crosses the wire except the
-- task/quest ID and the slot.
--
-- ── COMPLETION IS READ, NEVER TRUSTED ──────────────────────────────────────
--   QUEST  completion  := player_progress(kind='stat',  key=<checkKey>,
--                          period_key='')  .value >= goal
--   DAILY  completion  := player_progress(kind='daily', key='ev:'||type,
--                          period_key=hr_utc_day_key(now())) .value >= goal
-- These are the exact rows src/core/goals.js `goalProgressOps` writes through
-- hr_apply on every live settle and away accrual — the server listens to its
-- own counter, not to a client 'done' flag.
--
-- ── DAILY SELECTION IS SERVER-DERIVED FROM THE UTC DAY KEY ──────────────────
-- The client used to seed its 3-of-8 daily pick from `new Date().toDateString()`
-- (a LOCAL date). hr_daily_task_set reproduces legacy.js dailyTaskIndexes
-- (FNV-1a seed + LCG Fisher-Yates) over the UTC day key, so the server owns the
-- offered SET and refuses a claim for a task not offered today (not_offered).
-- The client is changed in the same commit to seed from the UTC day key too, so
-- the two agree. The port is asserted byte-identical to the JS in §8 and by
-- tests/goal-catalogue-drift.mjs over a date sweep.
--
-- ── ONCE-GUARD (no double credit) ──────────────────────────────────────────
-- The consume is an INSERT of a claim row into player_progress with state
-- 'claimed', on the PK (user_id, slot, kind, key, period_key), ON CONFLICT DO
-- NOTHING; a replay's row_count=0 is refused BEFORE the credit. Consume + credit
-- + journal are one function/transaction, so they commit or roll back together —
-- no window in which the slot is spent but gold unpaid, no path that pays twice.
-- kind='quest' key=<quest_id> is the quest claim namespace goals.js reserves for
-- the LIFECYCLE (deliberately never written by the accrual engine); kind='daily'
-- key=<task_id> period=<day> is distinct from the counter key 'ev:<type>'.
--
-- ── SCOPE: GOLD ONLY ───────────────────────────────────────────────────────
-- These RPCs credit GOLD. A quest's item/combat-XP reward stays client-applied
-- (XP/inventory are later arming slices). Daily-task rewards are pure gold, so
-- they are fully server-owned here. gold_in is 0 (a fixed, once-per-period,
-- server-owned reward is kept OUT of the accrual inflow budget — same rule as
-- the muster/raid chest credit, 2026-08-19-muster-raid-rpc-credit.sql).
--
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Preconditions ───────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key(timestamptz) not found';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) not found';
  end if;
end $$;

-- ── 2. player_ledger.kind gains 'daily' (additive) ─────────────────────────
-- 'quest' is already allowed; 'daily' is new. Idempotent: only re-create the
-- CHECK if 'daily' is not already in it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_ledger'::regclass
       and conname  = 'player_ledger_kind_check'
       and pg_get_constraintdef(oid) like '%''daily''%'
  ) then
    alter table public.player_ledger drop constraint if exists player_ledger_kind_check;
    alter table public.player_ledger add constraint player_ledger_kind_check
      check (kind = any (array['accrue','craft','gather','combat','farm','trade','shop',
                               'quest','equip','admin','iap','clan','raid','enchant','daily']));
  end if;
end $$;

-- ── 3. hr_rpc_gate gains two low-frequency buckets ─────────────────────────
-- Claims are a handful per day; 12/min is generous. Re-created verbatim from
-- production with 'hr_claim_quest'/'hr_claim_daily' added to the 12-limit arm.
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle'
      then v_limit := 60;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    else return false;
  end case;

  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $function$;

-- ── 4. The daily selection — hr_daily_task_set(day_key) → top-3 task ids ────
-- A faithful port of src/legacy.js `dailySeed` (FNV-1a, Math.imul semantics)
-- and `dailyTaskIndexes` (LCG Fisher-Yates). IMMUTABLE: same day → same set.
-- Asserted byte-identical to the JS in §8 and by the drift test.
create or replace function public.hr_goal_daily_seed(p_str text)
returns bigint language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_h   bigint := 2166136261;   -- 0x811c9dc5
  v_i   int;
  c_mask constant bigint := 4294967295;   -- 0xFFFFFFFF (>>>0)
begin
  if p_str is null then return v_h; end if;
  for v_i in 1..length(p_str) loop
    v_h := ((v_h # ascii(substr(p_str, v_i, 1))) * 16777619) & c_mask;   -- 0x01000193
  end loop;
  return v_h;
end $$;

create or replace function public.hr_daily_task_set(p_day_key text)
returns text[] language plpgsql immutable set search_path = public, pg_catalog as $$
declare
  -- MUST equal src/data/goal-catalogue.js DAILY_TASK_POOL_ORDER and the authored
  -- order of legacy.js DAILY_TASK_POOL (drift test binds all three).
  c_pool constant text[] := array['daily_kill','daily_kill_big','daily_gather',
    'daily_gather_big','daily_harvest','daily_cook','daily_smith','daily_craft'];
  c_mask constant bigint := 4294967295;
  v_seed bigint := public.hr_goal_daily_seed(p_day_key);
  v_idx  int[]  := array[0,1,2,3,4,5,6,7];   -- 1-based positions hold values 0..7
  v_i    int; v_j int; v_tmp int;
  v_out  text[] := '{}';
  k      int;
begin
  for v_i in reverse 7..1 loop                       -- JS: for i = len-1; i>0; i--
    v_seed := ((v_seed * 1664525) + 1013904223) & c_mask;
    v_j := (v_seed % (v_i + 1))::int;                -- j in [0, v_i]
    v_tmp := v_idx[v_i + 1];
    v_idx[v_i + 1] := v_idx[v_j + 1];
    v_idx[v_j + 1] := v_tmp;
  end loop;
  for k in 1..3 loop                                 -- the base 3 offered
    v_out := v_out || c_pool[v_idx[k] + 1];
  end loop;
  return v_out;
end $$;

-- ── 5. hr_claim_quest__ungated(p_quest_id, p_slot) ─────────────────────────
create or replace function public.hr_claim_quest__ungated(p_quest_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_key    text;   -- the ev:<type> counter to verify
  v_goal   bigint;
  v_gold   bigint;
  v_have   bigint;
  v_rows   int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- Credit target must be one of the caller's own characters (before any consume).
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/goal-catalogue.js).
  case p_quest_id
    when 'gatherer'    then v_key := 'ev:gather';   v_goal := 15; v_gold := 150;
    when 'first_cook'  then v_key := 'ev:cooked';   v_goal := 5;  v_gold := 200;
    when 'first_blood' then v_key := 'ev:kill_any'; v_goal := 5;  v_gold := 150;
    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 10; v_gold := 500;
    else return jsonb_build_object('ok', false, 'error', 'unknown_quest', 'quest', p_quest_id);
  end case;

  -- VERIFY completion from the server's OWN lifetime counter.
  select value into v_have from public.player_progress
   where user_id = auth.uid() and slot = v_slot
     and kind = 'stat' and key = v_key and period_key = '';
  if coalesce(v_have, 0) < v_goal then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'quest', p_quest_id, 'have', coalesce(v_have, 0), 'goal', v_goal);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'quest', p_quest_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'quest', p_quest_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold, version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'quest', 'quest_claim:' || p_quest_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('quest', p_quest_id, 'goal', v_goal, 'check_key', v_key));

  return jsonb_build_object('ok', true, 'quest', p_quest_id, 'gold', v_gold,
    'slot', v_slot, 'credited', true);
end $$;

-- ── 6. hr_claim_daily__ungated(p_task_id, p_slot) ──────────────────────────
create or replace function public.hr_claim_daily__ungated(p_task_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_day    text := public.hr_utc_day_key(now());
  v_set    text[];
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

  -- SERVER-DERIVED offered set for TODAY (base 3). A task not offered is refused
  -- (blocks cherry-picking richer unoffered tasks). The King's 4th slot is NOT
  -- in the base set and lands here as not_offered — see goal-catalogue.js.
  v_set := public.hr_daily_task_set(v_day);
  if not (p_task_id = any (v_set)) then
    return jsonb_build_object('ok', false, 'error', 'not_offered',
      'task', p_task_id, 'day_key', v_day, 'offered', to_jsonb(v_set));
  end if;

  -- SERVER-OWNED CATALOGUE (FIXED tasks only; daily_harvest is dynamic → blocked).
  case p_task_id
    when 'daily_kill'       then v_type := 'kill_any'; v_goal := 25;  v_gold := 500;
    when 'daily_kill_big'   then v_type := 'kill_any'; v_goal := 60;  v_gold := 900;
    when 'daily_gather'     then v_type := 'gather';   v_goal := 50;  v_gold := 400;
    when 'daily_gather_big' then v_type := 'gather';   v_goal := 120; v_gold := 800;
    when 'daily_cook'       then v_type := 'cooked';   v_goal := 12;  v_gold := 400;
    when 'daily_smith'      then v_type := 'smithed';  v_goal := 8;   v_gold := 450;
    when 'daily_craft'      then v_type := 'crafted';  v_goal := 8;   v_gold := 450;
    when 'daily_harvest'    then
      return jsonb_build_object('ok', false, 'error', 'not_creditable',
        'task', p_task_id, 'reason', 'dynamic goal (farm plot cap) — no server model yet');
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
end $$;

-- ── 7. Gated wrappers + grants (revoke before grant) ───────────────────────
create or replace function public.hr_claim_quest(p_quest_id text, p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_claim_quest') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_claim_quest__ungated($1, $2);
end $w$;

create or replace function public.hr_claim_daily(p_task_id text, p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_claim_daily') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_claim_daily__ungated($1, $2);
end $w$;

revoke execute on function public.hr_claim_quest__ungated(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_daily__ungated(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_quest(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_daily(text, int) from public, anon, authenticated, service_role;
grant execute on function public.hr_claim_quest(text, int) to authenticated;
grant execute on function public.hr_claim_daily(text, int) to authenticated;

-- ── 7b. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname in ('hr_claim_quest','hr_claim_daily') and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_claim_quest', 'p_quest_id text, p_slot integer', 'authenticated',
     'added 2026-08-20: server-verified quest gold credit (goal-reward-rpc-credit)'),
    ('hr_claim_daily', 'p_task_id text, p_slot integer', 'authenticated',
     'added 2026-08-20: server-verified daily-task gold credit (goal-reward-rpc-credit)');
end $$;

-- ── 8. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. apply is atomic, so a
-- raise here reverts everything above it. Row-writing probes live in an HR819-
-- discarded subtransaction (player_ledger's retention guard refuses to DELETE a
-- fresh row, so the subtxn rollback is the only clean teardown — same shape as
-- 2026-08-19-muster-raid-rpc-credit §8).
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000ad-0000-0000-0000-0000000000ad';
  v_slot constant int  := 0;
  v_day  text := public.hr_utc_day_key(now());
  v_g0 bigint; v_g1 bigint; v_g2 bigint; v_led int;
  v_task text;   -- a creditable task guaranteed to be in TODAY's offered set
begin
  -- (a) selection port is byte-identical to the JS reference (fixed day key).
  if public.hr_daily_task_set('2026-8-20')
     is distinct from array['daily_gather_big','daily_cook','daily_kill_big'] then
    raise exception 'GATE(a): hr_daily_task_set drifted from the JS reference: %',
      public.hr_daily_task_set('2026-8-20');
  end if;

  -- (b) new arities exist; inners revoked from clients; wrappers authenticated-only.
  if to_regprocedure('public.hr_claim_quest(text,integer)') is null
     or to_regprocedure('public.hr_claim_daily(text,integer)') is null then
    raise exception 'GATE(b): the claim wrappers did not install';
  end if;
  if has_function_privilege('authenticated', 'public.hr_claim_quest__ungated(text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_claim_daily__ungated(text,integer)', 'execute') then
    raise exception 'GATE(b): an __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_quest(text,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_claim_daily(text,integer)', 'execute') then
    raise exception 'GATE(b): the wrappers are not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_quest(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_claim_daily(text,integer)', 'execute') then
    raise exception 'GATE(b): a claim wrapper is anon-executable';
  end if;

  -- (c)+(d) EXECUTED credit-once + refuse-incomplete + replay-zero, discarded subtxn.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;

    -- ── QUEST: incomplete is refused (no counter row yet).
    v := public.hr_claim_quest__ungated('gatherer', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' then
      raise exception 'GATE(c): an incomplete quest was not refused: %', v;
    end if;

    -- meet the goal, then claim once.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:gather', 20, '', 'active');
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_quest__ungated('gatherer', v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c): first quest claim did not credit: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 150 then
      raise exception 'GATE(c): quest credit was % gold, expected 150', v_g1 - v_g0;
    end if;
    -- replay refused, gold unchanged.
    v := public.hr_claim_quest__ungated('gatherer', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(c): quest replay was not refused: %', v;
    end if;
    select gold into v_g2 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g2 <> v_g1 then
      raise exception 'GATE(c): quest replay RE-CREDITED (% -> %)', v_g1, v_g2;
    end if;

    -- unknown quest refused.
    v := public.hr_claim_quest__ungated('no_such_quest', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'unknown_quest' then
      raise exception 'GATE(c): unknown quest not refused: %', v;
    end if;

    -- ── DAILY: pick a creditable task guaranteed offered today (skip harvest).
    v_task := null;
    if 'daily_kill'       = any (public.hr_daily_task_set(v_day)) then v_task := 'daily_kill';
    elsif 'daily_kill_big'   = any (public.hr_daily_task_set(v_day)) then v_task := 'daily_kill_big';
    elsif 'daily_gather'     = any (public.hr_daily_task_set(v_day)) then v_task := 'daily_gather';
    elsif 'daily_gather_big' = any (public.hr_daily_task_set(v_day)) then v_task := 'daily_gather_big';
    elsif 'daily_cook'       = any (public.hr_daily_task_set(v_day)) then v_task := 'daily_cook';
    elsif 'daily_smith'      = any (public.hr_daily_task_set(v_day)) then v_task := 'daily_smith';
    elsif 'daily_craft'      = any (public.hr_daily_task_set(v_day)) then v_task := 'daily_craft';
    end if;
    if v_task is null then
      raise exception 'GATE(d): no creditable daily task offered on % (set %) — cannot self-test',
        v_day, public.hr_daily_task_set(v_day);
    end if;

    -- a task NOT offered today is refused (use a fixed non-member or a blocked one).
    v := public.hr_claim_daily__ungated('definitely_not_a_task', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'not_offered' then
      raise exception 'GATE(d): an unoffered task was not refused: %', v;
    end if;

    -- incomplete daily refused, then meet the goal generously and claim once.
    v := public.hr_claim_daily__ungated(v_task, v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' then
      raise exception 'GATE(d): an incomplete daily was not refused: %', v;
    end if;
    -- the task's ev type — read it back from the RPC's incomplete report is not
    -- available; instead seed ALL six ev types high enough for any fixed goal.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state) values
      (v_uid, v_slot, 'daily', 'ev:kill_any', 1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:gather',   1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:cooked',   1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:smithed',  1000, v_day, 'active'),
      (v_uid, v_slot, 'daily', 'ev:crafted',  1000, v_day, 'active');
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_daily__ungated(v_task, v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(d): first daily claim did not credit: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 <= v_g0 then
      raise exception 'GATE(d): daily claim credited nothing (% -> %)', v_g0, v_g1;
    end if;
    -- replay refused, gold unchanged.
    v := public.hr_claim_daily__ungated(v_task, v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(d): daily replay was not refused: %', v;
    end if;
    select gold into v_g2 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g2 <> v_g1 then
      raise exception 'GATE(d): daily replay RE-CREDITED (% -> %)', v_g1, v_g2;
    end if;

    -- exactly two credit ledger rows (one quest, one daily).
    select count(*) into v_led from public.player_ledger
     where user_id = v_uid and kind in ('quest','daily');
    if v_led <> 2 then
      raise exception 'GATE: expected 2 claim ledger rows, found %', v_led;
    end if;

    raise exception using errcode = 'HR819', message = 'goal-reward-rpc-credit §8 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §8 LEAKED a probe row';
  end if;

  -- grant-hygiene clean after the additions.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(e): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(e): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'baseline_rows_no_longer_live') <> 0 then
        raise exception 'GATE(e): grant-hygiene reports baseline drift: %', v_gh->'baseline_rows_no_longer_live';
      end if;
    end;
  end if;

  raise notice 'goal-reward-rpc-credit: selection port, grants, quest+daily credit-once, replay-safe, unoffered/incomplete refused, grant-hygiene all green';
end $$;
