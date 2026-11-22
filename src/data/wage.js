// ════════════════════════════════════════════════════════════════════════
// src/data/wage.js — THE WAGE'S TWO LEVERS AND ITS CURVE (lane/w-wage, backend-architect; lane/econ-levers; 2026-11-22; 04 section 11)
//
// src/core/wage.js reads them: wage(step) = floor(wageBase x (1 + payStepCoin) ^ step), the gold one reference hunted hero-hour pays
// at a step. A STEP is 04 section 1's absolute unit of power: a hero's Level (a hero whose gear and skill are at Level holds step L),
// a band's step, an item's step. It is NOT the engine's wave-1 Danger step, which counts from each ground's own rows (Muster Barrows'
// reference step 590 is not Level 590) until wave 2 re-cuts the bands in one unit. So today every caller passes a Level.
//
// WHAT "PAYS" MEANS. Coin dropped plus the loot an hour drops at the store's price (cell.mjs `income`), Rares and trophies left out (their
// price is the players'). That is what a bought hour must out-price ("pretty pricey": 04 section 11), and it is the hour's gross, before
// the supplies it burns.
//
// CALIBRATED (lane/w-wage, then lane/econ-levers, 2026-11-22; tools/balance-program/redesign/w/fit.mjs prints the whole table):
//   THE LEVEL. A reference hour on Steady, the mixed MID four on the Danger scale's one ground (Muster Barrows) from a held start,
//     6 seeds x 8 h (MEASURED, v1-climb.mjs): Level 60 pays 16,276 an hour, Level 63 16,562, Level 70 17,143 (pay / wage 0.99 to 1.01).
//     It moves WITH the scale's coin level (src/data/danger.js PAY.coinPm, 7000): lane W set 3,800 on the coin of 1000 (4,797 / 4,906 /
//     5,055), where a whole-gold store use could not price the kit at its share of the wage (src/data/store-kit.js says why). One lever
//     set, never moved alone (tests/econ-levers.mjs EL-PAY reads the kept reading against it).
//   THE SLOPE. The same four on its own ground across Levels 20 to 400, the Lab's pinned baseline (overhaul-start, Normal, 8 seeds a
//     cell), fitted in logs and weighted by the hours each Level takes in the Level hours table: 0.39% a step, rounded to 0.4% (inside
//     04's search range of 0.2% to 0.5%). Only its shape is read: the old tier's level is its own.
//   OUT OF BAND, NAMED: the scale played on grounds that carry no reference step yet (a what-if) pays 2.2x the wage at Levels 88 and 145
//     (the four died there, so it is not a Steady hour), 1.6x at 185 and 0.55x at Level 400 (content ends at the Catacombs; past it the
//     wage is the law, not a measurement). Each ground's own coin rows set its level until R10 gives it a reference step.
// STARTING VALUES, NOT RULINGS: in band is enough (Tyler 2026-11-21).
//
// WHICH STEP EACH PRICE READS (Tyler 2026-11-22, "some things, like stamina, should be based off of level"):
//   per-hero costs read wage(levelStep(L)), the hero's LEVEL: bought hunting blocks, bought work blocks (the R12 hook), and later
//     Talent resets and the death cost;
//   goods and gear read wage(step) at DEPTH, the good's band step or the piece's item step: 13-market's V, fees, Temper, carry-over (wave 4).
//
// ONE COIN RATIO A STEP (lane/econ-levers, 2026-11-22; 04 section 11: "payStepCoin is its own lever and likely smaller than the XP
// ratio"). payStepCoin is both how the reference hour's pay grows a Level ACROSS grounds and how much more coin a pull pays one Danger
// step deeper INSIDE a ground (src/core/hunt/danger.js reads it here; the engine's own 0.7% coin ratio is gone). Coin grows 0.4% a step,
// XP 0.7% (danger.js PAY.payStepXp): gold must not inflate as fast as XP grows, and a far hero must not buy a whole early market.
//
// THE CURVE lives here, beside its levers, so a data row priced in hours of wage (the store's basics, supply-basics.js) reads the one
// function; src/core/wage.js re-exports it with the bought-time prices. The power is walked by squaring (multiplications only, each
// exactly rounded in IEEE 754), so the browser, the edge and Postgres's float8 twin (hr_wage) reach the same last bit.
//
// PURE ESM. Data and pure arithmetic only.
// ════════════════════════════════════════════════════════════════════════
import { DANGER } from './danger.js';

export const WAGE = Object.freeze({
  /* LEVER (econ.wage-base): the wage at step 0, gold an hour (wage(60) = 16,365: the scale's reference hour at Level 60). */
  wageBase: 12880,
  /* LEVER (econ.wage-step): the coin ratio a step, across grounds and inside one (04 section 11's search range 0.2% to 0.5%). */
  payStepCoin: 0.004,
});

/* r ^ n for a whole n >= 0, by squaring: the same multiplications in the same order as hr_wage's loop */
function powSquare(r, n) {
  let out = 1, b = r, k = n;
  while (k > 0) { if (k % 2 === 1) out *= b; b *= b; k = Math.floor(k / 2); }
  return out;
}

/** The step the wage reads: whole, 1 at least, DANGER.stepMax at most (anything else reads as 1). */
export function wageStep(step) {
  const s = Number.isFinite(step) ? Math.floor(step) : 1;
  return Math.min(DANGER.stepMax, Math.max(1, s));
}

/** The wage at DEPTH: whole gold one reference hunted hero-hour pays at `step` (a band's step, an item's step; 13-market's V). */
export function wage(step) {
  return Math.floor(WAGE.wageBase * powSquare(1 + WAGE.payStepCoin, wageStep(step)));
}
