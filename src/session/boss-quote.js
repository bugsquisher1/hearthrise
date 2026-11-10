// ════════════════════════════════════════════════════════════════════════
// src/session/boss-quote.js — THE SERVER'S QUOTE FOR CALL OUT (src/data/boss-calls.js; supabase/migrations/2027-03-12-boss-call.sql).
//
// A read, not an intent: hr_boss_call_view while the ground's page is open. A server that won't say answers null, and the
// page then keeps the press off and says so. Nothing here prices or gates anything.
// ════════════════════════════════════════════════════════════════════════
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.115';

/** A quote as the server sent it, bounded: whole numbers and a code, or null. */
export function quoteOf(q) {
  if (!q || typeof q !== 'object' || !Number.isSafeInteger(q.price) || q.price < 1) return null;
  return { price: q.price, available: q.available === true, why: typeof q.why === 'string' ? q.why.slice(0, 32) : null,
    used: Number.isInteger(q.used) ? q.used : 0, perDay: Number.isInteger(q.per_day) ? q.per_day : 0, left: Number.isInteger(q.left) ? q.left : 0 };
}

/** The server's quote for `call`, or null with no answer (the press stays off until there is one). */
export async function readCall(account, cs, call) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !Object.hasOwn(BOSS_CALLS, call)) return null;
  const ans = await account.server.rpc('hr_boss_call_view', { p_slot: cs.slot, p_call: call });
  return ans && ans.ok && ans.body && ans.body.ok === true ? quoteOf(ans.body.quote) : null;
}
