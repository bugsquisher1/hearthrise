#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/baseline.mjs — THE BALANCE BASELINE AND THE GLOBAL REGRESSION (Tyler 2026-11-21: "freeze and measure the current
// game ... every candidate change should be evaluated across the entire representative baseline"; lane/bl-baseline, deliverables 1, 6, 8).
//
// One engine, one harness, two game trees. A measurement plays baseline/scenarios.mjs's cells (the matrix's own planMatrix and buildCell,
// the real engine through the settle) on a game tree with THIS checkout's harness laid over it (baseline/tree.mjs), four seeds a cell, and
// keeps every outcome of baseline/outcomes.mjs one value a seed, so every number carries its own noise.
//
// FROM THIS CHECKOUT (git):
//   node tools/balance-program/baseline.mjs --materialize <ref> --into <dir> [--label L]    the game commit + this harness, in a folder
//   node tools/balance-program/baseline.mjs --report [<results.json.gz>]                      the baseline (default: the committed pin), by category
//   node tools/balance-program/baseline.mjs --compare <candidate.json.gz> [--baseline <f>] [--targets <f> | --no-targets] [--intent a,b]
//                                        [--json f] [--all-views]     the candidate side by side with the baseline, Tyler's eight groups:
//                                                                         each target of BL-3's targets.json (by default) toward or away
//   node tools/balance-program/baseline.mjs --local <ref> [--patch a.json,b.json] [--base proposed] --only 30,60 | --blocks four,ways
//                                                                         the whole loop on this PC for a SMALL slice (refused unsliced:
//                                                                         the full scenario list plays on GitHub, balance-baseline.yml)
// INSIDE A MATERIALIZED FOLDER (node <dir>/tools/balance-program/baseline.mjs ...):
//   --derive-spec --out <spec.json> [--label L]   the scenario spec, read once from the pinned tree
//   --plan --spec <f>                              cells, seed jobs and hours by block (no play)
//   --shard i/n --spec <f> --out <f> [--patch a.json,b.json] [--base <proposals>] [--workers N]   one GitHub job's share
//   --determinism --spec <f> --out <f> [--cells N] the same cells, seed 0, played twice in fresh workers in opposite orders: byte-identical
//   --join <dir> --spec <f> --out <results.json.gz> [--label L] [--run-id N]   the shards as one results file: the manifest, every
//                                                  seed's outcomes, the views, the reader rows, the calibration (Krell, C-2), the determinism check
//   --add-readers <results.json.gz> --join <dir>  a results file joined before reader rows were stored gains them from its run's own shards
//   --selftest                                     the proofs (below)
//
// SELFTEST: the outcome reader on a planted seed; the noise rule and the Poisson rule bite both ways; planted new-game targets read toward,
// away and both as IMPROVEMENT, REGRESSION and TRADEOFF, a move with no target MOVED, one outside the intent UNEXPECTED, a copy WITHIN NOISE; time to the top on a planted flat rate is the
// curve's sum; the spec of this tree holds no staged ground and every planned cell stands on an open one with its Level's hours; a join of
// shards from two scenarios or two trees is refused; one real cell played twice is byte-identical and the comparator sees a planted change;
// the overlay exports the commit's game and lays this checkout's harness over it; BL-3's inventory rows read on reader rows (3b); no job carries the
// S-5 Blessing ladder and a death keeps the tree's share (5b); the committed results stay binary and decompress (10).
//
// Exit: 0 ran · 1 a selftest proof failed, a tool red, a determinism difference or an error cell · 2 harness.
// mutant-anchors: none — the selftest plants answers and docs in memory and plays on this tree or a temporary export; no tracked file is patched
// ci-step: economy-selftests | The balance baseline reads every outcome, its noise rule and target verdicts bite, its scenarios hold open grounds only, and a replay is byte-identical
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/baseline.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { playRun, playJobs, baseOf, combinePatches, printToolReds } from './balance-matrix.mjs';
import { loadGridData } from './progression-grid.mjs';
import { loadKits } from './grid-kit.mjs';
import { METRIC_IDS, toolReds, judgeMatrix } from './matrix-metrics.mjs';
import * as STD from './standards.mjs';
import { plantScratch, checkPatch } from './matrix-scratch.mjs';
import { dataView } from './balance-matrix.mjs';
import { printCalibration } from './matrix-calibration.mjs';
import { readC2 } from './calibrate.mjs';
import { OUTCOME_IDS, seedOutcomes, cellStats, moments } from './baseline/outcomes.mjs';
import { deriveSpec, baselineRun, planHook, scenarioHash, hoursOfCell, strayCell, SPEC_SCHEMA } from './baseline/scenarios.mjs';
import { materialize, manifest, treeRecord, instrumentDiff, TREE_FILE, HARNESS } from './baseline/tree.mjs';
import { RESULT_SCHEMA, TARGET_SCHEMA, hydrate, computeViews, compareDocs, printCompare, printBaseline, judgeMove, judgeRates, noiseTable, loadTargets } from './baseline/compare.mjs';
import { planMatrix } from './matrix-plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
/* the committed pin: its spec and its results (01-baseline.md) */
export const PIN_DIR = join(HERE, 'baseline', 'overhaul-start');
export const PIN_SPEC = join(PIN_DIR, 'spec.json');
export const PIN_RESULTS = join(PIN_DIR, 'results.json.gz');
export const SHARD_SCHEMA = 'hearthrise.balance-baseline-shard/1';
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const say = (s) => console.error(s);

