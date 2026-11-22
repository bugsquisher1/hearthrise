# 08. The regression framework: every candidate against the whole baseline

Deliverable 8 and the regression half of Phase 7 of the balance baseline request (Tyler, 2026-11-21). Lane `lane/bl-baseline`, systems engineer.

Labels. MEASURED names the run. COMPUTED is arithmetic on named inputs. CODE means I read it at the file named. JUDGMENT is my opinion. UNKNOWN is unknown.

---

## 0. One screen

1. **One command plays a candidate** (a branch, a commit, patch files laid on a tree, or a proposal base) on the baseline's own 1,353 cells, eight seeds each, on the same engine path and the same harness, and prints it side by side with the committed baseline.
2. **The report is grouped by Tyler's eight categories:** combat performance, survivability, resource economy, progression, equipment value, hunting ground viability, solo and party performance, and long-term scaling.
3. **Every change is marked.** Against BL-3's targets (`tools/balance-program/targets.json`, read by default) where a target can be read: IMPROVEMENT (toward its range), REGRESSION (away, or a hard target newly left), TRADEOFF (both in one category). Where no target exists: plain movement, up or down, with its size against its noise. A move under the noise is reported as within noise, never as a change. Every target the baseline cannot read is listed UNREAD with its reason.
4. **Unexpected outcomes are named.** A candidate says which categories it means to move (`--intent`). A move beyond noise anywhere else reads UNEXPECTED. Every move over 10% beyond noise is listed by cell.
5. **The current game's rulings judge nothing here.** Tyler, 2026-11-21: the game is being redone, so rulings about the current game are neither constraints nor targets. A `standards.mjs` band is used only as a READER (the matrix judge's formula for a value). Its old range is never read. The range is BL-3's.
6. **First real candidate:** FB-8 stage 1 (`lane/c-pace` at `90ad526dd`), section 7.

---

## 1. The commands

**The full run, on GitHub.** The scenario list is too heavy for a PC (52,656 party-hours, 100,536 hero-hours of play a run, COMPUTED from the plan).

```
edit tools/balance-program/baseline/target.json   (game: a commit or branch, label, patch, base)
git commit -am "measure: <what>"
git push origin HEAD:refs/heads/balance-baseline/<label>
```

`.github/workflows/balance-baseline.yml` then exports the game commit, lays this branch's harness over it, plays 24 shards, runs the determinism check, joins, and compares with the committed pin. Once `main` holds the workflow, the same run is `gh workflow run balance-baseline.yml -f game=<ref> -f label=<label> [-f patch=a.json,b.json] [-f base=proposed]`. Measurement branches are never merged.

**Reading a run.**

```
gh run download <id> --dir <dir> --name baseline-results
node tools/balance-program/baseline.mjs --compare <dir>/results.json.gz [--targets <BL-3 targets.json>] [--intent equipment,survival] [--json out.json] [--all-views]
```

**A slice on this PC** (a few cells, minutes): `node tools/balance-program/baseline.mjs --local <ref> --only 30,60 --blocks four,ways [--patch a.json]`. It refuses to run unsliced.

**The baseline itself**: `node tools/balance-program/baseline.mjs --report` prints the committed pin. Re-measuring it is the push above with `target.json` as committed.

---

## 2. What is held equal, and what moves

| Held equal on both sides | How |
|---|---|
| The scenarios | the pin's `spec.json` is played by every candidate. A candidate never re-derives it, so a candidate that opens a ground or moves a band plays the same characters, and a cell whose advised ground changed is listed |
| The harness | `baseline/tree.mjs` exports the game commit and lays one checkout's harness over it (the matrix, the cell runner, the kit builder, the skill lines, the settle driver). Its hash is in each results file and the report warns if the two differ |
| The dice | seed k plays `seedBase` k on every tree |
| The engine path | `src/core/combat-sim.js` through the edge settle, the tree's own copy on each side. There is no second engine |

What moves is the game tree only: `src/**`, `supabase/**`, its fixtures, and the designer's staged item lines in `tools/balance-sim/staged` (game data that lives in a tools folder, kept as each tree's own).

---

## 3. The noise rule

A cell's outcome is the mean of its eight seeds. Its standard error is the seeds' standard deviation over the square root of eight.

- **A change counts** when it is at least twice its combined standard error (the square root of the two squared errors) and at least 1% of the baseline value.
- **Deaths** are counts. Two pooled rates are compared as Poisson rates, with a half-death floor so zero against zero reads as no change.
- **The rule is conservative.** Both trees play the same dice, so a real move is correlated across the two sides and the unpaired error overstates the noise. A small real move can read as noise. Noise does not read as a move.

