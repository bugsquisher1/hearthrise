// ============================================================
// src/core/hunt/react-queue.js — WHAT SETS A REACTION OFF: the queue the fight's seams write and reactions.js drains (lane/talent-effects;
// docs/design/redesign/15 "New engine pieces", 16, 17).
//
// A hero's REACTIONS are rows the boundary writes on its unit (`reacts`, src/core/talents.js grantsOf: { id, on, do, ... }, and a worn
// Signature's, src/core/hunt/signature-rules.js; never persisted). The seams that see a moment (damage.js landHit: a hit, a crit, a kill, a
// hit taken, an ally hit, a fall toward the line, a shell broken, any monster's death, the hero's own health under a line; heal-rules.js
// landHeal: a cast heal landing; targeting.js: a taunt, a taunt lost) call queueOn for the heroes whose rows react to it; world-step.js drains the queue
// after every hook of the sub-step (reactions.js drainReactions), in the order the moments happened. While the queue drains nothing new
// is queued, so a reaction never sets off another (15: "a free cast, a reset or an explosion can't set off another one").
//
// The queue lives on the instance (one swing's), and is empty at every hook's end, so nothing of it is persisted and a settle cut
// anywhere between swings resumes the same fight.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { isHero } from './sides.js';

const NONE = Object.freeze([]);

/** The living heroes of instance `inst` that carry a reaction, read once a swing (`inst.reactors`; the boundary writes `reacts`). */
export function reactorsOf(inst) {
  if (!inst || !inst.world) return NONE;
  if (inst.reactors) return inst.reactors;
  const out = inst.world.units.filter((u) => isHero(u) && Array.isArray(u.reacts) && u.reacts.length);
  inst.reactors = out.length ? out : NONE;
  return inst.reactors;
}

/** Does unit `u` react to moment `on`. */
export const reactsOn = (u, on) => !!u && u.alive === true && Array.isArray(u.reacts) && u.reacts.some((r) => r.on === on);

/* A ROW'S READING OF THE MOMENT AS IT HAPPENS (a Signature's, src/data/signatures.js; read here, not when the queue drains, since the same
   hook may change it before then): `has` the moment's unit carries a live stack of that status (The Wood Book: "vs a chilled target"),
   `belowPm` the moment's unit is under that share of its max health (Cairn Belt: "below 30% health"), read at the health the moment
   started from when it names one (`was`: a heal's target before the heal, Bargeman's Pole), and `marked` the moment's monster carries
   a live Hunter's Mark (Lurcher's Collar) */
const carries = (t, id) => !!t && Array.isArray(t.statuses) && t.statuses.some((st) => st.s === id && st.left > 0);
const under = (t, pm, was) => !!t && Number(t.maxHp) > 0 && (Number.isInteger(was) ? was : Math.floor(Number(t.hp) || 0)) * 1000 < pm * Math.floor(Number(t.maxHp));
const markedAt = (t, atMs) => !!t && Number.isInteger(t.markPm) && t.markPm > 0 && Number.isInteger(t.markUntil) && t.markUntil > atMs;
const holdsNow = (row, ctx, atMs) => (row.has === undefined || carries(ctx.t, row.has)) && (row.belowPm === undefined || under(ctx.t, row.belowPm, ctx.was))
  && (row.marked !== true || markedAt(ctx.t, atMs));

/** QUEUE every row of hero `u` that reacts to moment `on`, with what the moment says (`ctx`). Nothing while the queue drains. */
export function queueOn(inst, u, on, ctx) {
  if (!inst || inst.reacting || !reactsOn(u, on)) return;
  for (const row of u.reacts) if (row.on === on && holdsNow(row, ctx, inst.atMs)) (inst.reactQ || (inst.reactQ = [])).push({ u, row, ctx });
}
