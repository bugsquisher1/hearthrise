// ============================================================
// src/core/formulas/sale.js — WHAT THE SHOP PAYS FOR ONE ITEM. The only function that prices a sale.
//
//   worth = worn gear ? max(1, floor(book x the gear rate of its tier)) : book
//   bid   = raw material ? max(1, floor(worth x rawRate)) : worth
//   price = the shop sells it ? min(bid, max(1, floor(buybackRate x its cheapest shop price))) : bid
//
// Numbers: src/data/formulas/sale.js (SALE and the gear ladder). None is typed here
// (tests/formula-single-source.mjs). Readers: the edge's sell verbs through catalogue.js vendorPriceOf, which
// only looks the item and its shop price up; tools/gen-hunt-sessions.mjs, which copies every bid into
// hr_hunt_vendor_value so Postgres re-proves a hunt's sales; the balance tools. The client draws the server's
// bids (hr_shop_view) and never calls this to price anything it sends.
//
// `book` and `v` are untouched by a sale: market listings and the Hunt analyzer keep reading book value.
// Floored at 1: something worth anything at all still sells for something.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { SALE } from '../../data/formulas/sale.js?v=0.2.114';
import { VENDOR_GEAR_RATES, VENDOR_GEAR_TYPES, VENDOR_HOURLY_ARMOR_SLOTS, VENDOR_HOURLY_ARMOR_T2_RATE, VENDOR_HOURLY_ARMOR_TIER } from '../../data/formulas/sale.js?v=0.2.114';

/** The share of book value the shop pays for `item` if it is worn gear, else 1: its tier's rate on the ladder (a tier past the ladder reads the
    last rate, a piece with no tier the first), and the hourly armor's own rate for that tier's helmet, body, legs and boots. */
export function gearSaleRate(item) {
  if (!item || !VENDOR_GEAR_TYPES.includes(item.type)) return 1;
  const t = Math.max(1, Math.floor(Number(item.tier) || 1));
  if (t === VENDOR_HOURLY_ARMOR_TIER && item.type === 'armor' && VENDOR_HOURLY_ARMOR_SLOTS.includes(item.slot)) return VENDOR_HOURLY_ARMOR_T2_RATE;
  return VENDOR_GEAR_RATES[Math.min(t, VENDOR_GEAR_RATES.length) - 1];
}

/**
 * Gold the shop pays for ONE of `item`. 0 means the shop does not buy it, which is a refusal, never a free sale.
 * @param item      the item's row (src/data/items.js), or anything else for 0
 * @param shopUnit  the cheapest price the shop sells one for, or 0 / undefined when it sells none
 */
export function salePriceOf(item, shopUnit) {
  if (!item || typeof item !== 'object') return 0;
  const book = Number(item.v) || 0;
  if (!(book > 0)) return 0;
  const v = VENDOR_GEAR_TYPES.includes(item.type) ? Math.max(1, Math.floor(book * gearSaleRate(item))) : book;
  const bid = item.raw ? Math.max(1, Math.floor(v * SALE.rawRate)) : v;
  return shopUnit > 0 ? Math.min(bid, Math.max(1, Math.floor(SALE.buybackRate * shopUnit))) : bid;
}
