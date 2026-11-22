#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/balance-matrix.mjs — THE BALANCE MATRIX: every balance change measured across the whole game on the REAL engine,
// before and after (Tyler 2026-11-21, docs/design/balance-program/40-formula-brief.md sections 5 to 7; lane/c-balance-matrix).
//
//   node tools/balance-program/balance-matrix.mjs --subset            the representative subset (matrix-plan.mjs RUNS.subset: every way, every
//                                                                      gear state, lone and four, Normal and the hardest tier, each slot class's
//                                                                      step, Level 10 to 5,000), cached in balance-matrix-subset.json
//   node tools/balance-program/balance-matrix.mjs                     the FULL matrix (RUNS.full: the grid's checkpoints and 1,000 / 2,000 /
//                                                                      5,000, every way, every party, every tier, every step, every ground at
//                                                                      both band ends): the nightly's, cached in balance-matrix.json
//   node tools/balance-program/balance-matrix.mjs --diff <patch.json> [--subset]   the patch (matrix-scratch.mjs) on a SCRATCH COPY, the same
//                                                                      cells and the same dice before and after: each cell's section 6 metrics
//                                                                      and every band of standards.mjs, flagged INTO / OUT / UNTARGETED
//   node tools/balance-program/balance-matrix.mjs --sweep [--knobs a,b] [--subset]  each knob (formulas/knobs.json) at each of its steps: the
//                                                                      precomputed table Balance Lab v3 reads (balance-sweeps.json)
//   node tools/balance-program/balance-matrix.mjs --rates [--quick]   the ground axis alone, written as tools/balance-program/ground-rates.json
//                                                                      (the solver's table: the SAME cells the matrix plays, one source)
//   node tools/balance-program/balance-matrix.mjs --report [--subset] NO PLAY: the cached run, printed
//   node tools/balance-program/balance-matrix.mjs --knobs             NO PLAY: every knob, the file:line it moves and today's numbers
//   node tools/balance-program/balance-matrix.mjs --selftest          the proofs (below)
//   --workers N (4 at most by default: other lanes share the PC)  --seeds N  --hours H  --only 30,60  --blocks ways,four  --json <file>
//   --run deaths                                                      the DEATH SAMPLE (matrix-plan.mjs RUNS.deaths: the four and the lineups on the
//                                                                      harder tiers, 4 seeds x 8 h, the 14 grounds at both band ends); --subset is --run subset
//
// A TOOL RED (audit A-0): a cell whose hunt ended `no_fight` (matrix-metrics.mjs TOOL_RED_ENDS) measured an engine stall, not the balance:
// every run, shard, join and diff prints it and exits 1. FB-1's two stalls (02364f03a) were read as safe, slow cells for a whole pass.
//
// ONE SOURCE OF RATES (the Coordinator 2026-11-21). Every cell is the grid's own buildCell (progression-grid.mjs), every judge the grid's own
// judgeGrid (grid-derive.mjs), and the ground rates the solver reads (sources.mjs, paths.mjs) are the matrix's `grounds` block written in
// their table's shape (atlas/measure.mjs plays them through here). The dashboard reads this file's caches.
//
// EVERY DIFF PRINTS THE CALIBRATION (matrix-calibration.mjs): the harness's four, the harness's heroes in the real four's ways, and the
// recorded heroes, beside the heavy four's real Krell hunt of 2026-11-20, so a reader sees how far the harness is from real play.
//
// SELFTEST: every knob finds its numbers; a patch outside the planted trees is refused and the real tree is never written; an empty patch on
// the scratch copy plays every cell exactly as the real tree does (identical metrics, no band moved); playerAttack x1.5 raises DPS and kills
// in every cell and monsterDamage x1.6 raises damage taken, and the diff sees both; the flag rules (a targeted band moved -> INTO or
// OUT, an untargeted one -> UNTARGETED, an unmoved one -> nothing) bite on planted rows; a seat whose fights dip under 30% spent time there.
//
// Exit: 0 ran · 1 a selftest proof failed · 2 harness.
// mutant-anchors: none — the selftest plants on scratch copies and in-memory rows; no tracked file is patched
// ci-step: economy-selftests | The balance matrix's diff sees a planted attack and monster patch, an empty patch plays as the tree, and its flags bite
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/balance-matrix.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { fork, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isMain } from '../../tests/_is-main.mjs';
import * as STD from './standards.mjs';
import { loadGridData, inputHash, compsOf, cellKey, buildCell } from './progression-grid.mjs';
import { loadKits } from './grid-kit.mjs';
import { RUNS, planMatrix, archetypeTable, WAYS, HIGH_LEVELS, ch14Slots as MP_ch14Slots } from './matrix-plan.mjs';
import { METRICS, cellMetrics, slimSeed, deriveMatrix, judgeMatrix, diffMatrices, axisSummary, levelBand, wayOf, styleGroupOf, FLAG_WORDS, checkGRows, toolReds, TOOL_RED_ENDS } from './matrix-metrics.mjs';
import { plantScratch, knobTable, checkPatch, patchEdits, scaled, readKnobs, locateKnob, knobReach, PATCH_SCHEMA, KnobGone } from './matrix-scratch.mjs';
import { calibrationJobs, calibrationTable, printCalibration } from './matrix-calibration.mjs';
import { STYLE_GROUPS, KNOB_FILE } from './knob-rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const MATRIX_FILE = join(HERE, 'balance-matrix.json');
export const SUBSET_FILE = join(HERE, 'balance-matrix-subset.json');
export const SWEEP_FILE = join(HERE, 'balance-sweeps.json');
export const RATES_FILE = join(HERE, 'ground-rates.json');
const WORKER = join(ROOT, 'tools', 'balance-sim', 'worker.mjs');
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
export const MAX_WORKERS = 4;
const workersOf = () => Math.max(1, Number(arg('workers', Math.min(MAX_WORKERS, Math.max(1, availableParallelism() - 2)))));

/* ── THE DATA A TREE PLAYS WITH: the grid's data, with the modules a patch can move read from that tree ─────────────────────────── */
export async function dataView(D, root) {
  if (resolve(root) === ROOT) return D;
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const [XP, BS, MON, SB, TI, BL, LB, AR] = await Promise.all(['src/core/xp.js', 'src/data/balance-sheet.js', 'src/data/monsters.js', 'src/data/supply-basics.js', 'src/data/hunt-tiers.js', 'src/data/blessings.js', 'src/data/loot-bands.js', 'src/core/action-rules.js'].map(imp));
  /* AR: the tree's own death price (progression-grid.mjs deathXpAt), so a patch that moves it moves every reader */
  return { ...D, XP, BS, MONSTERS: MON.MONSTERS, SB, TI, BL, AR, REVEAL_BANDS: LB.REVEAL_BANDS,
    projectD: { ...D.projectD, MONSTERS: MON.MONSTERS, GROUND_ROSTER: BS.GROUND_ROSTER, formulaStats: BS.formulaStats, tierRowFor: BS.tierRowFor, tiersOf: TI.tiersOf } };
}

/* ── THE POOL: tools/balance-sim/worker.mjs processes on `root`, at most MAX_WORKERS unless asked ──────────────────────────────── */
export function playJobs(jobs, root, workers, log = () => {}) {
  const results = {}, errors = [];
  const queue = [...jobs].sort((a, b) => b.cell.hours * (b.cell.party || b.cell.seats || [1]).length - a.cell.hours * (a.cell.party || a.cell.seats || [1]).length);
  if (!queue.length) return Promise.resolve({ results, errors, workerMs: 0, wallMs: 0 });
  const n = Math.max(1, Math.min(workers, queue.length)), total = queue.length, t0 = Date.now();
  let workerMs = 0, k = 0, alive = n;
  return new Promise((finish) => {
    const feed = (w) => { const j = queue.shift(); if (!j) { w.kill(); return; } w.job = j; w.send({ type: 'job', job: { ...j.cell, id: j.id, ...(j.whatIf ? { whatIf: j.whatIf } : {}) } }); };
    for (let i = 0; i < n; i++) {
      const w = fork(WORKER, [root], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(w); return; }
        k++;
        if (m.type === 'done') { results[m.id] = m.result; workerMs += m.ms; } else errors.push({ id: m.id, error: String(m.error).split('\n').slice(0, 3).join(' ') });
        log(k, total, m.id, Date.now() - t0);
        w.job = null;
        feed(w);
      });
      w.on('exit', () => {
        if (w.job) { errors.push({ id: w.job.id, error: 'the worker exited mid-cell' }); w.job = null; }
        if (--alive === 0) { for (const j of queue.splice(0)) errors.push({ id: j.id, error: 'never ran: every worker exited' }); finish({ results, errors, workerMs, wallMs: Date.now() - t0 }); }
      });
    }
  });
}
const progress = (label) => (process.stderr.isTTY ? (k, total, id, ms) => process.stderr.write('\r  ' + (label + ' [' + k + '/' + total + '] ' + id + ', ' + Math.round(ms / 1000) + ' s').slice(0, 118).padEnd(118)) : () => {});

/* ── ONE RUN ON ONE TREE ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Plan `run` on `root` (its formula's projected rows and tier pulls), play it with the calibration, measure every cell. */
export async function playRun(D, K, run, root, o = {}) {
  const t0 = Date.now();
  const V = await dataView(D, root);
  const planned = planMatrix(V, K, run, { only: o.only, blocks: o.blocks, seeds: o.seeds, hours: o.hours, quick: o.quick, plan: o.plan });
  /* o.planHook (V, K, plan) -> plan: a caller's own cells beside the run's and each job's hours (tools/balance-program/baseline/scenarios.mjs) */
  const plan0 = o.planHook ? o.planHook(V, K, planned) : planned;
  /* o.shard [i, n]: every n-th cell from the i-th (a GitHub job's share of the full run; the simulator check plays in shard 0 only) */
  const plan = o.shard ? shardOf(plan0, o.shard) : plan0;
  const cal = o.calibrate === false || (o.shard && o.shard[0] !== 0) ? { jobs: [], cols: [], samples: [] } : await calibrationJobs(V, K, ROOT, { seeds: o.seeds || run.seeds, hours: o.hours || run.hours });
  /* o.jobHook (a what-if a caller lays on every cell job: arrival-kit.mjs scales the jewelry rows) */
  const jobs = [...(o.jobHook ? plan.jobs.map(o.jobHook) : plan.jobs), ...cal.jobs];
  if (o.say) o.say((o.label || run.id) + ': ' + plan.cells.length + ' cells' + (cal.jobs.length ? ' + calibration' : '') + ', ' + jobs.length + ' seed jobs, ' + (o.workers || workersOf()) + ' workers, on ' + (resolve(root) === ROOT ? 'the tree' : 'a scratch copy'));
  const { results, errors, workerMs, wallMs } = await playJobs(jobs, root, o.workers || workersOf(), o.quiet ? () => {} : progress(o.label || run.id));
  if (process.stderr.isTTY && !o.quiet) process.stderr.write('\n');
  const arch = archetypeTable(V.BS, V.MONSTERS);
  const byKey = {};
  for (const j of jobs) if (results[j.id]) (byKey[j.key] || (byKey[j.key] = [])).push(results[j.id]);
  const cells = plan.cells.map((c) => {
    const seeds = (byKey[c.key] || []).map(slimSeed);
    const want = c.seeds || o.seeds || run.seeds;
    if (seeds.length < want) return { ...c, error: (errors.find((e) => e.id.startsWith(c.key + '#')) || {}).error || 'a seed is missing' };
    /* o.perSeed (V, cell, answers) -> any: a caller's read of each seed's FULL answer, in seed order (the baseline keeps one outcome row a seed) */
    return { ...c, m: cellMetrics(V, c, seeds, arch), ...(o.perSeed ? { perSeed: o.perSeed(V, c, byKey[c.key]) } : {}) };
  });
  const calibration = cal.cols.length ? calibrationTable(byKey, cal.cols, cal.samples) : null;
  return { run: run.id, seeds: o.seeds || run.seeds, hours: o.hours || run.hours, cells, calibration, V,
    runtime: { cells: plan.cells.length, jobs: jobs.length, workers: o.workers || workersOf(), wallS: Math.round((Date.now() - t0) / 1000), playS: Math.round(wallMs / 1000), workerS: Math.round(workerMs / 1000), errors: errors.length },
    errors: errors.slice(0, 20) };
}

export const SHARD_SCHEMA = 'hearthrise.balance-matrix-shard/1';
/* every shard file under a folder (gh run download puts each artifact in its own sub-folder) */
function shardFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...shardFiles(p));
    else if (/^shard-\d+\.json$/.test(f)) out.push(p);
  }
  return out;
}
/** One run from its shards: the same run, base and tree, every shard of n once; the cells in shard order, the simulator check from shard 0. */
export function joinShards(docs) {
  if (!docs.length) throw new Error('join: no shard files');
  const first = docs[0], n = first.shard[1], seen = new Set();
  for (const d of docs) {
    if (d.schema !== SHARD_SCHEMA) throw new Error('join: ' + (d.schema || 'no schema') + ' is not ' + SHARD_SCHEMA);
    if (d.run !== first.run || d.hash !== first.hash || d.shard[1] !== n) throw new Error('join: shard ' + d.shard.join('/') + ' of ' + d.run + ' on ' + d.hash + ' beside ' + first.run + ' on ' + first.hash);
    if (seen.has(d.shard[0])) throw new Error('join: shard ' + d.shard[0] + ' twice');
    seen.add(d.shard[0]);
  }
  const missing = Array.from({ length: n }, (_, i) => i).filter((i) => !seen.has(i));
  if (missing.length) throw new Error('join: shards missing: ' + missing.join(', '));
  const cells = docs.flatMap((d) => d.cells), cal = docs.find((d) => d.shard[0] === 0);
  const wallS = Math.max(...docs.map((d) => d.runtime.wallS)), workerS = docs.reduce((a, d) => a + (d.runtime.workerS || 0), 0);
  return { run: first.run, base: first.base, hash: first.hash, commits: [...new Set(docs.map((d) => d.commit))], seeds: first.seeds, hours: first.hours, calibration: cal ? cal.calibration : null,
    runtime: { cells: cells.length, shards: n, wallS, workerS, workers: docs.reduce((a, d) => a + (d.runtime.workers || 0), 0), errors: cells.filter((c) => c.error).length }, cells };
}

