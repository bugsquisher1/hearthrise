#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/sensitivity/analyze.mjs — THE SENSITIVITY MATRIX AND THE INTERACTION TABLES, READ FROM THE PLAYED PARTS
// (lane/bl-sensitivity, Tyler 2026-11-21, Phases 4 and 5). It plays nothing: every number is arithmetic on the seed rows the engine
// answered (sensitivity.mjs parts).
//
//   node tools/balance-program/sensitivity/analyze.mjs --parts <dir> [--run <github run id>,...]   read every sens-*.json.gz under <dir>,
//                                       write data/parts/ (the raw rows), data/matrix.json (the derived matrix) and print the report
//   node tools/balance-program/sensitivity/analyze.mjs                                              the same from the committed data/parts/
//   --report oat|fx|all (default all)   --lever <id> (one lever's whole curve)   --exp <id>   --selftest
//
// HOW AN EFFECT IS READ. A point plays the same cells on the same dice as the base, so every cell and seed is a pair.
//   rate outcomes (damage, kills, XP, gold in, supplies ...):  per seed, the mean over a group's cells of (after - base) / the cell's base
//       mean. The estimate is the mean over seeds; its standard error is the seeds' spread over root n. Shown as a relative change.
//   share outcomes (low health, hunted share, net gold ...):   per seed, the mean over the cells of (after - base). Absolute.
//   deaths:  pooled over the group's cells and seeds, a rate in 1,000 hunted hero-hours before and after (a Poisson count).
// RESOLVED means the estimate is further from zero than T x its standard error (T is Student's t for the seed count: 3.18 at four
// seeds) and more than half a percent. Anything else is printed as noise, never as a small effect.
// ELASTICITY is ln(outcome ratio) / ln(lever multiplier): 1 means the outcome moves in proportion, 0 not at all, negative the other
// way. LOCAL is read between x0.9 and x1.1; LOW and HIGH at the ends of the lever's ladder. A lever whose three differ is nonlinear.
//
// SELFTEST: planted seed rows read back the planted effect with its sign, a copy reads as exactly zero and unresolved, noise alone
// is not resolved, a planted interaction is found and a pure product of two single effects reads as no interaction.
//
// Exit: 0 ran · 1 a selftest proof failed · 2 harness.
// mutant-anchors: none — the selftest reads planted rows in memory; no tracked file is patched
// ci-step: economy-selftests | Sensitivity matrix - a planted effect reads back with its sign, noise is not called an effect, and a planted interaction is found
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/sensitivity/analyze.mjs --selftest
// ci-run: node tools/balance-program/sensitivity/analyze.mjs --check-docs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../../tests/_is-main.mjs';
import { OUTCOMES } from '../baseline/outcomes.mjs';
import { readDoc, writeDoc, EXPERIMENTS, PART_SCHEMA } from './sensitivity.mjs';
import { leverList } from './levers.mjs';
/* the program's tier column (Normal alone since the tier rows retired, lane/retire-tier-chain): a constant of the program, read from its
   own home, never through a scratch tree's root */
import * as TIER_AXIS from '../../balance-sim/tier-axis.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
export const DATA_DIR = join(HERE, 'data');
export const PARTS_DIR = join(DATA_DIR, 'parts');
export const MATRIX_FILE = join(DATA_DIR, 'matrix.json');
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sdOf = (xs) => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const sig = (x, n = 4) => (finite(x) ? Number(x.toPrecision(n)) : null);
/* Student's t, two-sided 95%, by degrees of freedom */
const T95 = [null, 12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13];
const tOf = (n) => T95[Math.min(15, Math.max(1, n - 1))];

/* which outcomes read as a relative change; the rest are absolute. Deaths are pooled counts. */
const SHARE = new Set(['frontTakenShare', 'sustainRatio', 'huntedShare', 'lowHpP50', 'lowHpP10', 'lowHpP01', 'hpUnder30', 'hpUnder10', 'closeCallsPer12h', 'netPerH', 'netWithRaresPerH',
  'storeShare', 'deathTax', 'levelXpLostPerH', 'blessingGoldPerH', 'raresValuePerH', 'rareItemsPerH', 'rareRollsPerPartyH', 'monsterLandedPct']);
const POOLED = new Set(['deaths', 'deathsPer1000h']);
export const kindOf = (id) => (POOLED.has(id) ? 'deaths' : SHARE.has(id) ? 'abs' : 'rel');
/* the outcomes the matrix ranks and the effect vectors are built from */
export const CORE = Object.freeze(['dps', 'killsPerH', 'ttkS', 'takenPerH', 'healInPerH', 'deathsPer1000h', 'lowHpP10', 'huntedShare', 'levelXpPerH', 'netLevelXpPerH', 'hoursPerLevel',
  'mainSkillXpPerH', 'incomePerH', 'storePerH', 'netPerH', 'suppliesPerH', 'castsPerH', 'manaPotionsPerH']);
const STYLE_GROUP = { tank: 'melee', sword: 'melee', hammer: 'melee', axes: 'melee', bow: 'ranged', crossbow: 'ranged', mage: 'magic', healer: 'magic' };

/* ── THE GROUPS: [id, label, cell predicate]. A group is a set of cells an effect is averaged over. ─────────────────────────────── */
export function groupsOf(meta) {
  const loneRef = (c) => c.party === 1 && c.gear === 'mid' && c.tier === 'normal';
  const fourStd = (c) => c.party === 4;
  const g = [['all', 'every cell', () => true]];
  for (const L of [...new Set(meta.map((c) => c.L))].sort((a, b) => a - b)) g.push(['L:' + L, 'Level ' + L, (c) => c.L === L]);
  for (const w of [...new Set(meta.filter(loneRef).map((c) => c.styles[0]))]) g.push(['way:' + w, w + ' alone', (c) => loneRef(c) && c.styles[0] === w]);
  for (const s of ['melee', 'ranged', 'magic']) g.push(['style:' + s, s + ' alone', (c) => loneRef(c) && STYLE_GROUP[c.styles[0]] === s]);
  g.push(['party:1', 'lone heroes (MID, Normal)', loneRef], ['party:4', 'the four (MID, Normal)', (c) => fourStd(c) && c.gear === 'mid' && c.tier === 'normal']);
  /* the gear axis: the same seats at the same Levels on each gear state (Normal) */
  const gearSeats = new Set(meta.filter((c) => c.gear === 'low' && c.tier === 'normal').map((c) => c.L + '|' + c.comp));
  for (const s of ['low', 'mid', 'bis']) g.push(['gear:' + s, s.toUpperCase() + ' gear', (c) => c.gear === s && c.tier === 'normal' && gearSeats.has(c.L + '|' + c.comp)]);
  /* the tier axis: the same seats at the same Levels on each tier (MID) */
  const tierSeats = new Set(meta.filter((c) => c.tier === 'deadly' && c.gear === 'mid').map((c) => c.L + '|' + c.comp));
  for (const t of ['normal', 'dangerous', 'deadly']) g.push(['tier:' + t, t, (c) => c.tier === t && c.gear === 'mid' && tierSeats.has(c.L + '|' + c.comp)]);
  for (const t of ['normal', 'dangerous', 'deadly']) g.push(['four:' + t, 'the four on ' + t, (c) => fourStd(c) && c.gear === 'mid' && c.tier === t && c.L >= 30]);
  for (const L of [30, 60, 110]) g.push(['four@' + L, 'the four at Level ' + L + ' (MID, every tier)', (c) => fourStd(c) && c.gear === 'mid' && c.L === L]);
  /* the two lone seats that carry the tier axis, tier by tier (the hammer is the seat that dies) */
  for (const [w, name] of [['hammer', 'the hammer alone'], ['mage', 'the Mage alone']]) for (const t of ['normal', 'dangerous', 'deadly'])
    g.push([w + ':' + t, name + ' on ' + t + ' (MID, Levels 30 to 110)', (c) => c.party === 1 && c.styles[0] === w && c.gear === 'mid' && c.tier === t && c.L >= 30]);
  return g.map(([id, label, pick]) => ({ id, label, keys: meta.filter(pick).map((c) => c.key) })).filter((x) => x.keys.length);
}

/* ── ONE EFFECT ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/**
 * The effect of `after` against `base` on one outcome over one group of cells. base / after: { key: seed rows }, `col` the outcome's
 * column. Answers { kind, est, se, n, cells, resolved, perSeed } (rel: a relative change; abs: an absolute one) or, for deaths,
 * { kind, before, after, est, se, deathsB, deathsA, hoursB, hoursA, resolved }.
 */
