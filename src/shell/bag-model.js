// ════════════════════════════════════════════════════════════════════════
// src/shell/bag-model.js — WHAT THE BAG SHOWS, AND WHAT A BULK SALE WOULD NAME.
//
// PURE (no DOM). The bag window, the shop, the gear window and the tests read
// these. Every count comes from the server's `inventory`; every price from its
// `shop.bids` (src/session/item-sections.js). This file only filters, sorts and
// adds up what the server sent, for display and for the NAMES a sale intent
// carries; the server re-checks every line under the character lock.
//
//   kindOf(id)            the pocket's kind: gear, ammo, food, drink, loot, material, other
//   view(items, o)        one category, a search, a sort (the remembered choice)
//   sellPlan(items, ids)  the lines a bulk sale sends; LOCKED stacks are never named
//   bagValue(items, bids) the bag's worth at the server's bids
//   isNew / markSeen      the "new" mark (residue `bagSeen`, display only)
//   statLines / compare   an item's stats in words, and the change against the worn one
//   equipSlotFor(id, eq)  the slot an item would go into
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.11';
import { DRINK_ITEMS } from '../data/drinks.js?v=0.2.11';
import { MONSTERS } from '../data/monsters.js?v=0.2.11';
import { expandItemSlot } from '../data/gathering.js?v=0.2.11';
import { BAG_SEEN_MAX } from '../session/residue.js?v=0.2.11';
import { itemName } from './widgets/bits.js?v=0.2.11';

/* The category row, in reading order. `all` first; the rest are kinds. */
export const BAG_CATS = Object.freeze([
  ['all', 'All'], ['gear', 'Gear'], ['food', 'Food'], ['drink', 'Drinks'], ['ammo', 'Ammo'],
  ['loot', 'Loot'], ['material', 'Materials'], ['other', 'Other'],
]);
export const BAG_SORTS = Object.freeze([['type', 'Type'], ['value', 'Value'], ['newest', 'Newest'], ['name', 'Name']]);
const KIND_ORDER = new Map(BAG_CATS.map(([id], i) => [id, i]));

let DROPS = null;
/* Every item some monster drops (the bestiary rows), built once. */
function dropSet() {
  if (DROPS) return DROPS;
  DROPS = new Set();
  for (const m of Object.values(MONSTERS)) for (const d of (m && m.drops) || []) if (d && d.id) DROPS.add(d.id);
  return DROPS;
}

/** The pocket's kind, from the catalogue row. */
export function kindOf(id) {
  const it = ITEMS[id];
  if (DRINK_ITEMS[id]) return 'drink';
  if (!it) return 'other';
  if (it.slot === 'ammo' || it.type === 'ammo' || /_(arrows|rune)$/.test(id)) return 'ammo';
  if (it.slot) return 'gear';
  if (Number(it.heals) > 0) return 'food';
  if (dropSet().has(id)) return 'loot';
  if (it.raw || it.tag === 'crafting-mat') return 'material';
  return 'other';
}

/** The rarity ladder name for a framed pocket (gear only; other kinds are plain pockets). */
export function rarityOf(id) {
  const it = ITEMS[id];
  return it && it.slot && it.slot !== 'ammo' ? (it.rarity || 'common') : null;
}

/** Is this stack new: never seen, or more of it than when it was last seen? */
export function isNew(seen, id, qty) {
  const s = seen && seen[id];
  return !s || qty > s[0];
}

/**
 * The seen marks after the player has seen `ids` at their current counts.
 * Returns the new residue value, or null when nothing changed (no write).
 */
export function markSeen(seen, items, ids) {
  const want = new Set(ids);
  const out = Object.assign({}, seen || {});
  let next = 0;
  for (const v of Object.values(out)) if (v[1] >= next) next = v[1] + 1;
  let changed = false;
  for (const { id, qty } of items) {
    if (!want.has(id)) continue;
    const s = out[id];
    if (s && s[0] === qty) continue;
    out[id] = [qty, s && qty <= s[0] ? s[1] : next++];
    changed = true;
  }
  if (!changed) return null;
  const keep = Object.entries(out).sort((a, b) => b[1][1] - a[1][1]).slice(0, BAG_SEEN_MAX);
  return Object.fromEntries(keep);
}

const nameKey = (id) => itemName(id).toLowerCase();

/**
 * One view of the bag: category, search and sort.
 * @param {{id:string, qty:number}[]} items
 * @param {{cat?:string, query?:string, sort?:string, bids?:Map, seen?:object}} o
 */
