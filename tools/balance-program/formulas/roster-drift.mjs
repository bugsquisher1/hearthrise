#!/usr/bin/env node
// tools/balance-program/formulas/roster-drift.mjs — READ-ONLY: how many MONSTERS rows are the stat formula's (balance-sheet.js
// formulaStats at the row's Level, role, art tier, ground floor and fit), how many are hand rows, and which formula rows differ from it
// (balance program 41-formulas-combat.md, exception E-MON-HAND).
//   node tools/balance-program/formulas/roster-drift.mjs
import { MONSTERS } from '../../../src/data/monsters.js';
import { GROUND_ROSTER, formulaStats, FORMULA_EXCEPTIONS } from '../../../src/data/balance-sheet.js';
import { HUNT_GROUNDS } from '../../../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../../../src/data/hunts.js';

const all = Object.keys(MONSTERS);
const onRoster = new Map();
for (const [g, roster] of Object.entries(GROUND_ROSTER)) for (const [id, role] of Object.entries(roster)) if (!onRoster.has(id)) onRoster.set(id, { g, role });
let same = 0; const drift = [];
for (const [id, { g, role }] of onRoster) {
  const m = MONSTERS[id], ground = HUNT_GROUNDS[g];
  if (!m || !ground || !HUNT_INDEX[ground.hunt]) { drift.push(id + ' (no row or no ground ' + g + ')'); continue; }
  const floor = HUNT_INDEX[ground.hunt].band[0];
  const fit = (ground.pockets || []).some((p) => p.forParty) ? 'party' : ground.groupFit || 'both';
  const s = formulaStats({ level: m.level, role, tier: m.tier, floor, fit, ground: g });
  const off = ['hp', 'atk', 'aim', 'evasion', 'def'].filter((k) => m[k] !== s[k]);
  if (!off.length) same++;
  else drift.push(id + ' [' + g + ', ' + role + '] ' + off.map((k) => k + ' ' + m[k] + ' (formula ' + s[k] + ')').join(', ') + (FORMULA_EXCEPTIONS[id] ? '  NAMED' : ''));
}
const rostered = [...onRoster.keys()].filter((id) => MONSTERS[id]).length;
console.log('MONSTERS rows: ' + all.length + '   on a formula roster: ' + rostered + '   hand rows (on no roster): ' + (all.length - rostered));
console.log('roster rows equal to the formula on hp/atk/aim/evasion/def: ' + same + '   differing: ' + drift.length);
for (const d of drift) console.log('  ' + d);
const count = (f) => all.filter((id) => f(MONSTERS[id])).length;
console.log('rows with spells: ' + count((m) => Array.isArray(m.spells) && m.spells.length) + '   with boss phases: ' + count((m) => m.phases)
  + '   shooters: ' + count((m) => m.range) + '   with weaponWeak: ' + count((m) => m.weaponWeak) + '   with dropBonus: ' + count((m) => m.dropBonus));
