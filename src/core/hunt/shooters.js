// ============================================================
// src/core/hunt/shooters.js — A MONSTER THAT SHOOTS (the Krell's Hold design's engine piece 2, docs/planning/PRIORITY_BOARD.md
// "2026-11-10 Krell's Hold": Hask's Lookout "shoots a crossbow from range at the hero farthest back and doesn't walk in. Challenge
// turns his aim to the tank")
//
// A monster whose row has a `range` (src/data/monsters.js monsterRangeOf: whole tiles, MONSTER_RANGE) is a SHOOTER. Every other
// monster is untouched: each reader below answers what it always answered for a row with no range, and draws no die.
//   aim     when its pack is pulled (pull-cycle.js startPull) and whenever its target falls (targeting.js chooseTargets), it turns
//           on the living hero FARTHEST from it standing inside its pack's area (ties: the lower unit id); with none there, on
//           the hero a melee monster would take (the puller, the leader). A Challenge takes it as it takes any monster
//           (targeting.js challengeFrom): then it shoots the tank. Nothing else moves its aim (it is never queued, so no peel).
//   stand   it takes no surround slot (roles.js positionMonsters): it walks to the nearest tile it can reach inside its pack's
//           area from which it can shoot its target, and stands there. With no such tile in reach it stands where it is.
//   shoot   it swings standing on a tile, at a target within `range` tiles in a straight line it can see (the rule a ranged
//           hero's shot has, targeting.js inRange: dist2 <= range x range, line of sight), its blow priced as any monster's
//           (damage.js resolveAttacks: its own stats against the hero's, Tyler 2026-11-04).
//   melee   a hero walks to it as to any engaged monster its Target setting names (the kind-first Target can name it first);
//           a shooter a hero stands beside still shoots its own target. A hero it shoots is not HOLDING it (targeting.js
//           holding): a Melee hero shot from range still walks to its mark, and a tank with only shooters on him walks out
//           to them instead of holding for a box that never comes (roles.js tankPos).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Persists nothing: a shooter's goal, path and re-aim clock are the
// unit's own (movement.js, roles.js PERSISTED), so the world's shape does not move.
// ============================================================

import { MONSTERS, monsterRangeOf } from '../../data/monsters.js?v=0.2.129';
import { SURROUND } from '../../data/hunt-roles.js?v=0.2.129';
import { cheb, dist2, los } from './grid.js?v=0.2.129';
import { inArea } from './leash.js?v=0.2.129';
import { clearGoal, goToNearest } from './movement.js?v=0.2.129';

/** The tiles monster unit `m` shoots from, or 0: a hero, or a monster that fights beside its target. Its row through the
    instance's one door (world-step.js inst.monsters: a scaled hunt's table), the catalogue for a bare caller. */
export function rangeOf(inst, m) {
  return m && m.side === 'mon' ? monsterRangeOf((inst.monsters || MONSTERS)[m.kind]) : 0;
}

/* Can a shot of `r` tiles from (x, y) reach unit `t`: within r in a straight line, nothing opaque between (targeting.js inRange). */
const inShot = (inst, x, y, t, r) => dist2({ x, y }, t) <= r * r && los(inst.grid, { x, y }, t);

/** Can monster `m` land a blow on `t` from the tile it stands on? A shooter: within its range, in sight. Any other: beside it. */
export function reaches(inst, m, t) {
  const r = rangeOf(inst, m);
  return r ? inShot(inst, m.x, m.y, t, r) : cheb(m, t) <= 1;
}

/**
 * WHO MONSTER `m` AIMS AT, given the hero a melee monster would take (`fallback`, a unit id or null): a shooter, the living hero
 * farthest from it inside its pack's area (ties: the lower id), else `fallback`; any other monster, `fallback`. Pure.
 */
export function aimOf(inst, m, fallback) {
  if (!rangeOf(inst, m)) return fallback;
  let best = null;
  for (const h of inst.world.units) {
    if (h.side !== 'hero' || !h.alive || !inArea(inst, m.pocket, h.x, h.y)) continue;
    if (!best || dist2(h, m) > dist2(best, m) || (dist2(h, m) === dist2(best, m) && h.id < best.id)) best = h;
  }
  return best ? best.id : fallback;
}

/**
 * WHERE A SHOOTER STANDS (roles.js positionMonsters, in place of the surround): on a tile it can shoot `t` from, it stops (the
 * rest of its path dropped, so a step it is rolling ends there); else, at most every SURROUND.repathMs, it walks to the nearest
 * such tile it can reach round every unit standing now, inside its pack's area (movement.js goToNearest: the leash vetoes the
 * rest). None in reach: it stands. A shooter is never queued.
 */
export function placeShooter(inst, m, t) {
  m.queued = false;
  const r = rangeOf(inst, m);
  if (inShot(inst, m.x, m.y, t, r)) { clearGoal(m); return; }
  if (m.aiMs > 0 && m.path.length) return;
  m.aiMs = SURROUND.repathMs;
  if (!goToNearest(inst, m, (x, y) => inShot(inst, x, y, t, r))) clearGoal(m);
}
