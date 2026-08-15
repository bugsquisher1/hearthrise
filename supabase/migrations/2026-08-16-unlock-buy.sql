-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — hr_unlock_buy: THE WRITE PATH FOR A PERMANENT UNLOCK
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Companion catalogue:  2026-08-16-unlock-offers.generated.sql (price + gate)
--   Companion catalogue:  2026-08-16-unlocks.generated.sql       (merge + ladder)
--   Companion module:     supabase/functions/hr-accrue/unlock-buy.js
--   Companion design:     docs/design/unlock-buy.md
--   Companion tests:      tests/unlock-buy.mjs
--   Companion derivation: tools/derive-grant-hygiene.mjs (§4's body is EXTRACTED)
--
-- ── WHAT THIS FILE CLOSES ───────────────────────────────────────────────
-- §9(2) of 2026-08-16-artisan-progress-model.sql: "THE ROOM WRITE PATH DOES NOT
-- EXIST, DELIBERATELY. No RPC writes a kind='unlock' row." This is that RPC,
-- built to the contract that section states:
--     · price and grant read from a server-side offer catalogue
--     · gold debited in the same transaction as the grant
--     · value = GREATEST(existing, granted_amount)  -- never +=
--     · journalled to player_ledger; idempotency key; per-day clamp
-- and it is what makes §9(3)'s condition true: room purchase becomes
-- server-owned, so 'artisan' may enter PAYABLE_KINDS.
--
-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  THE DESIGN DECISION, AND WHY IT IS NOT "WIDEN hr_apply".            ║
-- ║                                                                      ║
-- ║  hr_apply cannot express an unlock grant BY DESIGN: its progress      ║
-- ║  block merges `value = value + add`, so a rung bought twice would     ║
-- ║  read as the rung above — the 2,000g Iron Stove for 1,000 gold.       ║
-- ║  'unlock' is therefore absent from its delta allowlist, and           ║
-- ║  2026-08-16-artisan-progress-model.sql §0 asserts that absence as a   ║
-- ║  BICONDITIONAL: 'flag' must be in the list, 'unlock' must not.        ║
-- ║                                                                      ║
-- ║  Adding a MAX-merging branch to hr_apply would:                       ║
-- ║    · make this file the fifth link of the hr_apply derivation chain   ║
-- ║      and the new last toucher of the single most dangerous body in    ║
-- ║      the repo, for a feature that touches one row;                    ║
-- ║    · reopen the additive-merge hole the moment anyone proposed        ║
-- ║      `{progress:[{kind:'unlock',…}]}` from the accrual engine — the   ║
-- ║      engine's whole delta surface would gain a rung climber;          ║
-- ║    · and delete §0's biconditional, which is currently the strongest  ║
-- ║      static statement in the program about what the engine may write. ║
-- ║                                                                      ║
-- ║  So: a SECOND WRITER, engine-only, that does one thing. The engine's  ║
-- ║  capability grows by exactly one verb whose whole surface is an       ║
-- ║  OFFER ID, and hr_apply's invariants are untouched — this file does   ║
-- ║  not `create or replace` hr_apply, hr_state_of, hr_perks_of or        ║
-- ║  hr_rate_gate, and §0 asserts their terms instead.                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ── WHY THE PRICE IS A TABLE AND NOT AN ARGUMENT ────────────────────────
-- `shop_buy` proposes `gold: -N`; the Edge Function computes N from
-- src/data/shops.js. That is right for an item purchase, where hr_apply
-- re-validates the invariant that matters (the balance may not go negative).
-- It is NOT right for a permanent capability: the invariants here are the rung
-- ladder, monotonicity, the ceiling and the PREREQUISITE, and a caller that
-- also supplied the price would own three of the four numbers in the
-- transaction. hr_unlock_buy therefore takes an OFFER ID and nothing else, and
-- reads price, grant, rung and both prerequisites out of
-- public.hr_unlock_offers — GENERATED from the same eligibility predicate the
-- Edge module uses, so the two cannot disagree about what is sellable.
--
-- ⚠ THAT IS THE 2026-08-15 ARCHITECTURE DECISION APPLIED, NOT BENT. "If an
--   operation needs the game's RULES it is JavaScript; if it is pure
--   bookkeeping it is a database function." A price and a prerequisite edge are
--   bookkeeping — they say what a purchase COSTS and REQUIRES, never what a
--   rung DOES. The 0.25 noBurn is still in src/data/perks.js and still read by
--   src/core/perks.js on both sides. Not one game magnitude is copied here.
--
-- ── WHAT IT ENFORCES, each because something breaks without it ──────────
--   version_conflict        the caller's read is stale (and the key is RELEASED,
--                           b346's rule, so the retry it asks for can succeed)
--   intent_mismatch         one key, one meaning, on one slot
--   unknown_offer /         an offer that does not exist / a real one this build
--   offer_unsupported       cannot sell, refused BY NAME with the reason
--   already_owned           the rung is already held. NOT a silent no-op: a
--                           no-op that charged would be a refund ticket, and a
--                           no-op that did not would still bump the version
--   rung_skipped            rung 3 without rung 2. The ladder is hr_unlocks'
--   prereq_property_tier    the homestead gate — the ONLY thing between a rich
--                           player and Hearthrise Castle from a bedroll
--   prereq_item             the dungeon blueprint the client requires and
--                           consumes; without it the server sells rungs 2-3
--                           strictly cheaper than the client charges
--   insufficient_gold /     computed under the lock, from the server's own row
--   insufficient_item
--   unlock_daily_cap        blast radius: 45 sellable offers exist in the whole
--                           game and each is once-per-character, so a day with
--                           20 permanent unlocks on one character is not play
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
--   · It does NOT stamp `accrued_to`. A purchase is not an activity change, so
--     the elapsed accrual window survives it untouched (intents.js rule 3 — the
--     Edge side re-checks the same property on the request it built).
--   · It does NOT consult hr_day_budget_check. That ceiling is on GROSS INFLOW
--     and this transaction has none in any dimension: gold is negative, items
--     are negative, xp is absent. A call whose result can never be non-null is
--     decoration, and this repo has recorded eighteen of those.
--   · It does NOT grant gems, xp, items or an activity. One row moves, one
--     balance moves, one journal row lands.
--   · It does NOT sell every unlock. 45 of 93 authored unlock offers are
--     sellable and the other 48 are refused BY NAME; the predicate is on the
--     offer's SHAPE and lives in ONE place (unlock-catalogue.js).
--
-- REVERSIBILITY
--   drop function public.hr_unlock_buy(uuid,int,bigint,uuid,text);
--   -- and re-apply 2026-08-16-engine-allowlist-claim-perks.sql to restore the
--   -- eleven-entry engine allowlist (this file's §4 adds the twelfth).
--   Nothing else is touched: no table is altered, no policy is written, no
--   existing function body is replaced except the detector's, which is derived.
--   Rows it has already written are ordinary player_progress unlock rows and
--   are read by hr_unlock_levels whether this function exists or not.
--
-- APPLY ORDER: … → 2026-08-16-artisan-progress-model.sql
--   → 2026-08-16-unlock-offers.generated.sql → THIS FILE
--   → (it TAKES OVER 2026-08-16-engine-allowlist-claim-perks.sql's role as the
--      last file that may `create or replace` hr_assert_grant_hygiene)
--   It FAILS CLOSED without any of them.
--
-- SAFE TO RE-RUN. Every step is guarded and §6's probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS + REFUSE-TO-INSTALL — FAIL CLOSED ───────────────────
-- This file installs a SECOND WRITER of player state. The single worst way to
-- ship one is against a database whose FIRST writer does not have the
-- properties the second one assumes — so the assumptions are asserted, with a
-- positive and a negative control, exactly as the artisan model does.
do $$
declare
  v_src   text;
  v_len   int;
  v_kinds text;
  v_row   text[];
  v_n     int;
  c_terms constant text[][] := array[
    ['b346 C3: the slot comparison',          '\mv_prev_slot\M'],
    ['b346 C3: the intent_mismatch branch',   'intent_mismatch'],
    ['b346: the version_conflict key release','delete from public.player_intents'],
    ['C5/X3: the daily budget is enforced',   'hr_day_budget_check']
  ];
begin
  -- (a) THE TABLES.
  if to_regclass('public.player_state') is null
     or to_regclass('public.player_progress') is null
     or to_regclass('public.player_inventory') is null
     or to_regclass('public.player_intents') is null
     or to_regclass('public.player_ledger') is null then
    raise exception 'the player-state foundation is missing — apply 2026-08-11-player-state.sql first';
  end if;

  -- (b) BOTH CATALOGUES, and NEITHER MAY BE EMPTY. A price table that is
  --     present and empty makes every offer unknown; a merge table that is
  --     present and empty makes every grant unstorable. Both would read as "the
  --     shop is closed" rather than as a broken apply, which is the quiet
  --     direction.
  if to_regclass('public.hr_unlocks') is null then
    raise exception 'hr_unlocks is absent — apply 2026-08-16-unlocks.generated.sql first. This '
                    'function reads the MERGE RULE and the RUNG LADDER out of it.';
  end if;
  if to_regclass('public.hr_unlock_offers') is null then
    raise exception 'hr_unlock_offers is absent — apply 2026-08-16-unlock-offers.generated.sql '
                    'first. This function reads the PRICE and both PREREQUISITES out of it, and '
                    'takes no price from its caller.';
  end if;
  select count(*) into v_n from public.hr_unlock_offers where refusal is null;
  if v_n = 0 then
    raise exception 'hr_unlock_offers has no sellable row — regenerate it (node '
                    'tools/gen-unlock-offers.mjs). Installed against an empty catalogue this verb '
                    'would answer unknown_offer to every purchase in the game.';
  end if;
  if not exists (select 1 from public.hr_unlock_offers
                  where refusal is null and unlock_id = 'room:kitchen') then
    raise exception 'no sellable room:kitchen rung — this whole file exists so that noBurn has a '
                    'server-owned writer (§9(3) of the artisan progress model)';
  end if;

  -- (c) THE STORAGE GUARD. It is the backstop that makes this function hard to
  --     get wrong — an off-ladder rung, a regression and a mis-filed kind are
  --     all refused by the trigger even if this body were buggy. Installing the
  --     writer without it would remove the second opinion entirely.
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_progress'::regclass
                  and tgname = 'player_progress_unlock_guard' and not tgisinternal) then
    raise exception 'player_progress_unlock_guard is not installed — apply '
                    '2026-08-16-artisan-progress-model.sql first. It is the storage guard that '
                    'refuses an off-ladder rung, a regression and a mis-filed kind INDEPENDENTLY '
                    'of this function; without it this file is the only opinion in the system.';
  end if;
  if to_regprocedure('public.hr_perks_of(uuid,int)') is null
     or to_regprocedure('public.hr_unlock_levels(uuid,int)') is null then
    raise exception 'the perk channel is missing — apply 2026-08-15-perk-channel.sql and '
                    '2026-08-16-artisan-progress-model.sql first. A rung nothing READS is a '
                    'purchase that pays nothing.';
  end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_reject / hr_record_rejection are missing — apply 2026-08-11-apply-engine.sql '
                    'and 2026-08-11-player-state.sql first. This function uses the SAME rejection '
                    'primitive as hr_apply so the two cannot disagree about what a refusal is.';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key is missing — apply 2026-08-08-clan-seat.sql first. The per-day '
                    'clamp is read against the SERVER''s day function, never a caller''s.';
  end if;

  -- (d) hr_apply's properties. This file does not replace it; it DEPENDS on the
  --     current one — the same idempotency table, the same key rules, the same
  --     rejection recorder — and an older body means those rules are not where
  --     this function assumes they are.
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';

  -- ⚠ TWO CONTROLS BEFORE ANY VERDICT. A prosrc scan fails in BOTH directions:
  --   it can stop matching (every check raises on a healthy database — loud but
  --   wrong) or match everything (every check passes on a body with none of
  --   these properties — quiet and fatal).
  if v_src !~ 'version_conflict' then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND (positive control): "version_conflict" is '
                    'absent from a % char body. Fix the scan; do not delete the check.', coalesce(v_len,0);
  end if;
  if v_src ~ 'hr354_negative_control_this_string_is_not_in_any_hr_apply' then
    raise exception 'THE hr_apply SOURCE SCAN CANNOT SEE FAILURE (negative control): a sentinel that '
                    'appears in no hr_apply body MATCHED.';
  end if;
  foreach v_row slice 1 in array c_terms loop
    if v_src !~ v_row[2] then
      raise exception 'REFUSING TO INSTALL against this hr_apply: the live body (% chars) does not '
                      'carry "%" (regex: %). hr_unlock_buy copies its idempotency and key-release '
                      'rules statement for statement; against an older body the two writers would '
                      'follow different rules on one shared table.', coalesce(v_len,0), v_row[1], v_row[2];
    end if;
  end loop;

  -- (e) THE BICONDITIONAL THIS FILE'S EXISTENCE RESTS ON. If hr_apply could
  --     write kind='unlock', this function would be redundant AND the additive
  --     merge hole would be open — so the check is not "assert the design", it
  --     is "refuse to add a second writer to a system whose first writer has
  --     already been widened behind our back".
  v_kinds := substring(v_src from 'not in\s*\n?\s*\(''quest''[^)]*\)');
  if v_kinds is null then
    raise exception 'THE PROGRESS-KIND ALLOWLIST SCAN IS BLIND: hr_apply''s progress kind list could '
                    'not be located in a % char body, so the check below means nothing.', coalesce(v_len,0);
  end if;
  if v_kinds ~ '''unlock''' then
    raise exception 'REFUSING TO INSTALL: hr_apply''s progress allowlist (%) ACCEPTS ''unlock''. Its '
                    'merge is `value = value + add`, so rung 1 bought twice stands in rung 2. This '
                    'function exists BECAUSE hr_apply cannot write a level; with that widened, '
                    'installing it adds a second writer to a hole rather than closing one. Remove '
                    'it there first.', v_kinds;
  end if;

  raise notice 'b354 §0 PASSED: both catalogues loaded (% sellable offers), the storage guard is '
               'installed, hr_apply carries all % properties and still refuses ''unlock''.',
               (select count(*) from public.hr_unlock_offers where refusal is null),
               array_length(c_terms, 1);
end $$;

-- ── 1. hr_unlock_buy ─────────────────────────────────────────────────────
-- The sequence is hr_apply's, deliberately, statement for statement where the
-- two do the same job: rate → advisory lock → idempotency claim → protected
-- block (row lock, version, validate, write) → journal → record the decision.
-- A second writer that invented its own concurrency story would be a second
-- concurrency story.
create or replace function public.hr_unlock_buy(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid, p_offer_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- BLAST RADIUS, not balance (the clan_deposit rule, and hr_apply's own).
  -- 45 sellable offers exist in the entire game and each one is once per
  -- character forever, so the LIFETIME ceiling for an honest character is 45.
  -- A day in which one character acquires 20 permanent unlocks is not play; it
  -- is an engine that has stopped being told no. Set far above honest play and
  -- far below "the whole ladder in an afternoon".
  c_max_unlocks_per_day constant int := 20;

  v_uid    uuid;
  v_role   text;
  v_slot   int := coalesce(p_slot, 0);
  v_off    public.hr_unlock_offers%rowtype;
  v_cat    public.hr_unlocks%rowtype;
  v_st     public.player_state%rowtype;
  v_prev   jsonb;
  v_prev_intent text;
  v_prev_slot   int;
  v_claimed boolean := false;
  v_intent text;
  v_out    jsonb;
  v_msg    text; v_det text; v_sqlstate text;
  v_cur    bigint;
  v_next   bigint;
  v_tier   int;
  v_have   bigint;
  v_n      bigint;
  k        text;
  v_day    text;
  v_today  int;
  v_rungs  int[];
begin
  -- ── (0) THE IDENTITY SEAM. hr_apply's, verbatim in effect: the engine may
  --        act for a user it names because it has already verified that user's
  --        JWT and holds no table privilege of its own. Nobody else may name a
  --        user at all. current_user is the OWNER inside a definer function, so
  --        the ROLE GUC is what is read.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'unlock_buy', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_intent_id');
  end if;

  -- ── (1) THE OFFER, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row: answering it here
  --        means a client looping on a bad id cannot contend on a real player's
  --        state row. `unknown` and `unsupported` are two different answers on
  --        purpose — a player told "no such offer" about a gem-priced cosmetic
  --        files a bug against the wrong system.
  if p_offer_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_offer');
  end if;
  select * into v_off from public.hr_unlock_offers where offer_id = p_offer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_offer',
                              'detail', jsonb_build_object('offer', p_offer_id));
  end if;
  if v_off.refusal is not null then
    return jsonb_build_object('ok', false, 'error', 'offer_unsupported',
             'detail', jsonb_build_object('offer', p_offer_id, 'reason', v_off.refusal));
  end if;
  select * into v_cat from public.hr_unlocks where unlock_id = v_off.unlock_id;
  if not found or v_cat.progress_kind is null then
    -- The generated cross-check makes this unreachable; it is a REFUSAL rather
    -- than an assertion because the two catalogues are generated by two tools
    -- from two sources, and the failure mode of trusting that is a player
    -- charged for a row the storage guard then refuses.
    return jsonb_build_object('ok', false, 'error', 'offer_unsupported',
             'detail', jsonb_build_object('offer', p_offer_id, 'reason', 'uncatalogued_unlock'));
  end if;

  -- ── (2) RATE. The `apply` budget, deliberately NOT a new namespace: a second
  --        writer with its own 240/min would double a compromised engine's
  --        reachable write rate. Outside the protected block, like hr_apply's,
  --        so spamming refusals is not free.
  --        (C2) RECORDED BEFORE THE RETURN, and before the intent claim, or a
  --        rate-limited caller leaves no durable trace anywhere: this return is
  --        ahead of player_intents, and player_intents is pruned after 24h
  --        regardless. Sustained rate limiting is the loudest automation signal
  --        this server produces.
  --        (S6) …but SAMPLED — the 1st, 10th and 50th rejection in the window,
  --        then every 1000th — because under the retry storm this exists to
  --        detect, one write per rejected call is a row lock plus a WAL record
  --        per request, all serialised on one tuple.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'unlock_buy', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (3) SERIALISE THIS CHARACTER — the SAME advisory lock key hr_apply
  --        takes. Two different keys would let a purchase and an accrual run
  --        concurrently on one character, which is exactly the read-modify-write
  --        this whole architecture exists to prevent.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (4) IDEMPOTENCY, hr_apply's rules on hr_apply's table. The name carries
  --        the offer AND the rung, because `intent_mismatch` compares exactly
  --        this string and the rung is what changes what the write DOES.
  v_intent := 'unlock_buy:' || v_off.offer_id || ':' || v_off.value;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  -- All-or-nothing. Every rejection raises through hr_reject (SQLSTATE HR000)
  -- and the handler undoes the whole block, so there is no state in which the
  -- gold left and the rung did not arrive.
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;

    -- (a) OPTIMISTIC CONCURRENCY — MANDATORY. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));
    end if;

    -- (b) THE PER-DAY CLAMP, read from the APPEND-ONLY LEDGER rather than from a
    --     counter this function maintains — the clan_deposit pattern. A counter
    --     is a second source of truth that can be reset; the ledger is the
    --     record the audit reads anyway. Bounded by the user+slot+at index.
    v_day := public.hr_utc_day_key(now());
    select count(*) into v_today from public.player_ledger
     where user_id = v_uid and slot = v_slot
       and kind = 'shop' and intent like 'unlock\_buy:%'
       and public.hr_utc_day_key(at) = v_day;
    if v_today >= c_max_unlocks_per_day then
      perform public.hr_reject('unlock_daily_cap',
        jsonb_build_object('used', v_today, 'limit', c_max_unlocks_per_day, 'day', v_day));
    end if;

    -- (c) THE MERGE, AND IT IS THE WHOLE POINT: GREATEST, NEVER +=.
    --     `v_cur` is read under the row lock taken above, so two concurrent
    --     purchases of the same rung cannot both see 0.
    select value into v_cur from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = v_cat.progress_kind and key = v_off.unlock_id and period_key = '';
    v_cur := coalesce(v_cur, 0);

    if v_cur >= v_off.value then
      -- ⚠ A REFUSAL, NOT A NO-OP. GREATEST would make a second purchase
      --   harmless to the ROW and still charge for it; a silent no-op that did
      --   not charge would still bump the version and answer ok:true, so the
      --   client would render a purchase that never happened. Both are worse
      --   than a name.
      perform public.hr_reject('already_owned',
        jsonb_build_object('unlock', v_off.unlock_id, 'have', v_cur, 'wanted', v_off.value));
    end if;

    -- (d) RUNG ORDER. The ladder is the CATALOGUE's, never a number here: the
    --     next legal rung is the smallest one above what the character holds.
    --     Without this, a player buys rung 5 with rung 5's gold and skips four
    --     purchases — which is not free, but it IS the ladder not being a
    --     ladder. `merge='max'` is the only shape with a ladder; a flag or a
    --     count has none and this check is correctly vacuous for it.
    if v_cat.merge = 'max' then
      v_rungs := coalesce(v_cat.rungs, array[]::int[]);
      select min(r) into v_next from unnest(v_rungs) r where r > v_cur;
      if v_next is null or v_off.value <> v_next then
        perform public.hr_reject('rung_skipped',
          jsonb_build_object('unlock', v_off.unlock_id, 'have', v_cur,
                             'wanted', v_off.value, 'next', v_next));
      end if;
    end if;

    -- (e) THE PREREQUISITES. Read from the generated catalogue, compared
    --     against the character's OWN server-side state.
    --
    --     ⚠ THE PROPERTY TIER IS DERIVED THE SAME WAY hr_perks_of DERIVES IT —
    --       max over the `property` namespace — rather than from a column
    --       somebody keeps in step. A second definition of "what tier is this
    --       player" is a second answer.
    if coalesce(v_off.req_property_tier, 0) > 0 then
      select coalesce(max(pp.value), 0) into v_tier
        from public.player_progress pp
        join public.hr_unlocks u
          on u.unlock_id = pp.key and u.progress_kind = pp.kind
       where pp.user_id = v_uid and pp.slot = v_slot and pp.period_key = ''
         and u.namespace = 'property';
      if v_tier < v_off.req_property_tier then
        perform public.hr_reject('prereq_property_tier',
          jsonb_build_object('have', v_tier, 'need', v_off.req_property_tier,
                             'offer', v_off.offer_id));
      end if;
    end if;

    -- The blueprint is REQUIRED and CONSUMED, exactly as src/legacy.js
    -- upgradeRoom consumes it. It is charged below with the rest of the item
    -- cost; here it only has to be present, so that "you need a blueprint" is a
    -- different answer from "you are short of oak logs".
    if v_off.req_item is not null then
      select coalesce(qty, 0) into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = v_off.req_item;
      if coalesce(v_have, 0) < 1 then
        perform public.hr_reject('prereq_item',
          jsonb_build_object('item_id', v_off.req_item, 'offer', v_off.offer_id));
      end if;
    end if;

    -- (f) THE DEBITS. Gold first, then every item line, then the blueprint.
    --     Nothing here is a number the caller supplied.
    if v_st.gold < v_off.gold then
      perform public.hr_reject('insufficient_gold',
        jsonb_build_object('have', v_st.gold, 'need', v_off.gold));
    end if;

    for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                    from jsonb_each_text(coalesce(v_off.items, '{}'::jsonb)) loop
      if v_n <= 0 then continue; end if;
      select qty into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = k for update;
      v_have := coalesce(v_have, 0);
      if v_have < v_n then
        perform public.hr_reject('insufficient_item',
          jsonb_build_object('item_id', k, 'have', v_have, 'need', v_n));
      end if;
      if v_have = v_n then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = k;
      else
        update public.player_inventory set qty = v_have - v_n
         where user_id = v_uid and slot = v_slot and item_id = k;
      end if;
    end loop;

    if v_off.req_item is not null then
      select qty into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = v_off.req_item for update;
      v_have := coalesce(v_have, 0);
      if v_have < 1 then
        -- Reachable only if the blueprint was ALSO an item cost line and the
        -- loop above spent the last one. Refused rather than silently skipped:
        -- a consumed prerequisite that was not there is a free upgrade.
        perform public.hr_reject('insufficient_item',
          jsonb_build_object('item_id', v_off.req_item, 'have', v_have, 'need', 1));
      end if;
      if v_have = 1 then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_off.req_item;
      else
        update public.player_inventory set qty = v_have - 1
         where user_id = v_uid and slot = v_slot and item_id = v_off.req_item;
      end if;
    end if;

    -- (g) THE GRANT. `greatest` is written out even though (c) already refuses
    --     a downgrade, because the two protect different things: (c) is the
    --     PURCHASE decision ("you own this"), this is the STORAGE rule ("a
    --     level never goes backwards"), and the storage guard trigger will
    --     refuse a regression whatever this statement says. Three independent
    --     statements of one invariant, none of them load-bearing alone.
    insert into public.player_progress as pp (user_id, slot, kind, key, period_key, value)
      values (v_uid, v_slot, v_cat.progress_kind, v_off.unlock_id, '', v_off.value)
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = greatest(pp.value, excluded.value), updated_at = now();

    -- (h) THE STATE ROW. Gold, version, updated_at — and NOTHING ELSE.
    --     ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so
    --       the unpaid accrual window survives it; stamping it here would
    --       confiscate every buyer's elapsed time, silently (intents.js rule 3).
    update public.player_state
       set gold = gold - v_off.gold,
           version = version + 1,
           updated_at = now()
     where user_id = v_uid and slot = v_slot;

    -- (i) THE JOURNAL. ONE row, kind='shop' — the same kind shop_buy and
    --     vendor_sell file under, because the rollup groups on `kind` and this
    --     is the same surface: the NPC shop. The direction is in the signed
    --     gold. `gold_in`/`xp_in`/`qty_in` are ZERO and written explicitly:
    --     NULL in those columns means "not written by hr_apply", and this row
    --     WAS written by an engine RPC — it consumed no inflow budget because
    --     it minted nothing, which is a different fact from "unstamped".
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
    values
      (v_uid, v_slot, 'shop', v_intent, -v_off.gold, 0, 0, 0,
       jsonb_build_object('offer', v_off.offer_id, 'unlock', v_off.unlock_id,
                          'rung', v_off.value, 'prev', v_cur,
                          'items', coalesce(v_off.items, '{}'::jsonb),
                          'blueprint', v_off.req_item));

    -- (j) WHAT THE SERVER CHARGED, STATED BY THE SERVER (Security C4).
    --     The Edge Function renders a receipt for this purchase and it must not
    --     build one out of its own catalogue: two copies of a price is one copy
    --     too many, and the copy the player SEES would then be the one nobody
    --     re-validates. A receipt built from this object is correct even when
    --     the Edge catalogue is stale, wrong, or has drifted from the table the
    --     charge came out of — tests/unlock-buy.mjs proves exactly that by
    --     mutating the Edge price and requiring the receipt to stay right.
    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('charged', jsonb_build_object(
                  'offer',  v_off.offer_id,
                  'name',   v_off.name,
                  'unlock', v_off.unlock_id,
                  'rung',   v_off.value,
                  -- POSITIVE here (what was taken); the Edge renders it
                  -- negative, the same sign its delta would have carried.
                  'gold',   v_off.gold,
                  'items',  coalesce(v_off.items, '{}'::jsonb),
                  'blueprint', v_off.req_item));

  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    -- The storage guard raises check_violation ON PURPOSE (artisan model §3) so
    -- that it lands here rather than escaping as a 500. If it ever fires, this
    -- function proposed a row the guard refused — an engine bug, reported with
    -- its sqlstate rather than swallowed.
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_unlock_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- ── (5) RECORD THE DECISION under the key, OUTSIDE the protected block so it
  --        survives a rejection — and RELEASE the key on a version conflict,
  --        b346's rule and for b346's reason: a version conflict is a statement
  --        about the caller's READ, it rolled back in full, and the defined
  --        recovery is "re-read and try again". Storing it turns an ordinary
  --        concurrency outcome into a 25-hour lockout for that key. Narrow:
  --        `v_claimed` means THIS call inserted the row, so a mismatch against
  --        somebody's stored SUCCESS can never free it.
  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true)
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;

  return v_out;
