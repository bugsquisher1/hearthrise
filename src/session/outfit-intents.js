// ════════════════════════════════════════════════════════════════════════
// src/session/outfit-intents.js — USING AN OUTFIT'S BUNDLE (supabase/migrations/2027-04-30-sweeps-coat.sql hr_outfit_bundle_use).
//
// ONE intent naming only this character's slot, the bundle's item id and a fresh key. Never an outfit, a hero or a count: the server reads
// which outfit the bundle owns from its own catalogue, takes one from the hero's bag (then the account's Storage) under its lock, and
// owns the outfit for this hero alone. On ok the character is RE-READ, so the outfit shows as owned only from the envelope; a refusal that
// means the screen was behind (already_owned, none_held) is re-read too.
//   useOutfitBundle(account, cs, item)   hr_outfit_bundle_use   ok: { ok, outfit }; refuses already_owned { outfit }, none_held, bad_item
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.136';
import { refusalOf } from './refusal.js?v=0.2.136';

const WORD = /^[a-z0-9_]{1,64}$/;
const RE_READS = Object.freeze(['already_owned', 'none_held', 'bad_item']);

/** Use one bundle of `item`: this hero owns its outfit for good. Resolves to { ok, outfit } or the refusal. */
export function useOutfitBundle(account, cs, item) {
  if (!account || !account.server || typeof account.server.rpc !== 'function' || !cs || !Number.isInteger(cs.slot) || !WORD.test(String(item))) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'outfit_bundle_use' });
  }
  return askVia(cs, 'outfit_bundle_use', async () => {
    const ans = await account.server.rpc('hr_outfit_bundle_use', { p_slot: cs.slot, p_item: item, p_idem: globalThis.crypto.randomUUID() });
    const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
    if (ans && ans.ok && b.ok === true) {
      if (cs.status !== 'closed' && typeof cs.load === 'function') await cs.load();
      return { ok: true, outfit: typeof b.outfit === 'string' && WORD.test(b.outfit) ? b.outfit : null };
    }
    const r = Object.assign(refusalOf(ans), { verb: 'outfit_bundle_use' });
    if (RE_READS.includes(r.error) && cs.status !== 'closed' && typeof cs.load === 'function') await cs.load();
    return r;
  });
}
