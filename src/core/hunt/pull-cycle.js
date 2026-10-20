// ============================================================
// src/core/hunt/pull-cycle.js — THE PULL CYCLE (spec §3.2 #16-18; parity PC-01..16)
//
// The phase machine of one instance (solo = a party of one):
//   travel   the leader walks to the next pocket's pack; followers walk his trail
//   fight    the pack is on the party; it ends when the pocket's last monster falls
//   regroup  everyone together within regroupRadius of the leader, at least regroupMs
// A world with no phase ('') is not cycled: a walker world the caller drives.
//
// Death (Tyler 2026-10-19): a hero at 0 HP is dead. It stays a body on the
// world until its member's next boundary, where its hunt ends `died` and the
// unit leaves (src/core/combat-sim.js). There is no knockout and no standing up.
// The LEADER dying resets every pack on the party (leash.resetPack) and the
// living heroes regroup at the entrance under the next leader.
//
// Packs: a cleared pack is back ground.respawnMs after it was cleared, never
// while its pocket is mid-fight (PC-09). A new monster takes its spawn tile, or
// the first free one within 3 inside its area (PC-02). Units are made by
// inst.makeUnit (world-state.makeUnit, handed in by world-step), so every
// persisted field is present.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_TUNING } from '../../data/hunt-tuning.js?v=0.2.20';
import { VITALS } from '../../data/core-model.js?v=0.2.20';
import { MONSTERS, monsterSpeedOf } from '../../data/monsters.js?v=0.2.20';
import { AI_REPATH_MS } from '../../data/hunt-roles.js?v=0.2.20';
import { packHpFor, yieldPermille, routeFor, pullRows } from '../../data/hunt-grounds.js?v=0.2.20';
import { cheb, dist2, freeNear, tileKey } from './grid.js?v=0.2.20';
import { inArea, resetPack } from './leash.js?v=0.2.20';
import { atRest, unitById, leaderOf, setGoal, clearGoal, occupancy } from './movement.js?v=0.2.20';
import { makeEvent, trackStep } from './events.js?v=0.2.20';
import { pickLeader, kites } from './roles.js?v=0.2.20';

/* deadMs: a corpse's age. hpMilli: out-of-combat regen carried below one HP.
   phase / routeIdx / phaseMs / regroupNext / runs / nextId: the cycle. alive / respawnAtMs: a pack. */
/* yieldPm: the share (permille) of its row's kill yield a monster pays: its HP scale at spawn. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['deadMs', 'int'], ['hpMilli', 'int'], ['yieldPm', 'int']]),
  world: Object.freeze([['phase', 'str'], ['routeIdx', 'int'], ['phaseMs', 'int'], ['regroupNext', 'bool'], ['runs', 'int'], ['nextId', 'int'],
    ['density', 'int']]),
  pack: Object.freeze([['alive', 'bool'], ['respawnAtMs', 'int']]),
});

export const PHASE = Object.freeze({ TRAVEL: 'travel', FIGHT: 'fight', REGROUP: 'regroup' });

const cycling = (inst) => inst.world.phase !== '';
/* THE ROUTE THIS PARTY WALKS (hunt-grounds.js routeFor): a pocket whose `minParty` the
   party misses is skipped (the Rat King wants two). The index wraps if the party shrank. */
const routeOf = (inst) => routeFor(inst.ground, partySize(inst));
const pocketNow = (inst) => { const r = routeOf(inst); return r[inst.world.routeIdx % r.length]; };
const packMonsters = (inst, p) => inst.world.units.filter((u) => u.side === 'mon' && u.alive && u.pocket === p);
const heroes = (inst) => inst.world.units.filter((u) => u.side === 'hero');

/** The instance's party size: its hero units (hunt-grounds.js scales by it). */
export const partySize = (inst) => inst.world.units.filter((u) => u.side === 'hero').length;

/**
 * Spawn pocket `p`'s pack (PC-02). On a ground that opts in (`partyScale`) each
 * monster's HP is the party scale's (hunt-grounds.js packHpFor: 550 / 700 / 850 /
 * 1000 permille for 1-4 heroes) at the size the instance has WHEN the pack spawns; a hero joining later meets the
 * next respawn at the new size. The DENSITY (world.density, the settle's
 * clamped pick: hunt-grounds.js densityFor) is the pack's SIZE: that many
 * monsters, the rows hunt-grounds.js pullRows gives (the pocket's authored rows,
 * then its non-boss fill rows round again: a boss never repeats inside a pull;
 * 0 = the pocket as built), each on the first free tile near its row's own spot
 * (deterministic). A full box is 8: every tile round the tank.
 */
