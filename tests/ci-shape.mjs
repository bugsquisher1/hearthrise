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
//   CI-SHAPE-1  the workflow parses, into more than one job, with no job name twice (GitHub refuses
//               such a file before any job starts: run 41009307704, a red with no jobs at all)
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
//   CI-SHAPE-9  every --mutate/--selftest command runs through the mutant gate
//               (`node tools/mutant-gate.mjs node tests/x.mjs --mutate`, CLAUDE.md
//               §3.6) — an ungated proof re-runs on every push and is the cost
//               the gate exists to remove
//   CI-SHAPE-10 no PLAIN guard run goes through the gate — plain runs always run,
//               and a gated one could be skipped on a push that did not touch it
//   CI-SHAPE-11 every apt-get update/install and `playwright install` a composite
//               action (.github/actions/*/action.yml) runs has a `timeout` (run
//               42758317717: an install step sat silent 43 min, past its job's limit)
//   CI-SHAPE-12 jobs are listed by timeout-minutes (each job's full sweep x2), never rising, so GitHub,
//               which starts queued jobs in file order, starts the long ones first; a job others
//               `needs` stands first (lane/ci-speed, 2026-11-18)
//   CI-SHAPE-13 the workflow is what the guards' headers write (tools/lib/ci-register.mjs): a guard
//               registers itself with `// ci-step: <job> | <name>` and `// ci-run: <cmd>` lines, and
//               --write generates its step into its job's SELF-REGISTERED region. Red on a header naming
//               a job the file lacks, a generated step with no header behind it, a region edited by
//               hand, or a header not written yet (architecture audit 2026-11-19, row 8)
//   CI-SHAPE-14 a proof split into shards (`--shard=K/N`) runs every shard 1..N exactly once, all with one N:
//               a shard left out is a third of a proof that never runs, and every other job stays green
//               (lane/ci-reds-1127, 2026-11-27, when the Call out and HUD proofs were split across jobs)
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
// Credential-free, database-free, milliseconds. --selftest plants ten defects
// — one per assertion — and requires each to be caught BY ITS NAMED ASSERTION,
// plus two NEGATIVE CONTROLS (a comment-only edit and a whitespace edit) that
// must stay silent. A shape guard that has never been red is decoration.
//
// Exit: 0 green · 1 the shape is wrong · 2 harness (unparseable, or --selftest
// could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, WORKFLOW, parseWorkflow, flatSteps, buildPlan, SKIP } from './run-ci-local.mjs';
import { isGated, isProofCommand, GATE_PREFIX } from '../tools/lib/guard-deps.mjs';
import { readHeaders, generate, regionSteps, headerSteps } from '../tools/lib/ci-register.mjs';

const BASELINE_PATH = join(ROOT, 'tests', 'ci-shape.baseline.json');
/** A mutant shard on a command line (` --shard=K/N`, CI-SHAPE-14). */
const SHARD_FLAG = /\s--shard=(\d+)\/(\d+)(?=\s|$)/;

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

/* A fetch over the network that can stall with no output: apt's index and packages, and Playwright's browser download. */
const NET_FETCH = /\b(?:apt-get|apt)\s+(?:-\S+\s+)*(?:update|install|upgrade|dist-upgrade)\b|\bplaywright\s+install\b/;
const DEADLINE = /\btimeout\s+(?:-{1,2}[\w-]+(?:[=\s]+\d+[smhd]?)?\s+)*\d+[smhd]?\s/;

