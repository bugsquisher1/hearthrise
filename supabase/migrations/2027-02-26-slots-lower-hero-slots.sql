-- ==========================================================================
-- 2027-02-26-slots-lower-hero-slots.sql — YOUR OWN PARTY IS THE CORE OF THE GAME
--   (lane/c-slots-lower, game designer, 2026-11-04; Tyler the same day: "I think
--   lower it; but we need to add some additional gold sinks before we raise the
--   price." Your own party shouldn't be gated behind a grind.)
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file,
-- never inside begin/commit). Pre-EA: applies on its passing §2; on the EA Security
-- list (MONEY SURFACE: a catalogue price).
-- EDGE: no engine behaviour moves, but the payload hash does: src/data/shops.js is in the
-- bundle and the engine refuses these rows (the sale is hr_buy_hero_slot's, from this
-- table), so one hr-accrue redeploy clears GitHub's payload guard, in either order.
-- CLIENT: src/data/shops.js carries the same three
-- rows (tests/hero-slot-buy.mjs BIND); every screen reads the price from the
-- envelope's account.hero_slot_offer, so a client on an older build shows the new
-- price the moment this lands.
-- APPLY ORDER: anywhere after 2027-02-24-gold-matters-hero-slots.sql.
--
-- ── THE LADDER ─────────────────────────────────────────────────────────────
-- The 3rd / 4th / 5th hero slot (slot_id 2 / 3 / 4): 50,000 / 200,000 / 800,000 ->
-- 25,000 / 75,000 / 250,000 gold. The numbers are Tyler's. On the 11-03 lives
-- (the priority board, Gold matters) a lone hero who buys nothing else reaches
-- 25,000 at about hour 8-10, the two free heroes at about hour 5.
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- Three prices down, no function body, no grant. A slot bought at the higher price
-- stays owned and is not refunded (the wipe takes it). The purchase's locks, ladder
-- order, idempotency and journal do not move.
--
-- REVERSIBILITY: update the three rows back to 50000 / 200000 / 800000 (with
-- src/data/shops.js). Re-runnable: §0 accepts the old ladder or this file's own.
-- ==========================================================================

-- ── §0 A PINNED UPDATE: IT RUNS ONLY OVER THE LADDER IT REPRICES ───────────
do $mig$
declare v_now text;
begin
  if to_regclass('public.hr_hero_slots') is null then raise exception 'PRECONDITION: hr_hero_slots is absent'; end if;
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now
    from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:50000:false,3:200000:false,4:800000:false'
     and v_now is distinct from '1:0:true,2:25000:false,3:75000:false,4:250000:false' then
    raise exception 'PRECONDITION: hr_hero_slots is not the gold-matters ladder this file reprices (%) - another lane moved it', v_now;
  end if;
end $mig$;

-- ── §1 THE PRICES ──────────────────────────────────────────────────────────
update public.hr_hero_slots as h
   set cost_gold = v.gold
  from (values (2, 25000), (3, 75000), (4, 250000)) as v(slot_id, gold)
 where h.slot_id = v.slot_id and not h.starter and h.cost_gold is distinct from v.gold;

-- ── §2 SELF-CHECK (CLAUDE.md §4): the catalogue holds the ladder, and the offer a new account reads names it ──
do $check$
declare v_now text; v_offer jsonb; v_user uuid := '00000000-0000-4000-8000-00000000f1a8';
begin
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now
    from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:25000:false,3:75000:false,4:250000:false' then
    raise exception 'VERIFY: hr_hero_slots reads %, not the ladder 25,000 / 75,000 / 250,000', v_now;
  end if;
  -- no owned row exists for this subject, so the offer is what a brand-new account is shown
  v_offer := public.hr_account_view(v_user, 0) -> 'hero_slot_offer';
  if (v_offer ->> 'slot_id')::int is distinct from 2 or (v_offer ->> 'cost_gold')::bigint is distinct from 25000 then
    raise exception 'VERIFY: a new account is offered %, not the third hero at 25,000', v_offer;
  end if;
  raise notice 'hr_hero_slots OK: 25,000 / 75,000 / 250,000';
end $check$;
