// ════════════════════════════════════════════════════════════════════════
// src/session/boss-intents.js — CALL OUT: THE READ AND THE PRESS (src/data/boss-calls.js; supabase/migrations/2027-03-12-boss-call.sql).
//
// One ask, naming this hero's slot, a catalogue id and the price the player was shown:
//   callOut(account, cs, call, price)   hr_boss_call: the caller pays the server's fee and enters the room, a hero in no
//                                       party alone, a party's leader with every member or none (2027-04-05-call-out-alone.sql).
//                                       A moved price answers quote_changed with the new quote.
//   openHall(account, cs, hall)         hr_boss_hall_enter: the caller spends one of a keyed hall's keys and enters its room, the
//                                       same seats (2027-04-20-boss-hall.sql). The server names the key; no price crosses.
// (The read of the quote is src/session/boss-quote.js.)
// Nothing here prices or gates anything. A press re-reads every one of this account's heroes in the party: the screen
// shows only the server's answer. A refusal keeps the server's code and its quote.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.129';
import { refusalOf } from './refusal.js?v=0.2.129';
import { partyPeersOf, settleTownActivity } from './party-intents.js?v=0.2.129';
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.129';
import { quoteOf } from './boss-quote.js?v=0.2.129';

const VERB = 'boss_call';
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs, call) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot) && Object.hasOwn(BOSS_CALLS, call);

/** ONE call at the price the player saw. @returns {Promise<{ok:true}|{ok:false, error:string, quote:object|null, seats?:Array}>} */
export function callOut(account, cs, call, price) {
  /* 0 is a price (an Open Halls call is free, 2027-03-22-live-events.sql §4): the server compares it with its own quote, like any other */
  if (!usable(account, cs, call) || !Number.isSafeInteger(price) || price < 0) return Promise.resolve({ ok: false, error: 'bad_intent', quote: null });
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

const HALL_VERB = 'boss_hall';
const HALL_ID = /^[a-z0-9_]{1,59}$/;

/** A KEYED HALL (src/data/boss-halls.js; 2027-04-20-boss-hall.sql hr_boss_hall_enter): spend one of the hall's keys and walk in, a hero in no
    party alone, a party's leader with every member or none. The server names the key and checks it is held; nothing here counts one.
    @returns {Promise<{ok:true, alone:boolean}|{ok:false, error:string}>} */
export function openHall(account, cs, hall) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || typeof hall !== 'string' || !HALL_ID.test(hall)) {
    return Promise.resolve({ ok: false, error: 'bad_intent' });
  }
  const peers = partyPeersOf(account, cs);
  return askVia(cs, HALL_VERB, async () => {
    for (const o of peers) await settleTownActivity(o);
    const ans = await account.server.rpc('hr_boss_hall_enter', { p_slot: cs.slot, p_hall: hall, p_idem: newIdem() });
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      const r = refusalOf(ans || {});
      return Object.assign(r, { verb: r.verb || HALL_VERB, seats: Array.isArray(body && body.seats) ? body.seats.slice(0, 8) : [] });
    }
    await Promise.all(Array.from(new Set(peers)).filter((o) => o && o.status !== 'closed').map((o) => o.load()));
    return { ok: true, alone: body.alone === true };
  });
}
