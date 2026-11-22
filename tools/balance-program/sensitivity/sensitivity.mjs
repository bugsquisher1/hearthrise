#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/sensitivity/sensitivity.mjs — THE SENSITIVITY PASS AND THE INTERACTION EXPERIMENTS, PLAYED ON THE REAL ENGINE
// (Tyler 2026-11-21, the balance baseline request, Phases 4 and 5; lane/bl-sensitivity, deliverables 4 and 5).
//
// It adds no engine and no second set of rules. A POINT is a set of lever multipliers ({ monsterHp: 1.5, respawn: 0.5 }); it becomes one
// patch (levers.mjs pointPatch), planted on a scratch copy (matrix-scratch.mjs), and the SAME cells are played on the SAME dice as the
// unpatched tree, through the matrix's own playRun. Every cell keeps one row of outcomes a SEED (tools/balance-program/baseline/
// outcomes.mjs, the baseline's own reader), so each effect is read as a pair, seed by seed, and carries its own noise.
//
// THE CELLS (SCENARIO below) are a slice of the baseline's scenario list (baseline/scenarios.mjs): the same keys, the same hours by Level
// and the same four seeds, so the unpatched column here is the baseline's own number for that cell.
//
//   --jobs [oat|fx|all]                 the GitHub job list as JSON: "base", "oat:<lever>", "fx:<experiment>:<chunk>/<chunks>"
//   --play <job> --out <file.json.gz>   play one job (each point written as it finishes) [--workers N] [--seeds N] [--seed-from K]
//   --plan                              NO PLAY: the cells, the levers, their steps, the experiments, and the hero-hours of one point
//   --sites <lever> [--at M]            NO PLAY: the numbers a lever moves, before and after
//   --selftest                          the proofs (below)
// The analysis is analyze.mjs (reads the parts, writes the matrix and the tables the two documents quote).
//
// SELFTEST: every lever of the list finds its numbers on this tree at every step or is refused by name; a family's edits land exactly
// the lines it names (respawn moves every written respawn and nothing else); a point's patch passes the matrix's own patch check; the
// scenario holds no staged ground; an empty point plays one cell exactly as the tree does, and monsterHp x2 slows its kills.
//
// Exit: 0 ran · 1 a selftest proof failed, a tool red or an error cell · 2 harness.
// mutant-anchors: none — the selftest plays on this tree and on scratch copies; no tracked file is patched
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../../tests/_is-main.mjs';
import { playRun } from '../balance-matrix.mjs';
import { loadGridData, compsOf } from '../progression-grid.mjs';
import { loadKits } from '../grid-kit.mjs';
import { toolReds } from '../matrix-metrics.mjs';
import { plantScratch, checkPatch } from '../matrix-scratch.mjs';
import { OUTCOME_IDS, seedOutcomes } from '../baseline/outcomes.mjs';
import { deriveSpec, baselineRun, planHook, scenarioHash } from '../baseline/scenarios.mjs';
import { leverList, pointPatch, FAMILIES } from './levers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
export const PART_SCHEMA = 'hearthrise.balance-sensitivity-part/1';
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const say = (s) => console.error(s);

/* ── THE SCENARIO: which of the baseline's cells every point plays ─────────────────────────────────────────────────────────────── */
export const SCENARIO = Object.freeze({
  id: 'sens-1',
  levels: Object.freeze([10, 30, 60, 110]),
  /* the two lone ways that carry the gear and tier axes: a melee way and a magic way */
  axisWays: Object.freeze(['hammer', 'mage']),
});
const FOUR = compsOf(4)[0][1];
/** Is this baseline cell one of the pass's? Lone: every way MID on Normal at each Level, and the hammer and the Mage on LOW and BIS
    and on the harder tiers from Level 30. The standard four: MID on every tier from Level 30, LOW and BIS on Normal at Level 60, and
    MID on Normal at Level 10. */
export function inScenario(c) {
  if (c.step || c.variant || String(c.key).startsWith('G|') || String(c.key).startsWith('C2|')) return false;
  if (!SCENARIO.levels.includes(c.L)) return false;
  if (c.party === 1) {
    if (c.gear === 'mid' && c.tier === 'normal') return true;
    if (c.L < 30 || !SCENARIO.axisWays.includes(c.styles[0])) return false;
    return (c.gear !== 'mid' && c.tier === 'normal') || (c.gear === 'mid' && c.tier !== 'normal');
  }
  if (c.party !== 4 || c.comp !== FOUR) return false;
  if (c.L === 10) return c.gear === 'mid' && c.tier === 'normal';
  if (c.gear === 'mid') return true;
  return c.L === 60 && c.tier === 'normal';
}

