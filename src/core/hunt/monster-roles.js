// ============================================================
// src/core/hunt/monster-roles.js — MONSTER ROLES AND THE PARTY'S TWO ROWS (wave 2, lane/w2-roles-rows)
//
// Every number and word is src/data/monster-roles.js's (its header has the design). This file answers four questions, each only on
// the Danger scale (danger.js dangerOn): a tier hunt gets null / 0 / [] from every one, so it plays exactly as before.
//   roleOf      the role row monster unit `m` plays (its MONSTERS row's `role`, through the instance's one door), or null
//   rowOf       the row a hero stands in: its `row` setting, else front for a hero that fights beside its target, back for the rest
//   reachPick   whom a role's reach takes (shooters.js aimOf, the one door every monster's aim goes through), or null for no match
//   splashOn    the other heroes a blow at `t` also lands on (damage.js resolveAttacks)
// Nothing here draws a die or persists a field: a role is read off the monster's row and a row off the hero's role and settings at
// every boundary (combat-sim.js syncUnit), so a viewed hunt and a closed one aim the same way on every runtime.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js';
import { MONSTER_ROLES, ROWS } from '../../data/monster-roles.js';
import { HUNT_ROLES } from '../../data/hunt-roles.js';
import { dangerOn } from './danger.js';
import { inArea } from './leash.js';
import { cheb, dist2 } from './grid.js';
import { isEnemy, isAlly, isHero, isMonster } from './sides.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** The role row monster unit `m` plays on this instance's scale, or null (off the scale, a hero, or a row that names none). */
export function roleOf(inst, m) {
  if (!inst || !dangerOn(inst.world) || !isMonster(m)) return null;
  const row = (inst.monsters || MONSTERS)[m.kind];
  return row && typeof row.role === 'string' && own(MONSTER_ROLES, row.role) ? MONSTER_ROLES[row.role] : null;
}

/** A hero's row ('front' or 'back'): its own `row` setting when it names one, else front for a role that fights beside its target
    (hunt-roles.js `melee`), back for any other. A hero with no role row stands in the front. */
export function rowOf(u) {
  if (u && ROWS.includes(u.row)) return u.row;
  const r = u && HUNT_ROLES[u.role];
  return r && r.melee === false ? 'back' : 'front';
}

/** The tiles a role shoots from on this instance (0: beside its target, or off the scale). */
export const roleRange = (inst, m) => { const r = roleOf(inst, m); return r ? r.range : 0; };

/* Monsters on hero `h` now (spread's count). */
const onHero = (inst, h) => { let n = 0; for (const u of inst.world.units) if (u.alive && isMonster(u) && u.target === h.id) n++; return n; };

/* Each reach as a comparison of two candidate heroes for monster `m` (negative: `a` first). Every one ends on the lower id, so the
   pick is the same on every runtime. */
const BEFORE = Object.freeze({
  front: (inst, m) => (a, b) => dist2(a, m) - dist2(b, m) || a.id - b.id,
  back: (inst, m) => (a, b) => dist2(b, m) - dist2(a, m) || a.id - b.id,
  weakest: () => (a, b) => a.maxHp - b.maxHp || a.hp - b.hp || a.id - b.id,
  spread: (inst, m) => (a, b) => onHero(inst, a) - onHero(inst, b) || (rowOf(a) === 'front' ? 0 : 1) - (rowOf(b) === 'front' ? 0 : 1)
    || dist2(a, m) - dist2(b, m) || a.id - b.id,
});
/* The row a reach keeps to (null: every hero). */
const ROW_OF_REACH = Object.freeze({ front: 'front', back: 'back' });

/**
 * WHOM ROLE `role`'S REACH TAKES for monster `m`: the first living enemy hero inside its pack's area by the reach's order (BEFORE),
 * kept to its row when the reach names one. Null when none matches (the caller aims as it always did). Pure.
 */
export function reachPick(inst, m, role) {
  const cmp = role && BEFORE[role.reach] ? BEFORE[role.reach](inst, m) : null;
  if (!cmp) return null;
  const keep = ROW_OF_REACH[role.reach] || null;
  let best = null;
  for (const h of inst.world.units) {
    if (!isHero(h) || !h.alive || !isEnemy(m, h) || !inArea(inst, m.pocket, h.x, h.y)) continue;
    if (keep && rowOf(h) !== keep) continue;
    if (!best || cmp(h, best) < 0) best = h;
  }
  return best ? best.id : null;
}

/**
 * A ROLE KEEPS TO ITS REACH (targeting.js chooseTargets, every sub-step): the hero monster `m` turns on now, or null to keep its target.
 * At its aim (aimOf) the hero its reach wants may still be walking in, outside the pack's area, and a Challenge takes it for a while;
 * so while it is not held (holdMs) a monster whose target is not what its reach asks turns to the hero that is, once one stands in its
 * area: a front or back reach when its target is out of that row, a stalker when a hero with less max HP than its target is there. A
 * swarm keeps whom it was given (its count would turn it back and forth). Off the scale, held, or nothing better: null. Pure.
 */
export function reaimOf(inst, m) {
  const role = roleOf(inst, m);
  if (!role || role.reach === 'spread' || m.holdMs > 0) return null;
  const pick = reachPick(inst, m, role);
  if (pick === null || pick === m.target) return null;
  const cur = inst.world.units.find((u) => u.id === m.target && u.alive && isHero(u));
  if (!cur) return pick;
  const keep = ROW_OF_REACH[role.reach];
  if (keep) return rowOf(cur) === keep ? null : pick;
  const p = inst.world.units.find((u) => u.id === pick);
  return p.maxHp < cur.maxHp ? pick : null;
}

/** The other living heroes a blow by monster `m` at hero `t` also lands on (its role's splash: within `r` tiles of `t`), in id order,
    with the share of the blow each takes; none off the scale or for a role with no splash. */
export function splashOn(inst, m, t) {
  const role = roleOf(inst, m);
  if (!role || !role.splash) return { pm: 0, heroes: [] };
  const heroes = inst.world.units.filter((h) => h !== t && h.alive && isHero(h) && isAlly(h, t) && cheb(h, t) <= role.splash.r).sort((a, b) => a.id - b.id);
  return { pm: role.splash.pm, heroes };
}
