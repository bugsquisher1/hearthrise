# 12. The balance pass on the fixed simulator

Written 2026-11-21 on `lane/d-balance-pass`, on `set/v0.2.144` at 14a8984a0. This is the last step before the build plan. It turns the book's PROVISIONAL numbers into MEASURED ones, or shows where they are wrong. No game code, data or migration was changed. The only files added are this chapter and the patches in `tools/balance-program/patches/`.

Labels. MEASURED is a run on the real engine, with the run, the cells, the seeds and the hours. COMPUTED is arithmetic on named inputs. JUDGMENT is a design opinion. UNKNOWN means nobody knows. Nothing here is compared with the game that runs today.

## 0. One screen

**What the fixed simulator says about the proposed game.** The base is sound and the harder tiers were not. Gear on a line, the kill reward and the Level table all read close to their targets from Level 45 up. But on the proposed game as registered, Dangerous and Deadly did nothing to a party. A mid-geared four on Deadly stood at 72 to 97% health on all 28 ground ends and nothing died (MEASURED, R0). So every number that leaned on "Deadly bites" was untested until this pass.

**The few causes behind the 3,620 reds.** Twelve causes, and five of them hold 3,171 rows.

| Cause | Rows | Kind |
|---|---|---|
| A lone hero judged on a tier band that is sized for a party | 811 | The band is wrong for the game |
| The arrival kit takes two to three times the damage of the mid kit | 735 | The design misses |
| One gold band reads the store bill as if it were every sink | 632 | The tool |
| The harder tiers do not bite a party | 575 | The design misses |
| Profit and store-share bands used as targets | 418 | The band is wrong for the game |
| Seven smaller causes | 449 | Mixed, section 2 |

The design misses in 1,581 rows, a band is wrong in 1,368 and the tool is wrong in 671.

**Measured, and it holds.**
- **The gear band step of +17% (GR-4), for weapons.** A weapon step is worth 4.4% at Level 185 and 7.3% at Level 400 against a target of 5 to 8%.
- **The kill reward (GR-5) from Level 45 up.** A lone hammer on Normal reads 0.85 to 1.23 of the pace contract at every checkpoint from 45 to 400.
- **The clan Library's +5% (chapter 11).** It reads +4.9% in every cell from Level 60. It is plain arithmetic, as the chapter said.
- **Deadly's pull of 8, Dangerous's pull of 5, and what they pay.** For a four, Dangerous pays 2.1 to 3.0 times Normal and Deadly pays 20 to 29% over Dangerous.
- **The lost hunting time you accepted in S-6.** A four that sits on the edge of Deadly loses 16 to 34% of an 8 hour bar when left alone. The review computed 18 to 31%.
- **The Talents power budget (TL1).** The fastest build is at most 2.2% faster than the suggested one.
- **Your rule that the four together beats the same four split up.** With the new tiers in, the four on the best tier it keeps earns 1.4 to 2.6 times what its heroes earn apart, at 28 of 29 checkpoints from Level 5 to 400.

**Changed, and to what.**
- **Deadly blows: 2.25 to 2.5 times Normal.** At 2.25 a mid four dies at only 5 of 14 band floors. At 2.5 it dies at 10 of 14 floors and is safe at 12 of the 13 band tops that can be read.
- **Dangerous blows: 1.17 to 2.5 times Normal, on its pull of five.** 1.17 was sized on a lone hero. Both harder tiers now share one blow number and differ by pull, health and pay.
- **The Blessing ladder's threshold: 5 hours to 2 hours.** At 5 hours a watched four on Deadly earns less than the same four on Dangerous through most of the ruled death band.
- **The Level law's seat: the four on Dangerous, 1.266 times the pace contract.** It was the four on Deadly with no death, 1.492. This is the idle tier you ruled in S-6.
- **The health bands for the harder tiers.** A four near the ruled death count has a typical low point of 36 to 66% health. The old band of 15 to 40% is where a four wipes.
- **The paid edge and the ceiling, as readings.** Every cap full reads 1.29 to 1.48 times a plain four, not 1.72. Paying alone reads about 1.06 to 1.08 in Level pace, not 1.22. The edge is real, and it shows up as holding a harder tier sooner.

**Still PROVISIONAL, and what would settle each.**
- **The death count on each ground.** The sample is four seeds of eight hours. A real death rate from the playtest settles it.
- **Every gold price and sink.** Gold in the tool is still an upper bound. The wage formula settles it.
- **The armor half of a gear band.** Armor past Level 30 is worth nothing, at any band size. One knob fixes it and it needs a full run.
- **Talent sizes and the unlocks.** The matrix plays four stat lines and no unlock. One unlock in a cell settles it.
- **The protection buff.** The built row does nothing for a capped hero. The rating row of CORE-4 is not built.

## 1. What was run

| Id | Run | Cells, seeds, hours | What it is |
|---|---|---|---|
| R0 | GitHub run 44920906999 | 4,503 cells, 2 seeds of 2 hours | The full matrix on the proposed game as registered. Played on commit b0f472e7, one commit before the sitting's cells. The mixed four is the same four |
| R1 | GitHub run 44924971088 | 670 cells, 2 seeds of 1 hour | The subset at the base dials with five buff rows, 240 buff cells. The rest of this run, a wider tier sweep, was cancelled to free runners for R2 |
| R2 | GitHub run 44925664434 | 153 cells at each of two dial pairs, 4 seeds of 8 hours | The death sample. A four cell is 128 hero-hours. Dangerous at 2.6 and 3.0, Deadly at 2.25 and 2.5 |
| R4 | GitHub run 44928035806 | 153 cells at 4 seeds of 8 hours, and 4,567 cells at 2 seeds of 2 hours | The death sample with both harder tiers at 2.5, and the full matrix with this pass's three picks in |
| L | Local, the dev PC, each under four minutes | 2 seeds of 1 hour | Six tier probes on the four, the gear step, the armor curve, jewelry on and off |

Two seeds of two hours is 16 hero-hours for a four. It cannot see a death rate under about 60 in 1,000 hours. Every death number in this chapter comes from R2 or R4.

The measurement branches are `balance-full/d-balance-pass-1` to `-4` on origin. They carry a copy of the matrix workflow and are never merged.

