# Systems intelligence: the adversarial review of 00-plan.md

Reviewed on `lane/d-si-review`, cut from `set/v0.2.144` at `2918fa07d`. The reviewer wrote none of the plan. Tyler's brief was read in full first, then the plan in full, then the repo was checked. No game code, data, migration or tool was changed.

## Verdict: APPROVE WITH CHANGES

The diagnosis holds. 38 of the 47 claims checked are true as written, and the eleven root causes are real. The proposal built on that diagnosis is not ready for Tyler's yes. It has one privacy fault that must be settled before step 1, four feasibility claims that are false or unproven as written, a census that misses the code where its own example faults live, and an upkeep cost that is stated as "one sentence" when the plan's own rules make it far larger.

Changes 1 to 6 are blocking. They should be folded into the plan before it goes to Tyler. Changes 7 to 19 can go to him as a list beside the plan.

## The changes

### Blocking

**1. Step 1 publishes Tyler's rulings to the world. The plan guards the wrong door.**
- Plan section: 3.4, the second risk in 3.6, roadmap step 1, the last "Not analyzed" lines.
- Problem: the plan says "The site build must not publish it" and leaves the check undone. The site was never the exposure. The repository is.
- Evidence: `gh repo view bugsquisher1/hearthrise --json visibility` answers `PUBLIC`. `tools/build-site.mjs` line 3 says the site is an allowlist of what the game loads, so `registry/` would not reach the site either way. The rulings file in Claude's memory is 517 lines. It holds things that are not design rulings: named playtesters with their play records and Discord quotes, a line about what Tyler can afford to pay for servers, spend approvals, a fragment of an account id with who invited it, and the address of a private artifact. Some design briefs are already public (`docs/design/balance-program/45-design-brief.md` is verbatim), and so is CLAUDE.md with its dated rulings. So design intent being public is the standing state. Personal, money and third-party lines being public is new.
- Fix: rewrite the risk as "the repo is public". Step 1 imports only lines that state a game rule. The import drops, and prints, every line that names a person other than Tyler, a real-money figure, a spend approval, an account id or a link. Those stay in memory. The `said` field keeps Tyler's words only where they are about the game. Tyler is asked one plain question before step 1 runs: "Your game rulings will be readable by anyone on GitHub. Yes or no." If no, the file lives outside the repo and the CI benefit claimed for step 1 is withdrawn.

**2. Moving the rulings does not let the completeness check run in CI. RC5's fix is overstated.**
- Plan section: RC5, 3.6 first row, roadmap step 1 benefit ("unblocks the inventory check for CI").
- Problem: the check depends on more than the rulings file, and its two reds today are not about memory at all.
- Evidence: `node tools/balance-program/inventory.mjs --check` on this branch prints `RED inventory: 2 orphan(s), 0 fault(s)`. Both orphans are lanes (`lane/c-balance-matrix`, `lane/d-platform-cost`). The anchor counts are ruling 449, memory 296, memfile 141 and lane 816. After step 1 moves the 449 ruling anchors, 437 memory anchors and 816 lane anchors still come from outside the commit. Lane refs change by the hour, so a check that reads them is not a function of the commit.
- Fix: say that step 1 removes one of three outside inputs. For CI, split the check: the code kinds (files, tables, functions, verbs, cron) gate in CI, and the lane and memory kinds stay a local report. Drop the claim that step 1 alone unblocks it.

**3. The census lists exported symbols. The faults the plan uses as its own examples live in functions that are not exported.**
- Plan section: 2.2 first row ("Every exported function and constant"), 2.4.
- Problem: a private function with a typed number is invisible to checks 1 to 3. Only check 4, the ratchet on typed numbers, could see it, and that check is the one "not yet counted" and the one that needs a parser.
- Evidence: `src/core/hunt/tower.js` line 144 is `function heatOpts(floor, run)`, not exported. It is the function behind F4, the Tower heat. Counted here: `src/core` has 143 private top-level functions beside its 424 exported ones, and 37 of them hold a typed number. The engine has 47 private ones, 14 with a typed number.
- Fix: the census lists every top-level function, exported or not. State the counts above in 2.2.

