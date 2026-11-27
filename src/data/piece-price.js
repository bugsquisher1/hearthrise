// ════════════════════════════════════════════════════════════════════════
// src/data/piece-price.js — WHAT A TRAIT PIECE IS WORTH, THE LEVERS (backend-architect, lane/t1b-piece-verbs, 2026-11-26;
// docs/design/redesign/13-market.md section 3.2 "V for a piece", its levers in section 5).
//
//   V = sharePm / 1000 x rarityHours x wage(item Level) x (1 + rankValuePm / 1000 x (top rank - 1))
//
// rarityHours is the rarity's "one in about N hunted hours" (src/data/drop-hours.js DROP_HOURS.rarity), the top rank the piece's highest
// Trait's (a Signature carries none: 1). The store buys a piece at its floor share of V (src/data/trades.js TRADE_LEVERS.store.floorShare;
// 20-v030 section 1.2: "Trait pieces are kept, carried over or sold to the store"). src/core/piece-value.js prices it; its SQL twin is
// generated (tools/gen-piece-value.mjs), so the store's price is typed once.
//
// STARTING VALUES, NOT RULINGS (13-market section 5): sharePm 100, rankValuePm 250. PURE ESM. Data only, no import.
// ════════════════════════════════════════════════════════════════════════

export const PIECE_VALUE = Object.freeze({ sharePm: 100, rankValuePm: 250 });