**How true the tool is, on the proposed game** (MEASURED, R0, against the one real four at Krell's Hold). Kills read 1.26 times real, coin 1.24, the store bill 0.92, the front hero's share of the damage 0.77 against 0.69. The front hero's damage an hour reads 0.58 of real. So the tool's four is a little safer than the real four was, and every survival number here leans soft.

## 2. The 3,620 red readings, by cause

MEASURED on R0. Every RED row is filed under one cause. Kind (a) is the design missing its target. Kind (b) is a band set for a frame that has since changed. Kind (c) is a tool gap.

| # | Cause | Rows | Kind | Bands | What to do |
|---|---|---|---|---|---|
| 1 | **A lone hero judged on a tier band.** The tiers are sized on the mid four (CORE-1), and no solo target exists (2026-11-21) | 811 | b | S3, S4, G-2 on the harder tiers, G-5, P10 | Read these bands on the four only. Band change 1 |
| 2 | **The arrival kit takes two to three times the damage of the mid kit under Level 110.** One tier back, no jewelry and eight skill points down | 735 | a | S5.low 615, P3 71, P5 49 | Section 3.6. Not fixed in this pass |
| 3 | **G-9 reads the store bill as if it were every repeating sink.** Normal is asked to be under 15% by one band and over 25% by this one | 632 | c | G-9 | Retire the reader until a sink model exists. Band change 4 |
| 4 | **The harder tiers do not bite a party** | 575 | a | S3 and S4 on parties 374, the store share too low on the harder tiers 136, G-5 60, P10 5 | Fixed by the tier patch, section 3.1 |
| 5 | **Profit and store-share bands used as targets.** Ruled 2026-11-13: profit is reported, never graded | 418 | b | G-6 207, G-2.normal 169, G-1 34, G-3 8 | Report only. Band change 5 |
| 6 | **Armor steps.** A tier of armor is worth 23 to 58% early and nothing once a set is at the 60% cap. Best gear protects too much under Level 45 | 198 | a | S5.bis 145, E1.armor 34, E1.weapon 13, 6 more | Section 3.6 |
| 7 | **A way judged on the hammer's clock.** The tank and the healer are slow alone on purpose, and no lone target exists | 133 | b | P2 | Read P2 on the hammer. Band change 6 |
| 8 | **Sinks are small beside income.** Full best gear costs about a fifth of a band's gold where the ruling asks 1.2 to 1.4 | 44 | a | E4, G-10 | Section 3.7. Waits on the wage formula |
| 9 | **S11 reads three Blessings at the top of the death band.** The ladder you ruled in S-5 is not in the reader | 33 | c | S11 | Band change 7. The real finding is in section 3.3 |
| 10 | **The kill reward is one smooth line and the grounds step** | 29 | a | P2 on the hammer and by ground 22, 7 more | Section 3.4 |
| 11 | **The pace table read on the four before Level 100, and open content counted without staged** | 6 | b | P1, R2, P11 | Band change 8 |
| 12 | **Stale readers and one artifact.** The cost bands read the old engine. One lineup cell ended with no fight | 6 | c | C1 to C3, TL1 | Band change 9 |

Totals: 1,581 rows of kind a, 1,368 of kind b and 671 of kind c.

The 4,214 rows that read "off" follow the same causes. The largest groups are P9.dangerous (646, the four earns more than the band expects on Dangerous because the pull feeds it), S5.bis (549) and S1.mid (413, Normal is safer than its band at most Levels).

## 3. The first build's numbers

### 3.1 The harder tiers (CORE-1, GR-27)

| Number | Was, PROVISIONAL | Now | Evidence | Band |
|---|---|---|---|---|
| Deadly blows and aim | 2.25 times Normal (CORE-1). The registry played 1.33 | **2.5** | MEASURED, R2 and R4 | S4, S6 |
| Dangerous blows and aim | 1.17, sized on a lone hero | **2.5**, the same number as Deadly | MEASURED, R2 at 2.6 and 3.0, R4 at 2.5 | S3, S6 |
| Deadly pull, health, Level XP | 8, 1.15, 1.25 | Unchanged | MEASURED, R0: Deadly pays 20 to 29% over Dangerous from Level 75 to 400 | P9 |
| Dangerous pull, health, Level XP | 5, 1.10, 1.10 | Unchanged | MEASURED, R0: Dangerous pays 2.1 to 3.0 times Normal for a four on 11 of 14 grounds | P9 |

Patch: `bp-tiers-2500.json`. Layer: coefficient. One table for every ground.

**What the base dials did.** MEASURED, R0. On every ground, at both ends of its band, the mid four on Deadly had a typical low point of 72 to 97% health and no death. The four on Dangerous stood at 83 to 99%.

**The response is a cliff.** MEASURED, L and R2. A four is either safe or it wipes. The step between is a few percent of the dial.

| The mid four, typical low health | Deadly 1.33 | 1.75 | 2.0 | 2.25 | 2.5 | 2.75 | 3.3 |
|---|---|---|---|---|---|---|---|
| Level 10, the Sewer | 0.76 | 0.67 | 0.56 | 0.48 | wipes | wipes | wipes |
| Level 30, the Glade's top | 0.93 | 0.90 | 0.88 | 0.86 | 0.84 | 0.82 | 0.76 |
| Level 110, Krell's top | 0.88 | 0.82 | 0.78 | 0.75 | 0.72 | 0.69 | 0.62 |
| Level 185, the Catacombs' top | 0.76 | 0.68 | 0.63 | 0.56 | 0.50 | wipes | wipes |

Two seeds of one hour, except 2.25 and 2.5 at Levels 30 to 185, which are four seeds of eight hours. "Wipes" is over 1,000 deaths in 1,000 hours.

**The death sample at two dials.** MEASURED, R2. The mid four on each of 14 grounds at both ends of its band, 128 hero-hours a cell.

| | Deadly 2.25 | Deadly 2.5 |
|---|---|---|
| Band floors with no death | 9 of 14 | 4 of 14 |
| Band floors with a death, under 150 in 1,000 hours | 3 | 5 |
| Band floors over 150 in 1,000 hours | 2, both wipes | 5, four of them wipes |
| Band tops with no death | 13 of 14 | 12 of 14 |
| All cells, deaths in 1,000 hunted hours | 16 | 41 |

The fourteenth top is the Muster Barrows, where the hunt ends for another reason. See section 9.

At 2.25 Deadly is free on nine grounds from the day a four arrives. At 2.5 a four that arrives in a band dies on ten grounds and is safe by the band's top on all but the Ox Road. At 2.75 the top of the Catacombs wipes (L). So 2.5 is the largest number that keeps the tops safe.

**Why Dangerous takes the same blows.** MEASURED, R2. Dangerous at 2.6 on a pull of five killed the bow on Wyvern Roost in all four seeds, where Deadly at 2.25 on the same ground had no death. A back hero dies to one big blow from a shooter, and the size of that blow is the dial, not the pull. If Dangerous hits harder than Deadly, the tiers invert on every ground with shooters. With one blow number, Dangerous is always the smaller pull of the same monsters. Dangerous at 3.0 was also worse than Deadly at 2.5 on the Coppercap Warrens, 657 deaths in 1,000 hours against 138.

**Dangerous at 2.5.** MEASURED, R4, 4 seeds of 8 hours, the mid four on 14 grounds at both band ends. 25 of 28 cells had no death. The Sewer's floor at Level 5 read 41 deaths in 1,000 hours, Wickstead's floor at Level 8 read 142, and the Roost's floor read 23, where the bow died twice. All cells together read 4 deaths in 1,000 hours. That is under the ruled 10 to 30. Reaching the ruled count needs Dangerous to hit harder than Deadly. At 2.6 the pool read 8. At 3.0 it read 29, with seven floors over the red line and two grounds where Dangerous was deadlier than Deadly. So at 2.5 Dangerous is the safe idle tier for a mid four inside its band, and the ruled count is on the list for Tyler.

**Each ground is now a ladder.** JUDGMENT, on the measured shape. A four arrives and hunts Dangerous. Some way up the band Deadly stops killing it. By the top Deadly is safe and the next ground opens. That is your "strong enough or not" of 2026-11-08, and it is what one table can deliver. A flat death count at every Level is not.

**The arrival kit.** MEASURED, R2. A four in the arrival kit wipes on Dangerous at Levels 10, 60, 185 and 400 and holds it at the band tops, Levels 30 and 110. On Deadly it wipes everywhere but Level 110. An arrival steps down, as the standards ask.

### 3.2 Deadly's death band and S-6

| Number | Was | Now | Evidence |
|---|---|---|---|
| Deaths of a mid four on Deadly | 50 to 100 in 1,000 hours, flat at every Level (ruled 2026-11-21) | The ruling stands as the entry point. It is not a steady state | MEASURED, R2 |
| Hunting time lost by a four left alone on the edge | 18 to 31% on the 8 hour bar (COMPUTED by the review, accepted in S-6) | **16 to 34%**, with 25 to 75% of 8 hour hunts ending early | MEASURED, R2, the seven cells between 40 and 150 deaths. The eighth, at 32 deaths, lost 3% |
| What dies | "A death ends that hero's hunt. The rest hunt on" | **The whole four.** When the front hero fell, the other three died in the same hunt, in every case. The one other kind of death was the bow on Wyvern Roost, killed alone by shooters | MEASURED, R2 and R4 |
| Typical low health near the ruled death count | 15 to 40% (S4) | **36 to 66%, median 48%** | MEASURED, R2, eight cells |

**The ruled band is a knife edge.** Of 56 Deadly ground cells in R2, one read inside 50 to 100. Forty had no death in 128 hero-hours. Eight read between 30 and 150, one read 8 and one read 292. Six wiped. The four heroes die together, so a count of 75 in 1,000 hero-hours is one wipe in about 13 party-hours.

**The cells that sat on the edge.**

| Ground and Level | Dial | Typical low | Deaths in 1,000 hours | Hunted share of the time offered | 8 hour hunts that ended early |
|---|---|---|---|---|---|
| The Catacombs, 165 | 2.25 | 0.47 | 75 | 0.83 | 50% |
| Coppercap Warrens, 32 | 2.25 | 0.43 | 47 | 0.84 | 31% |
| Muster Barrows, 55 | 2.25 | 0.46 | 40 | 0.78 | 25% |
| Pyre Field, 70 | 2.5 | 0.51 | 40 | 0.79 | 25% |
| The Ox Road, 128 | 2.5 | 0.55 | 41 | 0.77 | 25% |
| The Ox Road, 112 | 2.5 | 0.49 | 142 | 0.66 | 75% |
| Coppercap Warrens, 32 | 2.5 | 0.36 | 138 | 0.68 | 75% |
| The Slake, 50 | 2.5 | 0.66 | 32 | 0.97 | 25% |

Typical low health is a poor reading of danger. Every cell under 0.36 wiped, but two cells wiped at 0.48 and 0.52, and Krell's floor read 292 deaths at 0.62. The worst tenth of fights reads better: no Deadly cell died while it stayed over 0.45. So the health bands become readings, and the death sample judges a tier. Band change 2.

**The leave rule.** MEASURED, R2. With "the rest hunt on", a front death cost four deaths in every sampled wipe. With "all come home" it cost one. The hunting time lost is the same. See the list for Tyler.

### 3.3 The Blessing ladder (S-5, GR-7)

| Number | Was, PROVISIONAL | Now | Evidence |
|---|---|---|---|
| The threshold at which a new Blessing opens | A blessed death that costs over **5** hunted hours | **2** hours | COMPUTED on MEASURED Level XP rates (R0) |
| New Blessings to Level 400 | 3, at Levels 97, 140 and 257 | **5**, at about Levels 74, 98, 161, 248 and 387 | COMPUTED, read on the four on Deadly |

**Why.** A watched four takes Deadly only if it pays more than Dangerous after its deaths. Deadly pays 20 to 29% over Dangerous (MEASURED, R0). So the deaths may take at most that.

| Level | Deadly over Dangerous | A blessed death at the 5 hour rule | Deaths in 1,000 hours where Deadly equals Dangerous | At the 2 hour rule | Deaths where they are equal |
|---|---|---|---|---|---|
| 88 | +27% | 3.0 h | 73 | 1.5 h | 146 |
| 110 | +28% | 2.8 h | 79 | 1.4 h | 157 |
| 145 | +21% | 3.5 h | 49 | 1.8 h | 99 |
| 185 | +22% | 2.7 h | 68 | 1.3 h | 135 |
| 250 | +21% | 4.1 h | 42 | 1.0 h | 169 |
| 300 | +21% | 2.8 h | 62 | 1.4 h | 124 |
| 400 | +21% | 4.1 h | 41 | 1.0 h | 166 |

At 5 hours the break-even sits at 41 to 79 deaths, inside or under your band of 50 to 100. A four that dies 75 times in 1,000 hours earns less on Deadly than on Dangerous at six of these seven Levels. At 2 hours the break-even is 99 to 169, so Deadly pays through the whole band, by 5 to 15% at 75 deaths.

This counts XP only and a player who restarts at once. It is COMPUTED, on the Level law of section 3.5. It stays PROVISIONAL until the playtest gives a real death rate, as S-5 says. The direction is firm: 5 is too high for the band you ruled.

Blessing prices are not in this pass. The tool reads a full set at Level 110 as 4,050 gold for 29.6 hours saved (R0, S10). That is under an hour of one hero's gold, so the ladder is close to free until GR-51 prices it.

### 3.4 The kill reward (GR-5)

| Number | Was, PROVISIONAL | Now | Evidence | Band |
|---|---|---|---|---|
| XP a health point follows the pace line, on one reference fit | COMPUTED | **Holds from Level 45.** The lone hammer on Normal reads 0.85 to 1.23 of the contract at 20 checkpoints from 45 to 400, and 0.85 to 0.94 from Level 145 on | MEASURED, R0 | P2 |
| The one derived number a ground carries | Not written | **Owed, and now sized.** Without it a ground's mean reads 0.86 to 1.84 | MEASURED, R0, the ground axis | P2 |
| Party grounds pay two thirds of a plain kill | COMPUTED | Not judged alone. The Sewer, the Warrens and the Muster Barrows read 1.3 to 1.8 on the lone clock, so two thirds may still be high | MEASURED, R0 | P2 |

**The number each ground is owed.** COMPUTED from R0. It is one over the geometric mean of the lone hammer's reading at the two ends of the band. The generator of GR-5 writes it.

| Ground | Floor | Top | The derived number |
|---|---|---|---|
| Mill Cellar | 3.48 | 0.60 | 0.69 |
| Meadowbrook Thicket | 2.03 | 0.74 | 0.81 |
| Millrace Sewer | 3.43 | 0.99 | 0.54 |
| Wickstead | 1.41 | 0.63 | 1.06 |
| Mosslight Glade | 1.76 | 0.95 | 0.78 |
| Coppercap Warrens | 1.66 | 1.05 | 0.76 |
| Hask's Ford | 1.04 | 0.76 | 1.12 |
| The Slake | 1.03 | 0.81 | 1.10 |
| Muster Barrows | 1.53 | 1.32 | 0.70 |
| Pyre Field | 1.24 | 1.06 | 0.87 |
| Krell's Hold | 1.15 | 0.91 | 0.98 |
| Carter's Rest | 0.93 | 0.80 | 1.16 |
| The Ox Road | 1.26 | 1.07 | 0.86 |
| Wyvern Roost | 0.96 | 0.88 | 1.09 |
| The Unmarked Catacombs | 0.92 | 0.85 | 1.12 |

Under Level 45 a ground's floor reads far over its top, because the contract climbs fast and a ground's monsters do not. No single number closes that. It is why P2 is read at a ground's mean. Band change 6.

### 3.5 The Level law (GR-6, GR-6a, GR-6b)

| Number | Was, PROVISIONAL | Now | Evidence | Band |
|---|---|---|---|---|
| The seat the law is timed on | The mid four on Deadly with no death | **The mid four on Dangerous** | S-6, and MEASURED rates from R0 | P1 |
| The seat's multiple of the pace contract | 1.492 | **1.266** | MEASURED, R0: the median of 28 checkpoints from Level 30 to 400. The range is 0.94 to 1.98 | P1 |
| Level 100 for that seat | 494 hours | **516 hours** | COMPUTED on R0 rates | P1 |
| Level 400 for that seat | Day 373 | **Day 400** (4,804 hours) | COMPUTED | P1 |
| Krell's Hold, Level 88 | Day 31 | **Day 33** | COMPUTED | |
| Staged content ends, Level 185 | Day 116 | **Day 117** | COMPUTED | R2 |

Patch: `bp-level-law-dangerous-seat.json`. Layer: coefficient. It changes one number of R13.

**Why.** On 1.492 the table is true only for a four that farms Deadly and never dies. The four you ruled as the idle game, on Dangerous, would reach Level 400 on day 472 and Krell on day 39. That is 24% behind your table for the player the game is built around.

| Seat | Level 100 | Level 200 | Level 300 | Level 400 | Krell |
|---|---|---|---|---|---|
| Your table | 600 h | 1,680 h | 3,120 h | 4,580 h | |
| Law on 1.492, the four on Deadly with no death | 453 h | 1,492 h | 2,913 h | 4,616 h | Day 28 |
| Law on 1.492, the four on Dangerous | 607 h | 1,878 h | 3,598 h | 5,661 h | Day 39 |
| **Law on 1.266, the four on Dangerous** | 516 h | 1,594 h | 3,054 h | 4,804 h | Day 33 |
| Law on 1.266, the four on Deadly with no death | 384 h | 1,266 h | 2,472 h | 3,918 h | Day 24 |
| Law on 1.266, a lone mid hammer on Normal | 735 h | 2,253 h | 4,264 h | 6,606 h | Day 49 |

COMPUTED on R0's rates, log-linear between checkpoints. The Dangerous four lands inside 10% of your table from Level 200 on and runs ahead before it, which GR-6 allows. The median does not land Level 400 exactly. The derivation in `proposals.mjs` should fit the seat at the ruled points and not take a median. That is tool work for the matrix lane.

This has a cost and it is on the list for Tyler: a four that farms Deadly safely is 18% ahead of the table.

**Read back on the full matrix.** MEASURED, R4, with the three picks in. The four on Dangerous reads 1.271 times the contract at the new dials (22 checkpoints), so 1.266 holds. The judge's pace seat reads 603 hours at Level 100, 1,531 at 200, 2,980 at 300 and 5,108 at 400, against your 600, 1,680, 3,120 and 4,580. Levels 100 to 300 are inside the band. Level 400 reads 11% slow. That is PROJECTED content, where the mid four no longer keeps a harder tier at the new dials.

### 3.6 The gear band step (GR-4), armor and the three gear states

| Number | Was, PROVISIONAL | Now | Evidence | Band |
|---|---|---|---|---|
| The band step past tier 7 | +17%, with +24% as a hypothesis. The registry played +24% | **+17% holds for weapons** | MEASURED, L, 2 seeds of 1 hour at Levels 185 and 400 | E1.weapon |
| A weapon step at +17% | Target 5 to 8% | 4.4% at Level 185, 7.3% at Level 400 | MEASURED, L | E1.weapon |
| A weapon step at +24% | | 5.0% and 8.9% | MEASURED, R0 and L | E1.weapon |
| An armor step | Target 3 to 5% less damage (ruled 2026-10-25) | **Nothing.** Between minus 0.8% and plus 1% past Level 45, at either step | MEASURED, R0 and L | E1.armor |
| Best gear over mid gear, Level pace | About 15% (ruled, 50-3) | **About 7%** for a lone hero at every stretch. For a four, 2% on Normal and 5 to 7% on the harder tiers | MEASURED, R0 | P4 |
| Best gear, damage taken | About 15% less | 24% less under Level 45, 14% less from 46 to 110, 7 to 9% less past it | MEASURED, R0 | S5.bis |
| Plain jewelry, arrival kit to mid kit | Not sized | 9 to 23% Level pace for a lone hero up to Level 300. More than a weapon step | MEASURED, R0 | |

Patch: `bp-gear-step-117.json` plays the decided step. The registry's GR-4 row should point at it.

**A weapon step grows with Level.** At +17% it is 4.4% at 185, 7.3% at 400 and 9 to 11% past Level 1,000 (L, PROJECTED). Gear is a growing share of a blow as skill flattens. The step is right through Level 400 and will want a second look past it.

**Armor is decoration past Level 30.** MEASURED, L. A probe made armor fade 2.4 times as fast against the attacker's Level (`bp-armor-curve-240.json`). The mid hero's damage taken did not move, by 0 to 3% from Level 30 to 400. So a full mid set holds more than 2.4 times the armor that the 60% cap can use. One band back is still at the cap. That is why an armor upgrade does nothing, and why the shield and the hammer hold alike at Level 110.

With the probe in, an armor step reads 3.6% at Level 60 and 4.1% at Level 400, inside your ruling. But the arrival kit then takes 1.6 to 2.4 times the mid kit's damage, which is worse. So the knob is right and it cannot ship without the arrival kit being fixed with it. It stays PROVISIONAL. What settles it: one full run with the probe, the arrival kit's skill offset and the jewelry share moved together.

**The arrival kit.** MEASURED, R0 and L. It takes 2.2 times the mid kit's damage under Level 45, 1.6 times from 46 to 110 and 1.3 times past 185. The band asks 1.15 to 1.35. Taking the jewelry numbers of GR-38 out moves the middle stretch from 2.0 to 1.6 and leaves the early stretch at 2.8 (L, the subset's hammer). So under Level 45 the cause is the tier back and the eight skill points, not jewelry. A new account's four wears this kit. It is the largest open design miss in the matrix, and the first hour's survival rests on it.

