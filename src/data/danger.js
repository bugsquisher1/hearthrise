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
// PURE ESM. Data only (the gear a ground drops is src/data/gear-steps.js).
// ════════════════════════════════════════════════════════════════════════

import { tierLevel, traitPool, maxRankAt } from './gear-steps.js';

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
// size) x PAY.coinPm / 1000 x (1 + payStepCoin) ^ gap, payStepCoin the WAGE's (src/data/wage.js): one coin ratio a step across grounds and
// inside one, smaller than the XP ratio (04 section 11; lane/econ-levers 2026-11-22 retired the engine's own 0.7% coin ratio).
//   refKillsHead 120   MEASURED 2026-11-22 (v1-climb.mjs, base:steady, 2 seeds x 6 h): the Steady mixed four at Level 60 on Muster
//                      Barrows kills 481 an hour at its held step (589.5 +- 14), 120 a head. Kills an hour hold there with Level (477 at 70)
//   gapMax 120         STATED: depth pays at most (1.007)^120 = 2.31x the table; past it a deeper hold earns no more a kill (04 payGapMax)
//   floor, coinPm      THE ECONOMY LEVERS (lane/econ-levers, 2026-11-22), set together with the wage (src/data/wage.js) and the store's
//                      basics (src/data/store-kit.js); their evidence is there and in tools/balance-program/redesign/econ/
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
//   coinPm 7000  THE SCALE'S COIN LEVEL (lane/econ-levers, 2026-11-22): a scale kill's coin is its row's roll x coinPm / 1000, before the
//               pull's share and the depth ratio, set TOGETHER with the wage (src/data/wage.js) and the store's basics (src/data/store-kit.js) so a
//               whole-gold store use can price a Steady four's kit at 0.2 to 0.3 of its pay. The coin ratio a step is the wage's payStepCoin
//               (0.4%): the engine's own 0.7% coin ratio is retired, one coin ratio a step (04 section 11). Evidence:
//               tools/balance-program/redesign/econ/.
//   coinPm 6400  RE-SET (lane/ledger-l10, 19-power-ledger L10, 2026-11-22): the coin ratio is now an HOUR's (danger.js COIN_STEP: a pull a
//               step deeper also pays its own length back), so the Steady four at Level 60, holding 619 over the reference 590 on this tree,
//               read 1.094 of wage(60) at 7000; at 6400 it reads 1.014 (Level 63 1.022), the anchor back in band. Measured: v1-climb.mjs
//               base/levels/high from the econ starts, 6 seeds x 8 h, before and after (CONFLICTS 2026-11-22 L10 names what stays out of band).
//   payStepLoot 0.4%  LOOT FOLLOWS DEPTH (lane/foundations-block, 2026-11-23; 04 section 7 payStepLoot, 26 rank 6): an hour a step deeper
//               drops payStepLoot more of the kill's own table, as coin pays payStepCoin more (src/core/hunt/danger.js dangerDial dropPm: each
//               row's chance x the pull's share over the reference pull's x the depth ratio at LOOT_STEP, PAY.floor under the reference, a row
//               never past one roll a kill, so the server's item bound holds). At the reference step the table is exactly as written.
//               STARTING VALUE the coin's (WAGE.payStepCoin): loot is sold for gold, so one gold ratio a step until the Lab splits them
//   floor 0.575, coinPm 6100  THE TUNING PASS (lane/tuning-pass, the designer, 2026-11-23; docs/design/redesign/29-tuning-pass.md, set together
//               with Muster Barrows' monster formula, POWER and the Bold line below, on the amount pipeline): Careful over Steady read 0.54 at
//               floor 0.5 (C-5 0.55 to 0.70), 0.62 at 0.575; the Steady four's hour (coin and loot at the store's price, the wage's definition)
//               read 1.08 of wage(60) at coinPm 6400 on the formula, so 6100. Evidence tools/balance-program/redesign/tuning (r2, final)
export const PAY = Object.freeze({ refKillsHead: 120, payStepXp: 0.007, gapMax: 120, floor: 0.575, coinPm: 6100, payStepLoot: 0.004 });

