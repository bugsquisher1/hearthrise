#!/usr/bin/env node
// tools/release-preflight.local.mjs — BEFORE A RELEASE IS PUSHED: THE REDS GITHUB WOULD FIND IN ITS FIRST MINUTES, FOUND HERE.
//
//   node tools/release-preflight.local.mjs              on the assembled set/vX.Y.Z, against its merge base with origin/main
//   node tools/release-preflight.local.mjs --base REF   against REF instead
//   node tools/release-preflight.local.mjs --list       the plan, nothing run
//   node tools/release-preflight.local.mjs --budget N   minutes for the whole run (default 10); the pins always finish
//   node tools/release-preflight.local.mjs -j N         N commands at a time (default: tools/preflight.local.mjs's)
//   node tools/release-preflight.local.mjs --selftest   the plan on planted workflows, each planted omission caught
//
// WHY (lane/ci-speed, 2026-11-18). 2026-11-17 cost 15 full release runs, 80-95 min each, mostly re-runs after reds a local
// minute would have found: two mutant anchors another lane's move left stale (alpha-windows AW-67, phone-touch PH-14, found
// by in-page-30 an hour in) and one generated file not regenerated (gen-town-stations --check, in-page-24).
// tools/preflight.local.mjs reads only the client-guards jobs, so a generator's twin check in a browser or database job was
// never run before a push. This is the one command the Coordinator runs on set/vX.Y.Z before pushing release/vX.Y.Z
// (tools/assemble-release.local.mjs says so), in three parts, every command read from smoke.yml so it cannot drift:
//   1. PINS, always all of them, each to its own limit: every `--check` twin in ANY job of smoke.yml (every generator
//      that has one: tools/gen-*.mjs, tools/world-art/*, build-settle-hooks, build-site, ...), and PINNED below (mutant
//      anchors, the CI shape, the version strings, apply-order honesty). About 1-2 min; gen-plan-cache --check alone is ~60 s.
//   2. tools/preflight.local.mjs's plan: every plain client-guards command, the proofs there this diff touches, the EXTRAS.
//   3. TOUCHED: the plain runs smoke.yml makes, in jobs that install no browser, of every guard this diff touches
//      (tools/lib/guard-deps.mjs, the rule guards-for uses), while the budget lasts.
// It prints the nightly's line first (tools/lib/nightly-health.mjs: a red, cancelled or stale nightly turns this release
// into a full sweep on GitHub), then only what is red or NOT JUDGED, then one tally. It is not a gate: GitHub is (CLAUDE.md §3.3).
// Exit: 0 every command judged green · 1 a red · 2 a harness problem · 3 no red, but some commands not judged (GitHub will).
// mutant-anchors: none — the selftest plants into copies of fixture workflow text, never a tree file
import { availableParallelism } from 'node:os';
import { readFileSync, readdirSync } from 'node:fs';
import { join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkflow, flatSteps } from '../tests/run-ci-local.mjs';
import { isMain } from '../tests/_is-main.mjs';
import { PROOF_FLAG, unwrapGate, guardFileOf, guardSources, touchedBy } from './lib/guard-deps.mjs';
import { LONG, ordered, planFor, runAll, theDiff, verdict } from './preflight.local.mjs';
import { nightlyHealth } from './lib/nightly-health.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'smoke.yml');
/* The pins every release run has reddened on (tools/preflight.local.mjs's r-release-gate count), run whatever the diff. Each
   must be a command smoke.yml runs: one that is not is a harness error, so this list cannot rot. */
export const PINNED = ['node tests/mutant-anchors.mjs', 'node tests/ci-shape.mjs', 'bash bump-version.sh --check', 'node tests/apply-order-honesty.mjs'];
const CHECK = /(?:^|\s)--check(?:\s|$)/;
const PIN_LIMIT_S = 240;
const COMMAND_LIMIT_S = 120;

const browserJobs = (jobs) => new Set(jobs.filter((j) => j.steps.some((s) => /playwright-chromium/.test(s.uses || ''))).map((j) => j.name));

