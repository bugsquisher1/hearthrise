#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/mutation-proof.mjs — THE SHARED MUTATION DRIVER (baseline first,
//                            a throw is a HARNESS error, not a catch)
//
//   import { runMutationProof } from './mutation-proof.mjs';   // in a guard
//   node tests/mutation-proof.mjs --selftest                   // prove the driver
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
// A security review of tests/dungeon-cooldown.mjs on 2026-09-12 planted
// `where kind = NOSUCHCOLUMN_XYZ` in the GUARD'S OWN SQL — a defect that makes
// the guard incapable of measuring anything — and the --selftest printed
//
//     All 6 mutations caught. The guard is non-vacuous.      exit 0
//
// while the plain run of the same file was red. Executed, confirmed, and then
// found in four more drivers by census (see the table in this lane's report).
// Two independent mistakes produce it, and every copy of the bespoke driver
// shape in tests/ had both:
//
//   1. NO CLEAN BASELINE. The driver only ever runs MUTATED arms. If the guard
//      is broken at rest, nothing notices — there is no arm whose expected
//      colour is green.
//   2. A THROW IS SCORED AS "CAUGHT". `catch (e) { threw = true; /* RED */ }`
//      reads "the guard went red" out of "something exploded". But a throw is
//      also what a mis-anchored patch, a broken chain replay, an OOM-killed
//      PGlite, a typo in the guard's own query and a syntax error in the guard
//      itself all produce. Every one of those is then a green tick under a step
//      named "mutation proof" — the two failures COMPOUND: defect 1 lets the
//      guard break, defect 2 relabels the breakage as proof.
//
// ── THE CONTRACT THIS DRIVER ENFORCES ───────────────────────────────────
//   BASELINE FIRST   The unmutated arm runs before any mutation and must be
//                    GREEN (no throw, zero assertion failures). Otherwise
//                    exit 2 — HARNESS — and no mutation is scored at all,
//                    because a mutation planted into a red tree proves nothing.
//   WIRED ACCESSORS  reset() must actually zero failures(). A driver whose
//                    counter accessors point at different things reports every
//                    arm as red once one arm fails. Checked, not assumed.
//   A THROW IS NOT A CATCH   An arm that throws is exit 2 (HARNESS) unless the
//                    case DECLARES `refuses: true` — the legitimate "this
//                    mutation makes the migration refuse to install, and that
//                    refusal IS the tick" expectation some chain guards have.
//                    `e.harness === true` (tests/pglite-chain.mjs sets it for a
//                    patch anchor that matched != 1 time) is ALWAYS exit 2,
//                    even on a `refuses` case: a patch that never landed cannot
//                    be what the database refused.
//   RED MEANS RED    A mutated arm counts as CAUGHT only when the guard's own
//                    assertions failed (failures() > 0).
//
// Exit codes: 0 proven · 1 a mutation was NOT caught · 2 the harness itself is
// not in a state where any verdict can be read. 2 is deliberately distinct: a 1
// means "the guard is blind to this defect", a 2 means "do not believe this
// run at all".
// ════════════════════════════════════════════════════════════════════════

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const PROVEN = 0;
export const UNPROVEN = 1;
export const HARNESS = 2;

/**
 * Drive a mutation proof. Returns an exit code; prints nothing beyond the lines
 * it is given a `log`/`err` for, and never calls process.exit — so its own
 * --selftest can score it with injected arms.
 *
 * @param {object}   o
 * @param {string}   o.label      guard name, for the log
 * @param {Array<{id:string, why?:string, refuses?:boolean}>} o.cases
 * @param {() => Promise<void>|void} o.baseline  run every assertion, unmutated
 * @param {(id:string) => Promise<void>|void} o.arm  run every assertion, mutated
 * @param {() => number} o.failures  the guard's assertion-failure counter
 * @param {() => void}   o.reset     zero that counter
 * @param {(s:string)=>void} [o.log]
 * @param {(s:string)=>void} [o.err]
 */
