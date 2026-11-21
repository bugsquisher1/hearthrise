# 04c. The existing game against the book and the build plan

Written 2026-11-21 on `lane/d-pre-wave-audit-coverage`, cut from `set/v0.2.144` at b017ef252. Docs only. No game code, data, migration, tool or test was changed. Production was not read.

This is the "existing" half of the audit asked for on 2026-11-21 before wave 1. The inventory in the appendix was built from the code first. The book (`00` to `12`, `decisions/all.json`) and the plan (`13-build-plan.md`) were read after it and compared row by row.

Labels. MEASURED is a run, a script over the tree, or a GitHub log that was read. COMPUTED is a count or arithmetic on named files. JUDGMENT is a reading. UNKNOWN means nobody knows yet, with the query that would settle it. Today's code is used as evidence of what exists. It is never used as a target.

## 1. One screen

**Inventory.** 96 systems, surfaces and guard groups (appendix A). COMPUTED from the tree.

| What the book and plan do with them | Count |
|---|---|
| In a first-build lane | 37 |
| In a first-build lane by name, but the lane does not hold the files that carry it | 6 |
| Waits, with what it waits on written down | 8 |
| Kept as it stands by a ruling or a decision row | 20 |
| Cut by a ruling, with a lane that removes it (both lanes lack files, D-01 and D-04) | 2 |
| Cut by a ruling or the book, and no lane removes it | 2 |
| NOTHING: neither the book nor the plan says what happens to it (two of the nine need no change) | 9 |
| Guard groups, tools and shared files, judged in the findings and not as game systems | 12 |

So the book and the plan account for 73 of the 84 game systems and surfaces. 11 are not accounted for. COMPUTED from the appendix. A row counted as "in a lane" can still carry a finding.

**Findings.** 47 rows.

| Flag | BLOCKER | FIX | NOTE |
|---|---|---|---|
| TESTS | 1 | 10 | 1 |
| MISSING | 1 | 5 | 2 |
| DOUBLE | 1 | 5 | 1 |
| CONFLICT | 0 | 6 | 2 |
| DEAD | 0 | 2 | 2 |
| LIVE STATE | 0 | 6 | 2 |
| Total | 3 | 34 | 10 |

**The three blockers.**

1. **T-01.** The integration branch has been red on GitHub in all five runs read. Four steps fail in every one of them (Level hours, party class XP, the armor line, and from the second run the boot path), the dead export census in four, and three in-page steps once each. The plan's own rule (2.3) lets nothing into the engine between batches until one run on `next` is green. Three of the reds are owned by lanes of waves 2 and 3, and four have no owner. Wave 1 cannot close its engine batch on a red branch.
2. **M-01.** Party XP by size alone was ruled on 2026-11-21. No lane owns it. FB-2 folds the same table in wave 1 as a step that "moves no number", so the classes table would be folded in as it stands.
3. **D-01.** The rested bank leaves in FB-2 in wave 1. Most of its code sits in edge files that the plan gives to FB-4 in the same wave, and in files no lane holds.

**The largest plain fact.** The plan's section 1.3 item 7 says 36 migrations are staged. 11 of them are applied (1000 to 1008). Four of the files the plan says it "replaces" (1000 and the three 1001 files) are live today. Finding C-01 has the file by file table.

**What the plan does well.** Every existing file the plan names exists (MEASURED: 184 paths named, 4 missing, all 4 marked new). The clan RPCs the plan builds on do exist in the live image.

## 2. Findings

Severity. BLOCKER is fixed before wave 1 starts. FIX is fixed in the plan or in a lane before that lane starts. NOTE is for information.

### 2.1 TESTS

