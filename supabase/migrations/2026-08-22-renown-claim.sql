-- 2026-08-22-renown-claim.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply — this is the HIGHEST-VALUE money
--   surface in the reward program (a single claim pays up to 1,000,000 gold +
--   500 gems) AND renown is RANKABLE. A forged input here crosses into both an
--   economy and a ranking. The Coordinator applies it by hand via the
--   curl-from-file path as part of a coordinated deploy.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- The Renown rank-up payout (src/features/renown.js claimRank) is a client-
-- authored gold/gem grant. Under the gold arm its credit no-ops, so b411
-- DEFERRED the whole claim. This migration is the real fix: ONE SECURITY DEFINER
-- RPC that reads the SERVER-DERIVED renown score (hr_renown_of, 2026-08-20-renown.sql),
-- ratchets a SERVER HIGH-WATER, maps the high-water to a rank via a SERVER-OWNED
-- catalogue, and CREDITS the server-owned gold + gems into player_state,
-- once-guarded and journalled. NO client value determines the rank reached or
-- the amount paid — only the rank id + slot cross the wire.
--
-- ── THE SERVER HIGH-WATER — WHY, AND THE DESIGN DECISION ────────────────────
-- src/features/renown.js `effectiveRenown` holds `renownHigh`, a client-side
-- high-water mark, so that a term reading momentarily low (a not-yet-merged
-- slice, gold spent, a transport hiccup) can never DEMOTE a rank the player
-- earned. That ratchet MUST exist server-side too, or a claim would rest on a
-- transient live read: a rank reached yesterday could read `not_reached` today.
--
-- So this file adds `player_state.renown_high bigint not null default 0`,
-- advanced ONLY by the server, monotonically, via `greatest(renown_high, live)`
-- in ONE atomic statement inside this RPC. A rank is decided against
-- `renown_high`, never against the raw live score, so:
--   · a transient low hr_renown_of read cannot un-earn a rank (greatest() holds
--     the banked floor);
--   · a rank once reached stays claimable forever.
--
-- ⚠ SCOPE OF THE RATCHET, STATED HONESTLY (design decision, flagged not hidden).
--   The high-water is advanced HERE, at claim time — the moment the player acts
--   on a rank. It is NOT yet advanced on every accrual the way the client's
--   `effectiveRenown` is on every call. Consequence: a player who reaches a high
--   score but NEVER opens the Renown ladder, then later spends gold (the one
--   non-monotonic term), would see the server high-water lag the peak they
--   briefly held. That is an UNDER-grant (the safe direction — same rule as the
--   perk channel), never an over-grant, and it self-corrects the instant they
--   claim anything, because a claim ratchets to the live score first. Closing
--   the gap fully means advancing renown_high inside the accrual settle
--   (hr_apply / hr_perks_of), which is a heavier change to the repo's
--   highest-risk bodies and is the scheduled FOLLOW-UP. Recorded so it is
--   scheduled debt, not discovered debt.
--
-- ── THE AMOUNT + THRESHOLDS ARE SERVER-AUTHORITATIVE ───────────────────────
-- min + reward live in an embedded CASE catalogue kept in lockstep with
-- src/data/renown-ranks.js and src/features/renown.js RANKS by
-- tests/collection-renown-claim-drift.mjs. This is a SUPERSET of the four allXP
-- thresholds 2026-08-20-renown.sql already embeds (that file's fidelity note #1
-- names this reward extraction as its follow-up).
--
-- ── ONCE-GUARD ─────────────────────────────────────────────────────────────
-- The consume is an INSERT of a claim row into player_progress (kind='flag',
-- key='renown_claim:<rank_id>', period_key='', state='claimed') on the PK, ON
-- CONFLICT DO NOTHING; a replay's row_count=0 is refused BEFORE the credit.
-- kind='flag' is in hr_apply's progress allowlist; 'renown_claim:%' is not an
-- hr_unlocks id, so hr_unlock_guard passes the row untouched. Consume + credit +
-- journal are one transaction. gold_in/gems_in are ZERO (fixed once-ever server
-- reward, out of the accrual inflow budget). Journal kind='renown'.
--
-- ── RATE GATE ──────────────────────────────────────────────────────────────
-- The 'hr_claim_rank' bucket is added by the SIBLING 2026-08-22-collection-claim.sql
-- (which restates hr_rpc_gate with BOTH claim buckets, so this file does not
-- re-touch the gate). §0 FAILS CLOSED if that bucket is absent — i.e. if this is
-- applied before collection-claim.
--
-- REVERSIBILITY: drop hr_claim_rank / hr_claim_rank__ungated; the renown_high
-- column may be left in place harmlessly (it only advances, and nothing else
-- reads it yet). Additive.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_gate text;
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regprocedure('public.hr_renown_of(uuid,integer)') is null then
    raise exception 'hr_renown_of(uuid,int) not found — apply 2026-08-20-renown.sql first';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) not found — apply 2026-08-20-goal-reward-rpc-credit.sql first';
  end if;
  -- The 'renown' ledger kind is added by collection-claim's §2. Fail closed here
  -- if this is applied before it (else the journal insert would 23514).
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_ledger'::regclass
       and conname  = 'player_ledger_kind_check'
       and pg_get_constraintdef(oid) like '%''renown''%'
  ) then
    raise exception 'player_ledger.kind CHECK has no ''renown'' arm — apply '
                    '2026-08-22-collection-claim.sql (its §2 adds it) BEFORE this file.';
  end if;
  -- The 'hr_claim_rank' rate bucket is added by collection-claim's §3. A source
  -- scan with a positive control (the gate must at least mention hr_rate_ok).
  select prosrc into v_gate from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_rpc_gate';
  if v_gate is null or v_gate !~ 'hr_rate_ok' then
    raise exception 'hr_rpc_gate source scan is blind (hr_rate_ok absent) — cannot verify the bucket';
  end if;
  if v_gate !~ 'hr_claim_rank' then
    raise exception 'hr_rpc_gate has NO ''hr_claim_rank'' bucket — apply '
                    '2026-08-22-collection-claim.sql (its §3 adds both claim buckets) BEFORE this file.';
  end if;
