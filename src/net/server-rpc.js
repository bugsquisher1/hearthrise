// ============================================================
// src/net/server-rpc.js  (b340)
//
// ONE HOME FOR "DOES THIS RPC EXIST ON THE SERVER YET?"
//
// The strangler-fig migration off client-authored tables produces the same
// shape in every module it touches: the client prefers a server RPC, and while
// that RPC has not been applied yet it falls back to the path it used before.
// src/features/leaderboards.js has done this since b222; the market backend and
// the clan browser do it as of b340. That is three copies of one predicate and
// three copies of one probe cache.
//
// This repo has already paid for that exact shape once. b332: the FNV-1a hash
// was copied into FIVE files, one copy used a float multiply, and rotations
// silently deleted content for five builds. A predicate that decides whether a
// security-critical narrowing is in effect is not a thing to have three of.
//
// ── WHAT IS HERE, AND WHY IT IS ONLY THIS ───────────────────────────────
// The DECISION, not the transport. Every caller already owns its own fetch with
// its own auth rules (leaderboards retries anonymously; the market must never
// retry a write anonymously), so a shared `fetch` would have to grow a flag per
// caller and would be the wrong abstraction. What genuinely must not differ
// between callers is:
//
//   1. what "the server does not have this RPC" looks like on the wire, and
//   2. how long a NEGATIVE answer is trusted before it is re-probed.
//
// Both are here and nowhere else.
//
// ── WHY A NEGATIVE EXPIRES AND A POSITIVE DOES NOT ──────────────────────
// A migration can only ever ADD the RPC while a session is open, so "absent"
// is the answer that can go stale and "present" is the answer that cannot. A
// session left open across an apply therefore heals itself within ten minutes
// with no reload — which is precisely the window during which the staged
// migration flips the client from the legacy table read to the RPC.
//
// ── WHY A CLASSIC SCRIPT AND NOT AN ESM MODULE ──────────────────────────
// Its two consumers live on opposite sides of the module boundary:
// src/net/supabase-market-backend.js is ESM, src/features/clans.js is a classic
// IIFE. A classic script published on `window` is reachable from both; an ESM
// module is reachable from one. Module scripts are deferred, so by the time the
// market backend evaluates, this has run.
//
// ── b349: THE SECOND DECISION — "may this call go out at all?" ──────────
// The first decision above is "does the server HAVE this RPC". Its twin is
// "does this caller have the standing to make the call", and the repo learned
// it the expensive way: 3,196 `hr_server_now` calls a day were leaving the
// client with the ANON key in the Authorization header, because muster.js's
// clock sync fires 420ms after DOMContentLoaded and auth.js cannot publish a
// session until a CDN `import()` of supabase-js has resolved — measured at
// 94–1,040ms LATER, on every run, on localhost. Postgres refused every one
// (42501) and the client shrugged. 19% of all database traffic was a client
// asking a question it had no right to ask yet, and it made the error
// dashboard useless as an incident signal.
//
// The predicate is deliberately INVERTED — a list of what may go out
// anonymously, not a list of what may not. Fail CLOSED, the same direction
// `AWAY_SCOPE` and `mayClientWrite` chose:
//
//   • A NEW authenticated RPC is protected the day it is written, by nobody
//     remembering anything.
//   • The list that must be maintained is the SHORT one. There is exactly one
//     entry today (hr_leaderboard, the deliberately public board) against 38
//     authenticated-only RPCs, and `tests/rpc-resolution.baseline.json` — the
//     committed record of what production actually answers an anonymous
//     caller — proves that ratio on every CI run.
//   • Getting the list WRONG in the unsafe direction (an anon RPC omitted)
//     costs a feature that visibly stops working. Getting the old, positive
//     shape wrong (an authenticated RPC omitted) cost nothing visible at all
//     for months. Prefer the mistake that shows up.
//
// This is the DECISION only, per the charter above. "When does a session
// exist?" is a timing question owned by whoever owns the session — see
// HearthriseGate.whenSignedIn() in src/net/account-gate.js, which is the
// module that already knows the difference between "signed out" and "auth has
// not finished looking yet".
// ============================================================
(function () {
  'use strict';

  /* Ten minutes. Long enough that a missing RPC is not re-probed on every
     render (the market refreshes on a realtime nudge, which can be often),
     short enough that nobody has to reload after a deploy. Same number
     leaderboards.js has used since b222 — stated once here rather than typed
     again. */
  var NEGATIVE_TTL_MS = 600000;

  var probes = Object.create(null);   // name -> { known: boolean, at: number }

  /**
   * Does this response mean "the server has no such function"?
   *
   * PostgREST answers a missing RPC in more than one way depending on whether
   * the schema cache is warm, so all four shapes are one predicate:
   *   404          — the route does not resolve at all
   *   PGRST202     — "could not find the function in the schema cache"
   *   42883        — undefined_function, straight from PostgreSQL
   *   42P01        — undefined_table, which is what a dropped VIEW answers
   *
   * ⚠ EVERYTHING ELSE IS A REFUSAL, NOT AN ABSENCE. A 401, a 403, a rate-limit
   *   refusal and a network failure must NOT be read as "the RPC is missing" —
   *   doing so would silently fall back to the very table read the migration
   *   exists to close, and it would do it exactly when the server is under
   *   stress. Absence is proven, never assumed.
   */
  function isMissingRpc(status, body) {
    if (status === 404) return true;
    var code = body && body.code;
    return code === 'PGRST202' || code === '42883' || code === '42P01';
  }

  /** Record what a real response proved. `present` is a boolean, not a guess. */
  function note(name, present, nowMs) {
    if (!name) return;
    probes[name] = { known: !!present, at: (typeof nowMs === 'number' ? nowMs : Date.now()) };
  }

  /**
   * 'unknown' — never probed, or a stale negative. TRY THE RPC.
   * 'present' — proven to exist. Use it.
   * 'absent'  — proven missing, less than NEGATIVE_TTL_MS ago. Use the legacy path.
   */
  function capability(name, nowMs) {
    var p = probes[name];
    if (!p) return 'unknown';
    if (p.known) return 'present';
    var now = (typeof nowMs === 'number' ? nowMs : Date.now());
    return (now - p.at) < NEGATIVE_TTL_MS ? 'absent' : 'unknown';
  }

  /** Should the caller attempt the RPC at all? Only a FRESH negative says no. */
  function shouldTry(name, nowMs) { return capability(name, nowMs) !== 'absent'; }

  function reset(name) {
    if (name) delete probes[name];
    else probes = Object.create(null);
  }

  // ══════════════════════════════════════════════════════════════════════
  // MAY THIS CALL GO OUT? (see the b349 note in the header)
  // ══════════════════════════════════════════════════════════════════════

  /* The whole anonymous surface. Every OTHER RPC the client can name needs a
     session, without being listed anywhere.

     `hr_leaderboard` is the honour roll: public by design, and the one RPC
     src/features/leaderboards.js is allowed to retry anonymously when a
     player's token has expired (b222 — an expired JWT should cost you the
     "you are here" block, never the whole board).

     ⚠ Adding an entry here OPENS a call to unauthenticated traffic. Do it only
       with a matching grant on the server, and expect
       tests/rpc-resolution.baseline.json to move in the same commit. */
  var ANON_CALLABLE = { hr_leaderboard: true };

  /** Does this RPC require a live session? Unknown ⇒ YES. */
  function needsSession(name) { return ANON_CALLABLE[String(name || '')] !== true; }

  /**
   * THE GUARD. `hasSession` is a FACT the caller supplies (it owns its own
   * transport and its own idea of a token), not something re-derived here —
   * this module has no business reaching into auth.js.
   *
   * Anything other than a literal `true` is read as "no session". A caller
   * that passes an object, a promise, or `undefined` because it has not
   * looked yet is exactly the caller this exists to stop.
   */
  function mayCall(name, hasSession) {
    return hasSession === true || !needsSession(name);
  }

  window.HearthriseRpc = {
    NEGATIVE_TTL_MS: NEGATIVE_TTL_MS,
    isMissingRpc: isMissingRpc,
    note: note,
    capability: capability,
    shouldTry: shouldTry,
    reset: reset,
    // b349 — the session decision
    ANON_CALLABLE: Object.keys(ANON_CALLABLE),
    needsSession: needsSession,
    mayCall: mayCall
  };
})();
