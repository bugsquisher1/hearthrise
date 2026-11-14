// ============================================================
// src/core/hunt/monster-spells.js — A MONSTER'S SPELLS (lane/b-area-engine; Tyler 2026-11-08: "the point of Monsters
// having aoe spells is so the whole party takes damage", "the tank absorbing the boss hits and the casters dodging it";
// design: docs/planning/PRIORITY_BOARD.md "2026-11-08 Area spells" §3)
//
// A monster whose row lists spells (src/data/monster-spells.js) casts them; every other monster is untouched: no field
// moves and no die is drawn, so a ground with no spell plays exactly as it did. With the switch off (SPELL_SWITCH, the
// one row that turns every monster's spells on or off) no monster casts, and every ground plays that way.
//
// THE CAST, server-authoritative and drawn on the swing's own dice in the one settle (CLAUDE.md §6), so the browser's
// live view predicts the same warning the settle lands:
//   start   a monster with no live cast, standing on a tile, holding a living hero in a spell's range (line of sight
//           past 1 tile), starts the FIRST spell of its list whose cooldown is up. Its shape is fixed then (shapes.js
//           place: a group spell everywhere, a ring or a cone on the caster, a blast on the target's tile, a line through
//           it) and persisted on the caster as `cast` (marks.js reads it); the windup is the row's, stretched by a Chill on
//           the caster as it starts (damage.js slowed). A marked spell re-aims every ranged hero and caster at once
//           (roles.js: they step off; Melee holds). A `spell` event tells the screen the shape and the windup.
//   windup  the caster stands (movement.js) and makes no swing (damage.js).
//   landing at the windup's end every living hero the shape covers (a group spell: every one) is hit once, in id order,
//           for a roll of the row's spellHit, then the hero's armour as any blow (damage.js landHit: dodge, absorb,
//           resistance to its element, ward), a worn shield taking SHIELD_BRACE off a marked spell. A blow taken, so it
//           trains Defense (Tyler 2026-10-22). The landing restarts the caster's swing clock: the cast was its blow. A
//           `spell_end` event (why 'landed', hits) closes the warning.
//   dropped a caster that falls or leaves the fight (its pack reset) in its windup lands nothing: `spell_end` with why
//           'killed' or 'reset', in the very sub-step it happened (dropCasts runs after every blow of the sub-step).
//   a MEND  (data/monster-spells.js mends; the Krell's Hold design's engine piece 3, the Pyre Priest "mends the dead in his pull")
//           takes the same path with a packmate for its target: it starts only with one to mend (mendable: the most hurt of
//           its own pack in range, never itself, never a boss whose HP only falls), winds up, stands and makes no swing as any
//           cast, marks nothing (marks.js castShape), and lands one roll of the spell's number back on that packmate (a `heal`
//           naming the spell). Killing the caster in its windup stops it, as it stops any cast.
// Each spell keeps its own cooldown, from one cast's start to its next earliest start (`spellCds`).
//
// THE FIRST CAST IS STAGGERED (Tyler 2026-11-08: a pack must not open with every cast at once and repeat in step). As a
// monster joins the fight (the first sub-step it holds a target) each of its spells draws a whole number of sub-steps from 0
// to firstCastSteps(row) (data/monster-spells.js SPELL_STAGGER) and waits that long before its first start, as a cooldown.
// The draw is the swing's own dice, so the settle and the live view stagger alike, viewed or with the browser closed. A
// monster out of the fight (its pack reset) forgets its waits and draws again when it next joins one.
//
// DICE: joining a fight, one `sc.rng.int` per spell whose firstCastSteps is above 0, casters in id order, spells in list
// order; one `sc.rng.int` per hero struck (and landHit's own), one per packmate mended; a start draws nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { atTier } from '../../data/hunt-tiers.js?v=0.2.129';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.129';
import { spellRow, castsOf, specOf, spellHit, marked, mends, SHIELD_BRACE, firstCastSteps } from '../../data/monster-spells.js?v=0.2.129';
import { monsterMaxHit } from '../combat.js?v=0.2.129';
import { cheb, los } from './grid.js?v=0.2.129';
import { atRest, unitById, dirOf } from './movement.js?v=0.2.129';
import { makeEvent } from './events.js?v=0.2.129';
import { place, covers } from './shapes.js?v=0.2.129';
import { castShape } from './marks.js?v=0.2.129';
import { landHit, restart, slowed, rowOf } from './damage.js?v=0.2.129';
import { swingRow } from './boss-phases.js?v=0.2.129';