export function effect(ids, base, after, keys, id) {
  const col = ids.indexOf(id), kind = kindOf(id);
  if (kind === 'deaths') {
    const dc = ids.indexOf('deaths'), hc = ids.indexOf('_hh');
    let dB = 0, dA = 0, hB = 0, hA = 0;
    for (const k of keys) { if (!base[k] || !after[k]) continue; for (const r of base[k]) { dB += r[dc] || 0; hB += r[hc] || 0; } for (const r of after[k]) { dA += r[dc] || 0; hA += r[hc] || 0; } }
    if (!(hB > 0 && hA > 0)) return null;
    const rB = (1000 * dB) / hB, rA = (1000 * dA) / hA;
    /* a Poisson count's variance is its mean; a count of zero is given half a death so a silent cell is not a certain one */
    const se = 1000 * Math.sqrt(Math.max(dB, 0.5) / hB ** 2 + Math.max(dA, 0.5) / hA ** 2);
    return { kind, before: sig(rB), after: sig(rA), est: sig(rA - rB), se: sig(se), deathsB: dB, deathsA: dA, hoursB: Math.round(hB), hoursA: Math.round(hA), resolved: Math.abs(rA - rB) > 2 * se };
  }
  const usable = [];
  let n = Infinity;
  for (const k of keys) {
    const b = base[k], a = after[k];
    if (!b || !a) continue;
    const m = Math.min(b.length, a.length);
    const bv = b.slice(0, m).map((r) => r[col]), av = a.slice(0, m).map((r) => r[col]);
    if (!bv.every(finite) || !av.every(finite)) continue;
    const B = mean(bv);
    if (kind === 'rel' && !(Math.abs(B) > 1e-9)) continue;
    usable.push({ bv, av, B });
    n = Math.min(n, m);
  }
  if (!usable.length || !(n >= 1)) return null;
  const perSeed = [];
  for (let s = 0; s < n; s++) perSeed.push(mean(usable.map((u) => (kind === 'rel' ? (u.av[s] - u.bv[s]) / Math.abs(u.B) : u.av[s] - u.bv[s]))));
  const est = mean(perSeed), sd = sdOf(perSeed), se = sd === null ? null : sd / Math.sqrt(n);
  const floor = kind === 'rel' ? 0.005 : 0;
  const resolved = se === null ? false : se === 0 ? Math.abs(est) > floor : Math.abs(est) > tOf(n) * se && Math.abs(est) > floor;
  return { kind, est: sig(est), se: sig(se), n, cells: usable.length, resolved, base: sig(mean(usable.map((u) => u.B))), perSeed };
}
/** ln of the outcome ratio a relative effect stands for (null when it cannot be read). */
const lnr = (e) => (e && e.kind === 'rel' && finite(e.est) && e.est > -0.999 ? Math.log(1 + e.est) : null);
/** The elasticity of an effect at multiplier m: rel -> ln r / ln m; abs and deaths -> the change a unit of ln m. */
export function elasticity(e, m) {
  if (!e || !finite(e.est) || m === 1) return null;
  const x = e.kind === 'rel' ? lnr(e) : e.est;
  return x === null ? null : sig(x / Math.log(m));
}

/* ── THE COMMITTED COPY OF A PART: the seed rows of the outcomes the analysis reads, five significant digits ──────────────────── */
export const KEEP = Object.freeze(['dps', 'killsPerH', 'ttkS', 'pullsPerH', 'castsPerH', 'takenPerH', 'healInPerH', 'healOutPerH', 'shieldInPerH', 'regenPerH', 'deaths', 'huntedShare',
  'lowHpP50', 'lowHpP10', 'hpUnder30', 'coinPerH', 'lootPerH', 'incomePerH', 'storePerH', 'blessingGoldPerH', 'netPerH', 'storeShare', 'suppliesPerH', 'foodPerH', 'manaPotionsPerH',
  'manaSpentPerH', 'levelXpPerH', 'netLevelXpPerH', 'hoursPerLevel', 'mainSkillXpPerH', 'defenseXpPerH', 'deathTax', '_hh', '_wall']);
/** A played part as it is committed: KEEP's columns, each number at five significant digits (an artifact keeps every column at six). */
export function packPart(d) {
  if (JSON.stringify(d.outcomeIds) === JSON.stringify(KEEP)) return d;
  const idx = KEEP.map((k) => d.outcomeIds.indexOf(k));
  if (idx.some((i) => i < 0)) throw new Error('analyze: the part lacks a column the committed copy keeps: ' + KEEP.filter((_, i) => idx[i] < 0).join(', '));
  const row = (r) => idx.map((i) => (finite(r[i]) ? Number(r[i].toPrecision(5)) : r[i] ?? null));
  return { ...d, outcomeIds: [...KEEP], packed: 'the columns the analysis reads, five significant digits',
    points: d.points.map((p) => (p.cells ? { ...p, cells: Object.fromEntries(Object.entries(p.cells).map(([k, rows]) => [k, rows.map(row)])) } : p)) };
}

/* ── READING THE PARTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function partFiles(dir) {
  const out = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^sens-.*\.json\.gz$/.test(f)) out.push(p); } };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}
/** Every point of every part: { ids, meta, scenarioHash, commits, base: { key: rows }, points: Map(id -> { levers, cells, refused, errors, reds, job }) }. */
export function loadParts(dir) {
  const docs = partFiles(dir).map((f) => ({ f, d: readDoc(f) }));
  if (!docs.length) throw new Error('analyze: no sens-*.json.gz under ' + dir);
  const first = docs[0].d;
  const points = new Map();
  let base = null, meta = null;
  const commits = new Set(), seedSets = new Set(), seen = new Map();
  for (const { f, d } of docs.sort((a, b) => (a.d.seedFrom || 0) - (b.d.seedFrom || 0))) {
    if (d.schema !== PART_SCHEMA) throw new Error('analyze: ' + f + ' is ' + d.schema);
    if (d.scenarioHash !== first.scenarioHash || JSON.stringify(d.outcomeIds) !== JSON.stringify(first.outcomeIds)) throw new Error('analyze: ' + basename(f) + ' played scenario ' + d.scenarioHash + ', not ' + first.scenarioHash);
    commits.add(d.commit);
    seedSets.add((d.seedFrom || 0) + '+' + d.seeds);
    if (d.meta && !meta) meta = d.meta;
    for (const p of d.points) {
      /* the same point on the same seeds twice is two plays of one thing (a re-run after a fix beside the run it replaces): refused,
         never read as more seeds */
      const once = p.id + '|' + (d.seedFrom || 0);
      if (seen.has(once)) throw new Error('analyze: point ' + p.id + ' (seeds from ' + (d.seedFrom || 0) + ') is in two parts: ' + basename(seen.get(once)) + ' and ' + basename(f) + '. Remove the one that was replaced');
      seen.set(once, f);
      if (p.id === 'base') { base = base || {}; for (const [k, rows] of Object.entries(p.cells || {})) base[k] = [...(base[k] || []), ...rows]; continue; }
      const q = points.get(p.id);
      if (!q) { points.set(p.id, { ...p, job: d.job, cells: { ...(p.cells || {}) } }); continue; }
      for (const [k, rows] of Object.entries(p.cells || {})) q.cells[k] = [...(q.cells[k] || []), ...rows];
    }
  }
  if (!base) throw new Error('analyze: no base part under ' + dir);
  return { ids: first.outcomeIds, meta, scenarioHash: first.scenarioHash, commits: [...commits], seedSets: [...seedSets], base, points, files: docs.map((x) => x.f) };
}

/* ── THE MATRIX ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const OUT_IDS = OUTCOMES.map((o) => o[0]).filter((id) => id !== 'deaths');
const slim = (e) => (e ? (e.kind === 'deaths' ? { k: 'd', b: e.before, a: e.after, e: e.est, s: e.se, r: e.resolved ? 1 : 0, n: [e.deathsB, e.deathsA] } : { k: e.kind === 'rel' ? 'r' : 'a', e: e.est, s: e.se, r: e.resolved ? 1 : 0, b: e.base }) : null);
/** One point against the base: { group id: { outcome id: slim effect } }. */
export function pointEffects(P, cells, groups, outIds = OUT_IDS) {
  const out = {};
  for (const g of groups) { const row = {}; for (const id of outIds) { const e = effect(P.ids, P.base, cells, g.keys, id); if (e) row[id] = slim(e); } out[g.id] = row; }
  return out;
}
const cosine = (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : null; };

