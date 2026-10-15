// src/core/hunt-spawn.js — the named hunt's spawn roll (dual-runtime: browser + Deno edge).
//
// `pickSpawn` is THE spawn roll. combat-sim.js `resolveKill` calls it on every
// kill of a hunt, attended and away alike (AWAY-1; AWAY-12 forbids a second
// path), from the engine's own seeded `ctx.rng` — never Math.random.
// `huntFor` resolves a combat pointer: a named hunt id, or null for a monster id
// (a training fight, which keeps its pre-hunt pricing byte for byte).
import { HUNT_INDEX } from '../data/hunts.js?v=589';

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