/** One shard of a plan: the cells at index i, i + n, ... and their seed jobs. */
export function shardOf(plan, [i, n]) {
  if (!(Number.isInteger(i) && Number.isInteger(n) && n > 0 && i >= 0 && i < n)) throw new Error('balance-matrix: a shard is i/n with 0 <= i < n');
  const cells = plan.cells.filter((_, k) => k % n === i), keep = new Set(cells.map((c) => c.key));
  return { cells, jobs: plan.jobs.filter((j) => keep.has(j.key)) };
}

/* ── THE CACHE: stamped with the grid's input hash and this harness's own files ────────────────────────────────────────────────── */
const OWN = ['tools/balance-program/matrix-plan.mjs', 'tools/balance-program/matrix-metrics.mjs', 'tools/balance-program/matrix-calibration.mjs', 'tools/balance-program/atlas/rates.mjs', 'tests/fixtures/balance-calibration.json'];
export function matrixHash(root = ROOT) {
  const h = createHash('sha256');
  h.update(inputHash(root));
  for (const p of OWN) if (existsSync(join(root, p))) h.update(p + '\0' + readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n'));
  return h.digest('hex').slice(0, 16);
}
const commitOf = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
/* what the cache keeps of a cell (its kits are a rule on the data: progression-grid.mjs --kits rebuilds them) */
const keepCell = ({ kits, ...c }) => (void kits, c);
function writeCache(file, res, extra = {}) {
  const doc = { schema: 'hearthrise.balance-matrix/1', run: res.run, commit: commitOf(), at: new Date().toISOString().slice(0, 16) + 'Z', hash: matrixHash(), seeds: res.seeds, hours: res.hours,
    runtime: res.runtime, refresh: 'by hand or the nightly: re-run when --report prints STALE', ...extra, calibration: res.calibration, cells: res.cells.map(keepCell) };
  writeFileSync(file, JSON.stringify(doc) + '\n');
  return doc;
}
export function readCache(file) { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; }

/* ── PRINTING ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const fmt = (v, d = 0) => (!finite(v) ? '-' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : d ? v.toFixed(d) : String(Math.round(v)));
const pct = (v) => (!finite(v) ? '-' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%');
/* THE FULL-GAME BLOCK AGAINST THE DEATH SAMPLE: every band row whose status moved between the two (same way, band and cell), by band, and the
   death pools by tier on the grounds (the four, 14 grounds, both ends). A moved band is chapter 14 content to re-size at its own rows */
export function compareBlocks(rowsA, rowsB, cellsA, cellsB) {
  const key = (r) => r.way + '|' + r.band + '|' + r.at, A = new Map(rowsA.map((r) => [key(r), r])), moved = {};
  for (const r of rowsB) { const a = A.get(key(r)); if (a && a.status !== r.status && [a.status, r.status].some((x) => ['ok', 'off', 'RED'].includes(x))) (moved[r.band] || (moved[r.band] = [])).push(a.status + '->' + r.status); }
  const pool = (cells, tier) => { const cs = cells.filter((c) => c.m && c.block === 'grounds' && c.party === 4 && c.tier === tier); const d = cs.reduce((x, c) => x + (c.m.deaths || 0), 0), h = cs.reduce((x, c) => x + (c.m.sample ? c.m.sample.heroHours : 0), 0); return h ? Math.round((10000 * d) / h) / 10 : null; };
  return { moved, pools: Object.fromEntries(['dangerous', 'deadly'].map((t) => [t, [pool(cellsA, t), pool(cellsB, t)]])) };
}
function printBlocks(rowsA, rowsB, cellsA, cellsB, out = console.log) {
  const c = compareBlocks(rowsA, rowsB, cellsA, cellsB);
  out('\nTHE FULL-GAME BLOCK AGAINST THE DEATH SAMPLE (14-the-rest.md section 1): deaths in 1,000 hours on the 14 grounds, the four, death sample -> full-game block: ' + Object.entries(c.pools).map(([t, [a, b]]) => t + ' ' + a + ' -> ' + b).join(', '));
  const bands = Object.entries(c.moved).sort((x, y) => y[1].length - x[1].length);
  out('  band rows whose status moved: ' + (bands.length ? bands.map(([b, xs]) => b + ' ' + xs.length + ' (' + Object.entries(xs.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {})).map(([k, n]) => k + ' ' + n).join(', ') + ')').join('; ') : 'none'));
}
/* THE TOOL RED (audit A-0): the cells that ended on a TOOL_RED_ENDS reason, printed under a run's header and on stderr at the end; 1 when any */
export function printToolReds(cells, out = console.log, label = '') {
  const t = toolReds(cells);
  if (!t.length) return 0;
  out('TOOL RED' + (label ? ' (' + label + ')' : '') + ': ' + t.length + ' cell(s) measured an engine stall or fault, not the balance (an end of ' + TOOL_RED_ENDS.join(' or ') + ', or an engine error that names one)');
  for (const x of t.slice(0, 12)) out('  TOOL RED ' + x.key + ': ' + x.why);
  if (t.length > 12) out('  ... ' + (t.length - 12) + ' more');
  return 1;
}
const sayToolReds = (cells, label = '') => printToolReds(cells, (s) => console.error(s), label);
export function printRun(res, rows, out = console.log) {
  const ok = res.cells.filter((c) => c.m), bad = res.cells.filter((c) => c.error);
  out('BALANCE MATRIX ' + res.run + ': ' + ok.length + ' cells (' + bad.length + ' errors), ' + res.seeds + ' seed(s) x ' + res.hours + ' h, ' + res.runtime.wallS + ' s wall, ' + res.runtime.workerS + ' worker-s on ' + res.runtime.workers + ' workers');
  for (const c of bad.slice(0, 5)) out('  ERROR ' + c.key + ': ' + c.error);
  printToolReds(res.cells, out);
  const D = deriveMatrix(res.cells);
  out('\nEVERY WAY ALONE (MID, Normal; Levels past 400 and 185-400 are PROJECTED): DPS | Level XP/h | net gold/h | kills/h | deaths/1000h | low HP | under 30% | h a Level');
  const lone = ok.filter((c) => c.party === 1 && !c.step && c.gear === 'mid' && c.tier === 'normal' && c.block !== 'grounds');
  for (const L of [...new Set(lone.map((c) => c.L))].sort((a, b) => a - b)) {
    out('  Level ' + L + (L > 185 ? ' PROJECTED' : ''));
    for (const [g, ways] of Object.entries(STYLE_GROUPS)) {
      if (!ways.length) { out('    ' + (g + ' (not built: FIST_LINE.live false, no engine way)').padEnd(30)); continue; }
      for (const w of ways) { const c = lone.find((x) => x.L === L && x.styles[0] === w); if (c) out('    ' + (g + ' ' + w).padEnd(30) + [fmt(c.m.dps, 1), fmt(c.m.levelXpPerH), fmt(c.m.netPerH), fmt(c.m.killsPerH), fmt(c.m.deathsPer1000h, 1), fmt(c.m.lowHpTypical, 2), fmt(c.m.hpUnder30, 3), fmt(c.m.hoursPerLevel, 2)].map((s) => s.padStart(9)).join(' ')); }
    }
  }
  /* the skills the cells play: tools/balance-sim/skill-lines.mjs's career line (past its last measured Level it runs straight on: the
     baseline lane is moving that onto the skill curve), so a reader sees what a high Level's hero was given */
  const sk = lone.filter((c) => c.skills && c.styles[0] === 'hammer');
  if (sk.length) out('\nSKILLS PLAYED, the lone hammer (main skill / Defense): ' + sk.map((c) => c.L + ': ' + c.skills[0].join(' / ')).join(', '));
  out('\nSOLO AGAINST PARTY (a four\'s head over the lone hammer; and over the same four ways alone) with each seat\'s share of the damage taken');
  for (const s of D.soloVsParty) out('  ' + (s.L + ' ' + s.gear + ' ' + s.tier).padEnd(22) + ' XP ' + fmt(s.xpHeadVsHammer, 2) + ' (same alone ' + fmt(s.xpHeadVsSameAlone, 2) + '), net ' + fmt(s.netHeadVsHammer, 2) + ', DPS ' + fmt(s.dpsHeadVsHammer, 2) + ', deaths ' + fmt(s.deathsFour, 1) + ' vs ' + fmt(s.deathsLone, 1) + ' | taken: ' + Object.entries(s.takenShare).map(([k, v]) => k + ' ' + pct(v).replace('+', '')).join(', '));
  printLineups(D.lineups, null, out);
  /* CHECK C3 (matrix-plan.mjs C3_BLOCK, a standing cell of the death sample): the default company holds the Sewer at Level 5 with no death */
  const c3 = ok.filter((c) => c.block === 'c3');
  if (c3.length) {
    const club = c3.find((c) => c.comp === 'c3-club');
    out('\nCHECK C3 (08 section 6, the default company on the Sewer at Level 5, Normal, the start kit): ' + (club ? (club.m.deaths > 0 ? 'FAILS, ' + club.m.deaths + ' death(s)' : 'passes, no death') : 'not played') + '; beside it, never gated:');
    for (const c of c3) out('  ' + (c.comp + ' ' + c.styles.join(',')).padEnd(40) + ' deaths/1000h ' + fmt(c.m.deathsPer1000h, 1) + '  Level XP a head ' + fmt(c.m.levelXpPerH) + '  net gold ' + fmt(c.m.netPerH) + '  low HP ' + fmt(c.m.lowHpTypical, 2) + '  hunted ' + pct(c.m.huntedShare).replace('+', ''));
  }
  /* THE DEATH RULE (cell.mjs header): the share of the time offered that was hunted, and XP after deaths over that time, where it is under 1 */
  const short = ok.filter((c) => !c.variant && Number.isFinite(c.m.huntedShare) && c.m.huntedShare < 0.999 && c.block !== 'grounds');
  out('\nTHE DEATH RULE (a death ends that hero\'s hunt; the rest hunt on): ' + short.length + ' of ' + ok.filter((c) => !c.variant).length + ' cells lost hunting time'
    + (short.length ? '; the worst: ' + [...short].sort((a, b) => a.m.huntedShare - b.m.huntedShare).slice(0, 8).map((c) => c.key + ' hunted ' + pct(c.m.huntedShare).replace('+', '') + ', ' + pct(c.m.endedEarlyShare).replace('+', '') + ' of hunts ended early, XP after deaths ' + fmt(c.m.netLevelXpPerH)).join('; ') : ''));
  /* the four on the harder tiers both ways (S-6): the rest hunting on (the default) and all coming home (the leave block) */
  const both = D.variants.filter((v) => v.variant === 'leave:together');
  if (both.length) out('  both party defaults, the MID four (hunted share, rest hunt on -> all come home): ' + both.map((v) => v.L + ' ' + v.tier + ' ' + pct(v.huntedShare[0]).replace('+', '') + ' -> ' + pct(v.huntedShare[1]).replace('+', '')).join('; '));
  out('\nVARIANTS against the plain cell (matrix-plan.mjs: one timed buff, a bar and a purse that bind, build tracks): DPS | kills | Level XP | XP after deaths | net gold | hunted');
  for (const v of D.variants) out('  ' + (v.L + ' ' + v.gear + ' x' + v.party + ' ' + v.tier + ' ' + v.variant).padEnd(40) + [fmt(v.dps, 3), fmt(v.killsPerH, 3), fmt(v.levelXpPerH, 3), fmt(v.netLevelXpPerH, 3), fmt(v.netPerH, 3), fmt(v.huntedShare[1], 3)].map((s) => s.padStart(8)).join(' '));
  /* TALENTS (10-level-choices.md 8.3): each contrast build over the suggested build of the same seats; Linger and the unlocks are not modelled */
  out('\nTALENT BUILDS over the suggested build (S), MID (A all Force, B the built holder, C empty, D all safety): Level XP | XP after deaths | DPS | taken | deaths/1000h S -> build');
  for (const t of D.talents) out('  ' + (t.L + ' ' + t.way + ' ' + t.tier + ' ' + t.build).padEnd(40) + [fmt(t.levelXpPerH, 3), fmt(t.netLevelXpPerH, 3), fmt(t.dps, 3), fmt(t.takenPerH, 3)].map((s) => s.padStart(8)).join(' ') + '   ' + fmt(t.deathsPer1000h[0], 0) + ' -> ' + fmt(t.deathsPer1000h[1], 0));
  /* FOOTING AND THE TO-HIT FLOOR (chapter 10 rule 3: Footing shares the Defense rating with CORE-4's protection buffs, and the floor the to-hit
     formula is owed is not written): each seat's rating before and with its Footing, the monsters' mean chance to land, and the lowest in the mix.
     A floor at F would bite on every seat whose lowest chance is under F */
  const feet = ok.filter((c) => c.block === 'talents' && (c.build === 'S' || c.build === 'D' || c.build === 'B') && Array.isArray(c.m.toHit));
  out('\nFOOTING AND THE TO-HIT FLOOR (CORE-4 owes a floor; none is written): seat Defense rating plain -> with Footing | monsters\' mean chance to land plain -> with | lowest | where a floor would bite');
  for (const c of feet) for (const [i, t] of c.m.toHit.entries()) {
    if (!t || !(t.footingPm > 0)) continue;
    const bites = [0.10, 0.20, 0.30].filter((f) => Number.isFinite(t.lowest) && t.lowest < f).map((f) => 'a floor at ' + f.toFixed(2));
    out('  ' + (c.L + ' ' + c.styles[i] + ' (' + c.comp + ' ' + c.tier + ' ' + c.build + ')').padEnd(40) + String(t.def0).padStart(5) + ' -> ' + String(t.def).padEnd(5) + fmt(t.landed0, 3).padStart(7) + ' -> ' + fmt(t.landed, 3).padEnd(7) + fmt(t.lowest, 3).padStart(7) + '   ' + (bites.length ? bites.join(', ') + ' would bite' : 'no floor up to 0.30 would bite'));
  }
  out('\nGEAR STEPS BY SLOT CLASS (the full set over it with one class a state back): Level XP | DPS | less damage taken');
  for (const u of D.upgrades) out('  ' + (u.L + ' ' + u.way + ' ' + u.from + '->' + u.to + ' ' + u.cls).padEnd(34) + [pct(u.xp), pct(u.dps), pct(u.lessTaken)].map((s) => s.padStart(9)).join(' '));
  out('\nARCHETYPES (matrix-plan.mjs rule; mean over cells): kills/h | taken/h | dealt/h | s to kill | taken a kill');
  for (const [axis, kinds] of Object.entries(D.archetypes)) for (const [k, t] of Object.entries(kinds).sort((a, b) => b[1].killsPerH - a[1].killsPerH)) out('  ' + (axis + ' ' + k).padEnd(26) + [fmt(t.killsPerH, 1), fmt(t.takenPerH), fmt(t.dealtPerH), fmt(t.ttkS, 1), fmt(t.takenPerKill, 1)].map((s) => s.padStart(9)).join(' ') + '   (' + t.cells + ' cells)');
  if (rows) {
    out('\nBANDS (standards.mjs, the grid\'s judge, per way): RED | off | ok');
    const by = {};
    for (const x of rows) { const b = by[x.way] || (by[x.way] = { RED: 0, off: 0, ok: 0 }); if (x.status in b) b[x.status]++; }
    for (const [w, b] of Object.entries(by)) out('  ' + w.padEnd(10) + String(b.RED).padStart(5) + String(b.off).padStart(6) + String(b.ok).padStart(6));
  }
  if (res.calibration) { out(''); printCalibration(res.calibration, out); }
}

