// ════════════════════════════════════════════════════════════════════════
// src/session/item-sections.js — THE BAG, THE GEAR, THE SKILLS AND THE SHOP, READ SAFELY.
//
// PURE. Like hunt-sections.js, this only READS the record a CharacterSession
// holds and answers each section in the shape the windows draw, or null when
// the server did not send it. Null means "show nothing / keep the control
// off", never a default: a count the server did not send is not invented, and
// a feature whose section is missing stays switched off (CLAUDE.md §6,
// residue-ahead: a gate reads the server's value and fails safe).
//
// What hr_state_of projects today:
//   inventory  { item: qty }        the bag
//   equipment  { equip_slot: item } the worn set
//   skills     { skill: { xp, level } }
//   state.gold
// What the alpha-windows server lane adds (CONFLICTS.md, 2026-10-18; the
// fixture is tests/fixtures/alpha-envelope.json):
//   bag_rules     { locked: [item], loot: { item: keep|sell|ignore }, restock: { item: n } }
//   shop          { offers: [{ offer, item, kind, price }], bids: { item: gold each },
//                   refill: { lines: [{ item, offer, have, target, buy, gold }], total } | null }
//   hunt.loot     [{ item, count }]  what this hunt has picked up (not premium-gated)
//   hunt_presets  [{ preset, name, action_set, gear: { slot: item }, restock: { item: n } }]
//   role          { id, weapon }      the hunt role the worn weapon gives
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const OFFER = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){1,3}$/;
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const str = (v, max = 64) => (typeof v === 'string' && v.length && v.length <= max ? v : null);

function read(cs, key) {
  return cs && typeof cs.read === 'function' ? cs.read(key) : undefined;
}

/** The bag: [{ id, qty }] (positive counts only), or null when the server sent no inventory. */
export function bagOf(cs) {
  const inv = read(cs, 'inventory');
  if (!isObj(inv)) return null;
  const items = [];
  for (const [id, n] of Object.entries(inv)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });
  return items;
}

/** The worn set { equip_slot: item }, or null. */
export function equipmentOf(cs) {
  const eq = read(cs, 'equipment');
  if (!isObj(eq)) return null;
  const out = {};
  for (const [slot, id] of Object.entries(eq)) if (/^[a-z0-9_]{1,32}$/.test(slot) && typeof id === 'string' && ID.test(id)) out[slot] = id;
  return out;
}

/** The skills { skill: { xp, level } }, or null. */
export function skillsOf(cs) {
  const sk = read(cs, 'skills');
  if (!isObj(sk)) return null;
  const out = {};
  for (const [id, r] of Object.entries(sk)) {
    if (!/^[a-z_]{1,32}$/.test(id) || !isObj(r) || count(r.xp) === null || !Number.isInteger(r.level) || r.level < 1) continue;
    out[id] = { xp: r.xp, level: r.level };
  }
  return out;
}

/** The character's gold as the server says, or null. */
export function goldOf(cs) {
  const st = read(cs, 'state');
  return isObj(st) ? count(st.gold) : null;
}

/** The character's name: the envelope's, the hunt hero's, or null. */
export function nameOf(cs) {
  const n = str(read(cs, 'name'), 40);
  if (n) return n;
  const h = read(cs, 'hunt');
  return isObj(h) && isObj(h.hero) ? str(h.hero.name, 40) : null;
}

const RULES = Object.freeze(['keep', 'sell', 'ignore']);

/** `bag_rules`: locks, the loot filter and the restock targets. Null = the server has none of it yet (controls stay off). */
export function rulesOf(cs) {
  const r = read(cs, 'bag_rules');
  if (!isObj(r)) return null;
  const locked = new Set(Array.isArray(r.locked) ? r.locked.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 512) : []);
  const loot = {};
  if (isObj(r.loot)) for (const [id, v] of Object.entries(r.loot)) if (ID.test(id) && RULES.includes(v)) loot[id] = v;
  const restock = {};
  if (isObj(r.restock)) for (const [id, n] of Object.entries(r.restock)) if (ID.test(id) && count(n)) restock[id] = n;
  return { locked, loot, restock };
}

const KINDS = Object.freeze(['food', 'drink', 'ammo']);

function lineOf(l) {
  if (!isObj(l) || !ID.test(String(l.item)) || count(l.have) === null || count(l.target) === null || count(l.buy) === null || count(l.gold) === null) return null;
  return { item: l.item, offer: OFFER.test(String(l.offer)) ? l.offer : null, have: l.have, target: l.target, buy: l.buy, gold: l.gold };
}

/** `shop`: the server's offers and prices, its bid for each bag item, and the refill quote. Null = no prices yet. */
export function shopOf(cs) {
  const s = read(cs, 'shop');
  if (!isObj(s)) return null;
  const offers = [];
  for (const o of Array.isArray(s.offers) ? s.offers.slice(0, 200) : []) {
    if (!isObj(o) || !OFFER.test(String(o.offer)) || !ID.test(String(o.item)) || !KINDS.includes(o.kind) || !count(o.price)) continue;
    offers.push({ offer: o.offer, item: o.item, kind: o.kind, price: o.price });
  }
  const bids = new Map();
  if (isObj(s.bids)) for (const [id, g] of Object.entries(s.bids)) if (ID.test(id) && count(g) !== null) bids.set(id, g);
  let refill = null;
  if (isObj(s.refill) && Array.isArray(s.refill.lines) && count(s.refill.total) !== null) {
    refill = { lines: s.refill.lines.slice(0, 32).map(lineOf).filter(Boolean), total: s.refill.total };
  }
  return { offers, bids, refill };
}

/** `hunt.loot`: what this hunt has picked up, or null (no hunt, or the server sends none). */
export function huntLootOf(cs) {
  const h = read(cs, 'hunt');
  if (!isObj(h) || !Array.isArray(h.loot)) return null;
  return h.loot.slice(0, 200).filter((l) => isObj(l) && ID.test(String(l.item)) && count(l.count)).map((l) => ({ item: l.item, count: l.count }));
}

/** `hunt_presets`: the saved hunt setups, or null. */
export function presetsOf(cs) {
  const p = read(cs, 'hunt_presets');
  if (!Array.isArray(p)) return null;
  const out = [];
  for (const r of p.slice(0, 8)) {
    if (!isObj(r) || !Number.isInteger(r.preset) || r.preset < 0 || r.preset > 7 || !str(r.name, 24)) continue;
    const gear = {}, restock = {};
    if (isObj(r.gear)) for (const [slot, id] of Object.entries(r.gear)) if (/^[a-z0-9_]{1,32}$/.test(slot) && typeof id === 'string' && ID.test(id)) gear[slot] = id;
    if (isObj(r.restock)) for (const [id, n] of Object.entries(r.restock)) if (ID.test(id) && count(n)) restock[id] = n;
    out.push({ preset: r.preset, name: r.name, actionSet: Number.isInteger(r.action_set) ? r.action_set : null, gear, restock });
  }
  return out;
}

/** `role`: the hunt role the server says the worn weapon gives, or null. */
export function roleOf(cs) {
  const r = read(cs, 'role');
  return isObj(r) && str(r.id, 32) ? { id: r.id, weapon: str(r.weapon) } : null;
}