/* why the engine refused a lever's step, where the reason was read (reproduced on one cell, the worker's own error text) */
const REFUSAL_NOTES = Object.freeze({
  attackInterval: 'the engine refuses it: src/core/hunt/tower.js throws "stairMs is under two engine swings" (the Tower\'s and the Catacombs\' stair clock is 4,000 ms, exactly two attack intervals). The slow side is read in the `clock` experiment, where both move',
});
export function buildMatrix(P, root = ROOT) {
  const groups = groupsOf(P.meta);
  const levers = leverList(root);
  const oat = {}, refused = [], problems = [];
  for (const lv of levers) {
    const steps = {};
    for (const m of lv.steps) {
      const p = P.points.get(lv.id + '=' + m);
      if (!p) continue;
      if (p.refused) { refused.push({ lever: lv.id, m, why: p.refused }); continue; }
      /* no cell started: the patched data did not pass the game's own validators (the worker exits on import; its reason is in the job's log) */
      if (!Object.keys(p.cells || {}).length) { refused.push({ lever: lv.id, m, why: REFUSAL_NOTES[lv.id] || 'no cell started: the game\'s own validators refused the patched data (the reason is in the job log)' }); continue; }
      if ((p.errors || []).length || (p.reds || []).length) problems.push({ point: p.id, errors: (p.errors || []).length, reds: (p.reds || []).length, first: (p.errors || [])[0] || (p.reds || [])[0] });
      steps[m] = pointEffects(P, p.cells, groups);
    }
    if (Object.keys(steps).length) oat[lv.id] = { kind: lv.kind, group: lv.group, label: lv.label, intends: lv.intends, steps };
  }
  /* ELASTICITIES: per lever, outcome and group: local (x0.9 to x1.1, or the two steps nearest 1), low (the least step), high (the greatest) */
  const elast = {};
  for (const [id, lv] of Object.entries(oat)) {
    const ms = Object.keys(lv.steps).map(Number).sort((a, b) => a - b);
    const lo = ms[0], hi = ms[ms.length - 1];
    const below = ms.filter((m) => m < 1).pop(), above = ms.find((m) => m > 1);
    elast[id] = {};
    for (const g of groups) {
      const row = {};
      for (const o of OUT_IDS) {
        const at = (m) => (m === undefined ? null : lv.steps[m][g.id][o] || null);
        const full = (e) => (e ? { kind: e.k === 'r' ? 'rel' : e.k === 'a' ? 'abs' : 'deaths', est: e.e, se: e.s } : null);
        const eLo = at(lo), eHi = at(hi), eB = at(below), eA = at(above);
        if (!eLo && !eHi) continue;
        const xOf = (e) => (e ? (e.k === 'r' ? (e.e > -0.999 ? Math.log(1 + e.e) : null) : e.e) : null);
        const local = eB && eA && xOf(eB) !== null && xOf(eA) !== null ? sig((xOf(eA) - xOf(eB)) / (Math.log(above) - Math.log(below))) : null;
        row[o] = { lo: elasticity(full(eLo), lo), local, hi: elasticity(full(eHi), hi), rLo: eLo ? eLo.r : 0, rHi: eHi ? eHi.r : 0, rLocal: (eB && eB.r) || (eA && eA.r) ? 1 : 0,
          anyResolved: ms.some((m) => (at(m) || {}).r) ? 1 : 0 };
      }
      elast[id][g.id] = row;
    }
    elast[id]._steps = { lo, hi, below, above };
  }
  /* THE EFFECT VECTORS (redundancy): each lever's elasticity on every cell and rate outcome, at its highest and its lowest step */
  const vecOuts = CORE.filter((o) => kindOf(o) === 'rel');
  const vectors = {};
  for (const [id] of Object.entries(oat)) {
    const { lo, hi } = elast[id]._steps;
    const v = [];
    for (const m of [lo, hi]) {
      const p = P.points.get(id + '=' + m);
      for (const c of P.meta) for (const o of vecOuts) { const e = effect(P.ids, P.base, p.cells, [c.key], o); const x = lnr(e); v.push(x === null ? 0 : x / Math.log(m)); }
    }
    vectors[id] = v;
  }
  const pairs = [];
  const idsL = Object.keys(vectors);
  const norm = (v) => Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length);
  for (let i = 0; i < idsL.length; i++) for (let j = i + 1; j < idsL.length; j++) {
    const c = cosine(vectors[idsL[i]], vectors[idsL[j]]);
    if (c !== null) pairs.push({ a: idsL[i], b: idsL[j], cos: sig(c, 3), normA: sig(norm(vectors[idsL[i]]), 3), normB: sig(norm(vectors[idsL[j]]), 3) });
  }
  pairs.sort((x, y) => Math.abs(y.cos) - Math.abs(x.cos));
  /* THE EXPERIMENTS: every point's effects, and each multi-factor point's interaction against its single-factor points */
  const fx = {};
  for (const exp of EXPERIMENTS) {
    const names = Object.keys(exp.factors);
    const idOf = (lv) => exp.id + ':' + names.map((n) => n + '=' + lv[n]).join(',');
    const pts = [];
    for (const [pid, p] of P.points) {
      if (!pid.startsWith(exp.id + ':')) continue;
      if (p.refused || !Object.keys(p.cells || {}).length) { pts.push({ id: pid, levers: p.levers, moved: names.filter((n) => p.levers[n] !== 1), effects: {}, inter: null, refused: p.refused || 'no cell started: the game\'s own validators refused the patched data' }); continue; }
      const moved = names.filter((n) => p.levers[n] !== 1);
      const row = { id: pid, levers: p.levers, moved, effects: pointEffects(P, p.cells, groups, CORE), inter: null };
      if (moved.length > 1) {
        const singles = moved.map((n) => P.points.get(idOf({ ...Object.fromEntries(names.map((x) => [x, 1])), [n]: p.levers[n] })));
        if (singles.every((s) => s && !s.refused && Object.keys(s.cells || {}).length)) row.inter = interaction(P, p.cells, singles.map((s) => s.cells), groups, CORE);
      }
      pts.push(row);
    }
    if (pts.length) fx[exp.id] = { what: exp.what, factors: exp.factors, points: pts };
  }
  return { groups: groups.map((g) => ({ id: g.id, label: g.label, cells: g.keys.length })), oat, elast, pairs: pairs.slice(0, 120), fx, refused, problems };
}

/**
 * The interaction of a multi-factor point: per seed, x(joint) - sum of x(single), where x is ln(1 + relative change) for a rate
 * outcome and the absolute change for a share. Zero means the single readings multiply (or add) to the joint one. Answers
 * { group: { outcome: { joint, predicted, inter, se, resolved } } }: for a rate outcome joint and predicted are RATIOS to the base.
 */
export function interaction(P, joint, singles, groups, outIds) {
  const out = {};
  for (const g of groups) {
    const row = {};
    for (const o of outIds) {
      if (kindOf(o) === 'deaths') {
        const ej = effect(P.ids, P.base, joint, g.keys, o), es = singles.map((s) => effect(P.ids, P.base, s, g.keys, o));
        if (!ej || es.some((e) => !e)) continue;
        const pred = ej.before + es.reduce((a, e) => a + e.est, 0), inter = ej.after - pred, se = Math.sqrt(ej.se ** 2 + es.reduce((a, e) => a + e.se ** 2, 0));
        row[o] = { joint: ej.after, predicted: sig(pred), base: ej.before, inter: sig(inter), se: sig(se), resolved: Math.abs(inter) > 2 * se ? 1 : 0 };
        continue;
      }
      const ej = effect(P.ids, P.base, joint, g.keys, o), es = singles.map((s) => effect(P.ids, P.base, s, g.keys, o));
      if (!ej || es.some((e) => !e)) continue;
      const n = Math.min(ej.n, ...es.map((e) => e.n)), rel = ej.kind === 'rel';
      const x = (v) => (rel ? (v > -0.999 ? Math.log(1 + v) : null) : v);
      const per = [];
      for (let s = 0; s < n; s++) { const j = x(ej.perSeed[s]), ss = es.map((e) => x(e.perSeed[s])); if (j === null || ss.some((v) => v === null)) { per.length = 0; break; } per.push(j - ss.reduce((a, b) => a + b, 0)); }
      if (!per.length) continue;
      const inter = mean(per), sd = sdOf(per), se = sd === null ? null : sd / Math.sqrt(per.length);
      const jx = x(ej.est), px = es.reduce((a, e) => a + x(e.est), 0);
      row[o] = { joint: sig(rel ? Math.exp(jx) : jx), predicted: sig(rel ? Math.exp(px) : px), inter: sig(inter), se: sig(se), base: ej.base,
        resolved: se !== null && (se === 0 ? Math.abs(inter) > 0.005 : Math.abs(inter) > tOf(per.length) * se && Math.abs(inter) > 0.01) ? 1 : 0 };
    }
    out[g.id] = row;
  }
  return out;
}

