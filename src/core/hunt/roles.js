// ============================================================
// src/core/hunt/roles.js — PER-ROLE POSITIONING (spec §3.2 #2-10; parity RO-01..19)
//
// Where every unit WANTS to stand in a fight. This file only sets goals
// (movement.setGoal / clearGoal / chooseSpot); movement.js takes every step.
//
//   monsters   surround their target, nearest first; extras queue on ring 2 (RO-02)
//   tank       holds with a monster on him, on open ground (a step or two off a wall
//              while a full box walks in); else steps toward the nearest (RO-01)
//   Melee DPS  a free slot by the tank's target; never pulls or holds (RO-03)
//   ranged     a claimed spot at its distance from its OWN target (RO-04..08)
//   kiters     chase off AND distance > 1 (RO-09): keep the gap, retreat away
//              from the pack, close in when nothing is in range (RO-10..13)
//
// The hero's settings (role, distance, chase, target mode) are persisted on its
// unit: the settle writes them from the character's hunt settings when the
// hero joins and when they change; a window never reads them from elsewhere.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_ROLES, ROLE_ORDER, SPOT, KITE, SURROUND, AI_REPATH_MS, OPEN_GROUND } from '../../data/hunt-roles.js?v=0.2.73';
import { ROLE_DEFAULTS, HERO_DISTANCE, DEFAULT_TARGET_MODE } from '../../data/rule-subjects.js?v=0.2.73';
import { walkable, cheb, dist2, los, ringFree, tileKey } from './grid.js?v=0.2.73';
import { inArea } from './leash.js?v=0.2.73';
import { atRest, unitById, setGoal, clearGoal, candidateTiles, chooseSpot, standable, goToNearest, reachWithin } from './movement.js?v=0.2.73';
import { roleOf, engaged, inRange, pickTargets } from './targeting.js?v=0.2.73';

/* role/dist/chase/tmode: the hero's settings. queued: a monster with no surround slot.
   aiMs: ms until the unit re-picks its goal. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['role', 'str'], ['dist', 'int'], ['chase', 'bool'], ['tmode', 'str'], ['queued', 'bool'], ['aiMs', 'int']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

/** KITING = chase off AND distance > 1; distance 1 with chase off holds (spec §3.2 #5, RO-09). */
export const kites = (u) => !u.chase && u.dist > 1;

/** The pull leader: the first hero by role order, ties by id (spec §3.2 #3). Null with no hero that has a role. */
export function pickLeader(units) {
  let best = null; let rank = Infinity;
  for (const u of units) {
    const r = u.side === 'hero' ? ROLE_ORDER.indexOf(u.role) : -1;
    if (r >= 0 && (r < rank || (r === rank && u.id < best.id))) { best = u; rank = r; }
  }
  return best ? best.id : null;
}

/**
 * A hero's default settings for its role in this party (RO-15). A party with no
 * Melee hero kites: its ranged heroes start with chase off (RO-14). A party of one
 * has no leader to follow, so "follow" becomes the default mode.
 */
export function defaultSettings(role, partyRoles) {
  const d = ROLE_DEFAULTS[role];
  if (!d || !HUNT_ROLES[role]) throw new Error('roles: no defaults for role ' + role);
  const noMelee = !partyRoles.some((r) => HUNT_ROLES[r] && HUNT_ROLES[r].melee);
  const dist = Math.min(HERO_DISTANCE.max, Math.max(HERO_DISTANCE.min, d.dist));
  return {
    dist,
    chase: HUNT_ROLES[role].melee ? d.chase : (noMelee ? false : d.chase),
    tmode: partyRoles.length === 1 && d.tmode === 'follow' ? DEFAULT_TARGET_MODE : d.tmode,
    stance: d.stance,
  };
}

