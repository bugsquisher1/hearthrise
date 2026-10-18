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
// playerCombatRolls `ammoShare`) and costs at least twice its partner's book
// value per shot. There are no basic RUNES: the per-swing rune ladder is being
// replaced by element families consumed by abilities (designer review K10,
// 2026-10-15), so nothing ships only to be deleted. The free tier-1 rungs
// (Bronze Arrows, Air Rune, Coarse Whetstone) stay ordinary packed items.
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
// above. ART: none of these has an icon yet (Art Director handoff).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* A basic heal or drink gives this share of its crafted partner (floored); a
   basic arrow gives this share of its partner's ammo bonus. */
export const BASIC_EFFECT_SHARE = 0.75;

/* A basic shot costs at least this many times its partner's book value. */
export const BASIC_AMMO_PREMIUM = 2;

const heal = (id, n, partner, heals, price, tiers) => Object.freeze({ id, kind: 'heal', n, partner, heals, price, tiers: Object.freeze(tiers) });
const mana = (id, n, partner, restores, price, tiers) => Object.freeze({ id, kind: 'mana', n, partner, mana: restores, price, tiers: Object.freeze(tiers) });
const shot = (id, n, partner, price) => Object.freeze({ id, kind: 'ammo', n, partner, price, tiers: Object.freeze([]) });

/* id -> row. `tiers` are the hunt tiers whose "shop heal" / "shop drink" slot
   resolves to this row; `price` is gold per use (per shot for ammo). */
export const BASIC_SUPPLIES = Object.freeze([
  heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 6, 14, [1]),
  heal('salted_trout', 'Salted Trout', 'cooked_trout', 10, 40, [2]),
  heal('salted_lobster', 'Salted Lobster', 'cooked_lobster', 18, 180, [3]),
  heal('salted_swordfish', 'Salted Swordfish', 'cooked_swordfish', 24, 432, [4, 5]),
  heal('salted_shark', 'Salted Shark', 'cooked_shark', 33, 693, [6]),
  mana('thin_turnip_juice', 'Thin Turnip Juice', 'turnip_juice', 6, 6, [1]),
  mana('thin_carrot_juice', 'Thin Carrot Juice', 'carrot_juice', 10, 11, [2]),
  mana('thin_tomato_juice', 'Thin Tomato Juice', 'tomato_juice', 18, 27, [3]),
  mana('thin_pumpkin_cider', 'Thin Pumpkin Cider', 'pumpkin_cider', 24, 48, [4]),
  mana('thin_goldenroot_tea', 'Thin Goldenroot Tea', 'goldenroot_tea', 33, 83, [5]),
  mana('thin_emberfruit_cordial', 'Thin Emberfruit Cordial', 'emberfruit_cordial', 40, 140, [6]),
  shot('plain_barbed_arrows', 'Plain Barbed Arrows', 'barbed_arrows', 2),
  shot('plain_iron_bolts', 'Plain Iron Bolts', 'iron_bolts', 2),
  shot('plain_steel_arrows', 'Plain Steel Arrows', 'steel_arrows', 4),
  shot('plain_mithril_arrows', 'Plain Mithril Arrows', 'mithril_arrows', 8),
  shot('plain_rune_arrows', 'Plain Rune Arrows', 'rune_arrows', 12),
  shot('plain_emberhead_arrows', 'Plain Emberhead Arrows', 'emberhead_arrows', 18),
  shot('plain_dawnpoint_arrows', 'Plain Dawnpoint Arrows', 'dawnpoint_arrows', 24),
]);

/** Null-prototype index by id. */
export const BASIC_INDEX = Object.freeze(BASIC_SUPPLIES.reduce((acc, b) => { acc[b.id] = b; return acc; },
  Object.create(null)));

/** The basic heal or drink a hunt of this tier's "shop" slot fires, or null. */
export function basicFor(kind, huntTier) {
  return BASIC_SUPPLIES.find((b) => b.kind === kind && b.tiers.includes(huntTier)) || null;
}

// ── THE SHOP'S PACKABLE SUPPLIES (lane S2, 2026-10-18; ASSUMED, Game Designer to rule) ──
// The Bag's one-tap refill (Tyler 10-18: the player presses once, the server
// buys up to each restock target and shows the total first; never automatic)
// needs things a player can PACK, so the shop also sells the CRAFTED partner of
// each basic row as an ordinary item (`supply.<item>`, bought through shop_buy
// or the refill). A basic stays per use and is still the floor nobody is
// ever without; the packed item is a convenience bought at a premium, and
// making it yourself stays the cheap path. Each price holds two rules
// (tests/alpha-server.mjs A-DATA proves both against ITEMS):
//   price >= SUPPLY_SHOP_PREMIUM x the item's book value   so the vendor's buy-back
//            (at most half the shop price, catalogue.js SHOP_BUYBACK_RATE) never
//            moves and buy-then-sell can never profit;
//   price >= ceil(basic price / BASIC_EFFECT_SHARE)       so a packed item never
//            costs less a point than the basic it is the full version of.
// DRINKS: none yet. The drink partners (src/data/drinks.js) are STAGED, not
// items, so there is nothing to pack; a drink row joins here with the mana engine.
// The server catalogue (hr_shop_supply_offers) is generated from these rows by
// tools/gen-alpha-catalogue.mjs; src/data/shops.js lists them as `supply.*` offers.
export const SUPPLY_SHOP_PREMIUM = 2;

const sell = (item, kind, basic, price) => Object.freeze({ offer: 'supply.' + item, item, kind, basic, price });

export const SUPPLY_SHOP_OFFERS = Object.freeze([
  sell('cooked_shrimp', 'food', 'salted_shrimp', 36),
  sell('cooked_trout', 'food', 'salted_trout', 110),
  sell('cooked_lobster', 'food', 'salted_lobster', 480),
  sell('cooked_swordfish', 'food', 'salted_swordfish', 1120),
  sell('cooked_shark', 'food', 'salted_shark', 1800),
  sell('barbed_arrows', 'ammo', 'plain_barbed_arrows', 3),
  sell('iron_bolts', 'ammo', 'plain_iron_bolts', 3),
  sell('steel_arrows', 'ammo', 'plain_steel_arrows', 6),
  sell('mithril_arrows', 'ammo', 'plain_mithril_arrows', 11),
  sell('rune_arrows', 'ammo', 'plain_rune_arrows', 16),
  sell('emberhead_arrows', 'ammo', 'plain_emberhead_arrows', 24),
  sell('dawnpoint_arrows', 'ammo', 'plain_dawnpoint_arrows', 32),
]);
