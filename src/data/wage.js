// ════════════════════════════════════════════════════════════════════════
// src/data/wage.js — THE WAGE'S TWO LEVERS (lane/w-wage, backend-architect, 2026-11-22; 04-math-strategy.md section 11)
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
// CALIBRATED (lane/w-wage, 2026-11-22; tools/balance-program/redesign/w/fit.mjs prints the whole table from the kept reports):
//   THE LEVEL. A reference hour on Steady as the game plays it today, the mixed MID four on the Danger scale's one ground (Muster Barrows)
//     from a held start, 6 seeds x 8 h (MEASURED, v1-climb.mjs): Level 60 holds step 581 and pays 4,797 an hour, Level 63 holds 590 and
//     pays 4,906, Level 70 holds 619 and pays 5,055. wageBase is set so wage(60), wage(63), wage(70) meet those three (pay / wage 0.99 to 1.0).
//   THE SLOPE. The same four on its own ground across Levels 20 to 400, the Lab's pinned baseline (overhaul-start, Normal, 8 seeds a
//     cell), fitted in logs and weighted by the hours each Level takes in the Level hours table: 0.39% a step, rounded to 0.4% (inside
//     04's search range of 0.2% to 0.5%). The old tier pays about 1.7x the scale at the same Level, so only its shape is read.
//   OUT OF BAND, NAMED: the scale played on grounds that carry no reference step yet (a what-if) pays 1.5x to 1.9x the wage at Levels 88
//     and 145 (the four died there, so it is not a Steady hour) and 0.34x at Level 400 (content ends at the Catacombs; past it the wage
//     is the law, not a measurement).
// STARTING VALUES, NOT RULINGS: in band is enough (Tyler 2026-11-21).
//
// WHICH STEP EACH PRICE READS (Tyler 2026-11-22, "some things, like stamina, should be based off of level"):
//   per-hero costs read wage(levelStep(L)), the hero's LEVEL: bought hunting blocks, bought work blocks (the R12 hook), and later
//     Talent resets and the death cost;
//   goods and gear read wage(step) at DEPTH, the good's band step or the piece's item step: 13-market's V, fees, Temper, carry-over (wave 4).
//
// payStepCoin and the engine's PAY.payStepCoin (src/data/danger.js). That one is how much more coin a pull pays one Danger step deeper
// INSIDE one ground (0.7%); this one is how the reference hour's pay grows a Level ACROSS grounds. 04 means them to be one number once
// grounds carry absolute steps (wave 2). Until then they are two levers, each with its own row (econ.wage-step, danger pay).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const WAGE = Object.freeze({
  /* LEVER (econ.wage-base): the wage at step 0, gold an hour (wage(60) = 4,828: the scale's reference hour at Level 60). */
  wageBase: 3800,
  /* LEVER (econ.wage-step): the wage's growth a step (04 section 11's search range 0.2% to 0.5%). */
  payStepCoin: 0.004,
});