// THE POWER STEP ON THE SCALE (lane/r9-power-step, 2026-11-22; 04-math-strategy.md sections 1, 2 and 10; 02 package 2; 12-targets 3.3).
// A hero's GEAR PART is the gear table's (src/data/gear-steps.js, lane/g-gear-steps): each worn piece adds its item Level x its slot's
// weight (GEAR_STEPS.slotPm, summing to 1000; a two-handed weapon carries GEAR_STEPS.twoHand's), so a whole kit at item Level X is X. The
// engine (src/core/hunt/danger.js powerPm) reads it against the ground's base item Level (DANGER_GROUNDS gearLevel) at weightGear:
//   steps = weightGearPm / 1000 x (gear part - gearLevel), whole steps (multiplications only, the same last bit on every engine)
//   a blow at a monster x (1 + powerStep) ^ steps,  a blow at the hero / (1 + powerStep) ^ steps
// one gear part feeds both ratings (the table has one). The defense half lands AFTER the armor chain and its 60% cap (04 section 2: the
// step contest has no cap); played under the cap it showed a fifth of its steps (tools/balance-program/redesign/r9). Heals are not
// stepped (health is not). Off the scale nothing here is read. The old itemization's stats still play beside it until wave 3.
//   weightGearPm 1000   the whole gear part counts, so one tier of base on a whole kit (GEAR_STEPS.tierSteps item Levels) is that many
//                       steps of power by construction (the Coordinator's R9 brief; 04's weighted mean with weightSkill waits for wave 3)
// A piece's item Level is its row's `iL` (every scale drop carries its ground's, scaleItemLevels); a piece with none reads its `reqLv`.
//   weightGearBelowPm 500  ONE-SIDED (lane/econ-levers, the designer's call on R9's cliff, 2026-11-22; CONFLICTS 11-22): UNDER the ground's
//                       base item Level a gear step counts this much. Depth answers convexly to the gap below (R9: a tier back -65 steps
//                       against +21 a tier ahead), and every company meets that gap on arrival (a ground drops the tier above the last
//                       one's), so at 1000 the step into a new ground read three tiers of depth lost. C-2 asks one gear tier to move the hold
//                       1 to 3 depths either way; evidence in tools/balance-program/redesign/econ/.
//   weightSkillPm 250  THE SKILL PART (lane/foundations-block, 2026-11-23; 04 sections 1 and 4, 26 rank 2): a hero's skill for its style counts
//                       in Levels (src/data/bands.js SKILL_LINE read backwards: the Level the reference career reaches that skill), and a skill
//                       ahead of or behind its own Level's line moves the power step by weightSkillPm / 1000 steps a Level (member.js heroSnapshot
//                       skillGapPm). On the line it is 0, so the reference company and every band measured on it are unchanged. STARTING VALUE:
//                       a quarter, 04's three-way mean with Level and gear (JUDGMENT); evidence tools/balance-program/redesign/foundations
//   weightGearBelowPm 750  THE TUNING PASS (lane/tuning-pass, 2026-11-23; 29-tuning-pass.md, C-2): under the amount pipeline a gear step is a
//                       rating step (the old chain's stat cliff is gone: a tier back read -7 own steps at 500, a tier ahead +15 at 1000), so at 500
//                       a tier back moved Hask's Ford 0.8 of a depth. At 750 a tier each way moves 1.1 to 1.7 depths on both open grounds (r2-750,
//                       6 seeds x 10 h, paired); at 1000 a tier back read -26 on Muster (2.8 depths, the band's edge)
export const POWER = Object.freeze({ weightGearPm: 1000, weightGearBelowPm: 750, weightSkillPm: 250 });
/* gear-steps.js's door (tests/gear-steps.mjs GS-6): the gear table, carry-over, the Traits and a tier's item Level (chests.js reads it) */
export { GEAR_STEPS, CARRY, TRAITS, tierLevel } from './gear-steps.js';

/* a scale ground's row, with the highest Trait rank its entry Level lets its pool roll (19-power-ledger.md section 2, lane L3; gear-steps.js
   maxRankAt): entryLevel is its hunt's band floor (tests/gear-steps.mjs GS-5 holds the two equal). Muster Barrows (55) and Hask's Ford (45)
   roll rank 1 only, the Catacomb wings (165) all three. */
