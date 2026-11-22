// ════════════════════════════════════════════════════════════════════════
// src/data/danger.js — THE DANGER SCALE'S NUMBERS (lane/v1-climb, the roadmap's probe V1).
//
// docs/design/redesign/02-architecture.md package 3 and 04-math-strategy.md sections 1, 7, 8 and 9: one integer Danger step in place
// of the three hand-picked tiers, a party that climbs it by itself inside a risk stance and falls back before it dies, and pulls that
// wait for the party to be ready. The engine half is src/core/hunt/danger.js; this file is every number it reads, one home each.
//
// A STEP IS ONE POWER STEP OF THE GROUND'S OWN PULL. Step 0 is the ground as built (its rows, its pockets' mean size). Each step up
// multiplies the pull's total health and total blow by (1 + powerStep) (a kill's pay: PAY below). Part of that growth
// arrives as MORE monsters (pullStep): the pull's size is the as-built mean times (1 + pullStep)^step, rounded and held
// to a full box, and each monster carries the rest, so the rounding never puts a jump in the curve (a pull of 5 has each monster at
// 4/5 of what a pull of 4 has). A monster's aim and its Level (what armor and Defense training read) stay the row's: the step's growth
// is exactly the ratio, once, on health and once on blow, never twice through the to-hit or armor chain.
//
// STARTING VALUES, NOT RULINGS (Tyler 2026-11-21: "a number inside its band is enough"):
//   powerStep 0.35%   04 section 1's worked value (its search range 0.25% to 0.5%)
//   payStepXp 0.7%    04 section 7's worked value (powerStep times a premium of two), now on the gap (PAY)
//   pullStep 0.175%   STATED: about half of each step arrives as more monsters (04 is silent on how a step splits between more monsters
//                     and stronger ones); the engine raises every ratio to a whole step by multiplication only (danger.js powStep)
//   respawnMs 15 s    STATED: short enough that six pockets never wait on it, so the pace is the party's (04 section 8), long enough
//                     that a cleared pack does not stand again on a party still resting on its pocket
// THE STANCES (02 package 3: "the stance is the risk choice", the word is a working name): a stance is ONLY its two thresholds, in
// permille of a hero's max HP, read on the lowest HP any hero reached in a pull (04 section 9: the margin signal is the tail):
//   fallPm   a pull whose lowest HP went under it falls back (its trigger)
//   cleanPm  a pull whose lowest HP stayed at or over it is clean (its climb threshold); between the two the step holds
// THE CLIMB (one rule for every stance): `cleanRun` clean pulls in a row climb `climb` steps, and the next climb is twice as far up to
// `climbMax` (a company far under its edge finds it within the first hours); any pull that is not clean puts the climb back to one step.
// A fall back is `fallSteps` down, a pull in which a hero died `deathSteps` down; after either, clean pulls count for nothing for
// `coolPulls` pulls (the party steadies), then the climb starts again at one step.
// THE FALL BACK HAPPENS INSIDE THE PULL (V1.1): the moment a hero goes under the stance's trigger no monster swings again and no spell
// lands, and at the next sub-step the party breaks off (pull-cycle.js breakOff: the pack heals and walks home, the party rests, then pulls
// the same pocket `fallSteps` lower). A death settles the stance one notch safer for the rest of the hunt (`afterDeath`).
// PROBE V1 (lane/v1-climb, 2026-11-22, a mixed four at Muster Barrows, 8 seeds x 12 h a cell): the first rule (a 6-step fall back, no
// cool-down) let Steady die, 15 deaths and 3 wipes in its 8 base days; this one (variant A) 3 deaths and none, held step 606 +- 4 across
// seeds; variant B (after the first fall back, one step a window of 6 clean pulls) crept so slowly the held step read +- 30 across seeds and
// killed the same seeds at the same hour, so it was dropped. Every Steady death in the sample came out of a pull whose margin had sat near
// the stance's climb threshold, not out of a fall back too late: the stance's climb threshold places the company, and it sets the death rate.
// V1.1 (2026-11-22, 12 seeds x 12 h x 4 cells): a fall back at the pull's end could not see a one-pull spike; broken off inside the pull
// (one sub-step late: 2 Steady deaths in 32 days; at once, as now: none in 48, at the same depth), Steady keeps 250 / 450. Bold at 80 / 250
// wiped in every day; with the stance settling to Steady after a death it never wiped in 48 days, at 150 / 350 dying 0 to 0.4 times a day
// and out-earning Steady over the whole day, at 120 / 300 (kept) 0.4 to 1.1 times a day, under Steady over a day in 3 of 4 cells and over
// it in a 2-hour session in 4 of 4 (tools/balance-program/redesign/v2-stance.mjs).
// READINESS (04 section 9, 02 section 11): the party leaves its regroup for the next pull only when every standing hero is at or over
// `readyPm` of max HP. One threshold for every stance here, so a stance differs only in its trigger and its climb threshold.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

