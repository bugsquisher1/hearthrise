// ============================================================================
// tests/worker-accrual.mjs — the PURE hired-worker accrual engine, proven in
// Node. Run: node tests/worker-accrual.mjs   /  --selftest  /  --list
//
// REGISTERED IN .github/workflows/smoke.yml. Its header claimed for months that
// run-smoke.mjs invoked it; nothing did, in CI or out, so W1-W13 were thirteen
// assertions nobody collected. Registered + mutation-proven 2026-09-06.
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
import { readFileSync } from 'node:fs';
/* THE SHARED RATE MODEL both engines import (b497), and the PLAYER's own action
   interval. W11 divides one by the other — two independently-authored functions
   — so the ratio is a MEASUREMENT rather than a restatement of either. */
import { workerTickMs, WORKER_BASE_EFF as CORE_BASE_EFF } from '../src/core/workers.js';
import { actionIntervalMs, pacedActionMs, PACE } from '../src/core/pacing.js';

let failures = 0;
/* Under --selftest this file's OWN body still runs (it is a top-level script,
   not a module with an entry point) — but its 100-odd lines of ✓ would drown
   the mutation report, and its verdict is not the one being reported. The
   CHILD runs are the measurement; they are spawned with no flags and print
   normally. Silence the parent's body, and discard its `failures` before the
   selftest block reads anything. */
const WA_SELFTEST = process.argv.includes('--selftest') || process.argv.includes('--list');
const wlog = WA_SELFTEST ? () => {} : (...a) => console.log(...a);
const werr = WA_SELFTEST ? () => {} : (...a) => console.error(...a);
function ok(cond, msg) { if (!cond) { failures++; werr('  ✗ ' + msg); } else wlog('  ✓ ' + msg); }
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

wlog('W1/W3 — the engine re-exports the shared model, and the curve is the ruled one');
/* The engine must not hold its OWN copy of these — it re-exports
   src/core/workers.js. Assert identity with the core module (===, not a value
   match), then assert the VALUES against the b389 ruling independently, so a
   coordinated edit to both sides still has to face the design number. */
