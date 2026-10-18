-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SHOP: SUPPLY OFFERS, THE VENDOR'S BIDS, THE ONE-TAP REFILL
-- (lane S2; CONFLICTS.md 2026-10-18 "ALPHA WINDOWS" items 2-3; Tyler 2026-10-18:
-- "restock targets are a ONE-TAP REFILL: the player presses once; the server
-- buys up to each target and shows the total first. Never automatic
-- purchases."). STAGED. Game CLOSED: applies on its passing §4; Security
-- reviews it with every S2 money surface in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- THE SECTION `shop` (src/session/item-sections.js shopOf):
--   offers  [{offer, item, kind, price}]  hr_shop_supply_offers (generated from
--           src/data/supply-basics.js SUPPLY_SHOP_OFFERS; shop_buy sells the same
--           `supply.*` rows through src/data/shops.js, one price, two readers);
--   bids    {item: gold each}  the vendor's bid (hr_hunt_vendor_value, the
--           vendorPriceOf vendor_sell prices with) for every bag item it buys;
--   refill  {lines: [{item, offer, have, target, buy, gold}], total} — the
--           server's own quote for the restock targets (null with none set).
-- THE VERB hr_shop_refill(p_slot, p_quote_total, p_idem) — MONEY:
--   under the character lock it re-quotes; refuses `nothing_to_buy` when every
--   target is met, `quote_changed` (carrying the new quote) when its own total
--   is not the one the player was shown; otherwise ONE hr_apply {gold: -total,
--   items: {item: buy}} — insufficient_gold is hr_apply's, under its lock;
--   journalled kind shop, intent shop_refill:<total>, meta = the lines at the
--   unit price charged. Idempotent: hr_apply's player_intents row is the record.
--   The client sends the total it was SHOWN, never a price: a number it cannot
--   make the server charge, only refuse.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Prices: the generated catalogue only. Quantities: max(0, target − held),
-- target <= 1000 and <= 32 targets (2026-10-25-bag-rules.sql), so one press
-- buys at most 32,000 units; every one costs gold (a sink). Buy-then-vendor:
-- every offer is >= 2x book value (tools/gen-alpha-catalogue.mjs refuses less),
-- and the vendor pays at most half the cheapest shop unit price
-- (catalogue.js SHOP_BUYBACK_RATE), so the round trip always loses gold.
-- A double press: the second re-quotes after the first bought, so it is
-- `nothing_to_buy` or `quote_changed` — never a second charge for one quote.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop hr_shop_refill (+ baseline row), the section row, hr_shop_view and
-- hr_shop_refill_quote. ORDER: after 2026-10-25-bag-rules.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_item_rules') is null or to_regclass('public.hr_shop_supply_offers') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-alpha-catalogue.generated.sql and 2026-10-25-bag-rules.sql first'; end if;
end $mig$;

-- ── §1 THE QUOTE AND THE SECTION ─────────────────────────────────────────────
-- The refill quote: every restock target, what is held in the bag, what the
-- refill would buy and its gold at the catalogue price. Null with no targets.
create or replace function public.hr_shop_refill_quote(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  with t as (
    select r.item_id as item, o.offer_id as offer, o.price, r.restock as target,
           coalesce((select pi.qty from public.player_inventory pi
                      where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = r.item_id), 0) as have
      from public.player_item_rules r
      join public.hr_shop_supply_offers o on o.item_id = r.item_id
     where r.user_id = p_user and r.slot = p_slot and r.restock > 0),
  l as (select t.*, greatest(0, t.target - t.have) as buy from t)
  select case when count(*) = 0 then null else jsonb_build_object(
           'lines', jsonb_agg(jsonb_build_object('item', l.item, 'offer', l.offer, 'have', l.have, 'target', l.target,
                                                 'buy', l.buy, 'gold', l.buy * l.price) order by l.item),
           'total', sum(l.buy * l.price)::bigint) end
    from l
$$;
revoke execute on function public.hr_shop_refill_quote(uuid, int) from public, anon, authenticated, service_role;

create or replace function public.hr_shop_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'offers', coalesce((select jsonb_agg(jsonb_build_object('offer', o.offer_id, 'item', o.item_id, 'kind', o.kind, 'price', o.price)
                                         order by o.kind, o.price, o.item_id)
                          from public.hr_shop_supply_offers o), '[]'::jsonb),
    'bids', coalesce((select jsonb_object_agg(pi.item_id, v.unit)
                        from public.player_inventory pi join public.hr_hunt_vendor_value v on v.item_id = pi.item_id
                       where pi.user_id = p_user and pi.slot = p_slot and pi.qty > 0), '{}'::jsonb),
    'refill', public.hr_shop_refill_quote(p_user, p_slot))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_shop_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('shop', 'hr_shop_view', '2026-10-25-shop-supplies.sql: the supply offers at the catalogue price, the vendor''s bid for every bag item, the refill quote')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 THE ONE-TAP REFILL ────────────────────────────────────────────────────
