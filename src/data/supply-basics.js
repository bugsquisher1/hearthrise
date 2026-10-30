// ════════════════════════════════════════════════════════════════════════
// src/data/supply-basics.js — THE SHOP'S BASIC SUPPLIES, PAID PER USE
// (Tyler, 2026-10-14: "NPC basic supplies are gold-per-use, exactly like
// Huntera"; "runecrafting should be a better version of the rune you can
// purchase from the NPC"; Game Designer, lane D)
//
// A basic supply is NOT an item. Nothing is bought or packed: an action-bar
// slot names it, the slot shows its price, and the server charges that gold
// each time the rule fires. When the gold runs out the slot cannot fire. It is
// the floor that means nobody is ever unable to hunt.
//
// The CRAFTED version of the same line is an item the player makes and packs,
// and it is better: it heals or restores more per use (a basic gives three
// quarters), and it costs far less per point at book value, because the
// player spent time raising Cooking, Farming, Crafting or Runecrafting.
// Ammo: a basic ARROW gives BASIC_EFFECT_SHARE (three quarters) of its crafted
// partner's ammo bonus (Combat Design Bible v1.4: "Runecrafting = a better
// rune", basic strength below crafted; applied per shot in combat.js
// playerCombatRolls `ammoShare`) and costs at least BASIC_AMMO_PREMIUM x its
// partner's book value per shot. A basic RUNE is the store's version of a rune an ability
// spends (designer 2026-10-21: Plain Fire Rune, 8 g a cast, 2x the Fire Rune's
// book; Tyler 10-15 "runes and ammo: carried first, then the store" replaces
// the K10 no-basic-runes rule). The free tier-1 rungs (Bronze Arrows, Air Rune,
// Coarse Whetstone) stay ordinary packed items.
//
// THE PLAYER PICKS THE ITEM (Tyler 2026-10-21, designer-confirmed): a bar slot
// names ONE item. A store food or drink below is an item a slot can name, bought
// per use; a crafted one comes from the hero's own stock only. The player builds
// the fallback by slot order (Cooked Trout, then Salted Trout). A rune spell buys
// its store rune only when its slot names it. The game never picks: there are no
// per-hunt-tier store rows (the old `tiers` column is gone).
//
// PRICES (designer 2026-10-18, the economy rule: gold + common drops pay the
// supplies). A basic heal costs just above its cooked partner's book value a
// point (2.3 g at tier 1 to 21 g at tier 6; B1 is the floor). Was 15-24 g a
// point: a solo Melee in the Millrace Sewer bought 240 heals an hour, 21,600 g
// (tests/hunt-core/sewer.mjs --report), now 3,360 g.
//
// DRINKS ARE PRICED FOR THE ABILITY BAR (designer, 2026-10-17, measured on the
// S1 instance engine). A drink is not a danger cost like food: every hero's bar
// spends mana all hunt, so the store sells it at about 1.2-1.4x the crafted
// drink's book value a point (1.0 g at tier 1 rising to 3.5 g at tier 6; B1 and
// B3 hold). Measured, a fresh melee hero (Bronze Sword, 0 gold, the kit's 20
// cooked shrimp, mill_cellar fixture, 1 h): it drinks 101 Thin Turnip Juice an
// hour against 691 g of coins and 793 g of common drops. At the old 90 g (15 g a
// point, the heal's rate) that was 9,090 g an hour and the hunt ended gold_out
// at 1:54; at 6 g it is 606 g an hour and the hunt runs the full hour.
//
// The server catalogue (lane C) is generated from BASIC_SUPPLIES; the client
// shows `price` on the slot. tests/supplies-catalogue.mjs proves every rule
// above. ART: one 32x32 pixel icon per row under assets/icons-bundle/pixel/supplies/<id>.png
// (SUPPLY_DIR in item-art.js; tests/pixel-icons.mjs requires them).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { RUNE_TIERS, runeId } from './runes.js?v=0.2.69';
import { CRAFTED_RUNE_FAMILIES } from './stonecraft.js?v=0.2.69';

