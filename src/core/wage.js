// ════════════════════════════════════════════════════════════════════════
// src/core/wage.js — THE WAGE, AND THE PRICES WRITTEN IN HOURS OF IT (lane/w-wage, backend-architect, 2026-11-22;
//   docs/design/redesign/04-math-strategy.md section 11, 09-crafting.md sections 2.5 and 4.1, 13-market.md section 3.2).
//
// THE WAGE is the gold one reference hunted hero-hour pays at a step: a hero of the reference company (a mixed four, MID gear, the
// Steady stance) hunting its own ground. It is a formula the server computes, never a simulator output, so a price written in hours of
// it is felt the same at Level 20 and at Level 2,000 (04: "every repeating price is stored as hours of the wage at the buyer's step"):
//
//   wage(step) = floor(wageBase x (1 + payStepCoin) ^ step)    gold an hour; step 1 at least, DANGER.stepMax at most
//
// ONE FUNCTION, wage(step). 04 writes wage(L) for a hero and 13-market wage(step) for a band or an item; they are one function because a
// hero of Level L whose kit is at Level holds step L (04 section 1). A hero's price passes its Level, a stack its band's step, a piece its
// item's step (src/data/wage.js says why a wave-1 Danger step is not one of these).
//
// The power is walked by squaring (src/data/wage.js, re-exported here; multiplications only, each exactly rounded in IEEE 754), so the edge, the browser and
// Postgres's float8 twin (hr_wage, tools/gen-time-blocks.mjs) reach the same last bit, and floor makes it whole gold. Past DANGER.stepMax
// (the Danger scale's last step, where every number is still a safe float) the wage stops growing, so no price can overflow a bigint.
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
// hours of wage for the day's four. It joins TIME_BLOCKS only with its own verb (time-blocks.js SOLD_KINDS says why).
//
// PURE ESM, dual-runtime (src/core: the edge vendors it). No clock, no randomness.
// ════════════════════════════════════════════════════════════════════════
import { wage, wageStep } from '../data/wage.js';
import { TIME_BLOCKS } from '../data/time-blocks.js';
import { DANGER_GROUNDS, PAY } from '../data/danger.js';

/* THE CURVE (wageStep, wage) lives beside its levers in src/data/wage.js since lane/econ-levers (2026-11-22), so a data row priced in
   hours of wage (the store's basics, src/data/supply-basics.js) reads the same one function; this module re-exports it. */
export { wageStep, wage } from '../data/wage.js';

/** The step a hero's LEVEL is priced at: the reference company of Level L holds step L (04 section 1). Every per-hero cost reads it. */
export function levelStep(level) {
  return wageStep(level);
}

/**
 * THE WAGE STEP A DANGER HOLD PAYS AT (lane/econ-followups, 2026-11-22): a good priced by DEPTH (Tyler 2026-11-22) reads the wage at the
 * depth a hunt stands at. Wave 1's Danger step counts from each ground's own rows (src/data/wage.js: Muster's reference step 590 is not
 * Level 590; wage(590) is 8x a Level 60 hour), so this is the bridge to the wage's one unit until wave 2 cuts the bands in it:
 *   depthStep = gearLevel + min(step - refStep, PAY.gapMax), held to 1..stepMax (wageStep)
 * gearLevel is the absolute step of the ground's reference depth: refStep was measured on the company whose kit is the ground's base item
 * Level (src/data/danger.js DANGER_GROUNDS: "the power step is 0 at it"), and a company of kit Level X holds step X (04 section 1). Inside
 * a ground one Danger step pays the wage's coin ratio (danger.js PAY: one coin ratio a step), so each step over or under the reference is
 * one wage step; past gapMax a kill pays no more, and the price stops with it. (Under the reference the pay floor PAY.floor holds a kill's
 * coin from about 173 steps down; on today's ground that is under wage step 1, where wageStep already holds it.) Null off the scale.
 * The server's twin is hr_store_step (supabase/migrations/1062-store-step.sql).
 */
export function depthStep(groundId, step) {
  const g = Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, groundId) ? DANGER_GROUNDS[groundId] : null;
  if (!g || !Number.isFinite(step)) return null;
  return wageStep(g.gearLevel + Math.min(Math.floor(step) - g.refStep, PAY.gapMax));
}

/**
 * THE STEP A STORE USE IS PRICED AT (the buyer's store step; store-kit.js storePriceOf): on the Danger scale the depth the hunt stands at
 * as the settle window opens (`hunt` a scale ground and `step` the stored world's step, else the step the hunt froze at), off it the
 * hero's Level. A party's heroes share the window's depth, so they share its price.
 */
export function storeStepOf({ hunt = null, step = null, level }) {
  const d = hunt !== null && step !== null ? depthStep(hunt, step) : null;
  return d !== null ? d : levelStep(level);
}

/** The gold block `n` (1 for the day's first) of a bought-time `row` costs a hero of Level `level`, or null past the row's day cap. */
export function blockPriceOf(row, level, n) {
  const k = Math.floor(n);
  if (!row || !(k >= 1) || k > row.perDay) return null;
  const num = BigInt(row.blockMin) * BigInt(row.priceHourPm) * BigInt(wage(levelStep(level))) * BigInt(row.growthNum) ** BigInt(k - 1);
  const den = 60000n * BigInt(row.growthDen) ** BigInt(k - 1);
  return Number((num + den - 1n) / den);
}

/** The gold block `n` of the day of `kind` (a TIME_BLOCKS row) costs a hero of Level `level`, or null (no such kind, or past the cap). */
export function blockPrice({ kind, level, n }) {
  return blockPriceOf(Object.prototype.hasOwnProperty.call(TIME_BLOCKS, kind) ? TIME_BLOCKS[kind] : null, level, n);
}
