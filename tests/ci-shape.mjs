// ════════════════════════════════════════════════════════════════════════
// tests/ci-shape.mjs — EVERY GUARD RUNS, IN EXACTLY ONE JOB
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// On 2026-09-07 the `smoke` workflow was split from ONE sequential job of 58
// commands into a MATRIX of five, so CI's wall clock is the slowest family
// rather than the sum (the b514 run took 50.2 min and was CANCELLED by its own
// timeout — a red build with no failing assertion in it).
//
// A split is the single easiest way to LOSE a guard. Before it, "is this guard
// in CI?" was answered by one list; after it, a step can be dropped while
// moving, land in two jobs and be paid for twice, or be added to a job while
// `run-ci-local` — which DERIVES its list from this file (CLAUDE.md §5) — stops
// enumerating it. None of those is visible in a green Actions page: four jobs
// go green and the fifth simply never had the step.
//
// This repository has shipped a guard that asserted nothing twelve times. So
// the split ships with the thing that would notice:
//
//   CI-SHAPE-1  the workflow parses, and into more than one job
//   CI-SHAPE-2  every job declares timeout-minutes (a job with no budget can
//               hang for six hours and bill the whole account for it)
//   CI-SHAPE-3  every job checks out the repository
//   CI-SHAPE-4  no guard command runs in TWO jobs (paid for twice, and a red
//               one reads as two unrelated failures)
//   CI-SHAPE-5  no registered command has vanished from every job (LOST)
//   CI-SHAPE-6  no command runs that is not registered (UNREGISTERED)
//   CI-SHAPE-7  no command changed family without the record changing with it
//   CI-SHAPE-8  `run-ci-local --list` still enumerates every command in the
//               matrix — the local half of the gate cannot be weaker than CI
//
// ── THE REGISTER ────────────────────────────────────────────────────────────
// tests/ci-shape.baseline.json maps every guard command to the job that owns
// it. It is NOT a second copy of the workflow: it holds no flags, no order and
// no comments, and it exists for exactly one reason — so that a command that
// DISAPPEARS is loud. A file that is merely derived cannot tell you what is
// missing, because what is missing is not in it.
//
// It is regenerated with `--write`, deliberately a separate act: moving a guard
// between families is normal and takes two seconds; deleting one silently is
// what this refuses.
//
// Environment steps (`Install …`) are exempt from CI-SHAPE-4/5/6/7 and named as
// such: `npm install` legitimately runs in four jobs and is not a guard.
//
// Credential-free, database-free, milliseconds. --selftest plants eight defects
// — one per assertion — and requires each to be caught BY ITS NAMED ASSERTION,
// plus two NEGATIVE CONTROLS (a comment-only edit and a whitespace edit) that
// must stay silent. A shape guard that has never been red is decoration.
//
// Exit: 0 green · 1 the shape is wrong · 2 harness (unparseable, or --selftest
// could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, WORKFLOW, parseWorkflow, flatSteps, buildPlan, SKIP } from './run-ci-local.mjs';

const BASELINE_PATH = join(ROOT, 'tests', 'ci-shape.baseline.json');

/** An environment step, not a guard. Derived from the step NAME, never a list. */
export function isInfraStep(step) {
  return /^Install /.test(step.name || '');
}

/** [{ cmd, job, step }] for every guard command in the matrix. */
export function guardCommands(jobs) {
  const out = [];
  for (const s of flatSteps(jobs)) {
    if (isInfraStep(s)) continue;
    for (const cmd of s.run) out.push({ cmd, job: s.job, step: s.name });
  }
  return out;
}

/**
 * The whole verdict, as data. Pure: text in, problems out — which is what lets
 * --selftest plant a defect in a COPY of the workflow and require this to see it.
 *
 * @param {object} o
 * @param {string} o.workflowText
 * @param {object} o.baseline      { commands: { cmd: job } }
 * @param {string} o.listText      the output of `run-ci-local --list`
 * @returns {{problems: {check:string, message:string}[], jobs: any[]}}
 */