### 3.7 Prices that four heroes break

Nothing here is a new price. Gold in the tool is still an upper bound: every drop is sold to the vendor at once, and coin reads 1.24 times the one real four. So these are sizes, not prices.

**What an account of four earns.** MEASURED, R0. The mid four on Dangerous, net gold after the store, 4 heroes at 12 hours.

| Levels | Net gold a hero-hour | An account-day |
|---|---|---|
| 16 to 31, the Glade | 6,000 to 7,100 | 290,000 to 340,000 |
| 45 to 65, the Ford and the Slake | 10,700 to 13,500 | 510,000 to 650,000 |
| 70 to 110, the Pyre Field and Krell's Hold | 17,600 to 21,500 | 845,000 to 1,030,000 |
| 110 to 185 | 18,000 to 22,600 | 860,000 to 1,090,000 |

A four on Dangerous nets 0.53 to 0.77 of a lone mid hammer for each hero. So an account of four earns 2.1 to 3.1 times one hero's income.

**Typed account prices against the sizes CE-5 decided.** COMPUTED on those account-days.

| Price | Typed | CE-5's size | The typed price in account-days | Off by |
|---|---|---|---|---|
| Farmstead | 25,000 | About 1 account-day | 0.08 at Level 20 | 12 times |
| Manor | 150,000 | About 3 | 0.25 at Level 60 | 12 times |
| Keep | 600,000 | About 6 | 0.6 at Level 90 | 10 times |
| Castle | 2,500,000 | About 20 | 2.8 at Level 110 | 7 times |
| The three curing slots | 250,000, 750,000, 2,000,000 | Not sized | 0.3, 0.8 and 2.1 at Level 90 | |
| Founding a clan | 100,000 | Not sized | 0.2 at Level 60 | |

