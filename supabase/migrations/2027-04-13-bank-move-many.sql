-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-13-bank-move-many.sql — DEPOSIT OR LOCK MANY STACKS IN ONE CALL
--   (lane/c-bank-move-many, backend-architect, 2026-11-11; the UX flow audit 2026-11-11 build lane 2 and the item
--   lane/a-inventory-select owes: the inventory's Deposit and Lock bulk actions are N round trips today, one hr_bank_move
--   or hr_item_lock a stack, stopping at the first refusal).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. MONEY SURFACE, PRE-EA SECURITY LIST: hr_bank_move_many moves items between a hero's
-- bag and the account's Storage (value-neutral, the same rows as hr_bank_move's); hr_bank_move is RESTATED WHOLE onto the
-- shared per-stack body (no behaviour change: the same refusals, the same ledger row, the same answer); hr_item_lock_many
-- moves no value. EDGE: none. CLIENT: src/session/character-session.js moveStorageMany / lockItems (one intent each),
-- tests/client-intent-surface.mjs CLIENT_RPCS, src/data/refusal-words.js.
-- ORDER: last, after 2027-04-12-small-calls-items-catalogue.generated.sql (the v0.2.122 chain tip). It shares no function
-- with the v0.2.122 chain: its only restated body, hr_bank_move, was last authored by 2027-01-12-market-account.sql, and
-- the two new verbs and the internal are new names. Independent of every other staged file.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- Depositing N selected stacks is N hr_bank_move calls and locking N is N hr_item_lock calls, each a round trip, each
-- consuming a rate-bucket token, and the run stops at the first refusal with the earlier stacks already moved. The player
-- wants ONE press: everything goes, or nothing does and the answer names the stack that stopped it.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_bank_move_many(p_slot integer, p_items jsonb, p_idem uuid) -> jsonb       authenticated
--   p_items  [{"item": "<id>", "dir": "deposit" | "withdraw"}, …], 1..1000 elements, no item twice, nothing else in an
--            element. WHOLE STACKS ONLY: the count is the server's own (the bag row for a deposit, the Storage row for a
--            withdraw, read FOR UPDATE); the client never names one.
--   ONE transaction, ALL OR NOTHING: each stack runs the single verb's exact per-stack rule (hr_bank_move_stack, the one
--   body hr_bank_move itself now runs) in list order, each seeing the state the ones before it left, exactly as N single
--   calls would; the first refusal unwinds every earlier stack (a subtransaction) and is returned naming the stack
--   (item_id) and its position (index). One player_ledger row a stack, byte-identical to the single verb's (kind bank,
--   intent bank_<dir>, item_id, the bag-side signed qty, meta {dir, qty, depot: account}). The version bumps ONCE.
--   Refusals, in order:
--     settle_first / party_hunt_running   the single verb's prelude (an unpaid window is open)
--     not_signed_in · bad_slot · bad_idem · bad_items · too_many_items {max}
--     intent_mismatch                     the key is held by another intent / slot (hr_intent_replay)
--     rate_limited                        ONE token of the `bank_move` bucket (60/min), not N
--     unknown_item {item_id}              the first id the server catalogue (hr_items) does not know
--     no_character
--     hunt_open {hunt}                    the hero is out: Storage is at home (hr_loot_dispatch's rule, CONFLICTS.md
--                                         2026-10-18 item 1's ask for the bag verbs; the single verb still allows it)
--     per stack, all-or-nothing, each with item_id and index:
--       item_locked                       a deposit of a locked stack (a lock keeps a stack in the bag)
--       insufficient_item / insufficient_bank {have, need}   the stack is gone
--       qty_clamp {limit}                 a stack above the single verb's per-call blast radius (1,000,000 units)
--       bank_full {cap, listed}           a NEW kind past the account's room (hr_storage_room_fits)
--       bag_full {cap}                    a withdraw opening a NEW bag stack past bank_cap
--   Answer: {ok: true, count, version}. The client re-reads the envelope (`bank`, `inventory`).
--   IDEMPOTENT: the intent is bank_move_many:<md5 of the canonical list>; a replayed key returns the first answer, moves
--   nothing; a refusal never consumes the key.
--
-- hr_item_lock_many(p_slot integer, p_items jsonb, p_locked boolean, p_idem uuid) -> jsonb       authenticated
--   p_items  ["<id>", …], 1..1000, no id twice. Every id is written through hr_item_rule_put (the single verb's one
--   writer) with the row's other fields kept, in list order; ONE token of the `hunt` bucket (30/min). No hunting refusal:
--   a lock is allowed mid-hunt, as hr_item_lock allows it (it keeps sell-to-cover and the loot filter off a stack).
--   Refusals: not_signed_in · bad_slot · bad_idem · bad_items · too_many_items {max} · intent_mismatch · rate_limited ·
--   unknown_item {item_id} · no_character. Answer: {ok: true, count, bag_rules}. Intent item_lock_many:on|off:<md5>.
--
-- hr_bank_move_stack(p_user, p_slot, p_item, p_qty, p_dir, p_bag_cap) -> jsonb       INTERNAL, executable by nobody
--   The single verb's deposit / withdraw block and its ledger row, moved here verbatim from 2027-01-12-market-account.sql's
--   hr_bank_move. NULL = moved; else the refusal (the single verb's exact shape). It writes nothing before it refuses.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- hr_bank_move_many: hr_hunt_lock (the hero's advisory key, its player_state row, its open session row) -> the account
-- depot key ('hr:depot:<user>') -> the bag / Storage rows FOR UPDATE. hr_bank_move: the player_state row -> the depot key
-- -> the rows (unchanged). Both take the character before the depot and nothing after the depot takes a character, so
-- the single and the bulk verb serialise with each other, with hr_loot_dispatch (the same order) and with the settle (the
-- hero's advisory key) and cannot deadlock. Two bulk calls on one key: the second replays. PGlite is one backend, so the
-- overlapping run is pinned by this order (tests/bank-move-many.mjs), not raced.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No client value prices, counts or names anything that reaches another player: the ids are checked against hr_items, the
-- counts are the server's rows, the room and the bag fuse are the single verb's, the ledger rows are the single verb's.
-- A bulk call costs ONE rate token where N singles cost N: the per-call element cap (1,000) bounds the work, and every
-- element is at most the single verb's blast radius. Nothing new is reachable by anon or service_role.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- Rows: the same ledger rows N singles would write, one player_intents row instead of N, one hr_rejections row a refused
-- press instead of up to N. At 100x players the bulk verb writes FEWER rows than today's loop.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop function hr_bank_move_many, hr_item_lock_many (+ their hr_client_rpc_baseline rows); re-run 2027-01-12-market-
-- account.sql's hr_bank_move statement; then drop hr_bank_move_stack. IDEMPOTENT: §0 accepts the pre-image or this file's
-- own text; every statement is create or replace / on conflict. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
declare
  c_sig  constant text := 'public.hr_bank_move(integer,text,bigint,text,uuid)';
  -- 2027-01-12-market-account.sql's hr_bank_move as production runs it (tests/live-hash-drift.baseline.json, measured
  -- 2026-11-11, live = replay), and this file's own restatement (a second apply).
  c_pre  constant text := '9a2f4c0dfe2528f8eda1f0f7126f7c1b';
  c_self constant text := '3fc6d06eb528e1bf7e8beb285d4d3c1c';
  v_md5 text;
begin
  if to_regprocedure(c_sig) is null then raise exception 'PRECONDITION: hr_bank_move is missing'; end if;
  select md5(regexp_replace(pg_get_functiondef(c_sig::regprocedure), '[[:space:]]+', ' ', 'g')) into v_md5;
  if v_md5 not in (c_pre, c_self) then
    raise exception 'PRECONDITION: hr_bank_move is md5 %, not the % this file restates (2027-01-12-market-account.sql applied?) nor its own %', v_md5, c_pre, c_self; end if;
  if to_regprocedure('public.hr_item_lock(integer,text,boolean,uuid)') is null
     or to_regprocedure('public.hr_item_rule_put(uuid,integer,text,boolean,text,integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_storage_room_fits(uuid,text)') is null then
    raise exception 'PRECONDITION: hr_item_lock / hr_item_rule_put / hr_hunt_lock / hr_storage_room_fits are absent'; end if;
end $mig$;

-- ── §1 THE ONE PER-STACK BODY ────────────────────────────────────────────────
-- 2027-01-12-market-account.sql's hr_bank_move deposit / withdraw block and its journal row, verbatim, over p_user instead
-- of auth.uid(). NULL = moved. Every refusal returns BEFORE the first write.
create or replace function public.hr_bank_move_stack(p_user uuid, p_slot integer, p_item text, p_qty bigint, p_dir text, p_bag_cap integer)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_cap    int;
  v_have   bigint;
  v_stacks int;
begin
  if p_dir = 'deposit' then
    -- ── BAG → DEPOT ─────────────────────────────────────────────────────────
    -- DEBIT the bag (this select-for-update IS the ownership check).
    select qty into v_have from public.player_inventory
      where user_id = p_user and slot = p_slot and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty);
    end if;
    -- THE DEPOT'S ROOM: only when this deposit adds a NEW kind to the account's room
    -- (kinds in Storage + kinds it has listed on the market, which come back here).
    -- The account's own capacity (base + storage chests), never above the fuse.
    if not public.hr_storage_room_fits(p_user, p_item) then
      v_cap := public.hr_storage_room_cap(p_user);
      v_stacks := public.hr_storage_room_used(p_user);
      return jsonb_build_object('ok', false, 'error', 'bank_full', 'cap', v_cap,
        'listed', v_stacks - (select count(*)::int from public.account_bank where user_id = p_user));
    end if;
    if v_have = p_qty then
      delete from public.player_inventory
        where user_id = p_user and slot = p_slot and item_id = p_item;
    else
      update public.player_inventory set qty = qty - p_qty
        where user_id = p_user and slot = p_slot and item_id = p_item;
    end if;
    insert into public.account_bank as b (user_id, item_id, qty, updated_at)
      values (p_user, p_item, p_qty, now())
      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
  else
    -- ── DEPOT → BAG ─────────────────────────────────────────────────────────
    -- DEBIT the depot (ownership check: the account's own row, locked).
    select qty into v_have from public.account_bank
      where user_id = p_user and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return jsonb_build_object('ok', false, 'error', 'insufficient_bank',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty);
    end if;
    -- BAG STACK FUSE: mirror hr_apply's bank_cap ceiling on player_inventory
    -- stacks (bank_cap is the BAG's stack cap, per character), only when this
    -- withdraw opens a NEW bag stack.
    if not exists (select 1 from public.player_inventory
                    where user_id = p_user and slot = p_slot and item_id = p_item) then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = p_user and slot = p_slot limit p_bag_cap + 1) s;
      if v_stacks >= p_bag_cap then
        return jsonb_build_object('ok', false, 'error', 'bag_full', 'cap', p_bag_cap);
      end if;
    end if;
    if v_have = p_qty then
      delete from public.account_bank
        where user_id = p_user and item_id = p_item;
    else
      update public.account_bank set qty = qty - p_qty, updated_at = now()
        where user_id = p_user and item_id = p_item;
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (p_user, p_slot, p_item, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
  end if;

  -- JOURNAL: one aggregate row per move (rule 6 — never per-tick). qty carries
  -- the BAG-side signed delta (deposit removes from bag = negative); the slot is
  -- the acting character's, meta.depot says the other side is the account's.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (p_user, p_slot, 'bank', 'bank_' || p_dir, p_item,
            case when p_dir = 'deposit' then -p_qty else p_qty end,
            jsonb_build_object('dir', p_dir, 'qty', p_qty, 'depot', 'account'));
  return null;
end $$;
revoke execute on function public.hr_bank_move_stack(uuid, integer, text, bigint, text, integer) from public;
revoke execute on function public.hr_bank_move_stack(uuid, integer, text, bigint, text, integer) from anon, authenticated, service_role, hr_engine;

-- ── §2 hr_bank_move RESTATED WHOLE onto §1 (§0 pin 9a2f4c0d) ─────────────────
-- Everything that is not the moved block is 2027-01-12-market-account.sql's text, line for line: the prelude, the key,
-- the gate, the validation, the locks, the version bump, the stored answer.
create or replace function public.hr_bank_move(p_slot integer, p_item text, p_qty bigint, p_dir text, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
-- hr_bank_move restated WHOLE by 2026-11-27-account-depot.sql (chain depth 0) from the
-- 2026-09-28-settle-before-mutate.sql image: the depot is public.account_bank, ONE per
-- account, under the ACCOUNT DEPOT LOCK taken after the character lock. Restated again
-- by 2026-11-28-storage-chests.sql: a deposit that opens a new stack fits the account's
-- capacity (hr_depot_cap: the base + its storage chests), never above the fuse. Restated
-- by 2027-01-12-market-account.sql: the room a new kind needs counts the kinds the
-- account has LISTED on the market too (their units come back here). Restated by
-- 2027-04-13-bank-move-many.sql: the deposit / withdraw block and its journal row are
-- hr_bank_move_stack, the one body hr_bank_move_many runs a stack at a time.
declare
  c_max_move        constant bigint := 1000000;  -- per-call blast radius (matches hr_apply c_max_item_delta)
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_cached jsonb;
  v_new_version bigint;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('bank_move', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;

  -- IDEMPOTENCY: a replayed idem returns the first call's exact result, no re-move.
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay is the one
  -- copy of the rule). A NULL answer means "no cached decision".
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'bank_' || p_dir) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('bank_move', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('bank_move') then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- INPUT VALIDATION — the client value is only a request; re-checked below.
  if p_dir is null or p_dir not in ('deposit', 'withdraw') then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bad_direction'));
  end if;
  if p_qty is null or p_qty < 1 then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty'));
  end if;
  if p_qty > c_max_move then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'qty_clamp', 'limit', c_max_move));
  end if;
  -- Unknown ids refused against the SERVER catalogue (hr_items).
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', p_item));
  end if;

  -- THE CHARACTER LOCK (its bag and version) ...
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- ... THEN THE ACCOUNT DEPOT LOCK. Every character of the account moves through
  -- this one key, so the stack count and the withdraw's check-then-write below are
  -- exact under concurrency. Order: character -> depot -> account_bank rows; nothing
  -- takes a character lock after it (2026-11-27-account-depot.sql header).
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));

  -- THE MOVE: the one per-stack body (hr_bank_move_stack), its refusal returned as it stands.
  v_cached := public.hr_bank_move_stack(v_uid, p_slot, p_item, p_qty, p_dir, v_state.bank_cap);
  if v_cached is not null then return public.hr_note_rejection('bank_move', p_slot, v_cached); end if;

  -- VERSION BUMP of the ACTING character (the clock its client reconciles on). The
  -- account's other characters are not bumped: their clients re-read after a move.
  v_new_version := v_state.version + 1;
  update public.player_state set version = v_new_version, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  v_cached := jsonb_build_object('ok', true, 'item', p_item, 'qty', p_qty,
    'direction', p_dir, 'version', v_new_version);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'bank_' || p_dir, v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end
