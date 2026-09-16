// ============================================================================
// tests/world-tick-parity.mjs — the WORLD TICK parity guard (step 1, shadow).
//
//   node tests/world-tick-parity.mjs            run the guard
//   node tests/world-tick-parity.mjs --mutate   prove the guard goes RED
//   node tests/world-tick-parity.mjs --verbose  print every measurement
//   node tests/world-tick-parity.mjs --require-parity
//                                               the STEP-2 gate: demand full
//                                               value parity under decomposition
//
// FOUR CLAIMS. Each is a property of the tick service as a CALLER of the engine
// the Edge Function already runs; none of them re-implements a game rule.
//
//  P1 CONSTRUCTION PARITY. The input object `services/world-tick/shadow.js`
//     builds for `computeAccrual` produces a byte-identical result to the input
//     the accrual path builds for the same window. The engine is shared by
//     construction (one import); what is NOT shared is the dozen named fields
//     each caller has to hand it, and a caller that forgot `activeSinceMs` or
//     sent a cadence as `capMs` would be a different game running on the same
//     maths. This is the AWAY-1 rule pointed at the new caller.
//
//  P2 TIME CONSERVATION UNDER DECOMPOSITION. A span settled as N tick-aligned
//     windows simulates exactly as many combat ticks as the same span settled
//     in one call. This is what the alignment rule in contract.js buys.
//
//  P3 THE ALIGNMENT RULE BITES. The same span settled as N *unaligned* 10 s
//     windows simulates FEWER ticks — `carryMs` is a local in `simulateSpan`
//     and is discarded at every call boundary. P3 is P2's mutation proof,
//     always run, so "we align windows" is a measured fact and not a belief.
//
//  P4 THE DECOMPOSITION BLOCKER, PINNED. Value parity (gold, xp, items, kills)
//     under decomposition does NOT hold today and cannot, because
//     `computeAccrual` seeds a fresh PRNG from `inp.seed` on every call: sixty
//     windows replay the same stream prefix sixty times. Measured consequence
//     on the goblin fixture: the rare drops that fire late in a stream never
//     fire at all. P4 asserts the divergence is STILL THERE, so the day someone
//     lands the `rngState` seam this guard goes red and has to be flipped to an
//     equality — it is a tripwire, not an endorsement. `--require-parity` is
//     that flipped assertion, ready for step 2's gate.
//
// NO NETWORK, NO SUPABASE, NO PRODUCTION DATA. The fixtures are a JSON file
// validated against src/data at load.
// ============================================================================

import { loadFixtures, atSpan, CATALOGUES } from '../services/world-tick/fixtures.js';
import { shadowSpan, shadowTick, hydrate } from '../services/world-tick/shadow.js';
import { valueSummary, timeSummary, foldDeltas, planWindows, alignWindow }
  from '../services/world-tick/contract.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';

