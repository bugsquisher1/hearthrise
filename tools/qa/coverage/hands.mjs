// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/hands.mjs — THE COVERAGE BOT'S HANDS: THE CLIENT'S OWN CALLS, NOTHING ELSE.
//
// One account on a local world (tools/qa/local-world.mjs). Every action is a request the shipped
// client makes, with the argument names it sends:
//   edge(verb, fields)   POST /functions/v1/hr-accrue, the body built by src/session/edge-intents.js
//                        edgeBody (so a verb or field the client may not send is refused HERE, loud)
//   rpc(name, args)      POST /rest/v1/rpc/<name>, as src/session/*-intents.js and character-session.js
//                        send it (each wrapper below names the file it mirrors)
// Every answer is recorded: { at, kind, name, args, status, ok, error, body }. A refusal is DATA for
// the report, never an exception. No SQL here writes anything; `read` is read-only (the report's).
// ════════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { edgeBody } from '../../../src/session/edge-intents.js';

const PASSWORD = 'local-world-password';   // local-world's own throwaway: these accounts die with the process
const idem = () => randomUUID();

/** The answer's verdict as the client reads it: ok only when HTTP is ok and the body does not say otherwise. */
export function verdictOf(status, body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  const ok = status >= 200 && status < 300 && !(b && b.ok === false);
  const error = ok ? null : (b && (b.error || b.code || b.message)) || 'http_' + status;
  return { ok, error: typeof error === 'string' ? error : JSON.stringify(error) };
}

/**
 * @param {object} world   an openWorld() world
 * @param {string} name    a plain account name (its email is name@local-world.test)
 * @param {(entry) => void} onAnswer  every request and its answer, for the journal
 */
export async function openAccount(world, name, onAnswer = () => {}) {
  /* a kept-alive socket the local server just closed, or a box so busy the connect timed out: every verb carries its own
     idempotency key, so a repeat is a replay, never a second buy. Four tries, backing off (a loaded box dropped one at 7 h). */
  const post = async (path, body, token) => {
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(world.origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json().catch(() => null) };
      } catch (e) {
        if (i >= 3) throw e;
        await new Promise((r) => setTimeout(r, 500 * 4 ** i));
      }
    }
  };
  const email = name + '@local-world.test';
  await post('/auth/v1/signup', { email, password: PASSWORD });
  const login = async () => (await post('/auth/v1/token?grant_type=password', { email, password: PASSWORD })).body;
  const first = await login();
  if (!first || !first.access_token) throw new Error('coverage: sign-in refused for ' + email + ': ' + JSON.stringify(first));
  let token = first.access_token, tokenAt = Date.now();
  const uid = first.user.id;
  /* An access token lives an hour of WALL time; a long run signs in again before it lapses (the client refreshes the same way). */
  const fresh = async () => { if (Date.now() - tokenAt > 45 * 60000) { token = (await login()).access_token; tokenAt = Date.now(); } return token; };

  const answer = (kind, name, args, r) => {
    const v = verdictOf(r.status, r.body);
    const entry = { kind, name, args, status: r.status, ok: v.ok, error: v.error, body: r.body };
    onAnswer(entry);
    return entry;
  };
  const rpc = async (fn, args) => answer('rpc', fn, args, await post('/rest/v1/rpc/' + fn, args, await fresh()));
  const edge = async (slot, verb, fields) => {
    const body = edgeBody(slot, verb, fields, idem());
    if (!body) throw new Error('coverage: the client may not send ' + verb + ' ' + JSON.stringify(fields) + ' (edgeBody refused it)');
    return answer('edge', verb, fields, await post('/functions/v1/hr-accrue', body, await fresh()));
  };

  const hero = (slot) => ({
    slot,
    /* src/session/account-session.js */
    create: (heroName) => rpc('hr_create_hero', { p_slot: slot, p_name: heroName, p_colors: { head: 0, body: 0, legs: 0, feet: 0 }, p_idem: idem() }),
    load: () => rpc('hr_load', { p_slot: slot }),
    /* src/session/character-session.js */
    enterHunt: (hunt, bag, preset = 0) => rpc('hr_hunt_enter', { p_slot: slot, p_hunt: hunt, p_bag: bag, p_preset: preset, p_hours: null, p_idem: idem() }),
    leaveHunt: () => rpc('hr_hunt_leave', { p_slot: slot, p_idem: idem() }),
    setTier: (hunt, tier) => rpc('hr_hunt_tier_set', { p_slot: slot, p_hunt: hunt, p_tier: tier, p_idem: idem() }),
    bank: (item, qty, dir) => rpc('hr_bank_move', { p_slot: slot, p_item: item, p_qty: qty, p_dir: dir, p_idem: idem() }),
    staminaRefill: (price) => rpc('hr_stamina_refill', { p_slot: slot, p_price: price, p_idem: idem() }),
    blessing: (tier, price) => rpc('hr_blessing_buy', { p_slot: slot, p_tier: tier, p_price: price, p_idem: idem() }),
    bestiary: (monster, stage, fee) => rpc('hr_bestiary_activate', { p_slot: slot, p_monster: monster, p_stage: stage, p_price: fee, p_idem: idem() }),
    /* src/session/farm-intents.js */
    plant: (plot, crop) => rpc('hr_farm_plant', { p_slot: slot, p_plot_idx: plot, p_crop: crop, p_idem: idem() }),
    water: (plot) => rpc('hr_farm_water', { p_slot: slot, p_plot_idx: plot, p_idem: idem() }),
    harvest: (plot) => rpc('hr_farm_harvest', { p_slot: slot, p_plot_idx: plot, p_idem: idem() }),
    /* src/session/hearth-intents.js, title-intents.js, home-intents.js, tally-intents.js, carry-intents.js */
    burn: (item) => rpc('hr_hearth_burn', { p_slot: slot, p_item: item, p_idem: idem() }),
    title: (title, price) => rpc('hr_title_buy', { p_slot: slot, p_title: title, p_price: price, p_idem: idem() }),
    chest: (chest, price) => rpc('hr_storage_chest_build', { p_slot: slot, p_chest: chest, p_price: price, p_idem: idem() }),
    tallyAccept: (task, weight = null) => rpc('hr_tally_accept', { p_slot: slot, p_task: task, p_weight: weight, p_idem: idem() }),
    tallyCollect: () => rpc('hr_tally_collect', { p_slot: slot, p_idem: idem() }),
    /* src/social/social-session.js: an open page polls the social state, which is what says "online" (a party's
       start marches in only members whose game was open lately, hr_party_away) */
    poll: () => rpc('hr_social_poll', { p_slot: slot, p_slots: [slot] }),
    /* the engine's item intents (src/session/edge-intents.js) */
    equip: (map) => edge(slot, 'equip', { equip: map }),
    sell: (lines) => edge(slot, 'vendor_sell_many', { lines }),
    buy: (offer, qty = 1) => edge(slot, 'shop_buy', { offer, qty }),
    unlock: (offer) => edge(slot, 'unlock_buy', { offer }),
    activity: (activity) => edge(slot, 'set_activity', { activity }),
    eat: (item) => edge(slot, 'eat', { item }),
  });

  return { name, email, uid, rpc, edge, hero, buySlot: (slotId, paySlot) => rpc('hr_buy_hero_slot', { p_slot_id: slotId, p_slot: paySlot, p_idem: idem() }) };
}
