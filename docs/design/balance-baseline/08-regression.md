# 08. The regression framework: every candidate against the whole baseline

Deliverable 8 and the regression half of Phase 7 of the balance baseline request (Tyler, 2026-11-21). Lane `lane/bl-baseline`, systems engineer.

Labels. MEASURED names the run. COMPUTED is arithmetic on named inputs. CODE means I read it at the file named. JUDGMENT is my opinion. UNKNOWN is unknown.

---

## 0. One screen

1. **One command plays a candidate** (a branch, a commit, patch files laid on a tree, or a proposal base) on the baseline's own 1,353 cells, eight seeds each, on the same engine path and the same harness, and prints it side by side with the committed baseline.
2. **The report is grouped by Tyler's eight categories:** combat performance, survivability, resource economy, progression, equipment value, hunting ground viability, solo and party performance, and long-term scaling.
3. **Every change is marked.** Against BL-3's new-game targets where a target exists: IMPROVEMENT (toward its range), REGRESSION (away, or a hard target newly left), TRADEOFF (both in one category). Where no target exists: plain movement, up or down, with its size against its noise. A move under the noise is reported as within noise, never as a change.
4. **Unexpected outcomes are named.** A candidate says which categories it means to move (`--intent`). A move beyond noise anywhere else reads UNEXPECTED. Every move over 10% beyond noise is listed by cell.
5. **The current game's rulings judge nothing here.** Tyler, 2026-11-21: the game is being redone, so rulings about the current game are neither constraints nor targets. `standards.mjs` bands are not read by this report. Until BL-3's targets exist, every change reads as plain movement.
6. **First real candidate:** FB-8 stage 1 (`lane/c-pace` at `f063f140b`), section 7.

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

BL-3 owns the target specification. This report reads it from a JSON file (`--targets <file>`, schema `hearthrise.balance-targets/1`, CODE: `baseline/compare.mjs` `loadTargets`):

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

{{DEMO}}

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
5. The targets interface is mine. BL-3 may need fields it lacks. Adding them is a change to `baseline/compare.mjs` alone.
