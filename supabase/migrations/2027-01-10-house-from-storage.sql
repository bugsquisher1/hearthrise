-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-10-house-from-storage.sql — THE HOUSE BUILDS FROM STORAGE TOO (player
-- feedback, Tyler pasted 2026-10-24, tracker a42: "House upgrades - Pull these from
-- storage/stash if available, rather than needing them on each character's inventory").
-- STAGED (lane/c-house-from-storage, backend-architect, 2026-10-24). Game CLOSED:
-- applies on its passing §5 (CLAUDE.md §2). MONEY + ITEM SURFACE (a gold and material
-- sink that now consumes the ACCOUNT's Storage): on the reopen Security review list as
-- an item-consumption surface. Contract: docs/design/ARCHITECTURE_CONTRACTS.md §16 (b3).
--
-- ── THE RULE, AS BUILT ───────────────────────────────────────────────────────
--   The house (the deed and its rooms) and the storage chests are the ACCOUNT's (one
--   home per account, Tyler 2026-10-15; the depot, i.e. Storage, is account-shared,
--   Tyler 2026-10-22). A build or upgrade takes each material line from the BUILDING
--   hero's bag first and the rest from the account's Storage (account_bank), in ONE
--   transaction, all or nothing: a line that bag + Storage cannot cover refuses the
--   whole build before any row is written. The gold is the account purse's, debited
--   LAST. Every unit is journalled with its source on the build's ONE ledger row:
--     meta.from = {bag: {item: n}, storage: {item: n}}   (Σ bag + Σ storage = the cost)
--   Every other unlock namespace (bank ladder, plots, workers, companions) keeps the
--   hero's bag only: the feedback, and the ruling behind it, are about the house.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 NEW public.hr_materials_take(p_user, p_slot, p_items, p_storage) — OWNER-ONLY.
--    The ONE place a server-priced material cost leaves a hero (and, with p_storage,
--    the account's Storage). p_items is a CATALOGUE's cost map (hr_unlock_offers.items,
--    hr_storage_chests.items), never a client value. Pass 1 locks and reads every line
--    (bag row, then Storage row, in item order) and decides; pass 2 writes. Answers
--    {ok:true, from:{bag, storage}} or, having written NOTHING,
--    {ok:false, error:'insufficient_item', item_id, have, need, bag[, storage]}
--    (have = bag + storage; `storage` only when Storage was counted).
-- §2 hr_unlock_buy RESTATED WHOLE from its live image (2026-12-15-account-gold.sql;
--    prosrc 560e2540; live-hash baseline live = replay d9e0ebe3, measured 2026-10-24).
--    Only (f) moves: the item lines go through §1 (Storage on for the room and property
--    namespaces), then the blueprint (bag only, none sellable today), then the purse
--    LAST; the journal row and `charged` carry `from`. Everything else is the live text.
-- §3 hr_storage_chest_build RESTATED WHOLE from its live image (2026-11-28-storage-chests.sql,
--    prosrc 7c88fe77; its only writer, applied 2026-10-22, not tracked by live-hash-drift).
--    The same refusals, now inside ONE protected block after the key is claimed under the
--    hero lock: already_built, needs_previous_chest {need}, needs_property_tier {have, need},
--    quote_changed {depot}, then §1 with Storage, then the purse LAST (hr_purse_move), the
--    chest row, the version, ONE ledger row (kind shop, intent storage_chest:<id>, gold_kind
--    storage, the stated purse, meta.from). It no longer pays through hr_apply: hr_apply can
--    only debit a bag, and its gold debit would take the purse BEFORE a Storage debit made
--    after it (purse not last), or leave a Storage debit standing beside its refusal.
--
-- ── ERROR TAXONOMY (what a caller can be told) ──────────────────────────────
--   hr_unlock_buy: unchanged codes. insufficient_item now carries {item_id, have, need, bag,
--     storage} for the house (have = bag + Storage), {item_id, have, need, bag} elsewhere.
--     An item shortfall is now said before a gold shortfall (the materials are decided first).
--   hr_storage_chest_build: not_signed_in · bad_slot · bad_idem · bad_intent · intent_mismatch
--     (replay) · rate_limited · unknown_chest · no_character · intent_in_flight (NEW: the key
--     is claimed and undecided) · already_built · needs_previous_chest {need} ·
--     needs_property_tier {have, need} · quote_changed {depot} · insufficient_item {item_id,
--     have, need, bag, storage} · insufficient_gold {have, need}. Every code from
--     already_built on is recorded under the key: the same key answers the same decision.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   ONE LOCK ORDER for every write an account shares (Security, marketplace threat model
--   2026-10-24 #3; PRIORITY_BOARD): the HERO (advisory uid:slot, then its player_state
--   row) -> [the HOME key 'hr:home:'||uid, unlock_buy's house namespaces only] -> the
--   account DEPOT key 'hr:depot:'||uid (hr_bank_move's) -> the bag rows -> the Storage
--   rows -> the account PURSE (hr_purse_move's wallet row lock), LAST; nothing takes a
--   lock after the purse. hr_materials_take re-takes the hero locks itself (a no-op when
--   held), so a future caller cannot invert the order by forgetting them. §5(a) asserts
--   the order in all three bodies by reading their source.
--   WHY IT CANNOT CYCLE: every writer of account_bank holds the depot key (hr_bank_move,
--   this file); every writer of a hero's bag holds that hero's row; nothing that holds the
--   depot key or the purse waits for a hero, the home or the depot; a hunt instance takes
--   its heroes, then purses in user order, and never the depot. Two heroes of one account
--   building at once queue on the home key (deed, rooms) or the depot key (chests): the
--   second sees the first's debits, and is refused insufficient_item when the shared
--   Storage can no longer cover it. A build racing a Storage deposit or withdrawal by
--   another hero queues on the depot key: it sees the Storage before or after, never half.
--   TRUE CONCURRENCY is unverified (PGlite is one backend; no branch database here): the
--   order is proven by source and by single-backend execution, not by a race.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
--   hr_unlock_buy: unchanged (its own claim on player_intents, intent
--   'unlock_buy:<offer>:<rung>'; a replay answers the first decision and moves nothing;
--   only version_conflict releases the key). hr_storage_chest_build: the key is now
--   claimed by the verb itself (intent 'storage_chest:<id>', per key, intent and slot,
--   hr_intent_replay's rule) under the hero lock, so a concurrent call on the same key
--   reads the first one's committed decision instead of building again.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +0 client RPCs, +0 engine RPCs (hr_materials_take is owner-only, asserted §5).
--   NEW: a house build consumes items any hero of the account deposited — the ruling (the
--   home and the Storage are both the account's). It crosses no account: every row is
--   keyed by the verified user (auth.uid(), or the engine's verified subject for
--   hr_unlock_buy), and the cost map is the server catalogue's. It can only REMOVE items
--   (a sink); nothing is minted, priced or returned. A hero can now spend Storage a
--   sibling hero filled, which the Storage window already allows (withdraw) — no new
--   capability, one fewer step. For the reopen Security list: item consumption from
--   account_bank by hr_unlock_buy (house namespaces) and hr_storage_chest_build.
--   CLOSED: hr_storage_chest_build's gold debit no longer lands before its materials.
--
-- ── COST (100x players, ~4,400 accounts) ───────────────────────────────────
--   NO new table, column or index. NO new ledger rows: the build's existing one row gains
--   meta.from (~40-80 bytes). A whole house ladder is 45 offers + 4 chests per account,
--   EVER, so the ceiling is ~49 rows per account lifetime (~200k rows, ~60 MB at 100x).
--   Per build: one extra Storage PK probe per material line (<= 6) under a lock the
--   account already serialises on. Non-house unlock purchases take no new lock.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Re-apply the pre-images: hr_unlock_buy from 2026-12-15-account-gold.sql (§4) and
--   hr_storage_chest_build from 2026-11-28-storage-chests.sql (§4) — byte for byte, the
--   pins below name them — then drop hr_materials_take. No data to undo: every unit a
--   build took is in its ledger row's meta.from (bag or Storage) and meta.items.
-- ORDER: after 2027-01-01-server-perf.sql (the newest APPLIED file); before any
--   2027-01-12 lane. A later lane that restates a body pinned here re-derives it.
-- AFTER APPLYING: live-hash-drift wants hr_unlock_buy re-measured (and, if the sweep
--   now tracks them, hr_storage_chest_build and hr_materials_take). No edge deploy: the
--   edge forwards only the offer id and renders `charged` field by field (it ignores
--   `from`). The client half (the House window's bag + Storage counts) rides the next release.
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each restated body must be EXACTLY its live image or this file's own post-image (a
-- second apply). Anything else means another lane moved it in the meantime: refuse,
-- never clobber.
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.account_bank') is null or to_regclass('public.account_storage_chests') is null
     or to_regclass('public.hr_storage_chests') is null or to_regclass('public.hr_unlock_offers') is null
     or to_regclass('public.account_wallet') is null or to_regclass('public.player_intents') is null then
    raise exception 'PRECONDITION: account_bank / account_storage_chests / hr_storage_chests / hr_unlock_offers / account_wallet / player_intents absent'; end if;
  if to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null or to_regprocedure('public.hr_purse_of(uuid)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_reject(text,jsonb)') is null or to_regprocedure('public.hr_depot_view(uuid,integer)') is null
     or to_regprocedure('public.hr_account_property_tier(uuid)') is null then
    raise exception 'PRECONDITION: the purse helpers (2026-12-15-account-gold.sql), the depot readers (2026-11-28-storage-chests.sql) or the house lock helpers are absent'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)');
  if v_md5 is distinct from '560e254057af74da83dee08b013c0b48' and v_md5 is distinct from 'b5c061822ea3a55941e44c2e4e5967f9' then
    raise exception 'PIN: hr_unlock_buy is neither its live image (2026-12-15-account-gold.sql, 560e2540...) nor this file''s (b5c06182...) - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_storage_chest_build(integer,text,bigint,uuid)');
  if v_md5 is distinct from '7c88fe77708d219ddce2520348e43e5a' and v_md5 is distinct from '2f0de0d42158356579cb3ccb87277fc4' then
    raise exception 'PIN: hr_storage_chest_build is neither its live image (2026-11-28-storage-chests.sql, 7c88fe77...) nor this file''s (2f0de0d4...) - md5 %', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)');
  if v_md5 is not null and v_md5 is distinct from '230f848fb81c87c270fa560987e3d618' then
    raise exception 'PIN: hr_materials_take exists and is not this file''s (230f848f...) - md5 %', v_md5; end if;
end $mig$;

-- ── §1 THE ONE MATERIAL TAKE: THE HERO'S BAG FIRST, THEN (THE HOUSE) THE ACCOUNT'S STORAGE ──
create or replace function public.hr_materials_take(p_user uuid, p_slot integer, p_items jsonb, p_storage boolean)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $fn$
-- 2027-01-10-house-from-storage.sql. p_items is a server CATALOGUE's cost map {item: qty}
-- (hr_unlock_offers.items, hr_storage_chests.items), never a client value. Each line comes
-- from the hero's bag first; with p_storage (the house: deed, rooms, chests, all the
-- account's) the rest comes from the account's Storage (account_bank). ALL OR NOTHING:
-- pass 1 locks and reads every line and refuses before any write; pass 2 writes. Owner-only:
-- its callers are SECURITY DEFINER bodies that own the transaction and say the refusal.
declare
  r      record;
  l      jsonb;
  v_bag  bigint;
  v_sto  bigint;
  v_take bigint;
  v_plan jsonb := '[]'::jsonb;
  v_from_bag jsonb := '{}'::jsonb;
  v_from_sto jsonb := '{}'::jsonb;
begin
  if p_user is null or p_slot is null or p_storage is null then
    raise exception 'hr_materials_take: no hero or no source rule'; end if;
  -- THE LOCK ORDER (one order for every write an account shares; Security, marketplace
  -- threat model 2026-10-24 #3): the HERO (its advisory key, then its player_state row) ->
  -- the account DEPOT (hr_bank_move's key) -> the bag rows -> the Storage rows -> (the
  -- caller) the account PURSE, last. Re-taking a lock this transaction holds is a no-op.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_slot::text, 0));
  perform 1 from public.player_state where user_id = p_user and slot = p_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if p_storage then
    perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || p_user::text, 0));
  end if;
  -- PASS 1: every line in item order, read under its row lock; the whole cost is decided here.
  for r in select t.key as item, coalesce(nullif(t.value, '')::bigint, 0) as need
             from jsonb_each_text(coalesce(p_items, '{}'::jsonb)) as t(key, value)
            order by t.key loop
    continue when r.need <= 0;
    select i.qty into v_bag from public.player_inventory i
     where i.user_id = p_user and i.slot = p_slot and i.item_id = r.item for update;
    v_bag := coalesce(v_bag, 0);
    v_sto := 0;
    if p_storage then
      select b.qty into v_sto from public.account_bank b
       where b.user_id = p_user and b.item_id = r.item for update;
      v_sto := coalesce(v_sto, 0);
    end if;
    if v_bag + v_sto < r.need then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item', 'item_id', r.item,
                                'have', v_bag + v_sto, 'need', r.need, 'bag', v_bag)
             || case when p_storage then jsonb_build_object('storage', v_sto) else '{}'::jsonb end;
    end if;
    v_take := least(v_bag, r.need);
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('item', r.item, 'bag', v_take, 'bag_held', v_bag,
                                                             'storage', r.need - v_take, 'storage_held', v_sto));
  end loop;
  -- PASS 2: the writes. A stack that reaches 0 is deleted (qty > 0 is both tables' CHECK).
  for l in select value from jsonb_array_elements(v_plan) loop
    if (l->>'bag')::bigint > 0 then
      if (l->>'bag')::bigint = (l->>'bag_held')::bigint then
        delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = l->>'item';
      else
        update public.player_inventory set qty = qty - (l->>'bag')::bigint
         where user_id = p_user and slot = p_slot and item_id = l->>'item';
      end if;
      v_from_bag := v_from_bag || jsonb_build_object(l->>'item', (l->>'bag')::bigint);
    end if;
    if (l->>'storage')::bigint > 0 then
      if (l->>'storage')::bigint = (l->>'storage_held')::bigint then
        delete from public.account_bank where user_id = p_user and item_id = l->>'item';
      else
        update public.account_bank set qty = qty - (l->>'storage')::bigint, updated_at = now()
         where user_id = p_user and item_id = l->>'item';
      end if;
      v_from_sto := v_from_sto || jsonb_build_object(l->>'item', (l->>'storage')::bigint);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'from', jsonb_build_object('bag', v_from_bag, 'storage', v_from_sto));
