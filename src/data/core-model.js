// ════════════════════════════════════════════════════════════════════════
// src/data/core-model.js — THE CORE MODEL'S NUMBERS (docs/design/CORE_MODEL.md;
// Tyler 2026-10-19 "Rebuild the core"; values: Game Designer ruling
// docs/design/reviews/CORE_NUMBERS_2026-10-19.md, pending Tyler's approval).
//
// Level comes from kills only and is endless; Melee, Ranged, Magic, Defense and
// Inner Flame train by use with no cap; gathering and crafting skills cap at 99
// (src/core/xp.js owns every curve; the server twins are pinned to these rows
// by tests/core-curves.mjs). Every number here is ONE data constant, so a
// ruling is a data edit, never a code change.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* THE LEVEL CURVE (balance layer 1, lane/b-level-curve 2026-10-27; Tyler's balance
   ruling 2026-10-25 §2; replaces the 10-19 quartic, which on the same measurement took
   Level 10 in about 1 h and Level 1000 in about 150,000 h; no single polynomial fits
   the ruling's table within 20%). The XP one Level costs, in PACE BRACKETS: from Level
   `from` (until the next bracket) the step from Level L to L+1 costs
       first + rise x m + bend x m^2,   m = L - from,
   `first` being the first bracket's own step (Level 1 -> 2) and, for every later
   bracket, the step the bracket before it would have charged next (so a one-Level
   bracket's rise is simply the next step minus its own); every Level costs more than the
   one before (rise + bend >= 1) and the last bracket runs forever (Levels are endless).
   Total XP to reach a Level is an exact integer in every runtime (src/core/xp.js; the
   server's hr_level_curve rows are generated from these by tools/gen-level-curve.mjs).
   Held by tests/level-curve.mjs to LEVEL_PACE below on the balance simulator's real-engine
   measurement (tools/balance-sim/pace.mjs): to Level 50 the Level XP an hour of a hero
   hunting where the game recommends, past it LEVEL_PACE.contract.
   THE FIRST TEN LEVELS ARE PACED ONE BY ONE (lane/b-curve-smooth 2026-10-28; the new-player
   walk: the 10-27 curve gave five Levels in 15 min, then a 7x wall at Level 6 just as the
   hero entered the Thicket). Each Level takes about twice the minutes of the one before
   in the Mill Cellar (1, 2, 4, 8: Level 5 in a quarter of an hour, the tutorial's
   promise), the Thicket's first Level twice the Cellar's last, then each about 1.77x
   (16, 28, 49, 86, 152 min) into Level 10's step, which with every Level after it is the
   10-27 curve's to the XP (137,918 XP at Level 10; the Wickstead re-fit below moved every
   bracket, Level 10 is now 158,938). The XP step
   jumps 6x at Level 5 because the Thicket pays three times the Cellar. Then the rest of
   today's content (10), the long climb (50, 300). */
/* RE-FITTED 2026-10-28 (lane/a-v0263-reds): Wickstead (8-18 solo) opened and pays the 8-15 stretch faster, so the pace
   was re-measured (plans pace + ladder) and pace.mjs --fit re-fitted the brackets (minimax 3.4%); Levels 6-8 then eased
   by hand so no Level is 2x the one before (C6). Forward file 2027-02-07-level-curve-wickstead.
   RE-FITTED 2026-10-29 (lane/a-pull-freeze, Coordinator ruling): with every pack down a hero now walks on to the next
   spawn instead of standing on the pocket it cleared (report #69), so Levels 5-15 earn 7-12% more an hour (the Thicket,
   Wickstead) and 16-49 1-3% (the Glade); Level 25 fell to 32 h. Re-measured (plans pace + ladder) and re-fitted by
   pace.mjs --fit (minimax 3.3%). Forward file 2027-02-09-walk-on-level-curve.
   EASED 2026-11-07 (lane/b-ground-formula-2): the formula's Cellar pays a Level 4 hero 1.2% more an hour than a Level 3 (was 2.1%) and its Thicket a
   Level 5 23,066 (was 24,624), so C6 read 2.00x at Level 4 -> 5 and 2.14x at 5 -> 6. By hand, each step under 2x the minutes before it: 4 -> 5
   1,015 XP (was 1,035), 5 -> 6 5,980 (6,437), 6 -> 7 12,100 (12,795), 7 -> 8 24,800 (25,363); Level 8 -> 9 on costs what it did, every total from 9
   on 1,715 XP less. Forward file 2027-03-20-ground-formula-level-curve.
   RE-FITTED 2026-11-08 (lane/b-one-difficulty, Tyler "Same monsters, re-tune"): with one pack for every group a lone hero takes
   the whole kill, and a career that stays on the Glade past its band (16 to 50, where the Hunts window sends a lone hero) earned
   10-15% more an hour from 30 on, so Level 25 fell to 32.0 h and Level 50 to 144.7 h (targets 36 and 168), and Level 5 -> 6 read
   2.30x Level 4 -> 5 (C6). Re-measured (plans pace + ladder) and re-fitted by pace.mjs --fit (minimax 2.8%): then by hand each step from
   Level 4 to 8 a little under 2x the minutes before it (C6: 4 -> 5 1,135 XP, 5 -> 6 5,800, 6 -> 7 12,080, 7 -> 8 25,450). Level 10 at 182,805 XP in
   all (was 176,197), Level 25 at 1,981,795, Level 50 at 16,018,945. Past the ceiling the brackets re-fitted (--fit --fit-past) to the
   re-pinned contract below, so Levels 100-1,000 keep their targets. Forward file 2027-03-23-one-difficulty-level-curve.
   RE-FITTED PAST THE CEILING 2026-11-10 (lane/c-brook-bear): the Brook Bear stands in the Glade as built (the designer's ruling 3), which moved the
   pace fingerprint, so plans pace + ladder were re-measured: Level 25 in 34.5 h, Level 50 in 161.5 h (careers; 35.0 and 168.4 before), every
   bracket under 50 holds (C2). The ladder now trends 975 x L^1.421: the Glade's band middle +5.1% (the bear) and the Warrens' +8.7% (other lanes
   since 11-09; the bear alone would read C5 -3.0% at Level 300, the Warrens alone -10.3%). The contract follows it, so the brackets from Level 50
   re-fit (pace.mjs --fit --fit-past, minimax 5.4%); Levels 1-50 cost what they did. Forward file 2027-04-07-brook-bear-level-curve. */
export const LEVEL_CURVE = Object.freeze({
  first: 159,
  brackets: Object.freeze([
    Object.freeze({ from: 1, rise: 159, bend: 0 }),
    Object.freeze({ from: 2, rise: 317, bend: 0 }),
    Object.freeze({ from: 3, rise: 634, bend: 0 }),
    Object.freeze({ from: 4, rise: 5000, bend: 0 }), /* the fit said 5164; eased so Level 5 -> 6 stays under 2x Level 4 -> 5 (level-curve C6 read 2.04x) */
    Object.freeze({ from: 5, rise: 6601, bend: 0 }), /* the fit said 6998; Levels 5-7 eased by hand so each step stays under 2x the one before (C6; the fit sat at 2.00) */
    Object.freeze({ from: 6, rise: 13385, bend: 0 }),
    Object.freeze({ from: 7, rise: 40860, bend: 0 }),
    Object.freeze({ from: 8, rise: 16362, bend: 0 }),
    Object.freeze({ from: 9, rise: 1, bend: 0 }),
    Object.freeze({ from: 10, rise: 0, bend: 657 }),
    Object.freeze({ from: 50, rise: 78689, bend: 162 }),
    Object.freeze({ from: 300, rise: 203586, bend: 598 }),
  ]),
});

/* THE PACE THE CURVE IS HELD TO (tests/level-curve.mjs; not read by the game).
   targets    Tyler's balance ruling 2026-10-25 §2: [Level, cumulative hunting hours]
              of reasonably efficient hunting (12 h a day, no bought stamina)
   tolerance  every target within this share (the ruling's targets are benchmarks)
   early      Level `level` within `hours` (the fit aims at `aim`): the tutorial's
              "about a quarter of an hour" in the Mill Cellar before the Thicket opens
              (hunt-tutorial.js earn_the_thicket); the guard checks the careers
   smooth     from Level `from` to the ceiling, no Level takes more than `ratio` times the
              hours of the Level before it at the reference rate (no wall: the 10-27
              curve's Level 6 took 7x Level 5's); a ground that pays more may make the
              next Level quicker
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
  /* RE-PINNED 2026-11-08 (lane/b-one-difficulty) to the measured ladder on the re-tuned rows (plan ladder: the Cellar at 4.5 8,774, the Thicket at
     10 24,883, Wickstead at 13 33,760, the Glade at 23.5 84,781, the Warrens at 47.5 222,774): was 1019 x L^1.365, which read the Glade's and the
     Warrens' band middles 1.12x and the Cellar's 1.10x (C5: -10.6% against the ladder at Level 100). Each now reads 0.93-1.05x.
     RE-PINNED 2026-11-10 (lane/c-brook-bear) to the re-measured ladder (the Cellar at 4.5 8,774, the Thicket at 10 25,001, Wickstead at 13 33,907,
     the Glade at 23.5 89,098, the Warrens at 47.5 242,111): 1049 x L^1.383 read -13.4% against it at Level 300 (C5). */
  contract: Object.freeze({ a: 1378, b: 1.298 }), /* re-pinned to the measured ladder 2026-11-11 (lane/d-solo-fifteen: the Warrens x0.76 flattened the top rung; level-curve C5), was 975 x L^1.421 */
  smooth: Object.freeze({ from: 1, ratio: 2 }),
});

