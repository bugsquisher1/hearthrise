// ============================================================================
// supabase/functions/hr-accrue/frame-self.js — THE SELF-ECHO MARKER.
//
// Ships with supabase/migrations/2026-10-09-frame-self-echo.sql.
//
// hr_apply pushes one frame per accepted write to the written character's
// private topic. When the write is the caller's OWN intent, that frame is an
// echo: the caller's browser applies the same envelope from the HTTP response.
// At 200 beta characters that echo was 78 % of the Realtime budget.
//
// So every PLAYER-PATH transaction this function opens marks itself with the
// requester it is acting for, transaction-local:
//     select set_config('hr.frame_self', '<user>:<slot>', true)
// and the database's emit gate (hr_frame_wanted) skips a frame only when it is
// addressed to exactly that (user, slot), the transaction is not a world-tick
// settle, the role is hr_engine, and no PostgREST JWT claim is present.
//
// ⚠ THE USER IS THE VERIFIED JWT SUBJECT, NEVER A BODY FIELD. The slot is the
//   same parsed slot the transaction passes to hr_apply. The tick path
//   (`execTick`) never calls this: a tick transaction carries no requester.
//
// Pure, no I/O, Node-importable (tests/frame-self-echo.mjs drives it).
// ============================================================================

export const FRAME_SELF_GUC = 'hr.frame_self';

/** The slot bound request.js MAX_SLOT enforces. Restated as a literal so this
 *  module answers a SHAPE question without importing the parser. */
const MAX_SLOT = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The marker for a verified requester, or null when either half is not a
 * well-formed identity. Null means "do not mark": the frame goes out, which
 * costs quota and never correctness.
 * @param {string} user  the verified JWT subject
 * @param {number} slot  the parsed character slot
 * @returns {string|null}
 */
export function frameSelfMarker(user, slot) {
  if (typeof user !== 'string' || !UUID.test(user)) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) return null;
  return user.toLowerCase() + ':' + slot;
}
