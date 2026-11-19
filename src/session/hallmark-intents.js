// ════════════════════════════════════════════════════════════════════════
// src/session/hallmark-intents.js — THE HALLMARK STEP AND THE JEWEL REFORGE (2027-03-14-jewelry-hallmark.sql, 2027-05-09-jewel-reforge.sql).
//
// ONE intent each, naming only this character's slot, the piece, the row the catalogue pairs it with, and the QUOTE the `hallmark` section
// showed. The server checks the hero's level in the piece's own bench, the account's count today and the price under its locks, takes the
// piece and its inputs from the bag then Storage, and pays: a price that moved answers quote_changed (which re-reads here, so the row shows
// the new price before the next press). On ok the character is RE-READ: the new piece shows only from the server's envelope.
//   hallmarkPiece(account, cs, from, to, price)  hr_hallmark
//   reforgePiece(account, cs, from, to, price)   hr_jewel_reforge
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.141';
import { refusalOf } from './refusal.js?v=0.2.141';

const ID = /^[a-z0-9_]{1,48}$/;
const SKILL = /^[a-z_]{1,24}$/;
const newIdem = () => globalThis.crypto.randomUUID();

/* The server's refusal with its numbers (intent-words.js refusalText) and, for a level refusal, the bench it names; a stale quote re-reads first. */
async function settled(cs, ans) {
  const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans && ans.ok && b.ok === true) { if (cs.status !== 'closed') await cs.load(); return { ok: true, item: typeof b.item === 'string' ? b.item : null }; }
  const r = refusalOf(ans);
  const bench = typeof b.skill === 'string' && SKILL.test(b.skill) ? b.skill : null;
  if ((r.error === 'quote_changed' || r.error === 'insufficient_item') && cs.status !== 'closed') await cs.load();
  return { ...r, bench };
}

/* One priced step on one piece: the shared shape of both verbs. `send(args)` names its RPC literally (tests/client-intent-surface.mjs reads the calls). */
function step(verb, account, cs, from, to, price, send) {
  if (!account || !account.server || !cs) return Promise.resolve({ ok: false, error: 'bad_intent' });
  if (!ID.test(String(from)) || !ID.test(String(to)) || !Number.isSafeInteger(price) || price < 1) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, verb, async () => settled(cs, await send({ p_slot: cs.slot, p_from: from, p_to: to, p_price: price, p_idem: newIdem() })));
}

/** Hallmark one Fine piece into `to` at the price the server quoted. */
export function hallmarkPiece(account, cs, from, to, price) {
  return step('hallmark', account, cs, from, to, price, (args) => account.server.rpc('hr_hallmark', args));
}

/** Reforge one Hallmarked piece into the next tier's `to` at the price (the fee difference) the server quoted. */
export function reforgePiece(account, cs, from, to, price) {
  return step('jewel_reforge', account, cs, from, to, price, (args) => account.server.rpc('hr_jewel_reforge', args));
}