So the whole property ladder is under four account-days of gold at Level 90. CE-5's direction is right and its factor is about ten, not the two to three that "four heroes" alone would give. The rest is that the typed ladder was already small beside income.

**Hero prices.** MEASURED, R0. Full best gear costs 0.18 of a band's net gold for a lone hero where the ruling of 2026-11-18 asks 1.2 to 1.4 (E4 and G-10, all 22 rows RED). GR-8 already says this.

**The store.** MEASURED, R0. The store bill of a four is 13 to 50% of its coin and does not move with the tier at the base dials. At the new dials it rises on the harder tiers, which is the "struggle or pay" you asked for on 2026-11-19. At the new dials the median stays at 28% on all three tiers, and the top of the range rises to 58% on Dangerous (MEASURED, R4). The real four paid 48% on Deadly. So on the edge a four dies before it pays. The struggle is there and the bill is not.

Every price stays PROVISIONAL until the wage formula of GR-51 exists. What this pass adds is the measured account-day and the size of the miss.

### 3.8 The buff caps (MM-24 to MM-26)

MEASURED, R1 at the base dials and R2 at the raised dials. The mid four with one buff row kept up all hunt.

| The buff | The book's reading | Measured on the four |
|---|---|---|
| Damage +10% | Level pace +10% | **Pace +0 to +7%, median +1%.** Damage taken minus 3 to minus 20% |
| Damage +15%, both damage caps | Pace +15% | **Pace +0 to +11%, median +2%.** Damage taken minus 5 to minus 32% |
| The built protection row, a 10% cut off every blow | About 10% less damage | **Nothing.** Median 0.0%, and within 1% in 19 of 24 cells. The front hero is at the 60% cap and the cut is inside it |
| Level XP +5% | +5% | +4.9% from Level 60. +3.9 to +4.7% at Level 30, where kills are small numbers |
| Every cap full: damage +15%, the cut, Level XP +30% | 1.72 times a plain four | **1.29 to 1.48, median 1.33** |
| A lone hammer, damage +10% | | Pace +4.1 to +5.5% |

