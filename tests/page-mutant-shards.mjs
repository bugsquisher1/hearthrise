#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/page-mutant-shards.mjs — A SHARDED PAGE SUITE'S SHARDS HOLD EVERY MUTANT ONCE, EACH JOB IN BUDGET
//
// tests/character-window.mjs --mutate (47 mutants, ~52 s a page boot each, 40.5 min in one command) set in-page-25 at
// 50.8 of its 55 min on run 46138211972, and tests/phone-touch.mjs --mutate (156 mutants behind a 5.8 min clean control)
// set in-page-40 at 34.7 of 45 on 46132371081. Each now deals its MUTANTS literal round-robin over `--shard=K/N` jobs
// (tests/_mutant-shard.mjs). A split is the easiest way to lose a mutant (one no shard deals is a defect nobody plants,
// and every job stays green), and a list that keeps growing is the way the next job runs into its timeout. So, read
// from smoke.yml and each suite's own MUTANTS literal:
//
//   PMS-1  every mutant of a sharded suite runs in exactly one --mutate shard, all cut one way, no shard empty
//   PMS-2  every suite that deals with tests/_mutant-shard.mjs has a measured row below (so PMS-1 and PMS-5 read it), and
//          each row's suite deals its own MUTANTS literal with mutantShard (the list and the rule this check counts)
//   PMS-3  this check itself runs exactly once
//   PMS-4  a job that holds a shard runs only that suite (its plain run and its shards), so its booking is its whole time
//   PMS-5  a job that holds a shard is booked at most 75% of its timeout-minutes
//
// THE BOOKING. SETUP_S (checkout, node, Chromium from the cache: 39-42 s; the gate's plan at the job's first gated
// command: 81-95 s on a 2,331-2,484-file diff from main) plus, per command, the suite's measured row: a plain run is
// PLAIN_S, a --mutate shard is START_S (the scope read) + CONTROL_S (its own clean control) + MUTANT_S for each mutant it
// deals. The rows are the slower of the measured runs (log timestamps, lane/ci-inpage-shard 2026-11-28); a round-robin
// cut was within 5% of the mean (phone-touch 9.7 / 10.6 min, character-window 20.5 / 20.0). Re-measure a row from a slow
// run's log when its suite's per-mutant time moves by a fifth.
//
// Every run also plants defects in memory, each of which must be red by its own rule. No browser, no network, milliseconds.
//
// Exit: 0 green · 1 the shards are wrong or over budget · 2 harness (unparseable, or a planted defect went uncaught).
//
// ci-step: client-guards | Page mutant shards - every mutant of a sharded page suite in exactly one shard, each job within budget
// ci-run: node tests/page-mutant-shards.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkflow, WORKFLOW } from './run-ci-local.mjs';
import { splitMutants, parseMutants } from '../tools/lib/mutant-scope.mjs';
import { SHARD_FLAG, shardOf } from './_mutant-shard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'tests/page-mutant-shards.mjs';
const HELPER = '_mutant-shard.mjs';
const GATE = 'node tools/mutant-gate.mjs ';
const SETUP_S = 150;
const BUDGET_SHARE = 0.75;
/* The measured rows. character-window: in-page-25 on 46138211972 (plain 11:12:51-11:13:52, the scope read 51 s, control 54 s,
   47 mutants in 40.5 min). phone-touch: in-page-40 on 46132371081 (plain 09:51:33-09:57:23, scope 45 s, control 350 s, 156
   mutants in 20.2 min). */
const SUITES = [
  { guard: 'tests/character-window.mjs', PLAIN_S: 61, START_S: 51, CONTROL_S: 54, MUTANT_S: 52 },
  { guard: 'tests/phone-touch.mjs', PLAIN_S: 350, START_S: 45, CONTROL_S: 350, MUTANT_S: 7.8 },
];

/** The suite's mutant names, in its MUTANTS literal's order (the order a shard deals them). Throws when unreadable. */
function mutantNames(guard, text = readFileSync(join(ROOT, guard), 'utf8')) {
  const s = splitMutants(text);
  if (!s) throw new Error(`${guard} has no \`const MUTANTS = [\` literal`);
  const names = parseMutants(s.block).map((m) => m[0]);
  if (new Set(names).size !== names.length) throw new Error(`two of ${guard}'s mutants share a name, so a shard plan cannot tell them apart`);
  return names;
}

