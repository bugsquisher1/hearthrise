# 13. The build plan: the first build

Written 2026-11-21 on `lane/d-build-plan`, cut from `set/v0.2.144` at 735feda87 and merged up to 86f389b47. This is step 4 of the critical review (`review/00-critical-review.md`, section 8): narrow the first build. Docs only. No game code, data, migration or tool was changed. Chapters 00 to 11 and `decisions/` were not edited.

Labels. MEASURED is a run on the real engine, with its run id. COMPUTED is arithmetic on named inputs. JUDGMENT is a design or planning opinion. UNKNOWN means nobody knows. Nothing here is measured against the game that runs today. Lane sizes and migration counts are JUDGMENT.

Run ids used. R0 is GitHub run 44920906999, R1 is 44924971088, R2 is 44925664434, R4 is 44928035806, and L is chapter 12's local probes (chapter 12, section 1). R5 is 44931089433, the full matrix after the matrix lane fitted the Level law at the ruled points (merged at 86f389b47). On R5 the Dangerous four reads 1.263 times the pace contract and the Deadly four with no death 1.579, where chapter 12 had 1.266 and 1.492. R5 reads 756 RED rows in four causes: the arrival kit 492, armor and best gear 170, sinks beside income 44, and 50 small rows.

## 0. One screen for Tyler

**What the first build is.** The smallest game that holds together, as the review named it, plus Talents and on-call heroes.

1. Four heroes from the first second, a weapon pick at creation, and one first hour taught once for the account.
2. One plan, one Start and one return card for the four, with gear that gets worn.
3. The hunt report with the free risk reading.
4. The formula steps that move no number.
5. Harder tiers that bite, on one tier table, sized once with Talents in.
6. The gear curve to tier 7 and one band past Krell. The kill reward. The Level law. The Blessing ladder.
7. The wage formula, and the prices that four heroes break, read from it. The market open on day one.
8. Town work in closed form, and the server cost fixes in study 48's order.
9. Talents: five tracks and the rank 3 unlocks.
10. The cheap social layer: Global and Clan chat, the clan roster and browser, friends, presence, the calendar with the Hearthrise weekend.
11. One world boss as a sample of one, and on-call heroes with their own hire stamina.
12. Fixes for the four things the four-hero hour broke: no weapon pick, the tutorial repeating for each hero, the first tip hidden under Chat, and a tank that hunted nine hours in no armor.

**What waits.** Nothing is cut. Both arenas, the castle and its Library, boss gear lines, bought boosts and buff caps as final numbers, the priced Crowns book, Necrotic and Storm, fists, sinks as a share of band gold, the market's standing orders, Talent ranks 8 and up. Section 1.2 has the full list and what each waits on.

**How it is built.** 15 lanes, one of them the matrix lane, in four waves of at most four lanes, then one assembly wave. Combat-engine changes go out in three batches, one lane holding the engine at a time. Everything lands on `set/v0.2.144`, is judged on GitHub through `next`, and ships as one big release (2026-11-21): every staged migration rehearsed on a copy of production and applied in one window, then the edge, then `main`. Four lanes can start the day the plan is approved: FB-1, FB-3 and FB-4 at once, and FB-5 once the designer rules D-1.

**What Tyler answers.** Seven questions, S-11 to S-17, in `review/03-sitting-2.json` and its `.md` twin. Each is a place where the plan would bend one of his rulings or where only he can choose.

| Id | The question |
|---|---|
| S-11 | Which four is the Level table's clock: the four on Dangerous or the four on Deadly |
| S-12 | What the ruled death count means, when the engine gives a cliff |
| S-13 | Party-wide damage as part of a tier: in the first build or waits |
| S-14 | When one of your own four falls: the rest hunt on, or all come home |
| S-15 | The five built special rules never put to him (GR-25) |
| S-16 | A standing job as the usual end of a rest plan (reversal row 27) |
| S-17 | Premium and test Crowns in the first playtest |

S-11, S-12 and S-14 are open items 12-7-1 to 12-7-3 of `00-the-game.md` section 5.5, and S-15 is GR-25.

**A note, no answer needed.** Chapter 12's fourth item (open item 12-7-4): the paid edge is smaller in pace than the book said, 1.29 to 1.48 with every cap full and about 1.06 to 1.08 from paying alone (MEASURED, R1 and R2). What a payer gets is the next tier some Levels sooner. "Pay to level 22% faster" is not a true line. If test Crowns run (S-17), the playtest watches what payers actually buy.

## Read log

| Source | How much |
|---|---|
| CLAUDE.md, the professional standard | Whole |
| `review/00-critical-review.md`, `F-framework-audit.md`, `01-sitting.md` and `.json`, `02-four-hero-hour.md` | Whole |
| `00-the-game.md` | Sections 1, 2, 5, 6, 7 and 8 whole |
| `10-level-choices.md`, `11-on-call-and-clan-xp.md`, `12-balance-pass.md` | Whole |
| `01` 2.1, `04` 2.3, 2.7 and 2.10, `06` 2.3 and 2.7 to 2.11, `08` 2.1 to 2.5, `09` 2.2 | Whole sections. The rest by heading and search |
| `decisions/all.json` | Every row's id, status and `waitsOn` by script. 17 rows read in full. The `firstBuild` and `openForTyler` fields |
| `balance-program/44-formula-architecture.md` 7, `48-platform-cost.md` 6 to 9 | Whole sections, as the source of the step and edge-fix orders |
| The rulings of record | The 2026-11-18 to 2026-11-21 block whole, and searches for wipe, Premium, rest plan and area damage. Private. Cited by date only |
| Code | Listings of `src/*`, `supabase/functions/hr-accrue`, `supabase/migrations` (next sequence 1036, staged 1000 to 1035 on the set), `tools/balance-program`, `tests`. Headers of `market.js`, `tally.js`, `premium.js`, `chat-channels.js`, `layering.mjs`, `new-migration.mjs`, `world-tick-parity.mjs`. Every file a lane below owns was checked to exist, except those marked new |

## 1. Scope

### 1.1 Every system in the first build

