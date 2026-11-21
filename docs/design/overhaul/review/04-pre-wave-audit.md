# The audit before wave 1

Written 2026-11-21 on `lane/d-pre-wave-audit`, cut from `set/v0.2.144` at b017ef252 and merged up to 02364f03a. Docs only. No game code, data, migration or tool was changed. Chapters 00 to 13 and `decisions/` were not edited. The auditor wrote none of the book, the reviews or the plan.

Labels. MEASURED is a run on the real engine, with its run id. COUNTED is a count from a file by script. COMPUTED is arithmetic on named inputs. JUDGMENT is an opinion. UNKNOWN means nobody knows. Nothing here is compared with the game that runs today.

This file has two halves. Mine is the book, the rulings, the plan and the sitting. The second auditor's is the existing game, built from the code, in [`04c-existing-game-coverage.md`](04c-existing-game-coverage.md): 96 inventory rows and 47 findings. Its blockers and themes are folded into section 1 here. Its full tables stay there.

## 0. One screen for Tyler

**The verdict: GO WITH CHANGES.**

The plan is good. The first build is the game the critical review asked for, every system in it has a lane, and the lanes are built the right way: the server owns every number, hunts are tested watched and closed, and balance is sized once with Talents in. I found no place where the plan quietly reverses one of your rulings, and no place where it proposes a wipe or spends money.

The changes need no new design. Most are edits to the plan. One is a short test lane, because the integration branch is red today and the plan's own gate needs it green. Wave 1 can start the day the eight items below land.

The existing game is covered: the book and the plan account for 73 of its 84 systems, and the other 11 are named in Part C with what each needs.

**One thing changed while this audit ran.** The first lane, FB-1, is done and merged at 02364f03a. It found two real engine bugs. One froze a strong four inside a pack that came back around it. The other left monsters with no target after a hero died, so the rest of the party stood until the hunt gave up. The balance pass measured on that engine. So three of your questions lean on evidence that has to be played again before you answer: S-11, S-12 and above all S-14, which is about what happens after a hero dies (finding A-0). Wave 1 does not wait for this. The replay is wave 1 work.

**Fix before wave 1. Eight items.**

1. **The plan miscounts what is already live.** It says 36 server files are staged. COUNTED from the files' own notes: 11 of them were applied on 2026-11-20 and 25 are staged. It also misses three staged files that this build reverses (finding A-1).
2. **Two of the seven questions are not yours.** S-13 (party-wide damage) and S-16 (a standing job) are design calls. The designer should rule them and report them. S-13 also calls the mechanic new, and it is already in the game as data (A-2, A-3).
3. **You would read two sets of numbers for S-11.** The sitting uses the newest run. Chapters 00, 05 and 12 still print the older one. Same question, different days (A-4).
4. **S-17 leaves out a cost.** Test Crowns cannot answer their own question on a handful of accounts (A-5).
5. **Nobody has said who plays the first build.** Every number in the plan waits on "the playtest", and the plan never says how many accounts that is. This is the one new question for you, S-18 (A-5).
6. **The integration branch is red.** MEASURED by Part C: all five GitHub runs read were red. The plan lets nothing more into the engine until one run is green. Four of the reds have no owner. One short lane clears them, and the plan names the two that stay red by design until a later lane (T-01).
7. **Party XP by size alone has no lane.** You ruled it at the first sitting. The old classes table is still in the engine and on four screens, and a wave 1 lane would fold it in as it stands (M-01).
8. **The rested bank has three writers in one wave.** You cut it at the first sitting. The lane that removes it holds a third of the files that carry it (D-01).

**What looks good, and was checked.**

