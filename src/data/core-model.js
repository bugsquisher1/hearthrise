// ════════════════════════════════════════════════════════════════════════
// src/data/core-model.js — THE CORE MODEL'S NUMBERS (docs/design/CORE_MODEL.md;
// Tyler 2026-10-19 "Rebuild the core"; values: Game Designer ruling
// docs/design/reviews/CORE_NUMBERS_2026-10-19.md, pending Tyler's approval).
//
// Level comes from kills only and is endless; Melee, Ranged, Magic, Defense and
// Prayer train by use with no cap; gathering and crafting skills cap at 99
// (src/core/xp.js owns every curve; the server twins are pinned to these rows
// by tests/core-curves.mjs). Every number here is ONE data constant, so a
// ruling is a data edit, never a code change.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* THE LEVEL CURVE (Q1, re-ruled after Tyler's 10-19 review: slower). Total XP to
   reach Level L = quartic x (L-1)^4 + cubic x (L-1)^3 + linear x (L-1): an integer,
   0 at Level 1, endless (L100 ~ 540 h, L200 ~ 4,000 h in range). */
export const LEVEL_CURVE = Object.freeze({ quartic: 1, cubic: 20, linear: 50 });

/* THE LEVEL GUARD'S LINE (Q1): a hero hunting in range earns xpPerHourPerLevel x
   Level XP an hour; summed over Levels 1..199 the curve must take between
   `hoursTo200` hours, and Level 10 between `hoursTo10` (tests/level-curve.mjs).
   Not read by the game. */
export const LEVEL_GUARD = Object.freeze({ xpPerHourPerLevel: 2900, hoursTo200: Object.freeze([3800, 4200]),
  hoursTo10: Object.freeze([0.75, 2]) });

/* THE UNCAPPED SKILL CURVE (Q2): Melee, Ranged, Magic, Defense, Prayer.
   XP from level s to s+1 = floor(base x s^2 x (1 + growthPermille/1000)^(s-1)),
   the power walked in exact integers (src/core/xp.js), so the browser, the edge
   and Postgres agree to the unit. No cap. */
export const SKILL_CURVE = Object.freeze({ base: 15, growthPermille: 40 });

/* VITALS FROM LEVEL AND ARMOUR WEIGHT (Q3; the armour shares are Tyler's:
   heavy up to +28% HP, light up to +35% mana, blended by the share of armour
   slots worn of that weight). */
export const VITALS = Object.freeze({
  hpBase: 150,
  hpPerLevel: 10,
  manaBase: 100,
  manaPerLevel: 10,   // Tyler 2026-10-19: "10 and 10"
  heavyHpPermille: 280,
  lightManaPermille: 350,
  /* Q6: HP regenerates this permille of max a second DURING a fight (the
     resting rate is hunt-tuning.js oocRegenPermillePerS); Prayer multiplies both. */
  inFightRegenPermillePerS: 3,
});

/* ARMOUR WEIGHT, by the armour row's `armourClass` (gear-tiers.js lines; items.js
   uniques), and the slots that count toward the share. */
export const ARMOUR_WEIGHT = Object.freeze({ plate: 'heavy', heavy: 'heavy', leather: 'medium', medium: 'medium', cloth: 'light', light: 'light' });
export const ARMOUR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);

/* COMBAT SKILL XP (Q4, Q5).
     hitXpPerDamage            Melee or Ranged XP per HP a hero's blow removes from
                               a monster (the weapon family decides which skill)
     defenseXpPerLevelPermille Defense XP per monster blow AIMED at a hero wearing
                               armour (hit or miss), permille per level of the
                               ATTACKER (MONSTERS[*].level): 200 = 0.2 x level
     blockMult                 a blow a shield-holding hero turns aside pays this
                               many times the Defense XP
   Magic is mana spent x 1.5 x the ability's multiplier (hunt-xp.js). Combat XP is
   not scaled by the pacing dial (pacing.js PACE_EXEMPT_SKILLS): the curve was
   fitted to these numbers as paid. */
export const COMBAT_XP = Object.freeze({
  hitXpPerDamage: 1.5,
  defenseXpPerLevelPermille: 200,
  blockMult: 2,
});

/* PRAYER (Q6; Tyler: no cap, regen RATES only, a diminishing curve). The rate is
   1 + maxPermille/1000 x P / (P + k), P = the Prayer level: never reaches
   double, so food and drink stay necessary. */
export const PRAYER_REGEN = Object.freeze({ maxPermille: 1000, k: 50 });

/* A MONSTER'S LEVEL when its row names none (Q5: an unplaced monster, by tier).
   A placed monster carries its own `level` (src/data/monsters.js). */
export const MONSTER_LEVEL_BY_TIER = Object.freeze({ 1: 5, 2: 15, 3: 35, 4: 60, 5: 90, 6: 130 });

/* PRAYER FROM BURYING (CORE_NUMBERS 2026-10-19 line 99: Prayer ~ 0.6 x Level for a
   player who buries everything). Burying is Prayer's only XP source and Prayer is
   exempt from the pacing dial (it is a combat skill, pacing.js), so a bone pays
   exactly xpPerBone; fractions carry in player_skills.xp_frac.
     refLevel / refPrayer  the plain-bones rite serves Prayer 1-15 (Big Bones open at
                           15), reached by Level 25: 0.6 x 25 = 15
     bonesPerHour          a hero burying every bone of an in-range cellar hunt:
                           464 kills/h x 0.26 bones a kill (forest-cave --play,
                           measured 2026-10-19)
     xpPerBone             skillXp(prayer, refPrayer) / (bonesPerHour x hours to
                           refLevel at LEVEL_GUARD's rate) = 22,539 / (121 x 11.97)
                           = 15.56, to the half (tests/bury-rate.mjs re-derives it)
     ladderBase            the plain-bones XP of the designer's 2026-09-12 rite ladder:
                           every rite keeps its ratio to it (recipes.js rite()), so
                           the ladder stays in order; its own retune is the designer's
                           Prayer pass. */
export const PRAYER_BURY = Object.freeze({
  refLevel: 25, refPrayer: 15, bonesPerHour: 121, xpPerBone: 15.5, ladderBase: 4.5,
});

/** A prayer rite's XP from its 2026-09-12 ladder value: the same ratio to plain bones, at xpPerBone, to the half. */
export function riteXp(ladderXp) {
  return Math.round((ladderXp * PRAYER_BURY.xpPerBone * 2) / PRAYER_BURY.ladderBase) / 2;
}

/* FOOD HEALS MOVED x12 WITH MONSTER DAMAGE (CORE_NUMBERS Q3: monsterAttackDamageScale
   0.45 -> 5.4, every food and basic `heals` x12, prices unchanged). The literal heals in
   items.js / supply-basics.js are already scaled; this is the grain the basics' "three
   quarters of the crafted partner" rule is applied at (tests/supplies-catalogue.mjs B1). */
export const FOOD_HEAL_SCALE = 12;
