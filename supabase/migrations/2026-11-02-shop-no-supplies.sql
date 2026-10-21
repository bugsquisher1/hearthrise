-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SHOP SELLS NO SUPPLIES (Tyler 2026-10-20, tracker q02: "The
-- Shop does NOT sell supplies (food, drink, ammo, runes); it keeps gear and
-- tools. Supplies only come from the action bar, charged at NPC price per use
-- (own crafted stock still used first)."; replaces 10-19 "the Shop is optional
-- stocking"). STAGED (lane/b-hero-creation, systems-engineer, 2026-10-20).
-- Game CLOSED: applies on its passing §4; part of the reopen gate's Security
-- review (money doors removed, nothing added).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_shop_view RESTATED WHOLE from 2026-10-25-shop-supplies.sql: `offers`
--    lists the TOOLS only (Bronze Axe, Bronze Pickaxe: hr_shop_supply_offers
--    kind 'tool'); the `refill` key is gone. `bids` unchanged.
-- §2 hr_hunt_saved_bag RESTATED WHOLE from 2026-10-25-party-invites.sql: a
--    party start packs each member's OWN hunt supplies (what a solo Enter packs),
--    no longer its restock targets.
-- §3 the one-tap refill goes: hr_shop_refill (MONEY: it bought supplies),
--    hr_shop_refill_quote and hr_restock_set (the restock targets existed only
--    to drive the refill) are dropped with their grants and baseline rows.
--    shop_buy of a supply offer is refused in the edge (catalogue.js
--    OFFER_REFUSALS `supplies_not_sold`: src/data/shops.js offers the tools only).
--
-- KEPT: hr_shop_supply_offers (generated, APPLIED history: still the price list
-- the vendor's buy-back cap reads), and the per-use store charge, which reads
-- hr_hunt_basic_supplies inside the hunt settle, never this file's objects.
-- player_item_rules.restock and the hunt presets' restock snapshot are now
-- written by nothing a player can reach and read by nothing that acts (presets
-- keep what they saved; no client reads it); retiring the column restates the
-- bag-rules and preset bodies and is its own change (PRIORITY_BOARD backlog).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Three authenticated doors fewer, one of them a gold spend. The party bag is
-- the same shape the enter verb already checks (its own stock, under the lock).
-- Moves no value; no table, row or column changes.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_shop_refill_quote, hr_shop_view and hr_shop_refill (+ grants,
-- baseline row) from 2026-10-25-shop-supplies.sql §1-§2 and hr_restock_set
-- (+ grant, baseline row) from 2026-10-25-bag-rules.sql; hr_hunt_saved_bag from
-- 2026-10-25-party-invites.sql.
-- ORDER: after 2026-11-02-hero-creation.sql (no object in common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.hr_shop_supply_offers') is null or to_regclass('public.hr_hunt_vendor_value') is null
     or not exists (select 1 from public.hr_shop_supply_offers where kind = 'tool') then
    raise exception 'PRECONDITION: the supply catalogue (with its tools) or the vendor values are absent'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = to_regprocedure('public.hr_shop_view(uuid,integer)');
  if v_src is null then raise exception 'PRECONDITION: hr_shop_view is absent'; end if;
  -- the 2026-10-25-shop-supplies.sql body (offers + bids + refill) or this file's own image
  if strpos(v_src, 'hr_shop_refill_quote(p_user, p_slot)') = 0 and strpos(v_src, 'where o.kind = ''tool''') = 0 then
    raise exception 'PIN: hr_shop_view is not the 2026-10-25-shop-supplies.sql body this file restates'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = to_regprocedure('public.hr_hunt_saved_bag(uuid,integer)');
  -- the 2026-10-25-party-invites.sql body (the restock targets) or this file's own image
  if v_src is null or (strpos(v_src, 'r.restock > 0') = 0 and strpos(v_src, 'pi.qty > 0') = 0) then
    raise exception 'PIN: hr_hunt_saved_bag is not the 2026-10-25-party-invites.sql body this file restates'; end if;
end $mig$;

-- ── §1 THE `shop` SECTION: TOOLS AND BIDS ────────────────────────────────────
create or replace function public.hr_shop_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    -- the Shop keeps gear and tools; supplies come from the action bar (Tyler 2026-10-20)
    'offers', coalesce((select jsonb_agg(jsonb_build_object('offer', o.offer_id, 'item', o.item_id, 'kind', o.kind, 'price', o.price)
                                         order by o.kind, o.price, o.item_id)
                          from public.hr_shop_supply_offers o where o.kind = 'tool'), '[]'::jsonb),
    'bids', coalesce((select jsonb_object_agg(pi.item_id, v.unit)
                        from public.player_inventory pi join public.hr_hunt_vendor_value v on v.item_id = pi.item_id
                       where pi.user_id = p_user and pi.slot = p_slot and pi.qty > 0), '{}'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_shop_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('shop', 'hr_shop_view', '2026-11-02-shop-no-supplies.sql: the tools on offer at the catalogue price and the vendor''s bid for every bag item; no supplies, no refill')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 A PARTY MEMBER CARRIES ITS OWN SUPPLIES ───────────────────────────────
-- hr_hunt_saved_bag RESTATED WHOLE from 2026-10-25-party-invites.sql: the bag a party
-- start packs for each member was its RESTOCK TARGETS (min(target, held)), which
-- nothing can set any more. It is now what a solo Enter packs (src/shell/hunt-list.js
-- packFor): every hunt supply the member holds, the whole stack (at most the enter
-- verb's 100,000 a line), essentials first, then the largest stacks, at most
-- bag_lines lines. Own stock first, then the store per use, for every member.
create or replace function public.hr_hunt_saved_bag(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', x.item_id, 'qty', x.qty) order by x.essential desc, x.qty desc, x.item_id), '[]'::jsonb)
    from (select pi.item_id, least(pi.qty::bigint, 100000) as qty, s.essential
            from public.player_inventory pi
            join public.hr_hunt_supplies s on s.item_id = pi.item_id
           where pi.user_id = p_user and pi.slot = p_slot and pi.qty > 0
           order by s.essential desc, least(pi.qty::bigint, 100000) desc, pi.item_id
           limit greatest(0, coalesce(public.hr_hunt_limit('bag_lines'), 0))) x
$$;
revoke execute on function public.hr_hunt_saved_bag(uuid, int) from public, anon, authenticated, service_role;

-- ── §3 THE REFILL AND ITS TARGETS GO ─────────────────────────────────────────
drop function if exists public.hr_shop_refill(integer, bigint, uuid);
drop function if exists public.hr_shop_refill_quote(uuid, integer);
drop function if exists public.hr_restock_set(integer, jsonb, uuid);
delete from public.hr_client_rpc_baseline where proname in ('hr_shop_refill', 'hr_restock_set');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-4000-a000-00005b0e0001';
  v jsonb;
begin
  -- (a) the doors are gone, and so are their baseline rows.
  if to_regprocedure('public.hr_shop_refill(integer,bigint,uuid)') is not null
     or to_regprocedure('public.hr_shop_refill_quote(uuid,integer)') is not null
     or to_regprocedure('public.hr_restock_set(integer,jsonb,uuid)') is not null then
    raise exception 'VERIFY(a): a refill or restock door survived'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname in ('hr_shop_refill', 'hr_restock_set')) then
    raise exception 'VERIFY(a): a dropped door is still on the client baseline'; end if;
  -- (b) nothing left in the schema calls them.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
               and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g')
                   ~ '\m(hr_shop_refill|hr_shop_refill_quote|hr_restock_set)\M') then
    raise exception 'VERIFY(b): a body still calls a dropped refill or restock function'; end if;
  -- (c) the section offers the tools only, with no refill, and still bids.
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'shop-no-supplies §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): no probe character: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    v := public.hr_shop_view(v_uid, 0);
    if v ? 'refill' then raise exception 'VERIFY(c): the shop section still carries a refill'; end if;
    if jsonb_array_length(v->'offers') <> (select count(*) from public.hr_shop_supply_offers where kind = 'tool')
       or jsonb_array_length(v->'offers') = 0
       or exists (select 1 from jsonb_array_elements(v->'offers') e where e->>'kind' <> 'tool') then
      raise exception 'VERIFY(c): the shop offers %', v->'offers'; end if;
    if not exists (select 1 from jsonb_array_elements(v->'offers') e where e->>'item' = 'bronze_axe')
       or not exists (select 1 from jsonb_array_elements(v->'offers') e where e->>'item' = 'bronze_pickaxe') then
      raise exception 'VERIFY(c): the Bronze Axe and Pickaxe are not on offer'; end if;
    if jsonb_typeof(v->'bids') <> 'object' then
      raise exception 'VERIFY(c): the vendor bids read %', v->'bids'; end if;
    -- (d) a party start packs the member's own supplies: every hunt supply it holds, whole stacks.
    if exists (select 1 from public.player_inventory pi join public.hr_hunt_supplies s on s.item_id = pi.item_id
                where pi.user_id = v_uid and pi.slot = 0 and pi.qty > 0
                  and not exists (select 1 from jsonb_array_elements(public.hr_hunt_saved_bag(v_uid, 0)) e
                                   where e->>'item' = pi.item_id and (e->>'qty')::bigint = least(pi.qty::bigint, 100000)))
       and jsonb_array_length(public.hr_hunt_saved_bag(v_uid, 0)) < public.hr_hunt_limit('bag_lines') then
      raise exception 'VERIFY(d): the party bag is %, not the hero''s own supplies', public.hr_hunt_saved_bag(v_uid, 0); end if;
    if jsonb_array_length(public.hr_hunt_saved_bag(v_uid, 0)) = 0 then
      raise exception 'VERIFY(d): a fresh hero (the start kit holds food) packs nothing for a party start'; end if;
    raise exception using errcode = 'HR886', message = 'shop-no-supplies §4 complete - rolling back';
  exception when sqlstate 'HR886' then
    null;
  end;
  if exists (select 1 from public.player_state where user_id = v_uid) then raise exception 'VERIFY(e): §4 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'shop-no-supplies: the Shop offers tools only; no refill, no restock targets; all green';
end $$;