end $fn$;
revoke all on function public.hr_materials_take(uuid, integer, jsonb, boolean) from public, anon, authenticated, service_role, hr_engine;

-- ── §2 hr_unlock_buy — RESTATED WHOLE: (f) THE MATERIALS FIRST (BAG, THEN THE HOUSE'S STORAGE), THE PURSE LAST ──
CREATE OR REPLACE FUNCTION public.hr_unlock_buy(p_user uuid, p_slot integer, p_version bigint, p_intent_id uuid, p_offer_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- BLAST RADIUS, not balance (the clan_deposit rule, and hr_apply's own).
  -- 45 sellable offers exist in the entire game and each one is once per
  -- character forever, so the LIFETIME ceiling for an honest character is 45.
  -- A day in which one character acquires 20 permanent unlocks is not play; it
  -- is an engine that has stopped being told no. Set far above honest play and
  -- far below "the whole ladder in an afternoon".
  -- per-NAMESPACE now (bank ladder is 30/lifetime) — the count in §(b) is
  -- scoped to the offer's own namespace, so a legitimate 30-rung bank climb in
  -- one day cannot be starved by (or starve) purchases in another namespace.
  c_max_unlocks_per_day constant int := 32;

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
  v_purse  bigint;
  v_take   jsonb;   -- 2027-01-10-house-from-storage.sql: what hr_materials_take took, by source
  v_day    text;
  v_today  int;
  v_rungs  int[];
  v_lvl    int;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_of(coalesce(p_user, auth.uid()), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
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

  -- HOUSE-HOME (2026-11-29-house-home.sql): the home (property tiers and rooms) is
  -- the ACCOUNT's, one per account (Tyler 2026-10-15). A home purchase also takes
  -- the account home lock AFTER the character lock (order: character -> home), so
  -- two heroes of one account buying one rung serialise: one pays, one is told
  -- already_owned.
  if v_cat.namespace in ('room', 'property') then
    perform pg_advisory_xact_lock(hashtextextended('hr:home:' || v_uid::text, 0));
  end if;

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
    --     ⚠ NAMESPACE-SCOPED (b354.1). The ceiling is per NAMESPACE, not per
    --     character-day: the bank ladder alone is 30 rungs and a player is
    --     entitled to climb it in one sitting, so a global 20/day would refuse a
    --     legitimate bank run. The count therefore joins the ledger's
    --     meta->>'unlock' back to public.hr_unlocks and keeps only rows in the
    --     SAME namespace as the offer being bought (v_cat.namespace). Cross-
    --     namespace purchases no longer contend for one budget, and each
    --     namespace still cannot exceed c_max_unlocks_per_day on its own.
    v_day := public.hr_utc_day_key(now());
    select count(*) into v_today from public.player_ledger pl
      join public.hr_unlocks u on u.unlock_id = pl.meta->>'unlock'
     where pl.user_id = v_uid and pl.slot = v_slot
       and pl.kind = 'shop' and pl.intent like 'unlock\_buy:%'
       and public.hr_utc_day_key(pl.at) = v_day
       and u.namespace = v_cat.namespace;
    if v_today >= c_max_unlocks_per_day then
      perform public.hr_reject('unlock_daily_cap',
        jsonb_build_object('used', v_today, 'limit', c_max_unlocks_per_day,
                           'day', v_day, 'namespace', v_cat.namespace));
    end if;

    -- (c) THE MERGE, AND IT IS THE WHOLE POINT: GREATEST, NEVER +=.
    --     `v_cur` is read under the row lock taken above, so two concurrent
    --     purchases of the same rung cannot both see 0.
    -- HOUSE-HOME: a home rung already held is the account's highest (any hero's row).
    select max(value) into v_cur from public.player_progress
     where user_id = v_uid and (slot = v_slot or v_cat.namespace in ('room', 'property'))
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
      -- HOUSE-HOME: the property tier is the ACCOUNT's home (the chests' gate too).
      v_tier := public.hr_account_property_tier(v_uid);
      if v_tier < v_off.req_property_tier then
        perform public.hr_reject('prereq_property_tier',
          jsonb_build_object('have', v_tier, 'need', v_off.req_property_tier,
                             'offer', v_off.offer_id));
      end if;
    end if;

    -- ⚠ THE SKILL PREREQUISITE (companion unlocks, slice 4, 2026-08-19).
    --   The FIRST gold spend gated on a SKILL LEVEL. It mirrors the property-
    --   tier gate directly above and reads the character's OWN server-side level
    --   the EXACT way hr_apply's equip and activity gates do — hr_level_from_xp
    --   over player_skills — never a client value. A missing skill row is level
    --   1 (coalesce), the same default those gates use.
    --
    --   ⚠ ORDERED AFTER RUNG-ORDER (§d), like the tier gate, ON PURPOSE: a
    --     skipped rung must answer 'rung_skipped', not 'prereq_skill_level', so
    --     the ladder failure is diagnosed as a ladder failure. (Companions are
    --     single-rung today, so this ordering is currently only a discipline —
    --     but it is the discipline the tier gate follows and the next multi-rung
    --     skill-gated ladder will depend on it.)
    --
    --   Both columns are NULL for an ungated offer, so the whole block is
    --   skipped and every existing offer is unaffected.
    if v_off.req_skill is not null then
      select public.hr_level_from_xp(s.xp) into v_lvl
        from public.player_skills s
       where s.user_id = v_uid and s.slot = v_slot and s.skill_id = v_off.req_skill;
      if coalesce(v_lvl, 1) < coalesce(v_off.req_skill_level, 0) then
        perform public.hr_reject('prereq_skill_level',
          jsonb_build_object('skill', v_off.req_skill, 'have', coalesce(v_lvl, 1),
                             'need', v_off.req_skill_level, 'offer', v_off.offer_id));
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

    -- (f) THE DEBITS: THE MATERIALS FIRST, THE PURSE LAST (2027-01-10-house-from-storage.sql).
    --     Nothing here is a number the caller supplied. Every item line goes through
    --     hr_materials_take, decided whole before any row is written: the hero's bag
    --     first and, for the HOUSE (the room and property namespaces: the ACCOUNT's
    --     home), the rest from the account's Storage; every other namespace keeps the
    --     hero's bag only. Then the blueprint (bag only; no sellable offer has one).
    --     Then the gold, the ACCOUNT purse, LAST: hr_purse_move takes its row lock and
    --     lands the debit only when it stays >= 0. ONE lock order for every write an
    --     account shares (Security, market threat model 2026-10-24 #3): the hero ->
    --     the home -> the account DEPOT -> the bag and Storage rows -> the PURSE, and
    --     nothing takes a lock after it. Any refusal raises and the handler rolls the
    --     whole block back.
    v_take := public.hr_materials_take(v_uid, v_slot, coalesce(v_off.items, '{}'::jsonb),
                                       v_cat.namespace in ('room', 'property'));
    if coalesce(v_take->>'ok', 'false') <> 'true' then
      perform public.hr_reject(coalesce(v_take->>'error', 'insufficient_item'), v_take - 'ok' - 'error');
    end if;

    if v_off.req_item is not null then
      select qty into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = v_off.req_item for update;
      v_have := coalesce(v_have, 0);
      if v_have < 1 then
        -- Reachable only if the blueprint was ALSO an item cost line and the
        -- take above spent the last one. Refused rather than silently skipped:
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

    if coalesce(v_off.gold, 0) > 0 then
      v_purse := public.hr_purse_move(v_uid, -v_off.gold, 0);
      if v_purse is null then
        perform public.hr_reject('insufficient_gold',
          jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', v_off.gold));
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

    -- (h) THE STATE ROW. Version, updated_at — and NOTHING ELSE (the gold moved at (f)).
    --     ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so
    --       the unpaid accrual window survives it; stamping it here would
    --       confiscate every buyer's elapsed time, silently (intents.js rule 3).
    update public.player_state
       set version = version + 1,
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
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, purse, gold_kind, meta)
    values
      (v_uid, v_slot, 'shop', v_intent, -v_off.gold, 0, 0, 0,
       case when coalesce(v_off.gold, 0) <> 0 then v_purse end,
       case when coalesce(v_off.gold, 0) = 0 then null
            when v_off.unlock_id like 'property:%' or v_off.unlock_id like 'room:%' then 'house'
            else 'shop' end,
       jsonb_build_object('offer', v_off.offer_id, 'unlock', v_off.unlock_id,
                          'rung', v_off.value, 'prev', v_cur,
                          'items', coalesce(v_off.items, '{}'::jsonb),
                          'blueprint', v_off.req_item,
                          -- WHICH SOURCE each unit came from (2027-01-10-house-from-storage.sql)
                          'from', v_take->'from'));

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
                  'blueprint', v_off.req_item,
                  'from',   v_take->'from'));

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
end $function$;

-- ── §3 hr_storage_chest_build — RESTATED WHOLE: BAG, THEN STORAGE, THE PURSE LAST, ONE PROTECTED BLOCK ──
create or replace function public.hr_storage_chest_build(p_slot int, p_chest text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- Restated by 2027-01-10-house-from-storage.sql from 2026-11-28-storage-chests.sql's image:
-- the materials come from the paying hero's bag first and then the ACCOUNT's Storage, and
-- the gold (the account purse) is taken LAST, in one protected block under the key.
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_c public.hr_storage_chests%rowtype;
  v_need text; v_tier int; v_take jsonb; v_purse bigint; v_out jsonb; v_msg text; v_det text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_chest is null or p_chest !~ '^[a-z0-9_]{1,40}$' or p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'storage_chest:' || p_chest;
  -- IDEMPOTENCY per (key, intent, slot): a replay answers the first call's decision and moves nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('storage_chest_build', p_slot, v_r); end if;
  if not public.hr_rpc_gate('bank_move') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_c from public.hr_storage_chests where chest_id = p_chest;
  if v_c.chest_id is null then
    return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_chest')); end if;
  -- THE LOCK ORDER (Security, marketplace threat model 2026-10-24 #3): the paying HERO
  -- (hr_hunt_lock: its advisory key, then its row) -> the account DEPOT (hr_bank_move's key)
  -- -> the chests, the bag and the Storage rows -> the account PURSE, LAST.
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot for update;
  if v_ver is null then return public.hr_note_rejection('storage_chest_build', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  -- THE KEY, CLAIMED UNDER THE HERO LOCK: a concurrent call on the same key has committed by
  -- now, so its decision is read back (same key, same answer); none means it is still in flight.
  insert into public.player_intents (user_id, intent_id, slot, intent) values (v_uid, p_idem, p_slot, v_verb)
    on conflict (user_id, intent_id) do nothing;
  if not found then
    return public.hr_note_rejection('storage_chest_build', p_slot,
      coalesce(public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb), jsonb_build_object('ok', false, 'error', 'intent_in_flight')));
  end if;
  -- ══ THE PROTECTED BLOCK: all or nothing. Every refusal raises (hr_reject) and the handler undoes the block. ══
  begin
    if exists (select 1 from public.account_storage_chests where user_id = v_uid and chest_id = p_chest) then
      perform public.hr_reject('already_built'); end if;
    select c.chest_id into v_need from public.hr_storage_chests c
     where c.ord < v_c.ord
       and not exists (select 1 from public.account_storage_chests a where a.user_id = v_uid and a.chest_id = c.chest_id)
     order by c.ord limit 1;
    if v_need is not null then perform public.hr_reject('needs_previous_chest', jsonb_build_object('need', v_need)); end if;
    v_tier := public.hr_account_property_tier(v_uid);
    if v_tier < v_c.req_property_tier then
      perform public.hr_reject('needs_property_tier', jsonb_build_object('have', v_tier, 'need', v_c.req_property_tier)); end if;
    if p_price <> v_c.gold then
      perform public.hr_reject('quote_changed', jsonb_build_object('depot', public.hr_depot_view(v_uid, p_slot))); end if;
    -- THE MATERIALS: the hero's bag first, then the account's Storage (hr_materials_take, decided whole).
    v_take := public.hr_materials_take(v_uid, p_slot, v_c.items, true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then
      perform public.hr_reject(coalesce(v_take->>'error', 'insufficient_item'), v_take - 'ok' - 'error'); end if;
    -- THE GOLD, LAST: the account purse (hr_purse_move: its row lock; a debit only when it stays >= 0).
    v_purse := public.hr_purse_move(v_uid, -v_c.gold, 0);
    if v_purse is null then
      perform public.hr_reject('insufficient_gold', jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', v_c.gold)); end if;
    insert into public.account_storage_chests (user_id, chest_id, built_slot, built_at) values (v_uid, v_c.chest_id, p_slot, now());
    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_uid and slot = p_slot returning version into v_ver;
    -- THE JOURNAL: ONE row (rule 6), the gold the purse moved and which source each unit came from.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, purse, gold_kind, meta)
      values (v_uid, p_slot, 'shop', v_verb, -v_c.gold, 0, 0, 0, v_purse, 'storage',
              jsonb_build_object('reason', 'storage_chest', 'chest', v_c.chest_id, 'stacks', v_c.stacks,
                                 'gold', v_c.gold, 'items', v_c.items, 'from', v_take->'from'));
    v_out := jsonb_build_object('ok', true, 'version', v_ver, 'chest', v_c.chest_id, 'gold', -v_c.gold,
                                'from', v_take->'from', 'depot', public.hr_depot_view(v_uid, p_slot));
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    v_out := jsonb_build_object('ok', false, 'error', v_msg) || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
  end;
  -- THE DECISION, RECORDED UNDER THE KEY (outside the block, so a refusal survives it).
  update public.player_intents
     set result = case when coalesce(v_out->>'ok', 'false') = 'true'
                       then jsonb_build_object('ok', true, 'version', v_out->'version', 'chest', v_c.chest_id, 'gold', -v_c.gold)
                       else v_out - 'depot' end
   where user_id = v_uid and intent_id = p_idem;
  return public.hr_note_rejection('storage_chest_build', p_slot, v_out);
end $$;

-- ── §4 GRANTS: revoke first, then the one grant each verb had (unchanged) ─────
revoke all on function public.hr_unlock_buy(uuid, integer, bigint, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.hr_unlock_buy(uuid, integer, bigint, uuid, text) to hr_engine;
revoke execute on function public.hr_storage_chest_build(int, text, bigint, uuid) from public;
revoke execute on function public.hr_storage_chest_build(int, text, bigint, uuid) from anon, service_role, hr_engine;
grant  execute on function public.hr_storage_chest_build(int, text, bigint, uuid) to authenticated;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Four session-local helpers (pg_temp, dropped at the end; 2026-11-27-account-depot.sql's idiom).
create or replace function pg_temp.hfs_held(p_user uuid) returns jsonb language sql as $f$
  -- every unit the account holds in a bag or in Storage, by item
  select coalesce(jsonb_object_agg(item_id, n), '{}'::jsonb) from (
    select item_id, sum(qty)::bigint as n from (
      select item_id, qty from public.player_inventory where user_id = p_user
      union all select item_id, qty from public.account_bank where user_id = p_user) s
     group by item_id) t
$f$;
create or replace function pg_temp.hfs_burned(p_before jsonb, p_after jsonb) returns jsonb language sql as $f$
  -- before - after, the lines that moved
  select coalesce(jsonb_object_agg(k, d), '{}'::jsonb) from (
    select k, coalesce((p_before->>k)::bigint, 0) - coalesce((p_after->>k)::bigint, 0) as d
      from (select jsonb_object_keys(p_before) as k union select jsonb_object_keys(p_after)) ks) x
   where d <> 0
$f$;
create or replace function pg_temp.hfs_cost(p jsonb) returns jsonb language sql as $f$
  -- a catalogue cost map's positive lines, as numbers
  select coalesce(jsonb_object_agg(key, value::bigint) filter (where value::bigint > 0), '{}'::jsonb)
    from jsonb_each_text(coalesce(p, '{}'::jsonb))
$f$;
create or replace function pg_temp.hfs_from(p_from jsonb) returns jsonb language sql as $f$
  -- a journal row's meta.from, bag + Storage summed per item
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
    select k, sum(v::bigint) as n from (
      select key as k, value as v from jsonb_each_text(coalesce(p_from->'bag', '{}'::jsonb))
      union all select key, value from jsonb_each_text(coalesce(p_from->'storage', '{}'::jsonb))) s
     group by k) t
$f$;

do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00000110e5a1';
  k   constant text := '000000c0-0000-4000-b000-00000110';
  c_purse constant bigint := 10000000;
  v jsonb; v_role text; v_src text; v_rest text; v_fn text;
  v_h record; v_r record; v_p record; v_line record;
  v_c1 public.hr_storage_chests%rowtype; v_c2 public.hr_storage_chests%rowtype;
  v_before jsonb; v_after jsonb; v_from jsonb; v_ver bigint; v_n bigint; v_first text; v_last text;
  v_led public.player_ledger%rowtype; v_cnt int;
  i_hero int; i_row int; i_home int; i_depot int; i_take int; i_bag int; i_sto int; i_purse int;
begin
  -- (a) THE LOCK ORDER, READ OUT OF THE BODIES THIS FILE INSTALLED (comments stripped):
  --     hero -> [home] -> depot -> bag rows -> Storage rows -> the PURSE, and nothing locks after it.
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_materials_take(uuid,integer,jsonb,boolean)'::regprocedure;
  i_hero  := strpos(v_src, 'hashtextextended(p_user::text || '':'' || p_slot::text, 0)');
  i_row   := strpos(v_src, 'from public.player_state where user_id = p_user and slot = p_slot for update');
  i_depot := strpos(v_src, 'hashtextextended(''hr:depot:'' || p_user::text, 0)');
  i_bag   := strpos(v_src, 'from public.player_inventory i');
  i_sto   := strpos(v_src, 'from public.account_bank b');
  if not (i_hero > 0 and i_row > i_hero and i_depot > i_row and i_bag > i_depot and i_sto > i_bag) then
    raise exception 'VERIFY(a): hr_materials_take lock order hero % -> row % -> depot % -> bag % -> storage %', i_hero, i_row, i_depot, i_bag, i_sto; end if;
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)'::regprocedure;
  i_hero  := strpos(v_src, 'hashtextextended(v_uid::text || '':'' || v_slot::text, 0)');
  i_home  := strpos(v_src, 'hashtextextended(''hr:home:'' || v_uid::text, 0)');
  i_row   := strpos(v_src, 'where user_id = v_uid and slot = v_slot for update');
  i_take  := strpos(v_src, 'public.hr_materials_take(');
  i_purse := strpos(v_src, 'public.hr_purse_move(');
  if not (i_hero > 0 and i_home > i_hero and i_row > i_home and i_take > i_row and i_purse > i_take) then
    raise exception 'VERIFY(a): hr_unlock_buy lock order hero % -> home % -> row % -> materials % -> purse %', i_hero, i_home, i_row, i_take, i_purse; end if;
  v_rest := substr(v_src, i_purse + length('public.hr_purse_move('));
  if strpos(v_rest, 'for update') > 0 or strpos(v_rest, 'pg_advisory') > 0 or strpos(v_rest, 'hr_materials_take') > 0
     or strpos(v_rest, 'hr_purse_move') > 0 or strpos(v_rest, 'hr_purse_lock') > 0 or strpos(v_rest, 'hr_hunt_lock') > 0 then
    raise exception 'VERIFY(a): hr_unlock_buy takes a lock after the purse'; end if;
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_storage_chest_build(integer,text,bigint,uuid)'::regprocedure;
  i_hero  := strpos(v_src, 'perform public.hr_hunt_lock(v_uid, p_slot);');
  i_row   := strpos(v_src, 'from public.player_state where user_id = v_uid and slot = p_slot for update');
  i_depot := strpos(v_src, 'hashtextextended(''hr:depot:'' || v_uid::text, 0)');
  i_take  := strpos(v_src, 'public.hr_materials_take(');
  i_purse := strpos(v_src, 'public.hr_purse_move(');
  if not (i_hero > 0 and i_row > i_hero and i_depot > i_row and i_take > i_depot and i_purse > i_take) then
    raise exception 'VERIFY(a): hr_storage_chest_build lock order hero % -> row % -> depot % -> materials % -> purse %', i_hero, i_row, i_depot, i_take, i_purse; end if;
  v_rest := substr(v_src, i_purse + length('public.hr_purse_move('));
  if strpos(v_rest, 'for update') > 0 or strpos(v_rest, 'pg_advisory') > 0 or strpos(v_rest, 'hr_materials_take') > 0
     or strpos(v_rest, 'hr_purse_move') > 0 or strpos(v_rest, 'hr_purse_lock') > 0 or strpos(v_rest, 'hr_hunt_lock') > 0 then
    raise exception 'VERIFY(a): hr_storage_chest_build takes a lock after the purse'; end if;
  if strpos(v_src, 'hr_apply(') > 0 then
    raise exception 'VERIFY(a): hr_storage_chest_build still pays through hr_apply (its gold would land before Storage)'; end if;

  -- THE PROBE'S CATALOGUE ROWS, chosen by property (never by name): the first home, a first room
  -- rung it opens, the first two chests, and one NON-house offer with a material cost.
  select o.*, u.namespace into v_h from public.hr_unlock_offers o join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where u.namespace = 'property' and o.refusal is null order by o.value limit 1;
  select o.*, u.namespace into v_r from public.hr_unlock_offers o join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where u.namespace = 'room' and o.refusal is null and o.value = 1 and coalesce(o.req_property_tier, 0) <= v_h.value
     and o.req_item is null and o.req_skill is null and pg_temp.hfs_cost(o.items) <> '{}'::jsonb
   order by o.offer_id limit 1;
  select o.*, u.namespace into v_p from public.hr_unlock_offers o join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where u.namespace not in ('room', 'property') and o.refusal is null and pg_temp.hfs_cost(o.items) <> '{}'::jsonb
     and coalesce(o.req_property_tier, 0) <= v_h.value and o.req_item is null and o.req_skill is null
     and (u.merge <> 'max' or o.value = (select min(x) from unnest(coalesce(u.rungs, array[]::int[])) x))
   order by o.offer_id limit 1;
  select * into v_c1 from public.hr_storage_chests order by ord limit 1;
  select * into v_c2 from public.hr_storage_chests order by ord offset 1 limit 1;
  if v_h.offer_id is null or pg_temp.hfs_cost(v_h.items) = '{}'::jsonb or v_r.offer_id is null or v_c1.chest_id is null
     or v_c1.req_property_tier > 0 or pg_temp.hfs_cost(v_c1.items) = '{}'::jsonb then
    raise exception 'VERIFY: the catalogue has no material-priced first home, first room rung or first chest to probe'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'house-from-storage §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(1) refused: %', v; end if;
    -- A clean slate: nothing in Storage, a known purse (probe rows only; all rolled back).
    delete from public.account_bank where user_id = v_u;
    insert into public.account_wallet (user_id) values (v_u) on conflict (user_id) do nothing;
    update public.account_wallet set gold = c_purse where user_id = v_u;

    -- (b) THE HOME FROM AN EMPTY BAG AND STORAGE: its first line (item order) is in Storage
    --     only; every other line is half in slot 0's bag, the rest (+2) in Storage. The bag is
    --     taken first and emptied, Storage pays the rest, the purse pays last, once.
    v_first := (select min(key) from jsonb_each_text(pg_temp.hfs_cost(v_h.items)));
    for v_line in select key, value::bigint as n from jsonb_each_text(pg_temp.hfs_cost(v_h.items)) loop
      delete from public.player_inventory where user_id = v_u and item_id = v_line.key;
      if v_line.key <> v_first and v_line.n / 2 > 0 then
        insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_line.key, v_line.n / 2);
      end if;
      insert into public.account_bank (user_id, item_id, qty)
        values (v_u, v_line.key, case when v_line.key = v_first then v_line.n + 3 else v_line.n - v_line.n / 2 + 2 end);
    end loop;
    v_before := pg_temp.hfs_held(v_u);
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, v_ver, (k || '0001')::uuid, v_h.offer_id);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the home from bag + Storage answered %', v; end if;
    v_after := pg_temp.hfs_held(v_u);
    if pg_temp.hfs_burned(v_before, v_after) is distinct from pg_temp.hfs_cost(v_h.items) then
      raise exception 'VERIFY(b): the home took % (cost %)', pg_temp.hfs_burned(v_before, v_after), v_h.items; end if;
    if exists (select 1 from public.player_inventory where user_id = v_u and item_id in (select jsonb_object_keys(v_h.items)))
       or exists (select 1 from jsonb_each_text(pg_temp.hfs_cost(v_h.items)) t
                   where coalesce((select qty from public.account_bank where user_id = v_u and item_id = t.key), 0)
                         <> case when t.key = v_first then 3 else 2 end) then
      raise exception 'VERIFY(b): not bag first, then Storage: bag %, Storage %',
        (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = v_u and item_id in (select jsonb_object_keys(v_h.items))),
        (select jsonb_object_agg(item_id, qty) from public.account_bank where user_id = v_u); end if;
    select * into v_led from public.player_ledger where user_id = v_u and intent = 'unlock_buy:' || v_h.offer_id || ':' || v_h.value;
    v_cnt := (select count(*) from public.player_ledger where user_id = v_u and intent = v_led.intent);
    if (select gold from public.account_wallet where user_id = v_u) <> c_purse - v_h.gold or v_cnt <> 1
       or v_led.gold <> -v_h.gold or v_led.purse <> c_purse - v_h.gold or v_led.slot <> 0
       or pg_temp.hfs_from(v_led.meta->'from') is distinct from pg_temp.hfs_cost(v_h.items)
       or (v_led.meta->'from'->'storage'->>v_first)::bigint is distinct from (v_h.items->>v_first)::bigint
       or v_led.meta->'from'->'bag' ? v_first then
      raise exception 'VERIFY(b): the purse or the journal is wrong: purse %, row %', (select gold from public.account_wallet where user_id = v_u), to_jsonb(v_led); end if;
    if (select version from public.player_state where user_id = v_u and slot = 0) <> v_ver + 1 then
      raise exception 'VERIFY(b): the hero''s version did not move once'; end if;
    if public.hr_state_of(v_u, 1)->'bank' is distinct from public.hr_state_of(v_u, 0)->'bank' then
      raise exception 'VERIFY(b): the two heroes read different Storage'; end if;

    -- (c) A SHORT LINE REFUSES THE WHOLE BUILD, BEFORE ANY ROW MOVES: the room's LAST line (item
    --     order) is one short across slot 1's bag + Storage, every other line is covered.
    v_last := (select max(key) from jsonb_each_text(pg_temp.hfs_cost(v_r.items)));
    for v_line in select key, value::bigint as n from jsonb_each_text(pg_temp.hfs_cost(v_r.items)) loop
      delete from public.player_inventory where user_id = v_u and item_id = v_line.key;
      delete from public.account_bank where user_id = v_u and item_id = v_line.key;
      if v_line.key = v_last then
        if (v_line.n - 1) / 2 > 0 then insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 1, v_line.key, (v_line.n - 1) / 2); end if;
        if v_line.n - 1 - (v_line.n - 1) / 2 > 0 then insert into public.account_bank (user_id, item_id, qty) values (v_u, v_line.key, v_line.n - 1 - (v_line.n - 1) / 2); end if;
      else
        insert into public.account_bank (user_id, item_id, qty) values (v_u, v_line.key, v_line.n);
      end if;
    end loop;
    v_n := (v_r.items->>v_last)::bigint;
    v_before := pg_temp.hfs_held(v_u);
    select version into v_ver from public.player_state where user_id = v_u and slot = 1;
    v := public.hr_unlock_buy(v_u, 1, v_ver, (k || '0002')::uuid, v_r.offer_id);
    if v->>'error' is distinct from 'insufficient_item' or v->>'item_id' is distinct from v_last
       or (v->>'need')::bigint <> v_n or (v->>'have')::bigint <> v_n - 1
       or (v->>'bag')::bigint <> (v_n - 1) / 2 or (v->>'storage')::bigint <> v_n - 1 - (v_n - 1) / 2 then
      raise exception 'VERIFY(c): a room one % short answered %', v_last, v; end if;
    if pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)) <> '{}'::jsonb
       or (select gold from public.account_wallet where user_id = v_u) <> c_purse - v_h.gold
       or (select version from public.player_state where user_id = v_u and slot = 1) <> v_ver
       or exists (select 1 from public.player_ledger where user_id = v_u and intent like 'unlock\_buy:' || v_r.offer_id || ':%')
       or exists (select 1 from public.player_progress where user_id = v_u and key = v_r.unlock_id) then
      raise exception 'VERIFY(c): a refused build moved something: %', pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)); end if;

    -- (d) THE PURSE IS LAST AND ALL OR NOTHING: every line covered, the purse one short: refused,
    --     and the materials did not leave; then the purse covers it and the room is built.
    update public.account_bank set qty = qty + 1 where user_id = v_u and item_id = v_last;
    insert into public.account_bank (user_id, item_id, qty) values (v_u, v_last, 1) on conflict (user_id, item_id) do nothing;
    update public.account_wallet set gold = v_r.gold - 1 where user_id = v_u;
    v_before := pg_temp.hfs_held(v_u);
    v := public.hr_unlock_buy(v_u, 1, v_ver, (k || '0003')::uuid, v_r.offer_id);
    if v->>'error' is distinct from 'insufficient_gold' or pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)) <> '{}'::jsonb
       or (select gold from public.account_wallet where user_id = v_u) <> v_r.gold - 1 then
      raise exception 'VERIFY(d): a short purse answered % and moved %', v, pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)); end if;
    update public.account_wallet set gold = v_r.gold + 5 where user_id = v_u;
    v := public.hr_unlock_buy(v_u, 1, v_ver, (k || '0004')::uuid, v_r.offer_id);
    v_after := pg_temp.hfs_held(v_u);
    select * into v_led from public.player_ledger where user_id = v_u and intent = 'unlock_buy:' || v_r.offer_id || ':' || v_r.value;
    if coalesce(v->>'ok', '') <> 'true' or pg_temp.hfs_burned(v_before, v_after) is distinct from pg_temp.hfs_cost(v_r.items)
       or (select gold from public.account_wallet where user_id = v_u) <> 5 or v_led.purse <> 5
       or pg_temp.hfs_from(v_led.meta->'from') is distinct from pg_temp.hfs_cost(v_r.items)
       or coalesce((v_led.meta->'from'->'bag'->>v_last)::bigint, 0) <> (v_n - 1) / 2 then
      raise exception 'VERIFY(d): the covered room answered %, took %, journalled %', v, pg_temp.hfs_burned(v_before, v_after), v_led.meta; end if;

    -- (e) THE CHEST FROM BAG + STORAGE: a third of each line in slot 1's bag, the rest (+1) in
    --     Storage; the bag is emptied first, Storage pays the rest, the purse pays last.
    for v_line in select key, value::bigint as n from jsonb_each_text(pg_temp.hfs_cost(v_c1.items)) loop
      delete from public.player_inventory where user_id = v_u and item_id = v_line.key;
      delete from public.account_bank where user_id = v_u and item_id = v_line.key;
      if v_line.n / 3 > 0 then insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 1, v_line.key, v_line.n / 3); end if;
      insert into public.account_bank (user_id, item_id, qty) values (v_u, v_line.key, v_line.n - v_line.n / 3 + 1);
    end loop;
    update public.account_wallet set gold = v_c1.gold + 7 where user_id = v_u;
    v_before := pg_temp.hfs_held(v_u);
    select version into v_ver from public.player_state where user_id = v_u and slot = 1;
    v := public.hr_storage_chest_build(1, v_c1.chest_id, v_c1.gold, (k || '0005')::uuid);
    v_after := pg_temp.hfs_held(v_u);
    select * into v_led from public.player_ledger where user_id = v_u and intent = 'storage_chest:' || v_c1.chest_id;
    v_cnt := (select count(*) from public.player_ledger where user_id = v_u and intent = v_led.intent);
    if coalesce(v->>'ok', '') <> 'true' or pg_temp.hfs_burned(v_before, v_after) is distinct from pg_temp.hfs_cost(v_c1.items)
       or (select gold from public.account_wallet where user_id = v_u) <> 7
       or not exists (select 1 from public.account_storage_chests where user_id = v_u and chest_id = v_c1.chest_id and built_slot = 1)
       or (select version from public.player_state where user_id = v_u and slot = 1) <> v_ver + 1
       or exists (select 1 from public.player_inventory where user_id = v_u and item_id in (select jsonb_object_keys(v_c1.items)))
       or exists (select 1 from jsonb_each_text(pg_temp.hfs_cost(v_c1.items)) t
                   where coalesce((select qty from public.account_bank where user_id = v_u and item_id = t.key), 0) <> 1) then
      raise exception 'VERIFY(e): the chest answered % and took %', v, pg_temp.hfs_burned(v_before, v_after); end if;
    if v_cnt <> 1 or v_led.kind <> 'shop' or v_led.gold <> -v_c1.gold or v_led.purse <> 7 or v_led.gold_kind is distinct from 'storage'
       or pg_temp.hfs_from(v_led.meta->'from') is distinct from pg_temp.hfs_cost(v_c1.items)
       or exists (select 1 from jsonb_each_text(pg_temp.hfs_cost(v_c1.items)) t
                   where coalesce((v_led.meta->'from'->'bag'->>t.key)::bigint, 0) <> t.value::bigint / 3) then
      raise exception 'VERIFY(e): the chest''s journal row is %', to_jsonb(v_led); end if;

    -- (f) A REPLAYED KEY ANSWERS THE FIRST DECISION AND MOVES NOTHING.
    update public.account_wallet set gold = v_c1.gold + 7 where user_id = v_u;
    v_before := pg_temp.hfs_held(v_u);
    v := public.hr_storage_chest_build(1, v_c1.chest_id, v_c1.gold, (k || '0005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)) <> '{}'::jsonb
       or (select gold from public.account_wallet where user_id = v_u) <> v_c1.gold + 7
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'storage_chest:' || v_c1.chest_id) <> 1 then
      raise exception 'VERIFY(f): a replayed chest key answered % and moved something', v; end if;

    -- (g) THE NEXT CHEST, ONE SHORT ON ITS LAST LINE ACROSS BAG + STORAGE: refused, nothing moves,
    --     the same key keeps that answer after a top-up, and a new key then builds it.
    if v_c2.chest_id is not null and v_c2.req_property_tier <= v_h.value and pg_temp.hfs_cost(v_c2.items) <> '{}'::jsonb then
      v_last := (select max(key) from jsonb_each_text(pg_temp.hfs_cost(v_c2.items)));
      for v_line in select key, value::bigint as n from jsonb_each_text(pg_temp.hfs_cost(v_c2.items)) loop
        delete from public.player_inventory where user_id = v_u and item_id = v_line.key;
        delete from public.account_bank where user_id = v_u and item_id = v_line.key;
        if v_line.key = v_last then
          if (v_line.n - 1) / 2 > 0 then insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_line.key, (v_line.n - 1) / 2); end if;
          if v_line.n - 1 - (v_line.n - 1) / 2 > 0 then insert into public.account_bank (user_id, item_id, qty) values (v_u, v_line.key, v_line.n - 1 - (v_line.n - 1) / 2); end if;
        else
          insert into public.account_bank (user_id, item_id, qty) values (v_u, v_line.key, v_line.n);
        end if;
      end loop;
      update public.account_wallet set gold = c_purse where user_id = v_u;
      v_before := pg_temp.hfs_held(v_u);
      v := public.hr_storage_chest_build(0, v_c2.chest_id, v_c2.gold, (k || '0006')::uuid);
      if v->>'error' is distinct from 'insufficient_item' or v->>'item_id' is distinct from v_last
         or (v->>'have')::bigint <> (v_c2.items->>v_last)::bigint - 1
         or pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)) <> '{}'::jsonb
         or (select gold from public.account_wallet where user_id = v_u) <> c_purse
         or exists (select 1 from public.account_storage_chests where user_id = v_u and chest_id = v_c2.chest_id) then
        raise exception 'VERIFY(g): a chest one % short answered % and moved %', v_last, v, pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)); end if;
      insert into public.account_bank as b (user_id, item_id, qty) values (v_u, v_last, 1)
        on conflict (user_id, item_id) do update set qty = b.qty + 1;
      v := public.hr_storage_chest_build(0, v_c2.chest_id, v_c2.gold, (k || '0006')::uuid);
      if v->>'error' is distinct from 'insufficient_item'
         or exists (select 1 from public.account_storage_chests where user_id = v_u and chest_id = v_c2.chest_id) then
        raise exception 'VERIFY(g): the same key did not keep its refusal: %', v; end if;
      v_before := pg_temp.hfs_held(v_u);
      v := public.hr_storage_chest_build(0, v_c2.chest_id, v_c2.gold, (k || '0007')::uuid);
      if coalesce(v->>'ok', '') <> 'true' or pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)) is distinct from pg_temp.hfs_cost(v_c2.items)
         or (select gold from public.account_wallet where user_id = v_u) <> c_purse - v_c2.gold then
        raise exception 'VERIFY(g): a new key with the line covered answered %', v; end if;
    else
      raise notice 'house-from-storage §5(g): no second chest open at the first home; the two-line short case is skipped';
    end if;

    -- (h) A NON-HOUSE OFFER NEVER READS STORAGE: its cost sits in Storage only, the bag holds none.
    if v_p.offer_id is not null then
      for v_line in select key, value::bigint as n from jsonb_each_text(pg_temp.hfs_cost(v_p.items)) loop
        delete from public.player_inventory where user_id = v_u and item_id = v_line.key;
        insert into public.account_bank (user_id, item_id, qty) values (v_u, v_line.key, v_line.n)
          on conflict (user_id, item_id) do update set qty = excluded.qty;
      end loop;
      update public.account_wallet set gold = c_purse where user_id = v_u;
      v_before := pg_temp.hfs_held(v_u);
      select version into v_ver from public.player_state where user_id = v_u and slot = 0;
      v := public.hr_unlock_buy(v_u, 0, v_ver, (k || '0008')::uuid, v_p.offer_id);
      if v->>'error' is distinct from 'insufficient_item' or v ? 'storage' or (v->>'have')::bigint <> 0
         or pg_temp.hfs_burned(v_before, pg_temp.hfs_held(v_u)) <> '{}'::jsonb
         or (select gold from public.account_wallet where user_id = v_u) <> c_purse then
        raise exception 'VERIFY(h): the % (namespace %) answered % with its cost in Storage only', v_p.offer_id, v_p.namespace, v; end if;
    else
      raise notice 'house-from-storage §5(h): no non-house offer with a material cost; the bag-only case is skipped';
    end if;

    raise exception using errcode = 'HR8A5', message = 'house-from-storage §5 complete - rolling back';
  exception when sqlstate 'HR8A5' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_bank where user_id = v_u)
     or exists (select 1 from public.account_wallet where user_id = v_u) or exists (select 1 from public.account_storage_chests where user_id = v_u)
     or exists (select 1 from public.player_ledger where user_id = v_u) or exists (select 1 from public.player_intents where user_id = v_u) then
    raise exception 'VERIFY(i): §5 LEAKED a probe row'; end if;

  -- (j) THE GRANTS: the take is owner-only; hr_unlock_buy is the engine's alone; the chest is authenticated-only.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(v_role, 'public.hr_materials_take(uuid,integer,jsonb,boolean)', 'execute') then
      raise exception 'VERIFY(j): % reaches hr_materials_take', v_role; end if;
  end loop;
  foreach v_fn in array array['public.hr_materials_take(uuid,integer,jsonb,boolean)', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)',
                              'public.hr_storage_chest_build(integer,text,bigint,uuid)'] loop
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'VERIFY(j): PUBLIC can execute %', v_fn; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute') then
    raise exception 'VERIFY(j): hr_unlock_buy is not the engine''s alone'; end if;
  if has_function_privilege('anon', 'public.hr_storage_chest_build(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_storage_chest_build(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_storage_chest_build(integer,text,bigint,uuid)', 'execute') then
    raise exception 'VERIFY(j): hr_storage_chest_build is not authenticated-only'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_storage_chest_build' and grantee = 'authenticated'
                   and identity_args = 'p_slot integer, p_chest text, p_price bigint, p_idem uuid') then
    raise exception 'VERIFY(j): hr_storage_chest_build left the client RPC baseline'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'house-from-storage: a house build takes the hero''s bag first, then the account''s Storage, all or nothing, the purse last, journalled by source; all green';
end $$;

drop function if exists pg_temp.hfs_held(uuid);
drop function if exists pg_temp.hfs_burned(jsonb, jsonb);
drop function if exists pg_temp.hfs_cost(jsonb);
drop function if exists pg_temp.hfs_from(jsonb);
