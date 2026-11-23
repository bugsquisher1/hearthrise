// ════════════════════════════════════════════════════════════════════════
// src/data/power-ledger.js — THE POWER LEDGER'S RAMP AND SLICES (systems, lane/ledger-l1-l3, 2026-11-22).
//
// docs/design/redesign/19-power-ledger.md sections 1, 2 and 5 (lane L1). Every source of hero power past its Level and its gear base is a
// SLICE with one cap in steps (one step is one Level of rating, DANGER.powerStep). What a hero GROWS INTO ramps in to full size at
// rampLevel with one formula, never per node:
//   ramp(L) = min(1, L / rampLevel)
// THE RAMP NEVER TOUCHES WHAT A HERO FINDS (Tyler 2026-11-22: "Gear scaling with level seems wrong right? I don't want to punish people who
// are theory crafting or getting lucky with drops"): gear, Traits, Signatures and Temper count whole at every Level. Where luck comes from
// is the ground's gate on what drops (src/data/gear-steps.js maxRankAt), never a cap on what the hero wears.
// THE SLICES (19 section 1; the engine's clamp is src/core/power-ledger.js):
//   gear        Traits and the Signature together, at most conditionalStepsMax (src/data/gear-steps.js: it stays there), at every Level
//   build       talent ranks, crossroads, waystones, vows and borrowed moves, at most buildStepsMax x ramp, on the NET of gains and costs (a
//               vow's cost always bites, so it may buy past the cap only by paying for it; costs are never clamped)
//   consumable  imbuements, the draught and the camp pot, at most consumableStepsMax x ramp
//   temper      Temper on a whole kit, at most temperStepsMax, at every Level (it is the gear's; rank r opens at Level 40r, 21 D-2)
//   clan        clan, castle, arena and event buffs, at most clanStepsMax, ZERO until clans ship (20-v030-the-roads.md: "a new clan slice
//               of 4 steps, zero until clans ship"; ledger row 16: a new source takes a slice or is refused)
// Party-scope rows count once a party, in the wearer's slice. Level, the gear base, Inner Flame, the risk stance, roles, party size,
// Premium and Blessings take no slice (19 section 1, rows 1 to 3 and 11 to 15).
//
// STARTING VALUES, NOT RULINGS (the Lab tunes them; in band is enough):
//   rampLevel 200          19 section 2: Level 200 is where a whole build is at full size (the third vow, the final form). Lever band 120 to 200 (V8)
//   buildStepsMax 14       19 section 1 row 7: the choice ceiling, 10% pace (1b and 17 v3 section 9: 5 to 10%)
//   consumableStepsMax 6   19 section 1 row 10: imbuement 2 each, draught 3, camp pot 2, held to 6
//   temperStepsMax 5       19 section 1 row 4: ranks 1 to 5, a gear step a rank on a whole kit
//   clanStepsMax 4         20-v030-the-roads.md: everything at once 55 + 4 = 59, under three tiers (60)
//
// PURE ESM. Data only. Imports nothing (src/data/gear-steps.js reads rampLevel here for maxRankAt).
// ════════════════════════════════════════════════════════════════════════

export const POWER_LEDGER = Object.freeze({
  rampLevel: 200,
  buildStepsMax: 14,
  consumableStepsMax: 6,
  temperStepsMax: 5,
  clanStepsMax: 4,
});

/* THE SLICES, by the name a ledger row names (`slice`). `max` the cap in steps (null: the gear table's conditionalStepsMax), `ramps` true
   when the cap and its rows grow in with the hero's Level (only what a hero grows into), `signed` true when the cap holds the net of gains
   and costs (else gains only). */
export const LEDGER_SLICES = Object.freeze({
  gear: Object.freeze({ max: null, ramps: false, signed: false }),
  build: Object.freeze({ max: POWER_LEDGER.buildStepsMax, ramps: true, signed: true }),
  consumable: Object.freeze({ max: POWER_LEDGER.consumableStepsMax, ramps: true, signed: false }),
  temper: Object.freeze({ max: POWER_LEDGER.temperStepsMax, ramps: false, signed: false }),
  /* closed (`open: false`): its cap is 0 until clans ship, so a row written early counts nothing */
  clan: Object.freeze({ max: POWER_LEDGER.clanStepsMax, ramps: false, signed: false, open: false }),
});

/** The ramp at hero Level `level`: min(1, L / rampLevel), 0 under Level 1 or for no Level. One division: exact on every engine. */
export const ramp = (level) => {
  const L = Number.isFinite(level) && level > 0 ? level : 0;
  return L >= POWER_LEDGER.rampLevel ? 1 : L / POWER_LEDGER.rampLevel;
};
