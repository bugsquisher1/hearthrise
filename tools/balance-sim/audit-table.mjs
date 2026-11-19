#!/usr/bin/env node
// tools/balance-sim/audit-table.mjs — THE 2026-11-15 PLAYTHROUGH AUDIT'S TWO BALANCE QUESTIONS, ON THE REAL SETTLE
// (designer, lane/d-audit-balance-1; PRIORITY_BOARD "2026-11-15 The audit's balance findings"). A measuring tool: it grades nothing.
//
//   node tools/balance-sim/audit-table.mjs food [--hours 1] [--seeds 2]   F5: how often a new hero eats, Levels 1 to 15, by ground,
//                                                                         tier, way to fight and gear (the start bar as shipped)
//   node tools/balance-sim/audit-table.mjs gold [--to 50] [--style tank]  F12: one hero's life where the game sends it, the gold it
//                                                                         banks by Level (coin and sold loot, less the store bill)
//
//   node tools/balance-sim/audit-table.mjs shield [--hours 2]             F8: a lone tank on each March ground at its floor and middle,
//                                                                         in the Coppercap Shield (the best there was) and in the tier's own
//
//   node tools/balance-sim/audit-table.mjs storefood [--hours 2] [--ground id] [--styles tank,hammer] [--with healer] [--kit arriving|level]
//                                                                         F14: a lone hero on Normal at each ground's floor and middle,
//                                                                         every way to fight, on each store food and nothing carried:
//                                                                         deaths, the food bill, what the hunt pays. `--with healer`
//                                                                         adds that seat beside the hero (a pair). THE KIT A HERO
//                                                                         ARRIVES IN by default (the designer's ruling 2026-11-18 row
//                                                                         2a: every store-food floor is measured in it): one gear tier
//                                                                         under the Level's best, every combat skill 10 under the
//                                                                         Level (Krell's Hold's A25 measure). `--kit level` plays the
//                                                                         old kit (the Level's best, skills at the Level)
//
// Every number is read off the engine's own events (cell.mjs, career.mjs). Nothing here computes a combat or gold number.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCellRunner } from './cell.mjs';
import { runCareer } from './career.mjs';
import { isMain } from '../../tests/_is-main.mjs';

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
  const c = runCareer(R, { id: 'F12:' + style, party: [style], startLevel: 1, targetLevel: to, maxHours: Number(arg('max', 400)), chunkH: 1,
    chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0, recommend });
  /* `--json file`: the career's trace kept, so `sinks` can spend it without hunting it again */
  if (arg('json', '')) (await import('node:fs')).writeFileSync(arg('json', ''), JSON.stringify({ style, to, hours: c.hours, reached: c.reached, trace: c.trace }));
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

/* F8's rows: [ground, Level]. The tank wears the Level's best everything; `old` holds the off-hand at the Coppercap Shield (guard 7). */
const SHIELD_ROWS = [['hasks_ford', 45], ['the_slake', 50], ['the_slake', 58], ['muster_barrows', 60], ['muster_barrows', 66], ['pyre_field', 70], ['pyre_field', 78], ['krells_hold', 85], ['krells_hold', 95]];

async function shield() {
  const R = await loadCellRunner(ROOT);
  const hours = Number(arg('hours', 2));
  console.log('ground | Level | shield | eats/h | store g/h | coin+loot g/h | taken/h | monsters land % | low HP p10 % | deaths | XP/h');
  for (const [ground, level] of SHIELD_ROWS) for (const old of [true, false]) {
    const cell = { id: ['F8', ground, level, old ? 'old' : 'new'].join(':'), ground, party: ['tank'], level, hours, seeds: 1,
      gear: old ? { also: { shield: 'coppercap_shield' } } : {} };
    let m;
    try { m = R.runCell(cell); } catch (e) { console.log([ground, level, old ? 'old' : 'new', 'ERROR ' + e.message].join(' | ')); continue; }
    const h = m.heroes[0];
    console.log([ground, level, h.kit.shield, (h.eatsPerH.own + h.eatsPerH.store).toFixed(1), h.storePerH, h.incomePerH, h.takenPerH, h.landedPct,
      h.encMinHpPct.p10, h.deaths, h.levelXpPerH].join(' | '));
  }
}

/* F14's rows: every open ground a hero walks to, at its floor and band middle. */
const STORE_FOODS = ['salted_shrimp', 'salted_trout', 'salted_lobster', 'salted_swordfish', 'salted_shark'];
const STORE_GROUNDS = { meadowbrook_thicket: [5, 10], wickstead: [8, 13], millrace_sewer: [8, 16], mosslight_glade: [16, 23], coppercap_warrens: [32, 41],
  hasks_ford: [45, 52], the_slake: [50, 57], muster_barrows: [55, 60, 65], pyre_field: [70, 80], krells_hold: [85, 97] };