**4. Four feasibility claims are false or unproven as written.**
- Plan sections: 2.5 complexity note, 3.2 row 5, 5 layer 3, 5 layer 5, 6.4 "What to rerun", roadmap step 7.
- 4a. "The repo has no JavaScript parser installed." FALSE. `package.json` lines 57 and 62 list `esbuild` 0.28.2 and `typescript` 6.0.3 as development dependencies. TypeScript's parser reads plain JavaScript and gives function boundaries. Fix: use it. Remove the recommendation to add a dependency.
- 4b. "The tool prints the ordered list of rule functions that ran." Node's built-in coverage records which ranges ran and how often. It does not record order. Fix: the lifecycle prints the set of functions that ran, grouped by the phase of the hunt the harness was in, or the plan names a different mechanism and prices it.
- 4c. "Each cached cell records which functions it exercised" at low cost. The matrix plays many cells in each of a pool of forked workers (`balance-matrix.mjs` lines 81 to 101, `fork(WORKER, ...)`). Coverage from the environment setting is written once per process at exit, so it is per worker, not per cell. Per-cell coverage needs the inspector started and read inside `tools/balance-sim/worker.mjs` around each job. Fix: say so, and rate step 7 medium.
- 4d. "Names all share the `hr_` prefix and are unique, so a text match is reliable." FALSE for tables. Of 208 table names in the claim patterns of `systems.mjs`, 80 have no `hr_` prefix, for example `player_progress`, `player_skills`, `hunt_bag`, `hearth_flames`. Short table names will match column names and words in comments. Fix: match table names only after an SQL keyword that takes a table (`from`, `join`, `into`, `update`, `delete from`), and print the unmatched remainder.

**5. The upkeep cost is far above "re-read one sentence", and the plan contradicts itself on who pays it.**
- Plan sections: 2.3, 3.3, 7.1, roadmap steps 4 and 5.
- Problems, each with its evidence:
  - The default kind is "formula" for any function whose body holds a number or reads a numeric constant, and it "stays red until a formula row claims it or a person marks it plumbing with a reason". The surfaces hold 424 + 192 + 253 JavaScript functions and 799 server functions. The plan gives no estimate of how many default to formula. Today 59 + 2 + 36 are named in a register. So step 5 is on the order of a thousand hand decisions, not "area by area".
  - Section 3.3 says the lane that changed a function re-pins the fact "in the same commit". Section 7.1 says the Registry keeper is "the only writer of formula rows". Both cannot hold.
  - Section 3.1 says "Nothing generated is committed". Section 3.3 says the tool "stores a fingerprint beside the fact". A stored fingerprint is generated and committed. Two lanes that touch the same function will both rewrite it, and CLAUDE.md section 3.3 sends every conflicting branch back to its lane.
  - Re-pinning is a typed act. A lane whose check is red will re-pin to get green. Nothing shows that anyone re-read the sentence. This is RC9, a label typed by its writer, built into the fix.
  - A fingerprint of one function's text does not change when a function it calls changes. The fact "this computes the largest blow" can go false with no STALE mark.
- Fix:
  - Step 2 prints the count of functions that would default to formula, per folder, before step 5 is sized or approved.
  - The pin is the function's sample outputs, not its text. The probes already call the real functions. If a change leaves every sample output the same, the fact stays current with no human act. If an output moves, the tool prints before and after, and the lane writes one line saying why. That removes cosmetic re-pins, catches callee changes, and makes the re-pin carry evidence.
  - Pure functions get this for free. Functions that cannot be sampled fall back to the text fingerprint, and the tool prints how many those are.
  - Lanes write the re-pin. The keeper reviews. Strike "the only writer".
  - Pins live one file per symbol or in a file sorted by symbol id, so two lanes rarely touch the same line.