- Scope. All ten items of the review's first build, plus Talents and on-call heroes, each have a lane. No lane builds something out of scope.
- Server authority. Every lane that moves gold, XP, stamina or items names its RPC, its server catalogue and its ledger row.
- Files. COUNTED by script, twice, by both auditors: every file a lane names exists or is marked new, and every test it names exists. The files the plan does not name are where Part C found its overlaps.
- The engine. Three batches, one holder at a time, with the world-tick parity test between them. The tests named are real.
- The numbers in the plan and the sitting are carried right. Run 44931089433 reads 1.263 and 1.579 in the plan, the sitting and the tool's patch file. The 756 red rows add up. The arithmetic in S-11 and S-14 is right. Whether the runs themselves still stand is finding A-0.
- The sitting. No option carries a hidden recommendation. Costs are labelled.
- The first hour. Rechecked against the game's data on six points. It holds.
- Money. No paid XP boost. No Crowns earned in play except the test Crowns you granted. No wipe proposed anywhere.

**What you answer.** S-15, S-17 and the new S-18 now. S-11, S-12 and S-14 after the replay, with its numbers in them. S-18 is in `04-sitting-additions.json`, in the same shape as the second sitting. Part C raised one more candidate, whether accounts that paid gold for hero slots get it back. That one is not yours to answer again. You ruled on 2026-11-07 and 2026-11-09 that changes land on characters as they stand with no protection and a plain line in the note, and a refund would be a grant. So there is no refund, and the note says so (L-01).

## 1. Findings

Severity. BLOCKER is fixed before wave 1 or before the sitting is answered. FIX is fixed before its lane starts. NOTE is for information.