/* ── FILES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function readDoc(file) {
  const buf = readFileSync(file);
  return JSON.parse((file.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8'));
}
export function writeDoc(file, doc) {
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(doc) + '\n';
  writeFileSync(file, file.endsWith('.gz') ? gzipSync(Buffer.from(text, 'utf8'), { level: 9 }) : text);
}
const readSpec = (f) => { const s = JSON.parse(readFileSync(resolve(f || PIN_SPEC), 'utf8')); if (s.schema !== SPEC_SCHEMA) throw new Error('baseline: ' + f + ' is not a ' + SPEC_SCHEMA); return s; };

/* ── A CANDIDATE'S CHANGE ON TOP OF ITS TREE: patch files and a proposal base (balance-matrix.mjs baseOf) ─────────────────────── */
async function changeOf(patchList, baseSpec) {
  const base = baseSpec && baseSpec !== 'today' ? await baseOf(baseSpec, []) : null;
  let patch = base ? base.patch : null;
  for (const f of patchList) {
    const p = [resolve(f), join(HERE, 'patches', f), join(ROOT, f)].find((x) => existsSync(x));
    if (!p) throw new Error('baseline: no patch file ' + f);
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    checkPatch(doc);
    patch = combinePatches(patch, doc);
  }
  return { patch, names: [...(base ? ['base ' + base.name] : []), ...patchList] };
}
const listArg = (k) => (arg(k) ? arg(k).split(',').map((s) => s.trim()).filter(Boolean) : []);
/* BL-3's new-game targets (compare.mjs TARGET_SCHEMA): --targets <file>; none given, every change reads as plain movement */
/* BL-3's target file (tools/balance-program/targets.json, the inventory) unless --targets names another or --no-targets */
export const TARGETS_FILE = join(HERE, 'targets.json');
const targetsOf = () => { const f = has('no-targets') ? null : arg('targets') ? resolve(arg('targets')) : existsSync(TARGETS_FILE) ? TARGETS_FILE : null; return f ? loadTargets(JSON.parse(readFileSync(f, 'utf8')), new Set(STD.BANDS.map((b) => b.id))) : []; };

/* ── ONE SHARD: plays its cells on this tree (or its patched copy), keeps every seed's outcomes and the matrix's metrics ──────── */
export async function playShard(spec, o = {}) {
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const run = baselineRun(spec);
  const ch = await changeOf(o.patches || [], o.base);
  const perSeed = (V, c, answers) => {
    const toNext = V.XP.charXpForLevel(c.L + 1) - V.XP.charXpForLevel(c.L);
    const contract = V.BS.contractXpPerH ? V.BS.contractXpPerH(c.L) : null;
    return answers.map((a) => { const s = seedOutcomes(a, { toNext, contract }); return [...OUTCOME_IDS.map((id) => s[id]), s._hh, s._wall]; });
  };
  const opts = { workers: o.workers, shard: o.shard || null, only: o.only || null, blocks: o.blocks || null, planHook: planHook(spec), perSeed, quiet: !!o.quiet, say, label: 'baseline' + (o.shard ? ' shard ' + o.shard.join('/') : '') };
  if (!ch.patch) return { res: await playRun(D, K, run, ROOT, opts), change: ch };
  const s = await plantScratch(ch.patch);
  try { return { res: await playRun(D, K, run, s.root, { ...opts, plan: ch.patch.plan }), change: ch, applied: s.applied }; } finally { s.done(); }
}
const shardCell = (c) => (c.error ? { key: c.key, block: c.block, L: c.L, gear: c.gear, party: c.party, comp: c.comp, tier: c.tier, ground: c.ground, styles: c.styles, error: c.error }
  : (({ kits, perSeed, ...rest }) => (void kits, { ...rest, seeds: perSeed }))(c));

/* ── DETERMINISM: the same cells, seed 0, twice, in fresh worker pools and opposite orders ─────────────────────────────────────── */
export function sampleCells(cells, n) {
  const ok = cells.filter((c) => !c.error);
  const step = Math.max(1, Math.floor(ok.length / n));
  return ok.filter((_, i) => i % step === 0).slice(0, n);
}
export function sameAnswers(a, b) {
  const diff = [];
  for (const id of Object.keys(a)) if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) diff.push(id);
  for (const id of Object.keys(b)) if (!(id in a)) diff.push(id + ' (only in the second play)');
  return diff;
}
async function determinism(spec, n, workers) {
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const plan0 = planMatrix(D, K, baselineRun(spec), {});
  const plan = planHook(spec)(D, K, plan0);
  const pick = sampleCells(plan.cells, n);
  const jobs = pick.map((c) => plan.jobs.find((j) => j.key === c.key && j.cell.seedBase === 0));
  const first = await playJobs(jobs, ROOT, Math.min(workers, jobs.length));
  const second = await playJobs([...jobs].reverse(), ROOT, Math.max(1, Math.min(2, workers)));
  const diff = sameAnswers(first.results, second.results);
  const errors = [...first.errors, ...second.errors].map((e) => e.id + ' ' + e.error);
  /* each cell's seed-0 outcomes, for the join to check against the shard that played the same seed on another runner */
  const outcomes = Object.fromEntries(pick.map((c, i) => { const a = first.results[jobs[i].id]; if (!a) return [c.key, null]; const toNext = D.XP.charXpForLevel(c.L + 1) - D.XP.charXpForLevel(c.L); const s = seedOutcomes(a, { toNext, contract: D.BS.contractXpPerH ? D.BS.contractXpPerH(c.L) : null }); return [c.key, [...OUTCOME_IDS.map((id) => s[id]), s._hh, s._wall]]; }));
  return { schema: 'hearthrise.balance-baseline-determinism/1', cells: pick.length, keys: pick.map((c) => c.key), identical: !diff.length && !errors.length, diff: [...diff, ...errors].slice(0, 20), seed0: outcomes, wallS: Math.round((first.wallMs + second.wallMs) / 1000) };
}