**What it means.** A four's kills are set by how fast monsters come, not by how hard it hits. So a damage buff buys a four almost no pace and a lot of safety. The book's ceiling multiplied damage into pace. For a four that is wrong.

| Reading | The book | Measured |
|---|---|---|
| Every cap full, with the Library, on a Hearthrise weekend | 1.72 to 1.74 | 1.29 to 1.48 |
| Paying alone: best gear and the +6% damage boost | About 1.22 | About 1.06 to 1.08. Best gear is 5 to 7% for a four on the harder tiers and the boost about 1% |
| Kills an hour with every cap full | 1.32 | 1.00 to 1.14 |

**Where the edge really is.** MEASURED, R2. On the edge of a tier, gear, a buff or a build moves a four across it. At Level 10 on Deadly at 2.5 the mid four wipes and the best-gear four reads 38 deaths in 1,000 hours. Holding Deadly is worth 20 to 29% over Dangerous. So the paid edge is a step, not a percent: a payer holds the next tier some Levels sooner. That is a real advantage and not a broken one, which is what you asked for on 2026-11-21.

Check G of MM-26 asked that no buffed four holds a tier the plain four cannot enter. That check cannot pass and should not. It is how every source of power works on a cliff.

**What stays PROVISIONAL.** The caps themselves: +5% and +10% damage, +25% timed Level XP. Nothing measured says they are wrong. The protection row waits on the rating row of CORE-4, which is not built, and on the to-hit floor that row is owed.