/* ── THE STRUCTURE OF THE BASE: what the unpatched tree itself says about caps and axes (no lever moved) ─────────────────────────── */
/** Per cell: the mean of each core outcome, and the SPAWN CEILING (every monster of a lap killed the instant its pack returns: the monsters a
    lap brings on the cell's tier x 3600 s / respawn, COMPUTED from src/data/hunt-grounds.js and hunt-tiers.js) and the share of it the cell's kills reach. */
export async function structure(P, root = ROOT) {
  const { pathToFileURL } = await import('node:url');
  const GM = await import(pathToFileURL(join(root, 'src/data/hunt-grounds.js')).href), G = GM.HUNT_GROUNDS;
  const TI = TIER_AXIS;
  const col = (id) => P.ids.indexOf(id);
  const rows = [];
  for (const c of P.meta) {
    const seeds = P.base[c.key];
    if (!seeds) continue;
    const m = (id) => { const v = seeds.map((r) => r[col(id)]).filter(finite); return v.length ? sig(mean(v)) : null; };
    const sd = (id) => { const v = seeds.map((r) => r[col(id)]).filter(finite); return v.length > 1 ? sig(sdOf(v)) : null; };
    const g = G[c.ground];
    const monsters = g ? g.pockets.reduce((a, p) => a + p.spawns.length, 0) : null;
    /* the pull a tier brings (hunt-tiers.js: the same for every party size), each pocket filled to it (hunt-grounds.js pullRows) */
    const row = g ? TI.tierRowOf(c.ground, c.tier) : null, pull = row ? TI.pullOfTier(row, c.party) : 0;
    const perLap = g ? g.pockets.reduce((a, _p, i) => a + GM.pullRows(g, i, pull).length, 0) : null;
    const ceiling = g ? Math.round((perLap * 3600000) / g.respawnMs) : null;
    const deaths = seeds.reduce((a, r) => a + (r[col('deaths')] || 0), 0), hh = seeds.reduce((a, r) => a + (r[col('_hh')] || 0), 0);
    rows.push({ key: c.key, L: c.L, gear: c.gear, party: c.party, comp: c.comp, tier: c.tier, ground: c.ground, respawnMs: g ? g.respawnMs : null, monsters, pull, perLap, ceiling,
      ceilingShare: ceiling ? sig(m('killsPerH') / ceiling, 3) : null, deaths, heroHours: Math.round(hh), deathsPer1000h: hh > 0 ? sig((1000 * deaths) / hh, 3) : null,
      cv: Object.fromEntries(['killsPerH', 'levelXpPerH', 'takenPerH', 'storePerH', 'netPerH'].map((id) => [id, m(id) ? sig(sd(id) / Math.abs(m(id)), 2) : null])),
      ...Object.fromEntries(CORE.filter((o) => o !== 'deathsPer1000h').map((o) => [o, m(o)])), pullsPerH: m('pullsPerH'), coinPerH: m('coinPerH'), foodPerH: m('foodPerH'), regenPerH: m('regenPerH'), deathTax: m('deathTax') });
  }
  return rows;
}

/** THE NOISE OF THE BASE, by outcome: over the cells, the seeds' spread as a share of the cell's mean (rate outcomes) or as it stands
    (share outcomes): the median cell and the worst cell. What a single cell can and cannot see before any lever moves. */
export function noiseTable(P) {
  const rows = [];
  for (const [id] of OUTCOMES) {
    if (kindOf(id) === 'deaths') continue;
    const col = P.ids.indexOf(id), rel = kindOf(id) === 'rel', xs = [];
    for (const c of P.meta) {
      const v = (P.base[c.key] || []).map((r) => r[col]).filter(finite);
      if (v.length < 2) continue;
      const m = mean(v), sd = sdOf(v);
      if (rel && !(Math.abs(m) > 1e-9)) continue;
      xs.push({ key: c.key, x: rel ? sd / Math.abs(m) : sd });
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a.x - b.x);
    rows.push({ id, kind: rel ? 'rel' : 'abs', cells: xs.length, median: sig(xs[Math.floor(xs.length / 2)].x, 3), p90: sig(xs[Math.floor(xs.length * 0.9)].x, 3), worst: sig(xs[xs.length - 1].x, 3), worstCell: xs[xs.length - 1].key });
  }
  return rows;
}

/* ── THE NAMED FINDINGS (Phase 4's six lists), read off the matrix by fixed rules so a re-run names the same things ───────────── */
const KEY_OUTS = Object.freeze(['dps', 'killsPerH', 'takenPerH', 'levelXpPerH', 'netLevelXpPerH', 'incomePerH', 'storePerH', 'netPerH']);
/* why a lever moved nothing, where the cause was read in the code (CONFIRMED) */
const DEAD_NOTES = Object.freeze({
  necroticCut: 'dark by design: every Necrotic row sits behind NECROTIC_STORM.live = false (src/data/necrotic-storm.js) and no default bar casts one',
  stormDrain: 'dark by design: every Storm row sits behind NECROTIC_STORM.live = false (src/data/necrotic-storm.js) and no default bar casts one',
  spellLeech: 'dark by design: the only life leech the engine reads is leechPm on the Necrotic drain spells, which sit behind NECROTIC_STORM.live = false. The life leech and mana leech imbuement rows (src/data/imbuements.js) are data no engine code reads',
  blessingCut: 'not played, a harness limit: a cell is handed its Blessings\' share by the harness (standards.mjs blessedShareAt through progression-grid.mjs buildCell), so the data row never reaches the fight',
});
const THROUGHPUT = Object.freeze(['dps', 'killsPerH', 'levelXpPerH', 'incomePerH', 'netLevelXpPerH']);
const SIDE_OUTS = Object.freeze(['dps', 'killsPerH', 'takenPerH', 'levelXpPerH', 'netLevelXpPerH', 'incomePerH', 'storePerH', 'suppliesPerH']);
export const FINDING_RULES = Object.freeze({
  dead: 'no core outcome resolved in any group at any step',
  intendedMiss: 'the largest elasticity on an intended outcome is under 0.05, or nothing resolved on it',
  sideEffect: 'an outcome the lever is not for moves with an elasticity of 0.5 or more (damage, kills, damage taken, XP, XP after deaths, gold in, the store bill, supplies. All cells). Damage, kills, XP and gold in count as one thing for a lever that is for any of them',
  byLevel: 'for a rate outcome, the high-step elasticity differs between two Levels by more than 0.3 and by more than a factor of two, or changes sign, both resolved',
  byStyle: 'at one step the outcome rises for one lone way and falls for another, both resolved and both past 2% (300 gold an hour for net gold)',
  redundant: 'two levers whose effect vectors (every cell, every core rate outcome, lowest and highest step) have a cosine of 0.9 or more, or -0.9 or less',
  nonlinear: 'the low-step and high-step elasticities differ by 0.25 or more and by 30% of the larger, both resolved',
});
export function findings(M) {
  const out = { dead: [], intendedMiss: [], sideEffect: [], byLevel: [], byStyle: [], redundant: [], nonlinear: [] };
  const levels = M.groups.filter((g) => g.id.startsWith('L:')).map((g) => g.id), ways = M.groups.filter((g) => g.id.startsWith('way:')).map((g) => g.id);
  for (const [id, lv] of Object.entries(M.oat)) {
    const E = M.elast[id];
    const anyRes = M.groups.some((g) => CORE.some((o) => E[g.id] && E[g.id][o] && E[g.id][o].anyResolved));
    if (!anyRes) { out.dead.push({ lever: id, why: DEAD_NOTES[id] || 'UNKNOWN: the planted data holds the scaled numbers and no outcome moved' }); continue; }
    const best = (r) => (r ? Math.max(0, ...[r.lo, r.local, r.hi].filter(finite).map(Math.abs)) : 0);
    for (const o of lv.intends) { const r = E.all[o]; if (!r || !r.anyResolved || best(r) < 0.05) out.intendedMiss.push({ lever: id, outcome: o, lo: r ? r.lo : null, local: r ? r.local : null, hi: r ? r.hi : null, resolved: r ? r.anyResolved : 0 }); }
    for (const o of CORE) {
      const r = E.all[o];
      if (!r || !r.anyResolved || kindOf(o) !== 'rel') continue;
      /* a side effect: not what the lever is for, and not just the same throughput under another name (damage, kills, XP and gold in move as one when nobody dies) */
      const sameThing = THROUGHPUT.includes(o) && lv.intends.some((x) => THROUGHPUT.includes(x)) && !(o === 'netLevelXpPerH' && E.all.levelXpPerH && Math.abs(best(r) - best(E.all.levelXpPerH)) > 0.2);
      if (SIDE_OUTS.includes(o) && !lv.intends.includes(o) && !sameThing && best(r) >= 0.5) out.sideEffect.push({ lever: id, outcome: o, lo: r.lo, local: r.local, hi: r.hi });
      if (KEY_OUTS.includes(o) && r.rLo && r.rHi && finite(r.lo) && finite(r.hi) && Math.abs(r.hi - r.lo) >= 0.25 && Math.abs(r.hi - r.lo) >= 0.3 * Math.max(Math.abs(r.hi), Math.abs(r.lo))) out.nonlinear.push({ lever: id, outcome: o, lo: r.lo, local: r.local, hi: r.hi, steps: [E._steps.lo, E._steps.hi] });
    }
    for (const o of KEY_OUTS) {
      const rel = kindOf(o) === 'rel';
      const per = !rel ? [] : levels.map((g) => ({ g, r: E[g] && E[g][o] })).filter((x) => x.r && x.r.rHi && finite(x.r.hi));
      if (per.length >= 2) {
        const hi = per.reduce((a, b) => (b.r.hi > a.r.hi ? b : a)), lo = per.reduce((a, b) => (b.r.hi < a.r.hi ? b : a));
        const flip = hi.r.hi > 0 && lo.r.hi < 0, wide = Math.abs(hi.r.hi - lo.r.hi) > 0.3 && Math.max(Math.abs(hi.r.hi), Math.abs(lo.r.hi)) > 2 * Math.min(Math.abs(hi.r.hi), Math.abs(lo.r.hi));
        if (flip || wide) out.byLevel.push({ lever: id, outcome: o, at: E._steps.hi, byLevel: Object.fromEntries(per.map((x) => [x.g, x.r.hi])), flip });
      }
      /* the step where the two sides are furthest apart, each side past the floor (2% for a rate, 300 gold an hour for net gold) */
      const floor = rel ? 0.02 : 300;
      let bestSplit = null;
      for (const m of Object.keys(lv.steps)) {
        const es = ways.map((g) => ({ g, e: lv.steps[m][g] && lv.steps[m][g][o] })).filter((x) => x.e && x.e.r && x.e.k !== 'd' && Math.abs(x.e.e) >= floor);
        const up = es.filter((x) => x.e.e > 0), down = es.filter((x) => x.e.e < 0);
        if (!up.length || !down.length) continue;
        const size = Math.min(Math.max(...up.map((x) => x.e.e)), Math.max(...down.map((x) => -x.e.e)));
        if (!bestSplit || size > bestSplit.size) bestSplit = { size, lever: id, outcome: o, m: Number(m), up: Object.fromEntries(up.map((x) => [x.g, x.e.e])), down: Object.fromEntries(down.map((x) => [x.g, x.e.e])) };
      }
      if (bestSplit) out.byStyle.push(bestSplit);
    }
  }
  out.redundant = M.pairs.filter((p) => Math.abs(p.cos) >= 0.9 && p.normA >= 0.05 && p.normB >= 0.05);
  out.sideEffect.sort((a, b) => Math.max(Math.abs(b.lo || 0), Math.abs(b.hi || 0)) - Math.max(Math.abs(a.lo || 0), Math.abs(a.hi || 0)));
  return out;
}

