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
// spends (Tyler 10-15 "runes and ammo: carried first, then the store" replaces the K10
// no-basic-runes rule; every tier has one since the rune ladder, 2026-11-05, below).
// The free rung (Bronze Arrows: designer 2026-10-31) stays an ordinary packed item with no store row.
//
// THE PLAYER PICKS THE ITEM (Tyler 2026-10-21, designer-confirmed): a bar slot
// names ONE item. A store food or drink below is an item a slot can name, bought
// per use; a crafted one comes from the hero's own stock only. The player builds
// the fallback by slot order (Cooked Trout, then Salted Trout). A rune spell buys
// the store rune its slot names, of any tier of its family, and only that one. The game
// never picks: there are no per-hunt-tier store rows (the old `tiers` column is gone).
//
// PRICES ARE DERIVED, NEVER TYPED (lane/econ-levers, game designer, 2026-11-22; 04 section 11, 09 sections 2.5 and 4.6). Every
// row's gold a use is src/data/store-kit.js storePrice: the store's share of an hour's wage at the row's own step (the Level its
// crafted partner is made at), over what one reference hour burns of that line, never under the crafted partner's book (B1) and never
// under a whole gold. The old hand-typed ladder (Salted Shark 693, Graven runes 44) sat at about twice what a Steady hour on the
// Danger scale paid (lane W: a Level 60 four burned 9,804 gold of store kit an hour against 4,797 of pay).
// `price` is a row's LIST price (its own step): the crafted partner's price list below reads it. A USE is priced at the BUYER's store
// step (lane/econ-followups, 2026-11-22; store-kit.js header): STORE_TERMS carries each row's step-free terms to the server
// (tools/gen-store-prices.mjs), which charges storeUsePrice(id, the hero's depth on the Danger scale, else its Level).
//
// The server catalogue (lane C) is generated from BASIC_SUPPLIES; the client
// shows `price` on the slot. tests/supplies-catalogue.mjs proves every rule
// above. ART: one 32x32 pixel icon per row under assets/icons-bundle/pixel/supplies/<id>.png
// (SUPPLY_DIR in item-art.js; tests/pixel-icons.mjs requires them).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { RUNE_TIERS, RUNE_FAMILIES, runeId, runeName, isRune, runeTierOf, craftLevel } from './runes.js';
import { ITEMS } from './items.js';
import { ARTISAN_RECIPES } from './recipes.js';
import { DRINK_ITEMS, DRINK_RECIPES } from './drinks.js';
import { storePrice, storeTerms, storePriceOf } from './store-kit.js';
import { CRAFTED_RUNE_FAMILIES } from './stonecraft.js';
import { JEWEL_SHOP_PRICE } from './jewelry.js';

/* A basic heal or drink gives this share of its crafted partner (floored); a
   basic arrow gives this share of its partner's ammo bonus. */
export const BASIC_EFFECT_SHARE = 0.75;

/* LEVER (econ.ammo-floor): a basic shot or cast costs at least this many times its crafted partner's book value. ONE HALF (lane/econ-levers,
   2026-11-22; was 1): the store's charge prices are wage-derived and a whole gold at most tiers, and a mithril arrow's book of 4 a shot
   was the bow's whole bill (a store-fed bow at Level 60 looses about 3,000 shots an hour, 12,000 gold at 4 g against a four's 4,800 a
   head of pay). Half its book still keeps the store dearer than the crafted arrow sells to the shop (the buy-back is capped at half
   the store's list), so buying basics and selling crafted never prints gold, and a crafted charge still wins on strength. */
export const BASIC_AMMO_PREMIUM = 0.5;

/* THE PRICE OF A ROW (store-kit.js storePrice), from its crafted partner: the Level it is made at (a cooked food's Cooking recipe, a drink's
   press, an arrow's Ranged need, a rune's tier), its own heal or mana and its book. */
const COOK_STEP = Object.freeze(Object.fromEntries(Object.values(ARTISAN_RECIPES.cooking || {}).map((r) => [r.output, r.req])));
const DRINK_STEP = Object.freeze(Object.fromEntries(DRINK_RECIPES.map((r) => [r.output, r.req])));
/* A row's storePrice input: `step` the Level its crafted partner is made at (the list price's step) and the step-free rest (store-kit.js
   storeTerms). A row's `price` is its LIST price, at its own step; a USE is priced at the buyer's store step (STORE_TERMS below). */
