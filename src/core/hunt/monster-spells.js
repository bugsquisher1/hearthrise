// ============================================================
// PROTOTYPE — lane/d-area-spells (designer, 2026-11-08). SIM ONLY, NEVER SHIPPED.
// src/core/hunt/monster-spells.js — a monster's telegraphed area spell, for tools/balance-sim
// what-ifs only. A monster row carries no `spell` in src/data; a what-if sets one
// ({ monsters: { id: { spell: {...} } } }) for one cell and the worker restores it.
//
// A spell row: { id, shape: 'blast' | 'nova' | 'cone' | 'line', r, len, range, windupMs, cdMs, dmgPm, element }
//   blast  a circle of radius r (Chebyshev) on the TARGET's tile at cast start (a ground target)
//   nova   a circle of radius r on the CASTER's tile (a circle on self)
//   cone   len tiles from the caster toward its target, 90 degrees wide
//   line   len tiles from the caster through its target, one tile wide
//   range  the most tiles from caster to target a cast may start at (line of sight past 1)
//   dmgPm  the strike's top, permille of the caster's own largest blow at the hunt's tier (so a tier moves it)
//
// The cast: a monster with a living hero target in range, standing on a tile, off cooldown, starts a cast: the marked
// tiles are fixed then (the telegraph), it stops swinging and stands for windupMs, then every living hero on a marked
// tile is struck once (no to-hit roll; the armour chain runs as for any blow). A caster killed in its windup strikes
// nothing. THE IDLE HERO'S ANSWER (the proposed rule, approximated): MELEE HOLD, RANGED STEP OUT: a Melee hero keeps its
// tile and takes it; a ranged or caster hero no monster holds in melee (none beside it has it as its target) has stepped
// off the marked tiles by the strike and is spared. (A built version moves the hero; this one spares it in place, so a sparing costs
// no swings here: the measured cost of a dodge is a little low.)
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=0.2.108';
import { atTier } from '../../data/hunt-tiers.js?v=0.2.108';
import { monsterMaxHit } from '../combat.js?v=0.2.108';
import { cheb, los } from './grid.js?v=0.2.108';
import { atRest, unitById } from './movement.js?v=0.2.108';
import { makeEvent } from './events.js?v=0.2.108';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.108';

export const SPELL_PERSISTED = Object.freeze([['spCd', 'int'], ['spLeft', 'int'], ['spX', 'int'], ['spY', 'int'], ['spDx', 'int'], ['spDy', 'int']]);

const spellOf = (u) => (u.side === 'mon' && MONSTERS[u.kind] && MONSTERS[u.kind].spell) || null;

/** Is tile (x, y) marked by caster `u`'s cast of `sp`? */
export function marked(u, sp, x, y) {
  if (sp.shape === 'group') return true; /* a WHOLE-GROUP spell marks every hero in the fight */
  const r = sp.r || 1;
  if (sp.shape === 'blast' || sp.shape === 'nova') return Math.max(Math.abs(x - u.spX), Math.abs(y - u.spY)) <= r;
  const rx = x - u.spX, ry = y - u.spY, d = Math.max(Math.abs(rx), Math.abs(ry));
  if (d < 1 || d > (sp.len || 3)) return false;
  if (sp.shape === 'line') return rx === u.spDx * d && ry === u.spDy * d;
  /* cone: within 45 degrees of the facing (cos >= 0.7071: 2 dot^2 >= |rel|^2 |dir|^2) */
  const dot = rx * u.spDx + ry * u.spDy;
  return dot > 0 && 2 * dot * dot >= (rx * rx + ry * ry) * (u.spDx * u.spDx + u.spDy * u.spDy);
}

const held = (inst, h) => inst.world.units.some((m) => m.side === 'mon' && m.alive && m.target === h.id && cheb(m, h) <= 1);

function strike(inst, sc, u, sp, landHit) {
  const row = atTier(MONSTERS[u.kind], inst.tier);
  const hi = Math.max(1, Math.floor((monsterMaxHit(row) * sp.dmgPm) / 1000)), lo = Math.max(1, Math.ceil(hi / 2));
  const tag = { id: sp.id };
  for (const h of inst.world.units.filter((x) => x.side === 'hero' && x.alive).sort((a, b) => a.id - b.id)) {
    /* MELEE HOLD, RANGED STEP OUT: a Melee hero keeps its tile; a ranged or caster hero not caught in melee has stepped off. */
    const group = sp.shape === 'group';
    if (!marked(u, sp, h.x, h.y) || (!group && !(HUNT_ROLES[h.role] || {}).melee && !held(inst, h))) continue;
    let n = sc.rng.int(lo, hi);
    /* sim-only what-ifs: the party's element resistance (heroResistPm) and a shield's brace on a marked hit (tankCutPm) */
    if (sp.heroResistPm) n = Math.max(1, Math.floor((n * (1000 - sp.heroResistPm)) / 1000));
    if (!group && sp.tankCutPm && (HUNT_ROLES[h.role] || {}).tank) n = Math.max(1, Math.floor((n * (1000 - sp.tankCutPm)) / 1000));
    landHit(inst, sc, u, h, n, sp.element || null, tag, false);
  }
}

/** One sub-step of monster `u`'s spell. Answers true while it is casting (it makes no basic swing). */
export function monsterSpellStep(inst, sc, u, landHit) {
  const sp = spellOf(u);
  if (!sp) return false;
  if (u.spCd > 0) u.spCd = Math.max(0, u.spCd - sc.dtMs);
  if (u.spLeft > 0) {
    u.spLeft = Math.max(0, u.spLeft - sc.dtMs);
    if (u.spLeft === 0) { strike(inst, sc, u, sp, landHit); u.swingLeftMs = 2000; }
    return true;
  }
  if (u.spCd > 0 || !Number.isInteger(u.target) || !atRest(u)) return false;
  const t = unitById(inst, u.target);
  if (!t || !t.alive || t.side !== 'hero' || cheb(u, t) > (sp.range || 1)) return false;
  if (cheb(u, t) > 1 && !los(inst.grid, u, t)) return false;
  u.spLeft = sp.windupMs; u.spCd = sp.cdMs;
  if (sp.shape === 'blast') { u.spX = t.x; u.spY = t.y; } else { u.spX = u.x; u.spY = u.y; }
  u.spDx = Math.sign(t.x - u.x); u.spDy = Math.sign(t.y - u.y);
  if (!u.spDx && !u.spDy) u.spDy = 1;
  sc.emit(makeEvent('cast', sc.atMs, { u: u.id, ability: sp.id, t: t.id }));
  return true;
}