ok(WORKER_BASE_EFF === CORE_BASE_EFF, 'the engine re-exports core WORKER_BASE_EFF (value agrees)');
/* …AND THE VALUE CHECK ABOVE IS NOT THE "NO SECOND COPY" PROOF IT CLAIMED TO BE.
   `===` on a NUMBER compares values, so a mirror `const WORKER_BASE_EFF = 0.10`
   in accrual.js passes it byte for byte — which is precisely the state b389
   shipped from ("Mirrors …" in a comment, two definitions, equal on the day and
   drifting on the next edit). Measured by WA6 in --selftest: the value check
   stayed GREEN with the mirror planted.

   So the structural claim is asserted STRUCTURALLY, against the engine's own
   source: every name in the shared rate model must arrive through the import
   from src/core/workers.js, and accrual.js must declare none of them itself. */
{
  const engineSrc = readFileSync(new URL('../supabase/functions/hr-accrue/accrual.js', import.meta.url), 'utf8');
  const SHARED = ['WORKER_BASE_EFF', 'WORKER_EFF_PER_LVL', 'WORKER_MAX_LVL',
                  'WORKER_ACCRUE_CAP_MS', 'WORKER_MAX_ACC_MS',
                  'workerLevel', 'workerEff', 'workerEffE', 'workerAnchorMs'];
  /* `[^}]*` and not `[\s\S]*?`: a lazy any-char run starts at the FIRST `import
     {` in the file and swallows every import before this one, so the first name
     in the real list arrives glued to the previous statement and never matches.
     Caught by this assertion going red on an unmutated tree. */
  const imp = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/\.\.\/\.\.\/src\/core\/workers\.js'/.exec(engineSrc);
  ok(!!imp, 'accrual.js imports the shared rate model from src/core/workers.js');
  const imported = imp ? imp[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [];
  for (const name of SHARED) {
    ok(imported.includes(name), `accrual.js IMPORTS ${name} rather than defining it`);
    // A local declaration of the same name is the mirror, whatever its value.
    const decl = new RegExp(`^\\s*(?:const|let|var|function)\\s+${name}\\b`, 'm');
    ok(!decl.test(engineSrc), `accrual.js declares no second ${name} (a mirror equal today drifts tomorrow)`);
  }
  // And the export list must forward those exact bindings, not aliases of copies.
  const exp = /export\s*\{([\s\S]*?)\};/.exec(engineSrc.slice(engineSrc.indexOf('RE-EXPORTED, NOT REDEFINED')));
  const exported = exp ? exp[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  for (const e of exported) {
    ok(!/\sas\s/.test(e), `the re-export list forwards '${e}' unaliased (an alias can rename a local copy `
      + 'onto the shared name and pass every value check)');
  }
}
eq([WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL, WORKER_ACCRUE_CAP_MS],
   [0.10, 0.008, 10, 24 * 3600000], 'the rate curve is the b389 ruling: 10% at Lv1, +0.8%/lvl, cap Lv10, 24h');
for (const [xp, lvl] of [[0, 1], [1999, 1], [2000, 2], [8000, 3], [18000, 4], [200000, 10], [1e9, 10]]) {
  ok(workerLevel(xp) === lvl, `workerLevel(${xp}) == ${lvl}`);
  ok(Math.abs(workerEff(xp) - (0.10 + 0.008 * (lvl - 1))) < 1e-12, `workerEff(${xp}) == 0.10 + 0.008*${lvl - 1}`);
}

/* EVERY CREW ROW CARRIES A HIRE TIME, because every row in player_workers does
   (`hired_at timestamptz not null default now()`) and since the CREW-BACKLOG fix
   (2026-09-08) the engine pays a worker only for time it has existed. The epoch
   is older than every watermark in this file, so each fixture below keeps the
   exact span — and the exact expectation — it was written against. W14 is the
   test that the floor is real. */
const HIRED = new Date(0).toISOString();

wlog('W1 — determinism: same inputs, byte-identical output');
const crew = [
  { uid: 'w1', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, hired_at: HIRED },
  { uid: 'w2', skill: 'mining', target_id: 'coal_rock', xp: 50000, hired_at: HIRED },
  { uid: 'w3', skill: 'fishing', target_id: 'trout_s', xp: 8000, hired_at: HIRED },
];
const now = 1_000_000_000_000;
const from = now - 12 * 3600000;   // 12h span
const A = accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew, nodes: GATHER_NODES, items: ITEMS });
const B = accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew, nodes: GATHER_NODES, items: ITEMS });
eq(A, B, 'two identical calls are byte-identical');
ok(A.accrued === true, '12h crew settle accrues');

wlog('W2 — away == live: server yield == client accrueWorker over the same span');
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

wlog('W4 — idle / inconsistent / sub-tick workers produce nothing');
{
  const idle = [{ uid: 'x', skill: null, target_id: null, xp: 0, hired_at: HIRED }];
  ok(accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew: idle, nodes: GATHER_NODES, items: ITEMS }).accrued === false,
     'an all-idle crew does not accrue');
  const wrongSkill = [{ uid: 'x', skill: 'mining', target_id: 'normal_tree', xp: 0, hired_at: HIRED }];   // tree under mining
  ok(accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew: wrongSkill, nodes: GATHER_NODES, items: ITEMS }).accrued === false,
     'a skill≠node assignment produces nothing (never mispriced against the wrong node)');
  const badId = [{ uid: 'x', skill: 'woodcutting', target_id: '__proto__', xp: 0, hired_at: HIRED }];
  ok(accrueWorkers({ nowMs: now, workersAccruedToMs: from, crew: badId, nodes: GATHER_NODES, items: ITEMS }).accrued === false,
     'a __proto__ target id resolves to nothing (own-property lookup)');
  const subTick = [{ uid: 'x', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, hired_at: HIRED }];
  // normal_tree ms=3000 → anchor pacedActionMs(3000)=4800, eff lv1 0.10 → perTick 48s
  const stPer = workerTickMs(3000, 0);
  const st = accrueWorkers({ nowMs: now, workersAccruedToMs: now - 20000, crew: subTick, nodes: GATHER_NODES, items: ITEMS });
  ok(st.accrued === false, `a sub-tick span (20s < ${(stPer / 1000).toFixed(1)}s perTick) produces nothing, watermark deferred`);
}