/* ── THE EXPERIMENTS (Phase 5): structured grids on the coupled sets. Each is a full factorial of its factors' levels. ─────────── */
export const EXPERIMENTS = Object.freeze([
  { id: 'damage-heal', what: 'Hero damage with heal size and the price of healing: does more damage pay for itself in food not bought',
    factors: { playerAttack: [0.75, 1, 1.5], healPower: [0.5, 1, 2], foodPrice: [0.5, 1, 2] } },
  { id: 'hp-spawn', what: 'Monster health with respawn time: the two caps on kills an hour',
    factors: { monsterHp: [0.5, 0.75, 1, 1.5, 2], respawn: [0.5, 1, 2] } },
  { id: 'cost-regen', what: 'Spell mana cost with mana regeneration: is a rotation sustainable',
    factors: { spellCost: [0.5, 1, 2], manaRegen: [0.5, 1, 2] } },
  { id: 'armor-tier-coin', what: 'The armor curve with the tier blow dial and the coin line (x2.4 is the value the last pass proposed)',
    factors: { armorCurve: [1, 1.5, 2.4], tierDanger: [0.9, 1, 1.25], coinPerKill: [0.75, 1, 1.25] } },
  { id: 'level-death', what: 'The Level XP curve with the death price and monster damage: the seat the Level law is timed on moves with the death rate',
    factors: { levelCurve: [0.75, 1, 1.5], deathLoss: [0.5, 1, 2], monsterDamage: [1, 1.25, 1.5] } },
  { id: 'party-tier', what: 'Party XP with tier XP: which tier a four should choose, and what a four is worth against a lone hero',
    factors: { partyXp: [0.8, 1, 1.2], tierXp: [0.8, 1, 1.2] } },
  { id: 'damage-hp', what: 'Hero damage with monster health: are they one lever (kill time is their ratio) or two',
    factors: { playerAttack: [0.5, 1, 2], monsterHp: [0.5, 1, 2] } },
  { id: 'danger-hp', what: 'Monster damage with hero health: monster blows are written as a share of hero HP, so do the two cancel',
    factors: { monsterDamage: [0.5, 1, 2], heroHp: [0.5, 1, 2] } },
]);
/** A factorial's points, the all-ones point left out (it is the base): [{ id, levers }]. */
export function pointsOf(exp) {
  const names = Object.keys(exp.factors);
  let pts = [{}];
  for (const n of names) pts = pts.flatMap((p) => exp.factors[n].map((m) => ({ ...p, [n]: m })));
  return pts.filter((p) => names.some((n) => p[n] !== 1)).map((levers) => ({ id: exp.id + ':' + names.map((n) => n + '=' + levers[n]).join(','), levers }));
}
const FX_CHUNK = 6;