/* THE LINEUPS (matrix-plan.mjs LINEUPS): each four on Deadly against the mixed four, its low point and deaths; with `before`, before -> after */
function printLineups(rows, before, out) {
  if (!rows || !rows.length) return;
  out('\nLINEUPS on Deadly, MID (52-review-combat 10.4; L16 judges these): XP vs the mixed four | kills vs mixed | low HP | worst tenth | deaths/1000h | store/h' + (before ? '   (before -> after)' : ''));
  const B = before ? new Map(before.map((x) => [x.L + '|' + x.styles.join(), x])) : null;
  const two = (b, a, f, d) => (B ? fmt(b && b[f], d) + '->' + fmt(a[f], d) : fmt(a[f], d));
  for (const x of rows) {
    const b = B && B.get(x.L + '|' + x.styles.join());
    out('  ' + (x.L + ' ' + x.styles.join(',')).padEnd(34) + [two(b, x, 'xpVsMixed', 2), two(b, x, 'killsVsMixed', 2), two(b, x, 'lowHpTypical', 2), two(b, x, 'lowHpP10', 2), two(b, x, 'deathsPer1000h', 0), two(b, x, 'storePerH', 0)].map((s) => s.padStart(B ? 13 : 8)).join(' '));
  }
}

export function printDiff(d, meta, out = console.log) {
  out('BALANCE DIFF: ' + (meta.patch.name || '(unnamed patch)') + ' on ' + meta.run + ' (' + meta.cells + ' cells, the same dice before and after)');
  for (const a of meta.applied) out('  ' + (a.knob ? a.knob + ' x' + a.multiplier + ': ' + a.file + ':' + a.line + ' ' + a.from.join(', ') + ' -> ' + a.to.join(', ') : 'edit ' + a.file + ': ' + JSON.stringify(a.from) + ' -> ' + JSON.stringify(a.to)));
  if (meta.regen) out('  monster rows re-written from the formula (gen-ground-stats --write): ' + meta.regen.check);
  out('  targets: ' + ((meta.patch.targets || []).join(', ') || 'none named: every band it moves is UNTARGETED'));
  out('\nFLAGS: ' + ['INTO', 'OUT', 'UNTARGETED'].map((k) => FLAG_WORDS[k] + ' ' + d.counts[k]).join(' | ') + '  (a band row of standards.mjs that changed status or moved more than 1% of its bound)');
  const order = { OUT: 0, UNTARGETED: 1, INTO: 2 };
  for (const b of [...d.bands].sort((x, y) => order[x.flag] - order[y.flag]).slice(0, Number(arg('top', 40)))) out('  ' + b.flag.padEnd(11) + (b.direction === 'toward' ? 'toward ' : 'away   ') + (b.way + ' ' + b.band).padEnd(26) + String(b.at).padEnd(34) + fmt(b.before, 3).padStart(9) + ' ' + b.statusBefore.padEnd(4) + ' -> ' + fmt(b.after, 3).padStart(9) + ' ' + b.statusAfter);
  if (d.bands.length > Number(arg('top', 40))) out('  ... ' + (d.bands.length - Number(arg('top', 40))) + ' more (--json, or --top N)');
  const show = ['dps', 'takenPerH', 'healPerH', 'levelXpPerH', 'netPerH', 'storePerH', 'killsPerH', 'deathsPer1000h', 'lowHpTypical', 'hpUnder30', 'hoursPerLevel'];
  for (const axis of ['style', 'level', 'party', 'gear', 'tier']) {
    const s = axisSummary(d.cells, axis);
    out('\nBY ' + axis.toUpperCase() + ' (the median change over its cells; --json holds each cell and the min and max): ' + show.join(' | '));
    for (const [k, g] of Object.entries(s)) out('  ' + k.padEnd(22) + show.map((id) => (g[id] ? pct(g[id].median) : '-').padStart(8)).join(' '));
  }
  /* EVERY CELL, every metric's change, and the band rows flagged at it (the before and after numbers themselves: --json) */
  out('\nCELLS (the change of each metric; flags: the band rows moved at that cell): ' + show.join(' | '));
  const atOf = (c) => c.L + ' ' + c.gear + ' x' + c.party + ' ' + c.tier;
  for (const c of [...d.cells].sort((a, b) => a.L - b.L || a.party - b.party || String(a.way).localeCompare(String(b.way)))) {
    const fl = d.bands.filter((b) => b.at === atOf(c) && !c.step && c.block !== 'lineups' && (c.block === 'grounds' ? b.way === c.way : c.party > 1 ? b.way === 'hammer' : b.way === c.way));
    const tag = fl.length ? '  ' + ['INTO', 'OUT', 'UNTARGETED'].map((k) => [k, fl.filter((b) => b.flag === k).map((b) => b.band)]).filter(([, bs]) => bs.length).map(([k, bs]) => k + ' ' + bs.join(',')).join('; ') : '';
    out('  ' + (c.L + ' ' + c.way + ' ' + c.gear + ' ' + c.tier + (c.step ? ' ' + c.step : '')).padEnd(40) + show.map((id) => (c.metrics[id] ? pct(c.metrics[id][2]) : '-').padStart(8)).join(' ') + tag);
  }
  if (meta.lineups) printLineups(meta.lineups.after, meta.lineups.before, out);
  out('\nSEATS (each seat\'s share of the party\'s damage taken, before -> after)');
  for (const c of d.cells.filter((x) => x.party > 1 && !x.step)) out('  ' + (c.L + ' ' + c.gear + ' ' + c.tier + ' ' + c.way).padEnd(28) + c.seats.map((s) => s.style + ' ' + fmt(s.takenShare[0], 3) + '->' + fmt(s.takenShare[1], 3)).join('  '));
}

/* ── THE COMMANDS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/* THE BASE A RUN STANDS ON (phase 3, Tyler 2026-11-21: "the current game is irrelevant"): `--base today` (the tree), `--base proposed` (every
   recommended proposal of proposals.json, the default for the dashboard's sweeps), or a list of proposal ids; `--without a,b` takes those out */
export async function baseOf(spec, without) {
  if (!spec || spec === 'today') return null;
  const P = await import('./proposals.mjs');
  const reg = P.loadProposals(ROOT);
  /* `without` turns each off as a toggle does, with whatever requires it (proposals.json `requires`: GR-6 takes GR-6-seat along) */
  const ids = (without || []).reduce((set, id) => P.toggled(reg, set, id), spec === 'proposed' ? reg.recommended : spec.split(','));
  return { name: spec === 'proposed' ? 'proposed' + ((without || []).length ? '-without-' + without.join('+') : '') : 'set-' + ids.join('+'), ids, patch: P.composePatch(ROOT, ids, { reg }) };
}
/** Two patches as one (the base, then the change): edits in order, knobs multiplied, plan steps merged, targets of the change. */
export function combinePatches(a, b) {
  if (!a) return b;
  if (!b) return a;
  const knobs = { ...(a.knobs || {}) };
  for (const [k, m] of Object.entries(b.knobs || {})) knobs[k] = (knobs[k] || 1) * m;
  /* overlays (Balance Lab phase 3): the base's, then the change's; two on one file are refused by the plant (matrix-scratch.mjs checkOverlays) */
  const overlays = [...(a.overlays || []), ...(b.overlays || [])];
  return { ...b, name: (a.name || 'base') + ' + ' + (b.name || 'patch'), knobs, edits: [...(a.edits || []), ...(b.edits || [])], ...(overlays.length ? { overlays } : {}), plan: { ...(a.plan || {}), ...(b.plan || {}) }, targets: b.targets || [] };
}
const optsOf = () => ({ only: arg('only') ? arg('only').split(',').map(Number) : null, blocks: arg('blocks') ? arg('blocks').split(',') : null,
  seeds: arg('seeds') ? Number(arg('seeds')) : null, hours: arg('hours') ? Number(arg('hours')) : null, workers: workersOf(), say: (s) => console.error(s),
  baseSpec: arg('base', 'today'), without: arg('without') ? arg('without').split(',') : [] });

/** Play a run on a base (the tree, or a proposal set planted on a scratch copy). */
export async function playOnBase(D, K, run, base, o) {
  /* a run that names a `patch` (matrix-plan.mjs RUNS['deaths-full']: chapter 14's full-game block) plays it on top of its base */
  const extra = run.patch ? JSON.parse(readFileSync(join(HERE, run.patch), 'utf8')) : null;
  const patch = extra ? combinePatches(base ? base.patch : null, extra) : base ? base.patch : null;
  if (!patch) return playRun(D, K, run, ROOT, o);
  const s = await plantScratch(patch);
  try { return { ...(await playRun(D, K, run, s.root, { ...o, plan: patch.plan })), applied: s.applied }; } finally { s.done(); }
}
export const baseHash = (base) => (base ? createHash('sha256').update(matrixHash() + JSON.stringify(base.patch) + [...new Set([...base.patch.edits.map((e) => e.file), ...(base.patch.overlays || []).map((o) => o.from)])].map((f) => existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : '').join('\0')).digest('hex').slice(0, 16) : matrixHash());
export const cacheFileOf = (run, base) => (run.id === 'subset' ? (base ? join(HERE, 'balance-matrix-' + base.name + '.json') : SUBSET_FILE) : run.id === 'full' ? (base ? join(HERE, 'balance-matrix-full-' + base.name + '.json') : MATRIX_FILE)
  : join(HERE, 'balance-matrix-' + run.id + (base ? '-' + base.name : '') + '.json'));

/** The baseline of a run on its base: the cache when it is fresh and plays the same plan, else a fresh run (written back). */
async function baseline(D, K, run, o) {
  const base = o.base || null;
  const file = cacheFileOf(run, base);
  const c = readCache(file);
  const same = c && c.hash === baseHash(base) && c.seeds === (o.seeds || run.seeds) && c.hours === (o.hours || run.hours) && !o.only && !o.blocks;
  if (same) return { run: c.run, seeds: c.seeds, hours: c.hours, cells: c.cells, calibration: c.calibration, runtime: c.runtime, V: base ? await baseView(D, base) : D, cached: true };
  const res = await playOnBase(D, K, run, base, { ...o, label: run.id + ' ' + (base ? base.name : 'today') });
  if (!o.only && !o.blocks) writeCache(file, res, base ? { base: { name: base.name, proposals: base.ids }, hash: baseHash(base) } : {});
  return res;
}
/* the data view of a base without playing (a cached base still needs its XP curve and formula for the judge) */
async function baseView(D, base) {
  const s = await plantScratch(base.patch);
  try { return await dataView(D, s.root); } finally { s.done(); }
}

export async function diff(patch, run, o = {}) {
  checkPatch(patch);
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const before = await baseline(D, K, run, o);
  const whole = combinePatches(o.base ? o.base.patch : null, patch);
  const s = await plantScratch(whole);
  try {
    const after = await playRun(D, K, run, s.root, { ...o, plan: whole.plan, label: run.id + ' after' });
    const rowsB = judgeMatrix(before.V || D, K, before.cells), rowsA = judgeMatrix(after.V, K, after.cells);
    const d = diffMatrices({ rows: rowsB, cells: before.cells }, { rows: rowsA, cells: after.cells }, patch);
    return { d, before, after, applied: s.applied, regen: s.regen };
  } finally { s.done(); }
}

/**
 * THE GATE (44-formula-architecture.md section 6.2): a patch names its kind, and the diff answers PASS or FAIL for it.
 *   identity      "this changes no number": every metric of every cell equal and no band row moved (no tolerance)
 *   coefficient   "this knob moves these bands and nothing else": no UNTARGETED band row
 *   derivation    "this typed number is now derived": no targeted band row ends in a worse status than it started
 * No kind: REPORT (the flags are read, nothing fails).
 */
