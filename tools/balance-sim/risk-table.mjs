#!/usr/bin/env node
// tools/balance-sim/risk-table.mjs — THE RISK, one screen (Tyler 2026-11-04: "either A. The player or party dies, or B. They have to spend more on supplies to stay alive ... it's inherent in the game").
//
//   node tools/balance-sim/sim.mjs --plan risk --workers 4 --out tools/balance-sim/out/risk
//   node tools/balance-sim/sim.mjs --plan riskclimb --workers 4 --out tools/balance-sim/out/riskclimb
//   node tools/balance-sim/risk-table.mjs [--in tools/balance-sim/out/risk] [--climb tools/balance-sim/out/riskclimb] [--write]
//   node tools/balance-sim/sim.mjs --plan armor --workers 4 --out tools/balance-sim/out/armorA
//   node tools/balance-sim/risk-table.mjs --compare tools/balance-sim/out/armorA,tools/balance-sim/out/armorB   the same cells in two trees, side by side
//
// Each row: a ground, how many Levels the hero stands under its floor, solo or party, and for each build (poor, average, optimized) the Level XP an hour, the net gold an
// hour after the store bill, the supplies an hour (the store bill in gold, then every meal and drink, crafted ones included: crafted food costs its crafter, not this bill), and how long a
// hunt lasted (hours per death, across a party's heroes; "held" = no death in the cell's hours). --climb adds one Level on every ground its band doesn't sit under: pushing against the ground in
// range, same hero. Every number is read off the engine's cells; the only arithmetic here is pooling. --write commits the evidence as risk-summary.json beside the other summaries.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { round } from './stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const IN = resolve(arg('in', join(HERE, 'out', 'risk')));
const SHORT = { mill_cellar: 'Cellar', meadowbrook_thicket: 'Thicket', wickstead: 'Wickstead', millrace_sewer: 'Sewer', mosslight_glade: 'Glade', coppercap_warrens: 'Warrens' };
const loadCells = (dir) => readFileSync(join(dir, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes);

const life = (r) => (!r ? '-' : r.deaths === 0 ? 'held ' + r.hours + ' h' : r.hPerDeath < 1 ? 'dies in ' + Math.round(r.hPerDeath * 60) + ' min' : 'dies in ' + r.hPerDeath + ' h');
const readCell = (c) => {
  const hs = c.heroes, hours = hs.reduce((s, h) => s + h.hours, 0);
  const w = (f) => hs.reduce((s, h) => s + (f(h) || 0) * h.hours, 0) / (hours || 1);
  const deaths = hs.reduce((s, h) => s + h.deaths, 0);
  const meals = (h) => h.eatsPerH.own + h.eatsPerH.store + h.drinksPerH.own + h.drinksPerH.store;
  return { xp: round(w((h) => h.levelXpPerH), 0), net: round(w((h) => h.profitPerH), 0), store: round(w((h) => h.storePerH), 0), meals: round(w(meals), 0), deaths, hours: round(hours, 1), hPerDeath: deaths ? round(hours / deaths, 2) : null, hp: Math.min(...hs.map((h) => h.encMinHpPct.p50 ?? 100)) };
};
/* --compare A,B: one line per cell both runs played. Margin is coin + commons over the store bill (the +25-35% floor). */
const compare = arg('compare', null);
if (compare) {
  const [A, B] = compare.split(',').map((d) => new Map(loadCells(resolve(d)).map((c) => [c.id, c])));
  const say = (c) => { const r = readCell(c), hs = c.heroes, inc = hs.reduce((s, h) => s + h.incomePerH, 0), st = hs.reduce((s, h) => s + h.storePerH, 0);
    return r.xp + ' | ' + r.net + ' | ' + r.store + ' | ' + r.meals + ' | ' + (st ? Math.round((inc / st - 1) * 100) + '%' : '-') + ' | ' + life(r) + ' | ' + r.hp + '%'; };
  const rows = [...A.values()].filter((c) => B.has(c.id)).sort((a, b) => a.hunt.band[0] - b.hunt.band[0] || a.ground.localeCompare(b.ground) || a.cell.party.length - b.cell.party.length || a.cell.level - b.cell.level || String(a.cell.party).localeCompare(String(b.cell.party)) || a.cell.x.localeCompare(b.cell.x));
  const filter = arg('only', null);
  console.log('| Ground | Who | Level | Under | Build | A XP/h | A net | A supplies | A meals | A margin | A lasted | A low HP | B XP/h | B net | B supplies | B meals | B margin | B lasted | B low HP |\n|' + '---|'.repeat(19));
  for (const a of rows) {
    if (filter && !new RegExp(filter).test(a.id)) continue;
    console.log('| ' + (SHORT[a.ground] || a.ground) + ' | ' + (a.cell.party.length > 1 ? 'four' : a.cell.party[0]) + ' | ' + a.cell.level + ' | ' + (a.cell.level >= a.hunt.band[0] ? 'in' : a.hunt.band[0] - a.cell.level) + ' | ' + a.cell.x.slice(1) + ' | ' + say(a) + ' | ' + say(B.get(a.id)) + ' |');
  }
  process.exit(0);
}
const cells = loadCells(IN);
const rows = new Map();
for (const c of cells) {
  const m = /^R(\d+)(\w+)$/.exec(c.cell.x || '');
  if (!m) continue;
  const k = [c.ground, Number(m[1]), c.cell.party.length].join('|');
  if (!rows.has(k)) rows.set(k, { ground: c.ground, gap: Number(m[1]), level: c.cell.level, size: c.cell.party.length, band: c.hunt.band });
  rows.get(k)[m[2]] = readCell(c);
}
const list = [...rows.values()].sort((a, b) => (a.band ? a.band[0] : 0) - (b.band ? b.band[0] : 0) || a.ground.localeCompare(b.ground) || a.size - b.size || a.gap - b.gap);
const one = (r) => (r ? (r.xp + ' XP/h, net ' + r.net + ' g/h, supplies ' + r.store + ' g/h (' + r.meals + ' meals/h), ' + life(r) + ' (hp ' + r.hp + '%)') : '-');
console.log('| Ground | Levels under | Who | Poor | Average | Optimized |\n|---|---|---|---|---|---|');
for (const r of list) console.log('| ' + (SHORT[r.ground] || r.ground) + ' (L' + r.level + ') | ' + (r.gap || 'in range') + ' | ' + (r.size > 1 ? 'four' : 'solo') + ' | ' + one(r.poor) + ' | ' + one(r.average) + ' | ' + one(r.optimized) + ' |');
/* PUSHING AGAINST THE GROUND IN RANGE: one hero, one Level, every ground (riskclimb). */
const climbDir = arg('climb', null);
const climb = [];
if (climbDir) {
  for (const c of readFileSync(join(resolve(climbDir), 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes)) {
    climb.push({ ground: c.ground, band: c.hunt.band, level: c.cell.level, size: c.cell.party.length, build: c.cell.x.slice(1), ...readCell(c) });
  }
  climb.sort((a, b) => a.size - b.size || a.level - b.level || a.build.localeCompare(b.build) || a.band[0] - b.band[0] || a.ground.localeCompare(b.ground));
  console.log('\n| Who | Build | Ground | Under | XP/h | Net g/h | Supplies g/h | Meals/h | Lasted | Typical low HP |\n|---|---|---|---|---|---|---|---|---|---|');
  for (const r of climb) console.log('| ' + (r.size > 1 ? 'four' : 'solo') + ' L' + r.level + ' | ' + r.build + ' | ' + (SHORT[r.ground] || r.ground) + ' | ' + (r.level >= r.band[0] ? 'in range' : r.band[0] - r.level) + ' | ' + r.xp + ' | ' + r.net + ' | ' + r.store + ' | ' + r.meals + ' | ' + life(r) + ' | ' + r.hp + '% |');
}
if (process.argv.includes('--write')) {
  writeFileSync(join(HERE, 'risk-summary.json'), JSON.stringify({ generated: new Date().toISOString(), rows: list, climb }) + '\n');
  console.log('wrote risk-summary.json');
}
