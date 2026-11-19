#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/mutant-times.mjs — A SHARD PLAN BOOKS MEASURED SECONDS, NEVER TYPED ONES.
//
//   node tools/mutant-times.mjs <guard> --run <id> [--run <id> …] [--write] [--replace]
//        each caught mutant's seconds in those GitHub runs' --mutate jobs (gh run view --log, one job at a time)
//   node tools/mutant-times.mjs <guard> --local [--write] [--replace] -- <guard args>
//        runs `node <guard> --mutate <guard args>` here, one process, and times its lines as they print
//   node tools/mutant-times.mjs --selftest
//
// mutant-anchors: none — the selftest plants defects into in-memory parsers, never a file
//
// THE METHOD (tests/alpha-windows.mutant-times.json "measured"; hunt-screen's file the same): a mutant's seconds run
// from the line before its own verdict (the clean control's line, or the last verdict's) to its caught line; under a
// second books 1, since 0 reads as unmeasured. An escaped or HARNESS arm moves the mark but books nothing: it did not
// run the way a caught one does. A mutant measured twice (two runs, two jobs) books the longer, so a plan never
// under-books it. In a gated shard (HR_MUTANT_SCOPE) the clean control line prints at once, so the first mutant also
// carries the browser's launch: a few seconds over, never under.
//
// WHAT IT WRITES (--write): tests/<guard>.mutant-times.json `seconds`, for the guard's MUTANTS today that have no
// seconds on file (--replace: every one measured), and one line in its `added` list naming the source. Without
// --write it only prints. Nothing else in the file moves. The planner (tools/lib/mutant-scope.mjs planShards) books
// an unmeasured mutant at the slowest measured, so a mutant left out is over-booked, never under.
//
// THE INCIDENT (set/v0.2.141, 2026-11-18): 63 alpha-windows mutants added in a day by several lanes had no seconds,
// each was booked at the slowest (286 s), and all 27 shards were booked 23.6-24.1 min against the 22-min budget:
// --shard-plan exit 1. The 47 of them already on release/v0.2.140 had been timed on GitHub by the gated runs that
// proved them; nothing read those times back, and the file had no writer but a hand-run parse of one nightly.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../tests/_is-main.mjs';
import { splitMutants, parseMutants } from './lib/mutant-scope.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANSI = /\u001b\[[0-9;]*m/g;
const STAMP = /(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (.*)$/;
const CAUGHT = /^\s*✓ (.+) — caught \([^)]*\)\s*$/;
/* the lines that move the mark: the clean control's (green, RED, HARNESS or leaned on the plain run) and every verdict */
const MARK = (text) => /^\s*(✓|✗) /.test(text) || /^\s*clean control\b/.test(text);

/** A log's lines as [{ t: ms, text }]: GitHub's (`job\tstep\t<ISO>Z text`, or `<ISO>Z text`); lines with no stamp are skipped. */
export function stamped(raw) {
  const out = [];
  for (const l of String(raw).split(/\r?\n/)) {
    const m = STAMP.exec(l.replace(ANSI, ''));
    if (m) out.push({ t: Date.parse(m[1]), text: m[2] });
  }
  return out;
}

/** name -> seconds for the caught mutants of one job's (or one local run's) lines. `names`: the guard's MUTANTS. */
export function measure(lines, names, plant = {}) {
  const want = new Set(names);
  const got = new Map();
  let mark = null;
  for (const { t, text } of lines) {
    const c = CAUGHT.exec(text);
    if (c && mark !== null && want.has(c[1])) {
      const s = plant.noFloor ? Math.round((t - mark) / 1000) : Math.max(1, Math.round((t - mark) / 1000));
      got.set(c[1], s);
    }
    if (plant.markOnCaughtOnly ? c || /clean control/.test(text) : MARK(text)) mark = t;
  }
  return got;
}

/** Several measurements of the same mutants (jobs, runs) into one: the longer of two. */
export function longest(maps, plant = {}) {
  const out = new Map();
  for (const m of maps) for (const [k, s] of m) if (!out.has(k) || (plant.first ? false : s > out.get(k))) out.set(k, s);
  return out;
}

/** The times file with `measured` booked: only mutants of `names` with no seconds on file (or all, `replace`). */
export function merge(file, measured, names, { replace = false, note = '' } = {}, plant = {}) {
  const seconds = { ...(file.seconds || {}) };
  const added = [];
  for (const n of names) {
    if (!measured.has(n)) continue;
    if (!replace && !plant.overwrite && Number.isFinite(seconds[n]) && seconds[n] > 0) continue;
    seconds[n] = measured.get(n);
    added.push(n);
  }
  const next = { ...file, seconds };
  if (added.length && note) next.added = [...(file.added || []), note];
  return { file: next, added };
}

