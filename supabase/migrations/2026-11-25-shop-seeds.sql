-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SHOP'S SEED COUNTER (game-designer ruling 2026-10-22,
-- lane/b-orphan-sources; Tyler 2026-10-19: farming is in Early Access; Tyler
-- 2026-10-20 q02: the Shop sells no supplies, and a seed is not one). STAGED, NOT
-- APPLIED. Game CLOSED: applies on its passing §2; a MONEY surface (a gold spend),
-- so it is on the reopen gate's Security review.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- No Shop tab ever listed a seed: the legacy seed.* rows were a price list that
-- shop_buy refuses (`not_listed`, lane/b-gold-sinks). A new hero's 8 turnip seeds
-- and two quest rewards were the only seeds that could reach a bag, so wheat,
-- tomato, pumpkin, goldenroot, emberfruit and moonbloom could never be planted.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_shop_view RESTATED WHOLE from 2026-11-24-shop-outfitter.sql: `offers`
--    lists kind 'tool', 'gear' AND 'seed' (the nine seed rows of
--    2026-11-23-alpha-catalogue.generated.sql, generated from
--    src/data/supply-basics.js SUPPLY_SHOP_OFFERS). `bids` unchanged.
-- The SALE is the edge's existing shop_buy: catalogue.js sells exactly
-- supply-basics.js SHOP_LISTED_OFFER_IDS (now with the seeds); the client names
-- an offer id and a count, never a price; hr_apply debits under the lock, refuses
-- a negative balance and journals a `shop` ledger row with the unit price. No new
-- door, no new grant, no new table. EDGE REDEPLOY NEEDED (the listed set moved).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Buy-then-sell: a seed is priced at its counter unit price (never below book
-- value; the generator refuses less) and the vendor pays at most half the cheapest
-- shop unit, so a seed sells back for at most half. Every vendor bid is unchanged
-- (the counter keeps the legacy unit price). Planting stays gated by the crop's
-- Farming level and the plot tier inside hr_farm_plant; a seed bought early is
-- only stock. Growth is wall-clock and plots are capped (12), so a seed bought
-- for gold cannot become a faster gold loop than its crop's hours allow.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_shop_view from 2026-11-24-shop-outfitter.sql §1 (tools and gear).
-- ORDER: after 2026-11-23-alpha-catalogue.generated.sql (the seed rows). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.hr_shop_supply_offers') is null or to_regclass('public.hr_hunt_vendor_value') is null
     or not exists (select 1 from public.hr_shop_supply_offers where kind = 'seed') then
    raise exception 'PRECONDITION: the alpha catalogue with the seed counter''s rows (2026-11-21) or the vendor values are absent'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = to_regprocedure('public.hr_shop_view(uuid,integer)');
  if v_src is null then raise exception 'PRECONDITION: hr_shop_view is absent'; end if;
  -- the 2026-11-24-shop-outfitter.sql body (tools and gear) or this file's own image
  if strpos(v_src, 'where o.kind in (''tool'', ''gear'')') = 0 and strpos(v_src, 'where o.kind in (''tool'', ''gear'', ''seed'')') = 0 then
    raise exception 'PIN: hr_shop_view is not the 2026-11-24-shop-outfitter.sql body this file restates'; end if;
end $mig$;

-- ── §1 THE `shop` SECTION: TOOLS, GEAR, SEEDS AND BIDS ───────────────────────
create or replace function public.hr_shop_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    -- the Shop keeps gear, tools and seeds; supplies come from the action bar (Tyler 2026-10-20; outfitter and seed counter, designer 2026-10-22)
    'offers', coalesce((select jsonb_agg(jsonb_build_object('offer', o.offer_id, 'item', o.item_id, 'kind', o.kind, 'price', o.price)
                                         order by o.kind, o.price, o.item_id)
                          from public.hr_shop_supply_offers o where o.kind in ('tool', 'gear', 'seed')), '[]'::jsonb),
    'bids', coalesce((select jsonb_object_agg(pi.item_id, v.unit)
                        from public.player_inventory pi join public.hr_hunt_vendor_value v on v.item_id = pi.item_id
                       where pi.user_id = p_user and pi.slot = p_slot and pi.qty > 0), '{}'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_shop_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('shop', 'hr_shop_view', '2026-11-25-shop-seeds.sql: the tools, the outfitter''s gear and the seed counter at the catalogue price and the vendor''s bid for every bag item; no supplies, no refill')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-4000-a000-00005b0e0003';
  v jsonb;
begin
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'shop-seeds §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): no probe character: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    v := public.hr_shop_view(v_uid, 0);
    -- (a) every tool, gear and seed row is offered, at its catalogue price, and nothing else
    if v ? 'refill' or jsonb_array_length(v->'offers') <> (select count(*) from public.hr_shop_supply_offers where kind in ('tool', 'gear', 'seed'))
       or exists (select 1 from jsonb_array_elements(v->'offers') e where e->>'kind' not in ('tool', 'gear', 'seed'))
       or exists (select 1 from jsonb_array_elements(v->'offers') e
                   where not exists (select 1 from public.hr_shop_supply_offers o
                                      where o.offer_id = e->>'offer' and o.item_id = e->>'item' and o.price = (e->>'price')::bigint)) then
      raise exception 'VERIFY(a): the shop offers %', v->'offers'; end if;
    -- (b) every crop's seed is offered (nobody is left unable to plant), and the tools and gear are still sold
    if exists (select 1 from public.hr_crops c where c.seed_item is not null
                and not exists (select 1 from jsonb_array_elements(v->'offers') e where e->>'kind' = 'seed' and e->>'item' = c.seed_item))
       or not exists (select 1 from jsonb_array_elements(v->'offers') e where e->>'item' = 'leather_gloves')
       or not exists (select 1 from jsonb_array_elements(v->'offers') e where e->>'item' = 'bronze_axe') then
      raise exception 'VERIFY(b): a crop''s seed, the outfitter or the tools are missing: %', v->'offers'; end if;
    -- (c) no supply is listed (Tyler 2026-10-20)
    if exists (select 1 from jsonb_array_elements(v->'offers') e join public.hr_hunt_supplies s on s.item_id = e->>'item') then
      raise exception 'VERIFY(c): the shop lists a hunt supply: %', v->'offers'; end if;
    -- (d) buy-then-sell loses on every listed row
    if exists (select 1 from jsonb_array_elements(v->'offers') e join public.hr_hunt_vendor_value vv on vv.item_id = e->>'item'
                where vv.unit * 2 > (e->>'price')::bigint) then
      raise exception 'VERIFY(d): the vendor pays more than half a listed price'; end if;
    raise exception using errcode = 'HR887', message = 'shop-seeds §2 complete - rolling back';
  exception when sqlstate 'HR887' then
    null;
  end;
  if exists (select 1 from public.player_state where user_id = v_uid) then raise exception 'VERIFY(e): §2 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'shop-seeds: the Shop offers the tools, the outfitter''s gear and every crop''s seed; no supplies; buy-then-sell loses; all green';
end $$;
