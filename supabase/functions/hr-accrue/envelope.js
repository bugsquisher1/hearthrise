// ============================================================================
// supabase/functions/hr-accrue/envelope.js — A REFUSAL THAT REACHED THE
// DATABASE CARRIES THE STATE ENVELOPE. Security review C2, ONE implementation.
//
// ── WHY THIS IS A MODULE AND NOT A PRIVATE FUNCTION IN EACH INTENT ─────────
// The seam's instruction to the client is "put your optimistic local pointer
// back to what the ENVELOPE says, never to what you guessed". That instruction
// is only executable if every refusal that could have changed something carries
// one. `set_activity` implemented it privately; `claim_reward` is the second
// intent and seven more follow, and eight private copies of one rule is eight
// chances for the seventh to forget — which would not fail, it would just leave
// one client path guessing. So the rule moves here, with the intents as
// callers.
//
// ⚠ IT IS A FRESH READ, NOT THE ONE TAKEN AT THE TOP OF THE CALL. The refusal
//   that most needs an envelope is `version_conflict`, which means BY
//   DEFINITION that the state moved after that read. Costs one extra statement,
//   on the refusal path only, behind a gate that has already been spent.
//
// PURE ESM behind the same injected `exec` seam every intent uses. No Deno, no
// fetch, no globals — so a Node test drives the same bytes that deploy.
// ============================================================================

import { refusalCarriesState, STATELESS_REFUSALS } from './intents.js';

/** The one statement. A single `select`, which is what transaction-mode pooling
    requires (design §2a-ii, HARD RULE). */
export const REFRESH_SQL = 'select public.hr_state_of($1::uuid, $2::int) as state';

/**
 * Build a refusal body carrying the CURRENT `hr_state_of` envelope.
 *
 * @param o.exec      the injected one-statement seam
 * @param o.verb      the verb, echoed on every body so one client dispatcher
 *                    can route a response without remembering what it asked
 * @param o.user      the VERIFIED subject
 * @param o.slot      the character slot
 * @param o.refusal   `{ error, stage?, detail?, ...anything the intent adds }`
 * @param o.fallback  the envelope read at the top of the call, used only if the
 *                    fresh read fails. Pass null where it is known to be stale.
 * @param o.decorate  optional `(env) => extraFields` — how THIS intent
 *                    summarises the server's state at the top level (the
 *                    activity intent echoes the pointer). Called only when an
 *                    envelope was obtained.
 *
 * ⚠ A FAILED REFRESH MUST NOT TURN A 409 INTO A 500. The refusal is the answer;
 *   the envelope is an aid to reconciling. So the read is best-effort and the
 *   body degrades to "no envelope" — the same shape the documented stateless
 *   refusals have, which the client already handles.
 */
export async function refusalBody(o) {
  const { exec, verb, user, slot, refusal, fallback, decorate } = o;

  /* THE RULE GETS A RUNTIME READER. `refusalCarriesState` was, until b349, read
     by nothing but a test — which is the definition of decoration in this
     payload (intents.js: "a rule in this file that no code path reads is not a
     rule"). Now the mechanics ask the rule: a code on the exemption list has
     already returned before reaching here, so arriving with one means an intent
     is about to spend a statement re-reading state for a refusal the contract
     says carries none. Answer without the read rather than silently disagreeing
     with the published taxonomy. */
  if (!refusalCarriesState(refusal && refusal.error)) {
    return { ok: false, verb, ...refusal };
  }

  let env = null;
  try {
    const [row] = await exec(REFRESH_SQL, [user, slot]);
    const fresh = row && row.state;
    if (fresh && fresh.ok === true) env = fresh;
  } catch { /* best effort — see above */ }
  if (!env && fallback && fallback.ok === true) env = fallback;
  if (!env) return { ok: false, verb, ...refusal };
  return {
    ...env,
    ok: false,
    verb,
    ...(typeof decorate === 'function' ? (decorate(env) || {}) : {}),
    ...refusal,
  };
}

/** Re-exported so a caller needs one import to reason about the taxonomy. */
export { refusalCarriesState, STATELESS_REFUSALS };