export function gateOf(patch, d) {
  const kind = patch && patch.kind;
  if (!kind) return { verdict: 'REPORT', why: null };
  if (kind === 'identity') {
    const moved = d.cells.flatMap((c) => Object.entries(c.metrics).filter(([, [a, b]]) => a !== b).map(([id]) => c.key + ' ' + id));
    return moved.length || d.bands.length ? { verdict: 'FAIL', why: moved.length + ' cell metric(s) and ' + d.bands.length + ' band row(s) moved, e.g. ' + (moved[0] || d.bands[0].band + ' ' + d.bands[0].at) } : { verdict: 'PASS', why: 'the diff is empty' };
  }
  if (kind === 'coefficient') {
    const u = d.bands.filter((b) => b.flag === 'UNTARGETED');
    return u.length ? { verdict: 'FAIL', why: u.length + ' UNTARGETED band row(s), e.g. ' + u[0].way + ' ' + u[0].band + ' at ' + u[0].at } : { verdict: 'PASS', why: 'only targeted bands moved' };
  }
  const RANK = { ok: 0, off: 1, RED: 2 };
  const worse = d.bands.filter((b) => b.flag !== 'UNTARGETED' && RANK[b.statusAfter] > RANK[b.statusBefore]);
  return worse.length ? { verdict: 'FAIL', why: worse.length + ' targeted band row(s) ended worse, e.g. ' + worse[0].band + ' at ' + worse[0].at + ' ' + worse[0].statusBefore + ' -> ' + worse[0].statusAfter } : { verdict: 'PASS', why: 'every targeted band held or improved' };
}

/* THE SWEEP: each knob at each of its steps on the subset, every cell's section 6 metrics, each seat's share of the damage, the band rows it
   moved and the calibration row, for the lab's precomputed table. `out` null: merged into balance-sweeps.json (resumable, a step at a
   time); a file: that file holds only these knobs (one GitHub job a knob: .github/workflows/balance-sweeps.yml, joined by assembleSweeps). */
export const SWEEP_SCHEMA = 'hearthrise.balance-sweeps/1';
/* a cell's METRICS in order, then each seat's share of the damage; five significant digits (the table is a reading, not a ledger) */
const sig = (v) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(5)) : v ?? null);
export const compactCells = (cells) => Object.fromEntries(cells.filter((c) => c.m).map((c) => [c.key, [...METRICS.map(([id]) => sig(c.m[id])), c.m.seatsM.map((x) => sig(x.takenShare))]]));
export const BAND_FIELDS = Object.freeze(['way', 'band', 'group', 'at', 'before', 'after', 'statusBefore', 'statusAfter', 'direction', 'distBefore', 'distAfter']);
async function sweep(run, o, ids0, out = null) {
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const list = readKnobs(ROOT);
  const ids = ids0 || list.knobs.map((k) => k.id);
  for (const id of ids) if (!list.byId.has(id)) throw new Error('sweep: no live knob ' + id + ' in ' + KNOB_FILE);
  const t0 = Date.now();
  const base = o.base || null;
  const before = await baseline(D, K, run, o);
  const rowsB = judgeMatrix(before.V || D, K, before.cells);
  const file = out || SWEEP_FILE;
  const prev = readCache(file);
  const bandRows = (rows) => rows.filter((b) => b.status in { ok: 1, off: 1, RED: 1 }).map((b) => [b.way, b.band, b.group, b.at, b.value, b.status, b.dist]);
  /* IS THE SIMULATOR TRUE? (the calibration row): the harness against the real hunt, played on the tree the real hunt was played on, never on
     a proposal set (a measuring-instrument check, not a comparison of designs) */
  const fresh = !(prev && prev.hash === baseHash(base) && prev.run === run.id);
  const instrument = !fresh ? null : base ? (await playRun(D, K, { id: 'instrument', levels: [], seeds: run.seeds, hours: run.hours, blocks: [] }, ROOT, { ...o, label: 'the simulator on the tree the real hunt was played on' })).calibration : before.calibration;
  const doc = !fresh ? prev : { schema: SWEEP_SCHEMA, run: run.id, hash: baseHash(base), treeHash: matrixHash(), commit: commitOf(), seeds: before.seeds, hours: before.hours,
    base: base ? { name: base.name, proposals: base.ids } : { name: 'today', proposals: [] },
    metrics: METRICS.map(([id, label, scope]) => ({ id, label, scope })), bandFields: BAND_FIELDS,
    cells: before.cells.filter((c) => c.m).map((c) => ({ key: c.key, block: c.block, L: c.L, gear: c.gear, party: c.party, comp: c.comp, tier: c.tier, ground: c.ground, styles: c.styles, step: c.step || null, stepFrom: c.stepFrom || null, stepClass: c.stepClass || null, stretch: c.stretch })),
    baseline: compactCells(before.cells), baselineBands: bandRows(rowsB), baselineDerived: deriveMatrix(before.cells).afterDeaths,
    calibration: instrument, calibrationOn: 'the tree the real hunt was played on', knobs: {}, variants: {} };
  doc.at = new Date().toISOString().slice(0, 16) + 'Z';
  /* THE TOGGLES (o.variants, Tyler 2026-11-21: "a toggle shows each proposal's effect against the proposed game without it, never against
     today"). A proposal of the base: the base without it; '+id', a proposal off in the base: the base with it. Each stores that game's cells
     and bands, and the proposal's EFFECT: its band rows moved between the game without it and the game with it, flagged by its own targets
     (into band / out of band / moved a band it did not target). Today's tree is never a variant: it is only the base the patches stand on */
  if (o.variants && o.variants.length && !base) throw new Error('sweep: toggles need a proposal base (--base proposed)');
  const P = o.variants && o.variants.length ? await import('./proposals.mjs') : null;
  const reg = P ? P.loadProposals(ROOT) : null;
  for (const v of o.variants || []) {
    if (doc.variants[v]) continue;
    const id = v.replace(/^\+/, ''), adding = v.startsWith('+');
    if (adding ? base.ids.includes(id) : !base.ids.includes(id)) throw new Error('sweep: toggle ' + v + (adding ? ' is already on in the base' : ' is not a proposal of the base'));
    const vb = await baseOf(P.toggled(reg, base.ids, v).join(','), []);
    const after = await playOnBase(D, K, run, vb, { ...o, label: (adding ? 'with ' : 'without ') + id });
    const rowsA = judgeMatrix(after.V, K, after.cells);
    const own = P.composePatch(ROOT, [id]);
    const [off, on] = adding ? [{ rows: rowsB, cells: before.cells }, { rows: rowsA, cells: after.cells }] : [{ rows: rowsA, cells: after.cells }, { rows: rowsB, cells: before.cells }];
    const eff = diffMatrices(off, on, own);
    doc.variants[v] = { id, adding, label: adding ? 'the proposed game with ' + id : 'the proposed game without ' + id, proposals: vb.ids, targets: own.targets,
      cells: compactCells(after.cells), bands: bandRows(rowsA), derived: deriveMatrix(after.cells).afterDeaths,
      effect: { counts: eff.counts, bands: eff.bands.map((b) => [...BAND_FIELDS.map((f) => b[f] ?? null), b.flag]) }, wallS: after.runtime.wallS };
    writeFileSync(file, JSON.stringify(doc) + '\n');
    console.error('toggle ' + v + ': ' + after.runtime.wallS + ' s, ' + Object.entries(eff.counts).map(([k, n]) => FLAG_WORDS[k] + ' ' + n).join(', '));
  }
  for (const id of ids) {
    const k = list.byId.get(id);
    doc.knobs[id] = doc.knobs[id] || { label: k.label, group: k.group, what: k.what, ruled: k.ruled || null, steps: {} };
    /* DOES THE KNOB REACH THIS GAME? (matrix-scratch.mjs knobReach) On a proposal base a knob's numbers can stay written while the code
       that read them is replaced: such a knob is not on this game. Said once, never played, never stored as a row of zeros. */
    if (base && !doc.knobs[id].reach) {
      const reach = await knobReach(k, base.patch);
      doc.knobs[id].reach = reach;
      if (reach.checked && !reach.reaches) { doc.knobs[id].gone = 'knob ' + id + ' is not on this game: its numbers are written but nothing reads them (' + reach.how + ' did not move)'; console.error(doc.knobs[id].gone); writeFileSync(file, JSON.stringify(doc) + '\n'); continue; }
    }
    if (doc.knobs[id].gone) continue;
    for (const m of k.steps) {
      if (m === 1 || doc.knobs[id].steps[String(m)]) continue;
      const patch = combinePatches(base ? base.patch : null, { schema: PATCH_SCHEMA, name: id + ' x' + m, knobs: { [id]: m }, targets: [] });
      let s;
      try { s = await plantScratch(patch); }
      catch (e) {
        /* a knob whose line a proposal rewrote is not on this game (the number it moved is derived there now): said once, never played */
        if (!(e instanceof KnobGone)) throw e;
        doc.knobs[id].gone = e.message;
        console.error(e.message);
        break;
      }
      try {
        const after = await playRun(D, K, run, s.root, { ...o, plan: patch.plan, label: id + ' x' + m });
        const rowsA = judgeMatrix(after.V, K, after.cells);
        const d = diffMatrices({ rows: rowsB, cells: before.cells }, { rows: rowsA, cells: after.cells }, patch);
        doc.knobs[id].steps[String(m)] = { applied: s.applied.filter((a) => a.knob).map((a) => a.file + ':' + a.line + ' ' + a.from.join(',') + '->' + a.to.join(',')), cells: compactCells(after.cells),
          bands: d.bands.map((b) => BAND_FIELDS.map((f) => b[f] ?? null)), wallS: after.runtime.wallS, workerS: after.runtime.workerS };
        writeFileSync(file, JSON.stringify(doc) + '\n');
        console.error(id + ' x' + m + ': ' + after.runtime.wallS + ' s, ' + d.bands.length + ' band rows moved');
      } finally { s.done(); }
    }
  }
  doc.sweepS = Math.round((Date.now() - t0) / 1000);
  writeFileSync(file, JSON.stringify(doc) + '\n');
  return doc;
}

/**
 * One table from per-knob sweeps (the GitHub jobs' artifacts): every doc must be a sweep of the same run on the same tree (hash), so their
 * baselines are the same cells on the same dice; a knob in two docs is refused. Answers the merged doc (balance-sweeps.json's shape).
 */
export function assembleSweeps(docs) {
  if (!docs.length) throw new Error('assemble: no sweep docs');
  const first = docs[0];
  for (const d of docs) {
    if (d.schema !== SWEEP_SCHEMA) throw new Error('assemble: ' + (d.schema || 'no schema') + ' is not ' + SWEEP_SCHEMA);
    if (d.hash !== first.hash || d.run !== first.run) throw new Error('assemble: a sweep of ' + d.run + ' on tree ' + d.hash + ' beside one of ' + first.run + ' on ' + first.hash + ': not the same cells');
  }
  const knobs = {}, variants = {};
  for (const d of docs) for (const [id, k] of Object.entries(d.knobs)) {
    if (knobs[id]) throw new Error('assemble: knob ' + id + ' is in two sweeps');
    knobs[id] = k;
  }
  for (const d of docs) for (const [id, v] of Object.entries(d.variants || {})) {
    if (variants[id]) throw new Error('assemble: toggle ' + id + ' is in two sweeps');
    variants[id] = v;
  }
  const { knobs: _k, sweepS: _s, variants: _v, ...head } = first;
  void _k; void _s; void _v;
  return { ...head, at: new Date().toISOString().slice(0, 16) + 'Z', commits: [...new Set(docs.map((d) => d.commit))], sweepS: docs.reduce((a, d) => a + (d.sweepS || 0), 0), knobs, variants };
}

/* THE GROUND RATES the solver reads (sources.mjs loadRates / rateOf), written from the matrix's `grounds` block: one cell a row, the table's
   own fields (net is income less the whole store bill, as the table always read it), plus the seat damage and deaths a 1,000 hours. */
