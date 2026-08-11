// ============================================================================
// supabase/functions/hr-accrue/request.js — THE ONLY READER OF THE REQUEST BODY.
//
// The accrual engine's entire client-authored surface is this file. Everything
// else the grant depends on — the clock, the cap, the equipment, the levels, the
// activity, the watermark, the seed — is read from a server table inside the
// same transaction.
//
// ── WHY IT IS ITS OWN MODULE (review: "the shape guards assert the wrong
//    thing") ────────────────────────────────────────────────────────────────
// tests/accrual-engine.mjs proves that hostile keys are inert **on the engine's
// input object** — but nobody ever hands the engine an object. The attacker
// hands an HTTP BODY to a Deno function that cannot be imported into Node, so
// the one surface that is actually reachable was the one surface with no
// executable test. Pulling the body reader out into a pure ESM module fixes that
// by construction: the exact function the shell calls is the function the test
// calls, in plain Node, with genuinely hostile bodies.
//
// ── THE RULE THIS ENFORCES ─────────────────────────────────────────────────
// `parseIntent` returns a FRESHLY CONSTRUCTED, NULL-PROTOTYPE object containing
// exactly the fields named in this file. It is not a filtered copy of the body
// and it is not the body with extra keys deleted — both of those are one careless
// edit away from passing something through. There is no path by which an
// unlisted key survives, because no unlisted key is ever read.
//
// PURE ESM, no I/O, no globals. Runs in Node and Deno unchanged.
// ============================================================================

/** The character slot bound. 0..5 inclusive — SIX slots.
    This constant exists because the previous shell's comment said "0…4" while
    the code, and `player_state`'s CHECK constraint, both said 0..5. A comment
    that disagrees with a constraint is a trap for the next reader, so the bound
    is now a named value that the test asserts against the migration. */
export const MAX_SLOT = 5;

/**
 * Read the accrual intent out of a parsed request body.
 *
 * @param body  whatever `await req.json()` produced. May be anything at all:
 *              null, a string, an array, a number, an object with a poisoned
 *              `__proto__`, an object with two hundred keys. All of them are
 *              the same amount of authority: none.
 * @returns { slot } — a plain integer in [0, MAX_SLOT]. Never NaN, never
 *          fractional, never negative, never out of range, and never a getter.
 */
export function parseIntent(body) {
  const out = Object.create(null);
  out.slot = readSlot(body);
  return out;
}

/**
 * The slot, and nothing else.
 *
 * Deliberately TOLERANT rather than rejecting: a bad slot is not an attack
 * surface (it selects a row the caller already owns, and hr_state_of returns
 * `no_character` for a slot they do not have), so coercing to 0 costs a
 * confused client one wasted call instead of an error taxonomy entry. What it
 * must never do is let a non-integer or an out-of-range value reach a `::int`
 * cast in Postgres.
 */
export function readSlot(body) {
  /* `typeof body === 'object'` excludes strings — `'abc'.slot` is undefined but
     `'abc'[0]` is not, and a future field read by index would then be reachable
     from a string body. Arrays are excluded for the same reason. */
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 0;
  /* Own-property only. A body of `{"__proto__":{"slot":5}}` produces an own
     "__proto__" data property under JSON.parse rather than a prototype write,
     but `Object.prototype.hasOwnProperty.call` also defends the case where the
     caller of this module built the object some other way. */
  if (!Object.prototype.hasOwnProperty.call(body, 'slot')) return 0;
  const n = Number(body.slot);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SLOT ? n : 0;
}