What one cell against one cell can resolve, outcome by outcome, is in `01-baseline.md` section 5. Views pool many cells and resolve far smaller moves.

---

## 4. Targets: the interface for BL-3

BL-3 owns the target specification. It landed on the set as `tools/balance-program/targets.json` (`docs/design/balance-baseline/03-targets.md`): an inventory of 100 candidate targets, every one a DESIGN HYPOTHESIS until the target work picks. The compare reads that file by default (`--targets <file>` names another, `--no-targets` reads none). CODE: `baseline/compare.mjs` `loadTargets` and `fromInventory`.

**BL-3's rows.** Each row names an area, a class, a band `{ lo, hi }` and its readers. A reader that is a `standards.mjs` band id is computed by the matrix's own judge on each tree at join and stored in the results as a reader row (band, way, place, value). Only its value is kept. Its old range and status are dropped. The row's area maps to a category (pace to progression, party to solo and party, style to combat, survival and sustain to survivability, gear to equipment, supply, gold and drops to resource economy, long to long-term scaling). A reader row has no seed error of its own, so a move under 2% (`READER_MIN_REL`) is held as noise. A row whose readers are another tool's (a guard line, a table, a named standard) or MISSING, a row whose band has no number, and a row whose reader judged nothing on the baseline's cells are listed UNREAD with that reason.

**This report's own form.** For a target that reads an outcome or a view directly, the same schema takes rows of this shape:

```
{ "schema": "hearthrise.balance-targets/1", "source": "...",
  "targets": [ { "id": "T-...", "kind": "hard | soft | hypothesis", "category": "progression",
                 "on": "levelXpPerH  or  view:timeToTop",
                 "where": { "way": "hammer", "party": 1, "L": [30, 60], "gear": "mid", "tier": "normal" },
                 "lo": 1.0, "hi": null, "label": "..." } ] }
```

- `on` names a cell outcome (`baseline/outcomes.mjs`) or a view row (`view:<id>`, with `where.key` a pattern on its key).
- `where` matches cells by block, party, way (a lone way, or `four` for the standard four), styles, comp, Level or Level range, gear, tier and ground. Step and variant cells match only when named.
- A reading moves TOWARD when it moved beyond noise and its distance outside the range shrank, AWAY when it grew. A hard target that was met and now is not is named HARD TARGET NEWLY OUT. A target with nothing to read is listed UNREAD, never passed.
- Category verdicts: TRADEOFF when one category has moves toward and away, IMPROVEMENT or REGRESSION when only one way, MOVED, INSIDE ITS TARGETS when targets exist but no move crossed a distance, MOVED (no target) when nothing targets that category, WITHIN NOISE when nothing moved.

---

## 5. The eight categories: what feeds each