const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const VERBOSE = ARGS.includes('--verbose');
const REQUIRE_PARITY = ARGS.includes('--require-parity');

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 10 * 60000;                 // ten minutes: 60+ windows at a 10 s cadence
const TO_MS = FROM_MS + SPAN_MS;
const CADENCE_MS = 10000;                   // Tyler, 2026-09-16: 10 s for the beta

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eq = (a, b, msg) => {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      tick:    ${A}\n      accrual: ${B}`);
};
const say = (s) => { if (VERBOSE) console.log(s); };

/* ── THE MUTATIONS ──────────────────────────────────────────────────────────
   Each perturbs the TICK path only, in a way a careless implementation would
   plausibly ship, and each must turn at least one claim red. A guard that has
   never been red is not a guard (CLAUDE.md §4). */
const MUTATIONS = {
  /* The naive implementation: settle exactly the wall-clock cadence and let
     `simulateSpan` throw the sub-tick remainder away. Kills P2. */
  unaligned: { windows: (anchorMs, fromMs, toMs, cadenceMs) => {
    const out = [];
    for (let c = fromMs; c < toMs; c += cadenceMs) {
      const to = Math.min(c + cadenceMs, toMs);
      out.push({ fromMs: c, toMs: to, ms: to - c });
    }
    return out;
  } },
  /* Forgetting that `fight` is an ABSOLUTE checkpoint: every window restarts
     the foe at full HP. Kills P1's chain half and P2 (kills inflate, ticks
     stay). Expressed as an input perturbation so it cannot leak into shadow.js. */
  nofight: { perturb: (inp) => ({ ...inp, fight: {} }) },
  /* Handing the engine the cadence as the accrual cap — the "it is only a
     rename" mistake. Kills P1. */
  capIsCadence: { perturb: (inp) => ({ ...inp, capMs: CADENCE_MS }) },
};
const MUTATION = MUTATE ? (ARGS.find((a) => MUTATIONS[a.replace(/^--/, '')]) || '--unaligned')
  .replace(/^--/, '') : null;

const FIXTURES = loadFixtures();
ok(FIXTURES.length >= 3, `fixture set collapsed to ${FIXTURES.length} characters`);

/* ── The ACCRUAL-ON-RETURN reference call ───────────────────────────────────
   Built here, from the fixture, the way `hr-accrue/index.ts` builds it from
   `hr_state_of` — NOT by asking shadow.js for it. An independent second
   construction is the only kind of parity test worth having (the same rule
   tests/accrual-engine.mjs states for its client column). */
function accrualOnReturn(c, fromMs, toMs) {
  return computeAccrual({
    userId: c.userId,
    slot: c.slot,
    nowMs: toMs,
    accruedToMs: fromMs,
    activeSinceMs: c.activeSinceMs,
    activeKind: c.activeKind,
    activeId: c.activeId,
    capMs: c.capMs,
    seed: c.seed,
    hp: c.hp,
    maxHp: c.maxHp,
    gold: c.gold,
    skills: c.skills,
    inventory: c.inventory,
    equipment: c.equipment,
    fight: c.fight,
    consecFalls: c.consecFalls,
    recoveringUntilMs: c.recoveringUntilMs,
    bestiaryKills: c.bestiaryKills,
    items: CATALOGUES.items,
    monsters: CATALOGUES.monsters,
    autoEatEnabled: c.autoEatEnabled,
    autoEatPct: c.autoEatPct,
    autoEatFood: c.autoEatFood,
    finalWindow: true,
  });
}

const findings = [];

for (const f of FIXTURES) {
  const c = atSpan(f, FROM_MS);
  const N = `[${c.name}]`;

  // ── P1 ────────────────────────────────────────────────────────────────────
  const ref = accrualOnReturn(c, FROM_MS, TO_MS);
  const one = shadowTick(hydrate(c), FROM_MS, TO_MS, CATALOGUES,
    MUTATION ? MUTATIONS[MUTATION] : {});
  ok(ref.accrued === true, `${N} the accrual reference paid nothing (reason: ${ref.reason})`);
  ok(one.accrued === true, `${N} the tick paid nothing (reason: ${one.reason})`);
  if (!ref.accrued || !one.accrued) continue;
  eq(one.delta, ref.delta, `P1 ${N} the tick's proposed delta differs from accrual's for the SAME window`);
  eq(valueSummary(one), valueSummary(ref), `P1 ${N} value summary differs`);

  // ── P2 / P3 ───────────────────────────────────────────────────────────────
  const chain = shadowSpan(c, FROM_MS, TO_MS, CATALOGUES,
    Object.assign({ cadenceMs: CADENCE_MS }, MUTATION ? MUTATIONS[MUTATION] : {}));
  const chainTime = chain.results.reduce((a, r) => {
    const t = timeSummary(r.res);
    return { ticks: a.ticks + t.ticks, recoverMs: a.recoverMs + t.recoverMs, grantMs: a.grantMs + t.grantMs };
  }, { ticks: 0, recoverMs: 0, grantMs: 0 });
  const refTime = timeSummary(ref);

  ok(chain.windows.length >= 50,
    `P2 ${N} the chain collapsed to ${chain.windows.length} windows — a one-window chain proves nothing`);
  eq(chainTime.ticks, refTime.ticks,
    `P2 ${N} tick-aligned decomposition LOST time: ${chainTime.ticks} ticks over ${chain.windows.length} windows vs ${refTime.ticks} in one call`);
  /* The credited ms are NOT equal, and must not be: the aligned chain stops at
     the last whole combat tick, so up to `tickMs - 1` ms of the span is still
     UNSETTLED when the chain ends. That tail is DEFERRED (the next tick's
     window starts where this one ended), never forfeited — which is exactly the
     property that has to be asserted, because a tail that grew past one tick
     would be time quietly disappearing every window. */
  const tailMs = refTime.grantMs - chainTime.grantMs;
  ok(tailMs >= 0 && tailMs < chain.tickMs,
    `P2 ${N} the unsettled tail is ${tailMs}ms, which is not inside [0, ${chain.tickMs}) — aligned decomposition is dropping whole ticks, not deferring a remainder`);
  say(`   P2 ${N} ticks ${chainTime.ticks}==${refTime.ticks}, deferred tail ${tailMs}ms < tickMs ${chain.tickMs}`);

  /* ── P2b CHECKPOINT CONTINUITY ────────────────────────────────────────────
     Window i must be handed window i-1's ABSOLUTE checkpoints. `fight` is the
     one that decides whether a half-killed foe survives the window boundary;
     dropping it restarts the monster at full HP sixty times an hour, which
     reads as "away combat is slower than attended" and is unfindable from a
     receipt. Asserted on the input the engine actually received. */
  for (let i = 1; i < chain.results.length; i++) {
    const prev = chain.results[i - 1];
    const cur = chain.results[i];
    if (!prev.res.accrued) continue;
    for (const key of ['fight', 'consec_falls', 'recovering_until']) {
      const field = { fight: 'fight', consec_falls: 'consecFalls', recovering_until: 'recoveringUntilMs' }[key];
      if (typeof prev.res.delta[key] === 'undefined') continue;
      const expect = key === 'recovering_until'
        ? (prev.res.delta[key] ? Date.parse(prev.res.delta[key]) : 0)
        : prev.res.delta[key];
      eq(cur.input[field], expect,
        `P2b ${N} window ${i} was NOT handed window ${i - 1}'s "${key}" checkpoint`);
      if (problems.length > 24) break;
    }
    if (problems.length > 24) break;
  }

  /* P3 — the alignment rule's own mutation proof, run on every green pass.
     Skipped under --mutate=unaligned, where the unaligned path IS the run. */
  if (MUTATION !== 'unaligned') {
    const naive = shadowSpan(c, FROM_MS, TO_MS, CATALOGUES,
      { cadenceMs: CADENCE_MS, windows: MUTATIONS.unaligned.windows });
    const naiveTicks = naive.results.reduce((a, r) => a + timeSummary(r.res).ticks, 0);
    ok(naiveTicks < refTime.ticks,
      `P3 ${N} UNALIGNED windows simulated ${naiveTicks} ticks, aligned/one-call ${refTime.ticks} — the alignment rule is not biting, so contract.js's RULE 1 is either fixed upstream or no longer load-bearing. Re-read it before deleting.`);
    say(`   P3 ${N} unaligned=${naiveTicks} aligned=${refTime.ticks} (loss ${refTime.ticks - naiveTicks} ticks, ${(100 * (refTime.ticks - naiveTicks) / refTime.ticks).toFixed(1)}%)`);
  }

  // ── P4 ────────────────────────────────────────────────────────────────────
  const folded = foldDeltas(chain.results.filter((r) => r.res.accrued).map((r) => r.res.delta));
  const refD = ref.delta;
  const same = JSON.stringify(pick(folded)) === JSON.stringify(pick(refD));
  const lostIds = Object.keys(refD.items || {}).filter((id) => !(folded.items || {})[id]);

  if (REQUIRE_PARITY) {
    eq(pick(folded), pick(refD), `P4 ${N} --require-parity: decomposed value totals differ`);
  } else {
    ok(!same,
      `P4 ${N} decomposed value totals now MATCH accrual-on-return. That is the outcome step 2 needs — but this assertion is a TRIPWIRE, not a bug: flip it to eq(...) / delete the branch and make --require-parity the default. See the header.`);
  }
  findings.push({
    fixture: c.name, windows: chain.windows.length, tickMs: chain.tickMs,
    gold: { tick: folded.gold || 0, accrual: refD.gold || 0 },
    kills: { tick: sum(folded.xp), accrual: sum(refD.xp) },
    itemsLostByDecomposition: lostIds,
  });
  say(`   P4 ${N} gold tick=${folded.gold || 0} accrual=${refD.gold || 0}; drops never reached by the tick: ${lostIds.join(', ') || '(none)'}`);
}

