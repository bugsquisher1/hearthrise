// tools/balance-sim/styles.mjs — THE WAYS TO FIGHT THE SIMULATOR PLAYS (Tyler 2026-10-16/23: the worn set makes the role).
//
// A STYLE is its hunt role (src/data/hunt-roles.js id), the weapon ladder it climbs (src/data/gear-tiers.js GEAR_LADDERS
// 'weapon:<family>'), its off-hand and its armour line. gear.mjs dresses each one; this file only names them, so a reader that
// needs the list and not the dressing (the Balance Lab's browser bundle, tools/balance-lab/build.mjs) imports nothing else.
//
// PURE ESM. Data only. Imports nothing.

/* `role` is the src/data/hunt-roles.js id the party is built with. */
export const STYLES = Object.freeze({
  tank: Object.freeze({ role: 'tank', weapon: 'weapon:sword', offhand: 'shield', line: 'plate', label: 'Sword + shield (tank)' }),
  sword: Object.freeze({ role: 'melee_dps', weapon: 'weapon:sword', offhand: null, line: 'plate', label: 'Sword alone (Melee)' }),
  hammer: Object.freeze({ role: 'melee_dps', weapon: 'weapon:warhammer', offhand: null, line: 'plate', label: 'Two-hand hammer (Melee)' }),
  axes: Object.freeze({ role: 'melee_dps', weapon: 'weapon:hatchets', offhand: null, line: 'plate', label: 'Dual axes (Melee)' }),
  bow: Object.freeze({ role: 'ranger', weapon: 'weapon:bow', offhand: null, line: 'leather', label: 'Bow (Ranger)' }),
  crossbow: Object.freeze({ role: 'ranger', weapon: 'weapon:crossbow', offhand: 'shield', line: 'leather', label: 'Crossbow + shield (Ranger)' }),
  mage: Object.freeze({ role: 'mage', weapon: 'weapon:wand', offhand: 'spellbook', line: 'cloth', label: 'Wand + spellbook (Mage)' }),
  healer: Object.freeze({ role: 'healer', weapon: 'weapon:staff', offhand: null, line: 'cloth', label: 'Staff (Healer)' }),
});
