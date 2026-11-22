// ============================================================================
// src/core/gear-steps.js — A HERO'S GEAR IN POWER STEPS: THE STAND-IN (lane/r9-power-step, 2026-11-22).
//
// STAND-IN. The gear table in steps is lane/g-gear-steps' (src/data: tierSteps, slot weights summing to one, wearAhead; its interface,
// "base power in steps per slot", is posted in .claude/coordination/HANDOFFS.md). Until it lands this module answers the same two
// questions from today's item rows, so the engine (src/core/hunt/danger.js powerPm, member.js heroSnapshot) is built and measured against
// the interface, and G's merge swaps the body of this file for a read of its table. Nothing else in the engine reads gear in steps.
//   pieceSteps(it, items)       one piece's base power in steps: its tier (a piece with no `tier` row reads the tier of the plain bases at
//                               its item Level) x STAND_IN.tierSteps
//   tierStepsOf(tier)           a base tier's power in steps (the ground's base tier, DANGER_GROUNDS baseTier)
//   gearSteps(equipment, items) { off, def }: each rating's slots' pieceSteps at their weight (permille, each rating's sum 1000), whole
//                               steps. An empty slot, or a piece that is no armor in an armor slot, is 0.
// So one tier of base on every slot of a rating moves it by tierSteps by construction, at every Level.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================================

import { ARMOUR_WEIGHT } from '../data/core-model.js';

/* THE STAND-IN'S NUMBERS (04 section 10's tierSteps "about 20"; the weights STATED, the body and pants carrying most of a set). Not levers:
   lane/g-gear-steps owns them (tools/balance-program/levers/not-levers.mjs). */
const STAND_IN = Object.freeze({
  tierSteps: 20,
  offense: Object.freeze({ weapon: 1000 }),
  defense: Object.freeze({ body: 250, pants: 200, helmet: 150, boots: 150, gloves: 125, belt: 125 }),
});

/* The lowest item Level each tier's plain bases are worn at, per catalogue (a named piece with no tier reads the highest tier at or under
   its own Level). Once a catalogue. */
const FLOORS = new WeakMap();
function floorsOf(items) {
  let f = items ? FLOORS.get(items) : null;
  if (f) return f;
  const lo = new Map();
  for (const it of Object.values(items || {})) {
    const t = it && Number.isInteger(it.tier) ? it.tier : null, lv = Math.floor(Number(it && it.reqLv));
    if (t !== null && t > 0 && Number.isFinite(lv) && (!lo.has(t) || lv < lo.get(t))) lo.set(t, lv);
  }
  f = [...lo.entries()].sort((a, b) => a[0] - b[0]);
  if (items) FLOORS.set(items, f);
  return f;
}
function tierOf(it, items) {
  if (!it) return 0;
  if (Number.isInteger(it.tier) && it.tier > 0) return it.tier;
  const lv = Math.floor(Number(it.reqLv));
  let t = 0;
  for (const [tier, floor] of floorsOf(items)) if (Number.isFinite(lv) && floor <= lv) t = tier;
  return t;
}

/** A base tier's power in steps. */
export const tierStepsOf = (tier) => (Number.isInteger(tier) && tier > 0 ? tier * STAND_IN.tierSteps : 0);

/** One piece's base power in steps. */
export const pieceSteps = (it, items) => tierStepsOf(tierOf(it, items));

/** A hero's offense and defense ratings in whole steps, from the gear it wears. */
export function gearSteps(equipment, items) {
  const eq = equipment || {};
  const at = (slot) => (eq[slot] && items ? items[eq[slot]] : null);
  const rate = (weights, armor) => {
    let sum = 0;
    for (const [slot, w] of Object.entries(weights)) {
      const it = at(slot);
      if (it && (!armor || ARMOUR_WEIGHT[it.armourClass])) sum += w * pieceSteps(it, items);
    }
    return Math.round(sum / 1000);
  };
  return { off: rate(STAND_IN.offense, false), def: rate(STAND_IN.defense, true) };
}
