// ════════════════════════════════════════════════════════════════════════
// src/session/piece-intents.js — WEARING AND SELLING A TRAIT PIECE (1072-piece-verbs.sql).
//
// Each verb is ONE intent naming this character's slot, the piece's id (a row the server owns) and, for a sale, the price the `pieces`
// section showed (its `sell`). The server locks the piece and re-proves every property (the account's, free, not escrowed, the slot it
// fits, the hero's Level, in town and idle), re-prices a sale and answers quote_changed when it moved. ON OK THE ANSWER IS THE ENVELOPE
// (rule 11): it is taken as the character, so the piece shows worn, or gone and the purse paid, only from the server's word.
// Taking a piece off is the equip intent (`{ <slot>: null }`, actions.js wear): the server frees the piece and puts nothing in the bag.
//   wearPiece(account, cs, piece, equipSlot)   hr_piece_wear (equipSlot null: the base's only slot; a ring names which)
//   sellPiece(account, cs, piece)              hr_piece_sell at piece.sell
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { refusalOf } from './refusal.js';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLOT = /^[a-z0-9_]{1,32}$/;
const newIdem = () => globalThis.crypto.randomUUID();

/* The server's answer: on ok its envelope is the character (taken like a load, read again only when it would not land). */
async function settled(cs, ans) {
  const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans && ans.ok && b.ok === true) { if (cs.status !== 'closed') await cs.load(b); return { ok: true }; }
  const r = refusalOf(ans);
  await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
  return r;
}

function ask(account, cs, verb, send) {
  if (!account || !account.server || !cs) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, verb, async () => settled(cs, await send(account.server)));
}

/** Put one of the account's pieces on this hero, in `equipSlot` (null: the slot its base fits). */
export function wearPiece(account, cs, piece, equipSlot) {
  if (!piece || !ID.test(String(piece.id)) || (equipSlot !== null && equipSlot !== undefined && !SLOT.test(String(equipSlot)))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return ask(account, cs, 'piece_wear', (server) => server.rpc('hr_piece_wear', { p_slot: cs.slot, p_piece: piece.id, p_equip_slot: equipSlot || null, p_idem: newIdem() }));
}

/** Sell one free piece to the store at the price the server showed for it. */
export function sellPiece(account, cs, piece) {
  if (!piece || !ID.test(String(piece.id)) || !Number.isSafeInteger(piece.sell) || piece.sell < 0) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return ask(account, cs, 'piece_sell', (server) => server.rpc('hr_piece_sell', { p_slot: cs.slot, p_piece: piece.id, p_gold: piece.sell, p_idem: newIdem() }));
}