$function$;
revoke execute on function public.hr_bank_move(integer, text, bigint, text, uuid) from public;
revoke execute on function public.hr_bank_move(integer, text, bigint, text, uuid) from anon, service_role;
grant  execute on function public.hr_bank_move(integer, text, bigint, text, uuid) to authenticated;

-- ── §3 hr_bank_move_many ─────────────────────────────────────────────────────
create or replace function public.hr_bank_move_many(p_slot integer, p_items jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_max_move  constant bigint := 1000000;   -- the single verb's per-call blast radius, a stack
  c_max_items constant int := 1000;         -- the depot fuse: more stacks than any bag or Storage holds
  c_verb      constant text := 'bank_move_many';
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_s      public.hunt_sessions%rowtype;
  v_cached jsonb;
  v_verb   text;
  v_item   text;
  v_dir    text;
  v_qty    bigint;
  v_r      jsonb;
  v_n      int := 0;
  v_detail text;
  v_new_version bigint;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2): the single verb's prelude.
  declare v_settle jsonb := public.hr_settle_first_noted(c_verb, auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;

  -- INPUT VALIDATION: a list of {item, dir}, nothing else, no item twice. The client value is only a request.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_items')); end if;
  if jsonb_array_length(p_items) > c_max_items then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'too_many_items', 'max', c_max_items)); end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
              where jsonb_typeof(e) <> 'object'
                 or jsonb_typeof(e -> 'item') <> 'string' or (e ->> 'item') !~ '^[a-z0-9_]{1,64}$'
                 or jsonb_typeof(e -> 'dir') <> 'string' or (e ->> 'dir') not in ('deposit', 'withdraw')
                 or (e - 'item' - 'dir') <> '{}'::jsonb)
     or (select count(distinct e ->> 'item') from jsonb_array_elements(p_items) e) <> jsonb_array_length(p_items) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_items')); end if;

  -- IDEMPOTENCY: the intent names its canonical list (jsonb text is canonical); a replayed key returns the first
  -- answer and moves nothing; a different list under the same key is intent_mismatch.
  v_verb := c_verb || ':' || left(md5(p_items::text), 16);
  v_cached := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection(c_verb, p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  -- ONE token of the single verb's bucket for the whole call.
  if not public.hr_rpc_gate('bank_move') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- Unknown ids refused against the SERVER catalogue, the first named.
  select e.v ->> 'item' into v_item
    from jsonb_array_elements(p_items) with ordinality as e(v, i)
   where not exists (select 1 from public.hr_items where item_id = e.v ->> 'item')
   order by e.i limit 1;
  if v_item is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', v_item)); end if;

  -- THE CHARACTER LOCK: its advisory key, its row, its open hunt (hr_hunt_lock) ...
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_state from public.player_state where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- A hero out hunting is not at home: Storage is (the Dispatch rule; CONFLICTS.md 2026-10-18 item 1).
  if v_s.id is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'hunt', v_s.hunt_id)); end if;
  -- ... THEN THE ACCOUNT DEPOT LOCK (hr_bank_move's key, the same order: character -> depot -> rows).
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));

  -- THE STACKS, in list order, each seeing the state the ones before it left: exactly N single calls, in one
  -- subtransaction, so the first refusal unwinds every earlier stack and nothing is kept.
  begin
    for v_item, v_dir in
      select e.v ->> 'item', e.v ->> 'dir' from jsonb_array_elements(p_items) with ordinality as e(v, i) order by e.i
    loop
      if v_dir = 'deposit' then
        -- A lock keeps a stack in the bag: nothing bulk takes it (the vendor, the market, the loot filter, and this).
        if public.hr_item_locked(v_uid, p_slot, v_item) then
          raise exception using errcode = 'HR881', message = 'bank_move_many: refused',
            detail = jsonb_build_object('ok', false, 'error', 'item_locked', 'item_id', v_item, 'index', v_n)::text; end if;
        select qty into v_qty from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item for update;
        if coalesce(v_qty, 0) < 1 then
          raise exception using errcode = 'HR881', message = 'bank_move_many: refused',
            detail = jsonb_build_object('ok', false, 'error', 'insufficient_item', 'item_id', v_item, 'have', 0, 'need', 1, 'index', v_n)::text; end if;
      else
        select qty into v_qty from public.account_bank where user_id = v_uid and item_id = v_item for update;
        if coalesce(v_qty, 0) < 1 then
          raise exception using errcode = 'HR881', message = 'bank_move_many: refused',
            detail = jsonb_build_object('ok', false, 'error', 'insufficient_bank', 'item_id', v_item, 'have', 0, 'need', 1, 'index', v_n)::text; end if;
      end if;
      -- THE WHOLE STACK, the server's own count, inside the single verb's blast radius.
      if v_qty > c_max_move then
        raise exception using errcode = 'HR881', message = 'bank_move_many: refused',
          detail = jsonb_build_object('ok', false, 'error', 'qty_clamp', 'item_id', v_item, 'limit', c_max_move, 'index', v_n)::text; end if;
      v_r := public.hr_bank_move_stack(v_uid, p_slot, v_item, v_qty, v_dir, v_state.bank_cap);
      if v_r is not null then
        raise exception using errcode = 'HR881', message = 'bank_move_many: refused',
          detail = (v_r || jsonb_build_object('item_id', v_item, 'index', v_n))::text; end if;
      v_n := v_n + 1;
    end loop;
  exception when sqlstate 'HR881' then
    -- Every stack above is unwound; the refusal names the one that stopped it. The key stays free.
    get stacked diagnostics v_detail = pg_exception_detail;
    return public.hr_note_rejection(c_verb, p_slot, v_detail::jsonb);
  end;

  -- VERSION BUMP of the ACTING character, once for the whole press.
  v_new_version := v_state.version + 1;
  update public.player_state set version = v_new_version, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  v_cached := jsonb_build_object('ok', true, 'count', v_n, 'version', v_new_version);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke execute on function public.hr_bank_move_many(integer, jsonb, uuid) from public;
