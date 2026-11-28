#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/utc-midnight-shards.mjs — THE UTC MIDNIGHT REPLAY'S SHARDS HOLD EVERY ARM AND EVERY PROOF ONCE, EACH JOB IN BUDGET
//
// tests/utc-midnight-replay.mjs replays the whole migration chain once per arm (13 arms, plus the control in every shard)
// and twice more for its proof. On 2026-11-28 one replay of the 902-file chain took 189-193 s on the fallback run
// 46117646677 and up to 246 s on 46132371081, twice the 11-17 figure, so its two jobs (shard 1/2 + the proof, and shard
// 2/2 in db-replay-14) ran 34.6 of 35 min, were cancelled at 35 on 46132371081 and 46138211972, and set those runs' tail.
// It now runs in five jobs, utc-midnight-replay..-5, each a fifth of the arms, and -4 and -5 a half of the proof each.
// A split is the easiest way to lose a case (an arm no shard deals is a midnight nobody replays, and every job stays
// green), and a chain that keeps growing is the way the next job runs into its timeout. So, read from smoke.yml:
//
//   UTC-PLAN-1  every arm runs in exactly one plain shard, all cut one way, no shard empty
//   UTC-PLAN-2  every proof unit runs in exactly one --selftest shard, the same way
//   UTC-PLAN-3  this check itself runs exactly once
//   UTC-PLAN-4  a job that holds a shard runs that guard alone, so its booking is its whole time
//   UTC-PLAN-5  a job that holds a shard is booked at most 75% of its timeout-minutes
//
// THE BOOKING. SETUP_S (checkout, npm install, the gate's plan: 89 s on a 2,144-file diff in 46132371081, the probe, the
// arms that stop at the target file) plus REPLAY_S for each whole-chain replay, scaled by the chain's bytes against
// CHAIN_BYTES. REPLAY_S is the slowest arm measured, 10:41:39 to 10:45:45 on run 46132371081, when the chain was
// CHAIN_BYTES. The scaling undercounts a chain whose new files run heavier than its old ones (0.14 s a file on 11-17,
// 0.27 now), so re-measure REPLAY_S off a slow run's arm lines (each prints its seconds) when the chain grows by a third.
//
// The arms, the proof units and the dealing rule are tests/_utc-arms.mjs, the one list both files read. Every run also
// plants eleven defects in memory, each of which must be red by its own rule. No database, no network, milliseconds.
//
// Exit: 0 green · 1 the shards are wrong or over budget · 2 harness (unparseable, or a planted defect went uncaught).
//
// ci-step: client-guards | UTC midnight replay shards - every arm and every proof in exactly one shard, each job within budget
// ci-run: node tests/utc-midnight-shards.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkflow, WORKFLOW } from './run-ci-local.mjs';
import { PROOF_UNITS, SHARD_FLAG, armsOf, shardOf } from './_utc-arms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGDIR = join(ROOT, 'supabase', 'migrations');
const REPLAY_S = 246;
const CHAIN_BYTES = 39_626_172;   // supabase/migrations/*.sql at 67ad63f27 (run 46132371081), CR not counted
const SETUP_S = 180;
const BUDGET_SHARE = 0.75;
const GUARD = 'tests/utc-midnight-replay.mjs';
const SELF = 'tests/utc-midnight-shards.mjs';
const GATE = 'node tools/mutant-gate.mjs ';

/** The chain's bytes (supabase/migrations/*.sql), CR not counted, so a Windows checkout books what a runner does. */
function chainBytes() {
  let n = 0;
  for (const f of readdirSync(MIGDIR)) {
    if (!f.endsWith('.sql')) continue;
    const b = readFileSync(join(MIGDIR, f));
    n += b.length;
    for (let i = b.indexOf(13); i >= 0; i = b.indexOf(13, i + 1)) n--;
  }
  return n;
}

/** Every workflow command that runs the replay guard or this check: { job, cmd, kind: 'arms' | 'proof' | 'plan', sh }. */
function utcCommands(jobs) {
  const out = [];
  for (const j of jobs) {
    for (const s of j.steps) {
      if (/^Install /.test(s.name || '')) continue;   // environment steps, as tests/ci-shape.mjs isInfraStep reads them
      for (const cmd of s.run) {
        const inner = cmd.startsWith(GATE) ? cmd.slice(GATE.length).trimStart() : cmd;
        if (inner === `node ${SELF}` || inner.startsWith(`node ${SELF} `)) { out.push({ job: j.name, cmd, kind: 'plan', sh: null }); continue; }
        if (inner !== `node ${GUARD}` && !inner.startsWith(`node ${GUARD} `)) continue;
        const m = SHARD_FLAG.exec(inner);
        out.push({ job: j.name, cmd, kind: /\s--selftest(?=\s|$)/.test(inner) ? 'proof' : 'arms', sh: m ? { k: +m[1], n: +m[2] } : null });
      }
    }
  }
  return out;
}