const restoreInput = (partner, amount, key) => {
  const p = ITEMS[partner] || DRINK_ITEMS[partner];
  const step = key === 'heals' ? COOK_STEP[partner] : DRINK_STEP[partner];
  if (!p || !Number.isInteger(step)) throw new Error('supply-basics: ' + partner + ' has no made-at Level to price its store row');
  return { line: 'meal', step, amount, partnerAmount: Number(p[key]), book: Number(p.v) || 0 };
};
const chargeInput = (partner) => {
  const p = ITEMS[partner];
  if (!p) throw new Error('supply-basics: ' + partner + ' is no item to price its store row');
  const rune = isRune(p);
  /* the MADE-AT Level (a rune's Runecrafting tier, an ammo row's `madeLv`), never the skill gate the clock moved (core-model.js SUPPLY_GATES) */
  const step = rune ? craftLevel(runeTierOf(p)) : Number(p.madeLv || p.reqLv) || 1;
  return { line: 'charge', step, book: Number(p.v) || 0, rune, ammoPremium: BASIC_AMMO_PREMIUM };
};
const restorePrice = (partner, amount, key) => storePrice(restoreInput(partner, amount, key));
const chargePrice = (partner) => storePrice(chargeInput(partner));
const heal = (id, n, partner, heals) => Object.freeze({ id, kind: 'heal', n, partner, heals, price: restorePrice(partner, heals, 'heals') });
const mana = (id, n, partner, restores) => Object.freeze({ id, kind: 'mana', n, partner, mana: restores, price: restorePrice(partner, restores, 'mana') });
const shot = (id, n, partner) => Object.freeze({ id, kind: 'ammo', n, partner, price: chargePrice(partner) });

/* THE RUNE LADDER: gold a cast by rune tier, Chalked's store partner to Graven's, one row of the catalogue per family per tier. DERIVED
   (lane/econ-levers, 2026-11-22): each tier is chargePrice of its crafted rune (every family's rune of a tier is made at the same Level
   with the same book), so it never falls with the tier and each deeper price stands above what the shop bids for the crafted rune
   (tests/craft-wages.mjs W-RUNE). The hand-typed ladder (1 / 8 / 12 / 28 / 44, Andy's "inting if you're not going BIS runes" call of
   2026-11-16) priced a deeper rune as a trade on the old tiers; on the Danger scale depth pays for power, so the store's deeper rune is
   a basic like any other and the crafted one wins on strength. A deeper rune is still the player's own pick on a slot. */
export const STORE_RUNE_PRICE = Object.freeze(RUNE_TIERS.map((t) => chargePrice(runeId(CRAFTED_RUNE_FAMILIES[0], t.tier))));
/* A deeper store rune is called by its tier's own name, "Scored Fire Rune" (Tyler 2026-11-08: "Plain Scored Fire Rune" read wrong
   beside "the store's"); Plain names only the tier-1 row, the store's own cheap rune. The ids keep their `plain_` prefix. */
const storeRune = (family, t) => shot(t.tier === 1 ? 'plain_' + family + '_rune' : 'plain_' + runeId(family, t.tier),
  t.tier === 1 ? 'Plain ' + RUNE_FAMILIES[family].label + ' Rune' : runeName(family, t.tier), runeId(family, t.tier));