| Id | Sev | What | Where | What the plan says | Smallest fix |
|---|---|---|---|---|---|
| T-01 | BLOCKER | `next` is red. Runs 44891464929, 44915263102, 44923311869, 44929856921 and 44930255616 are all red. Rows T-02 to T-08 give each cause and owner. The oldest run also failed job in-page-41 once, which I did not read. MEASURED: `gh run view --log-failed` on all five | `.github/workflows/smoke.yml` jobs db-replay-8, economy-selftests, client-guards, client-guards-2, client-guards-3, in-page-45, in-page-2 | 2.3: between batches one run on `next` must be green. 3.1: a red is fixed forward by the lane that wrote it | One short lane before wave 1 that clears T-04, T-05, T-06 and T-07, and a plan line that says which wave-1 run is the gate while T-02 and T-03 stay red by design until FB-8 |
| T-02 | FIX | Level hours. `C2: Level 100 takes 532.2 h at the reference rate, target 600 h (-11.3%, tolerance +10.0%)`, C3 and C5 with it. Cause: the set's staged combat changes (the to-hit ratio and the spell rule) raise kills an hour, and the Level contract was pinned before them. JUDGMENT on the cause, MEASURED on the numbers. It is a real drift against a contract the book replaces (the Level law, R13) | `tests/level-curve.mjs`, job db-replay-8 | FB-8 stage 3 lists `tests/level-curve.mjs`. That is wave 3 | Name it in the plan as red by design until FB-8 stage 3, or move the re-pin into FB-2. A guard is never skipped to get green, so the plan must say which |
| T-03 | FIX | Party class XP. Two harder-tier mixes are off their bars: a mixed four on Carter's Rest on Dangerous earns 0.989 of the same heroes alone, and a four on the Ox Road on Deadly reads 2.53 times the pace contract against a cap of 2.5. Both grounds are staged and hidden. The guard holds the 2026-10-31 classes rule, which the ruling of 2026-11-21 (party XP by size alone) replaced. So it is a guard that contradicts a newer ruling, and it also holds a 2.5 cap the tier table will move | `tests/party-class-xp-line.mjs`, job economy-selftests. `src/data/party-class-xp.js` | NO lane. See M-01 | The lane that takes M-01 rewrites this guard to the size-alone table with a mutation proof |
| T-04 | FIX | Armor line. Six unique armor pieces read 100.07% to 100.60% of the line on Wyvern Roost at Level 125 and the Catacombs at Level 165. Both grounds are staged. Cause: the line moved under the staged combat changes and the pieces were not re-cut. A real data defect on hidden content | `tests/armor-line.mjs` rule AL3, job client-guards-3 | FB-8 stage 1 re-cuts uniques at exchange rates (R11) in wave 2. It does not name `armor-line.mjs`, `weapon-line.mjs` or `temper-uniques.mjs` | Add the three guards to FB-8's tests. Until then it is red by design and the plan should say so |
| T-05 | FIX | Dead export census. `DEAD-3 STALE baseline export "src/data/blessings.js blessingPrice"`. The export is used again (`src/data/blessings.js:64`). Earlier runs showed the same for `src/core/xp.js skillCapOf` and `totalLevel`. A stale baseline, not a defect | `tests/dead-exports.baseline.json:32`, job client-guards | FB-2 lists `tests/dead-exports.mjs`, for its own deletions | Run the guard's own `--write` in the pre-wave lane of T-01 |
| T-06 | FIX | Boot path ceiling. `SITE-10 a player now loads 197.9 KB gzip (ceiling 197.9) to the sign-in stage`. Red since about 3bcd313d5. A real ratchet: something reached the sign-in path | `tools/build-site.mjs`, `tests/boot-path.baseline.json`, job client-guards-2 | NO lane. FB-5 changes creation and sign-up screens and will push the same ceiling | Find what grew and move it off the boot path, or raise with the tool's own `--boot-path-raise` and its reason. Pre-wave lane |
| T-07 | FIX | Chat. `CW-12 [1440x900] opening Chat again put the picks [false]`. New on 764364d34, a merge that changed tools only. So the cause is in the test's timing or state, not in that merge. JUDGMENT. A red in-page test is a P1 by the testing rules | `tests/chat-social.mjs:632`, job in-page-45 | FB-12 lists `tests/chat-social.mjs` in wave 3. FB-5 changes how Chat stands open in wave 1 | Fix at its source in the pre-wave lane, before FB-5 edits the same behaviour |
| T-08 | NOTE | Training window, once, on 14a8984a0. `TR-9 while the Stop pends the window reads "Leaving in 6s" ... bar "Leaving in 7s"`. Two reads of one countdown a tick apart. A clock race in the test | `tests/training-window.mjs:241`, job in-page-2 | FB-10 holds the training screens in wave 2 | Pin the clock in the test. FB-10 rewrites this window anyway |
| T-09 | FIX | Hero slot guards the plan does not name. `slot-price-guard.mjs` SP-1 asserts that `shops.js` sells three slots for gold, each dearer. `hero-slots-one.mjs` asserts one slot to start. `four-hero-slots.mjs`, `_slots.mjs`, `play-cap.mjs` and `balance-guard.mjs` read the same rows. MEASURED: grep | `tests/slot-price-guard.mjs:14`, `tests/hero-slots-one.mjs:3`, `smoke.yml:3539-3556` | FB-5 names only `tests/hero-slot-buy.mjs` | Add them to FB-5's tests. `slot-price-guard` retires with a written proof that no other guard loses a catch |
| T-10 | FIX | About 20 tests read the rested bank, among them `hunt-sessions-settle.mjs`, `accrue-envelope-away.mjs`, `session-core.mjs`, `gold-intents.mjs`, `clan-journal-guard.mjs`, `perk-channel.mjs`, `room-purpose.mjs`. MEASURED: grep | `tests/*.mjs`, 25 files match "rested" | FB-2 lists `hunt-sessions-settle.mjs` and `dead-exports.mjs` only | Add the list to FB-2 |
| T-11 | FIX | Training is tested as a hunt in 21 test files (`combat-training.mjs`, `combat-training-db.mjs`, `training-gear-db.mjs`, `training-window.mjs`, `mode-death.mjs` and others). Closed-form training turns them red. See D-02 | `tests/` | FB-10 lists none of them | Add them to FB-10 |
| T-12 | FIX | The four clan guards call castle, feast and deposit RPCs that FB-12 hides or drops | `tests/clan-economy-sinks.mjs`, `clan-feast-catalogue-drift.mjs`, `clan-deposit-ownership.mjs`, `clan-journal-guard.mjs` | FB-12 says "the clan tests" | Name the four, and say hidden, never dropped, for anything the castle needs later |

### 2.2 MISSING

