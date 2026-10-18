// src/core/hunt-spawn.js — the named hunt's spawn roll (dual-runtime: browser + Deno edge).
//
// `pickSpawn` is THE spawn roll. combat-sim.js `resolveKill` calls it on every
// kill of a hunt, attended and away alike (AWAY-1; AWAY-12 forbids a second
// path), from the engine's own seeded `ctx.rng` — never Math.random.
// `huntFor` resolves a combat pointer: a named hunt id, or null for a monster id
// (a training fight, which keeps its pre-hunt pricing byte for byte).
import { HUNT_INDEX } from '../data/hunts.js?v=0.1.0';
import { HUNT_ROLES } from '../data/hunt-roles.js?v=0.1.0';
import { makeUnit, makeWorld } from './hunt/world-state.js?v=0.1.0';
import { spawnPack, PHASE } from './hunt/pull-cycle.js?v=0.1.0';
import { pickLeader, defaultSettings } from './hunt/roles.js?v=0.1.0';

/**
 * Weighted pick from `spawns` ([{ monster, w }]). A single spawn returns its
 * monster WITHOUT drawing, so a one-spawn hunt consumes no RNG and a training
 * fight's stream is unchanged. One `rng.int` draw otherwise.
 */
export function pickSpawn(spawns, rng) {
  if (!Array.isArray(spawns) || spawns.length === 0) return null;
  if (spawns.length === 1) return spawns[0].monster;
  let total = 0;
  for (const s of spawns) total += s.w;
  let r = rng.int(1, total);
  for (const s of spawns) {
    r -= s.w;
    if (r <= 0) return s.monster;
  }
  return spawns[spawns.length - 1].monster;
}

/** The named hunt a combat pointer names, or null (a monster id / unknown). */
export function huntFor(activeId) {
  return (typeof activeId === 'string' && HUNT_INDEX[activeId]) || null;
}

/** Is `monsterId` one of the hunt's spawns? (fight-carry resume guard) */
export function huntSpawns(hunt, monsterId) {
  return !!hunt && hunt.spawns.some((s) => s.monster === monsterId);
}

/**
 * A NEW HUNT INSTANCE'S WORLD (HUNT_SCREEN_SPEC §1.1 #4, §3.2): the party at the
 * ground's entrance (seat i on `ground.start[i]`), every pack spawned, the leader
 * picked by role order, phase travel. A solo hunt is a party of one.
 *
 * `party` is [{ role, maxHp, acc, maxHit, def, element, settings? }], each a
 * server-read hero: `role` a src/data/hunt-roles.js id, `acc` permille, `settings`
 * the character's own { dist, chase, tmode, stance } (an absent key takes the
 * role's default for this party, roles.defaultSettings). Heroes are units 1..n.
 */
export function newHuntWorld(ground, grid, party) {
  if (!Array.isArray(party) || !party.length || party.length > ground.start.length) {
    throw new Error('newHuntWorld: a party of 1..' + ground.start.length + ' heroes');
  }
  const roles = party.map((h) => h.role);
  const units = party.map((h, i) => {
    const s = Object.assign(defaultSettings(h.role, roles), h.settings || {});
    const [x, y] = ground.start[i];
    return makeUnit({ id: i + 1, side: 'hero', kind: h.role, pocket: null, alive: true, hp: h.maxHp, maxHp: h.maxHp,
      x, y, fx: x, fy: y, speed: HUNT_ROLES[h.role].speed, role: h.role, dist: s.dist, chase: s.chase, tmode: s.tmode,
      stance: s.stance, acc: h.acc, maxHit: h.maxHit, def: h.def || 0, element: h.element || '' });
  });
  const world = makeWorld({ ground: ground.id, swing: 0, leader: pickLeader(units), phase: PHASE.TRAVEL,
    routeIdx: 0, nextId: units.length + 1, packs: ground.pockets.map(() => ({ aggro: false, holder: null })) });
  world.units = units;
  const inst = { world, ground, grid, occ: null, makeUnit };
  for (let p = 0; p < ground.pockets.length; p++) spawnPack(inst, p, null);
  return world;
}