/* A basic heal or drink gives this share of its crafted partner (floored); a
   basic arrow gives this share of its partner's ammo bonus. */
export const BASIC_EFFECT_SHARE = 0.75;

/* A basic shot costs at least this many times its partner's book value. ONE (designer 2026-10-23, the spell-release
   balance, PROVISIONAL; was 2): a store shot is 1 g at tiers 1-3, then mithril 4, rune 6, emberhead 9, dawnpoint 12,
   each its partner's book. At 2 g a shot a store-fed Ranger spent 90-180% of its coin share on shots (a crossbow and a
   shield on store Iron Bolts: +13% at the Sewer L20 party, -30% at the Sewer and Warrens floors); at 1 g the shots are
   48% of coin at the Sewer L20 party and 59% at the Warrens L50 (the designer's ~45-55%), +32% / +39% at the floors
   (tests/hunt-core/drop-tables.mjs ranger-floor holds the floors at +25%). The
   crafted arrow stays the better shot (its whole bonus, the store's is BASIC_EFFECT_SHARE of it). */
export const BASIC_AMMO_PREMIUM = 1;

const heal = (id, n, partner, heals, price) => Object.freeze({ id, kind: 'heal', n, partner, heals, price });
const mana = (id, n, partner, restores, price) => Object.freeze({ id, kind: 'mana', n, partner, mana: restores, price });
const shot = (id, n, partner, price) => Object.freeze({ id, kind: 'ammo', n, partner, price });

/* id -> row. `price` is gold per use (per shot for ammo, per cast for a rune). */
export const BASIC_SUPPLIES = Object.freeze([
  heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 72, 14),
  heal('salted_trout', 'Salted Trout', 'cooked_trout', 120, 40),
  heal('salted_lobster', 'Salted Lobster', 'cooked_lobster', 216, 180),
  heal('salted_swordfish', 'Salted Swordfish', 'cooked_swordfish', 288, 432),
  heal('salted_shark', 'Salted Shark', 'cooked_shark', 396, 693),
  mana('thin_turnip_juice', 'Thin Turnip Juice', 'turnip_juice', 72, 10),
  mana('thin_carrot_juice', 'Thin Carrot Juice', 'carrot_juice', 120, 18),
  mana('thin_tomato_juice', 'Thin Tomato Juice', 'tomato_juice', 216, 45),
  mana('thin_pumpkin_cider', 'Thin Pumpkin Cider', 'pumpkin_cider', 288, 80),
  mana('thin_goldenroot_tea', 'Thin Goldenroot Tea', 'goldenroot_tea', 396, 138),
  mana('thin_emberfruit_cordial', 'Thin Emberfruit Cordial', 'emberfruit_cordial', 480, 233),
  /* (Tyler 2026-10-23: "like anything else the arrows should then be bought from the store".) Iron Arrows ran out
     with no store row and the Ranger hunted on with no basic attack; priced by the rule, BASIC_AMMO_PREMIUM x its
     partner's book value (1 g). */
  shot('plain_iron_arrows', 'Plain Iron Arrows', 'iron_arrows', 1),
  shot('plain_barbed_arrows', 'Plain Barbed Arrows', 'barbed_arrows', 1),
  shot('plain_iron_bolts', 'Plain Iron Bolts', 'iron_bolts', 1),
  shot('plain_steel_arrows', 'Plain Steel Arrows', 'steel_arrows', 1),
  shot('plain_mithril_arrows', 'Plain Mithril Arrows', 'mithril_arrows', 4),
  shot('plain_rune_arrows', 'Plain Rune Arrows', 'rune_arrows', 6),
  shot('plain_emberhead_arrows', 'Plain Emberhead Arrows', 'emberhead_arrows', 9),
  shot('plain_dawnpoint_arrows', 'Plain Dawnpoint Arrows', 'dawnpoint_arrows', 12),
  /* THE STORE RUNES (Tyler 2026-10-23): ONE a family, the basic power (version I at BASIC_EFFECT_SHARE), bought per
     cast only when the spell's slot names it; partnered to the family's Chalked rune, priced BASIC_AMMO_PREMIUM x its
     book value (stonecraft.js RUNE_VALUE, PROVISIONAL). */
  shot('plain_earth_rune', 'Plain Earth Rune', 'chalked_earth_rune', 1),
  shot('plain_water_rune', 'Plain Water Rune', 'chalked_water_rune', 1),
  shot('plain_fire_rune', 'Plain Fire Rune', 'chalked_fire_rune', 1),
  shot('plain_ice_rune', 'Plain Ice Rune', 'chalked_ice_rune', 1),
  shot('plain_poison_rune', 'Plain Poison Rune', 'chalked_poison_rune', 1),
  shot('plain_rupture_rune', 'Plain Rupture Rune', 'chalked_rupture_rune', 1),
]);

