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
// PRICES (MEASURED, the table in src/data/supplies.js): a basic heal costs 15 g
// a heal point at tier 1, so an entry-level melee hunt on basics roughly
// breaks even against gold plus common drops, rising to 24 g a point at tier 6
// (a small heal cannot carry tiers 5-6, so the bigger ones may cost more per
// point).
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
  heal('salted_shrimp', 'Salted Shrimp', 'cooked_shrimp', 6, 90, [1]),
  heal('salted_trout', 'Salted Trout', 'cooked_trout', 10, 160, [2]),
  heal('salted_lobster', 'Salted Lobster', 'cooked_lobster', 18, 325, [3]),
  heal('salted_swordfish', 'Salted Swordfish', 'cooked_swordfish', 24, 505, [4, 5]),
  heal('salted_shark', 'Salted Shark', 'cooked_shark', 33, 790, [6]),
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
