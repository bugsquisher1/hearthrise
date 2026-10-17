// ============================================================
// src/core/hunt/damage.js — ONE hurt() (spec §2 damage)
//
// STUB (lane H1). The export signatures below are the agreed seam
// (HUNT_SCREEN_SPEC §1.6, §2); world-step.js already calls every hook in its
// sub-step order. Lane H2 owns this file and fills the bodies; nothing else
// edits it. Persisted fields go in PERSISTED (world-state.js encodes them).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([]), pack: Object.freeze([]) });

/** Apply `amount` from `source` to `target`; answers what landed. */
export function hurt(inst, target, amount, source, element, ability) { return { dmg: 0, killed: false }; }

/** Attack hook: every unit whose swing is due swings. */
export function resolveAttacks(inst, sc) {}
