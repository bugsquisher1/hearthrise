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

/* THE LEVEL CURVE (balance layer 1, lane/b-level-curve 2026-10-27; Tyler's balance
   ruling 2026-10-25 §2; replaces the 10-19 quartic, which on the same measurement took
   Level 10 in about 1 h and Level 1000 in about 150,000 h; no single polynomial fits
   the ruling's table within 20%). The XP one Level costs, in PACE BRACKETS: from Level `from` (until
   the next bracket) the step from Level L to L+1 costs
       first + rise x m + bend x m^2,   m = L - from,
   `first` being the first bracket's own step (Level 1 -> 2) and, for every later
   bracket, the step the bracket before it would have charged next, so a step never
   jumps and every Level costs more than the one before (rise + bend >= 1). The last
   bracket runs forever (Levels are endless). Total XP to reach a Level is an exact
   integer in every runtime (src/core/xp.js; the server's hr_level_curve rows are
   generated from these by tools/gen-level-curve.mjs). Fitted by the balance
   simulator (tools/balance-sim/pace.mjs) to LEVEL_PACE below on the real engine: to
   Level 50 the measured Level XP an hour of a hero hunting where the game recommends,
   past it LEVEL_PACE.contract. The brackets: 1 the Mill Cellar's first levels (Level 5
   in about a quarter of an hour, the tutorial's promise), 5 the first ground, 10 the
   rest of today's content, 50 and 300 the long climb. */
export const LEVEL_CURVE = Object.freeze({
  first: 60,
  brackets: Object.freeze([
    Object.freeze({ from: 1, rise: 0, bend: 122 }),
    Object.freeze({ from: 5, rise: 12591, bend: 0 }),
    Object.freeze({ from: 10, rise: 0, bend: 489 }),
    Object.freeze({ from: 50, rise: 80832, bend: 119 }),
    Object.freeze({ from: 300, rise: 211914, bend: 578 }),
  ]),
});

/* THE PACE THE CURVE IS HELD TO (tests/level-curve.mjs; not read by the game).
   targets    Tyler's balance ruling 2026-10-25 §2: [Level, cumulative hunting hours]
              of reasonably efficient hunting (12 h a day, no bought stamina)
   tolerance  every target within this share (the ruling's targets are benchmarks)
   early      Level `level` within `hours` (the fit aims at `aim`): the tutorial's
              "about a quarter of an hour" in the Mill Cellar before the Thicket opens
              (hunt-tutorial.js earn_the_thicket); the guard checks the careers
   contract   past the last Level the simulator can measure (no ground beyond it), a
              ground pays a x Level^b Level XP an hour at its own Level: the trend of
              today's solo grounds in their bands (Cellar, Thicket, Glade, Warrens:
              tools/balance-sim/level-pace.json `ladder`). It is what a NEW ground must
              pay for the curve to hold; once grounds past Level 50 exist, the simulator
              measures them and the contract only covers what lies beyond. */
export const LEVEL_PACE = Object.freeze({
  targets: Object.freeze([[10, 6], [25, 36], [50, 168], [100, 600], [200, 1680], [300, 3120], [500, 6720], [750, 13440], [1000, 23520]]
    .map((t) => Object.freeze(t))),
  tolerance: 0.1,
  early: Object.freeze({ level: 5, hours: Object.freeze([0.15, 0.35]), aim: 0.25 }),
  contract: Object.freeze({ a: 1086, b: 1.333 }),
});

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

/* WHAT ARMOUR DOES TO A BLOW (Tyler 2026-10-18, ruling K7: "Heavy = Absorb, Medium = Dodge, Light = Ward;
   mixed pieces blend by slot share; fixed damage order dodge, absorb, resistances, ward, HP; total
   mitigation cap"; numbers: Game Designer 2026-10-21, docs/planning/PRIORITY_BOARD.md Decisions).
   Each worn piece's armour value (its `defB`) feeds its OWN weight's line, so a mixed set splits by
   what each slot wears, with no mixing penalty. Measured against the hero's own Level, so
   armour of your tier keeps its worth as you climb and an old set fades. src/core/mitigation.js
   derives the profile; it is never stored.
     dodge.maxPm, dodge.k   medium: the chance a blow misses you entirely,
                            maxPm x P / (P + k x Level), P = medium armour value
     absorb.maxPm, absorb.k heavy: the share of a landed blow the armour takes, same curve
     ward.perPointPm        light: a flat amount off every landed blow, P x perPointPm / 1000
                            (best against many small blows, little against one big one)
     capPm                  THE TOTAL CAP: dodge, absorb and ward together never take more than
                            this permille of the damage coming at you
   The to-hit roll before the chain reads the Defense skill and the defence of gear outside the
   armour weights (a shield, a cape): combat.js equipmentStats guardB. */
export const ARMOUR_MITIGATION = Object.freeze({
  dodge: Object.freeze({ maxPm: 650, k: 0.45 }),
  absorb: Object.freeze({ maxPm: 750, k: 0.7 }),
  ward: Object.freeze({ perPointPm: 1500 }),
  capPm: 600,
});

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
   player who buries everything). Burying is a bench action, so its XP rides the
   pacing dial like every artisan grant (pacing.js PACE.xp 0.39: the root cause of the
   live 3 bones -> 5 XP, 2026-10-19), and fractions carry in player_skills.xp_frac.
     refLevel / refPrayer  the plain-bones rite serves Prayer 1-15 (Big Bones open at
                           15), reached by Level 25: 0.6 x 25 = 15
     bonesPerHour          a hero burying every bone of an in-range cellar hunt:
                           464 kills/h x 0.26 bones a kill (forest-cave --play,
                           measured 2026-10-19)
     refHours              the hours to refLevel the rate was fitted to: the 10-19
                           curve at its guard's line (2,900 x Level XP an hour). The
                           10-27 Level curve takes about 36 h to Level 25, so a hero who
                           buries everything now reaches Prayer 15 near Level 11: Prayer,
                           like every combat skill, runs ahead of Level until the skill
                           layer re-fits it (ruling 2026-10-25 §13.2, not approved)
     xpPerBone             the Prayer XP a bone PAYS: skillXp(prayer, refPrayer) /
                           (bonesPerHour x refHours)
                           = 22,539 / (121 x 11.97) = 15.56, to the tenth
                           (tests/bury-rate.mjs re-derives it)
     recipeXp              the bury_bones row's authored (pre-dial) XP: recipeXp x
                           PACE.xp = xpPerBone exactly (40 x 0.39 = 15.6)
   Only the plain-bones rite is set from the curve: the rites above it keep the
   designer's 2026-09-12 values until the designer's Prayer pass (scaling the whole
   ladder by the same factor breaks the per-apply XP clamp at the top rites). */
export const PRAYER_BURY = Object.freeze({
  refLevel: 25, refPrayer: 15, bonesPerHour: 121, refHours: 11.97, xpPerBone: 15.6, recipeXp: 40,
});

/* FOOD HEALS MOVED x12 WITH MONSTER DAMAGE (CORE_NUMBERS Q3: monsterAttackDamageScale
   0.45 -> 5.4, every food and basic `heals` x12, prices unchanged); THE DRINKS followed
   (designer 2026-10-21: every drink's `mana` x12 with the mana pools, basics' prices x5/3).
   The literal heals and mana in items.js / drinks.js / supply-basics.js are already scaled;
   this is the grain the basics' "three quarters of the crafted partner" rule is applied at,
   food and drink alike (tests/supplies-catalogue.mjs B1). */
export const FOOD_HEAL_SCALE = 12;