/* ── THE REPORT ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const pct = (x, d = 1) => (finite(x) ? (x >= 0 ? '+' : '') + (100 * x).toFixed(d) + '%' : '  n/a');
const num = (x, d = 2) => (finite(x) ? (x >= 0 ? '+' : '') + x.toFixed(d) : ' n/a');
const showE = (e) => (!e ? 'n/a' : e.k === 'd' ? e.b + '->' + e.a + (e.r ? '' : '~') : (e.k === 'r' ? pct(e.e) : num(e.e, 3)) + (e.r ? '' : '~'));
function reportOat(M, out) {
  out('ONE-AT-A-TIME. A value marked ~ is not resolved from noise. Elasticity: ln(outcome ratio) / ln(lever multiplier).');
  const rank = {};
  for (const o of CORE) {
    rank[o] = Object.entries(M.elast).map(([id, e]) => { const r = e.all[o]; if (!r) return null; const best = Math.max(...[r.lo, r.local, r.hi].filter(finite).map(Math.abs), 0); return { id, lo: r.lo, local: r.local, hi: r.hi, best, res: r.anyResolved }; })
      .filter((x) => x && x.res).sort((a, b) => b.best - a.best);
  }
  for (const o of CORE) {
    out('\n' + o + ' (' + kindOf(o) + '): levers by influence, all cells [elasticity low / local / high]');
    for (const r of rank[o].slice(0, 12)) out('  ' + r.id.padEnd(20) + num(r.lo).padStart(8) + num(r.local).padStart(8) + num(r.hi).padStart(8));
  }
  return rank;
}
/* the matrix as a markdown table: a row a lever, a column a core outcome, the local elasticity, then (low / high) where either end
   differs from it by 0.15 or more. `.` is a cell where nothing resolved. --group picks the cells (default all). */
function mdMatrix(M, out, o = {}) {
  const g = o.group || arg('group', 'all');
  const cols = o.outcomes || (arg('outcomes') ? arg('outcomes').split(',') : CORE);
  const f = (x) => (finite(x) ? (Math.abs(x) < 0.005 ? '0' : x.toFixed(2)) : '?');
  out('| Lever | ' + cols.join(' | ') + ' |');
  out('|---|' + cols.map(() => '---').join('|') + '|');
  const size = (id) => Math.max(0, ...cols.map((o) => { const r = M.elast[id][g] && M.elast[id][g][o]; return r && r.anyResolved && kindOf(o) === 'rel' ? Math.max(...[r.lo, r.local, r.hi].filter(finite).map(Math.abs), 0) : 0; }));
  for (const id of Object.keys(M.oat).sort((a, b) => size(b) - size(a))) {
    const cells = cols.map((o) => {
      const r = M.elast[id][g] && M.elast[id][g][o];
      if (!r || !r.anyResolved) return '.';
      const mid = finite(r.local) ? r.local : finite(r.hi) ? r.hi : r.lo;
      const ends = [r.lo, r.hi].some((x) => finite(x) && Math.abs(x - mid) >= 0.15 && Math.abs(x - mid) >= 0.3 * Math.max(Math.abs(x), Math.abs(mid)));
      return f(mid) + (ends ? ' (' + f(r.lo) + ' / ' + f(r.hi) + ')' : '');
    });
    out('| ' + id + ' | ' + cells.join(' | ') + ' |');
  }
}
function reportLever(M, id, out) {
  const lv = M.oat[id];
  if (!lv) { out('no lever ' + id + ' in the data'); return; }
  const ms = Object.keys(lv.steps).map(Number).sort((a, b) => a - b);
  out('\n' + id + ' (' + lv.label + ', intends ' + lv.intends.join(', ') + ')');
  for (const g of ['all', 'party:1', 'party:4', 'L:10', 'L:30', 'L:60', 'L:110', 'style:melee', 'style:ranged', 'style:magic', 'tier:normal', 'tier:dangerous', 'tier:deadly', 'gear:low', 'gear:mid', 'gear:bis']) {
    if (!lv.steps[ms[0]][g]) continue;
    out('  ' + g);
    out('    ' + 'outcome'.padEnd(18) + ms.map((m) => ('x' + m).padStart(12)).join(''));
    for (const o of CORE) out('    ' + o.padEnd(18) + ms.map((m) => showE(lv.steps[m][g][o]).padStart(12)).join(''));
  }
}
function reportFx(M, id, out) {
  const x = M.fx[id];
  if (!x) { out('no experiment ' + id + ' in the data'); return; }
  out('\n' + id + ': ' + x.what);
  const names = Object.keys(x.factors);
  for (const g of ['all', 'party:1', 'party:4', 'four:normal', 'four:dangerous', 'four:deadly', 'style:magic', 'style:melee']) {
    out('  ' + g);
    for (const o of CORE) {
      const rows = x.points.filter((p) => p.inter && p.inter[g] && p.inter[g][o] && p.inter[g][o].resolved).sort((a, b) => Math.abs(b.inter[g][o].inter) - Math.abs(a.inter[g][o].inter)).slice(0, 4);
      for (const p of rows) { const i = p.inter[g][o]; out('    ' + o.padEnd(16) + names.map((n) => n + ' x' + p.levers[n]).join(', ').padEnd(58) + ' joint ' + String(i.joint).padStart(8) + '  singles say ' + String(i.predicted).padStart(8) + '  gap ' + num(i.inter, 3) + ' +/- ' + i.se); }
    }
  }
}