| Id | Severity | Area | What | Evidence | Smallest fix, and owner |
|---|---|---|---|---|---|
| A-0 | BLOCKER for S-11, S-12 and S-14. FIX before anything is sized | The measurements | FB-1 fixed two engine stalls (merged at 02364f03a). Every run of the balance pass played the engine that had them. What rests on it. (1) **S-14.** Its evidence is what a party does after one hero dies, which is the path the second bug broke: monsters on the fallen hero held no target and nobody could pick them. "The four died together in every sampled wipe" and "the bow died alone on Wyvern Roost" were both read on that path. JUDGMENT: with the fix more monsters turn on the three who are left, so wipes likely stay wipes, and the Roost case likely changes. Neither is known. (2) **The death counts** behind S-12, the pick of 2.5 and the ladder's 2 hours. A stalled cell reads no death, so it reads safe. After a first death the idle monsters stop killing, so counts lean low. (3) **Level 60 on Deadly.** Chapter 12 section 4.1 point 5 reads which fours hold at Level 60 and says the classes question of S-10 "can rest". Those are stall cells. (4) **The Muster Barrows rows**: its row in the table of edge cells, its top, and its place in the 16 to 34% of lost hunting time. (5) **S-11's seats.** The Deadly reading of 1.579 is taken over checkpoints that include Levels 60 and 75. Not touched: the lone hammer on Normal behind the kill reward, the gear step, and the buff readings away from Level 60, as far as the cache shows | COUNTED in the committed cache `tools/balance-program/balance-matrix-proposed.json`: 12 of 442 cells ended `no_fight`. All 12 are Level 60 fours on Deadly. They include three lineup cells, all five Talents builds, one buff cell and the cell that plays "all come home". The fix commit and the engineer's log: a real settle on the Barrows at Level 75 went from two stalled hunts to none. The full runs' outputs were not read, so the count there is UNKNOWN | FB-3's first job in wave 1, before D-3, D-4 or any dial is sized: make a `no_fight` end a tool red, then replay the full matrix, the death sample at 2.5 and the lineup cells on the fixed engine. Re-issue S-11, S-12 and S-14 with the new readings before they are answered. Reopen S-10's look later if the Level 60 lineups change. The matrix lane and the plan owner |
| A-1 | BLOCKER | Migrations | The plan says 36 files, 1000 to 1035, are staged, about 85 will apply in the window, and that 1000 and the three 1001 files are staged and replaced. Files 1000 to 1008 are applied. Sequences 1018 and 1019 do not exist. The list of staged files this build reverses is also short. It names 1015 and 1016. It misses 1011 (the deed ladder that FB-9 re-prices), and 1013 and 1014 (the Weighhouse opening goal, against the day-one market that FB-9 builds). Part C's C-01 reaches the same count and adds 1009, 1020, 1023 and 1031 as replaced and unlisted. It also finds held files with dates for names (the faction switch, the playtest door, three wipe files) that "every staged migration" must not sweep in (C-06) | COUNTED from `supabase/migration-notes` by both auditors: 11 notes read APPLIED 2026-11-20, 25 read STAGED. The file by file table is in 04c | Correct 13 sections 1.3 point 7, 3.3 and 4. For each reversed staged file say one thing: retired with `tools/chain-retire.mjs`, or applied and then overridden. Say "the numbered chain from 1009" and list the held files as out. FB-5 needs the answer for 1015 in wave 1. The plan owner |
| A-2 | BLOCKER | The sitting | S-13 asks Tyler whether party-wide damage is in the first build, and calls it a new mechanic. It is a design and scope call. It is also not new: whole-party monster spells are built as data rows, ruled on 2026-11-08 | `src/data/monster-spells.js`: shape `group`, with a size and a cooldown on each row. MEASURED, run 44920906999: they are 0 to 8% of a four's damage on nine grounds | Withdraw S-13. S-12 option C already carries its cost. The designer rules it after S-12 is answered, at the data layer first, as the formula brief asks. The game designer |
| A-3 | BLOCKER | The sitting | S-16 asks Tyler whether a rest plan may end in a job with no count. It starts no hunt and does not loop. A job after a hunt was ruled on 2026-11-15, paid training included, and heroes working all 12 rested hours was ruled on 2026-11-21. Two lanes wait on it | The rulings of those dates. 13 section 5 | Withdraw S-16. The designer rules it, lists it as reversal row 27 for veto, and FB-6 and FB-10 do not wait. The game designer |
| A-4 | BLOCKER | Numbers | The sitting reads run 44931089433: seats 1.263 and 1.579, a safe Deadly four 25% ahead, Level 400 on day 305, 382 or 477. Chapters 00, 05 and 12 and `decisions/all.json` still print the run before it: 1.266 and 1.492, 18% ahead, day 326, 400 or 472 | COUNTED by search: 13 stale places in 00, 05 and `all.json`, and section 7 of chapter 12 | The edits of section 2. Chapter 12 keeps its text as the record and gains one line at the top that points to the newer run. The integrator |
| A-5 | BLOCKER | The sitting | The plan never sizes the playtest. Its nine measures need players. S-17 option B says test Crowns measure whether players with gold want Crowns, and gives no number of accounts or Crowns | 13 section 3.5. COMPUTED: the Talents test alone asks for about 30 accounts | Add S-18. Add to S-17 option B: "UNKNOWN on a handful of accounts", and that the amount of the grant is his to name. The plan owner |
| A-6 | FIX, before FB-5 and FB-7 | The first hours | The first Dangerous offer is at Level 8 on Wickstead, and the tier's risk line reads a mid-geared four. A new company wears the arrival kit. On that ground and tier a mid four reads 142 deaths in 1,000 hours and an arrival four wipes. So the first harder tier the game offers kills the company it is offered to, and the line beside it says something milder. No lane owns the rule for when a harder tier is first offered | MEASURED, runs 44925664434 and 44928035806. Chapter 08 sections 2.3 and 2.5 | D-1 rules the Path row. The risk line reads the gear state the party wears, which the matrix already holds as three states. One of FB-7 or FB-8 is named owner of the first offer. The game designer |
| A-7 | FIX, before FB-13 | The world boss | Your ruling of 2026-11-21 says shared-world rewards are buffs and gear. Chapter 00 keeps the first boss's gear line in the first build. The plan's list of what waits moves every boss gear line and the fall buff out. The sample boss could ship paying a trophy and a plaque | 00 section 1.1 against 13 section 1.2 | 13 section 1.2 reads "boss gear lines past the first". D-6 puts the first line, or a buff, in the chest. The plan owner and the game designer |
| A-8 | FIX, before wave 2 | Scope | 77 of the 159 decision rows are named nowhere in the plan, and 40 of them are DECIDED. They are neither in a lane nor on the list of what waits. Two rulings have the same gap: Luck (numbers approved 2026-11-20, its lane parked) and the unbuilt phases of the itemization plan, which you asked on 2026-11-21 not to forget. The plan never mentions either | COUNTED by script against `decisions/all.json`. Search of 13 for "Luck" and "itemization": no hit | One field on every row of `all.json`: the lane, the staged file it rides, or what it waits on. Two rows added to 13 section 1.2 for Luck and the itemization phases. Nothing is cut. The integrator |
| A-9 | FIX, before FB-9 | The market | The market opens on day one, so the town's shared Weighhouse project has nothing to open. The decision says the project "builds something else". Nobody owns what | GR-55 in `all.json`. Staged 1013 and 1014 | Added to D-5. The game designer |
| A-10 | FIX, before wave 5 | Balance once | The Level law is fitted in FB-8, before Talents land in FB-11. Wave 5 re-runs "both generated data files". The Level law is a third generated file and is not on that list. Talents are meant to be part of the plain hero the law is fitted on | 13 sections 2.3, 2.6 and 3.1. Chapter 10 section 0 | Wave 5 re-runs all three generators. The plan owner |
| A-11 | FIX, before wave 5 | The release window | About 75 files apply one at a time and the edge deploys after them. Between the first catalogue and the deploy, running hunts sit on the old engine with new catalogues. The rehearsal names no tool and does not include the edge | 13 section 3.3. JUDGMENT on the plan's own line that every hunt's world restarts at the deploy | Add one step: what running hunts do during the window. Name `tools/restore-drill.local.mjs` for the rehearsal and rehearse the edge on the copy. The Coordinator with the reliability engineer |
| A-12 | FIX, before FB-4's second half | Server cost | The 10 minute save waits for the flush to "bake one nightly". With one release nothing bakes on production before both ship together | 13 section 2.6, FB-4 | Ship the 10 minute save behind its switch and arm it after one production night. The reliability engineer |
| A-13 | FIX, before FB-11 | Talents | A hero's first five points are worth nothing it can see, and the first unlock comes at Level 15 at the earliest. An empty build reads the same pace as the suggested one at Level 25. For hours 6 to 20 the system Tyler added is a panel that changes nothing | MEASURED, run 44920906999, chapter 12 section 3.10 | D-9 rules the curve's half point before FB-11 starts, not after. Chapter 12 computed that a half point at rank 4 makes the first points worth about 3%. The game designer |
| A-14 | FIX, before waves 2 to 4 | Art | Only FB-5 and FB-12 carry the art director. The company card, the return card, the hunt report, the Talents panel, the boss and its room, chest pieces and trophy, and any new item row in the Level 110 band have no art or asset owner. The visual gate is in wave 5, which is late to find a generic screen | 13 section 2.6 | Name the asset director on FB-13 and on FB-8 if it adds item rows. The art director reads each new screen when its lane lands. The plan owner |
| A-15 | FIX, before FB-9 | Tests | FB-9 re-prices the stamina refill and has no test with the hunt viewed and one with the browser closed | 13 section 2.6, FB-9 | Add the pair. The backend architect |
| A-16 | FIX | The decisions file | `counts.decided` reads 138 against 51 by status. `firstBuild.waits` still lists on-call heroes as waiting and the Blessing ladder at five hours. Chapter 00 section 5.0, row S-4, still prints a ceiling of 1.74 and 1.44 that chapter 12 measured at 1.29 to 1.48 | COUNTED from `all.json` | The edits of section 2. The integrator |
| A-17 | NOTE | Rulings | Section 1.3 of the plan says none of its scope calls bends a ruling. Two do, and both are on the reversal list that was let stand in about a second each: account prices re-read for four heroes (row 15) and the market on day one (row 12). The gear band of +17% (row 5) and town work in closed form (row 16) are built on the same thin yes | 00 section 5.3 | Say so in 1.3. No new question. They were put to him and stand |
| A-18 | NOTE | The date | The engine changes hands seven times, each behind a green run and a matrix diff, and FB-14 waits on five lanes. JUDGMENT: waves 1 to 3 fit the end of December and wave 4 is at risk. The plan's answer is right: FB-15, FB-14 and FB-13 ship dark if it slips | 13 sections 2.3 and 4 | The Coordinator names the day by which wave 4 must have started |
| A-19 | NOTE | The game | For a mid-geared four, Dangerous pays 2.1 to 3.0 times Normal and almost never kills from Level 10. Normal is then only the tier for a new or lone company, and picking a tier is a gear check, not a choice. That is what "strong enough or not" asks for (2026-11-08). It is worth knowing before S-12 is answered | MEASURED, runs 44920906999 and 44928035806 | None |
| A-20 | NOTE | The game | With a short list of accounts the day-one market and the clan browser will be empty rooms, and a clan costs gold and pays nothing until the castle | JUDGMENT | The empty states say what the room is for. Tied to S-18 |
| A-21 | NOTE | Security | The list for the one review names the staged chain as a block. Four staged files are surfaces of their own: 1014 (a shared money surface, by its own note), 1017 (a farm sink and XP path), 1024 (one press that moves gold and items) and 1026 (a sweep that starts hunts every minute) | COUNTED from the notes | Name them in 13 section 3.6 |
| A-22 | NOTE | Scope | On-call heroes were not in the first build the review named. The plan adds them at its brief. It is the only cross-account write and the lane with the most lanes in front of it | 13 section 1.3 point 1 | It is the first lane to ship dark |