/** Null-prototype index by id. */
export const BASIC_INDEX = Object.freeze(BASIC_SUPPLIES.reduce((acc, b) => { acc[b.id] = b; return acc; },
  Object.create(null)));

/* EVERY SUPPLY A HUNT SPENDS HAS A STORE FALLBACK (Tyler 2026-10-23: food, drink, a spell's rune when its slot
   names it, arrows: bought with gold per use once the carried stock runs out; out of gold for a basic supply
   still ends the hunt, 10-14). A packed heal, drink or ammo line (src/data/supplies.js SUPPLY_ROWS) is the
   partner of a store row above, or it is listed here with the reason it needs none. tests/supplies-catalogue.mjs
   B5 holds both directions: an unlisted line with no partner is red, and so is a listed one that has a partner. */
const BY_SLOT = 'a food or drink slot names ONE item (Tyler 2026-10-21): when it runs out the next slot fires, and any store food or drink can stand there';
const FREE_RUNG = 'the free tier-1 rung (ammoPerShot 0): a shot never spends it, so it never runs out';
const HONE = 'a whetstone is melee\'s ceiling, not its swing (R5): when the last one wears the sword swings on unsharpened';
const DEEPER_TIER = 'the store sells each family ONE basic rune, version I at the store\'s share (Tyler 2026-10-23): a deeper tier is bound at Runecrafting, never bought, and once it is gone the spell casts the next tier the hero carries, then the store\'s';
export const NO_STORE_PARTNER = Object.freeze(Object.assign(Object.create(null), {
  turnip_mash: BY_SLOT, cooked_herring: BY_SLOT, cooked_wolf_meat: BY_SLOT, cooked_panther_meat: BY_SLOT, cooked_pikeperch: BY_SLOT,
  cooked_copper_crab: BY_SLOT, wheat_bread: BY_SLOT, cooked_silverfin: BY_SLOT, baked_potato: BY_SLOT, cooked_goldgill: BY_SLOT,
  cooked_bear_meat: BY_SLOT, river_chowder: BY_SLOT, cooked_frostfin: BY_SLOT, cooked_moonfish: BY_SLOT,
  bronze_arrows: FREE_RUNG,
  coarse_whetstone: HONE, copper_whetstone: HONE, iron_whetstone: HONE, steel_whetstone: HONE, mithril_whetstone: HONE,
  rune_whetstone: HONE, dawn_whetstone: HONE,
  /* every rune above the Chalked tier of every crafted family (stonecraft.js CRAFTED_RUNE_FAMILIES) */
  ...Object.fromEntries(CRAFTED_RUNE_FAMILIES.flatMap((f) => RUNE_TIERS.slice(1).map((t) => [runeId(f, t.tier), DEEPER_TIER]))),
}));