// WAVE 1 (lane/v1-climb, backend, 2026-11-22): THE PAY, THE START AND THE GROUNDS.
// PAY BY DEPTH FROM THE HOURS TABLE (04 sections 5 and 7). V1 paid a kill its row's Level XP x (1 + 0.7%)^step, so a four holding step
// ~590 on Muster Barrows earned 5.8M Level XP a head an hour, 22x the hours table at Level 60 (16-27 Levels a day). On the scale a kill
// now pays a SHARE OF THE KILLER'S OWN LEVEL: the hours that Level takes in Tyler's table (core-model.js LEVEL_PACE.targets, read through
// danger.js hoursForLevel), so
//   one hero's Level XP a kill = (XP to its next Level / the hours that Level takes) / (PAY.refKillsHead x heroes at the kill) x depth
//   depth = (1 + PAY.payStepXp) ^ gap, gap = the step - the ground's reference step (DANGER_GROUNDS refStep), held to PAY.gapMax above
// A company holding its ground's reference step earns the hours table; one step deeper earns payStepXp more (04 section 7: power is paid
// out as depth). No party table and no under-floor share on the scale (04 section 7: the gap does catch-up; a carried hero is paid its
// OWN Level's table rate, never more). Coin a kill is the row's roll x the pull's share (so a pull pays the as-built pull's coin at any
// size) x (1 + payStepCoin) ^ gap: one ratio for both (04: "under one rule a party's gold follows its XP").
//   refKillsHead 120   MEASURED 2026-11-22 (v1-climb.mjs, base:steady, 2 seeds x 6 h): the Steady mixed four at Level 60 on Muster
//                      Barrows kills 481 an hour at its held step (589.5 +- 14), 120 a head. Kills an hour hold there with Level (477 at 70)
//   gapMax 120         STATED: depth pays at most (1.007)^120 = 2.31x the table; past it a deeper hold earns no more a kill (04 payGapMax)
// THE START (02 package 3: "a hunt starts at a step the company has held before"; V1's "above" cell: a weaker company started at a stronger
// one's step lost heroes in its first minutes): a hunt opens DANGER.startMargin steps under the LOWEST step any of its heroes last held on
// that ground (hunt_density.danger_held, written by the server as each hunt ends), 0 for a hero who never held one. STATED 20, the probe's
// --start-from margin (the doubling climb finds 20 steps in five clean pulls).
// THE GROUNDS (wave 1 only): a step is a step of the ground's OWN rows (step 0 = as built), so the same step is not the same strength on two
// grounds until the bands are re-cut in one unit (02 package 3, cost; wave 2). The scale opens only on a ground with a measured reference
// step; everywhere else a stance plays the tier (the server's freeze reads the same rows, hr_danger_grounds). This table is the bridge,
// not a per-ground dial: it goes when the bands carry absolute steps.
//   muster_barrows 590 MEASURED 2026-11-22: the Steady four at Level 60 held 589.5 +- 14 (Level 70: 613.6 +- 3).
export const DANGER = Object.freeze({
  powerStep: 0.0035,
  pullStep: 0.00175,
  /* a full box (hunt-grounds.js DENSITY_FULL_BOX): past it the whole step is on the monsters */
  pullMax: 8,
  respawnMs: 15000,
  /* no step past this: (1.0035)^4000 is about 1.2 million, every number stays a safe float */
  stepMax: 4000,
  readyPm: 800,
  startMargin: 20,
});

// THE PAY FLOOR (lane/r9-power-step, 2026-11-22; 12-targets.md 2.1, the designer's ruling: a kill never pays under a floor of the hours
// table, and if Careful misses 0.55x to 0.70x of Steady the floor moves, not the stances): under the reference step the depth ratio falls
// to PAY.floor and no further, for XP and coin alike, so a shallower stance's cost is its kills an hour, not twice. The floor raises only
// what a kill pays UNDER the reference step: the most a kill can pay (the gap ceiling, hr_danger_level_xp_max) is unchanged.
//   floor 0.5   MEASURED (v1-climb.mjs from a held start, lane/r9): see the lever row danger.pay-floor. 12-targets' starting 0.85 would put
//               Careful OVER Steady (a Careful pull is smaller and falls faster: R4 read Careful at ~1.1x the reference kills an hour)
export const PAY = Object.freeze({ refKillsHead: 120, payStepXp: 0.007, payStepCoin: 0.007, gapMax: 120, floor: 0.5 });