/* THE KIT A STORE-FOOD FLOOR IS MEASURED IN (the designer's ruling 2026-11-18 row 2a, PRIORITY_BOARD "2026-11-18 Designer rulings"): the
   kit a hero ARRIVES in, one gear tier under the Level's best (gear.mjs tierOffset -1 on every slot group) with every combat skill
   ARRIVING_SKILL_GAP under the Level (at least 1). The Level's own kit, skills at the Level, is a kit nobody walks in wearing: the March
   floors were measured in it and missed the Hold's 8 deaths in 4 h on Salted Shrimp at 85 (lane/a-hunt-prep-truth, the full-game audit's
   A25). `level` keeps it for a what-if. Every seat of a pair arrives the same way. */
export const ARRIVING_SKILL_GAP = 10;
export function storeFoodCell({ ground, level, style, storeFood, mate = '', hours = 2, kit = 'arriving' }) {
  const party = mate ? [style, mate] : [style];
  const cell = { id: ['F14', ground, level, style, storeFood, mate, kit].join(':'), ground, party, level, hours, seeds: 1, bar: { storeFood } };
  if (kit === 'level') return cell;
  if (kit !== 'arriving') throw new Error('audit-table storefood: --kit arriving|level, not ' + kit);
  const sk = Math.max(1, level - ARRIVING_SKILL_GAP);
  return { ...cell, gear: { tierOffset: -1, only: 'all' }, skillsBySeat: party.map(() => ({ melee: sk, ranged: sk, magic: sk, defense: sk })) };
}

async function storefood() {
  const R = await loadCellRunner(ROOT);
  const hours = Number(arg('hours', 2)), only = arg('ground', ''), styles = arg('styles', FOOD_STYLES.join(',')).split(','), mate = arg('with', '');
  const foods = arg('foods', STORE_FOODS.join(',')).split(','), kit = arg('kit', 'arriving');
  console.log('kit: ' + (kit === 'arriving' ? 'arriving (one gear tier under the Level\'s best, combat skills ' + ARRIVING_SKILL_GAP + ' under the Level)' : 'the Level\'s best, skills at the Level'));
  console.log('ground | Level | way | store food | max HP | eats/h | store g/h | coin+loot g/h | net g/h | low HP p10 % | deaths | XP/h');
  for (const [ground, levels] of Object.entries(STORE_GROUNDS)) if (!only || only.split(',').includes(ground)) for (const level of levels) for (const s of styles) for (const storeFood of foods) {
    const cell = storeFoodCell({ ground, level, style: s, storeFood, mate, hours, kit });
    let m;
    try { m = R.runCell(cell); } catch (e) { console.log([ground, level, s, storeFood, 'ERROR ' + e.message].join(' | ')); continue; }
    const h = m.heroes[0];
    console.log([ground, level, s + (mate ? '+' + mate : ''), storeFood, h.maxHp, (h.eatsPerH.own + h.eatsPerH.store).toFixed(1), h.storePerH, h.incomePerH, h.profitPerH,
      h.encMinHpPct.p10, m.heroes.map((x) => x.deaths).join('+'), h.levelXpPerH].join(' | '));
  }
}

/* F28's rows: the March grounds at their floor. Kills an hour by monster and the coin an hour, for Tamsin's counts and gold
   (tally-tasks.js: a count is about an hour at the floor, the gold about 35% of that hour's coin). */
async function tally() {
  const R = await loadCellRunner(ROOT);
  const hours = Number(arg('hours', 2));
  console.log('ground | Level | party | kills/h | by monster | coin g/h a head | coin+loot g/h a head | deaths');
  for (const ground of ['hasks_ford', 'the_slake', 'muster_barrows', 'pyre_field', 'krells_hold']) for (const party of [['tank'], ['mage'], ['tank', 'bow', 'mage', 'healer']]) {
    const level = STORE_GROUNDS[ground][0];
    const m = R.runCell({ id: ['F28', ground, party.join('+')].join(':'), ground, party, level, hours, seeds: 1 });
    console.log([ground, level, party.join('+'), m.party.killsPerH, Object.entries(m.party.killsByPerH).map(([k, n]) => k + ' ' + n).join(', '),
      m.heroes.map((h) => h.coinPerH).join('/'), m.heroes.map((h) => h.incomePerH).join('/'), m.heroes.map((h) => h.deaths).join('+')].join(' | '));
  }
}

/* a module too (tests/balance-grade.mjs reads storeFoodCell): the modes run only when this is the program */
if (isMain(import.meta.url)) {
  if (mode === 'food') await food();
  else if (mode === 'tally') await tally();
  else if (mode === 'storefood') await storefood();
  else if (mode === 'shield') await shield();
  else if (mode === 'gold') await gold();
  else { console.error('usage: node tools/balance-sim/audit-table.mjs food|gold|shield|storefood|tally'); process.exit(2); }
}
