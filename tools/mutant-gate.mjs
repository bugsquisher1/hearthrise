#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/mutant-gate.mjs — A PUSH RUNS THE MUTATION PROOFS ITS DIFF TOUCHES (CLAUDE.md §3.6).
//
// THE COST. Every push to release/**, next and main ran all ~200 --mutate/--selftest
// commands in .github/workflows/smoke.yml; hunt-screen --mutate alone is 63 mutants x
// ~61 s. A release took 45-70 min, and a mutant whose anchor an EARLIER change moved
// reddened every later, unrelated release. §3.6 says a release runs only the proofs
// for the guards its diff touches, and the full sweep runs nightly (smoke.yml's
// `schedule:`), where a red blocks the next release.
//
// THE GATE. Every proof command in smoke.yml is written
//     node tools/mutant-gate.mjs node tests/x.mjs --mutate
// and this decides, per command:
//   plain run (no --mutate/--selftest)   ALWAYS runs — the gate never skips a guard
//   schedule / workflow_dispatch / local runs everything (the full sweep)
//   push / pull_request                  runs when the diff touches the guard file, a
//                                        file it loads (tools/lib/guard-deps.mjs — the
//                                        mapping guards-for uses) or a file one of its
//                                        mutants anchors on (tools/guard-anchors.mjs). A
//                                        hub file named by >25 guards (play.html) counts
//                                        only through the mutants that anchor on it.
//   The release cache-buster (`?v=` and build-info's version/date) is not a change.
// A skipped command prints why; nothing is skipped silently. When the diff cannot be
// computed (a shallow clone that will not deepen, no merge base), it FAILS SAFE: the
// full sweep, said out loud.
//
// THE BASE. release/**, next and pull requests: the merge base with main (for a
// release, the previous release on main). main: the push's `before` (the previous tip
// of main). The diff is committed files only — a mutant that dirties the tree cannot
// widen or narrow a later decision. The plan is computed once per job and cached in
// $RUNNER_TEMP.
//
//   node tools/mutant-gate.mjs node tests/x.mjs --mutate   gate one command (CI)
//   node tools/mutant-gate.mjs --explain [--base REF | --range A..B | --files a,b] [--all]
//                                     which registered proofs a diff would run
//   node tools/mutant-gate.mjs --selftest   the selection, the modes and the CLI,
//                                     each proved by a planted mutant
//
// mutant-anchors: .github/workflows/smoke.yml tools/lib/guard-deps.mjs tools/guard-anchors.mjs
// ════════════════════════════════════════════════════════════════════════
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PROOF_FLAG, GATE_PREFIX, unwrapGate, guardFileOf, touchedBy, guardSources, changedFiles, cacheBusterOnly,
} from './lib/guard-deps.mjs';
import { scopedProofs } from './guard-anchors.mjs';
import { scopeMutants, splitMutants, parseMutants } from './lib/mutant-scope.mjs';
import { parseWorkflow, flatSteps } from '../tests/run-ci-local.mjs';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'smoke.yml');
const DEPTH = 400;
/* ~10% of the ~400 guard sources: play.html (~80 page guards) is a hub, items.js (~12) is not. */
const HUB_AT = 25;

// ── MODE ──────────────────────────────────────────────────────────────────
/** Full sweep or gated, from the environment alone. */
export function decideMode(env) {
  if (env.HR_MUTANT_GATE === 'all') return { full: true, why: 'HR_MUTANT_GATE=all' };
  if (env.GITHUB_ACTIONS !== 'true') return { full: true, why: 'not a GitHub Actions run — local runs prove everything' };
  const ev = env.GITHUB_EVENT_NAME || '';
  if (ev === 'push' || ev === 'pull_request') return { full: false, event: ev };
  return { full: true, why: `the ${ev || 'unknown'} event is the full sweep` };
}

// ── THE DIFF ──────────────────────────────────────────────────────────────
const gitOut = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1e8 }).trim();
const gitOk = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).status === 0;
const ZERO = /^0+$/;
const norm = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** Deepen a shallow checkout enough to diff (trees only when the server allows it). */
/* actions/checkout leaves a depth-1 clone. History is fetched as commits and trees only
   (the remote becomes a promisor, so the few blobs the diff reads — the changed files'
   base side — come lazily; the repository is public, no credential is needed), 50 deep
   first, deepened once to DEPTH if the merge base is further back. A failure throws, and
   the caller fails safe to the full sweep. */
