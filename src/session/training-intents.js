// ════════════════════════════════════════════════════════════════════════
// src/session/training-intents.js — COMBAT TRAINING'S PRESSES (the server half: lane/c-combat-training).
//
//   startTraining(account, cs, {skill, where, feeSeen})  ONE hr_training_start: a skill, the yard or the house dummy, and
//                     the hourly fee the player SAW (the server re-quotes on its own clock and answers quote_changed if it
//                     moved). Never a rate, a time or an amount. On ok the character is RE-READ.
//   stopTraining(cs)  a training session is a hunt on the `training_yard` ground, so Stop is the hunt's own Leave
//                     (CharacterSession.leaveHunt, hr_hunt_leave).
//   unlockDummy(account, cs, skill, priceSeen)  ONE hr_house_dummy_unlock at the price the player SAW; every open hero
//                     of the account is re-read (the dummy is the account's).
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.128';
import { PLACES } from './training-sections.js?v=0.2.128';

const WORD = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function'
  && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const bodyOf = (ans) => (ans && isObj(ans.body) ? ans.body : {});
const newIdem = () => globalThis.crypto.randomUUID();

function refused(ans, verb) {
  const b = bodyOf(ans);
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb,
    fee: int(b.fee), price: int(b.price), purse: int(b.purse), busy: typeof b.busy === 'string' ? b.busy.slice(0, 40) : null };
}

function rereadOthers(account, cs) {
  const all = account && typeof account.characters === 'function' ? account.characters() : [];
  return Promise.all(all.filter((o) => o !== cs && o && o.status !== 'closed' && typeof o.load === 'function').map((o) => o.load()));
}

/** Start training one skill. Resolves to { ok: true, skill } or the refusal { ok: false, error, verb, ... }. */
export function startTraining(account, cs, o) {
  const skill = o && o.skill, where = o && o.where, feeSeen = o && o.feeSeen;
  if (!usable(account, cs) || !WORD.test(String(skill)) || !PLACES.includes(where) || !Number.isSafeInteger(feeSeen) || feeSeen < 0) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'training_start' });
  }
  return askVia(cs, 'training_start', async () => {
    const ans = await account.server.rpc('hr_training_start', { p_slot: cs.slot, p_skill: skill, p_where: where, p_fee_seen: feeSeen, p_idem: newIdem() });
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) return refused(ans, 'training_start');
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true, skill };
  });
}

/** Stop training: the hunt's own Leave. */
export function stopTraining(cs) {
  if (!cs || typeof cs.leaveHunt !== 'function') return Promise.resolve({ ok: false, error: 'bad_intent' });
  return cs.leaveHunt();
}

/** Unlock one skill on the account's house dummy at the price the player saw. */
export function unlockDummy(account, cs, skill, priceSeen) {
  if (!usable(account, cs) || !WORD.test(String(skill)) || !Number.isSafeInteger(priceSeen) || priceSeen < 1) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'house_dummy' });
  }
  return askVia(cs, 'house_dummy', async () => {
    const ans = await account.server.rpc('hr_house_dummy_unlock', { p_slot: cs.slot, p_skill: skill, p_price: priceSeen, p_idem: newIdem() });
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) return refused(ans, 'house_dummy');
    if (typeof cs.load === 'function') await cs.load();
    await rereadOthers(account, cs);
    return { ok: true, skill };
  });
}