create or replace function public.hr_shop_refill(p_slot int, p_quote_total bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_items jsonb; v_lines jsonb; v_ver bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('shop_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('shop_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_quote_total is null or p_quote_total < 0 or p_quote_total > 1000000000000 then
    return public.hr_note_rejection('shop_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  -- The intent names its target: the total the player agreed to.
  v_verb := 'shop_refill:' || p_quote_total;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('shop_refill', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('shop_refill', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE QUOTE, again, under the lock: the only price this verb charges.
  v_q := public.hr_shop_refill_quote(v_uid, p_slot);
  if v_q is null or (v_q->>'total')::bigint = 0 then
    return public.hr_note_rejection('shop_refill', p_slot, jsonb_build_object('ok', false, 'error', 'nothing_to_buy', 'refill', v_q)); end if;
  if (v_q->>'total')::bigint <> p_quote_total then
    return public.hr_note_rejection('shop_refill', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'refill', v_q)); end if;
  select jsonb_object_agg(l->>'item', (l->>'buy')::bigint),
         jsonb_agg(jsonb_build_object('item', l->>'item', 'qty', (l->>'buy')::bigint,
                                      'unit', (l->>'gold')::bigint / (l->>'buy')::bigint) order by l->>'item')
    into v_items, v_lines
    from jsonb_array_elements(v_q->'lines') l where (l->>'buy')::bigint > 0;
  -- ONE apply: the gold out and every item in, or nothing (insufficient_gold is hr_apply's).
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -(v_q->>'total')::bigint, 'items', v_items,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'shop_refill', 'lines', v_lines, 'total', (v_q->>'total')::bigint))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('shop_refill', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'bought', v_items, 'gold', -(v_q->>'total')::bigint);
end $$;
revoke execute on function public.hr_shop_refill(int, bigint, uuid) from public;
revoke execute on function public.hr_shop_refill(int, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_shop_refill(int, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_shop_refill';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_shop_refill', 'p_slot integer, p_quote_total bigint, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): MONEY - the one-tap refill buys max(0, target - held) of each restock target at the catalogue price in ONE hr_apply; refuses quote_changed when its own total is not the one shown');

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00005e2b0001';
  v jsonb; v_o public.hr_shop_supply_offers%rowtype; v_o2 public.hr_shop_supply_offers%rowtype; v_role text; v_g0 bigint; v_total bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'shop-supplies §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    select * into v_o from public.hr_shop_supply_offers order by price, item_id limit 1;
    select * into v_o2 from public.hr_shop_supply_offers where item_id <> v_o.item_id order by price, item_id limit 1;
    -- (a) the section: every offer, no refill without targets.
    v := public.hr_state_of(v_u, 0)->'shop';
    if jsonb_array_length(v->'offers') <> (select count(*) from public.hr_shop_supply_offers) or v->'refill' <> 'null'::jsonb then
      raise exception 'VERIFY(a): the shop section is %', v; end if;
    -- (b) targets, a held stack: the quote buys the difference at the catalogue price.
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id in (v_o.item_id, v_o2.item_id);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_o.item_id, 3);
    v := public.hr_restock_set(0, jsonb_build_object(v_o.item_id, 10, v_o2.item_id, 2), '000000c0-0000-4000-a000-00005e2b0101');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): restock answered %', v; end if;
    v_total := 7 * v_o.price + 2 * v_o2.price;
    v := public.hr_state_of(v_u, 0)->'shop'->'refill';
    if (v->>'total')::bigint is distinct from v_total or jsonb_array_length(v->'lines') <> 2 then
      raise exception 'VERIFY(b): the quote is % (want %)', v, v_total; end if;
    -- (c) a stale total is refused with the new quote; too little gold is hr_apply's insufficient_gold; nothing moved.
    update public.player_state set gold = v_total - 1 where user_id = v_u and slot = 0;
    v := public.hr_shop_refill(0, v_total + 1, '000000c0-0000-4000-a000-00005e2b0102');
    if v->>'error' is distinct from 'quote_changed' or (v->'refill'->>'total')::bigint is distinct from v_total then
      raise exception 'VERIFY(c): a stale total answered %', v; end if;
    v := public.hr_shop_refill(0, v_total, '000000c0-0000-4000-a000-00005e2b0103');
    if v->>'error' is distinct from 'insufficient_gold'
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.item_id) <> 3 then
      raise exception 'VERIFY(c): a short purse answered %', v; end if;
    -- (d) the buy: exactly the total out, exactly the lines in, one ledger row; a replay buys nothing more.
    update public.player_state set gold = v_total + 50 where user_id = v_u and slot = 0;
    v := public.hr_shop_refill(0, v_total, '000000c0-0000-4000-a000-00005e2b0104');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the refill answered %', v; end if;
    if (select gold from public.player_state where user_id = v_u and slot = 0) <> 50
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.item_id) <> 10
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o2.item_id) <> 2
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'shop_refill:' || v_total and gold = -v_total) <> 1 then
      raise exception 'VERIFY(d): the refill did not move exactly the quote'; end if;
    v := public.hr_shop_refill(0, v_total, '000000c0-0000-4000-a000-00005e2b0104');
    if (select gold from public.player_state where user_id = v_u and slot = 0) <> 50
       or (select count(*) from public.player_ledger where user_id = v_u and intent like 'shop_refill:%') <> 1 then
      raise exception 'VERIFY(d): a replayed refill charged again: %', v; end if;
    -- (e) a second press with a new key: every target is met.
    v := public.hr_shop_refill(0, 0, '000000c0-0000-4000-a000-00005e2b0105');
    if v->>'error' is distinct from 'nothing_to_buy' then raise exception 'VERIFY(e): a met refill answered %', v; end if;
    -- (f) the bids are the vendor catalogue's, for bag items only.
    v := public.hr_state_of(v_u, 0)->'shop'->'bids';
    if exists (select 1 from jsonb_each(v) b where not exists (select 1 from public.hr_hunt_vendor_value vv where vv.item_id = b.key and vv.unit = (b.value #>> '{}')::bigint))
       or exists (select 1 from jsonb_each(v) b where not exists (select 1 from public.player_inventory pi where pi.user_id = v_u and pi.slot = 0 and pi.item_id = b.key)) then
      raise exception 'VERIFY(f): a bid is not the vendor catalogue''s: %', v; end if;
    raise exception using errcode = 'HR872', message = 'shop-supplies §3 complete - rolling back';
  exception when sqlstate 'HR872' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(g): §3 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_shop_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_shop_refill_quote(uuid,integer)', 'execute') then
      raise exception 'VERIFY(g): % reaches a shop internal', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_shop_refill(integer,bigint,uuid)', 'execute') then
    raise exception 'VERIFY(g): anon reaches hr_shop_refill'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'shop-supplies: offers at the catalogue price, bids from the vendor catalogue, the refill buys exactly its quote once; all green';
end $$;
