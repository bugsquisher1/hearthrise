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
//   copyLootPlan(account, cs, from)   hr_loot_plan_copy (audit 2026-11-15 F11, 2027-04-24-loot-plan-copy.sql): this hero takes the
//     loot plan of the account's hero in slot `from`. Two slots and a key, nothing else; the server reads both heroes under the
//     caller's own account. On ok the character is RE-READ (the plan on screen is the envelope's) and the answer comes back as `copy`.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.139';
import { refusalOf } from './refusal.js?v=0.2.139';

const VERB = 'loot_dispatch';
const COPY_VERB = 'loot_plan_copy';
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

/** ONE Copy loot plan onto `cs` from the account's hero in slot `from`. @returns {Promise<{ok:true, copy:object}|{ok:false, error:string, verb:string}>} */
export function copyLootPlan(account, cs, from) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(from) || from < 0 || from === cs.slot) return Promise.resolve({ ok: false, error: 'bad_intent', verb: COPY_VERB });
  return askVia(cs, COPY_VERB, async () => {
    const ans = await account.server.rpc('hr_loot_plan_copy', { p_slot: cs.slot, p_from: from, p_idem: newIdem() });
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      const r = refusalOf(ans || {});
      return Object.assign(r, { verb: r.verb || COPY_VERB });
    }
    if (cs.status !== 'closed') await cs.load();
    return { ok: true, copy: body };
  });
}