export function analyse({ workflowText, baseline, listText }) {
  const problems = [];
  const fail = (check, message) => problems.push({ check, message });

  let jobs;
  try { jobs = parseWorkflow(workflowText); } catch (e) {
    fail('CI-SHAPE-1', `the workflow does not parse: ${e.message}`);
    return { problems, jobs: [] };
  }
  if (jobs.length < 2) {
    fail('CI-SHAPE-1', `the workflow parsed to ${jobs.length} job(s); the matrix is the point — `
      + 'one job means the split has been undone and the wall clock is back to the sum.');
  }

  for (const j of jobs) {
    if (!Number.isFinite(j.timeoutMinutes)) {
      fail('CI-SHAPE-2', `job "${j.name}" declares no timeout-minutes. A job with no budget `
        + 'hangs for the runner default (6 hours) and presents as "still running", not as red.');
    }
    if (!j.steps.some((s) => (s.uses || '').startsWith('actions/checkout'))) {
      fail('CI-SHAPE-3', `job "${j.name}" never checks out the repository — every step in it is `
        + 'running against an empty workspace.');
    }
  }

  const cmds = guardCommands(jobs);

  // CI-SHAPE-4 — one command, one job.
  const byCmd = new Map();
  for (const c of cmds) {
    if (!byCmd.has(c.cmd)) byCmd.set(c.cmd, []);
    byCmd.get(c.cmd).push(c);
  }
  for (const [cmd, uses] of byCmd) {
    const jobsFor = [...new Set(uses.map((u) => u.job))];
    if (jobsFor.length > 1) {
      fail('CI-SHAPE-4', `"${cmd}" runs in ${jobsFor.length} jobs (${jobsFor.join(', ')}). `
        + 'Every command belongs to exactly one family; a duplicate is paid for twice and a red '
        + 'one reads as two unrelated failures.');
    } else if (uses.length > 1) {
      fail('CI-SHAPE-4', `"${cmd}" runs ${uses.length} times inside job "${jobsFor[0]}" `
        + `(steps: ${[...new Set(uses.map((u) => u.step))].join(' | ')}).`);
    }
  }

  // CI-SHAPE-5/6/7 — against the register.
  const registered = new Map(Object.entries((baseline && baseline.commands) || {}));
  for (const [cmd, job] of registered) {
    const found = byCmd.get(cmd);
    if (!found) {
      fail('CI-SHAPE-5', `"${cmd}" is registered (job "${job}") and now runs in NO job. `
        + 'A guard that stopped running is the failure mode of a matrix split. If the removal '
        + 'is deliberate, re-run with --write in the same commit.');
    } else if (found[0].job !== job) {
      fail('CI-SHAPE-7', `"${cmd}" moved from job "${job}" to "${found[0].job}" without the `
        + 'register moving with it. Rebalancing families is fine — re-run with --write.');
    }
  }
  for (const [cmd, uses] of byCmd) {
    if (!registered.has(cmd)) {
      fail('CI-SHAPE-6', `"${cmd}" (job "${uses[0].job}", step "${uses[0].step}") is not in `
        + 'tests/ci-shape.baseline.json. Register it with --write so a later edit that deletes '
        + 'it is loud.');
    }
  }

  // CI-SHAPE-8 — the local half enumerates the whole matrix.
  if (typeof listText === 'string') {
    const skipped = new Set(SKIP.map(([n]) => n));
    const listed = new Set(
      listText.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('node ') || l.startsWith('bash ')));
    for (const c of cmds) {
      if (skipped.has(c.step)) continue;
      if (!listed.has(c.cmd)) {
        fail('CI-SHAPE-8', `run-ci-local --list does not enumerate "${c.cmd}" (job "${c.job}"). `
          + 'The local gate would then be strictly weaker than CI — the exact P0 that '
          + 'tests/run-ci-local.mjs was written to close.');
      }
    }
  }

  return { problems, jobs };
}

// ── the runners ───────────────────────────────────────────────────────────
async function readBaseline() {
  try { return JSON.parse(await readFile(BASELINE_PATH, 'utf8')); }
  catch { return { commands: {} }; }
}

function localList() {
  const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'run-ci-local.mjs'), '--list'],
    { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    const e = new Error('`node tests/run-ci-local.mjs --list` exited '
      + `${r.status}: ${(r.stderr || '').trim().split('\n')[0]}`);
    e.harness = true; throw e;
  }
  return r.stdout;
}

