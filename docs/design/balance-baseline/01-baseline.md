# 01. The baseline snapshot: the overhaul's starting point, pinned and measured

Deliverable 1 of the balance baseline request (Tyler, 2026-11-21). Lane `lane/bl-baseline`, systems engineer.

This is a measurement of the game the overhaul starts from. It is not an endorsement of its balance.

Labels. MEASURED names the GitHub run. COMPUTED is arithmetic on named inputs. CODE means I read it at the file named. JUDGMENT is my opinion. UNKNOWN is unknown.

---

## 0. One screen

{{ONESCREEN}}

---

## 1. The pin

**The game.** Branch `baseline/overhaul-start`, which is `set/v0.2.144` frozen at `861ae52e39d777e5c21abbbd8a8d2104e47089c0` (Tyler, 2026-11-21: "the starter baseline we are going to use for the overhaul"). It holds both engine fixes that blocked measurement (FB-1's stall fix 02364f03a and the null-kill fix 15c0a550c), the staged 0.2.144 work, the rested bank's removal, four heroes from the start and the social layer. It does not hold FB-8's gear and armor candidate. It is played as it stands, with no proposal base (`--base today`).

{{PIN}}

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

**Determinism.** {{DETERMINISM}}

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

Each cell's outcome is the mean of eight seeds, and its relative standard error is the seeds' spread over the square root of eight, over the mean. The table gives, over every cell, the median and the 90th percentile of that error, and the smallest change one cell against one cell can tell from noise at that median (twice the combined error of two such cells, never under 1%). MEASURED, {{RUNID}}.

{{NOISE}}

---

## 6. The measurements, by category

All MEASURED on {{RUNID}} unless marked. Every value is a mean of eight seeds. A rate is a hunted hero-hour unless it says party-hour. Gold is the engine's vendor value (an upper bound, `06-coverage.md` 2.3).

{{MEASUREMENTS}}

---

## 7. Calibration against production

{{CALIB}}

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