// ── the sources ─────────────────────────────────────────────────────────────
let ghBin;
function gh() {
  if (ghBin === undefined) {
    ghBin = '';
    for (const bin of ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe']) {
      try { execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 15000, windowsHide: true }); ghBin = bin; break; } catch { /* the next place */ }
    }
  }
  if (!ghBin) throw new Error('gh not found (GitHub CLI): --run reads the runs through it');
  return ghBin;
}

/** The smoke.yml jobs that run `<guard> --mutate`. */
function mutateJobs(guard) {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'smoke.yml'), 'utf8').replace(/\r\n/g, '\n');
  const jobs = yml.slice(yml.indexOf('\njobs:\n'));
  const out = [];
  const re = /^ {2}([A-Za-z0-9_-]+):\s*$/gm;
  const heads = [...jobs.matchAll(re)];
  heads.forEach((h, i) => {
    const body = jobs.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : undefined);
    if (body.includes('node ' + guard + ' --mutate')) out.push(h[1]);
  });
  return out;
}

function fromRuns(guard, runs, names) {
  const want = new Set(mutateJobs(guard));
  const maps = [];
  for (const run of runs) {
    const list = execFileSync(gh(), ['api', `repos/{owner}/{repo}/actions/runs/${run}/jobs?per_page=100`, '--paginate', '--jq', '.jobs[] | "\\(.id)\\t\\(.name)\\t\\(.conclusion)"'],
      { encoding: 'utf8', maxBuffer: 16 << 20, windowsHide: true }).trim().split('\n').map((l) => l.split('\t'));
    const jobs = list.filter(([, name]) => want.has(name));
    let n = 0;
    for (const [id, name, conclusion] of jobs) {
      let raw = '';
      try { raw = execFileSync(gh(), ['run', 'view', String(run), '--job', id, '--log'], { encoding: 'utf8', maxBuffer: 128 << 20, windowsHide: true }); }
      catch (e) { console.log(`  run ${run} ${name} (${conclusion}): no log (${String(e.message).split('\n')[0]})`); continue; }
      const m = measure(stamped(raw), names);
      n += m.size;
      maps.push(m);
    }
    console.log(`  run ${run}: ${jobs.length} --mutate job(s) of ${guard}, ${n} caught mutant(s) timed`);
  }
  return longest(maps);
}

function fromLocal(guard, args, names) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [guard, '--mutate', ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
    const lines = [];
    createInterface({ input: child.stdout }).on('line', (text) => { lines.push({ t: Date.now(), text }); console.log(text); });
    child.on('close', (code) => { console.log(`  local: node ${guard} --mutate ${args.join(' ')} exited ${code}`); done(measure(lines, names)); });
  });
}

// ── --selftest ──────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-11-18T18:16:55Z');
const at = (s, text, job = 'in-page-10') => `${job}\tAlpha windows\t${new Date(T0 + s * 1000).toISOString().replace('Z', '0000Z')} ${text}`;
const LOG = [
  at(0, '  shard 1/27: 18 mutant(s), ~21 min booked'),
  at(3.4, '    A — touched'),
  at(3.4, '  clean control: the plain run in this workflow run is this shard\'s control (the nightly runs one per shard)'),
  at(98.8, '  ✓ A — caught (AW-1)'),
  at(99.1, '  ✓ B — caught (AW-2)'),
  at(139.1, '  ✗ C — NOT caught'),
  at(151.7, '\u001b[32m  ✓ D — caught (AW-4)\u001b[0m'),
  at(156.7, '  ✓ X — caught (Z-1)'),
  'a line with no stamp',
  at(170, '  ✗ E — HARNESS, not a catch: HARNESS the run threw: x'),
  at(200, '  ✓ F — caught (AW-6)'),
].join('\n');
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
const WANT = { A: 95, B: 1, D: 13, F: 30 };

function cases(impl) {
  const fails = [];
  const m = impl.measure(stamped(LOG), NAMES);
  for (const [k, s] of Object.entries(WANT)) if (m.get(k) !== s) fails.push(`${k} booked ${m.get(k)}, want ${s}`);
  for (const k of ['C', 'E', 'X']) if (m.has(k)) fails.push(`${k} is booked (${m.get(k)}): an escape, a HARNESS arm and a name off the list book nothing`);
  /* a second job's lines start with no mark: its first verdict before any clean control books nothing */
  const cold = impl.measure(stamped(at(5, '  ✓ A — caught (AW-1)', 'in-page-11')), NAMES);
  if (cold.size) fails.push('a verdict with no clean control before it was booked');
  const two = impl.longest([new Map([['A', 95], ['B', 4]]), new Map([['A', 120], ['B', 2]])]);
  if (two.get('A') !== 120 || two.get('B') !== 4) fails.push(`two measurements book ${JSON.stringify([...two])}, want the longer of each`);
  const file = { measured: 'm', seconds: { A: 50, Z: 7 } };
  const r = impl.merge(file, new Map([['A', 95], ['B', 1], ['Q', 9]]), ['A', 'B'], { note: 'n' });
  if (r.file.seconds.A !== 50 || r.file.seconds.B !== 1 || 'Q' in r.file.seconds || r.file.seconds.Z !== 7 || r.added.join() !== 'B' || r.file.added.join() !== 'n')
    fails.push(`merge booked ${JSON.stringify(r)}: only the unmeasured mutant of the list is added, the rest stands`);
  const rr = impl.merge(file, new Map([['A', 95]]), ['A'], { replace: true, note: 'n' });
  if (rr.file.seconds.A !== 95) fails.push('--replace did not re-book a measured mutant');
  return fails;
}

