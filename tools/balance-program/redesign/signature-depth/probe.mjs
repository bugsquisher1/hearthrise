#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/probe.mjs — ONE SEED OF THE SIZE BAR'S OWN CELL, READ FOR A RULE'S MOMENTS (systems,
// lane/signatures-batch-3, 2026-11-27; 15 "A finding for batch 3: a rule that pays on a kill reads under ... read their moments first").
//
//   node tools/balance-program/redesign/signature-depth/probe.mjs <ground> <level> <styles> [--signatures a,b,c,d] [--add-moves a,b,c,d]
//        [--hours 2] [--seed 1000] [--risk steady]
//
// moments.mjs reads a rule's moments on play-ground's reference bar; this reads them on the cell batch3.sh sizes it on (v1-climb's `base`
// cell: progression-grid.mjs buildCell, MID kits, the played bars, real shopping, the Danger scale from step 0), in-process, one seed, so a
// rule whose moment the four never meets (a cast nobody casts, a line nobody crosses) shows before 12 seeds are spent on it. Prints, a
// seat a line: its casts an hour by move, the damage its reactions dealt (burst, reflect, carry, echo, poison), heals, shields and drinks
// an hour, its share of the blows taken; then the four's kills an hour and its Level XP a hero-hour.
// Exit 0 printed · 2 a bad argument.
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const [GROUND, LV, STY] = argv;
if (!GROUND || !Number.isInteger(Number(LV)) || !STY) { console.error('probe: <ground> <level> <styles> [--signatures ...] [--add-moves ...]'); process.exit(2); }
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { loadGridData, buildCell } = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const { loadCellRunner } = await imp('tools/balance-sim/cell.mjs');
const D = await loadGridData(ROOT), K = await loadKits(ROOT), R = await loadCellRunner(ROOT);
const list = (s) => (s ? s.split(',').map((x) => (x === '-' ? null : x)) : null);
const SIGS = list(arg('signatures')), ADD = arg('add-moves') ? arg('add-moves').split(',').map((x) => (x === '-' ? null : x.split('+'))) : null;
const b = buildCell(D, K, { L: Number(LV), gear: 'mid', styles: STY.split(','), tier: 'normal', ground: GROUND });
const cell = { ...b.cell, options: { risk: arg('risk', 'steady'), danger: 0 }, hours: Number(arg('hours', 2)), seeds: 1, trace: true, id: 'probe',
  seedBase: Number(arg('seed', 1000)), ...(SIGS ? { signatureBySeat: SIGS } : {}), ...(ADD ? { addMovesBySeat: ADD } : {}) };
const res = R.runCell(cell);
const REACT = ['burst', 'reflect', 'carry', 'echo', 'poison'];
const r1 = (x) => Math.round(x * 10) / 10;
for (const [i, h] of res.heroes.entries()) {
  const react = Object.fromEntries(Object.entries(h.dealtBy || {}).filter(([k]) => REACT.includes(k)).map(([k, n]) => [k, Math.round(n / Math.max(1e-9, h.hours))]));
  console.log(STY.split(',')[i] + (SIGS && SIGS[i] ? ' [' + SIGS[i] + ']' : '') + ': casts/h ' + JSON.stringify(h.castsPerH) + ' react/h ' + JSON.stringify(react)
    + ' healOut/h ' + h.healOutPerH + ' shieldIn/h ' + h.shieldInPerH + ' drinks/h ' + JSON.stringify(h.drinksPerH) + ' taken/h ' + h.takenPerH
    + ' xp/h ' + Math.round(h.levelXpPerH || (h.raw && h.raw.levelXp / Math.max(1e-9, h.hours)) || 0) + ' buys/h ' + JSON.stringify(h.buysPerH));
}
console.log('kills/h ' + r1((res.party && res.party.killsPerH) || 0) + ' pulls/h ' + r1((res.party && res.party.pullsPerH) || 0) + ' hours ' + r1((res.party && res.party.hours) || cell.hours));
