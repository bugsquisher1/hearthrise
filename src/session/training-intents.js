// ════════════════════════════════════════════════════════════════════════
// src/session/training-intents.js — COMBAT TRAINING'S PRESSES (the server half: lane/c-combat-training).
//
//   startTraining(account, cs, {skill, where, feeSeen})  ONE hr_training_start: a skill, the yard or the house dummy, and
//                     the hourly fee the player SAW (the server re-quotes on its own clock and answers quote_changed if it
//                     moved). Never a rate, a time or an amount. On ok the character is RE-READ; refused, it is
//                     resync'd (quoted-ask.js), so the fee on screen is the server's again (both priced verbs).
//   stopTraining(cs)  a training session is a hunt on the `training_yard` ground, so Stop is the hunt's own Leave
//                     (CharacterSession.leaveHunt, hr_hunt_leave).
//   unlockDummy(account, cs, skill, priceSeen)  ONE hr_house_dummy_unlock at the price the player SAW; every open hero
//                     of the account is re-read (the dummy is the account's).
//   buyGear(account, cs, item, priceSeen)  ONE hr_training_gear_buy: a training item's id and the price the player SAW (the server
//                     prices it, refuses quote_changed, a bound row, past the account's day). Re-read; refused, resync'd.
//   openGear(account, cs, item)  ONE hr_training_gear_open: a sealed item of the hero's into its bank for that skill.
//   useGear(account, cs, skill, on)  ONE hr_training_gear_switch: the hero's "Use the training item" switch for one skill.
//   (2027-04-23-training-gear.sql, Tyler 2026-11-14: the training items, one a skill, 200%.)
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.143';
import { afterRefusal, quoted } from './quoted-ask.js?v=0.2.143';
import { PLACES } from './training-sections.js?v=0.2.143';

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
    fee: int(b.fee), price: int(b.price), purse: int(b.purse), busy: typeof b.busy === 'string' ? b.busy.slice(0, 40) : null,
    today: int(b.today), max: int(b.max) };
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
    const ans = await quoted(cs, () => account.server.rpc('hr_training_start', { p_slot: cs.slot, p_skill: skill, p_where: where, p_fee_seen: feeSeen, p_idem: newIdem() }))();
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

/** Buy one training item from the Arms Master at the price the player saw. Resolves to { ok: true, item } or the refusal. */
export function buyGear(account, cs, item, priceSeen) {
  if (!usable(account, cs) || !WORD.test(String(item)) || !Number.isSafeInteger(priceSeen) || priceSeen < 1) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'training_gear_buy' });
  }
  return askVia(cs, 'training_gear_buy', async () => {
    const ans = await quoted(cs, () => account.server.rpc('hr_training_gear_buy', { p_slot: cs.slot, p_item: item, p_price_seen: priceSeen, p_idem: newIdem() }))();
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) return refused(ans, 'training_gear_buy');
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true, item };
  });
}

/** Open one sealed training item of the hero's (bag first, then Storage) into its bank for that skill. */
export function openGear(account, cs, item) {
  if (!usable(account, cs) || !WORD.test(String(item))) return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'training_gear_open' });
  return askVia(cs, 'training_gear_open', async () => {
    const ans = await account.server.rpc('hr_training_gear_open', { p_slot: cs.slot, p_item: item, p_idem: newIdem() });
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) { await afterRefusal(cs, ans); return refused(ans, 'training_gear_open'); }
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true, item };
  });
}

/** The hero's "Use the training item" switch for one skill. */
export function useGear(account, cs, skill, on) {
  if (!usable(account, cs) || !WORD.test(String(skill)) || typeof on !== 'boolean') return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'training_gear_switch' });
  return askVia(cs, 'training_gear_switch', async () => {
    const ans = await account.server.rpc('hr_training_gear_switch', { p_slot: cs.slot, p_skill: skill, p_on: on, p_idem: newIdem() });
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) { await afterRefusal(cs, ans); return refused(ans, 'training_gear_switch'); }
    if (typeof cs.load === 'function') await cs.load();
    return { ok: true, skill, on };
  });
}

/** Unlock one skill on the account's house dummy at the price the player saw. */
export function unlockDummy(account, cs, skill, priceSeen) {
  if (!usable(account, cs) || !WORD.test(String(skill)) || !Number.isSafeInteger(priceSeen) || priceSeen < 1) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'house_dummy' });
  }
  return askVia(cs, 'house_dummy', async () => {
    const ans = await quoted(cs, () => account.server.rpc('hr_house_dummy_unlock', { p_slot: cs.slot, p_skill: skill, p_price: priceSeen, p_idem: newIdem() }))();
    if (!(ans && ans.ok && bodyOf(ans).ok === true)) return refused(ans, 'house_dummy');
    if (typeof cs.load === 'function') await cs.load();
    await rereadOthers(account, cs);
    return { ok: true, skill };
  });
}
