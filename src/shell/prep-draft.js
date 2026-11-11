// ════════════════════════════════════════════════════════════════════════
// src/shell/prep-draft.js — ONE SETUP'S DRAFT: A COPY THE BUILDER EDITS, SAVED AS ONE INTENT.
//
// PURE. The Hunt prep builder (windows/hunt-prep/builder.js) edits a COPY of one setup: its
// twenty slots in the wire shape, its stance, target, distance, chase and the gold to keep.
// The copy is built from the server's view of that setup (the envelope's `hunt_settings` for the
// setup in use, the on-demand read for another: src/session/preset-read.js) and never from a
// client default: an option the server did not send stays null and is not sent back. Save
// sends the whole draft as ONE hr_action_set_options(slot, preset, options) with every key the
// draft holds; the screen then changes only from the re-read. Nothing here spends or gates
// anything (CLAUDE.md §6): a draft is display scratch until Save.
//
//   draftFrom(set)          the copy of a settings-shaped view
//   draftKey(draft)         one string for "is it the same" (the base the draft was built from)
//   isDirty(draft, baseKey) has the player changed it
//   optionsOf(draft)        the ONE intent's options, every key the draft holds a value for
//   dropPlan(bar, from, to) a drag's drop: onto an empty slot it moves, onto a filled one they swap
//   clearedBar()            twenty empty slots
//   stepDistance(d, by)     the distance one tile closer or farther, inside HERO_DISTANCE
//   goldFloorOk(n)          a whole number of gold the server takes (GOLD_FLOOR)
// ════════════════════════════════════════════════════════════════════════
import { wireSlot } from '../session/hunt-sections.js?v=0.2.123';
import { BAR_SLOTS } from '../data/hunt-hud.js?v=0.2.123';
import { HERO_DISTANCE, HUNT_STANCES, TARGET_MODES } from '../data/rule-subjects.js?v=0.2.123';
import { GOLD_FLOOR } from '../data/hunt-sessions.js?v=0.2.123';
import { movePlan, swapPlan } from './bar-draft.js?v=0.2.123';

export const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const known = (v) => v !== null && v !== undefined;

/** The draft of a settings-shaped view (hunt-sections.js settingsView), or null for none. */
export function draftFrom(set) {
  if (!set || !Array.isArray(set.slots)) return null;
  return {
    slots: Array.from({ length: SLOTS }, (_, i) => wireSlot(set.slots[i])),
    stance: typeof set.stance === 'string' && own(HUNT_STANCES, set.stance) ? set.stance : null,
    targetMode: typeof set.targetMode === 'string' && own(TARGET_MODES, set.targetMode) ? set.targetMode : null,
    distance: Number.isInteger(set.distance) ? set.distance : null,
    chase: typeof set.chase === 'boolean' ? set.chase : null,
    goldFloor: Number.isInteger(set.goldFloor) ? set.goldFloor : null,
  };
}

/** One string for the whole draft: the base it was built from, and the dirty test. */
export function draftKey(d) {
  return d ? JSON.stringify(d) : '';
}

/** Has the player changed the draft since it was built from `baseKey`? */
export function isDirty(d, baseKey) {
  return !!d && draftKey(d) !== baseKey;
}

/**
 * THE ONE INTENT'S OPTIONS: the slots always, and each option the draft holds a value for, under the server's key
 * (hr_hunt_set_options: stance, target_mode, distance, chase, gold_floor). An option the server never sent is not sent
 * back: a null would reset it to its default, and the builder shows no default of its own.
 */
export function optionsOf(d) {
  const o = { slots: d.slots.slice() };
  if (known(d.stance)) o.stance = d.stance;
  if (known(d.targetMode)) o.target_mode = d.targetMode;
  if (known(d.distance)) o.distance = d.distance;
  if (known(d.chase)) o.chase = d.chase;
  if (known(d.goldFloor)) o.gold_floor = d.goldFloor;
  return o;
}

/** A drop of slot `from` on slot `to`: a move onto an empty slot, a swap with a filled one; null when nothing changes. */
export function dropPlan(bar, from, to) {
  if (!bar || !bar[from] || from === to) return null;
  return bar[to] ? swapPlan(bar, from, to) : movePlan(bar, from, to);
}

/** Twenty empty slots. */
export function clearedBar() {
  return Array.from({ length: SLOTS }, () => null);
}

/** The distance one step closer (-1) or farther (+1), held inside HERO_DISTANCE; unchanged when the draft has none. */
export function stepDistance(d, by) {
  if (!Number.isInteger(d.distance)) return d.distance;
  return Math.max(HERO_DISTANCE.min, Math.min(HERO_DISTANCE.max, d.distance + by));
}

/** Is `n` a gold floor the server takes: a whole number inside GOLD_FLOOR. */
export function goldFloorOk(n) {
  return Number.isSafeInteger(n) && n >= GOLD_FLOOR.min && n <= GOLD_FLOOR.max;
}
