// ════════════════════════════════════════════════════════════════════════
// src/shell/item-lore.js — WHAT AN ITEM IS, WHERE IT COMES FROM, WHAT IT IS FOR.
//
// PURE (no DOM). The words in an item's tooltip, built from the catalogue rows
// (items, drinks, monsters' drops, recipes, gathering nodes, crops, shop
// grants), so a new item row gets its story with no code. Catalogue facts
// only: no count, price or chance appears here (those are the server's and
// the tooltip takes them from the envelope).
//
//   kindWords(id)   "Weapon · Tier 1 · Common", "Food · heals 18 health"
//   sourcesOf(id)   ["Dropped by Slime and Giant Rat", "Made with Cooking"]
//   usesOf(id)      ["Used in Cooking: Wheat Bread", "Eat to heal 18 health"]
//   needOf(id, sk)  "Needs Melee 30 (you have 20)", against the server's level
//   flavourOf(id)   the item's one-line description, or ''
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.26';
import { DRINK_ITEMS, DRINK_RECIPES, DRINK_DESC } from '../data/drinks.js?v=0.2.26';
import { MONSTERS } from '../data/monsters.js?v=0.2.26';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=0.2.26';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOT_META } from '../data/gathering.js?v=0.2.26';
import { SHOP_OFFERS } from '../data/shops.js?v=0.2.26';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.26';
import { ITEM_DESC } from '../data/item-descriptions.js?v=0.2.26';
import { itemName, monsterName } from './widgets/bits.js?v=0.2.26';
import { kindOf } from './bag-model.js?v=0.2.26';

const skillName = (id) => (SKILLS_DEF[id] && SKILLS_DEF[id].name) || id;
const RARITY = Object.freeze({ common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic', unique: 'Unique' });
const TYPE = Object.freeze({ weapon: 'Weapon', armor: 'Armour', jewelry: 'Jewellery', tool: 'Tool', companion: 'Companion', trophy: 'Trophy' });

/** "A, B and C", or "A, B, C and 4 more" past `max`. */
export function listWords(names, max = 3) {
  const a = Array.from(new Set(names));
  if (a.length <= 1) return a.join('');
  if (a.length > max) return a.slice(0, max).join(', ') + ' and ' + (a.length - max) + ' more';
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

let INDEX = null;
/* item -> { drops:[monster], made:[skill], from:[gather skill], shop, inputOf:[[skill, output]] }, built once. */
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  const at = (id) => { let r = INDEX.get(id); if (!r) { r = { drops: [], made: [], from: [], shop: false, inputOf: [] }; INDEX.set(id, r); } return r; };
  for (const [mid, m] of Object.entries(MONSTERS)) for (const d of (m && m.drops) || []) if (d && d.id) at(d.id).drops.push(mid);
  const recipe = (skill, r) => {
    if (r.output) at(r.output).made.push(skill);
    const ins = Object.assign({}, r.inputs || {}, r.input ? { [r.input]: 1 } : {}, r.secondary || {});
    for (const id of Object.keys(ins)) if (r.output) at(id).inputOf.push([skill, r.output]);
  };
  for (const [skill, rows] of Object.entries(ARTISAN_RECIPES)) for (const r of rows || []) recipe(skill, r);
  for (const r of DRINK_RECIPES) recipe('cooking', r);
  for (const [nodes, skill] of [[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']]) for (const n of nodes) if (n.prod) at(n.prod).from.push(skill);
  for (const c of Object.values(CROPS)) if (c && c.prod) at(c.prod).from.push('farming');
  for (const o of SHOP_OFFERS) for (const g of o.grant || []) if (g.kind === 'item') at(g.id).shop = true;
  return INDEX;
}

/** The one line under the name: what kind of thing it is. */
export function kindWords(id) {
  const it = ITEMS[id], dr = DRINK_ITEMS[id];
  if (dr) return 'Drink · restores ' + dr.mana + ' mana';
  if (!it) return '';
  const k = kindOf(id);
  if (k === 'gear') {
    const parts = [TYPE[it.type] || 'Gear'];
    if (it.tier) parts.push('Tier ' + it.tier);
    parts.push(RARITY[it.rarity] || 'Common');
    return parts.join(' · ');
  }
  if (k === 'ammo') return 'Ammo' + (it.tier ? ' · Tier ' + it.tier : '');
  if (k === 'food') return 'Food · heals ' + it.heals + ' health';
  if (k === 'loot') return 'Monster loot';
  if (k === 'material') return 'Material';
  return TYPE[it.type] || 'Item';
}

/** Where it comes from, in plain words. */
export function sourcesOf(id, serverOffers) {
  const r = index().get(id);
  const out = [];
  if (r && r.drops.length) out.push('Dropped by ' + listWords(r.drops.map(monsterName)));
  if (r && r.from.length) out.push('Gathered with ' + listWords(r.from.map(skillName)));
  if (r && r.made.length) out.push('Made with ' + listWords(r.made.map(skillName)));
  if ((r && r.shop) || (serverOffers || []).some((o) => o.item === id)) out.push('Sold at the shop');
  return out;
}

/** What it is for, in plain words. */
export function usesOf(id) {
  const it = ITEMS[id] || {};
  const r = index().get(id);
  const out = [];
  if (r && r.inputOf.length) {
    const bySkill = new Map();
    for (const [skill, outId] of r.inputOf) { if (!bySkill.has(skill)) bySkill.set(skill, []); bySkill.get(skill).push(itemName(outId)); }
    for (const [skill, outs] of bySkill) out.push('Used in ' + skillName(skill) + ': ' + listWords(outs));
  }
  const k = kindOf(id);
  if (k === 'gear') out.push('Worn in the ' + ((EQUIP_SLOT_META[it.slot] && EQUIP_SLOT_META[it.slot].label) || it.slot).toLowerCase() + ' slot');
  if (k === 'ammo') out.push(/_rune$/.test(id) ? 'Spent by spells that call for it' : 'Fired from a bow, one per shot');
  if (k === 'food') out.push('Eat to heal ' + it.heals + ' health');
  if (k === 'drink') out.push('Drink to restore ' + DRINK_ITEMS[id].mana + ' mana');
  if (!out.length) out.push('Sell it at the shop');
  return out;
}

/**
 * The item's skill requirement in words, against the server's level when it is
 * known: { text, short } (short = below it), or null when it has none.
 */
export function needOf(id, skills) {
  const it = ITEMS[id];
  if (!it || !it.reqSkill || !(it.reqLv > 1)) return null;
  const have = skills && skills[it.reqSkill] ? skills[it.reqSkill].level : null;
  return { text: 'Needs ' + skillName(it.reqSkill) + ' ' + it.reqLv + (have !== null ? ' (you have ' + have + ')' : ''), short: have !== null && have < it.reqLv };
}

/** The item's description line, or ''. */
export function flavourOf(id) {
  return ITEM_DESC[id] || DRINK_DESC[id] || '';
}
