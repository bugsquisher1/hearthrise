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
// The gear ladder (what worn gear sells for by tier) is below, moved here from src/data/loot-bands.js after Phase 0's
// tiers 4 to 6 joined it: ONE row the edge's sell verbs, the Shop's bids, Dispatch loot and the bench tax all price
// from (the last three through hr_hunt_vendor_value, which tools/gen-hunt-sessions.mjs writes from this row by calling
// the same function). The formula that reads all of it is src/core/formulas/sale.js salePriceOf; its public row is
// `sale.price` in ./registry.js. BALANCE numbers: the Game Designer's.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const SALE = Object.freeze({
  rawRate: 0.20,
  buybackRate: 0.5,
});

/* WHAT WORN GEAR SELLS FOR (Tyler 2026-10-23: keep the Scarce pace and meet the value caps through what dropped gear
   sells for). The trader pays a share of a weapon's, armour's, off-hand's or jewel's book value (`v`), floored at 1,
   by the piece's TIER, one price per item wherever it came from; the shop buy-back cap still applies on top
   (src/core/formulas/sale.js salePriceOf). Book value itself is untouched. By tier because the pace is
   the same on every ground (about a piece an hour per slot per weight) while book value climbs 2-4x a tier and coin
   barely moves (DM-16): tier 3 sells at 0.14 so the Warrens' gear stays under half its coin, as tiers 1-2 do at 0.5,
   and every piece still sells for at least its lower-tier twin (drop-tables sale-ladder; the designer, 2026-10-23).
   A tier above the table (no ground drops one yet) sells at its last rate; a piece with no tier at tier 1's. Measured
   against the caps by tests/hunt-core/drop-tables.mjs. PROVISIONAL. */
/* TIER 4 (designer 2026-11-08, lane/b-phase0-tier4; the 10-29 plan's 0.075): the Slake, the first tier-4 ground, drops its set in three weights
   about hourly, and tier-4 book is 3x tier 3's. Measured on the real settle (drop-tables, a lone tank at the Slake's floor): at tier 3's 0.14 its
   gear sold for 57% of its coin and the hour totalled +36% over its pin; the window that holds both caps and the sale ladder is 0.047-0.107,
   and 0.075 sits in its middle.
   TIERS 5 AND 6 (designer 2026-11-08, the same lane, for the Pyre Field: tier-5 armor hourly, tier-6 weapons as its Provost's Rares). ONE LADDER
   from tier 4 up: each tier's piece sells for about 1.3x its lower-tier twin while book climbs about 3x a tier (tier 5 45/15, tier 6 130/45), so
   the rate is the last one x 1.3 / that climb: tier 5 0.033 (the twin rule's floor is 0.025, the Pyre Field's faucet cap 0.05), tier 6 0.015
   (its window about 0.01-0.016). Tier 7 reads tier 6's until a ground drops it (2.8x the book, so its piece still sells above its twin). */
export const VENDOR_GEAR_RATES = Object.freeze([0.5, 0.5, 0.14, 0.075, 0.033, 0.015]);
export const VENDOR_GEAR_TYPES = Object.freeze(['weapon', 'armor', 'offhand', 'jewelry']);
/* THE GLADE'S ARMOR SELLS UNDER THE WARRENS' (designer 2026-11-03, lane/c-gold-matters; Tyler the same day: harder monsters pay more).
   Tier 2's helmet, body, legs and boots come about hourly in three weights on Wickstead, the Sewer and the Glade, and at 0.5 of book an Iron
   Platebody sold for 200 g against a Steel one's 210 g: the flood of the hours when gold goes dead, and no reward for the harder ground. At 0.3
   the plate line reads 90 / 120 / 210 and every piece still clears its lower-tier twin (drop-tables sale-ladder). Tier 2's weapons, shield,
   jewels, gloves and belts keep the table: a player forges those to sell (tests/craft-wages.mjs W-FORGE) and the outfitter's belt and gloves
   hold those twins' bids up. Tiers 1 and 3 keep it too, so the starter grounds keep their gold (Tyler 10-20) and the Warrens pay what they paid. */
export const VENDOR_HOURLY_ARMOR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots']);
export const VENDOR_HOURLY_ARMOR_T2_RATE = 0.3;
/* The tier whose hourly armor sells at VENDOR_HOURLY_ARMOR_T2_RATE (it was typed inside the function until 2026-11-10). */
export const VENDOR_HOURLY_ARMOR_TIER = 2;