export function rateRow(c, seeds, hours) {
  const m = c.m;
  return { ground: c.ground, level: c.L, size: c.party, comp: c.compIndex || 0, tier: c.tier, party: c.styles, seeds, hours: m.sample.partyHours,
    killsPerH: m.killsPerH, killsByPerH: m.killsByPerH || {}, xpPerHeroH: m.levelXpPerH, netPerHeroH: finite(m.incomePerH) && finite(m.storePerH) ? Math.round(m.incomePerH - m.storePerH) : null,
    incomePerHeroH: m.incomePerH, storePerHeroH: m.storePerH, buysPerH: m.buysPerPartyH || {}, deaths: m.deaths, lowHpP10: finite(m.lowHpP10) ? Math.round(m.lowHpP10 * 1000) / 10 : null,
    deathsPer1000h: m.deathsPer1000h, takenBySeat: m.seatsM.map((s) => [s.style, s.takenPerH, s.takenShare]), source: 'balance-matrix' };
}
export async function runGroundRates(o = {}) {
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const run = { id: 'grounds', levels: [], seeds: o.seeds || (o.quick ? 1 : 2), hours: o.hours || 1, blocks: [{ id: 'grounds', grounds: true, quick: !!o.quick, only: o.only || null }] };
  const res = await playRun(D, K, run, ROOT, { workers: o.workers || workersOf(), calibrate: false, label: 'ground rates', say: o.log || ((s) => console.error(s)), quiet: !!o.quiet });
  const rows = res.cells.filter((c) => c.m).map((c) => rateRow(c, res.seeds, res.hours));
  rows.sort((a, b) => (a.ground + a.level + a.size + a.tier + a.comp).localeCompare(b.ground + b.level + b.size + b.tier + b.comp));
  const file = o.out || RATES_FILE;
  const prev = existsSync(file) && o.only ? JSON.parse(readFileSync(file, 'utf8')).rows.filter((r) => !o.only.includes(r.ground)) : [];
  const table = { schema: 'hearthrise.balance-program.ground-rates/1', source: 'tools/balance-program/balance-matrix.mjs (the grounds block: progression-grid.mjs buildCell, the grid\'s kits, pulls and skills)',
    commit: commitOf(), hash: matrixHash(), quick: !!o.quick, seeds: res.seeds, hours: res.hours, kit: 'MID (grid-kit.mjs, played profile, career-line skills, the tier row\'s pull)',
    playedMs: res.runtime.wallS * 1000, cells: res.cells.length, failed: res.cells.filter((c) => c.error).length, rows: [...prev, ...rows] };
  writeFileSync(file, JSON.stringify(table, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  return { table, file, res: { failed: table.failed, done: rows.length }, jsonl: null };
}

async function main() {
  if (has('selftest')) return selftest();
  /* --knob-ids [a,b]: the live knob ids as a JSON list (the sweep workflow's job matrix); a named id that is no live knob is refused */
  if (has('knob-ids')) {
    const list = readKnobs(ROOT), want = arg('knob-ids') ? arg('knob-ids').split(',').map((s) => s.trim()).filter(Boolean) : null;
    const bad = (want || []).filter((id) => !/^[A-Za-z][A-Za-z0-9]*$/.test(id) || !list.byId.has(id));
    if (bad.length) { console.error('balance-matrix: no live knob ' + bad.join(', ')); return 2; }
    console.log(JSON.stringify(want || list.knobs.map((k) => k.id)));
    return 0;
  }
  /* --sweep-jobs [a,b]: the sweep workflow's job matrix on the proposed game, one job a knob ('k:<id>') and one a toggle ('t:<id>' the proposed
     game without that proposal, 't:+<id>' with one that is off). Named knobs are validated; every toggle of the registry is listed */
  if (has('sweep-jobs')) {
    const list = readKnobs(ROOT), want = arg('sweep-jobs') ? arg('sweep-jobs').split(',').map((s) => s.trim()).filter(Boolean) : null;
    const bad = (want || []).filter((id) => !/^[A-Za-z][A-Za-z0-9]*$/.test(id) || !list.byId.has(id));
    if (bad.length) { console.error('balance-matrix: no live knob ' + bad.join(', ')); return 2; }
    const P = await import('./proposals.mjs'), reg = P.loadProposals(ROOT);
    const toggles = reg.proposals.filter((p) => p.patch).map((p) => (p.recommended ? p.id : '+' + p.id));
    for (const t of toggles) if (!/^\+?[A-Za-z0-9-]+$/.test(t)) { console.error('balance-matrix: proposal id ' + t + ' is not a job name'); return 2; }
    console.log(JSON.stringify([...(want || list.knobs.map((k) => k.id)).map((id) => 'k:' + id), ...toggles.map((t) => 't:' + t)]));
    return 0;
  }
  /* --knobs alone lists them; `--sweep --knobs a,b` names the knobs a sweep plays */
  if (has('knobs') && !has('sweep')) {
    const list = readKnobs(ROOT);
    console.log('KNOBS: ' + KNOB_FILE + ' (' + (list.from || 'no source named') + '): ' + list.knobs.length + ' live, ' + list.planned.length + ' planned, ' + list.notKnobs.length + ' families that are not knobs');
    for (const k of knobTable()) console.log(k.id.padEnd(20) + k.group.padEnd(15) + k.sites.map((s) => s.at + ' [' + s.values.join(', ') + ']').join('; ') + (k.regen ? '  (rows re-written)' : '')
      + (k.ruled ? '  RULED ' + k.ruled : '') + (k.sharesLineWith.length ? '  shares a line with ' + k.sharesLineWith.join(', ') : '') + (k.stale ? '  STALE: the list\'s value is not today\'s' : '')
      + '\n' + ' '.repeat(35) + k.what + '\n' + ' '.repeat(35) + 'steps ' + k.steps.join(' / '));
    for (const p of list.planned) console.log(('planned ' + p.id).padEnd(35) + 'arrives with ' + p.arrivesWith + ': ' + p.home);
    return 0;
  }
  const run = arg('run') ? RUNS[arg('run')] : has('subset') ? RUNS.subset : RUNS.full;
  if (!run) { console.error('balance-matrix: no run ' + arg('run') + ' (' + Object.keys(RUNS).join(', ') + ')'); return 2; }
  const o = optsOf();
  o.base = await baseOf(o.baseSpec, o.without);
  if (o.base) console.error('base: ' + o.base.name + ' (' + o.base.ids.join(', ') + ')');
  if (has('rates')) {
    const r = await runGroundRates({ quick: has('quick'), workers: o.workers, seeds: o.seeds, hours: o.hours, only: arg('grounds') ? arg('grounds').split(',') : null, out: arg('out') ? resolve(arg('out')) : null });
    console.log('ground rates: ' + r.table.rows.length + ' rows (' + r.table.failed + ' failed) in ' + Math.round(r.table.playedMs / 1000) + ' s -> ' + r.file);
    return 0;
  }
  if (has('sweep')) {
    const out = arg('out') ? resolve(arg('out')) : null;
    /* --variants all | a,b,+c (the toggles; all = every proposal of the base off, every registry proposal not in it on); --knobs none: no knob steps */
    const va = arg('variants');
    if (va) {
      const P = await import('./proposals.mjs'), reg = P.loadProposals(ROOT);
      o.variants = va === 'all' ? reg.proposals.filter((p) => p.patch).map((p) => (o.base.ids.includes(p.id) ? p.id : '+' + p.id)) : va.split(',').filter(Boolean);
    }
    const doc = await sweep(RUNS.subset, o, arg('knobs') === 'none' ? [] : arg('knobs') ? arg('knobs').split(',') : null, out);
    console.log('sweep: ' + Object.keys(doc.knobs).length + ' knob(s) -> ' + (out || relative(ROOT, SWEEP_FILE)) + ' (' + doc.sweepS + ' s)');
    return 0;
  }
  /* THE FULL MATRIX ON GITHUB (.github/workflows/balance-matrix-full.yml): `--shard i/n --out FILE` plays one job's share of the run on its base;
     `--join DIR` reads every shard file under DIR (the run's artifacts), refuses shards of another run, base or tree, writes the run's cache
     (cacheFileOf) and prints its report */
  if (arg('shard')) {
    const [i, n] = arg('shard').split('/').map(Number);
    const D0 = await loadGridData(ROOT), K0 = await loadKits(ROOT);
    const res = await playOnBase(D0, K0, run, o.base, { ...o, shard: [i, n], label: run.id + ' shard ' + i + '/' + n });
    const doc = { schema: SHARD_SCHEMA, run: run.id, shard: [i, n], base: o.base ? { name: o.base.name, proposals: o.base.ids } : { name: 'today', proposals: [] }, hash: baseHash(o.base),
      commit: commitOf(), seeds: res.seeds, hours: res.hours, runtime: res.runtime, calibration: res.calibration || null, cells: res.cells.map(keepCell) };
    writeFileSync(resolve(arg('out') || 'shard-' + i + '.json'), JSON.stringify(doc) + '\n');
    console.log('shard ' + i + '/' + n + ': ' + doc.cells.length + ' cells (' + doc.cells.filter((c) => c.error).length + ' errors) in ' + res.runtime.wallS + ' s');
    return Math.max(doc.cells.some((c) => c.error) ? 1 : 0, sayToolReds(doc.cells));
  }
  if (arg('join')) {
    const docs = shardFiles(resolve(arg('join'))).map((f) => JSON.parse(readFileSync(f, 'utf8')));
    const joined = joinShards(docs), jrun = RUNS[joined.run] || run;
    if (joined.hash !== baseHash(o.base)) console.log('STALE: the shards were played on ' + joined.hash + ', this tree and base is ' + baseHash(o.base));
    const file = cacheFileOf(jrun, o.base);
    writeFileSync(file, JSON.stringify({ schema: 'hearthrise.balance-matrix/1', ...joined, refresh: 'GitHub balance-matrix-full: push to balance-full/<branch>, then --join' }) + '\n');
    const D0 = await loadGridData(ROOT), K0 = await loadKits(ROOT), V = o.base ? await baseView(D0, o.base) : D0;
    const rows = judgeMatrix(V, K0, joined.cells);
    printRun({ ...joined, run: joined.run }, rows);
    /* chapter 14's full-game block beside the plain death sample it extends (the dial pick reads both: 14-the-rest.md section 1) */
    if (jrun.patch && RUNS.deaths && jrun.id !== 'deaths') { const c = readCache(cacheFileOf(RUNS.deaths, o.base)); if (c) printBlocks(judgeMatrix(V, K0, c.cells), rows, c.cells, joined.cells); else console.log('\n(no death sample cache on this base to read the full-game block against: join the deaths shards first)'); }
    if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ run: joined.run, runtime: joined.runtime, derived: deriveMatrix(joined.cells), bands: rows, calibration: joined.calibration }, null, 1));
    console.log('\njoined ' + docs.length + ' shards, ' + joined.cells.length + ' cells -> ' + relative(ROOT, file));
    return sayToolReds(joined.cells);
  }
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  if (arg('diff')) {
    const patch = JSON.parse(readFileSync(resolve(arg('diff')), 'utf8'));
    const t0 = Date.now();
    const r = await diff(patch, run, o);
    printDiff(r.d, { patch, run: run.id, cells: r.after.cells.length, applied: r.applied, regen: r.regen, lineups: { before: deriveMatrix(r.before.cells).lineups, after: deriveMatrix(r.after.cells).lineups } });
    if (r.after.calibration) { console.log(''); printCalibration(r.after.calibration, console.log, r.before.calibration); }
    console.log('\nRUNTIME: before ' + (r.before.cached ? 'from the cache' : r.before.runtime.wallS + ' s') + ', after ' + r.after.runtime.wallS + ' s (' + r.after.runtime.workerS + ' worker-s, ' + r.after.runtime.workers + ' workers), diff total ' + Math.round((Date.now() - t0) / 1000) + ' s');
    const gate = gateOf(patch, r.d);
    console.log('GATE (44 section 6.2, kind ' + (patch.kind || 'none named: report only') + '): ' + gate.verdict + (gate.why ? ' - ' + gate.why : ''));
    const red = Math.max(sayToolReds(r.before.cells, 'before'), sayToolReds(r.after.cells, 'after'));
    if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ patch, applied: r.applied, regen: r.regen, gate, counts: r.d.counts, bands: r.d.bands, cells: r.d.cells, calibration: { before: r.before.calibration, after: r.after.calibration } }, null, 1));
    return gate.verdict === 'FAIL' || red ? 1 : 0;
  }
  let res;
  if (has('report')) {
    const c = readCache(cacheFileOf(run, o.base));
    if (!c) { console.error('balance-matrix: no cache for ' + run.id + (o.base ? ' on ' + o.base.name : '') + ': run it first'); return 2; }
    if (c.hash !== baseHash(o.base)) console.log('STALE: the tree moved since ' + c.commit + ' (' + c.at + '); re-run to refresh');
    res = { ...c, V: o.base ? await baseView(D, o.base) : D };
  } else if (o.base) res = await baseline(D, K, run, o);
  else {
    res = await playRun(D, K, run, ROOT, o);
    if (!o.only && !o.blocks) writeCache(cacheFileOf(run, null), res);
  }
  const rows = judgeMatrix(res.V || D, K, res.cells);
  printRun(res, rows);
  if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ run: res.run, runtime: res.runtime, cells: res.cells.map(keepCell), derived: deriveMatrix(res.cells), bands: rows, calibration: res.calibration }, null, 1));
  return sayToolReds(res.cells);
}

