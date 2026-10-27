// ============================================================
// src/core/hunt/movement.js — EVERY STEP ANY UNIT TAKES (spec §3.1; parity MV-01..12)
//
// The only writer of a unit's tile. A unit stands on (x, y) when it is at
// rest (fx, fy) === (x, y); while stepping it rolls from (fx, fy) onto (x, y),
// `prog` millitiles along a step of length HUNT_TUNING.stepCost, and it spends
// its whole budget each sub-step, rolling straight into the next tile with no
// stop at the centre (MV-02). Positions persist as integers only.
//
// COLLISION (Tyler 2026-10-16): heroes pass through heroes — no swap, no
// queue, no wait (MV-04 and MV-06 are not rebuilt). A monster blocks everyone;
// a hero blocks monsters. A blocked unit waits, then re-plans round the
// blocker (MV-05).
//
// THE LEASH: every monster plan and every monster step asks
// leash.leashAllows. This file is its only importer.
//
// Also here, because they are claims on tiles: the leader's trail and
// follow-the-leader (MV-08/09), and the SPOT a hero claims to stand on in a
// fight (a ranged hero's shooting spot with hysteresis, RO-07/08; the holding
// tank's open ground, roles.js plantOpen) plus the hard pack-area filter every
// hero tile search uses (RO-13). roles.js scores tiles; this file decides which
// may be stood on.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_TUNING } from '../../data/hunt-tuning.js?v=0.2.56';
import { walkable, astar, bfsTo, bfsWithin, cheb, stepCost, tileKey } from './grid.js?v=0.2.56';
import { leashAllows, inArea } from './leash.js?v=0.2.56';
import { trackStep } from './events.js?v=0.2.56';

/* What this module keeps on the persisted world (world-state.js encodes it). */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['fx', 'int'], ['fy', 'int'], ['prog', 'int'], ['speed', 'int'], ['dir', 'int'],
    ['goal', 'tile'], ['path', 'tiles'], ['waitMs', 'int'], ['repathMs', 'int'], ['spot', 'tile']]),
  world: Object.freeze([['trail', 'tiles']]),
  pack: Object.freeze([]),
});

/* 8-way facing (MV-07): a unit's `dir` indexes this list. */
export const DIRS = Object.freeze(['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']);
const DIR_OF = Object.freeze({ '0,1': 0, '1,1': 1, '1,0': 2, '1,-1': 3, '0,-1': 4, '-1,-1': 5, '-1,0': 6, '-1,1': 7 });

/** The facing of a move or a look by (dx, dy); standing still faces south. */
export function dirOf(dx, dy) {
  const k = Math.sign(dx) + ',' + Math.sign(dy);
  return k in DIR_OF ? DIR_OF[k] : 0;
}

export const atRest = (u) => u.fx === u.x && u.fy === u.y;
export const unitById = (inst, id) => inst.world.units.find((u) => u.id === id) || null;
export const leaderOf = (inst) => {
  const k = Number.isInteger(inst.world.leader) ? unitById(inst, inst.world.leader) : null;
  return k && k.alive ? k : null;
};

/** Rebuild the occupancy maps from the living units: monsters by tile, hero counts by tile. */
export function occupancy(inst) {
  const mon = new Map(); const hero = new Map();
  for (const u of inst.world.units) {
    if (!u.alive) continue;
    const k = tileKey(inst.grid, u.x, u.y);
    if (u.side === 'mon') mon.set(k, u); else hero.set(k, (hero.get(k) || 0) + 1);
  }
  inst.occ = { mon, hero };
  return inst.occ;
}

/** Does something stop `u` stepping onto (x, y)? A monster stops everyone; a hero stops monsters. */
function blocks(inst, u, x, y) {
  const k = tileKey(inst.grid, x, y);
  const m = inst.occ.mon.get(k);
  if (m && m !== u) return true;
  return u.side === 'mon' && (inst.occ.hero.get(k) || 0) > 0;
}

/** Plan a path for `u`; the leash vetoes every tile a monster may not stand on. */
function plan(inst, u, gx, gy, avoid) {
  const veto = (x, y) => !leashAllows(inst, u, x, y) || (avoid ? avoid(x, y) : false);
  return astar(inst.grid, u.x, u.y, gx, gy, veto, HUNT_TUNING.pathNodeCap);
}

/** Is there a way to (gx, gy) for `u` round every monster standing now (occupancy fresh)? */
export function reachable(inst, u, gx, gy) {
  return !!plan(inst, u, gx, gy, (x, y) => blocks(inst, u, x, y));
}

