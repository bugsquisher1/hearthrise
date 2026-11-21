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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isMain } from '../../tests/_is-main.mjs';
import * as STD from './standards.mjs';
import { loadGridData, inputHash, compsOf, cellKey } from './progression-grid.mjs';
import { loadKits } from './grid-kit.mjs';
import { RUNS, planMatrix, archetypeTable, WAYS, HIGH_LEVELS } from './matrix-plan.mjs';
import { METRICS, cellMetrics, slimSeed, deriveMatrix, judgeMatrix, diffMatrices, axisSummary, levelBand, wayOf, styleGroupOf, FLAG_WORDS } from './matrix-metrics.mjs';
import { plantScratch, knobTable, checkPatch, patchEdits, scaled, readKnobs, locateKnob, PATCH_SCHEMA, KnobGone } from './matrix-scratch.mjs';
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
  const [XP, BS, MON, SB, TI, BL, LB] = await Promise.all(['src/core/xp.js', 'src/data/balance-sheet.js', 'src/data/monsters.js', 'src/data/supply-basics.js', 'src/data/hunt-tiers.js', 'src/data/blessings.js', 'src/data/loot-bands.js'].map(imp));
  return { ...D, XP, BS, MONSTERS: MON.MONSTERS, SB, TI, BL, REVEAL_BANDS: LB.REVEAL_BANDS,
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
  const plan = planMatrix(V, K, run, { only: o.only, blocks: o.blocks, seeds: o.seeds, hours: o.hours, quick: o.quick, plan: o.plan });
  const cal = o.calibrate === false ? { jobs: [], cols: [], samples: [] } : await calibrationJobs(V, K, ROOT, { seeds: o.seeds || run.seeds, hours: o.hours || run.hours });
  const jobs = [...plan.jobs, ...cal.jobs];
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
    return { ...c, m: cellMetrics(V, c, seeds, arch) };
  });
  const calibration = cal.cols.length ? calibrationTable(byKey, cal.cols, cal.samples) : null;
  return { run: run.id, seeds: o.seeds || run.seeds, hours: o.hours || run.hours, cells, calibration, V,
    runtime: { cells: plan.cells.length, jobs: jobs.length, workers: o.workers || workersOf(), wallS: Math.round((Date.now() - t0) / 1000), playS: Math.round(wallMs / 1000), workerS: Math.round(workerMs / 1000), errors: errors.length },
    errors: errors.slice(0, 20) };
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
export function printRun(res, rows, out = console.log) {
  const ok = res.cells.filter((c) => c.m), bad = res.cells.filter((c) => c.error);
  out('BALANCE MATRIX ' + res.run + ': ' + ok.length + ' cells (' + bad.length + ' errors), ' + res.seeds + ' seed(s) x ' + res.hours + ' h, ' + res.runtime.wallS + ' s wall, ' + res.runtime.workerS + ' worker-s on ' + res.runtime.workers + ' workers');
  for (const c of bad.slice(0, 5)) out('  ERROR ' + c.key + ': ' + c.error);
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
  /* THE DEATH RULE (cell.mjs header): the share of the time offered that was hunted, and XP after deaths over that time, where it is under 1 */
  const short = ok.filter((c) => !c.variant && Number.isFinite(c.m.huntedShare) && c.m.huntedShare < 0.999 && c.block !== 'grounds');
  out('\nTHE DEATH RULE (a death ends that hero\'s hunt; the rest hunt on): ' + short.length + ' of ' + ok.filter((c) => !c.variant).length + ' cells lost hunting time'
    + (short.length ? '; the worst: ' + [...short].sort((a, b) => a.m.huntedShare - b.m.huntedShare).slice(0, 8).map((c) => c.key + ' hunted ' + pct(c.m.huntedShare).replace('+', '') + ', XP after deaths ' + fmt(c.m.netLevelXpPerH)).join('; ') : ''));
  out('\nVARIANTS against the plain cell (matrix-plan.mjs: one timed buff, a bar and a purse that bind, build tracks): DPS | kills | Level XP | XP after deaths | net gold | hunted');
  for (const v of D.variants) out('  ' + (v.L + ' ' + v.gear + ' x' + v.party + ' ' + v.tier + ' ' + v.variant).padEnd(40) + [fmt(v.dps, 3), fmt(v.killsPerH, 3), fmt(v.levelXpPerH, 3), fmt(v.netLevelXpPerH, 3), fmt(v.netPerH, 3), fmt(v.huntedShare[1], 3)].map((s) => s.padStart(8)).join(' '));
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
  const ids = (spec === 'proposed' ? reg.recommended : spec.split(',')).filter((id) => !(without || []).includes(id));
  return { name: spec === 'proposed' ? 'proposed' + ((without || []).length ? '-without-' + without.join('+') : '') : 'set-' + ids.join('+'), ids, patch: P.composePatch(ROOT, ids, { reg }) };
}
/** Two patches as one (the base, then the change): edits in order, knobs multiplied, plan steps merged, targets of the change. */
export function combinePatches(a, b) {
  if (!a) return b;
  if (!b) return a;
  const knobs = { ...(a.knobs || {}) };
  for (const [k, m] of Object.entries(b.knobs || {})) knobs[k] = (knobs[k] || 1) * m;
  return { ...b, name: (a.name || 'base') + ' + ' + (b.name || 'patch'), knobs, edits: [...(a.edits || []), ...(b.edits || [])], plan: { ...(a.plan || {}), ...(b.plan || {}) }, targets: b.targets || [] };
}
const optsOf = () => ({ only: arg('only') ? arg('only').split(',').map(Number) : null, blocks: arg('blocks') ? arg('blocks').split(',') : null,
  seeds: arg('seeds') ? Number(arg('seeds')) : null, hours: arg('hours') ? Number(arg('hours')) : null, workers: workersOf(), say: (s) => console.error(s),
  baseSpec: arg('base', 'today'), without: arg('without') ? arg('without').split(',') : [] });