**6. The plan redefines MEASURED and does not say that the book's 49 uses of it change meaning.**
- Plan section: 6.4 label table, 3.4 last paragraphs.
- Problem: the plan says "MEASURED and COMPUTED are the words the book and `standards.mjs` already use" and then gives MEASURED a new, stricter meaning: the cell's class must be calibrated against real play.
- Evidence: `docs/design/overhaul/01-core-and-combat.md` line 14 defines MEASURED as "Evidence about the proposed design, read on the real engine". That is the plan's SIMULATED. The word appears 49 times across the nine chapters. The plan's own section 6.4 risk says no real lone, pair or three hours exist, so under the new meaning almost nothing is MEASURED.
- Fix: do not reuse the word. Keep the book's MEASURED as it is defined there. Name the stricter state CALIBRATED. The four labels become CALIBRATED, MEASURED, COMPUTED and ASSUMED, and no chapter has to be relabelled.

### Not blocking, to go to Tyler beside the plan

**7. The registry cannot see a special case that is a data row.** Section 2.3 gives a table the kind "content" and asks only for its row count. Tyler's Part 3 is about exceptions per ground and per item. The plan's own F6 ("each ground carries a hand multiplier") and F9 (118 of 190 monsters typed by hand) are data rows. Both pass the census as claimed content. Fix: the content registry prints, per table, each field and how many rows set it. A field set on a minority of rows is listed as an override and needs an exception row or a reason. This is generated and needs no hand upkeep.

**8. Discovery surfaces that are missing from section 2.2.**
- Client display math: `src/session`, `src/shell`, `src/hunt-view`. The plan's own F1 is a client file showing a formula the engine does not run (`src/shell/wiki-model.js` line 126). The plan says step 2 would find leaked rules, but step 2's folders are `src/core`, `src/data`, the engine and the database.
- The second edge function, `supabase/functions/bug-report-bridge`.
- Triggers, views and row policies in the replayed database. Only functions, tables, client calls, jobs and switches are listed.
- The schedule of each of the 28 jobs. An interval is a game number.
- The edge from the client to the server. `src/session` names 188 distinct `hr_` identifiers. No layer in section 5 reads them, so `impact` on a server function cannot name the screen that calls it.
- Fix: add the three client folders in report mode with the typed-number count only, add triggers, views, policies and job schedules to the server row, and add a sixth layer: string matches of server function names in `src/session` and the engine.

**9. Dependency kinds the five layers cannot derive.** Name them in section 5 so `impact` does not read as complete.
- A read of one field of a constant object. The knobs are fields of `COMBAT_BALANCE`, read through a local alias (`combat.js` line 475 reads `b.monsterDamageScaleByTier`, `wiki-model.js` reads `B.strengthLevelScale`). A name match on the export says every reader depends on all thirty fields. Field-level reads need the parser and alias tracking.
- Dependencies through data values: an item id in a drop row that is a recipe input, a ground id in an unlock row. `sources.mjs` covers items only.
- Dependencies through stored state: one function writes a column, another reads it a day later.
- Dynamic SQL and trigger chains.
- Dependencies through the player: gold income changes what a player buys. Only the matrix shows those, and only for what the harness heroes do.

**10. The lifecycle stops short at both ends.** Tyler's Part 2 item 5 says "from character preparation to final rewards". The coverage trace runs the harness, which plays the settle with no database (`tools/balance-lab/lab-core.mjs` lines 3 to 4). Preparation (gear, bar, stock, the start intent's stamina and gold checks in SQL) and the reward write to the tables and the ledger are outside it. Fix: the lifecycle is three joined lists: the start path read from the server map, the fight from coverage, the write path from the server map. The print says which part is static and which ran.

