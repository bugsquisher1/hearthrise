// ════════════════════════════════════════════════════════════════════════
// src/shell/gear-gate.js — WHAT THE SERVER'S OWN SECTIONS ALREADY SAY ABOUT CHANGING GEAR.
//
// PURE. The screen never offers what the server refuses (CLAUDE.md §6; Tyler
// 2026-10-24, "Gear swapping isn't working": an Equip the engine refused said
// nothing). Two facts the client already holds from the server decide it:
//   the hero's hunt   open in the server's `hunt` section: the engine refuses
//                     every equip then (equip.js `hunt_open`; gear changes in town)
//   the requirement   the item's catalogue row (a skill, or the hero's Level:
//                     item-lore.js needOf) against the server's own number
// A control these turn off says why beside it. When a number is not known yet the
// press is allowed and the server's answer is shown: never a client-only guess.
// ════════════════════════════════════════════════════════════════════════
import { huntOf } from '../session/hunt-sections.js?v=0.2.52';
import { skillsOf } from '../session/item-sections.js?v=0.2.52';
import { levelOf } from '../session/character-sections.js?v=0.2.52';
import { REFUSAL_VERB_WORDS } from '../data/refusal-words.js?v=0.2.52';
import { needOf } from './item-lore.js?v=0.2.52';

/** The words beside a gear control a running hunt turns off (one piece: the engine's own refusal line). */
export const GEAR_HUNT_WORDS = Object.freeze({
  one: REFUSAL_VERB_WORDS.equip.hunt_open,
  upgrades: 'Leave the hunt to put these on.',
});

/** True while the server holds this hero in an open hunt: its `hunt` section open and its state in combat, the two
 *  facts the engine's own check reads (equip.js), each replaced by every envelope. */
export function gearLocked(cs) {
  const h = huntOf(cs);
  const st = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  return !!h && !h.ended && !!st && st.active_kind === 'combat';
}

/** The hero's requirement for `id` in words against the server's numbers: { text, short }, or null (none). */
function gearNeed(cs, id) {
  const lv = levelOf(cs);
  return needOf(id, skillsOf(cs), lv ? lv.level : null);
}

/**
 * Why putting `id` on (or, with no id, taking a piece off) would be refused, in words, or '' when the server's
 * sections say nothing against it (or do not know yet).
 */
export function wearBlock(cs, id) {
  if (gearLocked(cs)) return GEAR_HUNT_WORDS.one;
  const need = id ? gearNeed(cs, id) : null;
  return need && need.short ? need.text + '.' : '';
}