const ground = (row) => Object.freeze({ ...row, maxRank: maxRankAt(row.entryLevel) });
export const DANGER_GROUNDS = Object.freeze({
  /* floorStep / topStep: the ground's band of DEPTHS depths (docs/design/redesign/12-targets.md section 3.1, starting values the Lab
     tunes): depth 1 at the floor, depth 20 at the top. The player sees only "Depth N of 20", never a step (12-targets section 2.6).
     The engine holds the climb and the pay at topStep (THE TOP below); the server's catalogue (tools/gen-danger.mjs) reads refStep and
     the coin ceiling the top makes, and refuses a band that is not floor < refStep < top.
     gearLevel / traits: the ONE base item Level the ground drops at every depth and the Traits that roll on it (12-targets 3.3 and 8,
     src/data/gear-steps.js). Muster Barrows (Levels 55-75) drops tier 3, item Level 60. gearLevel is also the gear part of the reference
     company that measured refStep (the MID kit at Level 60, every piece item Level 60), so the power step (POWER) is 0 at it. Every gear
     piece a scale ground drops carries its gearLevel as `iL` (scaleItemLevels below): `ladderTier` the gear-tiers.js ladder tier its
     monsters drop, `named` 'catacomb' the named pieces of its own drop rows (catacomb-wings.js).
     refLevel (27-formula-overhaul.md K-5, lane/foundations-block): the Level of the reference company that measured refStep (the MID cell).
     THE BAND IN ABSOLUTE STEPS (lane/foundations-block; src/data/bands.js, src/core/bands.js): the band itself is a FORMULA of the row's
     entryLevel, its hunt's top Level and its gearLevel (a fresh company one tier back at the entry, the reference company at refLevel, a
     strong company one tier ahead at the top, each a rating in Levels); floorStep, refStep and topStep are the BRIDGE, the own step each of
     those companies holds on this ground's rows, measured by tools/new-ground.mjs. "Depth N" is cut evenly in absolute steps through them.
     refHeld (lane/depth-reading-fix, 2026-11-23; 12-targets 3.1a): the own step the reference company HOLDS at the band's grain
     (BAND_RULE.topTo), the bridge's middle point (src/core/bands.js refHeldOf), pinned by tools/new-ground.mjs --write only where it is not
     refStep. refStep is THE PAY'S REFERENCE, where the reference company holds (the pay's grain, refTo): its kills a head and its coin level
     were measured there, so a kill there pays the hours table and the wage (src/core/hunt/danger.js refOf and gapOf, the store's depth
     src/core/wage.js depthStep and the server's hr_danger_grounds.ref_step). A formula ground's monsters may stand elsewhere (formulaStep).
     coinPm (lane/scale-early-grounds; src/core/hunt/danger.js coinLevelOf): the ground's own coin level, measured by tools/new-ground.mjs when
     the reference hour (coin and loot at the store's price) sits outside EL-PAY's 0.95 to 1.05 of the wage at refLevel; absent, PAY.coinPm.
     monsters (lane/monster-formula; 04-math-strategy.md section 6): the ground's ONE DATA SWITCH for its monsters: 'rows' (today's hand-typed stats, grown by the step) or 'formula' (each monster's role and
     the step: src/core/hunt/monster-formula.js derives its health, blows and wind-ups from src/data/monster-roles.js against the reference
     company at refLevel on refStep, and the pull is sized to the party). A switch flipped moves the ground's band: re-measure it
     (tools/new-ground.mjs, tests/content-coherence.mjs CC-2 prints the switch with the rows).
     THE TOP (lane/r10-more-grounds; 12-targets 3.2): the engine climbs no step past topStep and pays no more there (src/core/hunt/danger.js
     stepOn, gapOf), and a company held at it is told the ground is outgrown (src/shell/needs-you/outgrown.js).
     THE BANDS PAST MUSTER, MEASURED (lane/r10-more-grounds, 2026-11-22; tools/balance-program/redesign/r10, v1-climb.mjs: the Steady mixed
     four, 4 seeds x 12 h, held from hour 4). Muster's own cut, read back the same way, came out ref 593 (MID kits at Level 65) and top 707
     (BIS kits at 75), so every band past it is cut that way: refStep the MID four at the band's middle Level, topStep the BIS four at its
     top Level held to refStep + PAY.gapMax (the pay stops there too), floorStep as far under refStep as the top is over (retired: see THE
     FLOOR RE-CUT below). A step is a step of
     the ground's own rows, so the bands read alike. refKillsHead: the MID four's kills a head an hour at its held reference (the hours
     table is split over the ground's own kill rate, src/core/hunt/danger.js refKillsOf): on PAY.refKillsHead's 120, Hask's Ford's four
     earned 1.79x the table at its reference, the wings 1.2x and 1.0x (kills a head 156 and 150). Never under PAY.refKillsHead (the server's one ceiling a kill).
       hasks_ford (45-60)       MID 52: 587.8 +- 2.5   BIS 60: 734.9 +- 20.3 (held to 710)   LOW 45: 476.3 +- 2.3 (depth 1-2)   0 deaths
                                (MID 45: 573.4, MID 55: 594.2, both in its own tier's kit: 0.85x and 1.02x the table, tests/level-curve.mjs C7)
       catacomb_flooded_wing    MID 175: 439.0 +- 0.7  BIS 185: 511.6 +- 7.4                 LOW 165: 263.8 +- 1.2 (depth 1)    deaths: LOW 2, BIS 3 in 4 days
       catacomb_bone_wing       MID 175: 481.7 +- 2.3  BIS 185: 544.3 +- 2.6                 LOW 165: 343.4 +- 3.1 (depth 1)    deaths: LOW 1 in 4 days
     (the wings re-read after lane/econ-levers' one-sided gear weight, which lifted the MID four 50 and 35 steps there: its kits sit under
     item Level 160; the LOW cells predate it and only sit deeper now, still at depth 1)
     The wings are staged, and their Steady deaths (C-3: none) are owed a monster fit before they open (catacomb-wings.js).
     THE FLOOR RE-CUT (the designer, lane/band-floor 2026-11-22, BAND_RULE below: the floor is where the fresh LOW four holds; the
     three cells re-run, 8 seeds x 12 h, tools/new-ground.mjs --write, evidence tools/balance-program/redesign/grounds):
       muster_barrows           LOW 55: 354.9 (lowest seed 333)  MID 65: 634.5  BIS 75: 709.0    floor 480 -> 320 (ref 590 by hand: the pin says why)
       hasks_ford               LOW 45: 487.7 (481)              MID 52: 589.2  BIS 60: 701.7    floor 470, top 710 -> 700
       catacomb_bone_wing       LOW 165: 394.4 (391)             MID 175: 480.4 BIS 185: 537.9   floor 415 -> 380, top 545 -> 540, 0 deaths in 24 days
       catacomb_flooded_wing    LOW 165: 367.4 (361)             MID 175: 438.9 BIS 185: 503.7   floor 370 -> 350, top 510 -> 505, BIS died once
     Every fresh four now reads depth 2 (its lowest seed at depth 1 to 2); the MID four depth 11 to 16.
     Krell's Hold and Pyre Field died on Steady in their old rows (2026-11-22); on the monster formula neither does, in any of their band and
     C-target cells (lane/scale-grounds-2, grounds/ and grounds/c-targets/), and Pyre Field drops its one base, rune.
     Every band re-cut on the clock's REF_HERO (lane/refhero-recut, 12-targets 8.5 item 2; tests/danger-band-pins.json). */
  /* muster_barrows ON THE FORMULA (lane/tuning-pass, 2026-11-23; 29-tuning-pass.md): its four rows carry roles, and on the formula the
     Steady four held with no death, a kit share of 0.28, the front 0.78 of the damage and a gear tier 1.1 to 1.7 depths each way.
     EVERY SCALE GROUND ON THE FORMULA (lane/monster-roles-ford-wings, 2026-11-23; 29-tuning-pass.md section 6): the Ford's four rows and the
     Catacombs' five carry roles (src/data/monster-roles.js), so every switch is on, and each band is the band rule's, cut on the formula
     (tools/new-ground.mjs, 8 seeds x 10 h). Two bridges a row may name beside its band, and refHeld below:
       formulaStep    WHERE THE FORMULA'S REFERENCE MONSTERS STAND (src/core/hunt/danger.js formulaStepOf; absent: refStep). refStep is the
                      pay's reference, where the MEASURED reference company holds; the two part where that company is not the formula's.
                      The wings' Level 175 company holds 60 to 80 steps under the anchor its monsters were measured at (520, 500), so held at
                      one step every stance paid under PAY.floor there and Careful out-earned Steady. Muster's anchor is chosen by hand
                      (590, the tuning pass's, 29-tuning-pass.md) and its four holds 20 over it, the Thicket's and the Mill Cellar's are
                      chosen too (70: a first hunt opens at step 0, the floor) and their fours hold 40 over and 10 under (lane/scale-early-
                      grounds: the pay reads the hold, as on the wings). The Ford's measured company holds on its anchor. Three readers,
                      two overrides (tools/lib/danger-band.mjs): the pay reads refStep, the monsters formulaStep ?? refStep, the depth
                      reading refHeld ?? refStep. The Flooded Wing's reading needs the hold at the band's grain too (refHeld 455)
       rowsKillsHead  THE KILL RATE A GROUND'S ROWS WERE WRITTEN AT, their coin and their drop chances (danger.js rowsKeptOf): the Ford's,
                      on its hand rows, 235 a head an hour; on the formula it kills 135, and its hour's coin fell to 0.43 of the wage
                      (EL-PAY). On the scale each kill pays that ratio more of both, so the hour stands where its rows put it. The rows
                      stay at 235 because the tier path (no stance) still plays them: drop chances derived at the formula's 135 paid a
                      lone tier hero at the floor a Scarce piece every 0.53 h, and a Bannerman's shield past the band's odds
                      (hunt-core/drop-tables). Coin written in hours (27 stage 9) retires it
     THE FLOOR ON THE ARRIVING COMPANY (lane/depth-reading-fix, 2026-11-23; 12-targets 3.1a): one tier back (the Ford's mithril kit at
     Level 55) held 587.4, lowest seed 582: floor 575 (was 525, cut on steel, two tiers back). The hold 610 (the MID four held 608.9), refStep since lane/scale-early-grounds.
     MEASURED depths (tools/balance-program/redesign/depth-budget): arriving 4, reference 9, strong 18 on Steady, 20 on Bold
     coinPm 7000 (lane/scale-early-grounds): the pay reads the hold (refStep 610; the anchor is formulaStep 590), 20 steps over the anchor it read, so the reference hour's coin fell
     14%; its own coin level puts it back on the wage, 1.01 of wage(60) (8 seeds x 10 h, grounds/muster_barrows-ref.json). Level XP at the
     hold: 0.88 of the hours table (tests/level-curve.mjs C7, Level held; was 1.06 read at the anchor)
     THE WINGS RE-CUT ON THEIR OWN BASE (lane/gear-phase-b, 2026-11-23; 29-tuning-pass 7.3, the re-read handed there): their bands were cut on
     kits that could not wear item Level 160. With the step tiers (gear-tiers.js STEP_TIERS) the Lab's companies wear their Level's tier (fresh
     at 165 in Cobalt, one back; reference at 175 and strong at 185 in Wolfram), and on the old bands the reference four held at depth 19 and
     earned 1.5x to 1.9x the hours. new-ground.mjs on those cells (top lifted first: a capped climb measures the cap; the coin level read back
     as played), 6 seeds x 10 h, no Steady death: Bone 420 / 520 / 580, coinPm 4000 (LOW 437.6, MID 519.1, BIS 582.1); Flooded 440 / 480 / 515,
     coinPm 3300 (451.1, 481.5, 517.4). The reference hour pays 1.00 and 1.01 of wage(175) and 0.97x and 1.04x the hours. A whole kit one
     tier back at 175 moves 16.2 and 9.3 steps, 2 depths each (C-2) */
  muster_barrows: ground({ refStep: 610, floorStep: 525, topStep: 690, refHeld: 605, coinPm: 7700, formulaStep: 590, gearLevel: tierLevel(3), ladderTier: 4, traits: traitPool('muster_barrows'), entryLevel: 55, refLevel: 60, monsters: 'formula' }),
  hasks_ford: ground({ refStep: 590, floorStep: 535, topStep: 640, refKillsHead: 135, refHeld: 595, coinPm: 6600, rowsKillsHead: 235, gearLevel: tierLevel(2), ladderTier: 3, traits: traitPool('hasks_ford'), entryLevel: 45, refLevel: 52, monsters: 'formula' }),
  catacomb_bone_wing: ground({ refStep: 500, floorStep: 405, topStep: 545, refKillsHead: 140, coinPm: 4200, formulaStep: 520, gearLevel: tierLevel(8), named: 'catacomb', traits: traitPool('catacomb_bone_wing'), entryLevel: 165, refLevel: 175, monsters: 'formula' }),
  /* THE FIRST GROUNDS ON THE FORMULA (lane/scale-early-grounds; 27 stage 6): roles on their rows, bands by new-ground.mjs --hold-level, drops
     in hours, one base a ground. formulaStep 70 is the chosen anchor (a first hunt opens at step 0, its floor); coinPm is measured (the old rows'
     coin sat at 0.08 of the wage); evidence tools/balance-program/redesign/grounds. The Thicket re-cut on 29 7.5's own kit once iron took
     item Level 20 (lane/scale-grounds-2): its strong four in tier 0 holds 170, where it held the old top 190 in iron. */
  meadowbrook_thicket: ground({ refStep: 110, floorStep: 0, topStep: 145, refKillsHead: 125, refHeld: 105, coinPm: 38800, formulaStep: 70, gearLevel: tierLevel(0), ladderTier: 1, pieces: Object.freeze(['grayjaws_ruff']), traits: traitPool('meadowbrook_thicket'), entryLevel: 5, refLevel: 10, monsters: 'formula' }),
  /* THE LAST BRONZE GROUNDS (lane/scale-grounds-sweep step 2; 12-targets 8.3): Wickstead (8-18) and the Sewer (5-19) inside tier 0, so every
     cell wears bronze (29 7.5); formulaStep 70 as on the first grounds, the band, kill rate and coin level measured (new-ground.mjs --hold-level) */
  wickstead: ground({ refStep: 80, floorStep: 0, topStep: 125, refKillsHead: 140, coinPm: 18300, formulaStep: 70, gearLevel: tierLevel(0), ladderTier: 1, traits: traitPool('wickstead'), entryLevel: 8, refLevel: 13, monsters: 'formula' }),
  millrace_sewer: ground({ refStep: 60, floorStep: 0, topStep: 110, refHeld: 65, coinPm: 8200, formulaStep: 70, gearLevel: tierLevel(0), ladderTier: 1, traits: traitPool('millrace_sewer'), entryLevel: 5, refLevel: 12, monsters: 'formula' }),
  mill_cellar: ground({ refStep: 60, floorStep: 0, topStep: 110, refKillsHead: 135, coinPm: 114400, formulaStep: 70, gearLevel: tierLevel(0), ladderTier: 1, traits: traitPool('mill_cellar'), entryLevel: 1, refLevel: 3, monsters: 'formula' }),
  /* THE SECOND PAIR (lane/scale-grounds-2; 27 stage 6): the Glade on iron (item Level 20, ladder tier 2), the Warrens on steel (40, ladder
     tier 3, beside the Ford's mithril), each the highest tier at or under its refLevel, so the reference reads the band's middle (CONFLICTS
     2026-11-23). formulaStep 70 as on the first grounds; the band, coin level and kill rate are measured (tools/new-ground.mjs --hold-level,
     the C-target cells in grounds/c-targets). The Glade's fresh four holds step 8, so its floor is the scale's first step */
  mosslight_glade: ground({ refStep: 60, floorStep: 0, topStep: 115, refKillsHead: 140, refHeld: 55, coinPm: 7900, formulaStep: 70, gearLevel: tierLevel(1), ladderTier: 2, traits: traitPool('mosslight_glade'), entryLevel: 16, refLevel: 23, monsters: 'formula' }),
  coppercap_warrens: ground({ refStep: 80, floorStep: 30, topStep: 125, refHeld: 75, coinPm: 3900, formulaStep: 70, gearLevel: tierLevel(2), ladderTier: 3, traits: traitPool('coppercap_warrens'), entryLevel: 32, refLevel: 41, monsters: 'formula' }),
  /* THE THIRD BATCH (lane/scale-grounds-2): the Slake on mithril (40, beside the Ford), the Pyre Field on rune (60, beside Muster), Krell's
     Hold on ember (80). The same anchor and the same measuring as the second pair */
  the_slake: ground({ refStep: 100, floorStep: 45, topStep: 130, coinPm: 4900, formulaStep: 70, gearLevel: tierLevel(2), ladderTier: 3, traits: traitPool('the_slake'), entryLevel: 50, refLevel: 57, monsters: 'formula' }),
  pyre_field: ground({ refStep: 50, floorStep: 0, topStep: 100, refKillsHead: 140, coinPm: 2900, formulaStep: 70, gearLevel: tierLevel(4), ladderTier: 5, traits: traitPool('pyre_field'), entryLevel: 70, refLevel: 80, monsters: 'formula' }),
  krells_hold: ground({ refStep: 40, floorStep: 0, topStep: 115, coinPm: 3100, formulaStep: 70, gearLevel: tierLevel(4), ladderTier: 5, traits: traitPool('krells_hold'), entryLevel: 85, refLevel: 97, monsters: 'formula' }),
  /* THE MORROW HILLS ON THE SCALE (lane/scale-grounds-sweep step 3; 12-targets 8.3): Carter's Rest on Emberforged (100), the Ox Road on Dawnsteel
     (120, its reference its middle), Wyvern Roost on Cobalt (140, Levels 128-150), each the highest tier at or under its refLevel; the same anchor
     and the same measuring as the third batch (new-ground.mjs --hold-level); their own bodies carry roles (each pack's header words) */
  carters_rest: ground({ refStep: 60, floorStep: 0, topStep: 70, refKillsHead: 145, refHeld: 55, coinPm: 2100, formulaStep: 120, gearLevel: tierLevel(5), ladderTier: 6, traits: traitPool('carters_rest'), entryLevel: 110, refLevel: 117, monsters: 'formula' }),
  ox_road: ground({ refStep: 100, floorStep: 0, topStep: 165, refKillsHead: 125, refHeld: 95, coinPm: 2400, formulaStep: 70, gearLevel: tierLevel(6), ladderTier: 7, traits: traitPool('ox_road'), entryLevel: 112, refLevel: 120, monsters: 'formula' }),
  wyvern_roost: ground({ refStep: 110, floorStep: 0, topStep: 190, refKillsHead: 140, refHeld: 105, coinPm: 2100, formulaStep: 70, gearLevel: tierLevel(7), ladderTier: 8, traits: traitPool('wyvern_roost'), entryLevel: 128, refLevel: 140, monsters: 'formula' }),
  /* the Flooded Wing opens first (12-targets 8.4): Levels 150-170, reference 160, cut by new-ground.mjs on Cobalt / Wolfram kits (lane/scale-grounds-sweep) */
  catacomb_flooded_wing: ground({ refStep: 480, floorStep: 440, topStep: 485, refKillsHead: 140, refHeld: 475, coinPm: 3300, formulaStep: 500, gearLevel: tierLevel(8), named: 'catacomb', traits: traitPool('catacomb_flooded_wing'), entryLevel: 150, refLevel: 160, monsters: 'formula' }),
});

