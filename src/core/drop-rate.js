// ============================================================
// src/core/drop-rate.js — A DROP AUTHORED IN HUNTED HOURS, AS A PER-KILL CHANCE (systems, lane/drop-formula, 2026-11-22).
//
// src/data/drop-hours.js says what an hour means (chanceOf); this says how many of a ground's kills a hero sees an hour, so the hours can
// be turned into a per-kill chance on a real ground, and what depth does to the Rare odds:
//   killsHeadHour(ground)        the ground's reference kills a head an hour (danger.js refKillsOf: DANGER_GROUNDS refKillsHead, else
//                                PAY.refKillsHead), measured at refStep: the scale's own rate (a Trait's hours, trait-roll.js)
//   rowsKillsHour(ground)        the kills a head an hour the ground's ROWS are written at: DANGER_GROUNDS rowsKillsHead, else
//                                killsHeadHour. The tier path (no stance) plays the rows as they are, and the scale pays rowsKillsHead /
//                                its reference kills of each (danger.js rowsKeptOf), so one chance a row serves both paths
//   killShares(ground)           { monster: share } of the ground's kills at refStep: each route pocket's pull at the reference step's
//                                size (danger.js dangerDial, the engine's own pull, hunt-grounds.js pullRows, the engine's own rows),
//                                counted over the route. A boss's wave (adds) is left out: they come at his half-health line, not a pull
//   rowChance(row, monster, g)   a drop row's per-kill chance: its `everyHours` over the monster's kills a hero-hour at rowsKillsHour, rounded to
//                                DROP_HOURS.chDigits (a certainty, ch 1, stays 1)
//   depthOf(groundId, step)      the ground's "Depth N of 20" for a step (12-targets 3.1; src/core/bands.js depthAt, the one home the
//                                browser's danger-sections.js depthOf reads too: the band cut evenly in absolute steps)
//   depthRarePm(groundId, step)  the Rare odds at that depth over the odds at the reference company's own depth (where it holds,
//                                src/core/bands.js refHeldOf), permille (x1 at depth 1 to x3 at 20)
//   traitSlotsDropped(ground)    the Trait slots (gear-steps.js traitSlots) the ground's drop rows carry a piece of: a Rare's slot comes
//                                first (GEAR_STEPS.traitRoll.slotFirst), so only these can roll a Trait there
//   traitBasesOf(ground, ...)    the pieces a Trait piece found there may be, by Trait slot
//   kindOf(item)                 a piece's kind in its slot (armor class, weapon type with a caster's discipline, off-hand): the Trait
//                                roller draws a found piece's base of the kind its finder wears there (12-targets 8.6)
//
// tools/gen-drop-hours.mjs writes every scale ground's derived `ch` with this; tests/drop-formula.mjs holds them equal.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random: nothing here draws a die.
// ============================================================

import { DANGER_GROUNDS, DEPTHS } from '../data/danger.js';
import { DROP_HOURS, chanceOf, roundChance } from '../data/drop-hours.js';
import { MONSTERS } from '../data/monsters.js';
import { ITEMS } from '../data/items.js';
import { PLAIN_PIECES } from '../data/base-drops.js';
import { pullRows } from '../data/hunt-grounds.js';
import { dangerDial, refKillsOf } from './hunt/danger.js';
import { depthAt, refHeldOf } from './bands.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const rowOf = (groundId) => (own(DANGER_GROUNDS, groundId) ? DANGER_GROUNDS[groundId] : null);

/** The ground's reference kills a head an hour (null off the scale: no reference, no hours). */
export function killsHeadHour(ground) {
  return ground && rowOf(ground.id) ? refKillsOf(ground) : null;
}

/** The kills a head an hour the ground's drop rows are written at (DANGER_GROUNDS rowsKillsHead, else its reference kills). Null off the scale. */
export function rowsKillsHour(ground) {
  const row = ground && rowOf(ground.id);
  if (!row) return null;
  return Number.isInteger(row.rowsKillsHead) ? row.rowsKillsHead : refKillsOf(ground);
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
  const k = rowsKillsHour(ground);
  const share = monster === null ? 1 : (killShares(ground) || {})[monster] || 0;
  const ch = chanceOf(row.everyHours, k * share);
  return ch === null ? null : roundChance(ch);
}

/** The hours a row's `ch` gives on `ground` (the inverse, for the generator's conversion and the reports). */
export function hoursOf(ch, monster, ground) {
  const k = rowsKillsHour(ground);
  const share = monster === null ? 1 : (killShares(ground) || {})[monster] || 0;
  return ch > 0 && k > 0 && share > 0 ? 1 / (ch * k * share) : null;
}

/** "Depth N of 20" for `step` on a scale ground, 1 to DEPTHS (src/core/bands.js depthAt, the one home: the band cut evenly in absolute steps). Null off the scale. */
export function depthOf(groundId, step) {
  return rowOf(groundId) ? depthAt(groundId, step) : null;
}

