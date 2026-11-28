// ============================================================
// src/core/hunt/react-queue.js — WHAT SETS A REACTION OFF: the queue the fight's seams write and reactions.js drains (lane/talent-effects;
// docs/design/redesign/15 "New engine pieces", 16, 17).
//
// A hero's REACTIONS are rows the boundary writes on its unit (`reacts`, src/core/talents.js grantsOf: { id, on, do, ... }, and a worn
// Signature's, src/core/hunt/signature-rules.js; never persisted). The seams that see a moment (damage.js landHit: a hit, a crit, a kill, a
// hit taken, an ally hit, a fall toward the line, a shell broken, any monster's death, the hero's own health under a line; heal-rules.js
// landHeal: a cast heal landing; targeting.js: a taunt, a taunt lost; pull-cycle.js startPull: a pull begins) call queueOn for the heroes whose rows react to it; world-step.js drains the queue
// after every hook of the sub-step (reactions.js drainReactions), in the order the moments happened. While the queue drains nothing new
// is queued, so a reaction never sets off another (15: "a free cast, a reset or an explosion can't set off another one").
//
// The queue lives on the instance (one swing's), and is empty at every hook's end, so nothing of it is persisted and a settle cut
// anywhere between swings resumes the same fight.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { isHero, isAlly } from './sides.js';
import { ABILITIES } from '../../data/abilities.js';
import { ITEMS } from '../../data/items.js';
import { MONSTERS } from '../../data/monsters.js';

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
   a live Hunter's Mark (Lurcher's Collar).
   BATCH 3 (lane/signatures-batch-3, 2026-11-27): `family` the moment's move spends a rune of that family (its Chalked rune's family,
   src/data/items.js: Stoker's Ring, "Fire rune spells"), `single` the moment's blow is a single-target one (a swing, or a move whose
   target is one enemy: Bull's Tooth), `boss` the moment's monster is a boss (Drowned Signet), `alone` the hero is the only hero of its
   side in the world (Slake Waders, "while you hunt alone": a party of one), each read as the moment happens */
const carries = (t, id) => !!t && Array.isArray(t.statuses) && t.statuses.some((st) => st.s === id && st.left > 0);
const under = (t, pm, was) => !!t && Number(t.maxHp) > 0 && (Number.isInteger(was) ? was : Math.floor(Number(t.hp) || 0)) * 1000 < pm * Math.floor(Number(t.maxHp));
const markedAt = (t, atMs) => !!t && Number.isInteger(t.markPm) && t.markPm > 0 && Number.isInteger(t.markUntil) && t.markUntil > atMs;
const holdsNow = (row, ctx, atMs) => (row.has === undefined || carries(ctx.t, row.has)) && (row.belowPm === undefined || under(ctx.t, row.belowPm, ctx.was))
  && (row.marked !== true || markedAt(ctx.t, atMs));
const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const FAMILY = new Map();
const familyOf = (id) => {
  if (!FAMILY.has(id)) { const rune = own(ABILITIES, id) && ABILITIES[id].rune && own(ITEMS, ABILITIES[id].rune) ? ITEMS[ABILITIES[id].rune] : null; FAMILY.set(id, rune && rune.family ? rune.family : null); }
  return FAMILY.get(id);
};
const singleOf = (id) => id === 'basic' || (own(ABILITIES, id) && ABILITIES[id].target === 'enemy');
const bossOf = (inst, t) => { const rows = (inst && inst.monsters) || MONSTERS; return !!t && !isHero(t) && own(rows, t.kind) && rows[t.kind].boss === true; };
const aloneIn = (inst, u) => !!inst && !!inst.world && !inst.world.units.some((o) => o !== u && isHero(o) && isAlly(u, o));
/* (the batch-3 filters, read only on a row that names one, so every other row reads exactly what it read) */
const holdsToo = (inst, u, row, ctx) => (row.family === undefined || familyOf(ctx.ability) === row.family) && (row.single !== true || singleOf(ctx.ability))
  && (row.boss !== true || bossOf(inst, ctx.t)) && (row.alone !== true || aloneIn(inst, u));

/** QUEUE every row of hero `u` that reacts to moment `on`, with what the moment says (`ctx`). Nothing while the queue drains. */
export function queueOn(inst, u, on, ctx) {
  if (!inst || inst.reacting || !reactsOn(u, on)) return;
  for (const row of u.reacts) if (row.on === on && holdsNow(row, ctx, inst.atMs) && holdsToo(inst, u, row, ctx)) (inst.reactQ || (inst.reactQ = [])).push({ u, row, ctx });
}
