// ════════════════════════════════════════════════════════════════════════
// src/data/amount.js — THE AMOUNT PIPELINE'S NUMBERS: THE FIGHT IN STEPS (lane/stage3-pipeline, 2026-11-23).
//
// docs/design/redesign/27-formula-overhaul.md stage 3 (rows D-1 to D-8) and 04-math-strategy.md sections 1 to 3 and 12: "Every amount in the
// game goes through one function with four stages, in a fixed order, and each stage can be traced":
//   1. base share        the move's row (a blow's top share of the target's reference health, times the move's own share)
//   2. x s ^ gap         the two ratings (src/core/bands.js ratingPm), with every active conditional step added (src/core/power-ledger.js)
//   3. x the roll        one spread, rollSpreadPm, for every amount (a blow, a spell, a tick, a heal, a shield)
//   4. x reference scale the display curve (src/data/core-model.js VITALS, no armor bonus) of the Level the amount is read against
// rounded once. The engine half is src/core/hunt/amount.js; this file is every number it reads, one home each.
//
// ON THE DANGER SCALE ONLY (src/core/hunt/danger.js dangerOn). A tier hunt and every ground off the scale play the old chain (combat.js
// maxHit, the to-hit ratio, mitigation.js's armor chain) exactly as before, until stage 6 puts every ground on the scale and they go.
//
// THE BRIDGE (wave 1, until monsters are derived from the reference, stage 4, and bands are cut in absolute steps, stage 6). A monster's
// health and blow are still its row's at the step (danger.js dangerDial grows both by (1 + powerStep) a step), so on the scale:
//   a hero's blow at a monster  = moveShare x blowTopBp[weapon] / 10000 x refHealth(ground refLevel) x s ^ (offense - R) x roll
//   a monster's blow at a hero  = moveShare x its row's blow x pressurePm / 1000 x refHealth(hero Level) / refHealth(refLevel) x s ^ (R - defense) x roll
//   a heal or a shell           = moveShare x blowTopBp[weapon] / 10000 x refHealth(healer Level) x s ^ (offense - healer Level) x roll
// R is the reference company's rating on the ground (src/core/bands.js bandAbs refPm): the reference company is at a gap of 0 at the
// reference step by construction, and one step deeper is (1 + powerStep) on both sides, as before. A monster's row number is a share of the
// reference health of the Level the ground was built for (its refLevel): monster-formula writes it from role rows, this bridge reads it.
//
// THE LEVERS (each a row in tools/balance-program/levers.json):
//   hitRoll        27 K-2, THE ROLL TO HIT. true: a basic blow (hero or monster) first rolls today's to-hit ratio (src/data/to-hit.js), as
//                  0.3.0 ships; false: every blow lands, the end state (02 and 08: dodge and block are moves and Traits). A data switch,
//                  read on the scale only, because 0.3.0 keeps today's hit math until the matrix reads both (Tyler's release, 20)
//   rollSpreadPm   04 section 2 `rollSpread`: every amount rolls from (1000 - spread) to (1000 + spread) permille of its mean. One draw an
//                  amount. 200 (plus or minus 20%) is 04's JUDGMENT start: narrow, so danger is the monster's wind-up, not a dice roll
//   blowTopBp      D-1, A HERO'S BLOW: the top of a basic blow at a gap of 0 by weapon type, in hundredths of a percent of the reference
//                  health of the monster's Level (the mean is half of it, combat.js's 1-to-max blow). FITTED ONCE to today's reference company
//                  (MID kits at Level 60 on Muster Barrows, the weapon's own seat: sword 43, hammer 55, axe 44, bow 45, wand 63 and staff 58 over
//                  740 health; .scratch ref-blows, Hask's Ford at 52 reads the same within 0.6 points), so the reference fight starts where
//                  it was. A move's own share (abilities.js hitRange, healPm) multiplies it. The item Level moves it only through the rating
//   pressurePm     D-3, THE MONSTER SIDE'S CALIBRATION: what share of its row's blow a monster lands at a gap of 0. Today's armor chain took
//                  40 to 50% of a blow at the reference company (mitigation.js: a heavy front's absorb at its 60% cap, a medium back's 50%
//                  dodge, a light back's ward under the cap); the chain is gone on the scale, and this one number puts the reference
//                  company's damage taken back where it was. Stage 1's normalization (04 section 14) solves it by bisection on the engine
//   defenseSplit   D-3, ARMOR AND WARD: an armor piece spends its item Level between the two defense ratings by its weight, in steps
//                  added to its item Level on each: heavy more armor and less ward, light the reverse, medium even (04 section 2, three
//                  rows). In STEPS, not a share of the item Level: a share grew with the item Level, so the same plate was 15 steps of armor
//                  at item Level 60 and 75 at 300, and the scale test failed on it (MEASURED, stage3 scale cells). 15 is the share's size at
//                  the reference (1.25 x 60). A blow with an element (a spell, a necrotic or storm swing) reads ward; a plain blow reads
//                  armor. A piece with no weight (a weapon, jewelry, a shield, a cape) counts its item Level on both
//   critBp         D-8: a critical blow is no longer a second roll. A hero's crit chance c (gear, sets, Keen) is worth its mean,
//                  1 + c x (critMult - 1), as conditional steps in the gear slice (src/core/power-ledger.js, under conditionalStepsMax)
// Every other D-8 multiplier (the weapon weakness, bane, an element's bonus, a mark, a slow, the hero's resistances, Tempering) is turned
// into conditional steps the same way, by src/core/hunt/amount.js stepsOf (exact, no logarithm: the browser and the edge agree to the bit).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const AMOUNT = Object.freeze({
  hitRoll: true,
  rollSpreadPm: 200,
  blowTopBp: Object.freeze({ sword: 580, hammer: 740, axe: 595, ranged: 600, magic: 820, neutral: 580 }),
  pressurePm: 450,
  defenseSplit: Object.freeze({
    heavy: Object.freeze({ armorSteps: 15, wardSteps: -15 }),
    medium: Object.freeze({ armorSteps: 0, wardSteps: 0 }),
    light: Object.freeze({ armorSteps: -15, wardSteps: 15 }),
  }),
});
