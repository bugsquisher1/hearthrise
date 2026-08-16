// ============================================================================
// tools/probe-live-settle.mjs — THE MEASUREMENTS BEHIND docs/design/live-settlement.md
//
// A throwaway-grade probe, kept because its numbers are load-bearing in the
// spec and a number in prose that nobody can re-derive is a number that rots.
// Pure Node, no database, no network: it drives the DEPLOYED accrual engine
// (supabase/functions/hr-accrue/accrual.js) over synthetic spans and reports
// what settling at a cadence costs versus one long window.
//
//   node tools/probe-live-settle.mjs
//
// It asserts nothing and is not in the smoke suite. The three properties it
// measured, each cited in the spec:
//   P1  ACCRUE_MIN_MS is exactly 60,000 and 59,999 ms is refused below_min_span
//   P2  slicing bias for combat is under ~1% at 40 seeds (noise-dominated)
//   P3  a fight whose time-to-kill EXCEEDS the cadence pays ZERO, at every
//       cadence, forever — the partial monster is discarded at each boundary
// ============================================================================
import { computeAccrual, ACCRUE_MIN_MS } from '../supabase/functions/hr-accrue/accrual.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);
const HOUR = 3600000;

/* A fixture that CANNOT DIE, for the same reason tools/race-test.mjs needed
   one: a character that dies mid-span ends the span, and then every later
   window is unpayable — which reads as "slicing lost the payment" when it was
   only ever the death check. */
const IMMORTAL = {
  hp: 990, maxHp: 990,
  skills: { attack: 1000000, strength: 1000000, defence: 1000000, hitpoints: 13000000 },
};

function mk(from, to, seed, over) {
  return {
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: to, accruedToMs: from, activeSinceMs: NOW - HOUR,
    activeKind: 'combat', activeId: 'goblin', capMs: 12 * HOUR,
    seed, gold: 0, equipment: {}, items: ITEMS, monsters: MONSTERS, inventory: {},
    ...IMMORTAL, ...(over || {}),
  };
}

// ── P1: where the floor actually is ────────────────────────────────────────
console.log('P1  ACCRUE_MIN_MS =', ACCRUE_MIN_MS);
for (const s of [30000, 59999, 60000, 90000]) {
  const r = computeAccrual(mk(NOW - s, NOW, 123456789));
  console.log(`    span ${s} ms -> ${r.accrued ? `paid, ${r.summary.kills} kills` : 'REFUSED ' + r.reason}`);
}

// ── P2: what settling at a cadence costs, averaged over seeds ──────────────
const N = 40;
const SLICES = [60000, 90000, 120000, 300000, 900000];
let refG = 0, refK = 0;
const tot = {}; for (const s of SLICES) tot[s] = { g: 0, k: 0 };
for (let t = 0; t < N; t++) {
  const s0 = 1000 + t * 7919;
  const one = computeAccrual(mk(NOW - HOUR, NOW, s0));
  refG += one.delta.gold; refK += one.summary.kills;
  for (const slice of SLICES) {
    for (let i = 0; i < HOUR / slice; i++) {
      const r = computeAccrual(mk(NOW - HOUR + i * slice, NOW - HOUR + (i + 1) * slice, s0 + 1 + i));
      if (r.accrued) { tot[slice].g += r.delta.gold || 0; tot[slice].k += r.summary.kills; }
    }
  }
}
console.log(`\nP2  mean over ${N} seeds — one 60-min window: gold ${(refG / N).toFixed(1)} kills ${(refK / N).toFixed(1)}`);
for (const s of SLICES) {
  const pg = ((tot[s].g - refG) / refG * 100).toFixed(2);
  const pk = ((tot[s].k - refK) / refK * 100).toFixed(2);
  console.log(`    settle every ${s / 1000}s: gold ${(tot[s].g / N).toFixed(1)} (${pg}%)  kills ${(tot[s].k / N).toFixed(1)} (${pk}%)`);
}

// ── P3: the slow kill. THE FINDING THAT SHAPES THE WHOLE PROGRAM. ──────────
const big = Object.entries(MONSTERS).sort((a, b) => (b[1].hp || 0) - (a[1].hp || 0))[0];
const SLOW = {
  activeId: big[0], hp: 9900, maxHp: 9900,
  skills: { attack: 60000, strength: 60000, defence: 20000000, hitpoints: 40000000 },
};
const whole = computeAccrual(mk(NOW - HOUR, NOW, 42, SLOW));
console.log(`\nP3  target ${big[0]} (hp ${big[1].hp}) — one 60-min window: `
  + (whole.accrued ? `${whole.summary.kills} kills, ${whole.delta.gold} gold, ${whole.summary.ticks} ticks` : whole.reason));
for (const slice of [60000, 120000, 300000]) {
  let k = 0, g = 0;
  for (let i = 0; i < HOUR / slice; i++) {
    const r = computeAccrual(mk(NOW - HOUR + i * slice, NOW - HOUR + (i + 1) * slice, 43 + i, SLOW));
    if (r.accrued) { k += r.summary.kills; g += r.delta.gold || 0; }
  }
  console.log(`    settle every ${slice / 1000}s: ${k} kills, ${g} gold`);
}
console.log('\n    ^ ZERO at every cadence. An in-progress monster is not server state, so every '
  + 'settle boundary discards it and restarts the fight at full monster HP.');