**From Part C, the existing game.** Its ids are kept. The full rows, with files and line numbers, are in `04c-existing-game-coverage.md`. I agree with all three of its blockers.

| Id | Severity | Area | What | Evidence | Smallest fix, and owner |
|---|---|---|---|---|---|
| T-01 | BLOCKER | The gate | `next` is red in all five runs read. Level hours and party class XP are red against contracts this build replaces. The armor line is a real defect on hidden content. A stale dead-export baseline, a boot-size ceiling and one chat test have no owner | MEASURED by Part C: `gh run view --log-failed` on runs 44891464929 to 44930255616 | One short test lane clears T-04 to T-07. The plan names T-02 and T-03 as red by design until FB-8 and the lane that takes M-01, and says which run gates engine batch 1. No guard is loosened. The QA engineer and the plan owner |
| M-01 | BLOCKER | Rulings | Party XP by size alone (ruled 2026-11-21, S-10) has no lane. FB-2 folds the party table in wave 1 as a step that moves no number, so the classes table would be folded in whole. Its guard holds the rule that was replaced | Part C, by search of the plan and the tree | FB-2 takes it as a step that moves numbers, beside the fold, with the nine files Part C lists and the guard rewritten with a mutation proof. Decided before FB-2 starts. The plan owner |
| D-01 | BLOCKER | File ownership | The rested bank is removed by FB-2 in wave 1. Its settle is in the edge's `index.ts`, in the `accrual` files FB-4 holds in the same wave, in two files FB-10 holds in wave 2, and in `progression.js` and `perks.js`, which no lane holds | Part C, by search | A rested row in 13 section 2.2 with one writer a wave. FB-2 goes first on the shared lines. The plan owner |
| D-02 to D-06, T-09 to T-12 | FIX | File ownership and tests | Five more places where a lane must edit files it does not hold: training is a hunt today and FB-10 holds none of its files, Setup slots are already built and priced, the party finder is imported by the party window, three modules sit on the 600 line cap, and six registries every new window edits are in no row. About 70 tests that the plan's changes turn red are named in no lane | Part C sections 2.1 and 2.3 | The edits Part C gives for each, in 13 sections 2.2 and 2.6. The plan owner |
| L-01 to L-08, C-05 | FIX | Live characters | The release lands on characters as they stand. Nobody owns what that does to them. The worst is L-02: a kit granted "once" by a new marker would pay every existing account 500 gold again. Then L-04: every hero's Level moves and worn gear is gated only at equip time. Then L-03 and L-05: the tutorial would replay or never play, and a live clan function would point at dropped columns between two lanes. Chapter 09 also says the Level curve lands at the wipe, which the plan does not assume | Part C section 2.6. Sizes are UNKNOWN until the Coordinator runs its read-only queries | One row for each in the lane that causes it, with the rule and the line for the release note. No refund and no protection code, as ruled on 2026-11-07 and 2026-11-09. Chapter 09's line is corrected to the plan's. Each lane named in 04c |
| C-02, C-04 | FIX | Staged files | Staged 1026 adds a sweep every minute and job counts that FB-10 rewrites. Staged 1025 resets the leave rule that S-14 may change again | Part C section 2.4 | FB-10 owns 1026 once S-16 is ruled by the designer. 1025 holds its shape until S-14 is answered. The plan owner |
| M-02, M-03, M-05, M-08, X-01, X-02 | FIX | Scope | Player text made false in files no lane holds. The Level 110 band has two built grounds flagged staged, and nobody says whether they open. Factions hang on that and the plan never mentions them. Four operator tools read the journal row by row. Premium for the account is ruled and is built only if S-17 is b. Sixteen cut House rungs would be re-priced before they are removed. The charm ladder and collection log are half cut | Part C sections 2.2 and 2.5 | The edits Part C gives. The designer rules M-03 with D-3. PREM-1 moves out from under S-17. The plan owner |

