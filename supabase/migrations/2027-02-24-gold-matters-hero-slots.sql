-- ==========================================================================
-- 2027-02-24-gold-matters-hero-slots.sql — THE THIRD HERO IS A DECISION
--   (lane/c-gold-matters, game designer, 2026-11-03; Tyler 10-17: extra slots cost
--   "substantial escalating" gold, a sink; Tyler 11-01: gold starts to be
--   meaningless very quick).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file,
-- never inside begin/commit, never 00:00-00:10 UTC). Pre-EA: applies on its
-- passing §2; on the EA Security list (MONEY SURFACE: a catalogue price).
-- EDGE: none, the payload hash does not move. CLIENT: src/data/shops.js carries the
-- same three rows (tests/hero-slot-buy.mjs BIND); every screen reads the price from
-- the envelope's account.hero_slot_offer, so a client on the old build shows the
-- new price the moment this lands.
-- APPLY ORDER: anywhere after 2026-11-03-hero-slots-gold.sql.
--
-- ── THE LADDER ─────────────────────────────────────────────────────────────
-- The 3rd / 4th / 5th hero slot (slot_id 2 / 3 / 4): 15,000 / 40,000 / 120,000 ->
-- 50,000 / 200,000 / 800,000 gold. Ruling r45 (10-21) set the old ladder against
-- about 1,500 g an hour; a lone hero now earns 3,000-6,000 g an hour, so the third
-- hero was three hours of one hero. Measured on the real engine and written on
-- the priority board (2026-11-03 Gold matters): 50,000 is about hour 15 of a lone
-- hero who buys nothing else, or hour 7 of the two free heroes. Nothing in the
-- first ten minutes reads it; the coach's lines read the server's price.
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- Three prices up, no function body, no grant. Slots already bought stay owned.
-- The purchase's locks, ladder order, idempotency and journal do not move.
--
-- REVERSIBILITY: update the three rows back to 15000 / 40000 / 120000 (with
-- src/data/shops.js). Re-runnable: §0 accepts the old ladder or this file's own.
-- ==========================================================================

-- ── §0 A PINNED UPDATE: IT RUNS ONLY OVER THE LADDER IT REPRICES ───────────
do $mig$
declare v_now text;
begin
  if to_regclass('public.hr_hero_slots') is null then raise exception 'PRECONDITION: hr_hero_slots is absent'; end if;
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now
    from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:15000:false,3:40000:false,4:120000:false'
     and v_now is distinct from '1:0:true,2:50000:false,3:200000:false,4:800000:false' then
    raise exception 'PRECONDITION: hr_hero_slots is not the r45 ladder this file reprices (%) - another lane moved it', v_now;
  end if;
end $mig$;

-- ── §1 THE PRICES ──────────────────────────────────────────────────────────
update public.hr_hero_slots as h
   set cost_gold = v.gold
  from (values (2, 50000), (3, 200000), (4, 800000)) as v(slot_id, gold)
 where h.slot_id = v.slot_id and not h.starter and h.cost_gold is distinct from v.gold;

-- ── §2 SELF-CHECK (CLAUDE.md §4): the catalogue holds the ladder, and the offer a new account reads names it ──
do $check$
declare v_now text; v_offer jsonb; v_user uuid := '00000000-0000-4000-8000-00000000f1a7';
begin
  select string_agg(slot_id || ':' || cost_gold || ':' || starter, ',' order by slot_id) into v_now
    from public.hr_hero_slots;
  if v_now is distinct from '1:0:true,2:50000:false,3:200000:false,4:800000:false' then
    raise exception 'VERIFY: hr_hero_slots reads %, not the ladder 50,000 / 200,000 / 800,000', v_now;
  end if;
  -- no owned row exists for this subject, so the offer is what a brand-new account is shown
  v_offer := public.hr_account_view(v_user, 0) -> 'hero_slot_offer';
  if (v_offer ->> 'slot_id')::int is distinct from 2 or (v_offer ->> 'cost_gold')::bigint is distinct from 50000 then
    raise exception 'VERIFY: a new account is offered %, not the third hero at 50,000', v_offer;
  end if;
  raise notice 'hr_hero_slots OK: 50,000 / 200,000 / 800,000';
end $check$;
