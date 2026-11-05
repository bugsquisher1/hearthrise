// ════════════════════════════════════════════════════════════════════════
// src/session/town-intents.js — WHAT GOLD BUYS IN HAVORA: THE WINDOW'S READ AND ITS TWO VERBS.
//
//   readSinks(account, cs)              ONE hr_town_sinks_view while the window is open, never in the envelope: the server's quotes, the last
//                                       powder this account threw, the powder still to burn and the named flame it burns behind, the Crier's quote.
//   throwPowder(account, cs, show, price)   ONE hr_town_show on a powder: the hero walks to a fuel stand from the server's yes, never before.
//   standRound(account, cs, price)      ONE hr_town_show on the round.
// A verb names the slot, a catalogue id, the price the player SAW and a fresh key: never a time, a color or an amount of anything. The server
// re-quotes under its lock and answers quote_changed if the price moved (2027-02-27-town-shows.sql). On ok the character is RE-READ, so the purse changes
// only from the envelope. Each ask goes in the account's intent ledger (askVia), so the pressed control waits.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.94';
import { SHOW_FLAMES, ROUND_OFFER } from '../data/gold-sinks.js?v=0.2.94';

const usable = (account, cs) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const word = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : null);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function quoteOf(q) {
  if (!isObj(q)) return null;
  return Object.freeze({ n: int(q.n) || 0, perDay: int(q.per_day), price: int(q.price), seconds: int(q.seconds), bookS: int(q.book_s),
    bookedS: int(q.booked_s) || 0, last: word(q.last) });
}
function mineOf(m) {
  if (!isObj(m) || !word(m.show)) return null;
  return Object.freeze({ show: m.show, fromMs: int(m.from_ms), untilMs: int(m.until_ms), behind: word(m.behind) });
}
function crierOf(c) {
  if (!isObj(c)) return null;
  return Object.freeze({ n: int(c.n) || 0, perDay: int(c.per_day), price: int(c.price), minLevel: int(c.min_level), maxLetters: int(c.max_letters),
    waitS: int(c.wait_s) || 0, on: c.on === true, lastLine: typeof c.last_line === 'string' && c.last_line ? c.last_line : null });
}

/** That answer, checked field by field and frozen; null when it is not the server's shape (the window then says so, it never invents a price). Pure. */
export function parseSinks(b) {
  if (!isObj(b) || b.ok !== true) return null;
  const powder = quoteOf(b.powder), round = quoteOf(b.round);
  if (!powder || !round) return null;
  return Object.freeze({ hunting: b.hunting === true, level: int(b.level), powder, round, mine: isObj(b.powder) ? mineOf(b.powder.mine) : null, crier: crierOf(b.crier) });
}

/** The window's read: { ok: true, sinks } or { ok: false, error }. */
export function readSinks(account, cs) {
  if (!usable(account, cs)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'town_sinks', async () => {
    const ans = await account.server.rpc('hr_town_sinks_view', { p_slot: cs.slot });
    const b = isObj(ans && ans.body) ? ans.body : {};
    const sinks = ans && ans.ok ? parseSinks(b) : null;
    if (!sinks) return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
    return { ok: true, sinks };
  });
}

/* One press. `verb` lets src/shell/sink-words.js say a refusal in the place's own words, with the server's numbers. */
function buyShow(account, cs, show, price, verb) {
  return askVia(cs, 'town_show', async () => {
    const ans = await account.server.rpc('hr_town_show', { p_slot: cs.slot, p_show: show, p_price: price, p_idem: globalThis.crypto.randomUUID() });
    const b = isObj(ans && ans.body) ? ans.body : {};
    if (!(ans && ans.ok && b.ok === true)) {
      return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb, show,
        price: int(b.price), perDay: int(b.per_day), waitS: int(b.wait_s), bookedS: int(b.booked_s) };
    }
    /* the server set the body on a fuel stand: the World walks it there and throws the pinch (display only) */
    const town = typeof account.townOf === 'function' ? account.townOf(cs.slot) : null;
    if (town && b.me && typeof town.noteStand === 'function') town.noteStand(b.me);
    if (town && verb === 'town_powder' && typeof town.noteBurn === 'function') town.noteBurn(show);
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true, show, price: int(b.price), n: int(b.n), perDay: int(b.per_day), behind: word(b.behind) };
  });
}

/** Throw one powder on the Great Hearth at the price the player saw. */
export function throwPowder(account, cs, show, price) {
  if (!usable(account, cs) || !Object.prototype.hasOwnProperty.call(SHOW_FLAMES, show) || !Number.isSafeInteger(price)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return buyShow(account, cs, show, price, 'town_powder');
}

/** Stand a round at the Tavern at the price the player saw. */
export function standRound(account, cs, price) {
  if (!usable(account, cs) || !Number.isSafeInteger(price)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return buyShow(account, cs, ROUND_OFFER, price, 'town_round');
}
