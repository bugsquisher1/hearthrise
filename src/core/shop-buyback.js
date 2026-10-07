// ============================================================================
// src/core/shop-buyback.js — WHAT THE NPC SHOP CHARGES FOR ONE OF AN ITEM.
//
// The NPC vendor buys back anything the NPC shop also sells for at most HALF
// the cheapest shop unit price (game-designer ruling). The rate and the
// cap itself live in ONE place each side of the wire — `vendorPriceOf` in
// supabase/functions/hr-accrue/catalogue.js (the price the server PAYS) and
// `vendorPrice` in src/screens/shop-counter.js (the price the bag SHOWS),
// guarded equal by tests/gold-intents.mjs G1. This module is only the INPUT
// both of them share: the cheapest gold price of ONE unit of each item, read
// off the generated catalogue (src/data/shops.js) rather than re-stated.
//
// unit = offer.gold / grant.amount, over every offer whose whole cost is one
// positive gold line and whose whole grant is ONE item line. A BUNDLE (two or
// more grant lines) has no per-item price and is deliberately not read here:
// splitting its price would understate what each piece costs and loosen the
// cap. tests/vendor-shop-arbitrage.mjs sums a bundle's grants against its
// whole price instead, so a bundle is still guarded.
//
// Gated offers (reqSkill/max/…) COUNT — "anything they also sell" is a fact
// about the shelf, not about who may reach it today.
//
// PURE ESM, dual-runtime (imported by the edge). Null-prototype result, so
// `constructor`/`__proto__` never resolve to a price.
// ============================================================================

/** `{ [itemId]: cheapest gold per unit }`, frozen, null-prototype. */
export function cheapestShopUnitPrice(offers) {
  const out = Object.create(null);
  for (const o of offers || []) {
    if (!o || !Array.isArray(o.cost) || o.cost.length !== 1) continue;
    const c = o.cost[0];
    if (!c || c.kind !== 'currency' || c.id !== 'gold') continue;
    const gold = Number(c.amount);
    if (!(Number.isFinite(gold) && gold > 0)) continue;
    if (!Array.isArray(o.grant) || o.grant.length !== 1) continue;
    const g = o.grant[0];
    if (!g || g.kind !== 'item' || typeof g.id !== 'string') continue;
    const amount = Number(g.amount);
    if (!(Number.isSafeInteger(amount) && amount > 0)) continue;
    const unit = gold / amount;
    if (!Object.prototype.hasOwnProperty.call(out, g.id) || unit < out[g.id]) out[g.id] = unit;
  }
  return Object.freeze(out);
}