| Id | Sev | What | Where | What the plan says | Smallest fix |
|---|---|---|---|---|---|
| M-01 | BLOCKER | Party XP by size alone has no lane. The classes table is live in the engine and on four screens. MEASURED: the plan holds no line with "size alone" or "classes rule" outside 3.5's reader | `src/data/party-class-xp.js`, `src/core/hunt/xp-share.js`, `src/shell/hunt-list.js`, `src/shell/windows/party-roster.js`, `src/data/text/party.js:13-17`, `src/data/hunt-tutorial.js`, `tools/gen-hunt-sessions.mjs`, `tests/party-class-xp-line.mjs`, `tests/party-ui.mjs` | 1.1 row 6 cites the ruling. FB-2 builds "R8's fold" as an identity step. The matrix has `patches/party-xp-by-size.json` | Give it to FB-2 as a number-moving step beside the fold, with the files above, or to FB-8 stage 2. Decide before FB-2 starts |
| M-02 | FIX | Player text that the plan's changes make false, in files no lane holds. "Hero slots: 1 to start, gold buys up to 3 more", "No classes, nothing to pick", the coach's purse goal "Buy a hero slot", the summary's "Next buy: Hero slot", the party window's class line, "Open the party finder" | `src/data/how-to-play.js:37,65,73,84`, `src/data/text/coach.js:86-99`, `src/data/text/slots.js:12-32`, `src/data/text/summary.js:83`, `src/data/text/party.js`, `src/data/text/hunts.js:130`, `src/shell/next-buy.js`, `src/core/goals.js` | FB-5 holds `hunt-tutorial.js` and `tips.js`. The text tables and the next-buy goal are in no lane | Add `how-to-play.js`, `text/slots.js`, `text/coach.js`, `next-buy.js` and `goals.js` to FB-5. Add `text/party.js` to M-01's lane and `text/hunts.js` to FB-12 |
| M-03 | FIX | The plan says "the Level 110 band as the played sample past Krell" and never says whether a ground opens for it. Carter's Rest (110 to 125) and the Ox Road (112 to 128) are built and flagged `staged`. Opening them is what the held file `2027-05-27-arm-factions.sql` waits on, and the book says the faction benefit is ruled to matter and is not sized (02 section 5 item 11). The plan does not mention factions once | `src/data/hunts.js:35` (the `staged` flag), `src/data/grounds/carters_rest`, `ox_road`, `src/data/factions.js`, `src/shell/windows/faction-join.js`, `supabase/migration-notes/2027-05-27-arm-factions.sql.json` | 1.1 row 7 and FB-8 stage 1 | One plan line: the pair opens or it does not. If it opens, a lane owns the un-stage, the faction switch and the faction size. If not, say that tier-110 gear is measured in the matrix only |
| M-04 | FIX | New art has no owner. The weapon cards at creation, the Talents panel, the clan windows, the calendar and above all the sample world boss (a new monster needs a portrait and a world sprite, and a room) pass through the art manifests and `tests/world-assets.mjs` | `src/data/monster-art.js`, `src/data/item-art.js`, `src/data/glyphs.js`, `tools/world-art` | The art director is named for a visual pass on FB-5 and FB-12 only. The asset director is in no lane | Name the asset owner on FB-5, FB-11, FB-12 and FB-13, and put the boss's art in D-6 |
| M-05 | FIX | Operator tools and about 120 tests read `player_ledger` row by row. The hourly journal (FB-4) changes its grain. `vitals.mjs`, `economy-watch.local.mjs`, `char-state.local.mjs`, `hunt-health.local.mjs` are the tools the session rules say to use first | `tools/vitals.mjs`, `tools/economy-watch.local.mjs`, `tools/char-state.local.mjs`, `tools/hunt-health.local.mjs`, 121 files under `tests/` (COMPUTED: grep) | FB-4 holds edge and session files only | Add the four tools to FB-4, and a count of tests that read single rows to its report |
| M-06 | FIX | The Weighhouse. The market window says its building is "still going up" from the Works read, the tutorial has a step "The Weighhouse is open", and the only Town Works project is the Weighhouse. The decision row says the market is open on day one and "the town's first shared project builds something else" | `src/shell/windows/market/state.js:22-25`, `src/data/hunt-tutorial.js:212,506`, `src/data/town-works.js:33` | FB-9 opens the market. Nobody holds `town-works.js`, `windows/havora/works.js` or the window's words | Say in FB-9 whether the Weighhouse stays the project. If it does, only the words move. If not, it is a new project row and its art (M-04) |
| M-07 | NOTE | The market's real door today is a Level, not the Works: `hr_market_config.min_level`, default 10, or a bench skill. "Open on day one" is one config row plus the Security door the decision row asks for | `supabase/migrations/2027-02-13-market-eligibility.sql:13,56` | FB-9: "the market's door" | None. It is smaller than the plan's wording suggests |
| M-08 | NOTE | Premium has no way to be bought today. The only writer is `hr_premium_grant`, owner only. Staged 1032 drops the bond's server half. So if FB-15 does not run, Premium stays per hero and unobtainable, which contradicts nothing a player can see | `src/data/premium.js:4-8`, `supabase/migration-notes/1032-approved-cuts.sql.json` | FB-15 moves Premium to the account only if S-17 is b | Say so in the plan. The account-wide rule was ruled on 2026-11-21 and should not hang on S-17 |

### 2.3 DOUBLE (two owners, or a lane that must touch a file it does not hold)

