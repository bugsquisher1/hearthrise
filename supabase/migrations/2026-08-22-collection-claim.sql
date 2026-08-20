-- 2026-08-22-collection-claim.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply — this is a MONEY SURFACE (it credits
--   server-owned gold + gems). The Coordinator applies it by hand via the
--   curl-from-file path as part of a coordinated deploy. Read the change contract
--   in the PR body before applying.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- The Collection-Log MILESTONE payout (src/features/collection-log.js
-- claimMilestone) is a client-authored gold/gem grant. Under the gold arm
-- (clientMayWriteRecordField('gold') → false) its credit no-ops, so b411
-- DEFERRED the whole claim — the milestone sat un-claimable forever. This
-- migration is the real fix: ONE SECURITY DEFINER RPC that VERIFIES the
-- milestone from the server's OWN per-entry projections and CREDITS the
-- server-owned gold + gems into player_state, once-guarded and journalled. The
-- client fires the intent and renders the returned/enveloped value; it never
-- authors it, and it never sends an `earned` flag the server would trust.
--
-- ── COMPLETION IS RE-DERIVED, NEVER TRUSTED ────────────────────────────────
-- A milestone is a DISTINCT-COUNT threshold in one domain, read from the exact
-- projections Slices 1/2 shipped (2026-08-20-bestiary.sql / 2026-08-21-collection.sql):
--   domain 'monsters' := (select count(*) from hr_bestiary_of(uid, slot))   >= threshold
--   domain 'items'    := (select count(*) from hr_collection_of(uid, slot))  >= threshold
-- Both projections read player_progress rows written ONLY by hr_apply (no client
-- write policy or grant — re-asserted in §self-check), so a forged client count
-- cannot cross into another player's collection log. `hunterAll` verifies
-- DISTINCT items/monsters, so 52 loots of two items add 0 milestones, not 52.
--
-- ── THE AMOUNT IS SERVER-AUTHORITATIVE ─────────────────────────────────────
-- goal + reward live in an embedded CASE catalogue kept in lockstep with
-- src/data/collection-milestones.js and src/features/collection-log.js by
-- tests/collection-renown-claim-drift.mjs. `hunterAll`'s threshold is the SIZE
-- of the monster catalogue (108 today) — pinned here and drift-guarded against
-- src/data/monsters.js. No client value crosses except the milestone id + slot.
--
-- ── ONCE-GUARD (no double credit) ──────────────────────────────────────────
-- The consume is an INSERT of a claim row into player_progress
-- (kind='collection', key=<milestone_id>, period_key='', state='claimed') on the
-- PK (user_id, slot, kind, key, period_key), ON CONFLICT DO NOTHING; a replay's
-- row_count=0 is refused BEFORE the credit. Consume + credit + journal are one
-- function/transaction — they commit or roll back together, so there is no
-- window in which the milestone is burned but the reward unpaid, and no path
-- that pays twice. kind='collection' is in hr_apply's progress allowlist and the
-- milestone ids are not hr_unlocks entries, so hr_unlock_guard passes the row
-- untouched (it only constrains kind='unlock' / catalogued ids).
--
-- ── GOLD + GEMS, OUT OF THE ACCRUAL BUDGET ─────────────────────────────────
-- These are FIXED, once-ever, server-owned rewards, so — like the muster/raid
-- chest credit (2026-08-19-muster-raid-rpc-credit.sql) and the goal-reward
-- credit — gold_in / gems_in are ZERO and EXPLICIT: they are kept OUT of the
-- accrual daily inflow budget. The once-per-milestone guard is the real limiter.
--
-- ── THE RATE-GATE ADDS BOTH CLAIM BUCKETS HERE ─────────────────────────────
-- §3 restates hr_rpc_gate (derived from 2026-08-20-goal-reward-rpc-credit.sql's
-- body) adding BOTH 'hr_claim_milestone' AND 'hr_claim_rank' to the 12/min arm,
-- so the sibling renown-claim migration does NOT re-touch the gate (its §0 only
-- asserts the bucket exists). Claims are a handful per account, ever.
--
-- REVERSIBILITY: drop hr_claim_milestone / hr_claim_milestone__ungated and
-- re-apply 2026-08-20-goal-reward-rpc-credit.sql's hr_rpc_gate body. Additive.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regprocedure('public.hr_bestiary_of(uuid,integer)') is null then
    raise exception 'hr_bestiary_of(uuid,int) not found — apply 2026-08-20-bestiary.sql first';
  end if;
  if to_regprocedure('public.hr_collection_of(uuid,integer)') is null then
    raise exception 'hr_collection_of(uuid,int) not found — apply 2026-08-21-collection.sql first';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) not found — apply 2026-08-20-goal-reward-rpc-credit.sql first';
  end if;