export async function mutationProof({
  label, cases, baseline, arm, failures, reset,
  log = console.log, err = console.error,
}) {
  if (typeof baseline !== 'function' || typeof arm !== 'function'
      || typeof failures !== 'function' || typeof reset !== 'function') {
    err(`${label}: HARNESS — mutationProof needs baseline/arm/failures/reset functions.`);
    return HARNESS;
  }
  if (!Array.isArray(cases) || cases.length === 0) {
    err(`${label}: HARNESS — a mutation proof with no mutations in it. An empty catalogue `
      + 'passes every rule and proves nothing; that is the vacuous proof with extra steps.');
    return HARNESS;
  }

  log(`${label} --selftest: the CLEAN baseline must be green, then every mutation must turn the guard RED`);

  // ── THE FLOOR: the unmutated arm ───────────────────────────────────────
  reset();
  if (failures() !== 0) {
    err(`${label}: HARNESS — reset() did not zero failures() (read ${failures()}). The two accessors are `
      + 'not wired to the same counter, so every arm after the first failure would read as RED and be '
      + 'scored CAUGHT.');
    return HARNESS;
  }
  try {
    await baseline();
  } catch (e) {
    err(`${label}: HARNESS — the CLEAN baseline THREW: ${firstLine(e)}`);
    err('  Nothing below this line would have meant anything: a driver that reads a throw as "the guard '
      + 'went red" scores EVERY mutation as caught when the guard itself is broken (dungeon-cooldown, '
      + '2026-09-12: a bad column name in the guard\'s own SQL printed "All 6 mutations caught").');
    return HARNESS;
  }
  if (failures() !== 0) {
    err(`${label}: HARNESS — the CLEAN baseline is already RED (${failures()} assertion failure(s)). `
      + 'Fix the guard or the tree first; a mutation planted into a red tree cannot be shown to have '
      + 'caused anything.');
    return HARNESS;
  }
  log(`  ok    CLEAN baseline GREEN — the tree the mutations are planted into is healthy`);

  // ── THE MUTATIONS ──────────────────────────────────────────────────────
  const missed = [];
  const refusals = [];   // arms the MIGRATION refused (its own §4 self-check)
  const asserted = [];   // arms THIS guard's assertions caught
  for (const c of cases) {
    reset();
    let threw = null;
    try {
      await arm(c.id);
    } catch (e) {
      threw = e;
    }

    if (threw && threw.harness === true) {
      err(`  HARNESS  ${c.id} — ${firstLine(threw)}`);
      err('  The mutation never landed (patch anchor moved, or the chain would not replay), so this arm '
        + 'measured nothing. Fix the anchor; do not let a no-op mutation be scored.');
      return HARNESS;
    }
    if (threw && c.refuses === true && c.refusesIn) {
      /* A DECLARED refusal must be the MUTATED file refusing, not any old
         explosion. tests/schema-replay.mjs marks a chain failure with
         e.replay = true and e.failures = [{file, error}], so the claim "the
         migration refuses to install this defect" is checkable — and a refusal
         that starts coming from an unrelated migration (a neighbour broke, the
         anchor drifted onto another file) must not keep reading as proof. */
      const files = Array.isArray(threw.failures) ? threw.failures.map((f) => String(f && f.file || '')) : [];
      if (threw.replay !== true || !files.some((f) => f.includes(c.refusesIn))) {
        err(`  HARNESS  ${c.id} — declared \`refusesIn: ${c.refusesIn}\`, but the throw did not come from `
          + `that file's apply${files.length ? ` (failed: ${files.join(', ')})` : ''}: ${firstLine(threw)}`);
        return HARNESS;
      }
    }
    if (threw && c.refuses !== true) {
      err(`  HARNESS  ${c.id} — the arm THREW: ${firstLine(threw)}`);
      err('  A throw is not this guard\'s tick. It is what a broken guard, a broken replay and a broken '
        + 'mutation all produce indistinguishably. Either the guard\'s assertions must catch this defect '
        + '(fix them), or the case must DECLARE `refuses: true` because the migration is supposed to '
        + 'refuse to install it.');
      return HARNESS;
    }
    if (threw) {                     // declared refusal — the refusal IS the tick
      refusals.push(c.id);
      log(`  ok    ${c.id} — CAUGHT by a DECLARED REFUSAL (${firstLine(threw)})`);
      continue;
    }
    if (failures() > 0) {
      asserted.push(c.id);
      log(`  ok    ${c.id} — CAUGHT (${failures()} assertion(s) failed)${c.why ? ` — ${c.why}` : ''}`);
      continue;
    }
    if (c.refuses === true) {
      err(`  FAIL  ${c.id} — declared \`refuses: true\` but the migration installed it happily and every `
        + 'assertion still passed. The declaration is now a hole in the proof.');
      missed.push(c.id);
      continue;
    }
    err(`  FAIL  ${c.id} — STAYED GREEN, the guard is blind to it${c.why ? `: ${c.why}` : ''}`);
    missed.push(c.id);
  }
  reset();

  if (missed.length) {
    err(`\n${label} --selftest FAILED — ${missed.length}/${cases.length} mutation(s) not caught: ${missed.join(', ')}`);
    return UNPROVEN;
  }
  log(`\n${label} --selftest PASSED — clean baseline green, ${cases.length}/${cases.length} mutations caught `
    + `(${asserted.length} by this guard's assertions, ${refusals.length} by a declared refusal).`);
  if (refusals.length && !asserted.length) {
    /* Not a failure, but it must never be read as one: every arm was the
       MIGRATION's own self-check refusing to install the defect. The guard's
       assertions were not shown to bite at all. state-of-farm-projection.mjs's
       GATE_BLIND pattern (short-circuit the migration's self-check so the defect
       INSTALLS) is how that gets proven. */
    log(`  NOTE: every arm was a declared refusal — the MIGRATION's self-check did the catching, not `
      + `${label}'s assertions. Add gate-blind arms (see tests/state-of-farm-projection.mjs GATE_BLIND) to `
      + 'prove this guard\'s own tick.');
  }
  return PROVEN;
}

