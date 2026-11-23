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
export const PAY = Object.freeze({ refKillsHead: 120, payStepXp: 0.007, gapMax: 120, floor: 0.5, coinPm: 6400 });

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
export const POWER = Object.freeze({ weightGearPm: 1000, weightGearBelowPm: 500 });
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
     NOT ON THE SCALE (measured the same way, 2026-11-22): Krell's Hold died on Steady in every seed-day at Levels 85, 97 and 110 (4 of 4
     each), Pyre Field in 1 to 3 of 4 (and drops two ladder tiers, Muster's and Krell's), against 12-targets C-3's none. They wait for their
     monsters' fit, not for a band. */
  muster_barrows: ground({ refStep: 590, floorStep: 320, topStep: 710, gearLevel: tierLevel(3), ladderTier: 5, traits: traitPool('muster_barrows'), entryLevel: 55 }),
  hasks_ford: ground({ refStep: 590, floorStep: 470, topStep: 700, refKillsHead: 220, gearLevel: tierLevel(2), ladderTier: 4, traits: traitPool('hasks_ford'), entryLevel: 45 }),
  catacomb_bone_wing: ground({ refStep: 480, floorStep: 380, topStep: 540, refKillsHead: 160, gearLevel: tierLevel(8), named: 'catacomb', traits: traitPool('catacomb_bone_wing'), entryLevel: 165 }),
  catacomb_flooded_wing: ground({ refStep: 440, floorStep: 350, topStep: 505, refKillsHead: 150, gearLevel: tierLevel(8), named: 'catacomb', traits: traitPool('catacomb_flooded_wing'), entryLevel: 165 }),
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
 * (src/core/hunt/danger.js itemLevelOf; a piece with none still reads its reqLv). Two kinds of ground:
 *   ladderTier   the gear-tiers.js ladder tier its monsters drop (`ladder` is that ladder's rows: GEAR_ITEMS, SLOT_ITEMS, SHIELD_ITEMS)
 *   named        'catacomb': the 24 named pieces of catacomb-armor.js (`named`: the item rows carrying `catacombTier`), its own drop rows
 * Two grounds that would give one piece two item Levels throw: one base, one number. tests/hunt-core/danger.mjs holds every gear drop of
 * every scale ground to its ground's gearLevel.
 */
export function scaleItemLevels(ladder, named) {
  const out = {};
  const put = (id, iL, g) => {
    if (out[id] !== undefined && out[id] !== iL) throw new Error('src/data/danger.js: ' + id + ' drops at item Level ' + out[id] + ' and ' + iL + ' (' + g + ')');
    out[id] = iL;
  };
  for (const [g, row] of Object.entries(DANGER_GROUNDS)) {
    if (Number.isInteger(row.ladderTier)) for (const [id, it] of Object.entries(ladder || {})) if (it && it.slot && it.tier === row.ladderTier && it.type !== 'ammo') put(id, row.gearLevel, g);
    if (row.named === 'catacomb') for (const id of Object.keys(named || {})) put(id, row.gearLevel, g);
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
  bold: Object.freeze({ fallPm: 120, cleanPm: 300, afterDeath: 'steady' }),
});

/* THE HOLDER'S LINE (docs/design/redesign/23-spell-audit.md section 3; Tyler 2026-11-22: "the tank falls back at 15% on Steady while
   others fall back at 25%"): the hero holding the Challenge (the lap's holding tank, src/core/hunt/targeting.js holderTank) reads every
   stance's two thresholds times linePm / 1000. A tank is meant to sit low and be healed: read on the stance's own line, the move whose job
   is to pull every blow onto one hero broke the pull the four was winning (23 section 3, MEASURED: the four held 63 steps deeper with no
   Challenge at all). 800 (Steady 20% and 36%), not the ruled 600, because Steady must never die (RD-Q3 a: "a death there is a bug in the
   triggers"): a line is safe only over the largest blow, and a Muster Knight's lands between 17.5% and 20% of a Level 60 tank's HP.
   MEASURED (lane/moves-pass-1, spell-run.mjs plan PT, Muster L60 Steady, the tank's four on its new Challenge condition, 18 seeds x 8 h):
   600 held 632 with 4 tank deaths, 700 held 623 with 5, 800 held 613 with 0 (0 too without the condition). CONFLICTS.md 2026-11-22. */
export const HOLDER = Object.freeze({ linePm: 800 });

/* THE DEFAULT STANCE (02 package 3 and package 8, "the first party ground runs on Steady"; the Coordinator 2026-11-22, lane R2): a hunt on a
   ground the scale opens on, whose leader's plan names no stance, plays this one. The server freezes it (hr_danger_rules.default_risk,
   tools/gen-danger.mjs; 1057-danger-falls.sql hr_danger_freeze), so no verb is needed first; a client shows it where the plan names none. */
export const DEFAULT_RISK = 'steady';
