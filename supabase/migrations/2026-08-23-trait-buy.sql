-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-23-trait-buy.sql — hr_trait_buy: THE SERVER VERB FOR A PERMANENT TRAIT.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (execute_sql wrapped in begin/commit, or a branch apply). It is a MONEY
--     SURFACE: it debits the server-owned Bounty-Marks balance. Security review
--     required before authority moves.
--
--   Companion tests:  tests/trait-buy.mjs (PGlite replay + mutation catalogue)
--   Companion client: src/net/gold.js buyTrait(), src/legacy.js buyTrait()
--
-- ── THE DEFECT THIS CLOSES (P0, live) ───────────────────────────────────────
-- src/legacy.js `buyTrait()` is the single writer of G.traits. Under the LIVE
-- marks arm (record.js MARKS_RECORD_ARM_ENABLED = true) its first act is:
--
--     if (!clientMayWriteRecordField('marks')) { notify('That upgrade is
--       unavailable right now'); return; }
--
-- …because a raw `G.marks -= cost` on a server-owned balance would be a
-- client-authored debit that the next envelope reconciles away while the trait
-- stayed granted — a self-mint. Fail-closed was the RIGHT call and it was always
-- meant to be temporary (record.js's own arm-blocker note (2) says so). The
-- consequence in production today is that **Auto-Eat, and every trait, cannot be
-- bought at all** — while the death sheet, the Bounty Shop and Settings all
-- point the player at exactly that purchase. This file is the missing verb.
--
-- ── WHAT THE SERVER ALREADY EXPECTED ────────────────────────────────────────
-- The ownership SHAPE was designed before the writer existed:
--   · public.hr_unlocks carries `trait:auto_eat` / `trait:auto_eat_2`, both
--     namespace='trait', progress_kind='flag', merge='flag';
--   · 2026-08-29-auto-eat-tiers.sql's hr_auto_eat_tier() reads exactly those two
--     player_progress kind='flag' rows to decide the auto-eat CEILING;
--   · hr_set_auto_eat's entitlement gate refuses `enable` at tier 0.
-- So the only thing missing was a function that WRITES the flag row and takes
-- the money. This is that function, and it writes nothing else.
--
-- ── WHY NOT WIDEN hr_unlock_buy ─────────────────────────────────────────────
-- hr_unlock_buy is the existing "buy a permanent capability" verb and it is
-- deliberately NOT the answer here, for three independent reasons:
--   1. CURRENCY. hr_unlock_offers has a `gold` column and no other. Traits are
--      priced in BOUNTY MARKS (player_state.marks), a different balance with a
--      different earning path. Adding a marks column to a GENERATED catalogue
--      (tools/gen-unlock-offers.mjs) whose 93 rows are all gold-or-refused would
--      make every one of them carry a field only two use.
--   2. CALLER. hr_unlock_buy is granted to hr_engine ONLY — the Edge Function is
--      its single caller, through the `unlock_buy` verb, because it is part of
--      the gold-intent envelope pipeline. A trait purchase moves no gold, needs
--      no envelope and no prediction ledger; it is a direct client RPC, the same
--      shape as hr_bounty_spend (the other marks verb).
--   3. THE CATALOGUE ALREADY SAYS NO. Both trait offers carry
--      refusal='namespace_unsupported:trait' and gold=null, generated from
--      src/data/shops.js by a predicate that lives in ONE place
--      (unlock-catalogue.js SELLABLE_NAMESPACES). Making trait sellable there
--      would sell it for a NULL price.
-- The house pattern this DOES copy, statement for statement, is
-- 2026-08-26-marks-record.sql's hr_bounty_spend: a `__ungated` inner + a
-- rate-gated wrapper, the SAME per-character advisory lock hr_apply takes, an
-- idempotency key cached in player_intents, and a debit that is journalled.
--
-- ── THE PRICE IS A TABLE, NOT AN ARGUMENT ───────────────────────────────────
-- public.hr_traits carries trait_id → currency, cost, prerequisite. The caller
-- sends a TRAIT ID and a SLOT and nothing else: no price, no currency, no
-- quantity, no timestamp. Every number the function writes comes from that
-- table or from the character's own row read under the lock.
--
-- ⚠ GAME DATA IS NOT DUPLICATED HERE — IT IS BOUND. The authored source is
--   src/legacy.js `TRAITS` (the same object the Bounty Shop, the death sheet and
--   Settings render). tests/trait-buy.mjs PARSES that object and fails the build
--   if this table disagrees with it in EITHER direction — a trait the server
--   cannot sell, a trait the client cannot see, or a price that differs by one
--   Mark. That is the hr_goal_rewards precedent (2026-08-23-modal-goal-claims.sql
--   §3), and it is why the two rows below are safe to type out.
--
-- ── AUTO-EAT IS SWITCHED ON THROUGH hr_set_auto_eat, NOT AROUND IT ──────────
-- Buying Auto-Eat I turns it on (that is what legacy.js does client-side, and a
-- purchased trait that does nothing until the player finds a settings toggle is
-- a support ticket). But `player_state.auto_eat_enabled` and `auto_eat_pct` have
-- exactly ONE writer by design — 2026-08-29-auto-eat-tiers.sql's whole
-- write-clamp argument rests on it, and its GATE(e) SCANS every SQL/plpgsql body
-- in `public` to prove it. So this function does not touch those columns. It
-- writes the flag row first, then CALLS hr_set_auto_eat(slot, true), which:
--   · re-reads the tier from the row we just wrote (so the gate passes),
--   · clamps auto_eat_pct to that tier's ceiling on the null-pct path,
--   · journals its own 'admin' ledger row.
-- The call runs in THIS transaction under the SAME advisory lock (re-entrant
-- within a transaction) and the SAME row lock. Its refusals — `collect_first`
-- mid-absence, or its own 30/hour rate budget — are NON-FATAL and reported in
-- the envelope: the player owns the trait either way, and the settings toggle
-- (or the next purchase) enables it. A purchase must never fail because a
-- convenience did.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
--   · It does NOT stamp `accrued_to`. A purchase is not an activity change, so
--     the unpaid accrual window survives it untouched (hr_unlock_buy's rule).
--   · It does NOT consult hr_day_budget_check. That ceiling is on GROSS INFLOW
--     and this transaction has none in any dimension: the currency is negative,
--     no xp, no items. A call whose result can never be non-null is decoration.
--   · It does NOT cache REFUSALS under p_idem. "You are 5 Marks short" must
--     become buyable the moment you earn them; only a SUCCESS is replayable.
--   · It does NOT grant a trait the catalogue does not carry, and it does not
--     read a price from the caller under any circumstances.
--
-- ── IDEMPOTENCY + CONCURRENCY ───────────────────────────────────────────────
-- The advisory lock is taken FIRST (byte-for-byte hr_apply's key), then the
-- idempotency row is read, then player_state is locked `for update`. That order
-- is what makes a replay safe under true concurrency: two simultaneous calls
-- with the same p_idem serialise on the advisory lock, the second reads the
-- first's cached envelope and debits nothing. Two calls with DIFFERENT keys for
-- the same trait serialise the same way and the second is refused
-- `already_owned` — a refusal, never a silent no-op that charged.
--
-- ── PERFORMANCE / COST AT 100x PLAYERS ──────────────────────────────────────
-- Two traits exist in the entire game and each is once-per-character forever, so
-- the LIFETIME row cost per character is: 2 player_progress rows, 2 player_ledger
-- rows, 2 player_intents rows (pruned at 24h) and up to 2 'admin' ledger rows
-- from hr_set_auto_eat. At 600 players that is under 3,000 rows FOREVER. This is
-- not the per-tick journalling that took game_events to 1.6M rows; it is a
-- value transfer, which is exactly what the ledger is for.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive throughout. To revert:
--   drop function public.hr_trait_buy(text,int,uuid);
--   drop function public.hr_trait_buy__ungated(text,int,uuid);
--   drop table public.hr_traits;
--   -- and re-apply 2026-08-22-companion-record.sql to restore hr_state_of
--   -- without the `traits` projection (an old client ignores the extra key).
-- The rows it has already written are ordinary player_progress kind='flag' rows
-- — the exact shape hr_auto_eat_tier already reads — and survive the revert.
--
-- ⚠ IT TAKES OVER NO LAST-TOUCHER ROLE. hr_state_of and hr_rpc_gate are patched
--   PROGRAMMATICALLY (pg_get_functiondef + a guarded, exactly-once anchor
--   replace — the 2026-08-28-client-state.sql idiom), so this file carries no
--   literal `create or replace function public.hr_state_of(` /
--   `…hr_rpc_gate(` header and is a member of NO derivation chain.
--
-- SAFE TO RE-RUN. Every step is guarded and §8's probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_def text;
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_intents')  is null then raise exception 'player_intents missing'; end if;

  -- The marks column is the balance this verb debits. Without it the whole
  -- currency arm of the function is unreachable.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state' and column_name='marks') <> 1 then
    raise exception 'player_state.marks is absent — apply 2026-08-23-bounty.sql first. The marks '
                    'arm of this verb has no balance to debit without it.';
  end if;

  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) not found — apply the rate-gate chain first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection not found — refusals would be unobservable';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key missing — apply 2026-08-08-clan-seat.sql first';
  end if;

  -- THE AUTO-EAT ENTITLEMENT CHAIN. This verb writes the flag row those two
  -- functions read, and CALLS the second one. Installing it against a database
  -- without them would sell a trait that switches nothing on.
  if to_regprocedure('public.hr_auto_eat_tier(uuid,int)') is null then
    raise exception 'hr_auto_eat_tier is absent — apply 2026-08-29-auto-eat-tiers.sql first. It is '
                    'the reader of the kind=''flag'' trait rows this verb writes; without it a '
                    'purchased Auto-Eat would grant no ceiling.';
  end if;
  if to_regprocedure('public.hr_set_auto_eat(integer,boolean,text,integer,boolean)') is null then
    raise exception 'hr_set_auto_eat is absent — apply 2026-08-15-auto-eat.sql and '
                    '2026-08-29-auto-eat-tiers.sql first. It is the SINGLE WRITER of '
                    'auto_eat_enabled/auto_eat_pct and this verb calls it rather than writing '
                    'those columns behind its back.';
  end if;
  -- …and it must be the TIERED body, i.e. the one whose enable gate accepts
  -- EITHER flag. Against the pre-tier body a character holding only auto_eat_2
  -- could buy a trait they cannot switch on.
  v_def := pg_get_functiondef(to_regprocedure(
    'public.hr_set_auto_eat(integer,boolean,text,integer,boolean)'));
  if position('hr_auto_eat_tier' in v_def) = 0 then
    raise exception 'the LIVE hr_set_auto_eat is not the tiered body (no hr_auto_eat_tier call) — '
                    'apply 2026-08-29-auto-eat-tiers.sql first';
  end if;

  -- THE STORAGE GUARD + ITS CATALOGUE. hr_unlock_guard refuses a mis-filed kind
  -- INDEPENDENTLY of this function; without it this file is the only opinion in
  -- the system about where a trait flag lives.
  if to_regclass('public.hr_unlocks') is null then
    raise exception 'hr_unlocks is absent — apply 2026-08-16-unlocks.generated.sql first';
  end if;
  if not exists (select 1 from public.hr_unlocks
                  where unlock_id = 'trait:auto_eat' and progress_kind = 'flag' and merge <> 'none')
     or not exists (select 1 from public.hr_unlocks
                  where unlock_id = 'trait:auto_eat_2' and progress_kind = 'flag' and merge <> 'none') then
    raise exception 'hr_unlocks does not carry both trait rows as storable flags — the '
                    'player_progress_unlock_guard trigger would refuse the row this verb writes '
                    '(unlock_wrong_kind / unlock_not_storable)';
  end if;
end $$;

-- ── 1. THE CATALOGUE — public.hr_traits ────────────────────────────────────
-- trait_id, what it costs and in WHICH currency, and its prerequisite. Bound to
-- src/legacy.js TRAITS by tests/trait-buy.mjs in both directions.
--
-- `auto_enable` is the one behavioural column and it is deliberately narrow: it
-- means "after granting this trait, ask hr_set_auto_eat to switch auto-eat on".
-- TRUE for auto_eat only, mirroring legacy.js buyTrait's `if(id==='auto_eat')`.
-- Auto-Eat II is an upgrade to something already on, so it needs no enable —
-- and if a character somehow holds only II, hr_set_auto_eat's widened gate
-- (tiers §2) still lets them switch it on by hand.
create table if not exists public.hr_traits (
  trait_id    text primary key,
  name        text    not null,
  currency    text    not null check (currency in ('marks', 'gold')),
  cost        bigint  not null check (cost > 0),
  req_trait   text    null,
  auto_enable boolean not null default false,
  sort_ord    int     not null default 0
);

-- RLS on, NO policy, every client grant revoked: this catalogue is read by
-- SECURITY DEFINER functions only. The client already HAS these numbers (it
-- authored them — legacy.js TRAITS is what the shop renders), so exposing the
-- table would be a second copy of a price with no reader.
-- "revoke all", NOT "revoke insert, update, delete" (Security C1): Supabase's
-- default ACL on public also grants TRUNCATE, REFERENCES and TRIGGER, and
-- TRUNCATE bypasses row-level security entirely.
alter table public.hr_traits enable row level security;
revoke all on public.hr_traits from public, anon, authenticated, service_role;

-- Refilled wholesale: this file OWNS the whole table. Costs are BYTE-EQUAL to
-- src/legacy.js TRAITS (Auto-Eat I 15 Marks; Auto-Eat II 100 Marks, req I) —
-- the Designer's 2026-08-23 two-tier ruling. Not one number is invented here.
delete from public.hr_traits;
insert into public.hr_traits (trait_id, name, currency, cost, req_trait, auto_enable, sort_ord)
values
  ('auto_eat',   'Auto-Eat I',  'marks',  15, null,       true,  1),
  ('auto_eat_2', 'Auto-Eat II', 'marks', 100, 'auto_eat', false, 2);

-- ── 2. player_ledger.kind must admit 'trait' — PROGRAMMATIC, ADDITIVE ──────
-- Every previous widening RESTATED the whole array (collection-claim, bounty,
-- modal-goal-claims, workers, bank-store), which means each one could silently
-- DELETE a kind a later file had added if it were ever re-applied out of order.
-- This one inserts at an anchor instead, so it removes nothing by construction.
do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then
    raise exception 'player_ledger_kind_check is absent — this verb''s journal row would be '
                    'unconstrained, and every other writer assumes the constraint exists';
  end if;
  if position('''trait''' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''trait'' — widen skipped';
    return;
  end if;
  if position('''accrue''::text' in v_def) = 0 then
    raise exception 'player_ledger_kind_check has no ''accrue''::text anchor (%) — refusing to '
                    'rewrite a constraint whose shape this file cannot account for', v_def;
  end if;
  v_new := replace(v_def, '''accrue''::text', '''trait''::text, ''accrue''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
  raise notice 'player_ledger.kind widened to admit ''trait'' (insertion, nothing removed)';
end $$;

-- ── 3. hr_trait_buy__ungated — verify, debit, grant, journal ───────────────
create or replace function public.hr_trait_buy__ungated(
  p_trait_id text, p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- BLAST RADIUS, not balance. Two traits exist today and each is
  -- once-per-character FOREVER, so this ceiling is structurally unreachable and
  -- says so out loud. It is here because the clamp is the house pattern
  -- (clan_deposit, hr_unlock_buy) and because the day a third trait lands nobody
  -- will re-derive it: a character acquiring 8 permanent traits in one day is
  -- not play, whatever the catalogue grows to.
  c_max_traits_per_day constant int := 8;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_traits%rowtype;
  v_st     public.player_state%rowtype;
  v_cached jsonb;
  v_have   bigint;
  v_owned  bigint;
  v_today  int;
  v_ae     jsonb := null;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;

  -- ── (1) THE CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row, so a client looping
  --        on a bad id cannot contend on a real player's state row.
  select * into v_cat from public.hr_traits where trait_id = p_trait_id;
  if v_cat.trait_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'unknown_trait',
      jsonb_build_object('trait', p_trait_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_trait', 'trait_id', p_trait_id);
  end if;

  -- ── (2) SERIALISE THIS CHARACTER — the SAME advisory lock key hr_apply,
  --        hr_unlock_buy, hr_bounty_spend and hr_set_auto_eat take. A lock on a
  --        different key is not a lock. Transaction-scoped, so it is released at
  --        commit, which is what makes it safe under the transaction pooler; and
  --        re-entrant, which is what lets §(8) call hr_set_auto_eat inside it.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY, INSIDE THE LOCK. Read here rather than before it so two
  --        simultaneous retries of one gesture cannot both miss the cache: the
  --        loser waits on the advisory lock and then sees the winner's row.
  --        ONLY SUCCESSES ARE CACHED (see §8 of the write path), so "you are 5
  --        Marks short" stays retryable the moment the Marks arrive.
  if p_idem is not null then
    select result into v_cached from public.player_intents
      where user_id = v_uid and intent_id = p_idem;
    if v_cached is not null then
      return v_cached || jsonb_build_object('replayed', true);
    end if;
  end if;

  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (4) ALREADY OWNED — A REFUSAL, NOT A NO-OP. A no-op that charged would
  --        be a refund ticket; a no-op that did not would still answer ok:true
  --        and the client would render a purchase that never happened.
  select coalesce(value, 0) into v_owned from public.player_progress
   where user_id = v_uid and slot = v_slot
     and kind = 'flag' and key = 'trait:' || v_cat.trait_id and period_key = '';
  if coalesce(v_owned, 0) > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'trait_id', v_cat.trait_id);
  end if;

  -- ── (5) THE PREREQUISITE, read from the catalogue and compared against the
  --        character's OWN server-side rows. A tiered trait is priced as an
  --        UPGRADE, so selling tier II to someone who skipped tier I hands out
  --        the entry tier for free. The error carries the required id in its
  --        NAME (`requires:<id>`) because the client renders it directly.
  if v_cat.req_trait is not null then
    select coalesce(value, 0) into v_have from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'flag' and key = 'trait:' || v_cat.req_trait and period_key = '';
    if coalesce(v_have, 0) <= 0 then
      return jsonb_build_object('ok', false, 'error', 'requires:' || v_cat.req_trait,
        'trait_id', v_cat.trait_id, 'requires', v_cat.req_trait);
    end if;
  end if;

  -- ── (6) THE PER-DAY CLAMP, read from the APPEND-ONLY LEDGER rather than from
  --        a counter this function maintains (the clan_deposit pattern — a
  --        counter is a second source of truth that can be reset). Range-scanned
  --        on `at` so it uses the (user_id, slot, at) index rather than calling a
  --        function on every row.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and slot = v_slot and kind = 'trait'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_traits_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'trait_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_traits_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'trait_daily_cap',
      'used', v_today, 'limit', c_max_traits_per_day);
  end if;

  -- ── (7) THE DEBIT. Computed under the lock, from the server's OWN row and the
  --        server's OWN catalogue. Nothing here is a number the caller supplied,
  --        and neither balance can go negative: the check and the update are one
  --        statement apart inside one transaction holding the row lock.
  if v_cat.currency = 'marks' then
    v_have := coalesce(v_st.marks, 0);
    if v_have < v_cat.cost then
      perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'insufficient_marks',
        jsonb_build_object('trait', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have), 1);
      return jsonb_build_object('ok', false, 'error', 'insufficient_marks',
        'trait_id', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have);
    end if;
    update public.player_state
       set marks = marks - v_cat.cost, version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;
  else
    v_have := coalesce(v_st.gold, 0);
    if v_have < v_cat.cost then
      perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'insufficient_gold',
        jsonb_build_object('trait', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have), 1);
      return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
        'trait_id', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have);
    end if;
    update public.player_state
       set gold = gold - v_cat.cost, version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;
  end if;
  -- ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so the
  --   unpaid accrual window survives it; stamping it here would confiscate every
  --   buyer's elapsed time, silently.

  -- ── (8) THE GRANT. kind='flag', period_key='' — the EXACT shape
  --        hr_auto_eat_tier reads, and the shape the player_progress_unlock_guard
  --        trigger independently polices against hr_unlocks. `greatest` is
  --        written out even though (4) already refuses a re-buy: (4) is the
  --        PURCHASE decision, this is the STORAGE rule.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'flag', 'trait:' || v_cat.trait_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- ── (9) THE JOURNAL. ONE row per purchase. gold_in/xp_in/qty_in/gems_in are
  --        ZERO and written explicitly: this transaction MINTED nothing, which
  --        is a different fact from "unstamped". For a marks purchase the signed
  --        amount rides meta.marks — the same place hr_bounty_spend files a
  --        marks movement, so the two cannot be summed differently.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'trait', 'trait_buy:' || v_cat.trait_id,
     case when v_cat.currency = 'gold' then -v_cat.cost else 0 end, 0, 0, 0, 0,
     jsonb_build_object('trait', v_cat.trait_id, 'name', v_cat.name,
                        'currency', v_cat.currency, 'cost', v_cat.cost,
                        'marks', case when v_cat.currency = 'marks' then -v_cat.cost else 0 end,
                        'idem', p_idem));

  -- ── (10) SWITCH IT ON — THROUGH THE SINGLE WRITER, NEVER AROUND IT.
  --         hr_set_auto_eat re-reads the tier from the row written at (8), so the
  --         entitlement gate passes, and clamps the stored pct to that tier's
  --         ceiling on its null-pct path. NON-FATAL: its refusals (collect_first
  --         mid-absence, its own 30/hour budget) are reported, never fatal — the
  --         trait is bought either way and the Settings toggle still works.
  if v_cat.auto_enable then
    begin
      v_ae := public.hr_set_auto_eat(v_slot, true, null, null, false);
    exception when others then
      v_ae := jsonb_build_object('ok', false, 'error', 'enable_failed');
    end;
  end if;

  -- ── (11) THE ENVELOPE. Balances are RE-READ from the row (not arithmetic on a
  --         pre-update snapshot) because hr_set_auto_eat may have bumped the
  --         version between them. `owned` is the character's WHOLE trait set, so
  --         one answer hydrates the client rather than one delta.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'trait_id', v_cat.trait_id, 'name', v_cat.name,
    'currency', v_cat.currency, 'cost', v_cat.cost,
    'marks', v_st.marks, 'gold', v_st.gold, 'version', v_st.version, 'slot', v_slot,
    'auto_eat', v_ae,
    'owned', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = v_uid and pp.slot = v_slot
         and pp.kind = 'flag' and pp.period_key = ''
         and pp.key like 'trait:%' and pp.value > 0), '[]'::jsonb));

  -- ⚠ SUCCESSES ONLY. A cached refusal would make "not enough Marks" permanent
  --   for that key; the client generates a fresh key per gesture, so a genuine
  --   retry of the SAME gesture still replays this envelope and debits nothing.
  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, 'trait_buy:' || v_cat.trait_id, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $$;

