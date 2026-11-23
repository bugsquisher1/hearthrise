// ════════════════════════════════════════════════════════════════════════
// src/data/store-kit.js — THE STORE'S BASICS, PRICED IN HOURS OF WAGE (lane/econ-levers, game designer, 2026-11-22;
//   docs/design/redesign/04-math-strategy.md section 11 `supplyShare`, 09-crafting.md sections 2.5, 4.3 and 4.6).
//
// No store price is typed. Every row of src/data/supply-basics.js is priced here from the wage at the row's own step (src/data/wage.js):
//
//   a meal or a drink   round(storeShare x lineShare.meal   x wage(step) x amount / refRestore)     gold a use
//   a charge            round(storeShare x lineShare.charge x wage(step) / refCharges)              gold a shot or a cast
//   storeShare          kitWork x townWageShare x storeCeiling (09: 0.8 x 0.25 x 1.5 = 0.3 of an hour's wage for a store-fed kit-hour)
//
// So a reference hero (the mixed MID four at Level 60 on Steady, the scale's one reference ground) spends lineShare of a store kit-hour
// on each line the store sells: meals (food and drink, 0.35) and charges (arrows and runes, 0.35). The two lines 09 keeps crafted-only
// (draught 0.2, imbuement 0.1) have no store row, so a store-only hero's bill is 0.3 x 0.7 = 0.21 of its wage before rounding.
// `step` is the Level the row's crafted partner is made at (the band its strength belongs to), so a deeper row costs more a point.
//
// THE FLOORS, ALL FROM THE CRAFTED PARTNER, NEVER TYPED (09 2.5: "a crafted kit wins twice, on price and on strength"; the shop's bid for
// a crafted partner is capped at `buyback` of the store's list, so no floor below can print gold):
//   a meal or a drink   enough that the cap never cuts the crafted partner's bid under its book: book a point / buyback (tests/craft-wages
//                       W-STEP, a cook still refines for the shop; 2x the book a point, so B1's "more than the book a point" holds too)
//   a charge            at least BASIC_AMMO_PREMIUM x its partner's book a shot, and a rune with any book at least 2 so the shop's bid for
//                       the crafted rune (whole gold, never under 1) stays under the store (tests/craft-wages.mjs W-RUNE)
// At the reference the floors, not the wage, set the charge and the drink a Level 60 four buys (a mithril arrow 2, an Etched rune 2, a
// Thin Carrot Juice 16): today's crafted book values sit above 09's share of the wage. They fall to the wage when wave 4 prices crafted
// goods as V = work-hours x townWageShare x wage(band step) (13-market 3.2); the formula is already the price wherever it is higher.
// And the whole-gold floor of 1: a store use is whole gold (the purse and hr_hunt_apply_member re-price in gold), so a charge whose share
// of the wage is under a gold costs 1 (the measured bill reads the floor, tools/balance-program/redesign/econ/).
//
// THE REFERENCE RATES are the four's mean per hunted hero-hour at Level 60 on Steady, MEASURED (v1-climb.mjs base:steady from a held start,
// 6 seeds x 8 h, lane/econ-levers): HP and mana restored from store meals and drinks, and store shots and casts. They are how much of a
// line one reference hour burns, the "hours of effect" 09 section 4.3 writes on a recipe; nothing else in the price is measured.
//
// STATIC ROWS, NOT YET THE BUYER'S STEP (04 section 3, 09 4.6: the store prices at the buyer's own step, storeLag behind). The catalogue
// prices a row once, at its own step; the server re-prices every use from it. Pricing at the buyer's step is a server change (the hunt
// session's catalogue per hero) and is handed off; until it lands a Level far above a row's step pays that row's price.
//
// PURE ESM. Data and pure arithmetic only.
// ════════════════════════════════════════════════════════════════════════
import { wage } from './wage.js';

export const STORE_KIT = Object.freeze({
  /* LEVER (econ.kit-work; 09 4.7, search 0.5 to 1.2): work-hours behind one kit-hour */
  kitWork: 0.8,
  /* LEVER (econ.town-wage-share; 09 4.3, search 0.15 to 0.35): a work-hour's worth beside a hunted hour */
  townWageShare: 0.25,
  /* LEVER (econ.store-ceiling; 09 4.7, search 1.25 to 2.0): how much dearer the store is than the crafted good */
  storeCeiling: 1.5,
  /* LEVER (econ.store-lines; 09 4.3's line shares): the share of a kit-hour each line the store sells takes */
  lineShare: Object.freeze({ meal: 0.35, charge: 0.35 }),
  /* LEVER (econ.store-rates): the reference four's store use a hunted hero-hour, MEASURED at Level 60 on Steady (see the header) */
  refRestore: 12660,
  refCharges: 1390,
  /* NOT A LEVER: supabase/functions/hr-accrue/catalogue.js SHOP_BUYBACK_RATE, the share of the store's list the shop bids for a crafted
     partner (tests/econ-levers.mjs holds the two equal; the edge module is not importable from data) */
  buyback: 0.5,
});

/** A store-fed kit-hour's share of an hour's wage (09 2.5: 0.3 at the starting values). */
export function storeShare(k = STORE_KIT) {
  return k.kitWork * k.townWageShare * k.storeCeiling;
}

/**
 * THE PRICE OF ONE STORE USE, whole gold. `line` 'meal' (a food or a drink: `amount` HP or mana, `partnerAmount` the crafted partner's)
 * or 'charge' (a shot or a cast; `rune` true for a rune); `step` the Level the partner is made at; `book` the crafted partner's book
 * value; `ammoPremium` supply-basics.js BASIC_AMMO_PREMIUM.
 */
export function storePrice({ line, step, amount = 0, partnerAmount = 0, book = 0, rune = false, ammoPremium = 1 }, k = STORE_KIT) {
  const share = storeShare(k) * k.lineShare[line] * wage(step);
  if (line === 'meal') {
    const formula = Math.round((share * amount) / k.refRestore);
    const crafted = partnerAmount > 0 ? Math.ceil((book * amount) / (partnerAmount * k.buyback)) : 1;
    return Math.max(1, formula, crafted);
  }
  const formula = Math.round(share / k.refCharges);
  return Math.max(1, formula, Math.ceil(ammoPremium * book), rune && book > 0 ? 2 : 1);
}
