// ════════════════════════════════════════════════════════════════════════
// src/session/company-intents.js — THE COMPANY'S PLAN, ONE HERO AT A TIME (1051-company-start.sql; designer D-2; lane/c-company FB-6).
//
// Each verb is ONE intent naming only this hero's slot and a ground id, a Setup number or an own hero's slot; the server checks each
// against its own rows and answers with the envelope of the hero it names (rule 11), which the hero takes as a load. Nothing is predicted:
// the screen changes only from that envelope.
//   setHeroPlan(account, cs, hunt)            hr_hero_plan_set: the hero's plan ground (null clears it). The next Start sends it there; a
//                                             hero in a party of the account's own edits the party's ground while it is in town.
//   setGroundSetup(account, cs, hunt, preset) hr_ground_setup_set: this ground points at one of the hero's saved Setups; the next Start (and
//                                             Enter's Go as) use it.
//   setPartyLead(account, cs, slot)           hr_party_lead_set: pin the leader of a party of the account's own heroes (`slot`: an own hero
//                                             in it), or null to let the front hero (ROLE_ORDER) lead again. Every own hero in the party is
//                                             read again: the leader is every seat's news.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { partyPeersOf } from './party-intents.js';

const ID = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function' && !!cs && cs.status !== 'closed';

/* ONE ask: on ok the named hero takes the envelope the answer carries (a load otherwise), and `reread` heroes are read again; a refusal
   re-reads the asking hero once (quoted-ask.js afterRefusal, A20) and carries the server's code. */
function ask(account, cs, verb, send, reread) {
  if (!usable(account, cs)) return Promise.resolve({ ok: false, error: 'bad_intent', verb });
  return askVia(cs, verb, async () => {
    const ans = await send(account.server);
    const b = ans && isObj(ans.body) ? ans.body : null;
    if (!(ans && ans.ok && b && b.ok === true)) {
      await afterRefusal(cs, ans);
      return { ok: false, error: (b && typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb };
    }
    await cs.load(isObj(b.envelope) ? b.envelope : null);
    await Promise.all((reread || []).filter((o) => o && o !== cs && o.status !== 'closed' && typeof o.load === 'function').map((o) => o.load()));
    return { ok: true, verb };
  });
}

/** The hero's plan ground (a ground id, or null to clear it). */
export function setHeroPlan(account, cs, hunt) {
  if (hunt !== null && !ID.test(String(hunt))) return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'hero_plan_set' });
  return ask(account, cs, 'hero_plan_set', (server) => server.rpc('hr_hero_plan_set', { p_slot: cs.slot, p_hunt: hunt, p_idem: newIdem() }),
    partyPeersOf(account, cs));
}

/** This ground points at Setup `preset` (one the hero saved, or 0). */
export function setGroundSetup(account, cs, hunt, preset) {
  if (!ID.test(String(hunt)) || !Number.isInteger(preset) || preset < 0 || preset > 7) return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'ground_setup_set' });
  return ask(account, cs, 'ground_setup_set', (server) => server.rpc('hr_ground_setup_set', { p_slot: cs.slot, p_hunt: hunt, p_preset: preset, p_idem: newIdem() }));
}

/** Pin the party's leader (an own hero's slot), or null to let the front hero lead. */
export function setPartyLead(account, cs, slot) {
  if (slot !== null && !(Number.isInteger(slot) && slot >= 0 && slot <= 5)) return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'party_lead_set' });
  return ask(account, cs, 'party_lead_set', (server) => server.rpc('hr_party_lead_set', { p_slot: cs.slot, p_lead: slot, p_idem: newIdem() }),
    partyPeersOf(account, cs));
}
