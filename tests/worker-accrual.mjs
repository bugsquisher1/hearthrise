// ============================================================================
// tests/worker-accrual.mjs — the PURE hired-worker accrual engine, proven in
// Node. Run: node tests/worker-accrual.mjs  (also invoked by run-smoke.mjs).
//
// What it locks down:
//   W1  determinism — same inputs, byte-identical output, no ambient read
//   W2  away == live — the SAME span settled in one call vs. the client's OLD
//       accrueWorker math produces the same per-worker yield (the flip changes
//       no number). No RNG anywhere, so this is parity by construction.
//   W3  the rate table matches src/features/workers.js (level/eff/yield/xp)
//   W4  idle / inconsistent / sub-tick workers produce NOTHING (no mispricing)
//   W5  the 24h cap bounds one settle; a crew never debits (items all positive)
//   W6  worker xp is PER-WORKER, keyed by uid — never a skill row, never player
// ============================================================================
import {
  accrueWorkers, workerLevel, workerEff,
  WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL, WORKER_ACCRUE_CAP_MS,
} from '../supabase/functions/hr-accrue/accrual.js';
import { GATHER_NODES } from '../supabase/functions/hr-accrue/catalogue.js';
import { ITEMS } from '../src/data/items.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ` (${JSON.stringify(a)} vs ${JSON.stringify(b)})`); }

// The CLIENT reference math — a verbatim transcription of src/features/workers.js
// `level`/`eff`/`accrueWorker`, so W2/W3 compare the server engine to the exact
// pre-flip client behaviour it replaces.
const BASE_EFF = 0.10, EFF_PER_LVL = 0.008, MAX_LVL = 10, CAP = 24 * 3600000;
function cLevel(xp) { return Math.min(MAX_LVL, 1 + Math.floor(Math.sqrt((xp || 0) / 2000))); }
function cEff(xp) { return BASE_EFF + EFF_PER_LVL * (cLevel(xp) - 1); }
function nodeById(skill, id) {
  const t = { woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS }[skill] || [];
  return t.find((n) => n.id === id) || null;
}
function clientAccrue(w, spanMs) {
  const act = w.target_id && nodeById(w.skill, w.target_id);
  if (!act) return { qty: 0, id: null, xp: 0 };
  const elapsed = Math.min(Math.max(0, spanMs), CAP);
  const perTickMs = act.ms / cEff(w.xp);
  const ticks = Math.floor(elapsed / perTickMs);
  if (ticks <= 0) return { qty: 0, id: act.prod, xp: 0 };
  const avgQty = (act.qty[0] + act.qty[1]) / 2;
  const qty = Math.max(0, Math.floor(ticks * avgQty));
  const xp = Math.floor(ticks * act.xp * 0.5);
  return { qty, id: act.prod, xp };
}

console.log('W1/W3 — constants + rate table match workers.js');
eq([WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL, WORKER_ACCRUE_CAP_MS],
   [BASE_EFF, EFF_PER_LVL, MAX_LVL, CAP], 'exported constants match the client');
for (const xp of [0, 1999, 2000, 8000, 18000, 200000, 1e9]) {
  ok(workerLevel(xp) === cLevel(xp), `workerLevel(${xp}) == client level ${cLevel(xp)}`);
  ok(Math.abs(workerEff(xp) - cEff(xp)) < 1e-12, `workerEff(${xp}) == client eff`);
}

console.log('W1 — determinism: same inputs, byte-identical output');
const crew = [
  { uid: 'w1', skill: 'woodcutting', target_id: 'normal_tree', xp: 0 },
  { uid: 'w2', skill: 'mining', target_id: 'coal_rock', xp: 50000 },
  { uid: 'w3', skill: 'fishing', target_id: 'trout_s', xp: 8000 },
];
const now = 1_000_000_000_000;
const from = now - 12 * 3600000;   // 12h span
const A = accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew, nodes: GATHER_NODES, items: ITEMS });
const B = accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew, nodes: GATHER_NODES, items: ITEMS });
eq(A, B, 'two identical calls are byte-identical');
ok(A.accrued === true, '12h crew settle accrues');