/* ── THE JOIN ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function shardDocs(dir) {
  const out = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^shard-\d+\.json(\.gz)?$/.test(f)) out.push(readDoc(p)); } };
  walk(dir);
  return out;
}
export function joinShardDocs(docs) {
  if (!docs.length) throw new Error('join: no shard files');
  const f = docs[0], n = f.shard[1], seen = new Set();
  for (const d of docs) {
    if (d.schema !== SHARD_SCHEMA) throw new Error('join: ' + (d.schema || 'no schema') + ' is not ' + SHARD_SCHEMA);
    if (d.scenarioHash !== f.scenarioHash) throw new Error('join: shard ' + d.shard.join('/') + ' played scenario ' + d.scenarioHash + ', shard ' + f.shard.join('/') + ' ' + f.scenarioHash);
    if (d.game !== f.game || JSON.stringify(d.change) !== JSON.stringify(f.change)) throw new Error('join: shard ' + d.shard.join('/') + ' played game ' + d.game + ' ' + JSON.stringify(d.change) + ', not ' + f.game + ' ' + JSON.stringify(f.change));
    if (d.shard[1] !== n) throw new Error('join: a shard of ' + d.shard[1] + ' beside shards of ' + n);
    if (JSON.stringify(d.slice || null) !== JSON.stringify(f.slice || null)) throw new Error('join: shard ' + d.shard.join('/') + ' played the slice ' + JSON.stringify(d.slice) + ', not ' + JSON.stringify(f.slice));
    if (seen.has(d.shard[0])) throw new Error('join: shard ' + d.shard[0] + ' twice');
    seen.add(d.shard[0]);
  }
  const missing = Array.from({ length: n }, (_, i) => i).filter((i) => !seen.has(i));
  if (missing.length) throw new Error('join: shards missing: ' + missing.join(', '));
  return { cells: docs.sort((a, b) => a.shard[0] - b.shard[0]).flatMap((d) => d.cells), calibration: (docs.find((d) => d.shard[0] === 0) || {}).calibration || null,
    runtime: { shards: n, jobs: docs.reduce((a, d) => a + d.runtime.jobs, 0), workerS: docs.reduce((a, d) => a + d.runtime.workerS, 0), wallS: Math.max(...docs.map((d) => d.runtime.wallS)) }, first: f };
}
const SLIM_M = [...METRIC_IDS, 'coinPerH', 'incomePerH', 'storePerH', 'netADay', 'revealsPerPartyH', 'revealEveryHeroH', 'rarestRevealEveryHeroH', 'endedEarlyShare', 'ended', 'sample', 'deathTax', 'mainSkillXpPerH'];
const slimM = (m) => ({ ...Object.fromEntries(SLIM_M.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])), seats: (m.seatsM || []).map((s) => [s.style, s.takenShare, s.takenPerH, s.dealtPerH, s.deaths]) });
export async function joinRun(dir, spec, o = {}) {
  const j = joinShardDocs(shardDocs(dir));
  const det = o.determinism && existsSync(o.determinism) ? readDoc(o.determinism) : null;
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const ch = j.first.change && j.first.change.names && j.first.change.names.length ? await changeOf(j.first.change.patches || [], j.first.change.base) : { patch: null };
  let V = D;
  if (ch.patch) { const s = await plantScratch(ch.patch); try { V = await dataView(D, s.root); } finally { s.done(); } }
  const ok = j.cells.filter((c) => !c.error && c.m);
  const doc0 = { outcomeIds: OUTCOME_IDS, cells: j.cells.map((c) => (c.error ? c : { ...c, m: slimM(c.m) })) };
  const hy = hydrate(doc0);
  const views = computeViews(hy.cells, { spec, toNext: (L) => V.XP.charXpForLevel(L + 1) - V.XP.charXpForLevel(L) });
  /* THE READER ROWS: the matrix judge's VALUE for each band id on this tree (its status, a current-game ruling, is dropped), so a target file
     that names a reader (BL-3's inventory) is judged on the tree that played it */
  const readers = judgeMatrix(V, K, ok.filter((c) => c.block !== 'c2' && c.block !== 'c3')).filter((x) => finite(x.value)).map((x) => [x.band, x.way, String(x.at), Number(x.value.toPrecision(6))]);
  const c2 = (spec.c2 || []).map((r) => {
    const c = ok.find((x) => x.key === 'C2|' + r.ground + '|' + r.tier + '|' + r.L);
    if (!c) return { ground: r.ground, tier: r.tier, L: r.L, error: 'not played' };
    const row = { ground: r.ground, tier: r.tier, levels: r.levels, hero_hours: r.heroHours, kills_h: r.real.kills, xp_h: r.real.xp, coin_h: r.real.coin, deaths_per_100h: r.real.deathsPer100h };
    return { ...readC2(row, c.m), gear: r.gear };
  });
  /* the determinism job's seed 0 against the shard that played the same seed: a third play, another runner */
  let detCheck = null;
  if (det) {
    const mism = [];
    for (const [key, row] of Object.entries(det.seed0 || {})) { const c = j.cells.find((x) => x.key === key); if (c && c.seeds && JSON.stringify(c.seeds[0]) !== JSON.stringify(row)) mism.push(key); }
    detCheck = { cells: det.cells, identical: det.identical, diff: det.diff, againstShards: { cells: Object.keys(det.seed0 || {}).length, mismatched: mism } };
  }
  const heroHours = Math.round(ok.reduce((a, c) => a + (c.seeds || []).reduce((s, row) => s + (row[OUTCOME_IDS.length] || 0), 0), 0));
  const man = await manifest(ROOT);
  return { schema: RESULT_SCHEMA, label: o.label || (man.tree.game.label || man.tree.game.ref), at: new Date().toISOString().slice(0, 16) + 'Z',
    scenario: { id: spec.id, hash: j.first.scenarioHash, spec }, manifest: { ...man, change: j.first.change || null, slice: j.first.slice || null, ...(o.playedBy ? { playedBy: o.playedBy } : {}) },
    runtime: { ...j.runtime, heroHours, run: o.runId || null, errors: j.cells.filter((c) => c.error).length },
    outcomeIds: OUTCOME_IDS, cells: doc0.cells, views, readers, calibration: { krell: j.calibration, c2 }, determinism: detCheck };
}

