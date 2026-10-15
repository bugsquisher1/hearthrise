// ============================================================================
// closed-gate.js — A REFUSED CALLER WHO IS NOT ADMITTED HEARS `closed`, NOT
// `rate_limited` (Security, closed-mode review item 4).
//
// Closed mode's L3 (2026-10-21-closed-mode.sql §6) refuses a non-admitted
// account inside hr_rate_gate with a bare `false`, so every verb answered it
// 429 rate_limited: "slow down" to someone who is not let in at all, and a
// refusal no ledger could tell apart from a burst. This module is the ONE
// place that tells the two apart, and it is asked ONLY for a refused call — an
// admitted, un-throttled request pays nothing for it.
//
//   closedAnswer(o) — given a verb's `{status, body}`, when it is the gate's
//   429 rate_limited, ask hr_engine_closed (2026-10-22-hunt-sessions-settle.sql,
//   hr_engine only). It journals ONE hr_rejections aggregate upsert, code
//   'closed', and answers true for a non-admitted account; then the answer is
//   403 {ok:false, error:'closed'}. Anything else is returned untouched.
//
// FAIL-SAFE IN BOTH DIRECTIONS: a database without hr_engine_closed (42883)
// or any error reading it keeps the original 429 — the refusal stands either
// way; only its NAME depends on this read. Nothing here can admit a caller.
//
// PURE ESM behind the injected `exec` seam, Node + Deno. No `?v=`.
// ============================================================================

import { INTENT_ERRORS } from './intents.js';

export const CLOSED_SQL = 'select public.hr_engine_closed($1::uuid, $2::int, $3::text) as closed';

/** The edge's closed-mode error code and status. */
export const CLOSED_ERROR = INTENT_ERRORS.CLOSED;
export const CLOSED_STATUS = 403;

/** Is this verb answer the rate gate's refusal? */
export function isGateRefusal(status, body) {
  return status === 429 && !!body && typeof body === 'object' && body.error === INTENT_ERRORS.RATE_LIMITED;
}

/**
 * @param o.exec    the one-statement seam (hr_engine)
 * @param o.user    the VERIFIED subject
 * @param o.slot    the slot the call named
 * @param o.verb    the verb, for the journal row
 * @param o.status  the verb's answer status
 * @param o.body    the verb's answer body
 * @returns {Promise<{status:number, body:object}>}
 */
export async function closedAnswer(o) {
  const out = { status: o.status, body: o.body };
  if (!isGateRefusal(o.status, o.body)) return out;
  try {
    const [row] = await o.exec(CLOSED_SQL, [o.user, Number.isInteger(o.slot) ? o.slot : 0, String(o.verb || 'accrue')]);
    if (row && row.closed === true) {
      return { status: CLOSED_STATUS, body: { ok: false, error: CLOSED_ERROR } };
    }
  } catch (_e) {
    /* 42883 on a database without the function, or any read failure: the
       refusal stands as it was. */
  }
  return out;
}