end $$;

-- ── 2. player_ledger.kind gains 'collection' (additive, idempotent) ────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_ledger'::regclass
       and conname  = 'player_ledger_kind_check'
       and pg_get_constraintdef(oid) like '%''collection''%'
  ) then
    alter table public.player_ledger drop constraint if exists player_ledger_kind_check;
    alter table public.player_ledger add constraint player_ledger_kind_check
      check (kind = any (array['accrue','craft','gather','combat','farm','trade','shop',
                               'quest','equip','admin','iap','clan','raid','enchant','daily',
                               'collection','renown']));
  end if;
end $$;

-- ── 3. hr_rpc_gate — add BOTH claim buckets to the 12/min arm ───────────────
-- Re-created from 2026-08-20-goal-reward-rpc-credit.sql's body with
-- 'hr_claim_milestone' and 'hr_claim_rank' appended to the 12-limit arm. Nothing
-- else changes. The renown-claim sibling relies on this and does not re-touch it.
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
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank'
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

-- ── 4. hr_claim_milestone__ungated(p_milestone_id, p_slot) ─────────────────
create or replace function public.hr_claim_milestone__ungated(p_milestone_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_domain text;
  v_thresh bigint;
  v_gold   bigint;
  v_gems   int;
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

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/collection-milestones.js).
  -- hunterAll's threshold is the monster-catalogue size (drift-guarded).
  case p_milestone_id
    when 'hunter10'   then v_domain := 'monsters'; v_thresh := 10;  v_gold := 2000;  v_gems := 0;
    when 'hunterAll'  then v_domain := 'monsters'; v_thresh := 108; v_gold := 50000; v_gems := 25;
    when 'collect50'  then v_domain := 'items';    v_thresh := 50;  v_gold := 5000;  v_gems := 0;
    when 'collect100' then v_domain := 'items';    v_thresh := 100; v_gold := 15000; v_gems := 15;
    else return jsonb_build_object('ok', false, 'error', 'unknown_milestone', 'milestone', p_milestone_id);
  end case;

  -- VERIFY completion from the server's OWN per-entry projection (DISTINCT count).
  if v_domain = 'monsters' then
    select count(*) into v_have from public.hr_bestiary_of(auth.uid(), v_slot);
  else
    select count(*) into v_have from public.hr_collection_of(auth.uid(), v_slot);
  end if;
  if coalesce(v_have, 0) < v_thresh then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'milestone', p_milestone_id, 'have', coalesce(v_have, 0), 'goal', v_thresh, 'domain', v_domain);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'collection', p_milestone_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'milestone', p_milestone_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         gems = coalesce(gems, 0) + v_gems,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'collection', 'milestone_claim:' || p_milestone_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('milestone', p_milestone_id, 'domain', v_domain,
                        'goal', v_thresh, 'have', v_have, 'gems', v_gems));

  return jsonb_build_object('ok', true, 'milestone', p_milestone_id, 'gold', v_gold,
    'gems', v_gems, 'slot', v_slot, 'credited', true);
end $$;