const occupiedBy = (inst, x, y) => {
  const k = tileKey(inst.grid, x, y);
  return { mon: inst.occ.mon.get(k) || null, heroes: inst.occ.hero.get(k) || 0 };
};
const meanOf = (mons) => [mons.reduce((a, m) => a + m.x, 0) / mons.length, mons.reduce((a, m) => a + m.y, 0) / mons.length];
const nearestTo = (list, u) => list.slice().sort((a, b) => dist2(a, u) - dist2(b, u) || a.id - b.id)[0] || null;

/* ── MONSTERS (RO-02) ─────────────────────────────────────── */

/* May a monster of `pocket` stand at (tx + dx, ty + dy) and hit (tx, ty)? Walkable, no corner cut, inside
   its pack area: the ground's half of a surround slot, whoever stands there now. The ONE definition the
   surround and the tank's open ground (roomAt) both read. */
function hitsFrom(inst, pocket, tx, ty, dx, dy) {
  const x = tx + dx; const y = ty + dy;
  if (!walkable(inst.grid, x, y)) return false;
  if (dx && dy && (!walkable(inst.grid, tx + dx, ty) || !walkable(inst.grid, tx, ty + dy))) return false;
  return inArea(inst, pocket, x, y);
}

/* The 8 neighbours, in the order a box's slots are numbered (bit i of a slot mask). */
const AROUND = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]);
const bits = (n) => { let c = 0; for (let v = n; v; v &= v - 1) c++; return c; };

/**
 * THE ROOM ROUND (x, y) for a pack of `pocket`: how full a box the pack can make round a tank on it.
 * A slot counts (hitsFrom) only if a monster can step into it from OUTSIDE the box; the tiles outside
 * the box, within OPEN_GROUND.wayRound of it, inside the pack area, fall into the stretches of ground a
 * monster can walk between without crossing the box (a wall that cuts the ring two away, a corridor
 * mouth, splits them). A pack walks in from one side, so the box it can fill is the slots ONE stretch
 * feeds: room = BOX_ROOM x the most slots one stretch feeds + the slots any stretch feeds. Terrain and
 * the leash only (no unit), so it is the same tile's same number every time it is asked. Full: ROOM_MAX.
 * (Measured on the Sewer's slime room, density 8: a tank on the corridor mouth has eight slots, but the
 * walls cut its ring in two and the pack, walking in from the south-west, filled five: room 5.)
 */
const BOX_ROOM = 16;
const ROOM_MAX = 8 * BOX_ROOM + 8;
export function roomAt(inst, pocket, x, y) {
  const g = inst.grid;
  const R = OPEN_GROUND.wayRound; const W = 2 * R + 1;
  const label = new Int16Array(W * W);   // 0 unseen, else 1 + the stretch's index
  const idx = (ax, ay) => (ay - y + R) * W + (ax - x + R);
  /* a tile of the ground round the box: in the window, off the box, walkable, inside the pack area */
  const outside = (ax, ay) => { const r = Math.max(Math.abs(ax - x), Math.abs(ay - y)); return r >= 2 && r <= R && walkable(g, ax, ay) && inArea(inst, pocket, ax, ay); };
  const legal = (ax, ay, dx, dy) => !(dx && dy) || (walkable(g, ax + dx, ay) && walkable(g, ax, ay + dy));
  const feeds = [];
  const flood = (fx, fy) => {
    const id = feeds.push(0);
    label[idx(fx, fy)] = id;
    const q = [fx, fy];
    for (let h = 0; h < q.length; h += 2) {
      const ax = q[h]; const ay = q[h + 1];
      for (const [dx, dy] of AROUND) {
        const nx = ax + dx; const ny = ay + dy;
        if (!outside(nx, ny) || label[idx(nx, ny)] || !legal(ax, ay, dx, dy)) continue;
        label[idx(nx, ny)] = id;
        q.push(nx, ny);
      }
    }
    return id;
  };
  let any = 0;
  AROUND.forEach(([dx, dy], i) => {
    if (!hitsFrom(inst, pocket, x, y, dx, dy)) return;
    const sx = x + dx; const sy = y + dy;
    for (const [ex, ey] of AROUND) {
      const fx = sx + ex; const fy = sy + ey;
      if (!outside(fx, fy) || !legal(sx, sy, ex, ey)) continue;
      const id = label[idx(fx, fy)] || flood(fx, fy);
      feeds[id - 1] |= 1 << i;
      any |= 1 << i;
    }
  });
  return BOX_ROOM * feeds.reduce((m, f) => Math.max(m, bits(f)), 0) + bits(any);
}

