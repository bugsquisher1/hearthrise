// ════════════════════════════════════════════════════════════════════════
// src/session/storage-intents.js — MANY STACKS IN ONE ASK: PUT AWAY, LOCK.
//
// The UX flow audit 2026-11-11 (build lane 2) and lane/a-inventory-select's
// owed item: the inventory's Deposit and Lock bulk actions were one
// hr_bank_move or hr_item_lock a stack, each a round trip, stopping at the
// first refusal with the earlier stacks already moved. ONE intent each now
// (supabase/migrations/2027-04-13-bank-move-many.sql):
//   moveStorageMany(account, cs, items, dir)   hr_bank_move_many: the ids and a
//       direction; the server moves every stack WHOLE at its own count, or none
//       of them, and a refusal names the stack (`item`) and where it stopped
//   lockItems(account, cs, items, locked)      hr_item_lock_many: the ids and on
//       or off; all of them, or none and the refusal names the id
// The client names ids only, never a count, a price or a total. On ok the
// character is RE-READ (the bag, Storage and the rules change only from the
// server's envelope; the account's other heroes show that Storage from it). A
// refusal keeps the server's code and says which verb it was, so its words can
// be the verb's own (src/data/refusal-words.js REFUSAL_VERB_WORDS); a refused
// move resyncs ONCE, because the window held counts the server no longer has.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.125';
import { refusalOf } from './refusal.js?v=0.2.125';

const ITEM = /^[a-z0-9_]{1,64}$/;
/** The most one press names: the server's per-call cap (2027-04-13-bank-move-many.sql c_max_items). */
export const MANY_MAX = 1000;
const newIdem = () => globalThis.crypto.randomUUID();

/** A list of distinct item ids the server would take: 1..MANY_MAX, each an id, none twice. */
function idList(items) {
  return Array.isArray(items) && items.length >= 1 && items.length <= MANY_MAX && items.every((i) => typeof i === 'string' && ITEM.test(i))
    && new Set(items).size === items.length;
}

/** ONE ask of `verb`: the server's ok body, or its refusal with the verb named. */
function ask(account, cs, verb, send, after, onOk) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot)) return Promise.resolve({ ok: false, error: 'bad_intent', verb });
  return askVia(cs, verb, async () => {
    const ans = await send();
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      const r = refusalOf(ans || {});
      if (after && cs.status !== 'closed' && r.error !== 'closed') await after();
      return Object.assign(r, { verb: r.verb || verb, index: Number.isInteger(body && body.index) ? body.index : null });
    }
    if (cs.status !== 'closed') await cs.load();
    return onOk(body);
  });
}

/**
 * Many WHOLE stacks between `cs`'s bag and the account's Storage (deposit | withdraw), all or nothing.
 * @param {string[]} items the stack ids, in the shown order
 * @returns {Promise<{ok:true, count:number}|{ok:false, error:string, verb:string, item?:string, index?:number}>}
 */
export function moveStorageMany(account, cs, items, dir) {
  const verb = 'bank_move_many';
  if (!idList(items) || (dir !== 'deposit' && dir !== 'withdraw')) return Promise.resolve({ ok: false, error: 'bad_intent', verb });
  return ask(account, cs, verb,
    () => account.server.rpc('hr_bank_move_many', { p_slot: cs.slot, p_items: items.map((item) => ({ item, dir })), p_idem: newIdem() }),
    () => cs.resync(),
    (body) => ({ ok: true, count: Number.isSafeInteger(body.count) ? body.count : items.length }));
}

/**
 * Lock (or unlock) many items of `cs` so no bulk sale, listing or deposit takes them; the server keeps the locks.
 * @param {string[]} items the item ids
 * @returns {Promise<{ok:true, count:number}|{ok:false, error:string, verb:string, item?:string}>}
 */
export function lockItems(account, cs, items, locked) {
  const verb = 'item_lock_many';
  if (!idList(items)) return Promise.resolve({ ok: false, error: 'bad_intent', verb });
  return ask(account, cs, verb,
    () => account.server.rpc('hr_item_lock_many', { p_slot: cs.slot, p_items: items, p_locked: locked === true, p_idem: newIdem() }),
    null,
    (body) => ({ ok: true, count: Number.isSafeInteger(body.count) ? body.count : items.length }));
}