/* one lever's curve as a markdown table: a row an outcome, a column a step (--groups a,b: one table a group) */
function mdLever(M, id, out, o = {}) {
  const lv = M.oat[id];
  if (!lv) { out('no lever ' + id); return; }
  const ms = Object.keys(lv.steps).map(Number).sort((a, b) => a - b);
  const outs = o.outcomes || (arg('outcomes') ? arg('outcomes').split(',') : CORE);
  for (const g of o.groups || (arg('groups') || 'all').split(',')) {
    if (!lv.steps[ms[0]][g]) continue;
    out('\n' + id + ', ' + ((M.groups.find((x) => x.id === g) || {}).label || g) + '\n');
    out('| Outcome | ' + ms.map((m) => 'x' + m).join(' | ') + ' |');
    out('|---|' + ms.map(() => '---').join('|') + '|');
    for (const o of outs) out('| ' + o + ' | ' + ms.map((m) => showE(lv.steps[m][g][o]).trim()).join(' | ') + ' |');
  }
}
/* one experiment as markdown: for each outcome and group, every multi-factor point: the joint reading, what the single readings
   say, and the gap. --all prints unresolved gaps too. */
function mdExp(M, id, out, o = {}) {
  const x = M.fx[id];
  if (!x) { out('no experiment ' + id); return; }
  const names = Object.keys(x.factors);
  const outs = o.outcomes || (arg('outcomes') ? arg('outcomes').split(',') : CORE);
  const fixSpec = o.fix || arg('fix') || '';
  for (const g of o.groups || (arg('groups') || 'all').split(',')) for (const o of outs) {
    const rel = kindOf(o) === 'rel', dth = kindOf(o) === 'deaths';
    const show = (v) => (!finite(v) ? 'n/a' : rel ? 'x' + v.toFixed(3) : dth ? v.toFixed(1) : num(v, 3));
    const eff = (p) => { const e = p.effects[g] && p.effects[g][o]; return !e ? 'n/a' : e.k === 'd' ? e.a + (e.r ? '' : '~') : e.k === 'r' ? 'x' + (1 + e.e).toFixed(3) + (e.r ? '' : '~') : num(e.e, 3) + (e.r ? '' : '~'); };
    out('\n' + id + ', ' + o + ', ' + ((M.groups.find((q) => q.id === g) || {}).label || g) + (dth ? ' (deaths in 1,000 hours, base ' + (((x.points[0].effects[g] || {})[o] || {}).b) + ')' : rel ? ' (ratio to the base)' : ' (change from the base)') + '\n');
    out('| ' + names.join(' | ') + ' | measured | singles predict | gap |');
    out('|' + names.map(() => '---').join('|') + '|---|---|---|');
    const key = (p) => names.map((n) => p.levers[n].toFixed(3).padStart(8)).join('');
    /* fix=lever:value,...: only the points where those factors sit at those levels (a slice of a three-factor grid) */
    const fix = Object.fromEntries(String(fixSpec).split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split(':'); return [k, Number(v)]; }));
    for (const p of [...x.points].filter((q) => Object.entries(fix).every(([k, v]) => q.levers[k] === v)).sort((a, b) => key(a).localeCompare(key(b)))) {
      const i = p.inter && p.inter[g] && p.inter[g][o];
      if (!Object.keys(p.effects[g] || {}).length) { out('| ' + names.map((n) => 'x' + p.levers[n]).join(' | ') + ' | refused by the engine | | |'); continue; }
      if (p.moved.length > 1 && !i) { out('| ' + names.map((n) => 'x' + p.levers[n]).join(' | ') + ' | ' + eff(p) + ' | no single reading to compare (a lever alone was refused, or its base is zero here) | |'); continue; }
      if (p.moved.length > 1 && !i.resolved && !has('all')) { out('| ' + names.map((n) => 'x' + p.levers[n]).join(' | ') + ' | ' + eff(p) + ' | ' + show(i.predicted) + ' | within noise |'); continue; }
      out('| ' + names.map((n) => 'x' + p.levers[n]).join(' | ') + ' | ' + eff(p) + ' | ' + (i ? show(i.predicted) : 'single') + ' | ' + (i ? (rel ? pct(Math.exp(i.inter) - 1) : num(i.inter, dth ? 1 : 3)) + ' +/- ' + (rel ? (100 * i.se).toFixed(1) + '%' : i.se) : '') + ' |');
    }
  }
}

/* ── THE DOCUMENTS' GENERATED TABLES ────────────────────────────────────────────────────────────────────────────────────────────────
   A block in 04-sensitivity.md or 05-interactions.md that opens with <!-- GEN: kind key=value ... --> and closes with <!-- /GEN -->
   is re-written by --write-docs from the parts, so no table in the two documents is typed. Kinds:
     matrix group=<g> outcomes=a,b            the levers by outcomes table of elasticities
     lever id=<lever> groups=a,b outcomes=a,b one lever's curve
     exp id=<experiment> groups=a,b outcomes=a,b   one experiment's joint readings against its single readings
     list name=dead|intendedMiss|sideEffect|byLevel|byStyle|redundant|nonlinear|refused   one of the named lists */