/** Every tests/*.mjs that imports the dealing helper (a suite that deals its mutants with it). */
function dealers() {
  const out = [];
  for (const f of readdirSync(join(ROOT, 'tests'))) {
    if (!f.endsWith('.mjs') || f === HELPER || f === 'page-mutant-shards.mjs') continue;
    const t = readFileSync(join(ROOT, 'tests', f), 'utf8');
    if (new RegExp(`from\\s+'\\./${HELPER.replace('.', '\\.')}'`).test(t)) out.push(`tests/${f}`);
  }
  return out.sort();
}

const innerOf = (cmd) => (cmd.startsWith(GATE) ? cmd.slice(GATE.length).trimStart() : cmd);
const runsGuard = (inner, guard) => inner === `node ${guard}` || inner.startsWith(`node ${guard} `);

/** Every command in the matrix that runs a listed suite or this check: { job, cmd, guard, kind: 'plain' | 'mutate' | 'plan', sh }. */
function commandsOf(jobs, suites) {
  const out = [];
  for (const j of jobs) {
    for (const s of j.steps) {
      if (/^Install /.test(s.name || '')) continue;   // environment steps, as tests/ci-shape.mjs isInfraStep reads them
      for (const cmd of s.run) {
        const inner = innerOf(cmd);
        if (runsGuard(inner, SELF)) { out.push({ job: j.name, cmd, guard: SELF, kind: 'plan', sh: null }); continue; }
        const su = suites.find((x) => runsGuard(inner, x.guard));
        if (!su) continue;
        const m = SHARD_FLAG.exec(inner);
        out.push({ job: j.name, cmd, guard: su.guard, kind: /\s--mutate(?=\s|$)/.test(inner) ? 'mutate' : 'plain', sh: m ? { k: +m[1], n: +m[2] } : null });
      }
    }
  }
  return out;
}

/**
 * The verdict on parsed jobs: { problems: [{ rule, message }], rows }. Pure. `names` maps a guard to its mutant names,
 * `pick` is the dealing rule and `dealt` the suites that deal with the helper (each planted wrong below).
 */