export function view(items, o) {
  const cat = o.cat || 'all';
  const q = String(o.query || '').trim().toLowerCase();
  const bids = o.bids || new Map();
  const seen = o.seen || {};
  const rows = items.filter((r) => (cat === 'all' || kindOf(r.id) === cat) && (!q || nameKey(r.id).includes(q) || kindOf(r.id).includes(q)));
  const byName = (a, b) => nameKey(a.id).localeCompare(nameKey(b.id));
  const worth = (r) => (bids.has(r.id) ? bids.get(r.id) * r.qty : -1);
  const at = (r) => (isNew(seen, r.id, r.qty) ? Number.MAX_SAFE_INTEGER : seen[r.id][1]);
  const sorts = {
    type: (a, b) => KIND_ORDER.get(kindOf(a.id)) - KIND_ORDER.get(kindOf(b.id)) || byName(a, b),
    value: (a, b) => worth(b) - worth(a) || byName(a, b),
    newest: (a, b) => at(b) - at(a) || byName(a, b),
    name: byName,
  };
  return rows.sort(sorts[o.sort] || sorts.type);
}

/**
 * The sale a bulk action would send: every chosen stack whole, minus the locked
 * ones (they are listed in `kept`, never in `lines`). `total` is at the server's
 * bids; a stack with no bid is `unpriced` and is not sold (the confirmation
 * cannot show what the player would get for it).
 */
export function sellPlan(items, ids, o) {
  const want = new Set(ids);
  const locked = (o && o.locked) || new Set();
  const bids = (o && o.bids) || new Map();
  const lines = [], kept = [], unpriced = [];
  let total = 0;
  for (const { id, qty } of items) {
    if (!want.has(id)) continue;
    if (locked.has(id)) { kept.push(id); continue; }
    if (!bids.has(id)) { unpriced.push(id); continue; }
    lines.push({ item: id, qty: Math.min(qty, 1000) });
    total += bids.get(id) * Math.min(qty, 1000);
  }
  return { lines, total, kept, unpriced };
}

/** The stacks the loot filter marks "sell at the shop": what "Sell junk" offers. */
export function junkIds(items, rules) {
  if (!rules) return [];
  return items.filter((r) => rules.loot[r.id] === 'sell').map((r) => r.id);
}

/** The bag's worth at the server's bids; `unpriced` counts the stacks it has no bid for. */
export function bagValue(items, bids) {
  let total = 0, unpriced = 0;
  for (const { id, qty } of items) {
    if (bids && bids.has(id)) total += bids.get(id) * qty; else unpriced++;
  }
  return { total, unpriced };
}

/* Stat keys in reading order, with their words; `pct` values are fractions. */
const STATS = Object.freeze([
  ['atkB', 'Melee accuracy'], ['strB', 'Melee damage'], ['defB', 'Defense'],
  ['rangeAtkB', 'Ranged accuracy'], ['rangeStrB', 'Ranged damage'],
  ['magicAtkB', 'Magic accuracy'], ['magicStrB', 'Magic damage'],
  ['critB', 'Critical chance', 'pct'],
]);

const statValue = (it, k) => (it && Number.isFinite(it[k]) ? it[k] : 0);
const pctWords = (v) => (Math.round(v * 1000) / 10) + '%';

/** An item's stats as [{ key, label, value, text }] (non-zero only). */
export function statLines(id) {
  const it = ITEMS[id];
  const out = [];
  for (const [k, label, kind] of STATS) {
    const v = statValue(it, k);
    if (!v) continue;
    out.push({ key: k, label, value: v, text: (v > 0 ? '+' : '') + (kind === 'pct' ? pctWords(v) : v) });
  }
  return out;
}

/** The change wearing `id` instead of `worn` makes, stat by stat: [{ label, delta, text }]. */
export function compare(id, worn) {
  const a = ITEMS[id], b = worn ? ITEMS[worn] : null;
  const out = [];
  for (const [k, label, kind] of STATS) {
    const d = statValue(a, k) - statValue(b, k);
    if (Math.abs(d) < 1e-9) continue;
    out.push({ label, delta: d, text: (d > 0 ? '+' : '−') + (kind === 'pct' ? pctWords(Math.abs(d)) : Math.abs(d)) });
  }
  return out;
}

/** The equip slot an item goes into: its own slot, or the free one of a pair (rings). Null when it is not worn. */
export function equipSlotFor(id, equipment) {
  const it = ITEMS[id];
  const slots = it && it.slot ? expandItemSlot(it.slot) : [];
  if (!slots.length) return null;
  const eq = equipment || {};
  return slots.find((s) => !eq[s]) || slots[0];
}

/** The ONE `equip` delta that wears `id` in `slot` (null = take it off). Two hands (Tyler 2026-10-19:
 *  Healer = staff): a two-handed weapon takes the off-hand off, and an off-hand takes a two-handed
 *  weapon off, in the same delta, because hr_apply refuses the pair (two_handed) on the worn set. */
export function equipOps(slot, id, equipment) {
  const ops = { [slot]: id };
  const eq = equipment || {};
  const it = id ? ITEMS[id] : null;
  if (it && slot === 'weapon' && it.twoHanded === true && eq.shield) ops.shield = null;
  const worn = eq.weapon ? ITEMS[eq.weapon] : null;
  if (it && slot === 'shield' && worn && worn.twoHanded === true) ops.weapon = null;
  return ops;
}
