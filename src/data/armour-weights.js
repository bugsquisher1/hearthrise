// ════════════════════════════════════════════════════════════════════════
// src/data/armour-weights.js — WHAT EACH ARMOR WEIGHT GIVES, IN PLAIN WORDS.
//
// Tyler 2026-10-25: "we need to better explain somewhere in the game that
// different armor weights provide different inherent bonuses (hp/mp %)".
// The one source of those words: the item tooltip (src/shell/windows/item-tip.js),
// the Inventory's worn-weight line (src/shell/windows/inventory/doll.js), Tamsin's
// tally card (src/data/hunt-tutorial.js) and the Help note (how-to-play.js).
//
// Every number is read off the rules, never restated:
//   heavy   max HP up to VITALS.heavyHpPermille for a full set (src/core/vitals.js
//           maxHpFor), and Absorb: a share of each landed blow (ARMOUR_MITIGATION.absorb)
//   medium  no HP or mana; Dodge: the blow misses outright (ARMOUR_MITIGATION.dodge)
//   light   max mana up to VITALS.lightManaPermille (maxManaFor), and Ward: a flat
//           amount off each landed blow (ARMOUR_MITIGATION.ward)
// The share is by ARMOUR_SLOTS worn of that weight (ruling K7: mixed pieces blend,
// no mixing penalty); shields and capes carry no weight. PURE: no DOM.
// ════════════════════════════════════════════════════════════════════════
import { VITALS, ARMOUR_WEIGHT, ARMOUR_SLOTS } from './core-model.js?v=0.2.69';
import { ITEMS } from './items.js?v=0.2.69';

/* pool: the vital the weight raises ('hp' | 'mana' | null), fullPm: that raise for a full set, permille. */
const WEIGHT_RULES = Object.freeze({
  heavy: Object.freeze({ name: 'Heavy', pool: 'hp', fullPm: VITALS.heavyHpPermille, guard: 'absorbs part of each blow that lands' }),
  medium: Object.freeze({ name: 'Medium', pool: null, fullPm: 0, guard: 'makes more blows miss you' }),
  light: Object.freeze({ name: 'Light', pool: 'mana', fullPm: VITALS.lightManaPermille, guard: 'takes a set amount off each blow that lands' }),
});
export const WEIGHT_ORDER = Object.freeze(['heavy', 'medium', 'light']);
const POOL_WORDS = Object.freeze({ hp: 'max HP', mana: 'max mana' });

/** "+4.6%" from a permille (one decimal, none when whole). */
const pct = (pm) => '+' + (Math.round(pm) / 10) + '%';

/** The weight of item `id` ('heavy' | 'medium' | 'light'), or null (not armor, or a shield or cape). */
function weightOf(id) {
  const it = ITEMS[id];
  return (it && it.slot && ARMOUR_WEIGHT[it.armourClass]) || null;
}

/** What `n` pieces of weight `w` add to their vital, permille: the server's own integer, in the order
    src/core/vitals.js maxHpFor / maxManaFor and hr_max_hp / hr_max_mana compute it (tests/alpha-windows.mjs AW-34 pins
    the three to one sum). */
function sharePm(w, n) {
  const r = WEIGHT_RULES[w];
  return r ? Math.floor((r.fullPm * Math.max(0, Math.floor(Number(n) || 0))) / ARMOUR_SLOTS.length) : 0;
}

/** One sentence per weight: "Heavy armor adds max HP (up to +28% for a full set) and absorbs part of each blow that lands." */
export function weightSentence(w) {
  const r = WEIGHT_RULES[w];
  if (!r) return '';
  const pool = r.pool ? 'adds ' + POOL_WORDS[r.pool] + ' (up to ' + pct(r.fullPm) + ' for a full set) and ' : 'adds no HP or mana but ';
  return r.name + ' armor ' + pool + r.guard + '.';
}

/** The same, short, for a coach card: "Heavy adds max HP and absorbs part of each blow that lands." */
export function weightShort(w) {
  const r = WEIGHT_RULES[w];
  return r ? r.name + (r.pool ? ' adds ' + POOL_WORDS[r.pool] + ' and ' : ' ') + r.guard + '.' : '';
}

/** The tooltip's line for an armor piece: { head, text }, or null. */
export function pieceWords(id) {
  const w = weightOf(id);
  if (!w) return null;
  const r = WEIGHT_RULES[w];
  if (!r.pool) return { head: r.name + ' armor', text: 'It adds no HP or mana but ' + r.guard + '.' };
  return { head: r.name + ' armor', text: 'It adds ' + POOL_WORDS[r.pool] + ' and ' + r.guard + '. This piece: ' + pct(sharePm(w, 1)) + ' '
    + POOL_WORDS[r.pool] + ', of the ' + pct(r.fullPm) + ' a full ' + w + ' set of ' + ARMOUR_SLOTS.length + ' gives.' };
}

/** The worn set's weights, from the server's `equipment`: [{ w, n, text }] heavy, medium, light ("2 heavy (+9.3% max HP)"). */
export function wornWeights(equipment) {
  const n = { heavy: 0, medium: 0, light: 0 };
  for (const id of Object.values(equipment || {})) { const w = id ? weightOf(id) : null; if (w) n[w] += 1; }
  return WEIGHT_ORDER.map((w) => {
    const r = WEIGHT_RULES[w];
    return { w, n: n[w], text: n[w] + ' ' + w + (r.pool ? ' (' + pct(sharePm(w, n[w])) + ' ' + POOL_WORDS[r.pool] + ')' : n[w] ? ' (more blows miss)' : '') };
  });
}