function planOf(jobs, { suites = SUITES, names, pick = shardOf, dealt, sources }) {
  const problems = [];
  const fail = (rule, message) => problems.push({ rule, message });
  const cmds = commandsOf(jobs, suites);
  const where = (c) => `${c.sh ? `${c.sh.k}/${c.sh.n}` : 'unsharded'} in ${c.job}`;

  for (const g of dealt) if (!suites.some((x) => x.guard === g)) fail('PMS-2', `${g} deals its mutants with tests/${HELPER} but has no measured row in ${SELF} SUITES: add one from a full run's log`);
  /* The suite deals the very literal this check reads, with the very rule: `mutantShard('<guard>', MUTANTS)`. */
  for (const su of suites) {
    const at = new RegExp(`\\bmutantShard\\(\\s*'${su.guard.replace(/[.]/g, '\\.')}'\\s*,\\s*MUTANTS\\s*[,)]`);
    if (!at.test(sources.get(su.guard) || '')) fail('PMS-2', `${su.guard} does not deal its MUTANTS with mutantShard('${su.guard}', MUTANTS) (tests/${HELPER}): its shards may not be the ones this check counts`);
  }

  for (const su of suites) {
    const all = names.get(su.guard);
    const runs = cmds.filter((c) => c.guard === su.guard && c.kind === 'mutate');
    if (!runs.length) { fail('PMS-1', `${su.guard} --mutate runs in no job: none of its ${all.length} mutants is planted`); continue; }
    const ns = [...new Set(runs.map((c) => (c.sh ? c.sh.n : 1)))];
    if (ns.length > 1) fail('PMS-1', `${su.guard} --mutate is cut ${ns.join(' and ')} ways (${runs.map(where).join(', ')}): one list is dealt one way`);
    const seen = new Map(all.map((x) => [x, []]));
    for (const c of runs) {
      const share = pick(all, c.sh);
      if (!share.length) fail('PMS-1', `${su.guard} ${where(c)} holds no mutant: a job that proves nothing`);
      for (const x of share) if (seen.has(x)) seen.get(x).push(where(c));
    }
    for (const [x, at] of seen) {
      if (!at.length) fail('PMS-1', `${su.guard} mutant "${x}" runs in no shard`);
      else if (at.length > 1) fail('PMS-1', `${su.guard} mutant "${x}" runs ${at.length} times (${at.join(', ')})`);
    }
  }
  const plans = cmds.filter((c) => c.kind === 'plan');
  if (plans.length !== 1) fail('PMS-3', `${SELF} runs ${plans.length} times (${plans.map((c) => c.job).join(', ') || 'nowhere'}), not once`);

  const rows = [];
  for (const j of jobs) {
    const mine = cmds.filter((c) => c.job === j.name && c.kind === 'mutate' && c.sh);
    if (!mine.length) continue;
    const owners = new Set(mine.map((c) => c.guard));
    const ours = cmds.filter((c) => c.job === j.name && owners.has(c.guard));
    const others = j.steps.filter((s) => !/^Install /.test(s.name || '')).flatMap((s) => s.run).filter((cmd) => !ours.some((c) => c.cmd === cmd));
    if (owners.size > 1 || others.length) {
      fail('PMS-4', `${j.name} runs ${others.length ? `${others.length} other command(s) beside its shard (${others[0]})` : `the shards of ${[...owners].join(' and ')}`}: `
        + 'its booking would not be its time. Give the shard a job of its own (a new in-page job, then node tests/ci-shape.mjs --write)');
    }
    let s = SETUP_S;
    for (const c of ours) {
      const su = suites.find((x) => x.guard === c.guard);
      s += c.kind === 'plain' ? su.PLAIN_S : su.START_S + su.CONTROL_S + pick(names.get(c.guard), c.sh).length * su.MUTANT_S;
    }
    const booked = s / 60;
    const share = Number.isFinite(j.timeoutMinutes) ? booked / j.timeoutMinutes : Infinity;
    rows.push({ job: j.name, holds: ours.map((c) => `${c.guard.replace(/^tests\/|\.mjs$/g, '')} ${c.kind === 'plain' ? 'plain' : c.sh ? `${c.sh.k}/${c.sh.n}` : 'all'}`).join(' + '), booked, timeout: j.timeoutMinutes, share });
    if (!(share <= BUDGET_SHARE)) {
      fail('PMS-5', `${j.name} is booked ${booked.toFixed(1)} min of timeout-minutes ${j.timeoutMinutes}, over ${BUDGET_SHARE * 100}%: add a shard `
        + '(the K/N in the suite\'s ci-step headers, a job for the new one, then node tests/ci-shape.mjs --write)');
    }
  }
  return { problems, rows };
}

