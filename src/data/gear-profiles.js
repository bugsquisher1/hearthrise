// ════════════════════════════════════════════════════════════════════════
// src/data/gear-profiles.js — WHAT A PIECE OF GEAR IS MADE OF: THE LEVERS OF THE ONE STAT FORMULA (Systems, lane/gear-catalogue-steps,
// 2026-11-22; docs/design/redesign/04-math-strategy.md section 10, 02-architecture.md package 2, src/data/gear-steps.js).
//
// Every weapon, armor piece, off-hand, cloak and jewel's base stats are DERIVED by one pure formula (src/core/gear-stats.js gearStats):
//
//   stat k of a piece  =  profile[k]  x  share(slot)  x  budget(curve, item Level)  x  rarityPm  /  10^9
//   (a field the profile lists under `even` takes GEAR_EVEN_SHARE_PM in place of its slot's share: the same on every piece)
//
//   share(slot)        GEAR_SLOT_PM[slot]: the permille of a whole kit's stat budget each slot carries. The weapon, the off-hand and the
//                      jewels are the power step's own (src/data/gear-steps.js GEAR_STEPS.slotPm); the six armor slots split the same 450
//                      as the shipped armor did (a helm 44 to a platebody's 90 to gauntlets' 23 at Dawnsteel), so a part-worn kit fights as
//                      it did. A two-handed weapon also carries the shield's share (GEAR_STEPS.twoHand), as the step reads it
//   budget(c, iL)      GEAR_CURVES[c]: a whole kit's points at item Level iL, c0 + c1 x iL + c2 x iL^2 (the piece's item Level: its `iL`,
//                      else its `reqLv`, the same number the power step reads, src/core/hunt/danger.js itemLevelOf)
//   profile            the family's (a weapon) or the weight's (armor) row below, in permille of its slot's share of the budget
//   rarityPm           RARITY_PM: 1000 for every rarity. 04 section 10 rule 1, "no variance in the base": a Rare buys a Trait, never a
//                      bigger number (02 package 2). The row is here so the formula reads the rarity it is handed, and a lever exists
//
// A NAMED OR UNIQUE PIECE (a boss's blade, a crafted signet, a shield with a story) is the formula's piece too: no row carries an offset
// (the designer, lane/named-pieces 2026-11-23, docs/design/redesign/28-named-pieces.md). What sets one apart is its name and lore, a
// rule it already carries (a bane, a resistance, a cloak's Steady armor), or a fixed Trait on its row (`fixedTrait`, hidden). tools/gen-gear.mjs
// writes every piece's stats into src/data/gear-stats.generated.js (`--check`: the drift guard), and each item module reads them back
// through withGearStats below, so a new tier or a new piece is one data row and the stats follow.
//
// ON THE DANGER SCALE (src/data/danger.js DANGER_GROUNDS) a piece's stats are read at the ground's base item Level moved GEAR_SCALE_STAT_PM
// of the way to the piece's own (src/core/gear-stats.js scaleItems): the power step carries the tier, and the stats carry only that share
// of it, so the two never stack into a cliff (the shipped tier back read -38 held steps and up +29 with the stats whole, 6 seeds x 12 h,
// tools/balance-program/redesign/gear-steps/before-muster-L60; at 0 the stats carried nothing and a shipped weapon-and-armor tier moved
// +8 / -3, under one depth, gear-steps/view-0). Off the scale the stats are read at the piece's own item Level.
//   GEAR_SCALE_STAT_PM 500   JUDGMENT, measured to land C-2 (12-targets: one gear tier moves the hold 1 to 3 depths): gear-steps/*.txt
//   GEAR_CURVE_TOP 88         the item Level the squared curve is drawn to (Dawnsteel, the seven-tier ladder's top). Past it the budget
//                             grows IN PROPORTION to item Level: budget(top) x iL / top (src/core/gear-stats.js budgetOf), so the formula
//                             prices any item Level and nothing is capped (lane/gear-phase-b, 2026-11-23; 27-formula-overhaul G-2 phase B,
//                             the ladder past 88 on tierSteps, src/data/gear-tiers.js MATERIAL_TIERS). Proportional, not the square: the
//                             square would triple a piece's armor at item Level 160, and the old chain's armor (a share P / (P + k L) of the
//                             ATTACKER's Level, src/core/mitigation.js) and its blow against a health line in Level both hold their worth
//                             when a stat grows with the Level it faces, the same shape the staged lines past Dawnsteel were measured on
//                             (tools/balance-sim/staged: x Level / 110). JUDGMENT, measured on the
//                             Tower (tools/balance-sim/tower-curve.mjs) and the Catacomb wings in the lane's report. ON THE DANGER SCALE the
//                             view below holds its stats at this top (src/core/gear-stats.js scaleStatLevel): there the item Level is the
//                             power, and grown stats moved one style's hold through the old chain's last readers
//
// STARTING VALUES, NOT RULINGS (lane/gear-catalogue-steps 2026-11-22; the Lab tunes them, in band is enough):
//   GEAR_CURVES   the SHAPES the seven-tier ladder's attack and armor tables were hand-drawn on, fitted by least squares over all seven
//                 tiers (attack grows about 11x from Level 1 to 88, armor about 16x), then scaled so DAWNSTEEL (item Level 88, the top of the
//                 ladder and the base of the staged armor and weapon lines past it, under tools/balance-sim/staged) lands on its
//                 shipped numbers to the point: offense 210 and defense 625 a whole kit at 88. Under it the curves were re-cut so the first-week
//                 rungs hold their bars (tests/hunt-core/first-week-bands.mjs armor-rungs and weapon-rungs: each early tier's piece rounds where
//                 its rung reads): offense 18.5 / 1.4 / 0.00885, defense 37.85 / 2.096 / 0.05203
//   profiles      each family's and weight's Dawnsteel piece over its share of that budget (the sword's accuracy is 1000). Below 88 a piece
//                 is the curve's, so a hand-tuned rung (the hatchets' Iron +2, the warhammer's Iron +3) is gone: no tier has its own number
//
// PURE ESM. Data only: no rule, no import from src/core.
// ════════════════════════════════════════════════════════════════════════