wlog('W5 — the 24h cap bounds one settle; all item deltas are positive');
{
  const huge = accrueWorkers({ nowMs: now, workersAccruedToMs: now - 100 * 3600000, crew, nodes: GATHER_NODES, items: ITEMS });
  const capped = accrueWorkers({ nowMs: now, workersAccruedToMs: now - 24 * 3600000, crew, nodes: GATHER_NODES, items: ITEMS });
  eq(huge.items, capped.items, 'a 100h absence pays exactly the 24h cap');
  ok(huge.summary.capped === true, 'the over-cap settle reports capped');
  for (const id in huge.items) ok(huge.items[id] > 0, `item ${id} delta is positive (a crew never debits)`);
}

wlog('W6 — worker xp is per-uid; player skills untouched');
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

wlog('W7 — a SLOW worker (perTick > settle cadence) eventually produces, never silently zero');
{
  // normal_tree ms=3000, lv1 eff 0.10 → perTick = 48s (paced anchor). Settle every 10s.
  const slow = [{ uid: 'wslow', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, acc_ms: 0, hired_at: HIRED }];
  const from = 0, to = 6 * 3600000;      // 6h
  const loop = runLoop(slow, from, to, 10000);   // 10s settles — well under the perTick
  const perTick = workerTickMs(3000, 0), avgQty = 1;
  const expTicks = Math.floor((to - from) / perTick);
  ok(loop.items.normal_log === expTicks * avgQty,
     `slow worker produced ${loop.items.normal_log}, expected ${expTicks * avgQty} — carry bridges sub-cadence perTicks`);
  ok(loop.items.normal_log > 0, 'a slow worker is NOT silently zero (the shared-watermark break is fixed)');
}

