#!/usr/bin/env node
// tools/preflight.local.mjs — THE CHEAP REDS, BEFORE A RELEASE SPENDS AN HOUR FINDING THEM.
//
//   node tools/preflight.local.mjs              the assembled set, against the merge base with origin/main
//   node tools/preflight.local.mjs --base REF   against REF instead
//   node tools/preflight.local.mjs --list       the plan, nothing run
//   node tools/preflight.local.mjs -j N         N at a time (default 3: other lanes share this machine)
//   node tools/preflight.local.mjs --selftest   the plan and the verdict, each proved by a planted mutant
//
// WHY (lane r-release-gate, 2026-11-04). Of the last 30 red release runs, 25 of the 76 causes were a guard that
// needs no browser and no chain: a forgotten `module-preload --write` (5), a comment ratchet (5), a file over its
// line cap, a census pin, a spelling, a stale mutant anchor. Each cost a run of about an hour, and restore-census
// failed four minutes into v0.2.86's while 43 other jobs ran on. This runs them on the Coordinator's machine in under
// three minutes, before the push, and says what to do. It is not a gate: GitHub is (CLAUDE.md §3.3).
//
// WHAT RUNS IS READ FROM smoke.yml, the way tests/run-ci-local.mjs does, so it cannot drift:
//   every plain command of the client-guards jobs                  (the always-run half of a release's own run)
//   the proofs of those jobs that this diff touches                (tools/mutant-gate.mjs's own selection)
//   EXTRAS, from the jobs a chain replay needs, when their files moved
// SLOW names what stays on GitHub, each with its measured seconds and why. A name that is no longer in smoke.yml is
// a harness error, so the list cannot rot. A proof that plants into the tree (guard-anchors' solo) never runs here:
// this machine is where the lanes work. Anything past a command's limit is said out loud as NOT JUDGED, never green.
//
// Exit: 0 all judged green · 1 a red or a command not judged · 2 a harness problem.
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
/* Per command, and for the whole run: past these a command is NOT JUDGED (a red, so nobody reads silence as green). */
const COMMAND_LIMIT_S = 170;
const RUN_LIMIT_S = 240;

/* The client-guards commands that stay on GitHub: inner command -> seconds measured there, why. */
export const SLOW = new Map([
  ['node tests/hunt-scene-live.mjs --node', '314-429 s (41600804145, 41697486160), one engine run per case; red once in the last 30 runs'],
  ['node tests/hunt-scene-live.mjs --mutate', 'minutes per mutant over the same cases'],
  ['node tests/world-town-home.mjs --selftest', '531 s (41697486160)'],
  ['node tests/selfcheck-no-global-dml.mjs --selftest', '126-288 s; its plain run is the one that reads the chain'],
  ['node tools/board-from-git.mjs --selftest', '81 s (41697486160), reads git history; a docs tool'],
]);

/* From the jobs that replay the chain, when their inputs moved: each was a red in the last 30 runs. */
const CHAIN = (f) => f.startsWith('supabase/') || f === 'tests/schema-apply-order.json';
export const EXTRAS = [
  ['node tests/restore-census.mjs', (f) => CHAIN(f) || /^src\/data\/.*\.js$/.test(f) || f === 'tests/restore-census.baseline.json',
    'a catalogue or a table moved: tonight\'s 48-row pin, 4 min into the run'],
  ['node tests/rpc-resolution.mjs', (f) => CHAIN(f), 'a client RPC moved: --update-baseline in the same commit (41226511232)'],
  ['node tests/apply-order-honesty.mjs', (f) => CHAIN(f) || f === 'tests/live-hash-drift.baseline.json', 'every apply-order note agrees with the baseline'],
  ['bash bump-version.sh --check', () => true, 'the three version strings agree'],
];

const isSkipped = (name) => SKIP.some(([n]) => n === name);

/**
 * The plan, from the workflow's text and a diff. Pure.
 * @returns {{ run: {cmd,why,proof,guard}[], left: {cmd,why}[], errors: string[] }}
 */