revoke execute on function public.hr_bank_move_many(integer, jsonb, uuid) from anon, service_role;
grant  execute on function public.hr_bank_move_many(integer, jsonb, uuid) to authenticated;

-- ── §4 hr_item_lock_many ─────────────────────────────────────────────────────
-- hr_item_lock's shape (2026-10-25-bag-rules.sql): identity -> slot -> key -> list -> replay -> gate -> catalogue ->
-- lock -> the rows, each through the one writer -> stored answer. Nothing can refuse once the rows are being written
-- (every id is already known), so no subtransaction.
create or replace function public.hr_item_lock_many(p_slot integer, p_items jsonb, p_locked boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_max_items constant int := 1000;
  c_verb      constant text := 'item_lock_many';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_verb text;
  v_item text;
  v_row  public.player_item_rules%rowtype;
  v_n    int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_locked is null or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_items')); end if;
  if jsonb_array_length(p_items) > c_max_items then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'too_many_items', 'max', c_max_items)); end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z0-9_]{1,64}$')
     or (select count(distinct e #>> '{}') from jsonb_array_elements(p_items) e) <> jsonb_array_length(p_items) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_items')); end if;
  v_verb := c_verb || ':' || case when p_locked then 'on' else 'off' end || ':' || left(md5(p_items::text), 16);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select e.v #>> '{}' into v_item
    from jsonb_array_elements(p_items) with ordinality as e(v, i)
   where not exists (select 1 from public.hr_items where item_id = e.v #>> '{}')
   order by e.i limit 1;
  if v_item is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', v_item)); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  for v_item in select e.v #>> '{}' from jsonb_array_elements(p_items) with ordinality as e(v, i) order by e.i loop
    select * into v_row from public.player_item_rules where user_id = v_uid and slot = p_slot and item_id = v_item for update;
    perform public.hr_item_rule_put(v_uid, p_slot, v_item, p_locked, v_row.loot_rule, v_row.restock);
    v_n := v_n + 1;
  end loop;
  v_r := jsonb_build_object('ok', true, 'count', v_n, 'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_item_lock_many(integer, jsonb, boolean, uuid) from public;
revoke execute on function public.hr_item_lock_many(integer, jsonb, boolean, uuid) from anon, service_role;
grant  execute on function public.hr_item_lock_many(integer, jsonb, boolean, uuid) to authenticated;

-- ── §5 THE CLIENT BASELINE ───────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_bank_move_many', 'hr_item_lock_many');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_bank_move_many', 'p_slot integer, p_items jsonb, p_idem uuid', 'authenticated',
   'added 2027-04-13 (lane/c-bank-move-many): MONEY SURFACE (value-neutral) - whole stacks between the bag and the account''s Storage in ONE all-or-nothing call, the single verb''s rules a stack (hr_bank_move_stack), one ledger row a stack; pre-EA Security list'),
  ('hr_item_lock_many', 'p_slot integer, p_items jsonb, p_locked boolean, p_idem uuid', 'authenticated',
   'added 2027-04-13 (lane/c-bank-move-many): lock / unlock many items in ONE call through hr_item_rule_put; moves no value')
  on conflict (proname, identity_args, grantee) do update set note = excluded.note;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Two probe accounts with the same start kit: A moves through N single calls, B through ONE bulk call; the ledger rows
-- and the Storage / bag state must be byte-identical. Then the bulk refusals, named, moving nothing; the replay; the
-- lock parity; the grants.
do $$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000ba9c0001';
  v_b constant uuid := '000000c0-0000-4000-a000-0000ba9c0002';
  k   constant text := '000000c0-0000-4000-b000-0000ba9c';
  v jsonb; v2 jsonb; v_list jsonb; v_wlist jsonb; v_llist jsonb; v_role text;
  v_kinds text[]; v_n int; v_i int; v_ver bigint; v_la bigint; v_lb bigint; v_inst uuid := gen_random_uuid();
  -- the rows of one probe account, without ids or clocks, as static SQL scoped to v_a / v_b (tests/selfcheck-no-global-dml.mjs
  -- reads every statement this block runs; an EXECUTE it cannot read is a finding)
  s_a text; s_b text;
begin
  begin
    for v_i in 1 .. 2 loop
      perform set_config('request.jwt.claim.sub', case v_i when 1 then v_a else v_b end::text, true);
      insert into auth.users (id) values (case v_i when 1 then v_a else v_b end) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (case v_i when 1 then v_a else v_b end, 'bank-move-many §6 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    end loop;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.player_inventory where user_id = v_a and slot = 0)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.player_inventory where user_id = v_b and slot = 0)::text
      into s_a, s_b;
    if s_a <> s_b then raise exception 'VERIFY(a): the two probes do not start with the same bag'; end if;
    select array_agg(item_id order by item_id), count(*) into v_kinds, v_n from public.player_inventory where user_id = v_a and slot = 0;
    if v_n < 3 then raise exception 'VERIFY(a): fewer than three kit kinds in the bag (%)', v_n; end if;
    select jsonb_agg(jsonb_build_object('item', x, 'dir', 'deposit') order by x) into v_list from unnest(v_kinds) x;
    select jsonb_agg(jsonb_build_object('item', x, 'dir', 'withdraw') order by x) into v_wlist from unnest(v_kinds) x;
    select coalesce(max(id), 0) into v_la from public.player_ledger where user_id = v_a;
    select coalesce(max(id), 0) into v_lb from public.player_ledger where user_id = v_b;

    -- (a) PARITY, DEPOSIT: A through N single calls (the restated verb), B through one bulk call.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    for v_i in 1 .. v_n loop
      v := public.hr_bank_move(0, v_kinds[v_i], (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_kinds[v_i]), 'deposit', (k || lpad(v_i::text, 4, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): a single deposit of % answered %', v_kinds[v_i], v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    select version into v_ver from public.player_state where user_id = v_b and slot = 0;
    v := public.hr_bank_move_many(0, v_list, (k || '1001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'count')::int <> v_n or (v->>'version')::bigint <> v_ver + 1 then
      raise exception 'VERIFY(a): the bulk deposit answered % (wanted count %, version %)', v, v_n, v_ver + 1; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.account_bank where user_id = v_a)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.account_bank where user_id = v_b)::text
      into s_a, s_b;
    if s_a <> s_b then raise exception 'VERIFY(a): Storage differs after N singles vs one bulk: % vs %', s_a, s_b; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.player_inventory where user_id = v_a and slot = 0)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.player_inventory where user_id = v_b and slot = 0)::text
      into s_a, s_b;
    if s_a <> s_b or s_a <> '[]' then raise exception 'VERIFY(a): the bags differ or are not empty: % vs %', s_a, s_b; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('k', kind, 'n', intent, 'i', item_id, 'q', qty, 'm', meta, 'g', gold, 's', slot) order by item_id, id), '[]') from public.player_ledger where user_id = v_a and id > v_la)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('k', kind, 'n', intent, 'i', item_id, 'q', qty, 'm', meta, 'g', gold, 's', slot) order by item_id, id), '[]') from public.player_ledger where user_id = v_b and id > v_lb)::text
      into s_a, s_b;
    if s_a <> s_b or (select count(*) from public.player_ledger where user_id = v_b and id > v_lb) <> v_n then
      raise exception 'VERIFY(a): the journal differs after N singles vs one bulk: % vs %', s_a, s_b; end if;

    -- (b) THE REPLAY returns the first answer and moves nothing.
    v2 := public.hr_bank_move_many(0, v_list, (k || '1001')::uuid);
    if v2::text <> v::text or (select count(*) from public.player_ledger where user_id = v_b and id > v_lb) <> v_n
       or (select version from public.player_state where user_id = v_b and slot = 0) <> v_ver + 1 then
      raise exception 'VERIFY(b): a replay answered % or moved something', v2; end if;
    -- The same key under another list is a mismatch, journalled, nothing moved.
    v2 := public.hr_bank_move_many(0, v_wlist, (k || '1001')::uuid);
    if v2->>'error' is distinct from 'intent_mismatch' then raise exception 'VERIFY(b): the key under another list answered %', v2; end if;

    -- (c) PARITY, WITHDRAW.
    select coalesce(max(id), 0) into v_la from public.player_ledger where user_id = v_a;
    select coalesce(max(id), 0) into v_lb from public.player_ledger where user_id = v_b;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    for v_i in 1 .. v_n loop
      v := public.hr_bank_move(0, v_kinds[v_i], (select qty from public.account_bank where user_id = v_a and item_id = v_kinds[v_i]), 'withdraw', (k || lpad((100 + v_i)::text, 4, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): a single withdraw of % answered %', v_kinds[v_i], v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_bank_move_many(0, v_wlist, (k || '1002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'count')::int <> v_n then raise exception 'VERIFY(c): the bulk withdraw answered %', v; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.account_bank where user_id = v_a)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.account_bank where user_id = v_b)::text
      into s_a, s_b;
    if s_a <> s_b or s_a <> '[]' then raise exception 'VERIFY(c): Storage differs or is not empty after the withdraws: % vs %', s_a, s_b; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.player_inventory where user_id = v_a and slot = 0)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.player_inventory where user_id = v_b and slot = 0)::text
      into s_a, s_b;
    if s_a <> s_b then raise exception 'VERIFY(c): the bags differ after N singles vs one bulk: % vs %', s_a, s_b; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('k', kind, 'n', intent, 'i', item_id, 'q', qty, 'm', meta, 'g', gold, 's', slot) order by item_id, id), '[]') from public.player_ledger where user_id = v_a and id > v_la)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('k', kind, 'n', intent, 'i', item_id, 'q', qty, 'm', meta, 'g', gold, 's', slot) order by item_id, id), '[]') from public.player_ledger where user_id = v_b and id > v_lb)::text
      into s_a, s_b;
    if s_a <> s_b then raise exception 'VERIFY(c): the journal differs after the withdraws: % vs %', s_a, s_b; end if;

    -- (d) A LOCKED STACK refuses the whole press, named, nothing moved, the key free.
    select coalesce(max(id), 0) into v_lb from public.player_ledger where user_id = v_b;
    select version into v_ver from public.player_state where user_id = v_b and slot = 0;
    v := public.hr_item_lock(0, v_kinds[2], true, (k || '2001')::uuid);
    if not public.hr_item_locked(v_b, 0, v_kinds[2]) then raise exception 'VERIFY(d): the lock answered %', v; end if;
    v := public.hr_bank_move_many(0, v_list, (k || '2002')::uuid);
    if v->>'error' is distinct from 'item_locked' or v->>'item_id' is distinct from v_kinds[2] or (v->>'index')::int <> 1 then
      raise exception 'VERIFY(d): a bulk deposit over a locked stack answered %', v; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.account_bank where user_id = v_b)::text into s_b;
    if s_b <> '[]' or (select count(*) from public.player_ledger where user_id = v_b and id > v_lb) <> 0
       or (select version from public.player_state where user_id = v_b and slot = 0) <> v_ver
       or exists (select 1 from public.player_intents where user_id = v_b and intent_id = (k || '2002')::uuid) then
      raise exception 'VERIFY(d): the refused press moved the first stack, wrote a row, bumped the version or kept the key'; end if;
    perform public.hr_item_lock(0, v_kinds[2], false, (k || '2003')::uuid);

    -- (e) STORAGE FULL on the second new kind names it; the first is unwound too.
    update public.hr_depot_config set base_stacks = 1 where only_row;
    v := public.hr_bank_move_many(0, v_list, (k || '2004')::uuid);
    if v->>'error' is distinct from 'bank_full' or v->>'item_id' is distinct from v_kinds[2] or (v->>'index')::int <> 1 or (v->>'cap')::int <> 1 then
      raise exception 'VERIFY(e): a bulk deposit past the room answered %', v; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.account_bank where user_id = v_b)::text into s_b;
    if s_b <> '[]' then raise exception 'VERIFY(e): the first stack stayed in Storage after the refusal: %', s_b; end if;
    update public.hr_depot_config set base_stacks = 1000 where only_row;

    -- (f) A HUNTING HERO is refused, nothing moved.
    insert into public.hunt_instances (id, hunt_id) values (v_inst, 'mill_cellar');
    insert into public.hunt_sessions (user_id, slot, hunt_id, hunt_from, settled_to, next_swing_at, instance_id)
      values (v_b, 0, 'mill_cellar', now(), now(), now(), v_inst);
    v := public.hr_bank_move_many(0, v_list, (k || '2005')::uuid);
    if v->>'error' is distinct from 'hunt_open' or v->>'hunt' is distinct from 'mill_cellar' then
      raise exception 'VERIFY(f): a bulk deposit on a hunting hero answered %', v; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'q', qty) order by item_id), '[]') from public.account_bank where user_id = v_b)::text into s_b;
    if s_b <> '[]' then raise exception 'VERIFY(f): a hunting hero moved a stack'; end if;
    delete from public.hunt_sessions where user_id = v_b and slot = 0 and instance_id = v_inst;
    delete from public.hunt_instances where id = v_inst;

    -- (g) BAD INPUT: an empty list, a bare string, a twice-named item, an unknown id (named), a bad direction.
    v := public.hr_bank_move_many(0, '[]'::jsonb, (k || '2006')::uuid);
    if v->>'error' is distinct from 'bad_items' then raise exception 'VERIFY(g): an empty list answered %', v; end if;
    v := public.hr_bank_move_many(0, jsonb_build_array(v_kinds[1]), (k || '2006')::uuid);
    if v->>'error' is distinct from 'bad_items' then raise exception 'VERIFY(g): a bare string answered %', v; end if;
    v := public.hr_bank_move_many(0, jsonb_build_array(jsonb_build_object('item', v_kinds[1], 'dir', 'deposit'), jsonb_build_object('item', v_kinds[1], 'dir', 'withdraw')), (k || '2006')::uuid);
    if v->>'error' is distinct from 'bad_items' then raise exception 'VERIFY(g): an item named twice answered %', v; end if;
    v := public.hr_bank_move_many(0, jsonb_build_array(jsonb_build_object('item', v_kinds[1], 'dir', 'deposit'), jsonb_build_object('item', 'no_such_item_zz', 'dir', 'deposit')), (k || '2006')::uuid);
    if v->>'error' is distinct from 'unknown_item' or v->>'item_id' is distinct from 'no_such_item_zz' then raise exception 'VERIFY(g): an unknown id answered %', v; end if;
    v := public.hr_bank_move_many(0, jsonb_build_array(jsonb_build_object('item', v_kinds[1], 'dir', 'sideways')), (k || '2006')::uuid);
    if v->>'error' is distinct from 'bad_items' then raise exception 'VERIFY(g): a bad direction answered %', v; end if;
    if exists (select 1 from public.player_intents where user_id = v_b and intent_id = (k || '2006')::uuid) then
      raise exception 'VERIFY(g): a refused press consumed its key'; end if;

    -- (h) LOCK PARITY: A locks the first three kinds one by one, B in one call; the rules rows are identical; the replay
    -- returns the first answer; the bulk unlock leaves what the single unlocks leave (nothing: a row that says nothing is deleted).
    select jsonb_agg(to_jsonb(x) order by x) into v_llist from unnest(v_kinds[1:3]) x;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    for v_i in 1 .. 3 loop
      v := public.hr_item_lock(0, v_kinds[v_i], true, (k || lpad((300 + v_i)::text, 4, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(h): a single lock answered %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_item_lock_many(0, v_llist, true, (k || '3001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'count')::int <> 3 or jsonb_array_length(v->'bag_rules'->'locked') <> 3 then
      raise exception 'VERIFY(h): the bulk lock answered %', v; end if;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'l', locked, 'r', loot_rule, 's', restock) order by item_id), '[]') from public.player_item_rules where user_id = v_a and slot = 0)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'l', locked, 'r', loot_rule, 's', restock) order by item_id), '[]') from public.player_item_rules where user_id = v_b and slot = 0)::text
      into s_a, s_b;
    if s_a <> s_b then raise exception 'VERIFY(h): the rules differ after 3 singles vs one bulk: % vs %', s_a, s_b; end if;
    v2 := public.hr_item_lock_many(0, v_llist, true, (k || '3001')::uuid);
    if v2::text <> v::text then raise exception 'VERIFY(h): a replayed bulk lock answered %', v2; end if;
    v2 := public.hr_item_lock_many(0, v_llist, false, (k || '3001')::uuid);
    if v2->>'error' is distinct from 'intent_mismatch' then raise exception 'VERIFY(h): the key under the other direction answered %', v2; end if;
    v := public.hr_item_lock_many(0, v_llist, false, (k || '3002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'count')::int <> 3 then raise exception 'VERIFY(h): the bulk unlock answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    for v_i in 1 .. 3 loop perform public.hr_item_lock(0, v_kinds[v_i], false, (k || lpad((310 + v_i)::text, 4, '0'))::uuid); end loop;
    select (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'l', locked, 'r', loot_rule, 's', restock) order by item_id), '[]') from public.player_item_rules where user_id = v_a and slot = 0)::text,
           (select coalesce(jsonb_agg(jsonb_build_object('i', item_id, 'l', locked, 'r', loot_rule, 's', restock) order by item_id), '[]') from public.player_item_rules where user_id = v_b and slot = 0)::text
      into s_a, s_b;
    if s_a <> s_b or s_b <> '[]' then raise exception 'VERIFY(h): the rules differ after the unlocks: % vs %', s_a, s_b; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_item_lock_many(0, jsonb_build_array(v_kinds[1], 'no_such_item_zz'), true, (k || '3003')::uuid);
    if v->>'error' is distinct from 'unknown_item' or v->>'item_id' is distinct from 'no_such_item_zz' then raise exception 'VERIFY(h): an unknown id answered %', v; end if;
    v := public.hr_item_lock_many(0, jsonb_build_array(v_kinds[1], v_kinds[1]), true, (k || '3003')::uuid);
    if v->>'error' is distinct from 'bad_items' then raise exception 'VERIFY(h): an id named twice answered %', v; end if;

    raise exception using errcode = 'HR882', message = 'bank-move-many §6 complete - rolling back';
  exception when sqlstate 'HR882' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from public.account_bank where user_id in (v_a, v_b))
     or exists (select 1 from public.player_item_rules where user_id in (v_a, v_b)) or exists (select 1 from public.player_ledger where user_id in (v_a, v_b))
     or exists (select 1 from public.hunt_instances where id = v_inst) then
    raise exception 'VERIFY(i): §6 LEAKED a probe row'; end if;
  -- (j) THE GRANTS: the two verbs are authenticated-only; the per-stack body is server-only; both are on the baseline.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_bank_move_stack(uuid,integer,text,bigint,text,integer)', 'execute') then
      raise exception 'VERIFY(j): % reaches hr_bank_move_stack', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_bank_move_many(integer,jsonb,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_bank_move_many(integer,jsonb,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_bank_move_many(integer,jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_item_lock_many(integer,jsonb,boolean,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_item_lock_many(integer,jsonb,boolean,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_item_lock_many(integer,jsonb,boolean,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_bank_move(integer,text,bigint,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_bank_move(integer,text,bigint,text,uuid)', 'execute') then
    raise exception 'VERIFY(j): hr_bank_move_many / hr_item_lock_many / hr_bank_move are not authenticated-only'; end if;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated'
        and (proname, identity_args) in (('hr_bank_move_many', 'p_slot integer, p_items jsonb, p_idem uuid'),
                                         ('hr_item_lock_many', 'p_slot integer, p_items jsonb, p_locked boolean, p_idem uuid'))) <> 2 then
    raise exception 'VERIFY(j): the two verbs are not on the client baseline'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'bank-move-many: N stacks in one call = N single calls (journal and state byte-identical), all or nothing, named refusals, one key; all green';
end $$;
