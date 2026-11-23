// ============================================================================
// src/data/gold-ladders.js — THE GOLD-SPEND LADDER (slices 2 & 3).
//
// One permanent, gold-priced capability that the SERVER owns, modelled as a
// bounded MAX-MERGE unlock ladder so that the ONE existing spend RPC
// (public.hr_unlock_buy) sells it with no new code path:
//
//   bank          the bag's stack cap, each HERO's. 10 rungs (Tyler 2026-11-20,
//                 call 26-9: it stops at 10; Storage grows in the depot). Price
//                 wageListPrice(round(232 * 1.32^k), 1): milli-hours of wage, the base
//                 wage, as a list price (3,000 g at rung 1, then 4,000 / 5,200 / ...). hr_unlock_buy raises player_state.bank_cap
//                 through hr_bank_cap_for_rungs (raise-only: a rung owned past 10
//                 keeps its bag).
//
//   key_ring      the Key Ring (Tyler 2026-11-16): ONE rung, once per hero. Every chest key
//                 sits on it instead of in the bag (2027-04-27-tower-chest.sql, the ring
//                 itself). KEY_RING_HOURS_PM IS A PLACEHOLDER for the designer: the audit found
//                 the gold sinks too small (F12/F20), so this is a sink to size, not a number.
//
// PRICED IN HOURS OF WAGE (lane/prices-wage-hours, 2026-11-23; 27-formula-overhaul.md E-6): no rung types
// its gold. A rung is milli-hours of wage at step 1 (src/data/wage.js wagePrice), so the wage's levers move
// every rung with the pay. A rung is a list price (two figures, wage.js wageListPrice); the key ring's
// hours give its 25,000 back, the bank's geometric ladder lands within 1% of its 2026-11-22 rungs.
//
// THE OTHER TWO LADDERS ARE CUT (lane/c-dead-plot-deed, 2026-11-07).
// `worker_hire` (the crew size) lost its only reader when the hire and assign
// doors were dropped (2027-01-18-dead-surfaces-cut.sql), and `plot:farm_land`
// never had one: the field's size is the property ladder plus the Garden's beds
// (hr_farm_plot_cap). Both stayed sellable to a hand-made `unlock_buy` and bought
// nothing; no window offered either. tests/catalogue-coherence.mjs C14 keeps them
// out.
//
// ── WHY A LADDER AND NOT A "COUNT" ──────────────────────────────────────────
// Additive count is the wrong SERVER model: two concurrent buys both increment
// (busting the cap), a replay double-increments, and an escalating price cannot
// be enforced. A MAX ladder is monotonic and idempotent by construction and the
// per-rung price sits in the offer row, so hr_unlock_buy re-validates all of it
// under one advisory lock.
//
// ── WHAT LIVES HERE vs. IN SQL ──────────────────────────────────────────────
// This module is BOOKKEEPING the two runtimes share: which rungs exist and
// their PRICE. The one magnitude, BANK_STACKS_PER_RUNG, is read by the client
// and pinned to the server's hr_bank_cap_for_rungs by tests/bank-cap-rungs.mjs.
// tools/gen-gold-ladders.mjs generates the catalogue rows from this file.
//
// PURE ESM: data and the wage's one price function, no I/O, no globals. Node,
// Deno and the browser all read it verbatim.
// ============================================================================

import { wageListPrice } from './wage.js';

/* The step these per-hero capacity rungs read the wage at: the base wage (no rung has a step of its own). */
const LADDER_STEP = 1;
/* wageListPrice(round(BANK_BASE_HOURS_PM * BANK_GROWTH^k), step 1), k = rungs already owned = value-1: a list price (two figures). */
export const BANK_BASE_HOURS_PM = 232;
export const BANK_GROWTH = 1.32;
export const BANK_RUNGS = 10;
export const BANK_STACKS_PER_RUNG = 20;   // client-read magnitude; NOT sent to SQL
export function bankRungPrice(k) { return wageListPrice(Math.round(BANK_BASE_HOURS_PM * Math.pow(BANK_GROWTH, k)), LADDER_STEP); }

/** One ladder rung, exactly the columns hr_unlock_offers stores. */
function rung(offerId, tableName, name, unlockId, value, gold, items, reqTier) {
  return Object.freeze({
    offer_id: offerId, table_name: tableName, name, unlock_id: unlockId,
    value, gold, items: Object.freeze(items), req_property_tier: reqTier,
  });
}

/* ── bank: BANK_RUNGS rungs, geometric price, no tier gate ───────────────── */
export const BANK_LADDER = Object.freeze(
  Array.from({ length: BANK_RUNGS }, (_, i) => {
    const n = i + 1;               // rung value 1..BANK_RUNGS
    return rung(`bank.${i}`, 'bank', `Bank expansion (+${BANK_STACKS_PER_RUNG})`,
      'bank', n, bankRungPrice(i), {}, 0);
  }),
);

/* ── key_ring: one rung, one price (a PLACEHOLDER: the designer sizes it) ─── */
export const KEY_RING_HOURS_PM = 1933;
export const KEY_RING_GOLD = wageListPrice(KEY_RING_HOURS_PM, LADDER_STEP);
export const KEY_RING_LADDER = Object.freeze([
  rung('key_ring.0', 'key_ring', 'Key Ring', 'key_ring', 1, KEY_RING_GOLD, {}, 0),
]);

/** The hr_unlocks catalogue rows the ladder needs (merge='max', kind='unlock'). */
export const GOLD_LADDER_UNLOCKS = Object.freeze([
  Object.freeze({ unlock_id: 'bank', namespace: 'bank', merge: 'max',
    progress_kind: 'unlock', max_value: BANK_RUNGS,
    rungs: Object.freeze(BANK_LADDER.map((r) => r.value)) }),
  Object.freeze({ unlock_id: 'key_ring', namespace: 'key_ring', merge: 'max',
    progress_kind: 'unlock', max_value: 1, rungs: Object.freeze([1]) }),
]);

/** Every gold-ladder offer row, in id order. */
export const GOLD_LADDER_OFFERS = Object.freeze([...BANK_LADDER, ...KEY_RING_LADDER]);

/** The offer-id SET the Edge consults to decide it may forward the intent to
    hr_unlock_buy. Disjoint from every authored shop offer id on purpose, so it
    is checked with no risk of colliding with a refused shop row. */
export const GOLD_LADDER_OFFER_IDS = Object.freeze(
  GOLD_LADDER_OFFERS.map((r) => r.offer_id),
);
