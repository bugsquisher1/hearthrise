#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/run-ci-local.mjs — RUN WHAT CI RUNS, LOCALLY, DERIVED FROM CI
//
//   node tests/run-ci-local.mjs            the CI-only steps (no browser)
//   node tests/run-ci-local.mjs --all      …plus the in-page suite, i.e. the
//                                          whole workflow, exactly as CI runs it
//   node tests/run-ci-local.mjs --list     print the derived command list, run nothing
//   node tests/run-ci-local.mjs --selftest soft steps == continue-on-error steps, mutation-proved
//
// ── WHY THIS EXISTS (P0 PROCESS FAILURE, proven 2026-09-04) ─────────────────
// .github/workflows/smoke.yml runs ONE step that anybody ran locally — the
// in-page suite, `node tests/run-smoke.mjs` — and THIRTEEN that nobody did:
// schema-drift (+ --mutate + --live-selftest), live-hash-drift (+ --selftest +
// --mutate), renown-kill-faucet --selftest, restore-census (+ --mutate +
// --baseline-selftest), conservation-fuzz --selftest, activity-intent
// --selftest, claim-intent --selftest, clan-journal-guard --selftest,
// anon-rate-gate --selftest, raid-band-denial --selftest, raid-card-copy,
// rpc-resolution, edge-jwt-gate --strict.
//
// On 2026-09-04 the GitHub Actions history for `main` showed FORTY completed
// runs since 2026-08-29 and ZERO green, while the in-page step passed in every
// one of them. Every release from b488 onward was therefore gated on a local
// command that is STRICTLY WEAKER than CI — and the guards that were red are the
// ones that watch the database: whether the repo can rebuild it, whether
// production carries the bodies the repo believes it carries, which rows only a
// backup gives back, and whether value is conserved. Those are exactly the
// guards that matter most after cutover, when the database is the only copy of
// every player's progression.
//
// The failure was not that the guards were bad; each red had a real, small
// cause. The failure was that NOBODY COULD SEE THEM without opening a browser
// tab on github.com, so a red build was indistinguishable from a build nobody
// had looked at. This file closes that: one command, same steps, same flags,
// same order, on the machine where the fix gets written.
//
// ── THE LIST IS DERIVED FROM smoke.yml, NOT COPIED FROM IT ──────────────────
// A second copy of the step list is a drift generator, and a drift generator in
// the thing whose whole job is "local equals CI" defeats itself on its first
// edit. So this PARSES the workflow and runs the `run:` lines it finds, in
// order. Add a step to CI and it runs here on the next invocation with no edit
// to this file; change a flag in CI and the flag changes here.
//
// Two steps are SKIPPED, by name, and both skips are declared below and
// VERIFIED: if a skipped name is no longer a step in the workflow this exits 2,
// rather than quietly running one fewer thing than CI does.
//
// ONE DELIBERATE DIFFERENCE FROM CI, IN THE SAFE DIRECTION: every step here runs
// even after an earlier one fails. In the workflow the guards carry
// `if: ${{ !cancelled() }}` for exactly that reason, but the first two steps do
// not, so a red cache-buster check ends the GitHub job and hides everything
// behind it. Locally that trade is wrong — you want the whole board in one run,
// which is the entire lesson of this file's existence — so nothing short-circuits
// and the summary table at the end is always complete.
//
// ── THE RULE THIS ENFORCES ─────────────────────────────────────────────────
//   A RELEASE IS GREEN ONLY WHEN BOTH THE LOCAL --ci RUN AND THE GITHUB RUN ON
//   THE RELEASE COMMIT ARE GREEN. Neither alone is a gate: the local run cannot
//   see a CI-environment problem, and the GitHub run cannot be waited on while a
//   release is being assembled.
//
// ── THE MATRIX (cleanup slice 8a, 2026-09-07) ────────────────────────
// smoke.yml is now FIVE jobs (in-page, db-replay, economy-selftests,
// client-guards, edge) so CI's wall clock is the slowest family instead of the
// sum of all of them. This file reads every job, in file order, and
// concatenates their steps: the list it produces is the same SET of commands it
// produced when there was one job. The split changed WHERE a guard runs, never
// WHETHER it runs, and tests/ci-shape.mjs is the guard that proves it.
//
//   node tests/run-ci-local.mjs --jobs            the families and their budgets
//   node tests/run-ci-local.mjs --job db-replay   one family, nothing else
//
// Exit: 0 every step green · 1 a step failed · 2 a harness problem (the workflow
// could not be parsed, a declared skip no longer exists, or --job named a job
// that is not there).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
export const WORKFLOW = join(ROOT, '.github', 'workflows', 'smoke.yml');

