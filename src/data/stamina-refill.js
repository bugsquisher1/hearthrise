// ════════════════════════════════════════════════════════════════════════
// src/data/stamina-refill.js — BUYING STAMINA WITH GOLD (Tyler 2026-10-18)
//
// Tyler's rules: a purchase restores up to 4 h; never above the character's
// cap (src/data/hunt-sessions.js STAMINA_MAX_MS: 8 h free / 12 h premium); a
// partial refill is priced pro rata to the stamina actually restored; every
// purchase, partial ones included, counts toward the price escalation. Gold
// only, never gems or Hearth Tokens (no pay-to-win: real money buys no hunt
// time). Server-owned: a backend lane writes the RPC from these rows
// (ARCHITECTURE_CONTRACTS §stamina (b): add at coalesce(settled_to, now())
// under the hunt lock, the per-day count from the ledger intent
// `stamina_refill`); it is a money surface for the reopen Security review.
//
// THE FORMULA WE SCALED FROM (Huntera, measured 2026-09-18 from the live
// dialog, memory huntera-bestiary-model): refill n of the day costs
//   (1,712,500 + 5,250 x level) x (1 + (n - 1) x 2/15), floored,
// buys 4 h, 6 a day, so a full day of six is exactly 8.0 x the base.
// WE KEEP ITS SHAPE (a base plus a per-level term, the same linear +2/15 a
// purchase, the same 4 h and 6 a day) and cut the gold about 4,000-fold.
// Why so much lower: our economy rule is that common drops + gold about pay a
// hunt's supplies, and profit comes from rares. Measured on the S1 engine, a
// fresh melee hero earns about 1,500 g an hour (691 g coins + 793 g common
// drops, mill_cellar fixture). A refill is time, not a supply, so it should
// cost a fraction of the hour it buys, never a day's wage: at combat level 3
// the first 4 h costs 700 g, under half an hour of that hero's income.
//
// THE PRICE, integer only (the server computes it; the client only shows it):
//   restoredMin = min(maxMinPerBuy, capMin - currentMin)   (refused if <= 0)
//   n           = purchases already made this server (UTC) day + 1  (refused past perDay)
//   price = ceil( (base + perLevel x combatLevel) x (stepDen + stepNum x (n - 1)) x restoredMin
//                 / (stepDen x maxMinPerBuy) )
// combatLevel is src/core/xp.js combatLevel (server: hr_lb_combat_level) at the
// instant of the purchase.
//
// WORKED EXAMPLES (combat levels stated):
//   1. Free, combat 10, 0 h, 1st buy today: restores 4 h (cap 8 h).
//      (400 + 1,000) x 15/15 x 240/240 = 1,400 g.
//   2. Free, combat 10, 6 h, 2nd buy today: restores 2 h (8 h cap - 6 h).
//      ceil(1,400 x 17/15 x 120/240) = ceil(793.3) = 794 g. Counts as buy 2.
//   3. Premium, combat 50, 5 h, 3rd buy today: restores 4 h (cap 12 h).
//      (400 + 5,000) x 19/15 x 240/240 = 6,840 g.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const STAMINA_REFILL = Object.freeze({
  /* Gold of the first full refill of the day, before the level term. */
  base: 400,
  /* Gold per combat level on that price (Huntera: 5,250 on 1,712,500). */
  perLevel: 100,
  /* Most stamina one purchase restores, in whole minutes (4 h). */
  maxMinPerBuy: 240,
  /* Purchases per character per server day, partial ones included. */
  perDay: 6,
  /* Escalation: purchase n costs (stepDen + stepNum x (n - 1)) / stepDen of the
     first, linear, the Huntera curve (2/15 a purchase; 6 buys = 8.0 x base). */
  stepNum: 2,
  stepDen: 15,
  /* What resets the escalation and the per-day count: the UTC server day. */
  resets: 'utc_day',
  /* What pays: gold only. */
  currency: 'gold',
});

/** The gold a purchase costs, or null when it buys nothing or the day is spent. Integers in, integer out. */
export function refillPrice({ combatLevel, currentMin, capMin, boughtToday }) {
  const R = STAMINA_REFILL;
  const restored = Math.min(R.maxMinPerBuy, Math.floor(capMin) - Math.floor(currentMin));
  const n = Math.floor(boughtToday) + 1;
  if (!(restored > 0) || n > R.perDay) return null;
  const lv = Math.max(1, Math.floor(combatLevel));
  const num = (R.base + R.perLevel * lv) * (R.stepDen + R.stepNum * (n - 1)) * restored;
  const den = R.stepDen * R.maxMinPerBuy;
  return { restoredMin: restored, n, price: Math.ceil(num / den) };
}

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const R = STAMINA_REFILL;
  for (const k of ['base', 'perLevel', 'maxMinPerBuy', 'perDay', 'stepNum', 'stepDen']) {
    if (!Number.isInteger(R[k]) || R[k] <= 0) out.push(k + ' must be a positive integer, got ' + R[k]);
  }
  if (R.maxMinPerBuy > 240) out.push('a purchase restores at most 4 h (Tyler 2026-10-18)');
  if (R.resets !== 'utc_day') out.push('the escalation resets on the UTC server day');
  if (R.currency !== 'gold') out.push('stamina is bought with gold only');
  return out;
}
