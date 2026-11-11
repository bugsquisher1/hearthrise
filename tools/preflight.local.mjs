#!/usr/bin/env node
// tools/preflight.local.mjs — THE CHEAP REDS, BEFORE A RELEASE SPENDS AN HOUR FINDING THEM.
//
//   node tools/preflight.local.mjs              the assembled set, against the merge base with origin/main
//   node tools/preflight.local.mjs --base REF   against REF instead
//   node tools/preflight.local.mjs --list       the plan, nothing run
//   node tools/preflight.local.mjs -j N         N at a time (default 3: other lanes share this machine)
//   node tools/preflight.local.mjs --times      also the 25 slowest commands
//   node tools/preflight.local.mjs --proofs     instead: the proofs this diff touches in every job with no browser, narrowed
//                                               as GitHub narrows them, one at a time (10-20 min, no Chrome)
//   node tools/preflight.local.mjs --proofs --pages   the same with the page guards' proofs (one Chrome, a minute a mutant)
//   node tools/preflight.local.mjs --proofs --plant   in a LANE's own worktree: the proofs that plant into the tree too (guard-anchors'
//                                               solo); refuses a dirty tree, checks it after. (party-flow and hunt-live plant into
//                                               copies: since 11-10 plain --proofs runs them.)
//   node tools/preflight.local.mjs --selftest   the plan and the verdict, each proved by a planted mutant
//
// WHY (lane r-release-gate, 2026-11-04). Of the 79 causes behind the last 30 red release runs, 24 were a forgotten pin or
// chore (module-preload --write x4, the comment ratchet x4, a census pin, a file over its line cap, a spelling, a stale anchor)
// and 39 a proof an intended change left behind. Each cost a run of about an hour, and restore-census failed four minutes
// into v0.2.86's while 43 other jobs ran on. This runs the first kind on the Coordinator's machine in under three minutes,
// before the push, and says what to do; --proofs runs the second kind, where no browser is needed. It is not a gate:
// GitHub is (CLAUDE.md §3.3).
//
// WHAT RUNS IS READ FROM smoke.yml, the way tests/run-ci-local.mjs does, so it cannot drift:
//   every plain command of the client-guards jobs                  (the always-run half of a release's own run)
//   the proofs of those jobs that this diff touches                (tools/mutant-gate.mjs's own selection)
//   EXTRAS, from the jobs a chain replay needs, when their files moved
// SLOW names what stays on GitHub, each with its measured seconds and why. A name that is no longer in smoke.yml is
// a harness error, so the list cannot rot. A proof that plants into the tree (guard-anchors' solo) never runs here:
// this machine is where the lanes work. Anything past a command's limit is said out loud as NOT JUDGED, never green.
//
// --proofs (a set that moved a body, an engine or a catalogue): 30 of the 39 left-behind proofs needed no browser; --pages reaches the
// other 9, now that a page draws the same font here as on GitHub (tests/_test-fonts.mjs). Slow, so not the default.
//
// A FIRST PUSH OVER 300 CHANGED FILES (v0.2.93, 428): GitHub started no run at all, and paths-ignore is the likely cause (its filter reads 300 files). One more small commit starts it.
// Exit: 0 every command judged green · 1 a red · 2 a harness problem · 3 no red, but some commands not judged (GitHub will).
// mutant-anchors: none — the proof plants into copies of the workflow text and a scratch runner, never a tree file
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkflow, flatSteps, SKIP } from '../tests/run-ci-local.mjs';
import { isMain } from '../tests/_is-main.mjs';
import { PROOF_FLAG, unwrapGate, guardFileOf, committedDiff } from './lib/guard-deps.mjs';
import { selectGuards } from './mutant-gate.mjs';
import { catalogue, committedTexts } from './guard-anchors.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'smoke.yml');
const CHEAP_JOB = /^client-guards(-\d+)?$/;
/* Per command, and for the whole run: past these a command is NOT JUDGED, and the exit code says so. */
const COMMAND_LIMIT_S = 120;
const RUN_LIMIT_S = 180;

/* The client-guards commands that stay on GitHub: inner command -> seconds measured there, why. */
export const SLOW = new Map([
  ['node tests/hunt-scene-live.mjs --node', '314-429 s (41600804145, 41697486160), one engine run per case; red once in the last 30 runs'],
  ['node tests/hunt-scene-live.mjs --mutate', 'minutes per mutant over the same cases'],
  ['node tests/world-town-home.mjs --selftest', '531 s (41697486160)'],
  ['node tests/selfcheck-no-global-dml.mjs --selftest', '126-288 s; its plain run is the one that reads the chain'],
  ['node tools/board-from-git.mjs --selftest', '81 s (41697486160), reads git history; a docs tool'],
  ['node tests/names-selfcheck-collision.mjs', '106 s here (one replay per name); no red in the last 30 runs'],
  ['node tests/plot-tier-parity.mjs', '48-88 s (one replay); no red in the last 30 runs'],
  /* Ran nowhere here until 11-10 (its `mutant-writes-tree: no` was read as yes); --proofs runs it, one at a time. */
  ['node tests/session-core.mjs --mutate', '172 s here alone (lane a-ci-first-run, 11-10), over the 120 s limit; --proofs runs it'],
]);

