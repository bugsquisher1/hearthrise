// ════════════════════════════════════════════════════════════════════════
// src/data/danger.js — THE DANGER SCALE'S NUMBERS (lane/v1-climb, the roadmap's probe V1).
//
// docs/design/redesign/02-architecture.md package 3 and 04-math-strategy.md sections 1, 7, 8 and 9: one integer Danger step in place
// of the three hand-picked tiers, a party that climbs it by itself inside a risk stance and falls back before it dies, and pulls that
// wait for the party to be ready. The engine half is src/core/hunt/danger.js; this file is every number it reads, one home each.
//
// A STEP IS ONE POWER STEP OF THE GROUND'S OWN PULL. Step 0 is the ground as built (its rows, its pockets' mean size). Each step up
// multiplies the pull's total health and total blow by (1 + powerStep) and a kill's Level XP by (1 + payStepXp). Part of that growth
// arrives as MORE monsters (pullShare): the pull's size is the as-built mean times (1 + powerStep)^(pullShare x step), rounded and held
// to a full box, and each monster carries the rest, so the rounding never puts a jump in the curve (a pull of 5 has each monster at
// 4/5 of what a pull of 4 has). A monster's aim and its Level (what armor and Defense training read) stay the row's: the step's growth
// is exactly the ratio, once, on health and once on blow, never twice through the to-hit or armor chain. Coin a kill is the row's
// (the server's kill bounds would refuse more: a wave-1 catalogue change, not this lane's).
//
// STARTING VALUES, NOT RULINGS (Tyler 2026-11-21: "a number inside its band is enough"):
//   powerStep 0.35%   04 section 1's worked value (its search range 0.25% to 0.5%)
//   payStepXp 0.7%    04 section 7's worked value (powerStep times a premium of two)
//   pullShare 0.5     STATED: 04 is silent on how a step splits between more monsters and stronger ones
//   respawnMs 15 s    STATED: short enough that six pockets never wait on it, so the pace is the party's (04 section 8), long enough
//                     that a cleared pack does not stand again on a party still resting on its pocket
// THE STANCES (02 package 3: "the stance is the risk choice", the word is a working name): a stance is ONLY its two thresholds, in
// permille of a hero's max HP, read on the lowest HP any hero reached in a pull (04 section 9: the margin signal is the tail):
//   fallPm   a pull whose lowest HP went under it falls back (its trigger)
//   cleanPm  a pull whose lowest HP stayed at or over it is clean (its climb threshold); between the two the step holds
// THE CLIMB (one rule for every stance): `cleanRun` clean pulls in a row climb `climb` steps, and the next climb is twice as far up to
// `climbMax` (a hunt far under its edge reaches it in minutes); any pull that is not clean puts the climb back to one step. A fall back
// is `fallSteps` down, a pull in which a hero died `deathSteps` down; after either the party climbs again only after `coolPulls` pulls.
// READINESS (04 section 9, 02 section 11): the party leaves its regroup for the next pull only when every standing hero is at or over
// `readyPm` of max HP. One threshold for every stance here, so a stance differs only in its trigger and its climb threshold.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const DANGER = Object.freeze({
  powerStep: 0.0035,
  payStepXp: 0.007,
  pullShare: 0.5,
  /* a full box (hunt-grounds.js DENSITY_FULL_BOX): past it the whole step is on the monsters */
  pullMax: 8,
  respawnMs: 15000,
  /* no step past this: (1.0035)^4000 is about 1.2 million, every number stays a safe float */
  stepMax: 4000,
  readyPm: 800,
});

export const CLIMB = Object.freeze({ cleanRun: 2, climbMax: 8, fallSteps: 6, deathSteps: 18, coolPulls: 0 });

/* The risk stances, safest first. 'steady' is the default a plan starts on (02 package 3). */
export const RISK_IDS = Object.freeze(['careful', 'steady', 'bold']);
export const RISKS = Object.freeze({
  careful: Object.freeze({ fallPm: 450, cleanPm: 650 }),
  steady: Object.freeze({ fallPm: 250, cleanPm: 450 }),
  bold: Object.freeze({ fallPm: 80, cleanPm: 250 }),
});
