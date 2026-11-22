# Balance baseline 04: the Sensitivity Matrix

Lane BL-4 (systems engineer, 2026-11-21 and 22). Deliverable 4 of Tyler's directive of 2026-11-21, "Establish a Global Balance Baseline Before the Overhaul", Phase 4. The interaction analysis is `05-interactions.md`.

**The baseline.** Every number here was played on the overhaul's starting build, `set/v0.2.144` at `861ae52e3` (branch `baseline/overhaul-start`), not on the live game. No gameplay number was changed. Every perturbation lived on a scratch copy inside the simulator.

**What this is for.** The overhaul is being redesigned from first principles, the math included. So this page is EVIDENCE of how today's formulas behave: which levers dominate, which do nothing, where the cliffs and caps come from. It is not a tuning guide for today's numbers, and it does not grade anything against an old ruling. Where a target matters, it is a candidate from `03-targets.md`, and every one of those is a design hypothesis.

**Labels.** MEASURED means played on the real engine, with its run, seeds and hours. COMPUTED means arithmetic on named inputs. JUDGMENT marks a call of mine. UNKNOWN means not measured, with the reason.

## 0. One screen

**What was run.** 51 levers, each at 3 to 8 steps from x0.5 to x2, one at a time: 339 points. 68 scenarios a point, 4 seeds each, on the real engine. About 1.2 million hero-hours over four GitHub runs (44969087150, 44971044252, 44972398698, 44976040886). The nine joint experiments are in `05-interactions.md`.

**How good the reading is.** A rate (kills, XP, gold) is known to about a sixth of a percent a cell. Deaths are thin: one seat dies, and the pass holds at most four deaths a cell.

**The eight things to know.**

| # | Finding | The number |
|---|---|---|
| 1 | Power barely buys pace. Kills are capped by dead time and respawn | Hero damage x2: +28% kills alone, +10% for the four on Normal. The four sits at 84% to 97% of the spawn ceiling |
| 2 | XP is paid for monster health, so harder monsters level heroes faster | Monster health x2: +33% XP alone, +63% for the four on Normal |
| 3 | The levers that move pace one for one are all reward multipliers, and all clean | XP a kill 1.00, XP by Level 1.48, party XP 1.01, tier XP 1.00 |
| 4 | Death is a wall, on one seat | Lone hammer on Dangerous: 0, 94, 1,120 deaths in 1,000 hours at monster damage x0.9, x1, x1.25. The four on Deadly: none at x2 |
| 5 | Hero health works backwards | Hero health x2: +128% damage taken, deaths from 7 to 19 in 1,000 hours |
| 6 | Armor stops at the 60% cap, so armor points do nothing for a geared hero at home | Armor points x2: no change in damage taken. The cap x1.1: 14% less |
| 7 | The store bill is a tax on three ways, and it is where most side effects land | Bow, Mage and Healer pay 35% to 90% of their gold in. The rest pay 0% to 13% |
| 8 | A quarter of the levers are weak or dead | Crit size x2: +1% damage. Weapon accuracy x2: under 0.5%. Spell leech, Necrotic, Storm: nothing |

**The six lists Tyler asked for** are section 6. The structural findings (what caps kills, where the wall comes from, what dominates) are section 7. What the pass does not cover is section 9.

**On the three knobs the Lab read as dead.** `xpPerKill`, `xpByLevel` and `levelCurve` are live on this baseline: elasticities of 1.00 and 1.48 on XP, and 0.90 on hours a Level. They read dead on the proposed game because two proposals replace the code that reads them and leave the numbers written. The sweep now refuses such a knob (`matrix-scratch.mjs knobReach`, with planted-fault proofs in `balance-matrix.mjs --selftest`).

---

## 1. What was played

**The cells.** 68 scenarios, a slice of BL-1's baseline list (`tools/balance-program/baseline/scenarios.mjs`), with the same keys, the same hours and the same four seeds. So the unpatched column here is the baseline's own number for that cell.

| Block | Cells | What it holds |
|---|---|---|
| Every way alone | 32 | The eight weapon ways, MID gear, Normal, at Levels 10, 30, 60 and 110 |
| Gear axis, alone | 12 | The hammer and the Mage on LOW and BIS gear, Normal, at Levels 30, 60 and 110 |
| Tier axis, alone | 12 | The hammer and the Mage, MID, on Dangerous and Deadly, at Levels 30, 60 and 110 |
| The four | 12 | The standard four (hammer, bow, Mage, Healer). MID on all three tiers at Levels 30, 60 and 110. LOW and BIS on Normal at Level 60. MID on Normal at Level 10 |

Each cell is on the ground the game advises for its Level and party size. That is Wickstead and the Millrace Sewer at Level 10, Mosslight Glade at 30, the Slake (alone) and the Muster Barrows (the four) at 60, and Krell's Hold at 110. So Level and ground move together in this pass. Section 9 says what that hides.

**Hours and seeds.** Four seeds a cell. A seed plays one continuous hunt under the real death rule, for 2 hours at Level 10, 4 at Level 30 and 8 from Level 60. One point is 2,592 hero-hours. Seed k plays the same dice on every tree, so each lever step is read against the base as a pair, seed by seed.

**The levers.** 51 in all (`tools/balance-program/sensitivity/levers.mjs`).

- The 35 live knobs of `tools/balance-program/formulas/knobs.json`.
- 16 families of written numbers no knob covers: respawn time, spell mana cost, spell cooldown, spell damage share, heal size, shield size, spell leech, store food price, store drink price, weapon damage, weapon accuracy, armor points, store rune price, what dropped gear sells for, the wait between pulls, and the Blessings' cut of a death. A family scales every number of its kind by one multiplier. These are not new knobs for the game. They are how the simulator moves parameters that already exist.

<!-- GEN: list name=levers -->
| Lever id | What it is | Kind | Steps played |
|---|---|---|---|
| playerAttack | Player attack | knob, Player combat | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| critMult | Critical hit size | knob, Player combat | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| weaknessDamage | Weakness bonus | knob, Player combat | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| toHitBase | To-hit base | knob, Player combat | x0.8, x0.9, x0.95, x1.05, x1.1, x1.2 |
| heroAccuracy | Player to-hit | knob, Player combat | x0.8, x0.9, x0.95, x1.05, x1.1, x1.2 |
| attackInterval | Attack interval | knob, Player combat | x0.5, x0.75, x0.9 |
| spellRollLow | Spell roll floor | knob, Player combat | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| manaRegen | Mana regeneration | knob, Player combat | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| storeSupplyShare | Store supply strength | knob, Player combat | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| monsterDamage | Monster damage | knob, Monsters | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| monsterHp | Monster HP | knob, Monsters | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| monsterDefense | Monster defense | knob, Monsters | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| monsterDefenseCut | Defense cut a point | knob, Monsters | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| partyGroundHp | Party ground HP | knob, Monsters | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| partyGroundBlow | Party ground blow | knob, Monsters | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| tierDanger | Harder-tier blows | knob, Tiers | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| tierHp | Harder-tier HP | knob, Tiers | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| tierXp | Harder-tier XP | knob, Tiers | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| tierPull | Harder-tier pull | knob, Tiers | x0.5, x0.75, x1.25, x1.5, x2 |
| heroHp | Hero HP | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| heroMana | Hero mana | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| armorMitigation | Armor mitigation | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| armorCurve | Armor against Level | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2, x2.4 |
| mitigationCap | Mitigation cap | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5 |
| regen | Regeneration | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| xpPerKill | XP a kill | knob, Rewards | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| xpByLevel | XP a kill by Level | knob, Rewards | x0.8, x0.9, x0.95, x1.05, x1.1, x1.2 |
| soloXp | Solo XP bonus | knob, Parties | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| partyXp | Party XP table | knob, Parties | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| levelCurve | Level XP curve | knob, Progression | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| deathLoss | Death cost | knob, Progression | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| necroticCut | Necrotic's heal cut | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| stormDrain | Storm's mana burn | knob, Survival | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| respawn | Respawn time | family, Spawns | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| spellCost | Spell mana cost | family, Spells | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| spellCooldown | Spell cooldown | family, Spells | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| spellPower | Spell damage share | family, Spells | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| healPower | Heal spell size | family, Spells | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| shieldPower | Shield spell size | family, Spells | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| spellLeech | Life leech (spells) | family, Spells | x0.25, x0.5, x2, x3 |
| foodPrice | Store food price | family, Supplies | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| drinkPrice | Store mana drink price | family, Supplies | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| weaponDamage | Weapon damage by tier | family, Equipment | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| weaponAccuracy | Weapon accuracy by tier | family, Equipment | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| armorValue | Armor points by slot and tier | family, Equipment | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| runePrice | Store rune price | family, Supplies | x0.5, x0.75, x0.9, x1.1, x1.25, x1.5, x2 |
| gearSaleRate | What dropped gear sells for | family, Rewards | x0.5, x0.75, x1.25, x1.5, x2 |
| regroup | Wait between pulls | family, Spawns | x0.2, x0.5, x2, x4 |
| blessingCut | Blessings' cut of a death | family, Progression | x0.5, x0.75, x1.25 |
<!-- /GEN -->

The outcomes the tables name.

<!-- GEN: list name=outcomes -->
| Outcome id | What it is | Read as |
|---|---|---|
| dps | Party damage a hunted second (walks and rests inside it) | relative change |
| killsPerH | Kills a party-hour | relative change |
| ttkS | Seconds to kill, median | relative change |
| takenPerH | Damage taken a hero-hour | relative change |
| healInPerH | Healing received a hero-hour (food, own and ally spells) | relative change |
| deathsPer1000h | Deaths in 1,000 hunted hero-hours | pooled rate |
| lowHpP10 | Lowest health of a fight, the worst tenth (worst seat) | absolute change |
| huntedShare | Share of the offered time hunted (a death, a bar or a purse ends a hunt) | absolute change |
| levelXpPerH | Level XP a hunted hero-hour | relative change |
| netLevelXpPerH | Level XP after deaths (Blessings cut) an offered hero-hour | relative change |
| hoursPerLevel | Hours for the next Level (offered hours, after deaths) | relative change |
| mainSkillXpPerH | Main weapon skill XP a hero-hour | relative change |
| incomePerH | Gold in a hero-hour (coin and loot) | relative change |
| storePerH | Gold out on store supplies a hero-hour | relative change |
| netPerH | Net gold a hero-hour (in less store and Blessings, no home-made share) | absolute change |
| suppliesPerH | Store supplies used a hero-hour (units) | relative change |
| castsPerH | Spells cast a hero-hour | relative change |
| manaPotionsPerH | Mana drinks a hero-hour (own and store) | relative change |
<!-- /GEN -->

**The steps.** Multipliers on today's value. The usual ladder is x0.5, x0.75, x0.9, x1.1, x1.25, x1.5 and x2. A chance, a cap or an exponent takes a narrower ladder (x0.8 to x1.2), because doubling it leaves the range its formula can read. The armor curve also plays x2.4, the value the last balance pass proposed.

**How an effect is read.**

