-- ==========================================================================
-- 2026-11-03-hero-slots-gold.sql — BUY A HERO SLOT WITH GOLD, FROM THE ROSTER
-- STAGED (lane/c-hero-slots-gold, backend-architect, 2026-10-21; tracker r45).
-- Game CLOSED: applies on its passing §4; Security reviews it at the reopen
-- gate (MONEY SURFACE: a gold debit and an account entitlement). NOT APPLIED.
--
-- Tyler 2026-10-17: every account starts with 2 hero slots; more, up to 5,
-- cost escalating gold. The purchase already exists in gold
-- (2026-10-23-demolition-hero-slots-gold.sql, APPLIED) and slots 0 and 1 are
-- owned by everyone (2026-10-26-hero-slots-start-two.sql, APPLIED). What was
-- missing for a player to actually buy one:
--   (1) the PRICE was nowhere in the envelope, so a client could only show a
--       number of its own (src/data/shops.js) - a price the browser says and
--       the server might not charge (CLAUDE.md §6);
--   (2) past the fifth slot the purchase answered `unknown_slot` / `bad_slot`
--       instead of saying the account is at the cap;
--   (3) a call without an idempotency key ran uncached (already_owned kept it
--       from charging twice, but a retried success read as a refusal).
--
-- CONTRACT
--   §0b THE LADDER (Game Designer ruling r45, 2026-10-21): the 3rd / 4th / 5th
--      hero slot (slot_id 2 / 3 / 4) cost 15,000 / 40,000 / 120,000 gold, down
--      from 75,000 / 250,000 / 750,000 so running four heroes is reachable.
--      A PINNED update of the three seeded rows: it runs only over the old
--      ladder or its own values (a re-apply) and refuses anything else. The
--      authored copy is src/data/shops.js character_slot.2/.3/.4, bound to this
--      table by tests/hero-slot-buy.mjs BIND.
--   §1 hr_account_view(uid, slot) RESTATED WHOLE from 2026-10-23-hunt-party.sql
--      (md5 pinned in §0). The `account` section every envelope carries (and
--      hr_load's needs_name answer) gains two keys, both read from the server
--      catalogue public.hr_hero_slots, never a literal:
--        hero_slots_max   how many hero slots an account can ever own
--                         (the catalogue's top slot_id + 1: slot 0 is free)
--        hero_slot_offer  { slot_id, cost_gold } - the next slot this account
--                         can buy (the lowest unowned, priced, non-starter
--                         row, which the ladder admits because everything
--                         below it is owned), or null at the cap
--   §2 hr_buy_hero_slot__ungated RESTATED WHOLE from the 2026-10-23 gold body
--      (md5 pinned in §0). Three changes, everything else byte-identical
--      (locks, ladder, ownership, daily clamp, the debit predicate, the grant
--      on the account row, the journal, success-only caching):
--        · p_idem is required: `idem_required` before any read or lock
--        · p_slot_id above the catalogue's top slot is `slot_cap` (with `max`,
--          the account cap), journalled as a rejection; a negative or null
--          slot id stays `bad_slot`
--        · the answer adds hero_slot_offer + hero_slots_max (the next offer
--          after this purchase), so the roster re-renders from the server
--   The wrapper hr_buy_hero_slot(int,int,uuid), its rate bucket, its grant to
--   authenticated and its hr_client_rpc_baseline row do not move.
--
-- REFUSALS (the full taxonomy the client renders):
--   not_signed_in · idem_required · bad_slot · slot_cap · unknown_slot ·
--   slot_unpriced (a starter or unpriced row is never sold free) ·
--   intent_mismatch (one key reused for another slot) · no_character (the
--   paying hero is not the caller's: "not owner") · no_account ·
--   already_owned · requires_previous_slot · hero_slot_daily_cap ·
--   insufficient_gold (+ cost, have, short_by) · rate_limited (wrapper)
--
-- CONCURRENCY + IDEMPOTENCY: unchanged from 2026-09-08 / 2026-10-23. The
--   account lock (uid:0, the key hr_apply takes) THEN the paying hero's lock;
--   the replay cache is read inside the lock; the paying row is `for update`;
--   the debit is predicated on gold >= cost. Two tabs racing slot 2 serialise
--   on uid:0: one pays, the other answers already_owned. The same key
--   replayed answers the cached success with replayed:true and moves nothing.
--
-- NOTHING FROM THE CLIENT BUT THE INTENT: the slot id it wants, the hero that
--   pays (must be the caller's own row), and the key. Price, ownership, cap,
--   clock (now()) and the paying balance are the server's.
--
-- COST AT 100x: no table; three seeded catalogue prices move (§0b). The account view adds one
--   hr_hero_slots_of (two index probes) and a five-row catalogue scan per
--   envelope; a purchase is three rows (ledger, progress flag, intent), at most
--   three per account forever.
--
-- RE-RUNNABLE: §0 accepts the pinned pre-images or this file's own bodies.
-- REVERSIBILITY: re-apply hr_account_view from 2026-10-23-hunt-party.sql and
--   hr_buy_hero_slot__ungated from 2026-10-23-demolition-hero-slots-gold.sql;
--   set cost_gold back to 75000 / 250000 / 750000 on slots 2 / 3 / 4 (with
--   src/data/shops.js). Slots already bought at the lower price stay owned.
--   Rows written by purchases are ordinary hero_slot ledger + flag rows.
-- ORDER: after 2026-11-03-hunt-analyzer-level-eta.sql (last). No begin/commit.
-- After apply: live-hash-drift wants hr_buy_hero_slot__ungated and
--   hr_account_view measured.
-- ==========================================================================

-- ── 0. PRECONDITIONS - FAIL CLOSED, NEVER CLOBBER ──────────────────────────
do $$
declare v_md5 text;
begin
  if to_regclass('public.hr_hero_slots') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null
     or to_regprocedure('public.hr_buy_hero_slot(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_hunt_limit(text)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'hr_hero_slots' and column_name = 'starter') then
    raise exception 'PRECONDITION: hr_hero_slots with cost_gold + starter, hr_hero_slots_of, the wrapper or hr_hunt_limit is absent';
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc
             where oid = to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)'));
  -- the 2026-10-23-demolition-hero-slots-gold.sql body, or this file's own (a re-apply)
  if v_md5 is null or v_md5 not in ('7d0d179372ac2991c173d19f123ec67e', '746516d5b7ec73c53b59f3dd667a3d78') then
    raise exception 'PRECONDITION: hr_buy_hero_slot__ungated is not the 2026-10-23 gold body this file restates (md5 %) - another lane moved it; restate from that body instead', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc
             where oid = to_regprocedure('public.hr_account_view(uuid,integer)'));
  -- the 2026-10-23-hunt-party.sql body, or this file's own (a re-apply)
  if v_md5 is null or v_md5 not in ('ba9849e445bb3338745883a79699ae8e', 'a2aa727d201d6cf6e04930d800fb9543') then
    raise exception 'PRECONDITION: hr_account_view is not the 2026-10-23-hunt-party.sql body this file restates (md5 %) - another lane moved it', v_md5;
  end if;
end $$;

-- ── 0b. THE LADDER: A PINNED UPDATE OF THE THREE SEEDED PRICES ─────────────
do $$
declare v_now text;
begin
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now
    from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:75000:false,3:250000:false,4:750000:false'
     and v_now is distinct from '1:0:true,2:15000:false,3:40000:false,4:120000:false' then
    raise exception 'PRECONDITION: hr_hero_slots is not the 2026-10-26 ladder this file reprices (%) - another lane moved it', v_now;
  end if;
end $$;
update public.hr_hero_slots as h
   set cost_gold = v.gold
  from (values (2, 15000), (3, 40000), (4, 120000)) as v(slot_id, gold)
 where h.slot_id = v.slot_id and not h.starter and h.cost_gold is distinct from v.gold;

-- ── 1. THE ACCOUNT VIEW: THE CAP AND THE NEXT OFFER, FROM THE CATALOGUE ─────
create or replace function public.hr_account_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'max_concurrent', public.hr_hunt_limit('max_concurrent'),
    -- every slot the catalogue holds, plus slot 0 (free, never in the catalogue)
    'hero_slots_max', (select coalesce(max(c.slot_id), 0) + 1 from public.hr_hero_slots c),
    -- the next slot this account can buy: the lowest unowned, priced, non-starter row
    'hero_slot_offer', (
      select jsonb_build_object('slot_id', c.slot_id, 'cost_gold', c.cost_gold)
        from public.hr_hero_slots c
       where not c.starter and c.cost_gold > 0
         and not (public.hr_hero_slots_of(p_user) @> to_jsonb(c.slot_id))
       order by c.slot_id
       limit 1))
$$;
revoke execute on function public.hr_account_view(uuid, int) from public, anon, authenticated, service_role;

-- ── 2. THE PURCHASE ────────────────────────────────────────────────────────
create or replace function public.hr_buy_hero_slot__ungated(p_slot_id integer, p_slot integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  -- BLAST RADIUS, not balance: three paid slots, each once per account forever.
  c_max_slots_per_day constant int := 5;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_top    int;
  v_cat    public.hr_hero_slots%rowtype;
  v_st     public.player_state%rowtype;
  v_owned  jsonb;
  v_cached jsonb;
  v_gold   bigint;
  v_today  int;
  v_intent text;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- EVERY PURCHASE CARRIES ITS KEY: a retried success must replay, not read as a refusal.
  if p_idem is null then
    return jsonb_build_object('ok', false, 'error', 'idem_required');
  end if;
  -- SHAPE FIRST, for both integers: p_slot is the paying hero, p_slot_id the slot bought.
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;
  if p_slot_id is null or p_slot_id < 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot_id', p_slot_id);
  end if;
  -- THE CAP is the catalogue's top slot: past it there is nothing to sell.
  select max(slot_id) into v_top from public.hr_hero_slots;
  if p_slot_id > coalesce(v_top, 0) then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'slot_cap',
      jsonb_build_object('slot_id', p_slot_id, 'max', coalesce(v_top, 0) + 1), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_cap', 'slot_id', p_slot_id, 'max', coalesce(v_top, 0) + 1);
  end if;

  -- (1) THE CATALOGUE, BEFORE ANY LOCK.
  select * into v_cat from public.hr_hero_slots where slot_id = p_slot_id;
  if v_cat.slot_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'unknown_slot',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_slot', 'slot_id', p_slot_id);
  end if;
  -- FAIL CLOSED ON AN UNPRICED ROW: cost_gold defaults to 0, and a slot that
  -- costs nothing is a mistake, never an offer.
  if coalesce(v_cat.cost_gold, 0) <= 0 then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'slot_unpriced',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_unpriced', 'slot_id', p_slot_id);
  end if;
  v_intent := 'hero_slot_buy:' || v_cat.slot_id;

  -- (2) SERIALISE: the ACCOUNT (slot 0) first, then the paying hero.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || '0', 0));
  if v_slot <> 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- (3) IDEMPOTENCY per (key, intent, slot), read inside the lock; successes only are cached.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;

  -- (4) THE PAYING HERO'S ROW, LOCKED. Gold is per hero and lives on this row.
  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- (5) THE ACCOUNT'S CANONICAL ROW MUST EXIST (the slot-0 flag row's FK).
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = 0) then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;

  -- (6) OWNERSHIP, FROM THE ONE PREDICATE.
  v_owned := public.hr_hero_slots_of(v_uid);
  if v_owned @> to_jsonb(v_cat.slot_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned',
      'slot_id', v_cat.slot_id, 'hero_slots', v_owned);
  end if;

  -- (7) THE LADDER: slot N requires N-1, against the server's owned set.
  if not (v_owned @> to_jsonb(v_cat.slot_id - 1)) then
    return jsonb_build_object('ok', false, 'error', 'requires_previous_slot',
      'slot_id', v_cat.slot_id, 'requires', v_cat.slot_id - 1, 'hero_slots', v_owned);
  end if;

  -- (8) THE PER-DAY CLAMP, from the append-only ledger, account-wide.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and kind = 'hero_slot'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_slots_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'hero_slot_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_slots_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'hero_slot_daily_cap',
      'used', v_today, 'limit', c_max_slots_per_day);
  end if;

  -- (9) THE DEBIT, FROM THE PAYING HERO'S GOLD. The price is the server's own
  --     catalogue; the row is locked by (4), and the update is predicated on the
  --     balance, so gold cannot go negative.
  if v_st.gold < v_cat.cost_gold then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'insufficient_gold',
      jsonb_build_object('slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_st.gold), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_st.gold,
      'short_by', v_cat.cost_gold - v_st.gold);
  end if;
  update public.player_state
     set gold = gold - v_cat.cost_gold, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot and gold >= v_cat.cost_gold
   returning gold into v_gold;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_st.gold);
  end if;
  -- accrued_to is NOT touched: a purchase is not an activity change.

  -- (10) THE GRANT, ON THE ACCOUNT'S ROW (slot 0), downstream of the debit.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, 0, 'flag', 'character_slot:' || v_cat.slot_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- (11) THE JOURNAL. One row: the signed gold movement, no inflow.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'hero_slot', v_intent,
     -v_cat.cost_gold, 0, 0, 0, 0,
     jsonb_build_object('slot_id', v_cat.slot_id, 'name', v_cat.name,
                        'currency', 'gold', 'cost', v_cat.cost_gold,
                        'charged_slot', v_slot, 'idem', p_idem));

  -- (12) THE ENVELOPE: the paying hero's gold, the account's whole owned set and its next offer.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'slot_id', v_cat.slot_id, 'name', v_cat.name,
    'currency', 'gold', 'cost', v_cat.cost_gold,
    'gold', v_gold, 'version', v_st.version, 'slot', v_slot,
    'hero_slots', public.hr_hero_slots_of(v_uid))
    || (select jsonb_build_object('hero_slot_offer', a->'hero_slot_offer', 'hero_slots_max', a->'hero_slots_max')
          from public.hr_account_view(v_uid, v_slot) a);

  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, v_intent, v_result, now())
    on conflict (user_id, intent_id) do nothing;

  return v_result;