### 3.9 The clan Library (chapter 11)

| Number | Was, PROVISIONAL | Now | Evidence |
|---|---|---|---|
| +0.5% Level XP a level, +5% at level ten | COMPUTED | **Holds.** +4.9% in every cell from Level 60 | MEASURED, R1, 24 cells |
| The pace ceiling with the Library | About 1.74 | 1.29 to 1.48 for a four, section 3.8 | MEASURED, R1 |

The Library is the one buff that pays a four its full size, because it does not pass through the kill rate. JUDGMENT: that makes it the strongest room in the castle for Level pace, not the weakest, which is the opposite of chapter 11's reading in 2.2. The War room's +5% damage is worth about 1% of pace to a four.

### 3.10 Talents (TL1 to TL4)

MEASURED, R0, 145 cells, and R2 for the edge.

| Band | Target | Measured | Verdict |
|---|---|---|---|
| TL1, the fastest build over the suggested one | At most 1.05 | 0.99 to 1.022 | Holds |
| TL2, the empty build over the suggested one | 0.90 to 0.97 | 1.00 at Level 25, 0.99 at 60, 0.98 at 110, 0.97 at 185, 0.96 at 400 | Misses under Level 185. 31 of 45 rows are off |
| TL3, deaths with every hero on safety | Over 30 in 1,000 hours | Thin at the base dials. On the edge the all-safety four died more than the suggested one | See below |
| TL4, builds within 3% of the best | At least 2 | Every build | Holds, and says the builds are alike |

The stat lines are inside the power budget, so they cannot be felt. A hero at Level 60 has 12 points and they are worth about 1% of pace.

**On the edge they decide who lives.** MEASURED, R2, Level 185 on Deadly at 2.5, 128 hero-hours a build.

| Build | Deaths | Hunted share |
|---|---|---|
| Suggested | 0 | 1.00 |
| All Force | 4 | 0.98 |
| All safety | 8 | 0.65 |
| Empty | 12 | 0.61 |

One Level and four seeds, so this is thin. The direction matches gear and buffs.

**What stays PROVISIONAL.** Every size. The curve's half point of rank 10 means a new hero's first five points are worth nothing it can see. A half point of rank 4 would make them worth about 3% (COMPUTED). I did not change it, because the stat lines are not what Talents are for. The unlocks are, and no cell plays one.

## 4. What the matrix shows that the book got wrong

### 4.1 The front hero takes nearly all of it

MEASURED, R0, the mid four on Deadly on every ground.

| The front hero's share of the damage | Grounds |
|---|---|
| 92 to 100% | Nine of 14: the Thicket, the Sewer, Wickstead, the Glade, Hask's Ford, the Muster Barrows, the Pyre Field, the Ox Road and the Catacombs |
| 82 to 89% | The Warrens and the Slake |
| 71 to 81% | Krell's Hold, Carter's Rest, Wyvern Roost. These have shooters or casters that reach the back |

The one real hunt was at Krell's Hold, so its 69% was the exception. A shield tank with Challenge pulls even those blows forward, which is the 94%.

What it means for the design.

1. **A party is one health bar.** Three of the four heroes are almost never hit. Their armor, their Defense, their Footing and Grit talents and the armor weight they chose do nothing on nine grounds. Defense trains only from blows taken, so back heroes never train it.
2. **It is why a tier is a cliff.** All the danger of a pull lands on one hero and one healer answers it. Either the heal keeps up or it does not. When the front falls the other three die in the same hunt (R2, every wipe).
3. **The tier wall you ruled on 2026-11-08 is not in the tier table.** You asked for more monsters to mean more area spells, so the whole party takes damage and resistance becomes the wall. A tier today scales the blow and the pull. Group damage is 0 to 8% of what a four takes on nine grounds. A tier row could carry a share of each pull's damage as a party-wide pulse. That would soften the cliff, give the back seats a reason to wear armor and make the death count something a dial can hold. It is a new mechanic, so it is not in this pass. It is the one design change the measurements argue for.
4. **The shield against the hammer.** MEASURED, R2. At Level 110 on Deadly at 2.5 a shield front and a hammer front hold alike, 0.73 and 0.72. Both are at the armor cap. At Level 60 the shield held at 0.59 and four seeds had no death. So the shield's job is real only where armor is not capped, which is section 3.6 again.
5. **What a party needs at the sized dial.** MEASURED, R2, Deadly at 2.5. At Level 60 three of the four fours with a shield tank and a healer had no death, and the fourth, with a hammer in the third seat, read 58 deaths in 1,000 hours. Three mages and a healer read 98 and hunted 40% of the time. Four mages wiped, and so did the hammer with three mages and no healer. At Level 110 the hammer with three mages held and was the fastest safe four by 3%. Three mages and a healer died 329 times in 1,000 hours. At the base dials three mages and a healer were the best four at Level 60 by 35%. So Deadly at 2.5 asks for a front hero at both Levels and a healer at 60. No one damage type wins: two mages behind a tank and a healer lead by 7% at 60, and the spread of the safe fours is 3 to 7%. Party XP by size alone holds for the first build, and S-10's question can rest. Two Levels, so thin.