/* The free tile next to `t` nearest `m`: walkable, in m's pack area, nobody on it,
   no slot already handed out, no corner cut. */
function surroundSlot(inst, m, t, taken) {
  let best = null; let bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = t.x + dx; const y = t.y + dy;
      if ((!dx && !dy) || taken.has(tileKey(inst.grid, x, y)) || !hitsFrom(inst, m.pocket, t.x, t.y, dx, dy)) continue;
      const o = occupiedBy(inst, x, y);
      if ((o.mon && o.mon !== m) || o.heroes) continue;
      const d = dist2({ x, y }, m);
      if (d < bd) { bd = d; best = [x, y]; }
    }
  }
  return best;
}

function positionMonsters(inst, sc) {
  const taken = new Set();
  const mons = engaged(inst).map((m) => [m, unitById(inst, m.target)]).filter(([, t]) => t && t.alive)
    .sort(([a, ta], [b, tb]) => dist2(a, ta) - dist2(b, tb) || a.id - b.id);
  for (const [m, t] of mons) {
    if (cheb(m, t) <= 1 && atRest(m)) { taken.add(tileKey(inst.grid, m.x, m.y)); clearGoal(m); m.queued = false; continue; }
    if (m.aiMs > 0 && m.path.length) continue;
    m.aiMs = SURROUND.repathMs;
    const slot = surroundSlot(inst, m, t, taken);
    if (slot) { taken.add(tileKey(inst.grid, slot[0], slot[1])); setGoal(inst, m, slot[0], slot[1]); m.queued = false; continue; }
    m.queued = true;
    const q = ringFree(inst.grid, t, SURROUND.queueRing, m, (x, y) => {
      const o = occupiedBy(inst, x, y);
      return (o.mon && o.mon !== m) || o.heroes > 0 || !inArea(inst, m.pocket, x, y);
    });
    if (q) setGoal(inst, m, q[0], q[1]);
  }
}

/* ── HEROES ───────────────────────────────────────────────── */

/* The tank (RO-01): a monster on him → hold, on open ground (plantOpen); none, chase on, and
   the nearest farther than dist + 1.5 → step to a free tile beside it. The monsters come to him. */
function tankPos(inst, h, mons) {
  if (kites(h)) { h.spot = null; keepDistance(inst, h, mons); return; }
  if (!h.chase) { h.spot = null; clearGoal(h); return; }
  /* A tank no monster is on (a second tank: the pack is on the other one) walks to its own target
     like any melee, whatever else stands beside it on the way. The hold below is for the tank the
     pack walks to; without this a second tank within dist + 1.5 of the fight never moved and hit
     only what wandered next to it (live v0.2.20, ~30% of the leader's blows). */
  const onMe = mons.filter((m) => m.target === h.id);
  if (!onMe.length) { h.spot = null; closeIn(inst, h, unitById(inst, h.target) || nearestTo(mons, h)); return; }
  const near = nearestTo(mons, h);
  const zone = (2 * h.dist + 3) * (2 * h.dist + 3);
  if (plantOpen(inst, h, onMe, near, zone)) return;
  if (mons.some((m) => cheb(m, h) <= 1)) { clearGoal(h); return; }
  if (4 * dist2(near, h) <= zone || h.aiMs > 0) return;
  h.aiMs = AI_REPATH_MS.melee;
  h.spot = null;   // walking out to meet the pack gives up the open ground he claimed
  const t = ringFree(inst.grid, near, 1, h, (x, y) => !standable(inst, h, near.pocket, x, y));
  if (t) setGoal(inst, h, t[0], t[1]);
}