/* ── FILES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function readDoc(file) { const buf = readFileSync(file); return JSON.parse((file.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8')); }
export function writeDoc(file, doc) { mkdirSync(dirname(file), { recursive: true }); const text = JSON.stringify(doc) + '\n'; writeFileSync(file, file.endsWith('.gz') ? gzipSync(Buffer.from(text, 'utf8'), { level: 9 }) : text); }
const commitOf = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

/* ── ONE POINT ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const perSeed = (V, c, answers) => {
  const toNext = V.XP.charXpForLevel(c.L + 1) - V.XP.charXpForLevel(c.L);
  const contract = V.BS.contractXpPerH ? V.BS.contractXpPerH(c.L) : null;
  return answers.map((a) => { const s = seedOutcomes(a, { toNext, contract }); return [...OUTCOME_IDS.map((id) => s[id]), s._hh, s._wall]; });
};
/** The scenario's plan hook: the baseline's own (hours by Level), cut to the pass's cells, on seeds `from` .. `from + seeds - 1`. */
export function scenarioHook(spec, o = {}) {
  const base = planHook(spec), from = o.seedFrom || 0, pick = o.pick || inScenario;
  return (D, K, plan) => {
    const p = base(D, K, plan);
    const cells = p.cells.filter(pick), keys = new Set(cells.map((c) => c.key));
    const jobs = p.jobs.filter((j) => keys.has(j.key)).map((j) => (from ? { ...j, id: j.key + '#' + (j.cell.seedBase + from), cell: { ...j.cell, seedBase: j.cell.seedBase + from } } : j));
    return { cells, jobs };
  };
}
const META = ['key', 'block', 'L', 'gear', 'party', 'comp', 'tier', 'ground', 'styles', 'hours'];
/** Play one point (levers {} is the unpatched tree). Answers { levers, applied, sites, cells: { key: seed rows }, meta, errors, reds, runtime } or { refused }. */
export async function playPoint(ctx, levers, o = {}) {
  const { D, K, spec } = ctx;
  const run = { ...baselineRun(spec), seeds: o.seeds || spec.seeds };
  const opts = { workers: o.workers || 4, planHook: scenarioHook(spec, o), perSeed, calibrate: false, quiet: true, say: () => {}, seeds: o.seeds || null, label: o.label || 'point' };
  const moved = Object.entries(levers).filter(([, m]) => m !== 1);
  let res, applied = [], sites = {};
  if (!moved.length) res = await playRun(D, K, run, ROOT, opts);
  else {
    let s;
    try {
      const pp = pointPatch(ROOT, levers);
      checkPatch(pp.patch);
      sites = pp.sites;
      s = await plantScratch(pp.patch);
    } catch (e) { return { levers, refused: String(e.message || e).split('\n')[0].slice(0, 300) }; }
    try { res = await playRun(D, K, run, s.root, opts); applied = s.applied.filter((a) => a.knob).map((a) => a.knob + ' ' + a.file + ':' + a.line + ' ' + a.from.join(',') + ' -> ' + a.to.join(',')); }
    catch (e) { return { levers, refused: 'the patched tree did not play: ' + String(e.message || e).split('\n')[0].slice(0, 300) }; }
    finally { s.done(); }
  }
  const cells = {}, errors = [];
  for (const c of res.cells) { if (c.error) errors.push([c.key, String(c.error).slice(0, 200)]); else cells[c.key] = c.perSeed; }
  return { levers, applied, sites, cells, meta: res.cells.map((c) => Object.fromEntries(META.map((k) => [k, c[k]]))), errors,
    reds: toolReds(res.cells).map((r) => r.key || r), runtime: { jobs: res.runtime.jobs, wallS: res.runtime.wallS, workerS: res.runtime.workerS } };
}

export async function context() {
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const spec = await deriveSpec(ROOT, 'overhaul-start');
  return { D, K, spec, scenarioHash: scenarioHash(spec, ROOT) };
}

/** The points of a job name. */
export function jobPoints(job) {
  if (job === 'base') return [{ id: 'base', levers: {} }];
  const [kind, id, chunk] = job.split(':');
  if (kind === 'oat') {
    const lv = leverList(ROOT).find((l) => l.id === id);
    if (!lv) throw new Error('sensitivity: no lever ' + id);
    return lv.steps.filter((m) => m !== 1).map((m) => ({ id: id + '=' + m, levers: { [id]: m } }));
  }
  if (kind === 'fx') {
    const exp = EXPERIMENTS.find((e) => e.id === id);
    if (!exp) throw new Error('sensitivity: no experiment ' + id);
    const pts = pointsOf(exp);
    if (!chunk) return pts;
    const [i, n] = chunk.split('/').map(Number);
    return pts.filter((_, k) => k % n === i);
  }
  throw new Error('sensitivity: no job ' + job + ' (base, oat:<lever>, fx:<experiment>[:i/n])');
}
export function jobList(which = 'all') {
  const out = ['base'];
  if (which !== 'fx') for (const l of leverList(ROOT)) out.push('oat:' + l.id);
  if (which !== 'oat') for (const e of EXPERIMENTS) { const n = Math.ceil(pointsOf(e).length / FX_CHUNK); for (let i = 0; i < n; i++) out.push('fx:' + e.id + ':' + i + '/' + n); }
  return out;
}

