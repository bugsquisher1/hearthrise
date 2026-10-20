// ════════════════════════════════════════════════════════════════════════
// src/data/supplies.js — WHAT A HUNT BAG MAY HOLD (Hunt Sessions, ruling
// HR-2026-10-14 §2 "Supplies: a loaded bag"; Game Designer, lane D)
//
// A packed supply is an item the hunt spends: a HEAL (food, fired by the
// action bar), MANA (a drink, fired by the action bar), AMMO (arrows, runes,
// whetstones, spent per swing by src/core/ammo.js) or a BUFF (a feast; PARKED,
// Tyler 2026-10-14: kept as data, left out of suggested bags and the default
// action bar until buffs are deepened).
//
// TWO WAYS TO SUPPLY A HUNT (Tyler, 2026-10-14). The CRAFTED items below are
// made by a skill and packed in the bag. The shop's BASIC supplies are not
// items at all: an action-bar slot fires one and the server charges gold per
// use (src/data/supply-basics.js). Crafted is better and much cheaper per
// point; basic is the floor that never runs out while there is gold.
//
// NO NEW NUMBERS. A row names the item, its kind and whether running out of it
// ends the hunt. How much it heals and which buff it gives are read from
// src/data/items.js at load, so retuning a food is still one edit there.
//
// WHAT IS LEFT OUT, ON PURPOSE
//   · Raw food (Raw Shrimp, Turnip, Potato…). Cooking it is the verb the bag
//     exists to reward, and a raw fish heals less than half its cooked form.
//   · Feasts whose buff pays nothing in a fight (gather speed, farm yield).
//     Packing one would be a silent waste; IDLE_BUFF_TYPES names them.
//
// tests/supplies-catalogue.mjs proves: every row exists, is crafted or sold,
// has the kind its item says, and the list is complete — a new cooked food or
// arrow that is not classified here goes red.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS, foodClassOf } from './items.js?v=0.2.11';

export const SUPPLY_KINDS = Object.freeze(['heal', 'mana', 'ammo', 'buff']);

/* Buff types that pay in a fight, and the ones that do not. Together they
   must cover every type in src/core/buffs.js BUFFS_DEF (the guard checks), so
   a new buff type has to be sorted into one list before it ships. */
export const COMBAT_BUFF_TYPES = Object.freeze(['damage', 'defense', 'combat_xp', 'all_xp', 'drop_rate', 'gold_find', 'damage_crit']);
export const IDLE_BUFF_TYPES = Object.freeze(['gather_speed', 'farm_yield']);

/* ESSENTIAL: when every essential line of one kind is empty, the hunt ends.
   Heals are essential. Arrows and runes are essential because a bow or staff
   with nothing loaded fights at a quarter of its max hit. Whetstones are NOT:
   a sword works unsharpened (src/core/ammo.js R5), so running out of stones
   should cost the edge, not the hunt. Buffs are never essential. */