/* The depths a ground's band is cut into (12-targets.md 3.1). */
export const DEPTHS = 20;

/* THE BAND RULE (the designer, lane/band-floor 2026-11-22; 24-content-pipeline.md G3): how tools/new-ground.mjs cuts every ground's band
   from its three Steady cells (tools/lib/danger-band.mjs bandFromReports), so the next ground follows it with no hand numbers.
     floor (depth 1)  where a FRESH company holds: the LOW four at the entry Level, its LOWEST seed's held step, less floorUnder, down to
                      floorTo. 12-targets 3.1 defines depth 1 that way; R10's cut put it as far under the reference as the top is over
                      it instead, and on Muster Barrows that floor (480) sat 160 steps over the fresh four's hold (320.9), so a company
                      that had just arrived could not hold depth 1 and a first hunt started at the floor would fall back from its first
                      pull. The lowest seed, not the mean: every fresh company we measured must hold depth 1 (Muster's 4 seeds held
                      333 to 424). floorUnder: a hunt that opens at the floor opens one clean pull under its hold, not on its edge
     ref              the MID four at the middle Level, to the nearest refTo (unchanged: the pay anchor)
     top (depth 20)   the BIS four at the top Level, to the nearest topTo, held to ref + PAY.gapMax (unchanged)
   The depths are cut evenly from floor to top, so the band under the reference is as wide as the fresh four is far behind: a company
   entering at the floor climbs most of the band as it Levels, and the MID four reads about depth 13 to 14 where R10 had it at 10.5. */
