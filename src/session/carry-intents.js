// ════════════════════════════════════════════════════════════════════════
// src/session/carry-intents.js — CARRY SUPPLIES FROM THE BAG INTO THE RUNNING HUNT.
//
// Tyler 2026-11-02 ("Yes, add a press"), from Andy's report: food, drink, ammo
// or runes that reach the bag mid-hunt (cooked, bought, taken out of Storage,
// picked up) sat unused, because a hunt spends only what it carries, then the
// store. ONE intent, hr_hunt_restock(p_slot, p_item, p_qty, p_idem)
// (supabase/migrations/2027-02-21-hunt-carry-in.sql): this hero's slot, an item
// id and a count, never a price or a total. The server checks the catalogue,
// the stock under its lock, the open hunt and the 20 s slack, and moves the
// units as one matched pair; one key moves once.
//   carryIntoHunt(account, cs, item, qty)   hr_hunt_restock
// Refused settle_first (the hunt is still catching up): the hunter's own settle
// ONCE, then ONE ask under a NEW key (src/session/catch-up.js's rule; the first
// ask wrote nothing). On ok the live view asks for a start point carrying the new
// stock (display only) and the character is RE-READ: every count changes only
// from the server's envelope. A refusal keeps the server's code and its verb.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.83';
import { refusalOf } from './refusal.js?v=0.2.83';
import { catchingUp, newIdem } from './catch-up.js?v=0.2.83';

const VERB = 'hunt_restock';
const ITEM = /^[a-z0-9_]{1,64}$/;
/** The most one carry moves: the server's per-call max (2027-02-21-hunt-carry-in.sql c_max_carry, Enter's per line). */
export const CARRY_MAX = 100000;

/** ONE carry of `qty` of `item` into `cs`'s running hunt. @returns {Promise<{ok:true, qty:number}|{ok:false, error:string, verb:string}>} */
export function carryIntoHunt(account, cs, item, qty) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !ITEM.test(String(item))
    || !Number.isSafeInteger(qty) || qty < 1 || qty > CARRY_MAX) return Promise.resolve({ ok: false, error: 'bad_intent', verb: VERB });
  const send = () => account.server.rpc('hr_hunt_restock', { p_slot: cs.slot, p_item: item, p_qty: qty, p_idem: newIdem() });
  return askVia(cs, VERB, async () => {
    let ans = await send();
    if (catchingUp(ans) && typeof cs.hello === 'function') {
      try { await cs.hello(); } catch (e) { /* the second ask's own answer says what the server holds */ }
      ans = await send();
    }
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      const r = refusalOf(ans || {});
      /* the words name the item asked for ("You no longer have that many Cooked Shrimp.") */
      return Object.assign(r, { verb: r.verb || VERB, item: r.item || item });
    }
    /* the live view's prediction restarts from a start point that carries the new stock (live-link.js ask) */
    if (cs.liveLink && typeof cs.liveLink.ask === 'function') cs.liveLink.ask();
    if (cs.status !== 'closed') await cs.load();
    return { ok: true, qty: Number.isSafeInteger(body.qty) ? body.qty : qty };
  });
}