| Category | Cell outcomes | Views across cells |
|---|---|---|
| Combat performance | party DPS, damage dealt a hero-hour, kills a party-hour, seconds to kill (median and slowest tenth), pulls, spells cast | each way's DPS, kills and Level XP over the median way at the same Level |
| Survivability | damage taken, the front seat's share, monster hit rate, damage a monster swing, healing in and out, shields, regeneration, sustain ratio, deaths, hunted share, lowest health (typical, worst tenth, worst hundredth), time under 30% and 10%, close calls | deaths pooled by party size, tier and gear, and by Level band |
| Resource economy | coin, vendor loot, gold in, rares, store gold, Blessing gold, net gold, net with rares, store share, supplies, food, mana drinks, mana spent, rare drops, rare-table rolls | net gold, store share and gold in by Level band, lone and the four, each tier |
| Progression | Level XP, Level XP after deaths, hours for the next Level, XP over the contract, each combat skill's XP, XP lost to deaths, the death tax | hours from Level 1 to 110 for every way alone and the four, hours to each spine Level for the lone hammer |
| Equipment value | (none of its own) | MID over LOW and BIS over MID for Level XP, DPS and damage taken, every way and the four at every spine Level, and each slot class's step (the full set over one class a state back) |
| Hunting ground viability | (the `grounds` block's cells) | each open ground and tier, every party size: XP over the contract, net gold, kills and pooled deaths, the mean of its two band ends |
| Solo and party performance | (the party cells) | each pair, the three and the four, Level XP and net gold a head over the lone hammer at the same Level and tier, and the four's front-seat share |
| Long-term scaling | (none of its own) | hours a Level along the Level line for every way and the four, the last spine Level over Level 30 for hours a Level, net gold and damage taken, and the `beyond` block past live content (hours a Level, deaths, XP, DPS and damage over the same seat at 110), labelled STAGED or PROJECTED |

---

## 6. The adversarial review

Phase 7 asks for an adversarial review to find major factors left out. This framework makes the review concrete rather than replacing it:

1. **Coverage.** The reviewer reads `06-coverage.md` section 2 against the candidate's diff. A candidate that changes a mechanic marked EXCLUDED or APPROXIMATED there (town work, the market, buffs, Talents, live events, the Tower, mixed Levels, the purse, stamina) is NOT validated by this report, however green it reads.
2. **Calibration.** A candidate that moves the C-2 rows or the Krell four's ratios (both print in each results file) away from real play moved the instrument's agreement with production, and the reviewer says whether that is the intent.
3. **Unread targets.** Every UNREAD target is a scenario the baseline lacks. The reviewer either adds the block (`baseline/scenarios.mjs`, then a new pin) or says why the target cannot be measured.
4. **Large and unexpected moves.** Every UNEXPECTED category and every move over 10% gets a cause from the candidate's author before the change is called validated.
5. **Harness drift.** The report's harness warning must be absent. A comparison across two harnesses is a comparison of two instruments.

JUDGMENT: the reviewer should be someone who did not author the candidate, as for a Security review.

---

## 7. The first candidate: FB-8 stage 1

**What was played.** `lane/c-pace` at `90ad526dd` (its STAGE 1 DONE), on the baseline's 1,353 cells, 8 seeds each, with the pin's harness: MEASURED, GitHub run 44985095603 against the pin run 44985081080. The two harness commits differ only in the run's `target.json`, so the report prints no harness warning. Its game tree differs from the pin's (COMPUTED from `git diff 861ae52e3 90ad526dd`, with the engine `src/core` and the edge settle identical) in:

- the armor curve x2.4 (`src/data/core-model.js`: dodge k 0.4 to 0.96, absorb k 0.62 to 1.488),
- the gear curve and its exchange rates (`src/data/gear-curve.js`, `gear-tiers.js`),
- Krell's Hold's card food (`src/data/grounds/krells_hold/pack.js`, Salted Shark),
- the designer's staged weapon and armor lines (`tools/balance-sim/staged`, each tree's own),
- and the social and calendar data its older base lacks (clans, chat, live events, text), which no cell reads.

The armor curve sits in the tree, and no knob is laid on it, so `armorCurve` cannot apply twice.

**The command.** `node tools/balance-program/baseline.mjs --compare tools/balance-program/baseline/candidates/fb8-stage1-90ad526dd.json.gz --intent equipment,survival`. The full printout is `tools/balance-program/baseline/candidates/fb8-stage1-90ad526dd.compare.txt`. It reads BL-3's inventory (100 candidate targets, every one a design hypothesis). The intent names equipment and survival, because that is what an armor curve is for.

The two results files gained their reader rows after the runs (`--add-readers`, from each run's own shards, judged on its own materialized tree). Nothing else in either file changed: MEASURED, all 1,353 cells, all 573,672 seed values, every view and the calibration byte-identical to the files the GitHub join wrote.

**Verdicts.** 1,092 of 1,353 cells moved in at least one outcome beyond noise. The 261 that did not include all three C3 cells.

| Category | Verdict | BL-3 targets read: readings toward / away | Moved beyond noise |
|---|---|---|---|
| Combat performance | MOVED (no target), UNEXPECTED | none readable | 1,055 cell outcomes, no view |
| Survivability | TRADEOFF | 5 targets: 69 / 7 | 8,422 cell outcomes, 15 views |
| Resource economy | TRADEOFF, UNEXPECTED | 5 targets: 7 / 5 | 4,778 cell outcomes, 29 views |
| Progression | MOVED, INSIDE ITS TARGETS, UNEXPECTED | 5 targets: 0 / 0 | 1,648 cell outcomes, no view |
| Equipment value | TRADEOFF | 8 targets: 6 / 5 | 94 views |
| Hunting ground viability | MOVED (no target), UNEXPECTED | none readable | 118 views |
| Solo and party performance | REGRESSION, UNEXPECTED | 1 target: 0 / 1 | 77 views |
| Long-term scaling | MOVED (no target), UNEXPECTED | none readable | 47 views, all of them deaths or rates past 110 on Deadly |

Of BL-3's 100 rows, 24 are read here. 76 are UNREAD: 43 have no matrix reader (another tool's, or MISSING), 23 have no number in their band yet, and 10 name a reader that judged nothing on these cells (the pace seat on Dangerous past 110, for one).