/* THE DECLARED SKIPS. Each names a step that exists in the workflow and says
   what running it locally would mean. Nothing else is ever skipped, and a name
   that stops matching a step is a harness failure — that is what stops this from
   drifting into "runs most of CI". */
export const SKIP = [
  ['Install Playwright + Chromium',
    'environment setup, not a gate: npm install + npx playwright install --with-deps installs '
    + 'system packages and needs root on Linux. If a guard fails here for a missing dependency, '
    + 'run those two commands by hand once.'],
  ['Install node modules (no browser)',
    'environment setup, not a gate: `npm install` in every non-browser job of the matrix. A dev '
    + 'machine already has node_modules; re-installing it four times per local run would cost '
    + 'more than the guards do.'],
  ['Smoke suite (headless)',
    'the ONE step that already runs locally today (node tests/run-smoke.mjs) and the one this '
    + 'file exists to complement. Pass --all to include it and run the whole workflow.'],
];

// ── the parser ───────────────────────────────────────────────────────────
// smoke.yml is a plain, regular workflow: `jobs:` at indent 0, each job at
// indent 2, its keys (`runs-on`, `timeout-minutes`, `steps:`) at indent 4, each
// step at indent 6 opening with "- ", its keys at indent 8, and block `run:`
// bodies at indent 10. Deliberately NOT a general YAML implementation — a
// third-party parser would be a dependency running inside the thing that gates
// the build, and the shape it has to read is five lines of rules.
//
// SINCE THE SLICE-8a MATRIX there are five jobs, not one. They are read in FILE
// ORDER and their steps are concatenated in file order, so the list this file
// produces still contains exactly the commands CI runs — the split changed
// where they run, not what runs.
export function parseWorkflow(text) {
  const lines = text.split('\r\n').join('\n').split('\n');
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (at < 0) throw new Error('no "jobs:" block in ' + WORKFLOW);
  const jobs = [];
  let job = null;
  let inSteps = false;
  let cur = null;
  let inRun = false;
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { if (inRun && cur) cur.run.push(''); continue; }
    const indent = l.length - l.trimStart().length;
    if (indent === 0) break;                      // left the jobs: block
    if (indent === 2 && /^[A-Za-z0-9_-]+:\s*$/.test(l.trim())) {
      job = { name: l.trim().slice(0, -1), timeoutMinutes: null, steps: [] };
      jobs.push(job);
      inSteps = false; cur = null; inRun = false;
      continue;
    }
    if (!job) continue;
    if (indent === 4) {
      inSteps = false; inRun = false; cur = null;
      const t = l.trim();
      if (/^steps:\s*$/.test(t)) { inSteps = true; continue; }
      const m = /^timeout-minutes:\s*(\d+)/.exec(t);
      if (m) job.timeoutMinutes = Number(m[1]);
      continue;
    }
    if (!inSteps) continue;
    if (indent === 6 && l.trimStart().startsWith('- ')) {
      cur = { name: null, run: [], uses: null };
      job.steps.push(cur);
      inRun = false;
      applyKey(cur, l.trimStart().slice(2));
      if (cur._runBlock) { inRun = true; cur._runBlock = false; }
      continue;
    }
    if (!cur) continue;
    if (indent === 8) {
      inRun = false;
      applyKey(cur, l.trim());
      if (cur._runBlock) { inRun = true; cur._runBlock = false; }
      continue;
    }
    if (inRun && indent >= 10) cur.run.push(l.slice(10));
  }
  if (!jobs.length) throw new Error('the jobs: block parsed to zero jobs');
  for (const j of jobs) {
    j.steps = j.steps.map((s) => ({
      name: s.name,
      uses: s.uses,
      soft: !!s.soft,
      run: s.run.join('\n').split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#')),
    }));
  }
  if (!jobs.some((j) => j.steps.length)) throw new Error('every job parsed to zero steps');
  return jobs;
}