**Where the two halves found the same thing.** A-1 is C-01. A-9 is M-06 and C-03. A-14 is M-04. Each is one finding and is fixed once. Part C's M-07 makes A-9 smaller: the market's door today is one config row.

## 2. For the plan owner and the integrator

**The second sitting, `review/03-sitting-2.md` and `.json`.**
- Hold S-11, S-12 and S-14 until FB-3 has replayed the runs on the fixed engine. Then carry the new readings into them, with the run id.
- Remove S-13 and S-16. Add a line under the table: the designer rules both and reports them.
- S-17 option B: add "UNKNOWN whether a handful of accounts can answer this" and "the amount granted is yours to name".
- Add S-18 from `04-sitting-additions.json`.

**`13-build-plan.md`.**
- Section 0 and section 5: the questions are S-11, S-12, S-14, S-15, S-17 and S-18. Move S-13 and S-16 to section 2.4 as designer rulings.
- Section 1.2: "Boss gear lines past the first". Add two rows: Luck (ruled 2026-11-20), and the unbuilt phases of the itemization plan.
- Section 1.3: point 2 and point 3 name their reversal rows, 15 and 12. Point 7: 11 files applied and 25 staged, and the full list of reversed staged files with what happens to each.
- Section 0, 2.6 and 4: FB-1 is done, at 02364f03a. FB-3 gains the replay as its first wave 1 job, and a `no_fight` end reads as a tool red. No dial, ladder rung or generated file is sized on a run older than the fix.
- Section 2.4: D-1 gains the first Dangerous offer and the gear state the risk line reads. D-5 gains the Weighhouse project. D-6 gains "the chest pays gear or a buff". D-9 moves before FB-11 starts.
- Section 2.6: FB-9 gains the viewed and closed pair for the refill. FB-4's second half ships behind a switch. FB-13 and FB-8 name the asset director. FB-15's header and its last sentence agree on what happens under S-17 option C.
- Section 3.1: three generated files re-run in wave 5.
- Section 3.3: the count of files, the tool for the rehearsal, the edge in the rehearsal, and what running hunts do in the window.
- Section 3.5: one line on how many accounts each measure needs.
- Section 3.6: name 1014, 1017, 1024 and 1026.
- Before wave 1: one test lane for T-04 to T-07. Section 2.3 names the runs that are red by design and what gates engine batch 1.
- FB-2: party XP by size alone as a number-moving step (M-01). Section 2.2: a rested row (D-01).
- Every other edit of Part C, by its id: T-09 to T-12, M-02 to M-06, M-08, D-02 to D-07, C-02 to C-06, X-01, X-02, X-04, and a live-state row in each lane for L-01 to L-08.
- Section 3.3: no refund for bought hero slots, and the release note says what moved on existing characters.

