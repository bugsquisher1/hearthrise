-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-04-bounty-abandon-server-fee.sql — THE ABANDON FEE IS THE SERVER'S.
-- MONEY MOVES IN THIS FILE (Bounty Marks).
--
-- LANE C. STAGED, NOT APPLIED. SECURITY GO REQUIRED (CLAUDE.md §2 — a currency
-- debit). The Coordinator applies it with tools/apply-migration.mjs (one file,
-- one implicit transaction: a raise anywhere below rolls the whole file back).
--
-- ── THE FINDING (Security, P2, CLAUDE.md §1 "never trust a client value") ───
-- hr_bounty_spend(p_slot, p_reason, p_bounty_level, p_reward_marks, p_idem)
-- (2026-08-26-marks-record.sql §3) priced the ABANDON fee off two numbers the
-- CLIENT sent:
--   · p_bounty_level < 10  =>  fee 0. Any caller sending 9 abandoned for free.
--   · no active_bounty row =>  the fee was floor(p_reward_marks * 0.25), a client
--     value clamped to [0, 100000] and then to 10 — the caller chose its price.
-- Neither was ever needed. The Bounty-Hunter level has been server-owned since
-- 2026-09-11-bounty-hunter-xp.sql (player_skills.bountyHunter, credited only by
-- hr_claim_bounty), and since the gold arm the board posts ONLY `cull`, the one
-- type with a server row (src/core/bounty.js BOUNTY_TURN_IN). And abandon never
-- ENDED the server contract: the active_bounty row survived, so hr_state_of kept
-- projecting a bounty the player had abandoned, and a second abandon paid twice.
--
-- ── THE CONTRACT (no back-compat — the beta was wiped; every caller moves in
--    this branch: src/net/goal-claim.js bountyReroll/bountyAbandon) ───────────
--   hr_bounty_spend(p_slot int, p_reason text, p_bounty_id text, p_idem uuid)
--     → jsonb.  authenticated only, rate bucket 'hr_bounty_spend' (unchanged).
--   reason 'reroll'   p_bounty_id must be NULL (a reroll names no contract).
--                     cost 5 + 5 x (paid rerolls today, from the ledger) — the
--                     2026-08-26 rule, byte-for-byte.
--   reason 'abandon'  p_bounty_id names the contract being abandoned: an
--                     IDENTITY SELECTOR, not a number — it can only pick the one
--                     row the server already holds for (auth.uid(), slot), and a
--                     mismatch is refused. It exists so a fire-and-forget abandon
--                     that lands AFTER the player's next accept cannot delete the
--                     NEW contract (compare-and-delete, never delete-whatever).
--                     fee = least(10, floor(active_bounty.marks_reward x 0.25))
--                     when hr_level_from_xp(player_skills.bountyHunter) >= 10,
--                     else 0; then clamped to the Marks on hand. The row is
--                     DELETED in the same transaction: the contract ends.
--   ok       {ok, reason:'reroll', cost, marks, slot}
--            {ok, reason:'abandon', fee, marks, bounty_id, bh_level, slot}
--            (+ replayed:true on a same-key retry; nothing moves twice)
--   refused  not_signed_in · bad_reason · missing_idem · bad_bounty_id ·
--            no_character · insufficient_marks · no_active_bounty ·
--            bounty_mismatch · intent_mismatch · rate_limited
--   Every refusal but not_signed_in (no user to file it under) is journalled
--   through hr_record_rejection — the rejections seam, aggregated per (user,
--   slot, day, code), never a row per call. intent_mismatch is filed by
--   hr_intent_replay itself; rate_limited by hr_rpc_gate.
--
-- ── SECURITY SURFACE, EXACTLY ───────────────────────────────────────────────
--   REMOVED  two client numbers that priced a debit (p_bounty_level,
--            p_reward_marks), and the 5-argument signature that carried them —
--            DROPPED, so a forged level cannot even resolve (§5 GATE(f)).
--   ADDED    one client TEXT, p_bounty_id: an equality filter on the caller's
--            own row (user_id = auth.uid() is not a parameter). It prices
--            nothing, crosses to no other player, and its worst case is the
--            caller refusing their own abandon.
--   SAME     wrapper → hr_rpc_gate('hr_bounty_spend') → __ungated; inner
--            callable by nobody; wrapper by authenticated only (revoke-before-
--            grant, asserted by EXECUTING has_function_privilege); hr_client_
--            rpc_baseline carries exactly the new identity; no table grant moves.
--   CLOSED   (Security GO-WITH-CHANGES, P2) the fee-skip by ACCEPTING over an
--            active contract: hr_accept_bounty__ungated upserted, replacing
--            the contract with no fee and no ledger row. §2b restates it to
--            refuse 'bounty_active' (journalled) — one contract at a time; it
--            ends only by claim or by this file's abandon.
--   Marks are self-only (they buy self utility; nothing tradeable), so even the
--   old defect never crossed players — it was a self-discount on a sink.
--
-- ── CONCURRENCY + IDEMPOTENCY ───────────────────────────────────────────────
-- The per-character advisory lock hr_apply takes, then (abandon) active_bounty
-- FOR UPDATE, then player_state FOR UPDATE — hr_claim_bounty's own order
-- (contract row, then wallet), so a racing claim and abandon serialise on the
-- contract row instead of deadlocking, and exactly one consumes the contract
-- (the loser answers no_active_bounty). p_idem through hr_intent_replay (intent +
-- slot compared); successes cache in player_intents, refusals cache nothing
-- (every client gesture mints a fresh key, the 2026-08-26 discipline).
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- One ledger row per abandon (a human gesture, 12/min ceiling) — now also for a
-- fee-0 abandon, because the row records a contract ending, which is what a
-- "my bounty vanished" dispute needs. ~200 B; a heavy player abandons a handful
-- a day. Refusals add no rows beyond the per-(user,slot,day,code) aggregate.
--
-- ── DEPLOY ORDER ────────────────────────────────────────────────────────────
-- The signature changes, so the client half (goal-claim.js) and this file must
-- land together: APPLY AT THE CUT, immediately before the client push. Between
-- the two, an old client's reroll/abandon answers rpc_missing — no value moves
-- (a reroll is a local board refresh; an abandon charges nothing), self-only.
-- NO EDGE REDEPLOY: supabase/functions/** never calls hr_bounty_spend.
--
-- ── AFTER APPLYING (Coordinator) ────────────────────────────────────────────
-- tests/live-hash-drift.baseline.json pins hr_bounty_spend__ungated by its OLD
-- identity; it will want the old signature retired and the new one measured:
-- node tests/live-hash-drift.mjs --live --write, why "2026-10-04-bounty-abandon-
-- server-fee.sql: signature (int,text,text,uuid); fee from active_bounty +
-- server BH level; abandon deletes the contract".
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop function public.hr_bounty_spend(int,text,text,uuid);
-- drop function public.hr_bounty_spend__ungated(int,text,text,uuid);
-- then re-run 2026-08-26-marks-record.sql §3, §4 and §4b ONLY (the 5-arg pair +
-- grants + baseline row) followed by 2026-09-03-intent-mismatch-class.sql §2
-- (re-entrant; it re-guards the restored body). NEVER re-apply 2026-08-26 whole:
-- its §1/§2 restate hr_state_of and hr_rpc_gate from August templates (the
-- b487 "everything refuses" class). Marks already debited stay debited; every
-- debit is reconstructible from player_ledger (kind='bounty').
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.active_bounty') is null then
    raise exception 'PRECONDITION: active_bounty is absent - apply 2026-08-23-bounty.sql FIRST'; end if;
  if to_regclass('public.player_skills') is null or to_regclass('public.player_ledger') is null
     or to_regclass('public.player_intents') is null or to_regclass('public.hr_rejections') is null then
    raise exception 'PRECONDITION: player_skills / player_ledger / player_intents / hr_rejections missing'; end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null or to_regclass('public.hr_xp_table') is null then
    raise exception 'PRECONDITION: hr_level_from_xp / hr_xp_table absent - the server BH level cannot be read'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'PRECONDITION: hr_intent_replay absent - apply 2026-09-03-intent-mismatch-class.sql FIRST'; end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'PRECONDITION: hr_record_rejection absent - refusals would go unjournalled'; end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'PRECONDITION: hr_utc_day_key absent - apply 2026-08-08-clan-seat.sql FIRST'; end if;
  if to_regprocedure('public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)') is null
     and to_regprocedure('public.hr_bounty_spend__ungated(int,text,text,uuid)') is null then
    raise exception 'PRECONDITION: hr_bounty_spend is absent - apply 2026-08-26-marks-record.sql FIRST'; end if;
  if position('''hr_bounty_spend''' in pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: hr_rpc_gate has no hr_bounty_spend bucket - the verb would answer rate_limited forever'; end if;
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: hr_client_rpc_baseline absent - the grant cannot be approved'; end if;
  -- §2b restates the accept body in full; every helper it calls must exist.
  if to_regprocedure('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)') is null
     or to_regprocedure('public.hr_bounty_difficulty_unlocked(text,integer)') is null
     or to_regprocedure('public.hr_bounty_kill_range(int,text)') is null
     or to_regprocedure('public.hr_bounty_first_contract(uuid,int)') is null
     or to_regprocedure('public.hr_bounty_first_contract_range(text)') is null
     or to_regprocedure('public.hr_bounty_reward(int,text,text)') is null
     or to_regprocedure('public.hr_bounty_kills(uuid,int,text)') is null
     or to_regprocedure('public.hr_bounty_combat_level(uuid,int)') is null
     or to_regprocedure('public.hr_bounty_unlocked_tier(int)') is null then
    raise exception 'PRECONDITION: the accept chain is incomplete - apply 2026-09-04-bounty-difficulty-count.sql and 2026-09-12-bounty-accept-bh-clamp.sql FIRST'; end if;
  if not exists (select 1 from public.hr_skills where skill_id = 'bountyHunter') then
    raise exception 'PRECONDITION: hr_skills has no bountyHunter row - the fee level would read an uncatalogued skill'; end if;
end $$;

-- ── 1. RETIRE THE 5-ARGUMENT SIGNATURE ─────────────────────────────────────
-- Dropped, not overloaded: an overload left behind is a second resolution
-- target that still believes the client's level. Wrapper first (it names the
-- inner only in its body, so no dependency blocks either order).
drop function if exists public.hr_bounty_spend(int, text, int, bigint, uuid);
drop function if exists public.hr_bounty_spend__ungated(int, text, int, bigint, uuid);

-- ── 2. hr_bounty_spend__ungated — reroll (unchanged) + abandon (server fee) ─
create or replace function public.hr_bounty_spend__ungated(
  p_slot int, p_reason text, p_bounty_id text, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_marks  bigint;
  v_cost   bigint;
  v_n      int;
  v_day    text;
  v_ab     public.active_bounty%rowtype;
  v_bh_lvl int;
  v_fee    bigint;
  v_prev   jsonb;
  v_intent text := 'bounty_spend:' || coalesce(p_reason, '');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_reason is null or p_reason not in ('reroll', 'abandon') then
    perform public.hr_record_rejection(v_uid, v_slot, 'bounty_spend', 'bad_reason',
      jsonb_build_object('reason', left(coalesce(p_reason, ''), 32)), 1);
    return jsonb_build_object('ok', false, 'error', 'bad_reason');
  end if;
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'missing_idem', '{}'::jsonb, 1);
    return jsonb_build_object('ok', false, 'error', 'missing_idem');
  end if;
  -- Each reason has ONE shape: a reroll names no contract, an abandon names
  -- exactly one. Refused before the lock — nothing to serialise.
  if (p_reason = 'reroll') <> (p_bounty_id is null) or length(coalesce(p_bounty_id, '')) > 64 then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'bad_bounty_id', '{}'::jsonb, 1);
    return jsonb_build_object('ok', false, 'error', 'bad_bounty_id');
  end if;

  -- Serialise this character — the SAME advisory key hr_apply takes.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_prev;
  if v_prev ->> 'error' = 'intent_mismatch' then return v_prev; end if;
  if v_prev is not null then return v_prev || jsonb_build_object('replayed', true); end if;

  -- LOCK ORDER IS THE CLAIM'S: contract row, THEN wallet. hr_claim_bounty__ungated
  -- locks active_bounty FOR UPDATE and then updates player_state, and the client
  -- fires that claim on a 12 s hold-retry while a full bar waits; taking the two
  -- in the opposite order here would let an Abandon click deadlock it. A reroll
  -- touches no contract and takes only the wallet.
  if p_reason = 'abandon' then
    select * into v_ab from public.active_bounty
      where user_id = v_uid and slot = v_slot for update;
  end if;

  select marks into v_marks from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'no_character', '{}'::jsonb, 1);
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;
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
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'insufficient_marks',
        jsonb_build_object('cost', v_cost, 'have', v_marks), 1);
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
    -- ABANDON. The contract is the server's row or it is nothing: no row, no
    -- abandon, no fee. Locked above, before the wallet (the claim's order).
    if v_ab.user_id is null then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'no_active_bounty', '{}'::jsonb, 1);
      return jsonb_build_object('ok', false, 'error', 'no_active_bounty', 'slot', v_slot);
    end if;
    if v_ab.bounty_id is distinct from p_bounty_id then
      -- The caller is abandoning a contract the server does not hold (a stale
      -- tab, or an abandon that lost the race to the next accept). Never delete
      -- the contract it did NOT name.
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'bounty_mismatch', '{}'::jsonb, 1);
      return jsonb_build_object('ok', false, 'error', 'bounty_mismatch', 'slot', v_slot);
    end if;

    -- THE FEE, from the server's own numbers only: the Bounty-Hunter level is
    -- player_skills.bountyHunter (credited only by hr_claim_bounty; absent row ->
    -- 0 xp -> level 1), the reward is the accepted contract's marks_reward.
    v_bh_lvl := public.hr_level_from_xp(coalesce((
      select xp from public.player_skills
       where user_id = v_uid and slot = v_slot and skill_id = 'bountyHunter'), 0));
    if v_bh_lvl < 10 then
      v_fee := 0;
    else
      v_fee := least(10, floor(v_ab.marks_reward * 0.25))::bigint;
    end if;
    v_fee := least(greatest(v_fee, 0), v_marks);   -- clamped to on-hand; never negative

    -- THE CONTRACT ENDS, under the lock we hold, in the same transaction as
    -- the debit. A second abandon finds no row; the envelope stops projecting it.
    delete from public.active_bounty where user_id = v_uid and slot = v_slot;
    update public.player_state set marks = marks - v_fee, version = version + 1, updated_at = now()
      where user_id = v_uid and slot = v_slot;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, v_slot, 'bounty', 'bounty_abandon', 0, 0, 0, 0, 0,
        jsonb_build_object('marks', -v_fee, 'bh_level', v_bh_lvl, 'bounty_id', v_ab.bounty_id,
          'target', v_ab.target, 'tier', v_ab.tier, 'marks_reward', v_ab.marks_reward, 'idem', p_idem));
    v_prev := jsonb_build_object('ok', true, 'reason', 'abandon', 'fee', v_fee,
                                 'marks', v_marks - v_fee, 'bounty_id', v_ab.bounty_id,
                                 'bh_level', v_bh_lvl, 'slot', v_slot);
  end if;

  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, v_intent, v_prev, now())
    on conflict (user_id, intent_id) do nothing;
  return v_prev;
end $$;

-- ── 2b. hr_accept_bounty__ungated — REFUSES OVER A HELD CONTRACT ───────────
-- Security GO-WITH-CHANGES (2026-10-04, P2, proven on a PGlite replay): the
-- chain-end accept upserted `on conflict (user_id, slot) do update`, so
-- accepting over an active contract replaced it — the abandon fee above was
-- skippable and no bounty_abandon row was written. RESTATED IN FULL from the
-- chain-end body (2026-08-29 first-contract + 2026-09-04 difficulty-count +
-- 2026-09-12 SA-048 splices, as installed after 2026-09-28-grant-hygiene-hr-
-- ops.sql) with exactly one delta: the upsert became lock + refuse
-- ('bounty_active', journalled through hr_record_rejection) + plain insert.
-- Signature, volatility, SECURITY DEFINER and search_path are unchanged;
-- `create or replace` keeps proacl and the revoke below re-asserts it.
-- REVERT (targeted create-or-replace, never a file re-apply): restate this
-- body with the lock + refusal removed and the 2026-08-23 upsert restored
-- (`on conflict (user_id, slot) do update set ...`, quoted in that file's §7).
create or replace function public.hr_accept_bounty__ungated(
  p_slot int, p_bounty_id text, p_target text, p_type text, p_difficulty text, p_required bigint)
returns jsonb language plpgsql security definer
set search_path to 'public' as $function$
declare
  v_slot     int := coalesce(p_slot, 0);
  v_tier     int;
  v_cl       int;
  v_maxtier  int;
  v_bh_lvl   int;
  v_kmin     bigint; v_kmax bigint;
  v_req      bigint;
  v_gold     bigint; v_marks int; v_xp int;
  v_baseline bigint;
  v_first    boolean;
  v_held     text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;
  -- ONLY 'cull' is server-verifiable (see header). proof/weapon/streak refused.
  if p_type is distinct from 'cull' then
    return jsonb_build_object('ok', false, 'error', 'type_not_server_verifiable', 'type', p_type);
  end if;
  -- ⚠ 'elite' is REFUSED at the server (Security ruling 2026-08-23): elite is never
  -- board-generated and is gated only by the client-owned Bounty-Hunter level, so every
  -- 'elite' reaching the server is forged — and it scales tradeable gold up to 1.75×.
  -- Durable fix (tracked): server-own the difficulty (server-derived board seed OR
  -- server-owned BH level with difficulty<=unlocked). The easy/normal/hard residual
  -- (<=1.53x) is a bounded, self-only, journalled residual accepted with that follow-up.
  if p_difficulty not in ('easy','normal','hard') then
    return jsonb_build_object('ok', false, 'error', 'bad_difficulty', 'difficulty', p_difficulty);
  end if;

  select tier into v_tier from public.hr_bounty_monsters where monster_id = p_target;
  if v_tier is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_monster', 'target', p_target);
  end if;

  -- SA-048 BH-LEVEL READ. The Bounty-Hunter level the SERVER owns
  -- (player_skills.bountyHunter.xp -> hr_level_from_xp). Absent row -> 0 xp -> level 1:
  -- FAIL CLOSED to the shallowest difficulty, never 'hard' because a read missed.
  v_bh_lvl := public.hr_level_from_xp(coalesce((
    select xp from public.player_skills
     where user_id = auth.uid() and slot = v_slot and skill_id = 'bountyHunter'), 0));

  -- SA-048 DIFFICULTY GATE. The board posts 'hard' only once 'streak' unlocks
  -- (BH>=15, generateBountyBoard slot 3); easy/normal are always board-legal and
  -- 'elite' is refused above. A forged 'hard' at BH<15 buys the 1.3x difficulty
  -- multiplier on the now-RANKED bountyHunter skill. This is the ONLY forgeable ranked
  -- gain: the target TIER is honestly gated by the combat level below (the board offers
  -- exactly unlockedTier(combatLevel); there is no board-tier min to enforce).
  if not public.hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl) then
    return jsonb_build_object('ok', false, 'error', 'difficulty_locked',
      'difficulty', p_difficulty, 'bounty_level', v_bh_lvl);
  end if;

  -- COMBAT-LEVEL GATE: the target's tier must be unlocked by the SERVER combat level.
  v_cl := public.hr_bounty_combat_level(auth.uid(), v_slot);
  v_maxtier := public.hr_bounty_unlocked_tier(v_cl);
  if v_tier > v_maxtier then
    return jsonb_build_object('ok', false, 'error', 'tier_locked',
      'tier', v_tier, 'unlocked_tier', v_maxtier, 'combat_level', v_cl);
  end if;

  -- b497 DESIGNER RULING: the DIFFICULTY scales the kill count, so the range
  -- the server clamps into is the one the client drew from. A tier-only range
  -- here would silently raise an honest 72-kill EASY contract to 80.
  select kmin, kmax into v_kmin, v_kmax
    from public.hr_bounty_kill_range(v_tier, p_difficulty);
  -- FAIL CLOSED. No row (unknown difficulty) or a null bound (unknown tier)
  -- used to fall through least/greatest into a NOT NULL violation — a 500 that
  -- reads as "the server is down". A machine code is the honest answer.
  if v_kmin is null or v_kmax is null then
    return jsonb_build_object('ok', false, 'error', 'bad_difficulty',
      'difficulty', p_difficulty, 'tier', v_tier);
  end if;
  -- THE FIRST-CONTRACT FLOOR. Tier 1 only, floor only — see the header for why
  -- kmax must NOT move with it.
  v_first := (v_tier = 1) and public.hr_bounty_first_contract(auth.uid(), v_slot);
  if v_first then
    -- SCALED TOO. The board's first slot is always EASY, so an unscaled floor
    -- of 15 would raise the client's honest round(15*0.9)=14 to 15.
    select kmin into v_kmin from public.hr_bounty_first_contract_range(p_difficulty);
  end if;
  v_req := least(v_kmax, greatest(v_kmin, coalesce(p_required, v_kmin)));

  select gold, marks, xp into v_gold, v_marks, v_xp
    from public.hr_bounty_reward(v_tier, 'cull', p_difficulty);

  v_baseline := public.hr_bounty_kills(auth.uid(), v_slot, p_target);

  -- 2026-10-04 (Security, P2): ONE CONTRACT AT A TIME, ENFORCED HERE. This was
  -- an upsert that REPLACED an active contract, so "accept over the old one" was
  -- an abandon that skipped hr_bounty_spend: no fee, no bounty_abandon ledger
  -- row. Now a held contract is REFUSED (bounty_active) and the only ways a
  -- contract ends are claim (hr_claim_bounty) and abandon (hr_bounty_spend).
  -- The per-character advisory lock (hr_apply's key; abandon takes it too) plus
  -- FOR UPDATE on the row make check-then-insert atomic against a racing accept
  -- or abandon; the insert carries NO on-conflict arm, so a row that appeared
  -- anyway raises instead of being silently replaced.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || v_slot::text, 0));
  select bounty_id into v_held from public.active_bounty
    where user_id = auth.uid() and slot = v_slot for update;
  if found then
    perform public.hr_record_rejection(auth.uid(), v_slot, 'hr_accept_bounty', 'bounty_active',
      jsonb_build_object('target', left(coalesce(p_target, ''), 32)), 1);
    return jsonb_build_object('ok', false, 'error', 'bounty_active',
      'bounty_id', v_held, 'slot', v_slot);
  end if;
  insert into public.active_bounty
    (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
     gold_reward, marks_reward, xp_reward, accepted_at)
  values
    (auth.uid(), v_slot, coalesce(p_bounty_id,''), 'cull', p_difficulty, p_target, v_tier, v_req,
     v_baseline, v_gold, v_marks, v_xp, now());

  return jsonb_build_object('ok', true, 'bounty_id', coalesce(p_bounty_id,''),
    'target', p_target, 'tier', v_tier, 'required', v_req, 'baseline', v_baseline,
    'gold', v_gold, 'marks', v_marks, 'xp', v_xp, 'slot', v_slot, 'first_contract', v_first);
end $function$;

revoke execute on function public.hr_accept_bounty__ungated(int, text, text, text, text, bigint)
  from public, anon, authenticated, service_role;

-- ── 3. Gated wrapper + grants (revoke before grant) ─────────────────────────
create or replace function public.hr_bounty_spend(
  p_slot int, p_reason text, p_bounty_id text, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_bounty_spend') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_bounty_spend__ungated($1, $2, $3, $4);
end $w$;

revoke execute on function public.hr_bounty_spend__ungated(int, text, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_bounty_spend(int, text, text, uuid)           from public, anon, authenticated, service_role;
grant  execute on function public.hr_bounty_spend(int, text, text, uuid)           to authenticated;

-- ── 4. Grant-hygiene baseline — exactly the new identity ────────────────────
delete from public.hr_client_rpc_baseline where proname = 'hr_bounty_spend';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_bounty_spend', 'p_slot integer, p_reason text, p_bounty_id text, p_idem uuid', 'authenticated',
   '2026-10-04: Bounty-Marks spend; abandon fee from active_bounty + server BH level (was 2026-08-26 5-arg, client level/reward)');

-- ── 5. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) — EXECUTED ─────────────────
do $$
declare
  v       jsonb;
  v_src   text;
  v_h     jsonb;
  v_m     bigint;
  v_ver   bigint;
  v_i     uuid;
  v_lv15  bigint;
  v_lv9   bigint;
  v_role  text;
  v_raised boolean;
  v_t1    text;
  v_uid   constant uuid := '000000c0-0000-0000-0000-0000b0a4d0f1';
begin
  -- (a) EXACTLY ONE OVERLOAD OF EACH, AND IT CARRIES NO NUMBER FROM THE CLIENT.
  if to_regprocedure('public.hr_bounty_spend(int,text,int,bigint,uuid)') is not null
     or to_regprocedure('public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)') is not null then
    raise exception 'GATE(a): the 5-argument signature survived - a forged Bounty-Hunter level still resolves'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('hr_bounty_spend', 'hr_bounty_spend__ungated')) <> 2
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname in ('hr_bounty_spend', 'hr_bounty_spend__ungated')
                   and pg_get_function_identity_arguments(p.oid)
                       <> 'p_slot integer, p_reason text, p_bounty_id text, p_idem uuid') then
    raise exception 'GATE(a): hr_bounty_spend carries an overload or an argument beyond (p_slot, p_reason, p_bounty_id, p_idem)'; end if;
  v_src := replace(pg_get_functiondef('public.hr_bounty_spend__ungated(int,text,text,uuid)'::regprocedure), chr(13), '');
  if v_src ~ '(p_bounty_level|p_reward_marks)' then
    raise exception 'GATE(a): the body still names a retired client parameter'; end if;
  if position('hr_level_from_xp' in v_src) = 0 or position('''bountyHunter''' in v_src) = 0
     or position('v_ab.marks_reward' in v_src) = 0 then
    raise exception 'GATE(a): the fee is not read from player_skills.bountyHunter + active_bounty.marks_reward'; end if;
  -- (a2) THE INTENT GUARD IS THERE EXACTLY ONCE, AND NO DIRECT CACHE READ SURVIVES
  --      (the 2026-09-03 class, kept on a body it did not patch).
  if (length(v_src) - length(replace(v_src, 'hr_intent_replay(', ''))) / length('hr_intent_replay(') <> 1
     or v_src ~* 'from[[:space:]]+public\.player_intents' then
    raise exception 'GATE(a2): the intent-mismatch guard is missing or bypassed'; end if;

  -- (a3) THE ACCEPT CANNOT REPLACE A CONTRACT: no on-conflict arm survives in
  --      its body, and it is still callable by no client role.
  v_src := replace(pg_get_functiondef('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)'::regprocedure), chr(13), '');
  if v_src ~* 'on[[:space:]]+conflict' or position('''bounty_active''' in v_src) = 0 then
    raise exception 'GATE(a3): hr_accept_bounty__ungated can still replace a held contract (upsert) or lost its bounty_active refusal'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)', 'execute') then
      raise exception 'GATE(a3): % can call the UNGATED accept', v_role; end if;
  end loop;

  -- (b) PRIVILEGES, EXECUTED. Inner: nobody. Wrapper: authenticated only.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_bounty_spend__ungated(int,text,text,uuid)', 'execute') then
      raise exception 'GATE(b): % can call the UNGATED body - the rate gate is decoration', v_role; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and has_function_privilege('hr_engine', 'public.hr_bounty_spend__ungated(int,text,text,uuid)', 'execute') then
    raise exception 'GATE(b): hr_engine can call the ungated body'; end if;
  if not has_function_privilege('authenticated', 'public.hr_bounty_spend(int,text,text,uuid)', 'execute') then
    raise exception 'GATE(b): authenticated cannot call the wrapper - the verb ships dead'; end if;
  if has_function_privilege('anon', 'public.hr_bounty_spend(int,text,text,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_bounty_spend(int,text,text,uuid)', 'execute') then
    raise exception 'GATE(b): the wrapper is executable beyond authenticated'; end if;
  if position('hr_rpc_gate(''hr_bounty_spend'')' in
       pg_get_functiondef('public.hr_bounty_spend(int,text,text,uuid)'::regprocedure)) = 0 then
    raise exception 'GATE(b): the wrapper does not pass through the hr_bounty_spend rate bucket'; end if;
  if (select count(*) from public.hr_client_rpc_baseline where proname = 'hr_bounty_spend') <> 1
     or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_bounty_spend'
                     and identity_args = 'p_slot integer, p_reason text, p_bounty_id text, p_idem uuid'
                     and grantee = 'authenticated') then
    raise exception 'GATE(b): hr_client_rpc_baseline does not approve exactly the new identity'; end if;
  -- (b2) THE FEE'S INPUTS ARE NOT CLIENT-WRITABLE.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_skills', 'insert,update,delete')
       or has_table_privilege(v_role, 'public.active_bounty', 'insert,update,delete')
       or has_table_privilege(v_role, 'public.player_state', 'insert,update,delete') then
      raise exception 'GATE(b2): % can write a table the fee is priced from', v_role; end if;
  end loop;

  -- (f) A FORGED LEVEL CANNOT EVEN BE SENT: the old call shape does not resolve.
  v_raised := false;
  begin
    execute 'select public.hr_bounty_spend__ungated(0, ''abandon'', 9, 40::bigint, gen_random_uuid())';
  exception when undefined_function then v_raised := true;
  end;
  if not v_raised then
    raise exception 'GATE(f): a (slot, reason, level, reward, idem) call still resolves'; end if;

  select xp into v_lv15 from public.hr_xp_table where level = 15;
  select xp into v_lv9  from public.hr_xp_table where level = 9;
  if v_lv15 is null or v_lv9 is null
     or public.hr_level_from_xp(v_lv15) < 10 or public.hr_level_from_xp(v_lv9) >= 10 then
    raise exception 'GATE CANNOT RUN: hr_xp_table does not straddle level 10 (lv15 xp %, lv9 xp %)', v_lv15, v_lv9; end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HR962 ───────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, 0, 0, 0, 100, 1);
    -- The probe is a Bounty Hunter at level 15: the fee applies.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, 'bountyHunter', v_lv15);
    insert into public.active_bounty
      (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
       gold_reward, marks_reward, xp_reward)
      values (v_uid, 0, 'bx-honest', 'cull', 'normal', 'goblin', 1, 100, 0, 100, 40, 45);

    -- (c1) NO ABANDON OF A CONTRACT THE SERVER DOES NOT HOLD: wrong id refused,
    --      nothing moves, the real contract survives, the refusal is journalled.
    v := public.hr_bounty_spend__ungated(0, 'abandon', 'bx-forged', gen_random_uuid());
    if coalesce(v->>'error', '') <> 'bounty_mismatch' then
      raise exception 'GATE(c1): abandoning an unheld contract answered %', v; end if;
    if (select marks from public.player_state where user_id = v_uid and slot = 0) <> 100
       or not exists (select 1 from public.active_bounty where user_id = v_uid and bounty_id = 'bx-honest') then
      raise exception 'GATE(c1): a refused abandon moved Marks or deleted the held contract'; end if;
    if not exists (select 1 from public.hr_rejections where user_id = v_uid and code = 'bounty_mismatch') then
      raise exception 'GATE(c1): bounty_mismatch was not journalled through hr_record_rejection'; end if;
    -- CONTROL for (d2): the envelope DOES project the held contract before the abandon.
    if coalesce(public.hr_state_of(v_uid, 0)->'bounty'->>'bounty_id', '') <> 'bx-honest' then
      raise exception 'GATE(c1) CONTROL: hr_state_of does not project the held contract: %',
        public.hr_state_of(v_uid, 0)->'bounty'; end if;

    -- (c3) NO ABANDON BY ACCEPTING OVER THE HELD CONTRACT (Security P2): an
    --      accept while bx-honest is held is refused bounty_active, moves 0
    --      Marks, leaves bx-honest in place, writes no bounty_abandon row, and
    --      is journalled through hr_record_rejection.
    select monster_id into v_t1 from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;
    if v_t1 is null then raise exception 'GATE(c3) CANNOT RUN: no tier-1 bounty monster'; end if;
    v := public.hr_accept_bounty__ungated(0, 'bx-swap', v_t1, 'cull', 'normal', 100);
    if coalesce(v->>'error', '') <> 'bounty_active' or coalesce(v->>'bounty_id', '') <> 'bx-honest' then
      raise exception 'GATE(c3): accept over a held contract answered %', v; end if;
    if (select marks from public.player_state where user_id = v_uid and slot = 0) <> 100
       or (select bounty_id from public.active_bounty where user_id = v_uid and slot = 0) is distinct from 'bx-honest'
       or exists (select 1 from public.player_ledger where user_id = v_uid and intent = 'bounty_abandon') then
      raise exception 'GATE(c3): accept over a held contract moved Marks, replaced the contract or journalled an abandon'; end if;
    if not exists (select 1 from public.hr_rejections where user_id = v_uid and code = 'bounty_active') then
      raise exception 'GATE(c3): bounty_active was not journalled through hr_record_rejection'; end if;

    -- (d1) HONEST ABANDON PAYS WHAT IT ALWAYS PAID: least(10, floor(40 x 0.25)) = 10.
    --      This is also the FORGED-LOW-LEVEL proof: the same player sending
    --      level 9 to the 2026-08-26 body paid 0; nothing it sends now reaches the fee.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_i := gen_random_uuid();
    v := public.hr_bounty_spend__ungated(0, 'abandon', 'bx-honest', v_i);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'fee')::bigint <> least(10, floor(40 * 0.25))::bigint
       or (v->>'marks')::bigint <> 90 or (v->>'bh_level')::int < 10 then
      raise exception 'GATE(d1): honest level-15 abandon of a 40-Mark contract answered %', v; end if;
    if (select marks from public.player_state where user_id = v_uid and slot = 0) <> 90
       or (select version from public.player_state where user_id = v_uid and slot = 0) <> v_ver + 1 then
      raise exception 'GATE(d1): the debit or the version bump did not land'; end if;
    -- (d2) THE CONTRACT ENDED: row gone, the envelope projects no bounty, one ledger row.
    if exists (select 1 from public.active_bounty where user_id = v_uid) then
      raise exception 'GATE(d2): abandon left the server contract alive'; end if;
    -- `bounty` is a TOP-LEVEL envelope key (2026-09-09-bounty-progress-projection.sql);
    -- JSON null means no active contract, SQL NULL means the key is gone - both fail.
    if jsonb_typeof(public.hr_state_of(v_uid, 0)->'bounty') is distinct from 'null' then
      raise exception 'GATE(d2): hr_state_of still projects the abandoned bounty: %',
        coalesce(public.hr_state_of(v_uid, 0)->'bounty', '"<key absent>"'::jsonb); end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and intent = 'bounty_abandon'
          and (meta->>'marks')::bigint = -10 and meta->>'bounty_id' = 'bx-honest') <> 1 then
      raise exception 'GATE(d2): the abandon was not journalled exactly once with its signed fee'; end if;

    -- (c3) CONTROL: with the contract ended, the same accept is ACCEPTED - the
    --      refusal is "one at a time", not "never". Removed again so (c2) below
    --      still finds no contract.
    v := public.hr_accept_bounty__ungated(0, 'bx-swap', v_t1, 'cull', 'normal', 100);
    if coalesce(v->>'ok', '') <> 'true'
       or (select bounty_id from public.active_bounty where user_id = v_uid and slot = 0) is distinct from 'bx-swap' then
      raise exception 'GATE(c3) CONTROL: accept with no held contract answered %', v; end if;
    delete from public.active_bounty where user_id = v_uid and slot = 0;

    -- (e1) REPLAY: same key, nothing moves twice.
    v := public.hr_bounty_spend__ungated(0, 'abandon', 'bx-honest', v_i);
    if coalesce((v->>'replayed')::boolean, false) is not true or (v->>'fee')::bigint <> 10
       or (select marks from public.player_state where user_id = v_uid and slot = 0) <> 90 then
      raise exception 'GATE(e1): a replayed abandon was not idempotent: %', v; end if;

    -- (c2) NO ABANDON WITHOUT AN ACTIVE BOUNTY: a fresh key, no row -> refused,
    --      no Marks, journalled. (The 2026-08-26 body charged a client-priced fee here.)
    v := public.hr_bounty_spend__ungated(0, 'abandon', 'bx-honest', gen_random_uuid());
    if coalesce(v->>'error', '') <> 'no_active_bounty'
       or (select marks from public.player_state where user_id = v_uid and slot = 0) <> 90 then
      raise exception 'GATE(c2): abandon with no active bounty answered % or moved Marks', v; end if;
    if not exists (select 1 from public.hr_rejections where user_id = v_uid and code = 'no_active_bounty') then
      raise exception 'GATE(c2): no_active_bounty was not journalled'; end if;

    -- (d3) BELOW LEVEL 10 -> NO FEE, and the contract still ends.
    update public.player_skills set xp = v_lv9 where user_id = v_uid and slot = 0 and skill_id = 'bountyHunter';
    insert into public.active_bounty
      (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
       gold_reward, marks_reward, xp_reward)
      values (v_uid, 0, 'bx-low', 'cull', 'normal', 'goblin', 1, 100, 0, 100, 40, 45);
    v := public.hr_bounty_spend__ungated(0, 'abandon', 'bx-low', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (v->>'fee')::bigint <> 0 or (v->>'marks')::bigint <> 90
       or exists (select 1 from public.active_bounty where user_id = v_uid) then
      raise exception 'GATE(d3): a level-9 abandon answered % (or kept the contract)', v; end if;

    -- (d4) SMALL REWARD ROUNDS DOWN AS BEFORE: floor(6 x 0.25) = 1 at level 15.
    update public.player_skills set xp = v_lv15 where user_id = v_uid and slot = 0 and skill_id = 'bountyHunter';
    insert into public.active_bounty
      (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
       gold_reward, marks_reward, xp_reward)
      values (v_uid, 0, 'bx-small', 'cull', 'normal', 'goblin', 1, 100, 0, 100, 6, 45);
    v := public.hr_bounty_spend__ungated(0, 'abandon', 'bx-small', gen_random_uuid());
    if (v->>'fee')::bigint <> least(10, floor(6 * 0.25))::bigint or (v->>'marks')::bigint <> 89 then
      raise exception 'GATE(d4): a 6-Mark contract abandoned at level 15 answered %', v; end if;

    -- (d5) THE FEE NEVER EXCEEDS THE MARKS ON HAND.
    update public.player_state set marks = 3 where user_id = v_uid and slot = 0;
    insert into public.active_bounty
      (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline,
       gold_reward, marks_reward, xp_reward)
      values (v_uid, 0, 'bx-broke', 'cull', 'normal', 'goblin', 1, 100, 0, 100, 40, 45);
    v := public.hr_bounty_spend__ungated(0, 'abandon', 'bx-broke', gen_random_uuid());
    if (v->>'fee')::bigint <> 3 or (select marks from public.player_state where user_id = v_uid and slot = 0) <> 0 then
      raise exception 'GATE(d5): the fee was not clamped to the 3 Marks on hand: %', v; end if;

    -- (g) REROLL IS THE 2026-08-26 RULE: 5, then 10, then refused (and journalled).
    update public.player_state set marks = 100 where user_id = v_uid and slot = 0;
    v := public.hr_bounty_spend__ungated(0, 'reroll', null, gen_random_uuid());
    if (v->>'cost')::bigint <> 5 or (v->>'marks')::bigint <> 95 then
      raise exception 'GATE(g): reroll #1 answered %', v; end if;
    v := public.hr_bounty_spend__ungated(0, 'reroll', null, gen_random_uuid());
    if (v->>'cost')::bigint <> 10 or (v->>'marks')::bigint <> 85 then
      raise exception 'GATE(g): reroll #2 did not escalate: %', v; end if;
    update public.player_state set marks = 3 where user_id = v_uid and slot = 0;
    v := public.hr_bounty_spend__ungated(0, 'reroll', null, gen_random_uuid());
    if coalesce(v->>'error', '') <> 'insufficient_marks' or (v->>'cost')::bigint <> 15
       or (select marks from public.player_state where user_id = v_uid and slot = 0) <> 3
       or not exists (select 1 from public.hr_rejections where user_id = v_uid and code = 'insufficient_marks') then
      raise exception 'GATE(g): an unaffordable reroll answered % (or moved Marks / went unjournalled)', v; end if;

    -- (h) SHAPE REFUSALS, each journalled under its own code.
    v := public.hr_bounty_spend__ungated(0, 'reroll', 'bx-any', gen_random_uuid());
    if coalesce(v->>'error', '') <> 'bad_bounty_id' then
      raise exception 'GATE(h): a reroll naming a contract answered %', v; end if;
    v := public.hr_bounty_spend__ungated(0, 'abandon', null, gen_random_uuid());
    if coalesce(v->>'error', '') <> 'bad_bounty_id' then
      raise exception 'GATE(h): an abandon naming no contract answered %', v; end if;
    v := public.hr_bounty_spend__ungated(0, 'refund', null, gen_random_uuid());
    if coalesce(v->>'error', '') <> 'bad_reason' then
      raise exception 'GATE(h): an unknown reason answered %', v; end if;
    v := public.hr_bounty_spend__ungated(0, 'reroll', null, null);
    if coalesce(v->>'error', '') <> 'missing_idem' then
      raise exception 'GATE(h): a keyless spend answered %', v; end if;
    if (select count(distinct code) from public.hr_rejections where user_id = v_uid
         and code in ('bad_bounty_id', 'bad_reason', 'missing_idem')) <> 3 then
      raise exception 'GATE(h): a shape refusal went unjournalled'; end if;
    if (select marks from public.player_state where user_id = v_uid and slot = 0) <> 3 then
      raise exception 'GATE(h): a refused shape moved Marks'; end if;

    raise exception using errcode = 'HR962', message = 'bounty-abandon-server-fee §5 complete - rolling back';
  exception when sqlstate 'HR962' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) NOTHING LEAKED.
  if exists (select 1 from public.player_state   where user_id = v_uid)
     or exists (select 1 from public.player_skills  where user_id = v_uid)
     or exists (select 1 from public.player_ledger  where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.active_bounty  where user_id = v_uid)
     or exists (select 1 from public.hr_rejections  where user_id = v_uid)
     or exists (select 1 from auth.users            where id = v_uid) then
    raise exception 'GATE(z): §5 LEAKED a probe row'; end if;

  -- (y) THE DETECTOR IS GREEN, strict, on whatever body is live.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;

  raise notice 'bounty-abandon-server-fee: one 4-arg overload, no client number reaches a fee, the 5-arg '
               'shape does not resolve; inner callable by nobody, wrapper authenticated + rate-gated, baseline '
               'exact; EXECUTED - accept over a held contract refused (0 Marks, contract kept), unheld contract refused, honest level-15 abandon pays 10 and ends the '
               'contract (row + projection), replay moves nothing, no-bounty refused, level-9 pays 0, '
               '6-Mark rounds to 1, fee clamped to on-hand, reroll 5/10/refused, every refusal journalled; '
               'detector green - net zero';
end $$;