/** Every job's steps, flattened in file order, each tagged with its job. */
export function flatSteps(jobs) {
  return jobs.flatMap((j) => j.steps.map((s) => ({ ...s, job: j.name })));
}

function applyKey(step, s) {
  const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(s);
  if (!m) return;
  const [, k, v] = m;
  if (k === 'name') step.name = v.replace(/^['"]|['"]$/g, '');
  else if (k === 'uses') step.uses = v;
  /* `continue-on-error: true` is GitHub's own word for "this step reports, it does
     not gate". This file's whole contract is "same steps, same flags, same verdict
     as CI" — so a step CI would not fail on must not fail this run either, or the
     local half becomes STRICTER than the gate it models and every lane learns to
     ignore it. (It must never become WEAKER, which is why this reads the flag from
     the workflow rather than from a list here.) */
  else if (k === 'continue-on-error') step.soft = /^(true|'true'|"true")$/.test(v.trim());
  else if (k === 'run') {
    if (v === '|' || v === '>' || v === '|-' || v === '>-') step._runBlock = true;
    else if (v) step.run.push(v);
  }
}

// ── --selftest: continue-on-error PARITY (2026-09-28) ─────────────────────
// A step marked soft here prints REPORT and never fails the local run, so a
// soft flag on the wrong step makes this file WEAKER than CI — the one
// direction its contract forbids. On 2026-09-27 client-guards went red on the
// test-file ratchet while a local run was read as reporting it soft; the
// parser was measured correct on every smoke.yml revision since 09-20, and
// this proof keeps it that way. The truth side is a line scan that shares no
// code with parseWorkflow: each `continue-on-error: true` line belongs to the
// nearest step opener (`- ` at indent 6) above it, in the nearest job above that.
export function softTruth(text) {
  const lines = text.split('\r\n').join('\n').split('\n');
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const out = [];
  let job = null;
  let stepAt = -1;
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(l)) { job = l.trim().slice(0, -1); stepAt = -1; continue; }
    if (/^ {6}- /.test(l)) { stepAt = i; continue; }
    if (/^ {4}\S/.test(l)) { stepAt = -1; continue; }
    if (stepAt < 0 || !/^ {6,8}(- )?continue-on-error:\s*(true|'true'|"true")\s*$/.test(l)) continue;
    let name = null;
    for (let j = stepAt; j < lines.length && (j === stepAt || !/^ {0,6}\S/.test(lines[j])); j++) {
      const m = /^ {6}(?:- | {2})name:\s*(.*)$/.exec(lines[j]);
      if (m) { name = m[1].trim().replace(/^['"]|['"]$/g, ''); break; }
    }
    out.push(`${job} :: ${name}`);
  }
  return [...new Set(out)].sort();
}

/** The soft steps as the parser reads them; every step the PLAN runs must carry
    the same flag, or the runner and the parser disagree about the verdict. */
export function softParsed(jobs) {
  const flat = flatSteps(jobs);
  const soft = flat.filter((s) => s.soft).map((s) => `${s.job} :: ${s.name}`).sort();
  const bad = buildPlan(jobs, { all: true }).filter((p) => !p.skipped
    && !!p.soft !== flat.some((s) => s.soft && s.job === p.job && s.name === p.name));
  return bad.length ? ['PLAN-DISAGREES', ...soft] : soft;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Every step whose line range could take a planted key: [openerLine, lastLine]. */
function stepRanges(lines) {
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const r = [];
  let cur = null;
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;
    if (/^ {6}- /.test(l)) { cur = [i, i]; r.push(cur); continue; }
    if (/^ {0,5}\S/.test(l)) { cur = null; continue; }
    if (cur && /\S/.test(l)) cur[1] = i;
  }
  return r;
}

export function selftest(text, parse = parseWorkflow) {
  const text0 = text.split('\r\n').join('\n');
  const fails = [];
  const truth = softTruth(text0);
  const got = softParsed(parse(text0));
  console.log(`  real smoke.yml: ${truth.length} step(s) carry continue-on-error: true; `
    + `${got.length} parsed soft`);
  for (const t of truth) console.log(`    yml  ${t}`);
  for (const g of got) console.log(`    soft ${g}`);
  if (!truth.length) fails.push('the truth scan found no continue-on-error line — the scan is broken');
  if (!same(truth, got)) fails.push(`PARITY: yml ${JSON.stringify(truth)} != parsed ${JSON.stringify(got)}`);

  /* MUTATION: plant a stray `continue-on-error: true` on EVERY step of a copy,
     one at a time, both as the step's first key (under `- name:`) and as its
     LAST line (after a block `run: |` body — where carry-over would hide). Each
     plant must add exactly that step to the soft set and nothing else. */
  const lines = text0.split('\n');
  let planted = 0;
  for (const [open, last] of stepRanges(lines)) {
    for (const where of [open + 1, last + 1]) {
      const copy = [...lines.slice(0, where), '        continue-on-error: true', ...lines.slice(where)];
      const t = copy.join('\n');
      const want = softTruth(t);
      const have = softParsed(parse(t));
      planted++;
      if (!same(want, have)) {
        fails.push(`MUTANT line ${where + 1}: yml ${JSON.stringify(want)} != parsed ${JSON.stringify(have)}`);
        if (fails.length > 5) return fails;
      }
    }
  }
  console.log(`  mutation: ${planted} stray continue-on-error plants, each attributed to its own step only`);
  return fails;
}

// ── the runner ───────────────────────────────────────────────────────────
// `node …` is spawned on THIS interpreter (so the local Node version is the one
// under test) and `bash …` on bash; anything else goes through the platform
// shell and is reported as such, because a step this file cannot run natively is
// a step whose local result deserves a second look.
function runCommand(cmd) {
  const parts = cmd.split(/\s+/);
  let file = parts[0];
  let args = parts.slice(1);
  const opts = { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' };
  if (file === 'node') file = process.execPath;
  else if (file !== 'bash') { opts.shell = true; file = cmd; args = []; }
  const r = spawnSync(file, args, opts);
  if (r.error) return { status: 2, error: r.error.message };
  return { status: r.status === null ? 2 : r.status };
}

/**
 * The plan: every step of every job, in file order, with the declared skips
 * marked. `job` filters to one family; `all` un-skips the in-page suite.
 */
export function buildPlan(jobs, { all = false, job = null } = {}) {
  const skipNames = new Set(
    SKIP.filter(([n]) => !(all && n === 'Smoke suite (headless)')).map(([n]) => n));
  const plan = [];
  for (const s of flatSteps(jobs)) {
    if (job && s.job !== job) continue;
    if (!s.run.length) continue;                 // `uses:` steps: checkout, setup-node, upload
    if (skipNames.has(s.name)) { plan.push({ job: s.job, name: s.name, skipped: true }); continue; }
    plan.push({ job: s.job, name: s.name, cmds: s.run, soft: !!s.soft });
  }
  return plan;
}

async function main() {
  const argv = process.argv.slice(2);
  const ALL = argv.includes('--all');
  const LIST = argv.includes('--list');
  if (argv.includes('--selftest')) {
    const wf = await readFile(WORKFLOW, 'utf8');
    console.log('run-ci-local --selftest: soft (continue-on-error) steps must equal the yml\'s, exactly');
    const fails = selftest(wf);
    /* NON-VACUITY: the same checks against two broken parsers — the flag carried
       onto every later step, and the flag landing on the NEXT step — must fail. */
    const mutants = {
      'carried-across-steps': (t) => parseWorkflow(t).map((j) => {
        let on = false;
        return { ...j, steps: j.steps.map((s) => ({ ...s, soft: (on = on || s.soft) })) };
      }),
      'attributed-to-next-step': (t) => parseWorkflow(t).map((j) => ({
        ...j, steps: j.steps.map((s, i) => ({ ...s, soft: i > 0 && j.steps[i - 1].soft })),
      })),
    };
    for (const [id, p] of Object.entries(mutants)) {
      const quiet = console.log; console.log = () => {};
      let caught;
      try { caught = selftest(wf, p).length > 0; } finally { console.log = quiet; }
      console.log(`  ${caught ? 'ok  ' : 'MISS'} parser mutant ${id} — ${caught ? 'caught' : 'NOT caught'}`);
      if (!caught) fails.push(`parser mutant ${id} was not caught — the proof is vacuous`);
    }
    for (const f of fails) console.log('  RED  ' + f);
    console.log(fails.length ? `run-ci-local --selftest FAILED (${fails.length})` : 'run-ci-local --selftest PASSED');
    process.exitCode = fails.length ? 1 : 0;
    return;
  }
  const jobArgIdx = argv.indexOf('--job');
  const JOB = jobArgIdx >= 0 ? argv[jobArgIdx + 1] : null;
  if (jobArgIdx >= 0 && !JOB) {
    console.error('CI-LOCAL: --job needs a job name. Try --jobs to list them.');
    process.exit(2);
  }

  /* CRLF, because smoke.yml has them and a `\r` left on the end of `name:` makes
     every skip-list comparison fail — which is exactly the harness error this file
     raises, arriving for the wrong reason. Normalise once, at the boundary. */
  const text = (await readFile(WORKFLOW, 'utf8')).split('\r\n').join('\n');
  let jobs;
  try { jobs = parseWorkflow(text); } catch (e) {
    console.error('CI-LOCAL: could not read the workflow — ' + e.message);
    console.error('  This file DERIVES its step list from .github/workflows/smoke.yml so the two');
    console.error('  cannot drift. Fix the parser against the workflow\'s real shape; do NOT');
    console.error('  hardcode a second copy of the list here.');
    process.exit(2);
  }

  if (argv.includes('--jobs')) {
    for (const j of jobs) {
      const cmds = j.steps.reduce((n, s) => n + s.run.length, 0);
      console.log(`  ${j.name.padEnd(20)} ${String(j.steps.length).padStart(3)} step(s)  `
        + `${String(cmds).padStart(3)} command(s)  timeout ${j.timeoutMinutes ?? '—'}m`);
    }
    /* NOT process.exit(0): stdout to a PIPE is asynchronous in Node, and an
       immediate exit drops whatever has not flushed. tests/ci-shape.mjs reads
       --list through spawnSync and saw 9,092 of 20,527 bytes (1 run in 8), then
       reported 86-145 commands "not enumerated". Return and let it drain. */
    process.exitCode = 0;
    return;
  }

  if (JOB && !jobs.some((j) => j.name === JOB)) {
    console.error(`CI-LOCAL: no job named "${JOB}" in the workflow. Known: `
      + jobs.map((j) => j.name).join(', '));
    process.exit(2);
  }

  // The skip list must still describe reality.
  const names = flatSteps(jobs).map((s) => s.name);
  const missing = SKIP.filter(([n]) => !names.includes(n)).map(([n]) => n);
  if (missing.length) {
    console.error('CI-LOCAL: these steps are on the skip list but no longer exist in smoke.yml: '
      + missing.join(', '));
    console.error('  A skip that no longer matches a step means this run is quietly doing LESS than');
    console.error('  CI. Update SKIP in tests/run-ci-local.mjs in the same commit as the workflow.');
    process.exit(2);
  }

  const plan = buildPlan(jobs, { all: ALL, job: JOB });
  const live = plan.filter((p) => !p.skipped);
  const total = live.reduce((n, p) => n + p.cmds.length, 0);
  console.log(`CI-LOCAL — ${live.length} step(s), ${total} command(s), derived from `
    + `.github/workflows/smoke.yml${JOB ? `  (--job ${JOB})` : ''}`
    + `${ALL ? '  (--all: the in-page suite included)' : ''}`);
  const skipped = new Set(plan.filter((p) => p.skipped).map((p) => p.name));
  for (const [n, why] of SKIP) {
    if (skipped.has(n)) console.log(`  skipped: ${n}\n           ${why}`);
  }
  console.log('');

  if (LIST) {
    let job = null;
    for (const p of plan) {
      if (p.job !== job) { job = p.job; console.log(`  [job ${job}]`); }
      if (p.skipped) { console.log(`  (skipped) ${p.name}`); continue; }
      console.log(`  ${p.name}`);
      for (const c of p.cmds) console.log(`      ${c}`);
    }
    /* NOT process.exit(0): stdout to a PIPE is asynchronous in Node, and an
       immediate exit drops whatever has not flushed. tests/ci-shape.mjs reads
       --list through spawnSync and saw 9,092 of 20,527 bytes (1 run in 8), then
       reported 86-145 commands "not enumerated". Return and let it drain. */
    process.exitCode = 0;
    return;
  }

  const t0 = Date.now();
  const results = [];
  for (const p of live) {
    for (const cmd of p.cmds) {
      const started = Date.now();
      console.log(`\n${''.padEnd(78, '-')}\n> [${p.job}] ${p.name}\n  $ ${cmd}\n`);
      const r = runCommand(cmd);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      results.push({ job: p.job, step: p.name, cmd, status: r.status, secs, error: r.error, soft: !!p.soft });
      console.log(`\n  ${r.status === 0 ? 'GREEN' : `EXIT ${r.status}${p.soft ? ' (continue-on-error — reported, not gating)' : ''}`} · ${secs}s`);
    }
  }

  console.log(`\n${''.padEnd(78, '=')}\nCI-LOCAL RESULTS\n${''.padEnd(78, '-')}`);
  for (const r of results) {
    const tag = r.status === 0 ? 'GREEN  ' : (r.soft ? 'REPORT ' : 'RED    ');
    console.log(`  ${tag} ${String(r.secs).padStart(7)}s  ${r.cmd}`
      + (r.error ? `  (${r.error})` : ''));
  }
  const red = results.filter((r) => r.status !== 0 && !r.soft);
  const soft = results.filter((r) => r.status !== 0 && r.soft);
  if (soft.length) {
    console.log(''.padEnd(78, '-'));
    console.log(`  ${soft.length} step(s) exited non-zero under continue-on-error — CI will not fail on`);
    console.log('  them either. They are a CENSUS, not a pass: read them.');
  }
  console.log(''.padEnd(78, '-'));
  // Per-job wall clock: the matrix runs these families in PARALLEL, so the CI
  // wall clock is the slowest family, not this sum.
  const byJob = new Map();
  for (const r of results) byJob.set(r.job, (byJob.get(r.job) || 0) + Number(r.secs));
  for (const [j, secs] of byJob) {
    console.log(`  job ${j.padEnd(20)} ${(secs / 60).toFixed(1)} min`);
  }
  /* a REPORT step is not a green one — counting it as green is how a census
     becomes a pass nobody reads. Named on its own. */
  console.log(`  ${results.length - red.length - soft.length}/${results.length} green · `
    + (soft.length ? `${soft.length} reported · ` : '')
    + `${((Date.now() - t0) / 1000).toFixed(1)}s sequential`);
  if (red.length) {
    console.log('\n  A RELEASE IS GREEN ONLY WHEN BOTH THIS RUN AND THE GITHUB RUN ON THE RELEASE');
    console.log('  COMMIT ARE GREEN. Fix the guard, never the guard\'s teeth.');
  }
  process.exitCode = red.length ? 1 : 0;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tests/run-ci-local.mjs')) {
  await main();
}