| # | System | Chapter and rows | Status | Still OPEN in it |
|---|---|---|---|---|
| 1 | Four heroes from the start: free slots, the account kit once, a hero kit once a slot, the weapon pick with pre-filled company | 08 2.1. GR-24, CE-10, C3. Four from the start RULED 2026-11-21 | PROVISIONAL | The cards' measured tags (check C1). The wand card's cost line |
| 2 | The first hour and the Path: tutorial and coach once for the account, the first objective never under Chat, "Raise your company", "safe to close" | 08 2.1, 2.5, 2.6. GR-79, GR-78 | GR-79 PROVISIONAL. GR-78 DECIDED | Path rows for Levels 17 to 29 (08 item 6). What a player who refuses heroes two to four sees (08 item 13) |
| 3 | The company: one plan, one Start, own heroes partied with no invite, the leader, Setups as named kits a ground points to, "Equip upgrades for all four", one return card, the rest plan queue | 08 2.2, 2.4. 11 section 10. GR-80, GR-81, GR-84, GR-48. GR-56a RULED | PROVISIONAL | The rule for gear found mid-hunt (D-2). The "if one falls" default (S-14). The rest plan's ending (S-16) |
| 4 | The hunt report with the free risk reading, and lowest health in the server tally | 08 2.3. GR-66 | PROVISIONAL | Whether the counters fit the session row with no added statement (08 item 10) |
| 5 | The formula steps that move no number: R1 to R5, the floor half of R6, R7, R8 and the two-thirds line, R20, V5 | 01 2.1, 09 2.2. GR-85 DECIDED, GR-86 (R20 only), MM-19 | DECIDED, R20 and MM-19 PROVISIONAL | The five special rules (S-15). The rested bank leaves in R1 (cut, S-9 c) |
| 6 | Harder tiers on one tier table with one pull number a tier: Dangerous pull 5, Deadly pull 8, both blows 2.5 times Normal | 01 2.11, 12 3.1. CORE-1, GR-27, GR-3 RULED | PROVISIONAL. The death count on each ground waits on the playtest | S-12, S-13, S-14 |
| 7 | The gear curve, +17% bands, tiers 1 to 7 and the Level 110 band as the played sample, with the armor curve probe and the arrival kit fixed together | 03 2.2, 2.3, 12 3.6. GR-4 | PROVISIONAL. +17% MEASURED for weapons (L, R0) | The arrival kit, the largest design miss: 492 of R5's 756 RED rows (D-3). Armor and best gear, 170 more. The cost to reforge a unique up a band (03 item 3) |
| 8 | The kill reward on the pace line, with one coin line and one derived number a ground written by a generator | 05 2.3, 12 3.4. GR-5, R9, R12 | PROVISIONAL. Holds from Level 45 (MEASURED, R0) | Whether party grounds' two thirds is high (12 3.4) |
| 9 | The Level law and the Blessing ladder past the third Blessing | 05 2.2, 2.5, 12 3.3, 3.5. GR-6, 6a, 6b PROVISIONAL, GR-6d DECIDED, GR-7 RULED | PROVISIONAL numbers | The seat (S-11). The ladder's threshold, 2 hours (D-4) |
| 10 | The wage formula as the source for prices, the prices four heroes break, the market open on day one | 04 2.3, 2.7, 2.10, 12 3.7. GR-51, CE-4, CE-5, GR-58, GR-55, GR-59b | PROVISIONAL | Gold in the tool is an upper bound (coin reads 1.24 times real, R0). The refill's base hours (GR-58) |
| 11 | Town work in closed form with the yard fee | 07 2.11, 09 2.3. GR-1, CE-7, R5 fee | PROVISIONAL | A town-hour fixture and a load test, both built in FB-10 |
| 12 | The server cost fixes, study 48 steps 1 to 8. Step 2 is already staged and step 6 is row 11 | 09 2.3. GR-1 | PROVISIONAL | The tab's 33.5 seconds, before step 7 |
| 13 | Talents: five tracks, the stat lines, the rank 3 unlocks, Linger, plans, reset | 10. TAL-1 | PROVISIONAL | Every size. The unlocks' engine cost (10 section 12) |
| 14 | On-call heroes with a hire stamina pool | 11 section 1. CH11-1. S-1 and the two pools RULED 2026-11-21 | PROVISIONAL | `onCallXpShare` 0.10, the opening Level (D-8) |
| 15 | The cheap social layer | 06 2.5, 2.7, 2.9. GR-69 RULED, MM-8 (roster, chat, browser), MM-11, MM-20, MM-47, GR-70, GR-72, CE-8, GR-82 | PROVISIONAL and DECIDED | The calendar's rows (D-7) |
| 16 | One world boss as a sample of one | 06 2.3. MM-2 to MM-7 | PROVISIONAL | The boss itself and its chest (D-6). MM-7 waits on a real death rate |
| 17 | Two cheap engine tests: heroes against heroes (MM-41), one boss room at Levels 25, 52 and 75 (GR-30) | 06 2.6, 02 item 6 | MM-41 DECIDED | Their results |
| 18 | Test Crowns and Premium for each account | 04 2.8, 2.9. MM-43 DECIDED, MM-35, MM-36, PREM-1, PREM-2 | PROVISIONAL | Whether it is built at all (S-17) |
| 19 | The "No hits landed" bug: a strong four's hunt ends with no fight | 12 section 9 | A bug | Whether a real four meets it |
| 20 | Party-wide damage as a tier row | 12 4.1, ruling of 2026-11-08 | OPEN | S-13 |

### 1.2 What waits, and until when