### 4.2 An empty Talents build costs under 3%

It is true and it is the wrong reading. Away from the edge of a tier, nothing a hero owns is worth more than a few percent to a four, because the four's pace is set by the ground. On the edge the same few percent decide whether the four holds the tier. Section 3.10 has the measured case: three wipes in 32 party-hours for the empty build and none for the suggested one.

So gear, buffs and Talents are all the same kind of power for a four. Each is worth about nothing until the four stands on an edge, and then each is worth the step to the next tier, 20 to 29%. The book sized all three as percentages of pace. They should be sized as how many Levels sooner a four holds the next tier. That is one frame for the gear chase, the paid edge and the build choice, and it is the frame the matrix can measure.

## 5. Band changes

Each band is `tools/balance-program/standards.mjs`. I changed no file there. These are for the matrix lane.

| # | Band | Change | Reason |
|---|---|---|---|
| 1 | S3, S4, S6, P9, P10, G-5 | Read on the four only, on the ground axis, at the band floor and the band top apart | The tiers are sized on the mid four (CORE-1). No solo target exists (2026-11-21). 811 lone rows judged nothing |
| 2 | S4.mid | Report only. The reading near the ruled death count is 0.36 to 0.66. It was a band of 0.15 to 0.40 | MEASURED, R2. The 2026-10-25 health row and the 2026-11-21 death count cannot both hold. The newer ruling wins. Every cell under 0.36 wiped. The tier is judged by S6 on the death sample |
| 3 | S3.mid, S4.bis, S3.bis | Report only, the same way | The same conflict |
| 4 | G-9 | Retire the reader | It reads the store share. No sink model exists |
| 5 | G-1, G-2, G-3, G-6 | Report only | Ruled 2026-11-13: profit is reported, never graded |
| 6 | P2 | Read on the hammer, at a ground's mean. Other ways print and judge nothing | No lone target exists. A ground's floor and top cannot both sit on a contract that climbs through the band |
| 7 | S11 | Read the ladder, at the measured death count | S-5. The reader still plays three Blessings at 100 deaths |
| 8 | P1, R2 | P1 from Level 100 on, on the Dangerous seat. R2 counts staged content | GR-6 lets the four run ahead early. S-6 makes Dangerous the idle seat |
| 9 | C1 to C3 | Read study 48's design numbers | They read the old engine |
| 10 | The rule for "holds a tier" | Drop "net gold over zero" | Ruled 2026-11-13. The review named this in 1.3, row 8 |
| 11 | MM-26's check G | Drop "no buffed four holds a tier the plain four cannot enter" | Section 3.8. It is how power works on a cliff |

**The bands after the pass.** MEASURED, R4, the full matrix with the three picks in, 4,567 cells.

| | In band | Off | RED |
|---|---|---|---|
| R0, the proposed game as registered | 4,212 | 4,214 | 3,620 |
| R4, with the pass in, on the standing bands | 4,059 | 2,950 | 3,519 |

The count barely moves, and that is the point of section 2. Of R4's reds, 1,712 are bands set for another frame and 661 are readers. Lone heroes on the tier bands rose from 811 to 1,201, because a lone hero now dies on the harder tiers, as designed. With the band changes above applied, about 740 design reds are left, in four causes: the arrival kit (492), armor and best gear (174), sinks beside income (44) and the kill reward's ground number (29). None of those is a tier, a death or a clock.

## 6. The patches

All in `tools/balance-program/patches/`. Each applies on top of the proposed game with `balance-matrix.mjs --diff <patch> --base proposed`.

| Patch | What it moves | Status |
|---|---|---|
| `bp-tiers-2500.json` | Dangerous and Deadly blows to 2.5 times Normal. Pulls, health and pay unchanged | **The pick.** MEASURED, R2 and R4 |
| `bp-level-law-dangerous-seat.json` | The Level law's seat multiple, 1.492 to 1.266 | **The pick.** COMPUTED on R0 |
| `bp-gear-step-117.json` | The gear band step, +24% to the decided +17% | **The pick.** MEASURED, L |
| `bp-tiers-dangerous-2600-deadly-2250.json` | Dangerous 2.6, Deadly 2.25 | A point of the death sample, R2. Not the pick: Deadly is free on nine floors and Dangerous out-hits Deadly |
| `bp-tiers-dangerous-3000-deadly-2500.json` | Dangerous 3.0, Deadly 2.5 | A point of the death sample, R2. Not the pick: Dangerous is deadlier than Deadly on two grounds |
| `bp-armor-curve-240.json` | Armor fades 2.4 times as fast against the attacker's Level | A probe. PROVISIONAL, section 3.6 |

The Blessing ladder's 2 hours has no patch. Its rungs live in `progression-grid.mjs`, which a patch cannot reach.

## 7. For Tyler

Four items. Each bends or leans on something you ruled.

1. **The Level table is now timed on the four on Dangerous.** You ruled the table as the clock of a four on the hardest tier it holds, and you ruled Deadly a tier you watch or gamble on. Put together, the four that is left alone is the clock. **What it costs:** a four that farms Deadly safely runs 18% ahead of your table. It reaches Krell on day 24 and Level 400 on day 326, so the next region must be ready sooner. The other choice keeps the clock on Deadly and leaves every idle four 24% behind your table, at Level 400 on day 472.
2. **Neither harder tier can hold your death count at every Level.** You ruled 10 to 30 deaths in 1,000 hours on Dangerous and 50 to 100 on Deadly. The engine gives a cliff. A four is safe or it wipes, and the ruled count is the thin line between. I sized Deadly so a four meets that line when it arrives in a band and is safe by the band's top. All cells together read 41 on Deadly and 4 on Dangerous. **What it costs:** for the upper part of each band Deadly is safe XP for a mid four, 20 to 29% over Dangerous, and Dangerous is safe inside its band from about Level 10. Lifting Dangerous to its count would make it hit harder than Deadly, which turns the tiers upside down on grounds with shooters. Holding a steady count on both would need the party-wide damage of your 2026-11-08 ruling built into the tiers, which is new work.
3. **Your own four dies together.** Your default for an account's own heroes is that the rest hunt on when one falls. Measured, when the front fell the other three died in the same hunt every time. **What it costs:** four death penalties for each wipe where "all come home" would cost one. The hunting time lost is the same either way. Turning the default on for a four with one front hero would cut the XP cost of Deadly by about three quarters.
4. **The paid edge is smaller in pace than the book told you, and it is a step.** You said yes on the page to a ceiling of 1.65 and about 1.22 from paying alone. Measured, every cap full is 1.29 to 1.48 and paying alone is about 1.06 to 1.08 in Level pace. What a payer really gets is the next tier some Levels sooner, worth 20 to 29%. **What it costs:** nothing to change. But "pay to level 22% faster" is not a true line, and the test Crowns in the playtest should watch for what payers actually buy.