import { GEAR_STATS } from './gear-stats.generated.js';

/* THE BASE STATS the formula writes (every other field of a row is the row's own: its words, book, Level, attributes) */
export const GEAR_STAT_FIELDS = Object.freeze(['defB', 'atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB', 'critB']);

/* a whole kit's points at item Level iL: c0 + c1 iL + c2 iL^2.
   `guard` and `jewel` are straight lines (the designer, lane/named-pieces 2026-11-23, 28-named-pieces.md section 3): a shield's guard and a
   jewel's points climbed by the same step every tier, and the squared curves gave a Level 1 to 15 jewel nothing and halved an early shield.
   guard lands the shield ladder's guards 3 / 5 / 7 / 11 / 13 at item Levels 1 / 15 / 30 / 60 / 75 and Krell's Tollgate's 15 at 88; jewel
   lands a ring's 1 / 2 / 3 points at 1 / 15 / 30, and the Dawnforged Signet's 7 at 84 */
export const GEAR_CURVES = Object.freeze({
  offense: Object.freeze({ c0: 18.5, c1: 1.4, c2: 0.00885 }),
  defense: Object.freeze({ c0: 37.85, c1: 2.096, c2: 0.05203 }),
  guard: Object.freeze({ c0: 35.9, c1: 1.667, c2: 0 }),
  jewel: Object.freeze({ c0: 18.6, c1: 1.38, c2: 0 }),
});

/* the header: the item Level the squared curve is drawn to (proportional past it), and the share of a piece's item-Level gap its stats keep
   on the Danger scale (permille) */
export const GEAR_CURVE_TOP = 88;
export const GEAR_SCALE_STAT_PM = 500;

/* the share of a whole kit's stat budget each slot carries (permille; the header) */
export const GEAR_SLOT_PM = Object.freeze({
  weapon: 200, shield: 80, helmet: 70, body: 144, pants: 102, boots: 48, gloves: 37, belt: 48, cape: 60,
  necklace: 70, ring: 50, earrings: 40,
});
/* an `even` field's share: one armor piece's mean (450 / 6) */
export const GEAR_EVEN_SHARE_PM = 75;

/* THE PROFILES. `curve` names its budget; each other key is a base stat in permille of the slot's share of it. A weapon family's key is
   src/core/gear-stats.js profileKeyOf's (weaponType, hands and discipline); an armor weight's is its armourClass. */