/* Reddened a release on GitHub, and slower here than COMMAND_LIMIT_S, so a run never judged it (lane r-green-first,
   2026-11-07): inner command -> [its own limit in seconds, why]. Each starts first, in a slot of its own, and runs to its own
   limit even past RUN_LIMIT_S: the minutes it costs are the hour a red run costs. */
export const LONG = new Map([
  ['node tests/typecheck-ratchet.mjs', [420, 'red on GitHub in v0.2.90, v0.2.104 and v0.2.106 (42394831391); 112-195 s on the Coordinator\'s PC at 41% CPU, 8-17 s on GitHub, so the 120 s limit killed it every time']],
]);

/* The quick pins that reddened release runs on GitHub (r-release-gate's 30 runs to 11-04, and the 22 red runs since): they start
   right after LONG, before workflow order. On a loaded PC a 180 s run judged 32 of 121 commands, and module-preload (1 s, v0.2.106's
   MP-1) was among the 88 it never reached. */
export const FIRST = new Set(['node tests/module-preload.mjs', 'node tests/comment-ratio-ratchet.mjs --report', 'node tests/client-module-size.mjs',
  'node tests/copy-lint.mjs --report', 'node tests/item-flavour-coverage.mjs', 'bash bump-version.sh --check']);

/* Measured 13-120 s here, the rest under 10 s. They go last so a busy machine judges the most commands inside the limit: 124 s for all 71
   at 54% CPU, but 45 of 72 at the limit on a busier one, when two of these ate a slot each. */
export const LATE = new Set(['node tests/w0e-ammo-runecraft-prayer.mjs', 'node tests/selfcheck-no-global-dml.bypass.mjs', 'node tests/world-assets.mjs',
  'node tests/world-town-home.mjs', 'node tests/parse-check.mjs', 'node tests/restore-census.mjs', 'node tests/rpc-resolution.mjs', 'node tests/level-curve.mjs',
  'node tests/core-curves.mjs', 'node tests/lucky-finds.mjs']);

/* From the jobs that replay the chain, when their inputs moved: each was a red in the last 30 runs. */
const CHAIN = (f) => f.startsWith('supabase/') || f === 'tests/schema-apply-order.json';
export const EXTRAS = [
  ['node tests/restore-census.mjs', (f) => CHAIN(f) || /^src\/data\/.*\.js$/.test(f) || f === 'tests/restore-census.baseline.json',
    'a catalogue or a table moved: tonight\'s 48-row pin, 4 min into the run'],
  ['node tests/rpc-resolution.mjs', (f) => CHAIN(f), 'a client RPC moved: --update-baseline in the same commit (41226511232)'],
  ['node tests/apply-order-honesty.mjs', (f) => CHAIN(f) || f === 'tests/live-hash-drift.baseline.json', 'every apply-order note agrees with the baseline'],
  /* v0.2.91 and v0.2.93 (2026-11-05): a new envelope section went red on two of these after 25 min of a run, and a sink's price on the third. */
  ['node tests/envelope-contract.mjs', (f) => CHAIN(f) || f.startsWith('src/session/'), 'the client reads a section with no contract (41973095820)'],
  ['node tests/no-client-copy-of-projection.mjs --execute', (f) => CHAIN(f), 'a new projection key: re-pin it (41973095820)'],
  ['node tests/settle-budget.mjs', (f) => CHAIN(f) || f.startsWith('src/core/'), 'a SQL function in the settle path, or a settle over budget'],
  ['node tests/say-why.mjs', (f) => f.startsWith('src/shell/') || f.startsWith('src/app/'), 'a control off for a rule with no reason on screen (41973095820)'],
  ['bash bump-version.sh --check', () => true, 'the three version strings agree'],
  ['node tests/level-curve.mjs', (f) => /^src\/data\/(monsters|hunts|core-model|level)/.test(f), 'a ground or a monster moved: the curve is re-measured (40772818413)'],
  /* v0.2.89 and v0.2.99: the pace was not re-measured, then four called monsters had no SQL row; 2-4 s on GitHub, found 7-13 min in. */
  ['node tests/core-curves.mjs', (f) => CHAIN(f) || /^src\/data\/(monsters|hunts|core-model|level)/.test(f), 'a monster or ground moved and SQL or the pace did not follow (41922216241, 42146852443)'],
  ['node tests/lucky-finds.mjs', (f) => CHAIN(f) || /^src\/data\/(monsters|items|bosses|hearthfind|shops)\.js$/.test(f), 'a tier\'s lucky rows (42146852443)'],
  ['node tests/core-purity.mjs', (f) => f.startsWith('src/core/') || /^src\/data\/core-model/.test(f), 'run-smoke\'s curve anchors (40789905806)'],
];

const isSkipped = (name) => SKIP.some(([n]) => n === name);

/**
 * The plan, from the workflow's text and a diff. Pure.
 * @returns {{ run: {cmd,why,proof,guard}[], left: {cmd,why}[], errors: string[] }}
 */
