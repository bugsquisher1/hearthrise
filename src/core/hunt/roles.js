// ============================================================
// src/core/hunt/roles.js — PER-ROLE POSITIONING (spec §3.2 #2-10)
//
// STUB (lane H1). The export signatures below are the agreed seam
// (HUNT_SCREEN_SPEC §1.6, §2); world-step.js already calls every hook in its
// sub-step order. Lane H2 owns this file and fills the bodies; nothing else
// edits it. Persisted fields go in PERSISTED (world-state.js encodes them).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([]), pack: Object.freeze([]) });

/** Phase-AI hook: every hero's goal by role and settings; spots via movement.chooseSpot. */
export function positionHeroes(inst, sc) {}
