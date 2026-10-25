-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-23-loot-dispatch.sql — THE LOOT PLAN AND "DISPATCH LOOT".
--   Tyler 2026-10-25: the item menu's "On pickup" choice (Keep / Sell at the shop / Leave
--   it) becomes a DESTINATION PLAN per item — Keep in bag, Deposit in storage, Sell — and
--   NOTHING MOVES AT PICKUP any more: the plan runs when the player presses "Dispatch
--   loot", in town. "Leave it" (not picking an item up during a hunt) stays the pickup
--   filter, exactly as today, shown as its own choice ("Don't pick up").
--
-- STATUS: STAGED, NOT APPLIED (lane/c-store-all, backend-architect, 2026-10-25). Game
-- CLOSED: applies on its passing §6 (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00-00:10 UTC). MONEY SURFACE (a vendor sale mints gold): the one
-- Security review before Steam EA covers it (CLAUDE.md §2, Tyler 2026-10-25). Contract:
-- docs/design/ARCHITECTURE_CONTRACTS.md §23 "Loot plan and Dispatch loot".
--
-- ── THE PLAN (player_item_rules.loot_rule, per hero, per item; no row = keep) ──
--   keep      the default. A hunt bags it; Dispatch leaves it in the bag.
--   deposit   a hunt bags it; Dispatch moves the WHOLE bag stack to the account's Storage.
--   sell      a hunt bags it (it NO LONGER sells on pickup); Dispatch sells the whole bag
--             stack at the vendor's bid (hr_hunt_vendor_value, the catalogue vendor_sell
--             prices with), through hr_apply: the same journal as vendor_sell_many.
--   ignore    "Don't pick up": the settle leaves the picked-up units behind (unchanged).
--   A LOCKED stack is never dispatched; a start-kit item may be deposited but never sold
--   (hr_loot_plan_refusal, the one answer the setter and Dispatch both ask).
--
-- ── THE CONTRACT (authenticated; the client sends a slot and a key, nothing else) ──
--   hr_loot_rule_set(p_slot, p_item, p_rule keep|deposit|sell|ignore, p_idem)  RESTATED
--   hr_loot_dispatch(p_slot, p_idem) -> {ok, version, stored {stacks, units, items},
--       sold {stacks, units, gold, items}, unplaced {stacks, items, why, cap, used},
--       kept {locked, kit, later}, sell_refused}
--     · every number is the server's: the plan rows, the bag, the bid, the room.
--     · ONE press = at most two ledger rows: one 'bank' row (intent loot_dispatch:deposit,
--       qty = -units moved, meta.items) and hr_apply's one 'shop' row (intent
--       vendor_sell_many:<n>:<digest>, gold = Σ qty x bid, gold_in stamped, gold_kind
--       vendor_sale, meta.lines {item: [qty, unit]}). Never one row per stack.
--   hr_hunt_loot_rules (the settle's hook)                                    RESTATED
--     only `ignore` acts at pickup; `sell` and `deposit` leave the bag alone.
--
-- ── ERROR TAXONOMY (refusal codes; a refusal never consumes the key) ─────
--   shape:  not_signed_in, bad_slot, bad_idem, bad_intent (setter), unknown_item (setter)
--   gates:  closed (closed mode), rate_limited (bucket bank_move, 60/min), settle_first /
--           party_hunt_running (an unpaid town window), hunting (an open hunt: the hero is
--           not in town)
--   rules:  start_kit (a sell plan on the starting kit), item_not_sellable (setter)
--   state:  no_character, nothing_to_dispatch {locked, kit}, storage_full {cap, used,
--           stacks} (nothing moved: every planned deposit was a new kind and Storage has
--           no room, and nothing was planned to sell); a sale hr_apply refuses (its day
--           budget, its clamps) is reported as sell_refused beside what was stored, or as
--           that refusal when nothing was stored
--   idempotency: intent_mismatch; a decided key replays its stored answer
--
-- ── THE LOCK ORDER (hr_bank_move's and the market's; asserted by order of statements) ──
--   (1) the acting hero: hr_hunt_lock(user, slot) = hr_apply's advisory key + its
--       player_state row + its open hunt row (refused `hunting` when one exists)
--   (2) the account's Storage lock: advisory hashtextextended('hr:depot:'||user, 0)
--   (3) the hero's bag rows FOR UPDATE (item order), account_bank rows by upsert
--   (4) the purse, LAST, inside hr_apply (hr_purse_lock), so a market buy into Storage
--       (hero -> Storage -> purses) and a Dispatch can never wait on each other in a cycle.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
--   The key is checked unlocked (hr_intent_replay, intent 'loot_dispatch') and AGAIN under
--   the hero lock, so two presses racing on one key move once and answer alike. The sale's
--   hr_apply key is derived from the press's (md5(key:loot_dispatch_sell)), so a replay
--   never reaches it. The answer is stored in player_intents with the press's key.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +1 client RPC (hr_loot_dispatch, baseline row). It names no item, count or price: it
--   runs plans the setter already validated, re-validated here under the lock. Gold minted
--   = Σ bag qty x catalogue bid, the same as vendor_sell_many of the same stacks (hr_apply:
--   item_locked, the 50M clamp, the gross day budget); deposits are conserved transfers
--   (bag - = Storage +) inside hr_bank_move's room rule (hr_storage_room_fits). The pickup
--   sale is REMOVED: a hunt mints no vendor gold from loot any more.
--
-- ── COST AT 100x ────────────────────────────────────────────────────────────
--   player_item_rules: unchanged shape (one row per planned item; ≤ ~60 per hero, ~2 KB).
--   player_ledger: ≤ 2 rows per press (≈ 400 B each with meta.items of a full bag); at
--   200 accounts x 4 heroes x ~10 presses/day ≈ 16k rows/day, ~6 MB/day before the prune.
--   player_intents: 2 rows per press, pruned at 25 h. Work per press: one indexed scan of
--   the hero's bag (≤ bank_cap rows) and one upsert per deposited stack.
--
-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
--   Re-apply 2026-10-25-bag-rules.sql's hr_loot_rule_set and 2026-12-15-account-gold.sql's
--   hr_hunt_loot_rules (pickup sale back), delete every 'deposit' row (or set it to keep),
--   restore the three-value check, drop hr_loot_dispatch (+ its baseline row) and
--   hr_loot_plan_refusal. No player value is reshaped by this file.
-- ORDER: after 2027-01-20-tutorial-facts.sql. Touches hr_loot_rule_set and
-- hr_hunt_loot_rules only (§0 pins both); reads hr_storage_room_fits (2027-01-12).
-- No begin/commit (CLAUDE.md §2).
-- AFTER APPLYING (Coordinator): live-hash-drift --live --write (hr_loot_rule_set,
-- hr_hunt_loot_rules, hr_loot_dispatch, hr_loot_plan_refusal); flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.player_item_rules') is null or to_regclass('public.account_bank') is null
     or to_regclass('public.player_ledger') is null or to_regclass('public.hunt_sessions') is null
     or to_regclass('public.hr_hunt_vendor_value') is null or to_regclass('public.hr_start_inventory') is null
     or to_regclass('public.hr_start_equipment') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: player_item_rules / account_bank / player_ledger / hunt_sessions / the catalogues / hr_client_rpc_baseline missing'; end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_settle_first_noted(text,uuid,integer)') is null
     or to_regprocedure('public.hr_storage_room_fits(uuid,text)') is null
     or to_regprocedure('public.hr_storage_room_cap(uuid)') is null
     or to_regprocedure('public.hr_storage_room_used(uuid)') is null
     or to_regprocedure('public.hr_item_rule_put(uuid,integer,text,boolean,text,integer)') is null
     or to_regprocedure('public.hr_bag_rules_view(uuid,integer)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_purse_of(uuid)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a primitive this file is built from is missing (hr_apply, hero lock, settle-first, Storage room, rule writer, replay, rejections, rate gate, purse, grant hygiene)'; end if;
  -- Each restated body is its live image (pre: measured on the replay = production,
  -- tests/live-hash-drift.baseline.json, 2026-10-25) or this file's own (post). Anything
  -- else means another file moved it: re-pin first.
  for r in select * from (values
    ('public.hr_loot_rule_set(integer,text,text,uuid)', 'c093f58091750ec31a2befb8e3363b9b', 'cfa8fc9bce2ea4c1e626eb8b4cf5adc6', '2026-10-25-bag-rules.sql'),
    ('public.hr_hunt_loot_rules(uuid,integer,uuid,uuid,jsonb,timestamp with time zone)', 'bf314f41f2ae45588d212e62ee2c7ce6', '00a39317b7b8d4a93b9f39748dad2064', '2026-12-15-account-gold.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; re-pin',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE PLAN COLUMN ADMITS `deposit` ─────────────────────────────────────
-- The column keeps its name (every reader, the section and the presets copy it as is);
-- the check is renamed so a second apply drops and re-adds the same constraint.
alter table public.player_item_rules drop constraint if exists player_item_rules_loot_rule_check;
alter table public.player_item_rules drop constraint if exists player_item_rules_loot_rule_ck;
alter table public.player_item_rules add constraint player_item_rules_loot_rule_ck
  check (loot_rule in ('keep', 'deposit', 'sell', 'ignore'));
comment on column public.player_item_rules.loot_rule is
  '2027-01-23-loot-dispatch.sql: the item''s loot plan, run by hr_loot_dispatch in town (keep = the default, no row; '
  'deposit = to the account''s Storage; sell = at the vendor''s bid), or the pickup filter (ignore = the settle leaves it behind). '
  'Nothing moves at pickup except ignore.';

-- ── §2 THE ONE ANSWER: MAY THIS PLAN MOVE THIS ITEM? ───────────────────────
-- Null = allowed. Asked by the setter (refuses) and by Dispatch (skips, counts it), so a
-- plan the setter accepted can never be run on an item it would now refuse, and the reverse.
create or replace function public.hr_loot_plan_refusal(p_item text, p_plan text)
returns text language sql stable set search_path = public, pg_catalog as $$
  select case
    when p_plan is null or p_plan in ('keep', 'ignore') then null
    -- the hero's starting kit (generated from src/data/start-kit.js) is never SOLD by a plan (no
    -- minting from the kit; the market's listable rule, 2027-01-12, refuses it too); it may be
    -- DEPOSITED, as Storage already takes it one stack at a time (Coordinator 2026-10-25).
    when p_plan = 'sell' and (exists (select 1 from public.hr_start_inventory k where k.item_id = p_item)
      or exists (select 1 from public.hr_start_equipment k where k.item_id = p_item)) then 'start_kit'
    -- sell only what the vendor prices (the catalogue vendor_sell and the pickup sale priced with).
    when p_plan = 'sell' and not exists (select 1 from public.hr_hunt_vendor_value v where v.item_id = p_item and v.unit > 0)
      then 'item_not_sellable'
    else null end
$$;
revoke execute on function public.hr_loot_plan_refusal(text, text) from public, anon, authenticated, service_role;

-- ── §3 THE SETTER, RESTATED WHOLE (§0 pin c093f580) ─────────────────────────
-- One change from 2026-10-25-bag-rules.sql's image: the rule is one of the FOUR plans, and
-- every refusal by item is hr_loot_plan_refusal's.
create or replace function public.hr_loot_rule_set(p_slot int, p_item text, p_rule text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- Restated by 2027-01-23-loot-dispatch.sql: the item's loot plan (keep | deposit | sell, run by
-- hr_loot_dispatch in town) or the pickup filter (ignore). The plan's refusals by item are
-- hr_loot_plan_refusal's (start_kit, item_not_sellable), the one answer Dispatch asks too.
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_why text; v_row public.player_item_rules%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,64}$' or p_rule is null or p_rule not in ('keep', 'deposit', 'sell', 'ignore') then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'loot_rule_set:' || p_item || ':' || p_rule;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('loot_rule_set', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item', p_item)); end if;
  v_why := public.hr_loot_plan_refusal(p_item, p_rule);
  if v_why is not null then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', v_why, 'item', p_item)); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('loot_rule_set', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_row from public.player_item_rules where user_id = v_uid and slot = p_slot and item_id = p_item for update;
  perform public.hr_item_rule_put(v_uid, p_slot, p_item, v_row.locked, p_rule, v_row.restock);
  v_r := jsonb_build_object('ok', true, 'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_loot_rule_set(int, text, text, uuid) from public;
revoke execute on function public.hr_loot_rule_set(int, text, text, uuid) from anon, service_role;
grant  execute on function public.hr_loot_rule_set(int, text, text, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'added 2026-10-25 (lane S2); 2027-01-23-loot-dispatch.sql: the item''s loot plan keep / deposit / sell (run by '
              'hr_loot_dispatch in town) or the pickup filter ignore; start-kit items take no sell plan; moves no value'
 where grantee = 'authenticated' and proname = 'hr_loot_rule_set';

-- ── §4 THE PICKUP FILTER, RESTATED WHOLE (§0 pin bf314f41) ──────────────────
-- 2026-12-15-account-gold.sql's image less its SALE: only `ignore` acts at pickup. The
-- caller (hr_hunt_apply_member) keeps its one call; nothing reads the answer but the tests.
CREATE OR REPLACE FUNCTION public.hr_hunt_loot_rules(p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_items jsonb, p_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- Restated by 2027-01-23-loot-dispatch.sql (Tyler 2026-10-25): NOTHING SELLS AT PICKUP. A
-- `sell` or `deposit` plan waits in the bag for Dispatch loot (hr_loot_dispatch, in town);
-- only the pickup filter `ignore` ("Don't pick up") acts here, as before: at most
-- min(picked up, held) units leave the bag through ONE hr_apply, a locked item never.
declare
  v_r record; v_have bigint; v_q bigint;
  v_left jsonb := '{}'::jsonb; v_litems jsonb := '{}'::jsonb;
  v_b jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'object' or p_intent is null then return null; end if;
  for v_r in
    select e.key as item, (e.value #>> '{}')::numeric::bigint as n
      from jsonb_each(p_items) e
      join public.player_item_rules r on r.user_id = p_user and r.slot = p_slot and r.item_id = e.key
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric >= 1
       and r.loot_rule = 'ignore' and not r.locked
     order by e.key
  loop
    select qty into v_have from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_r.item;
    v_q := least(v_r.n, coalesce(v_have, 0));
    continue when v_q <= 0;
    v_left := v_left || jsonb_build_object(v_r.item, v_q);
    v_litems := v_litems || jsonb_build_object(v_r.item, -v_q);
  end loop;
  if v_litems <> '{}'::jsonb then
    v_b := public.hr_apply(p_user, p_slot, (select version from public.player_state where user_id = p_user and slot = p_slot),
             md5(p_intent::text || ':loot_ignore')::uuid,
             jsonb_build_object('items', v_litems,
               'journal', jsonb_build_object('kind', 'admin', 'intent', 'loot_ignore',
                 'meta', jsonb_build_object('reason', 'loot_ignore', 'items', v_left, 'session', p_session, 'at', p_at))));
  end if;
  return jsonb_build_object('left', case when coalesce(v_b->>'ok', '') = 'true' then v_left else '{}'::jsonb end,
                            'refused', v_b->>'error');
end $function$;
revoke all on function public.hr_hunt_loot_rules(uuid, integer, uuid, uuid, jsonb, timestamp with time zone) from public, anon, authenticated, service_role;

-- ── §5 DISPATCH LOOT ────────────────────────────────────────────────────────
create or replace function public.hr_loot_dispatch(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- 2027-01-23-loot-dispatch.sql (Tyler 2026-10-25): run the hero's loot plans on its bag, in
-- town. Every planned stack whole: deposit -> the account's Storage while it has room (a kind
-- already there always fits; new kinds in item order), sell -> the vendor's bid through ONE
-- hr_apply. Locked stacks and start-kit items are never moved. The client names nothing.
declare
  c_verb       constant text   := 'loot_dispatch';
  c_max_kinds  constant int    := 200;        -- hr_apply's c_max_item_kinds: the sale's lines per press
  c_max_units  constant bigint := 1000000;    -- hr_apply's c_max_item_delta: one stack's units per press
  c_max_gold   constant bigint := 50000000;   -- hr_apply's c_max_gold_delta: the sale's gold per press
  v_uid     uuid := auth.uid();
  v_r       jsonb;
  v_s       public.hunt_sessions%rowtype;
  v_version bigint;
  v_row     record;
  v_q       bigint;
  v_stored  jsonb := '{}'::jsonb;  v_stored_n int := 0;  v_stored_u bigint := 0;
  v_unpl    jsonb := '{}'::jsonb;  v_unpl_n int := 0;
  v_sitems  jsonb := '{}'::jsonb;  v_lines jsonb := '{}'::jsonb;  v_sold jsonb := '{}'::jsonb;
  v_sold_n  int := 0;  v_sold_u bigint := 0;  v_gold bigint := 0;  v_canon text := '';
  v_locked  int := 0;  v_kit int := 0;  v_later int := 0;
  v_a       jsonb;
  v_refused text;
  v_sold_ok boolean := false;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- IDEMPOTENCY (unlocked pre-check): a decided key answers its stored result.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql): an unpaid town window is priced
  -- at the bag that existed during it, so nothing leaves the bag while one is open.
  v_r := public.hr_settle_first_noted(c_verb, v_uid, p_slot);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('bank_move') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- (1) THE HERO: its advisory key, its row, its open hunt (hr_hunt_lock) ...
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select version into v_version from public.player_state where user_id = v_uid and slot = p_slot;
  if v_version is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- ... the same key AGAIN, under the lock: a press racing this one on its key has committed by now.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- A hero out hunting is not in town (Storage is at home, the vendor in town).
  if v_s.id is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunting', 'hunt', v_s.hunt_id)); end if;
  -- (2) THE ACCOUNT'S STORAGE LOCK (hr_bank_move's key), before anything below can take the purse.
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));

  -- (3) THE PLAN, read under the locks: every bag stack with a deposit or sell plan, item order.
  for v_row in
    select i.item_id, i.qty, r.loot_rule as plan, r.locked, vv.unit
      from public.player_inventory i
      join public.player_item_rules r on r.user_id = i.user_id and r.slot = i.slot and r.item_id = i.item_id
      left join public.hr_hunt_vendor_value vv on vv.item_id = i.item_id
     where i.user_id = v_uid and i.slot = p_slot and i.qty > 0 and r.loot_rule in ('deposit', 'sell')
     order by i.item_id
       for update of i
  loop
    if v_row.locked then v_locked := v_locked + 1; continue; end if;
    if public.hr_loot_plan_refusal(v_row.item_id, v_row.plan) is not null then v_kit := v_kit + 1; continue; end if;
    if v_row.plan = 'deposit' then
      -- BAG -> STORAGE, the whole stack, while the account has room (hr_bank_move's rule:
      -- the kinds in Storage + the kinds it has listed, under its own cap).
      if not public.hr_storage_room_fits(v_uid, v_row.item_id) then
        v_unpl := v_unpl || jsonb_build_object(v_row.item_id, v_row.qty);
        v_unpl_n := v_unpl_n + 1;
        continue;
      end if;
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_row.item_id;
      insert into public.account_bank as b (user_id, item_id, qty, updated_at)
        values (v_uid, v_row.item_id, v_row.qty, now())
        on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
      v_stored := v_stored || jsonb_build_object(v_row.item_id, v_row.qty);
      v_stored_n := v_stored_n + 1;
      v_stored_u := v_stored_u + v_row.qty;
    else
      -- SELL: priced by the catalogue's bid alone; one press stays inside hr_apply's clamps
      -- (what does not fit stays in the bag for the next press, counted as `later`).
      v_q := least(v_row.qty, c_max_units);
      if v_sold_n >= c_max_kinds or v_gold + v_q * v_row.unit > c_max_gold then v_later := v_later + 1; continue; end if;
      if v_q < v_row.qty then v_later := v_later + 1; end if;
      v_sitems := v_sitems || jsonb_build_object(v_row.item_id, -v_q);
      v_lines  := v_lines || jsonb_build_object(v_row.item_id, jsonb_build_array(v_q, v_row.unit));
      v_sold   := v_sold || jsonb_build_object(v_row.item_id, v_q);
      v_canon  := v_canon || v_row.item_id || '*' || v_q || ',';
      v_sold_n := v_sold_n + 1;
      v_sold_u := v_sold_u + v_q;
      v_gold   := v_gold + v_q * v_row.unit;
    end if;
  end loop;

  -- (4) THE SALE: ONE hr_apply, the vendor_sell_many journal (kind shop, gold_kind vendor_sale,
  -- gold_in stamped, its item_locked refusal and its day budget), the purse locked last.
  if v_sold_n > 0 then
    v_a := public.hr_apply(v_uid, p_slot, v_version, md5(p_idem::text || ':loot_dispatch_sell')::uuid,
             jsonb_build_object('gold', v_gold, 'items', v_sitems,
               'journal', jsonb_build_object('kind', 'shop',
                 'intent', 'vendor_sell_many:' || v_sold_n || ':' || left(md5(v_canon), 16),
                 'meta', jsonb_build_object('lines', v_lines, 'via', c_verb))));
    v_sold_ok := coalesce(v_a->>'ok', '') = 'true';
    if not v_sold_ok then v_refused := coalesce(v_a->>'error', 'refused'); end if;
  end if;

  -- NOTHING MOVED: a refusal (writes nothing, keeps the key free).
  if v_stored_n = 0 and not v_sold_ok then
    if v_refused is not null then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_refused) || coalesce(v_a - 'ok' - 'error', '{}'::jsonb));
    end if;
    if v_unpl_n > 0 then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'storage_full',
        'cap', public.hr_storage_room_cap(v_uid), 'used', public.hr_storage_room_used(v_uid), 'stacks', v_unpl_n));
    end if;
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'nothing_to_dispatch',
      'locked', v_locked, 'kit', v_kit, 'later', v_later));
  end if;

  -- THE DEPOSIT'S JOURNAL: one aggregate row (rule 6 - never per stack). qty is the BAG-side
  -- signed total (negative); meta.items names every stack; the other side is the account's.
  if v_stored_n > 0 then
    insert into public.player_ledger (user_id, slot, kind, intent, qty, meta)
      values (v_uid, p_slot, 'bank', c_verb || ':deposit', -v_stored_u,
              jsonb_build_object('dir', 'deposit', 'depot', 'account', 'items', v_stored, 'stacks', v_stored_n));
  end if;
  -- ONE VERSION STEP per press: hr_apply's when it sold, else this one.
  if v_sold_ok then
    v_version := (v_a->>'version')::bigint;
  else
    v_version := v_version + 1;
    update public.player_state set version = v_version, updated_at = now() where user_id = v_uid and slot = p_slot;
  end if;

  v_r := jsonb_build_object('ok', true, 'version', v_version,
    'stored', jsonb_build_object('stacks', v_stored_n, 'units', v_stored_u, 'items', v_stored),
    'sold', case when v_sold_ok then jsonb_build_object('stacks', v_sold_n, 'units', v_sold_u, 'gold', v_gold, 'items', v_sold)
                 else jsonb_build_object('stacks', 0, 'units', 0, 'gold', 0, 'items', '{}'::jsonb) end,
    'unplaced', jsonb_build_object('stacks', v_unpl_n, 'items', v_unpl,
                  'why', case when v_unpl_n > 0 then 'storage_full' end,
                  'cap', public.hr_storage_room_cap(v_uid), 'used', public.hr_storage_room_used(v_uid)),
    'kept', jsonb_build_object('locked', v_locked, 'kit', v_kit, 'later', v_later),
    'sell_refused', v_refused);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_loot_dispatch(int, uuid) from public;
