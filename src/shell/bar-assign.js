// ════════════════════════════════════════════════════════════════════════
// src/shell/bar-assign.js — PUT AN ITEM ON THE ACTION BAR (the bag's menu and drag).
//
// One intent: the whole bar restated (hr_action_set_options { slots }, the
// same wire the slot editor sends) with the item in the chosen slot, or the
// first empty one. A food slot starts as "eat when my HP is below 50%", a
// drink "when my mana is below 30%" (bar-draft.js startConditions), ammo with no test; the
// slot editor changes any of it. The bar on screen changes only when the
// server's re-read envelope says so.
//
// OWN STOCK BEFORE THE STORE (Tyler 2026-10-16; a slot names ONE item and the first slot that can fire, fires: 2026-10-21).
// With no slot named, the hero's own food or drink goes in front of the first store slot of its kind, on that slot's own
// conditions, and the rest shift down. The first empty slot sits behind the store's Thin Turnip Juice, and the engine would
// buy that for ever while the hero's own juice waited (crafter's panel 2026-11-01: 78 Turnip Juice untouched through a 160 min
// hunt). A slot the player names (a drag, `at`) is the player's order and is never moved.
// ════════════════════════════════════════════════════════════════════════
import { BAR_SLOTS } from '../data/hunt-hud.js?v=0.2.121';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.121';
import { attackItem } from '../core/hunt/conditions.js?v=0.2.121';
import { settingsOf, wireSlot } from '../session/hunt-sections.js?v=0.2.121';
import { kindOf } from './bag-model.js?v=0.2.121';
import { startConditions, moveOffWeapon } from './bar-draft.js?v=0.2.121';

const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;

/** Can this item go on a bar slot at all? */
export function barKind(id) {
  const k = kindOf(id);
  /* Only an ammo some weapon can shoot (conditions.js attackItem, the server's hr_hunt_action_ids): a rune fuels spells
     only (Tyler 2026-10-23, chosen on a spell's slot) and a whetstone sharpens a Melee weapon from the ammo slot (Andy
     a41: no one's shot), so neither has a bar slot of its own. */
  if (k === 'ammo' && !attackItem(id)) return null;
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
  const named = Number.isInteger(at) && at >= 0 && at < SLOTS;
  const free = named ? at : wire.findIndex((w) => !w);
  if (free < 0) return { ok: false, error: 'bar_full' };
  const action = { type: kind === 'ammo' ? 'attack_with_item' : 'consume', id };
  const store = named ? -1 : storeSlotFor(wire, id);
  if (store < 0) wire[free] = { action, conditions: startConditions(action), join: 'and' };
  else {
    const { conditions, join } = wire[store];
    /* an empty slot already in front of the store's needs nothing moved; else the store's and everything up to the gap step down */
    if (free > store) { wire.splice(free, 1); wire.splice(store, 0, null); }
    wire[Math.min(free, store)] = { action, conditions: conditions.map((c) => Object.assign({}, c)), join };
  }
  return cs.setHuntOptions(s.preset, { slots: wire });
}

/**
 * THE BAR AFTER A WEAPON SWAP: the moves the worn weapon can use step to the front of the bar's move slots, and the moves it
 * can't use wait behind them, in their order; null when the order already holds. Bow to club on an edited bar left Hunter's
 * Mark, Flame Volley and Precision Shot struck in slots 1-3 and Power Strike in 7 (QA 2026-11-04). NOTHING COMES OFF: a swap
 * that deleted them took a Healer's four staff spells for good, and wearing the staff again brought none back (report #79,
 * 2026-11-09). Swapping back puts the first weapon's moves in front again, in their old order. Food, drink and ammo never
 * move, and the moves keep the slots moves held. Pure, over the server's settings (`set.discipline`).
 */
export function barAfterSwap(set) {
  if (!set || !set.discipline) return null;
  const wire = Array.from({ length: SLOTS }, (_, i) => wireSlot(set.slots[i]));
  const at = [];
  for (let i = 0; i < SLOTS; i++) if (wire[i] && wire[i].action.type === 'ability') at.push(i);
  const moves = at.map((i) => wire[i]);
  const off = (w) => moveOffWeapon(set.discipline, w.action.id);
  const order = moves.filter((w) => !off(w)).concat(moves.filter(off));
  if (order.every((w, k) => w === moves[k])) return null;
  at.forEach((i, k) => { wire[i] = order[k]; });
  return wire;
}

/**
 * After an equip's yes that put a weapon or a shield in hand (the two set the discipline): restate the bar when the swap put a move it can't use in front, one more
 * intent, read back from the server. Its answer, or null with nothing to do: the caller's runIntent says a refusal.
 */
export function tidyBarAfterSwap(cs, ops) {
  const s = settingsOf(cs);
  const next = ops.weapon || ops.shield ? barAfterSwap(s) : null;
  if (!next) return null;
  return cs.setHuntOptions(s.preset, { slots: next });
}

/* The first working store slot of the kind this own stack is, whose place it takes; -1 with none on the bar. (A store row is no bag item: barKind holds it off this path.) */
function storeSlotFor(wire, id) {
  const c = CONSUMABLES[id];
  if (!c) return -1;
  return wire.findIndex((w) => w && w.enabled !== false && w.action.type === 'consume' && CONSUMABLES[w.action.id]
    && CONSUMABLES[w.action.id].kind === c.kind && CONSUMABLES[w.action.id].source === 'store');
}