**`00-the-game.md`.**
- Section 1.1, the table of what waits: the Blessing ladder's threshold reads "2 hours, sized in chapter 12, PROVISIONAL". On-call heroes leave the last row.
- Section 5.0, row S-4: the measured ceiling, 1.29 to 1.48.
- Section 5.5 and section 6.2 row 13: 1.263 and 1.579, run 44931089433. Add S-18. Mark S-13 and S-16 as the designer's.

**`09-platform-and-measurement.md`.** Row R13 no longer says the Level curve lands at the wipe (C-05).

**`05-progression.md`.** The seat numbers and days of run 44931089433 in place of 1.266, 1.492, 516 hours, and days 326, 400 and 472.

**`12-balance-pass.md`.** Two lines under the title. Section 3.5 and section 7 item 1 are superseded by run 44931089433, read in chapter 13. Every death number, the Level 60 lineups of section 4.1 and the Muster Barrows rows were played before the fix at 02364f03a and wait on the replay.

**`decisions/all.json`.**
- `openForTyler`: 12-7-1 reads 1.263 and 1.579. Add S-18.
- `firstBuild`: on-call heroes move from `waits` to `plus`. The ladder row reads 2 hours.
- `counts`: recount.
- Every row gains where it is built: a lane, a staged file, or what it waits on.