revoke execute on function public.hr_loot_dispatch(int, uuid) from anon, service_role;
grant  execute on function public.hr_loot_dispatch(int, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_loot_dispatch';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_loot_dispatch', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2027-01-23 (Tyler 2026-10-25): MONEY (a vendor sale) - run the hero''s loot plans in town: deposit stacks to the account''s Storage '
   'while it has room, sell stacks at the catalogue bid through ONE hr_apply; names no item, count or price; refuses hunting');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-0000d15a0001';
  k    constant text := '000000c0-0000-4000-b000-0000d15a';
  v jsonb; v1 jsonb; v_role text; v_ver bigint; v_purse bigint; v_n bigint; v_inst uuid := gen_random_uuid();
  v_dep text; v_sell text; v_keep text; v_ign text; v_lock text; v_new text; v_new2 text; v_kit constant text := 'cooked_shrimp';
  v_kit2 text; v_kq bigint;
  v_unit bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'loot-dispatch §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- Seven vendor-priced items outside the start kit, in item order (Dispatch's order).
    select a[1], a[2], a[3], a[4], a[5], a[6], a[7] into v_dep, v_sell, v_keep, v_ign, v_lock, v_new, v_new2
      from (select array_agg(x.item_id order by x.item_id) a
              from (select v.item_id from public.hr_hunt_vendor_value v join public.hr_items i on i.item_id = v.item_id
                     where v.unit > 0 and public.hr_loot_plan_refusal(v.item_id, 'sell') is null order by v.item_id limit 7) x) y;
    if v_new2 is null then raise exception 'VERIFY(a): fewer than seven vendor-priced items outside the start kit'; end if;
    select unit into v_unit from public.hr_hunt_vendor_value where item_id = v_sell;

    -- (a) THE SETTER: four plans; start_kit and item_not_sellable by name; a bad plan by shape.
    v := public.hr_loot_rule_set(0, v_dep, 'deposit', (k || '0001')::uuid);
    if (v->'bag_rules'->'loot'->>v_dep) is distinct from 'deposit' then raise exception 'VERIFY(a): a deposit plan answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_sell, 'sell', (k || '0002')::uuid);
    if (v->'bag_rules'->'loot'->>v_sell) is distinct from 'sell' then raise exception 'VERIFY(a): a sell plan answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_ign, 'ignore', (k || '0003')::uuid);
    if (v->'bag_rules'->'loot'->>v_ign) is distinct from 'ignore' then raise exception 'VERIFY(a): the pickup filter answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_lock, 'deposit', (k || '0004')::uuid);
    v := public.hr_item_lock(0, v_lock, true, (k || '0005')::uuid);
    if not public.hr_item_locked(v_u, 0, v_lock) then raise exception 'VERIFY(a): the lock answered %', v; end if;
    -- the starting kit: deposit yes (Storage takes it anyway), sell never (no minting from the kit)
    v := public.hr_loot_rule_set(0, v_kit, 'deposit', (k || '0006')::uuid);
    if (v->'bag_rules'->'loot'->>v_kit) is distinct from 'deposit' then raise exception 'VERIFY(a): a start-kit deposit plan answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_kit, 'sell', (k || '0007')::uuid);
    if v->>'error' is distinct from 'start_kit' then raise exception 'VERIFY(a): a start-kit sell plan answered %', v; end if;
    v := public.hr_loot_rule_set(0, (select i.item_id from public.hr_items i where not exists (select 1 from public.hr_hunt_vendor_value w where w.item_id = i.item_id)
                                      and not exists (select 1 from public.hr_start_inventory s where s.item_id = i.item_id) and not exists (select 1 from public.hr_start_equipment s where s.item_id = i.item_id) order by 1 limit 1), 'sell', (k || '0008')::uuid);
    if v->>'error' is distinct from 'item_not_sellable' then raise exception 'VERIFY(a): selling an unpriced item answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_dep, 'store', (k || '0009')::uuid);
    if v->>'error' is distinct from 'bad_intent' then raise exception 'VERIFY(a): an unknown plan answered %', v; end if;
    -- a plan the setter can no longer make, held from before (Dispatch must skip it too)
    perform public.hr_item_rule_put(v_u, 0, v_kit, false, 'sell', 0);

    -- (b) THE PICKUP SELLS NOTHING: a sell or deposit plan leaves the picked-up units in the bag
    -- and journals no loot_sell; the pickup filter leaves its units behind; a locked one stays.
    insert into public.player_inventory (user_id, slot, item_id, qty) values
      (v_u, 0, v_sell, 7), (v_u, 0, v_dep, 11), (v_u, 0, v_ign, 5), (v_u, 0, v_lock, 6), (v_u, 0, v_keep, 4);
    v_purse := public.hr_purse_of(v_u);
    v := public.hr_hunt_loot_rules(v_u, 0, null, gen_random_uuid(), jsonb_build_object(v_sell, 3, v_dep, 4, v_ign, 2, v_lock, 1), now());
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_sell) is distinct from 7::bigint
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_dep) is distinct from 11::bigint
       or public.hr_purse_of(v_u) <> v_purse
       or exists (select 1 from public.player_ledger where user_id = v_u and intent = 'loot_sell') then
      raise exception 'VERIFY(b): a pickup sold or moved a planned item: %', v; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_ign) is distinct from 3::bigint
       or (v->'left'->>v_ign)::bigint is distinct from 2::bigint then
      raise exception 'VERIFY(b): the pickup filter did not leave the 2 picked-up units behind: %', v; end if;
    v := public.hr_loot_rule_set(0, v_lock, 'ignore', (k || '0010')::uuid);
    v := public.hr_hunt_loot_rules(v_u, 0, null, gen_random_uuid(), jsonb_build_object(v_lock, 1), now());
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_lock) is distinct from 6::bigint then
      raise exception 'VERIFY(b): a locked item was left behind by the pickup filter'; end if;
    v := public.hr_loot_rule_set(0, v_lock, 'deposit', (k || '0011')::uuid);

    -- (c) DISPATCH: the deposit stack moves whole (bag - = Storage +), the sell stack is sold at the
    -- catalogue bid (purse + exactly qty x unit), keep / ignore / locked / start-kit stay; ONE row
    -- per kind; ONE version step.
    v_ver := (select version from public.player_state where user_id = v_u and slot = 0);
    v_purse := public.hr_purse_of(v_u);
    v_n := (select coalesce(max(id), 0) from public.player_ledger);
    v1 := public.hr_loot_dispatch(0, (k || '0100')::uuid);
    if coalesce(v1->>'ok', '') <> 'true' then raise exception 'VERIFY(c): Dispatch refused: %', v1; end if;
    if exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id in (v_dep, v_sell))
       or (select qty from public.account_bank where user_id = v_u and item_id = v_dep) is distinct from 11::bigint
       or exists (select 1 from public.account_bank where user_id = v_u and item_id = v_sell) then
      raise exception 'VERIFY(c): the planned stacks did not move whole: %', v1; end if;
    if public.hr_purse_of(v_u) - v_purse <> 7 * v_unit or (v1->'sold'->>'gold')::bigint <> 7 * v_unit
       or (v1->'stored'->>'units')::bigint <> 11 or (v1->'stored'->>'stacks')::int <> 1 or (v1->'sold'->>'stacks')::int <> 1 then
      raise exception 'VERIFY(c): the sale is not 7 x the catalogue bid % (purse %): %', v_unit, public.hr_purse_of(v_u) - v_purse, v1; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_keep) is distinct from 4::bigint
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_ign) is distinct from 3::bigint
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_lock) is distinct from 6::bigint
       or not exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit)
       or (v1->'kept'->>'locked')::int <> 1 or (v1->'kept'->>'kit')::int <> 1 then
      raise exception 'VERIFY(c): a keep / ignore / locked / start-kit stack moved: %', v1; end if;
    -- (hr_apply may add its own non-value rows, e.g. renown_ratchet; the value rows are these two)
    if (select count(*) from public.player_ledger where id > v_n and user_id = v_u and (kind in ('bank', 'shop') or coalesce(gold, 0) <> 0 or qty is not null)) <> 2
       or (select count(*) from public.player_ledger where id > v_n and user_id = v_u and kind = 'bank' and intent = 'loot_dispatch:deposit'
             and qty = -11 and (meta->'items'->>v_dep)::bigint = 11) <> 1
       or (select count(*) from public.player_ledger where id > v_n and user_id = v_u and kind = 'shop' and intent like 'vendor\_sell\_many:1:%'
             and gold = 7 * v_unit and gold_in = 7 * v_unit and gold_kind = 'vendor_sale'
             and (meta->'lines'->v_sell->>0)::bigint = 7 and (meta->'lines'->v_sell->>1)::bigint = v_unit) <> 1 then
      raise exception 'VERIFY(c): the journal is not one deposit row and one vendor_sell_many row'; end if;
    if (select version from public.player_state where user_id = v_u and slot = 0) <> v_ver + 1 or (v1->>'version')::bigint <> v_ver + 1 then
      raise exception 'VERIFY(c): the version moved % steps', (select version from public.player_state where user_id = v_u and slot = 0) - v_ver; end if;

    -- (d) A REPLAY moves nothing and answers the first press's words.
    v_n := (select coalesce(max(id), 0) from public.player_ledger);
    v_purse := public.hr_purse_of(v_u);
    v := public.hr_loot_dispatch(0, (k || '0100')::uuid);
    if v is distinct from v1 or public.hr_purse_of(v_u) <> v_purse
       or exists (select 1 from public.player_ledger where id > v_n and user_id = v_u)
       or (select qty from public.account_bank where user_id = v_u and item_id = v_dep) is distinct from 11::bigint then
      raise exception 'VERIFY(d): a replay answered % or moved something', v; end if;

    -- (d2) A START-KIT ITEM PLANNED DEPOSIT moves whole to Storage (no gold); the start-kit SELL plan
    -- held from before is still skipped and counted.
    select k2.item_id into v_kit2 from public.hr_start_inventory k2 join public.player_inventory i on i.item_id = k2.item_id
     where i.user_id = v_u and i.slot = 0 and k2.item_id <> v_kit order by k2.item_id limit 1;
    if v_kit2 is null then raise exception 'VERIFY(d2): the new hero holds no second start-kit item'; end if;
    v_kq := (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit2);
    v := public.hr_loot_rule_set(0, v_kit2, 'deposit', (k || '0150')::uuid);
    if (v->'bag_rules'->'loot'->>v_kit2) is distinct from 'deposit' then raise exception 'VERIFY(d2): a start-kit deposit plan answered %', v; end if;
    v_purse := public.hr_purse_of(v_u);
    v := public.hr_loot_dispatch(0, (k || '0151')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'stored'->'items'->>v_kit2)::bigint is distinct from v_kq
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit2)
       or (select qty from public.account_bank where user_id = v_u and item_id = v_kit2) is distinct from v_kq
       or public.hr_purse_of(v_u) <> v_purse or (v->'kept'->>'kit')::int <> 1 or (v->'sold'->>'stacks')::int <> 0
       or not exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_kit) then
      raise exception 'VERIFY(d2): a start-kit deposit answered % (or the held start-kit sale moved)', v; end if;

    -- (e) NOTHING PLANNED IN THE BAG: refused by name, the key stays free.
    v := public.hr_loot_dispatch(0, (k || '0200')::uuid);
    if v->>'error' is distinct from 'nothing_to_dispatch' or (v->>'locked')::int <> 1 or (v->>'kit')::int <> 1 then
      raise exception 'VERIFY(e): an empty plan answered %', v; end if;
    v := public.hr_loot_rule_set(0, v_keep, 'deposit', (k || '0201')::uuid);
    v := public.hr_loot_dispatch(0, (k || '0200')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'stored'->'items'->>v_keep)::bigint is distinct from 4::bigint then
      raise exception 'VERIFY(e): the refused key did not stay free: %', v; end if;

    -- (f) STORAGE ROOM: a kind already in Storage always fits; new kinds take the room left in item
    -- order (the room is re-read after each deposit); the next new kind stays in the bag and is
    -- reported; a press that can move nothing is refused storage_full.
    update public.hr_depot_config set base_stacks = public.hr_storage_room_used(v_u) + 1 where only_row;
    if public.hr_storage_room_cap(v_u) <> public.hr_storage_room_used(v_u) + 1 then raise exception 'VERIFY(f): the probe could not size Storage'; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_dep, 2), (v_u, 0, v_new, 9), (v_u, 0, v_new2, 8);
    v := public.hr_loot_rule_set(0, v_new, 'deposit', (k || '0300')::uuid);
    v := public.hr_loot_rule_set(0, v_new2, 'deposit', (k || '0303')::uuid);
    v := public.hr_loot_dispatch(0, (k || '0301')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'stored'->'items'->>v_dep)::bigint is distinct from 2::bigint
       or (v->'stored'->'items'->>v_new)::bigint is distinct from 9::bigint
       or (v->'unplaced'->'items'->>v_new2)::bigint is distinct from 8::bigint or v->'unplaced'->>'why' is distinct from 'storage_full'
       or (select qty from public.account_bank where user_id = v_u and item_id = v_dep) is distinct from 13::bigint
       or (select qty from public.account_bank where user_id = v_u and item_id = v_new) is distinct from 9::bigint
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_new2) is distinct from 8::bigint
       or exists (select 1 from public.account_bank where user_id = v_u and item_id = v_new2)
       or public.hr_storage_room_used(v_u) <> public.hr_storage_room_cap(v_u) then
      raise exception 'VERIFY(f): Storage with room for one new kind answered %', v; end if;
    v_ver := (select version from public.player_state where user_id = v_u and slot = 0);
    v := public.hr_loot_dispatch(0, (k || '0302')::uuid);
    if v->>'error' is distinct from 'storage_full' or (v->>'stacks')::int <> 1
       or (select version from public.player_state where user_id = v_u and slot = 0) <> v_ver then
      raise exception 'VERIFY(f): a press that could move nothing answered % (or moved the version)', v; end if;

    -- (g) A HERO OUT HUNTING is not in town: refused by name, nothing moves.
    insert into public.hunt_instances (id, hunt_id) values (v_inst, 'mill_cellar');
    insert into public.hunt_sessions (user_id, slot, hunt_id, hunt_from, settled_to, next_swing_at, instance_id)
      values (v_u, 0, 'mill_cellar', now(), now(), now(), v_inst);
    update public.hr_depot_config set base_stacks = 1000 where only_row;
    v := public.hr_loot_dispatch(0, (k || '0400')::uuid);
    if v->>'error' is distinct from 'hunting'
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_new2) is distinct from 8::bigint then
      raise exception 'VERIFY(g): Dispatch on a hunting hero answered %', v; end if;

    raise exception using errcode = 'HR897', message = 'loot-dispatch §6 complete - rolling back';
  exception when sqlstate 'HR897' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_bank where user_id = v_u)
     or exists (select 1 from public.player_item_rules where user_id = v_u) then
    raise exception 'VERIFY(h): §6 LEAKED a probe row'; end if;
  -- (h) THE GRANTS: the verb is authenticated-only; the predicate and the hook are server-only.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_loot_plan_refusal(text,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_loot_rules(uuid,integer,uuid,uuid,jsonb,timestamp with time zone)', 'execute') then
      raise exception 'VERIFY(h): % reaches a loot-plan internal', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_loot_dispatch(integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_loot_dispatch(integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_loot_rule_set(integer,text,text,uuid)', 'execute') then
    raise exception 'VERIFY(h): hr_loot_dispatch / hr_loot_rule_set are not authenticated-only'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_loot_dispatch' and grantee = 'authenticated'
                  and identity_args = 'p_slot integer, p_idem uuid') then
    raise exception 'VERIFY(h): hr_loot_dispatch is not on the client baseline'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'loot-dispatch: nothing sells at pickup; Dispatch stores what fits and sells at the catalogue bid, one row a kind, once a key; all green';
end $$;
