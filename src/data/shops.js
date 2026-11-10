// ════════════════════════════════════════════════════════════════════════
// Hearthrise — THE PRICE CATALOGUE (HAND-AUTHORED since lane S2, 2026-10-18: gen-shops.mjs + legacy.js are gone; the `supply.*` rows spread in from supply-basics.js SUPPLY_SHOP_OFFERS, the source hr_shop_supply_offers is generated from)
//
//   catalogue digest: 3dd62b831e08bf6b8180fdfa08e203c68eea083199dfdb44a4082ccd36552e07
//   89 offers · 187 cost lines
//
// EXTRACTED FROM
//   room              40  src/legacy.js
//   seed               3  src/legacy.js (9 seed rows moved to the seed counter, 2026-10-22; the Air Rune row left
//                         with the old rune ladder, 2026-10-23)
//   equip              8  src/legacy.js (5 rows moved to the outfitter, 2026-10-22)
//   property           5  src/features/homestead.js
//   character_slot     3  src/multi-character.js (an account starts with slot 0 only and buys 1-3, Tyler 2026-11-09;
//                         slot 4, the fifth hero, is no longer sold: four heroes an account, Tyler 2026-11-07)
//   companion          4  src/data/companions.js
//   (the four `plot` buildings and the six `worker` hires were cut 2026-11-07, lane/c-dead-plot-deed: the engine
//    refused every one and nothing read what they granted; tests/catalogue-coherence.mjs C14 keeps them out)
//
// THE LINE SHAPE — both sides of every offer
//   { kind, id, amount }
//     kind    'currency' | 'item' | 'money'   (cost side)
//             'currency' | 'item' | 'unlock' | 'capacity'  (grant side)
//             — kind names WHICH SERVER TABLE a payment debits. It is not
//               decoration: `hearth_token` is both an hr_items row and a
//               player_state column, so {currency:'hearth_token'} would be
//               ambiguous in the one currency that may never be minted.
//     amount  a non-negative safe integer in the smallest unit.
//             money is in CENTS ('$6.99' → 699).
//
//   The RPC this becomes: hr_shop_buy(p_offer_id, p_intent_id, p_version) →
//   debit every cost line, credit every grant line, one transaction. The
//   client sends an OFFER ID and never a price.
//
// PRICES THAT ARE FORMULAS are not in this file: src/data/formulas/registry.js (what the shop pays is `sale.price`). A consumer that
//   cannot find an offer id must REFUSE, never default: a server that invents a price is worse than a server that has none.
//
// CURRENCIES AND WHERE THEY LIVE SERVER-SIDE
//   gold           player_state.gold
//   gems           account_wallet.gems            (one per ACCOUNT)
//   hearth_tokens  account_wallet.hearth_tokens   (one per ACCOUNT; IAP-only; never PvE-minted)
//   usd            the platform store, never hr_apply
// ════════════════════════════════════════════════════════════════════════

import { SUPPLY_SHOP_OFFERS, SHOP_SOLD_KINDS } from './supply-basics.js?v=0.2.114';
import { ITEMS } from './items.js?v=0.2.114';

export const SHOPS_DIGEST = "3dd62b831e08bf6b8180fdfa08e203c68eea083199dfdb44a4082ccd36552e07";

function supplyOffer(s) {
  return { id: s.offer, table: "supply", name: ITEMS[s.item].n, cost: [{ kind: "currency", id: "gold", amount: s.price }],
    grant: [{ kind: "item", id: s.item, amount: 1 }], repeatable: true };
}

/** Every offer whose price is data. shop_buy sells only what a Shop tab lists (supply-basics.js SHOP_SOLD_KINDS; the rest
    is refused not_listed, catalogue.js offerRefusal): the legacy equip.* and seed.* rows are a vendor price list only. */
