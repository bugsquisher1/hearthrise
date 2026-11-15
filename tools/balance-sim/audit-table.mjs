#!/usr/bin/env node
// tools/balance-sim/audit-table.mjs — THE 2026-11-15 PLAYTHROUGH AUDIT'S TWO BALANCE QUESTIONS, ON THE REAL SETTLE
// (designer, lane/d-audit-balance-1; PRIORITY_BOARD "2026-11-15 The audit's balance findings"). A measuring tool: it grades nothing.
//
//   node tools/balance-sim/audit-table.mjs food [--hours 1] [--seeds 2]   F5: how often a new hero eats, Levels 1 to 15, by ground,
//                                                                         tier, way to fight and gear (the start bar as shipped)
//   node tools/balance-sim/audit-table.mjs gold [--to 50] [--style tank]  F12: one hero's life where the game sends it, the gold it
//                                                                         banks by Level (coin and sold loot, less the store bill)
//
// Every number is read off the engine's own events (cell.mjs, career.mjs). Nothing here computes a combat or gold number.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCellRunner } from './cell.mjs';
import { runCareer } from './career.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];

/* F5's rows: the grounds a new hero is sent to, at the Levels it stands on them (hunts.js bands). The Cellar is Normal only. */
const FOOD_ROWS = [
  ['mill_cellar', [1, 3], ['normal']],
  ['meadowbrook_thicket', [5, 8, 12], ['normal', 'dangerous', 'deadly']],
  ['wickstead', [8, 12, 15], ['normal', 'dangerous', 'deadly']],
];
const FOOD_STYLES = ['tank', 'hammer', 'bow', 'mage'];
/* starter: the practice set and no armor (a hero who never opened the Shop); best: the Level's best gear it can get */
const FOOD_GEAR = { starter: { starter: true }, best: {} };

async function food() {
  const R = await loadCellRunner(ROOT);
  const hours = Number(arg('hours', 1)), seeds = Number(arg('seeds', 2));
  console.log('ground | tier | Level | way | gear | eats/h own+store | drinks/h | store g/h | coin+loot g/h | low HP p10 % | deaths | XP/h');
  for (const [ground, levels, tiers] of FOOD_ROWS) for (const tier of tiers) for (const level of levels) for (const s of FOOD_STYLES) for (const [gk, gear] of Object.entries(FOOD_GEAR)) {
    const cell = { id: ['F5', ground, tier, level, s, gk].join(':'), ground, party: [s], level, hours, seeds, startBar: true, gear,
      ...(tier === 'normal' ? {} : { options: { tier } }) };
    let m;
    try { m = R.runCell(cell); } catch (e) { console.log([ground, tier, level, s, gk, 'ERROR ' + e.message].join(' | ')); continue; }
    const h = m.heroes[0];
    console.log([ground, tier, level, s, gk, (h.eatsPerH.own + h.eatsPerH.store).toFixed(1), (h.drinksPerH.own + h.drinksPerH.store).toFixed(1),
      h.storePerH, h.incomePerH, h.encMinHpPct.p10, h.deaths, h.levelXpPerH].join(' | '));
  }
}

async function gold() {
  const R = await loadCellRunner(ROOT);
  const { BUILD } = await import(pathToFileURL(join(ROOT, 'src/build-info.js')).href);
  const { recommendedHunt } = await import(pathToFileURL(join(ROOT, 'src/shell/hunt-list.js')).href + '?v=' + BUILD.version);
  const recommend = (levels, n) => recommendedHunt(levels, n).hunt;
  const to = Number(arg('to', 50)), style = arg('style', 'tank');
  const c = runCareer(R, { id: 'F12:' + style, party: [style], startLevel: 1, targetLevel: to, maxHours: 400, chunkH: 1,
    chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0, recommend });
  let banked = 0, last = 0, prevH = 0;
  console.log('Level | hours | ground | net g/h (with rares) | store g/h | gold banked');
  for (const t of c.trace) {
    const dh = t.hours - prevH; prevH = t.hours;
    banked += (t.netPerH[0] || 0) * dh;
    const L = t.levels[0];
    if (L >= last + 5 || t === c.trace[c.trace.length - 1]) {
      last = L - (L % 5);
      console.log([L, t.hours, t.ground, t.netPerH[0], t.storePerH[0], Math.round(banked)].join(' | '));
    }
  }
  console.log('reached ' + c.reached[0] + ' in ' + c.hours + ' h, ' + c.trace.reduce((n, t) => n + t.deaths[0], 0) + ' deaths, gold banked ' + Math.round(banked));
}

if (mode === 'food') await food();
else if (mode === 'gold') await gold();
else { console.error('usage: node tools/balance-sim/audit-table.mjs food|gold'); process.exit(2); }