**11. Deliverable 4 does not answer Tyler's eight named frameworks, and a third of it is taken from a document.** Part 3 names physical damage, magical damage, healing, mitigation, weapons, spells, monsters and ground rewards. Section 4.2 is a list of twelve faults. Four of them (F6, F7, F9, F10) are "From 44. Not re-verified" and F8 is partly so. Brief non-negotiable: "Do not treat existing documentation as unquestionable truth." The plan labels them honestly, which is right, but the deliverable is then not a code-verified assessment. Fix: add one table with the eight frameworks as rows and three columns: one shared rule or several, where in code, verified here or taken from 44. Move F6, F7, F9 and F10 under a heading that says HYPOTHESIS.

**12. Section 1.4 does not map the whole Part 1 checklist and takes its statuses from a file the plan calls drifted.** Entries with no row: character attributes, monster damage and defense, combat encounter simulation, XP an hour, gold an hour, supply usage, hunting efficiency and survivability, equipment classes, item drop sources, party composition. Part 1 also asks for formulas, inputs, outputs, dependencies and tests for each system. The table gives a location only. The statuses come "from `systems.mjs` where a row exists", and section 1.2 lead 1 says that file "has also drifted". Fix: add the missing rows, and add a column that says for each status whether it was seen in code here or copied from `systems.mjs`. Say plainly that inputs, outputs and tests are what step 2 and step 4 produce, and are not in this page.

**13. The brief's twelve metrics and ten matrix axes are never set against what the matrix has.** Section 6.3 covers Part 4's factors. Nothing covers Part 5's lists. `matrix-metrics.mjs` does carry healing, low-health points, gear steps by slot and solo against party, so most of the answer is good news the plan does not report. Fix: one table, Part 5 metric and axis against the `METRICS` list and `matrix-plan.mjs`, each marked present, estimate or absent.

**14. "Rerun only stale cells" will rerun nearly everything on a rule change and miss data changes.** Every cell runs `playerCombatRolls` and the settle. A change to any core combat function marks every cell stale. A change to a monster row changes no function, so coverage sees nothing, and section "How it stays current" says only that "cells that exercised it are marked stale" for a constant. Fix: say the saving applies to edits in leaf rules and single content rows. Cells also record the content ids they loaded (ground, monsters, items, spells). A data change stales the cells that loaded that id. Drop "sized by what changed" as a CI cost claim until measured.

**15. The book link is heavier than it needs to be.** Section 3.4 adds a tag on every testable statement in nine chapters, a hand-kept `intent.mjs` row per tag, and two red checks that tie them together. No chapter carries such a tag today (0 matches for `[B0n-n]`). The chapters already carry ids: the nine chapters hold 958 lines that name a formula id, a knob or a GR call id. The generated reference check in the first bullet of 3.4 is cheap and works on those today. Fix: ship the reference check only. Write a check for a statement only when an audit finds the code contradicting a ruling, starting with F1, F3 and F4. Write those as ordinary tests under `tests/`, which the repo already knows how to run, prove and gate. Drop the tag convention, `intent.mjs` and the "book id with no intent row fails" rule. The count of statements with no check is still printed.

**16. `accept` checks what the report says about itself.** This is the centre of the coordination plan, so each of tonight's failures is judged here.

| Failure tonight | Does the plan stop it | Why |
|---|---|---|
| Partial reads | No | "Sources read in full" is typed by the agent. The tool compares one typed list with another. The plan admits this and assigns sampling to the adversary |
| Stale numbers | Partly | New reports cite cell ids. The twenty layered documents stay quotable, and "How it stays current" says this is "not solved" |
| Mislabelled evidence | Yes for cell numbers | The label is the cell's own. It does not cover a number an agent derives by hand from two cells |
| Circular convergence | Partly | Rule 3 stops re-telling. But every agent now reads the Coordinator's `reading` of each ruling, and nobody reviews a reading. One wrong reading reaches every lane with the registry's authority |
| Numbers reaching Tyler unverified | No, by tool | The Coordinator's messages to Tyler are chat, not files. Rule 2 is a promise |

