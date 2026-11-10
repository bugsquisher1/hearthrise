// ============================================================
// src/core/formulas/shop.js — WHAT THE SHOP AND THE STORE CHARGE, where the price is a rule and not a row.
//
//   a tool or an outfitter piece   SHOP_PREMIUM x its book value (so the shop's buy-back, at most half the shop
//                                  price, never pays more than the piece is worth: buy then sell loses)
//   made food or drink             its plain store partner's gold per point x the item's own points, rounded up
//   a made shot                    its plain store shot's price
//
// Until lane/b-formula-home (2026-11-10) both rules were written in a tool (tools/gen-alpha-catalogue.mjs), which
// checked every row of src/data/supply-basics.js SUPPLY_SHOP_OFFERS against them and wrote hr_shop_supply_offers.
// The generator still does both; it calls these. A seed and a plain jewelry piece cost their own row's price
// (supply-basics.js, src/data/jewelry.js JEWEL_SHOP_PRICE): no rule, so no function.
//
// Numbers: src/data/supply-basics.js. None is typed here (tests/formula-single-source.mjs).
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { SHOP_PREMIUM } from '../../data/supply-basics.js?v=0.2.114';

/** Gold the Shop charges for a tier-1 tool or an outfitter piece: the premium over its book value. */
export function premiumPriceOf(item) {
  return SHOP_PREMIUM * Number(item.v);
}

/**
 * Gold the store charges for one made supply, from its plain store partner `basic` (supply-basics.js BASIC_SUPPLIES):
 * the partner's gold per point times the item's own points (heal or mana), rounded up; a shot costs its partner's shot.
 */
export function supplyPriceOf(basic, item) {
  if (basic.kind === 'ammo') return basic.price;
  const per = basic.kind === 'heal' ? basic.heals : basic.mana;
  const own = basic.kind === 'heal' ? Number(item.heals) : Number(item.mana);
  return Math.ceil(basic.price * own / per);
}