export const BAND_RULE = Object.freeze({ floorUnder: 10, floorTo: 5, refTo: 10, topTo: 5 });

/**
 * THE ITEM LEVELS A SCALE GROUND'S DROPS CARRY (lane/r10-more-grounds; 12-targets.md 3.3 and 8: the ground fixes the base, so every piece
 * it drops is its `gearLevel`, at every depth). src/data/items.js writes each answer on its row as `iL`, the number the power step reads
 * (src/core/hunt/danger.js itemLevelOf; a piece with none still reads its reqLv). A ground's `ladderTier` stamps the gear-tiers.js ladder
 * tier its monsters drop (`ladder` is that ladder's rows: GEAR_ITEMS, SLOT_ITEMS, SHIELD_ITEMS); a step tier's base carries its own item
 * Level (base-drops.js, the wings' Wolfram). The 24 Hearth Chest pieces were the wings' `named` set, stamped 160 on their key tiers' bodies;
 * the wings drop their tier's base alone now (12-targets 8.6.1, lane/refhero-recut), so those pieces keep their own step's item Level.
 * Beside it, `pieces` (lane/scale-early-grounds): the ground's own one-off pieces off the ladder (a den mother's trophy cape), which
 * drop at its base like everything else it drops (`items` resolves them; a piece that is no gear item throws).
 * Two grounds that would give one piece two item Levels throw: one base, one number. tests/hunt-core/danger.mjs holds every gear drop of
 * every scale ground to its ground's gearLevel.
 */