/* spellCds: { spell id: ms until it may start } while the monster is in a fight, a spell it does not name being ready ({} = every
   spell ready); null = not in a fight, its first casts not drawn yet. cast: its live cast (marks.js), or null. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['spellCds', 'json'], ['cast', 'json']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

/* Why a live cast can no longer land, or null: its caster fell, or left the fight (a pack reset clears its target). */
const outOf = (u) => (!u.alive ? 'killed' : !Number.isInteger(u.target) ? 'reset' : null);

function drop(u, sc, why) {
  const s = u.cast.s;
  u.cast = null;
  sc.emit(makeEvent('spell_end', sc.atMs, { u: u.id, spell: s, why, hits: 0 }));
}

/**
 * THE PACKMATE A MEND OF `sp` FROM `u` WOULD TAKE NOW, or null: a living monster of u's own pack (its pocket), not u, missing HP,
 * within the spell's range (line of sight past 1), and not a boss whose HP only falls (a row with `phases`: boss-phases.js reads
 * his lines from his falling HP); the lowest share of its max HP first (compared whole: hp x other's max), ties to the lower id.
 * The rule a hero healer's ally pick has (abilities.js targetFor 'ally'). Pure.
 */
export function mendable(inst, u, sp) {
  let best = null;
  for (const m of inst.world.units) {
    if (m === u || m.side !== 'mon' || !m.alive || m.pocket !== u.pocket || !(m.hp < m.maxHp)) continue;
    if ((rowOf(inst, m.kind) || {}).phases) continue;
    const d = cheb(u, m);
    if (d > sp.range || (d > 1 && !los(inst.grid, u, m))) continue;
    if (!best || m.hp * best.maxHp < best.hp * m.maxHp || (m.hp * best.maxHp === best.hp * m.maxHp && m.id < best.id)) best = m;
  }
  return best;
}

/* THE TARGET a cast of `sp` from `u` would take now, or null: a MEND's packmate (mendable); any other spell's living hero target,
   in range (line of sight past 1). */
function castTarget(inst, u, sp) {
  if (mends(sp)) return mendable(inst, u, sp);
  const t = unitById(inst, u.target);
  if (!t || !t.alive || t.side !== 'hero') return null;
  const d = cheb(u, t);
  return d > sp.range || (d > 1 && !los(inst.grid, u, t)) ? null : t;
}

/* Start spell `id` (row `sp`) when its caster can: in a fight, standing, with a target (castTarget). Its shape is placed now; a
   MEND's is its packmate's tile, and the packmate rides on the cast as `t` (the persisted json: the world's shape does not move;
   it marks nothing, marks.js castShape). Answers whether it started. */
function begin(inst, sc, u, id, sp) {
  if (!Number.isInteger(u.target) || !atRest(u)) return false;
  const t = castTarget(inst, u, sp);
  if (!t) return false;
  const ms = slowed(u, sp.windupMs);
  const s = mends(sp) ? { kind: 'mend', ox: t.x, oy: t.y, dx: 0, dy: 0, r: 0, len: 0 } : place(specOf(sp), u, t);
  u.cast = { s: id, ms, left: ms, kind: s.kind, x: s.ox, y: s.oy, dx: s.dx, dy: s.dy, r: s.r, len: s.len, ...(mends(sp) ? { t: t.id } : {}) };
  u.spellCds = Object.assign({}, u.spellCds || {}, { [id]: sp.cdMs });
  u.dir = dirOf(t.x - u.x, t.y - u.y);
  /* A NEW MARK RE-AIMS every hero that answers one (a ranged hero or a caster steps off: roles.js), at once. A group
     spell marks no ground: nobody moves for it. */
  if (marked(sp)) {
    for (const h of inst.world.units) {
      const row = h.side === 'hero' && h.alive ? HUNT_ROLES[h.role] : null;
      if (row && !row.melee) h.aiMs = 0;
    }
  }
  sc.emit(makeEvent('spell', sc.atMs, { u: u.id, t: t.id, spell: id, shape: s.kind, x: s.ox, y: s.oy, dx: s.dx, dy: s.dy, r: s.r, len: s.len, ms }));
  return true;
}