Fixes:
- Partial reads: the brief pack carries the text an agent must have, inline, sized to fit. The header field "sources read in full" is removed. A pack too large to inline is a sign the scope is too wide for one agent.
- Numbers: add `registry.mjs quote <cell> <metric>`, which prints the number with its label, seeds and commit as one line. A number in a report or a status is a pasted quote line. `accept` then matches quote lines exactly, and a number without one is UNSOURCED. A hand-derived number must list the quote lines it was made from and is always COMPUTED.
- Readings: `brief` prints `said` first and `reading` second, marked as the Coordinator's. A reading that an adversary disputes is flagged on the row.
- Old documents: `brief` never includes documents 00 to 62. `accept` flags any citation of them as a source to be re-derived.
- Say in the plan that rule 2 is discipline, not a gate.

**17. The roadmap order leaves the cheapest protections for last and one step is far too large.**
- Step 9 (computed labels, the quote line, `accept`) is rated Low and is the direct answer to tonight. It needs cell metadata only, not the registry. Move the label and quote part to second place.
- Step 10 (CI) is last, so nine steps of new hand-written binding have no gate while they are built. The census count should enter CI as a number that may only go down as soon as step 2 lands.
- Step 3 is four pieces of work: three simulator faults and one refactor of how a cell is described. One needs real play that does not exist. It is not a step. It is already owned by chapter 09 section 2.4.4. Remove it from this roadmap and reference it as a dependency of step 11.
- Step 5 is unsized (see change 5). Split it by folder after step 2 prints its counts.
- Step 6 rests on 4d and change 9. Deliver layers 1 and 3 first, then field-level constants.
- Proposed order: 2 (census, report mode, all top-level functions, in CI as a ratchet). Then labels and the quote line. Then 1, once Tyler answers the privacy question. Then 4, 6, 5 by folder, 7, the book reference check, and 11.

**18. The smallest useful first slice.** One read-only script, no new folder, no hand-written file. It lists every top-level function in `src/core` and the engine, says whether its body holds a typed number, and says whether any register names it. It prints the three numbers per folder and the unnamed list. The counting script used for this review did most of that in under twenty lines and reproduced the plan's 59 of 424. It can ship in a day, it proves or kills the sizing of everything after it, and it cannot rot because it stores nothing. Tyler should be offered this slice as the thing to approve first, with the rest of the shape approved after its output is seen.

**19. Smaller corrections.**
- Section 3.6 says the tool is "about the size of `inventory.mjs`". That file is 259 lines and `collect.mjs` is 250. The tool described has five commands, a parser pass, an SQL reader, a coverage reader, a label rule, a book reader and a report reader. Rate it high, or cut it as changes 15 and 16 propose.
- Step 4 says "the existing 107 formulas and 129 exceptions". Those are the merged counts in `formulas-architecture.json`. The rows that carry `impl` strings are in the three category files: 131 formulas and 154 exceptions. The binding work is on the larger number.
- Section 1.2 lead 2 quotes 44 section 9 as saying "The cross-category edge list was written by hand". That sentence is not in `44-formula-architecture.md`. The substance is true: `architecture-register.mjs` line 130 holds the cross-category edges as typed rows.
- RC3 says the `hunts` pattern is "about 1,500 characters". It is 1,313.
- RC8 names `played.mjs` and `skill-lines.mjs` without a folder. They are in `tools/balance-sim/`, not `tools/balance-program/`.
- "Not analyzed" says chapter 08 was not on the set. It is now (`docs/design/overhaul/08-player-experience.md`). Chapter 00 is still absent.
- Section 2.2 gives counts with no label. They are CONFIRMED by this review (see below) and should say so.
- Section 7.4 rule 1 adds "one adversary per two" finding lanes. With four finding lanes that is six agents at once. CLAUDE.md section 3.1 caps lanes at three to four. Say which rule wins.
- `registry/` is a new top-level folder for two files. Put them under `tools/balance-program/` beside `systems.mjs` and `standards.mjs`, which the plan already treats as registry parts.