function fetchHistory(refspecs, depth) {
  if (gitOut(['rev-parse', '--is-shallow-repository']) !== 'true') {
    if (!gitOk(['fetch', '--no-tags', '--quiet', 'origin', ...refspecs])) throw new Error(`git fetch ${refspecs.join(' ')} failed`);
    return;
  }
  gitOk(['config', 'remote.origin.promisor', 'true']);
  gitOk(['config', 'remote.origin.partialclonefilter', 'blob:none']);
  const args = ['fetch', '--no-tags', '--quiet', `--depth=${depth}`, 'origin', ...refspecs];
  if (gitOk([...args.slice(0, 3), '--filter=blob:none', ...args.slice(3)])) return;
  if (!gitOk(args)) throw new Error(`git fetch --depth=${depth} ${refspecs.join(' ')} failed`);
}

/** { sha, how } — the commit this push is measured against. Throws when it cannot be found. */
export function ciBase(env) {
  const ev = env.GITHUB_EVENT_NAME;
  const head = env.GITHUB_SHA || gitOut(['rev-parse', 'HEAD']);
  if (ev === 'push' && env.GITHUB_REF_NAME === 'main') {
    let before = null;
    try { before = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).before || null; } catch { /* no event file */ }
    if (before && ZERO.test(before)) before = null;
    fetchHistory([`+${head}:refs/hr-gate/head`, ...(before ? [`+${before}:refs/hr-gate/before`] : [])], 2);
    if (before) return { sha: gitOut(['rev-parse', '--verify', `${before}^{commit}`]), how: 'the previous tip of main (the push\'s before)' };
    return { sha: gitOut(['rev-parse', '--verify', 'HEAD^']), how: 'HEAD^ (the push carried no before)' };
  }
  const branch = ev === 'pull_request' ? (env.GITHUB_BASE_REF || 'main') : 'main';
  const refspecs = [`+${head}:refs/hr-gate/head`, `+refs/heads/${branch}:refs/remotes/origin/${branch}`];
  const how = `the merge base of origin/${branch} and HEAD`;
  fetchHistory(refspecs, 50);
  try { return { sha: gitOut(['merge-base', `origin/${branch}`, 'HEAD']), how }; } catch { /* further back than 50 */ }
  fetchHistory(refspecs, DEPTH);
  return { sha: gitOut(['merge-base', `origin/${branch}`, 'HEAD']), how };
}

// ── THE SELECTION ─────────────────────────────────────────────────────────
/**
 * guard file -> why, for every guard the diff touches.
 * @param {string[]} changed
 * @param {{ base?: string|null, extraGuards?: string[], sources?: Map<string,string>, anchors?: boolean }} o
 */
