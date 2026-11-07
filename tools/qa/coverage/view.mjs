// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/view.mjs — ONE HERO AS THE SERVER STATES IT, IN THE SHAPE THE BRAIN READS.
//
// PURE. viewOf(hr_load's envelope) -> { level, levelXp, skills, bag, storage, worn, gold, staminaMin,
// staminaCapMin, hunting, activity, farm }. Every number is the envelope's (CLAUDE.md §6: the server's
// projection is the truth; the bot never keeps a number of its own). The fields read are the ones the
// client reads (src/session/hunt-sections.js staminaOf, farm-sections.js, account-session.js huntOpenIn).
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../../src/data/items.js';
import { SUPPLIES } from '../../../src/data/supplies.js';
import { packFor } from '../../../src/shell/hunt-list.js';
import { roleForWeapon, roleKeyOf, roleWeaponOf } from '../../../src/data/hunt-roles.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

/** item -> count from either shape the server uses ({ id: n } or [{ item_id | id, qty }]). */
function counts(v) {
  const out = {};
  if (Array.isArray(v)) for (const r of v) { const id = r && (r.item_id || r.id || r.item); if (id && num(r.qty) > 0) out[id] = (out[id] || 0) + num(r.qty); }
  else if (isObj(v)) for (const [id, n] of Object.entries(v)) { const q = isObj(n) ? num(n.qty) : num(n); if (q > 0) out[id] = q; }
  return out;
}

export function viewOf(env, clockMin = 0) {
  const st = isObj(env.state) ? env.state : {};
  const skills = {};
  const sk = st.skills || env.skills;
  if (isObj(sk)) for (const [id, s] of Object.entries(sk)) skills[id] = isObj(s) ? num(s.level) || 1 : num(s) || 1;
  else if (Array.isArray(sk)) for (const s of sk) if (s && (s.skill_id || s.id)) skills[s.skill_id || s.id] = num(s.level) || 1;
  const worn = {};
  const eq = st.equipment || env.equipment;
  if (isObj(eq)) for (const [slot, id] of Object.entries(eq)) if (typeof id === 'string' && id) worn[slot] = id; else if (isObj(id) && id.item_id) worn[slot] = id.item_id;
  if (Array.isArray(eq)) for (const r of eq) if (r && r.equip_slot && r.item_id) worn[r.equip_slot] = r.item_id;
  const stam = isObj(env.stamina) ? env.stamina : {};
  const hunt = isObj(env.hunt) && typeof env.hunt.session_id === 'string' && env.hunt.ended !== true ? env.hunt : null;
  /* the running (or just ended) session's own tally: XP by skill, kills, deaths, supplies used, the store bill */
  const tally = isObj(env.hunt) && isObj(env.hunt.session) && isObj(env.hunt.session.tally) ? env.hunt.session.tally : null;
  const land = isObj(env.farm_land) ? env.farm_land : {};
  const plots = Array.isArray(land.plots) ? land.plots : [];
  const farm = [];
  const cap = Number.isInteger(land.cap) ? land.cap : plots.length;
  for (let i = 0; i < Math.max(cap, plots.length); i++) {
    const p = plots.find((x) => x && x.i === i);
    farm.push({ idx: i, crop: p && p.crop ? p.crop : null, ready: !!(p && p.ready), readyInS: p ? num(p.ready_in_s) : 0 });
  }
  const purse = isObj(env.account) && env.account.gold !== undefined ? env.account.gold : st.gold;
  return {
    clockMin,
    level: num(env.level !== undefined && !isObj(env.level) ? env.level : (isObj(env.level) ? env.level.level : st.level)) || 1,
    levelXp: num(st.level_xp),
    skills, worn,
    bag: counts(st.inventory || env.inventory),
    storage: counts(st.bank || env.bank),
    gold: num(purse),
    staminaMin: num(stam.ms) / 60000,
    staminaCapMin: num(stam.max_ms) / 60000 || 720,
    hunting: hunt ? { hunt: hunt.hunt_id || hunt.hunt || null, session: hunt.session_id } : null,
    tally: tally ? { session: env.hunt.session_id, xp: num((tally.xp || {}).level), kills: num(tally.kills), deaths: num(tally.deaths), coins: num(tally.coins),
      supplyGold: num(tally.supply_gold), supplies: isObj(tally.supplies) ? tally.supplies : {}, bought: isObj(tally.bought) ? tally.bought : {} } : null,
    activity: st.active_kind && st.active_kind !== 'idle' ? { kind: st.active_kind, id: st.active_id } : null,
    farm,
    /* the server's own next buys (its prices, its gates): a storage chest, a hero slot, the land's next tier */
    depotNext: isObj(env.depot) && isObj(env.depot.next) ? { chest: env.depot.next.chest, gold: num(env.depot.next.gold), items: isObj(env.depot.next.items) ? env.depot.next.items : {}, can: env.depot.next.can_build === true } : null,
    heroSlot: isObj(env.account) && isObj(env.account.hero_slot_offer) ? { slotId: env.account.hero_slot_offer.slot_id, gold: num(env.account.hero_slot_offer.cost_gold) } : null,
    farmUpgrade: isObj(land.upgrade) ? { level: num(land.upgrade.level), gold: num(land.upgrade.gold), deeds: num(land.upgrade.deeds), farming: num(land.upgrade.farming) } : null,
    deeds: num(land.deeds),
  };
}

/** What a hero carries into a hunt: its own supplies, as the client packs them (src/shell/hunt-list.js packFor). */
export function packOf(v) {
  return packFor(Object.entries(v.bag).map(([id, qty]) => ({ id, qty })));
}

/** The role a starter set plays (hunt-roles.js, the one weapon -> role table). */
export function roleOfSet(set) {
  const w = set.map((id) => ITEMS[id]).find((it) => it && it.slot === 'weapon') || null;
  const s = set.map((id) => ITEMS[id]).find((it) => it && it.slot === 'shield') || null;
  return roleForWeapon(roleKeyOf(w, s)) || 'melee_dps';
}

/** Does weapon `id` play the same way as the set's weapon (a sword hero upgrades to a better sword, not to a bow)? */
export function sameFamily(set, id) {
  const it = ITEMS[id];
  const w = set.map((x) => ITEMS[x]).find((x) => x && x.slot === 'weapon');
  if (!it || it.slot !== 'weapon' || !w) return false;
  return roleWeaponOf(it) === roleWeaponOf(w) && !!it.twoHanded === !!w.twoHanded;
}

export { SUPPLIES };
