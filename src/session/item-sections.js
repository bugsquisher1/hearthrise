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
//   state.gold, state.gold_v (the ACCOUNT purse and its version), state.bank_cap (the bag's stack cap)
//   bank       { item: qty }        the home storage (hr_bank_move)
//   buffs      [{ type, magnitude, until, remaining_ms }]
// What the alpha-windows server lane adds (CONFLICTS.md, 2026-10-18; the
// fixture is tests/fixtures/alpha-envelope.json):
//   bag_rules     { locked: [item], loot: { item: keep|sell|ignore } }   (its `restock` is not read:
//                 restock targets drove the retired one-tap refill)
//   shop          { offers: [{ offer, item, kind, price }], bids: { item: gold each } }
//                   (offers: tools, gear and seeds; the Shop sells no supplies, Tyler 2026-10-20)
//   hunt.loot     [{ item, count }]  what this hunt has picked up (not premium-gated)
//   hunt_presets  [{ preset, name, action_set, gear: { slot: item } }]
//   role          { id, weapon }      the hunt role the worn weapon gives
// The Services window's (lane S2, 2026-10-25-stamina-refill.sql / -blessings.sql):
//   stamina_refill { available, why, restore_ms, price, n, per_day }  the next refill, priced
//   blessings      { held: [tier], permille, free_until, tiers: [{ tier, permille, price, held }] }
// The Characters window's (2026-12-04-hero-rename.sql):
//   rename         { price, level, per_day, today, available, why }  what a new name costs, and whether it may
// ════════════════════════════════════════════════════════════════════════
import { huntBagOf } from './hunt-sections.js?v=0.2.43';
import { SHOP_SOLD_KINDS } from '../data/supply-basics.js?v=0.2.43';

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

/**
 * WHAT THE HERO CAN USE NOW: an open hunt's hunt bag (Enter moved its supplies out of the bag, hr_hunt_enter_for),
 * else the bag. The ONE reader of supply stock for the bar's counts, its out-of-stock and rune reasons, the low-supply
 * alert and the food socket (Brannoc 10-22: "Food ×0" with 20 Cooked Shrimp in the hunt bag). [{ id, qty }] or null.
 */
export function carriedOf(cs) {
  return huntBagOf(cs) || bagOf(cs);
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

/* ── GOLD IS THE ACCOUNT'S (Tyler 2026-10-23; 2026-12-15-account-gold.sql) ──────────
   ONE purse per account: every hero's envelope states the same `state.gold` and the
   wallet version it was read at (`state.gold_v`). A hero that is not the one spending
   holds an older copy until its next answer, so the newest version any open hero has
   read wins (AccountSession keeps it, raise-only: the client never rolls a server
   version back, CLAUDE.md §6). */

/** This record's purse, { gold, v }, or null when the server did not state it. Pure. */
export function purseOf(cs) {
  const st = read(cs, 'state');
  if (!isObj(st) || count(st.gold) === null) return null;
  return { gold: st.gold, v: count(st.gold_v) ?? 0 };
}

/** The newer of two purses (a higher wallet version; the first on a tie), or null. Pure. */
export function newerPurse(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return b.v > a.v ? b : a;
}

/** The ACCOUNT's gold as the server last said it to any open hero, or null. */
export function goldOf(cs) {
  const acct = cs && typeof cs.accountPurse === 'function' ? cs.accountPurse() : null;
  const p = newerPurse(purseOf(cs), acct && count(acct.gold) !== null && count(acct.v) !== null ? acct : null);
  return p ? p.gold : null;
}

/** The character's name: the envelope's, the hunt hero's, or null. */
export function nameOf(cs) {
  const n = str(read(cs, 'name'), 40);
  if (n) return n;
  const h = read(cs, 'hunt');
  return isObj(h) && isObj(h.hero) ? str(h.hero.name, 40) : null;
}

const RULES = Object.freeze(['keep', 'sell', 'ignore']);

/** `bag_rules`: locks and the loot filter. Null = the server has none of it yet (controls stay off). */
export function rulesOf(cs) {
  const r = read(cs, 'bag_rules');
  if (!isObj(r)) return null;
  const locked = new Set(Array.isArray(r.locked) ? r.locked.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 512) : []);
  const loot = {};
  if (isObj(r.loot)) for (const [id, v] of Object.entries(r.loot)) if (ID.test(id) && RULES.includes(v)) loot[id] = v;
  return { locked, loot };
}

/* What the Shop sells: gear, tools and seeds, never supplies (Tyler 2026-10-20; the outfitter's gear and the seed
   counter, designer 2026-10-22). One list, the data's (supply-basics.js SHOP_SOLD_KINDS). Another kind is dropped. */
const KINDS = SHOP_SOLD_KINDS;

/** `shop`: the server's offers and prices and its bid for each bag item. Null = no prices yet. */
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
  return { offers, bids };
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
    const gear = {};
    if (isObj(r.gear)) for (const [slot, id] of Object.entries(r.gear)) if (/^[a-z0-9_]{1,32}$/.test(slot) && typeof id === 'string' && ID.test(id)) gear[slot] = id;
    out.push({ preset: r.preset, name: r.name, actionSet: Number.isInteger(r.action_set) ? r.action_set : null, gear });
  }
  return out;
}

