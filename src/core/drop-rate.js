// ============================================================
// src/core/drop-rate.js — A DROP AUTHORED IN HUNTED HOURS, AS A PER-KILL CHANCE (systems, lane/drop-formula, 2026-11-22).
//
// src/data/drop-hours.js says what an hour means (chanceOf); this says how many of a ground's kills a hero sees an hour, so the hours can
// be turned into a per-kill chance on a real ground, and what depth does to the Rare odds:
//   killsHeadHour(ground)        the ground's reference kills a head an hour (danger.js refKillsOf: DANGER_GROUNDS refKillsHead, else
//                                PAY.refKillsHead), measured at refStep
//   killShares(ground)           { monster: share } of the ground's kills at refStep: each route pocket's pull at the reference step's
//                                size (danger.js dangerDial, the engine's own pull, hunt-grounds.js pullRows, the engine's own rows),
//                                counted over the route. A boss's wave (adds) is left out: they come at his half-health line, not a pull
//   rowChance(row, monster, g)   a drop row's per-kill chance: its `everyHours` over the monster's kills a hero-hour, rounded to
//                                DROP_HOURS.chDigits (a certainty, ch 1, stays 1)
//   depthOf(groundId, step)      the ground's "Depth N of 20" for a step (12-targets 3.1; the browser's danger-sections.js depthOf, in
//                                whole numbers here so the edge and the Lab read the same depth)
//   depthRarePm(groundId, step)  the Rare odds at that depth over the odds at the reference's own depth, permille (x1 at depth 1 to x3 at 20)
//   traitSlotsDropped(ground)    the Trait slots (gear-steps.js traitSlots) the ground's drop rows carry a piece of: a Rare's slot comes
//                                first (GEAR_STEPS.traitRoll.slotFirst), so only these can roll a Trait there
//
// tools/gen-drop-hours.mjs writes every scale ground's derived `ch` with this; tests/drop-formula.mjs holds them equal.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random: nothing here draws a die.
// ============================================================

import { DANGER_GROUNDS, DEPTHS } from '../data/danger.js';
import { DROP_HOURS, chanceOf, roundChance } from '../data/drop-hours.js';
import { MONSTERS } from '../data/monsters.js';
import { ITEMS } from '../data/items.js';
import { pullRows } from '../data/hunt-grounds.js';
import { dangerDial, refKillsOf } from './hunt/danger.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const rowOf = (groundId) => (own(DANGER_GROUNDS, groundId) ? DANGER_GROUNDS[groundId] : null);

/** The ground's reference kills a head an hour (null off the scale: no reference, no hours). */
export function killsHeadHour(ground) {
  return ground && rowOf(ground.id) ? refKillsOf(ground) : null;
}

/** Each monster's share of the ground's kills at its reference step, { monster: share }, summing to 1. Null off the scale. */
export function killShares(ground) {
  const row = ground && rowOf(ground.id);
  if (!row) return null;
  const size = dangerDial(ground, row.refStep).pull[0];
  const n = {};
  let total = 0;
  for (const p of ground.route) {
    for (const s of pullRows(ground, p, size)) { n[s.monster] = (n[s.monster] || 0) + 1; total += 1; }
  }
  const out = {};
  for (const [m, c] of Object.entries(n)) out[m] = c / total;
  return out;
}

/** A drop row's per-kill chance on `ground`: `row.everyHours` over the kills of `monster` a hero sees an hour (`monster` null: a ground
    row, every kill rolls it). A row with no hours keeps its `ch`. */
export function rowChance(row, monster, ground) {
  if (!row || !(Number(row.everyHours) > 0)) return row ? row.ch : null;
  const k = killsHeadHour(ground);
  const share = monster === null ? 1 : (killShares(ground) || {})[monster] || 0;
  const ch = chanceOf(row.everyHours, k * share);
  return ch === null ? null : roundChance(ch);
}

/** The hours a row's `ch` gives on `ground` (the inverse, for the generator's conversion and the reports). */
export function hoursOf(ch, monster, ground) {
  const k = killsHeadHour(ground);
  const share = monster === null ? 1 : (killShares(ground) || {})[monster] || 0;
  return ch > 0 && k > 0 && share > 0 ? 1 / (ch * k * share) : null;
}

/** "Depth N of 20" for `step` on a scale ground, whole numbers only (round half up), 1 to DEPTHS. Null off the scale. */
export function depthOf(groundId, step) {
  const row = rowOf(groundId);
  if (!row || !Number.isInteger(step)) return null;
  const span = Math.max(1, row.topStep - row.floorStep);
  const over = Math.max(0, step - row.floorStep);
  return Math.max(1, Math.min(DEPTHS, 1 + Math.floor((2 * over * (DEPTHS - 1) + span) / (2 * span))));
}

/* the depth multiplier, permille: x1 at depth 1, x3 at DEPTHS (DROP_HOURS.depthPm), straight */
const depthPmAt = (d) => {
  const [a, b] = DROP_HOURS.depthPm;
  return a + ((b - a) * (d - 1)) / (DEPTHS - 1);
};

/** The Rare odds at `step` over the odds at the ground's reference step, permille (the authored hours are the reference's). */
export function depthRarePm(groundId, step) {
  const row = rowOf(groundId);
  if (!row) return 1000;
  const d = depthOf(groundId, step), ref = depthOf(groundId, row.refStep);
  if (d === ref) return 1000;
  return (1000 * depthPmAt(d)) / depthPmAt(ref);
}

/** The Trait slot of an equip slot (gear-steps.js traitSlots: a ring Trait fits either ring), or null. */
export function traitSlotOf(equipSlot, traitSlots) {
  for (const [s, list] of Object.entries(traitSlots)) if (s === equipSlot || list.includes(equipSlot)) return s;
  return null;
}

/** The Trait slots `ground`'s drop rows carry a piece of: its monsters' rows and its own (a Catacomb wing's), sorted. */
export function traitSlotsDropped(ground, traitSlots, monsters = MONSTERS, items = ITEMS) {
  const ids = new Set();
  for (const p of ground.route) for (const s of (ground.pockets[p].pack || ground.pockets[p].spawns)) ids.add(s.monster);
  const rows = [...ids].flatMap((m) => (monsters[m] && monsters[m].drops) || []).concat(ground.drops || []);
  const out = new Set();
  for (const r of rows) { const it = items[r.id]; const s = it && it.slot ? traitSlotOf(it.slot, traitSlots) : null; if (s) out.add(s); }
  return [...out].sort();
}