// ── The alignment primitive, directly ────────────────────────────────────────
{
  const a = alignWindow(1000, 1000, 11000, 2400);
  eq(a, { fromMs: 1000, toMs: 10600, ms: 9600 }, 'alignWindow snapped wrongly');
  const w = planWindows(0, 0, 60000, 10000, 2400);
  ok(w.length > 0 && w.every((x) => x.ms % 2400 === 0), 'planWindows emitted a non-aligned window');
  ok(w[0].fromMs === 0 && w[w.length - 1].toMs <= 60000, 'planWindows ran past the span');
  for (let i = 1; i < w.length; i++) {
    ok(w[i].fromMs === w[i - 1].toMs, `planWindows left a gap at window ${i} — time would be lost`);
  }
  /* The fold law refuses a key it does not know, which is what stops a shadow
     comparison agreeing with a delta hr_apply would 409. */
  let threw = false;
  try { foldDeltas([{ gold: 1 }, { some_new_key: 2 }]); } catch { threw = true; }
  ok(threw, 'foldDeltas accepted an unclassified delta key');
}

function pick(d) {
  return { gold: d.gold || 0, xp: d.xp || {}, items: d.items || {} };
}
function sum(m) { let n = 0; for (const k in (m || {})) n += Number(m[k] || 0); return n; }

