#!/usr/bin/env node
// tools/balance-sim/steady-table.mjs — WHAT STEADY (src/data/jewelry.js, the earrings' miss perk) IS WORTH AT EACH SIZE, ON THE REAL SETTLE
// (lane/d-jewelry-2b, 2026-11-18: "Steady is weak in its intended case"). A measuring tool: it grades nothing and changes nothing.
//
//   node tools/balance-sim/steady-table.mjs [--pm 150,200,300] [--under 0,10,20] [--at glade,sewer] [--styles ...] [--hours 3] [--seeds 3]
//
// Fang Studs (Steady) against plain Fang Studs, the same seeds (paired dice), each size on a planted copy of the tree (tests/hunt-core/
// fixtures/h1.js plant; T3 set to 1.5x, Keen's rule). `--under N`: every combat skill at the Level but the way's main skill N under it,
// the miss case Steady is built for. Prints each cell, then the mean XP gain by size, case and group (all ways, melee, the rest).
// Every number is read off the engine's events (cell.mjs).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from './cell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PMS = String(arg('pm', '150,200,300')).split(',').map(Number);
const UNDER = String(arg('under', '0,10')).split(',').map(Number);
const STY = String(arg('styles', 'hammer,tank,sword,axes,bow,crossbow,mage,healer')).split(',');
const hours = Number(arg('hours', 3)), seeds = Number(arg('seeds', 3));
const AT = { sewer: ['millrace_sewer', 18], glade: ['mosslight_glade', 24] };
const places = String(arg('at', 'glade,sewer')).split(',');
const MAIN = { hammer: 'melee', tank: 'melee', sword: 'melee', axes: 'melee', bow: 'ranged', crossbow: 'ranged', mage: 'magic', healer: 'magic' };
const MELEE = new Set(['hammer', 'tank', 'sword', 'axes']);

const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
/* the row as written today, whatever its size: the plant swaps its two numbers */
const ROW = /steady: Object\.freeze\(\{ name: 'Steady', pm: Object\.freeze\(\{ 2: \d+, 3: \d+ \}\),/;
const anchor = (readFileSync(join(ROOT, 'src/data/jewelry.js'), 'utf8').match(ROW) || [])[0];
if (!anchor) { console.error('steady-table: no Steady row in src/data/jewelry.js'); process.exit(2); }

async function withPm(pm, fn) {
  const p = plant([['src/data/jewelry.js', anchor, "steady: Object.freeze({ name: 'Steady', pm: Object.freeze({ 2: " + pm + ', 3: ' + Math.round(pm * 1.5) + ' }),']],
    [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try { return await fn(await loadCellRunner(p.root)); } finally { p.done(); }
}
const cell = (R, at, s, under, earrings) => {
  const [ground, L] = AT[at];
  const patch = under ? { skillsBySeat: [{ melee: L, ranged: L, magic: L, defense: L, [MAIN[s]]: Math.max(1, L - under) }] } : {};
  const h = R.runCell({ id: ['steady', at, s, under, earrings].join(':'), ground, party: [s], level: L, hours, seeds, ...patch, gear: { also: { earrings } } }).heroes[0];
  return { xp: h.levelXpPerH, basic: (h.dealtBy && h.dealtBy.basic) || 0, deaths: h.deaths };
};

const plain = {};
await withPm(PMS[0], async (R) => { for (const at of places) for (const s of STY) for (const u of UNDER) plain[[at, s, u].join(':')] = cell(R, at, s, u, 'fang_studs'); });
console.log('size pm | place | way | under | XP/h plain | XP/h Steady | XP gain | basic damage gain | deaths plain/Steady');
const acc = {};
for (const pm of PMS) {
  await withPm(pm, async (R) => {
    for (const at of places) for (const s of STY) for (const u of UNDER) {
      const b = plain[[at, s, u].join(':')], x = cell(R, at, s, u, 'fang_studs_steady'), g = (x.xp / b.xp - 1) * 100;
      for (const grp of ['all', MELEE.has(s) ? 'melee' : 'other']) (acc[[pm, u, grp].join(':')] ||= []).push(g);
      console.log([pm, at, s, u, b.xp, x.xp, g.toFixed(2) + '%', b.basic ? ((x.basic / b.basic - 1) * 100).toFixed(1) + '%' : 'n/a', b.deaths + '/' + x.deaths].join(' | '));
    }
  });
}
console.log('\nsize pm | under | group | mean XP gain | min | max');
for (const [k, l] of Object.entries(acc)) {
  console.log(k.split(':').join(' | ') + ' | ' + (l.reduce((a, b) => a + b, 0) / l.length).toFixed(2) + '% | ' + Math.min(...l).toFixed(2) + '% | ' + Math.max(...l).toFixed(2) + '%');
}
