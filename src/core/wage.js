// ════════════════════════════════════════════════════════════════════════
// src/core/wage.js — THE WAGE, AND THE PRICES WRITTEN IN HOURS OF IT (lane/w-wage, backend-architect, 2026-11-22;
//   docs/design/redesign/04-math-strategy.md section 11, 09-crafting.md sections 2.5 and 4.1).
//
// THE WAGE is the gold one reference hunted hero-hour pays at a Level: a hero of the reference company (a mixed four, MID gear, the
// Steady stance) hunting its own ground. It is a formula the server computes, never a simulator output, so a price written in hours of
// it is felt the same at Level 20 and at Level 2,000 (04: "every repeating price is stored as hours of the wage at the buyer's step"):
//
//   wage(L) = floor(wageBase x (1 + payStepCoin) ^ L)        gold an hour, L the hero's Level (1 at least, DANGER.stepMax at most)
//
// Its two levers live in src/data/wage.js with their evidence. The power is walked by squaring (multiplications only, each exactly
// rounded in IEEE 754), so this file, the edge, the browser and Postgres's float8 twin (hr_wage, tools/gen-time-blocks.mjs) reach the
// same last bit; floor then makes it a whole number of gold. Past DANGER.stepMax (the Danger scale's last step, where every number is
// still a safe float) the wage stops growing, so no price can overflow a bigint.
//
// BOUGHT TIME (04 section 11, one rule for hunting and town work): block n of a kind (1 for the day's first) at Level L costs
//
//   ceil(blockMin / 60 x priceHourPm / 1000 x wage(L) x (growthNum / growthDen) ^ (n - 1))      null past the day's cap
//
// in exact integers (BigInt here, numeric in hr_time_block_price), from the kind's row (src/data/time-blocks.js). At the starting
// values a hunting block is 2 h at 2.0 hours of wage an hour: the day's first costs 4 hours of wage, about twice what its 2 h pay.
//
// THE WORK-BLOCK HOOK (lane R12, FB-10): blockPriceOf prices ANY row of the same shape, so bought town work is one row, not new code.
// 04's starting row for it is { blockMin: 120, priceHourPm: 500, growthNum: 3, growthDen: 2, perDay: 4 }: 1.0, 1.5, 2.25 and 3.375
// hours of wage for the day's four. It joins TIME_BLOCKS only with its own verb (time-blocks.js validate says why).
//
// PURE ESM, dual-runtime (src/core: the edge vendors it). No clock, no randomness.
// ════════════════════════════════════════════════════════════════════════
import { WAGE } from '../data/wage.js';
import { DANGER } from '../data/danger.js';
import { TIME_BLOCKS } from '../data/time-blocks.js';

/* r ^ n for a whole n >= 0, by squaring: the same multiplications in the same order as hr_wage's loop */
function powSquare(r, n) {
  let out = 1, b = r, k = n;
  while (k > 0) { if (k % 2 === 1) out *= b; b *= b; k = Math.floor(k / 2); }
  return out;
}

/** The Level the wage reads: a whole Level, 1 at least, DANGER.stepMax at most. */
export function wageLevel(level) {
  const L = Number.isFinite(level) ? Math.floor(level) : 1;
  return Math.min(DANGER.stepMax, Math.max(1, L));
}

/** The wage: whole gold one reference hunted hero-hour pays at Level `level`. */
export function wage(level) {
  return Math.floor(WAGE.wageBase * powSquare(1 + WAGE.payStepCoin, wageLevel(level)));
}

/** The gold block `n` (1 for the day's first) of a bought-time `row` costs at Level `level`, or null past the row's day cap. */
export function blockPriceOf(row, level, n) {
  const k = Math.floor(n);
  if (!row || !(k >= 1) || k > row.perDay) return null;
  const num = BigInt(row.blockMin) * BigInt(row.priceHourPm) * BigInt(wage(level)) * BigInt(row.growthNum) ** BigInt(k - 1);
  const den = 60000n * BigInt(row.growthDen) ** BigInt(k - 1);
  return Number((num + den - 1n) / den);
}

/** The gold block `n` of the day of `kind` (a TIME_BLOCKS row) costs a hero of Level `level`, or null (no such kind, or past the cap). */
export function blockPrice({ kind, level, n }) {
  return blockPriceOf(Object.prototype.hasOwnProperty.call(TIME_BLOCKS, kind) ? TIME_BLOCKS[kind] : null, level, n);
}
