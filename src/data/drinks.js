// ════════════════════════════════════════════════════════════════════════
// src/data/drinks.js — MANA DRINKS, STAGED FOR THE MANA ENGINE (Tyler,
// 2026-10-14: "food restores HP, drinks restore mana, both made by Cooking;
// drinks come from Farming crops"; Game Designer, lane D)
//
// LIVE (lane S2, 2026-10-18): the hunt's mana engine drinks them (src/core/hunt/
// consumables.js), so they are spread into ITEMS (items.js), made by the Cooking
// jobs (trades.js KIT_RECIPES; the bench recipes left with the cut, 09 4.17), their rows into SUPPLY_ROWS (supplies.js) and their
// flavour lines into ITEM_DESC; the shop sells them as supply.* offers.
//
// THE LADDER. One drink per hunt tier, each from one Farming crop, made three
// at a time because crops are slow (a turnip plot takes four hours) and a mage
// drinks every few minutes. Mana per drink follows the heal of the fish a
// fighter eats at the same tier (x12 with the food since the core rebuild:
// designer 2026-10-21, a tier-1 drink fills 72-96 of a ~230 mana pool). Book value is capped so three drinks never
// vend for more than five times what the vendor pays for the crop
// (tests/recipe-yield-guard.mjs's batch rule, held by tests/supplies-catalogue.mjs).
//
// ART: each of the six has its own 32x32 pixel icon (assets/icons-bundle/pixel/items/<id>.png);
// the emoji below is only the fallback the item renderer already uses.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const DRINK_ITEMS = Object.freeze({
  turnip_juice: Object.freeze({ n: 'Turnip Juice', icon: '🥤', v: 6, mana: 96 }),
  carrot_juice: Object.freeze({ n: 'Carrot Juice', icon: '🥕', v: 11, mana: 168 }),
  tomato_juice: Object.freeze({ n: 'Tomato Juice', icon: '🍅', v: 30, mana: 300 }),
  pumpkin_cider: Object.freeze({ n: 'Pumpkin Cider', icon: '🎃', v: 50, mana: 384 }),
  goldenroot_tea: Object.freeze({ n: 'Goldenroot Tea', icon: '🍵', v: 86, mana: 528 }),
  emberfruit_cordial: Object.freeze({ n: 'Emberfruit Cordial', icon: '🍷', v: 160, mana: 648 }),
});

/* The flavour lines, ready for src/data/item-descriptions.js on merge. */
export const DRINK_DESC = Object.freeze({
  turnip_juice: 'Thin turnip juice that brings back a little mana, which is plenty when you\'re just starting out',
  carrot_juice: 'Sweet carrot juice that brings back some mana between casts',
  tomato_juice: 'Rich tomato juice, a caster\'s favorite on a long hunt',
  pumpkin_cider: 'Spiced pumpkin cider that warms you up and brings back a good chunk of mana',
  goldenroot_tea: 'A slow-brewed tea of goldenroot. It\'s bright gold and brings back a lot of mana',
  emberfruit_cordial: 'A strong emberfruit drink for casters fighting the toughest monsters. It brings back the most mana',
});