| Waits | Until |
|---|---|
| Both arenas, seasons, tickets and gear line (MM-12 to MM-16, MM-38 to MM-40, MM-45, MM-46) | FB-3's engine test shows heroes can fight heroes |
| The castle, its Library and the clan XP room, labor, upkeep, votes, the treasury, the clan board, the standing gift (MM-9, MM-10, MM-44, MM-48, CH11-2) | Clans exist and people are in them |
| Boss gear lines, boss materials, the fall bonus (CE-1, MM-6 past the chest) | The first boss has stood twice |
| Bought boosts, the buff caps and the ceilings as final numbers (MM-24 to MM-26, MM-29 to MM-31, MM-42) | Deadly is sized and one buff is played in a cell |
| The Crowns book as a priced design (MM-33 to MM-37, PREM-2's price) | Test Crowns have run in a playtest |
| Necrotic and Storm, fists, status pairs (GR-16, GR-17, GR-20) | The weapon ways are distinct and Deadly is sized |
| The Catacombs beyond one wing, the Hall of Firsts, Honors (GR-36, GR-62) | The first build is played |
| Sinks as a share of band gold and the yard's rate change (GR-8, GR-54, R16) | The wage is measured against played gold |
| The market's standing orders, the Sell loot rule, the refill buying player stock (GR-50 parts 1 and 2) | Listings are used in the playtest. JUDGMENT |
| R18 drops in hours, R19 the amount pipeline, R21 monsters on the formula, R22 endless modes, R23 | The first build is played. They move numbers or need a yes. JUDGMENT |
| Talent ranks 8 and up, tracks six to eight, the arena build | The sample of five tracks is played |
| The week's castle labor in the rest plan | The castle |
| The engine host before 10,000 accounts | Its own later call |

### 1.3 Scope calls this plan makes

Each is a designer-level call, made here as JUDGMENT. None bends a ruling. Calls that do are in the sitting.

1. **On call is in, the Library waits.** `decisions/all.json` lists "on-call heroes, the Library and the town day rule" as waiting. This plan builds on call, as its brief asks, and the ruling of 2026-11-21 on two stamina pools completes its spec. Its own `waitsOn` (the Security review, a playtest with two clans) can only be met once it is built. The Library is a castle room, and the castle waits on clans existing. The town day rule is built in part: the queue and the ending of S-16, without castle labor. The integrator should update the `firstBuild` field.
2. **Prices: the wage curve and the account prices, not the sink shares.** Pairing 3 of chapter 09 asks that the Level law ship with sinks as a share of band gold (R16). The first build ships the law with the hero sinks still typed (Tempering, Hallmarks, linings), which Tyler kept on 2026-11-18. The account prices that four heroes break by 7 to 12 times (COMPUTED, 12 3.7) are set from the curve.
3. **The market as built, opened on day one.** The account market is built (`hr-accrue/market.js`, its first migration applied). The first build opens it from the first loot and closes one laundering route. Standing orders wait.
4. **The return card reads line providers.** FB-6 builds the card with a seam: a system adds a file that supplies its line, and never edits the card. Talents, on call and the world boss each add one. It is the shape that holds at ten times the systems.
5. **The Path is written once, in wave 1.** FB-5 writes every first-build Path row, each gated on a flag in its own system's data file. No later lane edits the Path table.
6. **Two generated data files read the matrix.** The derived number a ground carries (FB-8) and the tier's risk line (FB-7) are written by generators from the committed matrix cache, with `--check` drift guards. The ground number's generator reads the ground axis with the number held at 1, so a re-run never compounds.
7. **The staged chain from the earlier plan rides this release.** 36 migrations, 1000 to 1035, are staged on the set. Some are replaced here by later files: 1015 (hero slot prices, against four heroes free), 1000 and 1016 (the Level curve, against R13), and the three 1001 catalogues (XP a kill, against R12).

## 2. Lanes

### 2.1 The order

| Wave | Lanes, at most four at once | What it leaves on the set |
|---|---|---|
| 0 | None. Tyler approves the plan and answers S-11 to S-17. The designer rules D-1. Every other ruling of 2.4 lands before its own lane starts | Rulings |
| 1 | FB-1 then FB-2 (one systems engineer), FB-3, FB-4 first half, FB-5 | Engine batch 1. The instrument's band changes, the diff workflow, the engine tests, the arrival-kit run. Read once, the narrow town read, the flush and the hourly journal. Four heroes and the first hour |
| 2 | FB-8 stages 1 and 2, FB-6, FB-7, FB-10 | The gear curve, the coin line, the kill reward and the tier table. The company. The report. Town work in closed form |
| 3 | FB-8 stage 3, FB-9, FB-11, FB-12 | The Level law and the ladder. The wage and prices. Talents. The social layer. Engine batch 2 closes with one death sample |
| 4 | FB-13, FB-14, FB-15 (only if S-17 b), FB-4 second half | The world boss, on call, test Crowns, the 10 minute save. Engine batch 3 |
| 5 | FB-3 and the Coordinator | The full matrix, the death sample, the playtest readers, the visual and play gates, the rehearsal, the release |

FB-3 holds a slot in waves 1 and 5. Between waves it is resumed for short jobs (folding lanes' patch files into the registries, a diff run) in the gap a landed lane leaves. Heavy runs go to GitHub.

### 2.2 Who owns a shared file, by wave

A file has one writer in a wave. A later owner merges the set into its branch first.

| File or folder | W1 | W2 | W3 | W4 |
|---|---|---|---|---|
| The engine: `src/core/combat-sim.js`, `combat.js`, `mitigation.js`, `vitals.js`, `member.js`, `hunt-rewards.js`, `src/core/hunt/*` except `tally.js` | FB-1, then FB-2 | FB-8 | FB-11 | FB-13, then FB-14 |
| `src/core/hunt/tally.js` | | FB-7 | | FB-13 |
| `src/data/balance-sheet.js`, `hunt-tiers.js` | FB-2 | FB-8 | FB-8 | |
| `supabase/functions/hr-accrue/hunt-settle.js` | FB-4 | FB-7 | | FB-4, then FB-14 |
| `hr-accrue/tick*.js`, `accrual*.js` | FB-4 | FB-10 | | |
| `hr-accrue/intents.js` (verbs) | | FB-6 | | FB-13, then FB-14 |
| `src/data/shops.js` | FB-5 (hero slots) | FB-6 (Setup slots) | FB-9 (deeds, rooms) | |
| `src/data/blessings.js` | | | FB-8 (rungs). Prices come from FB-9's price rows | |
| `src/shell/windows/party.js`, `hunt-prep*` | | FB-6 | | FB-14 |
| `src/social/*`, `src/data/chat-channels.js` | | | FB-12 | |
| `src/data/premium.js`, the stamina cap readers | | | | FB-15 |
| `tools/balance-program/**`, `tools/balance-sim/**`, `.github/workflows/balance-*.yml` | FB-3 | FB-3 | FB-3 | FB-3 |

Baselines that tools regenerate (engine-parity, restore-census, the edge size ceiling, the client RPC surface) are re-pinned by whichever lane merges second, with its own tool and the cause proved. Never by hand.

One file is shared on purpose: `.github/workflows/smoke.yml`, where CLAUDE.md section 5 has every lane register its new guards. Each lane adds its own step. A conflicting hunk goes back to the lane that merges second (CLAUDE.md 3.3).

### 2.3 The three combat-engine batches

CLAUDE.md section 3.3b batches and spaces engine changes. Here one lane holds the engine files of 2.2 at a time, in this order. Between batches nothing enters the engine until one GitHub run on `next` is green with `tests/hunt-core/run-all.mjs`, `tests/hunt-core/engine-parity.mjs` (re-pinned by the batch's last lane, each cause proved), `tests/world-tick-parity.mjs` and a matrix diff from FB-3.

| Batch | Waves | Holders in order | Ends with |
|---|---|---|---|
| CB-1 | 1 | FB-1, FB-2 | Identity diffs for R1 to R4 and the R8 fold. Coefficient diffs for R6, R7 and the two-thirds line |
| CB-2 | 2 and 3 | FB-8 (gear, coin, kill reward, tier table, party-wide damage if S-13 a or c), then FB-11 (R20, stat lines, unlocks, the to-hit floor) | One death sample, 4 seeds of 8 hours on 14 grounds, with everything that moves survival in. The tier dial moves one step if it must. This is the one sizing pass the Talents ruling asks for |
| CB-3 | 4 | FB-13 (the boss room), then FB-14 (the guest seat in the settle) | The plain four's diff is empty. Neither mode moves it |

FB-8's stage 1 is data only (the gear curve), so it may start while FB-2 finishes. It takes the engine at stage 2.

The edge is deployed once, in the release window. The world's field list changes, so every running hunt's world restarts once at that deploy.

### 2.4 Where the designer rules first

| Id | Before | What the designer rules |
|---|---|---|
| D-1 | FB-5 | Every first-build Path row and its opener. The wand card's cost line. The weapon cards' tags once FB-3's check C1 reads, a data row FB-5 fills last. Where the first objective sits so Chat never covers it, with the art director |
| D-2 | FB-6 | Gear found mid-hunt: worn at a safe moment in the hunt, or one press on the return card. The leader's default (the front hero). The order of "Needs you" |
| D-3 | FB-8 stage 1, armor half | The arrival kit, from FB-3's coupled run of the armor curve probe, the arrival skill offset and the jewelry share. The band asks 1.15 to 1.35 of the mid kit's damage. It reads 2.2 under Level 45 (MEASURED, R0 and L) |
| D-4 | FB-8 stage 3 | The Blessing ladder's threshold and rungs. Chapter 12 measured 5 hours as too high and sized 2 (COMPUTED on R0) |
| D-5 | FB-9 | Which prices are rows of hours, the refill's base hours, and the account prices set once from the curve |
| D-6 | FB-13 | The sample boss: name, place, room, phases, chest rows and trophy, on the one monster formula |
| D-7 | FB-12 | The calendar's rows for the first months and the Hearthrise weekend's size |
| D-8 | FB-14 | On call's opening Level, the default tier limit, `onCallXpShare` |
| D-9 | FB-11 | The five tracks' ceilings and unlock sizes after FB-3 plays the four stat lines and one unlock |

### 2.5 Rules every lane follows

- Branch from the newest `origin/set/v0.2.144`. Merge the set into the branch and re-test before reporting. The Coordinator merges with zero conflict hunks or not at all.
- A migration is named by `node tools/new-migration.mjs <slug>` at dispatch time (the next sequence today is 1036). Each carries its section 4 self-check and replays on `tests/schema-drift.mjs` with a byte-identical second apply. Staged only. The Coordinator applies in the release window.
- Lanes run plain tests locally and proofs only for the guards they edit (2026-11-21). GitHub judges the rest.
- Anything touching combat, death, hunt sessions, stamina or supplies ships a test with the hunt viewed and one with the browser closed.
- A lane delivers its balance cells as a patch file under `tools/balance-program/patches/` and a short request in its report. FB-3 alone writes `standards.mjs`, `knobs.json` and `proposals.json`.
- Every number a player can act on renders from the server projection. No residue field is added by any lane.
- Finish with a `LANE DONE:` commit listing the tests run, with exit codes.

### 2.6 The lanes

#### FB-1 `lane/a-no-hits`. Lane A. Systems engineer. Wave 1.

| | |
|---|---|
| Builds | The cause and fix of "No hits landed" ending a strong four's hunt: on the Muster Barrows on Deadly at Levels 60 and 75 every seed ended on it, and on Wyvern Roost on Dangerous the three left landed no hit once the bow died (MEASURED, R0 and R2). First decide whether a real four meets it |
| Owns | The file that holds the cause. Candidates: `src/core/combat-sim.js`, `src/core/hunt/targeting.js`, `src/core/hunt/events.js` |
| Migrations | None expected |
| Edge | Yes if the cause is in core, which the edge vendors |
| Authority | No value moves |
| Tests | One regression test in `tests/hunt-core/no-fight.mjs` that fails without the fix, viewed and closed |
| Matrix | The Level 60 and 75 Barrows four cells become readable. FB-3 re-reads them |
| Depends on | Nothing |

#### FB-2 `lane/c-formula-steps`. Lane C. Systems engineer (FB-1's agent). Waves 1 and 2. Engine batch 1.

| | |
|---|---|
| Builds | R1 (dead rules, with the rested bank: `src/core/rested.js`, `hr-accrue/accrue-rested.js` and its member hook), R2 (named constants), R3 (one implementation of each rule, one death function in whole numbers in both runtimes), R4 (a monster row stores its blow), R5's Tower half (no heat), R6's floor half (one power floor), R7 (a tier's dial applied once, one source for hero health), R8's fold and cut with the visible two-thirds line (MM-19, knob `levelShareLine`). The two folds of GR-25 (one roll rule, one tier flag) if S-15 is a or b |
| Owns | The engine files of 2.2. `src/data/balance-sheet.js`, `hunt-tiers.js`, `monsters.js` (the blow column), `tower.js`, `abilities.js`, `runes.js` |
| Migrations | About four: the monster and hunt-session catalogues with the blow column, the Tower catalogue, the rested bank's server half dropped, the XP chain where SQL reads it |
| Edge | Yes |
| Authority | The two-thirds line is computed in the settle from server Levels. The death function is one rule in SQL and core, proven equal |
| Tests | `tests/hunt-core/run-all.mjs`, `engine-parity.mjs` (re-pinned, causes), `tests/world-tick-parity.mjs`, `tests/hunt-sessions-settle.mjs`, the curves' parity at 20 Levels (R3), a two-thirds test viewed and closed (a Level 5 behind a Level 37 four earns about 1.2 times its pace, COMPUTED in 06 2.8), `tests/xp-frac-carry.mjs`, `tests/schema-drift.mjs`, `tests/restore-census.mjs`, `tests/migration-names.mjs`, `tests/apply-order-honesty.mjs`, `tests/dead-exports.mjs` |
| Matrix | `R7-tier-dial-once.json` becomes built. Knob `levelShareLine`. Identity diffs for R1 to R4 |
| Depends on | FB-1. S-15 for the two folds only |

#### FB-3 `lane/b-matrix-next`. Lane B. Systems engineer (the matrix lane). Waves 1 and 5, resumed between.

| | |
|---|---|
| Builds | Already on the set at 86f389b47: chapter 12's band changes 1 to 7, 9 and 10, the Level law fitted at the ruled points, and a manual `balance-diff` workflow with seeds and hours as inputs. Wave 1: band change 8 once S-11 is answered, and change 11 once the book drops check G's last clause (12-7-4). V5: `architecture-register.mjs --check` and `--selftest` in CI. The coupled arrival-kit run for D-3, 4 seeds of 8 hours. Check C1 for D-1. The two engine tests: heroes on both sides of one fight (MM-41), and one boss room at Levels 25, 52 and 75 (the hall check). Mixed-Level and guest-seat cells (MM-19, OC1 to OC3). One unlock in a cell for D-9. Between waves: fold patch files, run diffs. Wave 5: the full matrix on the assembled set, the death sample, both generated data files re-run, and read-only playtest readers (3.5) |
| Owns | `tools/balance-program/**`, `tools/balance-sim/**`, `.github/workflows/balance-*.yml` |
| Migrations | None |
| Edge | None |
| Authority | None. Tools read, never write game data. Production reads are read-only |
| Tests | `balance-matrix.mjs --selftest`, the workflow's own selftest, the register guard's selftest. Proofs only for guards it edits |
| Matrix | All of it |
| Depends on | Nothing. V5's register goes green only after S-15 |

#### FB-4 `lane/c-settle-cost`. Lane C. Reliability engineer. Wave 1, second half in wave 4.

| | |
|---|---|
| Builds | First half, study 48 steps 1, 3, 4 and 5: read once (the settle's party read evaluated once), the narrow town read, confirm in the edge and save at the flush with its written failure case, the hourly journal (one row a hero an hour an activity, from the parked `lane/c-ledger-fold` or retiring it), the plan fixes (indexes for the journal by user and day, the skill and XP curves by XP, the progress key, the hunt limits). An alarm: the settle read's mean beside `db_pct`, red over 40 ms. Second half, after the flush has baked one nightly: the 10 minute save for closed hunts (or 1.2 s of engine time), and the tab's confirm and heartbeat only |
| Owns | `hr-accrue/hunt-settle.js`, `accrual*.js`, `tick.js`, `tick-reads.js`, `tick-contract.js`, `envelope.js`. `src/session/hunt-poll.js`, `town-poll.js`, `live-link.js` |
| Migrations | About four, then about one |
| Edge | Yes |
| Authority | The journal stays the complete record as hourly sums. Every day cap reads the same on a replayed day. Never restore or evict on uncertainty |
| Tests | `tests/per-player-cost.mjs` (statements a save stay 4), `tests/hunt-sessions-settle.mjs` TICK-1, `platform-cost.mjs window` (identical end states and journal sums), `tests/ledger-rollup.mjs`, the midnight both-path arm extended to the day budget, `tests/world-tick-parity.mjs`. Closed path: a hunt that ends unwatched is simulated to its true end and the rest plan starts from that end |
| Matrix | None. Cost, not balance |
| Depends on | Nothing. The second half on one green nightly after the flush |

#### FB-5 `lane/c-first-hour`. Lane C. Backend architect, art director for the visual pass. Wave 1.

| | |
|---|---|
| Builds | Four starter slots at no cost (replaces staged 1015). The account kit once with the first hero, the hero kit once a slot, practice weapons only for a remade hero (CE-10). The weapon pick at creation from the starter set rows, no card preselected, the "Good first hero" mark, heroes two to four pre-filled as shield, staff and bow in one press, the look copy (GR-24). The Path table with every first-build row (1.3 point 5). Tutorial and coach state on the account, never on the hero. The first objective never under Chat, with Chat still open by default (2026-10-22). The Cellar's end card says "Raise your company". "It is safe to close the game" before the first leave |
| Owns | `src/app/hero-create.js`, `slot-offer.js`, `character-strip.js`, `roster-faces.js`. `src/data/start-kit.js`, `shops.js` (hero slot rows), `hunt-tutorial.js`, `tips.js`, a new Path table in `src/data`. `src/session/tutorial-sections.js`. `src/shell/start-open.js`, `window-manager.js` (open rules only), `launcher*.js` |
| Migrations | About three: the slots, the kit grants with their once-only self-check, tutorial state on the account |
| Edge | None expected |
| Authority | Slots and kits granted by RPC from the server catalogue (`hr_start_kit`), once, journalled. The pick sends a starter set id the server checks |
| Tests | `tests/hero-slot-buy.mjs` rewritten to starter slots. A kit test (once an account, once a slot, a remade hero gets practice weapons only). `tests/start-kit-pace.mjs`. The Path guard: every Level 1 to 30 names a next thing within 3 Levels. Tutorial once for four heroes. The first objective visible with Chat open |
| Matrix | Check C3 as a standing cell: the default company, with the four that has no healer printed beside it |
| Depends on | D-1 |

#### FB-6 `lane/c-company`. Lane C. Backend architect (FB-5's agent). Wave 2.

| | |
|---|---|
| Builds | One plan for each hero on one company card, any line set once for all four. One Start that the server expands into the same per-hero starts, including the three recruits' lone Cellar hunts. Own heroes partied by the plan with no invite, a hunting hero joined at its hunt's end and never refused with no way forward. The leader named by the plan (D-2). "If one falls" as one plan line (S-14, and staged 1025). Tamsin's task taken on entry (GR-78). Setups as named kits in priced slots, three free then 15,000 and 40,000 gold (RULED), with each ground pointing to one. "Equip upgrades for all four" on the end card and the return card, and the mid-hunt rule (D-2). One return card with line providers. The rest plan's queue, its ending per S-16 |
| Owns | `src/session/carry-on-intents.js`, `party-intents.js`, `preset-intents.js`, `preset-read.js`, `hunt-after-intents.js`, `hunt-after-sections.js`, `loot-intents.js`. `src/shell/carry-on.js`, `away-recap.js`, `back-in-town.js`, `after-hunt.js`, `hunt-after.js`, `upgrade-plan.js`, `hunt-go.js`, `prep-draft.js`, `setup-words.js`, `windows/party.js`, `windows/hunt-prep*`, `windows/away.js`. `src/data/hunt-after.js`, `basic-setups.js`, `party.js`, `shops.js` (Setup slot rows). `hr-accrue/intents.js` |
| Migrations | About four: the company Start, the party door and leader and the fall line, Setups with the slot purchase, equip for four with the mid-hunt rule and the task on entry |
| Edge | Yes |
| Authority | One Start is one intent through the existing doors and checks. The slot price comes from the server catalogue and is journalled. Equip moves items only between one account's heroes, by RPC, through the server's wield gate |
| Tests | `tests/carry-on.mjs` and `tests/hunt-carry-race.mjs`, viewed and closed. Four hunts from one press, viewed and closed. The party door with a hunting hero. The Setup pointer. The slot purchase self-check. A tank with no armor at the end card is dressed by one press. The return card holds at most three "Needs you", ranked. `tests/job-counts.mjs` |
| Matrix | None new |
| Depends on | FB-5, D-2, S-14, S-16 |

#### FB-7 `lane/c-hunt-report`. Lane C. Backend architect. Wave 2.

| | |
|---|---|
| Builds | GR-66's free risk block: lowest health for each hero with the monster and blow, close calls under a quarter, what ran out and when, each death with its Level XP and hours and what Blessings saved, and the one word Safe, Close or Near death. The tier's own line before Enter, generated from the matrix (deaths in 1,000 hours for a mid four on that ground and tier). The rules block: fired, never fired with the reason, the change line, the share. Lowest health and the tally's three fields in the server tally, so survival can be calibrated |
| Owns | `src/core/hunt/tally.js`, `src/hunt-view/summary-model.js`, `summary-recorder.js`, `death-explain.js`, `src/session/hunt-summaries.js`, `src/shell/result-block.js`, `windows/hunt-summary.js`, `windows/hunt-detail.js`. A new generated tier-risk file in `src/data` and its generator |
| Migrations | About two: the session row counters, the free block of the analyzer |
| Edge | Yes |
| Authority | A read-only projection of server counters. Nothing can be spent from it |
| Tests | The analyzer parity arms extended. The same block for a hunt viewed and closed. The generator's `--check` with a mutant. `tests/per-player-cost.mjs`: no added statement |
| Matrix | The player and the matrix read the same counter. FB-3 re-generates the tier line in wave 5 |
| Depends on | FB-4 first half |

#### FB-8 `lane/c-pace`. Lane C. Systems engineer (FB-2's agent). Waves 2 and 3. Engine batch 2, first holder.

| | |
|---|---|
| Builds | Stage 1, the gear curve (R10, R11): the curve in `src/data` at +17% bands, tiers 1 to 7 as samples of it, the Level 110 band as the played sample past Krell, uniques at exchange rates, the armor half per D-3. Stage 2 (R9, R12): one coin line, XP a health point on the pace line with one kill-rate reference, the derived number a ground carries written by a generator, one tier table with one pull number a tier (Dangerous 5, Deadly 8, both blows 2.5 times Normal, health 1.10 and 1.15, Level XP 1.10 and 1.25), the per-ground dials and the floor-16 pull rule removed in the same step, party-wide damage as a tier row if S-13 is a or c. Stage 3 (R13): the Level law's convex cut from a generator, on the seat S-11 picks, and the Blessing ladder's rungs (D-4) |
| Owns | `src/data/gear-tiers.js`, `items.js` where a gear row is overridden, `wave3-uniques.js`, `hunt-xp.js`, `hunt-tiers.js`, `balance-sheet.js`, `scaled-hunts.js`, `blessings.js`, `src/core/hunt-rewards.js`, `src/core/xp.js`, the engine files of 2.2 in wave 2. New generated ground-pace and Level law files and their generators |
| Migrations | About seven, mostly generated: items, ground tiers and hunt sessions, scaled hunts and the Tower, the Level curve (replaces staged 1000 and 1016), XP a kill (replaces 1001), the Blessing ladder |
| Edge | Yes |
| Authority | XP and coin are minted only in the settle from server catalogues. The Level curve is a generated server table with a drift guard. A Blessing is bought by RPC at the server's price, journalled |
| Tests | `tests/hunt-core/run-all.mjs` and `engine-parity.mjs`, `tests/hunt-core/hunt-tiers.mjs` with its vacuous mutants fixed, `tests/level-curve.mjs`, each generator's `--check` with a mutant, a ladder test (a rung opens past the threshold, price from the server, journalled), death viewed and closed, `tests/xp-frac-carry.mjs`, the scaled-hunt tests |
| Matrix | `bp-gear-step-117.json`, `R10-gear-curve.json`, `R12-kill-reward.json`, `bp-tiers-2500.json` and `R13-level-law.json`, fitted at the ruled points on the seat S-11 picks, become built. The death sample after stage 2 and again at the end of CB-2 |
| Depends on | FB-2 (R7). FB-9's price rows before the ladder is sold. D-3, D-4. S-11, S-12, S-13 |

#### FB-9 `lane/c-economy`. Lane C. Backend architect. Wave 3.

| | |
|---|---|
| Builds | The wage curve (R15): `wage(L)` from the coin line and the kill-rate reference, on a mid four on Normal, computed by the server from a generated table. Prices as rows of hours: the refill's base (steps RULED), Blessings at every rung, the talent reset, rename and colors. The account prices of CE-5 set once from the curve: deeds, room rungs and chests. The screen's "about 3 hours of hunting". The market open from the first loot (GR-55). The stackable price ceiling with no minimum a unit closed (GR-59b) |
| Owns | A new `src/core/wage.js` (pure, both runtimes) and a new price-hours file in `src/data`. `src/data/stamina-refill.js`, `shops.js` (deeds and rooms), `homestead-tiers.js`. The market's SQL, `src/session/market-intents.js`, `src/shell/market-*.js`, `sink-words.js` |
| Migrations | About four: the wage table (generated), price rows and the RPCs that read them, the account prices, the market's door and the laundering route |
| Edge | Possibly, where `spend.js` prices a purchase |
| Authority | Every price is computed on the server from its own wage table and the hero's server Level. One ledger row a purchase. The market keeps its locks and caps |
| Tests | Core and SQL wage equal at 20 Levels. A forged price refused for a refill and a Blessing. `tests/market-v2.mjs`, `tests/market-edge.mjs`, a day-one market test, a GR-59b test |
| Matrix | Knob `wageShare`. FB-3 adds the wage reader to bands G-8 and S10 |
| Depends on | FB-8 stage 2. D-5 |

#### FB-10 `lane/c-town-closed`. Lane C. Reliability engineer (FB-4's agent). Wave 2.

| | |
|---|---|
| Builds | Town work paid in closed form for training, gathering and benches: at the start, at each paid hour and at a stop, every roll seeded at the start. The screen moves in real time as a prediction nothing can spend (CE-7). A press that needs the items or the level settles the job first. The yard fee at 100 gold times the skill level an hour (RULED 2026-11-20) on the flat rate as ruled, since GR-54's rate change waits. A standing job with no count if S-16 is a or c. A town-hour fixture, a replayed day equal to tick settles, and a synthetic load of 1,000 accounts |
| Owns | `hr-accrue/tick-gather.js`, `accrue-gather.js`, `accrue-artisan.js`, `tick-artisan.js`, `set-activity.js`, `settle-first.js`, the `tick*.js` files from FB-4. `src/core/skill-sim.js`, `artisan-sim.js`, `artisan.js`. `src/shell/town-work.js`, `training-now.js`, `training-words.js`, `away-work.js`. `src/session/town-intents.js`, `training-intents.js`, `training-sections.js`. `src/data/training.js` |
| Migrations | About three: closed-form job rows, the yard fee, the sweep |
| Edge | Yes |
| Authority | XP, items and gold from town work are paid only by the server at the three points, from server catalogues and the server clock. Journalled through the hourly journal |
| Tests | `tests/world-tick-parity.mjs` gather arm, the replayed-day equality, each activity viewed and closed, `tests/settle-carry-defer.mjs`, `tests/conservation-fuzz.mjs`, the fee's self-check, the load test's report |
| Matrix | The town-hour fixture feeds bands T7 and TD1 through FB-3 |
| Depends on | FB-4 first half. S-16 |

#### FB-11 `lane/c-talents`. Lane C. Systems engineer (FB-3's agent). Wave 3. Engine batch 2, second holder.

| | |
|---|---|
| Builds | Chapter 10 as specified: `src/data/talents.js` and `src/core/talents.js`, R20 (one modifier table, identity) with its "when" column, the four stat lines through the member, Linger and the five rank 3 unlocks (Focus fire, Surrounded, Draw fire in the shooter rule and switchable, Deep well, Carry over), the to-hit floor that CORE-4 owes because Footing is the first rating row. One row a hero with raise-only points, the six RPCs (spend, plan, use suggested, copy, switch, reset), points raised in the settle and spent by the plan with the browser closed, the projection, the Talents panel from the Character window, one return-card provider |
| Owns | `src/data/talents.js`, `src/core/talents.js`, a new modifier table in `src/core`, the engine files of 2.2 in wave 3 (the member read, `targeting.js`, `status.js`, `vitals.js`), `src/data/to-hit.js`, `src/shell/windows/character/*`, new talent intent and section files in `src/session` |
| Migrations | About three: the table and projection, the RPCs with ledger and clamps, the catalogue |
| Edge | Yes |
| Authority | Chapter 10 section 9. The client sends a track id and a count only. The reset price is computed on the server in hours of wage, free under Level 30, ten a day, one ledger row each, free ones included |
| Tests | The seven self-checks of chapter 10 9.4. A point arriving mid-hunt, viewed and closed, gives one result. R20's empty diff. Each unlock in and out of its case. `tests/hunt-core/engine-parity.mjs`. `tests/layering.mjs` |
| Matrix | The six knobs of chapter 10 5.4, bands TL1 to TL4, builds A to D. The game's own `talents.js` replaces the matrix's scratch hook |
| Depends on | FB-2 (R3), FB-8 stage 2 (the engine handed over), FB-9 (the wage), D-9 |

#### FB-12 `lane/c-social`. Lane C. Backend architect, art director for the visual pass. Wave 3.

| | |
|---|---|
| Builds | Chat and clans: the Local tab and the live party finder removed (RULED, GR-69), Global in small batches with a slow mode (31-1), a Clan tab, the clan roster, chat and browser on the clan RPCs the server already holds, with every castle, feast, upkeep, vote, rested-grant and work-order call hidden or dropped. Then friends for each account with one request (MM-47), the friend link at sign-up (GR-72), the presence strip on a ground and heroes at work in town with quiet presence (MM-20, GR-70), and the calendar with the Hearthrise weekend sized by the fire (MM-11, CE-8) |
| Owns | `src/social/*`, `src/data/chat-channels.js`, `social-menu.js`, `social-settings.js`, `town-presence.js`, `town-criers.js`, `live-events.js`, `hearth.js`. `src/session/town-presence.js`, `live-event-sections.js`, `hearth-intents.js`. `windows/chat*.js`, `friends.js`, `party-finder.js` (deleted), new clan windows, `live-events-view.js` |
| Migrations | About four: chat kinds, clan trims and grants, friends and the link, the presence read and calendar rows |
| Edge | None expected |
| Authority | Names and lines checked on the server with blocks, mutes and the filter. Founding a clan costs gold by RPC, journalled. The event's XP comes from the server's calendar row and clock only |
| Tests | `tests/chat-social.mjs`, `tests/chat-broadcast.mjs`, `tests/town-presence.mjs`, the clan tests, a friends link test from both sides, hidden castle calls refused, the weekend's XP on a closed hunt by the server clock, `tests/client-intent-surface.mjs` |
| Matrix | Event XP is in no cell. FB-3 prints the weekend beside the pace readings |
| Depends on | D-7 |

#### FB-13 `lane/c-world-boss`. Lane C. Systems engineer (FB-8's agent). Wave 4. Engine batch 3, first holder.

| | |
|---|---|
| Builds | One sample boss (D-6): one server-wide pool, rooms scaled to the party's Level by the one monster formula and the hall number, the ruled phases, the one tier table, points as bars broken times the tier's XP multiplier, the pool sized by weekly active accounts with a floor, a window of about 72 hours on the server clock, a chest at three point thresholds by the account's own points, a trophy and the plaque, a death that is a normal death (MM-7), the risk reading on the card, the parties in the fight on the presence strip. Level XP about a Normal hunt's, no coin |
| Owns | `src/core/hunt/boss-room.js`, `boss-phases.js`, `tally.js` in wave 4, a new world boss data file, `src/session/boss-intents.js` (its world boss part), a new world boss window, `hr-accrue/intents.js` in wave 4 |
| Migrations | About three: the pool and window with a fold of one statement a minute, the send and points in the session row, the chest from a server catalogue, journalled |
| Edge | Yes |
| Authority | Points are counted only in the settle. The pool is folded by the server. The chest is granted by RPC against the server's points, once an account a boss |
| Tests | The boss viewed and closed. The fold is idempotent. The chest once at each threshold. A death in the room costs what a death costs elsewhere, with Blessings. The plain four's diff is empty |
| Matrix | Knobs `bossPoolPerAccount`, `bossPoolFloor`, the hall number. FB-3's boss room cells at three Levels |
| Depends on | FB-8 (the tier table), FB-7 (the risk reading), FB-12 (presence), D-6 |

#### FB-14 `lane/c-on-call`. Lane C. Backend architect. Wave 4. Engine batch 3, second holder.

| | |
|---|---|
| Builds | Chapter 11 section 1: the consent row, the window on the server clock (once in 24 hours, 12 hours long), hire stamina as its own pool (`hire_stamina_ms`, 12 hours, full when a window opens, drained only by a guest settle, no refill sold), Seat as part of the party start (friends and clan mates only), Recall, the guest seat in the settle at `onCallXpShare`, no coin, drops or supplies to the owner, the caller's purse stocking the guest, no loss on death, the two-thirds line, one ledger row a seat, the clamps, and the screens (the rest plan switch, Seat in Friends and the roster, the guest card with hire stamina, a second bar on the hero strip, one return-card provider) |
| Owns | New on-call data and core files, the engine files of 2.2 after FB-13 (the guest credit), `hunt-settle.js` after FB-4's second half, `windows/party.js` and `hunt-prep*`, `hr-accrue/intents.js` after FB-13 |
| Migrations | About three: consent and window with hire stamina, Seat and Recall, the settle credit and ledger |
| Edge | Yes |
| Authority | The one cross-account write in the build. The only caller input is which consenting hero sits where. Hire stamina is raised only by a window opening. No intent can raise it |
| Tests | Chapter 11 1.8's eight self-checks. The guest credited the same with the caller's browser open and closed. An own hunt changes hire stamina by nothing and a guest hunt changes own stamina by nothing |
| Matrix | Knobs `onCallXpShare`, `hireStaminaHours`, `onCallSeatsPerParty`. Bands OC1 to OC3 through FB-3 |
| Depends on | FB-6, FB-10, FB-12, FB-4 second half, FB-13, D-8 |

#### FB-15 `lane/c-test-crowns`. Lane C. Backend architect. Wave 4. Only if S-17 is b.

| | |
|---|---|
| Builds | Premium for each account in place of each character (PREM-1). A Crown balance on the account. The weekly test-Crown allowance behind one server switch, off by default, every grant journalled, removed before Early Access (MM-43). The Crown Exchange: one server-owned book, fixed lots, one trade then bound, 1% to list and 4% of the gold both burned (MM-35), the eight clamps (MM-36), no seeded price. Thirty days of Premium bought with Crowns. No real-money purchase is built. If S-17 is c, the lane only turns the beta switch off. If a, it does not run |
| Owns | `src/data/premium.js`, a new Crowns data file, new Crown intent files in `src/session`, a new exchange window |
| Migrations | About four: Premium for the account, the balance and ledger kinds, the switch, the book and clamps |
| Edge | Possibly, for the exchange's verbs |
| Authority | Every Crown and gold movement by RPC on a server-owned book, server clock, per-call and per-day clamps, an append-only ledger |
| Tests | A self-check for each clamp. A forged price or lot refused. Fees burned and gold conserved. The switch off grants nothing. Premium read by every hero's stamina cap, viewed and closed |
| Matrix | None. FB-3 reads Premium's bar in the stamina-day model |
| Depends on | S-17, FB-9 |

## 3. Gates and the release

### 3.1 Assembly and the record gate

Lanes merge into `set/v0.2.144` as they land. The set is pushed to `next` and GitHub judges it there, one run at a time, with the nightly behind it. A red is fixed forward by the lane that wrote it. The record gate is the GitHub matrix on `release/vX.Y.Z` (CLAUDE.md 3.3). Production stays frozen on v0.2.143 except for P0 hotfixes (2026-11-21).

Wave 5 runs the full matrix once on the assembled set, the death sample at the sized dials, and both generated data files. The matrix is a report and gates nothing, because GR-88 is PROVISIONAL. One cell is a gate: check C3, the default company holding the Sewer on Normal at Level 5. JUDGMENT.

### 3.2 The visual and play gates

- **Visual gate**, on the assembled set, desktop first, then 922 by 423 if usage allows, screenshots read by the art director: creation, town with Chat open, Hunts, the end card, the return card, the company card, the party window, the Talents panel, Chat with the Clan tab, the clan browser, the calendar, the market, the world boss window, the Crown Exchange if built, and combat and inventory because CSS moves.
- **Play gate before the release**, on `tools/qa/local-world.mjs` (the real `play.html` and engine on the replayed chain): a new account from the sign-in screen, four heroes, the first hour to the Sewer, close, skip 8 hours, the return card, equip for four, Carry on, Talents at Level 10, a death and its card. Read as page text. This replays the four-hero hour of `review/02-four-hero-hour.md` against its five fixes.
- **Play gate after the apply**, on live as the QA account: reload, pick a hunt, hunt, the hunt ends, back in town, one-tap refill, the bag, reload, and a fresh account's first minutes.

### 3.3 The release window

1. Bump, one CHANGELOG entry in player words, push `release/vX.Y.Z`, GitHub green.
2. Rehearse the whole staged chain (1000 to 1035 and this build's files, about 50 new) on a copy of production. Every self-check passes there.
3. The Coordinator applies one file a call with `tools/apply-migration.mjs` in sequence order, then re-measures `live-hash-drift --live --write` and flips each sidecar in one commit.
4. One local `node tests/run-smoke.mjs`, then the edge deploy with `pack-edge --hash` equal to the live `payload_sha256`.
5. Push `main`. Once Pages serves the version, the Discord note.

The release lands on live characters as they stand (2026-11-09: changes ship live, told in the changelog). When the Level law lands every live hero's Level moves, and the note says so. A wipe is Tyler's call and this plan does not assume one.

### 3.4 After it ships

A blind playthrough audit of what changed, learning only from the screen, and a Level 1 to 20 pass. Findings go to fix lanes. The game designer re-reads the changed systems and the new-player path (CLAUDE.md 3.5).

### 3.5 What the playtest must measure

FB-3 builds read-only readers in wave 5. Production is read, never written.

| Measure | Read from | It settles |
|---|---|---|
| Deaths in 1,000 hunted hours by ground, tier and Level band, a party-hour and a hero-hour, with lowest health | The server tally (FB-7) and the ledger | CORE-1, GR-27 and S-12's counts. The ladder's threshold (GR-7). MM-7 |
| Real gold: net gold a hero-hour by Level and tier, the store's share, vendor against market | The ledger | The wage formula against played gold within 10% (GR-51). CE-4, CE-5, GR-58 |
| Which fours players run, by weapon way, tier and Level | Session rows | S-10 c: whether the classes rule returns as one row |
| The first hour: time to four heroes hunting, quit points, return visit length (under 4 minutes) | Session replays and the Path's events | GR-79, GR-80, C3 past minute 17, by strangers |
| Talents: the share of each way on the same top two tracks, banked points, resets | The talents rows and ledger | TAL-1's test: under 80% sameness with 20 heroes a way |
| On call: the share of party hours with a guest | Seat ledger rows | CH11-1. Under 5% means a newcomer's helper only |
| The world boss: stamina spent on it, fall time against 36 to 60 hours | The pool and points | MM-2 to MM-5 |
| Crowns, if S-17 is b: the share of accounts that buy Crowns with gold | The exchange ledger | The review's test: over a fifth |
| Database-seconds an account-day | `platform-cost.local.mjs minutes` | The budget of 15 cents an account a month (2026-11-21) |

### 3.6 Security

The one full adversarial review is a hard gate before Early Access and not before the betas (CLAUDE.md 2 and 3.7). It must cover every surface below, and the staged chain 1000 to 1035 from the earlier plan, which rides the same release.

| Surface | Lane | What moves |
|---|---|---|
| Four starter slots, the account kit and the hero kit a slot | FB-5 | Items and gold granted on creation |
| One Start, the party door, the leader, the fall line, Tamsin's task on entry | FB-6 | Hunts started, task gold |
| Setup slots at 15,000 and 40,000, equip for four, the mid-hunt equip | FB-6 | Gold, items between heroes |
| The report's counters and the tier's risk line | FB-7 | Data shown |
| Read once, the narrow town read, the flush, the hourly journal, the 10 minute save | FB-4 | The settle path, day caps read from the journal |
| Closed-form town work, the yard fee | FB-10 | XP, items, gold |
| The death function in two runtimes, the XP chain and two-thirds line, R7 | FB-2 | XP lost and credited |
| The coin line, the kill reward, the ground number, the tier table, the Level curve, the Blessing ladder | FB-8 | XP and gold minted, Blessing gold |
| The gear curve and uniques | FB-8 | Item stats |
| The wage table, every price in hours, the account prices, the market's day-one door, the stackable ceiling | FB-9 | Gold |
| Talents: six RPCs, the reset, points raised in the settle | FB-11 | Gold, combat rows |
| Clans on the 2026-08 RPCs, clan chat, Global's slow mode, friends, the sign-up link, presence, the calendar's XP weekend | FB-12 | Gold, names, XP multiplier, data shown |
| The world boss pool, points, window and chest | FB-13 | Items, XP |
| On call: the cross-account XP write, hire stamina, consent, Seat and Recall | FB-14 | XP to another account's hero |
| Test Crowns, the exchange, the clamps, Premium for the account, the switch | FB-15 | Crowns, gold, Premium |

## 4. Risks and what is UNKNOWN

- **Fit to the beta date.** About 15 lanes, three engine batches and about 50 migrations. UNKNOWN whether it fits the beta of about end of December (2026-11-21). If it slips, FB-15, FB-13 and FB-14 are the last wave and can ship dark behind their switches and Path flags.
- **One release window.** About 85 staged files applied together, 36 of them already on the set. The rehearsal on a production copy is the mitigation. There is no point-in-time restore (2026-11-19), so the restore drill is scripted and not run.
- **The tier dial may move once more.** CB-2's death sample runs with the gear curve, the kill reward, Talents' unlocks and any party-wide damage in. UNKNOWN by how much.
- **Gold.** The tool's coin reads 1.24 times real (R0). Every price is PROVISIONAL until the playtest's real gold.
- **The arrival kit.** Its fix is UNKNOWN until D-3. It holds 492 of R5's 756 RED rows, and the first hour's survival rests on it.
- **The old clan RPCs.** They were written in the `2026-08-*` migrations and carry castle, feast and rested-grant pieces that today's rulings cut or hold. FB-12 must read them all.
- **Talents' unlocks need three new engine hooks.** Their cost is not estimated (chapter 10).
- **"No hits landed" may be a real bug.** It was seen in the tool on the proposed game. FB-1 first decides whether a real four on live meets it. If one does, it is player-visible now.
- **Server cost.** Four heroes with 48 rested hours a day, town work drawn in town, and a watched tab. The 1,000-account load test is new in FB-10.
- **Generated game data from a simulator cache.** The ground number and the tier risk line move whenever the matrix moves. Their drift guards bind them. JUDGMENT that this is safe only while nobody edits them by hand.

## 5. The sitting

Seven questions, S-11 to S-17, in `review/03-sitting-2.json` for the Rulings page and `review/03-sitting-2.md` to read. Each option says what it costs, with its evidence label, and none is recommended. Which lanes wait on which answer:

| Answer | Lanes that wait on it |
|---|---|
| S-11 | FB-8 stage 3 |
| S-12, S-13 | FB-8 stage 2 |
| S-14 | FB-6 |
| S-15 | The two folds in FB-2. V5's register in FB-3. FB-8 and check C3 if the gentle grounds go |
| S-16 | FB-6, FB-10 |
| S-17 | FB-15 |