// THE POWER STEP ON THE SCALE (lane/r9-power-step, 2026-11-22; 04-math-strategy.md section 1 "what a hero's rating is made of" and
// section 10 "a base is an item Level"; R4's Lab variant hero-power/step, measured in tools/balance-program/redesign/r4). On a ground the
// scale opens on, a hero's GEAR is counted in power steps against the ground's own gear Level (DANGER_GROUNDS gearLv, the item Level the
// reference company wore when its refStep was measured):
//   offense steps = gearStepsPm / 1000 x (the weapon's item Level - gearLv)            a blow at a monster x (1 + powerStep) ^ steps
//   defense steps = gearStepsPm / 1000 x (the six armor slots' mean item Level - gearLv)  a blow at the hero / (1 + powerStep) ^ steps
// each rounded to a whole step (the ratio is then multiplications only, the same last bit on every engine). An empty armor slot counts as
// item Level 0, so one good piece never stands for a set. The step is the step contest's own (04 section 2: "no cap"): it lands AFTER the
// armor chain and its 60% cap, so the defense half is never eaten by a cap the old chain already reached (R4: 60% of the power showed, the
// cap took the rest). Heals are not stepped: health is not, so a stepped heal would count the defense step twice.
// At the reference kit both are 0 and the hunt plays exactly as before, so refStep and the band hold. Off the scale nothing here is read.
//   gearStepsPm 1200   MEASURED (lane/r9, v1-climb.mjs on the engine, Level 60 Steady four, 12 seeds x 12 h): a tier (15 item Levels, 18
//                      steps of power) moves the held step -22.7 back and +17.2 ahead, in the 15 to 26 band. 1333 (04's 20 steps a tier)
//                      read -29.7 / +21.3: past the cap the defense half shows more than its steps (a heal is not stepped)
// NOT HERE: the skill part (04's weightSkill). Skills already move a hero through its shipped rolls (+3 Levels: +7 to +15 steps, V1); a
// second count waits for wave 3's rating, which replaces the rolls.
export const POWER = Object.freeze({ gearStepsPm: 1200 });

export const DANGER_GROUNDS = Object.freeze({
  /* floorStep / topStep: the ground's band of DEPTHS depths (docs/design/redesign/12-targets.md section 3.1, starting values the Lab
     tunes): depth 1 at the floor, depth 20 at the top. The player sees only "Depth N of 20", never a step (12-targets section 2.6).
     Display only for now: the server's catalogue (tools/gen-danger.mjs) reads refStep alone.
     gearLv: the item Level the reference company wore when refStep was measured (the MID kit at Level 60: every weapon and armor piece
     item Level 60); a hero's gear is counted in power steps against it (POWER). Engine only: the server bounds read neither. */
  muster_barrows: Object.freeze({ refStep: 590, floorStep: 480, topStep: 710, gearLv: 60 }),
});

/* The depths a ground's band is cut into (12-targets.md 3.1). */
export const DEPTHS = 20;

export const CLIMB = Object.freeze({ cleanRun: 2, climbMax: 8, fallSteps: 18, deathSteps: 120, coolPulls: 10 });

/* The risk stances, safest first. 'steady' is the default a plan starts on (02 package 3). */
/* `afterDeath`: the stance the rest of the hunt plays once a hero has died (V1.1: the company stops pushing, so the heroes left are not
   led back to the edge that killed the first; under Bold's own thresholds a three without its front re-climbed and died, a wipe in 2 to 5
   of 8 days) */
export const RISKS = Object.freeze({
  careful: Object.freeze({ fallPm: 450, cleanPm: 650, afterDeath: 'careful' }),
  steady: Object.freeze({ fallPm: 250, cleanPm: 450, afterDeath: 'careful' }),
  bold: Object.freeze({ fallPm: 120, cleanPm: 300, afterDeath: 'steady' }),
});

/* THE DEFAULT STANCE (02 package 3 and package 8, "the first party ground runs on Steady"; the Coordinator 2026-11-22, lane R2): a hunt on a
   ground the scale opens on, whose leader's plan names no stance, plays this one. The server freezes it (hr_danger_rules.default_risk,
   tools/gen-danger.mjs; 1057-danger-falls.sql hr_danger_freeze), so no verb is needed first; a client shows it where the plan names none. */
export const DEFAULT_RISK = 'steady';