-- ── 4. The gated wrapper ───────────────────────────────────────────────────
-- ⚠ p_idem CARRIES A DEFAULT, AND THAT IS LOAD-BEARING. PostgREST resolves an
--   RPC by the NAMED ARGUMENTS in the POST body: a client that posts
--   {p_trait_id, p_slot} against a three-argument function with no default gets
--   PGRST202 "could not find the function" — a 404 indistinguishable from "the
--   migration was never applied". §8(c) asserts the default rather than trusting
--   this comment.
create or replace function public.hr_trait_buy(
  p_trait_id text, p_slot int default 0, p_idem uuid default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_trait_buy') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_trait_buy__ungated($1, $2, $3);
end $w$;

revoke execute on function public.hr_trait_buy__ungated(text, int, uuid) from public;
revoke execute on function public.hr_trait_buy__ungated(text, int, uuid)
  from anon, authenticated, service_role;
revoke execute on function public.hr_trait_buy(text, int, uuid) from public;
revoke execute on function public.hr_trait_buy(text, int, uuid)
  from anon, authenticated, service_role;
grant  execute on function public.hr_trait_buy(text, int, uuid) to authenticated;

-- ── 5. hr_rpc_gate — PROGRAMMATIC additive patch (one bucket) ──────────────
-- The 2026-08-28-client-state.sql idiom: pg_get_functiondef + a guarded string
-- replace, so this file never restates a body it did not author and can never
-- silently delete another file's bucket. An UNKNOWN bucket fails CLOSED
-- (`else return false`), so without this the RPC would answer 429 forever and
-- the feature would deploy green and dead.
-- 12/min: a trait is bought twice in the lifetime of a character.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant (CRLF working copies)
  if position('''hr_trait_buy''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_trait_buy — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, 'else return false;' || chr(10) || '  end case;', '')))
     <> length('else return false;' || chr(10) || '  end case;') then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to '
                    'patch blind';
  end if;
  v_new := replace(v_src,
    'else return false;' || chr(10) || '  end case;',
    'when ''hr_trait_buy'' then v_limit := 12;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
  raise notice 'hr_rpc_gate patched: hr_trait_buy admitted at 12/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 6. hr_state_of — PROJECT the owned trait set (programmatic, additive) ──
-- WHY THE ENVELOPE AND NOT A SECOND RPC: ownership must survive a device change,
-- and the client's only load path for it today is the save blob — which is the
-- thing this whole program is retiring. One additive top-level `traits` array
-- means the boot envelope (record.js settle()) already carries it, with no extra
-- round trip and no second thing to keep in step.
--
-- ⚠ READ UNFILTERED, exactly as hr_auto_eat_tier is and for the same stated
--   reason: the generic `progress` array is LIMIT 1000, and a projection that
--   truncates is a projection that can silently answer "you own nothing" about
--   an entitlement. This is its own key with its own bounded query (at most one
--   row per catalogued trait).
--
-- Patched at the `total_level` anchor — the same anchor
-- 2026-08-22-companion-record.sql uses, which survives its insertion because
-- that file appends AFTER the anchor text. NO-OP on re-apply.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if v_def is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first';
  end if;
  if strpos(v_def, $q$'traits', coalesce($q$) > 0 then
    raise notice 'hr_state_of already projects traits — patch skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of total_level anchor did not match exactly once — its '
                    'shape is not the one this file was derived against. Do NOT patch a body you '
                    'cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || '
    -- trait-buy: the character''s OWNED PERMANENT TRAITS, as a flat id array.
    -- Written only by hr_trait_buy; read by the client to hydrate G.traits on
    -- boot so ownership survives a device change without the save blob. Read
    -- UNFILTERED (not through the LIMIT-ed `progress` array) — an entitlement
    -- must never be truncated into "you own nothing". `[]` is a valid known
    -- state: a fresh character owns no traits.
    ''traits'', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = p_user and pp.slot = v_st.slot
         and pp.kind = ''flag'' and pp.period_key = ''''
         and pp.key like ''trait:%'' and pp.value > 0), ''[]''::jsonb),');
  execute v_def;
  raise notice 'hr_state_of patched: projects the owned trait set';