export function selectGuards(changed, { base = null, extraGuards = [], sources = null, anchors = true } = {}) {
  const src = new Map(sources || guardSources(ROOT));
  /* A guard outside tests/ and tools/ .mjs (bash bump-version.sh) still has a source to read. */
  for (const g of extraGuards) {
    if (src.has(g)) continue;
    try { src.set(g, readFileSync(g.match(/^[A-Za-z]:|^\//) ? g : join(ROOT, g), 'utf8')); } catch { /* not a file */ }
  }
  /* A hub (named by more than HUB_AT guards) is judged by the mutants that anchor on it. */
  const out = new Map(touchedBy(changed, src, { hubAt: HUB_AT }));
  if (anchors && changed.length) {
    for (const s of scopedProofs(ROOT, { changed, base }).steps) {
      /* Its migration scope re-runs replay guards PLAINLY (arm null) — and plain runs always run here. */
      if (!s.arm || !PROOF_FLAG.test(s.arm)) continue;
      if (!out.has(s.guard)) out.set(s.guard, `a mutant anchors on ${s.because.slice(0, 2).join(', ')}`);
    }
  }
  return out;
}

/** Run or skip one command against a plan ({ full, why } or { selected }). */
export function decide(cmd, plan, guard = guardFileOf(cmd)) {
  const inner = unwrapGate(cmd);
  if (!PROOF_FLAG.test(inner)) return { run: true, why: 'a plain run — always runs' };
  if (plan.full) return { run: true, why: `full sweep: ${plan.why}` };
  if (!guard) return { run: true, why: 'the guard file could not be read from the command — runs (fail safe)' };
  const why = (plan.selected || {})[norm(guard)];
  return why ? { run: true, why: `touched: ${why}` } : { run: false, why: 'not touched by this diff' };
}

/** The job's plan; computed once (cached under $RUNNER_TEMP), always fails safe to the full sweep. */
export function planFor(env, { extraGuards = [] } = {}) {
  const mode = decideMode(env);
  if (mode.full) return mode;
  const key = createHash('sha256').update(JSON.stringify([env.GITHUB_SHA, env.GITHUB_EVENT_NAME, env.GITHUB_REF_NAME,
    env.GITHUB_BASE_REF, env.HR_MUTANT_GATE_FILES ?? null])).digest('hex').slice(0, 16);
  const cache = join(env.RUNNER_TEMP || tmpdir(), `hr-mutant-gate-${key}.json`);
  let plan = null;
  try { plan = JSON.parse(readFileSync(cache, 'utf8')); } catch { /* first command of the job */ }
  if (!plan) {
    try {
      let changed; let base = null; let how;
      if (env.HR_MUTANT_GATE_FILES !== undefined) {
        changed = env.HR_MUTANT_GATE_FILES.split(',').map((s) => s.trim()).filter(Boolean);
        how = 'HR_MUTANT_GATE_FILES';
      } else {
        const b = ciBase(env);
        base = b.sha; how = b.how;
        changed = changedFiles(ROOT, `${base}..HEAD`, { worktree: false });
      }
      plan = { full: false, base, how, changed, selected: {} };
    } catch (e) {
      plan = { full: true, why: `the diff could not be computed (${e.message.split('\n')[0]}) — fail safe` };
    }
    if (!plan.full) {
      try {
        plan.selected = Object.fromEntries(selectGuards(plan.changed, { base: plan.base }));
      } catch (e) {
        plan = { full: true, why: `the guard map could not be built (${e.message.split('\n')[0]}) — fail safe` };
      }
    }
    try { writeFileSync(cache, JSON.stringify(plan)); } catch { /* recomputed next time */ }
    if (plan.full) console.log(`mutant-gate: ${plan.why}`);
    else {
      const sel = Object.keys(plan.selected);
      console.log(`mutant-gate: ${env.GITHUB_EVENT_NAME} on ${env.GITHUB_REF_NAME || '?'} — base ${String(plan.base || '-').slice(0, 9)} `
        + `(${plan.how}); ${plan.changed.length} changed file(s); ${sel.length} guard(s) touched`);
      for (const f of plan.changed.slice(0, 40)) console.log(`mutant-gate:   changed ${f}`);
      if (plan.changed.length > 40) console.log(`mutant-gate:   … +${plan.changed.length - 40} more`);
    }
  }
  /* A wrapped guard outside the shared source map (bash bump-version.sh): judged on its own text. */
  if (!plan.full) {
    for (const g of extraGuards.map(norm)) {
      if (g in plan.selected || /^(tests|tools)\/.+\.mjs$/.test(g)) continue;
      let text = null;
      try { text = readFileSync(/^[A-Za-z]:|^\//.test(g) ? g : join(ROOT, g), 'utf8'); } catch { /* not a file */ }
      const why = text === null ? null : touchedBy(plan.changed, new Map([[g, text]])).get(g);
      if (why) plan.selected[g] = why;
    }
  }
  if (existsSync(cache)) plan.cachePath = cache;
  return plan;
}

// ── the CLI ───────────────────────────────────────────────────────────────
function gate(argv) {
  const guard = argv[1];
  const cmd = argv.join(' ');
  const plan = planFor(process.env, { extraGuards: guard ? [guard] : [] });
  const d = decide(cmd, plan, guard);
  if (!d.run) {
    console.log(`mutant-gate: SKIP  ${cmd} — ${d.why} (the nightly sweep runs it)`);
    return 0;
  }
  console.log(`mutant-gate: RUN   ${cmd} — ${d.why}`);
  /* The diff goes with it, so a guard with a long mutant list runs only the mutants the
     diff touches (tools/lib/mutant-scope.mjs); the full sweep hands over no scope. */
  const env = { ...process.env };
  delete env.HR_MUTANT_SCOPE;
  if (!plan.full && plan.cachePath) env.HR_MUTANT_SCOPE = plan.cachePath;
  const r = spawnSync(argv[0] === 'node' ? process.execPath : argv[0], argv.slice(1), { stdio: 'inherit', cwd: process.cwd(), env });
  if (r.error) { console.error(`mutant-gate: could not start ${argv[0]}: ${r.error.message}`); return 2; }
  return r.status === null ? 1 : r.status;
}

/** Every proof command registered in smoke.yml, with its job. */
export function registeredProofs(text = readFileSync(WORKFLOW, 'utf8')) {
  const out = [];
  for (const s of flatSteps(parseWorkflow(text))) for (const cmd of s.run) if (PROOF_FLAG.test(unwrapGate(cmd))) out.push({ cmd, job: s.job, step: s.name });
  return out;
}

function explain(argv) {
  const at = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
  const files = at('--files');
  let changed; let base = null;
  if (files !== null) changed = files.split(',').map((s) => s.trim()).filter(Boolean);
  else if (at('--range')) {
    base = gitOut(['rev-parse', at('--range').split('..')[0]]);
    changed = changedFiles(ROOT, at('--range'), { worktree: false });
  } else {
    base = gitOut(['merge-base', at('--base') || 'origin/main', 'HEAD']);
    changed = changedFiles(ROOT, `${base}..HEAD`, { worktree: false });
  }
  const proofs = registeredProofs();
  const guards = [...new Set(proofs.map((p) => guardFileOf(p.cmd)))];
  const plan = { full: false, selected: Object.fromEntries(selectGuards(changed, { base, extraGuards: guards })) };
  let n = 0;
  for (const p of proofs) {
    const d = decide(p.cmd, plan);
    if (d.run) n++;
    if (d.run || argv.includes('--all')) console.log(`${d.run ? 'RUN ' : 'skip'}  ${p.job.padEnd(20)} ${unwrapGate(p.cmd)}   (${d.why})`);
  }
  console.log(`\n${changed.length} changed file(s) → ${n} of ${proofs.length} registered proof command(s) run.`);
  return 0;
}

// ── --selftest ────────────────────────────────────────────────────────────
/* The properties, against an implementation; the real one must pass them all and
   every planted mutant must fail at least one. */
function properties(impl, proofs) {
  const fails = [];
  const expect = (c, m) => { if (!c) fails.push(m); };
  const find = (guard, flag) => {
    const p = proofs.find((x) => guardFileOf(x.cmd) === guard && unwrapGate(x.cmd).includes(flag));
    if (!p) throw Object.assign(new Error(`smoke.yml registers no "${guard} ${flag}" — the selftest's fixture moved`), { harness: true });
    return p.cmd;
  };
  const planOf = (changed) => ({ full: false, selected: Object.fromEntries(impl.selectGuards(changed, { extraGuards: proofs.map((p) => guardFileOf(p.cmd)) })) });
  const runs = (plan, cmd) => impl.decide(cmd, plan).run;

  /* 1. live-engine.js re-proves the two hunt guards that load it, and nothing unrelated. */
  const live = planOf(['src/hunt-view/live-engine.js']);
  expect(runs(live, find('tests/hunt-live.mjs', '--mutate')), 'a diff touching src/hunt-view/live-engine.js runs hunt-live --mutate');
  expect(runs(live, find('tests/hunt-scene-live.mjs', '--mutate')), 'a diff touching src/hunt-view/live-engine.js runs hunt-scene-live --mutate');
  expect(!runs(live, find('tests/chat-social.mjs', '--mutate')), 'a diff touching src/hunt-view/live-engine.js skips chat-social --mutate');
  /* 2. An empty diff runs no proof at all, and every plain run still runs. */
  const none = planOf([]);
  const ran = proofs.filter((p) => runs(none, p.cmd));
  expect(ran.length === 0, `a diff touching nothing runs no proof (ran ${ran.length}: ${ran.slice(0, 2).map((p) => unwrapGate(p.cmd)).join(' | ')})`);
  expect(runs(none, 'node tests/hunt-live.mjs'), 'a plain run always runs, even on an empty diff');
  expect(runs(none, `${GATE_PREFIX}node tests/hunt-live.mjs`), 'a plain run wrapped in the gate still runs');
  /* 3. A guard's own file re-proves it; a shared helper re-proves its importers. */
  const own = planOf(['tests/chat-social.mjs']);
  expect(runs(own, find('tests/chat-social.mjs', '--mutate')) && !runs(own, find('tests/hunt-live.mjs', '--mutate')),
    'a diff touching tests/chat-social.mjs runs its --mutate and not hunt-live\'s');
  const helper = planOf(['tests/_chrome.mjs']);
  expect(runs(helper, find('tests/client-boot.mjs', '--mutate')), 'a diff touching tests/_chrome.mjs runs client-boot --mutate (it imports the helper)');
  /* 4. The modes: the nightly and a manual run are the full sweep; a push or PR is gated; local runs prove everything. */
  const gh = (ev) => impl.decideMode({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: ev });
  expect(gh('schedule').full && gh('workflow_dispatch').full, 'schedule and workflow_dispatch are the full sweep');
  expect(!gh('push').full && !gh('pull_request').full, 'push and pull_request are gated');
  expect(impl.decideMode({}).full, 'outside GitHub Actions everything runs');
  const full = gh('schedule');
  expect(proofs.every((p) => impl.decide(p.cmd, full).run), 'the full sweep runs every registered proof');
  return fails;
}

async function selftest() {
  const proofs = registeredProofs();
  /* Memoised: the anchor catalogue costs seconds, and every mutant re-asks the same diffs. */
  const memo = new Map();
  const memoSelect = (ch, o) => {
    const k = JSON.stringify(ch);
    if (!memo.has(k)) memo.set(k, selectGuards(ch, o));
    return memo.get(k);
  };
  const real = { decideMode, decide, selectGuards: memoSelect };
  const base = properties(real, proofs);
  if (base.length) {
    console.log('mutant-gate --selftest: the REAL gate fails its own properties:');
    for (const f of base) console.log(`  FAIL  ${f}`);
    return 1;
  }
  console.log(`mutant-gate --selftest — the real gate holds every property over ${proofs.length} registered proof command(s)\n`);
  const mutants = [
    ['the map goes blind (nothing is ever touched)', { ...real, selectGuards: () => new Map() }],
    ['the gate runs every proof whatever the diff', { ...real, decide: () => ({ run: true, why: 'mutant' }) }],
    ['the nightly is gated like a push', { ...real, decideMode: (env) => ({ ...decideMode(env), full: env.GITHUB_ACTIONS !== 'true' }) }],
    ['a plain run is gated like a proof', { ...real, decide: (cmd, plan, g) => (PROOF_FLAG.test(unwrapGate(cmd)) || plan.full
      ? decide(cmd, plan, g) : { run: !!plan.selected[guardFileOf(cmd)], why: 'mutant' }) }],
    ['a change under tests/ is ignored (a guard\'s own edit never re-proves it)',
      { ...real, selectGuards: (ch, o) => real.selectGuards(ch.filter((f) => !f.startsWith('tests/')), o) }],
  ];
  let bad = 0;
  for (const [label, impl] of mutants) {
    const f = properties(impl, proofs);
    if (f.length) console.log(`  CAUGHT   ${label}\n           ${f[0]}`);
    else { bad++; console.log(`  MISSED   ${label} — every property still held`); }
  }

  /* hunt-screen's mutant scope (tools/lib/mutant-scope.mjs): an edit to analyzer.js runs exactly
     the mutants that patch analyzer.js; an edited entry runs that entry; any other edit to the
     guard or a tests/ helper it loads runs all; no scope runs all. */
  {
    const HS = 'tests/hunt-screen.mjs';
    const head = readFileSync(join(ROOT, HS), 'utf8').replace(/\r\n/g, '\n');
    const list = parseMutants(splitMutants(head).block);
    const sources = guardSources(ROOT);
    const ANALYZER = 'src/shell/widgets/analyzer.js';
    const want = list.filter((m) => m[1] === ANALYZER).map((m) => m[0]);
    const victim = list.find((m) => m[1] !== ANALYZER);
    const edited = head.replace(JSON.stringify(victim[0]).slice(1, -1), `${victim[0]} (old)`);
    const harnessEdit = head.replace('const MUTANTS = [', '// an older harness\nconst MUTANTS = [');
    const run = (fn, changed, baseSource) => fn({ guard: HS, root: ROOT, changed, base: null, headSource: head, baseSource, sources });
    const same = (s, names) => !s.all && s.keep.size === names.length && names.every((n) => s.keep.has(n));
    const scopeChecks = (fn) => [
      [want.length > 0 && same(run(fn, [ANALYZER]), want), `an edit to ${ANALYZER} runs only its ${want.length} analyzer mutant(s) of ${list.length}`],
      [same(run(fn, [HS], edited), [victim[0]]), 'an edited (renamed) mutant entry runs that mutant alone'],
      [run(fn, [HS], harnessEdit).all, 'an edit to hunt-screen outside MUTANTS runs every mutant'],
      [run(fn, ['tests/_client-harness.mjs']).all, 'an edit to tests/_client-harness.mjs (the harness it imports) runs every mutant'],
      [run(fn, null).all, 'no scope (nightly, manual, local) runs every mutant'],
      [same(run(fn, ['src/shell/chat.js']), []), 'an edit no mutant patches runs none'],
    ];
    for (const [ok, label] of scopeChecks(scopeMutants)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} scope: ${label}`); }
    const scopeMutantsOf = [
      ['every mutant runs whatever the diff', () => ({ all: true, why: 'mutant' })],
      ['the patched file is never read', (o) => scopeMutants({ ...o, changed: o.changed && o.changed.filter((f) => f.startsWith('tests/')) })],
      ['an edited entry is not compared with the base', (o) => scopeMutants({ ...o, baseSource: o.headSource })],
      ['the harness is ignored', (o) => { const s = scopeMutants(o); return s.all && o.changed ? { all: false, keep: new Set(), why: new Map() } : s; }],
    ];
    for (const [label, fn] of scopeMutantsOf) {
      const missed = scopeChecks(fn).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} scope mutant: ${label}`);
    }
  }

  /* The cache-buster: a release's `?v=` bump is not a change; anything else in the same file is. */
  const hdr = (p) => `diff --git a/${p} b/${p}\nindex 1..2 100644\n--- a/${p}\n+++ b/${p}\n`;
  const bump = `${hdr('src/a.js')}@@ -1 +1 @@\n-import x from './b.js?v=0.2.22';\n+import x from './b.js?v=0.2.23';\n`
    + `${hdr('src/build-info.js')}@@ -16,2 +16,2 @@\n-  version:   '0.2.22',\n-  cache:     '0.2.22',\n+  version:   '0.2.23',\n+  cache:     '0.2.23',\n`
    + `${hdr('src/c.js')}@@ -1 +1 @@\n-import y from './d.js?v=0.2.22';\n+import y from './e.js?v=0.2.23';\n`
    + `${hdr('m.sql')}@@ -3,0 +3 @@\n--- a removed comment\n@@ -9 +9 @@\n-x ?v=1\n+x ?v=2\n`;
  const busterChecks = (fn) => {
    const s = fn(bump);
    return [
      [s.has('src/a.js') && s.has('src/build-info.js'), 'a `?v=` bump (and build-info\'s version) is not a change'],
      [!s.has('src/c.js'), 'a bump that also renames the import is a change'],
      [!s.has('m.sql'), 'a removed `-- comment` line after @@ is content, not a header'],
    ];
  };
  for (const [ok, label] of busterChecks(cacheBusterOnly)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} cache-buster: ${label}`); }
  for (const [label, fn] of [['the detector never fires', () => new Set()],
    ['the detector calls every diffed file bump-only', (t) => new Set([...t.matchAll(/^diff --git a\/\S+ b\/(\S+)$/gm)].map((x) => x[1]))]]) {
    const missed = busterChecks(fn).every(([ok]) => ok);
    if (missed) bad++;
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} cache-buster mutant: ${label}`);
  }

  /* The CLI, end to end: a skipped proof prints why and exits 0 without running; a
     touched proof runs and its exit code comes back; the plan is cached per job. */
  const dir = mkdtempSync(join(tmpdir(), 'hr-mutant-gate-'));
  try {
    const probe = join(dir, 'probe-guard.mjs');
    writeFileSync(probe, 'process.exit(process.argv.includes("--mutate") ? 7 : 3);\n');
    const env = (files, extra = {}) => ({ ...process.env, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'release/v0.0.0',
      GITHUB_SHA: `selftest-${files}`, RUNNER_TEMP: dir, HR_MUTANT_GATE_FILES: files, HR_MUTANT_GATE: '', ...extra });
    const cli = (args, e) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: ROOT, encoding: 'utf8', env: e });
    const probeKey = probe.replace(/\\/g, '/');
    const checks = [
      ['an untouched proof is skipped, says why, exits 0', () => {
        const r = cli(['node', probe, '--mutate'], env(''));
        return r.status === 0 && /SKIP .*not touched by this diff/.test(r.stdout);
      }],
      ['a touched proof runs and its exit code comes back', () => {
        const r = cli(['node', probe, '--mutate'], env(probeKey));
        return r.status === 7 && /RUN .*touched: changed/.test(r.stdout);
      }],
      ['a plain run on an empty diff runs', () => cli(['node', probe], env('')).status === 3],
      ['the nightly runs the untouched proof', () => cli(['node', probe, '--mutate'], env('', { GITHUB_EVENT_NAME: 'schedule' })).status === 7],
      ['a gated run hands the guard its diff (HR_MUTANT_SCOPE); the nightly hands none', () => {
        const sp = join(dir, 'probe-scope.mjs');
        writeFileSync(sp, 'import { readFileSync } from "node:fs";\nconst p = process.env.HR_MUTANT_SCOPE;\n'
          + 'process.exit(!p ? 6 : JSON.parse(readFileSync(p, "utf8")).changed.length === 1 ? 5 : 4);\n');
        const k = sp.replace(/\\/g, '/');
        return cli(['node', sp, '--mutate'], env(k)).status === 5
          && cli(['node', sp, '--mutate'], env(k, { GITHUB_EVENT_NAME: 'schedule', HR_MUTANT_SCOPE: join(dir, 'stale.json') })).status === 6;
      }],
      ['a push whose base cannot be found fails safe to the full sweep', () => {
        const e = env('', { GITHUB_SHA: 'selftest-nobase', GITHUB_EVENT_PATH: join(dir, 'missing.json') });
        delete e.HR_MUTANT_GATE_FILES;
        e.GITHUB_REF_NAME = 'main';
        e.GIT_DIR = join(dir, 'not-a-repo');
        const r = cli(['node', probe, '--mutate'], e);
        return r.status === 7 && /fail safe/.test(r.stdout);
      }],
    ];
    for (const [label, fn] of checks) {
      const ok = fn();
      if (!ok) bad++;
      console.log(`  ${ok ? 'ok      ' : 'FAILED  '} CLI: ${label}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }

  console.log(`\n  ${bad ? `${bad} check(s) FAILED` : `all ${mutants.length} mutants caught, the CLI holds end to end`}`);
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  let code;
  try {
    if (argv[0] === 'node' || argv[0] === 'bash') code = gate(argv);
    else if (argv.includes('--selftest')) code = await selftest();
    else if (argv.includes('--explain')) code = explain(argv);
    else { console.error('usage: node tools/mutant-gate.mjs node <guard> --mutate … | --explain [--base REF | --files a,b] [--all] | --selftest'); code = 2; }
  } catch (e) {
    console.error(`mutant-gate: ${e.message}`);
    code = e.harness ? 2 : 1;
  }
  process.exit(code);
}