## Tyler's non-negotiables, one by one

| Requirement | Verdict | Note |
|---|---|---|
| Do not begin by modifying gameplay formulas | Met | F1, F3 and F4 are explicitly not fixed under the plan |
| No new balance constants | Met | |
| Do not invent formulas that differ from the engine | Met for combat. One caution | The harness rebuilds health between settles with its own constant regeneration rate (`cell.mjs` lines 10 to 12). The plan lists it as S1 and points to the fix. The staged gear lines in `tools/balance-sim/staged` are a second gear rule and the plan keeps them as a named patch. Both are disclosed |
| Do not treat documentation as truth | Partly | Changes 11 and 12 |
| Do not accept agent reports without checking scope | Partly | Change 16 |
| No unnecessary complexity | Not met | Changes 5, 15, 16 and 19. The tag convention, `intent.mjs`, the typed re-pin and the six-field header are the parts most likely to be abandoned |
| No unapproved design decisions | Met | |
| Do not claim complete understanding without evidence | Met in the rule (2.5), not yet in the tool | The three-number print is the right rule. Change 3 and change 8 are the holes in what it would count |
| Do not optimise isolated systems | Not applicable yet | |

What becomes a burden to maintain, in order of weight: the formula-or-plumbing decision on every function with a number, the re-pin on every edit to a rule function, one intent row per book statement, the report header, and the `reading` field of every ruling.

## Part 9 items

| # | Item | Delivered | Benefit, complexity, risk | Confirmed kept apart from hypothesis |
|---|---|---|---|---|
| 1 | Current-state assessment | Yes | Yes | Yes |
| 2 | Discovery plan | Yes, with the holes in changes 3 and 8 | Yes. The parser risk is wrong (4a) | The counts in 2.2 carry no label |
| 3 | Systems registry | Yes | Yes. Complexity understated (19). Privacy risk misplaced (1) | Yes |
| 4 | Formula architecture assessment | Thin (change 11) | Yes | Yes, honestly marked |
| 5 | Dependency mapping | Yes, with the limits in change 9 unstated | Yes. One false premise (4d) | One hypothesis marked. 4b and 4c are stated as fact |
| 6 | Simulation architecture | Yes | Yes | Yes. The label rule conflicts with the book (6) |
| 7 | Agent coordination | Yes | Yes | Not applicable |
| 8 | Design review framework | Yes | Yes | Not applicable |
| 9 | Roadmap | Yes, order and size faults (17) | Per step, yes | Not applicable |

## Claims checked

TRUE means seen in the repo on this branch as the plan states it. Small count drift from commits that landed after the plan was written is noted and still counted TRUE.

