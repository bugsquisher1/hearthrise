// ════════════════════════════════════════════════════════════════════════
// src/shell/rune-supply.js — A RUNE SPELL'S SUPPLY, AS CONFIGURE ACTION SETS IT (pure).
//
// Tyler 2026-11-08 (RUNE SUPPLY PER SLOT; DECIDE IN CONFIGURE ACTION): a spell's slot spends only
// the carried runes the player ticked, the best ticked tier first, then buys from the rune shop or
// leaves the hunt. The rule is the engine's (src/core/hunt/conditions.js runeSupplyOf,
// src/core/hunt/abilities.js runeFor), and this module turns it into what the window lists and
// the edits it sends back:
//   carriedRunes(a, bag, skills)  the runes of the spell's family the bag holds, each { id, name,
//                                 have, ticked, locked, needs }: what "Use carried runes" lists
//   ownCount(a, bag)              how many of the slot's ticked runes the bag holds
//   startSupply(a, rows)          a freshly picked spell's supply: every rune of its family ticked,
//                                 the rune shop's Plain on empty (shown, changeable), else leave
//   withSupply(a, edit, rows)     the action after one edit: { useOwn }, { tick, on }, { onEmpty },
//                                 { store }. It never builds what the server refuses (bad_on_empty:
//                                 "leave" with nothing ticked; bad_store: "buy" with no shop rune)
// Every count is the server's bag, every price the server's store rows; nothing here spends anything.
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES, abilitySkill } from '../data/abilities.js?v=0.2.130';
import { ITEMS } from '../data/items.js?v=0.2.130';
import { runeTierOf, versionLevel } from '../data/runes.js?v=0.2.130';
import { runeSupplyOf } from '../core/hunt/conditions.js?v=0.2.130';
import { storeDefault } from './bar-draft.js?v=0.2.130';
import { itemName, skillName } from './widgets/bits.js?v=0.2.130';

const qtyOf = (bag, id) => (bag || []).reduce((n, l) => (l && l.id === id ? n + (Number(l.qty) || 0) : n), 0);

/** The runes of the slot's spell's family the bag (the server's rows, { id, qty }) holds, lowest tier first:
    [{ id, name, have, ticked, locked, needs }], `locked` when the hero's level in the spell's skill (the server's
    skills; unknown = not locked) has not reached its version. [] for a slot that spends no rune. */
export function carriedRunes(a, bag, skills) {
  const sup = runeSupplyOf(a);
  if (!sup) return [];
  const skill = abilitySkill(ABILITIES[a.id]);
  const lv = skills && skills[skill] && Number.isInteger(skills[skill].level) ? skills[skill].level : null;
  return sup.runes.filter((id) => qtyOf(bag, id) > 0).map((id) => {
    const need = versionLevel(runeTierOf(ITEMS[id]));
    return { id, name: itemName(id), have: qtyOf(bag, id), ticked: sup.own.includes(id), locked: lv !== null && lv < need, needs: skillName(skill) + ' ' + need };
  });
}

/** How many of the slot's ticked runes the bag holds (0 for a slot that spends no rune). */
export function ownCount(a, bag) {
  const sup = runeSupplyOf(a);
  return sup ? sup.own.reduce((n, id) => n + qtyOf(bag, id), 0) : 0;
}

/* The action with a supply written out whole (the shape the server stores). */
function written(a, own, onEmpty, store) {
  return Object.assign({ type: a.type, id: a.id, own: own.slice(), onEmpty }, onEmpty === 'store' && store ? { store } : {});
}

/** A freshly picked rune spell's supply: every rune of its family ticked, and on empty the rune shop's Plain rune
    (storeDefault: never a deeper tier, the player picks that), else leave. Any other action comes back as it was. */
export function startSupply(a, rows) {
  const sup = runeSupplyOf(a);
  if (!sup) return a;
  const st = storeDefault(a, rows);
  return written(a, sup.runes, st ? 'store' : 'leave', st);
}

/**
 * THE SLOT AFTER ONE EDIT in Configure action:
 *   { useOwn: true }   "Use carried runes" on: every rune of the family ticked
 *   { useOwn: false }  off: nothing ticked, so the rune shop is the slot's one supply
 *   { tick, on }       one carried rune ticked or not (none ticked reads as the box off)
 *   { onEmpty }        'store' (buy from the rune shop) or 'leave' (leave the hunt)
 *   { store }          the shop rune to buy
 * With nothing ticked the slot buys (the server refuses "leave" with nothing to run out of), and buying names
 * the shop rune it had, else Plain. `rows` are the server's store rows.
 */
export function withSupply(a, edit, rows) {
  const sup = runeSupplyOf(a);
  if (!sup || !edit) return a;
  let own = sup.own; let onEmpty = sup.onEmpty; let store = sup.store;
  if (edit.useOwn === true) own = sup.runes;
  else if (edit.useOwn === false) own = [];
  else if (typeof edit.tick === 'string' && sup.runes.includes(edit.tick)) own = sup.runes.filter((id) => (id === edit.tick ? edit.on === true : own.includes(id)));
  if (edit.onEmpty === 'store' || edit.onEmpty === 'leave') onEmpty = edit.onEmpty;
  if (typeof edit.store === 'string') { store = edit.store; onEmpty = 'store'; }
  if (!own.length) onEmpty = 'store';
  if (onEmpty === 'store' && !store) store = storeDefault(a, rows);
  return written(a, own, onEmpty === 'store' && !store ? 'leave' : onEmpty, store);
}
