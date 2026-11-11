// ════════════════════════════════════════════════════════════════════════
// src/session/hallmark-intents.js — THE HALLMARK STEP (2027-03-14-jewelry-hallmark.sql).
//
// ONE intent naming only this character's slot, the Fine piece, the Hallmarked row the catalogue pairs it with, and the QUOTE the
// `hallmark` section showed. The server checks the hero's Crafting level, the account's count today and the price under its locks, takes
// the piece and the gem from the bag then Storage, and pays: a price that moved answers quote_changed (which re-reads here, so the row
// shows the new price before the next press). On ok the character is RE-READ: the new piece shows only from the server's envelope.
//   hallmarkPiece(account, cs, from, to, price)  hr_hallmark
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.117';
import { refusalOf } from './refusal.js?v=0.2.117';

const ID = /^[a-z0-9_]{1,48}$/;
const newIdem = () => globalThis.crypto.randomUUID();

/* The server's refusal with its numbers (intent-words.js refusalText); a stale quote re-reads first. */
async function settled(cs, ans) {
  const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans && ans.ok && b.ok === true) { if (cs.status !== 'closed') await cs.load(); return { ok: true, item: typeof b.item === 'string' ? b.item : null }; }
  const r = refusalOf(ans);
  if ((r.error === 'quote_changed' || r.error === 'insufficient_item') && cs.status !== 'closed') await cs.load();
  return r;
}

/** Hallmark one Fine piece into `to` at the price the server quoted. */
export function hallmarkPiece(account, cs, from, to, price) {
  if (!account || !account.server || !cs) return Promise.resolve({ ok: false, error: 'bad_intent' });
  if (!ID.test(String(from)) || !ID.test(String(to)) || !Number.isSafeInteger(price) || price < 1) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'hallmark', async () => settled(cs, await account.server.rpc('hr_hallmark',
    { p_slot: cs.slot, p_from: from, p_to: to, p_price: price, p_idem: newIdem() })));
}