/*
 * THE OPEN GROUND (Tyler + Andy 2026-10-25: "fix pathing so that the tank doesn't stand next to the wall.
 * During an 8 box it ruins the whole point"). A full box is eight monsters on the eight tiles round the
 * tank, so his area blows and Challenge reach them all; with his back to a wall, a corner or the pack
 * area's edge only three to seven tiles take a monster and the rest queue out of reach. Before 2026-10-25
 * the tank planted wherever the pull left him: within pullDist of the pack's centre, or on the ring's edge
 * of a full box (pull-cycle.js travel), whatever stood beside that tile.
 *
 * While his pack is still walking in (one of the monsters on him is not beside him) and more of it than his
 * box can take (roomAt: the slots one stretch of ground round him can feed), he looks at every tile he can reach within
 * OPEN_GROUND.steps moves round the monsters standing now, inside the pack area (never out of it: that
 * resets the pack), standable, and close enough to the nearest monster that he would hold there rather than
 * walk out to meet it (the hold zone, dist + 1.5, so the walk-out below never undoes the step). The tile with
 * the most room wins, ties to the fewest moves, then breadth-first order; only a tile with STRICTLY more room
 * than his own, so he never walks into worse ground and every step he takes leaves him with more room (at
 * most a few per pull, never back and forth). The tile is his claimed SPOT (movement.js: no other hero
 * claims it) until he stands on it, a monster takes it or the fight ends. Chase off holds where he stands
 * and a kiting tank keeps its distance, as before. Answers true while he walks to it.
 */
function plantOpen(inst, h, onMe, near, zone) {
  if (!onMe.length) return false;
  const pocket = onMe[0].pocket;
  const coming = onMe.some((m) => cheb(m, h) > 1);
  const s = h.spot;
  const walking = !!s && (s[0] !== h.x || s[1] !== h.y);
  /* Planted (his spot is his own tile): he looks again only every AI_REPATH_MS.melee, with the pack on him. */
  if (!walking && (!coming || (s && (h.aiMs > 0 || !onMe.some((m) => cheb(m, h) <= 1))))) return false;
  if (s && !walking) h.aiMs = AI_REPATH_MS.melee;
  const here = roomAt(inst, pocket, h.x, h.y);
  /* he needs room while the pack walks in and more of it is on him than his box takes */
  const needs = coming && here < ROOM_MAX && onMe.length > Math.floor(here / BOX_ROOM);
  if (walking) {
    const next = h.path[0];
    if (needs && standable(inst, h, pocket, s[0], s[1]) && roomAt(inst, pocket, s[0], s[1]) > here && (!next || inArea(inst, pocket, next[0], next[1]))) {
      if (!h.goal || h.goal[0] !== s[0] || h.goal[1] !== s[1]) setGoal(inst, h, s[0], s[1]);
      return true;
    }
    clearGoal(h);
  }
  let best = null; let room = here;
  if (needs) {
    const reach = reachWithin(inst, h, OPEN_GROUND.steps, (x, y) => !inArea(inst, pocket, x, y));
    for (const [x, y] of reach.tiles) {
      if (4 * dist2({ x, y }, near) > zone || !standable(inst, h, pocket, x, y)) continue;
      const r = roomAt(inst, pocket, x, y);
      if (r > room) { room = r; best = [x, y, reach.pathTo(x, y)]; }
    }
  }
  if (!best) { h.spot = [h.x, h.y]; return false; }
  h.spot = [best[0], best[1]];
  h.goal = [best[0], best[1]];
  h.path = best[2];
  return true;
}

/* Melee DPS (RO-03): beside its own mark (targeting.js; its default Target, "follow", is the
   leader's target), never the puller. */
