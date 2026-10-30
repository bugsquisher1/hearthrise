// ════════════════════════════════════════════════════════════════════════
// src/session/home-intents.js — THE HOUSE'S TWO PURCHASES.
//
// One home per account (Tyler 2026-10-15), paid for by the character the
// player is viewing. Each verb is ONE intent naming only server catalogue ids
// (and, for a chest, the price the player was SHOWN, which the server refuses
// `quote_changed` if its own differs; never a price of the client's own):
//   buyHome(account, cs, offer)          a property tier or a room rung: the
//                                        engine's `unlock_buy` (hr_unlock_buy
//                                        prices, gates and debits it)
//   buildChest(account, cs, chest, gold) a storage chest: hr_storage_chest_build
// The server takes each material from the paying hero's bag first, then the
// account's Storage (2027-01-10-house-from-storage.sql). On ok the paying
// character is re-read (its gold and bag), and so is every other open
// character of the account: their `home`, `depot` and `bank` sections changed
// too. A refusal re-reads nobody and carries the server's code and counts.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.72';
import { refusalOf } from './refusal.js?v=0.2.72';

const ID = /^[a-z0-9_]{1,64}$/;
const OFFER = /^(?:property|room)\.[a-z0-9_]{1,40}(?:\.[0-9]{1,2})?$/;
const newIdem = () => globalThis.crypto.randomUUID();

/* The account's other open characters re-read: the house is theirs too. */
function rereadOthers(account, cs) {
  const all = account && typeof account.characters === 'function' ? account.characters() : [];
  return Promise.all(all.filter((o) => o !== cs && o && o.status !== 'closed' && typeof o.load === 'function').map((o) => o.load()));
}

/** Buy the next property tier or a room's next rung (an offer id from the `home` section). */
export async function buyHome(account, cs, offer) {
  if (!cs || typeof cs.edgeIntent !== 'function' || !OFFER.test(String(offer))) return { ok: false, error: 'bad_intent' };
  const r = await cs.edgeIntent('unlock_buy', { offer });
  if (r && r.ok) await rereadOthers(account, cs);
  return r;
}

/** Build the next storage chest at the price the `depot` section quoted. */
export async function buildChest(account, cs, chest, quotedGold) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !ID.test(String(chest))
    || !Number.isSafeInteger(quotedGold) || quotedGold < 1) return { ok: false, error: 'bad_intent' };
  return askVia(cs, 'storage_chest_build', async () => {
    const ans = await account.server.rpc('hr_storage_chest_build', { p_slot: cs.slot, p_chest: chest, p_price: quotedGold, p_idem: newIdem() });
    const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
    if (ans && ans.ok && b.ok === true) {
      await Promise.all([cs.load(), rereadOthers(account, cs)]);
      return { ok: true };
    }
    return refusalOf({ body: b, error: ans && ans.error });
  });
}
