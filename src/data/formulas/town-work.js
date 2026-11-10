// ════════════════════════════════════════════════════════════════════════
// src/data/formulas/town-work.js — THE DIALS OF TOWN WORK: how fast a job runs, what its XP is worth, and when a
// cook burns. The one copy of each number (lane/b-formula-home, 2026-11-10; until then they were typed in
// src/core/pacing.js and src/core/artisan.js, which still evaluate them and re-export the old names).
//
// PACING (b226, docs/design/pacing-overhaul.md)
//   xp          every EARNED XP grant of a gathering or bench skill is multiplied by this. Farming and the combat
//               skills are exempt (src/core/pacing.js PACE_EXEMPT_SKILLS): their XP is paid as written.
//   actionMs    every gathering and bench action takes this many times its row's time.
// SPEED_FUSE    the most a speed bonus may take off an action's time, whatever stacks: the ceiling lives at the one
//               expression that cannot survive a bad number, ms x (1 - speed). 0.70 is derived: the largest legal
//               stack is gatherSpeed at the 0.30 budget peak plus the 0.35 tool ladder = 0.65, five points clear.
// MIN_ACTION_MS no action is ever shorter than this.
//
// BURN (open-fire cooking; values unchanged since b225 / b227)
//   base            the chance a cook is ruined at the recipe's own level
//   perLevelRelief  that chance falls by this for each Cooking level above the recipe's
//   xpShare         a ruined cook still pays this share of the recipe's XP
//   kitchenNoBurn   what each Kitchen rung takes off the chance, one entry a rung. Rungs 4 and 5 restate 0.25
//                   because a rung's bonus REPLACES the rung below it: one that left it out would un-burn-proof a
//                   player as a reward for upgrading.
//
// BALANCE numbers: the Game Designer's. PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const PACING = Object.freeze({ xp: 0.39, actionMs: 1.60 });
export const SPEED_FUSE = 0.70;
export const MIN_ACTION_MS = 500;

export const BURN = Object.freeze({
  base: 0.25,
  perLevelRelief: 0.01,
  xpShare: 0.25,
  kitchenNoBurn: Object.freeze([0.13, 0.19, 0.25, 0.25, 0.25]),
});