export const DOCS = Object.freeze(['docs/design/balance-baseline/04-sensitivity.md', 'docs/design/balance-baseline/05-interactions.md']);
const f2 = (x) => (finite(x) ? (Math.abs(x) < 0.005 ? '0' : (x > 0 ? '+' : '') + x.toFixed(2)) : 'n/a');
function listTable(M, name) {
  const F = M.findings, L = [];
  const gl = (id) => id.replace(/^L:/, 'Level ').replace(/^way:/, '');
  if (name === 'dead') { L.push('| Lever | Why it moves nothing |', '|---|---|'); for (const x of F.dead) L.push('| ' + x.lever + ' | ' + x.why + ' |'); }
  else if (name === 'refused') { L.push('| Lever | Step | Why |', '|---|---|---|'); const by = new Map(); for (const x of M.refused) by.set(x.lever + '|' + x.why, [...(by.get(x.lever + '|' + x.why) || []), x.m]); for (const [k, ms] of by) { const [lever, why] = k.split('|'); L.push('| ' + lever + ' | ' + ms.map((m) => 'x' + m).join(', ') + ' | ' + why + ' |'); } }
  else if (name === 'intendedMiss') { L.push('| Lever | Meant to move | Elasticity low / local / high | Read |', '|---|---|---|---|'); for (const x of F.intendedMiss) L.push('| ' + x.lever + ' | ' + x.outcome + ' | ' + [x.lo, x.local, x.hi].map(f2).join(' / ') + ' | ' + (x.resolved ? 'resolved, and under 0.05' : 'nothing resolved') + ' |'); }
  else if (name === 'sideEffect') { L.push('| Lever | Outcome it is not for | Elasticity low / local / high |', '|---|---|---|'); for (const x of F.sideEffect) L.push('| ' + x.lever + ' | ' + x.outcome + ' | ' + [x.lo, x.local, x.hi].map(f2).join(' / ') + ' |'); }
  else if (name === 'nonlinear') { L.push('| Lever | Outcome | Low step | Local | High step |', '|---|---|---|---|---|'); for (const x of F.nonlinear) L.push('| ' + x.lever + ' | ' + x.outcome + ' | x' + x.steps[0] + ': ' + f2(x.lo) + ' | ' + f2(x.local) + ' | x' + x.steps[1] + ': ' + f2(x.hi) + ' |'); }
  else if (name === 'byLevel') { L.push('| Lever | Outcome | Step | Elasticity by Level | |', '|---|---|---|---|---|'); for (const x of F.byLevel) L.push('| ' + x.lever + ' | ' + x.outcome + ' | x' + x.at + ' | ' + Object.entries(x.byLevel).map(([g, v]) => gl(g) + ': ' + f2(v)).join(', ') + ' | ' + (x.flip ? 'changes sign' : '') + ' |'); }
  else if (name === 'byStyle') { const pc = (v, o) => (kindOf(o) === 'rel' ? pct(v) : num(v, 0)); L.push('| Lever | Outcome | Step | Rises for | Falls for |', '|---|---|---|---|---|'); for (const x of F.byStyle) L.push('| ' + x.lever + ' | ' + x.outcome + ' | x' + x.m + ' | ' + Object.entries(x.up).map(([g, v]) => gl(g) + ' ' + pc(v, x.outcome)).join(', ') + ' | ' + Object.entries(x.down).map(([g, v]) => gl(g) + ' ' + pc(v, x.outcome)).join(', ') + ' |'); }
  else if (name === 'redundant') { L.push('| Lever | Lever | Cosine of the effect vectors | Size of each |', '|---|---|---|---|'); for (const x of F.redundant) L.push('| ' + x.a + ' | ' + x.b + ' | ' + x.cos + ' | ' + x.normA + ' / ' + x.normB + ' |'); }
  else if (name === 'levers') {
    /* every lever of the pass: its id in the tables, its plain name, where it lives, the steps played */
    L.push('| Lever id | What it is | Kind | Steps played |', '|---|---|---|---|');
    for (const [id, lv] of Object.entries(M.oat)) L.push('| ' + id + ' | ' + lv.label + ' | ' + (lv.kind === 'knob' ? 'knob' : 'family') + ', ' + lv.group + ' | ' + Object.keys(lv.steps).map(Number).sort((a, b) => a - b).map((m) => 'x' + m).join(', ') + ' |');
  }
  else if (name === 'outcomes') {
    L.push('| Outcome id | What it is | Read as |', '|---|---|---|');
    for (const o of CORE) { const d = OUTCOMES.find((x) => x[0] === o); L.push('| ' + o + ' | ' + (d ? d[1].replace(/;/g, ',') : o) + ' | ' + (kindOf(o) === 'rel' ? 'relative change' : kindOf(o) === 'deaths' ? 'pooled rate' : 'absolute change') + ' |'); }
  }
  else if (name === 'rank') {
    /* each core outcome's strongest levers over all cells: the largest of the three elasticities, resolved ones only */
    L.push('| Outcome | Strongest levers (largest elasticity of low, local, high) |', '|---|---|');
    for (const o of CORE) {
      const rows = Object.entries(M.elast).map(([id, e]) => { const x = e.all[o]; if (!x || !x.anyResolved) return null; const vs = [x.lo, x.local, x.hi].filter(finite); if (!vs.length) return null; const best = vs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)); return { id, best }; })
        .filter(Boolean).sort((a, b) => Math.abs(b.best) - Math.abs(a.best)).slice(0, 7);
      L.push('| ' + o + (kindOf(o) === 'rel' ? '' : kindOf(o) === 'deaths' ? ' (deaths in 1,000 h a unit of ln)' : ' (absolute a unit of ln)') + ' | ' + rows.map((x) => x.id + ' ' + (kindOf(o) === 'rel' ? f2(x.best) : num(x.best, Math.abs(x.best) >= 10 ? 0 : 2))).join(', ') + ' |');
    }
  }
  else throw new Error('analyze: no list ' + name);
  if (L.length === 2) L.push('| none | ' + L[0].split('|').slice(2, -1).map(() => '').join(' | ') + ' |');
  return L;
}
export function genBlock(M, spec) {
  const [kind, ...rest] = spec.trim().split(/\s+/);
  const o = Object.fromEntries(rest.map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
  const L = [], out = (x) => L.push(...String(x).split('\n'));
  const lists = { groups: o.groups ? o.groups.split(',') : undefined, outcomes: o.outcomes ? o.outcomes.split(',') : undefined, group: o.group, fix: o.fix };
  if (kind === 'matrix') mdMatrix(M, out, lists);
  else if (kind === 'lever') mdLever(M, o.id, out, lists);
  else if (kind === 'exp') mdExp(M, o.id, out, lists);
  else if (kind === 'list') L.push(...listTable(M, o.name));
  else throw new Error('analyze: no generated block kind ' + kind);
  while (L.length && !L[0].trim()) L.shift();
  return L;
}
/** Re-write every generated block of the two documents; answers how many were written and which specs failed. */
export function writeDocs(M, root = ROOT, check = false) {
  let n = 0, stale = 0;
  const bad = [];
  for (const rel of DOCS) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const next = text.replace(/<!-- GEN: ([^>]*?) -->\n[\s\S]*?<!-- \/GEN -->/g, (all, spec) => {
      n++;
      try { return '<!-- GEN: ' + spec + ' -->\n' + genBlock(M, spec).join('\n') + '\n<!-- /GEN -->'; } catch (e) { bad.push(spec + ': ' + e.message); return all; }
    });
    if (next !== text) { stale++; if (!check) writeFileSync(file, next); }
  }
  return { blocks: n, stale, bad };
}

async function selftest() {
  const fails = [];
  const ok = (c, w) => { if (!c) fails.push(w); console.log((c ? '  ok   ' : '  FAIL ') + w); };
  const ids = ['x', 'lowHpP10', 'deaths', '_hh', '_wall'];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const mk = (f) => Object.fromEntries(['a', 'b', 'c'].map((k, ci) => [k, [0, 1, 2, 3].map((s) => f(ci, s))]));
  const b0 = mk((c, s) => [100 * (c + 1) + s, 0.5, c === 0 && s === 0 ? 1 : 0, 10, 10]);
  const up = Object.fromEntries(Object.entries(b0).map(([k, rows]) => [k, rows.map((r) => [r[0] * 1.2 * (1 + 0.004 * rnd()), r[1] - 0.1, r[2] * 3 + (k === 'b' ? 2 : 0), r[3], r[4]])]));
  const e1 = effect(ids, b0, up, ['a', 'b', 'c'], 'x');
  ok(e1 && Math.abs(e1.est - 0.2) < 0.01 && e1.resolved, 'a planted +20% reads +20% and resolved (' + (e1 && e1.est) + ')');
  const e2 = effect(ids, b0, b0, ['a', 'b', 'c'], 'x');
  ok(e2 && e2.est === 0 && !e2.resolved, 'a copy reads exactly zero and is not resolved');
  const noisy = Object.fromEntries(Object.entries(b0).map(([k, rows]) => [k, rows.map((r) => [r[0] * (1 + 0.2 * rnd()), r[1], r[2], r[3], r[4]])]));
  const e3 = effect(ids, b0, noisy, ['a', 'b', 'c'], 'x');
  ok(e3 && !e3.resolved, 'noise alone is not resolved (' + (e3 && e3.est) + ' +/- ' + (e3 && e3.se) + ')');
  const e4 = effect(ids, b0, up, ['a', 'b', 'c'], 'lowHpP10');
  ok(e4 && e4.kind === 'abs' && Math.abs(e4.est + 0.1) < 1e-9 && e4.resolved, 'a share outcome reads as an absolute change (-0.1)');
  const e5 = effect(ids, b0, up, ['a', 'b', 'c'], 'deathsPer1000h');
  ok(e5 && e5.deathsB === 1 && e5.deathsA === 11 && e5.resolved, 'deaths pool over cells and seeds (1 -> 11 in 120 hours)');
  ok(Math.abs(elasticity({ kind: 'rel', est: 1 }, 2) - 1) < 1e-9 && Math.abs(elasticity({ kind: 'rel', est: -0.5 }, 2) + 1) < 1e-9, 'elasticity: doubled by x2 is 1, halved by x2 is -1');
  const times = (f) => Object.fromEntries(Object.entries(b0).map(([k, rows]) => [k, rows.map((r) => [r[0] * f, r[1], r[2], r[3], r[4]])]));
  const P = { ids, base: b0 };
  const g = [{ id: 'all', keys: ['a', 'b', 'c'] }];
  const pure = interaction(P, times(1.5 * 0.8), [times(1.5), times(0.8)], g, ['x']).all.x;
  ok(pure && Math.abs(pure.inter) < 1e-3 && !pure.resolved, 'two single effects that multiply read as no interaction');
  const coupled = interaction(P, times(1.5), [times(1.5), times(0.8)], g, ['x']).all.x;
  ok(coupled && coupled.resolved && Math.abs(coupled.inter - Math.log(1 / 0.8)) < 2e-3, 'a planted interaction is found (' + (coupled && coupled.inter) + ')');
  console.log(fails.length ? 'SELFTEST FAILED: ' + fails.length : 'selftest: all proofs hold');
  return fails.length ? 1 : 0;
}