/**
 * Aim `u` at the NEAREST tile `goal(x, y)` accepts that it can reach round every
 * monster standing now (occupancy fresh; grid.bfsTo). Answers that tile (its own
 * when it already stands on one: the goal is cleared) or null, leaving `u` as it was.
 */
export function goToNearest(inst, u, goal) {
  const p = bfsTo(inst.grid, u.x, u.y, goal, (x, y) => blocks(inst, u, x, y) || !leashAllows(inst, u, x, y), HUNT_TUNING.pathNodeCap);
  if (!p) return null;
  if (!p.length) { clearGoal(u); return [u.x, u.y]; }
  const end = p[p.length - 1];
  u.goal = [end[0], end[1]];
  u.path = p;
  return u.goal;
}

/**
 * Every tile `u` can reach within `steps` moves round every monster standing now (occupancy fresh),
 * `veto(x, y)` refusing more (grid.bfsWithin): { tiles: [[x, y, moves], …] fewest moves first, pathTo(x, y) }.
 */
export function reachWithin(inst, u, steps, veto) {
  return bfsWithin(inst.grid, u.x, u.y, steps, (x, y) => blocks(inst, u, x, y) || !leashAllows(inst, u, x, y) || (veto ? veto(x, y) : false));
}

/** Aim `u` at (gx, gy). The same goal keeps its path (MV-01); no path = stand. */
export function setGoal(inst, u, gx, gy) {
  if (u.goal && u.goal[0] === gx && u.goal[1] === gy && (u.path.length || (u.x === gx && u.y === gy))) return;
  u.goal = [gx, gy];
  u.path = plan(inst, u, gx, gy) || [];
}

export function clearGoal(u) {
  u.goal = null;
  u.path = [];
}

/* Try to start the next step of the path. True when a step began. */
function tryNextStep(inst, u, sc) {
  if (!u.path.length) return false;
  const [nx, ny] = u.path[0];
  /* A stale path is dropped, never walked: off the grid, not adjacent, or out of the leash. */
  if (!walkable(inst.grid, nx, ny) || cheb({ x: nx, y: ny }, u) !== 1 || !leashAllows(inst, u, nx, ny)) {
    u.path = [];
    return false;
  }
  if (blocks(inst, u, nx, ny)) {
    u.waitMs += sc.dtMs;
    if (u.waitMs >= HUNT_TUNING.blockedRepathMs && u.goal) {
      const R = HUNT_TUNING.blockedAvoidRadius;
      const p = plan(inst, u, u.goal[0], u.goal[1], (x, y) => cheb({ x, y }, u) <= R && blocks(inst, u, x, y));
      if (p && p.length) u.path = p;
      u.waitMs = 0;
    }
    return false;
  }
  u.waitMs = 0;
  u.path.shift();
  const from = tileKey(inst.grid, u.x, u.y); const to = tileKey(inst.grid, nx, ny);
  if (u.side === 'mon') {
    if (inst.occ.mon.get(from) === u) inst.occ.mon.delete(from);
    inst.occ.mon.set(to, u);
  } else {
    const n = (inst.occ.hero.get(from) || 0) - 1;
    if (n > 0) inst.occ.hero.set(from, n); else inst.occ.hero.delete(from);
    inst.occ.hero.set(to, (inst.occ.hero.get(to) || 0) + 1);
  }
  u.dir = dirOf(nx - u.x, ny - u.y);
  u.fx = u.x; u.fy = u.y; u.x = nx; u.y = ny; u.prog = 0;
  sc.track(trackStep(u.id, nx, ny, sc.atMs));
  return true;
}

/** Spend one sub-step of `u`'s travel budget (MV-02). Answers whether it moved. */
export function stepUnit(inst, u, sc) {
  let budget = Math.floor((u.speed * sc.dtMs) / 1000);
  let moved = false;
  for (let guard = 0; guard < 4 && budget > 0; guard++) {
    if (!atRest(u)) {
      const len = stepCost(u.fx, u.fy, u.x, u.y);
      const use = Math.min(len - u.prog, budget);
      u.prog += use; budget -= use; moved = true;
      if (u.prog >= len) { u.fx = u.x; u.fy = u.y; u.prog = 0; }
      continue;
    }
    if (!tryNextStep(inst, u, sc)) break;
  }
  return moved;
}

