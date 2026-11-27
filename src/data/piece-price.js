// ════════════════════════════════════════════════════════════════════════
// src/data/piece-price.js — WHAT A TRAIT PIECE IS WORTH, THE LEVERS (backend-architect, lane/t1b-piece-verbs, 2026-11-26;
// docs/design/redesign/13-market.md section 3.2 "V for a piece", its levers in section 5).
//
//   V = sharePm / 1000 x rarityHours x wage(item Level) x (1 + rankValuePm / 1000 x (top rank - 1))
//
// rarityHours is the rarity's "one in about N hunted hours" (src/data/drop-hours.js DROP_HOURS.rarity), the top rank the piece's highest
// Trait's (a Signature carries none: 1; a Very Rare reads its best Trait, as a wanted order matches one: 12-targets 8.7). The store buys a
// piece at floorSharePm of V (20-v030 section 1.2: "Trait pieces are kept, carried over or sold to the store"). src/core/piece-value.js
// prices it; its SQL twin is generated (tools/gen-piece-value.mjs), so the store's price is typed once.
//
// floorSharePm IS THE PIECE'S OWN FLOOR (the designer, lane/designer-calls-1127, 12-targets 8.7): 250, the lowest price the book will take
//   for a piece (13-market 2.7's piece band starts at 0.25 V), so a sale on the market always beats the store. A Rare the company will not
//   wear sells for one hour of pay at its item Level. MEASURED on the gold ledger (sinks/ledger.mjs, every Rare not carried sold): the
//   piece line is 1.6% of what the reference mints (Rares, v0.3.0) and 4.4% with the Very Rare and the Signature, the size of the stack
//   floor (09 5.5). Not the stack floor's 0.4 of TRADE_LEVERS.store: at 0.4 each rarity mints about 2.6% and the full ladder 6.9%, which
//   takes the ledger to 81.6% by day 180 (gate 7: 85 to 90). Search 0.2 to 0.4. Pieces sell outside storeBudget: that budget bounds idle
//   labor, which an account can always add, and a piece's supply is the drop table's hours, proven kill by kill on the server.
//
// STARTING VALUES, NOT RULINGS (13-market section 5): sharePm 100, rankValuePm 250. PURE ESM. Data only, no import.
// ════════════════════════════════════════════════════════════════════════

export const PIECE_VALUE = Object.freeze({ sharePm: 100, rankValuePm: 250, floorSharePm: 250 });
