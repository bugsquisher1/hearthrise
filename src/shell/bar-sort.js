// ════════════════════════════════════════════════════════════════════════
// src/shell/bar-sort.js — SORT AUTOMATICALLY: THE BAR LAID OUT THE WAY THE ENGINE READS IT.
//
// PURE. The engine tries a hero's slots in bar order, and in each LANE (conditions.js
// LANE_OF: moves, food and drink, ammo) the first slot that can fire, fires. The lanes run on
// their own, so laying them out left to right changes nothing the hero does; it makes the bar
// readable. Inside a lane the engine's own ammo rule (conditions.js attackOrder: a slot with
// conditions before a plain one, which would otherwise starve it) is applied to every lane,
// and a slot switched off goes to the end of its lane. The order the player had is kept
// otherwise (a stable sort), and empty slots go last. The ammo lane is attackOrder itself,
// so if the engine's rule moves, Sort follows it.
//
//   sortBar(bar)  the bar in the wire shape (null = empty) → a new bar of the same length
// Display scratch: nothing is sent here. The builder's Save sends the whole bar as ONE intent.
// ════════════════════════════════════════════════════════════════════════
import { LANE_OF, attackOrder } from '../core/hunt/conditions.js?v=0.2.128';
import { BAR_SLOTS } from '../data/hunt-hud.js?v=0.2.128';

const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;

/** The lanes, left to right: moves, then food and drink, then ammo. */
export const LANES = Object.freeze(['ability', 'consume', 'attack']);

const ruled = (s) => Array.isArray(s.conditions) && s.conditions.length > 0;

/* One lane's slots in firing order: the ammo lane by the engine's attackOrder (its rows carry the slot's own index, so
   nothing reads as the worn default), every other lane by the same rule written out: ruled first, then plain, stable. */
function laneOrder(lane, xs) {
  if (lane === 'attack') return attackOrder(xs.map((x) => ({ rule: 'b' + x.i, slot: x.s, x }))).map((r) => r.x);
  return xs.filter((x) => ruled(x.s)).concat(xs.filter((x) => !ruled(x.s)));
}

/**
 * The bar sorted: lanes left to right, in each the slots that can fire (ruled, then plain, in the order they had), then that
 * lane's switched-off slots in the order they had (they fire nowhere, so nothing starves behind them), and every empty slot
 * at the end. A slot of an unknown type keeps nothing of its place: it goes after the lanes, before the empties, so it is
 * never lost.
 */
export function sortBar(bar) {
  const list = Array.isArray(bar) ? bar : [];
  const n = Math.max(list.length, SLOTS);
  const filled = list.map((s, i) => ({ s, i })).filter((x) => x.s && x.s.action && typeof x.s.action.type === 'string');
  const out = [];
  for (const lane of LANES) {
    const mine = filled.filter((x) => LANE_OF[x.s.action.type] === lane);
    out.push(...laneOrder(lane, mine.filter((x) => x.s.enabled !== false)), ...mine.filter((x) => x.s.enabled === false));
  }
  for (const x of filled) if (!LANE_OF[x.s.action.type]) out.push(x);
  const sorted = out.map((x) => x.s);
  while (sorted.length < n) sorted.push(null);
  return sorted;
}
