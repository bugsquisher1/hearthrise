// ════════════════════════════════════════════════════════════════════════
// src/data/bands.js — A GROUND'S BAND IN ABSOLUTE STEPS (lane/foundations-block, 2026-11-23; its skill line is the skill clock since stage 7).
//
// docs/design/redesign/26-architecture-pass.md section 3 rank 2, 04-math-strategy.md sections 1 and 4, 27-formula-overhaul.md S-5, K-5, K-6.
// The math is src/core/bands.js; this file is its numbers, one home each.
//
// AN ABSOLUTE STEP IS ONE LEVEL OF THE REFERENCE COMPANY'S STRENGTH, the same on every ground (02 package 3, 27 S-5). A company's absolute
// step is its RATING, 04 section 1's weighted mean of its Level, its skill and its gear, every part counted in Levels:
//   rating = L + wGear x (gear - L) + wSkill x (skillLevel - L)
//     gear        the kit's gear part (src/data/gear-steps.js: item Level x slot weight, a whole kit at X is X)
//     skillLevel  the Level at which the reference career reaches the hero's skill for its style (src/core/bands.js skillLevelPm, the skill
//                 clock read backwards): a hero on its career line has skillLevel = L, a style switcher is behind it, a trained one ahead (04
//                 section 4: "skill is counted in the same steps as Level"). Stage 7, time parity, made it the skill itself at pace 1000
//     wGear       POWER.weightGearPm / 1000 at or over L, POWER.weightGearBelowPm / 1000 under it (src/data/danger.js, the engine's own)
//     wSkill      POWER.weightSkillPm / 1000 (src/data/danger.js, the engine's own)
// The weights are the ENGINE'S power-step weights, never a second copy: the step contest reads the same gap (src/core/hunt/danger.js powerPm).
//
// THE BAND IS A FORMULA OF THE GROUND'S ENTRY LEVEL, TOP LEVEL AND TIER (the scalable rule; 12-targets 3.1 and 3.2, the designer's
// BAND_RULE companies, written as ratings so no ground needs a run to have a band):
//   floor (depth 1)    a fresh company at the entry Level: kit BAND_ABS.freshTiersBack tiers under the ground's base, skill on its line
//   reference          the reference company at the ground's refLevel: kit at the ground's base (gearLevel), skill on its line
//   top (depth 20)     a strong company at the top Level: kit BAND_ABS.topTiersAhead tiers over the base (the next ground's, worn from its
//                      item Level less GEAR_STEPS.wearAhead, so it is wearable by the top Level), skill on its line
// The depths are cut evenly in absolute steps, so "Depth N" is an even slice of strength on every ground, and depth 20 of one tier and
// depth 1 of the next overlap by the handover (27 K-6) by construction.
//
// THE BRIDGE (wave 1's measured steps, until stage 3 makes one Danger step one absolute step). The engine still plays each ground's OWN
// steps (step 0 = the ground as built; src/data/danger.js DANGER_GROUNDS). Its floorStep, refStep and topStep are now what they always
// measured, named by the formula: the own step where the formula's floor, reference and top companies HOLD (tools/new-ground.mjs measures
// them; it no longer chooses which company each is). The own step reads as an absolute step through those three points, straight between
// them (src/core/bands.js absPmOf). A step of a ground's own rows is not one unit of strength across grounds today (MEASURED 2026-11-22: a
// tier of kit moves a fresh four's hold 235 own steps on Muster Barrows, 101 on Hask's Ford, 72 to 86 on the Catacomb wings), so no
// formula can place an own step; the measurement can, and only that is measured. When monsters are derived from the reference (rank 1) and
// a blow is the step contest (stage 3), a ground's own steps are absolute steps and the three points collapse to the identity.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* THE BAND'S COMPANIES (above): how many tiers of kit under and over the ground's base its fresh and strong companies wear.
     freshTiersBack 1   12-targets 3.1 and the Lab's LOW state (standards.mjs GEAR_STATES.low: "the mid kit one band back in gear only")
     topTiersAhead 1    the next ground's base: the kit a company leaves a ground in (12-targets 3.2 "outgrown") */
export const BAND_ABS = Object.freeze({ freshTiersBack: 1, topTiersAhead: 1 });

/* THE REFERENCE SKILL LINE IS NO LONGER A TABLE (stage 7, lane/skills-time-parity 2026-11-23). It was the measured party career's main skill
   by Level (melee 52 at Level 60, 146 at Level 1,000), read backwards, because the old geometric curve put a skill point worth many Levels
   high up. The combat skills now cost a set ratio of the Level clock (src/data/core-model.js SKILL_CURVE), so the reference career reaches
   skill n with the Level whose hours are pacePm / 1000 x the hours of n: at pace 1000 the line is y = x, a skill IS its Level in the
   rating. src/core/bands.js skillLevelPm reads it; there is nothing here to re-measure. */
