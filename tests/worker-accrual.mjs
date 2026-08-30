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
//   W11 THE ANCHOR (b497): a worker produces exactly `eff` of an ACTIVE player's
//       rate at the SAME node — measured as a ratio through both engines' own
//       functions, at every node in the catalogue. A Lv10 crew of six = 1.03
//       active-player-equivalents, which is what the b389 ruling says.
//   W12 the deploy boundary: a carry banked under the OLD (faster) anchor cannot
//       mint a burst under the new one, and is not confiscated either
//   W13 the largest carry the real node catalogue can produce stays inside
//       WORKER_MAX_ACC_MS (the value hr_apply REFUSES outside)
// ============================================================================
import {
  accrueWorkers, workerLevel, workerEff, workerAnchorMs,
  WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL, WORKER_ACCRUE_CAP_MS,
  WORKER_MAX_ACC_MS,
} from '../supabase/functions/hr-accrue/accrual.js';
import { GATHER_NODES } from '../supabase/functions/hr-accrue/catalogue.js';
import { ITEMS } from '../src/data/items.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';
/* THE SHARED RATE MODEL both engines import (b497), and the PLAYER's own action
   interval. W11 divides one by the other — two independently-authored functions
   — so the ratio is a MEASUREMENT rather than a restatement of either. */
import { workerTickMs, WORKER_BASE_EFF as CORE_BASE_EFF } from '../src/core/workers.js';
import { actionIntervalMs, pacedActionMs, PACE } from '../src/core/pacing.js';

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ` (${JSON.stringify(a)} vs ${JSON.stringify(b)})`); }

// The CLIENT reference math — a transcription of src/features/workers.js
// `accrueWorker`, so W2 compares the server engine to the exact client
// behaviour. The RATE it uses is NOT transcribed: it is imported from
// src/core/workers.js, because since b497 the client imports it too. A
// transcribed rate here would only ever prove that this file agrees with
// itself; what makes the two engines agree is that there is one function.
const CAP = WORKER_ACCRUE_CAP_MS;
function nodeById(skill, id) {
  const t = { woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS }[skill] || [];
  return t.find((n) => n.id === id) || null;
}
function clientAccrue(w, spanMs) {
  const act = w.target_id && nodeById(w.skill, w.target_id);
  if (!act) return { qty: 0, id: null, xp: 0 };
  const elapsed = Math.min(Math.max(0, spanMs), CAP);
  const perTickMs = workerTickMs(act.ms, w.xp);       // features/workers.js tickMs()
  const ticks = Math.floor(elapsed / perTickMs);
  if (ticks <= 0) return { qty: 0, id: act.prod, xp: 0 };
  const avgQty = (act.qty[0] + act.qty[1]) / 2;
  const qty = Math.max(0, Math.floor(ticks * avgQty));
  const xp = Math.floor(ticks * act.xp * 0.5);
  return { qty, id: act.prod, xp };
}

console.log('W1/W3 — the engine re-exports the shared model, and the curve is the ruled one');
/* The engine must not hold its OWN copy of these — it re-exports
   src/core/workers.js. Assert identity with the core module (===, not a value
   match), then assert the VALUES against the b389 ruling independently, so a
   coordinated edit to both sides still has to face the design number. */
ok(WORKER_BASE_EFF === CORE_BASE_EFF, 'the engine re-exports core WORKER_BASE_EFF (no second copy)');
eq([WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL, WORKER_ACCRUE_CAP_MS],
   [0.10, 0.008, 10, 24 * 3600000], 'the rate curve is the b389 ruling: 10% at Lv1, +0.8%/lvl, cap Lv10, 24h');
for (const [xp, lvl] of [[0, 1], [1999, 1], [2000, 2], [8000, 3], [18000, 4], [200000, 10], [1e9, 10]]) {
  ok(workerLevel(xp) === lvl, `workerLevel(${xp}) == ${lvl}`);
  ok(Math.abs(workerEff(xp) - (0.10 + 0.008 * (lvl - 1))) < 1e-12, `workerEff(${xp}) == 0.10 + 0.008*${lvl - 1}`);
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
  // normal_tree ms=3000 → anchor pacedActionMs(3000)=4800, eff lv1 0.10 → perTick 48s
  const stPer = workerTickMs(3000, 0);
  const st = accrueWorkers({ nowMs: now, workersAccruedToMs: now - 20000, crew: subTick, nodes: GATHER_NODES, items: ITEMS });
  ok(st.accrued === false, `a sub-tick span (20s < ${(stPer / 1000).toFixed(1)}s perTick) produces nothing, watermark deferred`);
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
  // normal_tree ms=3000, lv1 eff 0.10 → perTick = 48s (paced anchor). Settle every 10s.
  const slow = [{ uid: 'wslow', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, acc_ms: 0 }];
  const from = 0, to = 6 * 3600000;      // 6h
  const loop = runLoop(slow, from, to, 10000);   // 10s settles — well under the perTick
  const perTick = workerTickMs(3000, 0), avgQty = 1;
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
  // The bound is ONE truncation per PRODUCING settle, and a settle only produces
  // when it crosses a tick, so the tick count is the ceiling. Derived from the
  // shared model rather than a literal, so it survives the next anchor/eff move.
  const tickCount = to / workerTickMs(5500, 200000);
  ok(oneX - manyX < tickCount, `worker-xp gap ${oneX - manyX} is bounded by the ${Math.round(tickCount)} producing settles (< 1 xp each)`);
}

