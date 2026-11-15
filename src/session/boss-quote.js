// ════════════════════════════════════════════════════════════════════════
// src/session/boss-quote.js — THE SERVER'S QUOTE FOR CALL OUT (src/data/boss-calls.js; supabase/migrations/2027-03-12-boss-call.sql).
//
// A read, not an intent: hr_boss_call_view while the ground's page is open. A server that won't say answers null, and the
// page then keeps the press off and says so. Nothing here prices or gates anything.
// A FREE CALL IS A PRICE (2027-03-22-live-events.sql §4): an event's fee dial (Open Halls) quotes 0, the verb takes 0, and the
// quote names the event that set it (`event`). 0 is the server's number like any other, never "no quote".
// ════════════════════════════════════════════════════════════════════════
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.132';

/** A quote as the server sent it, bounded: whole numbers and a code, or null. */
export function quoteOf(q) {
  if (!q || typeof q !== 'object' || !Number.isSafeInteger(q.price) || q.price < 0) return null;
  return { price: q.price, available: q.available === true, why: typeof q.why === 'string' ? q.why.slice(0, 32) : null,
    used: Number.isInteger(q.used) ? q.used : 0, perDay: Number.isInteger(q.per_day) ? q.per_day : 0, left: Number.isInteger(q.left) ? q.left : 0,
    /* the room will hold this hero alone (2027-04-05-call-out-alone.sql): the warning's one more line; a server that doesn't say adds none */
    alone: q.alone === true,
    /* the live event whose fee dial set this price (the quote's `event`), or null: it picks the pane's words, never its number */
    event: typeof q.event === 'string' && /^[a-z0-9_]{1,64}$/.test(q.event) ? q.event : null };
}

/**
 * A KEYED HALL AS THIS HERO'S PAGE SHOWS ITS DOOR: the server's `boss_halls` section (2027-04-25-boss-daily.sql hr_boss_halls_view), or null
 * when the server has not said (the page then shows no loot line, and only this hero's own bag turns the press on). Nothing here decides
 * anything: the day table and the key rule are the server's.
 *   taken     this hero made today's prize roll on the hall's boss (the server's UTC day)
 *   nextAtMs  when it can next (the server's next midnight), null when today's is still to take
 *   key       whose key an open would take (hr_boss_hall_key_of: the leader's own first, else the first seat's not under its lock):
 *             { seat (null alone), own, name (that hero's, when not this one) }, or null when no seat holds one
 *   seats     the heroes an open marches in (1 alone)        left   how many of them still have today's prize to take
 */
export function hallStateOf(cs, hall) {
  const all = cs && typeof cs.read === 'function' ? cs.read('boss_halls') : null;
  const s = all && typeof all === 'object' && typeof hall === 'string' && Object.hasOwn(all, hall) ? all[hall] : null;
  if (!s || typeof s !== 'object' || typeof s.taken !== 'boolean') return null;
  const at = typeof s.next_at === 'string' ? Date.parse(s.next_at) : NaN;
  const whole = (v) => (Number.isInteger(v) && v >= 0 && v <= 8 ? v : null);
  const k = s.key && typeof s.key === 'object' ? s.key : null;
  return { taken: s.taken, nextAtMs: s.taken && Number.isFinite(at) ? at : null,
    key: k ? { seat: whole(k.seat), own: k.own === true, name: typeof k.name === 'string' && k.name.trim() ? k.name.trim().slice(0, 40) : null } : null,
    seats: whole(s.seats), left: whole(s.left) };
}

/** The server's quote for `call`, or null with no answer (the press stays off until there is one). */
export async function readCall(account, cs, call) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !Object.hasOwn(BOSS_CALLS, call)) return null;
  const ans = await account.server.rpc('hr_boss_call_view', { p_slot: cs.slot, p_call: call });
  return ans && ans.ok && ans.body && ans.body.ok === true ? quoteOf(ans.body.quote) : null;
}