/* The landing: every living hero the shape covers, in id order, takes one hit; a worn shield braces a marked one. A MEND puts one
   roll of the same number back on the packmate it named, never past its max HP, and nothing on one that fell or left the fight
   meanwhile (a pack reset heals it whole): its `heal` names the spell (tally.js credits a heal to a hero only), its hits are 0 or 1. */
function land(inst, sc, u, sp) {
  const s = castShape(u);
  const id = u.cast.s;
  const row = swingRow(u, atTier(rowOf(inst, u.kind), inst.tier));   // the instance's row (a scaled hunt's), as a swing reads it (damage.js)
  const [lo, top] = spellHit(monsterMaxHit(row), sp);
  const t = mends(sp) ? unitById(inst, u.cast.t) : null;
  /* (a pack reset takes the caster out of the fight too, which drops the cast before it lands: dropCasts) */
  const mended = !!t && t.alive && t.side === 'mon' && t.pocket === u.pocket && t.hp < t.maxHp;
  const struck = s ? inst.world.units.filter((h) => h.side === 'hero' && h.alive && covers(s, h.x, h.y)).sort((a, b) => a.id - b.id) : [];
  u.cast = null;
  restart(u);
  sc.emit(makeEvent('spell_end', sc.atMs, { u: u.id, spell: id, why: 'landed', hits: mends(sp) ? (mended ? 1 : 0) : struck.length }));
  if (mended) {
    const got = Math.min(t.maxHp - t.hp, sc.rng.int(lo, top));
    t.hp += got;
    sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: t.id, amount: got, spell: id }));
  }
  const plain = { id };
  const braced = { id, mult: 1000 - SHIELD_BRACE.markedPm };
  for (const h of struck) if (h.alive) landHit(inst, sc, u, h, sc.rng.int(lo, top), sp.element || null, marked(sp) && h.shieldWorn === true ? braced : plain, false);
}

/* THE FIRST CASTS of a monster joining a fight: { spell id: ms to wait }, each a drawn whole number of sub-steps (header). */
function firstCasts(sc, list) {
  const cds = {};
  for (const id of list) {
    const steps = firstCastSteps(spellRow(id));
    const wait = steps > 0 ? sc.rng.int(0, steps) * sc.dtMs : 0;
    if (wait > 0) cds[id] = wait;
  }
  return cds;
}

/** The spell hook (world-step.js, after the swings: a landing restarts the swing clock as a swing does, so the next swing
    comes a full interval after it): every monster's cooldowns, windup and landing, in id order. */
export function castSpells(inst, sc) {
  for (const u of inst.world.units) {
    if (u.side !== 'mon') continue;
    /* what it casts now (data/monster-spells.js castsOf: its row's list, or nothing while the switch is off) */
    const list = castsOf(rowOf(inst, u.kind));
    if (u.cast) {
      /* a cast its caster no longer casts (its row gone, off its list, the switch off) lands nothing: a stored windup never outlives a deploy */
      const why = outOf(u) || (spellRow(u.cast.s) && list.includes(u.cast.s) ? null : 'reset');
      if (why) { drop(u, sc, why); continue; }
    }
    if (!u.alive) continue;
    if (!list.length && !u.cast && !u.spellCds) continue;
    /* out of the fight with nothing winding up: its waits are forgotten, and it draws its first casts again when it joins one */
    if (!u.cast && !Number.isInteger(u.target)) { u.spellCds = null; continue; }
    if (!u.spellCds) u.spellCds = firstCasts(sc, list);
    else {
      const next = {};
      for (const [k, ms] of Object.entries(u.spellCds)) { const left = ms - sc.dtMs; if (left > 0) next[k] = left; }
      u.spellCds = next;
    }
    if (u.cast) {
      u.cast.left = Math.max(0, u.cast.left - sc.dtMs);
      if (u.cast.left === 0) land(inst, sc, u, spellRow(u.cast.s));
      continue;
    }
    for (const id of list) {
      if (u.spellCds && u.spellCds[id] > 0) continue;
      if (begin(inst, sc, u, id, spellRow(id))) break;
    }
  }
}

/** The drop hook (world-step.js, after every blow of the sub-step): a caster that fell or left the fight drops its cast. */
export function dropCasts(inst, sc) {
  for (const u of inst.world.units) {
    if (u.side !== 'mon' || !u.cast) continue;
    const why = outOf(u);
    if (why) drop(u, sc, why);
  }
}
