# 01. The baseline snapshot: the overhaul's starting point, pinned and measured

Deliverable 1 of the balance baseline request (Tyler, 2026-11-21). Lane `lane/bl-baseline`, systems engineer.

This is a measurement of the game the overhaul starts from. It is not an endorsement of its balance.

Labels. MEASURED names the GitHub run. COMPUTED is arithmetic on named inputs. CODE means I read it at the file named. JUDGMENT is my opinion. UNKNOWN is unknown.

---

## 0. One screen

1. **Pinned.** The overhaul's starting game, `set/v0.2.144` at `861ae52e3` (branch `baseline/overhaul-start`), measured on its own real engine with one harness laid over it. Every hash is in section 1.
2. **Played.** 1,353 cells (every way, gear state, tier, open ground and party shape in live content, plus 72 cells past it), 8 seeds each, 10,856 seed jobs, 89,777 hunted hero-hours, 120,729 worker-seconds on 24 GitHub shards. Zero errors, zero tool reds. MEASURED, GitHub run 44985081080 (the pin).
3. **Reproducible.** One push re-runs it. Sixteen cells played twice in fresh workers in opposite orders came out byte-identical, and identical to the same seeds the shards played on other runners. And the whole run reproduces: two full runs of the pinned game three and a half hours apart on different runners (44968825479 and 44971284989) agree in all 1,353 cells, every one of 573,672 seed values, every view and the calibration.
4. **Noisy where it should be, quiet where it should be.** A cell's Level XP, kills, DPS and coin carry a median relative error of 0.1 to 0.3%, so one cell against another resolves a 1% move. Gold net of the store resolves 4%, rare drops about 47%, and deaths are read only as pooled Poisson counts.
5. **What the measurements say** (MEASURED, not an endorsement):
   - Alone, MID, Normal, Level 1 to 110 takes 425 hours as a mage and 597 as a shield tank (the hammer 510). The standard four takes 738 hours from Level 5.
   - A lone hero never died on Normal in 9,255 hero-hours at any gear. On Dangerous it died 545 times in 1,000 hours in LOW gear, 108 in MID and 43 in BIS. On Deadly, 1,706, 321 and 176.
   - Parties barely die at all: the standard four died twice in 12,478 hero-hours across every tier and gear, the three never, the pairs 8 times in 1,167 hours on Deadly.
   - At Levels 30 and 110 the ways spread from 0.87 to 1.29 times the median way's DPS. The mage leads at every spine Level but 15, and the shield tank and the healer trail.
   - A four makes 0.50 of a lone hammer's Level XP a head on Normal at Level 30 and 110, and 1.63 at Level 60, where the game advises it a different ground (Muster Barrows).
   - MID over LOW gear is worth 4 to 30% Level XP and BIS over MID 0 to 13%. The armor step buys no pace (1.00) and only safety.
   - Past Level 110 (not live) a lone hero on Deadly died in every seed within minutes at 145, 185, 300 and 400.
6. **Calibrated thinly.** Against real fours' recorded Deadly hunts the sim reads 0.82 to 1.24 of real kills, 0.72 to 1.04 of real XP and 0.63 to 1.23 of real coin (C-2, section 7).

---

## 1. The pin