// ── THE SUPPLY PRICE LIST (lane S2, 2026-10-18; Coordinator ruling: the designer's prices) ──
// THE SHOP SELLS NO SUPPLIES (Tyler 2026-10-20, q02; the one-tap refill and its
// restock targets are retired by 2026-11-02-shop-no-supplies.sql). Of these rows
// only the TOOLS are Shop offers (src/data/shops.js SHOP_OFFERS); the food, drink
// and ammo rows are the price list of each basic row's CRAFTED partner, which the
// vendor's buy-back cap reads (shops.js SUPPLY_PRICE_LIST), never something a
// player can buy. Food restores HP, drink restores mana (the only mana source).
// A basic stays per use, the floor nobody is ever without. THE PRICE IS THE
// DESIGNER'S RATE ABOVE, per point: ceil(basic price x the item's own heal or
// mana / the basic's), and a shot is a shot (an arrow costs its basic's per-shot
// price). tools/gen-alpha-catalogue.mjs refuses any row off that rule, and
// tests/alpha-server.mjs A-DATA proves buy-then-vendor always loses (the
// vendor pays at most half the cheapest shop price, catalogue.js
// SHOP_BUYBACK_RATE). Every supply row has a basic. THE TIER-1 GATHERING TOOLS (Tyler
// 10-18: the shop sells the Bronze Axe and Bronze Pickaxe; better tiers stay
// smithing-only) are kind 'tool' with no basic, priced SHOP_PREMIUM x book
// value, so the vendor's buy-back (at most half) never moves and buy-then-sell loses.
// The server catalogue (hr_shop_supply_offers) is generated from these rows;
// src/data/shops.js lists them as `supply.*` offers.
//
// THE OUTFITTER (designer ruling 2026-10-22, lane/b-gold-sinks; Tyler 2026-10-20: "the
// Shop keeps gear and tools"). The Shop sells the small pieces NO walked hunting ground
// drops: gloves, belt, cape, earrings, ring and necklace. Monsters drop the helmets,
// bodies, legs, boots and weapons (Tyler 2026-10-20: gear drops are a real slot), so the
// Shop never competes with a drop. Gloves and belts are armour: wearing one is what lets
// Defense train (Tyler 2026-10-18). Leather Gloves are medium (dodge: neither health nor
// mana, so they suit every way to fight); the Bronze Belt is heavy (more health, a little
// less magic and ranged accuracy: the shield hero's pick). The light and other medium
// tier-1 gloves and belts are not sold: they are field-salvage finds (tests/field-salvage.mjs
// (a): a salvage piece is never shop stock). Tier 1 and Level 1 only: better pieces come
// from drops and crafting.
// THE FIRST SHIELD (Tyler 2026-10-23, from Andy's reports: a basic shield at the Shop outfitter, better
// shields made at Smithing, and some drops): the Bronze-Rimmed Shield (src/data/shields.js), tier 1 at
// Defense 1, on the same rules. The shield slot joins the outfitter's: the Rat King's Kingsgrate is a
// tier-2 Rare, never the shop's piece, so the Shop still never competes with a drop at its tier.
// Price = SHOP_PREMIUM x book value, the tools' rule, so the vendor's buy-back (at most
// half the shop price) pays at most what the piece cost, halved: buy-then-sell loses.
// tools/gen-alpha-catalogue.mjs refuses a gear row off any of these rules.
//
// THE SEED COUNTER (designer ruling 2026-10-22, lane/b-orphan-sources; farming is in Early Access,
// Tyler 2026-10-19). A seed is not a supply (Tyler 2026-10-20 named food, drink, ammo and runes) and
// before this no Shop tab listed one: only the kit's 8 turnip seeds and two quest rewards could ever
// reach a bag, so wheat, tomato, pumpkin, goldenroot, emberfruit and moonbloom were catalogued and
// unplantable. Every crop's seed is now a Shop row, kind 'seed', one seed per unit. The price is the
// counter's own per-seed price (the legacy seed.* bundles, unit for unit, which these rows replace:
// one item, one price): book value for the six early seeds, so a first planting is never a gold
// decision, and above it for the three late ones (goldenroot 150, emberfruit 300, moonbloom 800), the
// sink an endgame farmer meets. Keeping the unit price keeps every vendor bid where it was (half the
// cheapest shop unit, catalogue.js vendorPriceOf): buy-then-sell loses half. Farming level and plot tier
// still gate the PLANTING (src/core/farm.js), never the purchase. tools/gen-alpha-catalogue.mjs refuses a
// seed row for an item that is not a crop's seed, below its book value, or with a basic.
export const SHOP_PREMIUM = 2;
/* The kinds the Shop's Buy tab lists and `shop_buy` sells; every other row is a price only. */
export const SHOP_SOLD_KINDS = Object.freeze(['tool', 'gear', 'seed']);
/* The slots the Shop may sell gear for: the ones no walked ground's regular gear drops (a Rare named piece, such as
   Grayjaw's Ruff, may share a slot with a Shop basic: tests/hunt-core/forest-cave.mjs shop-outfits-defense). */
