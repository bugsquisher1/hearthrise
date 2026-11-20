// ════════════════════════════════════════════════════════════════════════
// src/data/basic-setups.js — ONE BASIC SETUP PER WEAPON TYPE (Tyler 2026-11-16: "when i say basic i mean basic").
//
// The Hunt prep builder's Basic setup press fills the picked setup's bar from the row of the weapon type that setup
// fights as: its ability DISCIPLINE (abilities.js DISCIPLINES), which the worn weapon and shield decide (hunt-roles.js
// ROLE_KEYS) and the server projects (hunt_settings.discipline). One row per discipline:
//   role    the role rule set its moves come from (rule-subjects.js ROLE_RULES): the moves the server already plays
//           for a bar left empty, in that order, each with its own measured trigger, keeping only the rows this
//           discipline holds (a sword alone gets Power Strike and Turning Cut from the Melee set, never Cleave)
//   heal    the heal added after the moves (Mend, every loadout's self-heal), or null when the rule set heals already
//           (the Healer's Greater Mend comes first in its own set)
//   food    the store food behind the hero's own food (bought each bite once the hero's own runs out)
//   drink   the store drink, the same
// Nothing clever: no tier picked for a ground, no "best" item. src/shell/basic-setup.js resolves a row against the
// server's projection: a move still waiting for its skill level is left off, the food and drink the hero carries most
// of go in front of the store's, and a rune spell names its family's Plain store rune as its default slot does.
// Every value is the Game Designer's to change here.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ABILITIES, DISCIPLINE_IDS } from './abilities.js?v=0.2.142';
import { ROLE_KEYS } from './hunt-roles.js?v=0.2.142';
import { ROLE_RULES } from './rule-subjects.js?v=0.2.142';
import { BASIC_INDEX } from './supply-basics.js?v=0.2.142';

const setup = (role, heal) => Object.freeze({ role, heal, food: 'salted_shrimp', drink: 'thin_turnip_juice' });

/* discipline -> its basic setup. */
export const BASIC_SETUPS = Object.freeze({
  shield: setup('tank', 'mend'),
  sword: setup('melee_dps', 'mend'),
  dual_axe: setup('melee_dps', 'mend'),
  club: setup('melee_dps', 'mend'),
  ranged: setup('ranger', 'mend'),
  destruction: setup('mage', 'mend'),
  restoration: setup('healer', null),
});

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  for (const d of DISCIPLINE_IDS) if (!BASIC_SETUPS[d]) out.push(d + ': no basic setup for a weapon type a hero can wield');
  for (const [d, row] of Object.entries(BASIC_SETUPS)) {
    const bad = (m) => out.push(d + ': ' + m);
    if (!DISCIPLINE_IDS.includes(d)) bad('not an ability discipline');
    /* The role a worn set of this discipline plays (ROLE_KEYS), so its rule set is the one the server plays for it. */
    if (!Object.values(ROLE_KEYS).some((k) => k.discipline === d && k.roles.includes(row.role))) bad('role ' + row.role + ' is not one its weapons play');
    if (!ROLE_RULES[row.role] || !ROLE_RULES[row.role].some((s) => ABILITIES[s.action.id] && ABILITIES[s.action.id].disciplines.includes(d))) bad('role ' + row.role + ' has no move this discipline holds');
    const h = row.heal === null ? null : ABILITIES[row.heal];
    if (row.heal !== null && !(h && h.lane === 'heal' && (h.universal || h.disciplines.includes(d)) && !h.unlock)) bad('heal ' + row.heal + ' is not a heal this discipline casts from Level 1');
    if (!(BASIC_INDEX[row.food] && BASIC_INDEX[row.food].kind === 'heal')) bad('food ' + row.food + ' is not a store food');
    if (!(BASIC_INDEX[row.drink] && BASIC_INDEX[row.drink].kind === 'mana')) bad('drink ' + row.drink + ' is not a store drink');
  }
  return out;
}
