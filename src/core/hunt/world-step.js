// ============================================================
// src/core/hunt/world-step.js — ONE SWING OF THE HUNT (spec §1.1 engine contract)
//
// `stepSwing(world, swingCtx)` is what src/core/combat-sim.js
// simulateHuntSpan runs at every swing boundary (it replaced the single-foe
// `simulateTick`; there is still exactly one loop — AWAY-1, AWAY-12).
//
// A swing is swingMs / HUNT_TUNING.stepMs sub-steps. Each sub-step runs the
// modules in ONE fixed order (WS-02):
//   trail → respawn → phase AI (pull cycle, targets, roles, follow) →
//   movement → leash resets → attacks → status ticks → consumables → stop rules → corpses →
//   the closed "+XP" group
// Every hook takes (inst, sc): `inst` = { world, ground, grid, occ }, `sc` =
// { atMs, dtMs, swing, rng, emit(event), track(step) }. Draws come from
// `sc.rng` (the swing's `s` stream) in that order, units in id order.
//
// THE ONE PATH (spec §1.1 one-path table; lane S1, 2026-10-17). The
// single-foe swing, its kill and death hand-offs, its quiver and its spawn
// roll were deleted: every hero, solo or in a party, is a world unit;
// damage.js lands every blow and hands off every kill, abilities.js and
// consumables.js spend through the one supply resolver, xp-share.js splits
// the kill XP.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_TUNING } from '../../data/hunt-tuning.js?v=0.2.63';
import { recordTrail, followTrail, moveAll, occupancy } from './movement.js?v=0.2.63';
import { makeUnit } from './world-state.js?v=0.2.63';
import { holderOutside, resetPack } from './leash.js?v=0.2.63';
import { chooseTargets } from './targeting.js?v=0.2.63';
import { positionHeroes } from './roles.js?v=0.2.63';
import { respawnPacks, runPhase, clearCorpses } from './pull-cycle.js?v=0.2.63';
import { resolveAttacks } from './damage.js?v=0.2.63';
import { castAbilities } from './abilities.js?v=0.2.63';
import { tickStatuses } from './status.js?v=0.2.63';
import { consume } from './consumables.js?v=0.2.63';
import { flushXpGroup } from './xp-share.js?v=0.2.63';
import { checkStopRules } from './conditions.js?v=0.2.63';

/** How many sub-steps one swing of `swingMs` is; refuses a swing that is not a whole number of them. */
export function substepsOf(swingMs) {
  const s = HUNT_TUNING.stepMs;
  if (!Number.isInteger(swingMs) || swingMs <= 0 || swingMs % s !== 0) {
    throw new Error('world-step: a ' + swingMs + ' ms swing is not a whole number of ' + s + ' ms sub-steps');
  }
  return swingMs / s;
}

/* The sub-step order (WS-02). One list, so the order is stated once. */
const SUBSTEP = Object.freeze([
  (inst) => recordTrail(inst),
  respawnPacks,
  runPhase, chooseTargets, positionHeroes, (inst) => followTrail(inst),
  moveAll,
  (inst, sc) => { for (let p = 0; p < inst.world.packs.length; p++) if (holderOutside(inst, p)) resetPack(inst, p, sc); },
  resolveAttacks, castAbilities,
  tickStatuses,
  consume,
  checkStopRules,
  clearCorpses,
  flushXpGroup,
]);

/* Run the world's sub-steps for one swing starting at `atMs`. */
function stepWorld(world, swingCtx, track, events) {
  if (!swingCtx.ground || !swingCtx.grid) throw new Error('world-step: a world needs its ground row and grid');
  const n = substepsOf(swingCtx.swingMs);
  /* `heroes`: the per-hero settings, bar and supply session the settle injects (spec §2 world-step).
     makeUnit: how pull-cycle.js spawns a pack with every persisted field (it may not import world-state). */
  const inst = { world, ground: swingCtx.ground, grid: swingCtx.grid, occ: null, heroes: swingCtx.heroes || null, makeUnit };
  const atMs = Number(swingCtx.atMs);
  if (!Number.isInteger(atMs)) throw new Error('world-step: atMs must be an integer');
  /* xpMultOf: the per-hero XP multiplier hook (xp-share.js; server-read, absent = 1). */
  const sc = { atMs, dtMs: HUNT_TUNING.stepMs, swing: world.swing, rng: swingCtx.rng,
    ...(typeof swingCtx.xpMultOf === 'function' ? { xpMultOf: swingCtx.xpMultOf } : {}),
    emit: (ev) => { events.push(ev); }, track: (st) => { track.push(st); } };
  /* A DEATH STOPS THE SWING (Tyler 2026-10-19): the swing stops at the sub-step a hero dies. Its hunt,
     and every ticked member's (LEAVE TOGETHER, Tyler 2026-10-22: combat-sim.js cascadeFrom), ends at
     the next boundary, and until then nobody acts: a leaving survivor no longer flees or fights on alone
     for the rest of the swing (live v0.2.23, Andy: "2nd char starts to run away after death") nor dies a
     second death the first one already ended. An unticked survivor waits out the rest of that one swing
     (at most one swing interval) and hunts on from the next. */
  const heroes = world.units.filter((u) => u.side === 'hero' && u.alive);
  for (let i = 0; i < n; i++) {
    sc.atMs = atMs + i * HUNT_TUNING.stepMs;
    occupancy(inst);
    for (const hook of SUBSTEP) hook(inst, sc);
    if (heroes.some((u) => !u.alive)) break;
  }
  world.swing += 1;
}

/**
 * ONE SWING of the instance: the world's sub-steps from `swingCtx.atMs`. A
 * solo hunt is a party of one (spec §1.1): there is no single-foe swing and no
 * second path. Answers the swing's `track` and world `events`; every value a
 * swing moves (XP, gold, drops, falls, supplies) is read off those events by
 * the span (src/core/combat-sim.js) through src/core/hunt-rewards.js.
 */
export function stepSwing(world, swingCtx) {
  if (!world) throw new Error('stepSwing: a hunt swing needs its instance world');
  const track = []; const events = [];
  stepWorld(world, swingCtx, track, events);
  return { track, events };
}