export const SHOP_OFFERS = [
  /* THE HERO-SLOT LADDER (Tyler 2026-11-09, "like a week to afford the first alt"; the designer's prices, PRIORITY_BOARD
     "2026-11-09 Death share and alt price"): an account starts with ONE slot, the second costs about a week of one daily
     login's hunting. The server charges public.hr_hero_slots (2027-03-25-hero-slots-one.sql), bound to these rows by
     tests/hero-slot-buy.mjs. */
  {
    id: "character_slot.1", table: "character_slot",
    name: "Character slot 2",
    cost: [{ kind: "currency", id: "gold", amount: 300000 }],
    grant: [{ kind: "unlock", id: "character_slot:1", amount: 1 }],
  },
  {
    id: "character_slot.2", table: "character_slot",
    name: "Character slot 3",
    cost: [{ kind: "currency", id: "gold", amount: 750000 }],
    grant: [{ kind: "unlock", id: "character_slot:2", amount: 1 }],
  },
  {
    id: "character_slot.3", table: "character_slot",
    name: "Character slot 4",
    cost: [{ kind: "currency", id: "gold", amount: 1500000 }],
    grant: [{ kind: "unlock", id: "character_slot:3", amount: 1 }],
  },
  {
    id: "companion.honeybee", table: "companion",
    name: "Honeybee",
    cost: [{ kind: "currency", id: "gold", amount: 8000 }],
    grant: [{ kind: "unlock", id: "companion:honeybee", amount: 1 }],
    reqSkill: "cooking", reqLv: 25,
  },
  {
    id: "companion.owl", table: "companion",
    name: "Owl",
    cost: [{ kind: "currency", id: "gold", amount: 8000 }],
    grant: [{ kind: "unlock", id: "companion:owl", amount: 1 }],
    reqSkill: "inner_flame", reqLv: 50,
  },
  {
    id: "companion.raccoon", table: "companion",
    name: "Raccoon",
    cost: [{ kind: "currency", id: "gold", amount: 25000 }],
    grant: [{ kind: "unlock", id: "companion:raccoon", amount: 1 }],
  },
  {
    id: "companion.sparrow", table: "companion",
    name: "Sparrow",
    cost: [{ kind: "currency", id: "gold", amount: 5000 }],
    grant: [{ kind: "unlock", id: "companion:sparrow", amount: 1 }],
  },
  {
    id: "equip.apprentice_staff", table: "equip",
    name: "Apprentice Staff",
    cost: [{ kind: "currency", id: "gold", amount: 120 }],
    grant: [{ kind: "item", id: "apprentice_staff", amount: 1 }],
    repeatable: true,
  },
  {
    id: "equip.apprentice_wand", table: "equip",
    name: "Apprentice Wand",
    cost: [{ kind: "currency", id: "gold", amount: 100 }],
    grant: [{ kind: "item", id: "apprentice_wand", amount: 1 }],
    repeatable: true,
  },
  {
    id: "equip.apprentice_primer", table: "equip",
    name: "Apprentice Primer",
    cost: [{ kind: "currency", id: "gold", amount: 90 }],
    grant: [{ kind: "item", id: "apprentice_primer", amount: 1 }],
    repeatable: true,
  },
  {
    id: "equip.bronze_sword", table: "equip",
    name: "Bronze Sword",
    cost: [{ kind: "currency", id: "gold", amount: 100 }],
    grant: [{ kind: "item", id: "bronze_sword", amount: 1 }],
    repeatable: true,
  },
  {
    id: "equip.leather_boots", table: "equip",
    name: "Leather Boots",
    cost: [{ kind: "currency", id: "gold", amount: 250 }],
    grant: [{ kind: "item", id: "leather_boots", amount: 1 }],
    repeatable: true,
  },
  {
    id: "equip.shortbow", table: "equip",
    name: "Shortbow",
    cost: [{ kind: "currency", id: "gold", amount: 120 }],
    grant: [{ kind: "item", id: "shortbow", amount: 1 }],
    repeatable: true,
  },
  {
    id: "equip.stone_maul", table: "equip",
    name: "Stone Maul",
    cost: [{ kind: "currency", id: "gold", amount: 140 }],
    grant: [{ kind: "item", id: "stone_maul", amount: 1 }],
    repeatable: true,
  },
  {
    id: "property.castle", table: "property",
    name: "Hearthrise Castle",
    cost: [{ kind: "currency", id: "gold", amount: 150000 }, { kind: "item", id: "dragon_scale", amount: 4 }, { kind: "item", id: "keystone", amount: 6 }, { kind: "item", id: "mithril_bar", amount: 40 }, { kind: "item", id: "rune_bar", amount: 8 }, { kind: "item", id: "yew_plank", amount: 70 }],
    grant: [{ kind: "unlock", id: "property:castle", amount: 5 }],
  },
  {
    id: "property.farmstead", table: "property",
    name: "Fieldworth Farmstead",
    cost: [{ kind: "currency", id: "gold", amount: 2500 }, { kind: "item", id: "cooked_shrimp", amount: 10 }, { kind: "item", id: "copper_ore", amount: 25 }, { kind: "item", id: "oak_log", amount: 40 }, { kind: "item", id: "wolf_pelt", amount: 4 }],
    grant: [{ kind: "unlock", id: "property:farmstead", amount: 2 }],
  },
  {
    id: "property.homestead", table: "property",
    name: "Hearthside Homestead",
    cost: [{ kind: "currency", id: "gold", amount: 400 }, { kind: "item", id: "copper_ore", amount: 20 }, { kind: "item", id: "normal_log", amount: 30 }],
    grant: [{ kind: "unlock", id: "property:homestead", amount: 1 }],
  },
  {
    id: "property.keep", table: "property",
    name: "Ironvale Keep",
    cost: [{ kind: "currency", id: "gold", amount: 40000 }, { kind: "item", id: "bear_pelt", amount: 5 }, { kind: "item", id: "big_bones", amount: 20 }, { kind: "item", id: "iron_fitting", amount: 12 }, { kind: "item", id: "maple_plank", amount: 50 }, { kind: "item", id: "steel_bar", amount: 35 }, { kind: "item", id: "timber_beam", amount: 12 }],
    grant: [{ kind: "unlock", id: "property:keep", amount: 4 }],
  },
  {
    id: "property.manor", table: "property",
    name: "Stonecross Manor",
    cost: [{ kind: "currency", id: "gold", amount: 10000 }, { kind: "item", id: "iron_fitting", amount: 6 }, { kind: "item", id: "iron_ore", amount: 40 }, { kind: "item", id: "silk_thread", amount: 8 }, { kind: "item", id: "timber_beam", amount: 6 }, { kind: "item", id: "willow_plank", amount: 35 }],
    grant: [{ kind: "unlock", id: "property:manor", amount: 3 }],
  },
  {
    id: "room.cellar.1", table: "room",
    name: "Cellar — Root Cellar",
    cost: [{ kind: "currency", id: "gold", amount: 1200 }, { kind: "item", id: "normal_log", amount: 60 }],
    grant: [{ kind: "unlock", id: "room:cellar", amount: 1 }],
  },
  {
    id: "room.cellar.2", table: "room",
    name: "Cellar — Stone Cellar",
    cost: [{ kind: "currency", id: "gold", amount: 4000 }, { kind: "item", id: "oak_log", amount: 60 }],
    grant: [{ kind: "unlock", id: "room:cellar", amount: 2 }],
  },
  {
    id: "room.cellar.3", table: "room",
    name: "Cellar — The Vault",
    cost: [{ kind: "currency", id: "gold", amount: 12000 }, { kind: "item", id: "willow_log", amount: 50 }],
    grant: [{ kind: "unlock", id: "room:cellar", amount: 3 }],
  },
  {
    id: "room.cellar.4", table: "room",
    name: "Cellar — The Cask Room",
    cost: [{ kind: "currency", id: "gold", amount: 70000 }, { kind: "item", id: "field_ration", amount: 20 }, { kind: "item", id: "goldenroot_roast", amount: 6 }, { kind: "item", id: "timber_beam", amount: 12 }],
    grant: [{ kind: "unlock", id: "room:cellar", amount: 4 }],
  },
  {
    id: "room.cellar.5", table: "room",
    name: "Cellar — The Deep Cellar",
    cost: [{ kind: "currency", id: "gold", amount: 320000 }, { kind: "item", id: "duskwood_plank", amount: 20 }, { kind: "item", id: "keystone", amount: 2 }, { kind: "item", id: "moonbloom_elixir", amount: 4 }],
    grant: [{ kind: "unlock", id: "room:cellar", amount: 5 }],
  },
  {
    id: "room.forge.1", table: "room",
    name: "Forge — Field Forge",
    cost: [{ kind: "currency", id: "gold", amount: 75000 }, { kind: "item", id: "iron_bar", amount: 200 }, { kind: "item", id: "iron_fitting", amount: 10 }, { kind: "item", id: "oak_plank", amount: 60 }],
    grant: [{ kind: "unlock", id: "room:forge", amount: 1 }],
  },
  {
    id: "room.forge.2", table: "room",
    name: "Forge — Stone Forge",
    cost: [{ kind: "currency", id: "gold", amount: 110000 }, { kind: "item", id: "iron_bar", amount: 300 }, { kind: "item", id: "iron_fitting", amount: 12 }, { kind: "item", id: "steel_bar", amount: 40 }],
    grant: [{ kind: "unlock", id: "room:forge", amount: 2 }],
  },
  {
    id: "room.forge.3", table: "room",
    name: "Forge — Double Bellows",
    cost: [{ kind: "currency", id: "gold", amount: 160000 }, { kind: "item", id: "iron_fitting", amount: 15 }, { kind: "item", id: "steel_bar", amount: 100 }, { kind: "item", id: "timber_beam", amount: 10 }],
    grant: [{ kind: "unlock", id: "room:forge", amount: 3 }],
  },
  {
    id: "room.forge.4", table: "room",
    name: "Forge — The Great Bellows",
    cost: [{ kind: "currency", id: "gold", amount: 240000 }, { kind: "item", id: "coal", amount: 200 }, { kind: "item", id: "iron_fitting", amount: 25 }, { kind: "item", id: "steel_bar", amount: 150 }],
    grant: [{ kind: "unlock", id: "room:forge", amount: 4 }],
  },
  {
    id: "room.forge.5", table: "room",
    name: "Forge — The Deep Forge",
    cost: [{ kind: "currency", id: "gold", amount: 480000 }, { kind: "item", id: "dragon_scale", amount: 6 }, { kind: "item", id: "keystone", amount: 2 }, { kind: "item", id: "mithril_bar", amount: 20 }],
    grant: [{ kind: "unlock", id: "room:forge", amount: 5 }],
  },
  {
    id: "room.garden.1", table: "room",
    name: "Garden — Kitchen Garden",
    cost: [{ kind: "currency", id: "gold", amount: 600 }, { kind: "item", id: "wheat", amount: 20 }],
    grant: [{ kind: "unlock", id: "room:garden", amount: 1 }],
  },
  {
    id: "room.garden.2", table: "room",
    name: "Garden — Walled Garden",
    cost: [{ kind: "currency", id: "gold", amount: 2500 }, { kind: "item", id: "wheat", amount: 60 }],
    grant: [{ kind: "unlock", id: "room:garden", amount: 2 }],
  },
  {
    id: "room.garden.3", table: "room",
    name: "Garden — The Beds",
    cost: [{ kind: "currency", id: "gold", amount: 9000 }, { kind: "item", id: "pumpkin", amount: 5 }],
    grant: [{ kind: "unlock", id: "room:garden", amount: 3 }],
  },
  {
    id: "room.garden.4", table: "room",
    name: "Garden — The Glasshouse",
    cost: [{ kind: "currency", id: "gold", amount: 60000 }, { kind: "item", id: "goldenroot", amount: 15 }, { kind: "item", id: "silk_thread", amount: 20 }, { kind: "item", id: "timber_beam", amount: 10 }],
    grant: [{ kind: "unlock", id: "room:garden", amount: 4 }],
  },
  {
    id: "room.garden.5", table: "room",
    name: "Garden — The Orchard",
    cost: [{ kind: "currency", id: "gold", amount: 300000 }, { kind: "item", id: "duskwood_plank", amount: 40 }, { kind: "item", id: "keystone", amount: 2 }, { kind: "item", id: "moonbloom", amount: 12 }],
    grant: [{ kind: "unlock", id: "room:garden", amount: 5 }],
  },
  {
    id: "room.kitchen.1", table: "room",
    name: "Kitchen — Hearthstone",
    cost: [{ kind: "currency", id: "gold", amount: 40000 }, { kind: "item", id: "cooked_trout", amount: 50 }, { kind: "item", id: "iron_bar", amount: 60 }, { kind: "item", id: "oak_plank", amount: 60 }],
    grant: [{ kind: "unlock", id: "room:kitchen", amount: 1 }],
  },
  {
    id: "room.kitchen.2", table: "room",
    name: "Kitchen — Iron Stove",
    cost: [{ kind: "currency", id: "gold", amount: 70000 }, { kind: "item", id: "cooked_lobster", amount: 50 }, { kind: "item", id: "iron_bar", amount: 100 }, { kind: "item", id: "willow_plank", amount: 60 }],
    grant: [{ kind: "unlock", id: "room:kitchen", amount: 2 }],
  },
  {
    id: "room.kitchen.3", table: "room",
    name: "Kitchen — Cast-Iron Range",
    cost: [{ kind: "currency", id: "gold", amount: 110000 }, { kind: "item", id: "steel_bar", amount: 30 }, { kind: "item", id: "wheat_bread", amount: 40 }, { kind: "item", id: "willow_plank", amount: 100 }],
    grant: [{ kind: "unlock", id: "room:kitchen", amount: 3 }],
  },
  {
    id: "room.kitchen.4", table: "room",
    name: "Kitchen — Twin Range",
    cost: [{ kind: "currency", id: "gold", amount: 180000 }, { kind: "item", id: "field_ration", amount: 25 }, { kind: "item", id: "timber_beam", amount: 20 }, { kind: "item", id: "willow_plank", amount: 100 }],
    grant: [{ kind: "unlock", id: "room:kitchen", amount: 4 }],
  },
  {
    id: "room.kitchen.5", table: "room",
    name: "Kitchen — The Great Hearth",
    cost: [{ kind: "currency", id: "gold", amount: 400000 }, { kind: "item", id: "dragon_scale", amount: 8 }, { kind: "item", id: "duskwood_plank", amount: 30 }, { kind: "item", id: "keystone", amount: 2 }],
    grant: [{ kind: "unlock", id: "room:kitchen", amount: 5 }],
  },
  {
    id: "room.library.1", table: "room",
    name: "Library — Shelf",
    cost: [{ kind: "currency", id: "gold", amount: 60000 }, { kind: "item", id: "oak_plank", amount: 80 }, { kind: "item", id: "silk_thread", amount: 15 }, { kind: "item", id: "timber_beam", amount: 8 }],
    grant: [{ kind: "unlock", id: "room:library", amount: 1 }],
  },
  {
    id: "room.library.2", table: "room",
    name: "Library — Reading Room",
    cost: [{ kind: "currency", id: "gold", amount: 90000 }, { kind: "item", id: "silk_thread", amount: 25 }, { kind: "item", id: "timber_beam", amount: 12 }, { kind: "item", id: "willow_plank", amount: 60 }],
    grant: [{ kind: "unlock", id: "room:library", amount: 2 }],
  },
  {
    id: "room.library.3", table: "room",
    name: "Library — The Library",
    cost: [{ kind: "currency", id: "gold", amount: 130000 }, { kind: "item", id: "maple_plank", amount: 60 }, { kind: "item", id: "silk_thread", amount: 30 }, { kind: "item", id: "timber_beam", amount: 15 }],
    grant: [{ kind: "unlock", id: "room:library", amount: 3 }],
  },
  {
    id: "room.library.4", table: "room",
    name: "Library — The Scriptorium",
    cost: [{ kind: "currency", id: "gold", amount: 200000 }, { kind: "item", id: "magic_essence", amount: 10 }, { kind: "item", id: "silk_thread", amount: 40 }, { kind: "item", id: "timber_beam", amount: 20 }],
    grant: [{ kind: "unlock", id: "room:library", amount: 4 }],
  },
  {
    id: "room.library.5", table: "room",
    name: "Library — The Great Library",
    cost: [{ kind: "currency", id: "gold", amount: 450000 }, { kind: "item", id: "ancient_rune", amount: 12 }, { kind: "item", id: "duskwood_plank", amount: 30 }, { kind: "item", id: "keystone", amount: 2 }],
    grant: [{ kind: "unlock", id: "room:library", amount: 5 }],
  },
  {
    id: "room.shrine.1", table: "room",
    name: "Shrine — Wayside Shrine",
    cost: [{ kind: "currency", id: "gold", amount: 900 }, { kind: "item", id: "bones", amount: 40 }],
    grant: [{ kind: "unlock", id: "room:shrine", amount: 1 }],
  },
  {
    id: "room.shrine.2", table: "room",
    name: "Shrine — Stone Altar",
    cost: [{ kind: "currency", id: "gold", amount: 3500 }, { kind: "item", id: "big_bones", amount: 25 }],
    grant: [{ kind: "unlock", id: "room:shrine", amount: 2 }],
  },
  {
    id: "room.shrine.3", table: "room",
    name: "Shrine — The Chapel",
    cost: [{ kind: "currency", id: "gold", amount: 13000 }, { kind: "item", id: "big_bones", amount: 40 }],
    grant: [{ kind: "unlock", id: "room:shrine", amount: 3 }],
  },
  {
    id: "room.shrine.4", table: "room",
    name: "Shrine — The Reliquary",
    cost: [{ kind: "currency", id: "gold", amount: 55000 }, { kind: "item", id: "big_bones", amount: 60 }, { kind: "item", id: "iron_fitting", amount: 10 }, { kind: "item", id: "magic_essence", amount: 30 }],
    grant: [{ kind: "unlock", id: "room:shrine", amount: 4 }],
  },
  {
    id: "room.shrine.5", table: "room",
    name: "Shrine — The Ossuary",
    cost: [{ kind: "currency", id: "gold", amount: 270000 }, { kind: "item", id: "dragon_bones", amount: 30 }, { kind: "item", id: "keystone", amount: 2 }, { kind: "item", id: "war_crown", amount: 4 }],
    grant: [{ kind: "unlock", id: "room:shrine", amount: 5 }],
  },
  {
    id: "room.trophy.1", table: "room",
    name: "Trophy Room — Trophy Wall",
    cost: [{ kind: "currency", id: "gold", amount: 2000 }, { kind: "item", id: "wolf_pelt", amount: 5 }],
    grant: [{ kind: "unlock", id: "room:trophy", amount: 1 }],
  },
  {
    id: "room.trophy.2", table: "room",
    name: "Trophy Room — The Hall",
    cost: [{ kind: "currency", id: "gold", amount: 8000 }, { kind: "item", id: "bear_pelt", amount: 2 }],
    grant: [{ kind: "unlock", id: "room:trophy", amount: 2 }],
  },
  {
    id: "room.trophy.3", table: "room",
    name: "Trophy Room — Hall of Heads",
    cost: [{ kind: "currency", id: "gold", amount: 25000 }, { kind: "item", id: "bear_pelt", amount: 4 }],
    grant: [{ kind: "unlock", id: "room:trophy", amount: 3 }],
  },
  {
    id: "room.trophy.4", table: "room",
    name: "Trophy Room — Hall of Banners",
    cost: [{ kind: "currency", id: "gold", amount: 60000 }, { kind: "item", id: "bear_pelt", amount: 6 }, { kind: "item", id: "iron_fitting", amount: 12 }, { kind: "item", id: "war_crown", amount: 1 }],
    grant: [{ kind: "unlock", id: "room:trophy", amount: 4 }],
  },
  {
    id: "room.trophy.5", table: "room",
    name: "Trophy Room — The Long Gallery",
    cost: [{ kind: "currency", id: "gold", amount: 290000 }, { kind: "item", id: "dragon_gem", amount: 1 }, { kind: "item", id: "dragon_scale", amount: 6 }, { kind: "item", id: "keystone", amount: 2 }],
    grant: [{ kind: "unlock", id: "room:trophy", amount: 5 }],
  },
  {
    id: "room.workshop.1", table: "room",
    name: "Workshop — Work Bench",
    cost: [{ kind: "currency", id: "gold", amount: 75000 }, { kind: "item", id: "iron_fitting", amount: 5 }, { kind: "item", id: "oak_plank", amount: 200 }, { kind: "item", id: "timber_beam", amount: 10 }],
    grant: [{ kind: "unlock", id: "room:workshop", amount: 1 }],
  },
  {
    id: "room.workshop.2", table: "room",
    name: "Workshop — Joiner's Bench",
    cost: [{ kind: "currency", id: "gold", amount: 110000 }, { kind: "item", id: "timber_beam", amount: 12 }, { kind: "item", id: "willow_plank", amount: 100 }],
    grant: [{ kind: "unlock", id: "room:workshop", amount: 2 }],
  },
  {
    id: "room.workshop.3", table: "room",
    name: "Workshop — The Sawpit",
    cost: [{ kind: "currency", id: "gold", amount: 160000 }, { kind: "item", id: "iron_fitting", amount: 10 }, { kind: "item", id: "timber_beam", amount: 20 }, { kind: "item", id: "willow_plank", amount: 200 }],
    grant: [{ kind: "unlock", id: "room:workshop", amount: 3 }],
  },
  {
    id: "room.workshop.4", table: "room",
    name: "Workshop — The Lathe",
    cost: [{ kind: "currency", id: "gold", amount: 240000 }, { kind: "item", id: "iron_fitting", amount: 25 }, { kind: "item", id: "maple_plank", amount: 100 }, { kind: "item", id: "silk_thread", amount: 30 }],
    grant: [{ kind: "unlock", id: "room:workshop", amount: 4 }],
  },
  {
    id: "room.workshop.5", table: "room",
    name: "Workshop — The Master's Shop",
    cost: [{ kind: "currency", id: "gold", amount: 480000 }, { kind: "item", id: "duskwood_plank", amount: 25 }, { kind: "item", id: "keystone", amount: 2 }, { kind: "item", id: "rune_bar", amount: 6 }],
    grant: [{ kind: "unlock", id: "room:workshop", amount: 5 }],
  },
  {
    id: "seed.bronze_arrows", table: "seed",
    name: "Bronze Arrows",
    cost: [{ kind: "currency", id: "gold", amount: 60 }],
    grant: [{ kind: "item", id: "bronze_arrows", amount: 50 }],
    repeatable: true,
  },
  {
    id: "seed.coarse_whetstone", table: "seed",
    name: "Coarse Whetstone",
    cost: [{ kind: "currency", id: "gold", amount: 60 }],
    grant: [{ kind: "item", id: "coarse_whetstone", amount: 10 }],
    repeatable: true,
  },
  {
    id: "seed.rune_blank", table: "seed",
    name: "Blank Rune",
    cost: [{ kind: "currency", id: "gold", amount: 300 }],
    grant: [{ kind: "item", id: "rune_blank", amount: 18 }],
    repeatable: true,
  },
  /* Tools, gear and seeds, never supplies (Tyler 2026-10-20; designer 2026-10-22); SUPPLY_PRICE_LIST is never sold. */
  ...SUPPLY_SHOP_OFFERS.filter((s) => SHOP_SOLD_KINDS.includes(s.kind)).map(supplyOffer),
];