## 8. For the integrator

Chapters 00 to 11 are not edited here. These are the edits this pass asks for.

| Where | Edit |
|---|---|
| `01-core-and-combat.md`, the tier numbers and CORE-1 | Dangerous pull 5 and blows 2.5. Deadly pull 8 and blows 2.5. One blow number for both. Status MEASURED on the fixed tool, with the death count on each ground still PROVISIONAL. Add the cliff, and the ladder inside each ground. The four together beats the same four split at 28 of 29 checkpoints |
| `01`, GR-27 | Dangerous brings five holds. Its blow number changes |
| `01`, the party roles and section 2.4 | The front hero takes 92 to 100% on nine of 14 grounds. The shield and the hammer hold alike at the armor cap. Add section 4.1's third point as an open design: group damage as a tier row |
| `05-progression.md`, 2.2 to 2.6 | The Level law's seat is the four on Dangerous, 1.266. Level 100 at 516 hours, Krell on day 33, Level 400 on day 400. The ladder's threshold is 2 hours, with rungs near 74, 98, 161, 248 and 387. Deadly's lost hours are measured at 16 to 34% |
| `05`, GR-6, GR-6a, GR-6b, GR-7 | Their numbers move as above. They stay PROVISIONAL on the playtest death rate only |
| `03-items-and-crafting.md`, GR-4 | +17% is MEASURED for weapons. Armor on the curve is worth nothing past Level 30. The armor curve probe and the arrival kit are one open item. Best gear is about 7% faster than mid, not 15% |
| `04-economy-and-crowns.md`, CE-5 and 2.3 | The measured account-day by Level, and typed deeds 8 to 12 times under CE-5's sizes |
| `04` and `06-mmo-layer.md`, MM-26, MM-31 | The readings: 1.29 to 1.48 with every cap full, about 1.06 to 1.08 from paying alone. The edge is a step to the next tier. Drop check G's last clause |
| `06`, MM-25 and CORE-4 | The built damage cut does nothing for a capped hero, measured. The rating row is owed before any protection buff is sold or earned |
| `11-on-call-and-clan-xp.md`, 2.2 and 2.4 | The Library is the strongest room for a four's Level pace. The War room's +5% damage is about 1% of pace |
| `10-level-choices.md`, section 8 and 12 | TL1 holds. TL2 misses under Level 185. On the edge of a tier a build decides who lives. The unlocks are still unmodelled |
| `08-player-experience.md`, the first hour | The arrival kit takes 2.2 to 2.8 times the mid kit's damage under Level 45. A new four on the Sewer wipes on either harder tier at Level 5 at the new dials |
| `decisions/all.json` | CORE-1, GR-27, GR-4, GR-5, GR-6, GR-6a, GR-6b, GR-7, MM-25, MM-26, MM-31, TAL-1, CE-5: evidence and numbers as above. No new row |
| `tools/balance-program/proposals.json` | Three rows for the matrix lane: the tier patch, the Level law seat and the gear step, in place of the numbers GR-27, GR-6 and GR-4 play today |
| `00-the-game.md`, section 1 | "Deadly is the best way only for a four that is watched" becomes true only with the 2 hour ladder |

## 9. Tool gaps and one bug found on the way

These are NOT MODELLED or wrong in the tool today. None is fixed here.

| What | Seen in | Owner |
|---|---|---|
| **A strong four's hunt ends with "No hits landed".** On the Muster Barrows on Deadly, at Levels 60 and 75, every seed of the four ended on the no-fight rule with no death. The four hunted 5 to 52% of the time offered. On Wyvern Roost on Dangerous, once the bow died the other three landed no hit and the hunt ended | R0, R2 (16 of 16 ends at Level 75) | The systems engineer. If the game does this for a real four it is a player-visible bug. Level 60's four cell is unreadable until it is fixed |
| The derivation of the Level law takes a median, so the seat does not land the ruled points | Section 3.5 | The matrix lane |
| The death sample has no workflow. This pass ran it from throwaway branches | Section 1 | The matrix lane. A `balance-diff` workflow with seeds and hours as inputs would make GR-88's gate usable |
| The R0 full matrix predates the sitting's cells by one commit | Section 1 | Closed by R4 |
| Gold is an upper bound. Loot is sold to the vendor at once and coin reads 1.24 times real | Section 3.7 | The wage formula, GR-51 |
| No unlock, no Linger, no rating buff and no group-damage tier row is in a cell | Sections 3.8, 3.10, 4.1 | The build plan |
| Past Level 400 the same dial wipes every four | L | PROJECTED content. The played skill line flattens under the monsters' aim. It is GR-23's question |

## 10. What I did not check

- I ran no browser and played nothing by hand. Every number is the tool's.
- The death sample is four seeds of eight hours. A cell with no death in 128 hero-hours can still hide up to about 23 deaths in 1,000 hours.
- Dangerous has a ruled count of 10 to 30 deaths in 1,000 hours. At that rate most cells show no death in this sample, so only the pool of 3,448 hero-hours reads it.
- Pairs and threes were not sized. They are in R0 and R4 and no ruling asks for them.
- Levels 1 to 16 with four heroes were read only through the ground axis. The first hour is still unplayed.
- I did not re-derive the kill reward on the new tiers. It is measured on a lone hero on Normal, which the tiers do not touch.
- The Blessing prices, the stamina refill, the yard and every sink share were not measured. They wait on the wage formula.
