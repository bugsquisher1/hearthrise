#!/usr/bin/env node
// tools/balance-sim/risk-table.mjs — THE RISK LADDER, one screen (Tyler 2026-11-04 UTC: "harder mobs grant better loot and more exp ... it comes with risk").
//
//   node tools/balance-sim/sim.mjs --plan risk --workers 4 --out tools/balance-sim/out/risk
//   node tools/balance-sim/risk-table.mjs [--in tools/balance-sim/out/risk] [--write]
//
// Each row: a ground, how many Levels the hero stands under its floor, solo or party, and for each build (poor, average, optimized) the Level XP an hour, the net gold an
// hour after the store bill, and how long a hunt lasted (hours per death, the worst hero's in a party; "held" = no death in the cell's hours). Every number is read off the
// engine's cells; the only arithmetic here is pooling. --write commits the evidence as risk-summary.json beside the other summaries.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { round } from './stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const IN = resolve(arg('in', join(HERE, 'out', 'risk')));
const SHORT = { mill_cellar: 'Cellar', meadowbrook_thicket: 'Thicket', wickstead: 'Wickstead', millrace_sewer: 'Sewer', mosslight_glade: 'Glade', coppercap_warrens: 'Warrens' };
const cells = readFileSync(join(IN, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes);

const readCell = (c) => {
  const hs = c.heroes, hours = hs.reduce((s, h) => s + h.hours, 0);
  const w = (f) => hs.reduce((s, h) => s + (f(h) || 0) * h.hours, 0) / (hours || 1);
  const deaths = hs.reduce((s, h) => s + h.deaths, 0);
  return { xp: round(w((h) => h.levelXpPerH), 0), net: round(w((h) => h.profitPerH), 0), deaths, hours: round(hours, 1), hPerDeath: deaths ? round(hours / deaths, 2) : null, hp: Math.min(...hs.map((h) => h.encMinHpPct.p50 ?? 100)) };
};
const rows = new Map();
for (const c of cells) {
  const m = /^R(\d+)(\w+)$/.exec(c.cell.x || '');
  if (!m) continue;
  const k = [c.ground, Number(m[1]), c.cell.party.length].join('|');
  if (!rows.has(k)) rows.set(k, { ground: c.ground, gap: Number(m[1]), level: c.cell.level, size: c.cell.party.length, band: c.hunt.band });
  rows.get(k)[m[2]] = readCell(c);
}
const list = [...rows.values()].sort((a, b) => (a.band ? a.band[0] : 0) - (b.band ? b.band[0] : 0) || a.ground.localeCompare(b.ground) || a.size - b.size || a.gap - b.gap);
const life = (r) => (!r ? '-' : r.deaths === 0 ? 'held ' + r.hours + ' h' : r.hPerDeath < 1 ? 'dies in ' + Math.round(r.hPerDeath * 60) + ' min' : 'dies in ' + r.hPerDeath + ' h');
const one = (r) => (r ? (r.xp + ' XP/h ' + r.net + ' g/h ' + life(r) + ' (hp ' + r.hp + '%)') : '-');
console.log('| Ground | Levels under | Who | Poor | Average | Optimized |\n|---|---|---|---|---|---|');
for (const r of list) console.log('| ' + (SHORT[r.ground] || r.ground) + ' (L' + r.level + ') | ' + (r.gap || 'in range') + ' | ' + (r.size > 1 ? 'four' : 'solo') + ' | ' + one(r.poor) + ' | ' + one(r.average) + ' | ' + one(r.optimized) + ' |');
if (process.argv.includes('--write')) {
  writeFileSync(join(HERE, 'risk-summary.json'), JSON.stringify({ generated: new Date().toISOString(), rows: list }) + '\n');
  console.log('wrote risk-summary.json');
}