// ── Report ───────────────────────────────────────────────────────────────────
if (MUTATE) {
  if (problems.length) {
    console.log(`world-tick-parity --mutate=${MUTATION}: RED as required (${problems.length} problem(s)) — the guard bites.`);
    for (const p of problems.slice(0, 4)) console.log('   ✗ ' + p);
    process.exit(0);
  }
  console.error(`world-tick-parity --mutate=${MUTATION}: the mutation did NOT turn the guard red. The guard is decorative.`);
  process.exit(1);
}

if (problems.length) {
  console.error(`world-tick-parity: ${problems.length} problem(s)`);
  for (const p of problems) console.error('   ✗ ' + p);
  process.exit(1);
}

console.log(`world-tick-parity: green — ${FIXTURES.length} fixtures, ${SPAN_MS / 60000} min span, ${CADENCE_MS / 1000}s cadence`);
console.log('   P1 construction parity   tick delta == accrual delta, byte for byte');
console.log('   P2 time conservation     aligned decomposition loses zero ticks');
console.log('   P3 alignment bites       unaligned decomposition measurably loses ticks');
console.log(REQUIRE_PARITY
  ? '   P4 value parity          decomposed totals == accrual totals'
  : '   P4 BLOCKER pinned        decomposed VALUE totals still diverge (per-call PRNG reseed)');
for (const f of findings) {
  console.log(`      · ${f.fixture}: ${f.windows} windows @ ${f.tickMs}ms; gold ${f.gold.tick} vs ${f.gold.accrual}; drops the tick never reached: ${f.itemsLostByDecomposition.join(', ') || '(none)'}`);
}
