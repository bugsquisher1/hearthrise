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
//   schedule / workflow_dispatch / local runs everything (the full sweep); a release or next
//                                        started by hand is gated like its push (MODE)
//   push / pull_request                  runs when the diff touches the guard file, a
//                                        file it loads (tools/lib/guard-deps.mjs — the
//                                        mapping guards-for uses) or a file one of its
//                                        mutants anchors on (tools/guard-anchors.mjs). A
//                                        hub file named by >25 guards (play.html) counts
//                                        only through the mutants that anchor on a LINE
//                                        the diff really changed (2026-10-26: a release
//                                        that adds a modulepreload line re-proved every
//                                        guard with any literal anywhere in play.html).
//   The release cache-buster (`?v=` and build-info's version/date) is not a change —
//   not as a file (guard-deps cacheBusterOnly) and not as a line (changedLines).
// A skipped command prints why; nothing is skipped silently. When the diff cannot be
// computed (a shallow clone that will not deepen, no merge base, a commit main already
// holds, so the diff is empty and says nothing), it FAILS SAFE: the full sweep, said out loud.
//
// THE HISTORY (tools/lib/ci-history.mjs). A job the last nightly did not prove green runs
// every proof it holds until a sweep proves it; a nightly that cannot be read, or is over
// 48 h old, makes every job full. A release or next push that went green in full is a sweep
// of that job, so it goes back to its diff. Main's push skips the proofs a green release run already
// ran on the very same commit; its plain runs still run. A job green at an earlier commit
// of this release branch is measured from that commit, so a fix-forward re-proves the fix.
//
// A REHEARSAL. `gh workflow run smoke.yml --ref <lane> -f rehearse_range=<sha>..<sha>` (not
// on main) runs this branch's guards under the plan an old release's diff gets: how to
// measure a change to this gate without touching release/** or main. It gates nothing.
// `-f rehearse_range=full` is the full sweep on any branch.
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
//   node tools/mutant-gate.mjs --rules-from <run log>   refresh tests/<guard>.mutant-rules.json
//                                     from a full run (`gh run view <id> --log`)
//
// mutant-anchors: .github/workflows/smoke.yml tools/lib/guard-deps.mjs tools/guard-anchors.mjs tools/lib/mutant-scope.mjs tools/lib/ci-history.mjs
// ════════════════════════════════════════════════════════════════════════
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PROOF_FLAG, GATE_PREFIX, unwrapGate, guardFileOf, touchedBy, guardSources, committedDiff, cacheBusterOnly, changedLines,
} from './lib/guard-deps.mjs';
import { scopedProofs, committedTexts, anchorLinesIn } from './guard-anchors.mjs';
import { scopeMutants, splitMutants, parseMutants, classifyRuleEdit } from './lib/mutant-scope.mjs';
import { readHistory, readNightly, historyPolicy, lastGreenRun, lastFullGreen, githubReader, STALE_MS, WORKFLOW as WORKFLOW_PATH } from './lib/ci-history.mjs';
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
  /* A release or next started by hand because its push started no run (an existing SHA on a new ref): the
     gate its push would have had. v0.2.101-103 were dispatched and ran as full sweeps, 76-78 min each against
     35-53 for a push. `-f rehearse_range=full` still asks for the sweep. */
  const shipRef = /^release\//.test(env.GITHUB_REF_NAME || '') || env.GITHUB_REF_NAME === 'next';
  if (ev === 'workflow_dispatch' && env.HR_MUTANT_GATE_RANGE === 'full') return { full: true, why: 'the dispatch asked for the full sweep' };
  if (ev === 'workflow_dispatch' && shipRef && !env.HR_MUTANT_GATE_RANGE) return { full: false, event: ev, asPush: true };
  if (ev === 'workflow_dispatch' && env.HR_MUTANT_GATE_RANGE && env.GITHUB_REF_NAME !== 'main') return { full: false, event: ev, rehearsal: true };
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
  let sha = null;
  try { sha = gitOut(['merge-base', `origin/${branch}`, 'HEAD']); } catch { /* further back than 50 */ }
  if (!sha) { fetchHistory(refspecs, DEPTH); sha = gitOut(['merge-base', `origin/${branch}`, 'HEAD']); }
  usableBase(sha, gitOut(['rev-parse', 'HEAD']));
  return (ev === 'push' && greenBase(env)) || { sha, how };
}

/* A job green at an earlier commit of this branch is measured from there (ci-history.mjs). Not
   when the workflow moved since: a step that changed jobs was not proved by this one's green.
   Any doubt keeps the release's whole diff. */
function greenBase(env) {
  try {
    const usable = (sha) => {
      if (!/^[0-9a-f]{40}$/.test(sha) || !gitOk(['cat-file', '-e', `${sha}^{commit}`])) {
        fetchHistory([`+${sha}:refs/hr-gate/green`], 50);
      }
      if (!gitOk(['merge-base', '--is-ancestor', sha, 'HEAD'])) return false;
      return !committedDiff(ROOT, `${sha}..HEAD`).files.includes(WORKFLOW_PATH);
    };
    const g = lastGreenRun({ job: env.GITHUB_JOB, ref: env.GITHUB_REF_NAME, own: env.GITHUB_RUN_ID, usable, get: githubReader(env) });
    return g ? { sha: g.sha, how: `job ${env.GITHUB_JOB} was green here in run ${g.id}` } : null;
  } catch { return null; }
}

/* Main already holds this commit (a release and main pushed together: run 41327717372 went
   green in 22 min with every proof skipped). The diff is empty and proves nothing. */
export function usableBase(mergeBase, head) {
  if (mergeBase === head) throw new Error('main already holds this commit, so its diff is empty');
  return mergeBase;
}

/* A rehearsal's two ends, fetched by full SHA. */
function rehearsalRange(range) {
  const m = /^([0-9a-f]{40})\.\.([0-9a-f]{40})$/.exec(range);
  if (!m) throw new Error(`rehearse_range must be <40 hex>..<40 hex>, got ${range}`);
  fetchHistory([`+${m[1]}:refs/hr-gate/before`, `+${m[2]}:refs/hr-gate/tip`], 1);
  return { base: m[1], tip: m[2] };
}

// ── THE SELECTION ─────────────────────────────────────────────────────────
/**
 * guard file -> why, for every guard the diff touches.
 * @param {string[]} changed
 * @param {{ base?: string|null, extraGuards?: string[], sources?: Map<string,string>, anchors?: boolean,
 *   regions?: Map<string,{whole:boolean,base:number[][],head:number[][]}>|null,
 *   read?: (rel: string) => { head: string|null, base: string|null } }} o
 *   `regions` (changedLines' map of the same diff) turns on the line view for the hubs;
 *   without it a hub is judged whole-file, as before.
 */