function meleePos(inst, h, mons) {
  if (kites(h)) { keepDistance(inst, h, mons); return; }
  if (!h.chase) { clearGoal(h); return; }
  closeIn(inst, h, unitById(inst, h.target));
}

/*
 * THE WALK EVERY MELEE HERO TAKES TO ITS MARK (Tyler 2026-10-16: heroes pass through
 * heroes, a footprint is one tile). The nearest free tile beside `tgt` it can REACH
 * round the monsters standing now; when the mark has none, the nearest tile beside
 * any other engaged monster it can reach, and that monster (the first in its own
 * Target order the tile touches) becomes its target; when nothing is reachable, the
 * mark's queue ring. Re-aimed every AI_REPATH_MS.melee, and at once on a new target
 * (targeting.js zeroes aiMs). Before 2026-10-21 it walked to the nearest free tile
 * by straight-line distance, reachable or not, and a hero whose tile sat behind the
 * pack (a diagonal past a corner, the far side after a kill) stood still all pull.
 */
function closeIn(inst, h, tgt) {
  if (!tgt) return;
  if (cheb(h, tgt) <= 1 && atRest(h)) { clearGoal(h); return; }
  if (h.aiMs > 0) return;
  h.aiMs = AI_REPATH_MS.melee;
  const beside = (list) => (x, y) => list.some((m) => cheb(m, { x, y }) <= 1 && (m.x !== x || m.y !== y) && standable(inst, h, m.pocket, x, y));
  if (goToNearest(inst, h, beside([tgt]))) return;
  const others = pickTargets(inst, h).filter((m) => m !== tgt);
  const at = others.length ? goToNearest(inst, h, beside(others)) : null;
  if (at) {
    const m = others.find((o) => cheb(o, { x: at[0], y: at[1] }) <= 1);
    if (m) h.target = m.id;
    return;
  }
  const q = ringFree(inst.grid, tgt, SURROUND.queueRing, h, (x, y) => !standable(inst, h, tgt.pocket, x, y));
  if (q) setGoal(inst, h, q[0], q[1]);
}

/* A ranged hero's distance d from its target must lie in [want - below, want + above] (tenths). */
function inBand(d2, want) {
  const lo = want * 10 - SPOT.bandBelowTenths; const hi = want * 10 + SPOT.bandAboveTenths;
  return 100 * d2 >= Math.max(0, lo) * Math.max(0, lo) && 100 * d2 <= hi * hi;
}

/* Ranged (RO-04..08): a spot at `dist` from its OWN target, claimed once, held with hysteresis. */
function rangedPos(inst, h, mons) {
  if (!Number.isInteger(h.target)) return;
  if (kites(h)) { keepDistance(inst, h, mons); return; }
  if (!h.chase) { clearGoal(h); return; }
  const tgt = unitById(inst, h.target);
  if (!tgt) return;
  const nearMon = mons.some((m) => cheb(m, h) <= 1);
  if (h.aiMs > 0 && !nearMon) return;
  h.aiMs = AI_REPATH_MS.ranged;
  const want = h.dist;
  const living = inst.world.units.filter((m) => m.side === 'mon' && m.alive);
  const valid = (x, y) => inBand(dist2({ x, y }, tgt), want) && los(inst.grid, { x, y }, tgt)
    && !living.some((m) => cheb(m, { x, y }) <= 1);
  const score = (x, y) => {
    const p = { x, y };
    let s = Math.abs(Math.sqrt(dist2(p, tgt)) - want) * SPOT.weightOffDistance + Math.sqrt(dist2(p, h)) * SPOT.weightWalk;
    for (const m of mons) s -= Math.min(Math.sqrt(dist2(p, m)), SPOT.roomCap) * SPOT.weightRoomPerMonster;
    return s;
  };
  let best = null; let bestScore = Infinity;
  for (const [x, y] of candidateTiles(inst, h, tgt.pocket, tgt.x, tgt.y, SPOT.searchRadius)) {
    if (!valid(x, y)) continue;
    const s = score(x, y);
    if (s < bestScore) { bestScore = s; best = [x, y]; }
  }
  const curScore = h.spot ? score(h.spot[0], h.spot[1]) : Infinity;
  chooseSpot(inst, h, { pocket: tgt.pocket, best, bestScore, curScore, hysteresis: SPOT.hysteresis, valid });
}