const H = 'heal';
const M = 'mana';
const B = 'buff';
const A = 'ammo';
export const SUPPLY_ROWS = Object.freeze([
  // heal — healing food, cheapest first is decided by HEAL_ORDER below
  [H, 'cooked_shrimp', true], [H, 'turnip_mash', true], [H, 'cooked_herring', true],
  [H, 'cooked_wolf_meat', true], [H, 'cooked_trout', true], [H, 'cooked_panther_meat', true],
  [H, 'cooked_pikeperch', true], [H, 'cooked_copper_crab', true], [H, 'wheat_bread', true],
  [H, 'cooked_silverfin', true], [H, 'baked_potato', true], [H, 'cooked_goldgill', true],
  [H, 'cooked_lobster', true], [H, 'cooked_bear_meat', true], [H, 'cooked_swordfish', true],
  [H, 'river_chowder', true], [H, 'cooked_shark', true], [H, 'cooked_frostfin', true],
  [H, 'cooked_moonfish', true],
  // buff — PARKED: feasts and draughts whose buff pays in a fight
  [B, 'tomato_soup', false], [B, 'vegetable_stew', false], [B, 'bear_claw_pie', false],
  [B, 'pumpkin_pie', false], [B, 'fishers_pie', false], [B, 'hunters_feast', false],
  [B, 'ember_tart', false], [B, 'dragon_stew', false], [B, 'lich_soul_soup', false],
  [B, 'moonbloom_elixir', false], [B, 'void_banquet', false],
  // ammo — arrows (Crafting), runes (Runecrafting), whetstones (Stonemason)
  [A, 'bronze_arrows', true], [A, 'iron_arrows', true], [A, 'barbed_arrows', true], [A, 'iron_bolts', true],
  [A, 'steel_arrows', true], [A, 'mithril_arrows', true], [A, 'rune_arrows', true],
  [A, 'emberhead_arrows', true], [A, 'dawnpoint_arrows', true],
  [A, 'air_rune', true], [A, 'earth_rune', true], [A, 'water_rune', true], [A, 'fire_rune', true],
  [A, 'chaos_rune', true], [A, 'death_rune', true], [A, 'blood_rune', true],
  [A, 'coarse_whetstone', false], [A, 'copper_whetstone', false], [A, 'iron_whetstone', false],
  [A, 'steel_whetstone', false], [A, 'mithril_whetstone', false], [A, 'rune_whetstone', false],
  [A, 'dawn_whetstone', false],
  // mana — the six drinks (src/data/drinks.js). Not essential: with no mana a mage
  // loses spells, not the hunt, and the shop drink is the fallback.
  [M, 'turnip_juice', false], [M, 'carrot_juice', false], [M, 'tomato_juice', false],
  [M, 'pumpkin_cider', false], [M, 'goldenroot_tea', false], [M, 'emberfruit_cordial', false],
]);

/* Staged mana rows: none since lane S2 (2026-10-18) moved the six drinks into SUPPLY_ROWS. */
export const MANA_SUPPLY_ROWS = Object.freeze([]);

/** The kind an item IS, from its own data: what the guard compares rows to. */
export function supplyKindOf(item) {
  if (!item || typeof item !== 'object' || item.raw) return null;
  if (item.slot === 'ammo') return A;
  if (Number(item.mana) > 0) return M;
  const cls = foodClassOf(item);
  if (cls === 'healing') return H;
  if (cls === 'buff' && item.buff && COMBAT_BUFF_TYPES.includes(item.buff.type)) return B;
  return null;
}

/** id -> { id, kind, essential, heals, buff }. Null prototype; values from ITEMS. */
export const SUPPLIES = Object.freeze(SUPPLY_ROWS.reduce((acc, [kind, id, essential]) => {
  const it = ITEMS[id] || {};
  acc[id] = Object.freeze({
    id, kind, essential,
    heals: kind === H ? Number(it.heals) || 0 : 0,
    buff: kind === B && it.buff ? Object.freeze({ ...it.buff }) : null,
  });
  return acc;
}, Object.create(null)));

/* What the default action bar's "cheapest heal" eats first: lowest book value,
   then the smaller heal, then the id, so the order never depends on the bag. */
export const HEAL_ORDER = Object.freeze(SUPPLY_ROWS.filter((r) => r[0] === H).map((r) => r[1])
  .sort((a, b) => ((ITEMS[a].v - ITEMS[b].v) || (ITEMS[a].heals - ITEMS[b].heals) || (a < b ? -1 : 1))));