export const GEAR_PROFILES = Object.freeze({
  /* WEAPONS: one style's accuracy and damage. A two-handed family also carries the shield's share, so its numbers here are smaller. */
  sword: Object.freeze({ curve: 'offense', atkB: 1000, strB: 833 }),
  warhammer: Object.freeze({ curve: 'offense', atkB: 544, strB: 1156 }),
  hatchets: Object.freeze({ curve: 'offense', atkB: 714, strB: 646 }),
  /* the hidden fist line has no Dawnsteel rung: its shape is its two sample rungs' (src/data/fists.js) */
  fists: Object.freeze({ curve: 'offense', atkB: 700, strB: 860 }),
  bow: Object.freeze({ curve: 'offense', rangeAtkB: 765, rangeStrB: 612 }),
  crossbow: Object.freeze({ curve: 'offense', rangeAtkB: 1024, rangeStrB: 881 }),
  staff: Object.freeze({ curve: 'offense', magicAtkB: 612, magicStrB: 833 }),
  wand: Object.freeze({ curve: 'offense', magicAtkB: 1000, magicStrB: 1071 }),
  /* OFF-HANDS: the Mage's book (Magic and a little armor), the shield (armor) */
  spellbook: Object.freeze({ curve: 'offense', magicAtkB: 833, magicStrB: 1131, defB: 714 }),
  shield: Object.freeze({ curve: 'guard', defB: 1000 }),
  /* a grate (the Kingsgrate, the Steelgrate): a heavy shield that guards 1.4 times a plain one and costs every style's aim, the tank's
     own trade. A weight of shield, as plate is a weight of armor: a row says `gearProfile: 'grate'` */
  grate: Object.freeze({ curve: 'guard', defB: 1400, atkB: -800, rangeAtkB: -800, magicAtkB: -800 }),
  /* ARMOR WEIGHTS: the triangle of gear-tiers.js (plate buys survival and costs ranged and magic aim; leather half the armor for ranged
     aim and a little crit; cloth the least armor for Magic's aim and damage) */
  plate: Object.freeze({ curve: 'defense', defB: 1000, rangeAtkB: -250, magicAtkB: -500 }),
  /* leather's crit is the same on every piece (the shipped 0.4% a tier a piece, 2.8% at Dawnsteel) */
  leather: Object.freeze({ curve: 'defense', defB: 550, rangeAtkB: 500, magicAtkB: -150, even: Object.freeze({ critB: 0.597 }) }),
  cloth: Object.freeze({ curve: 'defense', defB: 305, magicAtkB: 600, magicStrB: 111, atkB: -250, rangeAtkB: -200 }),
  /* CLOAKS AND JEWELS: small, every style alike (a cloak's own attribute, its Steady armor, is an attribute, not a base stat) */
  cape: Object.freeze({ curve: 'offense', strB: 120, rangeStrB: 120, magicStrB: 120 }),
  jewel: Object.freeze({ curve: 'jewel', atkB: 1000, strB: 1000, rangeAtkB: 1000, rangeStrB: 1000, magicAtkB: 1000, magicStrB: 1000 }),
});

/* 04 section 10 rule 1: rarity never sizes the base */
export const RARITY_PM = Object.freeze({ common: 1000, uncommon: 1000, rare: 1000, epic: 1000, legendary: 1000, mythic: 1000, unique: 1000 });

/** The generated stats of item `id` (src/data/gear-stats.generated.js), or null for an id the generator has not written. */
export const gearStatsOf = (id) => (Object.prototype.hasOwnProperty.call(GEAR_STATS, id) ? GEAR_STATS[id] : null);

/**
 * An item module's rows with their DERIVED stats: each row's base stats are dropped and the generated ones put in their place, so no
 * module keeps a stat by hand. A row the generator has not written yet keeps none (tools/gen-gear.mjs --check is red until it
 * is written). Rows that are not gear pass through unchanged. `prefix` names a table's own key space in the generated file (the staged
 * special-attribute sample, 'special:', whose ids can be live items' too).
 */
export function withGearStats(rows, prefix = '') {
  const out = {};
  for (const [id, row] of Object.entries(rows)) {
    const s = row && row.slot && row.type !== 'ammo' ? gearStatsOf(prefix + id) : null;
    if (!s) { out[id] = row; continue; }
    const r = {};
    for (const [k, v] of Object.entries(row)) if (!GEAR_STAT_FIELDS.includes(k)) r[k] = v;
    out[id] = Object.isFrozen(row) ? Object.freeze(Object.assign(r, s)) : Object.assign(r, s);
  }
  return out;
}
