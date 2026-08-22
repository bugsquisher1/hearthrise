-- ============================================================================
-- 2026-08-26-marks-record.sql — BOUNTY MARKS become SERVER-OF-RECORD.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Money surface (it debits the server-owned
--     Bounty-Marks currency). SECURITY REVIEW REQUIRED before apply.
--
-- ⚠ GENERATED. The restated hr_state_of / hr_rpc_gate below are produced by
--   `node tools/derive-marks.mjs --write` from the CURRENT last toucher
--   (2026-08-25-workers.sql) and patched at named anchors. Do NOT hand-edit;
--   `--check` runs in the suite and will fail.
--
-- ── WHAT THIS DOES, AND WHY ─────────────────────────────────────────────────
-- The EARNING side of Bounty Marks moved server-side in 2026-08-23-bounty.sql
-- (player_state.marks + hr_claim_bounty credits it). What stayed client-authored:
--   (a) the marks BALANCE the client reads/displays (out of the save blob, not
--       player_state.marks);
--   (b) marks SPENDING — the reroll cost + the abandon fee, done as
--       `G.bountyHunter.marks -= cost` in src/legacy.js.
-- This migration closes (a) by PROJECTING marks in hr_state_of (so src/net/
-- record.js can read it as a scalar record, exactly like gold), and closes the
-- reroll/abandon half of (b) with ONE server-authoritative SPEND RPC.
--
-- ── THE SPEND RPC — hr_bounty_spend ─────────────────────────────────────────
--   reason 'reroll'  — cost is DERIVED SERVER-SIDE as 5 + N*5, where N is the
--                      count of PAID rerolls today read from the append-only
--                      player_ledger (the clan_deposit per-day pattern — no
--                      second counter to reset). Free rerolls never reach the
--                      server. Refuses insufficient_marks; marks can never go
--                      negative.
--   reason 'abandon' — fee = min(10, floor(reward_marks * 0.25)) when the Bounty-
--                      Hunter level >= 10, else 0. reward_marks is taken from the
--                      SERVER's own active_bounty.marks_reward when a row exists
--                      (cull bounties); for the non-cull types that have no server
--                      row the caller's value is used, CLAMPED. The fee is further
--                      clamped to the marks on hand.
--
-- ── SELF-ONLY RESIDUALS, STATED PLAINLY (bounded, journalled, documented) ────
-- Bounty Marks are NOT tradeable to another player — they buy self-only utility
-- unlocks (auto-eat, etc.). So the mandate property ("a forged client value cannot
-- cross into ANOTHER player's economy or ranking") holds regardless of these:
--   · the Bounty-Hunter LEVEL and the free-reroll allowance are still client
--     counters (BH xp is not yet server-owned); forging them affects only a
--     self-cost of <= 10 marks / a self-board refresh.
--   · the abandon reward_marks fallback for non-cull bounties is a clamped client
--     value. All three are bounded self-only, journalled, and tracked as arm
--     follow-ups (server-own BH level; move shop/upgrade marks spends).
--
-- ── IDEMPOTENCY + CONCURRENCY ───────────────────────────────────────────────
-- p_idem (uuid) is stored as a player_intents row; a replay returns the prior
-- result with replayed:true and re-debits nothing. The whole body runs under the
-- SAME per-character advisory lock hr_apply takes, so a spend cannot race an
-- accrual settle on one character (no read-modify-write across a network hop).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive. Reverting means re-applying 2026-08-25-workers.sql (restores
-- hr_state_of + hr_rpc_gate) and dropping hr_bounty_spend / __ungated. The marks
-- column and every credited value are untouched.
--
-- ⚠ THIS FILE IS NOW THE LAST TOUCHER OF hr_state_of AND hr_rpc_gate.
-- ============================================================================

-- ── 0. PRECONDITIONS + LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────────────
do $$
declare v_state text; v_gate text;
begin
  if to_regclass('public.player_state')  is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger') is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_intents')is null then raise exception 'player_intents missing'; end if;
  if to_regclass('public.active_bounty') is null then
    raise exception 'active_bounty missing — apply 2026-08-23-bounty.sql first'; end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key missing — apply 2026-08-08-clan-seat.sql first'; end if;
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state' and column_name='marks') <> 1 then
    raise exception 'player_state.marks missing — apply 2026-08-23-bounty.sql first'; end if;

  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_state_of';
  select prosrc into v_gate  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_rpc_gate';
  if v_state is null then raise exception 'hr_state_of missing'; end if;
  if v_gate  is null then raise exception 'hr_rpc_gate missing'; end if;
  -- The body we are about to REPLACE must be the workers body (its last toucher).
  if position('public.player_workers pw' in v_state) = 0 then
    raise exception 'LIVE hr_state_of is not the workers body — apply 2026-08-25-workers.sql first'; end if;
  if position('''farm_water''' in v_gate) = 0 or position('''worker_hire''' in v_gate) = 0 then
    raise exception 'LIVE hr_rpc_gate is not the farming-complete body (missing farm_water/worker buckets) — apply 2026-08-22-server-farming-complete.sql first'; end if;
  if position('''marks'', v_st.marks' in v_state) > 0 then
    raise notice 'marks already projected — this apply is a no-op replace'; end if;
end $$;

-- ── 1. hr_state_of — GENERATED. Do not hand-edit; see the header. ────────────
create or replace function public.hr_state_of(p_user uuid, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_st public.player_state%rowtype;
begin
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
      -- Bounty-Marks server-of-record slice: the marks currency the bounty
      -- turn-in (hr_claim_bounty) already credits into player_state.marks. Flat
      -- scalar beside gold/gems so src/net/record.js reads it the SAME way it
      -- reads gold — a moved-but-UNKNOWN marks balance renders a pending glyph,
      -- never a forgeable local number. Additive; nothing else changes.
      'marks', v_st.marks,
      'hearth_tokens', v_st.hearth_tokens,
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- worker-settlement slice: the hired crew's own accrual watermark. The
      -- accrual shell reads it as `st.workers_accrued_to` and settles
      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other
      -- watermarks, so a nested bag cannot hide a missing column behind a default.
      'workers_accrued_to', v_st.workers_accrued_to,
      -- AUTO-EAT. Flat keys rather than a nested object because the accrual
      -- shell reads them field by field off `st` and a nested bag would be one
      -- more place a `?? {}` could quietly turn a missing column into a
      -- default. `auto_eat_enabled` is the purchased-trait receipt.
      'auto_eat_enabled', v_st.auto_eat_enabled,
      'auto_eat_food', v_st.auto_eat_food,
      'auto_eat_pct', v_st.auto_eat_pct,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      'tool_carry', v_st.tool_carry,
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — `st.fight ?? null`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      'fight', v_st.fight,
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      'streak_days', v_st.streak_days,
      'streak_day_key', v_st.streak_day_key),
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp)))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- `{ <equip_slot>: <element> }`. Read here so the client renders it and the
    -- accrual shell builds `eq` from equipment + this (accrual.js weakness()),
    -- never from a client value. `{}` when nothing is enchanted.
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    -- worker-settlement slice: the hired crew, server-owned (player_workers, no
    -- client write policy). The accrual shell reads this as `env.workers` and
    -- settles each assigned worker; the client renders it and computes no yield.
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,
                                          'skill', skill, 'target_id', target_id,
                                          'xp', xp, 'acc_ms', acc_ms)
                       order by uid)
        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at)
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
         limit 1001) t),
    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────
      -- Also INCOMPLETE when the crew is non-empty AND its window is open
      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —
      -- a lagging read would be a false-positive that lets the flip delete a
      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.
      and (not exists (select 1 from public.player_workers pw
                        where pw.user_id = p_user and pw.slot = v_st.slot)
           or now() - v_st.workers_accrued_to < interval '60 seconds')
  );
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 2. hr_rpc_gate — GENERATED. Do not hand-edit; see the header. ────────────
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql security definer set search_path = 'public', 'pg_catalog' as $function$
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
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle',
         -- server-farming plant/harvest (slice 1) + water (this file). Ordinary
         -- player writes; an unknown bucket fails closed so all three live here.
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign'
      then v_limit := 60;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty',
         -- Bounty-Marks slice: the marks SPEND intent (reroll + abandon). Added
         -- HERE, the CURRENT last toucher of hr_rpc_gate, because an unknown
         -- bucket fails CLOSED — the RPC would 429 forever otherwise.
         'hr_bounty_spend'
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
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 3. hr_bounty_spend__ungated — the marks SPEND (reroll + abandon) ─────────
create or replace function public.hr_bounty_spend__ungated(
  p_slot int, p_reason text, p_bounty_level int, p_reward_marks bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_marks  bigint;
  v_cost   bigint;
  v_n      int;
  v_day    text;
  v_reward bigint;
  v_fee    bigint;
  v_prev   jsonb;
  v_intent text := 'bounty_spend:' || coalesce(p_reason, '');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_reason is null or p_reason not in ('reroll', 'abandon') then
    return jsonb_build_object('ok', false, 'error', 'bad_reason', 'reason', p_reason); end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'missing_idem'); end if;

  -- Serialise this character — the SAME advisory key hr_apply / hr_unlock_buy take,
  -- so a spend can never race an accrual settle on one character.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- IDEMPOTENCY: a completed spend with this idem re-debits nothing.
  select result into v_prev from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_prev is not null then return v_prev || jsonb_build_object('replayed', true); end if;

  select marks into v_marks from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot); end if;
  v_marks := coalesce(v_marks, 0);

  if p_reason = 'reroll' then
    -- COST DERIVED SERVER-SIDE from the append-only ledger: 5 + (paid rerolls
    -- today) * 5. Free rerolls never reach this RPC, so the count IS rerollsToday.
    v_day := public.hr_utc_day_key(now());
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = v_slot and kind = 'bounty'
       and intent = 'bounty_reroll' and public.hr_utc_day_key(at) = v_day;
    v_cost := 5 + v_n::bigint * 5;
    if v_marks < v_cost then
      return jsonb_build_object('ok', false, 'error', 'insufficient_marks', 'cost', v_cost, 'have', v_marks);
    end if;
    update public.player_state set marks = marks - v_cost, version = version + 1, updated_at = now()
      where user_id = v_uid and slot = v_slot;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, v_slot, 'bounty', 'bounty_reroll', 0, 0, 0, 0, 0,
        jsonb_build_object('marks', -v_cost, 'reroll_index', v_n, 'idem', p_idem));
    v_prev := jsonb_build_object('ok', true, 'reason', 'reroll', 'cost', v_cost,
                                 'marks', v_marks - v_cost, 'slot', v_slot);
  else
    -- ABANDON FEE. Below BH level 10 there is no fee. reward_marks comes from the
    -- SERVER's own active_bounty when present (cull); else the clamped client value.
    if coalesce(p_bounty_level, 0) < 10 then
      v_fee := 0;
    else
      select marks_reward into v_reward from public.active_bounty
        where user_id = v_uid and slot = v_slot;
      v_reward := coalesce(v_reward, greatest(0, least(coalesce(p_reward_marks, 0), 100000)));
      v_fee := least(10, floor(v_reward * 0.25))::bigint;
    end if;
    v_fee := least(greatest(v_fee, 0), v_marks);   -- clamped to available; never negative
    if v_fee > 0 then
      update public.player_state set marks = marks - v_fee, version = version + 1, updated_at = now()
        where user_id = v_uid and slot = v_slot;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
        values (v_uid, v_slot, 'bounty', 'bounty_abandon', 0, 0, 0, 0, 0,
          jsonb_build_object('marks', -v_fee, 'bounty_level', p_bounty_level, 'idem', p_idem));
    end if;
    v_prev := jsonb_build_object('ok', true, 'reason', 'abandon', 'fee', v_fee,
                                 'marks', v_marks - v_fee, 'slot', v_slot);
  end if;

  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, v_intent, v_prev, now())
    on conflict (user_id, intent_id) do nothing;
  return v_prev;
end $$;

-- ── 4. Gated wrapper + grants (revoke before grant) ─────────────────────────
create or replace function public.hr_bounty_spend(
  p_slot int, p_reason text, p_bounty_level int, p_reward_marks bigint, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_bounty_spend') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_bounty_spend__ungated($1, $2, $3, $4, $5);
end $w$;

revoke execute on function public.hr_bounty_spend__ungated(int,text,int,bigint,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_bounty_spend(int,text,int,bigint,uuid)           from public, anon, authenticated, service_role;
grant  execute on function public.hr_bounty_spend(int,text,int,bigint,uuid)           to authenticated;

-- ── 4b. Grant-hygiene baseline (if present) ─────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied'; return; end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_bounty_spend' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_bounty_spend', 'p_slot integer, p_reason text, p_bounty_level integer, p_reward_marks bigint, p_idem uuid',
     'authenticated', 'added 2026-08-26: server-authoritative Bounty-Marks spend (reroll cost + abandon fee)');
end $$;

-- ── 5. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
do $$
declare
  v      jsonb; v_st jsonb;
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000000000c0';
  v_slot constant int  := 0;
  v_i1 uuid; v_i2 uuid; v_i3 uuid; v_i4 uuid;
  v_m  bigint; v_state text; v_gate text;
begin
  -- (a) hr_state_of PROJECTS marks; hr_rpc_gate carries every existing bucket + marks.
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_state_of';
  select prosrc into v_gate from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_rpc_gate';
  if position('''marks'', v_st.marks' in v_state) = 0 then
    raise exception 'GATE(a): hr_state_of does not project marks'; end if;
  if position('public.player_workers pw' in v_state) = 0 then
    raise exception 'GATE(a): the marks restatement DROPPED the workers projection — chain broken'; end if;
  if position('''hr_bounty_spend''' in v_gate) = 0 then
    raise exception 'GATE(a): hr_rpc_gate does not admit hr_bounty_spend'; end if;
  if position('''worker_hire''' in v_gate) = 0 or position('''farm_water''' in v_gate) = 0 then
    raise exception 'GATE(a): the gate restatement DROPPED the worker/farm_water buckets — chain broken'; end if;

  -- (b) WRAPPER authenticated-only; the inner revoked from clients.
  if has_function_privilege('authenticated','public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)','execute') then
    raise exception 'GATE(b): the __ungated inner is client-executable — the gate is decoration'; end if;
  if not has_function_privilege('authenticated','public.hr_bounty_spend(int,text,int,bigint,uuid)','execute') then
    raise exception 'GATE(b): the wrapper is not callable by authenticated — the feature is dead'; end if;
  if has_function_privilege('anon','public.hr_bounty_spend(int,text,int,bigint,uuid)','execute') then
    raise exception 'GATE(b): the spend wrapper is anon-executable'; end if;

  -- (c) NO CLIENT WRITE on player_state.marks — RLS only, no non-SELECT grant.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_state'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(c): a client write grant exists on player_state — marks is client-forgeable'; end if;

  -- (d) EXECUTED behaviour — discarded subtxn, zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, v_slot, 0, 0, 100, 1)
      on conflict (user_id, slot) do update set marks = 100, version = 1;

    -- state_of returns marks.
    v_st := public.hr_state_of(v_uid, v_slot);
    if (v_st->'state'->>'marks')::bigint <> 100 then
      raise exception 'GATE(d): hr_state_of marks = % (expected 100)', v_st->'state'->>'marks'; end if;

    -- reroll #1: cost 5 (no prior). 100 -> 95.
    v_i1 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i1);
    if coalesce(v->>'ok','')<>'true' or (v->>'cost')::bigint<>5 or (v->>'marks')::bigint<>95 then
      raise exception 'GATE(d): reroll#1 wrong: %', v; end if;
    -- replay same idem: no re-debit.
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i1);
    if coalesce((v->>'replayed')::boolean,false) is not true then
      raise exception 'GATE(d): reroll replay not idempotent: %', v; end if;
    select marks into v_m from public.player_state where user_id=v_uid and slot=v_slot;
    if v_m <> 95 then raise exception 'GATE(d): replay re-debited (marks=%)', v_m; end if;

    -- reroll #2: cost escalates to 10 (one paid reroll today). 95 -> 85.
    v_i2 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i2);
    if (v->>'cost')::bigint<>10 or (v->>'marks')::bigint<>85 then
      raise exception 'GATE(d): reroll#2 cost did not escalate: %', v; end if;

    -- OVER-SPEND refused, marks unchanged. Drop to 3; next cost is 15.
    update public.player_state set marks = 3 where user_id=v_uid and slot=v_slot;
    v_i3 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'reroll', 0, 0, v_i3);
    if v->>'error' <> 'insufficient_marks' or (v->>'cost')::bigint<>15 then
      raise exception 'GATE(d): over-spend not refused: %', v; end if;
    select marks into v_m from public.player_state where user_id=v_uid and slot=v_slot;
    if v_m <> 3 then raise exception 'GATE(d): refused reroll still moved marks (marks=%)', v_m; end if;

    -- ABANDON fee. Refill to 100; BH level 10, active_bounty marks_reward 40 -> fee 10.
    update public.player_state set marks = 100 where user_id=v_uid and slot=v_slot;
    insert into public.active_bounty
      (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
       gold_reward, marks_reward, xp_reward)
      values (v_uid, v_slot, 'bx', 'cull', 'normal', 'goblin', 1, 100, 0, 100, 40, 45)
      on conflict (user_id, slot) do update set marks_reward = 40;
    v_i4 := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(v_slot, 'abandon', 10, 40, v_i4);
    if coalesce(v->>'ok','')<>'true' or (v->>'fee')::bigint<>10 or (v->>'marks')::bigint<>90 then
      raise exception 'GATE(d): abandon fee wrong: %', v; end if;

    -- BELOW level 10 => no fee.
    v := public.hr_bounty_spend__ungated(v_slot, 'abandon', 9, 40, gen_random_uuid());
    if (v->>'fee')::bigint <> 0 then raise exception 'GATE(d): sub-10 level charged a fee: %', v; end if;

    raise exception using errcode = 'HR819', message = 'marks §5 complete — rolling back';
  exception when sqlstate 'HR819' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state   where user_id=v_uid)
     or exists (select 1 from public.player_ledger where user_id=v_uid)
     or exists (select 1 from public.player_intents where user_id=v_uid)
     or exists (select 1 from public.active_bounty where user_id=v_uid)
     or exists (select 1 from auth.users where id=v_uid) then
    raise exception 'GATE: §5 LEAKED a probe row'; end if;

  raise notice 'marks: hr_state_of projects marks (workers projection intact), hr_rpc_gate admits '
               'hr_bounty_spend (worker buckets intact), spend wrapper authenticated-only, no client '
               'write on player_state, reroll cost escalates + refuses over-spend + idempotent, '
               'abandon fee gated on level>=10 — all green';
end $$;