export function spawnPack(inst, p, sc) {
  const w = inst.world;
  const heroes = partySize(inst);
  occupancy(inst);
  const taken = (x, y) => inst.occ.mon.has(tileKey(inst.grid, x, y)) || inst.occ.hero.has(tileKey(inst.grid, x, y)) || !inArea(inst, p, x, y);
  for (const s of pullRows(inst.ground, p, w.density)) {
    {
      const at = freeNear(inst.grid, s.x, s.y, 3, taken);
      const row = MONSTERS[s.monster];
      if (!at || !row) continue;
      const hp = packHpFor(inst.ground, row, heroes);
      /* SCALING IS PAID IN REWARD (designer ruling 2026-10-18): a monster at s/1000 of its HP pays s/1000
         of its kill yield (hunt-rewards.js, damage.landHit), so yield per HOUR holds at every party size. */
      const yieldPm = inst.ground.partyScale === true ? yieldPermille(heroes) : 1000;
      const u = inst.makeUnit({ id: w.nextId, side: 'mon', kind: s.monster, pocket: p, alive: true, hp, maxHp: hp, yieldPm,
        target: null, home: at, x: at[0], y: at[1], fx: at[0], fy: at[1], speed: monsterSpeedOf(row) });
      w.nextId += 1;
      w.units.push(u);
      inst.occ.mon.set(tileKey(inst.grid, at[0], at[1]), u);
      if (sc) sc.track(trackStep(u.id, at[0], at[1], sc.atMs));   // a respawn is placed by the track (visual only)
    }
  }
  w.packs[p].alive = true;
  w.packs[p].aggro = false;
  w.packs[p].holder = null;
  if (sc) sc.emit(makeEvent('respawn', sc.atMs, { pocket: p }));
}

/**
 * THE KILL HAND-OFF (damage.landHit): a monster becomes a corpse; a hero is dead
 * (its hunt ends at its next boundary); the leader dying resets the packs on the
 * party and the living regroup at the entrance (PC-13).
 */
export function fallen(inst, u, sc) {
  u.alive = false;
  u.hp = 0;
  u.target = null;
  clearGoal(u);
  if (u.side === 'mon') { u.deadMs = 0; return; }
  u.spot = null;
  if (inst.world.leader !== u.id) return;
  for (let p = 0; p < inst.world.packs.length; p++) if (inst.world.packs[p].aggro) resetPack(inst, p, sc);
  sc.emit(makeEvent('wipe', sc.atMs, {}));
  if (!cycling(inst)) return;
  inst.world.phase = PHASE.REGROUP;
  inst.world.phaseMs = HUNT_TUNING.regroupMs;
  inst.world.regroupNext = false;
  heroes(inst).filter((h) => h.alive).forEach((h, i) => {
    const s = inst.ground.start[i % inst.ground.start.length];
    h.target = null;
    setGoal(inst, h, s[0], s[1]);
  });
}

/** Respawn hook: a cleared pack whose timer ran out comes back, never mid-fight (PC-09). */
export function respawnPacks(inst, sc) {
  if (!cycling(inst)) return;
  const w = inst.world;
  for (let p = 0; p < w.packs.length; p++) {
    const pack = w.packs[p];
    if (pack.alive || sc.atMs < pack.respawnAtMs) continue;
    if (w.phase === PHASE.FIGHT && pocketNow(inst) === p) continue;
    spawnPack(inst, p, sc);
  }
}

function startPull(inst, sc, k, p) {
  const pack = inst.world.packs[p];
  pack.aggro = true;
  pack.holder = k.id;
  for (const m of packMonsters(inst, p)) m.target = k.id;
  clearGoal(k);
  inst.world.phase = PHASE.FIGHT;
  sc.emit(makeEvent('pull', sc.atMs, { pocket: p }));
}

function nextPocket(inst, k) {
  const w = inst.world;
  w.routeIdx += 1;
  if (w.routeIdx >= routeOf(inst).length) { w.routeIdx = 0; w.runs += 1; }
  w.phase = PHASE.TRAVEL;
  if (k) clearGoal(k);
}

/* TRAVEL (PC-03..06): walk to the pack centre; pull inside its area within pullDist of the
   centre (or on arriving); a kiting leader pulls from its distance + 1 instead. */