| # | Claim | Verdict | What was seen |
|---|---|---|---|
| 1 | 59 of 424 exported functions in `src/core` are named in a register | TRUE | Recounted by matching export names against the five files under `formulas/`: 424 functions, 59 named |
| 2 | 36 of 253 in `src/data` | TRUE | 253 functions, 36 named |
| 3 | 2 of 192 in the engine | TRUE | 192 functions, 2 named |
| 4 | 129 and 163 constants in core and engine, 735 in data | TRUE | 129, 163, 735 |
| 5 | 18 core files never cited, 29 of 41 engine files | TRUE for the engine, close for core | Engine: 29 of 41. Core: 20 by this review's match on path or file name. All six files the plan names are in the list |
| 6 | `conditions.js` is 753 lines and the largest core file | TRUE | 753. Next is `artisan-sim.js` at 723 |
| 7 | `collect.mjs` lines 61 to 73 make an anchor a file, and only data files carry export names | TRUE | `collectSrc`, line 69: `kind === 'data' ? exportsOf(...).join(' ') : ''` |
| 8 | `systems.mjs` line 48 is one long pattern for hunts | TRUE, size off | 1,313 characters, not about 1,500 |
| 9 | `systems.mjs` line 66 holds `fn:hr_hearth_(?!chest)` | TRUE | Line 66 |
| 10 | `systems.mjs` says "hand-authored" on line 2. The `hero-slots` row is named "(300k, 750k, 1.5M)". The `premium` row says "per character" | TRUE | Lines 2, 267 and 283 |
| 11 | The completeness check is barred from CI by its own header | TRUE | `inventory.mjs` lines 12 to 13. Its `--selftest` does run in CI, which the plan does not mention |
| 12 | It is red with 2 orphans | TRUE | Run here: `RED inventory: 2 orphan(s), 0 fault(s)`, exit 1. Both are lanes |
| 13 | 885 of 3,940 anchors come from outside the repo | TRUE within drift, and understated | 3,941 anchors. Memory kinds sum to 886. The 816 lane anchors are also not in the commit |
| 14 | 799 server functions, 286 tables, 148 client calls, 28 jobs, 18 verbs, 115 systems | TRUE | The inventory's own print |
| 15 | `combat-register.mjs` header says a line number can go stale, and `--check` compares the tool with its own output | TRUE | Lines 10 and 16. Its only imports are `fs`, `path` and `url` |
| 16 | Nothing writes `formulas-progression.json` or `formulas-economy.json` | TRUE | The only file under `tools`, `tests` or `.github` that names them is `architecture-register.mjs`, which reads them |
| 17 | `architecture-register.mjs` line 317 reads each knob's source line | TRUE | `knobValues`, lines 313 to 320 |
| 18 | `collect.mjs` line 39 reads the memory folder | TRUE | Line 39 |
| 19 | `30-decisions.json` has 113 rows, the `ruled` list of `62-decision-book.json` has 49 | TRUE | 113 and 49 |
| 20 | `combat.js` line 391 computes the largest blow from typed numbers, and the named constants are read only by the wiki at `wiki-model.js` line 126 | TRUE | Line 391: `Math.floor((dmgLvl * 0.35) + (strBonus * 0.6) + 2)`. The three constants are defined at `combat.js` lines 38 to 40 and read nowhere else under `src` or `supabase/functions` except `wiki-model.js` line 126 |
| 21 | Crit is at `combat.js` lines 488 to 494 | TRUE | `rollCrit` and `applyCrit` |
| 22 | `monsterDamageScaleByTier` holds 4.0, 4.0, 3.0, 2.2 | TRUE | Line 56 |
| 23 | `xp-share.js` line 78 calls `underFloorSharePm` | TRUE | Line 78 |
| 24 | Tower heat is at `tower.js` lines 141 to 157 | TRUE | `heatOpts` at 144 to 151, used at 157. The function is not exported (change 3) |
| 25 | `member.js` lines 220 and 230 pass `restedQuantum: 0` | TRUE | Both lines |
| 26 | `lab-core.mjs` lines 4 to 5 say "every combat skill at the hero's Level" | TRUE | Line 5 |
| 27 | `grid-kit.mjs` lines 70 to 71 import the staged weapon and armor lines | TRUE | Lines 70 and 71 |
| 28 | The subset is 223 cells at 1 seed for 1 hour, `matrix-plan.mjs` line 68, and `balance-matrix.json` does not exist | TRUE | All four |
| 29 | `30-plan.md` line 29 says "Krell at about month 4". `27-retention.md` line 134 says "month 4 to 6" | TRUE | Both lines |
| 30 | `61-review-audit.md` line 39 (C2) and line 57 (H10) record mislabelled MEASURED claims. The audit found 5 critical and 14 high | TRUE | Both lines. 5 rows start `C`, 14 start `H` |
| 31 | The itemization plan is cited 0 times in five of eight phase-B reviews and once in three | TRUE | `itemization-plan` appears once each in 52, 54 and 58 and in no other of 52 to 59 |
| 32 | `guard-deps.mjs` lines 56 to 62 match on a file's stem | TRUE | `refPattern` |
| 33 | 68 lanes named in merges since 11-20 | TRUE within drift | 73 on today's tip |
| 34 | 37 generators, 416 test files, 108 bands, 107 formulas, 129 exceptions, 198 edges, 33 knobs | TRUE | All counted. 107 and 129 are merged counts (change 19) |
| 35 | `imbuements.js` header says "IMBUING IS NOT BUILT" | TRUE | Line 25 |
| 36 | Every source file named in section 1.4 exists | TRUE | Every path in the table was tested and is present |
| 37 | `cell.mjs` header: a death starts a new hunt on a new seed, and health between settles uses a constant regeneration rate | TRUE | Lines 6 and 10 to 12 |
| 38 | "The repo has no JavaScript parser installed" | FALSE | `package.json` lines 57 and 62 |
| 39 | Server names "all share the `hr_` prefix" | FALSE | 80 of 208 claimed table names have none |
| 40 | The lifecycle can print an "ordered list" from Node's coverage | FALSE | Coverage has counts and ranges, no order |
| 41 | 44 section 9 says "The cross-category edge list was written by hand" | FALSE as a quote, true in substance | Not in the file. `architecture-register.mjs` line 130 |
| 42 | "MEASURED and COMPUTED are the words the book already uses" in the plan's sense | FALSE for MEASURED | Chapter 01 line 14 |
| 43 | Moving rulings "unblocks the inventory check for CI" | FALSE | Change 2 |
| 44 | Node passes coverage to the simulator's workers, so per-cell coverage is low cost | UNVERIFIABLE without building it, and the per-cell part is wrong on its face | Workers are forked and each plays many cells |
| 45 | The cell builders never mention imbuements, charms, companions, Premium, potions or stamina | UNVERIFIABLE here | Not recounted. `matrix-metrics.mjs` has no stamina metric, which is consistent |
| 46 | V1, V2 and V4 are fixed with a proven check each | UNVERIFIABLE here | Read in the plan only. No harness was run |
| 47 | The commits `10aaf639e` and `770b9c124` exist | TRUE | Both are commits |

