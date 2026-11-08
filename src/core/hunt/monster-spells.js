// ============================================================
// src/core/hunt/monster-spells.js — A MONSTER'S TELEGRAPHED AREA SPELL (lane/b-area-engine; Tyler 2026-11-08: "start
// giving some monsters some aoe spells"; design: docs/planning/PRIORITY_BOARD.md "2026-11-08 Area spells" §3)
//
// A monster whose row names a spell (src/data/monster-spells.js) casts it; every other monster is untouched: no field
// moves and no die is drawn, so a ground with no spell plays exactly as it did.
//
// THE CAST, server-authoritative and drawn on the swing's own dice in the one settle (CLAUDE.md §6), so the browser's
// live view predicts the same mark the settle lands:
//   start   a monster with its cooldown up, standing on a tile, holding a living hero in its spell's range (line of
//           sight past 1 tile) starts a cast. The MARK is fixed then (shapes.js place: a ring or a cone on the caster,
//           a blast on the target's tile, a line through it) and persisted on the caster as `cast` (marks.js reads
//           it); the windup is the row's, stretched by a Chill on the caster as it starts (damage.js slowed). Every
//           ranged hero and caster re-aims at once (roles.js: they step off a mark; Melee holds). A `spell` event
//           tells the screen the shape and the windup.
//   windup  the caster stands (movement.js) and makes no swing (damage.js).
//   landing at the windup's end every living hero standing on a marked tile is hit once, in id order: a roll from half
//           to the whole of the spell's top (dmgPm permille of the caster's own largest blow at the hunt's tier, an
//           enraged boss's raised one), no to-hit roll, then the hero's armour as any blow (damage.js landHit: dodge,
//           absorb, resistances, ward). A blow taken, so it trains Defense (Tyler 2026-10-22). The landing restarts the
//           caster's swing clock: the cast was its blow. A `spell_end` event (why 'landed', hits) closes the mark.
//   dropped a caster that falls or leaves the fight (its pack reset) in its windup lands nothing: `spell_end` with why
//           'killed' or 'reset', in the very sub-step it happened (dropCasts runs after every blow of the sub-step).
// The cooldown runs from one cast's start to the next one's earliest start.
//
// DICE: one `sc.rng.int` per hero struck (and landHit's own), casters in id order; a start draws nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=0.2.108';
import { atTier } from '../../data/hunt-tiers.js?v=0.2.108';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.108';
import { MONSTER_SPELLS, spellOf, specOf, spellHit } from '../../data/monster-spells.js?v=0.2.108';
import { monsterMaxHit } from '../combat.js?v=0.2.108';
import { cheb, los } from './grid.js?v=0.2.108';
import { atRest, unitById, dirOf } from './movement.js?v=0.2.108';
import { makeEvent } from './events.js?v=0.2.108';
import { place, covers } from './shapes.js?v=0.2.108';
import { castShape } from './marks.js?v=0.2.108';
import { landHit, restart, slowed } from './damage.js?v=0.2.108';
import { swingRow } from './boss-phases.js?v=0.2.108';

/* spellCd: ms until the unit may start its next cast. cast: its live cast (marks.js), or null. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['spellCd', 'int'], ['cast', 'json']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

/* The row a live cast names (its own id, so a cast always lands the spell it started), or null. */
const castRow = (c) => (c && typeof c.s === 'string' && Object.prototype.hasOwnProperty.call(MONSTER_SPELLS, c.s) ? MONSTER_SPELLS[c.s] : null);

/* Why a live cast can no longer land, or null: its caster fell, or left the fight (a pack reset clears its target). */
const outOf = (u) => (!u.alive ? 'killed' : !Number.isInteger(u.target) ? 'reset' : null);

function drop(u, sc, why) {
  const s = u.cast.s;
  u.cast = null;
  sc.emit(makeEvent('spell_end', sc.atMs, { u: u.id, spell: s, why, hits: 0 }));
}

/* Start a cast of `sp` when its caster can: standing, its living hero target in range (line of sight past 1). */
function begin(inst, sc, u, sp) {
  if (!Number.isInteger(u.target) || !atRest(u)) return;
  const t = unitById(inst, u.target);
  if (!t || !t.alive || t.side !== 'hero') return;
  const d = cheb(u, t);
  if (d > sp.range || (d > 1 && !los(inst.grid, u, t))) return;
  const ms = slowed(u, sp.windupMs);
  const s = place(specOf(sp), u, t);
  u.cast = { s: sp.id, ms, left: ms, kind: s.kind, x: s.ox, y: s.oy, dx: s.dx, dy: s.dy, r: s.r, len: s.len };
  u.spellCd = sp.cdMs;
  u.dir = dirOf(t.x - u.x, t.y - u.y);
  /* A NEW MARK RE-AIMS every hero that answers one (a ranged hero or a caster steps off: roles.js), at once. */
  for (const h of inst.world.units) {
    const row = h.side === 'hero' && h.alive ? HUNT_ROLES[h.role] : null;
    if (row && !row.melee) h.aiMs = 0;
  }
  sc.emit(makeEvent('spell', sc.atMs, { u: u.id, t: t.id, spell: sp.id, shape: s.kind, x: s.ox, y: s.oy, dx: s.dx, dy: s.dy, r: s.r, len: s.len, ms }));
}

/* The landing: every living hero on a marked tile, in id order, takes one hit. */
function land(inst, sc, u, sp) {
  const s = castShape(u);
  const row = swingRow(u, atTier(MONSTERS[u.kind], inst.tier));
  const [lo, top] = spellHit(monsterMaxHit(row), sp);
  const struck = inst.world.units.filter((h) => h.side === 'hero' && h.alive && covers(s, h.x, h.y)).sort((a, b) => a.id - b.id);
  u.cast = null;
  restart(u);
  sc.emit(makeEvent('spell_end', sc.atMs, { u: u.id, spell: sp.id, why: 'landed', hits: struck.length }));
  const tag = { id: sp.id };
  for (const h of struck) if (h.alive) landHit(inst, sc, u, h, sc.rng.int(lo, top), sp.element || null, tag, false);
}

/** The spell hook (world-step.js, after the swings: a landing restarts the swing clock as a swing does, so the next swing
    comes a full interval after it): every monster's cooldown, windup and landing, in id order. */
export function castSpells(inst, sc) {
  for (const u of inst.world.units) {
    if (u.side !== 'mon') continue;
    if (u.cast) {
      const why = outOf(u) || (castRow(u.cast) ? null : 'reset');
      if (why) { drop(u, sc, why); continue; }
    }
    if (!u.alive) continue;
    const sp = u.cast ? castRow(u.cast) : spellOf(MONSTERS[u.kind]);
    if (!sp) continue;
    if (u.spellCd > 0) u.spellCd = Math.max(0, u.spellCd - sc.dtMs);
    if (u.cast) {
      u.cast.left = Math.max(0, u.cast.left - sc.dtMs);
      if (u.cast.left === 0) land(inst, sc, u, sp);
      continue;
    }
    if (u.spellCd === 0) begin(inst, sc, u, sp);
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