end $$;
-- create-or-replace preserves an ACL, but be explicit (the lesson of every
-- restated body in this tree). hr_state_of takes an arbitrary uuid; no client.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 7. Grant-hygiene baseline (if present) ─────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_trait_buy' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_trait_buy', 'p_trait_id text, p_slot integer, p_idem uuid', 'authenticated',
     'added 2026-08-23: server-authoritative permanent-trait purchase (marks/gold debit + the '
     'kind=''flag'' trait:<id> grant hr_auto_eat_tier reads). Price/prereq/currency come from '
     'public.hr_traits; the caller sends an id and a slot and nothing else.');
end $$;

-- ── 8. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. The apply is atomic, so
-- a raise here reverts everything above it. Row-writing probes live in an
-- HR819-discarded subtransaction (player_ledger's retention guard refuses to
-- DELETE a fresh row, so a rollback is the only clean teardown).
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000d1-0000-0000-0000-0000000000d1';
  v_two  constant uuid := '000000d2-0000-0000-0000-0000000000d2';
  v_slot constant int  := 0;
  v_idem uuid;
  v_m    bigint;
  v_n    int;
  v_txt  text;
  v_def  text;
begin
  -- (a) THE CATALOGUE IS COHERENT and its ladder is catalogued.
  if (select count(*) from public.hr_traits) = 0 then
    raise exception 'GATE(a): hr_traits is empty — every purchase would answer unknown_trait';
  end if;
  select string_agg(t.req_trait, ', ') into v_txt from public.hr_traits t
   where t.req_trait is not null
     and not exists (select 1 from public.hr_traits p where p.trait_id = t.req_trait);
  if v_txt is not null then
    raise exception 'GATE(a): a prerequisite names an uncatalogued trait (%) — that trait could '
                    'never be bought', v_txt;
  end if;
  -- Every catalogued trait must have a storable flag home in hr_unlocks, or the
  -- storage guard refuses the row AFTER the money has moved (it would roll back,
  -- but as bad_trait_write rather than as a refusal by name).
  select string_agg(t.trait_id, ', ') into v_txt from public.hr_traits t
   where not exists (select 1 from public.hr_unlocks u
                      where u.unlock_id = 'trait:' || t.trait_id
                        and u.progress_kind = 'flag' and u.merge <> 'none');
  if v_txt is not null then
    raise exception 'GATE(a): % has no storable flag row in hr_unlocks — '
                    'player_progress_unlock_guard would refuse the grant', v_txt;
  end if;

  -- (b) GRANTS: wrapper authenticated-only, inner shut out of every client role,
  --     and NEITHER reachable by the accrual engine (the engine must never buy a
  --     paid trait for somebody).
  if to_regprocedure('public.hr_trait_buy(text,integer,uuid)') is null then
    raise exception 'GATE(b): the wrapper did not install';
  end if;
  if has_function_privilege('authenticated', 'public.hr_trait_buy__ungated(text,integer,uuid)', 'execute') then
    raise exception 'GATE(b): the __ungated inner is client-executable — the rate gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_trait_buy(text,integer,uuid)', 'execute') then
    raise exception 'GATE(b): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','service_role']) r
   where has_function_privilege(r, 'public.hr_trait_buy(text,integer,uuid)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(b): hr_trait_buy is executable by %', v_txt;
  end if;
  if has_function_privilege('hr_engine', 'public.hr_trait_buy(text,integer,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_trait_buy__ungated(text,integer,uuid)', 'execute') then
    raise exception 'GATE(b): hr_engine can buy a paid trait for a player';
  end if;
  -- PUBLIC must hold nothing. aclexplode, because grantee = 0 IS the definition
  -- of PUBLIC and a regex over an ACL string asserts nothing.
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = to_regprocedure('public.hr_trait_buy(text,integer,uuid)')
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'GATE(b): hr_trait_buy is still executable by PUBLIC';
  end if;
  if (select prosecdef from pg_proc
       where oid = to_regprocedure('public.hr_trait_buy__ungated(text,integer,uuid)')) is not true then
    raise exception 'GATE(b): the inner is not SECURITY DEFINER — every statement would be denied';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc
                    where oid = to_regprocedure('public.hr_trait_buy__ungated(text,integer,uuid)')),
                    array[]::text[])) c where c like 'search_path=%') then
    raise exception 'GATE(b): the inner has no pinned search_path — a SECURITY DEFINER function '
                    'without one is a search_path hijack';
  end if;
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_trait_buy(text,integer,uuid)')) <> 'v' then
    raise exception 'GATE(b): hr_trait_buy is not VOLATILE — PostgREST would run it in a READ ONLY '
                    'transaction and every purchase would fail';
  end if;

  -- (c) THE TWO-ARGUMENT CALL FORM RESOLVES (PGRST202 insurance).
  if coalesce((select pronargdefaults from pg_proc
                where oid = to_regprocedure('public.hr_trait_buy(text,integer,uuid)')), 0) < 2 then
    raise exception 'GATE(c): hr_trait_buy has fewer than two defaulted arguments — a client '
                    'posting {p_trait_id, p_slot} would get PGRST202 and the feature ships dead';
  end if;

  -- (d) NO CLIENT WRITE SURFACE on anything this verb owns, and the price table
  --     is not client-writable in any dimension.
  select string_agg(table_name || ':' || privilege_type, ', ') into v_txt
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('player_state','player_progress','player_ledger','player_intents','hr_traits')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_txt is not null then
    raise exception 'GATE(d): client/engine write grants on the tables this verb owns: %', v_txt;
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_traits'
     and grantee in ('anon','authenticated','service_role','PUBLIC');
  if v_n > 0 then
    raise exception 'GATE(d): % client grant(s) on hr_traits — the price would be readable and, '
                    'worse, a policy away from writable', v_n;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_traits') then
    raise exception 'GATE(d): hr_traits grew an RLS policy — it is definer-read only';
  end if;

  -- (e) THE SINGLE-WRITER INVARIANT IS INTACT. This file must NOT have become a
  --     second writer of the two auto-eat columns; it calls hr_set_auto_eat.
  v_def := pg_get_functiondef(to_regprocedure('public.hr_trait_buy__ungated(text,integer,uuid)'));
  if v_def ~ 'set[[:space:]]+auto_eat_(pct|enabled)[[:space:]]*=' then
    raise exception 'GATE(e): hr_trait_buy writes an auto_eat column directly — that voids the '
                    'tier write-clamp argument in 2026-08-29-auto-eat-tiers.sql, whose GATE(e) '
                    'proves hr_set_auto_eat is the only writer';
  end if;
  if position('public.hr_set_auto_eat(' in v_def) = 0 then
    raise exception 'GATE(e): hr_trait_buy never calls hr_set_auto_eat — buying Auto-Eat would '
                    'leave it switched off, which is the trait doing nothing';
  end if;
  -- CONTROL for the scan above: it must be able to SEE the pattern it looks for.
  if 'update x set auto_eat_pct = 1' !~ 'set[[:space:]]+auto_eat_(pct|enabled)[[:space:]]*=' then
    raise exception 'GATE(e): the single-writer scan is BLIND — it does not match a known positive';
  end if;

  -- (f) THE GATE ADMITS THE BUCKET, and the patch was ADDITIVE.
  v_def := pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure);
  if position('''hr_trait_buy''' in v_def) = 0 then
    raise exception 'GATE(f): hr_rpc_gate does not admit hr_trait_buy — an unknown bucket fails '
                    'closed, so every purchase would answer 429';
  end if;
  foreach v_txt in array array['hr_bounty_spend','bank_move','client_state_put','farm_plant',
                               'hr_claim_daily','clan_deposit'] loop
    if position('''' || v_txt || '''' in v_def) = 0 then
      raise exception 'GATE(f): the hr_rpc_gate patch DELETED the ''%'' bucket — it is not additive',
        v_txt;
    end if;
  end loop;

  -- (g) THE ENVELOPE PROJECTS traits, and did not lose a sibling projection.
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, $q$'traits', coalesce($q$) = 0 then
    raise exception 'GATE(g): hr_state_of does not project traits';
  end if;
  foreach v_txt in array array['''total_level''','''inventory''','''skills''','''progress''',
                               '''marks''','''auto_eat_enabled'''] loop
    if position(v_txt in v_def) = 0 then
      raise exception 'GATE(g): the hr_state_of patch DROPPED the % projection', v_txt;
    end if;
  end loop;

  -- (h) EXECUTED BEHAVIOUR — discarded subtransaction, zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, v_slot, 1000, 0, 20, 1)
      on conflict (user_id, slot) do update set gold = 1000, marks = 20, version = 1;

    -- unknown trait refused, nothing moved.
    v := public.hr_trait_buy__ungated('no_such_trait', v_slot, null);
    if v->>'error' <> 'unknown_trait' then
      raise exception 'GATE(h): an unknown trait was not refused: %', v;
    end if;

    -- TIER II BEFORE TIER I is refused BY NAME, and charges nothing.
    v := public.hr_trait_buy__ungated('auto_eat_2', v_slot, null);
    if v->>'error' <> 'requires:auto_eat' then
      raise exception 'GATE(h): tier II sold without its prerequisite: %', v;
    end if;
    select marks into v_m from public.player_state where user_id = v_uid and slot = v_slot;
    if v_m <> 20 then raise exception 'GATE(h): a refused purchase moved marks (%)', v_m; end if;

    -- TIER I: 15 marks out, the flag row in, auto-eat ON, one ledger row.
    v_idem := gen_random_uuid();
    v := public.hr_trait_buy__ungated('auto_eat', v_slot, v_idem);
    if coalesce(v->>'ok','') <> 'true' or (v->>'marks')::bigint <> 5 then
      raise exception 'GATE(h): tier I did not credit correctly: %', v;
    end if;
    if not exists (select 1 from public.player_progress
                    where user_id = v_uid and slot = v_slot and kind = 'flag'
                      and key = 'trait:auto_eat' and period_key = '' and value > 0) then
      raise exception 'GATE(h): the ownership flag row was not written';
    end if;
    if public.hr_auto_eat_tier(v_uid, v_slot) <> 1 then
      raise exception 'GATE(h): hr_auto_eat_tier reports % after buying tier I, expected 1',
        public.hr_auto_eat_tier(v_uid, v_slot);
    end if;
    if not (select auto_eat_enabled from public.player_state where user_id = v_uid and slot = v_slot) then
      raise exception 'GATE(h): buying Auto-Eat I did not switch auto-eat on — the trait does nothing';
    end if;
    if (select auto_eat_pct from public.player_state where user_id = v_uid and slot = v_slot) <> 25 then
      raise exception 'GATE(h): the stored pct is % — hr_set_auto_eat''s tier-I ceiling did not apply',
        (select auto_eat_pct from public.player_state where user_id = v_uid and slot = v_slot);
    end if;
    if v->'owned' <> '["auto_eat"]'::jsonb then
      raise exception 'GATE(h): the owned set is %, expected ["auto_eat"]', v->'owned';
    end if;

    -- REPLAY on the same key: the ORIGINAL envelope, no second debit.
    v := public.hr_trait_buy__ungated('auto_eat', v_slot, v_idem);
    if coalesce((v->>'replayed')::boolean, false) is not true or coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): the idempotent retry did not replay the original envelope: %', v;
    end if;
    select marks into v_m from public.player_state where user_id = v_uid and slot = v_slot;
    if v_m <> 5 then raise exception 'GATE(h): the replay RE-DEBITED (marks=%)', v_m; end if;

    -- A DIFFERENT key for a trait already owned is refused, not silently re-sold.
    v := public.hr_trait_buy__ungated('auto_eat', v_slot, gen_random_uuid());
    if v->>'error' <> 'already_owned' then
      raise exception 'GATE(h): a re-buy was not refused: %', v;
    end if;
    select marks into v_m from public.player_state where user_id = v_uid and slot = v_slot;
    if v_m <> 5 then raise exception 'GATE(h): the refused re-buy moved marks (%)', v_m; end if;

    -- SHORT OF MARKS: refused by name, nothing moved, and NOT cached.
    v_idem := gen_random_uuid();
    v := public.hr_trait_buy__ungated('auto_eat_2', v_slot, v_idem);
    if v->>'error' <> 'insufficient_marks' or (v->>'cost')::bigint <> 100 then
      raise exception 'GATE(h): a short purchase was not refused by name: %', v;
    end if;
    if exists (select 1 from public.player_intents where user_id = v_uid and intent_id = v_idem) then
      raise exception 'GATE(h): a REFUSAL was cached under its idempotency key — the player could '
                      'never buy it with that key once the marks arrived';
    end if;
    if not exists (select 1 from public.player_progress
                    where user_id = v_uid and slot = v_slot and kind = 'flag'
                      and key = 'trait:auto_eat' and period_key = '') then
      raise exception 'GATE(h): the refused purchase disturbed the owned set';
    end if;

    -- TOP UP AND BUY TIER II: the tier reader answers 2, both traits owned.
    update public.player_state set marks = 100 where user_id = v_uid and slot = v_slot;
    v := public.hr_trait_buy__ungated('auto_eat_2', v_slot, gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' or (v->>'marks')::bigint <> 0 then
      raise exception 'GATE(h): tier II did not credit correctly: %', v;
    end if;
    if public.hr_auto_eat_tier(v_uid, v_slot) <> 2 then
      raise exception 'GATE(h): hr_auto_eat_tier reports % after tier II, expected 2',
        public.hr_auto_eat_tier(v_uid, v_slot);
    end if;
    if v->'owned' <> '["auto_eat", "auto_eat_2"]'::jsonb then
      raise exception 'GATE(h): the owned set after tier II is %', v->'owned';
    end if;

    -- ONE ledger row per credited purchase, and no more.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and kind = 'trait' and intent like 'trait\_buy:%';
    if v_n <> 2 then
      raise exception 'GATE(h): expected 2 trait ledger rows, found %', v_n;
    end if;

    -- THE ENVELOPE HYDRATES OWNERSHIP.
    if public.hr_state_of(v_uid, v_slot)->'traits' <> '["auto_eat", "auto_eat_2"]'::jsonb then
      raise exception 'GATE(h): hr_state_of projects traits as %, expected both',
        public.hr_state_of(v_uid, v_slot)->'traits';
    end if;

    -- CONTROL: A SECOND, FRESH CHARACTER OWNS NOTHING. Without this, every
    -- assertion above is satisfied by a function that grants to everybody.
    perform set_config('request.jwt.claim.sub', v_two::text, true);
    insert into auth.users (id) values (v_two) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_two, v_slot, 0, 0, 0, 1) on conflict (user_id, slot) do nothing;
    if public.hr_auto_eat_tier(v_two, v_slot) <> 0 then
      raise exception 'GATE(h): CONTROL failed — a fresh character already holds a tier';
    end if;
    if public.hr_state_of(v_two, v_slot)->'traits' <> '[]'::jsonb then
      raise exception 'GATE(h): CONTROL failed — a fresh character projects traits %',
        public.hr_state_of(v_two, v_slot)->'traits';
    end if;
    v := public.hr_trait_buy__ungated('auto_eat', v_slot, gen_random_uuid());
    if v->>'error' <> 'insufficient_marks' then
      raise exception 'GATE(h): CONTROL failed — a penniless character was sold a trait: %', v;
    end if;

    raise exception using errcode = 'HR819', message = 'trait-buy §8 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_ledger   where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_progress where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_intents  where user_id in (v_uid, v_two))
     or exists (select 1 from auth.users where id in (v_uid, v_two)) then
    raise exception 'GATE: §8 LEAKED a probe row';
  end if;

  -- (i) grant-hygiene clean after the addition.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports unapproved client rpcs: %',
          v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports ungated client rpcs: %',
          v_gh->'ungated_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'baseline_rows_no_longer_live') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports baseline drift: %',
          v_gh->'baseline_rows_no_longer_live';
      end if;
    end;
  end if;

  raise notice 'trait-buy: catalogue bound, wrapper authenticated-only, inner + engine shut out, '
               'no client write surface, hr_set_auto_eat still the single auto-eat writer, gate '
               'bucket additive, envelope projects traits, and the executed probes cover buy / '
               'replay / already_owned / prerequisite / insufficient / tier reader — all green';
end $$;
