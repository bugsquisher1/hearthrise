// ════════════════════════════════════════════════════════════════════════
// src/session/boss-intents.js — CALL OUT: THE READ AND THE PRESS (src/data/boss-calls.js; supabase/migrations/2027-03-02-boss-call.sql).
//
// Two asks, each naming this hero's slot, a catalogue id and, for the press, the price the player was shown:
//   readCall(account, cs, call)         hr_boss_call_view: the server's quote while the ground's page is open
//   callOut(account, cs, call, price)   hr_boss_call: the leader pays the server's fee and the party enters the room,
//                                       every member or none. A moved price answers quote_changed with the new quote.
// Nothing here prices or gates anything. A press re-reads every one of this account's heroes in the party: the screen
// shows only the server's answer. A refusal keeps the server's code and its quote.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.90';
import { refusalOf } from './refusal.js?v=0.2.90';
import { partyPeersOf, settleTownActivity } from './party-intents.js?v=0.2.90';
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.90';

const VERB = 'boss_call';
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs, call) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot) && Object.hasOwn(BOSS_CALLS, call);

/* A quote as the server sent it, bounded: whole numbers and a code, or null. */
function quoteOf(q) {
  if (!q || typeof q !== 'object' || !Number.isSafeInteger(q.price) || q.price < 1) return null;
  return { price: q.price, available: q.available === true, why: typeof q.why === 'string' ? q.why.slice(0, 32) : null,
    used: Number.isInteger(q.used) ? q.used : 0, perDay: Number.isInteger(q.per_day) ? q.per_day : 0, left: Number.isInteger(q.left) ? q.left : 0 };
}

/** The server's quote for `call`, or null with no answer (the press stays off until there is one). */
export async function readCall(account, cs, call) {
  if (!usable(account, cs, call)) return null;
  const ans = await account.server.rpc('hr_boss_call_view', { p_slot: cs.slot, p_call: call });
  return ans && ans.ok && ans.body && ans.body.ok === true ? quoteOf(ans.body.quote) : null;
}

/** ONE call at the price the player saw. @returns {Promise<{ok:true}|{ok:false, error:string, quote:object|null, seats?:Array}>} */
export function callOut(account, cs, call, price) {
  if (!usable(account, cs, call) || !Number.isSafeInteger(price) || price < 1) return Promise.resolve({ ok: false, error: 'bad_intent', quote: null });
  const peers = partyPeersOf(account, cs);
  return askVia(cs, VERB, async () => {
    for (const o of peers) await settleTownActivity(o);
    const ans = await account.server.rpc('hr_boss_call', { p_slot: cs.slot, p_call: call, p_price: price, p_idem: newIdem() });
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      const r = refusalOf(ans || {});
      return Object.assign(r, { verb: r.verb || VERB, quote: quoteOf(body && body.boss_call), seats: Array.isArray(body && body.seats) ? body.seats.slice(0, 8) : [] });
    }
    await Promise.all(Array.from(new Set(peers)).filter((o) => o && o.status !== 'closed').map((o) => o.load()));
    return { ok: true, quote: quoteOf(body.boss_call) };
  });
}