export function selectGuards(changed, { base = null, extraGuards = [], sources = null, anchors = true, regions = null, read = undefined } = {}) {
  const src = new Map(sources || guardSources(ROOT));
  /* A guard outside tests/ and tools/ .mjs (bash bump-version.sh) still has a source to read. */
  for (const g of extraGuards) {
    if (src.has(g)) continue;
    try { src.set(g, readFileSync(g.match(/^[A-Za-z]:|^\//) ? g : join(ROOT, g), 'utf8')); } catch { /* not a file */ }
  }
  /* A hub (named by more than HUB_AT guards) is judged by the mutants that anchor on it —
     on the lines the diff really changed (guard-anchors' line view), when the diff has them. */
  const hubs = [];
  const out = new Map(touchedBy(changed, src, { hubAt: HUB_AT, hubs }));
  if (anchors && changed.length) {
    const lines = regions ? { files: hubs, regions, read } : null;
    for (const s of scopedProofs(ROOT, { changed, base, lines }).steps) {
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
  if (plan.proved) return { run: false, why: `run ${plan.proved.id} on ${plan.proved.branch} proved this exact commit` };
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
    env.GITHUB_BASE_REF, env.HR_MUTANT_GATE_FILES ?? null, env.HR_GATE_HISTORY ?? null, env.GITHUB_JOB ?? null])).digest('hex').slice(0, 16);
  const cache = join(env.RUNNER_TEMP || tmpdir(), `hr-mutant-gate-${key}.json`);
  let plan = null;
  try { plan = JSON.parse(readFileSync(cache, 'utf8')); } catch { /* first command of the job */ }
  if (!plan) {
    /* The selftest's diff is hermetic unless it hands over a history; a rehearsal has no release to block. */
    const asks = !mode.rehearsal && (env.HR_MUTANT_GATE_FILES === undefined || env.HR_GATE_HISTORY);
    const policy = asks ? historyPolicy(readHistory(env), { job: env.GITHUB_JOB, event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF_NAME, now: Date.now() }) : {};
    if (policy.sweptBy) console.log(`mutant-gate: job ${env.GITHUB_JOB} went green in full in run ${policy.sweptBy.id} (${policy.sweptBy.branch}): back to its diff`);
    if (policy.full) plan = { full: true, why: policy.why };
    else if (policy.proved) plan = { full: false, proved: policy.proved, selected: {} };
    if (plan) {
      try { writeFileSync(cache, JSON.stringify(plan)); } catch { /* recomputed next time */ }
      console.log(plan.full ? `mutant-gate: ${plan.why}` : `mutant-gate: run ${plan.proved.id} on ${plan.proved.branch} proved this exact commit; plain runs only`);
      return plan;
    }
    try {
      let changed; let base = null; let how; let regions = null; let tip = null;
      if (mode.rehearsal) {
        ({ base, tip } = rehearsalRange(env.HR_MUTANT_GATE_RANGE));
        how = `a rehearsal of ${env.HR_MUTANT_GATE_RANGE}`;
        ({ files: changed, regions } = committedDiff(ROOT, `${base}..${tip}`));
      } else if (env.HR_MUTANT_GATE_FILES !== undefined) {
        changed = env.HR_MUTANT_GATE_FILES.split(',').map((s) => s.trim()).filter(Boolean);
        how = 'HR_MUTANT_GATE_FILES';
      } else {
        const b = ciBase(env);
        base = b.sha; how = b.how;
        ({ files: changed, regions } = committedDiff(ROOT, `${base}..HEAD`));
      }
      plan = { full: false, base, tip, how, changed, selected: {} };
      /* The line map is used once, here; the cached plan keeps only what the guards read. */
      Object.defineProperty(plan, 'regions', { value: regions, enumerable: false });
    } catch (e) {
      plan = { full: true, why: `the diff could not be computed (${e.message.split('\n')[0]}) — fail safe` };
    }
    if (!plan.full) {
      try {
        const read = plan.tip ? (rel) => committedTexts(ROOT, plan.base, rel, plan.tip) : undefined;
        plan.selected = Object.fromEntries(selectGuards(plan.changed, { base: plan.base, regions: plan.regions, read }));
      } catch (e) {
        plan = { full: true, why: `the guard map could not be built (${e.message.split('\n')[0]}) — fail safe` };
      }
    }
    try { writeFileSync(cache, JSON.stringify(plan)); } catch { /* recomputed next time */ }
    if (plan.full) console.log(`mutant-gate: ${plan.why}`);
    else {
      const sel = Object.keys(plan.selected);
      console.log(`mutant-gate: ${mode.event} on ${env.GITHUB_REF_NAME || '?'} — base ${String(plan.base || '-').slice(0, 9)} `
        + `(${plan.how}); ${plan.changed.length} changed file(s); ${sel.length} guard(s) touched`);
      for (const f of plan.changed.slice(0, 40)) console.log(`mutant-gate:   changed ${f}`);
      if (plan.changed.length > 40) console.log(`mutant-gate:   … +${plan.changed.length - 40} more`);
    }
  }
  /* A wrapped guard outside the shared source map (bash bump-version.sh): judged on its own text. */
  if (!plan.full && !plan.proved) {
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
  let changed; let base = null; let regions = null; let read;
  if (files !== null) changed = files.split(',').map((s) => s.trim()).filter(Boolean);
  else if (at('--range')) {
    const [a, b] = at('--range').split('..');
    base = gitOut(['rev-parse', a]);
    const tip = gitOut(['rev-parse', b || 'HEAD']);
    ({ files: changed, regions } = committedDiff(ROOT, `${base}..${tip}`));
    /* The tip's texts, not HEAD's: the regions describe base..tip. */
    read = (rel) => committedTexts(ROOT, base, rel, tip);
  } else {
    base = gitOut(['merge-base', at('--base') || 'origin/main', 'HEAD']);
    ({ files: changed, regions } = committedDiff(ROOT, `${base}..HEAD`));
  }
  const proofs = registeredProofs();
  const guards = [...new Set(proofs.map((p) => guardFileOf(p.cmd)))];
  const plan = { full: false, selected: Object.fromEntries(selectGuards(changed, { base, extraGuards: guards, regions, read })) };
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
// ── --rules-from ──────────────────────────────────────────────────────────
/* Every opted-in guard's mutants -> the rule that caught them, from a full run's log. The
   sidecars only narrow a rule edit; a mutant missing from one always runs. */
function rulesFrom(logPath) {
  const log = readFileSync(logPath, 'utf8').split('\n');
  const caught = new Map();
  /* The rule's id alone: phone-touch reads "PH-9 [844x390]", and a rule edit names PH-9. */
  for (const l of log) { const m = /✓ (.*) — caught \(([^)]+)\)\s*$/.exec(l); if (m) caught.set(m[1], m[2].split(' ')[0]); }
  for (const [guard, src] of guardSources(ROOT)) {
    const raw = readFileSync(join(ROOT, guard), 'utf8');
    if (src === null || !/^\/\/ mutant-rule-functions:/m.test(raw)) continue;
    const split = splitMutants(raw);
    if (!split) continue;
    const names = parseMutants(split.block).map((m) => m[0]);
    const rows = names.filter((n) => caught.has(n)).sort().map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(caught.get(n))}`);
    writeFileSync(join(ROOT, guard.replace(/\.mjs$/, '.mutant-rules.json')), `{\n${rows.join(',\n')}\n}\n`);
    console.log(`  ${guard}: ${rows.length} of ${names.length} mutants on record`);
  }
  return 0;
}

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
  const byHand = (ref, range = '') => impl.decideMode({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_NAME: ref, HR_MUTANT_GATE_RANGE: range });
  expect(!byHand('release/v0.2.101').full && !byHand('next').full, 'a release or next started by hand, no range, is gated like its push');
  expect(byHand('main').full && byHand('lane/x').full, 'a dispatch on main or a lane with no range is the full sweep');
  expect(byHand('release/v0.2.101', 'full').full && byHand('main', 'full').full, 'rehearse_range=full asks for the full sweep anywhere');
  expect(impl.decideMode({}).full, 'outside GitHub Actions everything runs');
  const full = gh('schedule');
  expect(proofs.every((p) => impl.decide(p.cmd, full).run), 'the full sweep runs every registered proof');
  return fails;
}

/* THE LINE VIEW, END TO END (2026-10-26). The real play.html in a scratch repository, and four
   commits on it: every `?v=` bumped (BUMP); the bump plus one new modulepreload line (PRELOAD —
   what a release that adds a module looks like); one line a guard anchors on edited, its anchor
   kept (EDIT); that line deleted (DELETE). The guard G is DERIVED, never named: a registered
   proof the whole-file view runs on PRELOAD and the line view skips. Returns the failure count. */
async function lineViewSelftest() {
  const HUB = 'play.html';
  const text = readFileSync(join(ROOT, HUB), 'utf8').replace(/\r\n/g, '\n');
  const PRE = '<link rel="modulepreload" href="';
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith(PRE));
  if (at < 0) { console.log(`  FAILED   line view: ${HUB} has no "${PRE}" line — the fixture moved`); return 1; }
  const bump = (t) => t.replace(/\?v=[0-9A-Za-z._-]+/g, '?v=9.9.9');
  const dir = mkdtempSync(join(tmpdir(), 'hr-gate-lines-'));
  const g = (...a) => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8', maxBuffer: 1e8 });
    if (r.status !== 0) throw Object.assign(new Error(`git ${a.join(' ')}: ${r.stderr}`), { harness: true });
    return r.stdout.trim();
  };
  let bad = 0;
  try {
    g('init', '-q', '-b', 'main'); g('config', 'user.email', 'selftest@example.test'); g('config', 'user.name', 'selftest');
    g('config', 'commit.gpgsign', 'false'); g('config', 'core.autocrlf', 'false');
    const commit = (t, from) => {
      if (from) g('checkout', '-q', from);
      writeFileSync(join(dir, HUB), t); g('add', '-A'); g('commit', '-qm', 'x', '--allow-empty'); return g('rev-parse', 'HEAD');
    };
    const base = commit(text);
    const ins = [...lines]; ins.splice(at + 1, 0, `${PRE}src/zz-gate-probe.js?v=9.9.9">`);
    const preload = commit(bump(ins.join('\n')), base);
    const sources = guardSources(ROOT);
    const extraGuards = registeredProofs().map((p) => guardFileOf(p.cmd));
    const real = {
      diff: (b, tip) => committedDiff(dir, `${b}..${tip}`),
      read: (b, tip) => (rel) => committedTexts(dir, b, rel, tip),
    };
    const memo = new Map();
    const select = (key, d, read) => {
      if (!memo.has(key)) memo.set(key, new Set(selectGuards(d.files, { base: null, sources, extraGuards, regions: d.regions, read }).keys()));
      return memo.get(key);
    };
    /* The whole-file view of PRELOAD (no regions) — what the gate did before this lane. */
    const whole = new Set(selectGuards([HUB], { base: null, sources, extraGuards }).keys());
    const preD = real.diff(base, preload);
    const preLine = select('real:preload', preD, real.read(base, preload));
    const skipped = [...whole].filter((x) => !preLine.has(x)).sort();
    const G = skipped.map((x) => ({ guard: x, at: anchorLinesIn(ROOT, x, text) })).find((x) => x.at.length);
    if (!G) { console.log('  FAILED   line view: no guard the whole-file view runs on PRELOAD is skipped by the line view'); return 1; }
    const L = G.at[0];
    const edited = [...lines]; edited[L - 1] += ' <!-- gate probe -->';
    const edit = commit(edited.join('\n'), base);
    const dropped = lines.filter((_, i) => i !== L - 1);
    const del = commit(dropped.join('\n'), base);
    const bumped = commit(bump(text), base);
    const onInserted = [...whole].filter((x) => anchorLinesIn(ROOT, x, bump(ins.join('\n'))).includes(at + 2));

    /* The properties, against an implementation { diff, read } (the line map and the texts). */
    const props = (impl, tag) => {
      const out = [];
      const d0 = impl.diff(base, bumped);
      out.push([!d0.files.includes(HUB), `BUMP: a diff that only bumps every \`?v=\` in ${HUB} changes no file (files: ${d0.files.join(', ') || 'none'})`]);
      if (!out[0][0]) return out;
      const pl = tag === 'real' ? preLine : select(`${tag}:preload`, impl.diff(base, preload), impl.read(base, preload));
      out.push([[...whole].some((x) => !pl.has(x)) && onInserted.every((x) => pl.has(x)),
        `PRELOAD: ${HUB} gains one modulepreload line — the ${onInserted.length} guard(s) anchored on that line run (${onInserted.slice(0, 2).join(', ')}), `
        + `${G.guard} (anchored on line ${L}) does not`]);
      if (!out[1][0]) return out;
      out.push([select(`${tag}:edit`, impl.diff(base, edit), impl.read(base, edit)).has(G.guard), `EDIT: line ${L}, which ${G.guard} anchors on, edited (its anchor kept) — ${G.guard} runs`]);
      if (!out[2][0]) return out;
      out.push([select(`${tag}:del`, impl.diff(base, del), impl.read(base, del)).has(G.guard), `DELETE: line ${L} removed — ${G.guard} runs`]);
      return out;
    };
    for (const [ok, label] of props(real, 'real')) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} line view: ${label}`); }
    const strip = (d, side) => ({ ...d, regions: new Map([...d.regions].map(([k, v]) => [k, { ...v, [side]: [] }])) });
    const mutants = [
      ['the line view is off (a hub is judged whole-file)', { ...real, diff: (b, t) => ({ ...real.diff(b, t), regions: null }) }],
      ['a `?v=` bump is a changed line', { ...real, diff: (b, t) => {
        const regions = changedLines(g('diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', `${b}..${t}`).replace(/\?v=/g, '?w='));
        return { files: [...regions].filter(([, r]) => r.whole || r.base.length || r.head.length).map(([p]) => p), regions };
      } }],
      ['the changed lines are never consulted (only anchor counts)', { ...real, diff: (b, t) => strip(strip(real.diff(b, t), 'head'), 'base') }],
      ['the base side is never read', { diff: (b, t) => strip(real.diff(b, t), 'base'),
        read: (b, t) => (rel) => { const x = real.read(b, t)(rel); return { head: x.head, base: x.head }; } }],
    ];
    for (const [label, impl] of mutants) {
      const caught = props(impl, label).some(([ok]) => !ok);
      if (!caught) bad++;
      console.log(`  ${caught ? 'CAUGHT  ' : 'MISSED  '} line-view mutant: ${label}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return bad;
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
    ['a release started by hand is the full sweep again (v0.2.101-103, 77 min each)',
      { ...real, decideMode: (env) => (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && !env.HR_MUTANT_GATE_RANGE ? { full: true, why: 'mutant' } : decideMode(env)) }],
    ['every dispatch is gated, main too', { ...real, decideMode: (env) => (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.HR_MUTANT_GATE_RANGE !== 'full'
      ? { full: false, event: 'workflow_dispatch', asPush: true } : decideMode(env)) }],
    ['rehearse_range=full is read as a range', { ...real, decideMode: (env) => decideMode(env.HR_MUTANT_GATE_RANGE === 'full' ? { ...env, HR_MUTANT_GATE_RANGE: 'x..y' } : env) }],
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
    const harnessEdit = head.replace('function scripted() {', 'function scripted() {\n  const older = 1;');
    const runnerEdit = head.replace('async function main() {', 'async function main() {\n  const older = 1;');
    const commentEdit = head.replace('async function main() {', '// an older comment\nasync function main() {');
    const run = (fn, changed, baseSource) => fn({ guard: HS, root: ROOT, changed, base: null, headSource: head, baseSource, sources });
    const same = (s, names) => !s.all && s.keep.size === names.length && names.every((n) => s.keep.has(n));
    /* what a runner edit ran besides its canaries: a mutant renamed or added with no row in the sidecar (v0.2.111) */
    const beyond = (s) => (s.all || !s.why ? [] : [...s.why].filter(([, w]) => !/^a canary/.test(w)).map(([n, w]) => `"${n}" (${w})`));
    const runnerSays = (s) => (beyond(s).length ? ` — it also ran ${beyond(s).join(', ')}: give it its row in ${HS.replace(/\.mjs$/, '.mutant-rules.json')}` : '');
    const scopeChecks = (fn) => [
      [want.length > 0 && same(run(fn, [ANALYZER]), want), `an edit to ${ANALYZER} runs only its ${want.length} analyzer mutant(s) of ${list.length}`],
      [same(run(fn, [HS], edited), [victim[0]]), 'an edited (renamed) mutant entry runs that mutant alone'],
      [run(fn, [HS], harnessEdit).all, 'an edit to a hunt-screen helper runs every mutant'],
      ((s) => [!s.all && s.keep.size === 3, `an edit to the loop that plants and judges runs the three canaries${runnerSays(s)}`])(run(fn, [HS], runnerEdit)),
      [run(fn, ['tests/_client-harness.mjs']).all, 'an edit to tests/_client-harness.mjs (the harness it imports) runs every mutant'],
      [run(fn, null).all, 'no scope (nightly, manual, local) runs every mutant'],
      [same(run(fn, ['src/shell/chat.js']), []), 'an edit no mutant patches runs none'],
      [same(run(fn, [HS], commentEdit), []), 'a comment outside MUTANTS moves no mutant'],
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

    /* THE RULE EDIT, on the real guard: the edited rule's mutants run, a mutant with no rule on
       record runs, three canaries run, and everything it cannot classify runs all of them. */
    const lines = head.split('\n');
    const start = lines.findIndex((l) => l.trim() === '/* mutant-rules-start */');
    const ruleLine = lines.find((l, i) => i > start && /fails\.push\('HS-13 /.test(l) && (l.match(/\bHS-\d+/g) || []).length === 1);
    const helperLine = lines.slice(0, start).reverse().find((l) => /^ {2,}const \w+ = /.test(l));
    const recorded = Object.fromEntries(list.slice(1).map((m, i) => [m[0], i % 2 ? 'HS-13' : 'HS-999']));
    const edited13 = head.replace(ruleLine, `${ruleLine} `);
    const helperEdit = head.replace(helperLine, `${helperLine} `);
    const statementEdit = `${head}\nglobalThis.older = 1;\n`;
    const noHeader = head.replace(/^\/\/ mutant-rule-functions:.*\n/m, '');
    const ruleRun = (fn, o) => fn({ guard: HS, root: ROOT, changed: [HS], base: null, sources, rules: recorded, ...o });
    const ruleChecks = (fn) => {
      const s = ruleRun(fn, { headSource: head, baseSource: edited13 });
      const wanted = list.filter((m, i) => i > 0 && (i - 1) % 2).map((m) => m[0]);
      const others = s.all ? list.length : list.filter((m, i) => i > 0 && !((i - 1) % 2) && s.keep.has(m[0])).length;
      /* THE CANARY ARM NEEDS ITS OWN FIXTURE (2026-11-10, main run 42815689973 and release run 42802974372 red here).
         The three canaries are a hash of the guard's own text over ALL names, so with half the list recorded on the
         edited rule they all fall inside that half about one text in eight, `others` reads 0 and this arm fails on a
         gate that is right: v0.2.114's three new mutants re-rolled the hash onto that case. Here ONE mutant is on the
         edited rule, so at most two of the three canaries can be it or the unrecorded one: at least one stands outside. */
      const lone = Object.fromEntries(list.slice(1).map((m, i) => [m[0], i ? 'HS-999' : 'HS-13']));
      const c = ruleRun(fn, { headSource: head, baseSource: edited13, rules: lone });
      const outside = c.all ? 0 : list.slice(2).filter((m) => c.keep.has(m[0])).length;
      return [
        [!s.all && wanted.every((n) => s.keep.has(n)), 'a rule edit runs every mutant that rule catches'],
        [!s.all && s.keep.has(list[0][0]), 'a rule edit runs a mutant with no rule on record'],
        [!s.all && others <= 3, 'a rule edit leaves other rules\' mutants to the nightly, bar the canaries'],
        [!c.all && outside >= 1 && outside <= 3, 'a rule edit runs canaries from outside the rule'],
        [ruleRun(fn, { headSource: head, baseSource: helperEdit }).all, 'a helper above mutant-rules-start runs every mutant'],
        [ruleRun(fn, { headSource: statementEdit, baseSource: head }).all, 'a new top-level statement runs every mutant'],
        [ruleRun(fn, { headSource: noHeader, baseSource: noHeader.replace(ruleLine, `${ruleLine} `) }).all, 'a guard with no opt-in header runs every mutant'],
      ];
    };
    for (const [ok, label] of ruleChecks(scopeMutants)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} rule edit: ${label}`); }
    const dropWhy = (rx) => (o) => {
      const s = scopeMutants(o);
      return s.all ? s : { all: false, keep: new Set([...s.keep].filter((n) => !rx.test(s.why.get(n)))), why: s.why };
    };
    for (const [label, fn] of [
      ['the edited rule\'s mutants do not run', dropWhy(/^its rule /)],
      ['a mutant with no rule on record does not run', dropWhy(/^no rule on record/)],
      ['the canaries do not run', dropWhy(/^a canary/)],
      ['a rule edit runs every mutant', (o) => { const s = scopeMutants(o); return s.keep && s.keep.size ? { all: true, why: 'mutant' } : s; }],
      ['nothing is ever unclassifiable', (o) => { const s = scopeMutants(o); return s.all ? { all: false, keep: new Set(list.map((m) => m[0]).slice(0, 2)), why: new Map() } : s; }],
    ]) {
      const missed = ruleChecks(fn).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} rule edit mutant: ${label}`);
    }
    /* The classifier alone, on the smallest text that shows each answer. */
    const G = '// mutant-rule-functions: rules\n';
    const text = (rule, helper = 'const h = 1;') => `${G}function rules() {\n  ${helper}\n  /* mutant-rules-start */\n  if (a) fails.push('AW-1 one');\n  ${rule}\n  if (b) fails.push('AW-2 two');\n}\nfunction other() {\n  return 1;\n}\n`;
    const classifyChecks = (fn) => {
      const near = fn(text('const x = 1;'), text('const x = 2;'));
      const own = fn(`${text('')}`, `${text("if (c) fails.push('AW-3 three');")}`);
      return [
        [near.ok && near.rules.has('AW-1') && near.rules.has('AW-2'), 'a changed line with no id belongs to the named rules beside it'],
        [own.ok && own.rules.has('AW-3') && !own.rules.has('AW-1'), 'a changed line with an id belongs to that rule'],
        [!fn(text('', 'const h = 1;'), text('', 'const h = 2;')).ok, 'a helper above the start line is the harness'],
        [!fn(`${G}function rules() {\n  const x = 1;\n}\n`, `${G}function rules() {\n  const x = 2;\n}\n`).ok, 'a changed line with no rule id anywhere near is unclassifiable'],
        [!fn(text(''), text('').replace('return 1;', 'return 2;')).ok, 'a function the header does not list is the harness'],
        [!fn(text(''), text('').replace(/function other[\s\S]*$/, '')).ok, 'a removed function is the harness'],
        [(fn(`// mutant-runner-functions: other\n${text('')}`, `// mutant-runner-functions: other\n${text('').replace('return 1;', 'return 2;')}`).rules || { size: 1 }).size === 0, 'a runner function the header lists changes no rule'],
        [(fn(text(''), text('').replace('function other', '// a comment\nfunction other')).rules || { size: 1 }).size === 0, 'a comment names no rule and moves nothing'],
      ];
    };
    for (const [ok, label] of classifyChecks(classifyRuleEdit)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} classify: ${label}`); }
    for (const [label, fn] of [
      ['every edit is a rule edit', (a, b) => { const r = classifyRuleEdit(a, b); return r.ok ? r : { ok: true, rules: new Set(['AW-1']) }; }],
      ['no edit is a rule edit', () => ({ ok: false, why: 'mutant' })],
      ['the neighbours of a changed line are not read', (a, b) => { const r = classifyRuleEdit(a, b); return r.ok ? { ok: true, rules: new Set([...r.rules].filter((x) => x !== 'AW-2')) } : r; }],
    ]) {
      const missed = classifyChecks(fn).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} classify mutant: ${label}`);
    }

    /* A server guard is never narrowed when its server or combat file moved; a client guard is. */
    const headOf = (g) => readFileSync(join(ROOT, g), 'utf8').replace(/\r\n/g, '\n');
    const strictRun = (fn, guard, changed) => fn({ guard, root: ROOT, changed, base: null, headSource: headOf(guard), sources });
    const SG = 'tests/hunt-scene-live.mjs'; const CG = 'tests/perf-budget.mjs';
    const strictChecks = (fn) => [
      [strictRun(fn, SG, ['src/data/items.js']).all, 'hunt-scene-live (mutants in src/core) runs every mutant when combat\'s data moves'],
      [strictRun(fn, SG, ['src/core/combat-sim.js']).all, 'hunt-scene-live runs every mutant when the combat engine moves'],
      [!strictRun(fn, CG, ['src/data/items.js']).all, 'perf-budget (client mutants only) stays scoped'],
    ];
    for (const [ok, label] of strictChecks(scopeMutants)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} server guard: ${label}`); }
    for (const [label, fn] of [
      ['a server guard is narrowed like any other', (o) => scopeMutants({ ...o, strict: () => false })],
      ['every guard counts as a server guard', (o) => (scopeMutants({ ...o, strict: () => false }).all ? scopeMutants(o) : { all: true, why: 'mutant' })],
    ]) {
      const missed = strictChecks(fn).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} server guard mutant: ${label}`);
    }
  }

  /* THE HISTORY: a job the last sweep did not prove runs in full, an unreadable or old sweep
     makes every job full, and only main may skip what a release run proved of this commit. */
  {
    const now = Date.parse('2026-11-02T12:00:00Z');
    const green = { at: '2026-11-02T01:00:00Z', id: 1, jobs: { perf: 'success', edge: 'success' } };
    const redIn = { at: '2026-11-02T01:00:00Z', id: 2, jobs: { perf: 'failure', edge: 'success' } };
    const ask = (fn, h, o = {}) => fn({ nightly: null, nightlyError: null, proved: null, ...h }, { job: 'perf', event: 'push', ref: 'release/v0.0.1', now, ...o });
    const proved = { id: 9, branch: 'release/v0.0.1' };
    /* A sweep 54 h ago that proved perf: pushes ran perf in full from 11-02 06:00, its 48 h later. */
    const old = { at: '2026-10-31T06:00:00Z', id: 3, jobs: { perf: 'success' } };
    const since = (id) => ({ id, sha: 'a', branch: 'release/v0.0.1', at: '2026-11-02T07:00:00Z' });
    const histChecks = (fn) => [
      [!ask(fn, { nightly: green }).full && !ask(fn, { nightly: green }).proved, 'a green sweep leaves the push to its diff'],
      [ask(fn, { nightly: redIn }).full === true, 'a job the sweep left red runs every proof'],
      [!ask(fn, { nightly: redIn }, { job: 'edge' }).full, 'a job the sweep proved green stays scoped'],
      [ask(fn, { nightly: green }, { job: 'client-guards-2' }).full === true, 'a job absent from a green sweep runs every proof'],
      [ask(fn, { nightly: redIn }, { job: 'client-guards-2' }).full === true, 'a job absent from a red sweep runs every proof'],
      [ask(fn, { nightly: { ...green, jobs: { perf: 'skipped' } } }).full === true, 'a job the sweep skipped runs every proof'],
      [ask(fn, { nightly: { ...green, at: '2026-10-31T11:00:00Z' } }).full === true, 'a sweep over 48 h old makes every job full'],
      [!ask(fn, { nightly: { ...green, at: new Date(now - STALE_MS + 60000).toISOString() } }).full, 'a sweep just under 48 h old still counts'],
      [ask(fn, { nightlyError: 'HTTP 500' }).full === true, 'a sweep that cannot be read makes every job full'],
      [ask(fn, {}).full === true, 'no sweep on record makes every job full'],
      [!!ask(fn, { nightly: redIn, proved }, { ref: 'main' }).proved, 'main skips what a release run proved of this commit'],
      [!ask(fn, { nightly: green, proved }).proved, 'a release branch never skips on another run\'s say-so'],
      [!ask(fn, { nightly: green }, { ref: 'main' }).proved, 'main with no proving run keeps its own diff'],
      [!ask(fn, { nightly: redIn, fullGreen: since(3) }).full, 'a job the sweep left red, green in full since, is back to its diff'],
      [ask(fn, { nightly: redIn, fullGreen: { ...since(3), at: '2026-11-01T23:00:00Z' } }).full === true, 'a green from before that sweep proves nothing'],
      [ask(fn, { nightly: old, fullGreen: since(3) }).full !== true && ask(fn, { nightly: old, fullGreen: null }).full === true, 'an old sweep: a full green since is the proof, and none means full'],
      [ask(fn, { nightly: old, fullGreen: { ...since(3), at: '2026-11-02T02:00:00Z' } }).full === true, 'an old sweep that proved the job: a push inside its 48 h ran only its diff, so it is no proof'],
      [ask(fn, { nightly: { ...old, jobs: {} }, fullGreen: { ...since(3), at: '2026-11-02T02:00:00Z' } }).full !== true, 'an old sweep that did not prove the job: every push since ran it in full'],
      [ask(fn, { nightly: { ...old, jobs: {} }, fullGreen: { ...since(3), at: '2026-10-31T11:00:00Z' } }).full === true, 'a full green over 48 h old has gone stale too'],
    ];
    for (const [ok, label] of histChecks(historyPolicy)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} history: ${label}`); }
    const off = (from, to) => (h, o) => { const r = historyPolicy(h, o); return from(r, h) ? to : r; };
    for (const [label, fn] of [
      ['a red sweep is ignored', off((r) => /did not prove/.test(r.why || ''), {})],
      ['a job absent from the sweep counts as proved', off((r) => /not in that sweep/.test(r.why || ''), {})],
      ['a skipped job counts as proved', off((r) => /\(skipped\)/.test(r.why || ''), {})],
      ['an old sweep counts', off((r) => /over 48 h/.test(r.why || ''), {})],
      ['an unreadable sweep counts as green', off((r) => /could not be read/.test(r.why || ''), {})],
      ['no sweep counts as green', off((r) => /no nightly/.test(r.why || ''), {})],
      ['any branch may skip', (h, o) => historyPolicy(h, { ...o, ref: h.proved ? 'main' : o.ref })],
      ['main never skips', (h, o) => historyPolicy({ ...h, proved: null }, o)],
      ['a full green is ignored', (h, o) => historyPolicy({ ...h, fullGreen: null }, o)],
      ['a full green from before the sweep counts', (h, o) => historyPolicy({ ...h, fullGreen: h.fullGreen && { ...h.fullGreen, at: new Date(o.now - 60000).toISOString() } }, o)],
      ['a full green counts however old', (h, o) => { const r = historyPolicy(h, o); return r.full && h.fullGreen && Date.parse(h.fullGreen.at) > Date.parse(h.nightly?.at) ? { sweptBy: h.fullGreen } : r; }],
      ['a push inside the 48 h of a sweep that proved the job counts', (h, o) => historyPolicy(h.nightly ? { ...h, nightly: { ...h.nightly, jobs: {} } } : h, o)],
    ]) {
      const missed = histChecks(fn).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} history mutant: ${label}`);
    }
    /* The whole read, as a push's first gated command makes it. */
    {
      const at = new Date(Date.now() - 3600e3).toISOString();
      let asked = 0;
      const answers = (nightlyJobs, green) => (path) => {
        if (/runs\/7\/jobs/.test(path)) return { jobs: Object.entries(nightlyJobs).map(([name, conclusion]) => ({ name, conclusion })) };
        if (/runs\/8\/jobs/.test(path)) { asked++; return { jobs: [{ name: 'red-job', conclusion: green }] }; }
        if (/created=/.test(path)) return { workflow_runs: [{ id: 8, head_branch: 'release/v0.0.1', head_sha: 'a', created_at: new Date().toISOString() }] };
        return { workflow_runs: [{ id: 7, event: 'schedule', conclusion: 'failure', updated_at: at }] };
      };
      const env = (job) => ({ GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'release/v0.0.2', GITHUB_JOB: job, GITHUB_RUN_ID: '9' });
      const good = readHistory(env('red-job'), answers({ 'red-job': 'failure', fine: 'success' }, 'success'));
      const stillRed = readHistory(env('red-job'), answers({ 'red-job': 'failure', fine: 'success' }, 'failure'));
      asked = 0;
      const proved = readHistory(env('fine'), answers({ 'red-job': 'failure', fine: 'success' }, 'success'));
      const broke = readHistory(env('red-job'), (p) => { if (/created=/.test(p)) throw new Error('HTTP 500'); return answers({ 'red-job': 'failure' }, 'success')(p); });
      for (const [ok, label] of [
        [(good.fullGreen || {}).id === 8 && historyPolicy(good, { job: 'red-job', event: 'push', ref: 'release/v0.0.2', now: Date.now() }).sweptBy, 'a push reads the full green of a job the sweep left red, and goes back to its diff'],
        [stillRed.fullGreen === null && historyPolicy(stillRed, { job: 'red-job', event: 'push', ref: 'release/v0.0.2', now: Date.now() }).full === true, 'a job still red stays full'],
        [asked === 0 && proved.fullGreen === null, 'a job the sweep proved asks GitHub nothing more'],
        [broke.fullGreen === null && historyPolicy(broke, { job: 'red-job', event: 'push', ref: 'release/v0.0.2', now: Date.now() }).full === true, 'a read that fails is no proof'],
      ]) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} the read: ${label}`); }
    }
    /* The full green as GitHub answers it: newest finished result first, release and next only, after the sweep. */
    const fullRuns = [
      { id: 16, head_branch: 'release/v0.0.3', head_sha: 'p', created_at: '2026-11-02T09:00:00Z' },
      { id: 15, head_branch: 'main', head_sha: 'o', created_at: '2026-11-02T08:00:00Z' },
      { id: 14, head_branch: 'release/v0.0.3', head_sha: 'n', created_at: '2026-11-02T07:00:00Z' },
      { id: 13, head_branch: 'next', head_sha: 'm', created_at: '2026-11-02T06:00:00Z' },
      { id: 12, head_branch: 'release/v0.0.2', head_sha: 'l', created_at: '2026-11-02T05:00:00Z' },
      { id: 11, head_branch: 'release/v0.0.1', head_sha: 'k', created_at: '2026-11-01T05:00:00Z' },
    ];
    const FULL = { 16: { a: 'cancelled', b: 'failure', c: 'cancelled', d: 'cancelled' }, 15: { a: 'success', b: 'success', c: 'success', d: 'success' },
      14: { a: 'success', b: 'success', c: 'cancelled', d: 'cancelled' }, 13: { c: 'success', d: 'cancelled' }, 12: { c: 'failure', d: 'cancelled' }, 11: { d: 'success' } };
    const fullGet = (path) => {
      const m = /runs\/(\d+)\/jobs/.exec(path);
      if (m) return { jobs: Object.entries(FULL[m[1]] || {}).map(([name, conclusion]) => ({ name, conclusion })) };
      return { workflow_runs: fullRuns };
    };
    const fullChecks = (fn) => {
      const pick = (o) => fn({ job: 'a', since: '2026-11-02T01:00:00Z', own: 99, get: fullGet, ...o });
      return [
        [(pick() || {}).id === 14, 'a cancelled run is passed over, and the newest green on a release counts'],
        [pick({ job: 'b' }) === null, 'a red newer than a green leaves no proof'],
        [(pick({ job: 'c' }) || {}).id === 13, 'a next push counts, and an older red does not unprove it'],
        [pick({ job: 'd' }) === null, 'a push from before the sweep is no proof'],
        [(pick({ own: 14 }) || {}).id !== 14, 'this run itself never counts'],
        [pick({ job: 'none' }) === null, 'a job no run holds has no proof'],
        [pick({ since: null }) === null, 'no sweep to count from means no proof'],
      ];
    };
    for (const [ok, label] of fullChecks(lastFullGreen)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} full green: ${label}`); }
    for (const [label, fn] of [
      ['a red job counts as green', (o) => lastFullGreen({ ...o, get: (p) => { const r = o.get(p); return r.jobs ? { jobs: r.jobs.map((j) => ({ ...j, conclusion: 'success' })) } : r; } })],
      ['a cancelled job counts as green', (o) => lastFullGreen({ ...o, get: (p) => { const r = o.get(p); return r.jobs ? { jobs: r.jobs.map((j) => (j.conclusion === 'cancelled' ? { ...j, conclusion: 'success' } : j)) } : r; } })],
      ['a red is passed over to an older green', (o) => lastFullGreen({ ...o, get: (p) => { const r = o.get(p); return r.jobs ? { jobs: r.jobs.filter((j) => j.conclusion !== 'failure') } : r; } })],
      ['main\'s push counts', (o) => lastFullGreen({ ...o, get: (p) => { const r = o.get(p); return r.workflow_runs ? { workflow_runs: r.workflow_runs.map((x) => ({ ...x, head_branch: 'release/x' })) } : r; } })],
      ['next is not read', (o) => lastFullGreen({ ...o, get: (p) => { const r = o.get(p); return r.workflow_runs ? { workflow_runs: r.workflow_runs.filter((x) => x.head_branch !== 'next') } : r; } })],
      ['this run counts', (o) => lastFullGreen({ ...o, own: -1 })],
      ['a push from before the sweep counts', (o) => lastFullGreen({ ...o, since: '2026-10-01T00:00:00Z' })],
    ]) {
      const missed = fullChecks(fn).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} full green mutant: ${label}`);
    }
    /* The sweep as GitHub answers it, shaped like 41497147816: main's job list has no client-guards-2. */
    const sweep = (conclusion, jobs, more = []) => (path) => (/\/jobs\?/.test(path)
      ? { jobs: Object.entries(jobs).map(([name, c]) => ({ name, conclusion: c })) }
      : { workflow_runs: [{ id: 7, event: 'schedule', conclusion, updated_at: '2026-11-02T01:00:00Z' }, ...more] });
    const redSweep = sweep('failure', { edge: 'success', 'client-guards': 'cancelled', perf: 'failure' });
    const nightlyChecks = (read) => {
      const policy = (get, job) => historyPolicy({ nightly: read(get), nightlyError: null, proved: null }, { job, event: 'push', ref: 'release/v0.0.1', now });
      const greenSweep = sweep('success', { edge: 'success' });
      return [
        [policy(redSweep, 'client-guards-2').full === true, 'a job a red sweep never ran runs every proof'],
        [policy(greenSweep, 'client-guards-2').full === true, 'a job a green sweep never ran runs every proof'],
        [policy(redSweep, 'client-guards').full === true && policy(redSweep, 'perf').full === true, 'a cancelled or failed job runs every proof'],
        [!policy(redSweep, 'edge').full && !policy(greenSweep, 'edge').full, 'a job the sweep proved green stays scoped, red sweep or green'],
        [policy(sweep('failure', { edge: 'success' }), 'edge').full === true, 'a red run no job explains makes every job full'],
        [read(() => ({ workflow_runs: [{ id: 1, event: 'push', conclusion: 'success', updated_at: '2026-11-02T01:00:00Z' }] })) === null, 'a push is not a sweep'],
        [(read(sweep('success', { edge: 'success' }, [{ id: 8, event: 'workflow_dispatch', conclusion: 'success', updated_at: '2026-11-02T02:00:00Z' }])) || {}).id === 8, 'the newest sweep is the one that counts'],
      ];
    };
    for (const [ok, label] of nightlyChecks(readNightly)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} nightly: ${label}`); }
    const runsAs = (f) => (get) => readNightly((p) => { const x = get(p); return x.workflow_runs ? { workflow_runs: f(x.workflow_runs) } : x; });
    for (const [label, read] of [
      ['a green sweep proves every job, listed or not', (get) => {
        const n = readNightly(get);
        return n && get('runs').workflow_runs[0].conclusion === 'success' ? { ...n, jobs: new Proxy({}, { get: () => 'success' }) } : n;
      }],
      ['a red job counts as green', (get) => readNightly((p) => { const x = get(p); return x.jobs ? { jobs: x.jobs.map((j) => ({ ...j, conclusion: 'success' })) } : x; })],
      ['a red run no job explains keeps its green jobs', runsAs((rs) => rs.map((r) => ({ ...r, conclusion: 'success' })))],
      ['a push counts as a sweep', runsAs((rs) => rs.map((r) => ({ ...r, event: 'schedule' })))],
      ['the first sweep listed counts, not the newest', runsAs((rs) => rs.slice(0, 1))],
    ]) {
      const missed = nightlyChecks(read).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} nightly mutant: ${label}`);
    }
    /* A fix-forward: the newest green job at a usable commit, never a red one, never this run. */
    const FAKE = { 5: 'failure', 4: 'success', 3: 'success' };
    const get = (path) => {
      const m = /runs\/(\d+)\/jobs/.exec(path);
      if (m) return { jobs: [{ name: 'j', conclusion: FAKE[m[1]] }, { name: 'other', conclusion: 'failure' }] };
      return { workflow_runs: [{ id: 6, head_sha: 'f' }, { id: 5, head_sha: 'e' }, { id: 4, head_sha: 'd' }, { id: 3, head_sha: 'c' }] };
    };
    const greenChecks = (fn) => {
      const pick = (o) => fn({ job: 'j', ref: 'release/v0.0.1', own: 6, usable: () => true, get, ...o });
      return [
        [(pick() || {}).id === 4, 'a job red in the newest run is measured from its last green one'],
        [(pick({ usable: (s) => s !== 'd' }) || {}).id === 3, 'a commit that cannot be used (not an ancestor, the workflow moved) is passed over'],
        [pick({ job: 'other' }) === null, 'a job never green keeps the whole diff'],
        [pick({ usable: () => false }) === null, 'no usable commit keeps the whole diff'],
        [(pick({ own: 4 }) || {}).id === 3, 'this run itself never counts'],
      ];
    };
    for (const [ok, label] of greenChecks(lastGreenRun)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} fix-forward: ${label}`); }
    for (const [label, fn] of [
      ['a red job counts as green', (o) => lastGreenRun({ ...o, get: (p) => { const r = o.get(p); return r.jobs ? { jobs: r.jobs.map((j) => ({ ...j, conclusion: 'success' })) } : r; } })],
      ['any commit is usable', (o) => lastGreenRun({ ...o, usable: () => true })],
      ['this run counts', (o) => lastGreenRun({ ...o, own: -1 })],
    ]) {
      const missed = greenChecks(fn).every(([ok]) => ok);
      if (missed) bad++;
      console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} fix-forward mutant: ${label}`);
    }
    /* A guard imported for its harness: perf-budget imports hunt-live's HARNESS, not its rules. */
    {
      const live = readFileSync(join(ROOT, 'tests/hunt-live.mjs'), 'utf8').replace(/\r\n/g, '\n');
      const ruleAt = live.indexOf('function rules(M) {');
      const idLine = live.slice(ruleAt).split('\n').find((l) => /^\s*ok\('LV-[0-9A-Z]/.test(l));
      const inRule = live.replace(idLine, `${idLine} void 0;`);
      /* A line with no rule id near it: v0.2.86's edit of a fixture row inside rules(). */
      const inRow = live.replace("  const key = (s) => s.u + ','", "  const key = (s) => '' + s.u + ','");
      const inHarness = live.replace('async function load(base) {\n', 'async function load(base) {\n  void 0;\n');
      const noHeader = live.replace('// mutant-rule-functions: rules\n', '');
      const perf = (fn, base, head = live) => fn({ guard: 'tests/perf-budget.mjs', root: ROOT, changed: ['tests/hunt-live.mjs'], base: null, helperText: () => ({ head, base }) });
      const checks = (fn) => [
        [!!idLine && inRule !== live && inHarness !== live && inRow !== live, 'the fixture has a rule line, a row and a harness line to edit'],
        [!perf(fn, inRule).all && perf(fn, inRule).keep.size === 0, 'an edit of a rule in an imported guard moves none of its importer\'s mutants'],
        [!perf(fn, inRow).all && perf(fn, inRow).keep.size === 0, 'nor does an edit in a rule function that names no rule'],
        [perf(fn, inHarness).all === true, 'an edit of what it exports runs every mutant'],
        [perf(fn, noHeader, noHeader.replace(idLine, `${idLine} void 0;`)).all === true, 'an imported guard that lists no rule functions is harness'],
        [perf(fn, null).all === true, 'a side that cannot be read is harness'],
      ];
      for (const [ok, label] of checks(scopeMutants)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} imported guard: ${label}`); }
      for (const [label, fn] of [
        ['any edit of an imported guard is harness', (o) => scopeMutants({ ...o, helperText: () => ({ head: o.helperText().head, base: null }) })],
        ['no edit of an imported guard is harness', (o) => scopeMutants({ ...o, changed: [] })],
      ]) {
        const missed = checks(fn).every(([ok]) => ok);
        if (missed) bad++;
        console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} imported guard mutant: ${label}`);
      }
    }
    const baseChecks = (fn) => {
      let threw = false;
      try { fn('abc', 'abc'); } catch { threw = true; }
      return [[threw, 'a commit main already holds has no usable base'], [fn('abc', 'def') === 'abc', 'a commit ahead of main is measured from the merge base']];
    };
    for (const [ok, label] of baseChecks(usableBase)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} base: ${label}`); }
    const missedBase = baseChecks((a) => a).every(([ok]) => ok);
    if (missedBase) bad++;
    console.log(`  ${missedBase ? 'MISSED  ' : 'CAUGHT  '} base mutant: an empty diff counts as a diff`);
    /* A rehearsal gates a lane's run under an old diff; on main the dispatch stays the full sweep. */
    const dis = (ref) => decideMode({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_NAME: ref, HR_MUTANT_GATE_RANGE: 'a..b' });
    const rehearsalOk = dis('lane/x').rehearsal === true && dis('main').full === true
      && decideMode({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'schedule', GITHUB_REF_NAME: 'lane/x', HR_MUTANT_GATE_RANGE: 'a..b' }).full === true;
    if (!rehearsalOk) bad++;
    console.log(`  ${rehearsalOk ? 'ok      ' : 'FAILED  '} rehearsal: a dispatch with a range is gated, except on main; the schedule never is`);
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

  /* changedLines: one hunk that bumps two preload hrefs and adds one between them has changed
     exactly the added line; a rewritten line is a change on both sides. */
  const mixed = `${hdr('p.html')}@@ -2,2 +2,3 @@\n-<link href="a.js?v=0.2.22">\n-<link href="b.js?v=0.2.22">\n`
    + '+<link href="a.js?v=0.2.23">\n+<link href="new.js?v=0.2.23">\n+<link href="b.js?v=0.2.23">\n'
    + `${hdr('q.js')}@@ -7 +7 @@\n-const x = 1;\n+const x = 2;\n`;
  const lineChecks = (fn) => {
    const r = fn(mixed);
    const p = r.get('p.html'); const q = r.get('q.js');
    return [
      [!!p && !p.whole && JSON.stringify(p.head) === '[[3,3]]' && !p.base.length, 'a `?v=` bump beside an added line: only the added line changed (head 3)'],
      [!!q && JSON.stringify(q.base) === '[[7,7]]' && JSON.stringify(q.head) === '[[7,7]]', 'a rewritten line changed on both sides (base 7, head 7)'],
    ];
  };
  for (const [ok, label] of lineChecks(changedLines)) { if (!ok) bad++; console.log(`  ${ok ? 'ok      ' : 'FAILED  '} lines: ${label}`); }
  for (const [label, fn] of [
    ['every +/- line is a change (no pairing)', (t) => changedLines(t.replace(/\?v=/g, '?w='))],
    ['a hunk is changed whole', (t) => new Map([...changedLines(t)].map(([k, v]) => [k, { ...v, whole: true }]))],
  ]) {
    const missed = lineChecks(fn).every(([ok]) => ok);
    if (missed) bad++;
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} lines mutant: ${label}`);
  }

  bad += await lineViewSelftest();

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
      ['a job the last nightly left red runs an untouched proof; another job skips it', () => {
        const h = JSON.stringify({ nightly: { at: new Date().toISOString(), id: 5, jobs: { 'red-job': 'failure', 'other-job': 'success' } } });
        const red = cli(['node', probe, '--mutate'], env('', { GITHUB_JOB: 'red-job', HR_GATE_HISTORY: h }));
        const other = cli(['node', probe, '--mutate'], env('', { GITHUB_JOB: 'other-job', HR_GATE_HISTORY: h }));
        return red.status === 7 && /did not prove job red-job green/.test(red.stdout) && other.status === 0 && /SKIP/.test(other.stdout);
      }],
      ['a job the last nightly never ran runs an untouched proof', () => {
        const h = JSON.stringify({ nightly: { at: new Date().toISOString(), id: 5, jobs: { 'other-job': 'success' } } });
        const r = cli(['node', probe, '--mutate'], env('', { GITHUB_JOB: 'new-job', HR_GATE_HISTORY: h }));
        return r.status === 7 && /did not prove job new-job green \(not in that sweep\)/.test(r.stdout);
      }],
      ['a job the last nightly left red, green in full since, skips an untouched proof; with none it runs', () => {
        const nightly = { at: new Date(Date.now() - 3600e3).toISOString(), id: 5, jobs: { 'red-job': 'failure' } };
        const g = { id: 88, sha: 'a', branch: 'release/v0.0.1', at: new Date(Date.now() - 600e3).toISOString() };
        const swept = cli(['node', probe, '--mutate'], env('', { GITHUB_JOB: 'red-job', HR_GATE_HISTORY: JSON.stringify({ nightly, fullGreen: g }) }));
        const not = cli(['node', probe, '--mutate'], env('', { GITHUB_JOB: 'red-job', HR_GATE_HISTORY: JSON.stringify({ nightly }) }));
        return swept.status === 0 && /went green in full in run 88/.test(swept.stdout) && /SKIP/.test(swept.stdout) && not.status === 7;
      }],
      ['main skips a proof a release run proved of this commit; its plain run still runs', () => {
        const h = JSON.stringify({ nightly: { at: new Date().toISOString(), id: 5, jobs: {} }, proved: { id: 77, branch: 'release/v0.0.1' } });
        const e = env(probeKey, { GITHUB_REF_NAME: 'main', GITHUB_JOB: 'x', HR_GATE_HISTORY: h });
        const proof = cli(['node', probe, '--mutate'], e);
        return proof.status === 0 && /SKIP .*run 77 on release\/v0\.0\.1 proved this exact commit/.test(proof.stdout) && cli(['node', probe], e).status === 3;
      }],
      ['a push whose base cannot be found fails safe to the full sweep', () => {
        const e = env('', { GITHUB_SHA: 'selftest-nobase', GITHUB_JOB: 'x', GITHUB_EVENT_PATH: join(dir, 'missing.json'), HR_GATE_HISTORY: JSON.stringify({ nightly: { at: new Date().toISOString(), id: 5, jobs: { x: 'success' } } }) });
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
    else if (argv[0] === '--rules-from') code = rulesFrom(argv[1]);
    else { console.error('usage: node tools/mutant-gate.mjs node <guard> --mutate … | --explain [--base REF | --files a,b] [--all] | --selftest'); code = 2; }
  } catch (e) {
    console.error(`mutant-gate: ${e.message}`);
    code = e.harness ? 2 : 1;
  }
  process.exit(code);
}