Totals: 47 checked. 38 TRUE, 6 FALSE, 3 UNVERIFIABLE.

## What this review did not check

- No simulator cell was run. Every statement about harness faults V1 to V4, F5, S1 to S5 and the calibration state was read, not measured.
- The server engine and the SQL bodies were not read. The table-name finding in 4d comes from the claim patterns in `systems.mjs`, not from the replayed database. Function-name uniqueness and overloads were not checked.
- The design book was searched, not read. Counts of ids and labels are text matches across the nine chapters. Whether each id in the book resolves to a register row was not tested, so the reference check proposed in 3.4 is judged workable on the evidence of id density only.
- The rulings file in memory was scanned for kinds of sensitive line. It was not read in full, and no line-by-line list of what must be withheld was made.
- Section 1.2 leads 3, 7, 8 and 10, where the plan itself says NOT CONFIRMED, were not pursued further.
- The economy tools named in section 8 (`gold-model.mjs`, `sources.mjs`, `paths.mjs`) were not opened. Whether they can fill criterion 4 as claimed is not judged.
- The Rulings page and tracker databases are outside the repo and were not read.
- Git history of the public repository was not searched for sensitive lines already published.
- No estimate of CI minutes or token cost was made.
- The count of functions that would default to "formula" under section 2.3 was not computed. Change 5 asks the plan to compute it.
- The plan's sections 7 and 8 were judged by reasoning against the brief and tonight's failure list. Nothing in them can be tested until a tool exists.