/** The same thing, for a guard that just wants to hand over its process. */
export async function runMutationProof(opts) {
  process.exit(await mutationProof(opts));
}

function firstLine(e) {
  return String((e && e.message) || e).split('\n')[0].slice(0, 200);
}

// ════════════════════════════════════════════════════════════════════════
// --selftest — the driver's own proof, with injected arms.
//
// Each scenario is a shape a real driver in this tree has been in, and the
// required exit code. HP3 is the one the whole file exists for.
// ════════════════════════════════════════════════════════════════════════
// ENTRY-POINT GATE, and it is load-bearing. Measured while writing this file: the
// first draft ran its --selftest on IMPORT, so `node tests/dungeon-marketability.mjs
// --selftest` printed THIS file's 10 green scenarios and exited 0 without ever
// running the guard's own mutations — a shared driver that hijacks its callers'
// proofs is the vacuous proof with a new face. Only run as the program.
const argv = process.argv.slice(2);
const IS_MAIN = (() => {
  try { return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || ''); }
  catch { return false; }
})();

if (IS_MAIN && argv.includes('--selftest')) {
  const quiet = () => {};
  let failed = 0;
  const acc = { failures: () => failed, reset: () => { failed = 0; } };
  const two = [{ id: 'm1', why: 'a' }, { id: 'm2', why: 'b' }];

  const SCENARIOS = [
    {
      id: 'HP1-clean-baseline-throws',
      why: 'THE MEASURED DEFECT (dungeon-cooldown, 2026-09-12): a planted bad column in the guard\'s own '
         + 'SQL makes every arm throw. A driver without a baseline printed "all caught", exit 0',
      want: HARNESS,
      run: () => mutationProof({ label: 't', cases: two, ...acc, log: quiet, err: quiet,
        baseline: () => { throw new Error('relation "nosuchcolumn_xyz" does not exist'); },
        arm: () => { throw new Error('relation "nosuchcolumn_xyz" does not exist'); } }),
    },
    {
      id: 'HP2-clean-baseline-red',
      why: 'the guard is red at rest (a real assertion fails on the unmutated tree). Every mutation then '
         + '"goes red" for free',
      want: HARNESS,
      run: () => mutationProof({ label: 't', cases: two, ...acc, log: quiet, err: quiet,
        baseline: () => { failed = 1; }, arm: () => { failed = 1; } }),
    },
    {
      id: 'HP3-an-arm-throws-undeclared',
      why: 'THE CLASS: a mutated arm explodes for a reason nobody declared — mis-anchored patch, OOM, a '
         + 'typo in the guard\'s query. The old shape scored it CAUGHT; it must be HARNESS',
      want: HARNESS,
      run: () => mutationProof({ label: 't', cases: two, ...acc, log: quiet, err: quiet,
        baseline: () => {}, arm: (id) => { if (id === 'm2') throw new Error('boom'); failed = 1; } }),
    },
    {
      id: 'HP4-a-declared-refusal-is-a-catch',
      why: 'some chain guards legitimately expect the MIGRATION to refuse to install the mutation — that '
         + 'refusal is the tick. It stays a catch, but only when declared in the catalogue',
      want: PROVEN,
      run: () => mutationProof({ label: 't', cases: [{ id: 'm1', refuses: true }, { id: 'm2' }],
        ...acc, log: quiet, err: quiet,
        baseline: () => {}, arm: (id) => { if (id === 'm1') throw new Error('check constraint violated'); failed = 1; } }),
    },
    {
      id: 'HP5-harness-error-beats-a-declared-refusal',
      why: 'e.harness (pglite-chain: "patch anchor matched 0 times") means the mutation NEVER LANDED. A '
         + 'declaration cannot make a no-op into a refusal',
      want: HARNESS,
      run: () => mutationProof({ label: 't', cases: [{ id: 'm1', refuses: true }], ...acc, log: quiet, err: quiet,
        baseline: () => {},
        arm: () => { const e = new Error('patch anchor matched 0 times'); e.harness = true; throw e; } }),
    },
    {
      id: 'HP6-a-blind-guard-is-exit-1',
      why: 'the ordinary failure this whole mechanism is for: the guard does not see the defect. That is a '
         + 'RED guard (1), not a broken harness (2)',
      want: UNPROVEN,
      run: () => mutationProof({ label: 't', cases: two, ...acc, log: quiet, err: quiet,
        baseline: () => {}, arm: (id) => { if (id === 'm1') failed = 1; } }),
    },
    {
      id: 'HP7-a-declared-refusal-that-installs-fine',
      why: 'a `refuses: true` case that stops refusing (the gate was removed) must not pass silently — the '
         + 'declaration would otherwise become a permanent hole',
      want: UNPROVEN,
      run: () => mutationProof({ label: 't', cases: [{ id: 'm1', refuses: true }], ...acc, log: quiet, err: quiet,
        baseline: () => {}, arm: () => {} }),
    },
    {
      id: 'HP8-all-arms-red-is-proven',
      why: 'the positive control: a healthy guard with a healthy catalogue must still exit 0, or the rule '
         + 'is just a way to fail',
      want: PROVEN,
      run: () => mutationProof({ label: 't', cases: two, ...acc, log: quiet, err: quiet,
        baseline: () => {}, arm: () => { failed = 1; } }),
    },
    {
      id: 'HP11-refusesIn-is-satisfied-by-the-mutated-file',
      why: 'the strong form of a declared refusal: the chain failure must NAME the file the mutation was '
         + 'planted in (schema-replay sets e.replay + e.failures)',
      want: PROVEN,
      run: () => mutationProof({ label: 't', cases: [{ id: 'm1', refuses: true, refusesIn: 'x.sql' }],
        ...acc, log: quiet, err: quiet,
        baseline: () => {},
        arm: () => { const e = new Error('THE REPO CANNOT REBUILD THE DATABASE.'); e.replay = true;
          e.failures = [{ file: '2026-01-01-x.sql', error: 'assert failed' }]; throw e; } }),
    },
    {
      id: 'HP12-refusesIn-when-a-DIFFERENT-file-refused',
      why: 'a refusal that drifts onto a neighbouring migration still throws, and a driver that reads any '
         + 'throw as the declared refusal would keep printing proof while measuring a broken chain',
      want: HARNESS,
      run: () => mutationProof({ label: 't', cases: [{ id: 'm1', refuses: true, refusesIn: 'x.sql' }],
        ...acc, log: quiet, err: quiet,
        baseline: () => {},
        arm: () => { const e = new Error('THE REPO CANNOT REBUILD THE DATABASE.'); e.replay = true;
          e.failures = [{ file: '2026-01-01-somethingelse.sql', error: 'syntax error' }]; throw e; } }),
    },
    {
      id: 'HP9-empty-catalogue',
      why: 'a proof with no mutations in it satisfies every rule and measures nothing',
      want: HARNESS,
      run: () => mutationProof({ label: 't', cases: [], ...acc, log: quiet, err: quiet,
        baseline: () => {}, arm: () => {} }),
    },
    {
      id: 'HP10-reset-not-wired-to-failures',
      why: 'a driver whose reset() and failures() read different counters reports every arm after the '
         + 'first failure as RED — a proof that cannot fail',
      want: HARNESS,
      run: () => mutationProof({ label: 't', cases: two, failures: () => 3, reset: () => {},
        log: quiet, err: quiet, baseline: () => {}, arm: () => {} }),
    },
  ];

  console.log('mutation-proof --selftest: the driver must return the right verdict for each shape\n');
  let bad = 0;
  for (const s of SCENARIOS) {
    failed = 0;
    let got;
    try { got = await s.run(); } catch (e) { got = `threw: ${e.message}`; }
    const okk = got === s.want;
    if (!okk) bad++;
    console.log(`  ${okk ? 'ok  ' : 'FAIL'}  ${s.id} — wanted exit ${s.want}, got ${got}`);
    console.log(`        ${s.why}`);
  }
  console.log('');
  if (bad) { console.error(`mutation-proof --selftest FAILED — ${bad}/${SCENARIOS.length} scenario(s) misgraded`); process.exit(1); }
  console.log(`mutation-proof --selftest PASSED — ${SCENARIOS.length}/${SCENARIOS.length} shapes graded correctly `
    + '(baseline enforced, undeclared throw = HARNESS, declared refusal still a catch).');
  process.exit(0);
}
