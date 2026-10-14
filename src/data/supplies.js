// ════════════════════════════════════════════════════════════════════════
// src/data/supplies.js — WHAT A HUNT BAG MAY HOLD (Hunt Sessions, ruling
// HR-2026-10-14 §2 "Supplies: a loaded bag"; Game Designer, lane D)
//
// A supply is a crafted item the hunt spends: a HEAL (healing food, fired by
// the action bar), a BUFF (a feast or draught whose buff pays in a fight) or
// AMMO (arrows, runes, whetstones, spent per swing by src/core/ammo.js).
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
// tests/supplies-catalogue.mjs proves: every row exists, is crafted or sold
// (a recipe or a shop offer), has the kind its item says, and the list is
// complete — a new cooked food or arrow that is not classified here goes red.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS, foodClassOf } from './items.js?v=578';

export const SUPPLY_KINDS = Object.freeze(['heal', 'buff', 'ammo']);

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
  // buff — feasts and draughts whose buff pays in a fight
  [B, 'tomato_soup', false], [B, 'vegetable_stew', false], [B, 'bear_claw_pie', false],
  [B, 'pumpkin_pie', false], [B, 'fishers_pie', false], [B, 'hunters_feast', false],
  [B, 'ember_tart', false], [B, 'dragon_stew', false], [B, 'lich_soul_soup', false],
  [B, 'moonbloom_elixir', false], [B, 'void_banquet', false],
  // ammo — arrows (Crafting), runes (Runecrafting), whetstones (Stonemason)
  [A, 'bronze_arrows', true], [A, 'iron_arrows', true], [A, 'barbed_arrows', true],
  [A, 'steel_arrows', true], [A, 'mithril_arrows', true], [A, 'rune_arrows', true],
  [A, 'emberhead_arrows', true], [A, 'dawnpoint_arrows', true],
  [A, 'air_rune', true], [A, 'earth_rune', true], [A, 'water_rune', true], [A, 'fire_rune', true],
  [A, 'chaos_rune', true], [A, 'death_rune', true], [A, 'blood_rune', true],
  [A, 'coarse_whetstone', false], [A, 'copper_whetstone', false], [A, 'iron_whetstone', false],
  [A, 'steel_whetstone', false], [A, 'mithril_whetstone', false], [A, 'rune_whetstone', false],
  [A, 'dawn_whetstone', false],
]);

/** The kind an item IS, from its own data: what the guard compares rows to. */
export function supplyKindOf(item) {
  if (!item || typeof item !== 'object' || item.raw) return null;
  if (item.slot === 'ammo') return A;
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

/* ── THE SENSIBLE BAG ─────────────────────────────────────────────────────
   The bag a hunt suggests, sized to last about BAG_TARGET_HOURS for a
   character at the hunt's entry level. The ruling's band is 2–6 h; 3 h sits
   low in it on purpose, so a first bag is cheap to cook and a full night is
   a choice. Ammo is not sized here: src/core/ammo.js hoursOfSupply already
   turns hours into a stack for the equipped weapon.

   MEASURED 2026-10-14, the real engine (tick-probe oneSpan over 2 h, 4 seeds,
   eat at HP ≤ 50%), heals eaten per hour:
     hunt / tier        character                      heal           per h  bag  lasts
     Mill Cellar        brand new, Bronze Sword        Cooked Shrimp   46.5  120  2.6 h
                        level 5, no armour             Cooked Shrimp   35.4  120  3.4 h
     Goblin Warren      brand new / level 5            Cooked Shrimp   47.3 / 36.1  120  2.5 / 3.3 h
     Bramble Edge       brand new / level 5            Cooked Shrimp   72.6 / 56.1  150  2.1 / 2.7 h
     Ridge Camp         level 15, iron, melee/ranged   Cooked Trout    12.3 / 12.5   40  3.2 h
     tier 2 (Wolf)      level 15, iron                 Cooked Trout    10.6   30  2.8 h
     tier 3 (Dire Wolf) level 30, steel                Cooked Lobster  14.1   40  2.8 h
     tier 4 (Bear)      level 45, mithril              Swordfish Steak 19.4   60  3.1 h
     tier 5 (Panther)   level 60, rune                 Swordfish Steak 28.9   90  3.1 h
     tier 6 (Ancient Bear) level 75, ember             Cooked Shark    35.9  110  3.1 h
   A character above the band eats far less (level 10 in bronze armour at
   the Mill Cellar: 5.5 an hour), which is the reward for gearing up. */
export const BAG_TARGET_HOURS = 3;

export const BAG_GUIDE_BY_HUNT = Object.freeze({
  mill_cellar: Object.freeze({ heal: 'cooked_shrimp', qty: 120 }),
  goblin_warren: Object.freeze({ heal: 'cooked_shrimp', qty: 120 }),
  bramble_edge: Object.freeze({ heal: 'cooked_shrimp', qty: 150 }),
  ridge_camp: Object.freeze({ heal: 'cooked_trout', qty: 40 }),
});

/* A single-monster fight is guided by the monster's tier. */
export const BAG_GUIDE_BY_TIER = Object.freeze({
  1: Object.freeze({ heal: 'cooked_shrimp', qty: 120 }),
  2: Object.freeze({ heal: 'cooked_trout', qty: 30 }),
  3: Object.freeze({ heal: 'cooked_lobster', qty: 40 }),
  4: Object.freeze({ heal: 'cooked_swordfish', qty: 60 }),
  5: Object.freeze({ heal: 'cooked_swordfish', qty: 90 }),
  6: Object.freeze({ heal: 'cooked_shark', qty: 110 }),
});

/** The suggested heal line for a hunt id, or for a training fight's monster tier. */
export function bagGuideFor(huntId, monsterTier) {
  if (Object.prototype.hasOwnProperty.call(BAG_GUIDE_BY_HUNT, huntId)) return BAG_GUIDE_BY_HUNT[huntId];
  return BAG_GUIDE_BY_TIER[monsterTier] || BAG_GUIDE_BY_TIER[1];
}