console.log('W9 — a pure sub-tick settle REFUSES (watermark not advanced, no write)');
{
  const slow = [{ uid: 'w', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, acc_ms: 0 }];
  // 20s span, 48s perTick, no prior carry → 0 ticks → refuse.
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

// ── W11 — THE ANCHOR. The one this suite did not have, and the reason the b389
//    rebalance shipped at 1.60x its stated size for four builds.
//
//    The old guard (smoke-test.js "b389: worker rebalance") asserted
//    `6 * eff <= 1.1` — i.e. it measured the FRACTION and simply assumed the
//    thing it was a fraction of. Both engines were dividing the RAW `node.ms`
//    while the player gathers at `pacedActionMs(node.ms)`, so the real figure
//    was 6 * 0.172 * 1.60 = 1.65 and the guard never saw it.
//
//    So this measures the RATIO ITSELF, and does it through two functions
//    authored in different modules for different consumers:
//      • `actionIntervalMs` — what an ACTIVE, perkless player takes at the node
//        (src/core/pacing.js, the same call the activity pill and the away
//        replay make);
//      • `workerTickMs`     — what one worker takes (src/core/workers.js).
//    A ratio of two independent functions cannot be satisfied by editing one
//    constant, which is exactly the property the old guard lacked.
console.log('W11 — THE ANCHOR: a worker is exactly `eff` of an ACTIVE player at the same node');
{
  const ALL = [...TREES.map((n) => ['woodcutting', n]), ...ROCKS.map((n) => ['mining', n]),
               ...FISH_SPOTS.map((n) => ['fishing', n])];
  ok(ALL.length > 0, `the gather catalogue is non-empty (${ALL.length} nodes measured)`);
  let worst = 0, worstId = null;
  for (const [skill, node] of ALL) {
    // Perkless active player: no `bonus`, no `toolSpeed` — the base paced action.
    const active = actionIntervalMs(skill, node.ms, {});
    for (const xp of [0, 8000, 200000]) {
      const equivalents = active / workerTickMs(node.ms, xp);
      const d = Math.abs(equivalents - workerEff(xp));
      if (d > worst) { worst = d; worstId = `${node.id}@xp${xp}`; }
    }
  }
  ok(worst < 1e-9,
     `every node pays exactly workerEff() of the active rate (worst drift ${worst.toExponential(2)} at ${worstId})`);

  // The DESIGN NUMBER, stated as the ruling states it. b389: "crew of 6 at Lv10
  // = 6 x 0.172 = 1.03 active-equivalents (≈ ONE extra gatherer while you're
  // away)". Measured on a real node, not asserted on the constant.
  const CREW = 6, MAXED = 1e9;
  const node = TREES.find((n) => n.id === 'normal_tree');
  const crewEquivalents = CREW * (actionIntervalMs('woodcutting', node.ms, {}) / workerTickMs(node.ms, MAXED));
  ok(Math.abs(crewEquivalents - 1.032) < 0.005,
     `a Lv10 castle crew of six = ${crewEquivalents.toFixed(3)} active-player-equivalents (b389 ruling: 1.03)`);
  ok(crewEquivalents <= 1.1,
     'the anti-faucet ceiling holds: a full crew is never more than ~1 active gatherer');

  // And the anchor is the PACED interval, named — so a future PACE.actionMs move
  // carries the crew with it instead of silently re-scaling the whole design.
  ok(workerAnchorMs(node.ms) === pacedActionMs(node.ms),
     'workerAnchorMs IS pacedActionMs — the crew rides PACE.actionMs, it does not escape it');
  ok(PACE.actionMs !== 1 && workerAnchorMs(3000) === Math.floor(3000 * PACE.actionMs),
     `the anchor is the paced number (${workerAnchorMs(3000)}ms), not the raw node ms (3000)`);
}

// ── W12 — THE DEPLOY BOUNDARY. The anchor change makes every perTick LONGER
//    while `acc_ms` carries from the old regime are already in the database.
//    A carry is banked TIME, not banked output, so re-pricing it must neither
//    mint a burst nor confiscate it. Both directions are asserted.
console.log('W12 — a carry banked under the OLD faster anchor neither bursts nor is forfeited');
{
  const NODE_MS = 3000, XP = 0;                     // normal_tree, Lv1
  const oldPerTick = NODE_MS / workerEff(XP);       // the pre-b497 formula, verbatim
  const newPerTick = workerTickMs(NODE_MS, XP);
  ok(newPerTick > oldPerTick, `the anchor only lengthens a tick (${oldPerTick}ms → ${newPerTick}ms)`);

  // (a) NO BURST. The largest carry the old engine could ever have written is
  //     just under one OLD tick. Settled over a 1 ms span it must still buy zero
  //     ticks — a banked remainder can never become inventory on its own.
  const maxOldCarry = oldPerTick - 1;
  const burst = accrueWorkers({
    nowMs: 1, workersAccruedToMs: 0,
    crew: [{ uid: 'wcarry', skill: 'woodcutting', target_id: 'normal_tree', xp: XP, acc_ms: maxOldCarry }],
    nodes: GATHER_NODES, items: ITEMS,
  });
  ok(burst.accrued === false,
     `the largest legacy carry (${Math.round(maxOldCarry)}ms) mints nothing across the deploy — no burst`);

  // (b) NOT FORFEITED. The same carry, given the remaining time, produces
  //     exactly one tick earlier than a carry-less worker would — the banked
  //     time is re-priced, not dropped.
  const span = Math.ceil(newPerTick - maxOldCarry);
  const withCarry = accrueWorkers({
    nowMs: span, workersAccruedToMs: 0,
    crew: [{ uid: 'wcarry', skill: 'woodcutting', target_id: 'normal_tree', xp: XP, acc_ms: maxOldCarry }],
    nodes: GATHER_NODES, items: ITEMS,
  });
  const without = accrueWorkers({
    nowMs: span, workersAccruedToMs: 0,
    crew: [{ uid: 'wcarry', skill: 'woodcutting', target_id: 'normal_tree', xp: XP, acc_ms: 0 }],
    nodes: GATHER_NODES, items: ITEMS,
  });
  ok(withCarry.accrued === true && (withCarry.items.normal_log || 0) === 1,
     'the carried time still buys its tick once enough new time joins it — nothing confiscated');
  ok(without.accrued === false, 'the same span with no carry buys nothing — so (b) measured the carry');

  // (c) THE CARRY IT WRITES BACK is in range for hr_apply, which REFUSES
  //     (never clamps) anything outside [0, WORKER_MAX_ACC_MS).
  const back = withCarry.workers.wcarry.acc_ms;
  ok(back >= 0 && back < WORKER_MAX_ACC_MS, `the new carry ${back.toFixed(1)}ms is inside hr_apply's accepted range`);
}

// ── W13 — THE CARRY CEILING, DERIVED FROM THE REAL CATALOGUE.
//    `WORKER_MAX_ACC_MS` (and `c_max_worker_acc` in the SQL) is a blast radius
//    justified by "a legit carry is < the largest perTick". That justification
//    lived in a comment reading `13000/0.10 = 130,000` — stale twice over: the
//    slowest node is 14,000ms today, and the anchor moved. A COMMENT CANNOT
//    NOTICE IT HAS GONE STALE. This walks the catalogue instead, so adding a
//    slower node or moving PACE.actionMs fails HERE rather than as a
//    `bad_worker_carry` rejection in production.
console.log('W13 — the largest carry the real node catalogue can produce fits inside WORKER_MAX_ACC_MS');
{
  const ALL = [...TREES, ...ROCKS, ...FISH_SPOTS];
  const slowest = ALL.reduce((a, b) => (b.ms > a.ms ? b : a));
  const ceiling = workerTickMs(slowest.ms, 0);      // slowest node at the lowest eff
  ok(ceiling < WORKER_MAX_ACC_MS,
     `max achievable carry < one perTick = ${Math.round(ceiling)}ms at '${slowest.id}' (${slowest.ms}ms), `
     + `under the ${WORKER_MAX_ACC_MS}ms refusal ceiling`);
  ok(ceiling * 2 < WORKER_MAX_ACC_MS,
     `and it keeps ${(WORKER_MAX_ACC_MS / ceiling).toFixed(1)}x headroom, so the constant is not on a knife edge`);
}

if (failures) { console.error(`\nworker-accrual: ${failures} FAILED`); process.exit(1); }
console.log('\nworker-accrual: all green');
