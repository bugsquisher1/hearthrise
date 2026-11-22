// ════════════════════════════════════════════════════════════════════════
// src/session/danger-intents.js — THE STANCE ON THE DANGER SCALE, ONE INTENT (1056-danger-scale.sql hr_hunt_risk_set).
//
//   setRisk(account, cs, risk)   hr_hunt_risk_set: this hero's plan stance, a stance id (src/data/danger.js RISKS) or 'none'. Sent
//                                before Start like the tier pick: the server freezes it with the hunt at the hunt's first session, and a
//                                hunt already open keeps what it froze (the new stance plays from the next hunt). The server refuses a
//                                party member that does not lead (not_leader), an unknown stance (bad_risk) and a burst (rate_limited).
//
// Names only the slot and a catalogue word; the answer carries the hero's envelope, which the hero takes as a load (rule 11), and the
// own heroes in its party are read again (the leader's stance is the party's). Nothing is predicted: the picker moves only from the
// server's `danger` section.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { partyPeersOf } from './party-intents.js';
import { RISKS } from '../data/danger.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function' && !!cs && cs.status !== 'closed'
  && Number.isInteger(cs.slot);

/** Is this a word the verb takes? */
export const riskOk = (risk) => risk === 'none' || (typeof risk === 'string' && Object.prototype.hasOwnProperty.call(RISKS, risk));

/** This hero's plan stance (a stance id, or 'none'). @returns {Promise<{ok: boolean, error?: string, verb: string}>} */
export function setRisk(account, cs, risk) {
  const verb = 'hunt_risk_set';
  if (!usable(account, cs) || !riskOk(risk)) return Promise.resolve({ ok: false, error: 'bad_intent', verb });
  return askVia(cs, verb, async () => {
    const ans = await account.server.rpc('hr_hunt_risk_set', { p_slot: cs.slot, p_risk: risk, p_idem: newIdem() });
    const b = ans && isObj(ans.body) ? ans.body : null;
    if (!(ans && ans.ok && b && b.ok === true)) {
      await afterRefusal(cs, ans);
      return { ok: false, error: (b && typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb };
    }
    await cs.load(isObj(b.envelope) ? b.envelope : null);
    await Promise.all(partyPeersOf(account, cs).filter((o) => o && o !== cs && o.status !== 'closed' && typeof o.load === 'function').map((o) => o.load()));
    return { ok: true, verb };
  });
}