export function scaleItemLevels(ladder, items) {
  const out = {};
  const put = (id, iL, g) => {
    if (out[id] !== undefined && out[id] !== iL) throw new Error('src/data/danger.js: ' + id + ' drops at item Level ' + out[id] + ' and ' + iL + ' (' + g + ')');
    out[id] = iL;
  };
  for (const [g, row] of Object.entries(DANGER_GROUNDS)) {
    if (Number.isInteger(row.ladderTier)) for (const [id, it] of Object.entries(ladder || {})) if (it && it.slot && it.tier === row.ladderTier && it.type !== 'ammo') put(id, row.gearLevel, g);
    for (const id of row.pieces || []) {
      if (!items || !items[id] || !items[id].slot) throw new Error('src/data/danger.js: ' + g + ' names the piece ' + id + ', which is no gear item');
      put(id, row.gearLevel, g);
    }
  }
  return out;
}

export const CLIMB = Object.freeze({ cleanRun: 2, climbMax: 8, fallSteps: 18, deathSteps: 120, coolPulls: 10 });

/* The risk stances, safest first. 'steady' is the default a plan starts on (02 package 3). */
/* `afterDeath`: the stance the rest of the hunt plays once a hero has died (V1.1: the company stops pushing, so the heroes left are not
   led back to the edge that killed the first; under Bold's own thresholds a three without its front re-climbed and died, a wipe in 2 to 5
   of 8 days) */
