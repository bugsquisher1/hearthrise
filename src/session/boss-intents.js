// ════════════════════════════════════════════════════════════════════════
// src/session/boss-intents.js — CALL OUT: THE READ AND THE PRESS (src/data/boss-calls.js; supabase/migrations/2027-03-12-boss-call.sql).
//
// One ask, naming this hero's slot, a catalogue id and the price the player was shown:
//   callOut(account, cs, call, price)   hr_boss_call: the caller pays the server's fee and enters the room, a hero in no
//                                       party alone, a party's leader with every member or none (2027-04-05-call-out-alone.sql).
//                                       A moved price answers quote_changed with the new quote.
// (The read of the quote is src/session/boss-quote.js.)
// Nothing here prices or gates anything. A press re-reads every one of this account's heroes in the party: the screen
// shows only the server's answer. A refusal keeps the server's code and its quote.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.118';
import { refusalOf } from './refusal.js?v=0.2.118';
import { partyPeersOf, settleTownActivity } from './party-intents.js?v=0.2.118';
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.118';
import { quoteOf } from './boss-quote.js?v=0.2.118';

const VERB = 'boss_call';
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs, call) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot) && Object.hasOwn(BOSS_CALLS, call);

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
