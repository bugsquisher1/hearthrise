// ============================================================
// src/core/hunt/status.js — STATUS STACKS (spec §3.3)
//
// STUB (lane H1). The export signatures below are the agreed seam
// (HUNT_SCREEN_SPEC §1.6, §2); world-step.js already calls every hook in its
// sub-step order. Lane H3 owns this file and fills the bodies; nothing else
// edits it. Persisted fields go in PERSISTED (world-state.js encodes them).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([]), pack: Object.freeze([]) });

/** Put `row`'s status on `unit` from `source`. */
export function applyStatus(inst, unit, row, source, sc) {}

/** Status hook: stacks tick and expire. */
export function tickStatuses(inst, sc) {}