**The game.** Branch `baseline/overhaul-start`, which is `set/v0.2.144` frozen at `861ae52e39d777e5c21abbbd8a8d2104e47089c0` (Tyler, 2026-11-21: "the starter baseline we are going to use for the overhaul"). It holds both engine fixes that blocked measurement (FB-1's stall fix 02364f03a and the null-kill fix 15c0a550c), the staged 0.2.144 work, the rested bank's removal, four heroes from the start and the social layer. It does not hold FB-8's gear and armor candidate. It is played as it stands, with no proposal base (`--base today`).

| What | Value (MEASURED, the results manifest of run 44985081080) |
|---|---|
| Game commit | `861ae52e39d777e5c21abbbd8a8d2104e47089c0` (its build stamp still reads 0.2.143: the set's version bump comes at release) |
| Harness commit (the instrument) | `3656bad01` on `lane/bl-baseline` (section below) |
| `src/data/**` | 213 files, sha256 `cb93aa72248c3f6c...` |
| Engine (`src/core/**`) | 63 files, `b513e6bd0f73416d...` |
| Edge settle (`supabase/functions/hr-accrue/**`) | 40 files, `1d347aa59cae0fd0...` |
| Server catalogues (`supabase/migrations/*.generated.sql`) | 289 files, `3c35f992e77bbccc...` |
| Configuration | `563ea54e07a078b1...` over the build stamp, the combat constants (`COMBAT_BALANCE`), the tier dials (`hunt-tiers.js` DIALS and GROUND_TIERS) and every `live:` switch in `src/data` (fists off, Necrotic and Storm off, patterns off, monster spells on, item effects on) |
| `supabase/config.toml` | `0ea680c278ee7f88...` |
| The designer's staged item lines (`tools/balance-sim/staged`) | 9 files, `7e13eca6f4336650...` |
| `standards.mjs` | `f1f49097244dcb3a...`, last changed in commit `f06b79dc1` |
| Node on the runners | v20.20.2 |

Full hashes are in the results file (`node tools/balance-program/baseline.mjs --report` prints them). Hashes are over LF-normalised bytes, so a Windows checkout and a Linux runner agree.

**The instrument, and how it changed while the pin was cut.** The pinned results (GitHub run 44985081080) were measured with the harness of `lane/bl-baseline` at `3656bad01`. Two earlier full runs measured the same game commit with an earlier harness: run 44968825479 (harness `311db8f61`) and run 44971284989 (harness `29cb0aba8`, identical in every measuring file). The pinned harness corrects two faults those runs carried, and is the instrument every candidate must be measured with:

1. **A proposal inside the cell builder.** The grid's `buildCell` lays the sitting's S-5 Blessing ladder on every cell, so from Level 100 a blessed death cost half (or less) of what the game charges (the game has three Blessings, cutting a death to a quarter). The baseline now strips it from every job (`baseline/scenarios.mjs` `planHook`). This moved only cells with deaths at Level 100 and past: lone heroes on Dangerous and Deadly at 110, and the `beyond` block.
2. **A death priced by the harness** (the Lab's death-cost slot, CONFLICTS 2026-11-21). The matrix's cell metrics and the grid judge typed the death price (`standards.mjs` DEATH_COST) a second time. Both now read the tree's own `src/core/action-rules.js` `levelDeathLoss` and `src/data/blessings.js`, and refuse a data view without them. No stored baseline outcome reads those two values (the outcomes take each death's loss from the engine's own death log), but they are part of the instrument. MEASURED proof: `balance-matrix.mjs --selftest` 9m, with both typed readers caught as mutants.

The two early runs are kept as the reproduction proof (section 2). They are not the pin.

**The bands.** `tools/balance-program/standards.mjs` is recorded above because the request asks for it. By Tyler's ruling of 2026-11-21 its bands (rulings about the current game) are neither constraints nor targets for the overhaul, and nothing in this baseline is judged against them. BL-3's target specification replaces them (`08-regression.md` section 4).

---

## 2. Reproducing it

**One command** (the full run is a GitHub run, never a PC run):

```
git push origin lane/bl-baseline:refs/heads/balance-baseline/overhaul-start
```

`tools/balance-program/baseline/target.json` names the pin. `.github/workflows/balance-baseline.yml` exports `861ae52e3`, lays the harness of the pushed commit over it, plays the scenarios in 24 shards of 4 workers, runs the determinism job, and joins one results file. Then:

```
gh run download <id> --dir <dir> --name baseline-results
node tools/balance-program/baseline.mjs --report <dir>/results.json.gz
```

The committed results are `tools/balance-program/baseline/overhaul-start/results.json.gz` (`node tools/balance-program/baseline.mjs --report` prints them). The spec every run plays is `tools/balance-program/baseline/overhaul-start/spec.json`.

**Determinism.** MEASURED, run 44985081080 (and the same in runs 44968825479 and 44971284989): the determinism job played 16 cells spread across every block (seed 0, at their full hours) twice, in fresh worker pools and in opposite orders: byte-identical. The join then checked those 16 seed-0 outcome rows against the rows the shards played for the same cells on other runners: 16 of 16 identical. 

**The whole run, twice.** MEASURED: runs 44968825479 and 44971284989 played the pinned game three and a half hours apart, on different runners, with two harness commits that differ in no measuring file. All 1,353 cells, all 573,672 stored seed values, every view and both calibrations are identical (a byte compare of the two results files, cell by cell). Those two runs carried the earlier instrument (section 1), so they prove the run reproduces, and the pinned results below are the corrected instrument's.

**A harness change re-pins.** The results record the harness hash. A later harness that changes any measuring file is a new instrument: re-run the push above before comparing a candidate against it, and the compare report warns when the two hashes differ.

---

## 3. The scenarios

Every cell is a party of the engine's own weapon ways on the ground the game itself advises for that Level and party size (`src/shell/hunt-list.js` `recommendedHunt`), built by the matrix's one cell builder (`progression-grid.mjs` `buildCell`). Section 1 of `06-coverage.md` lists what a cell holds fixed.

**Where live content ends.** The pin opens 11 hunting grounds, from the Mill Cellar (Level 1) to Krell's Hold (85 to 110). Live content ends at Level 110. Four grounds are built but staged and not played as live: Carter's Rest (110 to 125), Ox Road (112 to 128), Wyvern Roost (125 to 142) and the Unmarked Catacombs (165 to 185). CODE: `src/data/hunts.js` OPEN_HUNTS, read by `baseline/scenarios.mjs` `deriveSpec`.

| Block | What | Cells |
|---|---|---:|
| pace | every way alone (tank, sword, hammer, axes, bow, crossbow, mage, healer), MID, Normal, at all 18 open checkpoints (1 to 110) | 144 |
| ways | every way alone x LOW, MID and BIS (arrival, mid and best) x Normal, Dangerous and Deadly, at the 8 spine Levels (5, 10, 15, 30, 45, 60, 88, 110) | 512 |
| four | the standard four (hammer, bow, mage, healer, the real Krell four's seats) x the three gear states x the three tiers, at the spine | 72 |
| pace4 | the standard four, MID, Normal, at every open checkpoint from Level 5 | 8 |
| parties | the two pairs (tank and mage, ranger and healer) and the three (tank, healer, mage), MID, every tier, at the spine | 72 |
| lineups | eight other fours (a shield tank in front, no healer, four mages and more), MID, Normal and Deadly, at the spine from 30 | 80 |
| steps | the lone hammer and the four with one slot class (weapon, armor or jewelry) a gear state back, Normal, at the spine from 10 | 84 |
| grounds | every open ground at the floor and the top of its band, the lone hammer, both pairs, the three and the four, every tier it has | 302 |
| c3 | check C3: the default company a new account makes, on the Millrace Sewer at Level 5, in the start kit, and two variants | 3 |
| c2 | calibration C-2: the standard four on each ground and tier real fours played, at the rows' middle Level | 4 |
| beyond | PAST LIVE CONTENT, labelled STAGED (145, 185) or PROJECTED (300, 400): every way alone and the four, MID, Normal and Deadly | 72 |
| | | **1,353** |

**Seeds and hours.** Eight seeds a cell. Each seed is one continuous hunt under the real death rule: 1 hour at Levels 1 to 9, 2 hours at 10 to 29, 4 at 30 to 59, 8 from 60 (check C3: 8). In all, 10,824 seed jobs, 52,656 party-hours and 100,536 hero-hours of play (COMPUTED from the plan).

---

## 4. What each sample size can resolve

**Deaths** are rare counts, so their resolution is set by the hero-hours a cell or a pool holds (COMPUTED, Poisson: with no death seen, the 95% upper bound is 3 deaths over the hours).

| A cell of | Levels 1 to 9 | 10 to 29 | 30 to 59 | 60 to 110 and beyond |
|---|---:|---:|---:|---:|
| hours a seed | 1 | 2 | 4 | 8 |
| hero-hours, a lone hero (8 seeds) | 8 | 16 | 32 | 64 |
| hero-hours, the four | 32 | 64 | 128 | 256 |
| no death seen: under this many in 1,000 hours, lone | 375 | 187 | 94 | 47 |
| no death seen: under this many in 1,000 hours, the four | 94 | 47 | 23 | 12 |

So a single cell reads a death rate only where deaths are common (Deadly, LOW gear). The views pool cells: the four on one tier and gear state over the 8 spine Levels holds 1,184 hero-hours (COMPUTED: 4 heroes x 8 seeds x 37 hours), which bounds a rate seen as zero under 2.5 in 1,000 hours. The previous death sample played 4 seeds of 8 hours (32 lone and 128 four hero-hours a cell). This baseline doubles that from Level 60 and plays every Level and gear state, not only the harder tiers.

A death ends that hero's hunt (the real rule), so a cell where heroes die early hunts fewer hours than it offers. Its rates are over the hours hunted. Its `huntedShare` and its Level XP after deaths (over the hours offered) say how much play the deaths took.

**Rates** (XP, kills, gold, damage) are dense, and section 5 gives what each resolves, MEASURED. **Rare drops** are the noisiest dense outcome, so they are best read pooled.

**Two caveats.** The hero levels inside a cell: section 6 gives how many Levels each spine cell's hours cover. And eight seeds share one dice table across cells (seed k is the same stream on every cell), so cells are not fully independent: a pooled view's printed error is a lower bound.

---

## 5. Run-to-run noise by outcome

Each cell's outcome is the mean of eight seeds, and its relative standard error is the seeds' spread over the square root of eight, over the mean. The table gives, over every cell, the median and the 90th percentile of that error, and the smallest change one cell against one cell can tell from noise at that median (twice the combined error of two such cells, never under 1%). MEASURED, GitHub run 44985081080.

| Outcome | Category | Median error | 90th percentile | One cell against one resolves | Cells identical across seeds |
|---|---|---:|---:|---:|---:|
| `dps` | combat | 0.13% | 1.17% | 1.0% | 0 |
| `dealtPerH` | combat | 0.13% | 1.04% | 1.0% | 0 |
| `killsPerH` | combat | 0.14% | 1.62% | 1.0% | 25 |
| `ttkS` | combat | 0.00% | 6.78% | 1.0% | 718 |
| `ttkP90S` | combat | 0.00% | 5.69% | 1.0% | 593 |
| `pullsPerH` | combat | 0.14% | 2.72% | 1.0% | 13 |
| `castsPerH` | combat | 0.17% | 1.12% | 1.0% | 4 |
| `takenPerH` | survival | 0.79% | 3.44% | 2.2% | 0 |
| `frontTakenShare` | survival | 0.13% | 0.47% | 1.0% | 143 |
| `monsterLandedPct` | survival | 0.53% | 2.64% | 1.5% | 0 |
| `dmgPerMonsterSwing` | survival | 0.89% | 3.83% | 2.5% | 0 |
| `healInPerH` | survival | 3.64% | 26.29% | 10.3% | 322 |
| `healOutPerH` | survival | 2.06% | 26.54% | 5.8% | 1026 |
| `shieldInPerH` | survival | 0.81% | 3.86% | 2.3% | 697 |
| `regenPerH` | survival | 0.72% | 2.78% | 2.0% | 4 |
| `sustainRatio` | survival | 0.02% | 1.99% | 1.0% | 72 |
| `deaths` | survival | 0.00% | 65.47% | 1.0% | 1248 |
| `deathsPer1000h` | survival | 36.84% | 100.00% | 104.2% | 1054 |
| `huntedShare` | survival | 0.00% | 27.27% | 1.0% | 1032 |
| `lowHpP50` | survival | 0.14% | 5.54% | 1.0% | 30 |
| `lowHpP10` | survival | 0.29% | 19.02% | 1.0% | 0 |
| `lowHpP01` | survival | 0.91% | 24.72% | 2.6% | 0 |
| `hpUnder30` | survival | 21.45% | 65.47% | 60.7% | 926 |
| `hpUnder10` | survival | 49.86% | 100.00% | 141.0% | 1064 |
| `closeCallsPer12h` | survival | 14.21% | 65.54% | 40.2% | 891 |
| `coinPerH` | economy | 0.33% | 2.51% | 1.0% | 0 |
| `lootPerH` | economy | 2.13% | 9.89% | 6.0% | 2 |
| `incomePerH` | economy | 0.74% | 4.09% | 2.1% | 0 |
| `raresValuePerH` | economy | 19.33% | 61.01% | 54.7% | 131 |
| `storePerH` | economy | 0.44% | 6.34% | 1.3% | 58 |
| `blessingGoldPerH` | economy | 33.60% | 76.77% | 95.0% | 1113 |
| `netPerH` | economy | 1.40% | 11.85% | 4.0% | 0 |
| `netWithRaresPerH` | economy | 1.52% | 12.14% | 4.3% | 0 |
| `storeShare` | economy | 0.99% | 8.99% | 2.8% | 55 |
| `suppliesPerH` | economy | 0.28% | 3.32% | 1.0% | 56 |
| `foodPerH` | economy | 7.55% | 65.47% | 21.4% | 650 |
| `manaPotionsPerH` | economy | 0.67% | 9.27% | 1.9% | 519 |
| `manaSpentPerH` | economy | 0.21% | 1.30% | 1.0% | 4 |
| `rareItemsPerH` | economy | 16.49% | 48.80% | 46.7% | 131 |
| `rareRollsPerPartyH` | economy | 10.85% | 23.90% | 30.7% | 828 |
| `levelXpPerH` | progression | 0.13% | 2.12% | 1.0% | 13 |
| `netLevelXpPerH` | progression | 0.13% | 15.81% | 1.0% | 13 |
| `hoursPerLevel` | progression | 0.12% | 21.00% | 1.0% | 6 |
| `xContract` | progression | 0.13% | 2.12% | 1.0% | 9 |
| `mainSkillXpPerH` | progression | 0.18% | 1.69% | 1.0% | 0 |
| `defenseXpPerH` | progression | 0.25% | 2.30% | 1.0% | 44 |
| `meleeXpPerH` | progression | 0.21% | 1.42% | 1.0% | 464 |
| `rangedXpPerH` | progression | 0.23% | 1.47% | 1.0% | 858 |
| `magicXpPerH` | progression | 0.33% | 5.74% | 1.0% | 87 |
| `levelXpLostPerH` | progression | 0.46% | 66.30% | 1.3% | 1050 |
| `deathTax` | progression | 41.11% | 100.00% | 116.3% | 1053 |

How to read it. A median error of 0.13% means half the cells hold that outcome to within 0.13% of its true mean, so one cell against another tells a 1% move from noise. Death counts, time under 30% or 10% health, close calls, rare drops and Blessing gold are rare events: most cells see none (the last column), so a cell cannot read them. Read them pooled (the deaths views of section 6, Poisson counts over thousands of hero-hours). The 90th percentile is high for Level XP after deaths and hours a Level because a few cells (lone heroes on Deadly) lose seeds to deaths early.

---

## 6. The measurements, by category

All MEASURED on GitHub run 44985081080 unless marked. Every value is a mean of eight seeds. A rate is a hunted hero-hour unless it says party-hour. Gold is the engine's vendor value (an upper bound, `06-coverage.md` 2.3).

### 6.1 Combat performance

Party damage a hunted second (DPS), alone, MID, Normal (the four: the whole party):

| Way | 5 | 10 | 15 | 30 | 45 | 60 | 88 | 110 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tank | 2.41 | 2.75 | 3.43 | 6.48 | 7.98 | 10.27 | 15.24 | 15.77 |
| sword | 2.50 | 3.07 | 3.67 | 7.22 | 8.68 | 11.33 | 16.84 | 17.42 |
| hammer | 2.50 | 3.17 | 3.75 | 7.25 | 9.18 | 11.27 | 18.57 | 18.98 |
| axes | 2.44 | 2.75 | 3.55 | 6.87 | 8.30 | 9.97 | 15.98 | 16.44 |
| bow | 2.70 | 3.04 | 3.54 | 7.82 | 8.98 | 12.46 | 18.36 | 19.01 |
| crossbow | 2.71 | 3.08 | 3.57 | 7.80 | 8.73 | 11.92 | 17.67 | 18.18 |
| mage | 2.99 | 3.46 | 3.71 | 8.63 | 10.10 | 14.55 | 22.24 | 22.51 |
| healer | 2.30 | 2.57 | 3.12 | 6.29 | 7.58 | 10.04 | 16.01 | 16.27 |
| the four | 12.00 | 13.84 | 16.60 | 9.78 | 14.38 | 63.34 | 26.54 | 26.60 |

Kills a party-hour, alone, MID, Normal:

| Way | 5 | 10 | 15 | 30 | 45 | 60 | 88 | 110 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tank | 440 | 487 | 607 | 500 | 346 | 432 | 327 | 339 |
| sword | 458 | 543 | 649 | 557 | 376 | 477 | 360 | 373 |
| hammer | 458 | 562 | 664 | 559 | 398 | 474 | 397 | 406 |
| axes | 447 | 486 | 628 | 530 | 360 | 420 | 342 | 352 |
| bow | 493 | 538 | 627 | 603 | 389 | 524 | 392 | 406 |
| crossbow | 497 | 545 | 632 | 601 | 378 | 502 | 377 | 388 |
| mage | 548 | 613 | 656 | 666 | 438 | 612 | 475 | 481 |
| healer | 421 | 456 | 553 | 485 | 328 | 423 | 342 | 347 |
| the four | 474 | 547 | 655 | 754 | 624 | 706 | 570 | 571 |

Each way's DPS over the median way at the same Level (MID, Normal): at 30 the healer reads 0.87, the tank 0.90, the mage 1.20. At 110 the tank reads 0.91, the healer 0.93, the mage 1.29.

### 6.2 Survivability

Deaths in 1,000 hunted hero-hours, pooled over every Level of the frame (deaths, then hero-hours hunted):

| Party | Tier | LOW | MID | BIS |
|---|---|---:|---:|---:|
| alone | normal | 0.0 (0 in 2,368) | 0.0 (0 in 4,519) | 0.0 (0 in 2,368) |
| alone | dangerous | 544.5 (359 in 659) | 107.5 (160 in 1,489) | 43.2 (85 in 1,968) |
| alone | deadly | 1,705.5 (443 in 260) | 321.0 (279 in 869) | 175.8 (210 in 1,195) |
| the four | normal | 0.0 (0 in 1,952) | 0.0 (0 in 2,240) | 0.0 (0 in 1,184) |
| the four | dangerous | 0.8 (1 in 1,183) | 0.0 (0 in 1,184) | 0.0 (0 in 1,184) |
| the four | deadly | 0.8 (1 in 1,183) | 0.0 (0 in 1,184) | 0.0 (0 in 1,184) |
| the pairs | normal | - | 0.0 (0 in 1,184) | - |
| the pairs | dangerous | - | 0.0 (0 in 1,184) | - |
| the pairs | deadly | - | 6.9 (8 in 1,167) | - |
| the three | normal | - | 0.0 (0 in 888) | - |
| the three | dangerous | - | 0.0 (0 in 888) | - |
| the three | deadly | - | 0.0 (0 in 888) | - |


Damage taken a hunted hero-hour, alone, MID, Normal (the four: a head):

| Way | 5 | 10 | 15 | 30 | 45 | 60 | 88 | 110 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tank | 3,545 | 3,332 | 1,884 | 14k | 22k | 26k | 50k | 44k |
| sword | 4,140 | 4,110 | 2,415 | 16k | 26k | 30k | 54k | 49k |
| hammer | 4,335 | 3,880 | 2,215 | 16k | 24k | 29k | 52k | 47k |
| axes | 3,753 | 4,235 | 2,481 | 16k | 25k | 31k | 55k | 50k |
| bow | 2,594 | 2,552 | 1,570 | 10k | 16k | 20k | 34k | 32k |
| crossbow | 2,175 | 2,164 | 1,201 | 9,067 | 15k | 18k | 33k | 30k |
| mage | 1,806 | 2,338 | 1,103 | 7,730 | 11k | 14k | 22k | 23k |
| healer | 1,228 | 1,651 | 995 | 5,061 | 8,709 | 9,041 | 15k | 15k |
| the four | 1,473 | 953 | 430 | 781 | 1,190 | 3,531 | 1,710 | 1,876 |

The front seat's share of the four's damage (MID): normal 0.93, 0.90, 0.86, 1.00, 1.00, 0.72, 0.97, 0.98. dangerous 0.93, 0.91, 0.87, 0.99, 1.00, 0.93, 0.71, 0.71. deadly 0.94, 0.92, 0.88, 0.93, 1.00, 0.94, 0.70, 0.70 (at Levels 5, 10, 15, 30, 45, 60, 88, 110).

The worst tenth of fights' lowest health, alone, MID: normal 0.84 / 0.83 / 0.81, dangerous 0.34 / 0.19 / 0.30, deadly 0.18 / 0.04 / 0.16 (the hammer at 30 / 60 / 110, a share of max health).

### 6.3 Resource economy

Net gold a hunted hero-hour (vendor value, less store and Blessings), alone, MID, Normal (the four: a head):

| Way | 5 | 10 | 15 | 30 | 45 | 60 | 88 | 110 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tank | 2,427 | 3,717 | 4,892 | 9,785 | 12k | 14k | 21k | 22k |
| sword | 2,503 | 4,144 | 5,168 | 11k | 13k | 16k | 24k | 25k |
| hammer | 3,098 | 4,834 | 5,802 | 11k | 14k | 16k | 29k | 30k |
| axes | 2,609 | 3,818 | 5,000 | 10k | 12k | 14k | 25k | 25k |
| bow | 805 | 2,066 | 3,330 | 9,538 | 6,126 | 4,943 | 13k | 9,039 |
| crossbow | 2,812 | 4,100 | 5,068 | 11k | 13k | 16k | 25k | 26k |
| mage | 2,095 | 3,425 | 1,313 | 6,967 | 7,690 | 1,919 | 16k | 17k |
| healer | 1,981 | 2,966 | 2,749 | 6,499 | 7,025 | 4,752 | 16k | 16k |
| the four | 2,440 | 3,197 | 3,796 | 2,994 | 3,364 | 7,128 | 6,319 | 5,598 |

Net gold a hero-hour, the mean of the MID cells of each band, alone and the four:

| Who | Tier | Levels 1 to 29 | 30 to 59 | 60 to 110 |
|---|---|---:|---:|---:|
| alone (every way) | normal | 3,848 | 9,891 | 19k |
| alone (every way) | dangerous | 2,862 | -18k | -38k |
| alone (every way) | deadly | 2,307 | -47k | -90k |
| the four | normal | 2,913 | 3,380 | 6,386 |
| the four | dangerous | 2,728 | 9,689 | 14k |
| the four | deadly | 2,427 | 9,385 | 14k |

Store gold over gold in, same frame: alone normal 0.26 / 0.20 / 0.25, dangerous 0.38 / 1.57 / 2.07, deadly 0.51 / 3.17 / 3.47. the four normal 0.32 / 0.40 / 0.42, dangerous 0.38 / 0.30 / 0.41, deadly 0.43 / 0.35 / 0.43.

### 6.4 Progression

Level XP a hunted hero-hour, alone, MID, Normal (the four: a head):

| Way | 5 | 10 | 15 | 30 | 45 | 60 | 88 | 110 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tank | 22k | 33k | 42k | 101k | 243k | 294k | 590k | 611k |
| sword | 23k | 37k | 45k | 113k | 264k | 324k | 650k | 672k |
| hammer | 23k | 39k | 46k | 114k | 279k | 323k | 716k | 732k |
| axes | 22k | 33k | 43k | 108k | 252k | 285k | 616k | 634k |
| bow | 25k | 37k | 43k | 122k | 273k | 356k | 706k | 732k |
| crossbow | 25k | 37k | 43k | 122k | 265k | 341k | 680k | 699k |
| mage | 27k | 42k | 45k | 135k | 307k | 416k | 856k | 866k |
| healer | 21k | 31k | 38k | 99k | 230k | 287k | 615k | 625k |
| the four | 45k | 52k | 62k | 56k | 161k | 527k | 380k | 381k |

Hours for the next Level (after deaths), alone, MID, Normal:

| Way | 5 | 10 | 15 | 30 | 45 | 60 | 88 | 110 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tank | 0.29 | 1.92 | 2.09 | 3.41 | 3.66 | 6.60 | 7.39 | 10.54 |
| sword | 0.28 | 1.72 | 1.96 | 3.06 | 3.37 | 5.98 | 6.71 | 9.58 |
| hammer | 0.28 | 1.66 | 1.91 | 3.05 | 3.19 | 6.01 | 6.09 | 8.80 |
| axes | 0.29 | 1.92 | 2.02 | 3.22 | 3.52 | 6.79 | 7.08 | 10.16 |
| bow | 0.26 | 1.73 | 2.03 | 2.83 | 3.25 | 5.44 | 6.17 | 8.80 |
| crossbow | 0.26 | 1.71 | 2.01 | 2.83 | 3.35 | 5.68 | 6.41 | 9.21 |
| mage | 0.23 | 1.52 | 1.94 | 2.56 | 2.89 | 4.66 | 5.09 | 7.43 |
| healer | 0.31 | 2.05 | 2.30 | 3.51 | 3.86 | 6.74 | 7.08 | 10.30 |
| the four | 0.14 | 1.24 | 1.41 | 6.16 | 5.50 | 3.68 | 11.48 | 16.92 |

Hours from Level 1 to 110, MID, Normal (COMPUTED from the measured rates along the Level line, section 3 of 08 names the rule):

| tank | sword | hammer | axes | bow | crossbow | mage | healer | the four (from 5) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 597 | 542 | 510 | 577 | 493 | 511 | 425 | 592 | 738 |

### 6.5 Equipment value

Level XP and damage taken, each gear state over the one below, Normal:

| Who | Level | XP MID/LOW | XP BIS/MID | taken MID/LOW | taken BIS/MID |
|---|---:|---:|---:|---:|---:|
| hammer | 10 | 1.08 | 1.16 | 0.41 | 0.62 |
| hammer | 30 | 1.25 | 1.10 | 0.72 | 0.81 |
| hammer | 60 | 1.21 | 1.08 | 0.79 | 0.85 |
| hammer | 110 | 1.07 | 1.09 | 0.91 | 0.89 |
| mage | 10 | 1.07 | 1.05 | 0.49 | 0.65 |
| mage | 30 | 1.26 | 1.05 | 0.55 | 0.81 |
| mage | 60 | 1.23 | 1.05 | 0.71 | 0.87 |
| mage | 110 | 1.04 | 1.06 | 0.96 | 0.91 |
| healer | 10 | 1.23 | 1.10 | 0.40 | 0.58 |
| healer | 30 | 1.30 | 1.13 | 0.37 | 0.65 |
| healer | 60 | 1.22 | 1.12 | 0.49 | 0.76 |
| healer | 110 | 1.06 | 1.11 | 0.86 | 0.73 |
| four | 10 | 1.14 | 1.14 | 0.38 | 0.58 |
| four | 30 | 1.02 | 1.00 | 0.67 | 0.76 |
| four | 60 | 1.20 | 1.04 | 0.59 | 0.63 |
| four | 110 | 1.01 | 1.01 | 0.90 | 0.88 |

One slot class a state back, the lone hammer (the full set over the set with that one class a state back, so a Level XP of 1.06 means the class adds 6%, and a damage taken of 0.95 means it saves 5%):

| Step | Level | Level XP | DPS | damage taken |
|---|---:|---:|---:|---:|
| step:weapon | 30 | 1.06 | 1.06 | 0.96 |
| step:weapon | 60 | 1.09 | 1.09 | 0.94 |
| step:weapon | 110 | 1.00 | 1.00 | 1.00 |
| step:armor | 30 | 1.00 | 1.00 | 0.95 |
| step:armor | 60 | 1.00 | 1.00 | 1.00 |
| step:armor | 110 | 1.00 | 1.00 | 0.96 |
| mid-step:jewelry | 30 | 1.13 | 1.13 | 0.89 |
| mid-step:jewelry | 60 | 1.09 | 1.09 | 0.92 |
| mid-step:jewelry | 110 | 1.06 | 1.06 | 0.95 |
| bis-step:weapon | 30 | 1.00 | 1.00 | 1.00 |
| bis-step:weapon | 60 | 1.00 | 1.00 | 1.00 |
| bis-step:weapon | 110 | 1.01 | 1.01 | 0.99 |
| bis-step:armor | 30 | 1.00 | 1.00 | 1.00 |
| bis-step:armor | 60 | 1.00 | 1.00 | 1.00 |
| bis-step:armor | 110 | 1.01 | 1.01 | 0.99 |
| bis-step:jewelry | 30 | 1.03 | 1.03 | 0.97 |
| bis-step:jewelry | 60 | 1.03 | 1.03 | 0.98 |
| bis-step:jewelry | 110 | 1.03 | 1.03 | 0.98 |

### 6.6 Hunting ground viability

The standard four (party of 4) and the lone hammer on every open ground, MID, the mean of its two band ends: Level XP over the pace contract, and net gold a hero-hour:

| Ground | Band | four Normal | four Dangerous | four Deadly | lone Normal | lone Dangerous | lone Deadly |
|---|---|---:|---:|---:|---:|---:|---:|
| coppercap_warrens | 32 to 50 | 1.73 / 3,850 | 2.91 / 6,423 | 3.10 / 5,290 | 1.67 / 9,675 | 2.51 / -24k | 2.56 / -54k |
| hasks_ford | 45 to 60 | 0.78 / 3,560 | 2.88 / 14k | 3.14 / 13k | 1.39 / 15k | 2.93 / -42k | 3.02 / -88k |
| krells_hold | 85 to 110 | 0.82 / 5,691 | 2.33 / 15k | 2.61 / 14k | 1.50 / 28k | 2.42 / -70k | 2.54 / -145k |
| meadowbrook_thicket | 5 to 15 | 0.80 / 896 | 0.85 / 845 | 0.86 / 821 | 1.45 / 3,991 | 1.53 / 3,704 | 1.54 / 3,087 |
| mill_cellar | 1 to 8 | - | - | - | 3.84 / 2,158 | - | - |
| millrace_sewer | 5 to 25 | 2.45 / 3,175 | 2.53 / 2,729 | 2.68 / 2,411 | 2.62 / 8,111 | 2.59 / 6,905 | 2.66 / 5,771 |
| mosslight_glade | 16 to 31 | 0.84 / 2,825 | 1.93 / 5,515 | 2.59 / 6,183 | 1.50 / 10k | 1.97 / -2,106 | 2.08 / -20k |
| muster_barrows | 55 to 75 | 1.91 / 4,799 | 2.86 / 8,512 | 3.13 / 7,425 | 1.89 / 13k | 2.35 / -22k | 2.51 / -67k |
| pyre_field | 70 to 90 | 0.88 / 7,483 | 2.23 / 18k | 2.48 / 17k | 1.49 / 29k | 2.43 / -32k | 2.65 / -83k |
| the_slake | 50 to 65 | 0.73 / 3,549 | 2.84 / 14k | 3.14 / 14k | 1.29 / 15k | 2.52 / -100k | 2.41 / -178k |
| wickstead | 8 to 18 | 0.61 / 1,184 | 0.66 / 1,088 | 0.75 / 1,052 | 1.33 / 5,246 | 1.39 / 4,956 | 1.56 / 4,367 |

Deaths on the grounds, pooled: the four 0 in 8,736 hero-hours over every ground and tier, the lone hammer normal 0 in 732, dangerous 43 in 521, deadly 93 in 264.

### 6.7 Solo and party performance

Level XP a head over the lone hammer at the same Level and tier, MID:

| Party | Tier | 5 | 10 | 15 | 30 | 45 | 60 | 88 | 110 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| the four | normal | 1.94 | 1.34 | 1.36 | 0.50 | 0.58 | 1.63 | 0.53 | 0.52 |
| the four | deadly | 1.99 | 1.23 | 1.28 | 0.99 | 1.10 | 1.28 | 1.00 | 0.94 |
| the three | normal | 2.01 | 1.38 | 1.53 | 0.65 | 0.69 | 1.72 | 0.70 | 0.68 |
| the three | deadly | 2.03 | 1.25 | 1.36 | 1.01 | 1.03 | 1.11 | 0.99 | 0.95 |
| tank and mage | normal | 2.19 | 1.50 | 1.71 | 0.85 | 0.86 | 1.79 | 0.89 | 0.88 |
| tank and mage | deadly | 2.15 | 1.33 | 1.50 | 1.04 | 1.12 | 1.11 | 1.06 | 1.02 |
| bow and healer | normal | 1.87 | 1.33 | 1.48 | 0.81 | 0.80 | 1.65 | 0.83 | 0.83 |
| bow and healer | deadly | 1.84 | 1.19 | 1.29 | 1.03 | 1.01 | 1.12 | 0.95 | 0.96 |

### 6.8 Long-term scaling

At Level 110 over at Level 30, MID, Normal: hours a Level tank 3.09, sword 3.13, hammer 2.89, axes 3.16, bow 3.11, crossbow 3.25, mage 2.90, healer 2.93, four 2.75. Damage taken an hour tank 3.20, sword 3.11, hammer 3.01, axes 3.12, bow 3.14, crossbow 3.30, mage 2.97, healer 3.04, four 2.40. Net gold an hour tank 2.22, sword 2.26, hammer 2.65, axes 2.42, bow 0.95, crossbow 2.27, mage 2.42, healer 2.52, four 1.87.

PAST LIVE CONTENT (the beyond block: STAGED grounds at 145 and 185, a PROJECTED placeholder ground at 300 and 400, none of it live), hours for the next Level, MID, Normal:

| Way | 145 | 185 | 300 | 400 |
|---|---:|---:|---:|---:|
| tank | 12.3 | 11.3 | 11.0 | 19.8 |
| sword | 10.9 | 10.2 | 9.9 | 17.8 |
| hammer | 10.1 | 9.3 | 8.7 | 15.2 |
| axes | 11.0 | 11.0 | 10.5 | 18.7 |
| bow | 8.8 | 9.3 | 8.9 | 16.1 |
| crossbow | 9.5 | 10.1 | 9.3 | 16.6 |
| mage | 7.9 | 8.8 | 8.5 | 15.3 |
| healer | 11.4 | 12.7 | 11.8 | 21.3 |
| four | 13.5 | 13.2 | 11.9 | 20.6 |

On Deadly past 110 every seed of 31 of the 32 lone cells died, within 11 minutes of hunting on average in the slowest of them (healer at 145 lost 4 of 8). The four died 0 times in 1,024 hero-hours there.

### 6.9 Check C3 and the hero inside a cell
- c3-club (hammer, tank, healer, bow), Level 5, the Millrace Sewer, start kit, Normal: 0 deaths in 256 hero-hours, 40k Level XP a hero-hour, worst tenth of fights' lowest health 0.68.
- c3-no-healer (hammer, tank, hammer, bow), Level 5, the Millrace Sewer, start kit, Normal: 0 deaths in 256 hero-hours, 39k Level XP a hero-hour, worst tenth of fights' lowest health 0.39.
- c3-wand (mage, tank, healer, bow), Level 5, the Millrace Sewer, start kit, Normal: 0 deaths in 256 hero-hours, 42k Level XP a hero-hour, worst tenth of fights' lowest health 0.70.

Levels a lone MID hammer gains inside its own cell (COMPUTED: hours played over hours a Level): 1: 14.3, 3: 3.0, 5: 3.6, 7: 1.2, 10: 1.2, 15: 1.0, 20: 1.2, 25: 0.9, 30: 1.3, 35: 0.9, 40: 0.7, 45: 1.3, 50: 1.0, 60: 1.3, 75: 1.4, 88: 1.3, 100: 1.1, 110: 0.9.

---

## 7. Calibration against production

**The one real four at Krell's Hold** (one player, one day, Deadly, Level 79, 39 hero-hours, docs/design/balance-program/11-krell-hunt-2026-11-20.md), against the matrix's four at Level 85 on this pin. MEASURED, run 44985081080, 8 seeds of 2 hours:

| Reading | Real | The harness four | Four over real |
|---|---:|---:|---:|
| Kills a party-hour | 1,251 | 1,481 | 1.18 |
| Level XP a hero-hour | 1,001,000 | 1,183,722 | 1.18 |
| Coin a hero-hour | 15,100 | 17,767 | 1.18 |
| Store gold a hero-hour | 10,600 | 11,812 | 1.11 |
| Share of the damage, front seat | 0.691 | 0.663 | 0.96 |
| Share of the damage, healer | 0.285 | 0.323 | 1.13 |
| Damage taken an hour, front seat | 118,700 | 76,885 | 0.65 |
| Deaths | 0 | 0 | |

The harness four reads about 18% fast on kills, XP and coin against that hunt, and takes about two thirds of the front seat's real damage. JUDGMENT: the four is a little faster and a little safer than the one real four was, so a survival number on Deadly leans soft. The audit's store fault (1.87 times real) is gone: the store bill now reads 1.11.

**C-2 on this pin.** The standard four on each ground and tier real fours played on Deadly (aggregates of their recorded hunts, `tools/balance-program/calibration/c2.json`), at the rows' middle Level and C-1's gear, 8 seeds of 4 or 8 hours. Sim over real (C-2's pass line is 10%):

| Ground and tier | Real fours' Levels | Real hero-hours | Gear played | Kills sim/real | XP sim/real | Coin sim/real |
|---|---|---:|---|---:|---:|---:|
| mosslight_glade deadly | 32 to 46 (played at 39) | 144 | MID | 1.243 | 0.883 | 0.936 |
| the_slake deadly | 58 to 63 (played at 61) | 14.7 | LOW | 0.816 | 0.715 | 0.631 |
| pyre_field deadly | 60 to 72 (played at 66) | 99.9 | MID | 1.143 | 0.941 | 1.052 |
| krells_hold deadly | 69 to 83 (played at 76) | 137.9 | MID | 1.188 | 1.037 | 1.234 |

Kills read 0.82 to 1.24 of real, XP 0.72 to 1.04 and coin 0.63 to 1.23. The Slake row rests on 14.7 real hero-hours, the thinnest. None of the real rows saw a death, and neither did the sim.

**C-1 and C-4** are in `06-coverage.md` section 4: the MID kit wears more armor and jewelry than real heroes under Level 15, real heroes from 45 to 64 sit one to two weapon tiers under MID, and real heroes spent 1.57 times as long on town work as hunting, none of which a cell models.

---

## 8. What the baseline does not measure

`06-coverage.md` section 2 lists every mechanic it includes, approximates or excludes, and section 3 the outcomes the request asks for that the engine or harness cannot emit. In one line: town work, the market, crafting, home-made supplies, live events, timed buffs, Talents, the Tower and boss halls, mixed-Level parties, a real player's choices, mana starvation and a supply running out are not in any cell.

---

## 9. Files

| File | What |
|---|---|
| `tools/balance-program/baseline.mjs` | the command: materialize, plan, shard, join, determinism, report, compare, the selftest |
| `tools/balance-program/baseline/scenarios.mjs` | the scenario rule and the hours |
| `tools/balance-program/baseline/outcomes.mjs` | the 51 outcomes read off each seed, and the eight categories |
| `tools/balance-program/baseline/compare.mjs` | noise, views, targets, the comparison and the reports |
| `tools/balance-program/baseline/tree.mjs` | the overlay and the manifest |
| `tools/balance-program/baseline/overhaul-start/spec.json` | the pinned scenario spec |
| `tools/balance-program/baseline/overhaul-start/results.json.gz` | the pinned results |
| `tools/balance-program/baseline/target.json` | what a push to `balance-baseline/**` measures |
| `.github/workflows/balance-baseline.yml` | the GitHub run |
| `tools/balance-program/balance-matrix.mjs` | two hooks added to `playRun` (`planHook`, `perSeed`) |