export const SHOP_GEAR_SLOTS = Object.freeze(['gloves', 'belt', 'cape', 'earrings', 'ring', 'necklace', 'shield']);
const sell = (item, kind, basic, price) => Object.freeze({ offer: 'supply.' + item, item, kind, basic, price });

export const SUPPLY_SHOP_OFFERS = Object.freeze([
  sell('cooked_shrimp', 'food', 'salted_shrimp', 19),
  sell('cooked_trout', 'food', 'salted_trout', 56),
  sell('cooked_lobster', 'food', 'salted_lobster', 250),
  sell('cooked_swordfish', 'food', 'salted_swordfish', 576),
  sell('cooked_shark', 'food', 'salted_shark', 924),
  sell('turnip_juice', 'drink', 'thin_turnip_juice', 14),
  sell('carrot_juice', 'drink', 'thin_carrot_juice', 26),
  sell('tomato_juice', 'drink', 'thin_tomato_juice', 63),
  sell('pumpkin_cider', 'drink', 'thin_pumpkin_cider', 107),
  sell('goldenroot_tea', 'drink', 'thin_goldenroot_tea', 184),
  sell('emberfruit_cordial', 'drink', 'thin_emberfruit_cordial', 315),
  sell('barbed_arrows', 'ammo', 'plain_barbed_arrows', 1),
  sell('iron_bolts', 'ammo', 'plain_iron_bolts', 1),
  sell('steel_arrows', 'ammo', 'plain_steel_arrows', 1),
  sell('mithril_arrows', 'ammo', 'plain_mithril_arrows', 4),
  sell('rune_arrows', 'ammo', 'plain_rune_arrows', 6),
  sell('emberhead_arrows', 'ammo', 'plain_emberhead_arrows', 9),
  sell('dawnpoint_arrows', 'ammo', 'plain_dawnpoint_arrows', 12),
  sell('bronze_axe', 'tool', null, 120),
  sell('bronze_pickaxe', 'tool', null, 120),
  /* The outfitter: the two armour pieces first (medium gloves for anyone, a heavy belt), then the rest. */
  sell('leather_gloves', 'gear', null, 160),
  sell('bronze_belt', 'gear', null, 220),
  sell('traveler_cape', 'gear', null, 300),
  sell('copper_studs', 'gear', null, 120),
  sell('copper_ring', 'gear', null, 240),
  sell('hunter_necklace', 'gear', null, 360),
  sell('bronze_rimmed_shield', 'gear', null, 140),
  /* The seed counter, in crop order (src/data/gathering.js CROPS). */
  sell('turnip_seed', 'seed', null, 5),
  sell('carrot_seed', 'seed', null, 10),
  sell('wheat_seed', 'seed', null, 15),
  sell('potato_seed', 'seed', null, 20),
  sell('tomato_seed', 'seed', null, 30),
  sell('pumpkin_seed', 'seed', null, 50),
  sell('goldenroot_seed', 'seed', null, 150),
  sell('emberfruit_seed', 'seed', null, 300),
  sell('moonbloom_seed', 'seed', null, 800),
]);

/** The offer ids a Shop tab lists: the ONLY ids `shop_buy` sells (supabase/functions/hr-accrue/catalogue.js
    offerRefusal) and the only shop rows that count as an item's source (src/data/catalogue-coherence.js
    itemSources, src/shell/item-lore.js). A price row no tab lists is a vendor price, never a door. */
export const SHOP_LISTED_OFFER_IDS = Object.freeze(new Set(SUPPLY_SHOP_OFFERS.filter((s) => SHOP_SOLD_KINDS.includes(s.kind)).map((s) => s.offer)));
