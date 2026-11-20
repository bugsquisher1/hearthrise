// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-after-intents.js — WHEN THE HUNT ENDS: THE ONE ASK.
//
// Tyler 2026-11-15, the itinerary. The hero's choice for what it does when a hunt ends on its own is a server row
// (hr_hunt_after_set, 2027-04-25-hunt-itinerary.sql): this sends the choice the data lists (src/data/hunt-after.js) and, for
// training, the skill, and nothing else. The server checks both against its own catalogue, stores it for the hero's next
// hunts and answers; the character is re-read so the page shows what the server holds. No price, count or job is ever
// sent: the server prices a training start and counts what a bench has left.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';

const CHOICE = /^[a-z_]{1,24}$/;
const SKILL = /^[a-z_]{1,32}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function'
  && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const newIdem = () => globalThis.crypto.randomUUID();

/** Store what this hero does when a hunt ends on its own. `skill`: the skill a training choice trains, else null. */
export function setHuntAfter(account, cs, choice, skill) {
  if (!usable(account, cs) || !CHOICE.test(String(choice)) || (skill != null && !SKILL.test(String(skill)))) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'hunt_after_set' });
  }
  return askVia(cs, 'hunt_after_set', async () => {
    const ans = await account.server.rpc('hr_hunt_after_set', { p_slot: cs.slot, p_choice: choice, p_skill: skill == null ? null : skill, p_idem: newIdem() });
    const b = ans && isObj(ans.body) ? ans.body : {};
    if (!(ans && ans.ok && b.ok === true)) {
      await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
      return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb: 'hunt_after_set' };
    }
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true };
  });
}