/** Play a run on a base (the tree, or a proposal set planted on a scratch copy). */
export async function playOnBase(D, K, run, base, o) {
  if (!base) return playRun(D, K, run, ROOT, o);
  const s = await plantScratch(base.patch);
  try { return { ...(await playRun(D, K, run, s.root, { ...o, plan: base.patch.plan })), applied: s.applied }; } finally { s.done(); }
}
export const baseHash = (base) => (base ? createHash('sha256').update(matrixHash() + JSON.stringify(base.patch) + [...new Set(base.patch.edits.map((e) => e.file))].map((f) => existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : '').join('\0')).digest('hex').slice(0, 16) : matrixHash());
export const cacheFileOf = (run, base) => (run.id === 'subset' ? (base ? join(HERE, 'balance-matrix-' + base.name + '.json') : SUBSET_FILE) : MATRIX_FILE);

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
  const run = has('subset') ? RUNS.subset : RUNS.full;
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
    if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ patch, applied: r.applied, regen: r.regen, gate, counts: r.d.counts, bands: r.d.bands, cells: r.d.cells, calibration: { before: r.before.calibration, after: r.after.calibration } }, null, 1));
    return gate.verdict === 'FAIL' ? 1 : 0;
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
    if (!o.only && !o.blocks) writeCache(run.id === 'subset' ? SUBSET_FILE : MATRIX_FILE, res);
  }
  const rows = judgeMatrix(res.V || D, K, res.cells);
  printRun(res, rows);
  if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ run: res.run, runtime: res.runtime, cells: res.cells.map(keepCell), derived: deriveMatrix(res.cells), bands: rows, calibration: res.calibration }, null, 1));
  return 0;
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
  const soft = d2.cells.filter((c) => c.metrics.takenPerH && c.metrics.takenPerH[0] > 0 && !(c.metrics.takenPerH[2] > 0.2));
  check('monsterDamage x1.6: damage taken up over 20% in every cell that takes any', soft.length === 0, soft.map((c) => c.key + ' ' + JSON.stringify(c.metrics.takenPerH)).join('; '));
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
  const dipped = all.filter((c) => finite(c.m.lowHpP10) && c.m.lowHpP10 < 0.3);
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
    const gd = diffMatrices({ rows: judgeMatrix(D, K, gb.cells), cells: gb.cells }, { rows: judgeMatrix(ga.V, K, ga.cells), cells: ga.cells }, { targets: ['survival'] });
    const flagged = gd.bands.filter((b) => b.way === 'G:the_slake' && b.group === 'survival' && b.flag !== 'UNTARGETED');
    check('a ground patch (the Slake\'s Cold Bilge x5) flags the Slake\'s survival bands INTO or OUT (' + flagged.length + ')', flagged.length > 0, JSON.stringify(gd.counts));
  }
  console.log('balance-matrix selftest: ' + (fails.length ? fails.length + ' FAILED' : 'green') + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
export { cellKey, WAYS, levelBand, wayOf, styleGroupOf, patchEdits };
