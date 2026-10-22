// ════════════════════════════════════════════════════════════════════════
// src/shell/bar-assign.js — PUT AN ITEM ON THE ACTION BAR (the bag's menu and drag).
//
// One intent: the whole bar restated (hr_action_set_options { slots }, the
// same wire the slot editor sends) with the item in the chosen slot, or the
// first empty one. A food slot starts as "eat when my HP is below 50%", a
// drink "when my mana is below 30%" (bar-draft.js supplyDefault), ammo with no test; the
// slot editor changes any of it. The bar on screen changes only when the
// server's re-read envelope says so.
// ════════════════════════════════════════════════════════════════════════
import { BAR_SLOTS } from '../data/hunt-hud.js?v=0.2.25';
import { settingsOf, wireSlot } from '../session/hunt-sections.js?v=0.2.25';
import { kindOf } from './bag-model.js?v=0.2.25';
import { supplyDefault } from './bar-draft.js?v=0.2.25';

const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;

/** Can this item go on a bar slot at all? */
export function barKind(id) {
  const k = kindOf(id);
  return k === 'food' || k === 'drink' || k === 'ammo' ? k : null;
}

/** The slot index (0-based) the item already sits in on the server's bar, or -1. */
export function barIndexOf(cs, id) {
  const s = settingsOf(cs);
  return s ? s.slots.findIndex((sl) => !sl.empty && sl.item === id) : -1;
}

/** The key that fires a bar slot, as the bar labels it: 1..9, 0, then Shift+1..0. */
export function barKeyLabel(i) {
  if (!(i >= 0)) return '';
  const k = String((i % 10) + 1 === 10 ? 0 : (i % 10) + 1);
  return i < 10 ? k : '⇧' + k;
}

/**
 * Send the intent that puts `id` on the bar. Resolves to the session's answer,
 * or { ok:false, error } when there is no bar to put it on.
 * @param {object} cs     the CharacterSession
 * @param {string} id     the item
 * @param {number} [at]   the slot index; the first empty slot when omitted
 */
export async function assignToBar(cs, id, at) {
  const s = settingsOf(cs);
  const kind = barKind(id);
  if (!s) return { ok: false, error: 'no_bar' };
  if (!kind) return { ok: false, error: 'not_for_bar' };
  const wire = Array.from({ length: SLOTS }, (_, i) => wireSlot(s.slots[i]));
  const i = Number.isInteger(at) && at >= 0 && at < SLOTS ? at : wire.findIndex((w) => !w);
  if (i < 0) return { ok: false, error: 'bar_full' };
  const action = { type: kind === 'ammo' ? 'attack_with_item' : 'consume', id };
  wire[i] = { action, conditions: supplyDefault(action), join: 'and' };
  return cs.setHuntOptions(s.preset, { slots: wire });
}