async function main() {
  if (has('selftest')) return selftest();
  const src = arg('parts') ? resolve(arg('parts')) : PARTS_DIR;
  /* --save: the parts read from --parts become the committed data (data/parts/); without --parts the committed data is read and
     the matrix written beside it. A bare --parts reads and prints, and writes nothing. */
  const save = has('save') || !arg('parts');
  if (arg('parts') && has('save')) {
    mkdirSync(PARTS_DIR, { recursive: true });
    for (const f of partFiles(src)) writeDoc(join(PARTS_DIR, basename(f)), packPart(readDoc(f)));
  }
  /* after --save the matrix is read from the committed copy (five digits), so what is written equals what a later run reads */
  const P = loadParts(arg('parts') && has('save') ? PARTS_DIR : src);
  const M = { ...buildMatrix(P), structure: await structure(P) };
  M.noise = noiseTable(P);
  if (has('noise')) {
    console.log('THE NOISE OF THE BASE (seed to seed, ' + P.seedSets.join(' ') + ' seeds): rate outcomes as a share of the mean, share outcomes as they stand');
    for (const r of M.noise) console.log('  ' + r.id.padEnd(22) + r.kind.padEnd(5) + ' median ' + String(r.median).padStart(9) + '  nine in ten under ' + String(r.p90).padStart(9) + '  worst ' + String(r.worst).padStart(9) + '  ' + r.worstCell);
    return 0;
  }
  M.findings = findings(M);
  M.findingRules = FINDING_RULES;
  const prev = existsSync(MATRIX_FILE) ? JSON.parse(readFileSync(MATRIX_FILE, 'utf8')) : {};
  const doc = { schema: 'hearthrise.balance-sensitivity-matrix/1', scenarioHash: P.scenarioHash, commits: P.commits, githubRuns: arg('run') ? arg('run').split(',') : prev.githubRuns || [], seedSets: P.seedSets,
    cells: P.meta, outcomes: OUTCOMES.map(([id, label, category, unit]) => ({ id, label, category, unit, kind: kindOf(id) })), core: CORE, ...M };
  /* matrix.json is the matrix a reader opens: every lever's effect on every outcome over ALL cells at every step, the elasticities of
     the core outcomes in every group, the findings, the base's structure and noise. The per-group effects and the experiments' tables
     are printed from the parts on demand, never stored twice. */
  if (save) {
    mkdirSync(DATA_DIR, { recursive: true });
    const have = new Set(P.ids);
    const oatAll = Object.fromEntries(Object.entries(M.oat).map(([id, lv]) => [id, { ...lv, steps: Object.fromEntries(Object.entries(lv.steps).map(([m, g]) => [m, { all: g.all }])) }]));
    const elastCore = Object.fromEntries(Object.entries(M.elast).map(([id, e]) => [id, Object.fromEntries(Object.entries(e).map(([g, row]) => [g, g === '_steps' ? row : Object.fromEntries(Object.entries(row).filter(([o, r]) => CORE.includes(o) && r.anyResolved).map(([o, r]) => [o, [r.lo, r.local, r.hi]]))]))]));
    const fxSlim = Object.fromEntries(Object.entries(M.fx).map(([id, x]) => [id, { what: x.what, factors: x.factors, points: x.points.length }]));
    const slimDoc = { ...doc, outcomes: doc.outcomes.filter((o) => have.has(o.id) || o.id === 'deathsPer1000h'), oat: oatAll, elast: elastCore, elastShape: 'elast[lever][group][outcome] = [low, local, high], resolved core outcomes only', fx: fxSlim, detail: 'every group and every experiment table is printed from data/parts (--lever, --exp, --md, --md-lever, --md-exp): it is not stored twice' };
    writeFileSync(MATRIX_FILE, JSON.stringify(slimDoc) + '\n');
  }
  const out = console.log;
  out('SENSITIVITY: ' + P.points.size + ' points over ' + P.meta.length + ' cells, scenario ' + P.scenarioHash + ', seeds ' + P.seedSets.join(' ') + ', ' + Object.keys(M.oat).length + ' levers, ' + Object.keys(M.fx).length + ' experiments');
  if (M.refused.length) { out('REFUSED: ' + M.refused.length); for (const r of M.refused) out('  ' + r.lever + ' x' + r.m + ': ' + r.why); }
  if (M.problems.length) { out('POINTS WITH AN ERROR CELL OR A TOOL RED: ' + M.problems.length); for (const r of M.problems.slice(0, 30)) out('  ' + r.point + ': ' + r.errors + ' errors, ' + r.reds + ' reds, ' + JSON.stringify(r.first).slice(0, 160)); }
  if (has('structure')) {
    out('THE BASE, cell by cell (kills an hour against the spawn ceiling on Normal; deaths pooled over the seeds)');
    for (const r of M.structure) out('  ' + r.key.padEnd(30) + String(r.ground).padEnd(17) + ' kills ' + String(r.killsPerH).padStart(6) + (r.ceiling ? ' / ' + String(r.ceiling).padStart(4) + ' = ' + (100 * r.ceilingShare).toFixed(0).padStart(3) + '%' : '              ') + '  xp ' + String(r.levelXpPerH).padStart(8) + ' net xp ' + String(r.netLevelXpPerH).padStart(8) + '  taken ' + String(r.takenPerH).padStart(7) + '  store ' + String(r.storePerH).padStart(7) + '  net ' + String(r.netPerH).padStart(7) + '  deaths ' + r.deaths + ' in ' + r.heroHours + ' h  lowP10 ' + r.lowHpP10 + '  cv(kills,xp) ' + r.cv.killsPerH + ' ' + r.cv.levelXpPerH);
    return 0;
  }
  if (has('findings')) {
    const F = M.findings, j = (o) => JSON.stringify(o);
    out('DEAD (' + FINDING_RULES.dead + '):'); for (const x of F.dead) out('  ' + x.lever.padEnd(20) + x.why);
    out('INTENDED OUTCOME NOT MOVED: ' + F.intendedMiss.length); for (const x of F.intendedMiss) out('  ' + x.lever.padEnd(20) + x.outcome.padEnd(18) + [x.lo, x.local, x.hi].map((v) => num(v)).join(' / ') + (x.resolved ? '' : '  nothing resolved'));
    out('SIDE EFFECTS OF 0.5 OR MORE: ' + F.sideEffect.length); for (const x of F.sideEffect) out('  ' + x.lever.padEnd(20) + x.outcome.padEnd(18) + [x.lo, x.local, x.hi].map((v) => num(v)).join(' / '));
    out('CHANGES WITH LEVEL: ' + F.byLevel.length); for (const x of F.byLevel) out('  ' + x.lever.padEnd(20) + x.outcome.padEnd(18) + 'x' + x.at + ' ' + j(x.byLevel) + (x.flip ? '  SIGN FLIP' : ''));
    out('OPPOSITE ACROSS STYLES: ' + F.byStyle.length); for (const x of F.byStyle) out('  ' + x.lever.padEnd(20) + x.outcome.padEnd(18) + 'x' + x.m + ' up ' + j(x.up) + ' down ' + j(x.down));
    out('REDUNDANT PAIRS: ' + F.redundant.length); for (const x of F.redundant) out('  ' + (x.a + ' ~ ' + x.b).padEnd(44) + 'cos ' + x.cos + '  size ' + x.normA + ' / ' + x.normB);
    out('NONLINEAR: ' + F.nonlinear.length); for (const x of F.nonlinear) out('  ' + x.lever.padEnd(20) + x.outcome.padEnd(18) + 'x' + x.steps[0] + ' ' + num(x.lo) + '  local ' + num(x.local) + '  x' + x.steps[1] + ' ' + num(x.hi));
    return 0;
  }
  if (has('write-docs') || has('check-docs')) {
    const w = writeDocs(M, ROOT, has('check-docs'));
    out((has('check-docs') ? 'check-docs: ' : 'write-docs: ') + w.blocks + ' generated block(s), ' + w.stale + ' document(s) ' + (has('check-docs') ? 'would change' : 're-written') + (w.bad.length ? ', FAILED: ' + w.bad.join(' | ') : ''));
    return w.bad.length || (has('check-docs') && w.stale) ? 1 : 0;
  }
  if (has('md')) { mdMatrix(M, out); return 0; }
  if (arg('md-lever')) { for (const id of arg('md-lever').split(',')) mdLever(M, id, out); return 0; }
  if (arg('md-exp')) { mdExp(M, arg('md-exp'), out); return 0; }
  const which = arg('report', 'all');
  if (arg('lever')) { reportLever(M, arg('lever'), out); return 0; }
  if (arg('exp')) { reportFx(M, arg('exp'), out); return 0; }
  if (which === 'oat' || which === 'all') reportOat(M, out);
  if (which === 'fx' || which === 'all') for (const id of Object.keys(M.fx)) reportFx(M, id, out);
  return 0;
}
if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
