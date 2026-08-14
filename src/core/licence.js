// ============================================================
// src/core/licence.js — THE FIELD LICENCE. A PRECONDITION, not a bonus.
//
// docs/design/away-combat-licence.md, and Tyler's ruling behind it:
//
//   "Afk combat exp shouldn't come immediately, the player should be guided
//    to play the game manually early on to get the hang of it."
//
// ── WHY THIS IS NOT IN src/core/away.js ──────────────────────────────────
// It would be the twelfth instance of the exact failure `AWAY_SCOPE` exists
// to prevent. That table's contract is "an unknown channel defaults to
// PAYING, because every historical away bug was a base reward silently
// vanishing" (see the eleven omissions listed in combat-sim.js's header).
// A licence expressed as a channel would be a reward disappearing inside a
// per-grant gate: invisible at the call site, indistinguishable from drift,
// and found months later.
//
// So the licence is a different CATEGORY of thing. It is asked ONCE, by the
// CALLER, BEFORE `simulateSpan` runs at all, and its failure mode is loud:
// the whole span is not simulated, one boolean says so, and the surface that
// renders the absence is required to print the reason. That is a single
// assertion to test and impossible to confuse with a rate.
//
//   away.js  answers "does this channel of POWER pay while away?"
//   this     answers "is this activity ELIGIBLE TO ACCRUE at all?"
//
// `src/core/away.js` is unchanged by this file, byte for byte.
//
// ── WHERE THE AUTHORITY LIVES ────────────────────────────────────────────
// The threshold is evaluated against SERVER-KNOWN `stats.kills` inside
// `supabase/functions/hr-accrue/accrual.js`, before it calls `simulateSpan`.
// The client reads the same function so every counter, preview line and
// welcome-back note agrees with the server — but the client's verdict is
// PREDICTION, never authority. A threshold the client evaluates is a
// threshold a player edits.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* THE THRESHOLD. 100 hand-landed kills ~= 25-30 minutes of combat uptime,
   delivered as five or six runs interleaved with fishing and cooking — the
   whole early loop, run five times, which is what "get the hang of it"
   means. It is deliberately aligned with the tier-1 easy cull bounty
   (`BOUNTY_KILL_COUNTS.cull[1]` = 80-120 kills) so the licence and the
   player's first Bounty Mark land on the same beat. Do not tune one away
   from the other. */
export const FIELD_LICENCE_KILLS = 100;

/* The activity kind the licence gates. EXACTLY ONE. Gathering, artisan,
   farm growth, the cooking fire and workers are untouched and pay 1.00x
   from the first second of the first session — that contrast is the point:
   the game's answer to "combat pays nothing tonight" is "then set a skill
   running, it pays everything". Named as data so a reader can see the scope
   without reading the caller. */
export const LICENSED_ACTIVITIES = Object.freeze(['combat']);

/** Kills as a non-negative integer, from a state object of unknown quality.
    Garbage (NaN, negative, a string, a missing `stats`) reads as 0 — the
    safe direction for a gate is "not yet earned", never "earned". */
export function killCount(state) {
  const n = Number((state && state.stats && state.stats.kills) || 0);
  return (isFinite(n) && n > 0) ? Math.floor(n) : 0;
}

/**
 * The licence verdict.
 *
 * Derived from `stats.kills` rather than latched into a new save field, and
 * that is deliberate: `stats.kills` is already persisted, already server-
 * owned under the authority program, and only ever increments — so the
 * verdict is permanent by construction with no new persistent state, no save
 * migration, and nothing for a restore to lose. (A latch would be a second
 * representation of one fact, which is the drift shape this codebase keeps
 * paying for.)
 *
 * A useful identity falls out of gating BEFORE simulation: a declined span
 * is not simulated, so it cannot advance `stats.kills` — which makes every
 * kill counted before the licence a HAND-LANDED one. No second "kills while
 * present" counter is needed, and none should be added.
 *
 * @param state { stats:{ kills } }
 * @returns { ok, kills, need, remaining }
 */
export function fieldLicence(state) {
  const kills = killCount(state);
  const need = FIELD_LICENCE_KILLS;
  const ok = kills >= need;
  return { ok, kills, need, remaining: ok ? 0 : need - kills };
}

/**
 * The caller's question, in the caller's vocabulary: may a span of THIS
 * activity accrue at all?
 *
 * Anything not in `LICENSED_ACTIVITIES` is allowed — the same default-open
 * rule `channelApplies` uses, and for the same reason. A new activity type
 * is not silently gated by a licence written before it existed.
 *
 * @param kind  'combat' | 'gathering' | 'artisan' | …
 */
export function awayActivityAllowed(kind, state) {
  if (LICENSED_ACTIVITIES.indexOf(kind) < 0) return true;
  return fieldLicence(state).ok;
}
