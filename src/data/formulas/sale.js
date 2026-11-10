// ════════════════════════════════════════════════════════════════════════
// src/data/formulas/sale.js — WHAT THE SHOP PAYS: the sale rates with no other home.
//
// The one copy of both numbers (lane/b-formula-home, 2026-11-10; Tyler 2026-11-08: every formula lives in ONE
// data source). Until this file they were typed in the edge (supabase/functions/hr-accrue/catalogue.js), where
// no wiki, generator or client could read them without importing the server's payload.
//
//   rawRate      the share of book value the shop pays for a RAW material (items.js `raw`: what gathering and
//                the listed monster drops produce). 20% (b226): gathering makes about 300 items an hour at every
//                tier while book value climbs 2.77x a tier, so at full book a maxed gatherer out-earned every hunt
//                asleep. The rate makes gathering the material source and the market the best price for raws.
//   buybackRate  the most the shop pays for anything it also SELLS, as a share of its cheapest shop price. Half
//                (b565): before it a piece sold for 1,500 and bought back for 1,500, a buy and sell loop with no
//                loss. Buy then sell always loses at least half.
//
// The gear ladder (what worn gear sells for by tier) is the loot bands' own row, src/data/loot-bands.js
// VENDOR_GEAR_RATES. The formula that reads all of them is src/core/formulas/sale.js salePriceOf; its public row
// is `sale.price` in ./index.js. BALANCE numbers: the Game Designer's.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const SALE = Object.freeze({
  rawRate: 0.20,
  buybackRate: 0.5,
});