| Id | Sev | What | Where | What the plan says | Smallest fix |
|---|---|---|---|---|---|
| D-01 | BLOCKER | The rested bank. FB-2 removes it in wave 1 and holds `src/core/rested.js`, `accrue-rested.js` and "its member hook". The bank's settle is 15 references in `hr-accrue/index.ts` (lines 1004 to 1106), and it is also read in `accrual.js`, `accrual-contract.js`, `accrual-window.js` and `tick.js`, which the plan gives to FB-4 in the same wave, and in `accrue-gather.js` and `accrue-artisan.js` (FB-10, wave 2). `src/core/progression.js:22,116` spends a charge on every town XP gain. `src/core/perks.js:265-296` and `src/data/perks.js:89` carry the House Library's rested payload. The server holds `player_state.rested_xp` and `rested_at` inside `hr_apply` and `hr_state_of`. MEASURED: grep | The files named | 2.2: the engine row. `index.ts`, `progression.js` and `perks.js` are in no row | Add a rested row to 2.2. FB-2 goes first on `index.ts` and the `accrual*.js` lines, or FB-4 takes the edge half of R1. One writer in the wave |
| D-02 | FIX | Training is a hunt today. A yard or dummy session is a hunt session on a one-pocket ground, settled by the combat engine (`src/data/training.js:15-21`). The eight training grounds are rows of the hunt index. FB-10 moves training to closed form in wave 2 and holds none of the files that carry it: `src/core/hunt/training.js` (FB-8's in wave 2), `hunt-settle.js` and `accrue-hunt.js` (FB-7's in wave 2), `src/data/hunt-grounds.js` (the training grounds), `monsters.js` (the dummy row), `tools/gen-hunt-sessions.mjs`, `windows/training.js`, `windows/house-dummy.js`. Training items burn "by played time" inside that settle, and the play cap counts a session as a hunt | The files named. `supabase/migrations/2027-04-16-combat-training.sql`, `2027-04-23-training-gear.sql`, `2027-05-20-yard-stop.sql` | FB-10 holds the gather and bench files and `src/data/training.js` | Add the files to FB-10 with the order against FB-7 and FB-8 in 2.2, or split training out of FB-10 into wave 3 |
| D-03 | FIX | Setup slots are built and priced as ruled already: three free, then 15,000 and 40,000. The row is in `gold-sinks.js`, the RPC is `hr_setup_slot_buy`, and it is on the client surface. The plan gives FB-6 "`shops.js` (Setup slot rows)" and a migration for "Setups with the slot purchase" | `src/data/gold-sinks.js:22`, `supabase/migrations/2027-02-28-setup-slots.sql`, `tests/client-intent-surface.mjs` | 2.2 `shops.js` W2 FB-6. FB-6 migrations | Strike the purchase from FB-6 and take `shops.js` out of its row. What is new is the ground's pointer to a Setup |
| D-04 | FIX | The party finder. FB-12 deletes `windows/party-finder.js` in wave 3. `windows/party.js:29` imports four names from it, among them the party window's own scratch. `windows/hunts.js`, `session/party-sections.js`, `session/character-session.js` and the client RPC list (`hr_hunt_party_finder`) name it too. `windows/party.js` is FB-6's in wave 2 and FB-14's in wave 4, and nobody's in wave 3 | `src/shell/windows/party.js:29`, `src/data/text/hunts.js:130`, `tests/client-intent-surface.mjs`, `tests/party-flow.mjs`, `tests/party-ui.mjs` | FB-12 owns "`party-finder.js` (deleted)" | Give FB-12 `windows/party.js` and the three session and window files for wave 3 in 2.2, and name the server RPC's fate |
| D-05 | FIX | Three client modules sit exactly on the 600 line cap of `tests/client-module-size.mjs`: `src/shell/launcher.js`, `src/shell/shell.js` and `src/session/character-session.js`. FB-5 holds `launcher*.js` and must add to it. Any lane that adds one line to the other two goes red. MEASURED: `wc -l` | `tests/client-module-size.mjs:23` | Nothing | FB-5 splits `launcher.js` first. A plan line: no lane adds to `shell.js` or `character-session.js`, new intents go in their own files |
| D-06 | FIX | Shared registries that every new window or RPC must edit are not in 2.2. Three lanes add windows in wave 3 (Talents, clans and calendar, the market's changes) and three in wave 4 (world boss, on call, the exchange) | `src/data/shell-windows.js`, `src/data/text/windows.js`, `src/data/refusal-words.js`, `src/data/settings.js`, `tests/client-intent-surface.mjs` (CLIENT_RPCS), `src/styles/windows.css`, and the generated `src/app/game-modules.js` (`tests/module-preload.mjs --write`) | 2.2 names `smoke.yml` alone as shared on purpose | Add them to 2.2 as append-only shared files, and `game-modules.js` to the list of files a tool regenerates |
| D-07 | NOTE | FB-9 holds "`src/shell/market-*.js`". The market window itself is `src/shell/windows/market/*` (five files). FB-8 holds `blessings.js` but the buy screens are `src/shell/bless-all.js`, `windows/death.js`, `windows/services.js`. FB-5 holds the slot offer but the buy call is in `src/session/account-session.js` and the edge's `unlock-catalogue.js` | The files named | The Owns rows | Widen the three Owns rows |

### 2.4 CONFLICT

| Id | Sev | What | Where | What the plan says | Smallest fix |
|---|---|---|---|---|---|
| C-01 | FIX | The staged chain, file by file. See the table under this one. In short: 11 of the 36 are applied. The plan names 1015, 1000, 1016 and the three 1001 files as replaced. 1000 and 1001 are live, so they can only be followed by forward files. Five more staged files are replaced by the plan and are not on its list: 1009, 1011, 1020, 1023 and 1031 | `supabase/migration-notes/1000` to `1035` | 1.3 item 7, 3.3 step 2, section 4 ("about 85 staged files, 36 already on the set") | Correct the counts (25 staged, 11 applied). List every staged file a lane replaces, and say for each whether the staged file is withdrawn before the window or applied and then followed |
| C-02 | FIX | Staged 1026 gives every town job a count and a THEN by four splices in `hr_apply`, a trigger, and a cron sweep each minute (`hr-job-next`). FB-10 rewrites how the same jobs are paid, and S-16 asks whether a standing job with no count is the usual ending. A sweep each minute also sits against the server budget FB-4 and FB-10 exist for | `supabase/migration-notes/1026-job-counts.sql.json` | FB-6 lists `tests/job-counts.mjs`. FB-10 does not mention 1026 | FB-10 owns 1026: keep, re-cut or withdraw, decided with S-16 |
| C-03 | FIX | Staged 1013 and 1014 size the Weighhouse goal "so a playtest of ten opens its market in about a week". The decision row opens the market on day one and gives the first project to something else | `src/data/town-works.js:17-20`, notes 1013 and 1014 | Not mentioned | With M-06. If the Weighhouse stays as a building only, the two files stand and only the comment is wrong |
| C-04 | FIX | Staged 1025 turns every ticked "leave together" to unset, and its own note asks for a line in the release note. S-14 may reverse the default again | note 1025 | FB-6 cites 1025 under S-14 | Hold 1025's shape until S-14 is answered. One file, not two |
| C-05 | FIX | The book says the Level curve step "lands at the wipe" (09 section 2.2, row R13). The plan lands it on live heroes with no wipe (3.3). The second auditor owns book against plan. It is here because it decides every row of 2.6 | `09-platform-and-measurement.md:193`, `13-build-plan.md:412` | 3.3 says a wipe is the owner's call and the plan does not assume one | One sentence in the plan that names the conflict and which side stands |
| C-06 | FIX | Held files that are not numbered. `2027-05-27-arm-factions.sql` is staged and held until the Morrow Hills open. `2027-02-10-playtest-open.sql`, the two market wipe files and `2027-02-25-character-wipe.sql` are staged for a word from the owner. "Every staged migration applied in one window" must not sweep them in | `supabase/migration-notes/` | 0: "every staged migration rehearsed on a copy of production and applied in one window" | Say "the numbered chain 1009 on" and list the held files as out |
| C-07 | NOTE | Staged 1031's note says scaled hunts "stay dark". The switch was applied for everyone on 2026-11-19 (`2027-05-18-arm-scaled-hunts`). So scaled hunts are live, and the decision row that "switches them on" describes something already on | notes 1031 and `2027-05-18-arm-scaled-hunts.sql.json` | FB-8 holds `scaled-hunts.js` | None beyond knowing it. FB-8's re-cut lands on a live, armed feature |
| C-08 | NOTE | Staged 1012, 1021 and 1028 carry the boss call at no fee. The book folds the boss call into keyed halls, later | notes 1012, 1021, 1028 | Waits | None now. The call stays live until the halls lane |

**C-01, file by file.** Status is the sidecar note's first word. COMPUTED.

| File | Status | What it does | Against the plan |
|---|---|---|---|
| 1000 level-curve-early | APPLIED | Early Level steps re-pinned | Plan says replaced by FB-8. It is live. A forward file follows it |
| 1001 x3 (hunt sessions, scaled hunts, Tower) | APPLIED | XP a kill x0.88 | Same |
| 1002 ops capacity sample | APPLIED | A capacity sample each minute | Stands |
| 1003 dead client writes | APPLIED | Revokes three client-writable tables, `clan_member` among them | Stands. FB-12 should read it before it opens clans |
| 1004, 1005, 1006 | APPLIED | Tick packing, lever horizon, ledger prune | Stand. FB-4 builds on them |
| 1007, 1008 | APPLIED | Trophy Room held | Stand |
| 1009 alpha catalogue | STAGED | Refill steps x1 to x3.5 | Steps are ruled and stand. FB-9 re-types the base and Blessing prices in the same tables. Carried by FB-9's forward file. Not on the plan's list |
| 1010 gold ladders | STAGED | Bag ladder stops at 10 rungs | Stands. Live owners past rung 10: see L-06 |
| 1011 unlock offers | STAGED | Deeds 400 / 25k / 150k / 600k / 2.5M, Shrine rungs held | FB-9 re-types deeds and room rungs for four heroes. Replaced. Not on the plan's list |
| 1012 hunt sessions | STAGED | Boss call fee 0 | Stands. See C-08 |
| 1013, 1014 | STAGED | Weighhouse goal sized to the server | See C-03 |
| 1015 hero slots dearer | STAGED | 400k / 1.5M / 4M | Replaced by FB-5. On the plan's list |
| 1016 level curve new player | STAGED | Level 10 in 6 hours | On the plan's list as replaced. The book keeps Levels 1 to 50 on a lone new hero, so FB-8's generator must reproduce this file's ruled points |
| 1017 tend the field | STAGED | One press farms every plot | Stands. The farm is in no lane |
| 1020 ground tiers | STAGED | Two grounds' own harder-tier dials | FB-8 removes per-ground dials. Replaced. Not on the plan's list |
| 1021, 1022 | STAGED | Called boss rows, lucky find rates re-measured | Carried forward by FB-8's catalogues |
| 1023 scaled hunts | STAGED | Scaled XP bound | Replaced by FB-8 (it holds `scaled-hunts.js`). Not on the plan's list |
| 1024 carry on | STAGED | One press for the account | FB-6 builds on it. It prices Blessings through `hr_blessing_buy`, which FB-8 and FB-9 change |
| 1025 own heroes apart | STAGED | The leave rule unset | See C-04 |
| 1026 job counts | STAGED | A count and a THEN on jobs | See C-02 |
| 1027 to 1030 | STAGED | The spell rule | Stand |
| 1031 scaled hunts | STAGED | Scaled XP bound again | Replaced by FB-8. Not on the plan's list |
| 1032 to 1035 | STAGED | The approved cuts | Stand. 1032 refuses to apply if any account holds what it drops, measured at zero on 2026-11-21 |

### 2.5 DEAD

| Id | Sev | What | Where | What the plan says | Smallest fix |
|---|---|---|---|---|---|
| X-01 | FIX | House rungs the book cuts are still on sale. The owner said yes to cutting the Cellar's five food rungs and the sixteen speed rungs (Kitchen, Forge, Workshop, Library). Today only the Trophy room and, once 1011 lands, the Shrine are held. FB-9 would re-price rungs the book removes | `src/data/homestead-tiers.js:38` (`HELD_HOME_ROOMS`), `src/data/perks.js:16-18` | FB-9: "deeds, room rungs and chests" re-typed | FB-9 adds the cut rooms to `HELD_HOME_ROOMS` (the mechanism of 1007 and 1011) before it prices anything |
| X-02 | FIX | The book says the collection log, the per-monster trophy ladder and the charm ladder are gone (05 section 2, row at line 326). R1 in FB-2 deletes the charm ladder's dead core only (JUDGMENT, from the step's own list in study 44). Still in the tree: `src/data/bestiary.js`, `src/data/bestiary-charms.js`, `src/core/trophies.js`, the client RPC `hr_bestiary_activate` (`src/session/character-session.js:421`), the edge verb `trophy_claim` (in the registry, called by no client), and the `collection_log` switch | The files named. `supabase/functions/hr-accrue/trophy-claim.js` | FB-2 R1, by step name only | List these in FB-2's Owns, or mark each as waiting for the Luck lane. Half of a cut is the worst state |
| X-03 | NOTE | Small approved cuts that wait for a later lane and stay in the game meanwhile: Potato, the Crafting bench's three salts, the Moonbloom seed in the Shop, the unused "resists a weapon" column | `src/data/recipes.js`, `src/data/shops.js`, `src/data/monsters.js` | Not in the plan | One line in 1.2 so they are not lost |
| X-04 | NOTE | Castle, feast, vote, upkeep and work-order RPCs are live server functions (about 40, each with an ungated twin). FB-12 "hides or drops" them. The castle is ruled to be built later, so dropping throws away what the later lane needs | `tests/live-hash-drift.baseline.json` (functions named `clan_*`) | FB-12 | Hide, do not drop, and say it |