let bad = 0;
const ok = (label, cond) => { console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${label}`); if (!cond) bad++; };

console.log('\nPAGE MUTANT SHARDS (smoke.yml)\n');
let jobs; const names = new Map(); const sources = new Map(); let dealt;
try {
  jobs = parseWorkflow(readFileSync(WORKFLOW, 'utf8'));
  for (const su of SUITES) {
    sources.set(su.guard, readFileSync(join(ROOT, su.guard), 'utf8'));
    names.set(su.guard, mutantNames(su.guard, sources.get(su.guard)));
  }
  dealt = dealers();
} catch (e) { console.error(`  HARNESS: ${e.message}`); process.exit(2); }
const real = planOf(jobs, { names, dealt, sources });
for (const r of real.rows) {
  console.log(`  ..    ${r.job.padEnd(12)} ${r.holds.padEnd(44)} ${r.booked.toFixed(1).padStart(5)} of ${r.timeout} min (${Math.round(r.share * 100)}%)`);
}
console.log('');
const byRule = (rule) => real.problems.filter((p) => p.rule === rule);
ok(`every mutant runs in exactly one shard (${SUITES.map((s) => `${s.guard.replace(/^tests\//, '')} ${names.get(s.guard).length}`).join(', ')})`, !byRule('PMS-1').length);
ok(`every suite that deals with tests/${HELPER} has a measured row (${dealt.length})`, !byRule('PMS-2').length);
ok('this check runs once', !byRule('PMS-3').length);
ok('every shard\'s job runs that suite alone', !byRule('PMS-4').length);
ok(`every shard's job is booked within ${BUDGET_SHARE * 100}% of its timeout`, !byRule('PMS-5').length);
for (const p of real.problems) console.error(`        ${p.rule}: ${p.message}`);

/* Planted defects, each red by its own rule (a check that has never been red is not a guard). */
const copy = () => JSON.parse(JSON.stringify(jobs));
const runsOf = (js, guard, kind) => commandsOf(js, SUITES).filter((c) => c.guard === guard && c.kind === kind);
const stepOf = (js, cmd) => js.flatMap((j) => j.steps).find((s) => s.run.includes(cmd));
const drop = (js, cmd) => { const s = stepOf(js, cmd); s.run = s.run.filter((x) => x !== cmd); return js; };
const judge = (js, o = {}) => planOf(js, { names, dealt, sources, ...o });
const planted = [];
for (const { guard } of SUITES) {
  const g = guard.replace(/^tests\//, '');
  planted.push(
    [`${g}: a shard dropped (its mutants never planted)`, 'PMS-1', () => { const js = copy(); const r = runsOf(js, guard, 'mutate'); return judge(drop(js, r[r.length - 1].cmd)); }],
    [`${g}: a shard registered twice`, 'PMS-1', () => { const js = copy(); const [a] = runsOf(js, guard, 'mutate'); stepOf(js, a.cmd).run.push(a.cmd); return judge(js); }],
    [`${g}: one shard cut another way`, 'PMS-1', () => {
      const js = copy(); const c = runsOf(js, guard, 'mutate')[0]; const s = stepOf(js, c.cmd);
      s.run = s.run.map((x) => (x === c.cmd ? x.replace(SHARD_FLAG, ` --shard=${c.sh.k}/${c.sh.n + 1}`) : x)); return judge(js);
    }],
    [`${g}: an unsharded --mutate beside the shards (every mutant twice)`, 'PMS-1', () => {
      const js = copy(); stepOf(js, runsOf(js, guard, 'mutate')[0].cmd).run.push(`${GATE}node ${guard} --mutate`); return judge(js);
    }],
    [`${g}: another guard in a shard's job`, 'PMS-4', () => {
      const js = copy(); stepOf(js, runsOf(js, guard, 'mutate')[0].cmd).run.push('node tests/zz-planted.mjs'); return judge(js);
    }],
    [`${g}: the suite deals its shards some other way`, 'PMS-2', () => {
      const s = new Map(sources); s.set(guard, sources.get(guard).replace(/\bmutantShard\(/g, 'ownShard(')); return judge(copy(), { sources: s });
    }],
    [`${g}: a shard's job given a 10-minute timeout`, 'PMS-5', () => {
      const js = copy(); js.find((j) => j.name === runsOf(js, guard, 'mutate')[0].job).timeoutMinutes = 10; return judge(js);
    }],
    [`${g}: the mutant list grown to three times its length`, 'PMS-5', () => {
      const n = new Map(names); n.set(guard, [0, 1, 2].flatMap((i) => names.get(guard).map((x) => `${x} #${i}`))); return judge(copy(), { names: n });
    }],
  );
}
const [first] = SUITES;
planted.push(
  ['the shards of two suites in one job', 'PMS-4', () => {
    const js = copy(); const a = runsOf(js, first.guard, 'mutate')[0]; const b = runsOf(js, SUITES[1].guard, 'mutate')[0];
    drop(js, b.cmd); stepOf(js, a.cmd).run.push(b.cmd); return judge(js);
  }],
  ['a dealing rule that drops the last mutant', 'PMS-1', () => judge(copy(), { pick: (l, sh) => shardOf(l, sh).filter((x) => x !== l[l.length - 1]) })],
  ['a dealing rule that gives the first mutant to every shard', 'PMS-1', () => judge(copy(), { pick: (l, sh) => [...new Set([l[0], ...shardOf(l, sh)])] })],
  ['a suite that deals with the helper but has no measured row', 'PMS-2', () => judge(copy(), { dealt: [...dealt, 'tests/zz-planted.mjs'] })],
  ['this check unregistered', 'PMS-3', () => { const js = copy(); return judge(drop(js, commandsOf(js, SUITES).find((c) => c.kind === 'plan').cmd)); }],
);
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