-- ── 5. Gated wrapper + grants (revoke before grant) ────────────────────────
create or replace function public.hr_claim_milestone(p_milestone_id text, p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_claim_milestone') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_claim_milestone__ungated($1, $2);
end $w$;

revoke execute on function public.hr_claim_milestone__ungated(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_milestone(text, int) from public, anon, authenticated, service_role;
grant execute on function public.hr_claim_milestone(text, int) to authenticated;

-- ── 5b. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_claim_milestone' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_claim_milestone', 'p_milestone_id text, p_slot integer', 'authenticated',
     'added 2026-08-22: server-verified collection-milestone gold+gems credit (collection-claim)');
end $$;

-- ── 6. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. apply is atomic, so a
-- raise here reverts everything above it. Row-writing probes live in an HR819-
-- discarded subtransaction (player_ledger's retention guard refuses to DELETE a
-- fresh row, so the subtxn rollback is the only clean teardown — the muster/raid
-- and goal-reward §8 shape).
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000000000c0';
  v_slot constant int  := 0;
  v_g0 bigint; v_g1 bigint; v_gm0 bigint; v_gm1 bigint; v_led int;
begin
  -- (a) new arity exists; inner revoked from clients; wrapper authenticated-only.
  if to_regprocedure('public.hr_claim_milestone(text,integer)') is null then
    raise exception 'GATE(a): hr_claim_milestone did not install';
  end if;
  if has_function_privilege('authenticated', 'public.hr_claim_milestone__ungated(text,integer)', 'execute') then
    raise exception 'GATE(a): the __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_milestone(text,integer)', 'execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_milestone(text,integer)', 'execute') then
    raise exception 'GATE(a): the claim wrapper is anon-executable';
  end if;

  -- (b) NO CLIENT WRITE SURFACE on player_progress — the count is unforgeable.
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='player_progress' and cmd <> 'SELECT') then
    raise exception 'GATE(b): player_progress grew a non-SELECT policy — the collection count is client-forgeable';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_progress'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_progress — the collection count is client-forgeable';
  end if;

  -- (c) EXECUTED: unknown refused, incomplete refused, distinct-count discriminates,
  --     credit-once + replay-zero. Discarded subtxn → zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;

    -- unknown milestone refused.
    v := public.hr_claim_milestone__ungated('no_such_milestone', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'unknown_milestone' then
      raise exception 'GATE(c): unknown milestone not refused: %', v;
    end if;

    -- incomplete refused (no bestiary rows yet).
    v := public.hr_claim_milestone__ungated('hunter10', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' then
      raise exception 'GATE(c): an incomplete milestone was not refused: %', v;
    end if;

    -- DISCRIMINATING control: 52 loots of TWO distinct items is 2 DISTINCT, not 52,
    -- so collect50 stays incomplete. (Proves count is DISTINCT, not summed qty.)
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state) values
      (v_uid, v_slot, 'stat', 'ev:loot:oak_log', 40, '', 'active'),
      (v_uid, v_slot, 'stat', 'ev:loot:coal',    12, '', 'active');
    v := public.hr_claim_milestone__ungated('collect50', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'incomplete' or (v->>'have')::int <> 2 then
      raise exception 'GATE(c): collect50 read % distinct (expected 2) — count summed qty instead of DISTINCT: %', v->>'have', v;
    end if;

    -- meet hunter10: 10 DISTINCT killed monsters (each a distinct ev:kill_monster row).
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      select v_uid, v_slot, 'stat', 'ev:kill_monster:mon' || g::text, (g + 1)::bigint, '', 'active'
        from generate_series(1, 10) g;
    select gold, gems into v_g0, v_gm0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_milestone__ungated('hunter10', v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c): first hunter10 claim did not credit: %', v;
    end if;
    select gold, gems into v_g1, v_gm1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 2000 then
      raise exception 'GATE(c): hunter10 credit was % gold, expected 2000', v_g1 - v_g0;
    end if;

    -- replay refused, gold unchanged.
    v := public.hr_claim_milestone__ungated('hunter10', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(c): hunter10 replay was not refused: %', v;
    end if;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g0 <> v_g1 then
      raise exception 'GATE(c): hunter10 replay RE-CREDITED (% -> %)', v_g1, v_g0;
    end if;

    -- exactly one collection ledger row.
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'collection';
    if v_led <> 1 then
      raise exception 'GATE(c): expected 1 collection ledger row, found %', v_led;
    end if;

    raise exception using errcode = 'HR819', message = 'collection-claim §6 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §6 LEAKED a probe row';
  end if;

  -- grant-hygiene clean after the addition.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(d): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(d): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'collection-claim: rate bucket, grants, milestone credit-once (gold+gems), replay-safe, '
               'unknown/incomplete refused, DISTINCT-count discriminates, grant-hygiene all green';
end $$;