/* id -> row. `price` is gold per use (per shot for ammo, per cast for a rune). */
export const BASIC_SUPPLIES = Object.freeze([
  heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 72),
  heal('salted_trout', 'Salted Trout', 'cooked_trout', 120),
  heal('salted_lobster', 'Salted Lobster', 'cooked_lobster', 216),
  heal('salted_swordfish', 'Salted Swordfish', 'cooked_swordfish', 288),
  heal('salted_shark', 'Salted Shark', 'cooked_shark', 396),
  mana('thin_turnip_juice', 'Thin Turnip Juice', 'turnip_juice', 72),
  mana('thin_carrot_juice', 'Thin Carrot Juice', 'carrot_juice', 120),
  mana('thin_tomato_juice', 'Thin Tomato Juice', 'tomato_juice', 216),
  mana('thin_pumpkin_cider', 'Thin Pumpkin Cider', 'pumpkin_cider', 288),
  mana('thin_goldenroot_tea', 'Thin Goldenroot Tea', 'goldenroot_tea', 396),
  mana('thin_emberfruit_cordial', 'Thin Emberfruit Cordial', 'emberfruit_cordial', 480),
  /* (Tyler 2026-10-23: "like anything else the arrows should then be bought from the store".) Iron Arrows ran out
     with no store row and the Ranger hunted on with no basic attack; priced by the rule, BASIC_AMMO_PREMIUM x its
     partner's book value (1 g). */
  shot('plain_iron_arrows', 'Plain Iron Arrows', 'iron_arrows'),
  shot('plain_barbed_arrows', 'Plain Barbed Arrows', 'barbed_arrows'),
  shot('plain_iron_bolts', 'Plain Iron Bolts', 'iron_bolts'),
  shot('plain_steel_arrows', 'Plain Steel Arrows', 'steel_arrows'),
  shot('plain_mithril_arrows', 'Plain Mithril Arrows', 'mithril_arrows'),
  shot('plain_rune_arrows', 'Plain Rune Arrows', 'rune_arrows'),
  shot('plain_emberhead_arrows', 'Plain Emberhead Arrows', 'emberhead_arrows'),
  shot('plain_dawnpoint_arrows', 'Plain Dawnpoint Arrows', 'dawnpoint_arrows'),
  /* THE STORE RUNES: one a family a tier, each the store's version of the crafted rune it partners. A cast on one lands that tier's
     version at BASIC_EFFECT_SHARE and needs that tier's level in the spell's skill (src/core/hunt/abilities.js runeFor), bought per
     cast only when the spell's slot names it. Priced STORE_RUNE_PRICE above. */
  ...CRAFTED_RUNE_FAMILIES.flatMap((f) => RUNE_TIERS.map((t) => storeRune(f, t))),
]);

/** Null-prototype index by id. */
export const BASIC_INDEX = Object.freeze(BASIC_SUPPLIES.reduce((acc, b) => { acc[b.id] = b; return acc; },
  Object.create(null)));

/* THE STORE'S PRICE TERMS, id -> { step (the row's own made-at Level: its list price's), terms (store-kit.js storeTerms) }: what the
   server's catalogue carries (tools/gen-store-prices.mjs -> hr_store_terms), so a use is priced at the BUYER's store step from the same
   rule that sets the row's list price (lane/econ-followups, 2026-11-22; store-kit.js header). */
const inputOf = (b) => (b.kind === 'ammo' ? chargeInput(b.partner) : restoreInput(b.partner, b.kind === 'heal' ? b.heals : b.mana, b.kind === 'heal' ? 'heals' : 'mana'));
export const STORE_TERMS = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(BASIC_SUPPLIES.map((b) => {
  const input = inputOf(b);
  return [b.id, Object.freeze({ step: input.step, terms: storeTerms(input) })];
}))));

/** ONE USE of store row `id` at the buyer's store step, whole gold (the server's hr_store_price; null for no such row). The client never
    calls it to show a price: it renders the server's (hunt_settings.store); tests and the Lab read it. */
export function storeUsePrice(id, step) {
  const t = Object.prototype.hasOwnProperty.call(STORE_TERMS, id) ? STORE_TERMS[id] : null;
  return t ? storePriceOf(t.terms, step) : null;
}

/* EVERY SUPPLY A HUNT SPENDS HAS A STORE FALLBACK (Tyler 2026-10-23: food, drink, a spell's rune when its slot
   names it, arrows: bought with gold per use once the carried stock runs out; out of gold for a basic supply
   still ends the hunt, 10-14). A packed heal, drink or ammo line (src/data/supplies.js SUPPLY_ROWS) is the
   partner of a store row above, or it is listed here with the reason it needs none. tests/supplies-catalogue.mjs
   B5 holds both directions: an unlisted line with no partner is red, and so is a listed one that has a partner. */
