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
   re-fit (pace.mjs --fit --fit-past, minimax 5.4%); Levels 1-50 cost what they did. Forward file 2027-04-07-brook-bear-level-curve.
   LEVELS 1-9 RE-SPLIT 2026-11-19 (lane/d-142-rulings): with a kill paying 12% less the early steps read 2.01-2.40x the one before (C6), so each
   now takes about 1.95x the hours of the last (1.6-1.9x across the Cellar's end). Same total to Level 9: no live hero's Level moves. Were 159 /
   318 / 635 / 1,269 / 6,269 / 12,870 / 26,255 / 67,115. Forward file 1000-level-curve-early.
   LEVELS 7-9 RE-CUT 2026-11-20 (lane/c-levels-7-9, Tyler's 27-2): Levels 8 and 9 took a new player 3.5 and 4.2 h
   (Level 10 at 10.6 h). Steps 7-9 were 25,072 / 68,087 / 83,477; Levels 10-20 take the XP back, so Level 21 on costs what it did. Forward file 1016-level-curve-new-player. */
export const LEVEL_CURVE = Object.freeze({
  first: 210,
  brackets: Object.freeze([
    Object.freeze({ from: 1, rise: 199, bend: 0 }),
    Object.freeze({ from: 2, rise: 389, bend: 0 }),
    Object.freeze({ from: 3, rise: 762, bend: 0 }),
    Object.freeze({ from: 4, rise: 4881, bend: 0 }),
    Object.freeze({ from: 5, rise: 5872, bend: 0 }),
    Object.freeze({ from: 6, rise: 8687, bend: 0 }),
    Object.freeze({ from: 7, rise: 8000, bend: 0 }),
    Object.freeze({ from: 8, rise: 5002, bend: 0 }),
    Object.freeze({ from: 9, rise: 30000, bend: 0 }),
    Object.freeze({ from: 10, rise: 4630, bend: 0 }),
    Object.freeze({ from: 15, rise: 74323, bend: 0 }),
    Object.freeze({ from: 16, rise: 300, bend: 0 }),
    Object.freeze({ from: 21, rise: 14454, bend: 657 }),
    Object.freeze({ from: 50, rise: 78689, bend: 162 }),
    Object.freeze({ from: 110, rise: 70000, bend: 100 }), /* 2026-11-19: past the ceiling, fit by hand to the contract (no hero there) */
    Object.freeze({ from: 300, rise: 350000, bend: 100 }),
  ]),
});

/* THE HOURS A LEVEL TAKES: A FORMULA, NOT A TABLE (lane/formula-overhaul, game designer, 2026-11-22;
   docs/design/redesign/04-math-strategy.md section 5 "rise, then level off", 27-formula-overhaul.md row P-1).
   The hunted hours the reference company (a Steady four at its ground's reference step) spends on Level L:
     hours(L) = ceiling x L^2 / ((L + half) x (L + early))
   It rises from minutes (the first Levels: the `early` term) to `ceiling` hours and levels off there forever, so one
   Level (one step of power, of gear, of Danger) arrives at a steady beat past Level 400 instead of slowing without end.
   The pay a kill makes on the Danger scale is DERIVED from it (src/core/hunt/danger.js levelShareXp); nothing is fitted
   to a kill rate. Three levers, whole numbers (the server twin computes the same rational: tools/gen-danger.mjs):
     ceiling 20   hours a Level takes far out (band 16 to 24): a Level every two hunting days on the 10 h day
     half    100  the Level at which a Level takes half the ceiling (band 60 to 140): sets where the climb levels off
     early   6    the first Levels' speed-up (band 2 to 10): Level 2 in about 6 minutes, Level 5 in about 35
   THE DESIGNER'S TARGETS IT IS SET TO (hunted hours from Level 1; days on the 10 h day, Tyler 2026-11-22), COMPUTED:
     Level 5 0.6 h · 10 4.2 h (the first day) · 25 36 h (day 4) · 50 151 h (two weeks) · 100 543 h (eight weeks)
     · 200 1,683 h (about five and a half months: Level 200 is a big deal) · 400 4,600 h (fifteen months) · 1,000 14,930 h
   tests/hunt-core/danger.mjs pins the engine to this function; tests/level-curve.mjs C7 holds a Steady four at its held
   depth to it on the real engine. */
export const LEVEL_HOURS = Object.freeze({ ceiling: 20, half: 100, early: 6 });
/** The hunted hours Level `level` takes (to `level` + 1), on the levers `k`. */
export function levelHoursOf(level, k = LEVEL_HOURS) {
  const L = Number.isInteger(level) && level >= 1 ? level : 1;
  return (k.ceiling * L * L) / ((L + k.half) * (L + k.early));
}
/** The hunted hours from Level 1 to REACH Level `level`. */
export function hoursToLevel(level, k = LEVEL_HOURS) {
  let s = 0;
  for (let L = 1; L < level; L++) s += levelHoursOf(L, k);
  return s;
}

/* THE PACE THE CURVE IS HELD TO (tests/level-curve.mjs; not read by the game).
   targets    [Level, cumulative hunting hours], DERIVED from LEVEL_HOURS above at the old checkpoints (lane/formula-overhaul:
              the 2026-10-25 hand table is retired; its readers keep their shape)
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
              measures them and the contract only covers what lies beyond.
   newPlayer  Tyler 2026-11-20 (27-2): `level` is held on the hero a new player is (life.mjs `party`
              on `policy`, no event) inside `hours`, each step L -> L+1 in a `steps` band in `h`
              hours (tests/start-kit-pace.mjs); C2/C3 judge the careers on the rest. */
export const LEVEL_PACE = Object.freeze({
  targets: Object.freeze([10, 25, 50, 100, 200, 300, 500, 750, 1000].map((L) => Object.freeze([L, Math.round(hoursToLevel(L) * 10) / 10]))),
  tolerance: 0.1,
  early: Object.freeze({ level: 5, hours: Object.freeze([0.15, 0.35]), aim: 0.25 }),
  /* RE-PINNED 2026-11-08 (lane/b-one-difficulty) to the measured ladder on the re-tuned rows (plan ladder: the Cellar at 4.5 8,774, the Thicket at
     10 24,883, Wickstead at 13 33,760, the Glade at 23.5 84,781, the Warrens at 47.5 222,774): was 1019 x L^1.365, which read the Glade's and the
     Warrens' band middles 1.12x and the Cellar's 1.10x (C5: -10.6% against the ladder at Level 100). Each now reads 0.93-1.05x.
     RE-PINNED 2026-11-10 (lane/c-brook-bear) to the re-measured ladder (the Cellar at 4.5 8,774, the Thicket at 10 25,001, Wickstead at 13 33,907,
     the Glade at 23.5 89,098, the Warrens at 47.5 242,111): 1049 x L^1.383 read -13.4% against it at Level 300 (C5). */
  contract: Object.freeze({ a: 1385, b: 1.274 }), /* re-pinned to the measured ladder 2026-11-19 (XP a kill x0.88; was 1378 x L^1.298) and 2026-11-11 (the Warrens x0.76; was 975 x L^1.421) */
  smooth: Object.freeze({ from: 1, ratio: 2 }),
  newPlayer: Object.freeze({ party: Object.freeze(['tank']), policy: 'new', level: 10, aim: 6, hours: Object.freeze([5, 7]),
    steps: Object.freeze([Object.freeze({ from: 1, to: 9, aim: 2, h: 2.5 }), Object.freeze({ from: 10, to: 15, aim: 4, h: 4.5 })]) }),
});

/* THE COMBAT SKILLS ON THE LEVEL CLOCK (stage 7, lane/skills-time-parity 2026-11-23; docs/design/redesign/04-math-strategy.md section 4,
   27-formula-overhaul.md row P-3): Melee, Ranged, Magic and Defense. A skill level costs a set ratio of the hunted hours the same Level
   takes, so a hero who always uses one style has that skill near its Level, a hero who splits is behind in both, and the hours a skill
   costs never part from the hours a Level costs (the retired 15 x s^2 x 1.04^(s-1) cost 59 h a skill level at 100 where Level 100 takes 9).
     XP from skill level n to n + 1 = floor(pacePm / 1000 x levelHoursOf(n) x xpPerHealthHour x refHealthOf(n))
   counted in the reference skill XP an hour (the main skill of a seat of the reference company, a Steady four at its ground's reference,
   earns xpPerHealthHour XP an hour a point of the reference health of its Level: every skill route pays a share of a blow, a mana pool or
   a monster's Level, all of them straight lines in Level, src/core/hunt-rewards.js). Exact in whole numbers (src/core/xp.js walks it in
   BigInt; the server's twin is tools/gen-skill-curve.mjs). Levers:
     pacePm           1000  skillPace (band 800 to 1250): the hours a skill level takes over the hours that Level takes. At 1000 a
                            specialist's skill tracks its Level; over 1000 a skill trails its Level, under it runs ahead
     xpPerHealthHour  120   MEASURED (band 100 to 140; tools/balance-program/redesign/skills/parity.mjs): the main skill XP a hunted hour
                            over the reference health of the Level, on every scale ground at its reference Level (2026-11-23, 4 seeds x
                            4 h, the Steady mixed four's damage dealers: Hask's Ford 142 / 124, Muster Barrows 132 / 146, the Catacomb wings
                            108 / 99 and 107 / 111). Not a balance dial: it says what the pay side pays, so the curve counts in hours
     top              10000 the last skill level the curve is written to (the server's rows): 190,000 hunted hours, 52 years of 10 h days.
                            Past it a skill keeps its XP and reads `top`, as the old curve stopped at 476 (2^53)
   No cap a hero can meet. Inner Flame is not on this clock: FLAME_SKILL_CURVE below. */
export const SKILL_CURVE = Object.freeze({ pacePm: 1000, xpPerHealthHour: 120, top: 10000 });

/* THE REFERENCE HEALTH OF A LEVEL: the display curve of max HP with no armor bonus (VITALS below), 150 + 10 (L - 1). The amount pipeline
   sizes every blow on it (src/core/hunt/amount.js refHealth reads this) and the skill clock counts in it (SKILL_CURVE above). */
export function refHealthOf(level) {
  return VITALS.hpBase + VITALS.hpPerLevel * (Math.max(1, Math.floor(Number(level) || 1)) - 1);
}

/* INNER FLAME'S CURVE (Q2, the core rebuild's uncapped curve, the four combat skills' too until stage 7): XP from level s to s + 1 =
   floor(base x s^2 x (1 + growthPermille / 1000)^(s - 1)), walked in exact integers (src/core/xp.js) to 2^53 (level 476). Inner Flame
   trains at the Hearth, never in a fight, and its fuel's XP is sized on this curve (FLAME_FUEL below; tests/hearth-fuel-rate.mjs B1):
   it keeps this curve until the flame of docs/design/redesign/21-flame-temper-imbue-loot.md retires the skill's XP (its build step 5).
   The server's rows: hr_skill_curve (tools/gen-catalogues.mjs). */
export const FLAME_SKILL_CURVE = Object.freeze({ skill: 'inner_flame', base: 15, growthPermille: 40 });

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

/* ── THE MODEL'S NAMES AND CEILINGS THAT DATA ROWS READ (moved down from src/core 2026-11-19, lane/c-delivery: each was a data
   file's import of the engine, a layering breach in tests/layering.baseline.json; the engine files re-export them). ── */

/* The skills the `combatXP` bonus channel pays: the four trained in a fight
   (CORE_MODEL.md §4). Inner Flame trains at the Great Hearth, not in a fight. ONE list,
   read by both the XP grant and the hint the player sees. (src/core/progression.js) */
export const COMBAT_XP_SKILLS = ['melee', 'ranged', 'magic', 'defense'];
/* The gathering skills (src/core/pacing.js). */
export const GATHER_SKILLS = ['woodcutting', 'mining', 'fishing'];
/* +SKILL ON WORN GEAR: the item field that raises each combat skill while worn (src/core/combat.js, where the rule is). */
export const SKILL_PLUS_FIELDS = Object.freeze({ melee: 'meleePlus', ranged: 'rangedPlus', magic: 'magicPlus', defense: 'defensePlus' });
/* The item a burnt cook yields (src/core/artisan.js, where the burn is rolled). */
export const BURNT_ITEM = 'burnt_food';
/** The hard ceiling on any single class multiplier. Applied by the formula (src/core/bane.js baneMultFor). */
export const MAX_BANE_MULT = 1.40;