- A rate (damage, kills, XP, gold in, supplies) is read as a relative change. For each seed, the change in each cell is divided by that cell's base mean, then averaged over the cells of a group. The estimate is the mean over the seeds. Its standard error is the seeds' spread over the root of the seed count.
- A share or a signed number (low health, hunted share, net gold) is read as an absolute change, the same way.
- Deaths are pooled over a group's cells and seeds and read as a rate in 1,000 hunted hero-hours, with a Poisson error.
- RESOLVED means the estimate is further from zero than 3.18 standard errors (Student's t for four seeds) and more than half a percent. Everything else is printed with a `~` or a `.` and is not called an effect.
- ELASTICITY is ln(outcome ratio) / ln(lever multiplier). 1 means the outcome moves in proportion to the lever, 0 not at all, a negative number the other way. LOCAL is read between x0.9 and x1.1. LOW and HIGH are read at the ends of the ladder. A lever whose three differ is nonlinear.

**The proofs.** `sensitivity.mjs --selftest` plants a patch and imports the planted tree's own data: every open ground's respawn, every ability's mana and cooldown, every store price and every gear table row must hold the scaled value. `analyze.mjs --selftest` plants effects, noise and interactions in memory and reads them back.

---

## 2. Signal and noise

MEASURED on the base job of run 44969087150 (68 cells, 4 seeds, 2,592 hero-hours). The same job played on Tyler's PC (Windows, Node 26) and on GitHub (Linux, Node 20) answered all 68 cells byte for byte the same.

The seed to seed spread of one cell, as a share of its mean:

| Outcome | Median cell | Nine cells in ten under | Worst cell |
|---|---|---|---|
| Kills an hour, damage, Level XP an hour | 0.3% | 0.7% to 0.9% | 2.5% to 9.7% |
| Damage taken an hour | 1.4% | 3.9% | 9.3% |
| Gold in an hour | 1.5% | 3.1% | 11% |
| Store gold an hour | 0.6% | 4.4% | 115% |
| Supplies an hour | 0.5% | 3.4% | 115% |
| Lowest health, worst tenth of fights (absolute) | 0.004 | 0.010 | 0.14 |
| Net gold an hour (absolute) | 225 | 682 | 32,200 |

What this means for the pass:

- **Rates are quiet.** With four seeds a cell, a rate is known to about a sixth of a percent. A 1% effect on kills or XP is resolved in one cell. Four seeds were more than a rate needs.
- **The worst cell is always the same kind.** It is the lone hammer on Dangerous or Deadly, where the hero dies and the hunt stops. The hours hunted then swing from seed to seed, and everything read per hour swings with them.
- **Deaths are the weak reading.** A cell holds 16 to 128 hero-hours a point. The whole pass holds 2,592. So a death rate is only read on pooled groups, and a change is only called when the pooled counts differ by two Poisson errors. A cell of 128 hero-hours with no death cannot rule out a rate under about 23 in 1,000 hours (hard constraint HC-4 in `03-targets.md`), and most cells are smaller. Where this page says deaths did not move, read it as "not by enough for this sample".
- **Healing received is not a usable outcome alone.** In most lone cells a hero eats a handful of times a seed, so the spread is 10% at the median and 200% at the worst. It is printed, and never ranked.

---

## 3. What the base says before any lever moves

MEASURED, the same base job. These are not sensitivities. They are the shape of the ground the levers act on, and three of them explain most of the matrix.

### 3.1 The spawn ceiling

COMPUTED from `src/data/hunt-grounds.js` and `hunt-tiers.js`: a ground cannot give more kills an hour than the monsters one lap brings, times 3,600 seconds, over its respawn time. A tier's pull fills each pocket to its number, so the ceiling rises on the harder tiers.

| Cell (MID gear) | Ground | Kills an hour | Ceiling | Share |
|---|---|---|---|---|
| The four, Level 30, Normal | Mosslight Glade | 754 | 780 | 97% |
| The four, Level 30, Dangerous | Mosslight Glade | 1,916 | 2,160 | 89% |
| The four, Level 30, Deadly | Mosslight Glade | 2,469 | 2,880 | 86% |
| The four, Level 110, Normal | Krell's Hold | 571 | 600 | 95% |
| The four, Level 110, Dangerous | Krell's Hold | 1,562 | 1,800 | 87% |
| The four, Level 110, Deadly | Krell's Hold | 1,553 | 1,800 | 86% |
| The four, Level 60, Normal | Muster Barrows | 706 | 840 | 84% |
| The four, Level 60, Dangerous | Muster Barrows | 1,037 | 2,240 | 46% |
| The four, Level 10, Normal | Millrace Sewer | 548 | 760 | 72% |
| Mage alone, Levels 10 to 110, Normal | four grounds | 481 to 666 | 600 to 780 | 80% to 85% |
| Hammer alone, Levels 10 to 110, Normal | four grounds | 406 to 560 | 600 to 780 | 66% to 78% |
| Healer alone, Levels 10 to 110, Normal | four grounds | 347 to 485 | 600 to 780 | 58% to 63% |
| Hammer alone, harder tiers | three grounds | 619 to 929 | 1,800 to 2,880 | 26% to 39% |

The four sits at 84% to 97% of the ceiling on Normal, and at 86% to 89% on the harder tiers of the Glade and Krell's Hold. On those cells the seed to seed spread of kills is zero to 0.1%, which is what a hard cap looks like. Only the Muster Barrows on the harder tiers, a ground built for a party, leaves the four room.

### 3.2 Who dies

| Seat (MID gear) | Normal | Dangerous | Deadly |
|---|---|---|---|
| The four, Levels 30, 60, 110 | 0 deaths in 320 hero-hours | 0 in 320 | 0 in 320 |
| Mage alone, Levels 30, 60, 110 | 0 in 80 | 0 in 80 | 1 in 78 |
| Hammer alone, Level 30 | 0 in 16 | 0 in 16 | 4 in 4 (dead in every seed) |
| Hammer alone, Level 60 | 0 in 32 | 4 in 8 (dead in every seed) | 4 in under 1 hour |
| Hammer alone, Level 110 | 0 in 32 | 1 in 29 | 4 in 9 (dead in every seed) |

Death in this build is one seat's problem. The lone melee hero falls off a cliff one tier up. The Mage alone and the four do not die at all in this sample, on any tier. Every death reading in the matrix is therefore the lone hammer's.

### 3.3 The three axes a player climbs

Level XP an hour, a hero.

| Seat | LOW gear | MID | BIS | MID over LOW | BIS over MID |
|---|---|---|---|---|---|
| Hammer alone, Level 30 | 90,682 | 113,517 | 124,700 | +25% | +10% |
| Hammer alone, Level 60 | 265,670 | 322,351 | 350,046 | +21% | +9% |
| Hammer alone, Level 110 | 685,640 | 732,251 | 797,271 | +7% | +9% |
| Mage alone, Level 30 | 106,839 | 135,291 | 141,943 | +27% | +5% |
| Mage alone, Level 60 | 339,284 | 416,424 | 435,927 | +23% | +5% |
| Mage alone, Level 110 | 830,425 | 866,700 | 918,668 | +4% | +6% |
| The four, Level 60 | 440,815 | 526,886 | 549,999 | +20% | +4% |

| Seat (MID) | Normal | Dangerous | Deadly | Deadly over Normal |
|---|---|---|---|---|
| Mage alone, Level 60 | 416,424 | 986,290 | 1,087,045 | x2.6 |
| Mage alone, Level 110 | 866,700 | 1,548,548 | 1,692,348 | x2.0 |
| The four, Level 30 | 56,249 | 140,918 | 195,984 | x3.5 |
| The four, Level 60 | 526,886 | 791,632 | 869,244 | x1.6 |
| The four, Level 110 | 380,541 | 1,099,848 | 1,241,730 | x3.3 |
| Hammer alone, Level 60, before deaths | 322,351 | 670,808 | 718,141 | x2.2 |
| Hammer alone, Level 60, after deaths | 322,351 | 105,721 | below zero | |

| Level | The four, a head | Its four ways alone, mean | Four over alone, XP | Four over alone, net gold |
|---|---|---|---|---|
| 10 | 51,561 | 37,142 | 1.39 | 0.96 |
| 30 | 56,249 | 117,462 | 0.48 | 0.35 |
| 60 | 526,886 | 345,764 | 1.52 | 1.05 |
| 110 | 380,541 | 739,155 | 0.51 | 0.31 |

Three readings.

- **A tier step is worth far more than a gear step.** The best gear adds 4% to 10% over MID. One tier up multiplies XP by 1.6 to 3.5 for any seat that survives it. Gear matters mostly as the ticket to the tier.
- **The four on Normal is a trap on two of four grounds.** At Levels 30 and 110 it earns half of what its heroes earn alone, because it is at the spawn ceiling of a ground built for one hero's pace. On the Muster Barrows, built for a party, it earns 1.5 times.
- **Gold does not follow XP.** A harder tier pays the Mage more XP and less gold (Level 110: 16,873 on Normal, 7,988 on Deadly). Better gear costs a caster gold: the Mage at Level 30 nets 6,868 an hour in MID and loses 1,569 an hour in BIS, because faster kills mean more casts and a bigger store bill.

### 3.4 Who pays the store

Store gold as a share of gold in, alone, MID, Normal.

| Level | Tank | Sword | Hammer | Axes | Bow | Crossbow | Mage | Healer |
|---|---|---|---|---|---|---|---|---|
| 60 | 2% | 2% | 0% | 3% | 71% | 2% | 90% | 67% |
| 110 | 13% | 10% | 0% | 2% | 70% | 7% | 52% | 35% |

The supply bill is a tax on three ways (bow, Mage, Healer) and close to nothing for the rest. Any lever that moves casts, arrows or prices is a lever on those three and no one else. The harness sells every drop at once and never runs out of gold, so gold here is an upper bound (hard constraint HC-5 in `03-targets.md`).

---

## 4. The matrix

MEASURED. Runs 44969087150, 44971044252, 44972398698 and 44976040886, 4 seeds, 2,592 hero-hours a point. One row a lever, one column an outcome. Each cell is the LOCAL elasticity. Where the ends of the ladder differ from it, the low and high elasticities follow in brackets. A `.` means nothing resolved at any step. Rows are sorted by their largest elasticity.

For the outcomes read as absolute changes the number is the change for one unit of ln(multiplier), which is a multiplier of 2.7: deaths in 1,000 hours for `deathsPer1000h`, share of health for `lowHpP10`, gold an hour for `netPerH`.

### 4.1 Every cell

<!-- GEN: matrix group=all outcomes=dps,killsPerH,takenPerH,deathsPer1000h,lowHpP10,levelXpPerH,netLevelXpPerH,incomePerH,storePerH,netPerH -->
| Lever | dps | killsPerH | takenPerH | deathsPer1000h | lowHpP10 | levelXpPerH | netLevelXpPerH | incomePerH | storePerH | netPerH |
|---|---|---|---|---|---|---|---|---|---|---|
| monsterDamage | . | -0.01 | 1.08 | 39.32 (10.40 / 31.36) | -0.25 | -0.01 | -1.42 (-0.55 / -0.42) | . | 0.62 (0.25 / 2.74) | -30690.00 (-10750.00 / -6064.00) |
| xpByLevel | . | . | . | . | 0 | 1.48 | 1.56 | . | . | . |
| tierDanger | 0 | -0.02 | 0.53 (0.14 / 0.51) | 41.82 (10.40 / 63.59) | -0.17 | -0.02 | -1.66 (-0.55 / -0.42) | -0.03 | 0.51 (0.12 / 0.18) | -35400.00 (-7834.00 / -2888.00) |
| spellCost | . | . | . | . | . | . | . | . | 0.42 (0.20 / 1.52) | -1365.00 (-716.70 / -2704.00) |
| mitigationCap | . | 0.02 | -0.89 (-0.73 / -0.33) | -29.25 (-17.04 / -9.07) | 0.20 | 0.03 | 1.38 (0.28 / 0.44) | . | -0.45 (-1.21 / -0.11) | 35990.00 (3965.00 / 6610.00) |
| armorMitigation | . | 0 | -0.41 (-0.59 / -0.10) | -6.08 (-14.24 / -1.14) | 0.08 | 0.01 | -0.06 (0.26 / -0.04) | . | -0.36 (-1.34 / -0.06) | 10060.00 (8483.00 / 1140.00) |
| heroHp | . | . | 1.23 | 20.76 (5.86 / 17.62) | -0.06 | 0 | -0.61 (-0.40 / -0.28) | . | 0.17 | -13460.00 (-5566.00 / -8463.00) |
| xpPerKill | . | . | . | . | 0 | 1.00 | 1.03 | . | -0.01 | 95.97 (38.68 / 124.70) |
| playerAttack | 0.50 | 0.51 | -0.60 | -8.74 | 0.14 | 0.52 | 0.86 | 0.52 | -0.67 | 24280.00 |
| heroMana | . | . | . | . | 0 | . | . | . | -0.23 (-0.90 / -0.18) | 769.50 |
| soloXp | . | . | . | . | 0 | 0.82 | 0.85 | . | -0.01 | 80.94 (37.29 / 121.60) |
| monsterHp | 0.50 | -0.50 | 0.43 | 12.71 (7.59 / 10.16) | -0.12 | 0.50 | -0.15 (0.22 / 0.23) | 0.19 | 0.49 (0.58 / 0.88) | -8065.00 |
| manaRegen | . | . | . | . | 0 | . | . | . | -0.22 (-0.82 / -0.18) | 723.10 |
| spellCooldown | -0.20 | -0.20 | 0.21 | 14.24 (9.85 / 5.71) | -0.07 | -0.20 | -0.59 (-0.78 / -0.33) | -0.21 | -0.30 (-0.26 / -0.10) | -15070.00 (-10030.00 / -9924.00) |
| runePrice | . | . | . | . | . | . | . | . | 0.44 (0.33 / 0.67) | -5219.00 (-3582.00 / -7345.00) |
| spellPower | 0.28 | 0.28 | -0.22 | -6.21 | 0.08 | 0.30 | 0.33 (0.38 / 0.67) | 0.31 | -0.33 | 16830.00 (9963.00 / 15860.00) |
| respawn | -0.13 (-0.02 / -0.49) | -0.13 (-0.02 / -0.49) | -0.15 (-0.02 / -0.50) | . | 0 | -0.13 (-0.02 / -0.49) | -0.13 (-0.02 / -0.49) | -0.13 (-0.02 / -0.50) | -0.17 (-0.03 / -0.60) | -591.20 (-112.90 / -3990.00) |
| tierHp | 0.07 | -0.12 | 0.10 | . | -0.03 | -0.12 | -0.54 (-0.49 / -0.21) | -0.12 | 0.14 | -13810.00 |
| weaponDamage | 0.14 | 0.14 | -0.15 | . | 0.04 | 0.14 | 0.38 (0.19 / 0.48) | 0.14 | -0.14 | 7601.00 |
| heroAccuracy | 0.19 | 0.19 | -0.17 | . | 0.06 | 0.20 | 0.40 (0.45 / -0.05) | 0.20 | . | 6072.00 |
| attackInterval | -0.26 | -0.25 | -0.45 | -20.61 (-13.39 / -20.61) | 0.06 | -0.24 | . | -0.23 | -0.09 (-0.34 / -0.09) | 12430.00 (1453.00 / 12430.00) |
| armorCurve | . | . | 0.06 | . | 0 | . | 0.15 (0.05 / -0.11) | . | 0.01 (0.03 / 0.42) | 1089.00 (-556.90 / -4285.00) |
| tierXp | . | . | . | . | 0 | 0.26 | 0.30 | . | . | . |
| storeSupplyShare | 0.15 | 0.15 | -0.29 | . | 0.05 | 0.15 | 0.17 | 0.15 | -0.19 | 6733.00 |
| tierPull | 0.04 | 0.05 | 0.02 | 4.09 (7.59 / 0) | -0.01 | 0.04 | -0.31 (-0.28 / 0) | 0.03 | 0.08 | -5060.00 (-6017.00 / 0) |
| healPower | . | . | . | 0 (-1.24 / -7.01) | 0.01 | . | -0.01 (0.09 / 0.30) | . | -0.15 | 5484.00 (2921.00 / 5087.00) |
| weaknessDamage | 0.04 | 0.04 | -0.05 | . | 0.01 | 0.04 | 0.29 (0.10 / 0.09) | 0.03 | -0.04 | 1990.00 |
| armorValue | 0.03 | 0.02 | -0.17 | -16.62 (-10.81 / -1.14) | 0.03 | 0.02 | 0.14 | 0.03 | -0.16 | 2002.00 (6332.00 / 2676.00) |
| partyXp | . | . | . | . | 0 | 0.18 | 0.18 | . | . | . |
| spellRollLow | 0.09 | 0.09 | -0.07 | . | 0.02 | 0.09 | -0.01 (0.13 / 0.23) | 0.09 | -0.07 | 2753.00 (3979.00 / 6716.00) |
| shieldPower | . | . | -0.17 | . | 0.02 | . | . | . | -0.04 | 684.70 |
| regroup | -0.08 | -0.08 | -0.09 | . | 0.01 | -0.08 | -0.07 | -0.08 | -0.09 | . |
| drinkPrice | . | . | . | . | . | . | . | . | 0.15 | -645.30 (-425.90 / -851.80) |
| gearSaleRate | . | . | . | . | . | . | . | 0.14 | . | 3257.00 (2409.00 / 4801.00) |
| foodPrice | . | . | . | . | . | . | . | . | 0.14 | -7371.00 (-5335.00 / -10670.00) |
| partyGroundBlow | . | . | 0.09 | . | -0.01 | . | . | . | 0.01 | -66.39 (-36.56 / -80.37) |
| regen | . | . | 0.02 | . | 0.02 | . | 0.03 | . | -0.08 | 1551.00 (3592.00 / 2111.00) |
| weaponAccuracy | . | . | . | . | 0 | . | -0.09 (0.04 / 0.10) | . | 0.01 | 1060.00 (137.80 / 699.70) |
| deathLoss | . | . | . | . | . | . | -0.05 | . | . | . |
| levelCurve | . | . | . | . | 0 | . | -0.05 | . | 0.01 | -122.10 (-105.70 / -35.45) |
| partyGroundHp | 0.04 | -0.05 | 0.05 | . | -0.01 | 0.04 | 0.04 | 0.01 | 0.04 | -152.90 |
| toHitBase | . | . | 0 | . | . | . | . | . | . | . |
| critMult | 0.01 | 0.01 | -0.02 | . | . | 0.01 | . | . | . | 20.43 (-182.50 / 363.80) |
| monsterDefense | . | . | . | . | . | . | . | . | . | . |
| monsterDefenseCut | . | . | . | . | . | . | . | . | . | . |
| necroticCut | . | . | . | . | . | . | . | . | . | . |
| stormDrain | . | . | . | . | . | . | . | . | . | . |
| spellLeech | . | . | . | . | . | . | . | . | . | . |
| blessingCut | . | . | . | . | . | . | . | . | . | . |
<!-- /GEN -->

### 4.2 Lone heroes (the eight ways, MID, Normal)

<!-- GEN: matrix group=party:1 outcomes=killsPerH,levelXpPerH,takenPerH,lowHpP10,incomePerH,storePerH,netPerH -->
| Lever | killsPerH | levelXpPerH | takenPerH | lowHpP10 | incomePerH | storePerH | netPerH |
|---|---|---|---|---|---|---|---|
| xpByLevel | . | 1.41 | . | 0 | . | . | 15.08 (7.55 / 25.42) |
| heroHp | . | . | 1.17 | -0.01 | . | 0.02 | -272.00 (102.10 / -205.40) |
| monsterDamage | . | . | 1.05 | -0.17 | . | 0.12 (0.06 / 0.98) | -597.20 (-204.30 / -2157.00) |
| xpPerKill | . | 1.01 | . | 0 | . | -0.01 | 13.18 (3.42 / 18.97) |
| soloXp | . | 1.00 | . | 0 | . | -0.01 | 13.18 (3.42 / 17.17) |
| spellCost | . | . | . | . | . | 0.68 (0.31 / 0.90) | -792.30 (-380.20 / -1402.00) |
| mitigationCap | . | . | -0.81 (-0.71 / -0.29) | 0.15 | . | -0.08 (-0.41 / -0.03) | 447.70 (643.00 / 249.60) |
| respawn | -0.05 (0 / -0.58) | -0.05 (0 / -0.58) | -0.05 (0 / -0.59) | . | -0.05 (0 / -0.59) | -0.10 (0 / -0.77) | -263.80 (-50.21 / -5077.00) |
| runePrice | . | . | . | . | . | 0.33 (0.22 / 0.73) | -2384.00 (-1549.00 / -3386.00) |
| spellCooldown | -0.13 | -0.13 | 0.08 | -0.03 | -0.14 | -0.70 (-0.44 / -0.65) | -1177.00 |
| monsterHp | -0.48 | 0.53 | 0.42 | -0.11 | 0.22 | 0.24 | 1955.00 |
| playerAttack | 0.50 | 0.50 | -0.50 | 0.12 | 0.49 | -0.28 | 9083.00 |
| armorMitigation | . | . | -0.42 (-0.57 / -0.10) | 0.05 | . | -0.03 | 151.00 (221.30 / 23.23) |
| heroMana | . | . | . | . | . | -0.36 | 508.30 |
| attackInterval | -0.27 | -0.27 | -0.38 | 0.03 | -0.22 | 0.18 (0.03 / 0.18) | -2667.00 (-4106.00 / -2667.00) |
| manaRegen | . | . | . | . | . | -0.35 | 471.00 |
| drinkPrice | . | . | . | . | . | 0.22 | -317.70 (-217.40 / -434.70) |
| spellPower | 0.23 | 0.24 | -0.15 | 0.05 | 0.26 | -0.07 | 4381.00 |
| regroup | -0.09 | -0.09 | -0.10 | 0 | -0.09 | -0.12 | -924.30 (-470.70 / -1707.00) |
| heroAccuracy | 0.21 | 0.21 | -0.15 | 0.05 | 0.23 | -0.09 | 3320.00 (3426.00 / 1798.00) |
| armorValue | 0.01 | 0.01 | -0.13 | 0.02 | 0.03 | -0.03 | 632.60 |
| storeSupplyShare | 0.12 | 0.12 | -0.17 | 0.03 | 0.12 | -0.08 | 2367.00 |
| gearSaleRate | . | . | . | . | 0.12 | . | 2335.00 (1728.00 / 3441.00) |
| armorCurve | . | . | 0.09 | -0.01 | . | 0.02 | . |
| weaponDamage | 0.11 | 0.11 | -0.10 | 0.03 | 0.11 | -0.05 | 2628.00 |
| spellRollLow | 0.07 | 0.07 | -0.06 | 0.02 | 0.07 | 0 | 1354.00 (1031.00 / 2007.00) |
| shieldPower | . | . | -0.09 | 0 | . | -0.03 | 73.97 (130.50 / 151.50) |
| toHitBase | . | . | -0.01 | -0.01 | . | . | -216.70 (43.54 / -144.40) |
| weaknessDamage | 0.04 | 0.04 | -0.04 | 0.01 | 0.03 | -0.04 | 616.90 |
| critMult | 0.01 | 0.01 | -0.02 | 0 | . | -0.03 | 310.20 (95.59 / 199.70) |
| foodPrice | . | . | . | . | . | 0.01 | -20.79 (-15.02 / -30.07) |
| weaponAccuracy | . | . | . | 0 | . | 0.02 | . |
| levelCurve | . | . | . | 0 | . | 0.01 | -12.76 (-14.21 / -3.42) |
| regen | . | . | 0.01 | 0.02 | . | -0.01 | 27.43 (13.36 / 38.71) |
| monsterDefense | . | . | . | 0 | . | . | -192.50 (0 / -136.00) |
| monsterDefenseCut | . | . | . | 0 | . | . | -192.50 (0 / -136.00) |
| partyGroundHp | . | . | . | . | . | . | . |
| partyGroundBlow | . | . | . | . | . | . | . |
| tierDanger | . | . | . | . | . | . | . |
| tierHp | . | . | . | . | . | . | . |
| tierXp | . | . | . | . | . | . | . |
| tierPull | . | . | . | . | . | . | . |
| partyXp | . | . | . | . | . | . | . |
| deathLoss | . | . | . | . | . | . | . |
| necroticCut | . | . | . | . | . | . | . |
| stormDrain | . | . | . | . | . | . | . |
| healPower | . | . | . | . | . | . | . |
| spellLeech | . | . | . | . | . | . | . |
| blessingCut | . | . | . | . | . | . | . |
<!-- /GEN -->

### 4.3 The four (MID, Normal)

<!-- GEN: matrix group=party:4 outcomes=killsPerH,levelXpPerH,takenPerH,lowHpP10,incomePerH,storePerH,netPerH -->
| Lever | killsPerH | levelXpPerH | takenPerH | lowHpP10 | incomePerH | storePerH | netPerH |
|---|---|---|---|---|---|---|---|
| xpByLevel | . | 1.47 | -0.02 | 0 | . | . | . |
| heroHp | . | . | 1.15 | 0.01 | . | 0.02 | . |
| partyXp | . | 1.01 | -0.01 | . | . | . | . |
| xpPerKill | . | 1.00 | -0.01 | . | . | . | . |
| respawn | -0.64 (-0.20 / -0.85) | -0.64 (-0.20 / -0.86) | -0.74 (-0.21 / -0.85) | . | -0.66 (-0.21 / -0.86) | -0.66 (-0.22 / -0.93) | -3321.00 (-1042.00 / -2979.00) |
| playerAttack | 0.20 | 0.20 | -0.82 | 0.08 | 0.20 | -0.68 | 3911.00 |
| monsterHp | -0.20 | 0.79 | 0.39 | -0.04 | 0.50 | 0.64 | 1962.00 (1331.00 / 1626.00) |
| monsterDamage | . | . | 0.55 (0.54 / 0.83) | -0.06 | . | 0.08 | -138.40 (-125.40 / -311.00) |
| mitigationCap | . | . | -0.64 (-0.66 / -0.22) | 0.06 | . | -0.09 | 40.36 (200.40 / -0.55) |
| storeSupplyShare | 0.06 | 0.06 | -0.55 | 0.06 | 0.04 | -0.21 | 1115.00 |
| runePrice | . | . | . | . | . | 0.48 | -1511.00 (-1119.00 / -2365.00) |
| armorMitigation | . | . | -0.36 (-0.54 / -0.11) | 0.04 | . | -0.02 | 156.20 (130.90 / -60.87) |
| spellPower | 0.09 | 0.09 | -0.14 | 0.01 | 0.09 | -0.38 | 2077.00 |
| shieldPower | . | . | -0.42 (-0.27 / -0.53) | 0.03 | . | -0.02 | . |
| spellCost | . | . | . | . | . | 0.24 (0.15 / 0.45) | -503.10 (-292.30 / -1046.00) |
| attackInterval | -0.10 | -0.11 | -0.43 (-0.23 / -0.43) | 0 | -0.04 | 0.07 | -256.50 (-821.80 / -256.50) |
| partyGroundBlow | . | . | 0.29 | -0.03 | . | 0.02 | -126.90 (-45.08 / -154.40) |
| partyGroundHp | -0.18 | 0.32 | 0.29 | -0.04 | 0.16 | 0.27 | 775.70 (537.80 / 129.80) |
| spellCooldown | -0.06 | -0.06 | 0.34 (0.17 / 0.32) | -0.04 | -0.06 | -0.19 | . |
| heroAccuracy | 0.15 | 0.15 | -0.24 | 0.03 | 0.08 | -0.17 | 1127.00 (1781.00 / 691.60) |
| weaponDamage | 0.03 | 0.03 | -0.12 | 0.01 | 0.03 | -0.17 | 1142.00 |
| gearSaleRate | . | . | . | . | 0.17 | . | 1609.00 (1189.00 / 2376.00) |
| armorValue | 0.01 | 0.01 | -0.13 | 0.01 | -0.02 | -0.05 | 227.30 (313.40 / 441.00) |
| armorCurve | . | . | 0.07 | -0.01 | . | 0.01 | 122.80 (36.24 / -73.58) |
| drinkPrice | . | . | . | . | . | 0.13 | -239.70 (-166.60 / -333.30) |
| heroMana | . | . | . | . | . | -0.12 | 257.30 |
| spellRollLow | 0.02 | 0.02 | . | 0.01 | 0.02 | -0.12 | 586.20 |
| manaRegen | . | . | . | . | . | -0.11 | 251.80 |
| regroup | -0.02 | -0.02 | -0.04 | . | -0.02 | -0.02 | -103.90 (-15.23 / -563.80) |
| weaknessDamage | 0.03 | 0.03 | -0.12 | . | 0.04 | -0.05 | 709.80 (470.60 / 273.00) |
| regen | . | . | 0.05 | 0 | . | . | . |
| weaponAccuracy | . | . | -0.03 | . | . | . | 139.60 (64.37 / 40.89) |
| healPower | . | . | -0.02 | 0.01 | . | . | -2.64 (52.28 / -25.91) |
| critMult | 0.01 | 0.01 | . | . | . | -0.02 | . |
| toHitBase | . | . | . | . | . | . | 412.90 (72.87 / -65.49) |
| monsterDefense | . | . | . | . | . | . | . |
| monsterDefenseCut | . | . | . | . | . | . | . |
| tierDanger | . | . | . | . | . | . | . |
| tierHp | . | . | . | . | . | . | . |
| tierXp | . | . | . | . | . | . | . |
| tierPull | . | . | . | . | . | . | . |
| soloXp | . | . | . | . | . | . | . |
| levelCurve | . | . | . | 0 | . | . | . |
| deathLoss | . | . | . | . | . | . | . |
| necroticCut | . | . | . | . | . | . | . |
| stormDrain | . | . | . | . | . | . | . |
| spellLeech | . | . | . | . | . | . | . |
| foodPrice | . | . | . | . | . | . | . |
| blessingCut | . | . | . | . | . | . | . |
<!-- /GEN -->

### 4.4 The four on Deadly

<!-- GEN: matrix group=four:deadly outcomes=killsPerH,levelXpPerH,takenPerH,lowHpP10,incomePerH,storePerH,netPerH -->
| Lever | killsPerH | levelXpPerH | takenPerH | lowHpP10 | incomePerH | storePerH | netPerH |
|---|---|---|---|---|---|---|---|
| tierDanger | 0 | . | 2.25 (0.96 / 2.09) | -0.30 (-0.12 / -0.72) | . | 0.17 (0.07 / 1.00) | -1557.00 (-481.10 / -21310.00) |
| xpByLevel | . | 1.56 | 0.03 | . | . | . | . |
| playerAttack | 0.45 (0.71 / 0.38) | 0.45 (0.71 / 0.38) | -1.32 | 0.14 | 0.43 (0.71 / 0.38) | -0.57 (-0.32 / -0.69) | 11880.00 |
| heroHp | . | . | 1.30 | -0.05 | . | 0.06 | -712.90 (-494.60 / -211.10) |
| mitigationCap | . | . | -1.29 (-1.02 / -0.26) | 0.21 (0.26 / 0.03) | . | -0.09 | 734.50 (691.50 / 29.89) |
| monsterDamage | . | . | 1.29 | -0.21 | . | 0.10 | -704.40 (-671.70 / -1034.00) |
| storeSupplyShare | 0.18 | 0.18 | -0.90 (-0.61 / -1.26) | 0.09 | 0.19 | -0.36 (-0.18 / -0.45) | 5643.00 |
| tierXp | . | 1.00 | 0.03 | . | . | . | . |
| xpPerKill | . | 1.00 | 0.02 | . | . | . | . |
| partyXp | . | 0.99 | 0.01 | . | . | . | . |
| monsterHp | -0.44 (-0.36 / -0.66) | 0.56 (0.64 / 0.34) | 0.91 | -0.08 | 0.21 | 0.48 (0.59 / 0.19) | . |
| armorMitigation | . | . | -0.49 (-0.85 / -0.04) | 0.06 | . | -0.03 | 49.37 (583.40 / 30.80) |
| spellPower | 0.28 | 0.28 | -0.71 | 0.06 | 0.30 | -0.43 (-0.13 / -0.53) | 8555.00 |
| spellCooldown | -0.21 | -0.21 | 0.72 (0.38 / 0.55) | -0.12 | -0.21 | -0.30 (-0.17 / -0.49) | -1091.00 |
| tierPull | 0.27 (0.34 / 0) | 0.20 (0.30 / 0) | 0.17 (0.70 / 0) | 0.02 | 0.21 (0.33 / 0) | 0.30 (0.28 / 0) | 1298.00 (2802.00 / 0) |
| runePrice | . | . | . | . | . | 0.63 | -4892.00 (-3406.00 / -6936.00) |
| respawn | -0.28 (-0.02 / -0.56) | -0.28 (-0.02 / -0.56) | -0.40 (-0.01 / -0.61) | 0.03 | -0.27 (-0.02 / -0.56) | -0.29 (-0.02 / -0.64) | -3336.00 (-269.10 / -4811.00) |
| shieldPower | . | . | -0.43 (-0.29 / -0.63) | 0.05 | . | -0.03 | 241.00 (151.30 / 254.30) |
| tierHp | -0.33 | -0.33 | 0.63 | -0.07 | -0.33 | 0.28 | -9710.00 |
| attackInterval | -0.20 | -0.20 | -0.55 | 0.04 | -0.22 | 0.16 (-0.02 / 0.16) | -4827.00 |
| partyGroundBlow | . | . | 0.45 | -0.06 | . | 0.04 | -265.80 (-201.10 / -496.40) |
| weaponDamage | 0.14 | 0.14 | -0.41 | 0.06 | 0.13 | -0.17 | 3774.00 |
| spellCost | . | . | . | . | . | 0.23 (0.16 / 0.39) | -1328.00 (-830.00 / -2893.00) |
| armorValue | 0.04 | 0.04 | -0.24 | 0.03 | 0.03 | -0.04 | 990.10 |
| spellRollLow | 0.09 | 0.09 | -0.24 | 0.02 | 0.10 | -0.15 | 2717.00 |
| armorCurve | . | . | 0.06 (0.01 / 0.29) | 0 | . | 0 | . |
| partyGroundHp | -0.28 | 0.05 | 0.17 | -0.03 | -0.06 | 0.06 | -1587.00 |
| gearSaleRate | . | . | . | . | 0.18 | . | 3740.00 (2766.00 / 5521.00) |
| heroAccuracy | 0.12 | 0.12 | -0.22 | 0.01 | 0.11 | -0.07 | 2372.00 (2755.00 / 1230.00) |
| regroup | -0.07 | -0.07 | -0.12 | 0.01 | -0.07 | -0.07 | -668.40 (-222.90 / -1474.00) |
| heroMana | . | . | . | . | . | -0.13 | 735.80 |
| manaRegen | . | . | . | . | . | -0.12 | 685.90 |
| drinkPrice | . | . | . | . | . | 0.13 | -671.40 (-437.30 / -874.60) |
| toHitBase | . | . | 0.09 | . | . | . | . |
| weaknessDamage | 0.06 | 0.06 | -0.07 | 0 | 0.08 | -0.03 | 1955.00 (1183.00 / 1106.00) |
| healPower | . | . | 0.05 | 0.01 | . | -0.02 | . |
| critMult | 0.02 | 0.02 | -0.03 | . | . | 0 | . |
| monsterDefense | 0 | 0 | 0.02 | . | . | . | . |
| monsterDefenseCut | 0 | 0 | 0.02 | . | . | . | . |
| regen | . | . | -0.01 | 0 | . | -0.01 | . |
| soloXp | . | . | . | . | . | . | . |
| levelCurve | . | . | . | . | . | . | . |
| deathLoss | . | . | . | . | . | . | . |
| necroticCut | . | . | . | . | . | . | . |
| stormDrain | . | . | . | . | . | . | . |
| spellLeech | . | . | . | . | . | . | . |
| foodPrice | . | . | . | . | . | . | . |
| weaponAccuracy | . | . | . | . | . | . | . |
| blessingCut | . | . | . | . | . | . | . |
<!-- /GEN -->

---

## 5. Ranked by influence

The strongest levers on each outcome, over every cell. The number is the largest of a lever's low, local and high elasticities.

<!-- GEN: list name=rank -->
| Outcome | Strongest levers (largest elasticity of low, local, high) |
|---|---|
| dps | monsterHp +0.62, playerAttack +0.58, respawn -0.49, spellPower +0.29, attackInterval -0.26, spellCooldown -0.20, heroAccuracy +0.19 |
| killsPerH | monsterHp -0.60, playerAttack +0.60, respawn -0.49, spellPower +0.30, attackInterval -0.25, spellCooldown -0.20, heroAccuracy +0.20 |
| ttkS | playerAttack -1.88, monsterHp +1.76, spellPower -1.09, attackInterval +0.64, storeSupplyShare -0.61, weaponDamage -0.48, heroAccuracy -0.47 |
| takenPerH | heroHp +1.23, monsterDamage +1.10, mitigationCap -0.89, playerAttack -0.68, armorMitigation -0.59, tierDanger +0.53, monsterHp +0.52 |
| healInPerH | monsterDamage +6.64, mitigationCap -6.14, armorMitigation -5.28, playerAttack -4.98, monsterHp +4.93, heroAccuracy -3.67, heroHp -3.17 |
| deathsPer1000h (deaths in 1,000 h a unit of ln) | tierDanger +64, monsterDamage +39, mitigationCap -29, heroHp +21, attackInterval -21, armorValue -17, armorMitigation -14 |
| lowHpP10 (absolute a unit of ln) | monsterDamage -0.29, mitigationCap +0.20, playerAttack +0.18, tierDanger -0.17, monsterHp -0.15, armorMitigation +0.14, spellPower +0.09 |
| huntedShare (absolute a unit of ln) | tierDanger -0.35, monsterDamage -0.29, mitigationCap +0.28, attackInterval +0.20, heroHp -0.15, monsterHp -0.13, armorMitigation +0.12 |
| levelXpPerH | xpByLevel +1.63, xpPerKill +1.00, soloXp +0.87, monsterHp +0.62, playerAttack +0.61, respawn -0.49, tierXp +0.34 |
| netLevelXpPerH | xpByLevel +1.69, tierDanger -1.66, monsterDamage -1.42, mitigationCap +1.38, xpPerKill +1.03, playerAttack +0.91, soloXp +0.90 |
| hoursPerLevel | monsterHp +2.11, playerAttack -1.83, xpByLevel -1.70, armorValue -1.40, xpPerKill -1.08, levelCurve +0.90, soloXp -0.89 |
| mainSkillXpPerH | monsterHp +0.55, respawn -0.49, spellCost +0.42, spellCooldown -0.27, playerAttack +0.20, attackInterval -0.18, regroup -0.16 |
| incomePerH | playerAttack +0.62, respawn -0.50, spellPower +0.31, attackInterval -0.24, monsterHp +0.23, heroAccuracy +0.21, spellCooldown -0.21 |
| storePerH | monsterDamage +2.74, spellCost +1.52, armorMitigation -1.34, mitigationCap -1.21, heroMana -0.90, monsterHp +0.88, manaRegen -0.82 |
| netPerH (absolute a unit of ln) | mitigationCap +35990, tierDanger -35400, monsterDamage -30690, playerAttack +24700, spellPower +16830, spellCooldown -15070, tierHp -13810 |
| suppliesPerH | monsterDamage +2.40, spellCost +1.88, heroMana -1.22, armorMitigation -1.16, manaRegen -1.10, mitigationCap -0.96, monsterHp +0.71 |
| castsPerH | respawn -0.49, spellCooldown -0.48, playerAttack -0.33, monsterHp +0.31, spellPower -0.20, regroup -0.16, storeSupplyShare -0.15 |
| manaPotionsPerH | spellCost +10.24, heroMana -8.15, manaRegen -7.15, spellCooldown -6.08, playerAttack -2.81, monsterHp +1.42, spellPower -1.37 |
<!-- /GEN -->

How to read the ranking.

- **Kills and XP: nothing a hero owns has an elasticity near 1.** The strongest are hero damage and monster health, at 0.5 to 0.6, and on kills those two are one lever (`05-interactions.md`, section 5). Every lever with an elasticity of 1 or more on XP is a reward multiplier: XP by Level, XP a kill, lone XP, party XP, tier XP.
- **Damage taken: the top two are the same thing.** Hero health (+1.23) and monster damage (+1.10) lead, because a blow is written as a share of hero health. Then the mitigation cap, then hero damage.
- **Deaths: one seat.** The tier blow dial, monster damage, the mitigation cap and hero health lead, and every one of those readings is the lone hammer on a harder tier.
- **Gold: the store bill is ruled by danger and by spell cost.** Monster damage reaches 2.7 at its high step and spell cost 1.5. Gold in simply follows kills.
- **Do not read the healing row.** Healing received ranks its levers at 3 to 7 because the base is a handful of meals a seed (section 2).

---

## 6. The six lists Tyler asked for

Each list is drawn by a fixed rule, written in `analyze.mjs` (`FINDING_RULES`), so a re-run names the same things.

### 6.1 Levers with large effects on outcomes they are not for

Rule: an elasticity of 0.5 or more on an outcome outside the lever's purpose. Damage, kills, XP and gold in count as one outcome for a lever that is for any of them.

<!-- GEN: list name=sideEffect -->
| Lever | Outcome it is not for | Elasticity low / local / high |
|---|---|---|
| monsterDamage | storePerH | +0.25 / +0.62 / +2.74 |
| monsterDamage | suppliesPerH | +0.22 / +0.48 / +2.40 |
| spellCost | suppliesPerH | +0.09 / +0.21 / +1.88 |
| spellCost | storePerH | +0.20 / +0.42 / +1.52 |
| armorMitigation | storePerH | -1.34 / -0.36 / -0.06 |
| heroMana | suppliesPerH | -1.22 / -0.11 / -0.08 |
| mitigationCap | storePerH | -1.21 / -0.45 / -0.11 |
| heroHp | takenPerH | +1.15 / +1.23 / +1.19 |
| armorMitigation | suppliesPerH | -1.16 / -0.30 / -0.04 |
| manaRegen | suppliesPerH | -1.10 / -0.11 / -0.08 |
| mitigationCap | suppliesPerH | -0.96 / -0.38 / -0.09 |
| playerAttack | netLevelXpPerH | +0.80 / +0.86 / +0.91 |
| heroMana | storePerH | -0.90 / -0.23 / -0.18 |
| monsterHp | storePerH | +0.58 / +0.49 / +0.88 |
| manaRegen | storePerH | -0.82 / -0.22 / -0.18 |
| spellCooldown | netLevelXpPerH | -0.78 / -0.59 / -0.33 |
| playerAttack | storePerH | -0.77 / -0.67 / -0.63 |
| monsterHp | suppliesPerH | +0.51 / +0.43 / +0.71 |
| playerAttack | takenPerH | -0.52 / -0.60 / -0.68 |
| spellPower | netLevelXpPerH | +0.38 / +0.33 / +0.67 |
| playerAttack | suppliesPerH | -0.60 / -0.57 / -0.54 |
| respawn | storePerH | -0.03 / -0.17 / -0.60 |
| monsterDamage | netLevelXpPerH | -0.55 / -1.42 / -0.42 |
| tierDanger | netLevelXpPerH | -0.55 / -1.66 / -0.42 |
| respawn | suppliesPerH | -0.03 / -0.16 / -0.53 |
| monsterHp | takenPerH | +0.52 / +0.43 / +0.40 |
| respawn | takenPerH | -0.02 / -0.15 / -0.50 |
| tierHp | netLevelXpPerH | -0.49 / -0.54 / -0.21 |
| mitigationCap | netLevelXpPerH | +0.28 / +1.38 / +0.44 |
| heroHp | netLevelXpPerH | -0.40 / -0.61 / -0.28 |
| tierDanger | storePerH | +0.12 / +0.51 / +0.18 |
<!-- /GEN -->

- **The store bill is where side effects land.** More than half of the rows are the store bill or supplies used. Almost any change to danger, damage, mana or cooldowns shows up first as gold spent at the store, and it shows up on the three ways that pay it.
- **Hero health raises damage taken, with an elasticity of 1.2.** It is listed here because it was meant to protect. Section 6.2 and `05-interactions.md` section 10 take it further.
- **Hero damage has the largest good side effects.** It cuts damage taken (minus 0.6) and the store bill (minus 0.7) as it raises kills.
- **Monster health raises damage taken and the store bill** (0.4 to 0.9), as a longer fight would. It also raises XP, which is its largest effect and not a side effect anyone planned (section 7.2).
- **Every row on XP after deaths is the wall.** Monster damage, the tier dial, tier health, the mitigation cap, hero health and spell cooldown all reach it through the lone hammer dying or not.

### 6.2 Levers that do not move what they are for

Rule: the largest elasticity on an intended outcome is under 0.05, or nothing resolved.

<!-- GEN: list name=intendedMiss -->
| Lever | Meant to move | Elasticity low / local / high | Read |
|---|---|---|---|
| critMult | dps | 0 / +0.01 / +0.01 | resolved, and under 0.05 |
| weaknessDamage | dps | +0.04 / +0.04 / +0.03 | resolved, and under 0.05 |
| toHitBase | dps | 0 / 0 / 0 | nothing resolved |
| toHitBase | takenPerH | +0.04 / 0 / +0.03 | resolved, and under 0.05 |
| manaRegen | castsPerH | 0 / 0 / 0 | nothing resolved |
| monsterDefense | dps | 0 / 0 / 0 | nothing resolved |
| monsterDefenseCut | dps | 0 / 0 / 0 | nothing resolved |
| heroMana | castsPerH | 0 / 0 / 0 | nothing resolved |
| spellCost | castsPerH | 0 / 0 / 0 | nothing resolved |
| weaponAccuracy | dps | 0 / 0 / +0.01 | nothing resolved |
| weaponAccuracy | killsPerH | 0 / 0 / +0.01 | nothing resolved |
<!-- /GEN -->

And the levers that moved nothing at all.

<!-- GEN: list name=dead -->
| Lever | Why it moves nothing |
|---|---|
| necroticCut | dark by design: every Necrotic row sits behind NECROTIC_STORM.live = false (src/data/necrotic-storm.js) and no default bar casts one |
| stormDrain | dark by design: every Storm row sits behind NECROTIC_STORM.live = false (src/data/necrotic-storm.js) and no default bar casts one |
| spellLeech | dark by design: the only life leech the engine reads is leechPm on the Necrotic drain spells, which sit behind NECROTIC_STORM.live = false. The life leech and mana leech imbuement rows (src/data/imbuements.js) are data no engine code reads |
| blessingCut | not played, a harness limit: a cell is handed its Blessings' share by the harness (standards.mjs blessedShareAt through progression-grid.mjs buildCell), so the data row never reaches the fight |
<!-- /GEN -->

And the steps the engine or the game's own validators refused.

<!-- GEN: list name=refused -->
| Lever | Step | Why |
|---|---|---|
| attackInterval | x1.1, x1.25, x1.5, x2 | the engine refuses it: src/core/hunt/tower.js throws "stairMs is under two engine swings" (the Tower's and the Catacombs' stair clock is 4,000 ms, exactly two attack intervals). The slow side is read in the `clock` experiment, where both move |
<!-- /GEN -->

Of 51 levers, 4 moved nothing at all and the rule names 9 more that do not move what they are for. What each one is.

- **Crit size.** Doubling a critical blow's multiple adds 1% to damage (1.3% for the bows, nothing for the Mage). MEASURED. JUDGMENT on the cause: the kits carry little crit chance, so its size has nothing to multiply.
- **Weapon accuracy.** Doubling every weapon's accuracy row moves damage by under half a percent, on every way. The to-hit ratio adds it to a base and a skill term that dwarf it.
- **The to-hit base.** Nothing resolved. It sits on both sides of the ratio.
- **Weakness damage.** An elasticity of 0.04. Few fights in these cells match a weapon to a weakness.
- **Monster defense and its cut.** Nothing resolved on damage. Defense takes whole points off a blow, and the blows are large.
- **Mana pool, mana regeneration and spell cost against casts.** Casts do not move. A hero drinks and casts on (`05-interactions.md`, section 3). All three move the drink bill instead.
- **Health regeneration.** Its largest reading is 0.08 on the store bill.
- **Armor points and the armor ceilings, for a geared hero at home.** Not in this list, because across all cells they resolve. Section 7.3 shows that for a MID hero on Normal they do nothing.

### 6.3 Levers whose effect changes sharply with Level

Rule: for a rate, the high-step elasticity differs between two Levels by more than 0.3 and by more than a factor of two, or changes sign.

<!-- GEN: list name=byLevel -->
| Lever | Outcome | Step | Elasticity by Level | |
|---|---|---|---|---|
| playerAttack | netLevelXpPerH | x2 | Level 10: +0.31, Level 30: +0.68, Level 60: +1.21, Level 110: +0.98 |  |
| playerAttack | storePerH | x2 | Level 10: -0.40, Level 30: -0.87, Level 60: -0.54, Level 110: -0.63 |  |
| attackInterval | storePerH | x0.9 | Level 10: +0.31, Level 110: -0.41 | changes sign |
| spellRollLow | netLevelXpPerH | x2 | Level 10: +0.08, Level 30: +0.14, Level 60: +0.39 |  |
| manaRegen | storePerH | x2 | Level 10: -0.87, Level 30: -0.19, Level 60: -0.06, Level 110: -0.01 |  |
| monsterDamage | storePerH | x2 | Level 10: +0.10, Level 30: +4.27, Level 60: +1.41, Level 110: +0.44 |  |
| monsterHp | netLevelXpPerH | x2 | Level 10: +0.47, Level 30: +0.29, Level 60: +0.15 |  |
| monsterHp | storePerH | x2 | Level 10: +0.20, Level 30: +1.66, Level 60: +0.40, Level 110: +0.49 |  |
| heroMana | storePerH | x2 | Level 10: -0.87, Level 30: -0.19, Level 60: -0.06, Level 110: -0.01 |  |
| armorCurve | storePerH | x2.4 | Level 30: +1.02, Level 60: +0.03, Level 110: +0.08 |  |
| mitigationCap | takenPerH | x1.5 | Level 10: -0.05, Level 30: -0.30, Level 60: -0.36, Level 110: -0.45 |  |
| respawn | storePerH | x2 | Level 10: -1.12, Level 30: -0.66, Level 60: -0.43, Level 110: -0.49 |  |
| spellCost | storePerH | x2 | Level 10: +1.17, Level 30: +2.69, Level 60: +0.47, Level 110: +0.12 |  |
| spellCooldown | netLevelXpPerH | x2 | Level 10: -0.12, Level 30: -0.28, Level 60: -0.36, Level 110: -0.46 |  |
| spellCooldown | storePerH | x2 | Level 10: -0.89, Level 30: +0.34, Level 60: -0.28, Level 110: -0.12 | changes sign |
| spellPower | netLevelXpPerH | x2 | Level 10: +0.22, Level 30: +0.61, Level 60: +0.70, Level 110: +0.88 |  |
| spellPower | storePerH | x2 | Level 10: -0.17, Level 30: -0.57, Level 60: -0.34, Level 110: -0.40 |  |
| drinkPrice | storePerH | x2 | Level 10: +0.67, Level 30: +0.20, Level 60: +0.07, Level 110: +0.01 |  |
| runePrice | storePerH | x2 | Level 10: +0.38, Level 30: +0.66, Level 60: +0.75, Level 110: +0.76 |  |
<!-- /GEN -->

Read these with the caveat of section 9: each Level is also a different ground.

- **Hero power matters more as Levels rise.** Hero damage x2 is worth an elasticity of 0.31 on XP after deaths at Level 10 and about 1.0 to 1.2 at Levels 60 and 110. Spell damage climbs from 0.22 to 0.88. Early grounds are held by the walk between pulls. Later ones are held by the fight.
- **Mana levers are early-game levers.** Mana pool and regeneration move the store bill with an elasticity of minus 0.87 at Level 10 and minus 0.01 at Level 110. The drink price falls the same way, 0.67 to 0.01, while the rune price rises from 0.38 to 0.76. A caster's bill moves from drinks to runes as it levels, and the levers on it change with it.
- **Danger reaches the store hardest at Level 30.** Monster damage x2 has an elasticity of 4.3 on the store bill at Level 30 and 0.4 at Level 110. The armor curve at x2.4 reads 1.0 at Level 30 and under 0.1 above it. Mosslight Glade is where a lone hero first eats.
- **The mitigation cap bites harder with Level** (minus 0.05 at Level 10, minus 0.45 at 110), because armor reaches the cap only once the gear tiers fill in.

### 6.4 Levers that pull opposite ways across combat styles

Rule: at one step the outcome rises for one lone way and falls for another, both resolved and both past 2% (300 gold an hour for net gold).

<!-- GEN: list name=byStyle -->
| Lever | Outcome | Step | Rises for | Falls for |
|---|---|---|---|---|
| playerAttack | storePerH | x1.5 | hammer +25.2% | tank -5.8%, axes -7.8%, bow -15.6%, crossbow -18.3%, mage -26.5%, healer -17.6% |
| weaknessDamage | storePerH | x2 | hammer +10.1% | bow -4.0%, crossbow -8.7% |
| attackInterval | storePerH | x0.5 | hammer +12.2%, bow +13.4%, healer +14.2% | tank -11.5%, sword -8.1%, axes -14.1%, mage -13.8% |
| spellRollLow | storePerH | x2 | hammer +8.6% | tank -2.2%, axes -3.2%, bow -3.9%, mage -9.0% |
| monsterHp | storePerH | x0.75 | hammer +25.9% | tank -4.6%, axes -6.3%, bow -10.7%, crossbow -13.6%, mage -18.1%, healer -6.5% |
| heroHp | storePerH | x0.5 | axes +11.1%, bow +2.3%, crossbow +25.7% | healer -15.9% |
| heroHp | netPerH | x0.5 | healer +771 | bow -612, crossbow -479 |
| spellCooldown | netPerH | x2 | mage +876, healer +704 | tank -1121, sword -1425, hammer -1471, axes -1461, bow -329, crossbow -1165 |
| spellPower | storePerH | x1.5 | hammer +17.3% | tank -2.8%, axes -5.1%, bow -6.1%, crossbow -7.3%, mage -14.7% |
<!-- /GEN -->

- **Most hammer rows are a small number doubling.** The lone hammer buys nothing on Normal from Level 30 and almost nothing at Level 10, so a few more purchases read as a large rise. Treat the hammer's store rows as "it starts to eat", not as a split in direction.
- **Spell cooldown is a real split.** Doubling every cooldown gains the Mage 876 gold an hour and the Healer 704, because they cast and buy less, and costs every weapon way 329 to 1,471, because they kill slower. The same lever is a gold buff for casters and an XP cut for everyone.
- **Hero health splits the Healer from the archers** on gold, by 480 to 770 an hour each way.
- **The larger style fact is in size, not in sign,** so the rule above does not list it. MEASURED, Level XP an hour, alone, at x2:

| Lever at x2 | Tank | Sword | Hammer | Axes | Bow | Crossbow | Mage | Healer |
|---|---|---|---|---|---|---|---|---|
| Hero damage | +39% | +31% | +29% | +38% | +22% | +23% | +10% | +35% |
| Spell damage share | +25% | +24% | +24% | +25% | +16% | +17% | +9% | +14% |
| Weapon damage rows | +5% | +5% | +15% | +12% | +8% | +9% | +4% | +11% |
| Store supply power | +16% | +8% | 0% | +7% | +12% | +12% | +9% | +14% |
| Crit size | +0.5% | +0.6% | 0% | 0% | +1.3% | +1.4% | 0% | 0% |

The Mage gains least from every damage lever, because it already kills at 80% to 85% of the spawn ceiling. Halve its damage and it loses 29%. Double it and it gains 10%. No global damage lever can be read as "the same for every style": it is worth four times as much to a tank as to a Mage.

### 6.5 Redundant levers

Rule: two levers whose effect vectors (every cell, every core rate outcome, at the lowest and the highest step) have a cosine of 0.9 or more.

<!-- GEN: list name=redundant -->
| Lever | Lever | Cosine of the effect vectors | Size of each |
|---|---|---|---|
| monsterDefense | monsterDefenseCut | 1 | 0.111 / 0.111 |
| xpPerKill | xpByLevel | 0.95 | 0.484 / 0.763 |
| xpPerKill | soloXp | 0.915 | 0.484 / 0.443 |
<!-- /GEN -->

The cosine rule finds only full twins. Three exist.

- **Monster defense and the defense cut** have identical effect vectors, to the last digit. They are one product written as two numbers.
- **XP a kill, XP by Level and lone XP** all scale XP and nothing else.

The more dangerous kind is the partial twin: two levers that agree on one outcome and part on another. The rule misses these, and the experiments find them.

| Pair | Same on | Different on | Evidence |
|---|---|---|---|
| Hero health, monster damage | Damage taken (1.23 and 1.10) | Share of health lost, deaths | `05` section 10 |
| Hero damage, monster health | Kills (0.51 and minus 0.50) | XP (0.52 and plus 0.50, the same sign) | `05` section 5 |
| Mana pool, mana regeneration | The store bill, equal at every Level to two digits | Nothing found | section 6.3 |
| The armor curve, the tier blow dial | Damage taken by a lone melee hero on a harder tier | Every other seat | `05` section 7 |
| The tier blow dial, monster damage | Everything on a harder tier | Normal, where the tier dial does nothing | section 4 |

### 6.6 Levers that cannot be tuned independently

This is the subject of `05-interactions.md`, section 12, which measures it with joint experiments. In short: every lever on the fight is coupled to at least four others, and every reward lever is clean.

---

## 7. The structural findings

Five findings about the shape of the build. Each is drawn from the matrix and the base, and each matters more to a new design than any single number above.

### 7.1 Kills are capped three ways, and the caps differ by seat

The elasticity of kills an hour, by seat. MEASURED, sections 4.2 to 4.4 and `fx:hp-spawn`.

| Lever | Lone heroes | The four, Normal | The four, Deadly |
|---|---|---|---|
| Hero damage | 0.50 | 0.20 | 0.45 |
| Monster health | minus 0.48 | minus 0.20 | minus 0.44 |
| Spell damage share | 0.23 | 0.09 | 0.28 |
| The attack interval | minus 0.27 | minus 0.10 | minus 0.20 |
| The wait between pulls | minus 0.09 | minus 0.02 | minus 0.07 |
| Respawn x0.5, kills become | x1.00 | x1.15 | x1.01 |
| Respawn x2, kills become | x0.67 | x0.55 | x0.68 |

<!-- GEN: lever id=respawn groups=party:1,party:4,four:deadly outcomes=killsPerH,levelXpPerH -->
respawn, lone heroes (MID, Normal)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| killsPerH | +0.2%~ | +0.2%~ | +0.2%~ | -0.8% | -3.9% | -13.9% | -33.1% |
| levelXpPerH | +0.2%~ | +0.2%~ | +0.2%~ | -0.8% | -3.9% | -14.0% | -33.1% |

respawn, the four (MID, Normal)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| killsPerH | +15.1% | +14.1% | +6.8% | -6.1% | -15.7% | -28.3% | -44.6% |
| levelXpPerH | +15.1% | +14.1% | +6.8% | -6.1% | -15.7% | -28.3% | -44.7% |

respawn, the four on deadly

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| killsPerH | +1.3% | +1.3% | +1.3% | -4.2% | -10.8% | -19.2% | -32.3% |
| levelXpPerH | +1.3% | +1.3% | +1.3% | -4.2% | -10.8% | -19.2% | -32.3% |
<!-- /GEN -->

<!-- GEN: lever id=regroup groups=party:1,party:4 outcomes=killsPerH -->
regroup, lone heroes (MID, Normal)

| Outcome | x0.2 | x0.5 | x2 | x4 |
|---|---|---|---|---|
| killsPerH | +7.2% | +4.3% | -8.5% | -22.4% |

regroup, the four (MID, Normal)

| Outcome | x0.2 | x0.5 | x2 | x4 |
|---|---|---|---|---|
| killsPerH | +1.6% | +0.9% | -2.3% | -15.8% |
<!-- /GEN -->

- A hunt is a cycle of killing, walking and regrouping, and waiting for the pack. A lever on the fight can only shorten the killing. COMPUTED: if kills an hour go as one over (kill time plus dead time), the elasticity of kills to hero damage is the share of the cycle spent killing. So a lone hero spends about half its hunt killing, and the four on Normal a fifth.
- That is why power does not buy pace. Doubling hero damage gives a lone hero 28% more kills and the four on Normal 10%.
- The three caps bind different seats. Respawn holds the four on Normal and is slack for everyone else: halving it gives a lone hero nothing. Dead time holds the lone hero. The fight holds the four on Deadly, where eight monsters a pull make the killing long again.
- The regroup wait is small but it is a floor nothing else can move: cutting it to a fifth gives a lone hero 7% more kills.
- What this means for a new formula. Any model where damage sets pace needs fights to fill the hunt. Here they fill a fifth to a half of it. The pace of this build is set by map numbers: pocket sizes, respawn clocks and walking distance.

### 7.2 Experience is paid for monster health, so "harder" means "faster"

MEASURED, `oat:monsterHp` and `fx:hp-spawn`.

<!-- GEN: lever id=monsterHp groups=party:1,party:4,four:deadly outcomes=killsPerH,levelXpPerH,takenPerH -->
monsterHp, lone heroes (MID, Normal)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| killsPerH | +28.1% | +13.8% | +5.3% | -4.4% | -10.9% | -19.9% | -33.3% |
| levelXpPerH | -36.6% | -14.9% | -5.6% | +4.9% | +11.7% | +20.2% | +33.2% |
| takenPerH | -29.4% | -12.1% | -4.7% | +3.7% | +8.5% | +16.6% | +28.2% |

monsterHp, the four (MID, Normal)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| killsPerH | +9.5% | +5.4% | +2.1% | -2.0% | -5.1% | -10.6% | -18.8% |
| levelXpPerH | -45.2% | -21.0% | -7.9% | +7.8% | +18.8% | +34.4% | +62.8% |
| takenPerH | -30.4% | -11.9% | -3.8% | +4.0% | +11.7% | +23.1% | +43.9% |

monsterHp, the four on deadly

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| killsPerH | +28.6% | +12.2% | +4.2% | -4.6% | -11.6% | -22.3% | -36.8% |
| levelXpPerH | -35.7% | -15.8% | -6.1% | +5.1% | +10.5% | +16.9% | +26.6% |
| takenPerH | -48.2% | -24.6% | -8.8% | +9.5% | +22.4% | +41.6% | +75.5% |
<!-- /GEN -->

- Over all cells monster health has an elasticity of minus 0.50 on kills and plus 0.50 on XP. XP a kill follows health in full, and kills fall by only half as much because of the caps above.
- For the four on Normal the XP elasticity is 0.79. Doubling monster health gives it 63% more XP.
- So monster health is the second strongest pace lever in the build after the reward multipliers, with the sign nobody expects. It cannot be used to make the game harder without also making it faster, and by a different amount for each seat.

### 7.3 Armor stops at the cap, so the cap is the armor

MEASURED, damage taken by the lone hammer, MID gear, Normal, Levels 30 to 110.

<!-- GEN: lever id=armorValue groups=hammer:normal outcomes=takenPerH -->
armorValue, the hammer alone on normal (MID, Levels 30 to 110)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| takenPerH | +1.8% | +0.0%~ | +0.1%~ | -0.0%~ | -0.0%~ | +0.1%~ | +0.1%~ |
<!-- /GEN -->

<!-- GEN: lever id=armorMitigation groups=hammer:normal outcomes=takenPerH -->
armorMitigation, the hammer alone on normal (MID, Levels 30 to 110)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| takenPerH | +54.2% | +20.2% | +1.2% | -0.0%~ | -0.0%~ | -0.0%~ | -0.0%~ |
<!-- /GEN -->

<!-- GEN: lever id=mitigationCap groups=hammer:normal outcomes=takenPerH -->
mitigationCap, the hammer alone on normal (MID, Levels 30 to 110)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 |
|---|---|---|---|---|---|---|
| takenPerH | +75.6% | +37.7% | +14.8% | -13.6% | -14.4% | -14.4% |
<!-- /GEN -->

<!-- GEN: lever id=armorCurve groups=hammer:normal outcomes=takenPerH -->
armorCurve, the hammer alone on normal (MID, Levels 30 to 110)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 | x2.4 |
|---|---|---|---|---|---|---|---|---|
| takenPerH | -0.0%~ | -0.0%~ | -0.0%~ | +0.2%~ | +0.1%~ | +0.7% | +6.5% | +12.6% |
<!-- /GEN -->

- A MID hero in heavy armor on its own ground is at the 60% cap. Doubling every armor point changes its damage taken by nothing the pass can resolve (0.1%). Taking a quarter off changes it by nothing. Raising the armor ceilings changes it by nothing.
- Raising the cap by a tenth cuts damage taken by 14%, and raising it further does no more. COMPUTED from those two readings: this hero's armor is worth about 66% and the cap takes the rest away.
- The armor curve only reaches this hero at x1.5 and above, where a same-Level attacker is finally enough to pull the armor back under the cap.
- The cap also explains the death wall's position. On the lone hammer on Dangerous, the cap at x1.1 takes deaths from 94 in 1,000 hours to none.
- For the Mage the cap never stops binding: at x1.5 it is still cutting damage taken (minus 22%), because light armor's ward is a flat amount.
- What this means. Armor gear above MID buys nothing at home. Its value appears only one tier up, where the attacker out-levels the hero. That is the same place the death wall stands, which is why gear, the tier dial, the curve and the cap all read as one lever there.

### 7.4 The death wall

MEASURED, `oat:monsterDamage`. The step x1 is the base.

<!-- GEN: lever id=monsterDamage groups=hammer:dangerous,mage:deadly,four:deadly outcomes=takenPerH,lowHpP10,deathsPer1000h,netLevelXpPerH -->
monsterDamage, the hammer alone on dangerous (MID, Levels 30 to 110)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| takenPerH | -48.2% | -25.2% | -11.0% | +8.9% | +34.6% | +54.2% | n/a |
| lowHpP10 | +0.176 | +0.111 | +0.058 | -0.050 | -0.161 | -0.234 | -0.310 |
| deathsPer1000h | 94.09->0 | 94.09->0 | 94.09->0 | 94.09->145.6~ | 94.09->1120 | 94.09->13330 | 94.09->92310 |
| netLevelXpPerH | +184.9% | +184.6% | +183.9% | -48.3%~ | -107.9% | -126.7% | -128.3% |

monsterDamage, the Mage alone on deadly (MID, Levels 30 to 110)

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| takenPerH | -56.7% | -35.8% | -16.6% | +16.2% | +57.7% | +138.1% | n/a |
| lowHpP10 | +0.333 | +0.155 | +0.049 | -0.045 | -0.157 | -0.288 | -0.371 |
| deathsPer1000h | 12.88->0~ | 12.88->0~ | 12.88->0~ | 12.88->152.3 | 12.88->1589 | 12.88->15580 | 12.88->50000 |
| netLevelXpPerH | +7.1%~ | +7.0%~ | +6.7%~ | -34.3% | -97.7% | -107.0% | -107.8% |

monsterDamage, the four on deadly

| Outcome | x0.5 | x0.75 | x0.9 | x1.1 | x1.25 | x1.5 | x2 |
|---|---|---|---|---|---|---|---|
| takenPerH | -58.0% | -32.4% | -12.8% | +13.0% | +32.3% | +65.9% | +128.5% |
| lowHpP10 | +0.096 | +0.060 | +0.022 | -0.019 | -0.051 | -0.113 | -0.232 |
| deathsPer1000h | 0->0~ | 0->0~ | 0->0~ | 0->0~ | 0->0~ | 0->0~ | 0->0~ |
| netLevelXpPerH | +0.0%~ | +0.0%~ | +0.0%~ | +0.0%~ | +0.0%~ | +0.0%~ | -0.0%~ |
<!-- /GEN -->

- Damage taken and the worst low points move smoothly, with an elasticity of 1.0 to 1.3. Deaths do not. The lone hammer on Dangerous goes from no deaths at x0.9, to 94 in 1,000 hours at x1, to 1,120 at x1.25, to dead inside the hour at x1.5.
- The Mage alone on Deadly stands a step behind it: 13 at x1, 152 at x1.1, 1,589 at x1.25.
- The four on Deadly takes 2.3 times the damage at x2 and does not die. Its wall is past x2 (`05-interactions.md`, section 10).
- **The wall can be seen before anyone dies.** COMPUTED from the base: every cell whose worst tenth of fights bottoms out above 0.40 of health had no death. Of the five cells between 0.30 and 0.40, three had none and two had one death, in 14 and 29 hours. The four cells under 0.20 died in every seed. The low point falls by 0.17 to 0.31 for each doubling of monster damage. So the distance to the wall is readable from the low point long before a death rate is, and it is a quiet number (section 2) where deaths are a noisy one.
- JUDGMENT on the cause: healing in this build is a fixed supply. One meal a use and one self heal on a cooldown give a ceiling on health back a second. Under it a hero is always full. Over it health only falls, and a long hunt always ends in a death. A death rate that rises gently needs healing that rises with danger, or danger that comes in bursts and not as a steady rate.

### 7.5 What dominates

Counting what the matrix says about the 51 levers.

| Kind | Levers | What they are |
|---|---|---|
| Clean multipliers, an elasticity of 0.8 to 1.5 on one outcome and nothing else | 9 | XP a kill, XP by Level, lone XP, party XP, tier XP, the Level curve, the death price, coin a kill, what gear sells for |
| Prices, move the store bill only | 3 | Food, drink and rune prices |
| Strong and tangled, elasticity over 0.4 on several outcomes | 6 | Hero damage, monster health, monster damage, hero health, the mitigation cap, the tier blow dial |
| Moderate, 0.1 to 0.4 | 13 | Spell damage, spell cooldown, the attack interval, hero accuracy, weapon damage, store supply power, armor ceilings, armor points, shield size, tier health, tier pull (downward only), respawn (upward only), the wait between pulls |
| Weak, under 0.1 over all cells | 8 | Crit size, weapon accuracy, weakness damage, the to-hit base, monster defense, the defense cut, health regeneration, the low end of a spell's roll |
| The supply bill only | 4 | Mana pool, mana regeneration, spell cost, heal size |
| Dead here | 4 | Spell leech, the Necrotic cut, the Storm drain (dark), the Blessings' cut (harness) |
| One-sided or seat-bound | 4 | The armor curve, monster accuracy, the two party ground dials |

Three things follow.

- **Pace is set by reward multipliers and by map numbers, not by combat.** The clean multipliers move XP one for one. The strongest combat lever moves it by half, and by a fifth for the four on Normal.
- **Survival is set by a handful of tangled levers that all act at one point,** the lone melee hero one tier up. For every other seat in this pass survival is not in play.
- **A quarter of the levers are weak or dead.** Crit, accuracy, weakness, defense and regeneration are all present in the code and the gear, and none of them moves an outcome by a tenth of what it moves in name.

---

## 8. Large steps: where the local slope lies

Rule: the low-step and high-step elasticities differ by 0.25 or more and by 30% of the larger, both resolved.

<!-- GEN: list name=nonlinear -->
| Lever | Outcome | Low step | Local | High step |
|---|---|---|---|---|
| manaRegen | storePerH | x0.5: -0.82 | -0.22 | x2: -0.18 |
| monsterDamage | storePerH | x0.5: +0.25 | +0.62 | x2: +2.74 |
| monsterHp | storePerH | x0.5: +0.58 | +0.49 | x2: +0.88 |
| tierDanger | takenPerH | x0.5: +0.14 | +0.53 | x2: +0.51 |
| tierHp | netLevelXpPerH | x0.5: -0.49 | -0.54 | x2: -0.21 |
| heroMana | storePerH | x0.5: -0.90 | -0.23 | x2: -0.18 |
| armorMitigation | takenPerH | x0.5: -0.59 | -0.41 | x2: -0.10 |
| armorMitigation | storePerH | x0.5: -1.34 | -0.36 | x2: -0.06 |
| mitigationCap | takenPerH | x0.5: -0.73 | -0.89 | x1.5: -0.33 |
| mitigationCap | storePerH | x0.5: -1.21 | -0.45 | x1.5: -0.11 |
| respawn | dps | x0.5: -0.02 | -0.13 | x2: -0.49 |
| respawn | killsPerH | x0.5: -0.02 | -0.13 | x2: -0.49 |
| respawn | takenPerH | x0.5: -0.02 | -0.15 | x2: -0.50 |
| respawn | levelXpPerH | x0.5: -0.02 | -0.13 | x2: -0.49 |
| respawn | netLevelXpPerH | x0.5: -0.02 | -0.13 | x2: -0.49 |
| respawn | incomePerH | x0.5: -0.02 | -0.13 | x2: -0.50 |
| respawn | storePerH | x0.5: -0.03 | -0.17 | x2: -0.60 |
| spellCost | storePerH | x0.5: +0.20 | +0.42 | x2: +1.52 |
| spellCooldown | netLevelXpPerH | x0.5: -0.78 | -0.59 | x2: -0.33 |
| spellPower | netLevelXpPerH | x0.5: +0.38 | +0.33 | x2: +0.67 |
| weaponDamage | netLevelXpPerH | x0.5: +0.19 | +0.38 | x2: +0.48 |
| runePrice | storePerH | x0.5: +0.33 | +0.44 | x2: +0.67 |
<!-- /GEN -->

Tyler's warning holds: "Do not assume local sensitivity measurements remain accurate for large changes." The list above is what the fixed rule catches. The shapes behind it.

- **Ceilings.** The mitigation cap is flat past x1.1 for heavy armor. The armor ceilings are flat above x1. Tier pull is exactly zero above x1, because a pull is cut off at a box of 8 monsters. Hero damage flattens for the Mage (minus 29% at x0.5, plus 10% at x2).
- **Floors.** The tier blow dial at x0.75 and x0.5 reads the same: a tier cannot hit softer than Normal. Respawn is slack below x1 for a lone hero and binding above it.
- **Walls.** Deaths (section 7.4). The store bill against monster damage: an elasticity of 0.25 at x0.5 and 2.7 at x2. The drink bill against mana: a doubling of cost is 6.6 times the drinks.
- **Refusals.** The attack interval cannot rise at all without the stair clock.
- **Straight lines.** The nine clean multipliers and the three prices have the same slope at x0.5 and x2, to two digits.

A local slope at x1 is a fair guide for the clean levers and for none of the combat ones. For those, a change of more than a quarter needs its own played point, on every seat.

---

## 9. What this pass does not cover

- **Level and ground move together.** Each Level plays one advised ground, so "changes with Level" also means "changes with ground". The four at Level 60 is on a ground built for a party and behaves unlike the four at 30 and 110. A pass that holds the Level and swaps the ground would split the two. UNKNOWN until it is run.
- **Live content only.** Levels 10 to 110. Nothing here speaks to Level 185, 400 or beyond, where the base lane's `beyond` block plays projected content.
- **43 of the registry's 111 playable levers.** `sensitivity.mjs --coverage` prints the rest by category. The largest holes are monster roles and behaviour (11 levers), drop tables (8), spell shape (area, unlocks, statuses, the default bar: 8) and equipment beyond the weapon and armor tables (8). Gear is covered as an axis (LOW, MID, BIS), not as a lever. 53 registry levers cannot be played by this simulator at all: town systems, SQL values, run grounds.
- **Player choices are fixed.** Every cell plays the default bar, the default stance, the advised ground and the reference eating rule. A lever that works by changing what a sensible player does (swap tier, swap ground, stop casting) shows only its direct effect.
- **Gold is an upper bound.** The harness sells every drop at once at vendor value, never runs out of gold, and books no crafted supply. A hunt the real game would end `gold_out` plays on here with a negative net. Read gold as direction.
- **Deaths are thin.** Section 2. The death readings rest on one seat and at most four deaths a cell, because a death ends a seed's hunt.
- **One standard four.** Hammer, bow, Mage, Healer. A four with no Healer, or a pair, was not played.
- **Blessings.** The harness hands a cell its Blessings' share, so the Blessing rows never reach a fight. The `blessingCut` family moved nothing for that reason, and the death price was read through `deathLoss` instead.

---

## 10. Regenerate it

Everything on this page is printed from `tools/balance-program/sensitivity/data/` by one tool, and that data is replayed by one workflow.

```
# the levers, the cells, the experiments (no play)
node tools/balance-program/sensitivity/sensitivity.mjs --plan
node tools/balance-program/sensitivity/sensitivity.mjs --coverage

# play it again on GitHub: one job a lever, one a chunk of an experiment (about 190 runner-hours)
git push origin HEAD:refs/heads/balance-sensitivity/<name>
gh run download <run id> --dir <dir> --pattern 'sens-*'

# the matrix, the findings and every table of the two documents
node tools/balance-program/sensitivity/analyze.mjs --parts <dir> --save --run <run id>
node tools/balance-program/sensitivity/analyze.mjs --write-docs
node tools/balance-program/sensitivity/analyze.mjs --findings
node tools/balance-program/sensitivity/analyze.mjs --lever monsterDamage
node tools/balance-program/sensitivity/analyze.mjs --exp hp-spawn
```

The tables between `<!-- GEN: ... -->` and `<!-- /GEN -->` are written by `--write-docs`. `--check-docs` exits 1 when one of them no longer matches the data. `data/matrix.json` is the matrix in machine form (schema `hearthrise.balance-sensitivity-matrix/1`), and `tools/balance-program/graph.mjs --measure` reads it as it stands.