end $$;

-- ── 1. THE SERVER-OWNED HIGH-WATER COLUMN (additive) ───────────────────────
-- Written ONLY by hr_claim_rank via greatest(); there is no client write policy
-- or grant on player_state (re-asserted in §self-check), so it is authoritative
-- and unforgeable. Monotonic by construction.
alter table public.player_state
  add column if not exists renown_high bigint not null default 0;

-- ── 2. hr_claim_rank__ungated(p_rank_id, p_slot) ───────────────────────────
create or replace function public.hr_claim_rank__ungated(p_rank_id text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot int := coalesce(p_slot, 0);
  v_min  bigint;
  v_gold bigint;
  v_gems int;
  v_live bigint;
  v_high bigint;
  v_rows int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/renown-ranks.js).
  -- peasant (min 0, no reward) is intentionally absent → unknown_rank.
  case p_rank_id
    when 'serf'     then v_min := 400;    v_gold := 250;     v_gems := 0;
    when 'squire'   then v_min := 900;    v_gold := 750;     v_gems := 0;
    when 'knight'   then v_min := 2200;   v_gold := 2000;    v_gems := 0;
    when 'baron'    then v_min := 4500;   v_gold := 5000;    v_gems := 25;
    when 'viscount' then v_min := 8000;   v_gold := 10000;   v_gems := 0;
    when 'count'    then v_min := 13500;  v_gold := 20000;   v_gems := 50;
    when 'marquis'  then v_min := 21000;  v_gold := 40000;   v_gems := 0;
    when 'duke'     then v_min := 32000;  v_gold := 75000;   v_gems := 100;
    when 'prince'   then v_min := 48000;  v_gold := 150000;  v_gems := 0;
    when 'king'     then v_min := 72000;  v_gold := 300000;  v_gems := 250;
    when 'highking' then v_min := 120000; v_gold := 1000000; v_gems := 500;
    else return jsonb_build_object('ok', false, 'error', 'unknown_rank', 'rank', p_rank_id);
  end case;

  -- ── THE RATCHET. Read the SERVER-DERIVED live score, then advance the
  --    high-water in ONE atomic read-modify-write. `greatest` means a transient
  --    low live read can NEVER lower it. No version bump on the pure advance, so
  --    it does not manufacture a version_conflict against a concurrent accrue.
  v_live := public.hr_renown_of(auth.uid(), v_slot);
  update public.player_state
     set renown_high = greatest(coalesce(renown_high, 0), coalesce(v_live, 0))
   where user_id = auth.uid() and slot = v_slot
   returning renown_high into v_high;

  -- DECIDE against the high-water, never the raw live score.
  if coalesce(v_high, 0) < v_min then
    return jsonb_build_object('ok', false, 'error', 'not_reached',
      'rank', p_rank_id, 'renown_high', coalesce(v_high, 0), 'min', v_min);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'flag', 'renown_claim:' || p_rank_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'rank', p_rank_id);
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
    (auth.uid(), v_slot, 'renown', 'rank_claim:' || p_rank_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('rank', p_rank_id, 'min', v_min, 'renown_high', v_high, 'gems', v_gems));

  return jsonb_build_object('ok', true, 'rank', p_rank_id, 'gold', v_gold, 'gems', v_gems,
    'renown_high', v_high, 'slot', v_slot, 'credited', true);
