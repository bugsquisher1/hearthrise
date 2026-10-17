// ============================================================
// src/core/hunt/abilities.js — THE ACTION BAR (spec §2 abilities)
//
// STUB (lane H1). The export signatures below are the agreed seam
// (HUNT_SCREEN_SPEC §1.6, §2); world-step.js already calls every hook in its
// sub-step order. Lane H4 owns this file and fills the bodies; nothing else
// edits it. Persisted fields go in PERSISTED (world-state.js encodes them).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([]), pack: Object.freeze([]) });

/** The first usable ability in bar order for `hero`, or null. */
export function firstUsable(inst, hero, sc) { return null; }

/** Attack hook: each hero fires its first usable ability. */
export function castAbilities(inst, sc) {}