/* ── THE COMMANDS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function main() {
  if (has('selftest')) return selftest();
  if (arg('materialize')) {
    const rec = materialize({ game: arg('materialize'), into: resolve(arg('into')), label: arg('label', arg('materialize')), harnessRoot: ROOT, patches: listArg('patch') });
    console.log('materialized ' + rec.game.ref + ' (' + rec.game.sha + ') with harness ' + rec.harness.sha + (rec.harness.dirty ? ' (dirty)' : '') + ' -> ' + resolve(arg('into')));
    for (const [p, x] of Object.entries(rec.replaced)) if (!x.same) console.log('  overlaid ' + p + ' (the tree\'s own ' + (x.tree || 'absent') + ', the harness ' + x.harness + ')');
    return 0;
  }
  if (has('derive-spec')) {
    const spec = await deriveSpec(ROOT, arg('label'));
    writeFileSync(resolve(arg('out', 'spec.json')), JSON.stringify(spec, null, 1) + '\n');
    console.log('spec: live content to Level ' + spec.liveTop + ', ' + spec.openGrounds.length + ' open grounds (staged, not played: ' + spec.stagedGrounds.join(', ') + '), ' + spec.levels.length + ' Levels, spine ' + spec.spine.join(', ') + ', ' + spec.c2.length + ' C-2 rows');
    return 0;
  }
  if (has('report') || arg('compare')) {
    const base = hydrate(readDoc(resolve(arg('baseline', arg('report') || PIN_RESULTS))));
    if (!arg('compare')) { printBaseline(base, { allViews: has('all-views') }); if (base.calibration && base.calibration.krell) { console.log(''); printCalibration(base.calibration.krell, console.log); } return 0; }
    const cand = hydrate(readDoc(resolve(arg('compare'))));
    const cmp = compareDocs(base, cand, { targets: targetsOf(), intent: listArg('intent') });
    const sha = (d) => d.manifest && d.manifest.tree && d.manifest.tree.harness ? d.manifest.tree.harness.sha : null;
    printCompare(cmp, base, cand, { allViews: has('all-views'), top: Number(arg('top', 8)), harnessFiles: instrumentDiff(ROOT, sha(base), sha(cand)) });
    if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ baseline: base.label, candidate: cand.label, categories: cmp.categories, targets: cmp.targets, views: cmp.views, cells: cmp.cells, onlyA: cmp.onlyA, onlyB: cmp.onlyB, groundMoved: cmp.groundMoved }) + '\n');
    return 0;
  }
  if (arg('local')) return local();
  const spec = readSpec(arg('spec'));
  const sh = scenarioHash(spec, ROOT);
  if (has('plan')) {
    const D = await loadGridData(ROOT), K = await loadKits(ROOT);
    const plan = planHook(spec)(D, K, planMatrix(D, K, baselineRun(spec), {}));
    const by = {};
    for (const c of plan.cells) { const b = by[c.block] || (by[c.block] = { cells: 0, jobs: 0, partyH: 0, heroH: 0 }); b.cells++; b.jobs += spec.seeds; b.partyH += spec.seeds * c.hours; b.heroH += spec.seeds * c.hours * c.party; }
    console.log('BASELINE PLAN (scenario ' + spec.id + ' ' + sh + '): ' + plan.cells.length + ' cells, ' + plan.jobs.length + ' seed jobs');
    for (const [k, b] of Object.entries(by)) console.log('  ' + k.padEnd(10) + String(b.cells).padStart(6) + ' cells ' + String(b.jobs).padStart(6) + ' jobs ' + String(Math.round(b.partyH)).padStart(7) + ' party-h ' + String(Math.round(b.heroH)).padStart(7) + ' hero-h');
    const staged = plan.cells.filter(strayCell(spec));
    console.log('  cells off an open ground outside the beyond block: ' + staged.length + ' (the beyond block: ' + plan.cells.filter((c) => c.block === 'beyond').length + ' cells past live content, ' + [...new Set(plan.cells.filter((c) => c.block === 'beyond').map((c) => c.ground))].join(', ') + ')' + (staged.length ? ' (' + staged.slice(0, 5).map((c) => c.key + ' ' + c.ground).join('; ') + ')' : ''));
    return staged.length ? 1 : 0;
  }
  if (arg('shard')) {
    const [i, n] = arg('shard').split('/').map(Number);
    const { res, change } = await playShard(spec, { shard: [i, n], workers: Number(arg('workers', 4)), patches: listArg('patch'), base: arg('base'), only: arg('only') ? arg('only').split(',').map(Number) : null, blocks: arg('blocks') ? arg('blocks').split(',') : null });
    const tree = treeRecord(ROOT);
    const doc = { schema: SHARD_SCHEMA, shard: [i, n], scenarioHash: sh, game: tree.game.sha, change: { names: change.names, patches: listArg('patch'), base: arg('base') || null }, slice: { blocks: listArg('blocks'), only: listArg('only') }, runtime: res.runtime, calibration: res.calibration || null, cells: res.cells.map(shardCell) };
    writeDoc(resolve(arg('out', 'shard-' + i + '.json')), doc);
    const bad = doc.cells.filter((c) => c.error);
    console.log('shard ' + i + '/' + n + ': ' + doc.cells.length + ' cells (' + bad.length + ' errors), ' + res.runtime.jobs + ' jobs, ' + res.runtime.workerS + ' worker-s in ' + res.runtime.wallS + ' s');
    for (const c of bad.slice(0, 5)) console.log('  ERROR ' + c.key + ': ' + c.error);
    return Math.max(bad.length ? 1 : 0, printToolReds(res.cells, (s) => console.error(s)));
  }
  if (has('determinism')) {
    const d = await determinism(spec, Number(arg('cells', 12)), Number(arg('workers', 4)));
    writeDoc(resolve(arg('out', 'determinism.json')), d);
    console.log('DETERMINISM: ' + d.cells + ' cells, seed 0, played twice (fresh workers, opposite orders): ' + (d.identical ? 'byte-identical' : 'DIFFERENT: ' + d.diff.join('; ')) + ' (' + d.wallS + ' s)');
    return d.identical ? 0 : 1;
  }
  /* --add-readers <results> --join <shards>: a results file joined before reader rows were stored gains them from its own run's shards, judged
     on this (materialized) tree; nothing else in the file changes, and the shards must be the very cells it holds */
  if (arg('add-readers') && arg('join')) {
    const file = resolve(arg('add-readers')), doc = readDoc(file);
    const j = joinShardDocs(shardDocs(resolve(arg('join'))));
    const keys = (cs) => cs.map((c) => c.key).join('\n');
    if (keys(j.cells) !== keys(doc.cells) || j.first.scenarioHash !== doc.scenario.hash) { console.error('add-readers: the shards are not the run that made ' + file); return 2; }
    const D = await loadGridData(ROOT), K = await loadKits(ROOT);
    const ok = j.cells.filter((c) => !c.error && c.m && c.block !== 'c2' && c.block !== 'c3');
    doc.readers = judgeMatrix(D, K, ok).filter((x) => finite(x.value)).map((x) => [x.band, x.way, String(x.at), Number(x.value.toPrecision(6))]);
    doc.manifest.readersAddedBy = treeRecord(ROOT).harness.sha;
    writeDoc(file, doc);
    console.log('add-readers: ' + doc.readers.length + ' reader rows -> ' + file);
    return 0;
  }
  if (arg('join')) {
    const doc = await joinRun(resolve(arg('join')), spec, { label: arg('label'), runId: arg('run-id'), playedBy: arg('played-by'), determinism: arg('determinism-file') ? resolve(arg('determinism-file')) : null });
    writeDoc(resolve(arg('out', 'results.json.gz')), doc);
    printBaseline(hydrate(doc));
    const reds = toolReds(doc.cells.filter((c) => !c.error).map((c) => ({ key: c.key, m: { ended: c.m.ended } })));
    console.log('\njoined ' + doc.runtime.shards + ' shards, ' + doc.cells.length + ' cells, ' + doc.runtime.errors + ' errors, ' + reds.length + ' tool reds -> ' + resolve(arg('out', 'results.json.gz')));
    const detBad = doc.determinism && (!doc.determinism.identical || doc.determinism.againstShards.mismatched.length);
    if (detBad) console.log('DETERMINISM RED: ' + JSON.stringify(doc.determinism));
    return doc.runtime.errors || reds.length || detBad ? 1 : 0;
  }
  console.error('baseline: name a command (see the header)');
  return 2;
}