/**
 * KEEP THE DISTANCE (spec §3.2 #5, #7-9; RO-10..13). Nothing in range and every
 * monster at least `dist` away (leashed monsters cannot come out): close in to the
 * nearest standable tile from which one is in range, still `dist` short of it.
 * Far enough and standing: hold and shoot. Otherwise retreat to the nearest tile
 * that restores the gap, AWAY from the pack centre (never through it), never next
 * to a monster, inside the pack area (candidateTiles is the hard filter).
 */
function keepDistance(inst, h, mons) {
  const row = roleOf(h);
  const want = h.dist;
  const pocket = mons[0].pocket;
  const gap = (x, y) => Math.min(...mons.map((m) => cheb(m, { x, y })));
  const minGap = Math.min(want, KITE.minGap);
  if (gap(h.x, h.y) >= want && !mons.some((m) => inRange(inst, h, m))) {
    if (h.aiMs > 0 && h.path.length) return;
    h.aiMs = AI_REPATH_MS.kite;
    const n = nearestTo(mons, h);
    let best = null; let bd = Infinity;
    for (const [x, y] of candidateTiles(inst, h, pocket, n.x, n.y, want)) {
      const p = { x, y };
      if (gap(x, y) < minGap || dist2(p, n) > row.range * row.range || !los(inst.grid, p, n)) continue;
      const d = dist2(p, h) + (gap(x, y) >= want ? 0 : 1000);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) setGoal(inst, h, best[0], best[1]);
    return;
  }
  if (gap(h.x, h.y) >= want && !h.path.length) return;
  if (h.goal && h.path.length && gap(h.goal[0], h.goal[1]) >= want) return;
  const [cx, cy] = meanOf(mons);
  const here = Math.hypot(h.x - cx, h.y - cy);
  let best = null; let bs = Infinity;
  for (const [x, y] of candidateTiles(inst, h, pocket, h.x, h.y, KITE.searchRadius)) {
    if (Math.hypot(x - cx, y - cy) - here <= KITE.awayMin) continue;
    const g = gap(x, y);
    if (g < minGap) continue;
    const p = { x, y };
    const s = Math.sqrt(dist2(p, h)) + (g >= want + 1 ? 0 : (want + 1 - g) * KITE.shortPenalty)
      + (mons.some((m) => los(inst.grid, p, m)) ? 0 : KITE.noSightPenalty);
    if (s < bs) { bs = s; best = [x, y]; }
  }
  if (best && (best[0] !== h.x || best[1] !== h.y)) setGoal(inst, h, best[0], best[1]);
}

/**
 * Phase-AI hook, every sub-step: engaged monsters take their surround slots, then
 * (in a fight) every hero with a role is placed by its role. Out of a fight a
 * ranged hero gives up its claimed spot.
 */
export function positionHeroes(inst, sc) {
  for (const u of inst.world.units) if (u.aiMs > 0) u.aiMs = Math.max(0, u.aiMs - sc.dtMs);
  positionMonsters(inst, sc);
  const fighting = inst.world.phase === 'fight';
  const mons = engaged(inst);
  for (const h of inst.world.units) {
    const row = roleOf(h);
    if (!row || !h.alive) continue;
    if (!fighting || !mons.length) { h.spot = null; continue; }
    if (row.tank) tankPos(inst, h, mons);
    else if (row.melee) meleePos(inst, h, mons);
    else rangedPos(inst, h, mons);
  }
}