async function play(job, out, o) {
  const ctx = await context();
  const pts = jobPoints(job);
  const doc = { schema: PART_SCHEMA, job, scenario: SCENARIO.id, scenarioHash: ctx.scenarioHash, commit: commitOf(), seeds: o.seeds || ctx.spec.seeds, seedFrom: o.seedFrom || 0,
    outcomeIds: [...OUTCOME_IDS, '_hh', '_wall'], meta: null, points: [], at: null };
  let bad = 0;
  for (const p of pts) {
    const t0 = Date.now();
    const r = await playPoint(ctx, p.levers, { ...o, label: p.id });
    if (r.refused) { doc.points.push({ id: p.id, levers: p.levers, refused: r.refused }); say(p.id + ': REFUSED ' + r.refused); }
    else {
      if (!doc.meta) doc.meta = r.meta;
      doc.points.push({ id: p.id, levers: p.levers, applied: r.applied, sites: r.sites, cells: r.cells, errors: r.errors, reds: r.reds, runtime: r.runtime });
      if (r.errors.length || r.reds.length) bad++;
      say(p.id + ': ' + Object.keys(r.cells).length + ' cells, ' + r.errors.length + ' errors, ' + r.reds.length + ' tool reds, ' + Math.round((Date.now() - t0) / 1000) + ' s');
    }
    doc.at = new Date().toISOString().slice(0, 16) + 'Z';
    writeDoc(out, doc);
  }
  console.log(job + ': ' + doc.points.length + ' point(s) -> ' + out + (bad ? ' (' + bad + ' with an error or a tool red)' : ''));
  return 0;
}

async function plan() {
  const ctx = await context();
  const { planMatrix } = await import('../matrix-plan.mjs');
  const p = scenarioHook(ctx.spec)(ctx.D, ctx.K, planMatrix(ctx.D, ctx.K, baselineRun(ctx.spec), {}));
  const heroH = p.cells.reduce((a, c) => a + c.hours * c.party * ctx.spec.seeds, 0);
  console.log('SCENARIO ' + SCENARIO.id + ' on baseline scenario ' + ctx.scenarioHash + ': ' + p.cells.length + ' cells, ' + p.jobs.length + ' seed jobs, ' + heroH + ' hero-hours a point');
  for (const c of p.cells) console.log('  ' + c.key.padEnd(34) + String(c.ground).padEnd(22) + c.hours + ' h');
  const levers = leverList(ROOT);
  console.log('LEVERS: ' + levers.length + ' (' + levers.filter((l) => l.kind === 'knob').length + ' knobs, ' + FAMILIES.length + ' families), ' + levers.reduce((a, l) => a + l.steps.length, 0) + ' one-at-a-time points');
  for (const l of levers) console.log('  ' + l.id.padEnd(20) + l.kind.padEnd(8) + l.group.padEnd(15) + l.steps.join(' / ') + (l.planned ? '' : '   (no plan row: the wide ladder)'));
  console.log('EXPERIMENTS: ' + EXPERIMENTS.length + ', ' + EXPERIMENTS.reduce((a, e) => a + pointsOf(e).length, 0) + ' points');
  for (const e of EXPERIMENTS) console.log('  ' + e.id.padEnd(18) + String(pointsOf(e).length).padStart(3) + ' points  ' + Object.entries(e.factors).map(([k, v]) => k + ' {' + v.join(', ') + '}').join(' x '));
  console.log('JOBS: ' + jobList().length);
  return 0;
}