/* ── WHAT A HUNT COSTS AND PAYS, AND THE BAG IT SUGGESTS ──────────────────
   PRICING RULE (Tyler, 2026-10-14): at a hunt's entry level, gold plus common
   drops (vendor value) about pays for supplies bought per use at the shop;
   crafted supplies tip it positive; rare drops are the profit.
   MEASURED 2026-10-14, the real engine (tick-probe oneSpan, 2 h x 4 seeds,
   eat at HP <= 50%), gold per hour. income = gold + common drops (chance
   >= 5%, not lucky); basic = shop heals (and shop shots) per use; crafted =
   packed Cooked Shrimp / Cooked Trout (and crafted shots) at book value:
     hunt (entry)          style   heals/h b/c   basic  crafted  income  bal basic  bal crafted  rare
     Mill Cellar (lv 5)    melee   41.9 / 35.4    3769     637    3371      -398       +2734     123
                           ranged  60.9 / 48.9    5479     880    5602      +123       +4722
                           magic   55.3 / 44.9    4973     808    4391      -582*      +3583*
     Bramble Edge (lv 5)   melee   69.0 / 56.1    6210    1010    6390      +180       +5380      57
                           ranged  99.0 / 77.5    8910    1395   12511     +3601      +11116
                           magic   92.9 / 73.8    8359    1328    8734      +375*      +7406*
     Goblin Warren (lv 5)  melee   43.8 / 36.1    3938     650    4479      +541       +3829     818
                           ranged  85.5 / 68.3    7695    1229    5700     -1995       +4471
                           magic   73.9 / 59.3    6649    1067    4672     -1977*      +3605*
     Ridge Camp (lv 15)    melee   15.5 / 12.3    2480     674    5383     +2903       +4709     751
                           ranged  16.1 / 12.5    5990    2393    7124     +1134       +4731
                           magic   35.9 / 27.3    8598    2928    8151      -447*      +5223*
   ranged/magic at Ridge Camp include 1,705 / 1,429 shots an hour (shop 2 g,
   crafted 1 g). * before drinks: there is no mana engine to measure yet.
   One heal price serves every style and all three tier-1 hunts, so it is set
   on the melee reference (15 g a heal point). Ridge Camp pays about 35 g per
   point of damage taken against 13-17 g at the tier-1 hunts; its break-even
   shop heal would cost 35 g a point, which a player would dodge by firing the
   tier-1 shop heal instead, so no price closes it: its gold and drops are the
   lever. Crafted Balance is at book value; the market prices cooked food up.

   THE CRAFTED BAG. Sized to last about BAG_TARGET_HOURS for a character at
   the hunt's entry level, per style. A mage's drink count is a DESIGN TARGET
   for the mana engine to meet (an entry mage drinks about one drink for every
   two heals), not a measurement. Free tier-1 ammo is not counted; tier-2 ammo
   is sized from the shots per hour above. */
export const BAG_TARGET_HOURS = 3;

const melee = (heal, qty) => Object.freeze({ heal: Object.freeze({ id: heal, qty }) });
const ranged = (heal, qty, ammo, aq) => Object.freeze({ heal: Object.freeze({ id: heal, qty }), ammo: Object.freeze({ id: ammo, qty: aq }) });
const magic = (heal, qty, drink, dq, ammo, aq) => Object.freeze({
  heal: Object.freeze({ id: heal, qty }), mana: Object.freeze({ id: drink, qty: dq }), ammo: Object.freeze({ id: ammo, qty: aq }),
});

