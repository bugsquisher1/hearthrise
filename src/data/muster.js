// ============================================================================
// src/data/muster.js — WHAT A MUSTER COUNTS, authored once (2026-10-10).
//
// A muster's points used to be computed in the BROWSER (src/features/muster.js
// pointsFor: every updateDaily event x a per-type weight x the event's
// multiplier) and sent to world_event_contribute as `p_points` — a client
// number feeding a SHARED community bar and the per-player band of the muster
// chest. Designer ruling (whole-game review 2026-10-08): points are derived on
// the SERVER from the player's own counter deltas during the window; the client
// sends no number.
//
// So these two tables are now SERVER inputs. 2026-10-10-muster-server-points.sql
// carries them as hr_muster_sources() / hr_muster_points(), and
// tests/muster-server-points.mjs binds that SQL to this file in both directions.
//
//   MUSTER_POINTS        points per counted unit, by goal event (src/core/goals.js
//                        GOAL_EVENTS). `kill_any` is per kill PER MONSTER TIER
//                        (10 x tier — the shipped client rule, kept): the server
//                        prices it from the per-monster bestiary counters and
//                        hr_bounty_monsters.tier, never from a client tier.
//   MUSTER_EVENT_SOURCES which events a muster counts, and at what multiplier.
//                        Keys are src/features/muster.js EVENTS ids, which the
//                        server's hr_rally_pool() rotation also names.
//
// PURE ESM. No DOM. Imports cleanly in Node and Deno.
// ============================================================================

export const MUSTER_POINTS = Object.freeze({
  kill_any: 10,   // x monster tier
  gather: 4,
  harvest: 6,
  cooked: 12,
  smithed: 12,
  crafted: 12,
});

export const MUSTER_EVENT_SOURCES = Object.freeze({
  ashen_horde:   Object.freeze({ kill_any: 1 }),
  long_harvest:  Object.freeze({ harvest: 1, gather: 1 }),
  forge_levy:    Object.freeze({ smithed: 1, crafted: 1 }),
  deep_seam:     Object.freeze({ gather: 1 }),
  keep_kitchens: Object.freeze({ cooked: 1 }),
  all_hands:     Object.freeze({ kill_any: 0.5, gather: 0.5, harvest: 0.5, cooked: 0.5, smithed: 0.5, crafted: 0.5 }),
});

/** Per-muster ceiling on one player's points (unchanged from the client rule). */
export const MUSTER_POINT_CAP = 6000;