/* THE WHOLE LOOP ON THIS PC, a slice only: materialize, play every shard as one, join, compare with the committed pin */
async function local() {
  if (!arg('only') && !arg('blocks')) { console.error('baseline --local: the full scenario list is a GitHub run (.github/workflows/balance-baseline.yml); name a slice with --only or --blocks'); return 2; }
  const dir = mkdtempSync(join(tmpdir(), 'hr-baseline-'));
  try {
    const tree = join(dir, 'tree'), shards = join(dir, 'shards');
    materialize({ game: arg('local'), into: tree, label: arg('label', arg('local')), harnessRoot: ROOT, patches: listArg('patch') });
    mkdirSync(shards);
    const node = (args) => execFileSync(process.execPath, [join(tree, 'tools/balance-program/baseline.mjs'), ...args], { stdio: 'inherit', cwd: tree });
    const spec = resolve(arg('spec', PIN_SPEC)), out = resolve(arg('out', join(dir, 'candidate.json.gz')));
    const slice = [...(arg('only') ? ['--only', arg('only')] : []), ...(arg('blocks') ? ['--blocks', arg('blocks')] : []), ...(arg('patch') ? ['--patch', arg('patch')] : []), ...(arg('base') ? ['--base', arg('base')] : [])];
    node(['--shard', '0/1', '--spec', spec, '--out', join(shards, 'shard-0.json'), '--workers', String(arg('workers', 4)), ...slice]);
    node(['--join', shards, '--spec', spec, '--out', out, '--label', arg('label', arg('local'))]);
    if (existsSync(PIN_RESULTS) && !has('no-compare')) {
      const cmp = compareDocs(hydrate(readDoc(PIN_RESULTS)), hydrate(readDoc(out)), { targets: targetsOf(), intent: listArg('intent') });
      printCompare(cmp, hydrate(readDoc(PIN_RESULTS)), hydrate(readDoc(out)), { top: Number(arg('top', 8)) });
    }
    console.log('\nresults: ' + out);
    return 0;
  } finally { if (!has('keep')) rmSync(dir, { recursive: true, force: true }); }
}