wlog('W8 — away == live byte-identical WITH carry (one big settle == many small)');
{
  // MAXED worker → eff constant (E=172) → exact across settle granularities.
  const maxed = [{ uid: 'wmax', skill: 'mining', target_id: 'coal_rock', xp: 200000, acc_ms: 0, hired_at: HIRED }];
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

wlog('W9 — a pure sub-tick settle REFUSES (watermark not advanced, no write)');
{
  const slow = [{ uid: 'w', skill: 'woodcutting', target_id: 'normal_tree', xp: 0, acc_ms: 0, hired_at: HIRED }];
  // 20s span, 48s perTick, no prior carry → 0 ticks → refuse.
  const r = accrueWorkers({ nowMs: 20000, workersAccruedToMs: 0, crew: slow, nodes: GATHER_NODES, items: ITEMS });
  ok(r.accrued === false && r.reason === 'nothing_accrued', 'sub-tick settle refuses (defers, no watermark move)');
}

wlog('W10 — carry stays in range; a mixed fast+slow crew loses nothing');
{
  const mixed = [
    { uid: 'wfast', skill: 'mining', target_id: 'coal_rock', xp: 200000, acc_ms: 0, hired_at: HIRED },   // fast (maxed)
    { uid: 'wslow', skill: 'woodcutting', target_id: 'duskwood_tree', xp: 0, acc_ms: 0, hired_at: HIRED }, // slow (ms=13000, lv1)
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
wlog('W11 — THE ANCHOR: a worker is exactly `eff` of an ACTIVE player at the same node');
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
wlog('W12 — a carry banked under the OLD faster anchor neither bursts nor is forfeited');
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
    crew: [{ uid: 'wcarry', skill: 'woodcutting', target_id: 'normal_tree', xp: XP, acc_ms: maxOldCarry, hired_at: HIRED }],
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
    crew: [{ uid: 'wcarry', skill: 'woodcutting', target_id: 'normal_tree', xp: XP, acc_ms: maxOldCarry, hired_at: HIRED }],
    nodes: GATHER_NODES, items: ITEMS,
  });
  const without = accrueWorkers({
    nowMs: span, workersAccruedToMs: 0,
    crew: [{ uid: 'wcarry', skill: 'woodcutting', target_id: 'normal_tree', xp: XP, acc_ms: 0, hired_at: HIRED }],
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
wlog('W13 — the largest carry the real node catalogue can produce fits inside WORKER_MAX_ACC_MS');
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

// ============================================================================
// --selftest — THE MUTATION PROOF
//
// This file's header used to claim it was "also invoked by run-smoke.mjs". It
// was not: nothing ran it, in CI or out, so W1-W13 were thirteen assertions
// nobody was collecting. Registering it is only half the repair — a guard that
// has never been red is not a guard, and this one is entirely made of numeric
// agreements between two modules, which is the failure shape that goes quiet
// rather than loud.
//
// So: copy src/ + supabase/ + this file to a scratch dir, plant ONE real
// balance/engine defect, run THIS FILE unmodified there, and require it to
// exit non-zero. Every mutation is a rebalance or refactor somebody could
// plausibly commit — b389 shipped at 1.60x its stated size through exactly this
// gap. Nothing in the working tree is touched.
//
//   node tests/worker-accrual.mjs --selftest
//   node tests/worker-accrual.mjs --list
// ============================================================================
wlog('W14 — the HIRE FLOOR: a worker is never paid for time before it existed');
{
  /* THE MINT THIS CLOSES (live, 2026-09-09 03:06:57Z, QA 0a47ba77 slot 2):
     `workers_accrued_to` is a SHARED watermark that index.ts advances only on a
     settle that PRODUCED, and a character with no crew never produces — so the
     watermark sat at character creation while the calendar ran, and the first
     accrual after the first hire paid a full 24h cap. A worker hired six
     minutes earlier was paid 1,800 copper_ore. The whole live row is
     reconstructed in tests/accrual-engine.mjs CREW-BACKLOG; this is the unit. */
  const t0 = 1_000_000_000_000;
  const stale = t0 - 40 * 3600000;               // no producing settle for 40h
  const HIRED_5M = new Date(t0 - 300000).toISOString();
  const call = (hired_at) => accrueWorkers({
    nowMs: t0, workersAccruedToMs: stale, nodes: GATHER_NODES, items: ITEMS,
    crew: [{ uid: 'w', skill: 'mining', target_id: 'copper_rock', xp: 0, acc_ms: 0, hired_at }],
  });
  const fresh = call(HIRED_5M);
  const perTick = workerTickMs(nodeById('mining', 'copper_rock').ms, 0);
  const owed = Math.floor(300000 / perTick);
  eq(fresh.accrued ? (fresh.items.copper_ore || 0) : 0, owed,
    'a five-minute-old worker is paid five minutes, not the 24h backlog of a watermark '
    + 'that predates it');
  /* AND THE CARRY IS NOT INFLATED EITHER — a mint banked as time is still a
     mint, one settle later. */
  ok(fresh.workers.w.acc_ms < perTick,
    `the new carry (${fresh.workers.w.acc_ms}ms) is under one tick (${perTick}ms)`);

  const veteran = call(new Date(stale - 3600000).toISOString());
  ok(veteran.accrued && veteran.items.copper_ore > owed,
    'a worker older than the watermark still collects its full (capped) backlog — the floor '
    + 'is a hire date, not a second cap');

  const blind = call(undefined);
  ok(blind.accrued === false,
    'a crew row with NO hired_at pays NOTHING. The engine cannot read a column hr_state_of '
    + 'does not project, and here "absent = previous behaviour" IS the mint, so absence must '
    + 'fail closed: 2026-09-12-worker-hired-at-projection.sql is applied BEFORE this engine '
    + 'is deployed, and an under-paying crew is a redeploy where a faucet is a wipe.');
}

const WA_MUTATIONS = [
  { id: 'WA7-hire-floor-removed',
    why: 'THE 2026-09-09 MINT: pay the crew from the SHARED watermark again. It is stale by '
       + 'construction for a character who has never had a crew (index.ts advances it only on a '
       + 'settle that PRODUCED), so the first accrual after the first hire pays a 24h cap — 1,800 '
       + 'copper_ore to a six-minute-old worker on the live QA account, and repeatable by firing '
       + 'the crew and re-hiring a day later',
    file: 'supabase/functions/hr-accrue/accrual.js',
    from: 'const payFromMs = Number.isFinite(hiredAtMs) ? Math.max(fromMs, hiredAtMs) : nowMs;',
    to:   'const payFromMs = fromMs;' },

  { id: 'WA1-crew-rate-drifts-from-the-core-model',
    why: 'THE b389 SHAPE: the efficiency curve is edited in one place and not the other, so the '
       + 'engine and the shared rate model disagree and a crew silently pays the wrong rate',
    file: 'src/core/workers.js',
    from: 'export const WORKER_EFF_PER_LVL = 0.008;',
    to:   'export const WORKER_EFF_PER_LVL = 0.012;' },

  { id: 'WA2-base-efficiency-buffed',
    why: 'a "small" buff to the starting efficiency. The b389 ruling is 10% at Lv1; a crew that '
       + 'pays more than the ruling is an economy faucet nobody voted for',
    file: 'src/core/workers.js',
    from: 'export const WORKER_BASE_EFF = 0.10;',
    to:   'export const WORKER_BASE_EFF = 0.16;' },

  { id: 'WA3-24h-rest-cap-lifted',
    why: 'the "workers rest" cap is raised, so one settle after a long absence pays an unbounded '
       + 'span — the burst W5 exists to bound',
    file: 'src/core/workers.js',
    from: 'export const WORKER_ACCRUE_CAP_MS = 24 * 3600000;',
    to:   'export const WORKER_ACCRUE_CAP_MS = 240 * 3600000;' },

  { id: 'WA4-carry-ceiling-lowered-under-the-real-catalogue',
    why: 'W13: hr_apply REFUSES a carry outside WORKER_MAX_ACC_MS. Lower it under what the real '
       + 'node catalogue can produce and honest carries start being rejected — a silent, '
       + 'intermittent confiscation that no single sample would show',
    file: 'src/core/workers.js',
    from: 'export const WORKER_MAX_ACC_MS = 900000;',
    to:   'export const WORKER_MAX_ACC_MS = 60000;' },

  { id: 'WA5-max-level-raised',
    why: 'the level ceiling moves without the curve being re-ruled, so workerLevel() disagrees '
       + 'with the ladder every other surface prints',
    file: 'src/core/workers.js',
    from: 'export const WORKER_MAX_LVL = 10;',
    to:   'export const WORKER_MAX_LVL = 20;' },

  { id: 'WA6-engine-keeps-its-own-copy-of-the-anchor',
    why: 'THE ONE THIS SUITE WAS WRITTEN FOR: the engine stops re-exporting the shared model and '
       + 'holds a second copy. The two are equal ON THE DAY and drift on the next edit — the '
       + '"Mirrors …" comment that let b389 ship at 1.60x',
    file: 'supabase/functions/hr-accrue/accrual.js',
    /* REDEFINE rather than re-export. The copy is EQUAL to the core value, so
       nothing about today's numbers changes — which is the whole danger, and
       exactly why W1's assertion is an IDENTITY check (===) against the core
       module and not a value comparison. */
    from: 'export {\n  WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL,',
    to:   'const WORKER_BASE_EFF_MIRROR = 0.10;\nexport {\n  WORKER_BASE_EFF_MIRROR as WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL,' },
];

if (process.argv.includes('--list')) {
  for (const m of WA_MUTATIONS) console.log(m.id + '  —  ' + m.why);
  process.exit(0);
}

if (process.argv.includes('--selftest')) {
  const { mkdtempSync, cpSync, rmSync, readFileSync: rf, writeFileSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const pathMod = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const HERE = pathMod.dirname(fileURLToPath(import.meta.url));
  const REPO = pathMod.resolve(HERE, '..');
  const SELF = pathMod.basename(fileURLToPath(import.meta.url));

  console.log('worker-accrual --selftest: each mutation must turn the guard RED\n');
  let bad = 0;

  const runIn = (dir) => spawnSync(process.execPath, [pathMod.join(dir, 'tests', SELF)],
    { encoding: 'utf8', cwd: dir });

  const scratchOf = () => {
    const d = mkdtempSync(pathMod.join(tmpdir(), 'wa-selftest-'));
    cpSync(pathMod.join(REPO, 'src'), pathMod.join(d, 'src'), { recursive: true });
    cpSync(pathMod.join(REPO, 'supabase', 'functions'), pathMod.join(d, 'supabase', 'functions'), { recursive: true });
    cpSync(pathMod.join(REPO, 'tests', SELF), pathMod.join(d, 'tests', SELF));
    return d;
  };

  // THE CLEAN CONTROL. A guard that is red at rest is red for everything, and
  // every "caught" below would be an artefact of the copy rather than a proof.
  {
    const d = scratchOf();
    const r = runIn(d);
    rmSync(d, { recursive: true, force: true });
    if (r.status === 0) {
      console.log('  ok    CLEAN control is GREEN (an unmutated copy of the engine passes)');
    } else {
      bad++;
      console.log('  FAIL  CLEAN control is RED — the mutations below prove nothing');
      console.log('          ' + String(r.stdout + r.stderr).split('\n').filter((l) => /✗|FAILED/.test(l)).slice(0, 4).join('\n          '));
    }
    console.log('        the copy the mutations are planted into must itself be clean');
  }

  for (const m of WA_MUTATIONS) {
    const d = scratchOf();
    const target = pathMod.join(d, ...m.file.split('/'));
    const src = rf(target, 'utf8');
    if (!src.includes(m.from)) {
      bad++;
      rmSync(d, { recursive: true, force: true });
      console.log(`  FAIL  ${m.id} — anchor not found in ${m.file}; the mutation was never planted`);
      console.log(`        ${m.why}`);
      continue;
    }
    writeFileSync(target, src.replace(m.from, m.to));
    const r = runIn(d);
    const out = String(r.stdout || '') + String(r.stderr || '');
    rmSync(d, { recursive: true, force: true });

    if (r.status === 0) {
      bad++;
      console.log(`  FAIL  ${m.id} — NOT CAUGHT: the guard stayed GREEN with the defect planted`);
    } else if (!/FAILED|✗/.test(out)) {
      bad++;
      console.log(`  FAIL  ${m.id} — went red WITHOUT an assertion failing (crash, not a verdict):`);
      console.log('          ' + out.split('\n').slice(-4).join('\n          '));
    } else {
      const first = (out.split('\n').find((l) => l.includes('✗')) || '').trim().slice(0, 110);
      console.log(`  ok    ${m.id} — caught (${first})`);
    }
    console.log(`        ${m.why}`);
  }

  console.log('');
  if (bad) { console.error(`worker-accrual --selftest FAILED — ${bad} unproven`); process.exit(1); }
  console.log(`worker-accrual --selftest PASSED — clean control green, ${WA_MUTATIONS.length}/${WA_MUTATIONS.length} mutations caught.`);
  process.exit(0);
}

if (failures) { console.error(`\nworker-accrual: ${failures} FAILED`); process.exit(1); }
wlog('\nworker-accrual: all green');
