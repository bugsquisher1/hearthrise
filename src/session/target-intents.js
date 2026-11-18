// ════════════════════════════════════════════════════════════════════════
// src/session/target-intents.js — THE FIRST TARGET ON ONE GROUND (2027-04-22-target-kind.sql).
//
// The Krell's Hold design's engine piece 4: a hero names the monster kind it takes first on a ground (a mender, a
// captain's adds), remembered per ground, so it is set once. ONE intent naming only this character's slot, a ground id
// and a monster id or none, never a value: the server checks the kind against ITS catalogue of that ground
// (hr_hunt_ground_spawns) and refuses, never clamps (bad_hunt, bad_kind). On ok the character is RE-READ: the pick shows
// only from the envelope's `hunt_target_kind` section, never from what was chosen. Mid-hunt the engine reads it at
// its next settle, and the live view asks for a start point carrying it at once (display only, live-link.js ask).
//   setTargetKind(account, cs, hunt, kind)   hr_hunt_target_kind_set (kind null = none)
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.140';
import { refusalOf } from './refusal.js?v=0.2.140';
import { afterRefusal } from './quoted-ask.js?v=0.2.140';

const VERB = 'hunt_target_kind_set';
const ID = /^[a-z0-9_]{1,64}$/;

/** ONE First target pick for `cs` on `hunt`. @returns {Promise<{ok:true}|{ok:false, error:string, verb:string}>} */
export function setTargetKind(account, cs, hunt, kind) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !ID.test(String(hunt))
    || (kind !== null && !ID.test(String(kind)))) return Promise.resolve({ ok: false, error: 'bad_intent', verb: VERB });
  return askVia(cs, VERB, async () => {
    const ans = await account.server.rpc('hr_hunt_target_kind_set', { p_slot: cs.slot, p_hunt: hunt, p_kind: kind, p_idem: globalThis.crypto.randomUUID() });
    const body = ans && ans.body && typeof ans.body === 'object' ? ans.body : null;
    if (!(ans && ans.ok && body && body.ok === true)) {
      await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
      const r = refusalOf(ans || {});
      return Object.assign(r, { verb: r.verb || VERB });
    }
    /* a running live view restarts from a start point that carries the new pick (live-link.js ask; idle out of a hunt) */
    if (cs.liveLink && typeof cs.liveLink.ask === 'function') cs.liveLink.ask();
    if (cs.status !== 'closed') await cs.load();
    return { ok: true };
  });
}
