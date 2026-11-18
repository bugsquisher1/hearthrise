// ════════════════════════════════════════════════════════════════════════
// src/session/boss-intents.js — CALL OUT: THE READ AND THE PRESS (src/data/boss-calls.js; supabase/migrations/2027-04-24-boss-call-series.sql).
//
// One ask, naming this hero's slot, a catalogue id, how many fights and one fight's price as the player was shown it:
//   callOut(account, cs, call, fights, price)   hr_boss_call: a series of `fights` called fights (Tyler 2026-11-14). Every seat
//                                       pays the first fight, its own stamina and its own fee (the server's), and enters the room, a
//                                       hero in no party alone, a party's leader with every member or none; the server charges each
//                                       later fight as it starts. A count outside the server's range answers bad_fights, a moved
//                                       price quote_changed with the new quote. The count is bounded and the price compared there.
//   openHall(account, cs, hall)         hr_boss_hall_enter: the caller spends one of a keyed hall's keys and enters its room, the
//                                       same seats (2027-04-20-boss-hall.sql). The server names the key; no price crosses.
// (The read of the quote is src/session/boss-quote.js.)
// Nothing here prices or gates anything. A press re-reads every one of this account's heroes in the party: the screen
// shows only the server's answer. A refusal keeps the server's code and its quote.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.140';
import { refusalOf } from './refusal.js?v=0.2.140';
import { partyPeersOf, settleTownActivity } from './party-intents.js?v=0.2.140';
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.140';
import { quoteOf } from './boss-quote.js?v=0.2.140';

const VERB = 'boss_call';
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs, call) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot) && Object.hasOwn(BOSS_CALLS, call);

/** ONE call for `fights` fights at the price a fight the player saw.
    @returns {Promise<{ok:true, quote:object|null}|{ok:false, error:string, quote:object|null, who:string|null, max:number|null, seats?:Array}>} */
export function callOut(account, cs, call, fights, price) {
  /* 0 is a price (an Open Halls fight costs no gold, 2027-03-22-live-events.sql §4): the server compares it with its own quote, like any other */
  if (!usable(account, cs, call) || !Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(fights) || fights < 1) return Promise.resolve({ ok: false, error: 'bad_intent', quote: null, who: null, max: null });
  const peers = partyPeersOf(account, cs);
  return askVia(cs, VERB, async () => {
    for (const o of peers) await settleTownActivity(o);
    const ans = await account.server.rpc('hr_boss_call', { p_slot: cs.slot, p_call: call, p_fights: fights, p_price: price, p_idem: newIdem() });
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      const r = refusalOf(ans || {});
      const quote = quoteOf(body && body.boss_call);
      /* the refusal's own facts, the server's: the seat that can't pay (its name), and the most fights a call may queue */
      const who = body && typeof body.who === 'string' && body.who.trim() ? body.who.trim().slice(0, 40) : quote ? quote.who : null;
      return Object.assign(r, { verb: r.verb || VERB, quote, who, max: body && Number.isInteger(body.max_fights) ? body.max_fights : quote ? quote.maxFights : null,
        seats: Array.isArray(body && body.seats) ? body.seats.slice(0, 8) : [] });
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
