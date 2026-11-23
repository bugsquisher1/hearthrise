// ════════════════════════════════════════════════════════════════════════
// src/data/blessings.js — THE BLESSING: PROTECTION FROM WHAT A DEATH TAKES (lane/level-costs, backend-architect, 2026-11-22)
//
// THE REDESIGN (docs/design/redesign/02-architecture.md package 6: "Blessings. One simple price that grows with Level. Safety is a gold
// sink, not a puzzle"; Tyler 2026-11-22: per-hero costs read the wage at the hero's LEVEL, and the Blessing numbers are the designer's
// call). ONE Blessing replaces the three tiers (25 / 50 / 75%) and the ladder of S-5:
//   the cut     a held Blessing removes cutPm of what one death takes, Level XP and every combat skill's progress alike
//               (src/core/action-rules.js deathXpLoss; the server cuts the engine's proposal, hr_blessing_take);
//   the price   hoursPm of an hour of the wage at the hero's Level (src/core/wage.js blessingPrice), free under freeUntilLevel;
//   used up     by the death it cuts; bought again after (a Blessing bought during a hunt counts from the browser's seed horizon,
//               1005-lever-horizon.sql, so no death the screen already showed can be cut).
// Only Bold can die (RD-Q3 a: Careful and Steady fall back first), so a Blessing is what a Bold player buys to make the risk cheaper.
//
// THE NUMBERS (MEASURED on the real engine, lane/level-costs, tools/balance-program/redesign/v1-climb.mjs, the mixed MID four on Muster
// Barrows from a held start, 6 seeds x 10 h, Levels 60 and 70; the reading is in docs/design/redesign/04-math-strategy.md section 11):
//   cutPm 500     Bold's deaths on a 10 h day take SEE 04 of the day's Level XP; half of that keeps Bold behind Steady over a day
//                 (12-targets C-4: Steady beats Bold over a 10 h day) while a blessed Bold death no longer costs a whole session's lead
//   hoursPm 1000  one hour of wage: a Level 60 Blessing costs 16,365 gold (a Steady hour there pays about 16,300). It saves cutPm x
//                 the death's 7.5 hours of progress (hunt-sessions.js DEATH_HOURS), so a Blessing is worth buying for a Bold player
//                 (3.75 hours saved for one hour's coin, about 1.4 hours of net coin) and is a real sink that grows with Level
//   freeUntilLevel 30  a young hero's death costs under 2.5 hours (the share rule), and its wage-priced Blessing would cost more coin
//                 than its own hours pay: the first thirty Levels learn Bold for free
// STARTING VALUES, NOT RULINGS: in band is enough (Tyler 2026-11-21).
//
// The server's copy is hr_level_costs (tools/gen-level-costs.mjs); hr_blessing_take, hr_blessing_buy and the `blessings` section read it.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const BLESSING = Object.freeze({
  /* LEVER (progress.bless-cut): the share of one death's loss (Level XP and every combat skill's progress) a held Blessing removes */
  cutPm: 500,
  /* LEVER (econ.bless-hours): the Blessing's price in permille of an hour of the wage at the hero's Level */
  hoursPm: 1000,
  /* LEVER (econ.bless-free): the Blessing is free under this Level */
  freeUntilLevel: 30,
});

/** Every problem with the row, as strings. Empty = valid. */
export function validate(B = BLESSING) {
  const out = [];
  for (const k of ['cutPm', 'hoursPm', 'freeUntilLevel']) if (!Number.isInteger(B[k]) || B[k] < 0) out.push('BLESSING.' + k + ' must be a whole number, got ' + B[k]);
  if (Number.isInteger(B.cutPm) && (B.cutPm < 1 || B.cutPm > 1000)) out.push('BLESSING.cutPm must remove some of a death and never more than all of it, got ' + B.cutPm);
  if (Number.isInteger(B.hoursPm) && B.hoursPm < 1) out.push('BLESSING.hoursPm: a Blessing past its free Level costs something');
  return out;
}