### 2.6 LIVE STATE

The release lands on live heroes with no wipe (2026-11-09, and plan 3.3). The plan gives this one paragraph. None of the rows below has an owner. Counts are UNKNOWN because production was not read. The Coordinator runs the queries.

| Id | Sev | The change | Existing data it touches | Owner today | Query that settles the size |
|---|---|---|---|---|---|
| L-01 | FIX | Four hero slots free (FB-5) | Accounts that paid gold for slots 2 to 4. The price rows in `hr_hero_slots`, the ledger rows of each purchase | None. No lane says refund or no refund | `select count(distinct user_id), sum(-delta_gold) from player_ledger where intent like 'buy_hero_slot%'` (the intent name is to be checked against the RPC) |
| L-02 | FIX | The account kit once, the hero kit once a slot (FB-5) | Every existing account already had a start kit under the old rule. A once-only grant keyed on a new marker would pay all of them again: 500 gold and seeds an account | FB-5 writes a once-only self-check. It does not mention accounts that exist | Not a count. A rule in FB-5: existing accounts and heroes are marked as granted in the same migration |
| L-03 | FIX | Tutorial and coach state move to the account (FB-5) | Today it is per hero, in the client residue field `coach` (`src/session/residue.js:284`), stored by `hr_put_client_state`. Without a seed, every existing account meets the first hour again, or never | None | `select count(*) from player_state where client_state ? 'coach'` (column name to be checked) |
| L-04 | FIX | The Level law (FB-8 stage 3) | Levels are derived from `player_state.level_xp` through `hr_level_curve`. Every hero's Level moves. Gear is gated by Level at equip time only (`2027-01-14-gear-by-level.sql:18-26`), so a hero whose Level falls keeps worn gear it could not put on again. The market's Level door, ground bands, the Honor Roll and talent points all read the new Level | The plan says the note tells players. No lane owns the direction or the edge cases | FB-3 can compute old Level against new Level for every XP value from the two curves, with no production read. Then `select hr_char_level(level_xp), count(*) from player_state group by 1` |
| L-05 | FIX | The rested bank dropped (FB-2) | `player_state.rested_xp` and `rested_at`. Banked charges vanish. `clan_rested_grant` still names the columns until FB-12 in wave 3, so between the two lanes a live function points at dropped columns | FB-2 drops. Nobody owns the order with FB-12 or the line in the note | `select count(*), sum(rested_xp) from player_state where rested_xp > 0` |
| L-06 | FIX | Prices re-typed for an account of four (FB-9), the bag ladder cut to 10 rungs (1010), speed rungs cut (X-01) | Deeds, room rungs, chests and bag rungs already bought at old prices. Bag rungs 11 to 29 already owned | 1010 and 1011 keep what is owned. FB-9 says nothing | `select unlock_id, count(*) from player_unlocks group by 1` (table name to be checked) |
| L-07 | NOTE | Clans open (FB-12) | `clans`, `clan_members` and `clan_raids` rows from August, written by the old client. They would appear in the new roster and browser | None | `select count(*) from clans` and `from clan_members` |
| L-08 | NOTE | Smaller ones. Premium per hero (`player_state.premium_until`) becomes per account. Blessings held (`player_blessings`, three tiers) meet a ladder. Town jobs and yard sessions that are running when closed form lands. The Tower's weekly board mid-week when heat leaves. "Leave together" ticks reset by 1025 | The tables named | FB-15, FB-8, FB-10, FB-2, FB-6 in turn. None mentions rows that exist | `select count(*) from player_state where premium_until > now()`. `select active_kind, count(*) from player_state group by 1` |

