// ============================================================
// src/core/hunt/tally.js — THE ANALYZER TALLY (spec §3.6)
//
// STUB (lane H1). The export signatures below are the agreed seam
// (HUNT_SCREEN_SPEC §1.6, §2); world-step.js already calls every hook in its
// sub-step order. Lane H5 owns this file and fills the bodies; nothing else
// edits it. It persists nothing on the world.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

/** The tally delta of one window's events, per hero and party. */
export function tallyEvents(events) { return { heroes: {}, party: {} }; }