end $$;

-- ── 3. Gated wrapper + grants (revoke before grant) ────────────────────────
create or replace function public.hr_claim_rank(p_rank_id text, p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_claim_rank') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_claim_rank__ungated($1, $2);
end $w$;

revoke execute on function public.hr_claim_rank__ungated(text, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_claim_rank(text, int) from public, anon, authenticated, service_role;
grant execute on function public.hr_claim_rank(text, int) to authenticated;

-- ── 3b. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_claim_rank' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_claim_rank', 'p_rank_id text, p_slot integer', 'authenticated',
     'added 2026-08-22: server-verified renown rank gold+gems credit, server high-water (renown-claim)');
end $$;

-- ── 4. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them, including the ONE this
-- surface exists for: a transient low live read CANNOT un-earn a reached rank.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000cf-0000-0000-0000-0000000000cf';
  v_slot constant int  := 0;
  v_g0 bigint; v_g1 bigint; v_high0 bigint; v_high1 bigint; v_live bigint; v_led int;
begin
  -- (a) new arity exists; inner revoked from clients; wrapper authenticated-only.
  if to_regprocedure('public.hr_claim_rank(text,integer)') is null then
    raise exception 'GATE(a): hr_claim_rank did not install';
  end if;
  if has_function_privilege('authenticated', 'public.hr_claim_rank__ungated(text,integer)', 'execute') then
    raise exception 'GATE(a): the __ungated inner is client-executable — the gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_rank(text,integer)', 'execute') then
    raise exception 'GATE(a): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  if has_function_privilege('anon', 'public.hr_claim_rank(text,integer)', 'execute') then
    raise exception 'GATE(a): the claim wrapper is anon-executable';
  end if;

  -- (b) NO CLIENT WRITE SURFACE on player_state — renown_high / the score inputs
  --     are unforgeable. A client that could write player_state could forge the rank.
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='player_state' and cmd <> 'SELECT') then
    raise exception 'GATE(b): player_state grew a non-SELECT policy — renown_high is client-forgeable';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_state'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b): a client write grant exists on player_state — renown_high is client-forgeable';
  end if;

  -- (c) EXECUTED. Discarded subtxn → zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform public.hr_create_character(v_slot);
    -- Zero gold so goldLog contributes nothing and the live read is deterministic.
    update public.player_state set gold = 0, renown_high = 0 where user_id = v_uid and slot = v_slot;
    delete from public.player_progress where user_id = v_uid;

    -- unknown rank refused (peasant has no reward → also unknown_rank).
    v := public.hr_claim_rank__ungated('peasant', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'unknown_rank' then
      raise exception 'GATE(c): peasant/unknown rank not refused: %', v;
    end if;

    -- not_reached on a fresh low character (control): highking is far out of reach.
    v := public.hr_claim_rank__ungated('highking', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'not_reached' then
      raise exception 'GATE(c): an unreached rank was not refused: %', v;
    end if;

    -- Push the SERVER-DERIVED score high: +200000 kills × 0.05 = +10000 renown
    -- → viscount (8000) reached.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_any', 200000, '', 'active');
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_rank__ungated('viscount', v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c): viscount claim did not credit: %', v;
    end if;
    select gold, renown_high into v_g1, v_high0 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 - v_g0 <> 10000 then
      raise exception 'GATE(c): viscount credit was % gold, expected 10000', v_g1 - v_g0;
    end if;
    if v_high0 < 8000 then
      raise exception 'GATE(c): the high-water did not advance to the live score (got %)', v_high0;
    end if;

    -- ── THE LOAD-BEARING PROPERTY: a transient LOW live read cannot un-earn a
    --    rank. Delete the kill rows so the LIVE score collapses below Squire...
    delete from public.player_progress
      where user_id = v_uid and slot = v_slot and kind = 'stat' and key = 'ev:kill_any';
    v_live := public.hr_renown_of(v_uid, v_slot);
    if v_live >= 900 then
      raise exception 'GATE(c): CONTROL FAILED — live score is still % (>=900) after removing kills, '
                      'so the high-water test below would pass for the wrong reason', v_live;
    end if;
    -- ...and yet squire (900) is STILL claimable, because renown_high holds ~10000.
    v := public.hr_claim_rank__ungated('squire', v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c): squire was refused after a transient low read (% live) despite '
                      'renown_high — the server high-water is not holding: %', v_live, v;
    end if;
    -- the high-water NEVER decreased.
    select renown_high into v_high1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_high1 < v_high0 then
      raise exception 'GATE(c): renown_high DECREASED (% -> %) — the ratchet is not monotonic', v_high0, v_high1;
    end if;

    -- replay squire → refused, no re-credit.
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_rank__ungated('squire', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'already_claimed' then
      raise exception 'GATE(c): squire replay was not refused: %', v;
    end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_g1 <> v_g0 then
      raise exception 'GATE(c): squire replay RE-CREDITED (% -> %)', v_g0, v_g1;
    end if;

    -- highking STILL not reachable (10000 high-water < 120000) — the ratchet is a
    -- floor, not a free pass to every rank.
    v := public.hr_claim_rank__ungated('highking', v_slot);
    if v->>'ok' <> 'false' or v->>'error' <> 'not_reached' then
      raise exception 'GATE(c): highking was not refused at renown_high ~10000: %', v;
    end if;

    -- exactly two renown ledger rows (viscount + squire).
    select count(*) into v_led from public.player_ledger where user_id = v_uid and kind = 'renown';
    if v_led <> 2 then
      raise exception 'GATE(c): expected 2 renown ledger rows, found %', v_led;
    end if;

    raise exception using errcode = 'HR819', message = 'renown-claim §4 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_skills   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §4 LEAKED a probe row';
  end if;

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

  raise notice 'renown-claim: server high-water, grants, rank credit-once (gold+gems), replay-safe, '
               'unknown/not_reached refused, and a TRANSIENT LOW live read cannot un-earn a reached '
               'rank (the high-water holds); grant-hygiene all green';
end $$;
