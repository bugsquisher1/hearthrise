// ════════════════════════════════════════════════════════════════════════
// src/session/boss-quote.js — THE SERVER'S QUOTE FOR CALL OUT (src/data/boss-calls.js; supabase/migrations/2027-04-24-boss-call-series.sql).
//
// A read, not an intent: hr_boss_call_view while the ground's page is open. A server that won't say answers null, and the
// page then keeps the press off and says so. Nothing here prices or gates anything.
// A SERIES (Tyler 2026-11-14): the quote is ONE FIGHT'S price (gold and stamina), the most fights one call may queue, what the
// room's stamina and gold cover right now, and the bill of every count the slider can pick (`totals`, the server's own sums:
// the pane reads the picked count's entry and never multiplies).
// A FREE FIGHT IS A PRICE (2027-03-22-live-events.sql §4): an event's fee dial (Open Halls) quotes 0 gold, the verb takes 0, and
// the quote names the event that set it (`event`). It waives gold only: a fight's stamina is the same.
// ════════════════════════════════════════════════════════════════════════
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.132';

const whole = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const table = (v, n) => (Array.isArray(v) && v.length === n && v.every((x) => Number.isSafeInteger(x) && x >= 0) ? v.slice() : null);

/** A quote as the server sent it, bounded: whole numbers and a code, or null. A quote that can't draw the slider is no quote. */
export function quoteOf(q) {
  if (!q || typeof q !== 'object' || !Number.isSafeInteger(q.price) || q.price < 0) return null;
  const maxFights = Number.isInteger(q.max_fights) && q.max_fights >= 1 && q.max_fights <= 1000 ? q.max_fights : null;
  const staminaMs = whole(q.fight_stamina_ms), limitMs = whole(q.limit_ms);
  const t = q.totals && typeof q.totals === 'object' ? q.totals : {};
  const fee = maxFights === null ? null : table(t.fee, maxFights), stamina = maxFights === null ? null : table(t.stamina_ms, maxFights);
  if (maxFights === null || !staminaMs || !limitMs || !fee || !stamina) return null;
  return { price: q.price, available: q.available === true, why: typeof q.why === 'string' ? q.why.slice(0, 32) : null,
    /* the seat that can't pay the first fight (the server's own name for it), or null */
    who: typeof q.who === 'string' && q.who.trim() ? q.who.trim().slice(0, 40) : null,
    /* one fight: its stamina and its limit; the most fights one call may queue */
    staminaMs, limitMs, maxFights,
    /* the fights the room's stamina and gold pay for right now (the server's count, at most the top) */
    covers: Math.min(maxFights, whole(q.covers) || 0),
    /* this account's heroes in the room: each pays its own stamina, the one purse pays for all of them */
    heroes: Number.isInteger(q.heroes) && q.heroes >= 1 ? q.heroes : 1,
    /* the bill of n fights, n = 1..maxFights at index n - 1: gold for this account, stamina a hero */
    totals: { fee, staminaMs: stamina },
    /* the room will hold this hero alone (2027-04-05-call-out-alone.sql): the warning's one more line; a server that doesn't say adds none */
    alone: q.alone === true,
    /* the live event whose fee dial set this price (the quote's `event`), or null: it picks the pane's words, never its number */
    event: typeof q.event === 'string' && /^[a-z0-9_]{1,64}$/.test(q.event) ? q.event : null };
}

/** The server's quote for `call`, or null with no answer (the press stays off until there is one). */
export async function readCall(account, cs, call) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !Object.hasOwn(BOSS_CALLS, call)) return null;
  const ans = await account.server.rpc('hr_boss_call_view', { p_slot: cs.slot, p_call: call });
  return ans && ans.ok && ans.body && ans.body.ok === true ? quoteOf(ans.body.quote) : null;
}