/** `role`: the hunt role the server says the worn weapon gives, or null. */
export function roleOf(cs) {
  const r = read(cs, 'role');
  return isObj(r) && str(r.id, 32) ? { id: r.id, weapon: str(r.weapon) } : null;
}

/** `bank` (hr_state_of; written only by hr_bank_move): the ACCOUNT's storage, [{ id, qty }], or null. */
export function bankOf(cs) {
  const b = read(cs, 'bank');
  if (!isObj(b)) return null;
  const items = [];
  for (const [id, n] of Object.entries(b)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });
  return items;
}

/** `depot` (hr_depot_view; the ACCOUNT storage's space): { used, cap, next: { name, stacks } | null }, or null. */
export function depotOf(cs) {
  const d = read(cs, 'depot');
  if (!isObj(d) || count(d.used) === null || !count(d.cap)) return null;
  const n = isObj(d.next) && str(d.next.name, 40) && count(d.next.stacks) ? { name: d.next.name, stacks: d.next.stacks } : null;
  return { used: d.used, cap: d.cap, next: n };
}

/** `state.bank_cap`: how many stacks the bag holds (hr_apply's and hr_bank_move's bag fuse), or null. */
export function bagCapOf(cs) {
  const st = read(cs, 'state');
  return isObj(st) && count(st.bank_cap) ? st.bank_cap : null;
}

/** `buffs` (hr_state_of, the consumable queue): the live ones, [{ type, magnitude, msLeft }], soonest first. */
export function buffsOf(cs) {
  const b = read(cs, 'buffs');
  if (!Array.isArray(b)) return null;
  return b.slice(0, 32).filter((x) => isObj(x) && str(x.type, 32) && Number.isFinite(x.magnitude) && count(x.remaining_ms) && x.remaining_ms > 0)
    .map((x) => ({ type: x.type, magnitude: x.magnitude, msLeft: x.remaining_ms }));
}

const IMBUE_KINDS = Object.freeze(['keen', 'life_leech', 'mana_leech', 'ward', 'element_ward']);

/**
 * `imbuements` (ruling D v2; NOT on the server yet): per worn slot, how many
 * imbuement slots the piece has and what fills them,
 *   { equip_slot: { slots: 0..3, filled: [{ kind, ms_left }] } }.
 * Null while the server sends none: the Inventory then shows nothing for it.
 */
export function imbuementsOf(cs) {
  const m = read(cs, 'imbuements');
  if (!isObj(m)) return null;
  const out = {};
  for (const [slot, v] of Object.entries(m)) {
    if (!/^[a-z0-9_]{1,32}$/.test(slot) || !isObj(v) || !Number.isInteger(v.slots) || v.slots < 0 || v.slots > 3) continue;
    const filled = (Array.isArray(v.filled) ? v.filled : []).slice(0, v.slots)
      .filter((f) => isObj(f) && IMBUE_KINDS.includes(f.kind) && count(f.ms_left) !== null).map((f) => ({ kind: f.kind, msLeft: f.ms_left }));
    out[slot] = { slots: v.slots, filled };
  }
  return Object.keys(out).length ? out : null;
}

const WHY = Object.freeze(['stamina_full', 'refill_limit']);

/** `stamina_refill`: the next stamina purchase as the server prices it, or null (control off). */
export function staminaRefillOf(cs) {
  const q = read(cs, 'stamina_refill');
  if (!isObj(q) || typeof q.available !== 'boolean' || count(q.n) === null || count(q.per_day) === null) return null;
  if (q.available && (!count(q.price) || !count(q.restore_ms))) return null;
  return {
    available: q.available, why: q.available ? null : (WHY.includes(q.why) ? q.why : 'unavailable'),
    price: q.available ? q.price : null, restoreMs: q.available ? q.restore_ms : null,
    n: q.n, perDay: q.per_day, boughtToday: Math.max(0, q.n - 1),
  };
}

const RENAME_WHY = Object.freeze(['hunt_open', 'renamed_today']);

/** `rename`: what changing this hero's name costs now and whether it may, or null (Rename stays off). */
export function renameOf(cs) {
  const q = read(cs, 'rename');
  if (!isObj(q) || !count(q.price) || !count(q.level) || typeof q.available !== 'boolean') return null;
  return { price: q.price, level: q.level, available: q.available,
    why: q.available ? null : (RENAME_WHY.includes(q.why) ? q.why : 'unavailable') };
}

/** `blessings`: the held tiers and every tier's price at this character's level, or null. */
export function blessingsOf(cs) {
  const b = read(cs, 'blessings');
  if (!isObj(b) || !Array.isArray(b.tiers) || count(b.permille) === null) return null;
  const tiers = [];
  for (const t of b.tiers.slice(0, 9)) {
    if (!isObj(t) || !Number.isInteger(t.tier) || t.tier < 1 || count(t.price) === null || count(t.permille) === null) continue;
    tiers.push({ tier: t.tier, permille: t.permille, price: t.price, held: t.held === true });
  }
  tiers.sort((a, c) => a.tier - c.tier);
  return { tiers, permille: b.permille, freeUntil: Number.isInteger(b.free_until) ? b.free_until : null };
}