export function buildPlan(text, { changed = [], selected = new Set(), solo = new Set(), slow = SLOW, long = LONG, first = FIRST, extras = EXTRAS, job = CHEAP_JOB, smokeText = '', skip = isSkipped } = {}) {
  const steps = flatSteps(parseWorkflow(text));
  const errors = [];
  const run = [];
  const left = [];
  const all = new Set(steps.flatMap((s) => s.run.map(unwrapGate)));
  for (const name of slow.keys()) if (!all.has(name)) errors.push(`SLOW names "${name}", which smoke.yml no longer runs`);
  for (const name of long.keys()) if (!all.has(name)) errors.push(`LONG names "${name}", which smoke.yml no longer runs`);
  for (const name of first) if (!all.has(name)) errors.push(`FIRST names "${name}", which smoke.yml no longer runs`);
  const seen = new Set();
  const cheap = steps.filter((s) => job.test(s.job) && !skip(s.name));
  for (const s of cheap) {
    for (const cmd of s.run) {
      const inner = unwrapGate(cmd);
      if (seen.has(inner)) continue;
      seen.add(inner);
      const guard = guardFileOf(cmd);
      const proof = PROOF_FLAG.test(inner);
      if (!guard) { left.push({ cmd: inner, why: 'not a node or bash command' }); continue; }
      if (slow.has(inner)) { left.push({ cmd: inner, why: slow.get(inner) }); continue; }
      if (!proof) { run.push({ cmd: inner, why: s.job, proof, guard }); continue; }
      if (!selected.has(guard)) continue;
      if (solo.has(guard)) { left.push({ cmd: inner, why: 'plants into the tree: GitHub proves it' }); continue; }
      run.push({ cmd: inner, why: `${s.job}, touched`, proof, guard });
    }
  }
  for (const [inner, when, why] of extras) {
    if (!all.has(inner) && !smokeText.includes(`./${guardFileOf(inner).replace(/^tests\//, '')}`)) { errors.push(`EXTRAS names "${inner}", which smoke.yml no longer runs`); continue; }
    if (seen.has(inner) || !changed.some(when)) continue;
    seen.add(inner);
    run.push({ cmd: inner, why, proof: false, guard: guardFileOf(inner) });
  }
  return { run, left, errors };
}

/** --proofs: the touched proofs of every job that installs no browser, read from the workflow. Pure. */
export function proofsPlan(text, { selected = new Set(), solo = new Set(), pages = false, plant = false } = {}) {
  const jobs = parseWorkflow(text);
  const browser = new Set(jobs.filter((j) => j.steps.some((s) => /playwright-chromium/.test(s.uses || ''))).map((j) => j.name));
  /* (run-ci-local's skips are for a machine with no browser; with --pages only the installs stay out.) */
  const plan = buildPlan(text, { selected, solo: plant ? new Set() : solo, slow: new Map(), long: new Map(), first: new Set(), extras: [], job: { test: (name) => pages || !browser.has(name) }, skip: pages ? (name) => /^Install /.test(name) : isSkipped });
  return { run: plan.run.filter((r) => r.proof), left: plan.left.filter((l) => PROOF_FLAG.test(l.cmd)), errors: plan.errors };
}

/** Run one command; never throws. { status, seconds, out, killed }. */
function runOne(cmd, { cwd = ROOT, limitS = COMMAND_LIMIT_S, env = {} } = {}) {
  return new Promise((done) => {
    const [file, ...args] = cmd.split(/\s+/);
    const started = Date.now();
    let out = '';
    const keep = (b) => { out = (out + b.toString()).slice(-4000); };
    let child;
    try {
      child = spawn(file === 'node' ? process.execPath : file, args, { cwd, env: { ...process.env, ...env }, windowsHide: true });
    } catch (e) { done({ status: 2, seconds: 0, out: e.message, killed: false }); return; }
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill(); }, limitS * 1000);
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', (e) => { clearTimeout(timer); done({ status: 2, seconds: (Date.now() - started) / 1000, out: e.message, killed }); });
    child.on('close', (code) => { clearTimeout(timer); done({ status: code === null ? 1 : code, seconds: (Date.now() - started) / 1000, out, killed }); });
  });
}