const BY_SLOT = 'a food or drink slot names one item, then the next fires';
const FREE_RUNG = 'the free tier-1 rung, ammoPerShot 0, never spent';
const HONE = 'a whetstone raises melee\'s ceiling, never its swing';
export const NO_STORE_PARTNER = Object.freeze(Object.assign(Object.create(null), {
  turnip_mash: BY_SLOT, cooked_herring: BY_SLOT, cooked_wolf_meat: BY_SLOT, cooked_panther_meat: BY_SLOT, cooked_pikeperch: BY_SLOT,
  cooked_copper_crab: BY_SLOT, wheat_bread: BY_SLOT, cooked_silverfin: BY_SLOT, baked_potato: BY_SLOT, cooked_goldgill: BY_SLOT,
  cooked_bear_meat: BY_SLOT, river_chowder: BY_SLOT, cooked_frostfin: BY_SLOT, cooked_moonfish: BY_SLOT,
  bronze_arrows: FREE_RUNG,
  coarse_whetstone: HONE, copper_whetstone: HONE, iron_whetstone: HONE, steel_whetstone: HONE, mithril_whetstone: HONE,
  rune_whetstone: HONE, dawn_whetstone: HONE,
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
// from drops (Tyler 2026-11-18: armor, weapons and shields drop, a bench makes none).
// THE FIRST SHIELD (Tyler 2026-10-23, from Andy's reports: a basic shield at the Shop outfitter; since 2026-11-18
// every better plain shield drops, src/data/shields.js SOURCES): the Bronze-Rimmed Shield (src/data/shields.js), tier 1 at
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
/* A CRAFTED PARTNER'S LIST PRICE is its store row's, never typed (lane/econ-levers): the basic's price a point times the item's own heal or
   mana, rounded up; an arrow's is its shot's. */
const listOf = (item, basicId) => {
  const b = BASIC_SUPPLIES.find((x) => x.id === basicId);
  const it = ITEMS[item] || DRINK_ITEMS[item];
  if (!b || !it) throw new Error('supply-basics: no store row ' + basicId + ' behind ' + item);
  if (b.kind === 'ammo') return b.price;
  const key = b.kind === 'heal' ? 'heals' : 'mana';
  return Math.ceil((b.price * Number(it[key])) / b[key === 'heals' ? 'heals' : 'mana']);
};
const sellSupply = (item, kind, basic) => sell(item, kind, basic, listOf(item, basic));

export const SUPPLY_SHOP_OFFERS = Object.freeze([
  sellSupply('cooked_shrimp', 'food', 'salted_shrimp'),
  sellSupply('cooked_trout', 'food', 'salted_trout'),
  sellSupply('cooked_lobster', 'food', 'salted_lobster'),
  sellSupply('cooked_swordfish', 'food', 'salted_swordfish'),
  sellSupply('cooked_shark', 'food', 'salted_shark'),
  sellSupply('turnip_juice', 'drink', 'thin_turnip_juice'),
  sellSupply('carrot_juice', 'drink', 'thin_carrot_juice'),
  sellSupply('tomato_juice', 'drink', 'thin_tomato_juice'),
  sellSupply('pumpkin_cider', 'drink', 'thin_pumpkin_cider'),
  sellSupply('goldenroot_tea', 'drink', 'thin_goldenroot_tea'),
  sellSupply('emberfruit_cordial', 'drink', 'thin_emberfruit_cordial'),
  sellSupply('barbed_arrows', 'ammo', 'plain_barbed_arrows'),
  sellSupply('iron_bolts', 'ammo', 'plain_iron_bolts'),
  sellSupply('steel_arrows', 'ammo', 'plain_steel_arrows'),
  sellSupply('mithril_arrows', 'ammo', 'plain_mithril_arrows'),
  sellSupply('rune_arrows', 'ammo', 'plain_rune_arrows'),
  sellSupply('emberhead_arrows', 'ammo', 'plain_emberhead_arrows'),
  sellSupply('dawnpoint_arrows', 'ammo', 'plain_dawnpoint_arrows'),
  /* every store rune's crafted partner, so the shop's bid for a crafted rune is capped at half the store's list like an arrow's
     (lane/econ-levers: the store's rune ladder is derived, and the cap keeps it above the bid, tests/craft-wages.mjs W-RUNE) */
  ...BASIC_SUPPLIES.filter((b) => b.kind === 'ammo' && /_rune$/.test(b.id)).map((b) => sellSupply(b.partner, 'ammo', b.id)),
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
  /* PLAIN JEWELRY STAYS IN THE SHOP, AT A PREMIUM (Tyler 2026-11-05, call 5): a fighter is never blocked, and a crafter can sell the
     plain piece for anything under this and still beat the Shop (src/data/jewelry.js JEWEL_SHOP_PRICE; tests/catalogue-coherence.mjs C6). */
  sell('banded_signet', 'gear', null, JEWEL_SHOP_PRICE.banded_signet),
  sell('fang_studs', 'gear', null, JEWEL_SHOP_PRICE.fang_studs),
  sell('wolfbone_torc', 'gear', null, JEWEL_SHOP_PRICE.wolfbone_torc),
  sell('seam_jasper_band', 'gear', null, JEWEL_SHOP_PRICE.seam_jasper_band),
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