/** [{ line, cmd }] for every shell line of a composite action's `run:` steps (inline or block), comments dropped. */
export function actionRunLines(text) {
  const out = [];
  let block = -1;
  text.split(/\r?\n/).forEach((raw, i) => {
    const indent = raw.match(/^ */)[0].length;
    if (block >= 0 && (raw.trim() === '' || indent > block)) {
      const cmd = raw.trim();
      if (cmd && !cmd.startsWith('#')) out.push({ line: i + 1, cmd });
      return;
    }
    block = -1;
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(raw);
    if (!m) return;
    if (/^[|>][-+]?\s*$/.test(m[2])) block = m[1].length + (/^\s*-\s+run:/.test(raw) ? 2 : 0);
    else if (m[2].trim()) out.push({ line: i + 1, cmd: m[2].trim() });
  });
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
 * @param {{path: string, text: string}[]} [o.actions]  the composite actions (.github/actions/*\/action.yml)
 * @param {{steps: object[], errors: object[]}} [o.headers]  the guards' ci-step headers (tools/lib/ci-register.mjs); none = CI-SHAPE-13 not judged
 * @returns {{problems: {check:string, message:string}[], jobs: any[]}}
 */
export function analyse({ workflowText, baseline, listText, actions = [], headers = null }) {
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
  const twice = jobs.map((j) => j.name).filter((n, i, all) => all.indexOf(n) !== i);
  if (twice.length) fail('CI-SHAPE-1', `job name(s) ${[...new Set(twice)].join(', ')} appear twice: GitHub will not load the workflow at all.`);

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

  // CI-SHAPE-12 — longest first. GitHub starts queued jobs roughly in file order, so a long job left for the
  // last wave sets the run's tail (lane/ci-speed, 2026-11-18). timeout-minutes is each job's measured full
  // sweep x2, so the file lists jobs by it, never rising; a job other jobs `needs` stands first, whatever its budget.
  const needed = new Set(jobs.flatMap((j) => j.needs || []));
  let prev = null;
  for (const j of jobs) {
    if (needed.has(j.name) || !Number.isFinite(j.timeoutMinutes)) continue;
    if (prev && j.timeoutMinutes > prev.timeoutMinutes) {
      fail('CI-SHAPE-12', `job "${j.name}" (timeout-minutes ${j.timeoutMinutes}) is listed after "${prev.name}" `
        + `(${prev.timeoutMinutes}). Jobs go longest first: GitHub starts them in file order, and a long job in the last `
        + 'wave sets the run\'s wall time. Move it up to where its timeout puts it.');
    }
    prev = j;
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

  // CI-SHAPE-9/10 — every proof through the mutant gate, no plain run through it.
  for (const c of cmds) {
    if (isProofCommand(c.cmd) && !isGated(c.cmd)) {
      fail('CI-SHAPE-9', `"${c.cmd}" (job "${c.job}") is a mutation proof that does not run through `
        + `the mutant gate. Write it "${GATE_PREFIX}${c.cmd}": a push then re-proves it only when its `
        + 'diff touches the guard, and the nightly sweep always does (CLAUDE.md §3.6).');
    } else if (!isProofCommand(c.cmd) && isGated(c.cmd)) {
      fail('CI-SHAPE-10', `"${c.cmd}" (job "${c.job}") is a PLAIN guard run behind the mutant gate. `
        + 'Plain runs always run; drop the gate prefix.');
    }
  }

  // CI-SHAPE-11 — a network fetch in a composite action has a deadline.
  for (const a of actions) {
    for (const { line, cmd } of actionRunLines(a.text)) {
      /* A quoted string is a message, not a call ("::warning::apt-get update did not finish"). */
      const bare = cmd.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
      const net = NET_FETCH.exec(bare);
      if (!net) continue;
      const by = DEADLINE.exec(bare);
      if (by && by.index < net.index) continue;
      fail('CI-SHAPE-11', `${a.path}:${line} fetches with no deadline: "${cmd}". A stalled mirror then holds `
        + 'the job silent until its timeout-minutes (run 42758317717: 43 min, no test run). Run it under '
        + '`timeout <seconds>`, and say what happens when the deadline passes.');
    }
  }

  // CI-SHAPE-14 — a sharded proof runs every shard once. The family is the command with its --shard=K/N taken out.
  const families = new Map();
  for (const c of cmds) {
    const m = SHARD_FLAG.exec(c.cmd);
    if (!m) continue;
    const fam = c.cmd.replace(SHARD_FLAG, ' --shard=K/N');
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam).push({ k: +m[1], n: +m[2], job: c.job });
  }
  for (const [fam, got] of families) {
    const ns = [...new Set(got.map((x) => x.n))];
    if (ns.length !== 1) { fail('CI-SHAPE-14', `"${fam}" runs with shard counts ${ns.join(' and ')} (${got.map((x) => `${x.k}/${x.n} in ${x.job}`).join(', ')}). One proof is cut one way: every shard says the same N.`); continue; }
    const n = ns[0];
    const missing = [], extra = [];
    for (let k = 1; k <= n; k++) if (!got.some((x) => x.k === k)) missing.push(`${k}/${n}`);
    for (const x of got) if (x.k < 1 || x.k > n) extra.push(`${x.k}/${x.n}`);
    if (missing.length || extra.length) {
      fail('CI-SHAPE-14', `"${fam}" ${missing.length ? `never runs shard ${missing.join(', ')}` : ''}${missing.length && extra.length ? ' and ' : ''}${extra.length ? `runs a shard outside 1..${n} (${extra.join(', ')})` : ''}. `
        + 'A shard left out is part of a proof that never runs while every job stays green: register every K of the N.');
    }
  }

  // CI-SHAPE-13 — the workflow is what the headers write.
  if (headers) {
    for (const e of headers.errors) fail('CI-SHAPE-13', `${e.file}:${e.line} ${e.message}.`);
    const gen = generate(workflowText, headers.steps);
    for (const p of gen.problems) fail('CI-SHAPE-13', `${p.message}. Name a job the workflow has, or add the job.`);
    const have = workflowText.split('\r\n').join('\n');
    if (gen.text !== have) {
      const key = (x) => `${x.file} | ${x.name} | ${x.run.join(' ; ')}`;
      const want = new Set(regionSteps(gen.text).map(key));
      const got = regionSteps(have);
      const named = [];
      for (const x of got) {
        if (!want.has(key(x))) named.push(`smoke.yml runs the self-registered step "${x.name}" (${x.file || 'no file named'}) that no guard header writes (a job without a header): put the header back, or regenerate`);
      }
      const gotKeys = new Set(got.map(key));
      for (const k of want) if (!gotKeys.has(k)) named.push(`a guard header registers "${k}" and smoke.yml does not run it yet`);
      if (!named.length) named.push('a SELF-REGISTERED region differs from what the headers write (edited by hand, or moved)');
      for (const m of named) fail('CI-SHAPE-13', `${m}. Steps in a SELF-REGISTERED region come only from guard headers: `
        + 'edit the header and run `node tests/ci-shape.mjs --write`, never the region.');
    }
  }

  return { problems, jobs };
}

// ── the runners ───────────────────────────────────────────────────────────
async function readBaseline() {
  try { return JSON.parse(await readFile(BASELINE_PATH, 'utf8')); }
  catch { return { commands: {} }; }
}

/** Every composite action the workflow can use: [{ path, text }]. */
async function readActions() {
  const dir = join(ROOT, '.github', 'actions');
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory()) continue;
    const path = `.github/actions/${d.name}/action.yml`;
    try { out.push({ path, text: (await readFile(join(ROOT, path), 'utf8')).split('\r\n').join('\n') }); } catch { /* no action.yml */ }
  }
  return out;
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
  let workflowText = await readFile(WORKFLOW, 'utf8');
  const headers = readHeaders(ROOT);

  if (write) {
    /* the guards' headers first (CI-SHAPE-13), in the file's own line ends; a header that cannot be written stops here */
    const gen = generate(workflowText, headers.steps);
    const bad = [...headers.errors.map((e) => `${e.file}:${e.line} ${e.message}`), ...gen.problems.map((p) => p.message)];
    if (bad.length) { for (const m of bad) console.error(`ci-shape --write: ${m}`); return 1; }
    const text = workflowText.includes('\r\n') ? gen.text.split('\n').join('\r\n') : gen.text;
    if (text !== workflowText) { await writeFile(WORKFLOW, text); workflowText = text; }
    console.log(`ci-shape: ${headers.steps.length} self-registered step(s) written from guard headers -> .github/workflows/smoke.yml`);
  }
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
  const actions = await readActions();
  const { problems } = analyse({ workflowText, baseline, listText, actions, headers });

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
    console.log(`\n  ok — every guard command runs in exactly one job, the register agrees, ${headers.steps.length} step(s) are their guards' headers, and`);
    console.log(`       run-ci-local --list enumerates the whole matrix; ${actions.length} composite action(s) fetch under a deadline.`);
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
  const actions = await readActions();
  if (!actions.length) { console.error('SELFTEST HARNESS: no .github/actions/*/action.yml to read'); process.exit(2); }

  const headers = readHeaders(ROOT);
  if (!headers.steps.length) { console.error('SELFTEST HARNESS: no guard carries a "// ci-step:" header, so CI-SHAPE-13 has nothing to plant against'); process.exit(2); }
  const clean = analyse({ workflowText, baseline, listText, actions, headers });
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
  /** The actions, with ONE edit to the browser install action (structural: its deadlines are measurements and move). */
  const inAction = (re, to) => actions.map((a) => {
    if (!a.path.includes('/playwright-chromium/')) return a;
    const hits = a.text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || [];
    if (hits.length !== 1) throw harness(`--selftest: ${re} matches ${hits.length} time(s) in ${a.path}, not once`);
    return { ...a, text: a.text.replace(re, to) };
  });

  const PROBE = 'node tests/rpc-resolution.mjs';
  const JWT = 'node tests/edge-jwt-gate.mjs --strict';

  const arms = [
    ['two jobs with one name, so GitHub refuses the file', 'CI-SHAPE-1', () => ({
      workflowText: workflowText.replace(/^ {2}client-guards-2:$/m, '  client-guards:'), baseline, listText,
    })],
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
    ['a --mutate step that skips the mutant gate', 'CI-SHAPE-9', () => {
      const cmd = 'node tests/not-a-registered-guard.mjs --mutate';
      const wf = insertInJob('client-guards', ['      - name: Ungated mutant (planted)', `        run: ${cmd}`]);
      return { workflowText: wf, baseline: { commands: { ...baseline.commands, [cmd]: 'client-guards' } }, listText: listOf(wf) };
    }],
    ['a plain guard run behind the mutant gate', 'CI-SHAPE-10', () => {
      const cmd = `${GATE_PREFIX}node tests/not-a-registered-guard.mjs`;
      const wf = insertInJob('client-guards', ['      - name: Gated plain run (planted)', `        run: ${cmd}`]);
      return { workflowText: wf, baseline: { commands: { ...baseline.commands, [cmd]: 'client-guards' } }, listText: listOf(wf) };
    }],
    ['run-ci-local --list stops enumerating a command', 'CI-SHAPE-8', () => ({
      workflowText, baseline,
      listText: listText.split('\n').filter((l) => l.trim() !== PROBE).join('\n'),
    })],
    ['the seed\'s apt-get update without its deadline (run 42758317717)', 'CI-SHAPE-11', () => ({
      workflowText, baseline, listText, actions: inAction(/\btimeout\s+(?:-k\s+\d+\s+)?\d+\s+(sudo apt-get update\b)/, '$1'),
    })],
    ['the browser install without its deadline', 'CI-SHAPE-11', () => ({
      workflowText, baseline, listText, actions: inAction(/\btimeout\s+(?:-k\s+\d+\s+)?\d+\s+(npx playwright install\b)/, '$1'),
    })],
    ['a long job appended at the end of the file (the last wave sets the tail)', 'CI-SHAPE-12', () => {
      // Structural: the LAST job's budget raised past the job above it.
      const ls = [...lines];
      const at = ls.indexOf('  edge:');
      const to = ls.findIndex((l, i) => i > at && /^    timeout-minutes:/.test(l));
      if (to < 0) throw harness('--selftest could not find the edge job timeout');
      ls[to] = '    timeout-minutes: 999';
      return { workflowText: ls.join('\n'), baseline, listText };
    }],
    ['a sharded proof with one shard cut another way (its last shard never runs)', 'CI-SHAPE-14', () => {
      // Structural: the matrix's first sharded proof, its K/N rewritten K/(N+1) in the workflow, so shard N+1 is never run.
      const c = guardCommands(jobs).find((x) => SHARD_FLAG.test(x.cmd));
      if (!c) throw harness('--selftest: no command in the matrix runs with --shard=K/N');
      const m = SHARD_FLAG.exec(c.cmd);
      const moved = c.cmd.replace(SHARD_FLAG, ` --shard=${m[1]}/${+m[2] + 1}`);
      if (workflowText.split(c.cmd).length !== 2) throw harness(`--selftest: "${c.cmd}" is not in the workflow exactly once`);
      const wf = workflowText.replace(c.cmd, () => moved);
      const { [c.cmd]: _gone, ...rest } = baseline.commands;
      return { workflowText: wf, baseline: { commands: { ...rest, [moved]: c.job } }, listText: listOf(wf) };
    }],
    ['a sharded proof with one shard left out (the same N, one K never registered)', 'CI-SHAPE-14', () => {
      // Structural: the matrix's first sharded proof loses its --shard, so its family never runs that K (the rest keep their N).
      const c = guardCommands(jobs).find((x) => SHARD_FLAG.test(x.cmd));
      if (!c) throw harness('--selftest: no command in the matrix runs with --shard=K/N');
      const gone = c.cmd.replace(SHARD_FLAG, ' --planted-unsharded');
      if (workflowText.split(c.cmd).length !== 2) throw harness(`--selftest: "${c.cmd}" is not in the workflow exactly once`);
      const wf = workflowText.replace(c.cmd, () => gone);
      const { [c.cmd]: _gone, ...rest } = baseline.commands;
      return { workflowText: wf, baseline: { commands: { ...rest, [gone]: c.job } }, listText: listOf(wf) };
    }],
  ];

  /* CI-SHAPE-13: the headers, planted wrong in turn (the workflow left as it is), and a region edited by hand. */
  const firstRun = headers.steps[0].run[0];
  const withHeaders = (h, wf = workflowText) => ({ workflowText: wf, baseline, listText: listOf(wf), headers: h });
  arms.push(
    ['a header naming a job the workflow does not have (a header without a job)', 'CI-SHAPE-13', () => withHeaders({ ...headers,
      steps: [...headers.steps, { file: 'tests/zz-planted.mjs', line: 2, job: 'no-such-job', name: 'Planted', run: ['node tests/zz-planted.mjs'] }] })],
    ['a self-registered step whose guard lost its header (a job without a header)', 'CI-SHAPE-13', () => withHeaders({ ...headers, steps: headers.steps.slice(1) })],
    ['a new header nobody wrote into the workflow', 'CI-SHAPE-13', () => withHeaders({ ...headers,
      steps: [...headers.steps, { ...headers.steps[0], file: 'tests/zz-planted.mjs', name: 'Planted', run: ['node tests/zz-planted.mjs'] }] })],
    ['a self-registered step edited by hand', 'CI-SHAPE-13', () => {
      const at = lines.findIndex((l) => l.trim() === firstRun);
      if (at < 0) throw harness(`--selftest: the region does not run "${firstRun}"`);
      const ls = [...lines]; ls[at] += ' --planted';
      return withHeaders(headers, ls.join('\n'));
    }],
    ['a header line that is not "<job> | <step name>"', 'CI-SHAPE-13', () => withHeaders({ ...headers,
      errors: [...headers.errors, { file: 'tests/zz-planted.mjs', line: 2, message: '"// ci-step: client-guards" is not "// ci-step: <job> | <step name>"' }] })],
    ['a step name with ": " in it, which GitHub reads as invalid YAML and refuses the whole workflow (2026-11-22)', 'CI-SHAPE-13', () => {
      const h = headerSteps('tests/zz-planted.mjs', ['// ci-step: client-guards | Planted: a colon and a space', '// ci-run: node tests/zz-planted.mjs', ''].join('\n'));
      if (!h.errors.length) throw harness('--selftest: the header reader took a step name with ": " (tools/lib/ci-register.mjs headerSteps)');
      return withHeaders({ ...headers, errors: [...headers.errors, ...h.errors] });
    }],
  );

  const controls = [
    ['NEGATIVE CONTROL: a comment added inside a job', () => ({
      workflowText: insertInJob('edge', ['      # a harmless note']), baseline, listText,
    })],
    ['NEGATIVE CONTROL: a blank line added inside a job', () => ({
      workflowText: insertInJob('edge', ['']), baseline, listText,
    })],
    ['NEGATIVE CONTROL: a comment and a message in an action\'s shell that name apt-get update', () => ({
      workflowText, baseline, listText,
      actions: inAction(/^( *)seed=\(\)$/m, '$1seed=()\n$1# sudo apt-get update -qq (a note, not a call)\n$1echo "sudo apt-get update is next"'),
    })],
  ];

  let bad = 0;
  for (const [label, check, mutate] of arms) {
    let got;
    try { got = analyse({ actions, ...mutate() }); } catch (e) {
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
    const got = analyse({ actions, ...mutate() });
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