/* ── THE SELFTEST ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function selftest() {
  const fails = [];
  const check = (name, ok, why = '') => { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ': ' + why)); if (!ok) fails.push(name); };
  const t0 = Date.now();
  /* 1. the outcome reader on a planted seed: two heroes, one died */
  const hero = (o) => ({ style: 'hammer', hours: 2, wallHours: 2, dealtPerH: 3600, takenPerH: 1000, healInPerH: { total: 400 }, healOutPerH: 0, regenPerH: 100, shieldInPerH: 0, deaths: 0, landedPct: 50, dmgPerMonsterSwing: 10,
    encMinHpPct: { p50: 60, p10: 30, p01: 10 }, hpUnder: { p30: 0.1, p10: 0.01 }, closeCallsPer12h: { k: 1 }, buysPerH: { a: 2 }, eatsPerH: { own: 1, store: 1 }, drinksPerH: { own: 0, store: 3 }, castsPerH: { x: 5 }, castManaPerH: { x: 50 }, rareItems: 1,
    raw: { levelXp: 2000, skillXp: { melee: 400, defense: 200 }, coin: 1000, income: 1600, store: 400, rares: 100, xpLostLevelBlessed: 0, blessingGold: 0 }, ...o });
  const seed = { party: { hours: 2, killsPerH: 100, ttkS: { p50: 5, p90: 9 }, pullsPerH: 20, rareRolls: 4 },
    heroes: [hero({}), hero({ style: 'mage', hours: 1, deaths: 1, raw: { levelXp: 1000, skillXp: { magic: 300 }, coin: 500, income: 800, store: 200, rares: 0, xpLostLevelBlessed: 300, blessingGold: 100 } })] };
  const s = seedOutcomes(seed, { toNext: 1700, contract: 1000 });
  check('the outcome reader: DPS, deaths a 1,000 hours, hunted share, net gold, XP after deaths and hours a Level off a planted seed ('
    + ['dps', 'deathsPer1000h', 'huntedShare', 'netPerH', 'netLevelXpPerH', 'hoursPerLevel', 'frontTakenShare', 'lowHpP10'].map((k) => k + ' ' + s[k]).join(', ') + ')',
    s.dps === (3600 * 2 + 3600 * 1) / (2 * 3600) && Math.abs(s.deathsPer1000h - 1000 / 3) < 0.01 && Math.abs(s.huntedShare - 0.75) < 1e-9 && Math.abs(s.netPerH - (2400 - 600 - 100) / 3) < 0.01
    && Math.abs(s.netLevelXpPerH - 2700 / 4) < 0.01 && Math.abs(s.hoursPerLevel - 1700 / 675) < 0.001 && Math.abs(s.frontTakenShare - 2 / 3) < 1e-4 && s.lowHpP10 === 0.3 && s._hh === 3 && s._wall === 4);
  /* 2. the noise rule and the Poisson rule, both ways */
  check('the noise rule: 3% with a 0.5% error is a move, 3% with a 5% error is noise, 0.5% with no error is under the floor, a copy is noise',
    judgeMove({ mean: 100, se: 0.5 }, { mean: 103, se: 0.5 }).flag === 'moved' && judgeMove({ mean: 100, se: 5 }, { mean: 103, se: 5 }).flag === 'noise'
    && judgeMove({ mean: 100, se: 0 }, { mean: 100.5, se: 0 }).flag === 'noise' && judgeMove({ mean: 7, se: 1 }, { mean: 7, se: 1 }).flag === 'noise');
  check('the Poisson rule: 0 against 0 deaths is noise, 0 against 12 in 100 hours is a move, 3 against 4 in 100 hours is noise',
    judgeRates({ k: 0, t: 100 }, { k: 0, t: 100 }).flag === 'noise' && judgeRates({ k: 0, t: 100 }, { k: 12, t: 100 }).flag === 'moved' && judgeRates({ k: 3, t: 100 }, { k: 4, t: 100 }).flag === 'noise');
  /* 3. the verdicts on planted docs, against planted NEW-GAME targets (BL-3's shape): toward, away, both, none, unread, unexpected */
  const row = (vals, j = 0) => [...OUTCOME_IDS.map((id) => (id in vals ? vals[id] : 1) * (1 + j)), 1, 1];
  const cellOf = (key, way, vals) => ({ key, block: 'pace', L: 30, gear: 'mid', party: 1, comp: way, tier: 'normal', ground: 'g', styles: [way], seeds: [row(vals), row(vals, 0.001), row(vals, -0.001), row(vals)] });
  const pdoc = (label, h, m) => ({ schema: RESULT_SCHEMA, label, scenario: { hash: 'h' }, outcomeIds: OUTCOME_IDS, views: [], cells: [cellOf('k1', 'hammer', h), cellOf('k2', 'mage', m)] });
  const A = hydrate(pdoc('A', { levelXpPerH: 1000 }, {}));
  const T = loadTargets({ schema: TARGET_SCHEMA, targets: [
    { id: 'T1', kind: 'soft', category: 'progression', on: 'levelXpPerH', where: { way: 'hammer' }, lo: 1050, hi: 1200 },
    { id: 'T2', kind: 'hard', category: 'economy', on: 'netPerH', where: { way: 'hammer' }, lo: 0.9, hi: null },
    { id: 'T3', kind: 'soft', category: 'survival', on: 'takenPerH', where: { way: 'hammer' }, lo: null, hi: 0.95 },
    { id: 'T4', kind: 'soft', category: 'survival', on: 'takenPerH', where: { way: 'mage' }, lo: null, hi: 1.5 },
    { id: 'T5', kind: 'hypothesis', category: 'progression', on: 'view:timeToTop', lo: null, hi: 100 }] });
  const c = compareDocs(A, hydrate(pdoc('B', { levelXpPerH: 1100, netPerH: 0.5, takenPerH: 0.9, dps: 1.3 }, { takenPerH: 2 })), { targets: T, intent: ['progression', 'survival'] }).categories;
  const cr = compareDocs(A, hydrate(pdoc('B', { levelXpPerH: 1100 }, {})), { targets: T });
  const same = compareDocs(A, hydrate(pdoc('A2', { levelXpPerH: 1000 }, {})), { targets: T }).categories;
  const refusedT = (t) => { try { loadTargets({ schema: TARGET_SCHEMA, targets: [t] }); return false; } catch { return true; } };
  check('verdicts against new-game targets: toward IMPROVEMENT, away and a hard target newly out REGRESSION, both TRADEOFF, a move with no target MOVED (no target), outside the intent UNEXPECTED, a target with nothing to read UNREAD, a copy WITHIN NOISE ('
    + [c.progression.verdict, c.economy.verdict, c.survival.verdict, c.combat.verdict].join(', ') + ')',
    c.progression.verdict === 'IMPROVEMENT' && c.economy.verdict === 'REGRESSION' && c.economy.newlyOut === 1 && c.economy.unexpected && c.survival.verdict === 'TRADEOFF' && !c.survival.unexpected
    && c.combat.verdict === 'MOVED (no target)' && c.combat.unexpected && cr.targets.some((x) => x.unread && x.target.id === 'T5') && Object.values(same).every((x) => x.verdict === 'WITHIN NOISE')
    && refusedT({ id: 'x', kind: 'soft', category: 'progression', on: 'levelXpPerH' }) && refusedT({ id: 'x', kind: 'soft', category: 'nowhere', on: 'levelXpPerH', lo: 1 }) && !refusedT({ id: 'x', kind: 'hard', category: 'survival', on: 'deathsPer1000h', hi: 5 }));
  /* 3b. BL-3's INVENTORY FORM (tools/balance-program/targets.json): a row with a matrix reader and a number is judged on the reader rows each
     tree stored at join (toward or away from BL-3's range, never the old band's); a row another tool reads, or whose band has no number, is
     UNREAD with its reason; results joined without reader rows leave every reader target UNREAD */
  {
    const inv = { schema: TARGET_SCHEMA, targets: [
      { id: 'PACE-x', area: 'pace', class: 'HYPOTHESIS', metric: 'm', band: { lo: 0.9, hi: 1.1 }, readers: ['P1'] },
      { id: 'SURV-x', area: 'survival', class: 'HYPOTHESIS', metric: 'm', band: { lo: null, hi: 1 }, readers: ['S2.mid'] },
      { id: 'GOLD-x', area: 'gold', class: 'HYPOTHESIS', metric: 'm', band: { lo: 0, hi: null }, readers: ['guard:G8'] },
      { id: 'LONG-x', area: 'long', class: 'HYPOTHESIS', metric: 'm', band: { text: 'a sentence' }, readers: ['P1'] }] };
    const T2 = loadTargets(inv, new Set(['P1', 'S2.mid']));
    const A2 = { ...A, readers: [['P1', 'hammer', 'Level 100', 1.3], ['S2.mid', 'hammer', '60 mid x1 deadly', 0.8]] };
    const B2 = { ...hydrate(pdoc('B', { levelXpPerH: 1000 }, {})), readers: [['P1', 'hammer', 'Level 100', 1.05], ['S2.mid', 'hammer', '60 mid x1 deadly', 1.4]] };
    const c2 = compareDocs(A2, B2, { targets: T2 }), un = (id) => c2.targets.find((x) => x.target.id === id && x.unread);
    const bare = compareDocs(A, B2, { targets: T2 }).targets.find((x) => x.target.id === 'PACE-x');
    check('BL-3\'s inventory: a reader row toward its range IMPROVEMENT (' + c2.categories.progression.verdict + '), away REGRESSION (' + c2.categories.survival.verdict + '), another tool\'s reader and a band with no number UNREAD with why, results with no reader rows UNREAD',
      c2.categories.progression.verdict === 'IMPROVEMENT' && c2.categories.survival.verdict === 'REGRESSION' && un('GOLD-x') && /no matrix reader/.test(un('GOLD-x').why)
      && un('LONG-x') && /no number/.test(un('LONG-x').why) && bare && bare.unread && /no reader rows/.test(bare.why) && T2[0].category === 'progression' && T2[1].category === 'survival');
  }
  /* 4. time to the top on a flat planted rate is the curve's own sum */
  {
    const spec = { levels: [1, 5, 10], spine: [1, 5, 10], liveTop: 10 };
    const mk = (L, rate) => ({ key: 'p' + L, block: 'pace', L, gear: 'mid', party: 1, comp: 'h', tier: 'normal', styles: ['hammer'], stats: { netLevelXpPerH: [4, rate, 0], hoursPerLevel: [4, 1, 0] }, deaths: 0, hh: 4 });
    const toNext = (L) => 100 * L;
    const v = computeViews([mk(1, 500), mk(5, 500), mk(10, 500)], { spec, toNext }).find((x) => x.key === 'timeToTop|lone hammer');
    const want = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((a, L) => a + (100 * L) / 500, 0);
    const v2r = computeViews([mk(1, 500), mk(5, 1000), mk(10, 1000)], { spec, toNext }).find((x) => x.key === 'timeToTop|lone hammer');
    check('time to the top: a flat rate gives the XP curve\'s sum (' + (v && v.value) + ' = ' + want + '), and a faster checkpoint shortens it (' + (v2r && v2r.value) + ')', v && Math.abs(v.value - want) < 1e-6 && v2r && v2r.value < want && v2r.value > want / 2);
  }
  /* 5. the scenario on this tree: no staged ground, every planned cell on an open ground with its Level's hours, check C3 at 8 h */
  {
    const D = await loadGridData(ROOT), K = await loadKits(ROOT);
    const spec = await deriveSpec(ROOT, 'selftest');
    const plan = planHook(spec)(D, K, planMatrix(D, K, baselineRun(spec), {}));
    const stray = plan.cells.filter(strayCell(spec));
    const hoursOk = plan.jobs.every((j) => { const c = plan.cells.find((x) => x.key === j.key); return j.cell.hours === hoursOfCell(c); });
    const c3 = plan.cells.filter((c) => c.block === 'c3');
    check('the scenario on this tree: ' + plan.cells.length + ' cells, live to Level ' + spec.liveTop + ', no staged ground among ' + spec.openGrounds.length + ' open ones, every cell on an open ground but the beyond block (' + stray.length + ' stray), the beyond block past the top only and never OPEN (' + plan.cells.filter((c) => c.block === 'beyond').length + ' cells), every job at its Level\'s hours, check C3 at 8 h',
      spec.openGrounds.length > 0 && spec.openGrounds.every((g) => !spec.stagedGrounds.includes(g)) && !stray.length && hoursOk && plan.cells.some((c) => c.block === 'beyond') && plan.cells.filter((c) => c.block === 'beyond').every((c) => c.L > spec.liveTop && c.stretch !== 'OPEN') && c3.length === 3 && c3.every((c) => c.hours === 8) && spec.levels.every((L) => L <= spec.liveTop) && spec.spine.every((L) => spec.levels.includes(L)), stray.slice(0, 3).map((c) => c.key + ' ' + c.ground).join('; '));
    /* a planted staged ground would be a stray (the bite: the check reads the plan, not the spec's word) */
    const planted = { ...spec, openGrounds: spec.openGrounds.slice(1) };
    const stray2 = planHook(planted)(D, K, planMatrix(D, K, baselineRun(planted), {})).cells.filter(strayCell(planted));
    check('MUTANT a spec that leaves out one open ground: its cells read as strays (' + stray2.length + ')', stray2.length > 0);
    /* 5b. THE GAME'S OWN BLESSINGS: no baseline job carries the matrix's S-5 ladder (a proposal), so a death past Level 100 is cut by the tree's
       table (three Blessings leave a quarter), where the matrix's own job of the same cell halves it again. Both plays must see a death,
       or the check says so. Since every tier has its home and kit (gear 8.3, 2026-11-23), a beyond-block hammer on its own ground's kit no
       longer dies (145 on Wyvern Roost in Cobalt, 185 to 400 on the Unmarked Catacombs: none in 0.25 h, measured 2026-11-26). So the check
       plays the beyond block's LOWEST Level lone hammer on Deadly, as kitted, on the ground its TOP Level plays: a hero a band under its
       ground, read from the plan (145 on the Catacombs dies) */
    {
      const ladder = plan.jobs.filter((j) => 'blessedShare' in j.cell).length;
      const beyondKeys = new Set(plan.cells.filter((c) => c.block === 'beyond').map((c) => c.key));
      const hammers = plan.jobs.filter((j) => beyondKeys.has(j.key) && /^\d+\|mid\|1:h\|deadly/.test(j.key) && j.cell.seedBase === 0)
        .sort((a, b) => a.cell.level - b.cell.level);
      const job = hammers.length > 1 ? hammers[0] : null;
      const over = job && hammers[hammers.length - 1].cell.ground;
      const matrixJob = job && planMatrix(D, K, baselineRun(spec), { blocks: ['beyond'] }).jobs.find((j) => j.key === job.key && j.cell.seedBase === 0);
      const cut = (r) => (r && r.heroes[0].raw.xpLostLevel > 0 ? r.heroes[0].raw.xpLostLevelBlessed / r.heroes[0].raw.xpLostLevel : null);
      let game = null, matrix = null, why = '';
      if (!job || !matrixJob) why = 'no two lone hammers on Deadly in the beyond block on this tree';
      else {
        const at = { hours: 0.25, ground: over };
        const p = await playJobs([{ ...job, id: 'g', cell: { ...job.cell, ...at } }, { ...matrixJob, id: 'm', cell: { ...matrixJob.cell, ...at } }], ROOT, 2);
        game = cut(p.results.g); matrix = cut(p.results.m);
        if (game === null || matrix === null) why = 'no death in 0.25 h: the check read nothing';
      }
      const share = 1 - D.BL.BLESSING.cutPm / 1000;
      check('the baseline plays the game\'s own Blessings: ' + ladder + ' jobs carry the S-5 ladder, a death at ' + (job && job.cell.level) + ' on ' + over + ' keeps ' + game + ' of its loss (the tree\'s table: ' + share + '), where the matrix\'s job keeps ' + matrix,
        ladder === 0 && game !== null && Math.abs(game - share) < 1e-9 && matrix !== null && matrix < game, why);
    }
    /* 6. one real cell, seed 0, twice: byte-identical; the comparator sees a planted change */
    const pick = plan.jobs.find((j) => j.cell.party.length === 1 && j.cell.level === 10 && j.cell.seedBase === 0) || plan.jobs[0];
    const job = { ...pick, id: 'det', cell: { ...pick.cell, hours: 0.05 } };
    const a = await playJobs([job], ROOT, 1), b = await playJobs([job], ROOT, 1);
    const d0 = sameAnswers(a.results, b.results);
    const planted2 = JSON.parse(JSON.stringify(b.results));
    if (planted2.det) planted2.det.heroes[0].levelXpPerH += 1;
    check('a real cell (' + pick.key + ', 0.05 h) played twice is byte-identical, and a planted one-XP change is seen', !a.errors.length && !!a.results.det && d0.length === 0 && sameAnswers(a.results, planted2).length === 1, JSON.stringify(a.errors).slice(0, 200) + d0.join());
  }
  /* 7. the join refuses shards of two scenarios or two trees */
  {
    const sd = (i, hash, game) => ({ schema: SHARD_SCHEMA, shard: [i, 2], scenarioHash: hash, game, change: { names: [] }, runtime: { jobs: 1, workerS: 1, wallS: 1 }, cells: [] });
    const refused = (docs) => { try { joinShardDocs(docs); return false; } catch { return true; } };
    check('the join: two shards of one scenario on one tree join; another scenario, another tree, a shard twice or a missing shard are refused',
      !refused([sd(0, 'h', 'g'), sd(1, 'h', 'g')]) && refused([sd(0, 'h', 'g'), sd(1, 'h2', 'g')]) && refused([sd(0, 'h', 'g'), sd(1, 'h', 'g2')]) && refused([sd(0, 'h', 'g'), sd(0, 'h', 'g')]) && refused([sd(0, 'h', 'g')]));
  }
  /* 8. the noise table reads a planted doc */
  {
    const nt = noiseTable(A);
    const lx = nt.find((n) => n.id === 'levelXpPerH');
    const [, , sd] = moments([1000, 1001, 999, 1000]);
    check('the noise table: a cell\'s relative error is its sd over sqrt(n) over the mean (' + lx.medianRelSe + ')', Math.abs(lx.medianRelSe - sd / 2 / 1000) < 1e-6);
  }
  /* 9. the overlay: the commit's game, this checkout's harness, the record (skipped where git cannot export, said out loud) */
  {
    let ok = false, why = '';
    const dir = mkdtempSync(join(tmpdir(), 'hr-baseline-selftest-'));
    try {
      const into = join(dir, 'tree');
      const rec = materialize({ game: 'HEAD', into, label: 'selftest', harnessRoot: ROOT });
      const gameFile = 'src/core/combat.js', harnessFile = 'tools/balance-program/baseline/outcomes.mjs';
      const fromCommit = execFileSync('git', ['show', 'HEAD:' + gameFile], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).replace(/\r\n/g, '\n');
      ok = readFileSync(join(into, gameFile), 'utf8').replace(/\r\n/g, '\n') === fromCommit && readFileSync(join(into, harnessFile), 'utf8') === readFileSync(join(ROOT, harnessFile), 'utf8')
        && existsSync(join(into, TREE_FILE)) && rec.game.sha.length === 40 && HARNESS.every((p) => p in rec.replaced);
      if (!ok) why = 'the folder does not hold the commit\'s game and this harness';
    } catch (e) { why = 'git archive or tar failed here: ' + String(e.message).split('\n')[0]; }
    finally { rmSync(dir, { recursive: true, force: true }); }
    check('the overlay: the folder holds the commit\'s ' + 'src/core/combat.js and this checkout\'s harness, and records both', ok, why);
  }
  /* 10. THE COMMITTED RESULTS ARE BYTES: git keeps *.gz binary (the tools/** text rule once rewrote a results file's CR LF pairs and broke the
     gzip), and the pin decompresses to its own schema */
  {
    let ok = false, why = '';
    try {
      const attr = execFileSync('git', ['check-attr', 'text', '--', relative(ROOT, PIN_RESULTS).split('\\').join('/')], { cwd: ROOT, encoding: 'utf8' });
      const doc = existsSync(PIN_RESULTS) ? readDoc(PIN_RESULTS) : null;
      ok = /: text: unset/.test(attr) && (!doc || (doc.schema === RESULT_SCHEMA && doc.cells.length > 0));
      if (!ok) why = attr.trim();
    } catch (e) { why = String(e.message).split('\n')[0]; }
    check('the committed results are bytes: git keeps *.gz binary and the pin decompresses to its schema', ok, why);
  }
  console.log('baseline selftest: ' + (fails.length ? fails.length + ' FAILED' : 'green') + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