end $$;

-- ── 2. GRANTS — revoke from PUBLIC first, then grant ─────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL adds anon/authenticated/service_role. `create or replace`
-- PRESERVES an existing ACL, so these are restated unconditionally.
--
-- ⚠ IF THE BROWSER COULD CALL THIS, THE BROWSER COULD BUY THE GREAT HEARTH.
--   Not because it could name a price — it cannot — but because the whole
--   purchase would be one call it makes for itself, with p_user its own id and
--   the gold check the only thing between it and every room in the game. The
--   client sends an INTENT to the Edge Function; the Edge Function is the only
--   caller here.
revoke execute on function public.hr_unlock_buy(uuid, int, bigint, uuid, text) from public;
revoke execute on function public.hr_unlock_buy(uuid, int, bigint, uuid, text)
  from anon, authenticated, service_role;
grant execute on function public.hr_unlock_buy(uuid, int, bigint, uuid, text) to hr_engine;

-- ── 3. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
do $$
declare v_p oid; v_bad text; v_n int;
begin
  v_p := to_regprocedure('public.hr_unlock_buy(uuid,int,bigint,uuid,text)');
  if v_p is null then raise exception 'hr_unlock_buy did not install'; end if;

  -- (a) THE ACL. Enumerated, not summarised: "not executable by authenticated"
  --     was true of hr_apply's first revision too, three other ways.
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_unlock_buy is EXECUTABLE BY % — a client that can call it can buy a '
                      'permanent capability for itself with no Edge Function in the way', v_bad;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_unlock_buy is not executable by hr_engine — the only legitimate caller '
                    'cannot call it, so every purchase would 42883 and the verb is inert';
  end if;
  if (select prosecdef from pg_proc where oid = v_p) is not true then
    raise exception 'hr_unlock_buy is not SECURITY DEFINER — hr_engine holds no table grants, so '
                    'every statement in it would be permission denied';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc where oid = v_p),
                                               array[]::text[])) c where c like 'search_path=%') then
    raise exception 'hr_unlock_buy has no pinned search_path — a SECURITY DEFINER function without '
                    'one is a search_path hijack';
  end if;
  if (select provolatile from pg_proc where oid = v_p) <> 'v' then
    raise exception 'hr_unlock_buy is not VOLATILE. It writes; a STABLE declaration would let '
                    'PostgREST run it in a READ-ONLY transaction and every purchase would fail';
  end if;

  -- (b) NO NEW CLIENT WRITE SURFACE. The verb writes player_progress,
  --     player_state, player_inventory and player_ledger; if a client could
  --     write any of them directly, none of the above matters.
  select string_agg(table_name || ':' || privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('player_progress','player_state','player_inventory','player_ledger')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception 'client/engine write grants on the tables this verb owns: %', v_bad;
  end if;

  -- (c) THE ENGINE STILL HOLDS NO TABLE PRIVILEGE. This file grants it a
  --     FUNCTION; the capability pin is that it holds nothing else.
  select string_agg(table_name || ':' || privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where grantee = 'hr_engine' and table_schema = 'public';
  if v_bad is not null then
    raise exception 'hr_engine gained table privileges (%) — the capability pin is broken', v_bad;
  end if;

  -- (d) THE PRICE TABLE IS NOT CLIENT-WRITABLE. It is world-READABLE by design
  --     (it is the same price the shop screen renders) and a client INSERT on it
  --     would be a client-authored price on a permanent capability.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_unlock_offers'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on hr_unlock_offers', v_n; end if;

  raise notice 'b354 §3 PASSED: the ACL, SECURITY DEFINER + pinned search_path + VOLATILE, no '
               'client write surface on the four tables it owns, the engine capability pin, and '
               'a read-only price catalogue.';
end $$;

-- ── 4. THE ENGINE CAPABILITY ALLOWLIST — ONE MORE REVIEWED ENTRY ─────────
-- Granting hr_engine EXECUTE on a function that is not on check (7)'s allowlist
-- makes the NIGHTLY grant-hygiene detector raise. That detector is doing its
-- job; the fix is to record the reviewed intent in the one place that expresses
-- it — not to widen the check and not to revoke the grant.
--
-- ⚠ THIS FILE TAKES OVER from 2026-08-16-engine-allowlist-claim-perks.sql as
--   the last file that may `create or replace` hr_assert_grant_hygiene. The
--   body below is THAT FILE'S, extracted programmatically by
--   tools/derive-grant-hygiene.mjs (link 2 of the chain) and patched at the
--   SAME single anchor — an insertion at the head of c_engine_allow, so the
--   declared-removals list for this link in tests/run-sql-tests.mjs PART 1f-ii
--   stays EMPTY: nothing of the base body may go.
--
-- ── THE CLAIM THE NEW ENTRY MAKES, RE-DERIVED ───────────────────────────
-- 2026-08-11-grant-hygiene.sql sets the bar on c_engine_allow: "Adding an entry
-- is a CLAIM: read-only or self-validating, and it accepts no target the caller
-- is not already authorised for. Re-derive that for the whole list every time
-- it changes." hr_unlock_buy is the FIRST WRITER added to this list since
-- hr_apply itself, so the first half of the claim is answered differently and
-- has to be answered honestly:
--
--   NOT READ-ONLY — it is a writer, and the list already holds two others
--   (hr_apply, market_expire), each admitted on the SECOND clause rather than
--   the first. So the claim rests entirely on SELF-VALIDATING, and here is what
--   that means concretely, each item checkable in §1's body:
--     · its whole client-reachable surface is ONE OFFER ID, which is a primary
--       key lookup in a generated, world-readable, client-unwritable table. It
--       takes no price, no quantity, no item, no rung and no timestamp;
--     · every number it writes comes from that table or from the character's
--       own row read under the same advisory lock hr_apply takes;
--     · the row it writes is additionally policed by an INDEPENDENT trigger
--       (player_progress_unlock_guard) that refuses an off-ladder rung, a
--       regression and a mis-filed kind whatever this function proposes;
--     · it is clamped per call (one rung, one offer) and per DAY (20 unlocks,
--       read from the append-only ledger), so a compromised engine's reachable
--       damage is bounded in the dimension a rate limit does not bound.
--   NO NEW TARGET: p_user is a parameter the engine already passes to hr_apply
--   and hr_state_of. It grants no authority beyond what the holder of hr_apply
--   already has — which is the honest form of that clause, and the only one
--   worth writing down: every entry on this list from hr_apply down takes the
--   user as an argument.
--   WHY THE ENGINE NEEDS IT: because hr_apply structurally cannot write a
--   level, and a permanent unlock that no server RPC can write is a client-
--   authored permanent capability. That is the hole this file closes.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- writes, but only the "return the lapsed seller's own goods" path, capped at 200
    'market_expire(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb) into v_client_trunc
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 5. THE ALLOWLIST LANDED, AND THE DETECTOR STILL FIRES ────────────────
do $$
declare v jsonb; v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';
  if position('''hr_unlock_buy(uuid,integer,bigint,uuid,text)''' in v_src) = 0 then
    raise exception 'the installed detector does not carry the hr_unlock_buy allowlist entry — the '
                    'derivation did not land, and the nightly cron run will raise on this file''s '
                    'own grant';
  end if;
  -- The two entries the PREVIOUS link added must still be there. A self-check
  -- that tests only its own file's terms cannot detect a later file undoing an
  -- earlier one — which is the clan_members "join as self" defect.
  if position('''hr_claim_lookup(uuid,integer,text,text)''' in v_src) = 0
     or position('''hr_perks_of(uuid,integer)''' in v_src) = 0 then
    raise exception 'the installed detector LOST an entry recorded by '
                    '2026-08-16-engine-allowlist-claim-perks.sql — this file was derived from the '
                    'wrong base and has silently deleted a reviewed capability';
  end if;

  v := public.hr_assert_grant_hygiene(false);
  if (v->'engine_execute_outside_allowlist') @> '["hr_unlock_buy(uuid,integer,bigint,uuid,text)"]'::jsonb then
    raise exception 'check (7) still reports hr_unlock_buy — report=%',
      (v->'engine_execute_outside_allowlist')::text;
  end if;

  -- STRICT, over all nine checks. This file adds a SECURITY DEFINER writer and
  -- a grant; if either was born reachable, this is what says so.
  v := public.hr_assert_grant_hygiene(true);
  raise notice 'b354 §5 PASSED: grant hygiene STRICT passes with hr_unlock_buy recorded.';
end $$;

-- ── 6. BEHAVIOUR — every refusal paired with a control ───────────────────
-- "The function exists" is a catalog row. What the game depends on is that a
-- Kitchen rung LANDS and REACHES hr_perks_of, that a double buy takes no gold,
-- that a skipped rung is refused, and that a replay pays once. Each refusal is
-- bracketed by the nearest LEGAL purchase, which must succeed — a guard that
-- only proves the function says NO would pass just as happily against one that
-- says no to everything.
do $$
declare
  v_uid   uuid := '00000000-0000-4000-8000-000000b35401';
  v_r     jsonb;
  v_ver   bigint;
  v_gold  bigint;
  v_g0    bigint;
  v_off   public.hr_unlock_offers%rowtype;
  v_off2  public.hr_unlock_offers%rowtype;
  v_key   uuid;
  v_n     int;
  k       text;
  v_qty   bigint;
  v_acc   timestamptz;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception '§6 CANNOT RUN: hr_create_character is missing — apply '
                    '2026-08-14-character-bootstrap.sql first. A skipped check is not a passed one.';
  end if;

  -- DRIVE THE REAL CATALOGUE. The first Kitchen rung specifically, because it is
  -- the purchase this whole file exists for; and a HIGHER rung of the same room
  -- for the skip probe.
  select * into v_off from public.hr_unlock_offers
   where refusal is null and unlock_id = 'room:kitchen' and value = 1;
  if not found then raise exception '§6 CANNOT RUN: room:kitchen rung 1 is not sellable'; end if;
  select * into v_off2 from public.hr_unlock_offers
   where refusal is null and unlock_id = 'room:kitchen' and value = 3;
  if not found then raise exception '§6 CANNOT RUN: room:kitchen rung 3 is not sellable'; end if;
  if v_off.req_property_tier <= 0 then
    raise exception '§6 CANNOT RUN: room:kitchen rung 1 carries no property-tier gate, so probe (a) '
                    'would prove nothing and (b) would then fail as already_owned. Regenerate '
                    '2026-08-16-unlock-offers.generated.sql and read the diff.';
  end if;

  begin  -- ── SUBTRANSACTION, rolled back ────────────────────────────────
    insert into auth.users (id) values (v_uid);
    -- The claim STAYS SET for the whole block: this migration runs as the owner,
    -- not as hr_engine, so hr_unlock_buy's identity seam correctly reads
    -- auth.uid() rather than honouring p_user. Probing it any other way would
    -- test a path no caller takes.
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok', v_r->>'created', 'false') <> 'true' then
      raise exception '§6: no probe character: %', v_r;
    end if;

    -- Stock the character: gold, four times every item the Kitchen ladder
    -- charges, and every blueprint it requires. The property tier is granted by
    -- a direct INSERT — it is the FIXTURE for probe (a), not the thing under
    -- test, and the storage guard polices it either way.
    update public.player_state set gold = 1000000 where user_id = v_uid and slot = 0;
    for k, v_qty in select e.item_id, max(coalesce(nullif(e.qty,'')::bigint,0))
                      from public.hr_unlock_offers o,
                           jsonb_each_text(o.items) as e(item_id, qty)
                     where o.refusal is null and o.unlock_id = 'room:kitchen'
                     group by e.item_id loop
      insert into public.player_inventory (user_id, slot, item_id, qty)
        values (v_uid, 0, k, v_qty * 4)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    end loop;
    for k in select req_item from public.hr_unlock_offers
              where refusal is null and unlock_id = 'room:kitchen' and req_item is not null loop
      insert into public.player_inventory (user_id, slot, item_id, qty)
        values (v_uid, 0, k, 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    end loop;

    -- (a) THE PREREQUISITE BITES BEFORE ANYTHING ELSE. A camp has no Kitchen,
    --     and the server is the one that knows it.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), v_off.offer_id);
    if coalesce(v_r->>'ok','false') = 'true' then
      raise exception '§6(a): a Kitchen rung was sold at property tier 0, which needs tier %. '
                      'The homestead gate is the only thing between a rich player and every room '
                      'in the game.', v_off.req_property_tier;
    end if;
    if v_r->>'error' is distinct from 'prereq_property_tier' then
      raise exception '§6(a): expected prereq_property_tier, got % — refused for the wrong '
                      'reason means the protection is accidental', v_r;
    end if;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'property:homestead', '', 1);

    -- (b) CONTROL — THE LEGAL PURCHASE LANDS, AND REACHES THE PERK ENVELOPE.
    select version, gold, accrued_to into v_ver, v_g0, v_acc
      from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), v_off.offer_id);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§6(b) CONTROL FAILED: the legal purchase of % was refused (%). Every '
                      'refusal below would then prove nothing.', v_off.offer_id, v_r;
    end if;
    select gold into v_gold from public.player_state where user_id=v_uid and slot=0;
    if v_gold <> v_g0 - v_off.gold then
      raise exception '§6(b): gold moved % -> % for a % gold offer', v_g0, v_gold, v_off.gold;
    end if;
    -- ⚠ THE WINDOW SURVIVED THE PURCHASE. hr_apply stamps accrued_to on any
    --   delta carrying `equip` or `activity`; this verb must stamp it on
    --   nothing, or every buyer silently forfeits the time since their last
    --   collect (intents.js rule 3, the UNDER-payment half).
    if (select accrued_to from public.player_state where user_id=v_uid and slot=0)
       is distinct from v_acc then
      raise exception '§6(b): the purchase MOVED accrued_to (% -> %). A purchase is not an activity '
                      'change, and stamping it confiscates the unpaid accrual window — silently, '
                      'with ok:true.', v_acc,
                      (select accrued_to from public.player_state where user_id=v_uid and slot=0);
    end if;
    v_r := public.hr_perks_of(v_uid, 0);
    if (v_r->'rooms'->>'kitchen')::int is distinct from 1 then
      raise exception '§6(b): the rung was written but hr_perks_of reads rooms.kitchen = % — the '
                      'purchase pays nothing and noBurn never reaches the engine',
                      coalesce(v_r->'rooms'->>'kitchen','ABSENT');
    end if;

    -- (c) A DOUBLE BUY IS REFUSED BY NAME AND TAKES NO GOLD. This is the
    --     GREATEST-vs-+= arm: with an additive merge the second purchase would
    --     stand in rung 2, which is the 2,000g Iron Stove for 500 gold.
    select version, gold into v_ver, v_g0 from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), v_off.offer_id);
    if coalesce(v_r->>'ok','false') = 'true' then
      raise exception '§6(c): the same rung was sold twice (%)', v_r;
    end if;
    if v_r->>'error' is distinct from 'already_owned' then
      raise exception '§6(c): expected already_owned, got %', v_r;
    end if;
    select gold into v_gold from public.player_state where user_id=v_uid and slot=0;
    if v_gold <> v_g0 then
      raise exception '§6(c): a REFUSED purchase moved gold % -> %. The rejection must roll back '
                      'in full.', v_g0, v_gold;
    end if;
    select value into v_qty from public.player_progress
     where user_id=v_uid and slot=0 and kind='unlock' and key='room:kitchen' and period_key='';
    if v_qty <> 1 then
      raise exception '§6(c) THE MERGE IS ADDITIVE: room:kitchen reads % after buying rung 1 '
                      'twice. GREATEST(existing, granted) is the contract; `+=` sells the rung '
                      'above for the rung below''s price.', v_qty;
    end if;

    -- (d) A SKIPPED RUNG IS REFUSED BY NAME — with rung 2 unowned, rung 3 is
    --     not the next rung, and the ladder comes from the catalogue.
    select version, gold into v_ver, v_g0 from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), v_off2.offer_id);
    if coalesce(v_r->>'ok','false') = 'true' then
      raise exception '§6(d): rung 3 was sold to a character holding rung 1 (%)', v_r;
    end if;
    if v_r->>'error' is distinct from 'rung_skipped' then
      raise exception '§6(d): expected rung_skipped, got %', v_r;
    end if;
    select gold into v_gold from public.player_state where user_id=v_uid and slot=0;
    if v_gold <> v_g0 then raise exception '§6(d): a refused skip moved gold'; end if;

    -- (e) REPLAY IS EXACTLY ONCE. The second call under the same key answers
    --     replayed and moves nothing — the property a client retry depends on.
    select version, gold into v_ver, v_g0 from public.player_state where user_id=v_uid and slot=0;
    v_key := gen_random_uuid();
    select * into v_off2 from public.hr_unlock_offers
     where refusal is null and unlock_id = 'room:kitchen' and value = 2;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, v_off2.offer_id);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§6(e) CONTROL FAILED: rung 2 was refused (%)', v_r;
    end if;
    select gold into v_gold from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, v_off2.offer_id);
    if coalesce(v_r->>'replayed','false') <> 'true' then
      raise exception '§6(e): the replay was not reported as one (%)', v_r;
    end if;
    select gold into v_g0 from public.player_state where user_id=v_uid and slot=0;
    if v_g0 <> v_gold then
      raise exception '§6(e): THE REPLAY CHARGED AGAIN — gold % -> %. Exactly-once is the whole '
                      'contract of an idempotency key.', v_gold, v_g0;
    end if;

    -- (f) A STALE VERSION IS REFUSED — and the key is RELEASED, so the retry
    --     the error asks for can actually succeed.
    v_key := gen_random_uuid();
    v_r := public.hr_unlock_buy(v_uid, 0, 1, v_key, v_off2.offer_id);
    if v_r->>'error' is distinct from 'version_conflict' then
      raise exception '§6(f): expected version_conflict on a stale version, got %', v_r;
    end if;
    if exists (select 1 from public.player_intents where user_id=v_uid and intent_id=v_key) then
      raise exception '§6(f): the key was NOT released after a version conflict — every retry with '
                      'it answers the same refusal for up to 25 hours (b346)';
    end if;

    -- (g) POVERTY IS REFUSED BY NAME, and nothing moves.
    update public.player_state set gold = 1 where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    select * into v_off2 from public.hr_unlock_offers
     where refusal is null and unlock_id = 'room:kitchen' and value = 3;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), v_off2.offer_id);
    if v_r->>'error' is distinct from 'insufficient_gold' then
      raise exception '§6(g): expected insufficient_gold, got %', v_r;
    end if;
    select value into v_qty from public.player_progress
     where user_id=v_uid and slot=0 and kind='unlock' and key='room:kitchen' and period_key='';
    if v_qty <> 2 then
      raise exception '§6(g): a refused purchase granted the rung anyway (kitchen = %)', v_qty;
    end if;

    -- (h) AN UNSELLABLE OFFER IS REFUSED BY NAME, WITH THE REASON — and an
    --     unknown one is a DIFFERENT answer.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    select offer_id into k from public.hr_unlock_offers where refusal is not null order by offer_id limit 1;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), k);
    if v_r->>'error' is distinct from 'offer_unsupported' then
      raise exception '§6(h): a refused offer (%) answered % — a player told "unknown offer" about '
                      'a real purchase files a bug against the wrong system', k, v_r;
    end if;
    if v_r->'detail'->>'reason' is null then
      raise exception '§6(h): offer_unsupported carried no reason';
    end if;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'room.not_a_room.9');
    if v_r->>'error' is distinct from 'unknown_offer' then
      raise exception '§6(h): an offer that does not exist answered %', v_r;
    end if;

    -- (i) THE JOURNAL. TWO rows — rung 1 and rung 2 — and not one for any of the
    --     six refusals: a rejection rolls back in full, journal row included.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = 0 and kind = 'shop' and intent like 'unlock\_buy:%';
    if v_n <> 2 then
      raise exception '§6(i): the ledger holds % unlock_buy rows, expected 2 (rung 1 and rung 2, '
                      'and nothing for any of the six refusals). A journalled refusal and a missing '
                      'journal row both break the audit this table exists for.', v_n;
    end if;
    if exists (select 1 from public.player_ledger
                where user_id = v_uid and slot = 0 and intent like 'unlock\_buy:%'
                  and (meta->>'offer') is null) then
      raise exception '§6(i): a journal row does not say WHICH offer moved the value';
    end if;
    if exists (select 1 from public.player_ledger
                where user_id = v_uid and slot = 0 and intent like 'unlock\_buy:%'
                  and (gold >= 0 or gold_in <> 0 or xp_in <> 0 or qty_in <> 0)) then
      raise exception '§6(i): an unlock purchase journalled a non-negative gold or a non-zero '
                      'inflow stamp — it mints nothing and must say so';
    end if;

    raise exception using errcode = 'HR354', message = 'b354 §6 complete — rolling back';
  exception when sqlstate 'HR354' then
    null;   -- the subtransaction is discarded; nothing above it survives
  end;

  -- The rollback is ASSERTED, not assumed.
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception '§6 LEAKED a probe row';
  end if;

  raise notice 'UNLOCK BUY OK — the homestead gate refuses a Kitchen at camp; the legal purchase '
               'lands and REACHES hr_perks_of; a double buy is already_owned with gold unmoved and '
               'the rung still 1 (the GREATEST-vs-+= arm); a skipped rung is refused by name; a '
               'replay pays exactly once; a stale version releases its key; poverty is refused; an '
               'unsellable offer is named and an unknown one is a different answer; three journal '
               'rows, all debits, no inflow stamps. Every refusal paired with a control. Zero residue.';
