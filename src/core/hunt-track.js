// ============================================================================
// src/core/hunt-track.js — WHAT THE CLIENT PLAYS BACK
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
// EVERY EVENT CARRIES A STABLE ID AND ITS SERVER INSTANT (atMs, the engine's
// server-clock millisecond): id = "<atMs>.<k>", k its order among the events of
// that instant. Windows are cut on swing boundaries and an instant's events all
// come from one swing, so the same event has the same id however the windows
// were cut — the client de-duplicates on it and keeps an animation running
// across two overlapping responses. Visual timeline only: never authority (the
// state sections are), never stored.
//
// Moved from supabase/functions/hr-accrue/hunt-track.js (option B, 2026-10-19): the browser's live
// engine cuts its own swings into the same playback shape, so an event has the same id on both sides,
// and hashes its world the same way to reconcile with the server's (worldHash).
//
// PURE ESM, Node + Deno + browser.
// ============================================================================

import { EVENT_VERSION } from './hunt/events.js?v=0.2.75';
import { reconcileText } from './hunt/world-state.js?v=0.2.75';

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
  const seen = new Map();
  const withIds = e.map((x) => {
    const at = Math.floor(Number(x && x.atMs) || 0);
    const k = seen.get(at) || 0;
    seen.set(at, k + 1);
    return Object.assign({ id: at + '.' + k }, x);
  });
  const ev = withIds.slice(Math.max(0, withIds.length - MAX_EVENTS));
  return {
    v: EVENT_VERSION,
    from: Math.floor(Number(fromMs) || 0),
    to: Math.floor(Number(toMs) || 0),
    steps,
    events: ev,
    cut: { steps: Math.max(0, t.length - MAX_STEPS), events: Math.max(0, e.length - MAX_EVENTS) },
  };
}

/**
 * The settle RESPONSE's timeline keys, in the shape the client reads (src/session/envelope.js
 * TIMELINE_KEYS, src/hunt-view/timeline.js ingest): `hunt_track` [{ u, x, y, atMs }],
 * `hunt_events` (each with its stable id), `hunt_server_now_ms` (the database clock the window
 * was read at, so the client measures its offset), and `hunt_cut` (what the bound dropped).
 */
export function huntTimeline(track, events, fromMs, toMs, serverNowMs, units) {
  const pb = huntPlayback(track, events, fromMs, toMs);
  return {
    /* the window's monsters, { id: [kind, maxHp, hp at the window's start or spawn] }, and that
       start: named, sized and filled even after the snapshot drops them */
    hunt_units: units && typeof units === 'object' ? units : {},
    hunt_from_ms: pb.from,
    hunt_track: pb.steps.map(([u, x, y, atMs]) => ({ u, x, y, atMs })),
    hunt_events: pb.events,
    hunt_server_now_ms: Math.floor(Number(serverNowMs) || 0),
    hunt_cut: pb.cut,
  };
}

/**
 * THE RECONCILE KEY of an instance world: FNV-1a 32 over the stored text (world-state.js encode,
 * compact JSON) with its server-only fields blanked (world-state.js reconcileText: the loot stream's
 * state, which the prediction cannot know). The server sends it with each commit; the browser compares
 * the hash of its own predicted world at the same swing and re-seeds when they differ. Not a security
 * digest: it only detects divergence, and the server's world is always the one kept.
 */
export function worldHash(text) {
  if (typeof text !== 'string') return null;
  const t = reconcileText(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