end $$;
revoke execute on function public.hr_buy_hero_slot__ungated(integer, integer, uuid)
  from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK (CLAUDE.md §4) - properties asserted by EXECUTING ────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-0000b0510a03';
  v_k1   constant uuid := '000000c0-0000-4000-a000-0000b0510301';
  v      jsonb;
  v_acc  jsonb;
  v_n    int;
  v_c2   bigint := (select cost_gold from public.hr_hero_slots where slot_id = 2);
  v_c3   bigint := (select cost_gold from public.hr_hero_slots where slot_id = 3);
  v_c4   bigint := (select cost_gold from public.hr_hero_slots where slot_id = 4);
  v_max  int    := (select max(slot_id) + 1 from public.hr_hero_slots);
  v_role text;
begin
  -- (a) the catalogue this file reads: five slots in all, the r45 ladder 15,000 / 40,000 / 120,000 on 2..4.
  if v_max <> 5 or v_c2 is distinct from 15000 or v_c3 is distinct from 40000 or v_c4 is distinct from 120000
     or (select count(*) from public.hr_hero_slots where starter) <> 1
     or not (select starter and cost_gold = 0 from public.hr_hero_slots where slot_id = 1) then
    raise exception 'VERIFY(a): hr_hero_slots is not five slots with the starter on 1 and 15000 / 40000 / 120000 gold on 2..4 (max %, % / % / %)', v_max, v_c2, v_c3, v_c4;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_uid) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hero-slots-gold §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;

    -- (b) the account view offers slot 2 at the catalogue price; the cap is 5.
    v_acc := public.hr_account_view(v_uid, 0);
    if v_acc->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 2, 'cost_gold', v_c2)
       or (v_acc->>'hero_slots_max')::int <> 5 or v_acc->'max_concurrent' is null then
      raise exception 'VERIFY(b): a fresh account is offered %', v_acc; end if;

    -- (c) no key, no purchase; one gold short, refused by name; nothing moves.
    update public.player_state set gold = v_c2 - 1 where user_id = v_uid and slot = 0;
    v := public.hr_buy_hero_slot__ungated(2, 0, null);
    if v->>'error' is distinct from 'idem_required' then raise exception 'VERIFY(c): a keyless buy answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(2, 0, '000000c0-0000-4000-a000-0000b0510300');
    if v->>'error' is distinct from 'insufficient_gold' or (v->>'short_by')::bigint <> 1 then
      raise exception 'VERIFY(c): one gold short answered %', v; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_c2 - 1
       or exists (select 1 from public.player_ledger where user_id = v_uid and kind = 'hero_slot')
       or exists (select 1 from public.player_progress where user_id = v_uid and key like 'character_slot:%') then
      raise exception 'VERIFY(c): a refused purchase moved gold, journalled or granted'; end if;

    -- (d) the honest purchase: exactly the price, one ledger row in gold, the flag on slot 0, the next offer.
    update public.player_state set gold = v_c2 + v_c3 + v_c4 + 7 where user_id = v_uid and slot = 0;
    v := public.hr_buy_hero_slot__ungated(2, 0, v_k1);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'cost')::bigint <> v_c2 or (v->>'gold')::bigint <> v_c3 + v_c4 + 7
       or v->'hero_slot_offer' is distinct from jsonb_build_object('slot_id', 3, 'cost_gold', v_c3) then
      raise exception 'VERIFY(d): the slot-2 purchase answered %', v; end if;
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and kind = 'hero_slot' and slot = 0 and gold = -v_c2 and gold_in = 0
       and meta->>'currency' = 'gold' and (meta->>'slot_id')::int = 2;
    if v_n <> 1 or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'hero_slot') <> 1 then
      raise exception 'VERIFY(d): % matching hero_slot ledger row(s), expected exactly 1', v_n; end if;
    if not exists (select 1 from public.player_progress where user_id = v_uid and slot = 0
                    and kind = 'flag' and key = 'character_slot:2' and value = 1) then
      raise exception 'VERIFY(d): the slot-2 flag is not on the account row'; end if;

    -- (e) the same key replays: no second charge, no second row.
    v := public.hr_buy_hero_slot__ungated(2, 0, v_k1);
    if coalesce(v->>'replayed', '') <> 'true' or coalesce(v->>'ok', '') <> 'true' then
      raise exception 'VERIFY(e): the retry did not replay: %', v; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_c3 + v_c4 + 7
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'hero_slot') <> 1 then
      raise exception 'VERIFY(e): a replay charged again or journalled again'; end if;
    -- the same key for another slot is a mismatch, never a purchase.
    v := public.hr_buy_hero_slot__ungated(3, 0, v_k1);
    if v->>'error' is distinct from 'intent_mismatch' then raise exception 'VERIFY(e): a reused key bought slot 3: %', v; end if;

    -- (f) up the ladder to five; then the cap, by name, and nothing moves.
    v := public.hr_buy_hero_slot__ungated(3, 0, '000000c0-0000-4000-a000-0000b0510303');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): slot 3 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(4, 0, '000000c0-0000-4000-a000-0000b0510304');
    if coalesce(v->>'ok', '') <> 'true' or v->'hero_slot_offer' <> 'null'::jsonb then
      raise exception 'VERIFY(f): slot 4 answered % (expected ok and no further offer)', v; end if;
    if public.hr_hero_slots_of(v_uid) is distinct from '[0,1,2,3,4]'::jsonb
       or public.hr_account_view(v_uid, 0)->'hero_slot_offer' <> 'null'::jsonb then
      raise exception 'VERIFY(f): five slots are not owned, or a sixth is still offered'; end if;
    v := public.hr_buy_hero_slot__ungated(5, 0, '000000c0-0000-4000-a000-0000b0510305');
    if v->>'error' is distinct from 'slot_cap' or (v->>'max')::int <> 5 then raise exception 'VERIFY(f): a sixth slot answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(99, 0, '000000c0-0000-4000-a000-0000b0510306');
    if v->>'error' is distinct from 'slot_cap' then raise exception 'VERIFY(f): slot 99 answered %', v; end if;
    v := public.hr_buy_hero_slot__ungated(4, 0, '000000c0-0000-4000-a000-0000b0510307');
    if v->>'error' is distinct from 'already_owned' then raise exception 'VERIFY(f): a re-buy answered %', v; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> 7
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'hero_slot') <> 3
       or (select sum(gold) from public.player_ledger where user_id = v_uid and kind = 'hero_slot') <> -(v_c2 + v_c3 + v_c4) then
      raise exception 'VERIFY(f): the ladder did not cost exactly % gold in three journalled rows', v_c2 + v_c3 + v_c4; end if;

    -- (g) not the owner: a paying slot with no hero of the caller's is refused, nothing moves.
    v := public.hr_buy_hero_slot__ungated(2, 3, '000000c0-0000-4000-a000-0000b0510308');
    if v->>'error' is distinct from 'no_character' then raise exception 'VERIFY(g): an empty paying slot answered %', v; end if;

    raise exception using errcode = 'HR903', message = 'hero-slots-gold §4 complete - rolling back';
  exception when sqlstate 'HR903' then
    null;   -- every probe row is discarded with the subtransaction
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (h) ZERO LEAK; the bodies stay out of every client's reach; grant hygiene green.
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(h): §4 LEAKED a probe row';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_account_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(h): % reaches the purchase body or the account view (both take any account)', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_buy_hero_slot(integer,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_buy_hero_slot(integer,integer,uuid)', 'execute') then
    raise exception 'VERIFY(h): the wrapper hr_buy_hero_slot is not exactly authenticated-only'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hero-slots-gold: the account view offers the next slot at the catalogue price and the cap; '
               'keyless refused, short-by-one refused, exact debit, one gold ledger row, replay free, '
               'ladder to five, slot_cap past five, not-owner refused; zero leak.';
end $$;