**Against BL-3's inventory** (the readings that moved, each a design hypothesis, MEASURED on the reader rows):

- SURV-4, typical lowest health 0.6 to 0.8 (`S1.mid`): 69 readings moved toward the range as lone heroes on Normal dip lower (the hammer at 20: 0.84 to 0.77), and a few moved away, out under 0.6 (Coppercap Warrens at 32: 0.63 to 0.50).
- SURV-7, SURV-8 and the rest of SURV-1 and SURV-2 held. SURV-1 and SURV-2 (`S2.mid`, `S7.mid`, deaths and the hunted share on Normal MID) moved away only at Level 400, past live content: the lone bow and crossbow now die on Normal there.
- GEAR-2, an armor step worth 3 to 5% less damage (`E1.armor`): the step moved from under the range to over it. At Level 30 it read 4.6% and now 17.5%, at 60 it read 0 and now 11.2%. It moved toward the range at 88 (from -0.6% to 8.4%, nearer in relative distance) and at 10 (from 52% to 38%).
- GEAR-1, a weapon step worth 5 to 8%: one reading moved 0.2 points, the other six held, so the weapon half is untouched. GEAR-9 and GEAR-10 (gear prices over a band's net gold) moved toward their ranges in 3 readings.
- GOLD-4, net gold a new ground pays a lone hero over the ground before (`G-1`): five readings (the bow, the crossbow and the sword) slip 2 to 3 points further under 1, one moved toward. GOLD-2 and GOLD-3 (net gold on Deadly, and for an arrival four on Deadly) moved toward their ranges in 6 readings.
- PARTY-1, the four's Level XP a head after deaths on its hardest tier over the same heroes alone on Normal (`S11`): one reading moved away, at Level 400, projected.
- PACE-1 to PACE-5 (212 readings) and DROP-1 (168): every reading held. The candidate does not touch the pace or the drops.

**Side by side** (before is the pin, after is FB-8 stage 1, a move counts beyond noise by section 3):

| Reading | Before | After | Change | |
|---|---:|---:|---:|---|
| Damage taken a hero-hour, lone hammer, MID, Normal, Level 10 | 3,880 | 5,077 | +30.9% | moved |
| same, Level 30 | 15,600 | 17,500 | +12.1% | moved |
| same, Level 60 | 28,700 | 32,100 | +12.0% | moved |
| same, Level 110 | 47,000 | 53,600 | +14.0% | moved |
| Damage taken a head, the four, MID, Normal, Level 60 | 3,531 | 4,319 | +22.3% | moved |
| Damage taken, every lone live Normal cell (294) | | | median +17.0%, 0 to +33.1% | |
| Level XP a hero-hour, every lone live Normal cell (294) | | | none moved | within noise |
| Hours from Level 1 to 110, every way alone and the four | 425 to 738 | the same | 0.0% | within noise |
| Deaths in 1,000 hero-hours, alone, Dangerous, LOW / MID / BIS | 545 / 107 / 43 | 776 / 194 / 126 | +42% / +80% / +191% | moved |
| same, alone, Deadly, LOW / MID / BIS | 1,705 / 321 / 176 | 1,808 / 427 / 299 | +6% / +33% / +70% | LOW within noise |
| same, the pairs, Deadly, MID | 6.8 | 55.9 | +715% | moved |
| same, the four, Deadly, LOW | 0.8 | 11.3 | +1,231% | moved |
| same, the four on Deadly in MID or BIS, the three anywhere, anyone on Normal | 0 | 0 | | within noise |
| Damage taken, MID over LOW gear, lone hammer, Level 10 | 0.41 | 0.54 | +30.9% | moved |
| same, Level 30 / 60 / 110 | 0.72 / 0.79 / 0.91 | 0.61 / 0.67 / 0.80 | -15% / -16% / -12% | moved |
| The armor step alone, LOW to MID, lone hammer, Level 30 / 60 | 0.95 / 1.00 | 0.83 / 0.89 | -14% / -12% | moved |
| The armor step alone, MID to BIS, lone hammer, Level 110 | 0.99 | 0.95 | -4.0% | moved |
| Net gold a hero-hour, lone ways, Levels 60 to 110, Dangerous / Deadly | -38k / -90k | -85k / -170k | -121% / -88% | moved |
| Net gold a head, the four, Levels 60 to 110, Normal / Dangerous | 6,386 / 14k | 6,331 / 14k | -1% / -1% | within noise |
| The four's Level XP a head over the lone hammer, Deadly, Level 30 | 0.99 | 1.16 | +16.4% | moved |
| Hours a Level past live content (145 to 400), MID, Normal, every way and the four | | | none moved | within noise |
| The Krell four's damage taken in front, over the one real four's (calibration) | 0.65 | 0.89 | +37% | |
| The Krell four's front share of the damage, over real | 0.96 | 1.05 | | |

**What it says.** JUDGMENT. BL-3's rows are design hypotheses, so their readings inform this and do not decide it:

1. **In play, FB-8 stage 1 is its armor curve.** It raises the damage a lone hero takes on Normal by a median of 17% (up to 33%) and moves no Level XP on Normal anywhere. From Level 30 up it makes armor worth something: LOW to MID armor now saves 17% of the damage at 30 and 11% at 60, where it saved 5% and nothing. At Level 10 the MID set saves less than before.
2. **The cost lands on survival on the harder tiers,** and on the parties least protected by a healer and a front. Lone deaths on Dangerous rise 42 to 191% by gear state. The pairs on Deadly go from 7 to 56 in 1,000 hours, and the four in LOW gear from 1 to 11. The four in MID and BIS and the three still never die.
3. **Those deaths reach gold and XP,** which the intent did not name, so the report marks economy, progression, grounds, party and scaling UNEXPECTED. A lone hero on Dangerous or Deadly from Level 60 loses about twice as much gold an hour (Blessings bought again, shorter hunts). A party's gold and pace barely move.
4. **The gear curve and its exchange rates move nothing measurable.** No item a cell wears reads them yet. Under Level 110 the curve is its own samples, and past 110 the kits come from the staged rows and the harness's projected line (`06-coverage.md` section 2). The matrix plays the curve only through its R10 plan step, a harness stand-in.
5. **Krell's card food** is a 1 to 2% store move on the Krell's Hold four.
6. **The calibration moved toward real play.** The harness four's front seat took 0.65 of the one real four's damage on the pin and 0.89 on the candidate. That is evidence for the curve's survival numbers, on one real hunt.

The first coordinated calibration (a later lane) sets the gold and tier dials with this curve, and BL-3's targets say which of these moves are improvements. This report is the evidence it starts from, not a recommendation.

**The adversarial review, for this candidate** (section 6): it touches no EXCLUDED mechanic. The calibration moved toward real play (point 6). The gear curve itself is unmeasured by any cell (point 4), so the curve is NOT validated by this report. Only the armor half is.

---

## 8. Why a new command beside `balance-matrix.mjs --diff`

The brief asked to prefer extending the matrix's `--diff` and `--report`. I extended the matrix where its code is the right home, and added one command where it is not:

- **Extended in the matrix** (`balance-matrix.mjs` `playRun`): a `planHook` (a caller's own cells and per-cell hours) and a `perSeed` hook (each seed's full engine answer). Two lines, and the matrix's planner, cell builder, metrics, workers, shards and tool-red rule are all reused. No matrix cache goes stale, because the matrix's cache hash does not include `balance-matrix.mjs`.
- **New, in `baseline.mjs` and `baseline/`**: what `--diff` cannot do. `--diff` plays a patch on a scratch copy of the tree it runs in and replays its own baseline each time. The regression needs a game tree that is not the harness's tree (a pinned commit, a lane), a committed baseline it never replays, every seed kept for noise, a branch as a candidate, and new-game targets instead of the old bands.

JUDGMENT: one later step is worth doing when BL-3's targets land. Teach `balance-matrix.mjs --diff` to read the same targets file, so the quick patch loop and the full regression judge by one rule.

---

## 9. Known limitations

1. Section 6 of `06-coverage.md`: everything EXCLUDED there is invisible to this report.
2. The noise rule is unpaired. A paired rule (seed k against seed k) would resolve smaller moves, but only while the two trees' dice stay in step, which a real engine change breaks within minutes of play.
3. A view's error assumes its cells are independent. Cells share seeds, so the true error of a pooled view is somewhat larger than printed.
4. The scenarios are fixed at the pin. A candidate that adds content past Level 110 is measured only through the `beyond` block until a new pin re-derives the spec.
5. BL-3's rows are read through band readers only. A row another tool reads (the atlas, the paths, a guard line, the start cards) stays UNREAD here until that reader stores its value in the results, and 23 rows wait for a number in their band.