/** The pool. Everything still unstarted past the run limit is NOT JUDGED. Returns one result per command, in order. */
export async function runAll(cmds, { jobs = 3, runLimitS = RUN_LIMIT_S, limitS = COMMAND_LIMIT_S, limits = new Map(), cwd = ROOT, one = runOne, env = {}, onDone = () => {} } = {}) {
  const results = new Array(cmds.length);
  const t0 = Date.now();
  let next = 0;
  const worker = async () => {
    while (next < cmds.length) {
      const i = next++;
      const room = runLimitS - (Date.now() - t0) / 1000;
      if (room <= 0) { results[i] = { cmd: cmds[i].cmd, status: null, seconds: 0, out: '', notRun: true }; continue; }
      /* A LONG command keeps its own limit: it was started inside the run's, and judging it is the point. */
      const own = limits.get(cmds[i].cmd);
      results[i] = { cmd: cmds[i].cmd, ...(await one(cmds[i].cmd, { cwd, env, limitS: own ?? Math.min(limitS, room) })) };
      onDone(results[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return results;
}

/** The order commands start in: LONG (each in a slot of its own), the FIRST pins, the quick plain commands, LATE, then the
    proofs, so a plain red reads first and is the cheap one to fix. Stable within a rank. Pure. */
export function ordered(run, { long = LONG, first = FIRST, late = LATE } = {}) {
  const rank = (r) => (long.has(r.cmd) ? -2 : first.has(r.cmd) ? -1 : r.proof ? 2 : late.has(r.cmd) ? 1 : 0);
  return [...run].sort((a, b) => rank(a) - rank(b));
}

/** 0 only when every command was judged and exited 0; a red outranks the unjudged. Pure. */
export function verdict(results) {
  const red = results.filter((r) => r.status !== 0 && !r.killed && !r.notRun);
  const unjudged = results.filter((r) => r.killed || r.notRun);
  return { red, unjudged, green: results.length - red.length - unjudged.length, exit: red.length ? 1 : unjudged.length ? 3 : 0 };
}

function theDiff(base) {
  const a = (args) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const sha = a(['merge-base', base, 'HEAD']);
  const head = a(['rev-parse', 'HEAD']);
  const { files, regions } = committedDiff(ROOT, `${sha}..${head}`);
  const dirty = a(['status', '--porcelain']);
  return { sha, head, files, regions, dirty };
}

// ── --selftest ─────────────────────────────────────────────────────────────
const FIXTURE = `name: smoke
jobs:
  client-guards:
    runs-on: ubuntu-latest
    timeout-minutes: 9
    steps:
      - uses: actions/checkout@v4
      - name: Install node modules (no browser)
        run: npm install --no-audit --no-fund
      - name: A plain guard
        run: |
          node tests/plain-a.mjs
          node tools/mutant-gate.mjs node tests/plain-a.mjs --selftest
      - name: Slow guard
        run: node tests/slow.mjs
  client-guards-2:
    runs-on: ubuntu-latest
    timeout-minutes: 9
    steps:
      - name: The second job
        run: |
          node tests/plain-b.mjs
          node tools/mutant-gate.mjs node tests/plain-b.mjs --mutate
          node tools/mutant-gate.mjs node tests/plants.mjs --selftest
  db-replay-2:
    runs-on: ubuntu-latest
    timeout-minutes: 9
    steps:
      - name: Census
        run: |
          node tests/census.mjs
          node tools/mutant-gate.mjs node tests/census.mjs --mutate
      - name: Other chain guard
        run: node tests/chain-only.mjs
  in-page:
    runs-on: ubuntu-latest
    timeout-minutes: 9
    steps:
      - uses: ./.github/actions/playwright-chromium
      - name: Client boot (play.html, index.html)
        run: |
          node tests/page.mjs
          node tools/mutant-gate.mjs node tests/page.mjs --mutate
`;

async function selftest() {
  const fails = [];
  const ok = (c, m) => { console.log(`  ${c ? 'ok      ' : 'FAILED  '} ${m}`); if (!c) fails.push(m); };
  const X = [['node tests/census.mjs', (f) => f.startsWith('supabase/'), 'census']];
  const S = new Map([['node tests/slow.mjs', 'slow']]);
  const L = new Map([['node tests/plain-b.mjs', [60, 'long']]]);
  const F = new Set(['node tests/plain-a.mjs']);
  const plan = (o = {}, text = FIXTURE, impl = buildPlan) => impl(text, { slow: S, long: L, first: F, extras: X, ...o });
  const names = (p) => p.run.map((r) => r.cmd);

  const planChecks = (impl) => {
    const none = plan({}, FIXTURE, impl);
    const proofs = plan({ selected: new Set(['tests/plain-a.mjs', 'tests/plants.mjs']), solo: new Set(['tests/plants.mjs']) }, FIXTURE, impl);
    const moved = plan({ changed: ['supabase/migrations/x.sql'] }, FIXTURE, impl);
    const added = plan({}, FIXTURE.replace('      - name: The second job\n', '      - name: Added\n        run: node tests/added.mjs\n      - name: The second job\n'), impl);
    const gone = plan({}, FIXTURE.replace('run: node tests/slow.mjs', 'run: node tests/renamed.mjs'), impl);
    const noExtra = plan({ changed: ['supabase/x.sql'] }, FIXTURE.replace('node tests/census.mjs\n', 'node tests/other.mjs\n'), impl);
    const third = plan({}, FIXTURE.replace('  db-replay-2:\n', '  client-guards-3:\n    steps:\n      - name: New shard\n        run: node tests/plain-c.mjs\n  db-replay-2:\n'), impl);
    const goneLong = plan({}, FIXTURE.replace('          node tests/plain-b.mjs\n', '          node tests/plain-renamed.mjs\n'), impl);
    const goneFirst = plan({}, FIXTURE.replace('          node tests/plain-a.mjs\n', '          node tests/plain-renamed.mjs\n'), impl);
    return [
      [names(none).includes('node tests/plain-a.mjs') && names(none).includes('node tests/plain-b.mjs'), 'every plain command of the client-guards jobs runs'],
      [!names(none).some((c) => PROOF_FLAG.test(c)), 'an untouched proof does not run'],
      [names(proofs).includes('node tests/plain-a.mjs --selftest'), 'a proof this diff touches runs, unwrapped from the gate'],
      [!names(proofs).includes('node tests/plants.mjs --selftest') && proofs.left.some((l) => l.cmd.includes('plants.mjs')), 'a proof that plants into the tree stays on GitHub, and says so'],
      [!names(none).includes('node tests/slow.mjs') && none.left.some((l) => l.cmd === 'node tests/slow.mjs'), 'a SLOW command stays on GitHub, and says so'],
      [!names(none).includes('node tests/page.mjs') && !names(none).includes('node tests/chain-only.mjs'), 'a browser or chain job is not read'],
      [!names(none).some((c) => c.startsWith('npm')), 'the install step is not a guard'],
      [names(moved).includes('node tests/census.mjs'), 'an extra runs when its files moved'],
      [!names(plan({ changed: ['src/other.js'] }, FIXTURE, impl)).includes('node tests/census.mjs'), 'an extra does not run when they did not'],
      [names(added).includes('node tests/added.mjs'), 'a step added to smoke.yml runs here with no edit (no drift)'],
      [names(third).includes('node tests/plain-c.mjs'), 'a new client-guards shard job is read'],
      [gone.errors.some((e) => /SLOW names/.test(e)), 'a SLOW name smoke.yml dropped is a harness error'],
      [noExtra.errors.some((e) => /EXTRAS names/.test(e)), 'an EXTRA smoke.yml dropped is a harness error'],
      [goneLong.errors.some((e) => /LONG names/.test(e)), 'a LONG name smoke.yml dropped is a harness error'],
      [goneFirst.errors.some((e) => /FIRST names/.test(e)), 'a FIRST name smoke.yml dropped is a harness error'],
      [names(none).includes('node tests/plain-b.mjs'), 'a LONG command runs here (it is not left for GitHub)'],
      [new Set(names(plan({ selected: new Set(['tests/plain-a.mjs']) }, FIXTURE, impl))).size === names(plan({ selected: new Set(['tests/plain-a.mjs']) }, FIXTURE, impl)).length, 'nothing runs twice'],
    ];
  };
  for (const [c, m] of planChecks(buildPlan)) ok(c, m);
  const wrap = (f) => (text, o) => f(buildPlan(text, o), text, o);
  for (const [label, impl] of [
    ['proofs run whatever the diff', (t, o) => buildPlan(t, { ...o, selected: { has: () => true } })],
    ['proofs never run', (t, o) => buildPlan(t, { ...o, selected: new Set() })],
    ['a planting proof runs here', (t, o) => buildPlan(t, { ...o, solo: new Set() })],
    ['SLOW is ignored', (t, o) => buildPlan(t, { ...o, slow: new Map() })],
    ['every job is read', (t, o) => buildPlan(t, { ...o, job: /./ })],
    ['only the first client-guards job is read', (t, o) => buildPlan(t, { ...o, job: /^client-guards$/ })],
    ['extras always run', (t, o) => buildPlan(t, { ...o, extras: (o.extras || []).map(([a, , c]) => [a, () => true, c]) })],
    ['extras never run', (t, o) => buildPlan(t, { ...o, extras: [] })],
    ['a gone SLOW name is silent', wrap((p) => ({ ...p, errors: p.errors.filter((e) => !/SLOW/.test(e)) }))],
    ['a gone EXTRA is silent', wrap((p) => ({ ...p, errors: p.errors.filter((e) => !/EXTRAS/.test(e)) }))],
    ['a gone LONG name is silent', wrap((p) => ({ ...p, errors: p.errors.filter((e) => !/LONG/.test(e)) }))],
    ['a gone FIRST name is silent', wrap((p) => ({ ...p, errors: p.errors.filter((e) => !/FIRST/.test(e)) }))],
    ['a LONG command is left for GitHub like a SLOW one', (t, o) => buildPlan(t, { ...o, slow: new Map([...(o.slow || []), ...[...(o.long || [])].map(([c, [, w]]) => [c, w])]) })],
    ['the list is frozen, not read', () => ({ run: [{ cmd: 'node tests/plain-a.mjs' }, { cmd: 'node tests/plain-b.mjs' }], left: [{ cmd: 'node tests/slow.mjs' }], errors: [] })],
  ]) {
    const missed = planChecks(impl).every(([c]) => c);
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} plan mutant: ${label}`);
    if (missed) fails.push(`plan mutant missed: ${label}`);
  }

  /* The verdict, on real child processes in a scratch folder. */
  const dir = mkdtempSync(join(tmpdir(), 'hr-preflight-'));
  try {
    const script = (name, body) => { writeFileSync(join(dir, name), body); return `node ${name}`; };
    const green = script('green.mjs', 'process.exit(0);');
    const red = script('red.mjs', 'console.log("the words a fix needs"); process.exit(1);');
    const hang = script('hang.mjs', 'setInterval(() => {}, 1000);');
    const judge = async (cmds, o = {}) => verdict(await runAll(cmds.map((cmd) => ({ cmd })), { cwd: dir, ...o }));
    const v0 = await judge([green, green]);
    const v1 = await judge([green, red]);
    const v2 = await judge([green, hang], { limitS: 10 });
    const v3 = await judge([green, green, green], { jobs: 1, runLimitS: 0 });
    const v4 = await judge([red, hang], { limitS: 10 });
    const checks = (v) => [
      [v(v0).exit === 0 && v(v0).green === 2, 'all green exits 0'],
      [v(v1).exit === 1 && v(v1).red.length === 1 && /the words a fix needs/.test(v(v1).red[0].out), 'a red exits 1 and keeps the words'],
      [v(v2).exit === 3 && v(v2).unjudged.length === 1 && v(v2).green === 1, 'a command past its limit is NOT JUDGED, never green'],
      [v(v3).exit === 3 && v(v3).unjudged.length === 3 && v(v3).green === 0, 'a command the run had no time for is NOT JUDGED, never green'],
      [v(v4).exit === 1, 'a red outranks a command not judged'],
    ];
    for (const [c, m] of checks((x) => x)) ok(c, m);
    for (const [label, mut] of [
      ['a red is green', (x) => ({ ...x, exit: x.unjudged.length ? 3 : 0 })],
      ['a timeout is green', (x) => ({ ...x, exit: x.red.length ? 1 : 0 })],
      ['a timeout counts in the green tally', (x) => ({ ...x, green: x.green + x.unjudged.length })],
      ['the unjudged hide a red', (x) => ({ ...x, exit: x.unjudged.length ? 3 : x.exit })],
      ['the words are lost', (x) => ({ ...x, red: x.red.map((r) => ({ ...r, out: '' })) })],
    ]) {
      const missed = checks(mut).every(([c]) => c);
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} verdict mutant: ${label}`);
      if (missed) fails.push(`verdict mutant missed: ${label}`);
    }
    /* LONG (v0.2.90, v0.2.104, v0.2.106): the type ratchet ran 112-195 s here against a 120 s limit and was never judged.
       A LONG command starts first and runs to its own limit, past the run's. */
    const slowRed = script('slow-red.mjs', 'setTimeout(() => { console.log("the long guard\'s words"); process.exit(1); }, 4000);');
    const longChecks = async (order, run) => {
      const list = [{ cmd: green, proof: false }, { cmd: 'node p.mjs --mutate', proof: true }, { cmd: 'node late.mjs', proof: false }, { cmd: 'node pin.mjs', proof: false }, { cmd: slowRed, proof: false }];
      const o = order(list, { long: new Map([[slowRed, [60, 'x']]]), first: new Set(['node pin.mjs']), late: new Set(['node late.mjs']) }).map((r) => r.cmd);
      const v = verdict(await run([{ cmd: slowRed }], { cwd: dir, jobs: 1, limitS: 1, runLimitS: 1, limits: new Map([[slowRed, 60]]) }));
      return [
        [o.join() === [slowRed, 'node pin.mjs', green, 'node late.mjs', 'node p.mjs --mutate'].join(), 'LONG starts first, then the FIRST pins, then plain, then LATE, then the proofs'],
        [v.exit === 1 && v.unjudged.length === 0 && /the long guard's words/.test(v.red[0]?.out || ''), 'a LONG command runs past the run\'s limit to its own and is judged'],
      ];
    };
    for (const [c, m] of await longChecks(ordered, runAll)) ok(c, m);
    for (const [label, ord, run] of [
      ['LONG starts with the plain commands', (r, o) => ordered(r, { ...o, long: new Map() }), runAll],
      ['the FIRST pins wait their turn in workflow order', (r, o) => ordered(r, { ...o, first: new Set() }), runAll],
      ['a LONG command is cut at the run\'s limit', ordered, (c, o) => runAll(c, { ...o, limits: new Map() })],
    ]) {
      const missed = (await longChecks(ord, run)).every(([c]) => c);
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} LONG mutant: ${label}`);
      if (missed) fails.push(`LONG mutant missed: ${label}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }

  /* The real workflow: SLOW and EXTRAS name real commands, and the plan holds the guards the last 30 reds needed. */
  const real = buildPlan(readFileSync(WORKFLOW, 'utf8'), { changed: ['supabase/migrations/x.sql', 'src/data/items.js'], smokeText: readFileSync(join(ROOT, 'tests', 'run-smoke.mjs'), 'utf8') });
  ok(!real.errors.length, `SLOW, LONG and EXTRAS name commands smoke.yml runs (${real.errors.join('; ') || 'all of them'})`);
  ok(ordered(real.run)[0]?.cmd === 'node tests/typecheck-ratchet.mjs', 'the real plan starts the type ratchet first');
  ok(ordered(real.run).slice(1, 1 + FIRST.size).every((r) => FIRST.has(r.cmd)), 'the real plan starts the FIRST pins next (module-preload among them)');
  for (const need of ['node tests/module-preload.mjs', 'node tests/comment-ratio-ratchet.mjs --report', 'node tests/client-module-size.mjs', 'node tests/mutant-anchors.mjs',
    'node tests/copy-lint.mjs --report', 'node tests/dead-exports.mjs', 'node tests/patch-chain-guard.mjs --report', 'bash bump-version.sh --check', 'node tests/restore-census.mjs']) {
    ok(names(real).includes(need), `the real plan runs ${need}`);
  }
  /* 11-11, set/v0.2.116: guard-anchors --selftest plants into src/session/envelope.js; in the pool it ran beside
     no-client-copy-of-projection --selftest, whose copy of src/ caught the plant ("selftest anchor missing"). */
  const realSolo = new Set(catalogue(ROOT).filter((e) => e.solo).map((e) => e.guard));
  const both = names(buildPlan(readFileSync(WORKFLOW, 'utf8'), { selected: new Set(['tools/guard-anchors.mjs', 'tests/no-client-copy-of-projection.mjs']), solo: realSolo }));
  ok(!both.includes('node tools/guard-anchors.mjs --selftest') && both.includes('node tests/no-client-copy-of-projection.mjs --selftest'),
    'the real plan leaves guard-anchors --selftest (it plants into src/) for GitHub, and runs the projection selftest that copies src/');
  /* 11-10: `mutant-writes-tree: no` was read as yes, so 19 proofs that plant into copies never ran here. */
  const wf = readFileSync(WORKFLOW, 'utf8');
  ok(names(buildPlan(wf, { selected: new Set(['tests/hunt-view-core.mjs']), solo: realSolo })).includes('node tests/hunt-view-core.mjs --mutate')
    && proofsPlan(wf, { selected: new Set(['tests/session-core.mjs']), solo: realSolo }).run.some((r) => r.cmd === 'node tests/session-core.mjs --mutate'),
    'a touched proof that plants into a copy (`mutant-writes-tree: no`) runs: hunt-view-core in the plan, session-core in --proofs');
  /* --proofs: every job with no browser, touched proofs only, none that plants into the tree. */
  const proofChecks = (impl) => {
    const p = impl(FIXTURE, { selected: new Set(['tests/census.mjs', 'tests/plain-b.mjs', 'tests/plants.mjs', 'tests/page.mjs']), solo: new Set(['tests/plants.mjs']) });
    const n = p.run.map((r) => r.cmd);
    return [
      [n.includes('node tests/census.mjs --mutate') && n.includes('node tests/plain-b.mjs --mutate'), '--proofs reads every job with no browser'],
      [!n.some((c) => !PROOF_FLAG.test(c)), '--proofs runs no plain command'],
      [!n.includes('node tests/plants.mjs --selftest'), '--proofs never plants into the tree'],
      [!impl(FIXTURE, { selected: new Set() }).run.length, '--proofs on an untouched diff runs nothing'],
      [!n.includes('node tests/page.mjs --mutate'), '--proofs leaves a job with a browser alone'],
      [impl(FIXTURE, { selected: new Set(['tests/page.mjs']), pages: true }).run.some((r) => r.cmd === 'node tests/page.mjs --mutate'), '--proofs --pages reads it'],
      [impl(FIXTURE, { selected: new Set(['tests/plants.mjs']), solo: new Set(['tests/plants.mjs']), plant: true }).run.some((r) => r.cmd === 'node tests/plants.mjs --selftest'), '--proofs --plant runs a proof that plants (a lane\'s own tree)'],
    ];
  };
  for (const [c, m] of proofChecks(proofsPlan)) ok(c, m);
  for (const [label, impl] of [
    ['--proofs reads client-guards alone', (t, o) => { const r = proofsPlan(t, o); return { ...r, run: r.run.filter((x) => /plain-[ab]/.test(x.cmd)) }; }],
    ['--proofs runs plain commands', (t, o) => buildPlan(t, { ...o, slow: new Map(), extras: [], job: /./ })],
    ['--proofs plants', (t, o) => proofsPlan(t, { ...o, solo: new Set() })],
    ['--proofs runs whatever the diff', (t, o) => proofsPlan(t, { ...o, selected: { has: () => true } })],
    ['--proofs reads the browser jobs too', (t, o) => proofsPlan(t, { ...o, pages: true })],
    ['--pages does nothing', (t, o) => proofsPlan(t, { ...o, pages: false })],
    ['--plant does nothing', (t, o) => proofsPlan(t, { ...o, plant: false })],
  ]) {
    const missed = proofChecks(impl).every(([c]) => c);
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} --proofs mutant: ${label}`);
    if (missed) fails.push(`--proofs mutant missed: ${label}`);
  }
  console.log(fails.length ? `\n  preflight --selftest: ${fails.length} failed` : '\n  preflight --selftest: the plan is read from smoke.yml, a red and a timeout are red, every mutant caught');
  return fails.length ? 1 : 0;
}

// ── the CLI ────────────────────────────────────────────────────────────────
/* One at a time, each narrowed by the same plan GitHub hands its guards (HR_MUTANT_SCOPE), each printed as it ends. */
async function deepProofs(text, d, allProofs, read, solo, argv) {
  const selected = new Set(selectGuards(d.files, { base: d.sha, extraGuards: allProofs, regions: d.regions, read }).keys());
  const plant = argv.includes('--plant');
  const plan = proofsPlan(text, { selected, solo, pages: argv.includes('--pages'), plant });
  console.log(`preflight --proofs: ${d.files.length} changed file(s) since ${d.sha.slice(0, 9)}; ${plan.run.length} proof(s) to run, ${plan.left.length} that plant into the tree stay on GitHub${plant ? ' (--plant: none)' : ''}`);
  if (argv.includes('--list')) { for (const r of plan.run) console.log(`  run   ${r.cmd}`); for (const l of plan.left) console.log(`  left  ${l.cmd}`); return 0; }
  /* A plant interrupted mid-run stays in the tree (11-05: guard-anchors' plant in src/session/envelope.js). On a dirty tree it
     could not be told from the lane's own edits, so --plant refuses one, and names any file a proof left changed. */
  const status = () => spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout || '';
  if (plant && d.dirty) { console.error('preflight --proofs --plant: the tree has uncommitted changes; commit them first, so a plant left behind can be seen'); return 2; }
  const dir = mkdtempSync(join(tmpdir(), 'hr-preflight-plan-'));
  const scope = join(dir, 'plan.json');
  writeFileSync(scope, JSON.stringify({ full: false, base: d.sha, tip: d.head, changed: d.files, selected: Object.fromEntries([...selected].map((g) => [g, 'preflight --proofs'])) }));
  try {
    const t0 = Date.now();
    const results = await runAll(plan.run, { jobs: 1, runLimitS: 45 * 60, limitS: 20 * 60, env: { HR_MUTANT_SCOPE: scope }, onDone: (r) => {
      if (r.notRun) return;
      console.log(`  ${r.killed ? 'NOT JUDGED' : r.status === 0 ? 'ok ' : 'RED'}  ${String(Math.round(r.seconds)).padStart(4)} s  ${r.cmd}`);
      if (r.status !== 0 && !r.killed) console.log(r.out.trim().split('\n').slice(-10).map((l) => `       ${l.slice(0, 200)}`).join('\n'));
    } });
    const v = verdict(results);
    console.log(`\npreflight --proofs: ${v.green} green, ${v.red.length} red, ${v.unjudged.length} not judged, ${Math.round((Date.now() - t0) / 1000)} s`);
    const left = plant ? status().trim() : '';
    if (left) { console.error(`preflight --proofs --plant: a proof left the tree changed; restore it before committing:\n${left}`); return 2; }
    return v.exit;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const at = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
  const base = at('--base') || 'origin/main';
  const d = theDiff(base);
  const text = readFileSync(WORKFLOW, 'utf8');
  const proofs = flatSteps(parseWorkflow(text)).filter((s) => CHEAP_JOB.test(s.job)).flatMap((s) => s.run).filter((c) => PROOF_FLAG.test(unwrapGate(c))).map(guardFileOf);
  const read = (rel) => committedTexts(ROOT, d.sha, rel, d.head);
  const selected = new Set(selectGuards(d.files, { base: d.sha, extraGuards: proofs, regions: d.regions, read }).keys());
  const solo = new Set(catalogue(ROOT).filter((e) => e.solo).map((e) => e.guard));
  const allProofs = flatSteps(parseWorkflow(text)).flatMap((s) => s.run).filter((c) => PROOF_FLAG.test(unwrapGate(c))).map(guardFileOf);
  if (argv.includes('--proofs')) return deepProofs(text, d, allProofs, read, solo, argv);
  const plan = buildPlan(text, { changed: d.files, selected, solo, smokeText: readFileSync(join(ROOT, 'tests', 'run-smoke.mjs'), 'utf8') });
  console.log(`preflight: ${d.files.length} changed file(s) since ${d.sha.slice(0, 9)} (${base}); ${plan.run.length} command(s), ${plan.run.filter((r) => r.proof).length} of them proofs this diff touches; ${plan.left.length} left for GitHub`);
  if (d.dirty) console.log('preflight: UNCOMMITTED changes here; GitHub judges the commit, not this tree');
  if (plan.errors.length) { for (const e of plan.errors) console.error(`  HARNESS  ${e}`); return 2; }
  if (argv.includes('--list')) {
    for (const r of plan.run) console.log(`  run   ${r.cmd}   (${r.why})`);
    for (const l of plan.left) console.log(`  left  ${l.cmd}   (${l.why})`);
    return 0;
  }
  const jobs = Number(at('-j')) || Math.min(3, Math.max(1, Math.floor(availableParallelism() / 4)));
  const t0 = Date.now();
  const order = ordered(plan.run);
  const longs = order.filter((r) => LONG.has(r.cmd)).length;
  const results = await runAll(order, { jobs: jobs + longs, limits: new Map([...LONG].map(([c, [s]]) => [c, s])) });
  const v = verdict(results);
  for (const r of v.red) {
    console.log(`\n  RED  ${r.cmd}  (exit ${r.status}, ${Math.round(r.seconds)} s)`);
    console.log(r.out.trim().split('\n').slice(-10).map((l) => `       ${l.slice(0, 200)}`).join('\n'));
  }
  for (const r of v.unjudged) console.log(`\n  NOT JUDGED  ${r.cmd}  (${r.notRun ? 'the run ran out of time' : `over its limit at ${Math.round(r.seconds)} s`}; GitHub will judge it)`);
  const slowest = [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 3).map((r) => `${r.cmd.replace(/^node /, '')} ${Math.round(r.seconds)} s`).join(', ');
  console.log(`\npreflight: ${v.green} green, ${v.red.length} red, ${v.unjudged.length} not judged, ${Math.round((Date.now() - t0) / 1000)} s (${jobs} at a time${longs ? `, + ${longs} LONG in a slot of its own` : ''}). Slowest: ${slowest}`);
  if (argv.includes('--times')) for (const r of [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 25)) console.log(`  ${String(Math.round(r.seconds)).padStart(4)} s  ${r.cmd}`);
  return v.exit;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`preflight: harness error: ${e.message}`); process.exit(2); });
}
