// ============================================================
// src/core/hunt/targeting.js — TARGET CHOICE (spec §3.2 #11-15)
//
// STUB (lane H1). The export signatures below are the agreed seam
// (HUNT_SCREEN_SPEC §1.6, §2); world-step.js already calls every hook in its
// sub-step order. Lane H2 owns this file and fills the bodies; nothing else
// edits it. Persisted fields go in PERSISTED (world-state.js encodes them).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([]), pack: Object.freeze([]) });

/** Ordered targets for `unit` by its Target setting (TG-01). */
export function pickTargets(inst, unit, settings) { return []; }

/** Phase-AI hook: monster target choice and switching, the tank's Challenge. */
export function chooseTargets(inst, sc) {}
