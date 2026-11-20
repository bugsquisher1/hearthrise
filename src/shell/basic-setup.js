// ════════════════════════════════════════════════════════════════════════
// src/shell/basic-setup.js — A WEAPON TYPE'S BASIC BAR, RESOLVED AGAINST WHAT THE SERVER SAYS THE HERO HAS.
//
// PURE. The Hunt prep builder's Basic setup (windows/hunt-prep/builder.js) and the new spell prompt's Add to bar
// (bar-assign.js addMovesOrOpen) write moves the same way, from the one row of src/data/basic-setups.js:
//   basicBar(o)            twenty slots in the wire shape for the setup's discipline (the server's), or null
//   moveSlot(id, d)        one move's slot: its role rule set's own trigger and rune supply (rule-subjects.js
//                          ROLE_RULES), else its suggested trigger (conditions.js suggestedConditions)
//   moveReady(id, d, sk)   can a hero of discipline `d` at skills `sk` cast it now (its list, its unlock level)
// Every input is the server's projection: `discipline` from hunt_settings (or the setup's read), `skills` from
// skillsOf, `carried` from carriedOf. A skill the server has not stated reads as level 1, so a move waiting for a
// level stays off (fail safe, CLAUDE.md §6). Nothing here sends: the builder's Save is the one intent.
// ════════════════════════════════════════════════════════════════════════
import { BASIC_SETUPS } from '../data/basic-setups.js?v=0.2.143';
import { ROLE_RULES } from '../data/rule-subjects.js?v=0.2.143';
import { ABILITIES, abilitySkill } from '../data/abilities.js?v=0.2.143';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.143';
import { BAR_SLOTS } from '../data/hunt-hud.js?v=0.2.143';
import { suggestedConditions } from '../core/hunt/conditions.js?v=0.2.143';

const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;
const copy = (v) => JSON.parse(JSON.stringify(v));

/** The basic setup row of discipline `d`, or null. */
export const basicSetupOf = (d) => (typeof d === 'string' && Object.prototype.hasOwnProperty.call(BASIC_SETUPS, d) ? BASIC_SETUPS[d] : null);

const levelIn = (skills, skill) => {
  const r = skills && skills[skill];
  return r && Number.isInteger(r.level) ? r.level : 1;
};

/** Can a hero of discipline `d` cast move `id` now: its own list or every list's (Mend), and its skill at its unlock level. */
export function moveReady(id, d, skills) {
  const r = ABILITIES[id];
  if (!r || r.active === false || !(r.universal || r.disciplines.includes(d))) return false;
  return !r.unlock || levelIn(skills, abilitySkill(r)) >= r.unlock;
}

/** Move `id` as a slot in the wire shape: as discipline `d`'s role rule set writes it (its measured trigger, its Plain store
    rune), else with its suggested trigger and no rune named (the server buys the family's Plain rune then: runeSupplyOf). */
export function moveSlot(id, d) {
  const row = basicSetupOf(d);
  const ruled = row ? (ROLE_RULES[row.role] || []).find((s) => s.action.id === id) : null;
  const action = ruled ? copy(ruled.action) : { type: 'ability', id };
  return { action, conditions: ruled ? copy(ruled.conditions) : suggestedConditions(action), join: 'and' };
}

/* A supply slot: the item, with the condition a new slot of it starts with (food under half HP, drink under 30% mana). */
const supplySlot = (id) => { const action = { type: 'consume', id }; return { action, conditions: suggestedConditions(action), join: 'and' }; };

/* The hero's own food or drink it carries the most of (a tie to the lower id), or null: the store's comes behind it. */
function ownMost(carried, kind) {
  let best = null;
  for (const l of Array.isArray(carried) ? carried : []) {
    const c = CONSUMABLES[l.id];
    if (!c || c.kind !== kind || c.source !== 'own' || !(l.qty > 0)) continue;
    if (!best || l.qty > best.qty || (l.qty === best.qty && l.id < best.id)) best = l;
  }
  return best ? best.id : null;
}

/**
 * THE BASIC BAR of the setup's weapon type, or null when its discipline has no row (none sent yet).
 *   o.discipline  the setup's ability discipline, the server's
 *   o.skills      { skill: { level } } (skillsOf), or null
 *   o.carried     [{ id, qty }] (carriedOf), or null
 * Moves first (its rule set's order, then the heal), then food (own, store), then drink (own, store); the rest empty.
 */
export function basicBar(o) {
  const d = o && o.discipline;
  const row = basicSetupOf(d);
  if (!row) return null;
  const moves = (ROLE_RULES[row.role] || []).map((s) => s.action.id).concat(row.heal ? [row.heal] : [])
    .filter((id, i, all) => all.indexOf(id) === i && moveReady(id, d, o.skills));
  const supplies = [ownMost(o.carried, 'food'), row.food, ownMost(o.carried, 'drink'), row.drink].filter(Boolean);
  const bar = moves.map((id) => moveSlot(id, d)).concat(supplies.map(supplySlot)).slice(0, SLOTS);
  while (bar.length < SLOTS) bar.push(null);
  return bar;
}