export const RISKS = Object.freeze({
  careful: Object.freeze({ fallPm: 450, cleanPm: 650, afterDeath: 'careful' }),
  steady: Object.freeze({ fallPm: 250, cleanPm: 450, afterDeath: 'careful' }),
  bold: Object.freeze({ fallPm: 80, cleanPm: 300, afterDeath: 'steady', breakOff: false }),
});
/* BOLD FIGHTS EVERY PULL TO THE END (`breakOff: false`; the designer, lane/designer-reads-1123, 2026-11-23, 29-tuning-pass.md section 7.2).
   Careful and Steady break a pull off the moment a hero is under their line (src/core/hunt/danger.js breaksOff), so they fall back before
   a death (RD-Q3 a). Bold does not: it finishes the pull it started, and reads its line only when the pull ends (pullEnds). So Bold's risk
   is the party's, not the size of one monster's blow, and it is real on every ground. MEASURED (v1-climb, the Steady mixed four's company
   on Bold, 8 seeds x 10 h, tools/balance-program/redesign/reads): deaths a party-day Hask's Ford 0 -> 0.38, Muster Barrows 0.25 -> 1.0,
   the Bone Wing 0 -> 1.0, all inside C-4's 0.3 to 1.5. A missing field breaks off (the safe default). */
/* Bold's fall line 120 -> 80 (lane/tuning-pass, 2026-11-23; 29-tuning-pass.md, C-4: Bold dies 0.3 to 1.5 times a party-day and loses the day to
   Steady). On Muster Barrows' formula monsters Bold at 120 died 0 to 0.17 times a day, so it won every day; at 80 0.25 (Muster) and 1.0 (Hask's
   Ford), at 60 0.88 on Muster (8 seeds x 10 h each, tools/balance-program/redesign/tuning/r2). The thresholds move, not a pay factor (27 section 4) */

