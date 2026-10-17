// ============================================================================
// supabase/functions/hr-accrue/hunt-track.js — WHAT THE CLIENT PLAYS BACK
// (HUNT_SCREEN_SPEC §1.5: `hunt_track`, `hunt_events`).
//
// A settle's RESPONSE carries the window's track (unit tile steps with their
// server instants) and its world events, so the viewed character's world pane
// plays the hunt back without inventing a step (spec §1.4 playback). They are
// TRANSIENT: never an hr_state_of section, never stored in Postgres. A reload
// re-poses from the `hunt` section's pose (hunt_instances.world).
//
// BOUNDED: at most MAX_STEPS steps and MAX_EVENTS events, the LATEST kept (the
// client is behind by at most one window, so the end of the window is what it
// draws next); `cut` says how many of each were dropped so the client knows to
// re-pose rather than interpolate across a gap. Steps are packed as
// [u, x, y, atMs] arrays (a 4-hero party over a 10 s tick window is ~600 steps,
// ~15 KB as JSON).
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { EVENT_VERSION } from '../../../src/core/hunt/events.js';

export const MAX_STEPS = 4000;
export const MAX_EVENTS = 2000;

/**
 * The playback buffer of one settle: { v, from, to, steps, events, cut }.
 * `track` = [{ u, x, y, atMs }], `events` = the world events, both in order.
 */
export function huntPlayback(track, events, fromMs, toMs) {
  const t = Array.isArray(track) ? track : [];
  const e = Array.isArray(events) ? events : [];
  const steps = t.slice(Math.max(0, t.length - MAX_STEPS)).map((s) => [s.u, s.x, s.y, s.atMs]);
  const ev = e.slice(Math.max(0, e.length - MAX_EVENTS));
  return {
    v: EVENT_VERSION,
    from: Math.floor(Number(fromMs) || 0),
    to: Math.floor(Number(toMs) || 0),
    steps,
    events: ev,
    cut: { steps: Math.max(0, t.length - MAX_STEPS), events: Math.max(0, e.length - MAX_EVENTS) },
  };
}
