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
//   sourcesOf(id)   ["Dropped by Slime at Mill Cellar", "Made with Cooking"]
//   whereToGet(id)  the short answer where a shortage is shown: "Made with Crafting 21"
//   usesOf(id)      ["Used in Cooking: Wheat Bread", "Eat to heal 18 health"]
//   saleWords(id)   who won't buy it: "" or "For your own use. ..."; toolWords(id) what a tool does and where it counts
//   needOf(id, sk, lv)  "Needs Melee 30 — you have 20" / "Needs Level 30 — you're 28", against the server's numbers
//   flavourOf(id)   the item's one-line description, or ''
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.104';
import { toolSpeed, toolXpB, toolDouble } from '../core/tools.js?v=0.2.104';
import { listWords, whole } from '../render/format.js?v=0.2.104';
import { LEVEL_REQ } from '../data/gear-tiers.js?v=0.2.104';
import { DRINK_ITEMS, DRINK_RECIPES, DRINK_DESC } from '../data/drinks.js?v=0.2.104';
import { MONSTERS } from '../data/monsters.js?v=0.2.104';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=0.2.104';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOT_META } from '../data/gathering.js?v=0.2.104';
import { SHOP_OFFERS } from '../data/shops.js?v=0.2.104';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.104';
import { ITEM_DESC } from '../data/item-descriptions.js?v=0.2.104';
import { itemName } from './widgets/bits.js?v=0.2.104';
import { kindOf, riteOf, cookOf, namedFuelOf, houseSpends, isStartKit, madeFromKit } from './bag-model.js?v=0.2.104';
import { FLAMES } from '../data/hearth.js?v=0.2.104';
import { SHOP_LISTED_OFFER_IDS } from '../data/supply-basics.js?v=0.2.104';
import { dropWhereWords, isRareItem } from './hunt-ground-facts.js?v=0.2.104';
import { recipeOutcomes, HALLMARK_OFFERS } from '../data/jewelry.js?v=0.2.104';

