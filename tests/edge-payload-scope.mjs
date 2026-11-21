#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// tests/edge-payload-scope.mjs — WHERE AN UNDEPLOYED EDGE IS A FAILURE, AND WHERE IT IS ONLY SAID
//
//   node tests/edge-payload-scope.mjs             the scope over every ref shape (exit 1 on a wrong verdict)
//   node tests/edge-payload-scope.mjs --selftest  planted scopes must each be caught; the real one must not
//
// mutant-anchors: none — the selftest plants whole scope functions in memory, never a file
//
// tests/run-smoke.mjs's Edge payload guard compares the deployed hr-accrue's payload hash with what this tree packs to,
// and a mismatch has always failed the run: an edit to src/core or src/data that was never deployed means the server and
// the client disagree about a night's worth (the 2026-08-15 incident). THE BIG RELEASE (Tyler, CLAUDE.md §3.3b, set/v0.2.144):
// production is frozen on the last release while every lane merges into the set, which GitHub judges through `next`, and
// the edge is deployed only AT the release. On `next` the deployed engine is the last release's by design, so the guard
// can never match there, and a red that cannot clear hides every other red behind it. So on `next` the mismatch is
// REPORTED (printed, the run continues); on release/** and main, where the deploy must already have happened, and on every
// other ref (a lane, a local run) it still FAILS. Packability (pack-edge's own problems) fails everywhere.
// ═════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

/** True when a deployed-payload mismatch is only reported on this run: GitHub Actions on exactly `next`. Pure. */
export function payloadMismatchIsReport(env = process.env) {
  return env.GITHUB_ACTIONS === 'true' && env.GITHUB_REF_NAME === 'next';
}

/* Every ref shape the guard meets, and whether a mismatch FAILS there. */
const CASES = [
  ['a release push', { GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'release/v0.2.144' }, true],
  ['main', { GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'main' }, true],
  ['next (the big release\'s staging)', { GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'next' }, false],
  ['a lane branch', { GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'lane/c-next-reds' }, true],
  ['a set branch', { GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'set/v0.2.144' }, true],
  ['a branch that only starts with next', { GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'next-hotfix' }, true],
  ['a release named next', { GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'release/next' }, true],
  ['a local run that says next', { GITHUB_REF_NAME: 'next' }, true],
  ['a local run', {}, true],
];

/** The cases a scope gets wrong: [label] of each where `report(env)` disagrees with the table. */
export function wrongVerdicts(report = payloadMismatchIsReport) {
  return CASES.filter(([, env, fails]) => report(env) === fails).map(([label, , fails]) => `${label}: a mismatch ${fails ? 'must fail' : 'is only reported'} here`);
}

/* THE WIRING: run-smoke's guard asks this scope, of the run's own env, only on a mismatch, and nothing else there skips the
   failure. Read as text (the guard reaches the network): the one call, bare, inside the mismatch test. */
const RUN_SMOKE = join(dirname(fileURLToPath(import.meta.url)), 'run-smoke.mjs');
const WIRED = 'if (body?.payload_sha256 !== hash && payloadMismatchIsReport()) {';
/** What is wrong with run-smoke's wiring of the scope (text), [] when sound. */
export function wiringProblems(src = readFileSync(RUN_SMOKE, 'utf8')) {
  const out = [];
  if (!/import \{ payloadMismatchIsReport \} from '\.\/edge-payload-scope\.mjs';/.test(src)) out.push('run-smoke does not import the scope from tests/edge-payload-scope.mjs');
  const calls = src.split('payloadMismatchIsReport(').length - 1;
  if (calls !== 1 || src.split(WIRED).length - 1 !== 1) out.push(`run-smoke asks the scope ${calls} time(s), not once, bare, inside the mismatch test (${WIRED})`);
  if (!/if \(body\?\.payload_sha256 !== hash\) \{\s*problems\.push\(/.test(src)) out.push('run-smoke no longer fails a mismatch the scope does not report');
  return out;
}

function selftest() {
  let bad = 0;
  const expect = (ok, label) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
  expect(wrongVerdicts().length === 0, `the real scope: a mismatch fails on release/**, main and everywhere else, and is reported only on next (${CASES.length} refs)`);
  const MUTANTS = [
    ['reported everywhere (the guard switched off)', () => true],
    ['failing everywhere (the old guard: next can never clear)', () => false],
    ['next matched as a prefix', (env) => env.GITHUB_ACTIONS === 'true' && /^next/.test(env.GITHUB_REF_NAME || '')],
    ['next matched anywhere in the ref', (env) => env.GITHUB_ACTIONS === 'true' && /next/.test(env.GITHUB_REF_NAME || '')],
    ['every non-release ref reported (main slips)', (env) => env.GITHUB_ACTIONS === 'true' && !/^release\//.test(env.GITHUB_REF_NAME || '')],
    ['a local run that names next is reported', (env) => env.GITHUB_REF_NAME === 'next'],
  ];
  for (const [label, scope] of MUTANTS) expect(wrongVerdicts(scope).length > 0, `caught: ${label}`);
  /* the wiring, on run-smoke's real text and planted copies of it */
  const src = readFileSync(RUN_SMOKE, 'utf8');
  expect(wiringProblems(src).length === 0, 'run-smoke asks the scope once, bare, inside the mismatch test, and fails the rest');
  const WIRING = [
    ['a forged env handed to the scope (release reads as next)', src.replace('payloadMismatchIsReport())', "payloadMismatchIsReport({ GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'next' }))")],
    ['the report taken without the mismatch test', src.replace(WIRED, 'if (payloadMismatchIsReport()) {')],
    ['the failing branch gone (every mismatch passes)', src.replace(/if \(body\?\.payload_sha256 !== hash\) \{\s*problems\.push\(/, 'if (false) {\n      problems.push(')],
    ['the scope not imported', src.replace("import { payloadMismatchIsReport } from './edge-payload-scope.mjs';", 'const payloadMismatchIsReport = () => true;')],
  ];
  for (const [label, planted] of WIRING) expect(planted !== src && wiringProblems(planted).length > 0, `caught: ${label}`);
  const n = MUTANTS.length + WIRING.length;
  console.log(bad ? `edge-payload-scope --selftest: ${bad} failed` : `edge-payload-scope --selftest: ${n} planted defects caught, the real scope and wiring clean`);
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const wrong = [...wrongVerdicts(), ...wiringProblems()];
  for (const w of wrong) console.log(`  ✗ ${w}`);
  console.log(wrong.length ? `edge-payload-scope: ${wrong.length} wrong verdict(s)` : `edge-payload-scope: a deployed-payload mismatch fails on release/** and main, is reported on next (${CASES.length} refs)`);
  process.exit(wrong.length ? 1 : 0);
}
