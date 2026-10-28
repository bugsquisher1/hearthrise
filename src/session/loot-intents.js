// ════════════════════════════════════════════════════════════════════════
// src/session/loot-intents.js — DISPATCH LOOT, THE ONE ASK.
//
// Tyler 2026-10-25: each item's loot plan (Keep in bag / Deposit in storage /
// Sell, set through CharacterSession.setLootRule) runs when the player presses
// "Dispatch loot" in town: hr_loot_dispatch(p_slot, p_idem), supabase/migrations/
// 2027-01-23-loot-dispatch.sql. The client names this character's slot and a key,
// nothing else: the plans, the bag, the bid and the Storage room are the server's.
// On ok the character is RE-READ (the bag and Storage change only from that
// envelope) and the server's answer comes back as `dispatch`, for its one line
// (src/shell/loot-dispatch.js dispatchWords); the account's other heroes show
// that Storage from it (AccountSession._noteStorage). A refusal keeps the server's code
// and says which verb it was, so its words can be the verb's own.
//   dispatchLoot(account, cs)   hr_loot_dispatch
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.60';
import { refusalOf } from './refusal.js?v=0.2.60';

const VERB = 'loot_dispatch';
const newIdem = () => globalThis.crypto.randomUUID();

/** ONE Dispatch loot for `cs`. @returns {Promise<{ok:true, dispatch:object}|{ok:false, error:string, verb:string}>} */
export function dispatchLoot(account, cs) {
  if (!account || !account.server || !cs || cs.status === 'closed') return Promise.resolve({ ok: false, error: 'bad_intent', verb: VERB });
  return askVia(cs, VERB, async () => {
    const ans = await account.server.rpc('hr_loot_dispatch', { p_slot: cs.slot, p_idem: newIdem() });
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      const r = refusalOf(ans || {});
      return Object.assign(r, { verb: r.verb || VERB });
    }
    if (cs.status !== 'closed') await cs.load();
    return { ok: true, dispatch: body };
  });
}
