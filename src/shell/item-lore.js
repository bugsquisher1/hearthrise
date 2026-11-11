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
//   wherePlaces(id) the same answer piece by piece, each with the PLACE it names (a bench row, the Farm, the Shop's
//                   row, a hunt), so a line can link each piece to its window (src/shell/goto.js)
//   usePlaces(id)   what spends it, by place: a bench row per skill, the House, Tempering, the Farm
//   usesOf(id)      ["Used in Cooking: Wheat Bread", "Eat to heal 18 health"]
//   saleWords(id)   who won't buy it: "" or "For your own use. ..."; toolWords(id) what a tool does and where it counts
//   needOf(id, sk, lv)  "Needs Melee 30 — you have 20" / "Needs Level 30 — you're 28", against the server's numbers
//   flavourOf(id)   the item's one-line description, or ''
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.116';
import { toolSpeed, toolXpB, toolDouble } from '../core/tools.js?v=0.2.116';
import { listWords, whole } from '../render/format.js?v=0.2.116';
import { LEVEL_REQ } from '../data/gear-tiers.js?v=0.2.116';
import { DRINK_ITEMS, DRINK_RECIPES, DRINK_DESC } from '../data/drinks.js?v=0.2.116';
import { MONSTERS } from '../data/monsters.js?v=0.2.116';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=0.2.116';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOT_META } from '../data/gathering.js?v=0.2.116';
import { SHOP_OFFERS } from '../data/shops.js?v=0.2.116';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.116';
import { ITEM_DESC } from '../data/item-descriptions.js?v=0.2.116';
import { itemName } from './widgets/bits.js?v=0.2.116';
import { kindOf, riteOf, cookOf, namedFuelOf, houseSpends, isStartKit, madeFromKit, temperSpends } from './bag-model.js?v=0.2.116';
import { FLAMES } from '../data/hearth.js?v=0.2.116';
import { SHOP_LISTED_OFFER_IDS } from '../data/supply-basics.js?v=0.2.116';
import { dropWhereWords, dropHuntOf, isRareItem } from './hunt-ground-facts.js?v=0.2.116';
import { recipeOutcomes, HALLMARK_OFFERS } from '../data/jewelry.js?v=0.2.116';
import { t, hasText } from '../render/player-text.js?v=0.2.116';

const skillName = (id) => (SKILLS_DEF[id] && SKILLS_DEF[id].name) || id;
/* A rarity's word (item.rarity_<rarity>, else Common) and a type's (item.type_<type>, else `or`); own-property reads only. */
const rarityWord = (r) => (typeof r === 'string' && hasText('item.rarity_' + r) ? t('item.rarity_' + r) : t('item.rarity_common'));
const TYPES = new Set(['weapon', 'armor', 'jewelry', 'tool', 'trophy']);
const typeWord = (type, or) => (TYPES.has(type) ? t('item.type_' + type) : t(or));