console.log('W2 — away == live: server yield == client accrueWorker over the same span');
{
  const span = now - from;
  // per-worker expected from the client transcription
  const expItems = {}; const expXp = {};
  for (const w of crew) {
    const r = clientAccrue(w, span);
    if (r.qty > 0) expItems[r.id] = (expItems[r.id] || 0) + r.qty;
    if (r.xp > 0) expXp[w.uid] = r.xp;
  }
  eq(A.items, expItems, 'server item delta == client per-worker yields summed');
  const gotXp = Object.fromEntries(Object.entries(A.workers).filter(([, o]) => 'xp' in o).map(([k, o]) => [k, o.xp]));
  eq(gotXp, expXp, 'server worker xp (ignoring carry) == client per-worker xp, keyed by uid');
  // away==live by construction: there is no `away` flag; the same span always
  // returns the same bytes whether "collected on return" or "ticked online".
  const oneShot = accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew, nodes: GATHER_NODES, items: ITEMS });
  eq(oneShot.items, A.items, 'one-shot away settle == the reference settle (no away/live divergence)');
}

console.log('W4 — idle / inconsistent / sub-tick workers produce nothing');
{
  const idle = [{ uid: 'x', skill: null, target_id: null, xp: 0 }];
  ok(accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew: idle, nodes: GATHER_NODES, items: ITEMS }).accrued === false,
     'an all-idle crew does not accrue');
  const wrongSkill = [{ uid: 'x', skill: 'mining', target_id: 'normal_tree', xp: 0 }];   // tree under mining
  ok(accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew: wrongSkill, nodes: GATHER_NODES, items: ITEMS }).accrued === false,
     'a skill≠node assignment produces nothing (never mispriced against the wrong node)');
  const badId = [{ uid: 'x', skill: 'woodcutting', target_id: '__proto__', xp: 0 }];
  ok(accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew: badId, nodes: GATHER_NODES, items: ITEMS }).accrued === false,
     'a __proto__ target id resolves to nothing (own-property lookup)');
  const subTick = [{ uid: 'x', skill: 'woodcutting', target_id: 'normal_tree', xp: 0 }];
  // normal_tree ms=3000, eff at lv1 = 0.10 → perTickMs = 30000ms; a 20s span = 0 ticks
  const st = accrueWorkers({ nowMs: now, workersAccruedToMs: now - 20000, crew: subTick, nodes: GATHER_NODES, items: ITEMS });
  ok(st.accrued === false, 'a sub-tick span (20s < 30s perTick) produces nothing, watermark deferred');
}

console.log('W5 — the 24h cap bounds one settle; all item deltas are positive');
{
  const huge = accrueWorkers({ nowMs: now, workersAccruedToMs: now - 100 * 3600000, crew, nodes: GATHER_NODES, items: ITEMS });
  const capped = accrueWorkers({ nowMs: now, workersAccruedToMs: now - 24 * 3600000, crew, nodes: GATHER_NODES, items: ITEMS });
  eq(huge.items, capped.items, 'a 100h absence pays exactly the 24h cap');
  ok(huge.summary.capped === true, 'the over-cap settle reports capped');
  for (const id in huge.items) ok(huge.items[id] > 0, `item ${id} delta is positive (a crew never debits)`);
}

console.log('W6 — worker xp is per-uid; player skills untouched');
{
  ok(Object.keys(A.workers).every((k) => k.startsWith('w')), 'worker settle keyed by worker uid');
  ok(!('woodcutting' in A.workers) && !('mining' in A.workers), 'no skill id appears in the worker map');
  for (const uid in A.workers) ok('acc_ms' in A.workers[uid], `worker ${uid} carries an acc_ms`);
}

// ── The settle-loop harness: feed the returned per-worker carry back into the
//    crew, and DON'T advance the watermark when a settle refuses (produced
//    nothing) — exactly what index.ts does. Returns the summed item delta + xp.
function runLoop(crew0, fromMs, toMs, stepMs) {
  const crew = crew0.map((w) => ({ ...w }));
  let wm = fromMs;                       // simulated workers_accrued_to
  const items = {}; const xp = {};
  const settle = (t) => {
    const r = accrueWorkers({ nowMs: t, workersAccruedToMs: wm, crew, nodes: GATHER_NODES, items: ITEMS });
    if (!r.accrued) return;              // refuse: watermark + carries unchanged
    wm = t;                              // producing settle advances the watermark
    for (const id in r.items) items[id] = (items[id] || 0) + r.items[id];
    for (const uid in r.workers) {
      const o = r.workers[uid];
      const w = crew.find((x) => x.uid === uid);
      if (w) w.acc_ms = o.acc_ms;        // persist the carry (hr_apply does this)
      if (o.xp) xp[uid] = (xp[uid] || 0) + o.xp;
    }
  };
  for (let t = fromMs + stepMs; t < toMs; t += stepMs) settle(t);
  settle(toMs);                          // final drain (a collect always ends at now())
  return { items, xp };
}