function selftest() {
  const real = { measure, longest, merge };
  const fails = cases(real);
  for (const f of fails) console.log('  ✗ ' + f);
  const planted = [
    ['an escape does not move the mark (D books its 53 s with C\'s)', { ...real, measure: (l, n) => measure(l, n, { markOnCaughtOnly: true }) }],
    ['a sub-second mutant books 0 (read as unmeasured)', { ...real, measure: (l, n) => measure(l, n, { noFloor: true }) }],
    ['the first measurement of two wins', { ...real, longest: (ms) => longest(ms, { first: true }) }],
    ['a measured mutant is overwritten without --replace', { ...real, merge: (f, m, n, o) => merge(f, m, n, o, { overwrite: true }) }],
  ];
  let missed = 0;
  for (const [label, impl] of planted) {
    const bit = cases(impl).length > 0;
    if (!bit) missed++;
    console.log(`  ${bit ? 'caught' : 'MISSED'}  planted: ${label}`);
  }
  const bad = fails.length + missed;
  console.log(bad ? `mutant-times --selftest: ${fails.length} case(s) wrong, ${missed} planted defect(s) missed`
    : `mutant-times --selftest: the method holds (verdict to verdict, under a second books 1, an escape books nothing, the longer of two, only the unmeasured added); ${planted.length}/${planted.length} planted defects caught`);
  return bad ? 1 : 0;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const dash = argv.indexOf('--');
  const own = dash < 0 ? argv : argv.slice(0, dash);
  const guard = own.find((a) => /^tests\/[\w.-]+\.mjs$/.test(a.replace(/\\/g, '/')))?.replace(/\\/g, '/');
  const runs = own.flatMap((a, i) => (a === '--run' && own[i + 1] ? [own[i + 1]] : []));
  const local = own.includes('--local');
  if (!guard || (!runs.length && !local) || (runs.length && local)) {
    console.log('usage: node tools/mutant-times.mjs tests/<guard>.mjs (--run <id> [--run <id> …] | --local -- <guard args>) [--write] [--replace]');
    return 2;
  }
  const split = splitMutants(readFileSync(join(ROOT, guard), 'utf8'));
  if (!split) { console.log(`  ✗ ${guard} has no MUTANTS list`); return 2; }
  const names = parseMutants(split.block).map((m) => m[0]);
  const path = join(ROOT, guard.replace(/\.mjs$/, '.mutant-times.json'));
  const file = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { measured: 'tools/mutant-times.mjs', seconds: {} };
  const measured = local ? await fromLocal(guard, dash < 0 ? [] : argv.slice(dash + 1), names) : fromRuns(guard, runs, names);
  if (!measured.size) { console.log('  ✗ nothing timed: no caught mutant of ' + guard + ' in that source'); return 1; }
  const source = local ? `measured here (${process.platform}), node ${guard} --mutate ${argv.slice(dash + 1).join(' ')}` : `GitHub run(s) ${runs.join(', ')}`;
  const note = `${new Date().toISOString().slice(0, 10)}, tools/mutant-times.mjs: ${source}`;
  const replace = own.includes('--replace');
  /* how the source compares with the file on the mutants both hold (a slower or faster machine shows here) */
  const both = names.filter((n) => measured.has(n) && file.seconds && file.seconds[n] > 0);
  if (both.length) {
    const a = both.reduce((s, n) => s + measured.get(n), 0), b = both.reduce((s, n) => s + file.seconds[n], 0);
    console.log(`  ${both.length} mutant(s) already on file, timed again here: ${a} s against ${b} s on file (x${(a / b).toFixed(2)})`);
  }
  const r = merge(file, measured, names, { replace, note });
  for (const n of r.added) console.log(`  + ${String(r.file.seconds[n]).padStart(4)} s  ${n}`);
  const left = names.filter((n) => !(Number.isFinite(r.file.seconds[n]) && r.file.seconds[n] > 0));
  console.log(`  ${r.added.length} mutant(s) ${argv.includes('--write') ? 'booked' : 'would be booked'}; ${left.length} of ${names.length} still unmeasured${left.length ? ': ' + left.join(' | ') : ''}`);
  if (argv.includes('--write') && r.added.length) writeFileSync(path, JSON.stringify(r.file, null, 1) + '\n');
  return 0;
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.log('  ✗ ' + String(e && e.message).split('\n')[0]); process.exit(2); });
