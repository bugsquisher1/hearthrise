// ════════════════════════════════════════════════════════════════════════
// src/data/talent-reset.js — THE PRICE OF CHANGING A HERO'S TALENTS (lane/level-costs, backend-architect, 2026-11-22;
//   docs/design/redesign/02-architecture.md section 1b, 04-math-strategy.md section 11 "Talent resets", 10-premium.md row 1).
//
// A hero drafts Talent changes for free and pays once when the draft (or a saved build) is applied, whether one point moves or the
// whole build. 04 section 11:
//
//   price of a reset (gold) = resetHours x wage(L) x resetGrowth ^ n      n = resets this hero has PAID for this server (UTC) day
//
// wage(L) is the wage at the hero's LEVEL (src/core/wage.js levelStep: Tyler 2026-11-22, a per-hero cost reads the Level), so the price
// grows with Level through the wage and with each paid reset that day through the growth: 0.5, 1, 2, 4 hours of wage at the starting
// values, against the 7.5 a 10 h day nets. FREE, and not counted in n: a new hero's first reset ever, and with Premium each hero's
// first reset of the server day (Tyler 2026-11-22: "one free talent respec per day per character"), so the next is priced as a free
// hero's first. A reset moves points and never adds one; the gold is burned (a sink that grows with Level).
//
// THE RULE: src/core/wage.js resetPrice. The server's copy: hr_level_costs (tools/gen-level-costs.mjs), its twin hr_talent_reset_price,
// and the verb hr_talent_reset (NNNN-level-costs.sql), which is DARK until Talents exist: no client role may run it, and the Talents lane
// grants it in the change that gives a reset something to move.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const TALENT_RESET = Object.freeze({
  /* LEVER (econ.reset-hours): a reset's price in permille of an hour of wage at the hero's Level (04 section 11: 0.5 h, band 0.25 to 1) */
  hoursPm: 500,
  /* LEVER (econ.reset-growth): each paid reset that day costs growthNum / growthDen of the one before (04: 2, band 1.5 to 3) */
  growthNum: 2,
  growthDen: 1,
  /* Paid resets a hero may make a server day. A blast radius, not a balance number: at growth 2 the 16th already costs 16,384 hours of
     wage, and past it a price could leave a safe integer at the last step (tools/gen-level-costs.mjs refuses one that does). */
  perDay: 16,
});

/** Every problem with the table, as strings. Empty = valid. */
export function validate(R = TALENT_RESET) {
  const out = [];
  for (const k of ['hoursPm', 'growthNum', 'growthDen', 'perDay']) if (!Number.isInteger(R[k]) || R[k] <= 0) out.push('TALENT_RESET.' + k + ' must be a positive integer, got ' + R[k]);
  if (Number.isInteger(R.growthNum) && Number.isInteger(R.growthDen) && R.growthNum < R.growthDen) out.push('a later reset never costs less than the one before it');
  if (Number.isInteger(R.perDay) && R.perDay > 64) out.push('TALENT_RESET.perDay ' + R.perDay + ' is past any day a player plays');
  return out;
}
