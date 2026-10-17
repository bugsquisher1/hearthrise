// ============================================================
// src/core/hunt/pull-cycle.js — THE PULL CYCLE (spec §3.2 #16-18)
//
// STUB (lane H1). The export signatures below are the agreed seam
// (HUNT_SCREEN_SPEC §1.6, §2); world-step.js already calls every hook in its
// sub-step order. Lane H2 owns this file and fills the bodies; nothing else
// edits it. Persisted fields go in PERSISTED (world-state.js encodes them).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([]), pack: Object.freeze([]) });

/** Respawn hook: packs whose timer ran out come back (never mid-fight). */
export function respawnPacks(inst, sc) {}

/** Phase-AI hook: travel, pull, fight, regroup, down; the pocket route. */
export function runPhase(inst, sc) {}

/** Corpse hook: corpses older than HUNT_TUNING.corpseMs are removed. */
export function clearCorpses(inst, sc) {}