export function buildPlan(text, { changed = [], selected = new Set(), solo = new Set(), slow = SLOW, extras = EXTRAS, job = CHEAP_JOB } = {}) {
  const steps = flatSteps(parseWorkflow(text));
  const errors = [];
  const run = [];
  const left = [];
  const all = new Set(steps.flatMap((s) => s.run.map(unwrapGate)));
  for (const name of slow.keys()) if (!all.has(name)) errors.push(`SLOW names "${name}", which smoke.yml no longer runs`);
  const seen = new Set();
  const cheap = steps.filter((s) => job.test(s.job) && !isSkipped(s.name));
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
    if (!all.has(inner)) { errors.push(`EXTRAS names "${inner}", which smoke.yml no longer runs`); continue; }
    if (seen.has(inner) || !changed.some(when)) continue;
    seen.add(inner);
    run.push({ cmd: inner, why, proof: false, guard: guardFileOf(inner) });
  }
  return { run, left, errors };
}

/** Run one command; never throws. { status, seconds, out, killed }. */
function runOne(cmd, { cwd = ROOT, limitS = COMMAND_LIMIT_S } = {}) {
  return new Promise((done) => {
    const [file, ...args] = cmd.split(/\s+/);
    const started = Date.now();
    let out = '';
    const keep = (b) => { out = (out + b.toString()).slice(-4000); };
    let child;
    try {
      child = spawn(file === 'node' ? process.execPath : file, args, { cwd, env: { ...process.env, HR_PREFLIGHT: '1' }, windowsHide: true });
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
export async function runAll(cmds, { jobs = 3, runLimitS = RUN_LIMIT_S, limitS = COMMAND_LIMIT_S, cwd = ROOT, one = runOne } = {}) {
  const results = new Array(cmds.length);
  const t0 = Date.now();
  let next = 0;
  const worker = async () => {
    while (next < cmds.length) {
      const i = next++;
      const room = runLimitS - (Date.now() - t0) / 1000;
      if (room <= 0) { results[i] = { cmd: cmds[i].cmd, status: null, seconds: 0, out: '', notRun: true }; continue; }
      results[i] = { cmd: cmds[i].cmd, ...(await one(cmds[i].cmd, { cwd, limitS: Math.min(limitS, room) })) };
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return results;
}

/** Green only when every command was judged and exited 0. Pure. */
export function verdict(results) {
  const red = results.filter((r) => r.status !== 0 && !r.killed && !r.notRun);
  const unjudged = results.filter((r) => r.killed || r.notRun);
  return { red, unjudged, green: results.length - red.length - unjudged.length, exit: red.length || unjudged.length ? 1 : 0 };
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
      - name: Client boot (play.html, index.html)
        run: node tests/page.mjs
`;

async function selftest() {
  const fails = [];
  const ok = (c, m) => { console.log(`  ${c ? 'ok      ' : 'FAILED  '} ${m}`); if (!c) fails.push(m); };
  const X = [['node tests/census.mjs', (f) => f.startsWith('supabase/'), 'census']];
  const S = new Map([['node tests/slow.mjs', 'slow']]);
  const plan = (o = {}, text = FIXTURE, impl = buildPlan) => impl(text, { slow: S, extras: X, ...o });
  const names = (p) => p.run.map((r) => r.cmd);

  const planChecks = (impl) => {
    const none = plan({}, FIXTURE, impl);
    const proofs = plan({ selected: new Set(['tests/plain-a.mjs', 'tests/plants.mjs']), solo: new Set(['tests/plants.mjs']) }, FIXTURE, impl);
    const moved = plan({ changed: ['supabase/migrations/x.sql'] }, FIXTURE, impl);
    const added = plan({}, FIXTURE.replace('      - name: The second job\n', '      - name: Added\n        run: node tests/added.mjs\n      - name: The second job\n'), impl);
    const gone = plan({}, FIXTURE.replace('run: node tests/slow.mjs', 'run: node tests/renamed.mjs'), impl);
    const noExtra = plan({ changed: ['supabase/x.sql'] }, FIXTURE.replace('node tests/census.mjs\n', 'node tests/other.mjs\n'), impl);
    const third = plan({}, FIXTURE.replace('  db-replay-2:\n', '  client-guards-3:\n    steps:\n      - name: New shard\n        run: node tests/plain-c.mjs\n  db-replay-2:\n'), impl);
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
    const v2 = await judge([green, hang], { limitS: 2 });
    const v3 = await judge([green, green, green], { jobs: 1, runLimitS: 0 });
    const checks = (v) => [
      [v(v0).exit === 0 && v(v0).green === 2, 'all green exits 0'],
      [v(v1).exit === 1 && v(v1).red.length === 1 && /the words a fix needs/.test(v(v1).red[0].out), 'a red exits 1 and keeps the words'],
      [v(v2).exit === 1 && v(v2).unjudged.length === 1, 'a command past its limit is NOT JUDGED, never green'],
      [v(v3).exit === 1 && v(v3).unjudged.length === 3, 'a command the run had no time for is NOT JUDGED, never green'],
    ];
    for (const [c, m] of checks((x) => x)) ok(c, m);
    for (const [label, mut] of [
      ['a red is green', (x) => ({ ...x, exit: x.unjudged.length ? 1 : 0 })],
      ['a timeout is green', (x) => ({ ...x, exit: x.red.length ? 1 : 0 })],
      ['the words are lost', (x) => ({ ...x, red: x.red.map((r) => ({ ...r, out: '' })) })],
    ]) {
      const missed = checks(mut).every(([c]) => c);
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} verdict mutant: ${label}`);
      if (missed) fails.push(`verdict mutant missed: ${label}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }

  /* The real workflow: SLOW and EXTRAS name real commands, and the plan holds the guards the last 30 reds needed. */
  const real = buildPlan(readFileSync(WORKFLOW, 'utf8'), { changed: ['supabase/migrations/x.sql', 'src/data/items.js'] });
  ok(!real.errors.length, `SLOW and EXTRAS name commands smoke.yml runs (${real.errors.join('; ') || 'all of them'})`);
  for (const need of ['node tests/module-preload.mjs', 'node tests/comment-ratio-ratchet.mjs --report', 'node tests/client-module-size.mjs', 'node tests/mutant-anchors.mjs',
    'node tests/copy-lint.mjs --report', 'node tests/dead-exports.mjs', 'node tests/patch-chain-guard.mjs --report', 'bash bump-version.sh --check', 'node tests/restore-census.mjs']) {
    ok(names(real).includes(need), `the real plan runs ${need}`);
  }
  console.log(fails.length ? `\n  preflight --selftest: ${fails.length} failed` : '\n  preflight --selftest: the plan is read from smoke.yml, a red and a timeout are red, every mutant caught');
  return fails.length ? 1 : 0;
}

// ── the CLI ────────────────────────────────────────────────────────────────
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
  const plan = buildPlan(text, { changed: d.files, selected, solo });
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
  /* Longest known first would be nicer; the proofs go last, so a plain red reads first and is the cheap one to fix. */
  const ordered = [...plan.run.filter((r) => !r.proof), ...plan.run.filter((r) => r.proof)];
  const results = await runAll(ordered, { jobs });
  const v = verdict(results);
  for (const r of v.red) {
    console.log(`\n  RED  ${r.cmd}  (exit ${r.status}, ${Math.round(r.seconds)} s)`);
    console.log(r.out.trim().split('\n').slice(-10).map((l) => `       ${l.slice(0, 200)}`).join('\n'));
  }
  for (const r of v.unjudged) console.log(`\n  NOT JUDGED  ${r.cmd}  (${r.notRun ? 'the run ran out of time' : `over its limit at ${Math.round(r.seconds)} s`}; GitHub will judge it)`);
  const slowest = [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 3).map((r) => `${r.cmd.replace(/^node /, '')} ${Math.round(r.seconds)} s`).join(', ');
  console.log(`\npreflight: ${v.green} green, ${v.red.length} red, ${v.unjudged.length} not judged, ${Math.round((Date.now() - t0) / 1000)} s (${jobs} at a time). Slowest: ${slowest}`);
  return v.exit;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`preflight: harness error: ${e.message}`); process.exit(2); });
}