/** Every tools/gen-*.mjs with a --check mode, as a command: some are held only by a test that runs them (gen-catalogues). */
export function generatorChecks(root = ROOT) {
  const dir = join(root, 'tools');
  return readdirSync(dir).filter((f) => /^gen-[\w-]+\.mjs$/.test(f)).sort()
    .filter((f) => /['"]--check['"]/.test(readFileSync(join(dir, f), 'utf8'))).map((f) => `node tools/${f} --check`);
}

/** Part 1: every --check twin in any job, the generators' own (extra), then PINNED. Pure. { run: [{cmd, why}], errors } */
export function pinPlan(text, { pinned = PINNED, isCheck = (c) => CHECK.test(c), extra = [] } = {}) {
  const steps = flatSteps(parseWorkflow(text));
  const all = new Set(steps.flatMap((s) => s.run.map(unwrapGate)));
  const errors = pinned.filter((p) => !all.has(p)).map((p) => `PINNED names "${p}", which smoke.yml no longer runs`);
  const seen = new Set();
  const run = [];
  for (const s of steps) for (const c of s.run) {
    const inner = unwrapGate(c);
    if (PROOF_FLAG.test(inner) || !isCheck(inner) || seen.has(inner)) continue;
    seen.add(inner);
    run.push({ cmd: inner, why: `${s.job}: a generated file vs its source` });
  }
  for (const c of extra) if (!seen.has(c)) { seen.add(c); run.push({ cmd: c, why: 'a generator with a --check mode' }); }
  for (const p of pinned) if (all.has(p) && !seen.has(p)) { seen.add(p); run.push({ cmd: p, why: 'pinned' }); }
  return { run, errors };
}

/** Part 3: the plain runs, in jobs with no browser, of the guards in `touched` (a Set of guard files), minus `done`. Pure. */
export function touchedPlan(text, touched, done = new Set()) {
  const jobs = parseWorkflow(text);
  const browser = browserJobs(jobs);
  const run = [];
  const seen = new Set(done);
  for (const s of flatSteps(jobs)) {
    if (browser.has(s.job) || /^Install /.test(s.name || '')) continue;
    for (const c of s.run) {
      const inner = unwrapGate(c);
      const guard = guardFileOf(inner);
      if (!guard || PROOF_FLAG.test(inner) || seen.has(inner) || !touched.has(guard)) continue;
      seen.add(inner);
      run.push({ cmd: inner, why: `${s.job}, touched`, proof: false, guard });
    }
  }
  return run;
}

// ── --selftest ─────────────────────────────────────────────────────────────
const FIXTURE = `name: smoke
jobs:
  in-page-24:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: ./.github/actions/playwright-chromium
      - name: Town stands
        run: |
          node tools/gen-town-stations.mjs --check
          node tools/mutant-gate.mjs node tools/gen-town-stations.mjs --selftest
          node tests/town-stands.mjs
  db-replay-8:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Install node modules (no browser)
        run: npm install --no-audit --no-fund
      - name: Settle budget
        run: |
          node tools/gen-plan-cache.mjs --check
          node tests/settle-budget.mjs
          node tools/mutant-gate.mjs node tests/settle-budget.mjs --mutate
  client-guards:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Pins
        run: |
          node tests/mutant-anchors.mjs
          node tests/ci-shape.mjs
          bash bump-version.sh --check
          node tests/apply-order-honesty.mjs
          node tests/plain-a.mjs
`;

function selftest() {
  const fails = [];
  const ok = (c, m) => { console.log(`  ${c ? 'ok      ' : 'FAILED  '} ${m}`); if (!c) fails.push(m); };
  const checks = (pins, touch) => {
    const p = pins(FIXTURE, { extra: ['node tools/gen-catalogues.mjs --check', 'node tools/gen-plan-cache.mjs --check'] }).run.map((r) => r.cmd);
    const dropped = pins(FIXTURE.replace('          node tests/mutant-anchors.mjs\n', ''), {});
    const t = touch(FIXTURE, new Set(['tests/settle-budget.mjs', 'tests/town-stands.mjs']), new Set(p)).map((r) => r.cmd);
    return [
      [p.includes('node tools/gen-town-stations.mjs --check'), 'a --check in a BROWSER job is a pin (v0.2.137: gen-town-stations, in-page-24)'],
      [p.includes('node tools/gen-plan-cache.mjs --check'), 'a --check in a database job is a pin'],
      [p.includes('node tests/mutant-anchors.mjs'), 'mutant-anchors is a pin (v0.2.137: AW-67, PH-14)'],
      [PINNED.every((x) => p.includes(x)), 'every PINNED command is a pin'],
      [!p.some((c) => PROOF_FLAG.test(c)), 'no proof is a pin'],
      [!p.includes('node tests/plain-a.mjs'), 'a plain guard is not a pin (part 2 runs it)'],
      [new Set(p).size === p.length, 'no pin runs twice'],
      [t.includes('node tests/settle-budget.mjs'), 'a touched guard\'s plain run in a job with no browser is scheduled'],
      [!t.includes('node tests/town-stands.mjs'), 'a touched guard in a browser job is not (it needs Chrome: GitHub runs it)'],
      [!t.some((c) => PROOF_FLAG.test(c)), 'part 3 runs no proof'],
      [!t.includes('node tools/gen-plan-cache.mjs --check'), 'part 3 runs nothing part 1 ran'],
      [p.includes('node tools/gen-catalogues.mjs --check'), 'a generator smoke.yml does not run with --check is a pin (a test holds it there)'],
      [dropped.errors.some((e) => /mutant-anchors/.test(e)), 'a PINNED command smoke.yml dropped is a harness error'],
    ];
  };
  for (const [c, m] of checks((x, o) => pinPlan(x, o), touchedPlan)) ok(c, m);
  const planted = [
    ['the pins read the client-guards jobs only (the 11-17 miss)', (x, o) => { const r = pinPlan(x, o); const cg = new Set(flatSteps(parseWorkflow(x)).filter((s) => /^client-guards/.test(s.job)).flatMap((s) => s.run.map(unwrapGate))); return { ...r, run: r.run.filter((q) => cg.has(q.cmd)) }; }, touchedPlan],
    ['mutant-anchors is not pinned', (x, o) => pinPlan(x, { ...o, pinned: PINNED.filter((p) => !/mutant-anchors/.test(p)) }), touchedPlan],
    ['the generator checks are not pins', (x, o) => pinPlan(x, { ...o, isCheck: () => false }), touchedPlan],
    ['the generators smoke.yml holds through a test are left out', (x, o) => pinPlan(x, { ...o, extra: [] }), touchedPlan],
    ['a dropped PINNED command is silent', (x, o) => { const r = pinPlan(x, o); return { ...r, errors: [] }; }, touchedPlan],
    ['part 3 reads the browser jobs too', (x, o) => pinPlan(x, o), (x, t, d) => [...touchedPlan(x, t, d), ...flatSteps(parseWorkflow(x)).filter((s) => s.job === 'in-page-24').flatMap((s) => s.run).filter((c) => !PROOF_FLAG.test(c) && t.has(guardFileOf(c))).map((cmd) => ({ cmd }))]],
    ['part 3 runs what part 1 ran', (x, o) => pinPlan(x, o), (x, t) => [...touchedPlan(x, t), { cmd: 'node tools/gen-plan-cache.mjs --check' }]],
  ];
  for (const [label, pins, touch] of planted) {
    const missed = checks(pins, touch).every(([c]) => c);
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} mutant: ${label}`);
    if (missed) fails.push(`mutant missed: ${label}`);
  }
  /* The real workflow: the pins exist, and hold the three things GitHub found on 11-17 and every generator twin. */
  const gens = generatorChecks();
  const real = pinPlan(readFileSync(WORKFLOW, 'utf8'), { extra: gens });
  ok(!real.errors.length, `every PINNED command is one smoke.yml runs (${real.errors.join('; ') || 'all of them'})`);
  const names = real.run.map((r) => r.cmd);
  ok(names.includes('node tools/gen-town-stations.mjs --check') && names.includes('node tests/mutant-anchors.mjs'), 'the real pins hold gen-town-stations --check and mutant-anchors');
  ok(gens.length >= 30 && gens.every((g) => names.includes(g)), `the real pins hold every tools/gen-*.mjs with a --check mode (${gens.length}) and ${names.length - gens.length} other pins`);
  console.log(fails.length ? `\nrelease-preflight --selftest: ${fails.length} failed` : `\nrelease-preflight --selftest: the pins are read from every job, the touched runs from every job with no browser; ${planted.length}/${planted.length} mutants caught`);
  return fails.length ? 1 : 0;
}

// ── the CLI ────────────────────────────────────────────────────────────────
async function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const at = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
  const base = at('--base') || 'origin/main';
  const budgetS = (Number(at('--budget')) || 10) * 60;
  const t0 = Date.now();
  const night = nightlyHealth({ root: ROOT });
  console.log(night.loud ? `WARNING ${night.line}` : night.line);
  const text = readFileSync(WORKFLOW, 'utf8');
  const d = theDiff(base);
  const pins = pinPlan(text, { extra: generatorChecks() });
  const { plan } = planFor(text, d);
  const errors = [...pins.errors, ...plan.errors];
  if (errors.length) { for (const e of errors) console.error(`  HARNESS  ${e}`); return 2; }
  const pinned = new Set(pins.run.map((r) => r.cmd));
  const cheap = ordered(plan.run.filter((r) => !pinned.has(r.cmd)));
  const touched = new Set(touchedBy(d.files, guardSources(ROOT)).keys());
  const more = touchedPlan(text, touched, new Set([...pinned, ...cheap.map((r) => r.cmd), ...plan.left.map((l) => l.cmd)]));
  console.log(`release-preflight: ${d.files.length} changed file(s) since ${d.sha.slice(0, 9)} (${base}); ${pins.run.length} pins, ${cheap.length} cheap, ${more.length} touched; budget ${budgetS / 60} min`);
  if (d.dirty) console.log('release-preflight: UNCOMMITTED changes here; GitHub judges the commit, not this tree');
  if (argv.includes('--list')) {
    for (const [part, list] of [['pin', pins.run], ['cheap', cheap], ['touched', more]]) for (const r of list) console.log(`  ${part.padEnd(7)} ${r.cmd}   (${r.why})`);
    return 0;
  }
  const jobs = Number(at('-j')) || Math.min(3, Math.max(1, Math.floor(availableParallelism() / 4)));
  const report = (r) => {
    if (r.notRun || r.status === 0) return;
    if (r.killed) { console.log(`  NOT JUDGED  ${r.cmd}  (over its limit at ${Math.round(r.seconds)} s)`); return; }
    console.log(`\n  RED  ${r.cmd}  (exit ${r.status}, ${Math.round(r.seconds)} s)\n${r.out.trim().split('\n').slice(-10).map((l) => `       ${l.slice(0, 200)}`).join('\n')}`);
  };
  /* 1. every pin, to its own limit, whatever the budget */
  const r1 = await runAll(pins.run, { jobs: jobs + 1, runLimitS: 24 * 3600, limitS: PIN_LIMIT_S, onDone: report });
  /* 2 and 3, inside what is left of the budget; a LONG command keeps its own limit */
  const left = () => Math.max(0, budgetS - (Date.now() - t0) / 1000);
  const longs = cheap.filter((r) => LONG.has(r.cmd)).length;
  const r2 = await runAll(cheap, { jobs: jobs + longs, runLimitS: left(), limitS: COMMAND_LIMIT_S, limits: new Map([...LONG].map(([c, [s]]) => [c, s])), onDone: report });
  const r3 = await runAll(more, { jobs, runLimitS: left(), limitS: COMMAND_LIMIT_S, onDone: report });
  const all = [...r1, ...r2, ...r3];
  const v = verdict(all);
  const notRun = all.filter((r) => r.notRun).length;
  if (notRun) console.log(`  NOT JUDGED  ${notRun} command(s) the budget had no room for (GitHub will judge them)`);
  console.log(`\nrelease-preflight: ${v.green} green, ${v.red.length} red, ${v.unjudged.length} not judged of ${all.length} (${r1.length} pins), ${Math.round((Date.now() - t0) / 1000)} s`);
  if (night.loud) console.log(`WARNING ${night.line}`);
  return v.exit;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`release-preflight: harness error: ${e.message}`); process.exit(2); });
}