async function selftest() {
  const fails = [];
  const ok = (cond, what) => { if (!cond) fails.push(what); console.log((cond ? '  ok   ' : '  FAIL ') + what); };
  const levers = leverList(ROOT);
  ok(levers.length >= 35 && levers.every((l) => l.planned), 'every live knob has a plan row (' + levers.filter((l) => !l.planned).map((l) => l.id).join(', ') + ')');
  const { patchEdits } = await import('../matrix-scratch.mjs');
  let located = 0;
  const refused = [];
  for (const l of levers) for (const m of l.steps) {
    try { const pp = pointPatch(ROOT, { [l.id]: m }); const e = patchEdits(ROOT, pp.patch); if (e.applied.length) located++; else refused.push(l.id + ' x' + m + ': moved nothing'); }
    catch (e) { refused.push(l.id + ' x' + m + ': ' + String(e.message).slice(0, 120)); }
  }
  ok(!refused.length, 'every lever finds its numbers at every step (' + located + ' points' + (refused.length ? ', refused: ' + refused.slice(0, 4).join(' | ') : '') + ')');
  const text = readFileSync(resolve(ROOT, 'src/data/hunt-grounds.js'), 'utf8');
  const fam = FAMILIES.find((f) => f.id === 'respawn');
  const r = (await import('./levers.mjs')).familyEdits(fam, 2, text);
  const written = [...text.matchAll(/respawnMs: (\d+), pullDist/g)].map((m) => Number(m[1]));
  const after = [...r.text.matchAll(/respawnMs: (\d+), pullDist/g)].map((m) => Number(m[1]));
  ok(written.length >= 8 && after.length === written.length && after.every((v, i) => v === written[i] * 2), 'respawn x2 doubles every written respawn (' + written.length + ' rows)');
  const strip = (s) => s.replace(/respawnMs: \d+, pullDist/g, 'respawnMs: N, pullDist');
  ok(strip(r.text) === strip(text), 'respawn x2 moves nothing else in the file');
  /* every family's scaled file still parses and holds as many numbers as it did (a slip in a pick's index would glue two numbers) */
  const { familyEdits } = await import('./levers.mjs');
  const { Script } = await import('node:vm');
  const badFam = [];
  for (const f of FAMILIES) for (const m of [0.5, 2]) {
    const src = readFileSync(resolve(ROOT, f.file), 'utf8'), outText = familyEdits(f, m, src).text;
    const nums = (x) => (x.match(/d+(.d+)?/g) || []).length;
    let parses = true;
    try { new Script(outText.replace(/^s*import .*$/gm, '').replace(/^export /gm, '')); } catch (e) { parses = !(e instanceof SyntaxError); }
    if (!parses || nums(outText) !== nums(src)) badFam.push(f.id + ' x' + m);
  }
  ok(!badFam.length, 'every family leaves its file parsing with the same count of numbers (' + (badFam.join(', ') || FAMILIES.length + ' families at x0.5 and x2') + ')');
  const ctx = await context();
  const { planMatrix } = await import('../matrix-plan.mjs');
  const p = scenarioHook(ctx.spec)(ctx.D, ctx.K, planMatrix(ctx.D, ctx.K, baselineRun(ctx.spec), {}));
  ok(p.cells.length > 40 && p.cells.every((c) => ctx.spec.openGrounds.includes(c.ground)), 'the scenario holds ' + p.cells.length + ' cells, every one on an open ground');
  ok(p.jobs.length === p.cells.length * ctx.spec.seeds, 'four seeds a cell (' + p.jobs.length + ' jobs)');
  /* one cell, one seed: an empty point is the tree; monsterHp x2 slows the kills */
  const one = p.cells.find((c) => c.party === 1 && c.L === 10 && c.styles[0] === 'hammer');
  const o = { pick: (c) => c.key === one.key, seeds: 1, workers: 1 };
  const a = await playPoint(ctx, {}, o), b = await playPoint(ctx, { monsterHp: 1 }, o), c = await playPoint(ctx, { monsterHp: 2 }, o);
  const kI = OUTCOME_IDS.indexOf('killsPerH');
  ok(JSON.stringify(a.cells) === JSON.stringify(b.cells), 'a point of all ones plays the cell exactly as the tree does');
  ok(!c.refused && c.cells[one.key][0][kI] < a.cells[one.key][0][kI] * 0.8, 'monsterHp x2 slows the kills (' + a.cells[one.key][0][kI] + ' -> ' + (c.refused || c.cells[one.key][0][kI]) + ' an hour)');
  console.log(fails.length ? 'SELFTEST FAILED: ' + fails.length : 'selftest: all proofs hold');
  return fails.length ? 1 : 0;
}

async function main() {
  if (has('selftest')) return selftest();
  if (has('jobs')) {
    const all = jobList(arg('jobs', 'all')), only = arg('only') ? arg('only').split(',').map((x) => x.trim()).filter(Boolean) : null;
    const bad = (only || []).filter((j) => !/^[A-Za-z0-9:/-]+$/.test(j) || !jobList('all').includes(j));
    if (bad.length) { console.error('sensitivity: no job ' + bad.join(', ')); return 2; }
    console.log(JSON.stringify(only || all));
    return 0;
  }
  if (has('plan')) return plan();
  if (arg('sites')) {
    const pp = pointPatch(ROOT, { [arg('sites')]: Number(arg('at', 2)) });
    const { patchEdits } = await import('../matrix-scratch.mjs');
    for (const a of patchEdits(ROOT, pp.patch).applied.filter((x) => x.knob)) console.log(a.file + ':' + a.line + '  ' + a.from.join(', ') + ' -> ' + a.to.join(', '));
    for (const [id, ss] of Object.entries(pp.sites)) for (const s of ss) console.log(FAMILIES.find((f) => f.id === id).file + ':' + s.line + '  ' + s.from.join(', ') + ' -> ' + s.to.join(', '));
    return 0;
  }
  if (arg('play')) return play(arg('play'), resolve(arg('out', 'part.json.gz')), { workers: Number(arg('workers', 4)), seeds: arg('seeds') ? Number(arg('seeds')) : null, seedFrom: Number(arg('seed-from', 0)) });
  console.error('sensitivity: --jobs | --play <job> --out f | --plan | --sites <lever> | --selftest');
  return 2;
}
if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