async function runReport({ write }) {
  const workflowText = await readFile(WORKFLOW, 'utf8');
  const jobs = parseWorkflow(workflowText);

  if (write) {
    const commands = {};
    for (const c of guardCommands(jobs)) commands[c.cmd] = c.job;
    const payload = {
      _why: 'THE REGISTER of every guard command in .github/workflows/smoke.yml and the matrix '
        + 'job that owns it. Regenerated by `node tests/ci-shape.mjs --write`; never hand-edited '
        + 'to make a red build green. Its only job is to make a command that DISAPPEARS loud — a '
        + 'derived list cannot tell you what is missing, because what is missing is not in it.',
      _generated_by: 'node tests/ci-shape.mjs --write',
      commands,
    };
    await writeFile(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`ci-shape: registered ${Object.keys(commands).length} command(s) across `
      + `${jobs.length} job(s) -> tests/ci-shape.baseline.json`);
    return 0;
  }

  const baseline = await readBaseline();
  const listText = localList();
  const { problems } = analyse({ workflowText, baseline, listText });

  const cmds = guardCommands(jobs);
  console.log('CI SHAPE — .github/workflows/smoke.yml\n');
  for (const j of jobs) {
    const n = j.steps.filter((s) => s.run.length).length;
    const c = j.steps.reduce((a, s) => a + s.run.length, 0);
    console.log(`  ${j.name.padEnd(20)} ${String(n).padStart(3)} step(s)  `
      + `${String(c).padStart(3)} command(s)  timeout ${j.timeoutMinutes ?? '—'}m`);
  }
  console.log(`\n  ${cmds.length} guard command(s), `
    + `${new Set(cmds.map((x) => x.cmd)).size} distinct, across ${jobs.length} job(s)`);

  if (!problems.length) {
    console.log('\n  ok — every guard command runs in exactly one job, the register agrees, and');
    console.log('       run-ci-local --list enumerates the whole matrix.');
    return 0;
  }
  console.log('');
  for (const p of problems) console.log(`  ${p.check}  ${p.message}`);
  console.log(`\n  ${problems.length} problem(s). Guards are never loosened to get green `
    + '(CLAUDE.md §2): fix the workflow, or --write if the change was deliberate.');
  return 1;
}