/* THE UNCAPPED SKILL CURVE (Q2): Melee, Ranged, Magic, Defense, Inner Flame.
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
     resting rate is hunt-tuning.js oocRegenPermillePerS); Inner Flame multiplies both. */
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
   what each slot wears, with no mixing penalty. Measured against the ATTACKER's level (2026-11-04, Tyler's "just simply harder": stats against stats, no hero Level in a blow), so a
   hard monster's blow gets through low armor more, a weak one's barely does, and an old set fades as the ground climbs. A floor's monsters stand above its Level, so the k fell from 0.7 and 0.45 to hold the +25% floors
   (tests/hunt-core/drop-tables.mjs; board 2026-11-04). src/core/mitigation.js derives the profile; it is never stored.
     dodge.maxPm, dodge.k   medium: the chance a blow misses you entirely,
                            maxPm x P / (P + k x the attacker's level), P = medium armour value
     absorb.maxPm, absorb.k heavy: the share of a landed blow the armour takes, same curve
     ward.perPointPm        light: a flat amount off every landed blow, P x perPointPm / 1000
                            (best against many small blows, little against one big one)
     capPm                  THE TOTAL CAP: dodge, absorb and ward together never take more than
                            this permille of the damage coming at you
   The to-hit roll before the chain reads the Defense skill and the defence of gear outside the
   armour weights (a shield): combat.js equipmentStats guardB. */
export const ARMOUR_MITIGATION = Object.freeze({
  dodge: Object.freeze({ maxPm: 650, k: 0.4 }),
  absorb: Object.freeze({ maxPm: 750, k: 0.62 }),
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

/* INNER FLAME (Q6; Tyler: no cap, regen RATES only, a diminishing curve; Tyler 2026-10-25:
   Inner Flame replaces Prayer and keeps its job). The rate is
   1 + maxPermille/1000 x P / (P + k), P = the Inner Flame level: never reaches
   double, so food and drink stay necessary. */
export const FLAME_REGEN = Object.freeze({ maxPermille: 1000, k: 50 });

/* A MONSTER'S LEVEL when its row names none (Q5: an unplaced monster, by tier).
   A placed monster carries its own `level` (src/data/monsters.js). */
export const MONSTER_LEVEL_BY_TIER = Object.freeze({ 1: 5, 2: 15, 3: 35, 4: 60, 5: 90, 6: 130 });

/* INNER FLAME FROM FUELLING THE HEARTH (CORE_NUMBERS 2026-10-19 line 99: the skill ~ 0.6 x
   Level for a player who burns everything; Tyler 2026-10-25: feed the Hearth, raise your Inner
   Flame). Fuelling is a bench action, so its XP rides the pacing dial like every artisan grant
   (pacing.js PACE.xp 0.39: the root cause of the live 3 bones -> 5 XP, 2026-10-19), and fractions
   carry in player_skills.xp_frac.
     refLevel / refFlame   plain Bones serve Inner Flame 1-15 (Big Bones open at 15), reached by
                           Level 25: 0.6 x 25 = 15
     bonesPerHour          a hero burning every bone of an in-range cellar hunt:
                           464 kills/h x 0.26 bones a kill (forest-cave --play,
                           measured 2026-10-19)
     refHours              the hours to refLevel the rate was fitted to: the 10-19
                           curve at its guard's line (2,900 x Level XP an hour). The
                           10-27 Level curve (lane/b-level-curve) takes about 36 h to
                           Level 25, so a hero who burns everything now reaches Inner
                           Flame 15 near Level 11: the skill, like every combat skill,
                           runs ahead of Level until the skill layer re-fits it
                           (ruling 2026-10-25 §13.2, not approved)
     xpPerBone             the Inner Flame XP a bone PAYS: skillXp(inner_flame, refFlame) /
                           (bonesPerHour x refHours)
                           = 22,539 / (121 x 11.97) = 15.56, to the tenth
                           (tests/hearth-fuel-rate.mjs re-derives it)
     recipeXp              the fuel_bones row's authored (pre-dial) XP: recipeXp x
                           PACE.xp = xpPerBone exactly (40 x 0.39 = 15.6). The family fuels
                           (Lamp Jelly, Dry Husk, Pithwood) pay the same: a boneless
                           creature's fuel is its bones (src/data/hearth.js).
   Only the plain-bones rung is set from the curve: the rungs above it keep the designer's
   2026-09-12 values (scaling the whole ladder by the same factor breaks the per-apply XP
   clamp at the top rungs). */
export const FLAME_FUEL = Object.freeze({
  refLevel: 25, refFlame: 15, bonesPerHour: 121, refHours: 11.97, xpPerBone: 15.6, recipeXp: 40,
});

/* FOOD HEALS MOVED x12 WITH MONSTER DAMAGE (CORE_NUMBERS Q3: monsterAttackDamageScale
   0.45 -> 5.4, every food and basic `heals` x12, prices unchanged); THE DRINKS followed
   (designer 2026-10-21: every drink's `mana` x12 with the mana pools, basics' prices x5/3).
   The literal heals and mana in items.js / drinks.js / supply-basics.js are already scaled;
   this is the grain the basics' "three quarters of the crafted partner" rule is applied at,
   food and drink alike (tests/supplies-catalogue.mjs B1). */
export const FOOD_HEAL_SCALE = 12;
