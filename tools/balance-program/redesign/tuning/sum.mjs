#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/tuning/sum.mjs — ONE TABLE FROM THE TUNING PASS'S RUNS (lane/tuning-pass, 2026-11-23).
//
//   node tools/balance-program/redesign/tuning/sum.mjs [runs-dir] [--cfg c0,mf]
//
// Per cell of every v1-climb report in the directory: held step (mean, se), deaths, Level XP over the hours formula (payX), coin and income
// (coin + loot at the store's price) a hero-hour over wage(Level), the kit share (store bill over income), the front seat's share of the
// damage taken, kills a head an hour. Then the C-2 moves (paired, steps), Careful and Bold over Steady, and the band each ground's three
// Steady cells cut by the band rule (tools/lib/danger-band.mjs), with the C-2 moves in that band's depths.
// Exit 0 printed · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const DIR = resolve(ROOT, argv[0] && !argv[0].startsWith('--') ? argv[0] : 'tools/balance-program/redesign/tuning/runs');
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CFGS = arg('cfg', null) ? arg('cfg').split(',') : null;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { wage } = await imp('src/data/wage.js');
const { bandFromReports } = await imp('tools/lib/danger-band.mjs');
const { PAY, DEPTHS, BAND_RULE } = await imp('src/data/danger.js');
const { DANGER_GROUNDS, POWER } = await imp('src/data/danger.js');
const { HUNT_INDEX } = await imp('src/data/hunts.js');
const { BAND_ABS } = await imp('src/data/bands.js');
/* --weights a,b: the gear weights (POWER weightGearPm, weightGearBelowPm) the band's absolute points are read with (a candidate's) */
const [WA, WB] = arg('weights', POWER.weightGearPm + ',' + POWER.weightGearBelowPm).split(',').map(Number);
const GID = { muster: 'muster_barrows', ford: 'hasks_ford', bone: 'catacomb_bone_wing', flooded: 'catacomb_flooded_wing' };
/* src/core/bands.js depthAt on a band cut from these runs (its floor, ref and top own steps) and the formula's absolute points at WA / WB */
function depthWith(gid, band, step) {
  const g = DANGER_GROUNDS[gid], top = HUNT_INDEX[gid].band[1], T = 20;
  const rating = (L, gear) => L + (gear - L) * ((gear - L) < 0 ? WB : WA) / 1000;
  const fA = rating(g.entryLevel, g.gearLevel - T * BAND_ABS.freshTiersBack), rA = rating(g.refLevel, g.gearLevel), tA = rating(top, g.gearLevel + T * BAND_ABS.topTiersAhead);
  const p = [[band.floorStep, fA], [band.refStep, rA], [band.topStep, tA]];
  const [[a, A], [b, B]] = step <= p[1][0] ? [p[0], p[1]] : [p[1], p[2]];
  const abs = A + (step - a) * (B - A) / (b - a);
  return { depth: Math.max(1, Math.min(DEPTHS, 1 + Math.floor((abs - fA) * (DEPTHS - 1) / (tA - fA) + 0.5))), exact: 1 + (abs - fA) * (DEPTHS - 1) / (tA - fA), abs };
}
const f2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(2));
const f1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(1));

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const reps = {};
for (const f of files) {
  const cfg = f.replace(/-(muster|ford|bone|flooded)-.*$/, ''), rest = f.slice(cfg.length + 1, -5);
  if (CFGS && !CFGS.includes(cfg)) continue;
  reps[cfg + '/' + rest] = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
}
console.log('cell'.padEnd(44) + 'held   se  dth  payX  coin/w inc/w  kit  front kills/head');
for (const [k, r] of Object.entries(reps)) for (const [id, c] of Object.entries(r.cells)) {
  const w = wage(c.L), coin = c.gold.coinPerHeroH.mean / w, inc = c.gold.incomePerHeroH.mean / w;
  const kit = c.gold.storePerHeroH.mean / c.gold.incomePerHeroH.mean, front = c.takenShare && c.takenShare[0] ? c.takenShare[0].mean : null;
  console.log((k + ' ' + id + ' L' + c.L).padEnd(44) + f1(c.held.mean).padStart(5) + f1(c.held.se).padStart(5) + String(c.deaths).padStart(4) + f2(c.payX.mean).padStart(6)
    + f2(coin).padStart(7) + f2(inc).padStart(6) + f2(kit).padStart(6) + f2(front).padStart(6) + String(Math.round(c.killsPerH / 4)).padStart(7));
}
console.log('\nper config and ground: C-2 moves (steps, paired), stances over Steady (payX; income), the band the three Steady cells cut, the moves in its depths');
const groups = {};
for (const k of Object.keys(reps)) { const [cfg, rest] = k.split('/'), [g, part] = rest.split('-'); (groups[cfg + ' ' + g] = groups[cfg + ' ' + g] || {})[part] = reps[k]; }
for (const [name, G] of Object.entries(groups)) {
  if (!G.ref) continue;
  const c = G.ref.cells, m = G.ref.moves || {};
  const st = c['base:steady'], ca = c['base:careful'], bo = c['base:bold'];
  const ratio = (a, b, f) => (a && b ? f(a) / f(b) : null);
  const px = (x) => x.payX.mean, ic = (x) => x.gold.incomePerHeroH.mean;
  let band = null;
  if (G.floor && G.top) try { band = bandFromReports({ ref: G.ref, top: G.top, floor: G.floor }, PAY, DEPTHS, BAND_RULE); } catch (e) { band = { err: e.message }; }
  const width = band && band.band ? (band.band.topStep - band.band.floorStep) / (DEPTHS - 1) : null;
  const mv = (id) => (m[id] ? f1(m[id].mean) + '+-' + f1(m[id].se) + (width ? ' (' + f2(m[id].mean / width) + ' d)' : '') : '-');
  console.log(name.padEnd(16) + ' back ' + mv('back:steady') + '  up ' + mv('up:steady') + '  +3L ' + mv('levels:steady') + '  high ' + mv('high:steady')
    + '  careful/steady ' + f2(ratio(ca, st, px)) + ' / ' + f2(ratio(ca, st, ic)) + '  bold/steady ' + f2(ratio(bo, st, px)) + ' / ' + f2(ratio(bo, st, ic)));
  if (band && band.band) console.log(''.padEnd(16) + ' band ' + JSON.stringify(band.band) + ' ' + band.verdict + ', ' + f1(width) + ' steps a depth; LOW ' + f1(band.cells.floor.held) + ' (lowest ' + band.cells.floor.lowest + '), BIS ' + f1(band.cells.top.held) + (band.notes.length ? '  notes: ' + band.notes.join(' | ') : ''));
  else if (band) console.log(''.padEnd(16) + ' band: ' + band.err);
  if (band && band.band) {
    const gid = GID[name.split(' ')[1]], d = (s) => depthWith(gid, band.band, s), base = c['base:steady'].held.mean;
    const show = (id) => (c[id] ? id.split(':')[0] + ' ' + f2(d(c[id].held.mean).exact - d(base).exact) + ' d' : '');
    console.log(''.padEnd(16) + ' in depths (bands.js depthAt on this cut, weights ' + WA + '/' + WB + '): Steady ref depth ' + f1(d(base).exact) + '; ' + ['back:steady', 'up:steady', 'levels:steady', 'high:steady'].map(show).filter(Boolean).join(', ')
      + '; LOW lowest seed depth ' + f1(d(band.cells.floor.lowest).exact) + ', careful ' + (c['base:careful'] ? f1(d(c['base:careful'].held.mean).exact) : '-') + ', bold ' + (c['base:bold'] ? f1(d(c['base:bold'].held.mean).exact) : '-'));
  }
  for (const [p, r] of Object.entries(G)) if (p !== 'ref' && p !== 'floor' && p !== 'top') for (const [id, x] of Object.entries(r.cells)) console.log(''.padEnd(16) + ' ' + p + ' ' + id + ' held ' + f1(x.held.mean) + ' deaths ' + x.deaths + ' (' + x.seedsWithADeath + ' seeds) shares ' + x.takenShare.map((t) => t.style + ' ' + f2(t.mean)).join(' '));
}