/**
 * The verdict on parsed jobs: { problems: [{ rule, message }], rows, replayS }. Pure. `pick` is the dealing rule (planted
 * wrong below), `bytes` the chain's size.
 */
function planOf(jobs, { arms = armsOf(0).map(([l]) => l), proofs = PROOF_UNITS, pick = shardOf, bytes = CHAIN_BYTES } = {}) {
  const problems = [];
  const fail = (rule, message) => problems.push({ rule, message });
  const cmds = utcCommands(jobs);
  const where = (c) => `${c.sh ? `${c.sh.k}/${c.sh.n}` : 'unsharded'} in ${c.job}`;
  const family = (rule, kind, items, what) => {
    const runs = cmds.filter((c) => c.kind === kind);
    const ns = [...new Set(runs.map((c) => (c.sh ? c.sh.n : 1)))];
    if (ns.length > 1) fail(rule, `the ${what} runs are cut ${ns.join(' and ')} ways (${runs.map(where).join(', ')}): one list is dealt one way`);
    const seen = new Map(items.map((x) => [x, []]));
    for (const c of runs) {
      const share = pick(items, c.sh);
      if (!share.length) fail(rule, `${where(c)} holds no ${what}: a job that proves nothing`);
      for (const x of share) if (seen.has(x)) seen.get(x).push(where(c));
    }
    for (const [x, at] of seen) {
      if (!at.length) fail(rule, `${what} "${x}" runs in no shard`);
      else if (at.length > 1) fail(rule, `${what} "${x}" runs ${at.length} times (${at.join(', ')})`);
    }
  };
  family('UTC-PLAN-1', 'arms', arms, 'arm');
  family('UTC-PLAN-2', 'proof', proofs.map((p) => p.name), 'proof unit');
  const plans = cmds.filter((c) => c.kind === 'plan');
  if (plans.length !== 1) fail('UTC-PLAN-3', `${SELF} runs ${plans.length} times (${plans.map((c) => c.job).join(', ') || 'nowhere'}), not once`);

  const replayS = REPLAY_S * bytes / CHAIN_BYTES;
  const fullOf = new Map(proofs.map((p) => [p.name, p.full]));
  const rows = [];
  for (const j of jobs) {
    const mine = cmds.filter((c) => c.job === j.name && c.kind !== 'plan');
    if (!mine.length) continue;
    const others = j.steps.filter((s) => !/^Install /.test(s.name || '')).flatMap((s) => s.run)
      .filter((cmd) => !mine.some((c) => c.cmd === cmd));
    if (others.length) fail('UTC-PLAN-4', `${j.name} runs ${others.length} other command(s) beside its shard (${others[0]}): its booking would not be its time. Move them to a job with room`);
    let full = 0;
    for (const c of mine) {
      full += c.kind === 'arms' ? 1 + pick(arms, c.sh).length
        : pick(proofs.map((p) => p.name), c.sh).reduce((n, x) => n + (fullOf.get(x) || 0), 0);
    }
    const booked = (SETUP_S + full * replayS) / 60;
    const share = Number.isFinite(j.timeoutMinutes) ? booked / j.timeoutMinutes : Infinity;
    rows.push({ job: j.name, holds: mine.map((c) => `${c.kind} ${c.sh ? `${c.sh.k}/${c.sh.n}` : 'all'}`).join(' + '), full, booked, timeout: j.timeoutMinutes, share });
    if (!(share <= BUDGET_SHARE)) {
      fail('UTC-PLAN-5', `${j.name} is booked ${booked.toFixed(1)} min (${full} whole replays at ${Math.round(replayS)} s + ${SETUP_S} s) of `
        + `timeout-minutes ${j.timeoutMinutes}, over ${BUDGET_SHARE * 100}%: add a shard (the K/N in ${GUARD}'s ci-step headers, then node tests/ci-shape.mjs --write)`);
    }
  }
  return { problems, rows, replayS };
}