console.log('W7 — a SLOW worker (perTick > settle cadence) eventually produces, never silently zero');
{
  // normal_tree ms=3000, lv1 eff 0.10 → perTick = 30000ms = 30s. Settle every 10s.
  const slow = [{ uid: 'wslow', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, acc_ms: 0 }];
  const from = 0, to = 6 * 3600000;      // 6h
  const loop = runLoop(slow, from, to, 10000);   // 10s settles — well under the 30s perTick
  const perTick = 30000, avgQty = 1;
  const expTicks = Math.floor((to - from) / perTick);
  ok(loop.items.normal_log === expTicks * avgQty,
     `slow worker produced ${loop.items.normal_log}, expected ${expTicks * avgQty} — carry bridges sub-cadence perTicks`);
  ok(loop.items.normal_log > 0, 'a slow worker is NOT silently zero (the shared-watermark break is fixed)');
}

console.log('W8 — away == live byte-identical WITH carry (one big settle == many small)');
{
  // MAXED worker → eff constant (E=172) → exact across settle granularities.
  const maxed = [{ uid: 'wmax', skill: 'mining', target_id: 'coal_rock', xp: 200000, acc_ms: 0 }];
  const from = 0, to = 24 * 3600000;
  const oneShot = accrueWorkers({ nowMs: to, workersAccruedToMs: from, crew: maxed, nodes: GATHER_NODES, items: ITEMS });
  const many = runLoop(maxed, from, to, 7000);       // 7s settles (deliberately not a divisor of perTick)
  const manyOdd = runLoop(maxed, from, to, 91000);   // 91s settles — a different granularity
  // ITEMS are the load-bearing property (they enter player_inventory and are the
  // thing the flip could delete) — they must be BYTE-IDENTICAL across granularity.
  eq(many.items, oneShot.items, 'many 7s settles sum to the one-shot 24h item total, byte-identical');
  eq(manyOdd.items, oneShot.items, 'many 91s settles ALSO sum to the one-shot total, byte-identical');
  // WORKER XP uses per-settle floor(ticks·node.xp·0.5) — exactly the shipped
  // client's per-CALL behaviour (workers.js accrueWorker). So many small settles
  // lose at most 0.5 xp each vs one big settle: a BOUNDED, UNDER-PAY-ONLY gap on a
  // private efficiency multiplier, never an over-pay and never an item. Assert the
  // direction and the bound rather than pretend it is byte-identical.
  const oneX = oneShot.workers.wmax.xp, manyX = many.xp.wmax;
  ok(manyX <= oneX, `many-settle worker xp (${manyX}) never exceeds one-shot (${oneX}) — under-pay only`);
  ok(oneX - manyX < to / (5500 * 1000 / 172), `worker-xp gap ${oneX - manyX} is bounded by the settle count (< 0.5/settle)`);
}

console.log('W9 — a pure sub-tick settle REFUSES (watermark not advanced, no write)');
{
  const slow = [{ uid: 'w', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, acc_ms: 0 }];
  // 20s span, 30s perTick, no prior carry → 0 ticks → refuse.
  const r = accrueWorkers({ nowMs: 20000, workersAccruedToMs: 0, crew: slow, nodes: GATHER_NODES, items: ITEMS });
  ok(r.accrued === false && r.reason === 'nothing_accrued', 'sub-tick settle refuses (defers, no watermark move)');
}

console.log('W10 — carry stays in range; a mixed fast+slow crew loses nothing');
{
  const mixed = [
    { uid: 'wfast', skill: 'mining', target_id: 'coal_rock', xp: 200000, acc_ms: 0 },   // fast (maxed)
    { uid: 'wslow', skill: 'woodcutting', target_id: 'duskwood_tree', xp: 0, acc_ms: 0 }, // slow (ms=13000, lv1)
  ];
  const from = 0, to = 24 * 3600000;
  const oneShot = accrueWorkers({ nowMs: to, workersAccruedToMs: from, crew: mixed, nodes: GATHER_NODES, items: ITEMS });
  const many = runLoop(mixed, from, to, 5000);   // 5s settles — fast worker forces frequent advances
  // The slow worker's product (duskwood_log) must be fully preserved despite the
  // fast worker forcing the shared watermark forward every few seconds.
  eq(many.items, oneShot.items,
     'a fast worker forcing frequent watermark advances does NOT rob the slow worker (carry preserved)');
}

if (failures) { console.error(`\nworker-accrual: ${failures} FAILED`); process.exit(1); }
console.log('\nworker-accrual: all green');