/* ── THE SELFTEST ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const lone = (w) => [[w], w === 'hammer' ? 'h' : w];
const MINI = Object.freeze({ id: 'selftest', levels: [], seeds: 1, hours: 0.25, blocks: [
  { id: 'a', levels: [30], comps: [lone('hammer')], gears: ['mid', 'low'], tiers: ['normal', 'hardest'] },
  { id: 'b', levels: [60], comps: compsOf(4), gears: ['mid'], tiers: ['normal'] },
  { id: 'c', levels: [HIGH_LEVELS[0]], comps: [lone('mage')], gears: ['mid'], tiers: ['normal'] },
] });
async function selftest() {
  const fails = [];
  const check = (name, ok, why = '') => { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ': ' + why)); if (!ok) fails.push(name); };
  const t0 = Date.now();
  /* 1. the knobs find their numbers, and the number rules */
  let table = null;
  try { table = knobTable(); } catch (e) { check('every knob finds its numbers on the tree', false, e.message); }
  if (table) check('every knob finds its numbers on the tree (' + table.length + ' knobs, ' + table.reduce((a, k) => a + k.sites.length, 0) + ' lines)', table.every((k) => k.sites.length > 0));
  check('a whole number stays whole, a decimal keeps its places', scaled('150', 1.125) === '169' && scaled('0.35', 1.1) === '0.385' && scaled('2', 1.25, true) === '2.5');
  check('every knob\'s numbers today are the list\'s `value` (no stale knob)', table && table.every((k) => !k.stale), table && table.filter((k) => k.stale).map((k) => k.id).join(', '));
  /* 1a. A KNOB THAT NOTHING READS IS CAUGHT (Balance Lab phase 1: xpPerKill, xpByLevel and levelCurve read 'moved nothing' on the proposed
     game). On the tree each reaches the engine. With the reader replaced by a planted edit (the shape of proposals GR-5 and GR-6: the
     typed numbers stay, the code that read them is gone) each is reported as not reaching, and a knob whose reader is untouched still does. */
  {
    const K0 = readKnobs(ROOT).byId;
    const noXpReader = { schema: PATCH_SCHEMA, name: 'planted: the kill reward stops reading STAT_FORMULA.xp', targets: [], edits: [{ file: 'src/data/balance-sheet.js', from: 'Math.max(F.xp.min || 0, F.xp.a * L ** F.xp.b)', to: '(2)' }] };
    const noCurveReader = { schema: PATCH_SCHEMA, name: 'planted: the Level table stops reading LEVEL_CURVE', targets: [], edits: [{ file: 'src/core/xp.js', from: 'export function charXpForLevel(lv) { return xpForLevelOn(LEVEL_ROWS, lv); }', to: 'export function charXpForLevel(lv) { return 1000 * lv * lv; }' }] };
    try {
      const live = [await knobReach(K0.get('xpPerKill')), await knobReach(K0.get('xpByLevel')), await knobReach(K0.get('levelCurve'))];
      check('xpPerKill, xpByLevel and levelCurve reach the engine on the tree', live.every((x) => x.checked && x.reaches), JSON.stringify(live.map((x) => x.reaches)));
      const dead = [await knobReach(K0.get('xpPerKill'), noXpReader), await knobReach(K0.get('xpByLevel'), noXpReader), await knobReach(K0.get('levelCurve'), noCurveReader)];
      check('with their reader replaced (the numbers still written) all three are caught as not reaching', dead.every((x) => x.checked && !x.reaches), JSON.stringify(dead.map((x) => x.reaches)));
      const other = [await knobReach(K0.get('monsterHp'), noXpReader), await knobReach(K0.get('levelCurve'), noXpReader)];
      check('a knob whose own reader stands still reaches on that game', other.every((x) => x.checked && x.reaches), JSON.stringify(other.map((x) => x.reaches)));
    } catch (e) { check('a knob that nothing reads is caught', false, e.message); }
  }
  /* 1b. KNOBS ON ONE LINE (knobs.json sharesLineWith): one edit a line, built from the untouched line, every pick scaled; two knobs on one
     number multiply; and the plant applies it (its exactly-once anchor would refuse a second edit built from the untouched line) */
  const list = readKnobs(ROOT);
  const shared = list.knobs.filter((k) => (k.sharesLineWith || []).length);
  const pair = shared.length ? [shared[0].id, shared[0].sharesLineWith[0]] : null;
  if (!pair) check('the list has knobs that share a line (sharesLineWith)', false, 'none');
  else {
    const pe = patchEdits(ROOT, { knobs: { [pair[0]]: 1.25, [pair[1]]: 0.75 } }, list);
    const files = pe.edits.map(([f, from]) => f + ':' + from);
    const one = new Set(files).size === files.length;
    const both = pe.applied.filter((a) => a.sharedWith).length >= 2 && pe.applied.every((a) => a.to.every((v, i) => v !== a.from[i]));
    let landed = false, why = '';
    try {
      const sp = await plantScratch({ knobs: { [pair[0]]: 1.25, [pair[1]]: 0.75 } });
      landed = pe.applied.every((a) => readFileSync(join(sp.root, a.file), 'utf8').split('\n')[a.line - 1].includes(a.to[0]));
      sp.done();
    } catch (e) { why = e.message; }
    check('two knobs on one line (' + pair.join(' + ') + '): one edit a line, both moved, and the copy holds both', one && both && landed, why || JSON.stringify(pe.applied).slice(0, 300));
    /* the same number picked by two knobs multiplies (a planted list: the same site twice) */
    const k0 = list.byId.get(pair[0]);
    const twin = { ...list, byId: new Map([...list.byId, ['twinOf' + pair[0], { ...k0, id: 'twinOf' + pair[0] }]]) };
    const pt = patchEdits(ROOT, { knobs: { [pair[0]]: 1.25, ['twinOf' + pair[0]]: 1.25 } }, twin);
    const a0 = pt.applied.find((a) => a.knob === pair[0]);
    check('two knobs on the same number multiply (x1.25 twice is x1.5625)', pt.edits.length === k0.sites.reduce((n, s) => n + (s.count || 1), 0) && a0.to[0] === scaled(a0.from[0], 1.5625, k0.sites[0].nums[0] && k0.sites[0].nums[0].float), JSON.stringify(a0));
  }
  /* 1c. the gate: each kind passes and fails on planted diffs */
  const dEmpty = { cells: [{ key: 'x', metrics: { dps: [1, 1, 0] } }], bands: [] }, dMoved = { cells: [{ key: 'x', metrics: { dps: [1, 2, 1] } }], bands: [{ way: 'hammer', band: 'S1.mid', at: 'a', flag: 'UNTARGETED', statusBefore: 'ok', statusAfter: 'off' }] };
  const dWorse = { cells: [], bands: [{ way: 'hammer', band: 'P2', at: 'a', flag: 'OUT', statusBefore: 'ok', statusAfter: 'RED' }] };
  check('the gate: identity passes an empty diff and fails a moved one; coefficient fails an UNTARGETED band; derivation fails a targeted band gone worse; no kind only reports',
    gateOf({ kind: 'identity' }, dEmpty).verdict === 'PASS' && gateOf({ kind: 'identity' }, dMoved).verdict === 'FAIL' && gateOf({ kind: 'coefficient' }, dMoved).verdict === 'FAIL'
    && gateOf({ kind: 'coefficient' }, dWorse).verdict === 'PASS' && gateOf({ kind: 'derivation' }, dWorse).verdict === 'FAIL' && gateOf({ kind: 'derivation' }, dMoved).verdict === 'PASS' && gateOf({}, dMoved).verdict === 'REPORT');
  /* 1d. the per-knob sweeps join into one table only when they are the same cells on the same tree, a knob once */
  const sw = (hash, id) => ({ schema: SWEEP_SCHEMA, run: 'subset', hash, commit: 'c', sweepS: 10, cells: [], baseline: {}, knobs: { [id]: { steps: { '1.1': {} } } } });
  const refusedOf = (docs) => { try { assembleSweeps(docs); return false; } catch { return true; } };
  const joined = assembleSweeps([sw('h1', 'a'), sw('h1', 'b')]);
  check('sweeps join: two knobs on one tree make one table; a sweep of another tree, or a knob twice, is refused',
    Object.keys(joined.knobs).join() === 'a,b' && joined.sweepS === 20 && refusedOf([sw('h1', 'a'), sw('h2', 'b')]) && refusedOf([sw('h1', 'a'), sw('h1', 'a')]));
  /* 1e. the toggle jobs join too (phase 3: one job a proposal toggle), a toggle once */
  const tg = (id) => ({ ...sw('h1', 'k' + id), knobs: {}, variants: { [id]: { id, effect: { counts: {}, bands: [] } } } });
  const joinedT = assembleSweeps([sw('h1', 'a'), tg('GR-4'), tg('+world-1')]);
  check('toggles join: each toggle job lands in variants beside the knobs; a toggle twice is refused',
    Object.keys(joinedT.variants).join() === 'GR-4,+world-1' && Object.keys(joinedT.knobs).join() === 'a' && refusedOf([tg('GR-4'), tg('GR-4')]));
  /* 1f. A KNOB ON A PROPOSED GAME moves the proposed game's line: a patch's own edits are planted first and the knob is found on the text they
     leave; a knob whose line an edit rewrote away is refused by name (KnobGone), never planted on today's line under it */
  {
    const site = locateKnob(ROOT, list.byId.get('playerAttack'))[0];
    const mark = { file: site.file, from: site.text, to: site.text + ' /* a proposal was here */' };
    let why = '', landed = false;
    const pe = patchEdits(ROOT, { knobs: { playerAttack: 1.5 }, edits: [mark] }, list);
    const kn = pe.edits.find(([f, from]) => f === site.file && from === mark.to);
    if (!kn) why = 'the knob edit does not start from the edited line: ' + JSON.stringify(pe.edits.map(([f, a]) => f + ' ' + a.slice(0, 60)));
    else {
      const ps = await plantScratch({ knobs: { playerAttack: 1.5 }, edits: [mark] });
      try { const t = readFileSync(join(ps.root, site.file), 'utf8'); landed = t.includes(kn[2]) && t.includes('/* a proposal was here */'); } finally { ps.done(); }
    }
    let gone = false;
    try { patchEdits(ROOT, { knobs: { playerAttack: 1.5 }, edits: [{ file: site.file, from: site.text, to: '/* rewritten by a proposal */' }] }, list); } catch (e) { gone = e instanceof KnobGone; }
    check('a knob on top of a proposal\'s edit lands on the edited line, and a knob whose line a proposal removed is refused by name', !!kn && landed && gone, why);
  }
  /* 2. the scratch copy: a path outside the planted trees is refused; the real tree is never written */
  let refused = false;
  try { checkPatch({ edits: [{ file: 'tools/balance-program/standards.mjs', from: 'a', to: 'b' }] }); } catch { refused = true; }
  check('an edit outside the planted trees is refused', refused);
  const realBytes = readFileSync(join(ROOT, 'src/core/combat.js'), 'utf8');
  const probe = await plantScratch({ knobs: { playerAttack: 1.5 } });
  const planted = readFileSync(join(probe.root, 'src/core/combat.js'), 'utf8');
  const relRoot = relative(ROOT, probe.root), inRepo = !relRoot.startsWith('..') && !isAbsolute(relRoot);
  probe.done();
  check('the patch lands on the copy, never on the tree', planted !== realBytes && readFileSync(join(ROOT, 'src/core/combat.js'), 'utf8') === realBytes && !inRepo && /dmgLvl \* 0\.525/.test(planted), probe.root);
  /* 3. an empty patch on the copy plays exactly as the tree */
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const o = { workers: workersOf(), quiet: true, calibrate: false };
  const base = await playRun(D, K, MINI, ROOT, o);
  check('the mini plan plays (' + base.cells.length + ' cells, no error)', base.cells.length >= 6 && base.cells.every((c) => c.m), (base.cells.find((c) => c.error) || {}).error);
  const play = async (patch) => { const s = await plantScratch(patch); try { return { res: await playRun(D, K, MINI, s.root, o), regen: s.regen }; } finally { s.done(); } };
  /* 3a. THE TOOL RED (audit A-0, FB-3): the tree's mini plan ends no hunt on no_fight; a planted cell that did is a tool red and fails the run, a
     death or an outgrown end is not; and the ENGINE MUTANT (the no-fight clock never moves on a blow, so every hunt stands as FB-1's stalled
     fours stood) plays a cell that ends no_fight, which the matrix reads red. Each seed keeps its ends in order (falls: S-14 reads them) */
  {
    const t0r = toolReds(base.cells);
    check('the tree plays no tool red (' + t0r.length + ' of ' + base.cells.length + ' cells ended ' + TOOL_RED_ENDS.join(' or ') + ') and every cell keeps each seed\'s ends',
      t0r.length === 0 && base.cells.every((c) => Array.isArray(c.m.falls) && c.m.falls.length === c.seeds), JSON.stringify(t0r).slice(0, 200));
    const planted = [{ key: 'a', m: { ended: { died: 2, outgrown: 1 } } }, { key: 'b', m: { ended: { no_fight: 1, died: 1 } } }, { key: 'c', error: 'x' }, { key: 'd', error: 'Error: tally: kill at 1 credits unit null, who is not a hero of this hunt' }];
    const tr = toolReds(planted), lines = [];
    check('a planted cell that ended no_fight, or an error naming a kill credited to no hero, is a tool red and the run exits 1; a death, an outgrown end or another error is not one (' + tr.map((x) => x.key).join() + ')',
      tr.length === 2 && tr[0].key === 'b' && tr[1].key === 'd' && printToolReds(planted, (s) => lines.push(s)) === 1 && lines.length >= 2 && printToolReds([planted[0], planted[2]], () => {}) === 0);
    const NOFIGHT = { id: 'selftest-nofight', levels: [], seeds: 1, hours: 0.25, blocks: [{ id: 'a', levels: [30], comps: [lone('hammer')], gears: ['mid'], tiers: ['normal'] }] };
    const stall = { edits: [{ file: 'src/core/hunt/damage.js', from: "  if (isMonster(target)) inst.world.fightAt = sc.atMs;", to: "  if (false) inst.world.fightAt = sc.atMs; /* MUTANT: the no-fight clock never moves */" }] };
    let mut = null, why = '';
    try { const s = await plantScratch(stall); try { mut = await playRun(D, K, NOFIGHT, s.root, o); } finally { s.done(); } } catch (e) { why = e.message; }
    const mr = mut ? toolReds(mut.cells) : [], fall = mut && mut.cells[0] && mut.cells[0].m ? mut.cells[0].m.falls[0] : null;
    check('MUTANT the engine stalls (the no-fight clock never moves on a blow): its cell ends no_fight at the span, kept in its falls, and the matrix reads a tool red ('
      + (mr.map((x) => x.why).join('; ') || why || 'no tool red') + ')', mr.length === 1 && printToolReds(mut.cells, () => {}) === 1 && !!fall && fall[0] && fall[0][2] === 'no_fight' && fall[0][1] < 0.25,
      JSON.stringify(fall));
  }
  /* 3b. chapter 14's full-game block: the run names its patch and puts the sample's spells on the bars; the block reads against the death sample */
  {
    const fr = RUNS['deaths-full'], P = JSON.parse(readFileSync(join(HERE, fr.patch), 'utf8'));
    const g = (tier, deaths) => ({ m: { deaths, sample: { heroHours: 1000 } }, block: 'grounds', party: 4, tier });
    const cb = compareBlocks([{ way: 'hammer', band: 'S6.deadly.mid', at: 'a', status: 'ok' }, { way: 'hammer', band: 'S4.mid', at: 'b', status: 'report' }],
      [{ way: 'hammer', band: 'S6.deadly.mid', at: 'a', status: 'RED' }, { way: 'hammer', band: 'S4.mid', at: 'b', status: 'report' }], [g('deadly', 40)], [g('deadly', 60)]);
    check('the full-game block plays its patch (' + P.edits.length + ' edits) with the sample\'s spells on the bars, and reads against the death sample (' + JSON.stringify(cb) + ')',
      fr.ch14 && P.edits.length >= 3 && cb.moved['S6.deadly.mid'] && cb.moved['S6.deadly.mid'][0] === 'ok->RED' && !cb.moved['S4.mid'] && cb.pools.deadly[0] === 40 && cb.pools.deadly[1] === 60
      && MP_ch14Slots(['hammer', 'bow', 'mage', 'healer'], [{}, {}, { magic: 45 }, {}]).mage.slots.length === 2 && !MP_ch14Slots(['hammer', 'bow', 'mage', 'healer'], [{}, {}, { magic: 20 }, {}]).mage);
  }
  const rowsB = judgeMatrix(D, K, base.cells);
  const same = await play({ knobs: { playerAttack: 1 } });
  const d0 = diffMatrices({ rows: rowsB, cells: base.cells }, { rows: judgeMatrix(same.res.V, K, same.res.cells), cells: same.res.cells }, { targets: [] });
  const moved0 = d0.cells.flatMap((c) => Object.entries(c.metrics).filter(([, [a, b]]) => a !== b).map(([id]) => c.key + ' ' + id));
  check('an empty patch on the copy: every metric identical, no band moved', moved0.length === 0 && d0.bands.length === 0, moved0.slice(0, 3).join('; ') + ' ' + d0.bands.length + ' bands');
  /* 4. a known effect: the heroes hit half again as hard */
  const atk = await play({ knobs: { playerAttack: 1.5 } });
  const d1 = diffMatrices({ rows: rowsB, cells: base.cells }, { rows: judgeMatrix(atk.res.V, K, atk.res.cells), cells: atk.res.cells }, { targets: [] });
  /* a kill comes a third sooner; the DPS of a hunted hour rises less where the spawns, not the blows, set the pace (a four kills what is there) */
  const weak = d1.cells.filter((c) => !(c.metrics.ttkS && c.metrics.ttkS[2] < -0.15 && c.metrics.dps && c.metrics.dps[2] > 0.05));
  check('playerAttack x1.5: seconds to kill down over 15% and DPS up in every cell', weak.length === 0, weak.map((c) => c.key + ' ttk ' + JSON.stringify(c.metrics.ttkS) + ' dps ' + JSON.stringify(c.metrics.dps)).join('; '));
  check('playerAttack x1.5 targets no band: every band it moves is UNTARGETED', d1.bands.every((b) => b.flag === 'UNTARGETED') && d1.counts.UNTARGETED === d1.bands.length);
  /* 5. a known effect through the formula: the monsters hit 60% harder (the rows re-written) */
  const mon = await play({ knobs: { monsterDamage: 1.6 } });
  check('monsterDamage x1.6 re-writes the monster rows from the formula, and they check green', !!mon.regen && /green/.test(mon.regen.check), JSON.stringify(mon.regen));
  const d2 = diffMatrices({ rows: rowsB, cells: base.cells }, { rows: judgeMatrix(mon.res.V, K, mon.res.cells), cells: mon.res.cells }, { targets: ['survival'] });
  /* under the real death rule a cell whose hero now dies at once hunts no time, so its rate is the death's, not a damage rate: such cells must
     have died, and every cell that still hunts takes over 20% more */
  const MC = new Map(mon.res.cells.map((c) => [c.key, c]));
  const huntsOn = (c) => (MC.get(c.key) && MC.get(c.key).m && MC.get(c.key).m.huntedShare >= 0.5);
  const soft = d2.cells.filter((c) => huntsOn(c) && c.metrics.takenPerH && c.metrics.takenPerH[0] > 0 && !(c.metrics.takenPerH[2] > 0.2));
  const stopped = d2.cells.filter((c) => !huntsOn(c) && c.metrics.takenPerH && c.metrics.takenPerH[0] > 0), stoppedDied = stopped.every((c) => MC.get(c.key).m.deaths > 0);
  check('monsterDamage x1.6: damage taken up over 20% in every cell that still hunts, and every cell it stops died (' + stopped.length + ')', soft.length === 0 && stoppedDied, soft.map((c) => c.key + ' ' + JSON.stringify(c.metrics.takenPerH)).join('; '));
  check('monsterDamage x1.6 targeting survival: a survival band it moves is INTO or OUT, never UNTARGETED', d2.bands.filter((b) => b.group === 'survival').every((b) => b.flag !== 'UNTARGETED'));
  /* 6. the flag rules on planted rows (and their mutant: a tolerance past every move flags nothing) */
  const row = (band, at, value, status, dist) => ({ way: 'hammer', band, group: STD.bandById(band).group, at, value, status, dist });
  const B = { rows: [row('S1.mid', 'a', 0.5, 'off', 0.17), row('P2', 'a', 1.3, 'RED', 0.18), row('G-2.normal', 'a', 0.1, 'ok', 0), row('S2.mid', 'a', 0, 'ok', 0)], cells: [] };
  const A = { rows: [row('S1.mid', 'a', 0.7, 'ok', 0), row('P2', 'a', 1.4, 'RED', 0.27), row('G-2.normal', 'a', 0.3, 'RED', 1), row('S2.mid', 'a', 0, 'ok', 0)], cells: [] };
  const f = diffMatrices(B, A, { targets: ['S1', 'P2'] });
  const flag = (b) => (f.bands.find((x) => x.band === b) || {}).flag;
  check('flags: a targeted band into its range INTO, a targeted band further out OUT, an untargeted move UNTARGETED, a still one nothing',
    flag('S1.mid') === 'INTO' && flag('P2') === 'OUT' && flag('G-2.normal') === 'UNTARGETED' && flag('S2.mid') === undefined, JSON.stringify(f.bands));
  check('the flags bite: a tolerance past every move flags nothing but the status changes', diffMatrices(B, A, { targets: [] }, { tol: 10 }).bands.map((b) => b.band).sort().join() === 'G-2.normal,S1.mid');
  /* 7. the time under 30% HP agrees with the fights: a seat whose worst tenth of fights dips under 30% spent time there */
  const all = [...base.cells, ...mon.res.cells].filter((c) => c.m);
  /* a cell that hunted (a hero dead in its first seconds records a dip and no time) */
  const dipped = all.filter((c) => finite(c.m.lowHpP10) && c.m.lowHpP10 < 0.3 && c.m.huntedShare >= 0.5);
  check('every cell whose fights dip under 30% HP records time under 30% (' + dipped.length + ' such cells)', dipped.length > 0 && dipped.every((c) => c.m.hpUnder30 > 0), dipped.filter((c) => !(c.m.hpUnder30 > 0)).map((c) => c.key).join('; ') || 'no cell dipped');
  check('the seat damage shares of a four add to 1', base.cells.filter((c) => c.party === 4).every((c) => Math.abs(c.m.seatsM.reduce((a, s) => a + (s.takenShare || 0), 0) - 1) < 0.01));
  /* 8. THE GROUND AXIS IS JUDGED (the Coordinator 2026-11-21: four ground diffs read INTO 0, OUT 0, UNTARGETED 0): a ground patch,
     the Slake's group spell at five times its dose (found on its row as written), flags that ground's survival bands as the patch targets them */
  const GROUNDS = { id: 'selftest-grounds', levels: [], seeds: 1, hours: 0.25, blocks: [{ id: 'grounds', grounds: true, quick: true, only: ['the_slake'] }] };
  const packFile = 'src/data/grounds/the_slake/pack.js';
  const spell = readFileSync(join(ROOT, packFile), 'utf8').match(/cold_bilge:[^\n]*hitPm: (\d+)/);
  if (!spell) check('the ground axis is judged', false, 'no Cold Bilge hitPm on ' + packFile);
  else {
    const gb = await playRun(D, K, GROUNDS, ROOT, o);
    const gs = await plantScratch({ edits: [{ file: packFile, from: spell[0], to: spell[0].replace('hitPm: ' + spell[1], 'hitPm: ' + Number(spell[1]) * 5) }] });
    let ga;
    try { ga = await playRun(D, K, GROUNDS, gs.root, o); } finally { gs.done(); }
    const rowsG = judgeMatrix(D, K, gb.cells).filter((r) => r.way === 'G:the_slake');
    check('the ground axis carries band rows (' + rowsG.length + ' on the Slake\'s ' + gb.cells.length + ' cells: ' + [...new Set(rowsG.map((r) => r.group))].join(', ') + ')', rowsG.length > 0 && ['pace', 'survival', 'gold'].every((g) => rowsG.some((r) => r.group === g)));
    /* since 12-balance-pass.md section 5 (rows 1 to 3) the harder tiers' health bands report only and the tier bands read the four only, so the
       patch names every group the ground axis grades (the cell-level groups): the Slake's own rows must flag, none of them untargeted */
    const gd = diffMatrices({ rows: judgeMatrix(D, K, gb.cells), cells: gb.cells }, { rows: judgeMatrix(ga.V, K, ga.cells), cells: ga.cells }, { targets: ['survival', 'pace', 'gold'] });
    const flagged = gd.bands.filter((b) => b.way === 'G:the_slake' && b.flag !== 'UNTARGETED');
    check('a ground patch (the Slake\'s Cold Bilge x5) flags the Slake\'s own bands INTO or OUT (' + flagged.length + ': ' + [...new Set(flagged.map((b) => b.band))].join(', ') + ')', flagged.length > 0, JSON.stringify(gd.counts));
    /* 12-balance-pass.md section 5 row 6: P2 reads one row a ground, the mean of its two ends */
    const p2g = judgeMatrix(D, K, gb.cells).filter((r) => r.way === 'G:the_slake' && r.band === 'P2');
    check('P2 on the ground axis is one row a ground, the mean of its two ends (' + p2g.length + ': ' + (p2g[0] ? p2g[0].at : '-') + ')', p2g.length === 1 && /^the mean of /.test(p2g[0].at));
  }
  /* 8b. 12-balance-pass.md section 5 row 6: P2 grades the hammer only; every other way prints it, status report, with the status it would have */
  {
    const rowsMini = judgeMatrix(D, K, base.cells);
    const p2 = rowsMini.filter((r) => r.band === 'P2');
    check('P2 grades the hammer and reports on every other way (' + p2.filter((r) => r.way === 'hammer' && r.status !== 'report').length + ' graded on the hammer, ' + p2.filter((r) => r.way !== 'hammer' && r.status === 'report' && r.wouldBe).length + ' reported elsewhere)',
      p2.some((r) => r.way === 'hammer' && r.status !== 'report') && p2.filter((r) => r.way !== 'hammer').length > 0 && p2.filter((r) => r.way !== 'hammer').every((r) => r.status === 'report' && r.wouldBe));
    /* MM-26's check G (report only, waits on Tyler): a buffed four that holds a tier its plain four cannot is one report row, would be RED */
    const m0 = { deathsPer1000h: 0, lowHpTypical: 0.5, netPerH: 1, sample: { heroHours: 64 } }, cell = (block, variant, low) => ({ L: 60, gear: 'mid', party: 4, comp: 'x', tier: 'deadly', block, variant, m: { ...m0, lowHpTypical: low } });
    const g = checkGRows([cell('four', undefined, 0.01), cell('buff', 'buff:damage10', 0.5)]);
    const g0 = checkGRows([cell('four', undefined, 0.5), cell('buff', 'buff:damage10', 0.5)]);
    check('check G reads a buffed four that holds where the plain one does not, report only (' + (g[0] ? g[0].status + ', would be ' + g[0].wouldBe : 'no row') + '), and is silent when both hold',
      g.length === 1 && g[0].status === 'report' && g[0].wouldBe === 'RED' && g0.length === 1 && g0[0].wouldBe === 'ok');
  }
  /* 9. THE MEASURING TOOL (the critical review's step 1, F-framework-audit sections 3 and 5): each fix and each new mechanic, with a play that
     fails without it */
  {
    const P = await import('./proposals.mjs');
    const SH = await import('../balance-sim/played.mjs');
    const TAL = await import('./talents.mjs');
    const PG = await import('./progression-grid.mjs');
    const lethal = buildCell(D, K, { L: 20, gear: 'low', styles: ['hammer'], tier: 'deadly', ground: D.groundAt(20, 1) }).cell;
    const pairGround = D.groundAt(60, 2), pair = { ground: pairGround, party: ['bow', 'hammer'], level: [60, 5], profile: 'played', supply: 'store', deathRule: 'real', options: { tier: 'deadly' }, hours: 0.5, seeds: 1 };
    const g60 = D.groundAt(60, 1), ham = buildCell(D, K, { L: 60, gear: 'mid', styles: ['hammer'], tier: 'normal', ground: g60 }).cell, mage = buildCell(D, K, { L: 60, gear: 'mid', styles: ['mage'], tier: 'normal', ground: g60 }).cell;
    const jobs = [
      ['real', { ...lethal, hours: 1 }], ['reenter', { ...lethal, deathRule: 'reenter', hours: 1 }],
      ['apart', pair], ['together', { ...pair, endTogether: true }], ['blessed', { ...pair, blessings: 3 }],
      ['plain', { ...ham, hours: 1.5 }], ['buffKept', { ...ham, buffs: [{ type: 'damage', magnitude: 10 }], hours: 1.5 }], ['buffHour', { ...ham, buffs: [{ type: 'damage', magnitude: 10, hours: 1 }], hours: 1.5 }],
      ['stamina', { ...ham, staminaH: 0.1, hours: 0.25 }], ['purseFull', { ...mage, hours: 0.25 }], ['purseDry', { ...mage, purse: 0, goldFloor: 100000, hours: 0.25 }],
    ].map(([id, cell]) => ({ id, cell: { ...cell, id: 'SELF:' + id, seeds: 1 } }));
    const { results: X, errors } = await playJobs(jobs, ROOT, workersOf());
    check('the tool\'s plays run (' + jobs.length + ')', !errors.length, errors.map((e) => e.id + ' ' + e.error).join('; '));
    const h = (id, i = 0) => (X[id] ? X[id].heroes[i] : {});
    /* 9a. the death rule: a death ends the hunt and the hero stays home (the audit's probe: 59 deaths in an hour under the old rule) */
    check('the death rule: the audit\'s lethal cell dies once and stays home (' + h('real').deaths + ' death, hunted ' + h('real').hours + ' of ' + h('real').wallHours + ' h), where re-entry died ' + h('reenter').deaths + ' times',
      h('real').deaths === 1 && h('real').wallHours === 1 && h('real').lostHours > 0.9 && h('reenter').deaths > 5);
    /* 9b. the booked time: a hunt that ended in its first seconds books those seconds, never a minute (cell.mjs:408 before) */
    check('the booked time: the party books what it hunted (' + X.reenter.party.hours + ' h for ' + h('reenter').hours + ' hunted, ' + X.reenter.party.segments + ' hunts)', Math.abs(X.reenter.party.hours - h('reenter').hours) < 0.02 && Math.abs(X.real.party.hours - h('real').hours) < 0.02);
    /* 9c. ruling 27-1 as amended: own heroes hunt on past a death unless the cell sets endTogether */
    check('a death in a party: the rest hunt on (bow ' + h('apart', 0).hours + ' h after the hammer\'s ' + h('apart', 1).hours + ' h) unless they end together (bow ' + h('together', 0).hours + ' h, ' + Object.keys(h('together', 0).ended || {}).join(',') + ')',
      h('apart', 0).hours > h('apart', 1).hours + 0.05 && (h('together', 0).ended || {}).party_member_died >= 1 && h('together', 0).hours <= h('together', 1).hours + 0.01);
    /* 9d. Blessings: three cut a death's Level XP loss by 75%, and are bought again (the gold of src/data/blessings.js) */
    const bw = h('blessed', 0), bl = await import(pathToFileURL(join(ROOT, 'src/data/blessings.js')).href);
    check('Blessings: three cut the loss to a quarter (' + bw.raw.xpLostLevel + ' -> ' + Math.round(bw.raw.xpLostLevelBlessed) + ') and cost ' + bw.raw.blessingGold + ' gold again',
      bw.deaths >= 1 && Math.abs(bw.raw.xpLostLevelBlessed - 0.25 * bw.raw.xpLostLevel) < 1 && bw.raw.blessingGold === bw.deaths * [1, 2, 3].reduce((a, t) => a + bl.blessingPrice(t, 60), 0));
    /* 9e. one timed buff in a cell, kept up all hunt (a row an hour), against an hour of it and against none */
    check('a timed buff: +10% damage kept up deals more than an hour of it, which deals more than none (' + [X.plain, X.buffHour, X.buffKept].map((r) => r.heroes[0].dps).join(' < ') + ')',
      h('buffKept').dps > h('buffHour').dps && h('buffHour').dps > h('plain').dps);
    /* 9f. a stamina bar and a purse that bind */
    check('a stamina bar that binds ends the hunt at 0.1 h (' + h('stamina').hours + ' h, ' + Object.keys(h('stamina').ended || {}).join(',') + ')', Math.abs(h('stamina').hours - 0.1) < 0.01 && (h('stamina').ended || {}).stamina === 1);
    check('a purse that binds: under its floor the mage buys nothing and fights slower (store ' + h('purseDry').storePerH + ', DPS ' + h('purseDry').dps + ' against ' + h('purseFull').dps + ')', h('purseDry').storePerH === 0 && h('purseDry').dps < h('purseFull').dps);
    /* 9g. the store bill: casters shop as the real four did (11-krell section 4): one tier under what Magic allows, the healer's heals on Chalked */
    check('the shopping rule: a mage at Magic 64 casts on Carved, a healer heals on Chalked water and its sickness on Carved; a BiS hero casts on Graven; MID cells shop real',
      SH.shoppingTier('mage', 'fire', 64, 'real') === 'carved' && SH.shoppingTier('healer', 'water', 64, 'real') === 'chalked' && SH.shoppingTier('healer', 'poison', 64, 'real') === 'carved'
      && SH.shoppingTier('mage', 'fire', 64, 'allowed') === 'graven' && ham.shopping === 'real' && buildCell(D, K, { L: 60, gear: 'bis', styles: ['mage'], tier: 'normal', ground: g60 }).cell.shopping === 'allowed');
    /* 9h. the seats: the matrix's four sits as the real Krell four sat, and the simulator check plays it */
    const cal = await calibrationJobs(D, K, ROOT, { seeds: 1, hours: 0.25 });
    check('the four sits as the real four (' + PG.compsOf(4)[0][0].join(', ') + '), and the simulator check\'s four is it', PG.compsOf(4)[0][0].join() === 'hammer,bow,mage,healer' && cal.cols.find((x) => x.col === 'harness').styles.join() === 'hammer,bow,mage,healer');
    /* 9i. GR-67: the six dropped party-size bands are never judged or printed */
    /* the quick grid UNPACKED (progression-grid.mjs readGrid): the packed file judges no cell band at all, so a dropped cell band could never leak */
    const gq = PG.readGrid(true), DER = await import('./grid-derive.mjs');
    const jq = DER.judgeGrid(D, gq, { K }), printed = [];
    DER.printReport(gq, jq, (s) => printed.push(s));
    const leaked = STD.DROPPED.filter((id) => jq.rows.some((r) => r.band === id) || printed.some((l) => l.startsWith('  ' + id + ' ')));
    check('the dropped bands (' + STD.DROPPED.join(', ') + ') are never judged or printed', STD.DROPPED.length === 6 && !leaked.length, leaked.join(', '));
    /* 9j. Talents: the plan rule and the curve as chapter 10 prints them, and the hook bites on the scratch copy only */
    const t110 = TAL.talentsOf('bow', 110), tk = TAL.talentsOf('tank', 110);
    check('Talents: a damage hero at 110 holds 13 / 0 / 5 / 4 and Force pays 5.7%; a shield tank 4 / 9 / 9 / 0; the axes\' Linger points play nothing',
      [t110.ranks.force, t110.ranks.footing, t110.ranks.grit, t110.ranks.reserve].join() === '13,0,5,4' && Math.abs(t110.pm.force - 56.5) < 0.1 && [tk.ranks.force, tk.ranks.footing, tk.ranks.grit, tk.ranks.reserve].join() === '4,9,9,0'
      && TAL.talentsOf('axes', 110).unplayed.includes('linger') && !('linger' in TAL.talentsOf('axes', 110).pm));
    const tal = await plantScratch(P.composePatch(ROOT, ['TAL']));
    let hooked, inert;
    try {
      const two = (root, tag) => playJobs(['S', 'C'].map((b) => ({ id: tag + b, cell: { ...buildCell(D, K, { L: 110, gear: 'mid', styles: ['hammer'], tier: 'normal', ground: D.groundAt(110, 1), build: b }).cell, id: 'SELF:' + tag + b, hours: 0.5, seeds: 1 } })), root, 2);
      hooked = (await two(tal.root, 'hook')).results; inert = (await two(ROOT, 'tree')).results;
    } finally { tal.done(); }
    check('Talents bite through the hook (suggested over empty: ' + (hooked.hookS.heroes[0].dps / hooked.hookC.heroes[0].dps).toFixed(3) + ') and are inert on a tree without it (' + (inert.treeS.heroes[0].dps / inert.treeC.heroes[0].dps).toFixed(3) + ')',
      hooked.hookS.heroes[0].dps > hooked.hookC.heroes[0].dps && inert.treeS.heroes[0].dps === inert.treeC.heroes[0].dps);
    /* 9k. the build-track hook: a track's picks up to the Level, summed; a pick on an effect no engine lever pays is refused by name */
    let refusedTrack = false;
    try { PG.trackBuffs({ id: 'x', picks: [{ at: 5, effects: { luck: 5 } }] }, 10); } catch { refusedTrack = true; }
    check('the build-track hook: picks up to the Level summed, an unknown effect refused', JSON.stringify(PG.trackBuffs({ id: 'x', picks: [{ at: 5, effects: { damage: 2 } }, { at: 10, effects: { damage: 3 } }, { at: 15, effects: { damage: 9 } }] }, 12)) === JSON.stringify([{ type: 'damage', magnitude: 5 }]) && refusedTrack);
    /* 9l. THE SITTING (review/01-sitting.md, RULED 2026-11-21). S-5: the Blessing ladder in every cell; S-10: party XP by size alone; S-4: a Level
       XP row drops into the seam; S-6: the four is played both ways (the leave block) */
    check('S-5: three Blessings, then each ladder Level halves what a blessed death takes (L50 ' + PG.blessedShareAt(50) + ', L100 ' + PG.blessedShareAt(100) + ', L400 ' + PG.blessedShareAt(400) + '), and every cell carries it',
      PG.blessedShareAt(50) === 0.25 && PG.blessedShareAt(100) === 0.125 && PG.blessedShareAt(400) === 0.015625 && buildCell(D, K, { L: 185, gear: 'mid', styles: ['hammer'], tier: 'normal', ground: D.groundAt(185, 1) }).cell.blessedShare === 0.0625);
    const ladderJob = await playJobs([{ id: 'ladder', cell: { ...pair, blessings: 3, blessedShare: 0.125, id: 'SELF:ladder', seeds: 1 } }], ROOT, 1);
    const lw = ladderJob.results.ladder.heroes[0];
    check('S-5: a cell plays the ladder\'s share (' + lw.raw.xpLostLevel + ' -> ' + Math.round(lw.raw.xpLostLevelBlessed) + ')', lw.deaths >= 1 && Math.abs(lw.raw.xpLostLevelBlessed - 0.125 * lw.raw.xpLostLevel) < 1);
    const size = await plantScratch(P.composePatch(ROOT, ['S-10'])), lvx = await plantScratch(P.composePatch(ROOT, ['S-4']));
    try {
      const pcx = async (root) => (await import(pathToFileURL(join(root, 'src/data/party-class-xp.js')).href)).partyClassXp;
      const [onTree, onSize] = [await pcx(ROOT), await pcx(size.root)];
      const four = ['mage', 'mage', 'mage', 'mage'], mixed = ['melee_dps', 'ranger', 'mage', 'healer'];
      check('S-10: by size alone a one-class four reads the mixed four\'s cell (' + onSize(four).permille + ' = ' + onSize(mixed).permille + '; the tree ' + onTree(four).permille + ')', onSize(four).permille === onSize(mixed).permille && onTree(four).permille < onTree(mixed).permille);
      const xpCell = { ...ham, buffs: [{ type: 'level_xp', magnitude: 10 }], hours: 0.5, seeds: 1 };
      const lx = (await playJobs([{ id: 'hook', cell: { ...xpCell, id: 'SELF:lx-hook' } }, { id: 'plain', cell: { ...ham, hours: 0.5, seeds: 1, id: 'SELF:lx-plain' } }], lvx.root, 2)).results;
      const lt = (await playJobs([{ id: 'tree', cell: { ...xpCell, id: 'SELF:lx-tree' } }], ROOT, 1)).results;
      const ratioX = lx.hook.heroes[0].levelXpPerH / lx.plain.heroes[0].levelXpPerH;
      check('S-4: a Level XP row of 10% pays about 10% more Level XP through the seam (' + ratioX.toFixed(3) + ') and nothing on a tree without it', ratioX > 1.08 && ratioX < 1.12 && Math.abs(lt.tree.heroes[0].levelXpPerH - lx.plain.heroes[0].levelXpPerH) < 1);
    } finally { size.done(); lvx.done(); }
    /* 9m. A DEATH IS PRICED BY THE GAME (the Lab's death-cost slot, CONFLICTS 2026-11-21; lane/bl-baseline): a data view whose
       src/core/action-rules.js doubles a death's loss moves every reader (a cell's deathXp, the grid judge's S10 row); a view without the
       tree's rules is refused, never priced by standards.mjs's typed 6% */
    {
      const D2 = { ...D, AR: { ...D.AR, levelDeathLoss: (x) => 2 * D.AR.levelDeathLoss(x) } };
      const meta = { key: 'SELF:death', L: 60, gear: 'mid', party: 1, comp: 'h', styles: ['hammer'], tier: 'normal', ground: g60 };
      const s0 = [slimSeed(X.plain)];
      const m0 = cellMetrics(D, meta, s0), m2 = cellMetrics(D2, meta, s0);
      const s10 = (DD) => DER.judgeGrid(DD, gq, { K }).rows.filter((r) => r.band === 'S10' && Number.isFinite(r.value));
      const r0 = s10(D), r2 = s10(D2);
      let refused = false;
      try { cellMetrics({ ...D, AR: undefined }, meta, s0); } catch { refused = true; }
      check('a death is priced by the game: the tree\'s levelDeathLoss at 60 (' + m0.deathXp + ') is the cell\'s deathXp, a planted rule that doubles it doubles it (' + m2.deathXp + ') and moves the S10 rows ('
        + r0.length + '), and a view without action-rules.js is refused',
        m0.deathXp === D.AR.levelDeathLoss(D.XP.charXpForLevel(60)) && Math.abs(m2.deathXp - 2 * m0.deathXp) <= 1 && r0.length > 0 && r0.length === r2.length && r0.every((r, i) => r.value !== r2[i].value) && refused
        && m0.deathBlessedShare === 1 - D.BL.BLESSING_CUT_PERMILLE[2] / 1000);
    }
    const leave = planMatrix(D, K, RUNS.subset, { blocks: ['leave'] });
    check('S-6: the four on the harder tiers is played with every hero coming home (' + leave.cells.length + ' leave cells, all endTogether)', leave.cells.length > 0 && leave.jobs.every((j) => j.cell.endTogether === true));
  }
  console.log('balance-matrix selftest: ' + (fails.length ? fails.length + ' FAILED' : 'green') + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
export { cellKey, WAYS, levelBand, wayOf, styleGroupOf, patchEdits };