function travel(inst, sc, k) {
  const w = inst.world;
  const p = pocketNow(inst);
  const mons = packMonsters(inst, p);
  if (!w.packs[p].alive || !mons.length) {
    if (w.packs.some((pk) => pk.alive)) nextPocket(inst, k);
    return;
  }
  const c = { x: mons.reduce((a, m) => a + m.x, 0) / mons.length, y: mons.reduce((a, m) => a + m.y, 0) / mons.length };
  const here = inArea(inst, p, k.x, k.y);
  if (here && kites(k) && Math.min(...mons.map((m) => cheb(m, k))) <= k.dist + 1) { startPull(inst, sc, k, p); return; }
  const arrived = !!k.goal && k.x === k.goal[0] && k.y === k.goal[1] && atRest(k);
  /* WALLED OFF: the pack itself stands on the leader's next step. A full box (density 8) rings the pull tile,
     so the centre is never reached; a melee leader pulls from the ring's edge (a kiter keeps its range rule above). */
  const step = k.path && k.path[0];
  const walled = !kites(k) && !!step && atRest(k) && mons.some((m) => m.x === step[0] && m.y === step[1]);
  if (here && (dist2(k, c) <= inst.ground.pullDist * inst.ground.pullDist || arrived || walled)) { startPull(inst, sc, k, p); return; }
  if (k.goal && k.aiMs > 0) return;
  occupancy(inst);
  const g = freeNear(inst.grid, Math.round(c.x), Math.round(c.y), 2, (x, y) => inst.occ.mon.has(tileKey(inst.grid, x, y)))
    || [mons[0].x, mons[0].y];
  setGoal(inst, k, g[0], g[1]);
  k.aiMs = AI_REPATH_MS.travel;
}

/* The living heroes regain HP (PC-12): the resting rate out of a fight, the
   in-fight rate during one (CORE_NUMBERS Q6), each times the hero's Prayer regen
   rate (`regenPm`, src/core/vitals.js regenPermille). */
function tickHeroes(inst, sc) {
  const rate = inst.world.phase !== PHASE.FIGHT ? HUNT_TUNING.oocRegenPermillePerS : VITALS.inFightRegenPermillePerS;
  for (const h of heroes(inst)) {
    if (!h.alive) continue;
    if (h.hp >= h.maxHp) { h.hpMilli = 0; continue; }
    const pm = Number.isInteger(h.regenPm) && h.regenPm > 0 ? h.regenPm : 1000;
    h.hpMilli += Math.floor((h.maxHp * rate * pm * sc.dtMs) / 1000000);
    const whole = Math.floor(h.hpMilli / 1000);
    h.hp = Math.min(h.maxHp, h.hp + whole);
    h.hpMilli -= whole * 1000;
  }
}

/** Phase-AI hook: travel, pull, fight, regroup; the pocket route (PC-03..13). */
export function runPhase(inst, sc) {
  if (!cycling(inst)) return;
  const w = inst.world;
  if (!Number.isInteger(w.leader) || !unitById(inst, w.leader)) w.leader = pickLeader(w.units);
  tickHeroes(inst, sc);
  const k = leaderOf(inst);
  if (!k) return;
  if (w.phase === PHASE.TRAVEL) { travel(inst, sc, k); return; }
  if (w.phase === PHASE.FIGHT) {
    const p = pocketNow(inst);
    if (!packMonsters(inst, p).length) {
      w.packs[p].alive = false;
      w.packs[p].aggro = false;
      w.packs[p].holder = null;
      w.packs[p].respawnAtMs = sc.atMs + inst.ground.respawnMs;
      w.phase = PHASE.REGROUP; w.phaseMs = HUNT_TUNING.regroupMs; w.regroupNext = true;
    } else if (!w.packs[p].aggro) {
      w.phase = PHASE.TRAVEL;
    }
    return;
  }
  if (w.phase === PHASE.REGROUP) {
    w.phaseMs = Math.max(0, w.phaseMs - sc.dtMs);
    const together = heroes(inst).every((h) => h.alive && cheb(h, k) <= HUNT_TUNING.regroupRadius);
    if (w.phaseMs === 0 && together) {
      if (w.regroupNext) nextPocket(inst, k); else w.phase = PHASE.TRAVEL;
    }
  }
}

/** Corpse hook: corpses older than HUNT_TUNING.corpseMs are removed (PC-16). */
export function clearCorpses(inst, sc) {
  const w = inst.world;
  let gone = false;
  for (const u of w.units) {
    if (u.side !== 'mon' || u.alive) continue;
    u.deadMs += sc.dtMs;
    if (u.deadMs >= HUNT_TUNING.corpseMs) gone = true;
  }
  if (gone) w.units = w.units.filter((u) => u.side !== 'mon' || u.alive || u.deadMs < HUNT_TUNING.corpseMs);
}