/* the depth multiplier, permille: x1 at depth 1, x3 at DEPTHS (DROP_HOURS.depthPm), straight */
const depthPmAt = (d) => {
  const [a, b] = DROP_HOURS.depthPm;
  return a + ((b - a) * (d - 1)) / (DEPTHS - 1);
};

/** The Rare odds at `step` over the odds at the reference company's own depth, permille (the authored hours are the reference company's,
    so it reads x1 where it holds: src/core/bands.js refHeldOf, the step the reference four holds, not the pay's anchor refStep). */
export function depthRarePm(groundId, step) {
  const row = rowOf(groundId);
  if (!row) return 1000;
  const d = depthOf(groundId, step), ref = depthOf(groundId, refHeldOf(groundId));
  if (d === ref) return 1000;
  return (1000 * depthPmAt(d)) / depthPmAt(ref);
}

/** The Trait slot of an equip slot (gear-steps.js traitSlots: a ring Trait fits either ring), or null. */
export function traitSlotOf(equipSlot, traitSlots) {
  for (const [s, list] of Object.entries(traitSlots)) if (s === equipSlot || list.includes(equipSlot)) return s;
  return null;
}

/* every drop row `ground` carries: its route's monsters' rows and its own (a Catacomb wing's) */
function droppedRows(ground, monsters) {
  const ids = new Set();
  for (const p of ground.route) for (const s of (ground.pockets[p].pack || ground.pockets[p].spawns)) ids.add(s.monster);
  return [...ids].flatMap((m) => (monsters[m] && monsters[m].drops) || []).concat(ground.drops || []);
}
/* NO NAMED PIECE IS A TRAIT BASE (designer, 12-targets 8.9 item 8; lane/no-named-trait-bases, 2026-11-27): a Trait piece lands on the
   ground's plain base (8.6.1), a piece of the plain ladder (base-drops.js PLAIN_PIECES: the GEAR_LADDERS rungs and each tier's plain shield).
   Every other piece a row drops is named, and its one door is its own row: a `statsAs` twin (28-named-pieces 2.7), a ground's own `pieces`
   (the Thicket's Grayjaw's Ruff), a drop row's one-off (the Sewer's Kingsgrate, the Glade's Houndskin Cloak and Bramble Blade) */
const PLAIN = new Set(PLAIN_PIECES);
const isNamed = (id, it) => !!it && !PLAIN.has(id);

/** The Trait slots `ground`'s drop rows carry a plain piece of (never a named piece): its monsters' rows and its own (a Catacomb wing's), sorted. */
export function traitSlotsDropped(ground, traitSlots, monsters = MONSTERS, items = ITEMS) {
  const out = new Set();
  for (const r of droppedRows(ground, monsters)) { const it = items[r.id]; const s = it && it.slot && !isNamed(r.id, it) ? traitSlotOf(it.slot, traitSlots) : null; if (s) out.add(s); }
  return [...out].sort();
}

/** THE BASES a Trait piece found on `ground` may be, { Trait slot: [item ids] } sorted (lane/t1-traits-drop, 2026-11-26): the pieces its drop
    rows carry in each Trait slot at the ground's base item Level `gearLevel` (12-targets 3.3: the ground fixes the base, one base a ground,
    8.3), or, in a slot whose rows carry none at that Level, every piece they carry there; never a named piece (isNamed). A Rare is the piece
    that dropped (GEAR_STEPS.traitRoll.slotFirst), so its base is one of these; the server holds the same list (1071-trait-pieces-catalogue's hr_trait_bases). */
export function traitBasesOf(ground, traitSlots, gearLevel, monsters = MONSTERS, items = ITEMS) {
  const all = {}, at = {};
  for (const r of droppedRows(ground, monsters)) {
    const it = items[r.id];
    const s = it && it.slot && !isNamed(r.id, it) ? traitSlotOf(it.slot, traitSlots) : null;
    if (!s) continue;
    (all[s] || (all[s] = new Set())).add(r.id);
    if (it.iL === gearLevel) (at[s] || (at[s] = new Set())).add(r.id);
  }
  const out = {};
  for (const s of Object.keys(all).sort()) out[s] = [...(at[s] || all[s])].sort();
  return out;
}

/** A PIECE'S KIND in its slot (designer, lane/designer-pity, 2026-11-26; 12-targets 8.6): what a hero who wears it there can swap it for
    without changing how it fights. Armor by its class (plate, leather, cloth), a weapon by its type (sword, axe, hammer, ranged, magic) and,
    for a caster's, its discipline (a healer's staff is not a wand), an off-hand by its kind (shield, spellbook). '' for a piece with none
    (a ring, a cape): every base of such a slot is one kind. */
export function kindOf(it) {
  if (!it || typeof it !== 'object') return '';
  if (it.type === 'weapon') return 'weapon:' + (it.weaponType || '') + ':' + (it.discipline || '');
  if (it.type === 'offhand') return 'offhand:' + (it.offhand || '') + ':' + (it.discipline || '');
  return it.armourClass ? 'armor:' + it.armourClass : '';
}
