// ════════════════════════════════════════════════════════════════════════
// src/session/session-observers.js — WHO HEARS OF EVERY NEW CHARACTER SESSION.
//
// The observers live here, with no imports, so a module that only watches heroes (src/net/observability.js) can
// register on the sign-in screen without pulling the session's whole graph into the page's first load
// (lane b-first-load 2026-11-13: that one import put 170 modules in front of the sign-in form).
// src/session/character-session.js hands each session it makes to every observer, before its first envelope.
// ════════════════════════════════════════════════════════════════════════

const OBSERVERS = new Set();

/** Call `fn(session)` for every session made from now on; returns the stop function. */
export function observeSessions(fn) { OBSERVERS.add(fn); return () => OBSERVERS.delete(fn); }

/** Hand a new session to every observer (src/session/character-session.js, from its constructor). */
export function announceSession(session) { for (const fn of Array.from(OBSERVERS)) fn(session); }