export const SUPPLY_PRICE_LIST = Object.freeze(SUPPLY_SHOP_OFFERS.filter((s) => !SHOP_SOLD_KINDS.includes(s.kind)).map(supplyOffer));

/** Where each currency lives server-side. `null` = it does not, yet. */
export const SHOP_CURRENCIES = {
  "gold": {
    "server": "player_state.gold"
  },
  "gems": {
    "server": "account_wallet.gems"
  },
  "hearth_tokens": {
    "server": "account_wallet.hearth_tokens"
  },
  "usd": {
    "server": null
  }
};

/** Provenance, so drift has an address. */
export const SHOP_TABLES = [
  {
    "table": "room",
    "origin": "src/legacy.js",
    "anchor": "const ROOMS={",
    "spends_at": "legacy.js upgradeRoom()",
    "note": "rung level is the grant amount",
    "count": 40
  },
  {
    "table": "seed",
    "origin": "src/legacy.js",
    "anchor": "const SEED_SHOP=[",
    "spends_at": "legacy.js buyShopItem(id, qty, cost)",
    "note": "the price is per BUNDLE of qty, not per unit. A vendor price list only since 2026-10-22, shop_buy refuses every seed row not_listed (no Shop tab lists it). The nine crop seeds moved to the seed counter (supply-basics.js kind 'seed', designer 2026-10-22, lane/b-orphan-sources) at the same unit price. The four left (air rune, bronze arrows, coarse whetstone, blank rune) are their items' vendor price only",
    "count": 4
  },
  {
    "table": "equip",
    "origin": "src/legacy.js",
    "anchor": "const EQUIP_SHOP=[",
    "spends_at": "legacy.js buyShopItem(id, qty, cost)",
    "note": "the Bronze Belt, Copper Ring, Hunter Necklace, Leather Gloves and Traveler Cape rows moved to the outfitter (supply-basics.js, designer 2026-10-22). The eight left, like every seed row, are a vendor price list only, and shop_buy refuses them not_listed (catalogue.js offerRefusal, 2026-10-22)",
    "count": 8
  },
  {
    "table": "property",
    "origin": "src/features/homestead.js",
    "anchor": "var TIERS = [",
    "spends_at": "homestead.js upgradeTier()",
    "note": "grant amount is the tier index",
    "count": 5
  },
  {
    "table": "character_slot",
    "origin": "src/multi-character.js",
    "anchor": "const SLOT_COSTS_GOLD = [",
    "spends_at": "multi-character.js unlockSlot()",
    "count": 3
  },
  {
    "table": "companion",
    "origin": "src/data/companions.js",
    "anchor": "source:'shop:…'",
    "spends_at": "legacy.js _buyCompanion(id, price)",
    "note": "price is embedded in a string, not a field",
    "count": 4
  },
  {
    "table": "supply",
    "origin": "src/data/supply-basics.js",
    "anchor": "export const SUPPLY_SHOP_OFFERS",
    "spends_at": "hr-accrue shop_buy (the tools and the outfitter's gear; Tyler 2026-10-20: the Shop sells no supplies)",
    "note": "hand-authored rows (lane S2, the outfitter, designer 2026-10-22). The server's hr_shop_supply_offers is generated from them. Food, drink and ammo are SUPPLY_PRICE_LIST, never offers",
    "count": SUPPLY_SHOP_OFFERS.filter((s) => SHOP_SOLD_KINDS.includes(s.kind)).length
  }
];