end $$;

-- ── 7. WHAT IS LEFT, AND WHO OWNS IT ─────────────────────────────────────
-- (1) 'artisan' IN PAYABLE_KINDS is now unblocked on this side. §9(3) of
--     2026-08-16-artisan-progress-model.sql names two conditions: the accrual
--     engine must PROPOSE a recipe-scroll grant (landed — the scroll drop
--     becomes a `flag` progress op), and ROOM PURCHASE MUST BE SERVER-OWNED.
--     This file is the second condition. The Coordinator makes the flip.
--
-- (2) THE CLIENT IS STILL THE ONLY WRITER OF ITS OWN `G.rooms`. Until the room
--     screen calls this verb, a player who buys a Kitchen in today's client has
--     no server row — the server reads noBurn 0 and a cooked night destroys
--     input the client would have kept. THAT IS UNCHANGED BY THIS FILE and it
--     is why the flip is safe only post-wipe (after the wipe no character owns
--     a room, so the two sides agree by construction from an empty state) or
--     with cooking excluded until the client seam lands. The client wiring is
--     the Systems Engineer's.
--
-- (3) FOUR NAMESPACES ARE STILL CLIENT-OWNED, BY DECISION, and each is named in
--     supabase/functions/hr-accrue/unlock-catalogue.js with its reason: plot and
--     worker (their cap is the property tier's `plots`/`workers`, which no
--     server catalogue carries — a cap that is not enforced is not a cap),
--     farm_plot_tier (priced in deeds, gated by PLOT_TIERS), and everything
--     priced in gems, Bounty Marks or real money. Extending the verb to any of
--     them means extending the GENERATED prerequisite columns first, not
--     widening the predicate.
-- ════════════════════════════════════════════════════════════════════════
do $$
begin
  raise notice 'hr_unlock_buy INSTALLED. A permanent unlock now has exactly one writer, it is '
               'engine-only, and it takes an OFFER ID rather than a price. ''artisan'' is still '
               'absent from PAYABLE_KINDS — see §7.';
end $$;