export const BAG_GUIDE_BY_HUNT = Object.freeze({
  mill_cellar: Object.freeze({ tier: 1,
    melee: melee('cooked_shrimp', 105),
    ranged: ranged('cooked_shrimp', 145, 'bronze_arrows', 0),
    magic: magic('cooked_shrimp', 135, 'turnip_juice', 65, 'air_rune', 0) }),
  bramble_edge: Object.freeze({ tier: 1,
    melee: melee('cooked_shrimp', 170),
    ranged: ranged('cooked_shrimp', 235, 'bronze_arrows', 0),
    magic: magic('cooked_shrimp', 220, 'turnip_juice', 110, 'air_rune', 0) }),
  goblin_warren: Object.freeze({ tier: 1,
    melee: melee('cooked_shrimp', 110),
    ranged: ranged('cooked_shrimp', 205, 'bronze_arrows', 0),
    magic: magic('cooked_shrimp', 180, 'turnip_juice', 90, 'air_rune', 0) }),
  ridge_camp: Object.freeze({ tier: 2,
    melee: melee('cooked_trout', 35),
    ranged: ranged('cooked_trout', 40, 'barbed_arrows', 5100),
    magic: magic('cooked_trout', 80, 'carrot_juice', 40, 'earth_rune', 4300) }),
  /* The Millrace Sewer (2026-10-18), MEASURED in the hunt core (tests/hunt-core/sewer.mjs
     --report, 3 seeds): a full party's Ranger fires about 700 bolts and its casters about
     700 Fire Runes an hour, and a party with a Healer eats almost nothing; a solo Melee
     hero eats about 250 heals an hour. Three hours, rounded. Iron Bolts need Ranged 15;
     below that the free Bronze Arrows stand in. */
  millrace_sewer: Object.freeze({ tier: 1,
    melee: melee('cooked_shrimp', 150),
    ranged: ranged('cooked_shrimp', 150, 'iron_bolts', 2100),
    magic: magic('cooked_shrimp', 120, 'turnip_juice', 90, 'fire_rune', 1500) }),
  /* The Meadowbrook Thicket (2026-10-18), PLAYED once on the real settle (tests/hunt-core/forest-cave.mjs
     --play): a solo melee hero at the floor ate about 1,460 g of store heals in 30 minutes, which is about
     180 shrimp over three hours at the kit's heal; the wolves' raw meat cooks back into the same bag. */
  meadowbrook_thicket: Object.freeze({ tier: 1,
    melee: melee('cooked_shrimp', 180),
    ranged: ranged('cooked_shrimp', 200, 'bronze_arrows', 0),
    magic: magic('cooked_shrimp', 180, 'turnip_juice', 90, 'air_rune', 0) }),
  /* The Coppercap Warrens (2026-10-18): its goblins are tiers 3-5, so the bag is the tier-4 guide's food;
     the played four-hero party (combat 40) ate little because the Healer carried it. UNVERIFIED for a pair. */
  coppercap_warrens: Object.freeze({ tier: 4,
    melee: melee('cooked_swordfish', 60),
    ranged: ranged('cooked_swordfish', 60, 'barbed_arrows', 5100),
    magic: magic('cooked_swordfish', 80, 'carrot_juice', 40, 'earth_rune', 4300) }),
});

/* A single-monster fight is guided by its monster's tier (melee measured:
   heals an hour at entry level, tier 2 Wolf lv 15 10.6, tier 3 Dire Wolf lv 30
   14.1, tier 4 Bear lv 45 19.4, tier 5 Panther lv 60 28.9, tier 6 Ancient Bear
   lv 75 35.9). */
export const BAG_GUIDE_BY_TIER = Object.freeze({
  1: Object.freeze({ tier: 1, melee: melee('cooked_shrimp', 105) }),
  2: Object.freeze({ tier: 2, melee: melee('cooked_trout', 30) }),
  3: Object.freeze({ tier: 3, melee: melee('cooked_lobster', 40) }),
  4: Object.freeze({ tier: 4, melee: melee('cooked_swordfish', 60) }),
  5: Object.freeze({ tier: 5, melee: melee('cooked_swordfish', 85) }),
  6: Object.freeze({ tier: 6, melee: melee('cooked_shark', 110) }),
});

/** The guide for a hunt id, or for a training fight's monster tier. */
export function bagGuideFor(huntId, monsterTier) {
  if (Object.prototype.hasOwnProperty.call(BAG_GUIDE_BY_HUNT, huntId)) return BAG_GUIDE_BY_HUNT[huntId];
  return BAG_GUIDE_BY_TIER[monsterTier] || BAG_GUIDE_BY_TIER[1];
}