## 3. What I did not check

- Production. Every LIVE STATE size is UNKNOWN. Two table or column names in the queries are marked "to be checked".
- The SQL bodies of the staged files. I read each sidecar note in full or in part and the headers of nine migrations. I did not replay the chain.
- The 842 migrations one by one. The server surface was taken from `tests/live-hash-drift.baseline.json` (776 `hr_` functions) and from the client's pinned list of 124 RPCs and 14 edge intents (MEASURED by running `tests/client-intent-surface.mjs`, exit 0).
- `supabase/functions/bug-report-bridge` beyond confirming it is one of the two functions the client may reach.
- Each of the 363 test files that `smoke.yml` runs. Guards were sampled by the systems the plan changes. A red I did not predict is likely.
- The cause of T-07 and T-08 inside the tests. Both are JUDGMENT from the log line and the commit that showed them.
- CSS, art files and the world renderer, beyond listing them.
- Chapters 01 to 11 in full. They were searched by system name. A system counted as "kept by a ruling" rests on a line I found, not on a full reading.
- The friend tables. They look keyed by account already (`friend_links`, `friend_requests`), which would make "friends for each account" mostly built. Not verified.
- Whether any lane can meet its migration count. That is the plan's JUDGMENT and I did not test it.

## Appendix A. The inventory

Plan column: a lane id means a first-build lane holds it. "FB-n, files" means the lane is named for it but does not hold the files (the finding is in brackets). WAITS, KEPT, CUT and NOTHING are as in section 1.