let bad = 0;
const ok = (label, cond) => { console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${label}`); if (!cond) bad++; };

console.log('\nUTC MIDNIGHT REPLAY SHARDS (smoke.yml)\n');
let jobs;
try { jobs = parseWorkflow(readFileSync(WORKFLOW, 'utf8')); } catch (e) { console.error(`  HARNESS: ${e.message}`); process.exit(2); }
const labels = armsOf(0).map(([l]) => l);
if (new Set(labels).size !== labels.length || new Set(PROOF_UNITS.map((p) => p.name)).size !== PROOF_UNITS.length) {
  console.error('  HARNESS: two arms or two proof units share a name, so the plan cannot tell them apart');
  process.exit(2);
}
const bytes = chainBytes();
const real = planOf(jobs, { bytes });
console.log(`  ..    chain ${(bytes / 1e6).toFixed(1)} MB: one whole replay booked ${Math.round(real.replayS)} s, plus ${SETUP_S} s a job\n`);
for (const r of real.rows) {
  console.log(`  ..    ${r.job.padEnd(22)} ${r.holds.padEnd(24)} ${String(r.full).padStart(2)} replays  `
    + `${r.booked.toFixed(1).padStart(5)} of ${r.timeout} min (${Math.round(r.share * 100)}%)`);
}
console.log('');
const byRule = (rule) => real.problems.filter((p) => p.rule === rule);
ok(`every arm runs in exactly one shard (${labels.length} arms)`, !byRule('UTC-PLAN-1').length);
ok(`every proof unit runs in exactly one shard (${PROOF_UNITS.length} units)`, !byRule('UTC-PLAN-2').length);
ok('this check runs once', !byRule('UTC-PLAN-3').length);
ok('every shard\'s job runs that guard alone', !byRule('UTC-PLAN-4').length);
ok(`every shard's job is booked within ${BUDGET_SHARE * 100}% of its timeout`, !byRule('UTC-PLAN-5').length);
for (const p of real.problems) console.error(`        ${p.rule}: ${p.message}`);

/* Planted defects, each red by its own rule (a check that has never been red is not a guard). */
const copy = () => JSON.parse(JSON.stringify(jobs));
const runsOf = (js, kind) => utcCommands(js).filter((c) => c.kind === kind);
const stepOf = (js, cmd) => js.flatMap((j) => j.steps).find((s) => s.run.includes(cmd));
const drop = (js, cmd) => { const s = stepOf(js, cmd); s.run = s.run.filter((x) => x !== cmd); return js; };
const last = (js, kind) => runsOf(js, kind).sort((a, b) => (b.sh ? b.sh.k : 0) - (a.sh ? a.sh.k : 0))[0];
const planted = [
  ['a plain shard dropped (its arms never replay)', 'UTC-PLAN-1', () => { const js = copy(); return planOf(drop(js, last(js, 'arms').cmd), { bytes }); }],
  ['a plain shard registered twice', 'UTC-PLAN-1', () => {
    const js = copy(); const [a, b] = runsOf(js, 'arms'); stepOf(js, b.cmd).run.push(a.cmd); return planOf(js, { bytes });
  }],
  ['one plain shard cut another way', 'UTC-PLAN-1', () => {
    const js = copy(); const c = runsOf(js, 'arms')[0]; const s = stepOf(js, c.cmd);
    s.run = s.run.map((x) => (x === c.cmd ? x.replace(SHARD_FLAG, ` --shard=${c.sh.k}/${c.sh.n + 1}`) : x)); return planOf(js, { bytes });
  }],
  ['an unsharded run beside the shards (every arm twice)', 'UTC-PLAN-1', () => {
    const js = copy(); stepOf(js, runsOf(js, 'arms')[0].cmd).run.push(`node ${GUARD}`); return planOf(js, { bytes });
  }],
  ['a dealing rule that drops the last arm', 'UTC-PLAN-1', () => planOf(copy(), { bytes, pick: (l, sh) => shardOf(l, sh).filter((x) => x !== l[l.length - 1]) })],
  ['a dealing rule that gives the first arm to every shard', 'UTC-PLAN-1', () => planOf(copy(), { bytes, pick: (l, sh) => [...new Set([l[0], ...shardOf(l, sh)])] })],
  ['a proof shard dropped', 'UTC-PLAN-2', () => { const js = copy(); return planOf(drop(js, last(js, 'proof').cmd), { bytes }); }],
  ['this check unregistered', 'UTC-PLAN-3', () => { const js = copy(); return planOf(drop(js, runsOf(js, 'plan')[0].cmd), { bytes }); }],
  ['another guard in a shard\'s job', 'UTC-PLAN-4', () => {
    const js = copy(); stepOf(js, runsOf(js, 'arms')[0].cmd).run.push('node tests/zz-planted.mjs'); return planOf(js, { bytes });
  }],
  ['a shard\'s job given a 10-minute timeout', 'UTC-PLAN-5', () => {
    const js = copy(); js.find((j) => j.name === runsOf(js, 'arms')[0].job).timeoutMinutes = 10; return planOf(js, { bytes });
  }],
  ['the chain grown to three times its bytes', 'UTC-PLAN-5', () => planOf(copy(), { bytes: bytes * 3 })],
];
console.log('');
let missed = 0;
for (const [name, rule, run] of planted) {
  let got;
  try { got = run().problems; } catch (e) { console.error(`  HARNESS: could not plant "${name}": ${e.message}`); process.exit(2); }
  const hit = got.find((p) => p.rule === rule);
  console.log(`  ${hit ? 'caught ' : 'MISSED '} planted: ${name}${hit ? ` (${rule})` : ` (expected ${rule}; got ${got.map((p) => p.rule).join(', ') || 'nothing'})`}`);
  if (!hit) missed++;
}
if (missed) { console.error(`\n${missed} planted defect(s) not caught by their rule\n`); process.exit(2); }
if (bad) { console.error(`\n${bad} red\n`); process.exit(1); }
console.log('\ngreen\n');