const skillName = (id) => (SKILLS_DEF[id] && SKILLS_DEF[id].name) || id;
const RARITY = Object.freeze({ common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic', unique: 'Unique' });
const TYPE = Object.freeze({ weapon: 'Weapon', armor: 'Armor', jewelry: 'Jewelry', tool: 'Tool', trophy: 'Trophy' });

let INDEX = null;
/* item -> { drops:[monster], made:[skill], from:[gather skill], at:{skill: lowest level}, shop, inputOf:[[skill, output, job]] }, built once.
   `job`: the words for a job that names itself rather than its product (designer 2026-11-05: an input to a gem roll or to the Hallmark
   names the job, never the grades it may make); null for every other recipe. */
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  const at = (id) => { let r = INDEX.get(id); if (!r) { r = { drops: [], made: [], from: [], at: {}, shop: false, inputOf: [] }; INDEX.set(id, r); } return r; };
  for (const [mid, m] of Object.entries(MONSTERS)) for (const d of (m && m.drops) || []) if (d && d.id) at(d.id).drops.push(mid);
  const lowest = (row, skill, req) => { row.at[skill] = Math.min(row.at[skill] || Infinity, Math.max(1, Number(req) || 1)); };
  const recipe = (skill, r) => {
    /* every grade a rolled job can make is made by it (src/data/jewelry.js) */
    for (const id of recipeOutcomes(r)) { at(id).made.push(skill); lowest(at(id), skill, r.req); }
    const ins = Object.assign({}, r.inputs || {}, r.input ? { [r.input]: 1 } : {}, r.secondary || {});
    /* a gem roll never makes the piece it is named for: its inputs name the job (a piece's own rolled job is named for the piece it makes) */
    for (const id of Object.keys(ins)) if (r.output) at(id).inputOf.push([skill, r.output, r.roll === 'gem' ? r.name : null]);
  };
  for (const [skill, rows] of Object.entries(ARTISAN_RECIPES)) for (const r of rows || []) recipe(skill, r);
  for (const r of DRINK_RECIPES) recipe('cooking', r);
  /* the Hallmark step: a Fine piece and its gem make the Hallmarked row (at Crafting), and are used in it */
  for (const o of HALLMARK_OFFERS) { at(o.to).made.push(o.skill); lowest(at(o.to), o.skill, o.level); for (const id of [o.from, o.gem]) at(id).inputOf.push([o.skill, o.to, 'the Hallmark']); }
  for (const [nodes, skill] of [[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']]) for (const n of nodes) if (n.prod) { at(n.prod).from.push(skill); lowest(at(n.prod), skill, n.req); }
  for (const c of Object.values(CROPS)) if (c && c.prod) { at(c.prod).from.push('farming'); lowest(at(c.prod), 'farming', c.req || c.lv); }
  /* Only a row a Shop tab lists is "sold at the shop": the rest are the vendor's price list (lane/b-orphan-sources). */
  for (const o of SHOP_OFFERS) if (SHOP_LISTED_OFFER_IDS.has(o.id)) for (const g of o.grant || []) if (g.kind === 'item') at(g.id).shop = true;
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
  /* the ammo pocket holds more than shots: a rune fuels spells and a whetstone sharpens a blade (panel 2026-11-01) */
  if (k === 'ammo') return (/_rune$/.test(id) ? 'Rune' : it.reqSkill === 'melee' ? 'Whetstone' : 'Ammo') + (it.tier ? ' · Tier ' + it.tier : '');
  if (k === 'food') return 'Food · heals ' + it.heals + ' health';
  if (k === 'loot') return 'Monster loot';
  if (k === 'material') return 'Material';
  return TYPE[it.type] || 'Item';
}

/** Where it comes from, in plain words. */
export function sourcesOf(id, serverOffers) {
  const r = index().get(id);
  const out = [];
  /* The creatures a player can meet, and where: the catalogue keeps rows for monsters no open ground spawns, and
     "Dropped by" six of those sent a Bear Pelt hunter nowhere. */
  if (r && r.drops.length) out.push(dropWhereWords(id) || 'Dropped by creatures on grounds that aren\'t open yet');
  if (r && r.from.length) out.push(fromWords(r.from));
  if (r && r.made.length) out.push('Made with ' + listWords(r.made.map(skillName)));
  if ((r && r.shop) || (serverOffers || []).some((o) => o.item === id)) out.push('Sold at the shop');
  return out;
}

const fromWords = (skills) => skills.map((s) => (s === 'farming' ? 'Grown with ' : 'Gathered with ') + skillName(s)).join('. ');

/**
 * Where to get it, for the row that says the player is short (the House's price, a recipe's input). The hero's own hands first,
 * with the level: "Made with Crafting 21". A monster's drop only when no one can do it at level 1: "Grown with Farming 20. Dropped by
 * Rat at Mill Cellar", "Dropped by Briarcoat Wolf at Meadowbrook Thicket". '' when the catalogue knows no way.
 */
export function whereToGet(id) {
  const r = index().get(id);
  if (!r) return '';
  const leveled = (word, skill) => word + skillName(skill) + (r.at[skill] > 1 ? ' ' + r.at[skill] : '');
  const hands = [...new Set(r.from)].map((s) => leveled(s === 'farming' ? 'Grown with ' : 'Gathered with ', s))
    .concat([...new Set(r.made)].map((s) => leveled('Made with ', s)));
  if (r.shop) hands.push('Sold at the shop');
  const easy = r.shop || Object.values(r.at).some((lv) => lv <= 1);
  const drop = !easy && r.drops.length ? dropWhereWords(id) : '';
  return hands.concat(drop ? [drop] : []).join('. ');
}

/** A tool's one job, in numbers from its row (the engine's own: core/tools.js): "Woodcutting 10% faster, 4% more XP, 4% extra yield". */
export function toolEffect(id) {
  const it = ITEMS[id];
  if (!it || it.type !== 'tool') return '';
  const pc = (v) => Math.round(v * 100) + '%';
  return skillName(it.toolSkill) + ' ' + pc(toolSpeed(it)) + ' faster, ' + pc(toolXpB(it)) + ' more XP, ' + pc(toolDouble(it)) + ' extra yield';
}

/** What a tool does and where it must be (panel 2026-11-01: "Used for: Sell it at the shop", and no word on Storage). */
export function toolWords(id) {
  const e = toolEffect(id);
  return e ? e + ' while it\'s in your bag. There\'s nothing to equip, and your best one counts. In Storage it does nothing' : '';
}

/**
 * Who won't buy what the bench makes, said before it is made (panel 2026-11-01: 12,000 runes and 2,400 arrows with no buyer and no
 * word). From the row the server's bid and the market's rule read (book value, the start kit), so a repriced item says so by itself:
 * '' when both the shop and the Weighhouse take it.
 */
export function saleWords(id) {
  const it = ITEMS[id] || DRINK_ITEMS[id];
  if (!it) return '';
  if (!(Number(it.v) > 0) || it.bop) return 'For your own use. The shop and the Weighhouse won\'t take it';
  return isStartKit(id) ? 'The shop buys it, but every new hero starts with some, so the Weighhouse won\'t list it' : '';
}

/** A sale's rare finds by name, for its confirmation ("Sell 7 stacks?" hid 3 Alpha Fang worth 1,350 of 2,054 gp, newcomer panel 2026-11-01), or ''. `lines`: { item, qty }. */
export function rareSaleWords(lines) {
  const rare = (lines || []).filter((l) => isRareItem(l.item)).map((l) => whole(l.qty) + ' ' + itemName(l.item));
  const once = (lines || []).filter((l) => madeFromKit(l.item)).map((l) => 'Nothing sells the ' + itemName(madeFromKit(l.item)) + ' that makes another ' + itemName(l.item) + '.');
  return [rare.length ? 'This sells rare finds: ' + listWords(rare) + '.' : '', ...once].filter(Boolean).join(' ');
}

/* "A", "A, and B", "A, B, and C". */
const jobListWords = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1]);

/** What it is for, in plain words. */
export function usesOf(id) {
  const it = ITEMS[id] || {};
  const r = index().get(id);
  const out = [];
  if (r && r.inputOf.length) {
    const bySkill = new Map();
    for (const [skill, outId, job] of r.inputOf) {
      if (!bySkill.has(skill)) bySkill.set(skill, { items: [], jobs: [] });
      const b = bySkill.get(skill);
      if (job) { if (!b.jobs.includes(job)) b.jobs.push(job); } else b.items.push(itemName(outId));
    }
    /* a job's name holds its own "and" ("Set a Road Carnelian in a Banded Signet"), so a list with one takes a comma before its last */
    for (const [skill, b] of bySkill) out.push('Used in ' + skillName(skill) + ': ' + (b.jobs.length ? jobListWords([...new Set(b.items)].concat(b.jobs)) : listWords(b.items)));
  }
  const k = kindOf(id);
  if (k === 'gear') out.push('Worn in the ' + ((EQUIP_SLOT_META[it.slot] && EQUIP_SLOT_META[it.slot].label) || it.slot).toLowerCase() + ' slot');
  if (k === 'ammo') out.push(ammoUse(id, it));
  if (k === 'food') out.push('Eat to heal ' + it.heals + ' health');
  if (k === 'drink') out.push('Drink to restore ' + DRINK_ITEMS[id].mana + ' mana');
  /* A Hearth fuel (bones and the family fuels): what the Great Hearth does with it, never "sell it" (ruling 2026-10-14,
     Brannoc 10-22). Every output-less bench row is a fuel (src/data/hearth.js). */
  const rite = riteOf(id);
  if (rite) out.push('Burn it in the Great Hearth to train ' + skillName(rite.skill) + (rite.recipe.req > 1 ? ' (' + skillName(rite.skill) + ' ' + rite.recipe.req + ')' : ''));
  /* A named fuel: a burst of Inner Flame, and the square's fire takes its colour for everyone */
  const named = namedFuelOf(id);
  if (named) out.push('Burn it in the Great Hearth for a burst of ' + skillName('inner_flame') + ' XP, and the fire ' + FLAMES[named.flame].words + ' for all Havora'
    + (named.req > 1 ? ' (' + skillName('inner_flame') + ' ' + named.req + ')' : ''));
  /* Raw food that cooks (playtest 10-22: Raw Wolf Meat read as 1 gp loot): Cook all in the bag does it. */
  const cook = cookOf(id);
  if (cook) out.push('Cook it into food (' + skillName(cook.skill) + ' ' + cook.recipe.req + ')');
  const tool = toolWords(id);
  if (tool) out.push(tool);
  if (it.seed) out.push('Plant it on the Farm');
  if (houseSpends(id)) out.push('The House asks for it');
  /* The last word only where it is true: the shop bids on what has a book value (catalogue.js vendorPriceOf). */
  if (!out.length) out.push(Number(it.v) > 0 ? 'Sell it at the shop' : 'Nothing but keeping: the shop won\'t buy it');
  return out;
}

/* What fills the ammo slot does three different jobs, told apart by the skill its row asks for (a loop in the test holds every row). */
function ammoUse(id, it) {
  if (/_rune$/.test(id)) return 'Spent by spells that call for it';
  const per = Number(it.ammoPerShot) || 0;
  if (it.reqSkill === 'melee') return 'Goes in the ammo slot and sharpens a melee weapon. One wears out every ' + Math.round(1 / per) + ' swings';
  return 'Fired from a bow or crossbow' + (per > 0 ? ', one per shot' : '. They never run out');
}

/**
 * A requirement in words, from what it names and the server's number (null: not known yet):
 * "Needs Level 30 (you're 28)", "Needs Magic 20 (you have 14)". Every piece of gear names the hero's Level
 * (gear-tiers.js LEVEL_REQ, Tyler 2026-10-24); a supply names its skill.
 */
export function needWords(req, lv, have) {
  const level = req === LEVEL_REQ;
  return 'Needs ' + (level ? 'Level' : skillName(req)) + ' ' + lv
    + (Number.isInteger(have) ? ' (' + (level ? 'you\'re ' : 'you have ') + have + ')' : '');
}

/**
 * The server's number a requirement reads, or null when the server has not said: the hero's Level for gear
 * (LEVEL_REQ), else that skill's level from the server's skills section. The ONE reader of "what do I have"
 * for a requirement (the tooltip, the gear gate, the refusal words and Equip upgrades all ask it).
 */
export function reqHave(req, skills, level) {
  if (req === LEVEL_REQ) return Number.isInteger(level) ? level : null;
  const s = skills && typeof req === 'string' ? skills[req] : null;
  return s && Number.isInteger(s.level) ? s.level : null;
}

/**
 * The item's requirement in words, against the server's numbers when they are known (`skills`: the server's skills
 * section, `level`: the hero's Level): { text, short } (short = below it), or null when it has none.
 */
export function needOf(id, skills, level) {
  const it = ITEMS[id];
  if (!it || !it.reqSkill || !(it.reqLv > 1)) return null;
  const have = reqHave(it.reqSkill, skills, level);
  return { text: needWords(it.reqSkill, it.reqLv, have), short: have !== null && have < it.reqLv };
}

/** needOf when the hero is under the requirement, else null: nothing is claimed before the server has sent the number. */
export function shortOf(id, skills, level) {
  const need = needOf(id, skills, level);
  return need && need.short ? need : null;
}

/** The item's description line, or ''. */
export function flavourOf(id) {
  return ITEM_DESC[id] || DRINK_DESC[id] || '';
}