## 3. What was checked, and what was not

**Read whole.** CLAUDE.md. The design standards. Chapters 12 and 13. Both sittings. The critical review. The four-hero hour. Chapter 00 sections 1, 2, 5 and 6. Chapter 08 section 2.1 to 2.6. The rulings of record from 2026-11-18 to 2026-11-21, and searches before that for the wipe, Premium, area damage and the rest plan.

**Read by script.** `decisions/all.json`: every row's id and status, 11 rows in full, and the fields `counts`, `openForTyler`, `firstBuild`, `openDesignItems`. Every file and test named in the plan's fifteen lanes, against the tree. The notes of all 36 sequence-named migrations.

**Checked against the code.** The tier data, the monster spell rows, the start kit, the Cellar's end Level, the Homestead's cost, the tools the plan names, the clan migrations of 2026-08, the beta Premium migration.

**Not read whole.** Chapters 01 to 07, 09, 10 and 11, read by heading and search only. The framework audit. Studies 44 and 48. A stale sentence in those chapters may remain.

**Not done.**
- Nothing was played. The first hour was walked on paper against the data.
- No run was repeated, and none was replayed on the fixed engine. Finding A-0 is a judgment on which conclusions lean on the stalled cells, from one committed cache of 442 cells and the fix itself.
- Run numbers were traced to the plan, the sitting and the patch file, not to the run's own output.
- The size of each lane and the count of new migrations are the plan's JUDGMENT and were not re-estimated.
- S-16's figure of 2.1 to 4.4 rested hours was traced to chapter 11 and not recomputed.
- The existing game was audited by the second auditor, not by me. I read Part C whole and checked its largest claim, the staged chain, against my own count. I did not re-run its searches or read its five GitHub runs.
- Production was not read by either half. Every size in Part C's live-state rows is UNKNOWN.