/** The movement sub-step: every living unit, in id order. */
export function moveAll(inst, sc) {
  occupancy(inst);
  for (const u of inst.world.units) {
    if (!u.alive) continue;
    if (u.repathMs > 0) u.repathMs = Math.max(0, u.repathMs - sc.dtMs);
    /* A goal with no path yet (a reset walk home, a plan that found nothing) is
       planned again, at most once per blockedRepathMs. */
    if (u.goal && !u.path.length && !(u.x === u.goal[0] && u.y === u.goal[1]) && u.repathMs === 0) {
      u.path = plan(inst, u, u.goal[0], u.goal[1]) || [];
      u.repathMs = HUNT_TUNING.blockedRepathMs;
    }
    stepUnit(inst, u, sc);
  }
}

/** The trail sub-step: the leader's tile joins its trail when it changes (MV-08). */
export function recordTrail(inst) {
  const k = leaderOf(inst);
  if (!k) return;
  const t = inst.world.trail;
  const last = t[t.length - 1];
  if (!last || last[0] !== k.x || last[1] !== k.y) {
    t.push([k.x, k.y]);
    if (t.length > HUNT_TUNING.trailLen) t.shift();
  }
}

/**
 * FOLLOW THE LEADER UNTIL A NEW TARGET (spec §3.1 #8, MV-09). Follower i (by
 * id, among the leader's party) aims at the trail tile trailSpacing·i back. A
 * hero holding a target of its own is not a follower this sub-step: roles.js
 * moves it.
 */
export function followTrail(inst) {
  const k = leaderOf(inst);
  if (!k) return;
  const t = inst.world.trail;
  let i = 0;
  for (const u of inst.world.units) {
    if (u.side !== 'hero' || u === k) continue;
    i++;
    if (!u.alive || Number.isInteger(u.target)) continue;
    const idx = t.length - 1 - i * HUNT_TUNING.trailSpacing;
    if (idx < 0) continue;
    const [tx, ty] = t[idx];
    if (u.x === tx && u.y === ty) continue;
    if (u.repathMs > 0 && u.path.length) continue;
    setGoal(inst, u, tx, ty);
    u.repathMs = HUNT_TUNING.followRepathMs;
  }
}

/** Has another living hero claimed (x, y) as its spot? (RO-07) */
export function spotTaken(inst, hero, x, y) {
  return inst.world.units.some((v) => v !== hero && v.alive && v.side === 'hero' && v.spot && v.spot[0] === x && v.spot[1] === y);
}

/**
 * May `hero` choose (x, y) to stand on while fighting pocket `pocket`? Walkable,
 * no monster on it, INSIDE THE PACK AREA (the hard filter of spec §3.1 #9 —
 * nothing deals damage from outside the leash) and nobody else's spot.
 */
export function standable(inst, hero, pocket, x, y) {
  if (!inst.occ) occupancy(inst);
  return walkable(inst.grid, x, y) && !inst.occ.mon.has(tileKey(inst.grid, x, y))
    && inArea(inst, pocket, x, y) && !spotTaken(inst, hero, x, y);
}

/** Every standable tile within Chebyshev r of (cx, cy), in scan order: the only kite / spot candidates. */
export function candidateTiles(inst, hero, pocket, cx, cy, r) {
  const out = [];
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) if (standable(inst, hero, pocket, x, y)) out.push([x, y]);
  }
  return out;
}

/**
 * THE RANGED SPOT (spec §3.1 #10, RO-07/08). roles.js scores the candidates
 * (lower is better) and passes:
 *   { pocket, best: [x, y] | null, bestScore, curScore, hysteresis, valid(x, y) }
 * A held spot that stays valid (roles' band / line of sight / no adjacent
 * monster, plus `standable`) is KEPT while the hero walks to it — never
 * re-picked en route — and, once there, given up only for a tile that scores
 * better by at least `hysteresis`. Answers the spot now held (or null).
 */
export function chooseSpot(inst, hero, pick) {
  const cur = hero.spot;
  const holds = !!cur && standable(inst, hero, pick.pocket, cur[0], cur[1]) && pick.valid(cur[0], cur[1]);
  if (holds) {
    const enRoute = hero.x !== cur[0] || hero.y !== cur[1];
    if (enRoute || !pick.best || pick.bestScore + pick.hysteresis > pick.curScore) {
      if (enRoute) setGoal(inst, hero, cur[0], cur[1]);
      return cur;
    }
  }
  const b = pick.best;
  if (!b || !standable(inst, hero, pick.pocket, b[0], b[1]) || !pick.valid(b[0], b[1])) {
    if (!holds) hero.spot = null;
    return hero.spot;
  }
  hero.spot = [b[0], b[1]];
  setGoal(inst, hero, b[0], b[1]);
  return hero.spot;
}