// ── --selftest: one planted defect per assertion, plus two controls ────────
async function selftest() {
  const workflowText = (await readFile(WORKFLOW, 'utf8')).split('\r\n').join('\n');
  const jobs = parseWorkflow(workflowText);
  const baseline = { commands: {} };
  for (const c of guardCommands(jobs)) baseline.commands[c.cmd] = c.job;
  const listOf = (text) => buildPlan(parseWorkflow(text))
    .filter((p) => !p.skipped).flatMap((p) => p.cmds).map((c) => `      ${c}`).join('\n');
  const listText = listOf(workflowText);

  const clean = analyse({ workflowText, baseline, listText });
  if (clean.problems.length) {
    console.error('SELFTEST HARNESS: the UNMUTATED workflow already reports problems, so every');
    console.error('  "caught" below would be meaningless. Fix the real shape first:');
    for (const p of clean.problems) console.error(`    ${p.check}  ${p.message}`);
    process.exit(2);
  }
  console.log('ci-shape --selftest — false-positive floor: the real workflow reports 0 problems\n');

  const lines = workflowText.split('\n');

  /** Remove the whole `- name:/if:/run:` step whose run line is exactly `cmd`. */
  const dropStep = (cmd) => {
    const ls = [...lines];
    const at = ls.findIndex((l) => l.trim() === `run: ${cmd}`);
    if (at < 0) throw harness(`--selftest could not find the step running "${cmd}"`);
    let start = at;
    while (start >= 0 && !/^      - name:/.test(ls[start])) start--;
    if (start < 0) throw harness(`--selftest could not find the "- name:" of "${cmd}"`);
    ls.splice(start, at - start + 1);
    return ls.join('\n');
  };
  /** Insert raw lines immediately after the named job's `steps:`. */
  const insertInJob = (jobName, extra) => {
    const ls = [...lines];
    const at = ls.findIndex((l) => l === `  ${jobName}:`);
    if (at < 0) throw harness(`--selftest: no job "${jobName}"`);
    const st = ls.findIndex((l, i) => i > at && l === '    steps:');
    if (st < 0) throw harness(`--selftest: job "${jobName}" has no steps:`);
    ls.splice(st + 1, 0, ...extra);
    return ls.join('\n');
  };
  const dropLine = (pred, what) => {
    const ls = [...lines];
    const at = ls.findIndex(pred);
    if (at < 0) throw harness(`--selftest could not find ${what}`);
    ls.splice(at, 1);
    return ls.join('\n');
  };
  const harness = (m) => { const e = new Error(m); e.harness = true; return e; };

  const PROBE = 'node tests/rpc-resolution.mjs';
  const JWT = 'node tests/edge-jwt-gate.mjs --strict';

  const arms = [
    ['the matrix collapsed back to something unparseable', 'CI-SHAPE-1', () => ({
      workflowText: dropLine((l) => l === 'jobs:', 'the "jobs:" line'), baseline, listText,
    })],
    ['a registered guard deleted while moving jobs', 'CI-SHAPE-5', () => ({
      workflowText: dropStep(PROBE), baseline, listText,
    })],
    ['the same guard command left in TWO jobs', 'CI-SHAPE-4', () => {
      const wf = insertInJob('client-guards', [
        '      - name: Duplicated probe (planted)',
        `        run: ${PROBE}`,
      ]);
      return { workflowText: wf, baseline, listText: listOf(wf) };
    }],
    ['a new guard step nobody registered', 'CI-SHAPE-6', () => {
      const wf = insertInJob('client-guards', [
        '      - name: Unregistered probe (planted)',
        '        run: node tests/not-a-registered-guard.mjs',
      ]);
      return { workflowText: wf, baseline, listText: listOf(wf) };
    }],
    ['a guard moved to another family, register not updated', 'CI-SHAPE-7', () => ({
      workflowText,
      baseline: { commands: { ...baseline.commands, [JWT]: 'a-job-that-does-not-own-it' } },
      listText,
    })],
    ['a job with no timeout-minutes', 'CI-SHAPE-2', () => {
      // Structural, not by value: the budgets are measurements and they move.
      const ls = [...lines];
      const at = ls.indexOf('  edge:');
      const to = ls.findIndex((l, i) => i > at && /^    timeout-minutes:/.test(l));
      if (to < 0) throw harness('--selftest could not find the edge job timeout');
      ls.splice(to, 1);
      return { workflowText: ls.join('\n'), baseline, listText };
    }],
    ['a job that never checks out the repository', 'CI-SHAPE-3', () => {
      // Remove the checkout of the LAST job (edge) only.
      const ls = [...lines];
      const at = ls.findIndex((l) => l === '  edge:');
      const co = ls.findIndex((l, i) => i > at && l.trim() === '- uses: actions/checkout@v4');
      if (co < 0) throw harness('--selftest could not find the edge job checkout');
      ls.splice(co, 1);
      return { workflowText: ls.join('\n'), baseline, listText };
    }],
    ['run-ci-local --list stops enumerating a command', 'CI-SHAPE-8', () => ({
      workflowText, baseline,
      listText: listText.split('\n').filter((l) => l.trim() !== PROBE).join('\n'),
    })],
  ];

  const controls = [
    ['NEGATIVE CONTROL: a comment added inside a job', () => ({
      workflowText: insertInJob('edge', ['      # a harmless note']), baseline, listText,
    })],
    ['NEGATIVE CONTROL: a blank line added inside a job', () => ({
      workflowText: insertInJob('edge', ['']), baseline, listText,
    })],
  ];

  let bad = 0;
  for (const [label, check, mutate] of arms) {
    let got;
    try { got = analyse(mutate()); } catch (e) {
      console.error(`  HARNESS  ${label} — ${e.message}`);
      process.exit(2);
    }
    const hit = got.problems.filter((p) => p.check === check);
    const others = got.problems.filter((p) => p.check !== check);
    if (hit.length) {
      console.log(`  CAUGHT   ${label}\n           ${check}: ${hit[0].message.split('. ')[0]}.`);
      if (others.length) {
        console.log(`           (also reported: ${[...new Set(others.map((o) => o.check))].join(', ')})`);
      }
    } else {
      bad++;
      console.log(`  MISSED   ${label} — ${check} never fired`
        + (got.problems.length ? ` (only: ${[...new Set(got.problems.map((p) => p.check))].join(', ')})` : ' (no problem at all)'));
    }
  }
  for (const [label, mutate] of controls) {
    const got = analyse(mutate());
    if (got.problems.length) {
      bad++;
      console.log(`  FALSE +  ${label} — reported `
        + got.problems.map((p) => p.check).join(', '));
    } else {
      console.log(`  silent   ${label}`);
    }
  }

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED` : `all ${arms.length} defects caught by their named `
    + `assertion, all ${controls.length} controls silent`}`);
  return bad ? 1 : 0;
}

const argv = process.argv.slice(2);
try {
  const code = argv.includes('--selftest')
    ? await selftest()
    : await runReport({ write: argv.includes('--write') });
  process.exit(code);
} catch (e) {
  console.error(e.message);
  process.exit(e.harness ? 2 : 1);
}
