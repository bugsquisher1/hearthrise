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

  window.HearthriseRpc = {
    NEGATIVE_TTL_MS: NEGATIVE_TTL_MS,
    isMissingRpc: isMissingRpc,
    note: note,
    capability: capability,
    shouldTry: shouldTry,
    reset: reset
  };
})();