| # | System or surface | Where it lives | Plan |
|---|---|---|---|
| 1 | Sign-in, account rules, closed notice, new-version prompt, legal reader | `src/app/sign-in.js`, `closed-notice.js`, `new-version.js`, `legal-reader.js`, `src/net/auth.js` | KEPT |
| 2 | Hero creation, roster, look | `src/app/hero-create.js`, `roster-faces.js`, `character-strip.js`, `hr_create_hero` | FB-5 |
| 3 | Hero slots for gold | `src/app/slot-offer.js`, `src/data/shops.js:59-74`, `hr_buy_hero_slot`, `src/session/account-session.js` | FB-5, files (D-07, T-09, L-01) |
| 4 | The play cap: four at once an account and a network | `2027-01-19-play-cap.sql`, `src/shell/windows/play-cap.js` | KEPT |
| 5 | Start kit | `src/data/start-kit.js`, `hr_start_kit` | FB-5 (L-02) |
| 6 | Tutorial cards, coach line, tips | `src/data/hunt-tutorial.js`, `text/coach.js`, `src/shell/launcher.js`, `src/session/tutorial-sections.js` | FB-5, files (D-05, L-03) |
| 7 | How to play, Wiki, Chronicle | `src/data/how-to-play.js`, `src/shell/wiki-model.js`, `windows/wiki.js`, `src/data/chronicle.js` | NOTHING (M-02) |
| 8 | Next-buy and purse goals | `src/shell/next-buy.js`, `src/core/goals.js` | NOTHING (M-02) |
| 9 | Hunts list and ground cards | `src/shell/windows/hunts.js`, `hunt-list.js`, `hunt-ground-facts.js`, `src/data/hunts.js` | FB-7 for the risk line |
| 10 | Hunt prep, action bar, Setups, presets | `windows/hunt-prep*`, `configure-action.js`, `src/session/preset-*.js`, `player_action_sets`, `player_hunt_presets` | FB-6 |
| 11 | Setup slots for gold | `src/data/gold-sinks.js:22`, `hr_setup_slot_buy` | FB-6, files (D-03) |
| 12 | The combat engine | `src/core/combat-sim.js`, `src/core/hunt/*`, `hr-accrue/hunt-settle.js` | FB-1, FB-2, FB-8, FB-11 |
| 13 | Hunt tiers: Normal, Dangerous, Deadly | `src/data/hunt-tiers.js`, `balance-sheet.js`, `hr_ground_tiers` | FB-8 |
| 14 | Session modes and end reasons | `src/data/session-modes.js`, `hunt-sessions.js` | KEPT |
| 15 | Stamina and the gold refill | `src/data/stamina-refill.js`, `hr_stamina_refill`, `widgets/stamina-buy.js` | FB-9 |
| 16 | Supplies, food, drink, ammunition | `src/data/supplies.js`, `supply-basics.js`, `consumables.js`, `shop_buy` | KEPT |
| 17 | Runes and spells | `src/data/runes.js`, `abilities.js`, `monster-spells.js` | FB-2 (R3), rest KEPT by 1027 to 1031 |
| 18 | Death, the death window, Blessings | `windows/death.js`, `src/data/blessings.js`, `hr_blessing_buy`, `player_blessings` | FB-8, files (D-07) |
| 19 | Party: invite, own heroes, hold, leave together | `windows/party.js`, `party-roster.js`, `src/session/party-intents.js`, 14 party RPCs | FB-6 |
| 20 | Party finder | `windows/party-finder.js`, `hr_hunt_party_finder` | CUT, FB-12, files (D-04) |
| 21 | Party XP by classes | `src/data/party-class-xp.js`, `src/core/hunt/xp-share.js` | CUT by ruling, no lane (M-01) |
| 22 | Hunt view, effects, combat log | `src/hunt-view/*`, `src/world/hunt-scene.js` | KEPT |
| 23 | Hunt summary, end card, analyzer | `windows/hunt-summary.js`, `src/core/hunt/tally.js`, `hr_hunt_analyzer` | FB-7 |
| 24 | Away recap, back in town, Carry on | `src/shell/away-recap.js`, `carry-on.js`, staged 1024 | FB-6 |
| 25 | When the hunt ends, job counts | `src/data/hunt-after.js`, staged 1026 | FB-6 and FB-10, both (C-02) |
| 26 | Loot rules, loot plan, dispatch | `src/session/loot-intents.js`, `hr_loot_rule_set`, `hr_loot_dispatch` | FB-6 |
| 27 | Scaled hunts | `src/data/scaled-hunts.js`, `windows/scale-pane.js`, armed live | FB-8 (C-07) |
| 28 | Boss call | `src/data/boss-calls.js`, `hr_boss_call` | WAITS (C-08) |
| 29 | Keyed halls | `src/data/boss-halls.js`, `hr_boss_hall_enter`, `src/core/hunt/boss-room.js` | WAITS, FB-13 reuses the room |
| 30 | The Burning Tower, its chest and weapons | `src/data/tower.js`, `chests.js`, `tower-weapons.js`, `hr_tower_start`, `hr_chest_open` | FB-2 for heat, rest WAITS |
| 31 | The Unmarked Catacombs | `src/data/grounds/unmarked_catacombs`, `catacomb-armor.js`, `hr_catacomb_start`, staged and hidden | WAITS |
| 32 | Grounds past Krell | `carters_rest`, `ox_road`, `wyvern_roost`, flagged `staged` | NOTHING (M-03) |
| 33 | Factions | `src/data/factions.js`, `windows/faction-join.js`, 5 RPCs, switch off and held | NOTHING (M-03) |
| 34 | Tamsin's tally | `src/data/tally-tasks.js`, `windows/tally.js`, 5 RPCs | FB-6 |
| 35 | Lucky finds | `src/data/hearthfind.js`, `src/core/hearthfind.js` | KEPT |
| 36 | Bestiary, trophy ladder, charms | `src/data/bestiary.js`, `bestiary-charms.js`, `hr_bestiary_activate`, `trophy_claim` | CUT, no lane for most (X-02) |
| 37 | Companions | `src/data/companions.js`, `companion-unlocks.js` | KEPT hidden |
| 38 | Gear tiers, items, uniques, shields | `src/data/gear-tiers.js`, `items.js`, `wave3-uniques.js`, `shields.js` | FB-8 |
| 39 | Special attributes, patterns, fists | `src/data/special-attributes.js`, `patterns.js`, `fists.js` | WAITS |
| 40 | Jewelry, Hallmark, jewel reforge | `src/data/jewelry.js`, `hr_hallmark`, `hr_jewel_reforge` | KEPT, typed prices |
| 41 | Tempering | `src/data/temper.js`, `windows/temper-pane.js` | KEPT, typed prices |
| 42 | Linings (imbuements) | `src/data/imbuements.js` | WAITS |
| 43 | Inventory, bag, pockets, key ring, item lock | `windows/inventory/*`, `hr_item_lock`, `equip` | FB-6 for equip for four |
| 44 | Storage, depot chests, bank moves | `windows/storage.js`, `hr_bank_move`, `hr_storage_chest_build` | FB-9 for prices |
| 45 | Shop, vendor sell | `windows/shop.js`, `shop_buy`, `vendor_sell_many` | KEPT |
| 46 | Market | `hr-accrue/market.js`, `windows/market/*`, 6 edge verbs | FB-9, files (D-07) |
| 47 | Gathering | `src/data/gathering.js`, `hr-accrue/accrue-gather.js`, `tick-gather.js` | FB-10 |
| 48 | Benches and recipes | `src/data/recipes.js`, `src/core/artisan.js`, `accrue-artisan.js` | FB-10 |
| 49 | Bench tax | `src/data/bench-tax.js` | KEPT |
| 50 | Combat training: yard, dummy, training items | `src/data/training.js`, `src/core/hunt/training.js`, `windows/training.js`, 6 RPCs | FB-10, files (D-02) |
| 51 | Farm, soil, water, Tend | `windows/farm.js`, 7 RPCs, staged 1017 | KEPT, a proposal row |
| 52 | House: deeds and rooms | `src/data/homestead-tiers.js`, `perks.js`, `windows/house.js`, `unlock_buy` | FB-9 (X-01, L-06) |
| 53 | The Great Hearth, Inner Flame, named fuels | `src/data/hearth.js`, `hr_hearth_burn` | FB-12 |
| 54 | Town Works | `src/data/town-works.js`, `windows/havora/works.js`, `hr_town_works_give` | NOTHING (M-06, C-03) |
| 55 | Town shows and powders | `src/data/gold-sinks.js:62`, `hr_town_show` | WAITS, one landmark later |
| 56 | Town criers and the paid cry | `src/data/town-criers.js`, `src/shell/town-criers.js`, `hr_crier_send` | FB-12 |
| 57 | The town, presence, stations | `src/world/town-scene.js`, `src/session/town-presence.js`, 4 RPCs | FB-12 |
| 58 | Chat: Global, Local, Party, System, Combat | `src/data/chat-channels.js`, `src/social/*`, `windows/chat*.js` | FB-12 |
| 59 | Whispers, blocks, inspect | `src/social/whispers.js`, `blocks.js`, `inspect.js` | KEPT |
| 60 | Friends | `src/social/friends.js`, `friend_links` | FB-12 |
| 61 | Clans on the server | `clan_*` and `hr_clan_*` functions, `clans`, `clan_members` | FB-12 (X-04, L-07, T-12) |
| 62 | Live events | `src/data/live-events.js`, switches `event_xp_bonus`, `event_open_halls` | FB-12 |
| 63 | Roll of Honor | `src/data/honor-roll.js`, `hr_leaderboard`, `windows/honor.js` | WAITS |
| 64 | Titles | `src/data/titles.js`, `hr_title_buy` | WAITS |
| 65 | Outfits, dyes, hero colors, rename | `src/data/outfits.js`, `hr_outfit_set`, `hr_hero_colors_set`, `hr_hero_rename` | FB-9 for the two prices |
| 66 | Premium | `src/data/premium.js`, `player_state.premium_until` | FB-15, only if S-17 b (M-08) |
| 67 | The rested bank | `src/core/rested.js`, `hr-accrue/index.ts:1004` | CUT, FB-2, files (D-01) |
| 68 | Level curve and skills | `src/core/xp.js`, `progression.js`, `hr_level_curve`, `src/data/skills.js` | FB-8 |
| 69 | Game master tools | `src/session/gm-intents.js`, 10 RPCs, `gm_stop` | KEPT |
| 70 | Alerts, settings, HUD widgets | `src/data/alerts.js`, `settings.js`, `hud-widgets.js` | KEPT |
| 71 | Bug report | `windows/report.js`, `bug-report-bridge` | NOTHING. No change is needed |
| 72 | Share card | `src/shell/share-card.js` | NOTHING. No change is needed |
| 73 | The envelope, residue, storage | `src/session/envelope.js`, `residue.js`, `src/platform/storage.js` | KEPT. Plan 2.5 adds no residue |
| 74 | Edge intents | `hr-accrue/intents.js`: 18 verbs, 14 from the client | FB-6, FB-13, FB-14 |
| 75 | The tick and settle | `hr-accrue/tick*.js`, `accrual*.js`, `hunt-settle.js` | FB-4, FB-10 |
| 76 | The ledger | `player_ledger`, 1006 | FB-4 (M-05) |
| 77 | Feature switches | `hr_feature_switches`: 8 named | KEPT |
| 78 | Observability, session replay, privacy switch | `src/net/observability.js`, `src/data/privacy.js` | KEPT |
| 79 | Landing page | `index.html` | NOTHING. Its text was not checked against the new game |
| 80 | The staged chain | `supabase/migrations/1000` to `1035` | C-01 |
| 81 | Wipe and kill-switch files | `2027-02-20-market-wipe*.sql`, `2027-02-25-character-wipe.sql`, `2027-02-14-market-off.sql` | KEPT held (C-06) |
| 82 | Guards: client shape | `client-module-size`, `layering`, `dead-exports`, `dead-css`, `client-intent-surface`, `module-preload` | D-05, D-06, T-05 |
| 83 | Guards: balance pins | `level-curve`, `party-class-xp-line`, `armor-line`, `weapon-line`, `slot-price-guard`, `start-kit-pace`, `balance-guard` | T-02, T-03, T-04, T-09 |
| 84 | Guards: server | `schema-drift`, `restore-census`, `apply-order-honesty`, `migration-names`, `live-hash-drift` | In every lane's rules (2.5) |
| 85 | Guards: engine | `tests/hunt-core/*`, `world-tick-parity`, `hunt-sessions-settle` | 2.3 |
| 86 | Guards: site | `build-site` SITE rules, `boot-path.baseline.json` | T-06 |
| 87 | In-page suite | 50 `in-page` jobs in `smoke.yml` | T-07, T-08 |
| 88 | Workflows | `smoke.yml`, `nightly-loop.yml`, `pages.yml`, `balance-*.yml`, `perf-measure.yml`, three keep-alive and watch files | FB-3 for `balance-*` |
| 89 | Catalogue generators | `tools/gen-*.mjs`, 28 files | Each lane runs its own |
| 90 | One-screen tools | `tools/*.local.mjs`, `vitals.mjs` | M-05 |
| 91 | Hooks | `tools/hooks/bash-guard.mjs`, `edit-checks.mjs`, `session-brief.mjs` | KEPT |
| 92 | The local world and QA drivers | `tools/qa/local-world.mjs`, `tools/qa/coverage` | Used by the play gate (3.2) |
| 93 | The balance matrix | `tools/balance-program/**`, `tools/balance-sim/**` | FB-3 |
| 94 | Art manifests and the world art pipeline | `src/data/item-art.js`, `monster-art.js`, `tools/world-art` | NOTHING (M-04) |
| 95 | Text tables | `src/data/text/*.js`, `refusal-words.js`, `player-text.js` | Shared, unowned (D-06, M-02) |
| 96 | Window catalogue: 32 windows | `src/data/shell-windows.js` | Shared, unowned (D-06) |