let INDEX = null;
/* item -> { drops:[monster], made:[skill], from:[gather skill], at:{skill: lowest level}, row:{skill: the bench recipe or node at that
   level}, shop, inputOf:[[skill, output, job, recipe]] }, built once.
   `job`: the words for a job that names itself rather than its product (designer 2026-11-05: an input to a gem roll or to the Hallmark
   names the job, never the grades it may make); null for every other recipe. `recipe`: the bench row's id (null for the Hallmark). */
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  const at = (id) => { let r = INDEX.get(id); if (!r) { r = { drops: [], made: [], from: [], at: {}, row: {}, shop: false, inputOf: [] }; INDEX.set(id, r); } return r; };
  for (const [mid, m] of Object.entries(MONSTERS)) for (const d of (m && m.drops) || []) if (d && d.id) at(d.id).drops.push(mid);
  /* the lowest level a skill gets it at, and the bench row or node that does it there (the row a link opens) */
  const lowest = (row, skill, req, rowId) => {
    const lv = Math.max(1, Number(req) || 1);
    if (!(lv >= row.at[skill])) { row.at[skill] = lv; row.row[skill] = rowId || null; }
  };
  const recipe = (skill, r) => {
    /* every grade a rolled job can make is made by it (src/data/jewelry.js) */
    for (const id of recipeOutcomes(r)) { at(id).made.push(skill); lowest(at(id), skill, r.req, r.id); }
    const ins = Object.assign({}, r.inputs || {}, r.input ? { [r.input]: 1 } : {}, r.secondary || {});
    /* a gem roll never makes the piece it is named for: its inputs name the job (a piece's own rolled job is named for the piece it makes) */
    for (const id of Object.keys(ins)) if (r.output) at(id).inputOf.push([skill, r.output, r.roll === 'gem' ? r.name : null, r.id || null, Math.max(1, Number(r.req) || 1)]);
  };
  for (const [skill, rows] of Object.entries(ARTISAN_RECIPES)) for (const r of rows || []) recipe(skill, r);
  for (const r of DRINK_RECIPES) recipe('cooking', r);
  /* the Hallmark step: a Fine piece and its gem make the Hallmarked row (at Crafting), and are used in it */
  for (const o of HALLMARK_OFFERS) { at(o.to).made.push(o.skill); lowest(at(o.to), o.skill, o.level); for (const id of [o.from, o.gem]) at(id).inputOf.push([o.skill, o.to, 'the Hallmark', null, o.level]); }
  for (const [nodes, skill] of /** @type {[{id: string, prod?: string, req?: number}[], string][]} */ ([[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']])) for (const n of nodes) if (n.prod) { at(n.prod).from.push(skill); lowest(at(n.prod), skill, n.req, n.id); }
  for (const c of Object.values(CROPS)) if (c && c.prod) { at(c.prod).from.push('farming'); lowest(at(c.prod), 'farming', c.req || c.lv); }
  /* Only a row a Shop tab lists is "sold at the shop": the rest are the vendor's price list (lane/b-orphan-sources). */
  for (const o of SHOP_OFFERS) if (SHOP_LISTED_OFFER_IDS.has(o.id)) for (const g of o.grant || []) if (g.kind === 'item') at(g.id).shop = true;
  return INDEX;
}

/** The one line under the name: what kind of thing it is. */
export function kindWords(id) {
  const it = ITEMS[id], dr = DRINK_ITEMS[id];
  if (dr) return t('item.kind_drink', { mana: dr.mana });
  if (!it) return '';
  const k = kindOf(id);
  if (k === 'gear') {
    const parts = [typeWord(it.type, 'item.type_gear')];
    if (it.tier) parts.push(t('item.tier', { tier: it.tier }));
    parts.push(rarityWord(it.rarity));
    return parts.join(' · ');
  }
  /* the ammo pocket holds more than shots: a rune fuels spells and a whetstone sharpens a blade (panel 2026-11-01) */
  if (k === 'ammo') return [t(/_rune$/.test(id) ? 'item.kind_rune' : it.reqSkill === 'melee' ? 'item.kind_whetstone' : 'item.kind_ammo')]
    .concat(it.tier ? [t('item.tier', { tier: it.tier })] : []).join(' · ');
  if (k === 'food') return t('item.kind_food', { heals: it.heals });
  if (k === 'junk') return t('item.kind_junk');
  if (k === 'material') return t('item.kind_material');
  return typeWord(it.type, 'item.type_item');
}

/** Where it comes from, in plain words. */
export function sourcesOf(id, serverOffers) {
  const r = index().get(id);
  const out = [];
  /* The creatures a player can meet, and where: the catalogue keeps rows for monsters no open ground spawns, and
     "Dropped by" six of those sent a Bear Pelt hunter nowhere. */
  if (r && r.drops.length) out.push(dropWhereWords(id) || t('item.dropped_closed'));
  if (r && r.from.length) out.push(fromWords(r.from));
  if (r && r.made.length) out.push(t('item.made_with', { skill: listWords(r.made.map(skillName)) }));
  if ((r && r.shop) || (serverOffers || []).some((o) => o.item === id)) out.push(t('item.sold_at_shop'));
  return out;
}

const fromWords = (skills) => skills.map((s) => t(s === 'farming' ? 'item.grown_with' : 'item.gathered_with', { skill: skillName(s) })).join('. ');

/**
 * Where to get it, for the row that says the player is short (the House's price, a recipe's input). The hero's own hands first,
 * with the level: "Made with Crafting 21". A monster's drop only when no one can do it at level 1: "Grown with Farming 20. Dropped by
 * Rat at Mill Cellar", "Dropped by Briarcoat Wolf at Meadowbrook Thicket". '' when the catalogue knows no way.
 */
export function whereToGet(id) {
  return wherePlaces(id).map((p) => p.words).join('. ');
}

/** @typedef {{words: string, place: {kind: string, skill?: string, row?: string|null, item?: string, hunt?: string}|null}} ItemPlace  a line's words and the window it opens */

/**
 * whereToGet piece by piece: [{ words, place }], in its order. `place` is what the words name, for a link to open:
 * { kind: 'work', skill, row } (a bench recipe or a gathering node), { kind: 'farm' }, { kind: 'shop', item },
 * { kind: 'hunt', hunt }. From the catalogue rows, so a new recipe or ground links itself.
 * @returns {ItemPlace[]}
 */
export function wherePlaces(id) {
  const r = index().get(id);
  if (!r) return [];
  /* "Made with Crafting 21", or no level at 1: [the row without a level, the row with one] */
  const leveled = (ids, skill) => (r.at[skill] > 1 ? t(ids[1], { skill: skillName(skill), level: r.at[skill] }) : t(ids[0], { skill: skillName(skill) }));
  const work = (skill) => ({ kind: 'work', skill, row: r.row[skill] || null });
  /** @type {ItemPlace[]} */ const out = [...new Set(r.from)].map((s) => (s === 'farming' ? { words: leveled(['item.grown_with', 'item.grown_with_level'], s), place: { kind: 'farm' } }
    : { words: leveled(['item.gathered_with', 'item.gathered_with_level'], s), place: work(s) }))
    .concat([...new Set(r.made)].map((s) => ({ words: leveled(['item.made_with', 'item.made_with_level'], s), place: work(s) })));
  if (r.shop) out.push({ words: t('item.sold_at_shop'), place: { kind: 'shop', item: id } });
  const easy = r.shop || Object.values(r.at).some((lv) => lv <= 1);
  const drop = !easy && r.drops.length ? dropWhereWords(id) : '';
  const hunt = drop ? dropHuntOf(id) : null;
  if (drop) out.push({ words: drop, place: hunt ? { kind: 'hunt', hunt } : null });
  return out;
}

/**
 * WHAT SPENDS IT, by place, for the bag's picked line to link (Tyler 2026-11-08: "there should be a direct line to click"):
 * [{ words, place }]: each skill whose recipes take it ("Used in Crafting", its lowest such row), the House, Tempering, the Farm
 * for a seed. From the same rows as usesOf.
 * @returns {ItemPlace[]}
 */
export function usePlaces(id) {
  const r = index().get(id);
  /** @type {ItemPlace[]} */ const out = [];
  const bySkill = new Map();
  for (const [skill, , , recipe, req] of (r && r.inputOf) || []) {
    const had = bySkill.get(skill);
    if (!had || req < had.req) bySkill.set(skill, { recipe, req });
  }
  for (const [skill, b] of bySkill) out.push({ words: t('item.way_used_in', { place: skillName(skill) }), place: { kind: 'work', skill, row: b.recipe } });
  if (houseSpends(id)) out.push({ words: t('item.way_used_in', { place: t('item.place_house') }), place: { kind: 'house' } });
  if (temperSpends(id)) out.push({ words: t('item.way_used_in', { place: t('item.place_tempering') }), place: { kind: 'temper' } });
  if ((ITEMS[id] || {}).seed) out.push({ words: t('item.plant_it'), place: { kind: 'farm' } });
  return out;
}

/** Only a hunt gets it: a creature drops it, and no bench, node, crop or shop tab does. */
export function huntedOnly(id) {
  const r = index().get(id);
  return !!r && r.drops.length > 0 && !r.made.length && !r.from.length && !r.shop;
}

/** A tool's one job, in numbers from its row (the engine's own: core/tools.js): "Woodcutting 10% faster, 4% more XP, 4% extra yield". */
export function toolEffect(id) {
  const it = ITEMS[id];
  if (!it || it.type !== 'tool') return '';
  const pc = (v) => Math.round(v * 100) + '%';
  return t('item.tool_effect', { skill: skillName(it.toolSkill), speed: pc(toolSpeed(it)), xp: pc(toolXpB(it)), extra: pc(toolDouble(it)) });
}

/** What a tool does and where it must be (panel 2026-11-01: "Used for: Sell it at the shop", and no word on Storage). */
export function toolWords(id) {
  const e = toolEffect(id);
  return e ? t('item.tool_words', { effect: e }) : '';
}

/**
 * Who won't buy what the bench makes, said before it is made (panel 2026-11-01: 12,000 runes and 2,400 arrows with no buyer and no
 * word). From the row the server's bid and the market's rule read (book value, the start kit), so a repriced item says so by itself:
 * '' when both the shop and the Weighhouse take it.
 */
export function saleWords(id) {
  const it = ITEMS[id] || DRINK_ITEMS[id];
  if (!it) return '';
  if (!(Number(it.v) > 0) || it.bop) return t('item.own_use');
  return isStartKit(id) ? t('item.kit_unlisted') : '';
}

/** A sale's rare finds by name, for its confirmation ("Sell 7 stacks?" hid 3 Alpha Fang worth 1,350 of 2,054 gp, newcomer panel 2026-11-01), or ''. `lines`: { item, qty }. */
export function rareSaleWords(lines) {
  const rare = (lines || []).filter((l) => isRareItem(l.item)).map((l) => t('item.qty_item', { qty: whole(l.qty), item: itemName(l.item) }));
  const once = (lines || []).filter((l) => madeFromKit(l.item)).map((l) => t('item.kit_once', { kit: itemName(madeFromKit(l.item)), item: itemName(l.item) }));
  return [rare.length ? t('item.sells_rares', { items: listWords(rare) }) : '', ...once].filter(Boolean).join(' ');
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
    for (const [skill, b] of bySkill) out.push(t('item.used_in', { skill: skillName(skill), items: b.jobs.length ? jobListWords([...new Set(b.items)].concat(b.jobs)) : listWords(b.items) }));
  }
  const k = kindOf(id);
  if (k === 'gear') out.push(t('item.worn_in', { slot: ((EQUIP_SLOT_META[it.slot] && EQUIP_SLOT_META[it.slot].label) || it.slot).toLowerCase() }));
  if (k === 'ammo') out.push(ammoUse(id, it));
  if (k === 'food') out.push(t('item.eat_heals', { heals: it.heals }));
  if (k === 'drink') out.push(t('item.drink_restores', { mana: DRINK_ITEMS[id].mana }));
  /* A Hearth fuel (bones and the family fuels): what the Great Hearth does with it, never "sell it" (ruling 2026-10-14,
     Brannoc 10-22). Every output-less bench row is a fuel (src/data/hearth.js). */
  const rite = riteOf(id);
  if (rite) out.push(rite.recipe.req > 1 ? t('item.burn_trains_level', { skill: skillName(rite.skill), level: rite.recipe.req }) : t('item.burn_trains', { skill: skillName(rite.skill) }));
  /* A named fuel: a burst of Inner Flame, and the square's fire takes its colour for everyone */
  const named = namedFuelOf(id);
  if (named) {
    const fire = { skill: skillName('inner_flame'), flame: FLAMES[named.flame].words };
    out.push(named.req > 1 ? t('item.burn_flame_level', { ...fire, level: named.req }) : t('item.burn_flame', fire));
  }
  /* Raw food that cooks (playtest 10-22: Raw Wolf Meat read as 1 gp loot): Cook all in the bag does it. */
  const cook = cookOf(id);
  if (cook) out.push(t('item.cook_it', { skill: skillName(cook.skill), level: cook.recipe.req }));
  const tool = toolWords(id);
  if (tool) out.push(tool);
  if (it.seed) out.push(t('item.plant_it'));
  if (houseSpends(id)) out.push(t('item.house_asks'));
  if (temperSpends(id)) out.push(t('item.temper_asks'));
  /* The last word only where it is true: the shop bids on what has a book value (catalogue.js vendorPriceOf). */
  if (!out.length) out.push(Number(it.v) > 0 ? t('item.sell_it') : t('item.keep_only'));
  return out;
}

/* What fills the ammo slot does three different jobs, told apart by the skill its row asks for (a loop in the test holds every row). */
function ammoUse(id, it) {
  if (/_rune$/.test(id)) return t('item.ammo_rune');
  const per = Number(it.ammoPerShot) || 0;
  if (it.reqSkill === 'melee') return t('item.ammo_whetstone', { swings: Math.round(1 / per) });
  return per > 0 ? t('item.ammo_shot') : t('item.ammo_endless');
}

/**
 * A requirement in words, from what it names and the server's number (null: not known yet):
 * "Needs Level 30 (you're 28)", "Needs Magic 20 (you have 14)". Every piece of gear names the hero's Level
 * (gear-tiers.js LEVEL_REQ, Tyler 2026-10-24); a supply names its skill.
 */
export function needWords(req, lv, have) {
  const level = req === LEVEL_REQ;
  const known = Number.isInteger(have);
  return level ? t(known ? 'item.need_level_have' : 'item.need_level', known ? { level: lv, have } : { level: lv })
    : t(known ? 'item.need_skill_have' : 'item.need_skill', known ? { skill: skillName(req), level: lv, have } : { skill: skillName(req), level: lv });
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
