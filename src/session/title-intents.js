// ════════════════════════════════════════════════════════════════════════
// src/session/title-intents.js — CLAIMING AND WEARING A TITLE (2027-02-28-titles.sql).
//
// Each verb is ONE intent naming only this character's slot, a catalogue id and, for a claim, the QUOTE the `titles` section showed.
// The server counts this hero's kills and re-quotes under its lock: gold can't skip kills, and a price that moved answers quote_changed
// (which re-reads here, so the row shows the new price before the next press). On ok the character is RE-READ: a claimed or worn title
// shows only from the server's envelope, never from the press.
//   buyTitle(account, cs, title, price)  hr_title_buy
//   wearTitle(account, cs, title)        hr_title_wear (null takes it off)
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.103';
import { refusalOf } from './refusal.js?v=0.2.103';

const ID = /^[a-z0-9_]{1,32}$/;
const newIdem = () => globalThis.crypto.randomUUID();

/* The server's refusal, with its numbers and the title it names, for the words (intent-words.js refusalText). */
async function settled(cs, ans) {
  const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans && ans.ok && b.ok === true) { if (cs.status !== 'closed') await cs.load(); return { ok: true }; }
  const r = Object.assign(refusalOf(ans), { title: typeof b.title === 'string' && ID.test(b.title) ? b.title : null });
  if (r.error === 'quote_changed' && cs.status !== 'closed') await cs.load();
  return r;
}

function ask(account, cs, verb, send) {
  if (!account || !account.server || !cs) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, verb, async () => settled(cs, await send(account.server)));
}

/** Claim a title at the price the server quoted. 0 is a price: a title that is itself a prize. */
export function buyTitle(account, cs, title, price) {
  if (!ID.test(String(title)) || !Number.isSafeInteger(price) || price < 0) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return ask(account, cs, 'title_buy', (server) => server.rpc('hr_title_buy', { p_slot: cs.slot, p_title: title, p_price: price, p_idem: newIdem() }));
}

/** Wear a title this hero holds, or take it off (null). */
export function wearTitle(account, cs, title) {
  if (title !== null && !ID.test(String(title))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return ask(account, cs, 'title_wear', (server) => server.rpc('hr_title_wear', { p_slot: cs.slot, p_title: title, p_idem: newIdem() }));
}
