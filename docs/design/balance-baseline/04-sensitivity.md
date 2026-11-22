# Balance baseline 04: the Sensitivity Matrix

Lane BL-4 (systems engineer, 2026-11-21 and 22). Deliverable 4 of Tyler's directive of 2026-11-21, "Establish a Global Balance Baseline Before the Overhaul", Phase 4. The interaction analysis is `05-interactions.md`.

**The baseline.** Every number here was played on the overhaul's starting build, `set/v0.2.144` at `861ae52e3` (branch `baseline/overhaul-start`), not on the live game. No gameplay number was changed. Every perturbation lived on a scratch copy inside the simulator.

**What this is for.** The overhaul is being redesigned from first principles, the math included. So this page is EVIDENCE of how today's formulas behave: which levers dominate, which do nothing, where the cliffs and caps come from. It is not a tuning guide for today's numbers, and it does not grade anything against an old ruling. Where a target matters, it is a candidate from `03-targets.md`, and every one of those is a design hypothesis.

**Labels.** MEASURED means played on the real engine, with its run, seeds and hours. COMPUTED means arithmetic on named inputs. JUDGMENT marks a call of mine. UNKNOWN means not measured, with the reason.

<<FILL:SUMMARY>>

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
<!-- /GEN -->

### 4.2 Lone heroes (the eight ways, MID, Normal)

<!-- GEN: matrix group=party:1 outcomes=killsPerH,levelXpPerH,takenPerH,lowHpP10,incomePerH,storePerH,netPerH -->
<!-- /GEN -->

### 4.3 The four (MID, Normal)

<!-- GEN: matrix group=party:4 outcomes=killsPerH,levelXpPerH,takenPerH,lowHpP10,incomePerH,storePerH,netPerH -->
<!-- /GEN -->

### 4.4 The four on Deadly

<!-- GEN: matrix group=four:deadly outcomes=killsPerH,levelXpPerH,takenPerH,lowHpP10,incomePerH,storePerH,netPerH -->
<!-- /GEN -->

---

## 5. Ranked by influence

The strongest levers on each outcome, over every cell. The number is the largest of a lever's low, local and high elasticities.

<!-- GEN: list name=rank -->
<!-- /GEN -->

<<FILL:RANKNOTES>>

---

## 6. The six lists Tyler asked for

Each list is drawn by a fixed rule, written in `analyze.mjs` (`FINDING_RULES`), so a re-run names the same things.

### 6.1 Levers with large effects on outcomes they are not for

Rule: an elasticity of 0.5 or more on an outcome outside the lever's purpose. Damage, kills, XP and gold in count as one outcome for a lever that is for any of them.

<!-- GEN: list name=sideEffect -->
<!-- /GEN -->

<<FILL:SIDENOTES>>

### 6.2 Levers that do not move what they are for

Rule: the largest elasticity on an intended outcome is under 0.05, or nothing resolved.

<!-- GEN: list name=intendedMiss -->
<!-- /GEN -->

And the levers that moved nothing at all.

<!-- GEN: list name=dead -->
<!-- /GEN -->

And the steps the engine or the game's own validators refused.

<!-- GEN: list name=refused -->
<!-- /GEN -->

<<FILL:MISSNOTES>>

### 6.3 Levers whose effect changes sharply with Level

Rule: for a rate, the high-step elasticity differs between two Levels by more than 0.3 and by more than a factor of two, or changes sign.

<!-- GEN: list name=byLevel -->
<!-- /GEN -->

<<FILL:LEVELNOTES>>

### 6.4 Levers that pull opposite ways across combat styles

Rule: at one step the outcome rises for one lone way and falls for another, both resolved and both past 2% (300 gold an hour for net gold).

<!-- GEN: list name=byStyle -->
<!-- /GEN -->

<<FILL:STYLENOTES>>

### 6.5 Redundant levers

Rule: two levers whose effect vectors (every cell, every core rate outcome, at the lowest and the highest step) have a cosine of 0.9 or more.

<!-- GEN: list name=redundant -->
<!-- /GEN -->

<<FILL:REDUNDANTNOTES>>

### 6.6 Levers that cannot be tuned independently

This is the subject of `05-interactions.md`, section 12, which measures it with joint experiments. In short: every lever on the fight is coupled to at least four others, and every reward lever is clean.

---

## 7. The structural findings

<<FILL:STRUCTURE>>

---

## 8. Large steps: where the local slope lies

Rule: the low-step and high-step elasticities differ by 0.25 or more and by 30% of the larger, both resolved.

<!-- GEN: list name=nonlinear -->
<!-- /GEN -->

<<FILL:NONLINEARNOTES>>

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