/* THE HOLDER'S LINE (docs/design/redesign/23-spell-audit.md section 3; Tyler 2026-11-22: "the tank falls back at 15% on Steady while
   others fall back at 25%"): the hero holding the Challenge (the lap's holding tank, src/core/hunt/targeting.js holderTank) reads every
   stance's two thresholds times linePm / 1000. A tank is meant to sit low and be healed: read on the stance's own line, the move whose job
   is to pull every blow onto one hero broke the pull the four was winning (23 section 3, MEASURED: the four held 63 steps deeper with no
   Challenge at all). 800 (Steady 20% and 36%), not the ruled 600, because Steady must never die (RD-Q3 a: "a death there is a bug in the
   triggers"): a line is safe only over the largest blow, and a Muster Knight's lands between 17.5% and 20% of a Level 60 tank's HP.
   MEASURED (lane/moves-pass-1, spell-run.mjs plan PT, Muster L60 Steady, the tank's four on its new Challenge condition, 18 seeds x 8 h):
   600 held 632 with 4 tank deaths, 700 held 623 with 5, 800 held 613 with 0 (0 too without the condition). CONFLICTS.md 2026-11-22.
   800 KEPT BY THE TUNING PASS (lane/tuning-pass, the designer, 2026-11-23; 29-tuning-pass.md 3.4): the tank four (tank, bow, mage, healer),
   Steady, 10 h seed-days: on Muster Barrows' formula monsters (their blow cap) 600 and 700 never died (12 and 32 seed-days); on Hask's Ford's
   hand rows 600 died 3 times in 12, 700 once in 32, 800 never in 18. The lowest line with no Steady death is 800 while the Ford plays rows;
   re-read 700 when its monsters carry roles.
   700 SINCE EVERY GROUND PLAYS THE FORMULA (lane/monster-roles-ford-wings, 2026-11-23; 29-tuning-pass.md section 6): the tank four on Steady
   at each ground's reference Level never died at 700, 12 seed-days a ground on all four (48; beside the tuning pass's 32 on Muster), so the
   line moves toward Tyler's 15% by the one step the evidence allows (tools/balance-program/redesign/tuning/roles/line). */
export const HOLDER = Object.freeze({ linePm: 700 });

/* THE DEFAULT STANCE (02 package 3 and package 8, "the first party ground runs on Steady"; the Coordinator 2026-11-22, lane R2): a hunt on a
   ground the scale opens on, whose leader's plan names no stance, plays this one. The server freezes it (hr_danger_rules.default_risk,
   tools/gen-danger.mjs; 1057-danger-falls.sql hr_danger_freeze), so no verb is needed first; a client shows it where the plan names none. */
export const DEFAULT_RISK = 'steady';
