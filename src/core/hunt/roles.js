// ============================================================
// src/core/hunt/roles.js — PER-ROLE POSITIONING (spec §3.2 #2-10; parity RO-01..19)
//
// Where every unit WANTS to stand in a fight. This file only sets goals
// (movement.setGoal / clearGoal / chooseSpot); movement.js takes every step.
//
//   monsters   surround their target, nearest first; extras queue on ring 2 (RO-02)
//   tank       holds with a monster on him; else steps toward the nearest (RO-01)
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

import { HUNT_ROLES, ROLE_ORDER, SPOT, KITE, SURROUND, AI_REPATH_MS } from '../../data/hunt-roles.js?v=0.2.35';
import { ROLE_DEFAULTS, HERO_DISTANCE, DEFAULT_TARGET_MODE } from '../../data/rule-subjects.js?v=0.2.35';
import { walkable, cheb, dist2, los, ringFree, tileKey } from './grid.js?v=0.2.35';
import { inArea } from './leash.js?v=0.2.35';
import { atRest, unitById, setGoal, clearGoal, candidateTiles, chooseSpot, standable, goToNearest } from './movement.js?v=0.2.35';
import { roleOf, engaged, inRange, pickTargets } from './targeting.js?v=0.2.35';

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

/* The free tile next to `t` nearest `m`: walkable, in m's pack area, nobody on it,
   no slot already handed out, no corner cut. */
function surroundSlot(inst, m, t, taken) {
  let best = null; let bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = t.x + dx; const y = t.y + dy;
      if ((!dx && !dy) || !walkable(inst.grid, x, y) || taken.has(tileKey(inst.grid, x, y))) continue;
      if (dx && dy && (!walkable(inst.grid, t.x + dx, t.y) || !walkable(inst.grid, t.x, t.y + dy))) continue;
      if (!inArea(inst, m.pocket, x, y)) continue;
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

/* The tank (RO-01): a monster on him → hold; none, chase on, and the nearest farther
   than dist + 1.5 → step to a free tile beside it. The monsters come to him. */
function tankPos(inst, h, mons) {
  if (kites(h)) { keepDistance(inst, h, mons); return; }
  if (!h.chase) { clearGoal(h); return; }
  /* A tank no monster is on (a second tank: the pack is on the other one) walks to its own target
     like any melee, whatever else stands beside it on the way. The hold below is for the tank the
     pack walks to; without this a second tank within dist + 1.5 of the fight never moved and hit
     only what wandered next to it (live v0.2.20, ~30% of the leader's blows). */
  if (!mons.some((m) => m.target === h.id)) { closeIn(inst, h, unitById(inst, h.target) || nearestTo(mons, h)); return; }
  if (mons.some((m) => cheb(m, h) <= 1)) { clearGoal(h); return; }
  const near = nearestTo(mons, h);
  if (4 * dist2(near, h) <= (2 * h.dist + 3) * (2 * h.dist + 3) || h.aiMs > 0) return;
  h.aiMs = AI_REPATH_MS.melee;
  const t = ringFree(inst.grid, near, 1, h, (x, y) => !standable(inst, h, near.pocket, x, y));
  if (t) setGoal(inst, h, t[0], t[1]);
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
