// ============================================================================
// src/data/gold-ladders.js — THE GOLD-SPEND LADDERS (slices 2 & 3).
//
// Three permanent, gold-priced capabilities that the SERVER owns, modelled as
// bounded MAX-MERGE unlock ladders so that the ONE existing spend RPC
// (public.hr_unlock_buy) sells them with no new code path:
//
//   worker_hire   the hired-crew size. 6 rungs. Price ESCALATES per rung
//                 (workers.js HIRE_COSTS), so a naive "buy the cheap rung twice"
//                 is impossible only BECAUSE it is a ladder: rung N requires you
//                 hold rung N-1 (hr_unlock_buy's rung-order + already_owned).
//   plot:farm_land the farm-plot count. 12 rungs. FLAT price per rung.
//   bank          bag capacity. 30 rungs. Price grows geometrically
//                 (round(3000 * 1.32^k), k in [0,29]) — the exact curve
//                 buyBankSpaceGold charges client-side today.
//
// ── WHY A LADDER AND NOT A "COUNT" ──────────────────────────────────────────
// The catalogue used to file worker/plot as merge='count' (additive). Additive
// count is the wrong SERVER model: two concurrent buys both increment (busting
// the cap), a replay double-increments, and an escalating price cannot be
// enforced. A MAX ladder is monotonic and idempotent by construction and the
// per-rung price sits in the offer row, so hr_unlock_buy re-validates all of it
// under one advisory lock. See docs — this is the slices-2-3 model decision.
//
// ── WHAT LIVES HERE vs. IN SQL ──────────────────────────────────────────────
// This module is BOOKKEEPING the two runtimes share: which rungs exist, their
// PRICE, and the property-tier PREREQUISITE per rung. It carries NO bonus
// magnitude — what a bank rung is WORTH (+20 stacks) stays in src/legacy.js
// BANK_SPACE and is read by the client; what a worker/plot is worth stays in
// its feature module. The server stores only the rung the player holds.
//
// ── THE TIER GATE IS DERIVED FROM homestead.js TIERS, NOT RESTATED ──────────
// The req-tier numbers below are the SAME derivation homestead.js encodes
// (worker rung N needs the first tier whose `workers >= N`; farm rung N the
// first whose `plots >= N`). tools/gen-gold-ladders.mjs --check re-derives them
// from the sliced TIERS/HIRE_COSTS/PLOT_BUILDINGS/BANK_SPACE at build time and
// FAILS the smoke suite on any drift, so these constants can never silently
// diverge from the game data they mirror.
//
// PURE ESM, no imports, no I/O, no globals. Node, Deno and (later) the browser
// all read it verbatim.
// ============================================================================

/* Mirrors src/features/workers.js HIRE_COSTS. The drift guard asserts equality. */
export const WORKER_HIRE_COSTS = Object.freeze([500, 3000, 15000, 75000, 250000, 750000]);

/* TIERS.workers = [0,1,2,3,4,6] over tiers camp..castle (index 0..5). The first
   tier index whose workers >= N is least(N,5) for N in 1..6. */
function workerReqTier(n) { return Math.min(n, 5); }

/* TIERS.plots = [2,4,6,8,10,12]. The first tier index whose plots >= N is
   floor((N-1)/2) for N in 1..12. */
function farmReqTier(n) { return Math.floor((n - 1) / 2); }

/* buyBankSpaceGold: round(3000 * 1.32^k), k = rungs already owned = value-1. */
export const BANK_BASE = 3000;
export const BANK_GROWTH = 1.32;
export const BANK_RUNGS = 30;
export const BANK_STACKS_PER_RUNG = 20;   // client-read magnitude; NOT sent to SQL
export function bankRungPrice(k) { return Math.round(BANK_BASE * Math.pow(BANK_GROWTH, k)); }

/* Flat farm-plot price — PLOT_BUILDINGS.farm_plot.cost. */
export const FARM_LAND_GOLD = 100;
export const FARM_LAND_ITEMS = Object.freeze({ normal_log: 5 });
export const FARM_LAND_RUNGS = 12;
export const WORKER_RUNGS = 6;

/** One ladder rung, exactly the columns hr_unlock_offers stores. */
function rung(offerId, tableName, name, unlockId, value, gold, items, reqTier) {
  return Object.freeze({
    offer_id: offerId, table_name: tableName, name, unlock_id: unlockId,
    value, gold, items: Object.freeze(items), req_property_tier: reqTier,
  });
}

/* ── worker_hire: 6 rungs, escalating price, tier-gated crew size ─────────── */
export const WORKER_LADDER = Object.freeze(
  Array.from({ length: WORKER_RUNGS }, (_, i) => {
    const n = i + 1;
    return rung(`worker_hire.${n}`, 'worker', `Hire worker #${n}`, 'worker_hire',
      n, WORKER_HIRE_COSTS[i], {}, workerReqTier(n));
  }),
);

/* ── plot:farm_land: 12 rungs, flat price, tier-gated plot count ──────────── */
export const FARM_LAND_LADDER = Object.freeze(
  Array.from({ length: FARM_LAND_RUNGS }, (_, i) => {
    const n = i + 1;
    return rung(`farm_land.${n}`, 'plot', `Farm plot #${n}`, 'plot:farm_land',
      n, FARM_LAND_GOLD, { ...FARM_LAND_ITEMS }, farmReqTier(n));
  }),
);

/* ── bank: 30 rungs, geometric price, no tier gate ───────────────────────── */
export const BANK_LADDER = Object.freeze(
  Array.from({ length: BANK_RUNGS }, (_, i) => {
    const n = i + 1;               // rung value 1..30
    return rung(`bank.${i}`, 'bank', `Bank expansion (+${BANK_STACKS_PER_RUNG})`,
      'bank', n, bankRungPrice(i), {}, 0);
  }),
);

/** The hr_unlocks catalogue rows these ladders need (merge='max', kind='unlock'). */
export const GOLD_LADDER_UNLOCKS = Object.freeze([
  Object.freeze({ unlock_id: 'worker_hire', namespace: 'worker', merge: 'max',
    progress_kind: 'unlock', max_value: WORKER_RUNGS,
    rungs: Object.freeze(WORKER_LADDER.map((r) => r.value)) }),
  Object.freeze({ unlock_id: 'plot:farm_land', namespace: 'plot', merge: 'max',
    progress_kind: 'unlock', max_value: FARM_LAND_RUNGS,
    rungs: Object.freeze(FARM_LAND_LADDER.map((r) => r.value)) }),
  Object.freeze({ unlock_id: 'bank', namespace: 'bank', merge: 'max',
    progress_kind: 'unlock', max_value: BANK_RUNGS,
    rungs: Object.freeze(BANK_LADDER.map((r) => r.value)) }),
]);

/** Every gold-ladder offer row, in id order. */
export const GOLD_LADDER_OFFERS = Object.freeze(
  [...WORKER_LADDER, ...FARM_LAND_LADDER, ...BANK_LADDER],
);

/** The offer-id SET the Edge consults to decide it may forward the intent to
    hr_unlock_buy. Disjoint from every authored shop offer id on purpose, so it
    is checked with no risk of colliding with a refused shop row. */
export const GOLD_LADDER_OFFER_IDS = Object.freeze(
  GOLD_LADDER_OFFERS.map((r) => r.offer_id),
);
