# 13. The build plan: the first build

Written 2026-11-21 on `lane/d-build-plan`, cut from `set/v0.2.144` at 735feda87 and merged up to 8d9496980. This is step 4 of the critical review (`review/00-critical-review.md`, section 8): narrow the first build. Revised the same day for the audit before wave 1 (`review/04-pre-wave-audit.md`, GO WITH CHANGES, and Part C, `review/04c-existing-game-coverage.md`). Docs only. No game code, data, migration or tool was changed. Chapters 00 to 12 and `decisions/` were not edited.

Labels. MEASURED is a run on the real engine, with its run id. COUNTED is a count from a file by script, or from production where it says so. COMPUTED is arithmetic on named inputs. JUDGMENT is a design or planning opinion. UNKNOWN means nobody knows. Nothing here is measured against the game that runs today. Lane sizes and migration counts are JUDGMENT.

Run ids used. R0 is GitHub run 44920906999, R1 is 44924971088, R2 is 44925664434, R4 is 44928035806, and L is chapter 12's local probes (chapter 12, section 1). R5 is 44931089433, the full matrix after the matrix lane fitted the Level law at the ruled points (merged at 86f389b47). On R5 the Dangerous four reads 1.263 times the pace contract and the Deadly four with no death 1.579, where chapter 12 had 1.266 and 1.492. R5 reads 756 RED rows: the arrival kit 492, armor and best gear 170, sinks beside income 44, and 50 small rows. **Every one of these runs played the engine before FB-1's fix at 02364f03a.** Survival, death and lineup readings wait on FB-3's replay (audit A-0).

Production counts are COUNTED (production, 2026-11-21, read-only), totals only. The live game holds 7 accounts and 22 heroes.

**Folded since, 2026-11-21, by the integrator.** The designer ruled D-1, D-2 and D-11 (`review/05-designer-rulings.md`), D-4 to D-8 and D-10 (`review/06-designer-rulings-w1.md`) and D-3 with the kill reward under Level 5 (`review/08-designer-d3.md`). Tyler answered S-11, S-12, S-14, S-15, S-17 and S-18 at the second sitting. Chapter 14 (`14-the-rest.md`) plans everything that waits. This chapter now reads those rulings. Where a row below still says a thing is held or open, the row is wrong and the ruling wins.

## 0. One screen for Tyler

**What the first build is.** The smallest game that holds together, as the review named it, plus Talents and on-call heroes.

1. Four heroes from the first second, a weapon pick at creation, and one first hour taught once for the account.
2. One plan, one Start and one return card for the four, with gear that gets worn.
3. The hunt report with the free risk reading.
4. The formula steps that move no number, and party XP by size alone, which you ruled at the first sitting.
5. Harder tiers that bite, on one tier table, sized once with Talents in.
6. The gear curve to tier 7 and one band past Krell. The kill reward. The Level law. The Blessing ladder.
7. The wage formula, and the prices that four heroes break, read from it. The market open on day one.
8. Town work in closed form, training included, and the server cost fixes in study 48's order.
9. Talents: five tracks and the rank 3 unlocks.
10. The cheap social layer: Global and Clan chat, the clan roster and browser, friends, presence, the calendar with the Hearthrise weekend.
11. One world boss as a sample of one, and on-call heroes with their own hire stamina.
12. Premium for the account, as ruled, and on for every hero in the playtest through the closed-beta switch (S-17 a, RULED 2026-11-21). Test Crowns wait.
13. Fixes for the four things the four-hero hour broke: no weapon pick, the tutorial repeating for each hero, the first tip hidden under Chat, and a tank that hunted nine hours in no armor.

**What waits.** Nothing is cut. Both arenas, the castle and its Library, boss gear lines past the first, bought boosts and buff caps as final numbers, the priced Crowns book, Necrotic and Storm, fists, sinks as a share of band gold, the market's standing orders, Talent ranks 8 and up, Luck, and the unbuilt phases of the itemization plan. Section 1.2 has the full list, and chapter 14 (`14-the-rest.md`) plans every row of it in 18 later lanes. Anything the engine decides is sized in the simulator, and only a player's choice is read live (Tyler 2026-11-21).

**How it is built.** First a short test lane, `lane/a-ci-reds-pre-wave`, clears the four reds nobody owned. Then 15 lanes, one of them the matrix lane, in four waves of at most four lanes, then one assembly wave. FB-1 is done, merged at 02364f03a. The matrix lane's first job is to replay every survival and death reading on the fixed engine, and nothing is sized on an older run. Combat-engine changes go out in three batches, one lane holding the engine at a time. Everything lands on `set/v0.2.144`, is judged on GitHub through `next`, and ships as one big release (2026-11-21): the numbered chain rehearsed on a copy of production with the edge, then applied in one window, then the edge, then `main`. The release lands on the 7 live accounts as they stand, with no refund and a plain note.

**What Tyler answered.** Six questions of the second sitting, each with every option's cost in front of him (`review/03-sitting-2.json` and its `.md` twin). Each is RULED (Tyler, 2026-11-21, the second sitting).

| Id | The question | His answer |
|---|---|---|
| S-11 | Which four is the Level table's clock | c. The Dangerous seat now. The law reads again before Early Access |
| S-12 | What the ruled death count means, when the engine gives a cliff | a. The counts describe a four arriving in a band, so each ground is a ladder |
| S-14 | When one of your own four falls | a. Own heroes keep "the rest hunt on" |
| S-15 | The five built special rules never put to him (GR-25) | a. All five are approved. The roll rule and the tier flag are folded |
| S-17 | Premium and test Crowns in the first playtest | a. Premium for all in the playtest, through the closed-beta switch. Test Crowns wait. FB-15 shrinks to Premium for the account |
| S-18 | Who plays the first build | c. The accounts in now play first. About 30 are invited once the play gate and a blind first-hour pass are clean |

**What is still open for Tyler.** Five items. None is decided, and no lane waits on any of them to start.

| Id | What | Where |
|---|---|---|
| S-19 | Prices for gear upgrades: a share of band gold, or typed. The first build keeps his typed prices | `review/07-sitting-3.json` |
| S-20 | The yard's rate: follows the skill curve, or flat as he ruled three times. The first build keeps the flat rate | `review/07-sitting-3.json` |
| Reversal 28 | The refill's base is 2 hours of the hero's wage. "Veto R-1" sets 1.33 hours | `review/06-designer-rulings-w1.md` section 4.2 |
| D3-1 | Early armor tiers keep their built armor, about 9 to 18% less damage a ladder tier where he asked 3 to 5%. "Veto D3-1" resamples tiers 1 to 7 on the curve | `review/08-designer-d3.md` section 0 |
| D3-2 | Factions are not in the first build. "Veto D3-2" opens Carter's Rest and the Ox Road and arms factions | `review/08-designer-d3.md` section 0 |

The designer ruled party-wide damage (was S-13) as D-10 and a rest plan's ending (was S-16) as D-11, and reported both. The ending is reversal rows 27 and 27b, and Tyler let both stand on 2026-11-21.

**A note, no answer needed.** Chapter 12's fourth item (open item 12-7-4): the paid edge is smaller in pace than the book said, 1.29 to 1.48 with every cap full and about 1.06 to 1.08 from paying alone (MEASURED, R1 and R2). What a payer gets is the next tier some Levels sooner. "Pay to level 22% faster" is not a true line. Test Crowns wait (S-17 a), so a later playtest watches what payers actually buy.

## Read log

| Source | How much |
|---|---|
| CLAUDE.md, the professional standard | Whole |
| `review/00-critical-review.md`, `F-framework-audit.md`, `01-sitting.md` and `.json`, `02-four-hero-hour.md`, `04-pre-wave-audit.md`, `04c-existing-game-coverage.md`, `04-sitting-additions.json` | Whole |
| `00-the-game.md` | Sections 1, 2, 5, 6, 7 and 8 whole |
| `10-level-choices.md`, `11-on-call-and-clan-xp.md`, `12-balance-pass.md` | Whole |
| `01` 2.1, `04` 2.3, 2.7 and 2.10, `06` 2.3 and 2.7 to 2.11, `08` 2.1 to 2.5, `09` 2.2 | Whole sections. The rest by heading and search |
| `decisions/all.json` | Every row's id, status and `waitsOn` by script. 17 rows read in full. The `firstBuild` and `openForTyler` fields |
| `balance-program/44-formula-architecture.md` 7, `48-platform-cost.md` 6 to 9 | Whole sections, as the source of the step and edge-fix orders |
| The rulings of record | The 2026-11-18 to 2026-11-21 block whole, and searches for wipe, Premium, rest plan and area damage. Private. Cited by date only |
| Code | Listings of `src/*`, `supabase/functions/hr-accrue`, `supabase/migrations`, `tools/balance-program`, `tests`. Headers of `market.js`, `tally.js`, `premium.js`, `chat-channels.js`, `layering.mjs`, `new-migration.mjs`, `world-tick-parity.mjs`. Every file a lane below owns, and every file Part C names, was checked to exist, except those marked new |

## 1. Scope

### 1.1 Every system in the first build

| # | System | Chapter and rows | Status | Still OPEN in it |
|---|---|---|---|---|
| 1 | Four heroes from the start: free slots, the account kit once, a hero kit once a slot, the weapon pick with pre-filled company | 08 2.1. GR-24, CE-10, C3. Four from the start RULED 2026-11-21 | PROVISIONAL | The cards' measured tags, a stub row FB-5 fills last from check C1 (D-1). The wand card's cost line is ruled: "About 100 gold", with a clause that its loot sells for more (D-1, D-3) |
| 2 | The first hour and the Path: tutorial and coach once for the account, the first objective never under Chat, "Build your party", "safe to close", a harder tier offered by rule and never by Level | 08 2.1, 2.5, 2.6. GR-79, GR-78 | GR-79 PROVISIONAL. GR-78 DECIDED | Ruled in D-1. Levels 21 to 24 are covered. Levels 17 to 19 and 27 to 28 wait on FB-7's harder-tier rows, and FB-5's Path guard passes on Levels 16, 25 and 26 by name until then |
| 3 | The company: one plan, one Start, own heroes partied with no invite, the leader, each ground pointing to a Setup, "Equip upgrades for all four", one return card, the rest plan queue. Setup slots are already built and priced as ruled | 08 2.2, 2.4. 11 section 10. GR-80, GR-81, GR-84, GR-48. GR-56a RULED | PROVISIONAL | Nothing. Ruled: "Wear upgrades" as a standing plan line (D-2), the rest hunt on (S-14 a), the standing job that ends after 24 hours (D-11) |
| 4 | The hunt report with the free risk reading, and lowest health in the server tally | 08 2.3. GR-66 | PROVISIONAL | Whether the counters fit the session row with no added statement (08 item 10) |
| 5 | The formula steps that move no number: R1 to R5, the floor half of R6, R7, R8 and the two-thirds line, R20, V5 | 01 2.1, 09 2.2. GR-85 DECIDED, GR-86 (R20 only), MM-19 | DECIDED, R20 and MM-19 PROVISIONAL | The five special rules are approved (S-15 a, RULED), so FB-2 builds both folds. The rested bank leaves in R1 (cut, S-9 c) |
| 6 | Party XP by size alone, a step that moves numbers | GR-3, RULED at the first sitting (S-10 c) | RULED | Whether the classes rule returns as one row, read in the playtest |
| 7 | Harder tiers on one tier table with one pull number a tier: Dangerous pull 5, Deadly pull 8, both blows 2.5 times Normal | 01 2.11, 12 3.1. CORE-1, GR-27, GR-3 RULED | PROVISIONAL. The 2.5 is re-read on the replay | Ruled: the count on arrival (S-12 a), the rest hunt on (S-14 a), and no tier row for party-wide damage (D-10). CB-2 re-sizes the dial once, with the armor curve of D-3 in |
| 8 | The gear curve, +17% bands, tiers 1 to 7 and the Level 110 band as the played sample, with the armor curve probe and the arrival kit fixed together | 03 2.2, 2.3, 12 3.6. GR-4 | PROVISIONAL. +17% MEASURED for weapons (L, R0) | Ruled in D-3: ×2.4, the arrival graded by survival, pace and tier held, the two grounds stay staged. Still open: the cost to reforge a unique up a band (03 item 3, D-23 of chapter 14) |
| 9 | The kill reward on the pace line, with one coin line and one derived number a ground written by a generator | 05 2.3, 12 3.4. GR-5, R9, R12 | PROVISIONAL. Holds from Level 45 (MEASURED, R0) | Whether party grounds' two thirds is high (12 3.4). Under Level 5 the curve's low end is ruled at exponent 1.1, and the Mill Cellar carries no ground number (D-3) |
| 10 | The Level law and the Blessing ladder past the third Blessing | 05 2.2, 2.5, 12 3.3, 3.5. GR-6, 6a, 6b PROVISIONAL, GR-6d DECIDED, GR-7 RULED | PROVISIONAL numbers | Ruled: the Dangerous seat (S-11 c), re-read on the base of D-3 before stage 3 fits the law. The ladder's threshold is 5 hours (D-4) |
| 11 | The wage formula as the source for prices, the prices four heroes break, the market open on day one | 04 2.3, 2.7, 2.10, 12 3.7. GR-51, CE-4, CE-5, GR-58, GR-55, GR-59b | PROVISIONAL | Gold in the tool is an upper bound (coin reads 1.24 times real, R0). Ruled in D-5: the refill's base is 2 hours, open for Tyler's veto as reversal 28. The Weighhouse stays a building only |
| 12 | Town work in closed form, training included, with the yard fee | 07 2.11, 09 2.3. GR-1, CE-7, R5 fee | PROVISIONAL | A town-hour fixture and a load test, both built in FB-10 |
| 13 | The server cost fixes, study 48 steps 1 to 8. Step 2 is already applied and step 6 is row 12 | 09 2.3. GR-1 | PROVISIONAL | The tab's 33.5 seconds, before step 7 |
| 14 | Talents: five tracks, the stat lines, the rank 3 unlocks, Linger, plans, reset | 10. TAL-1 | PROVISIONAL | Every size. The curve's half point (D-9). The unlocks' engine cost (10 section 12) |
| 15 | On-call heroes with a hire stamina pool | 11 section 1. CH11-1. S-1 and the two pools RULED 2026-11-21 | PROVISIONAL | Ruled in D-8: it opens at hero Level 10, the default tier limit is Dangerous, `onCallXpShare` stays 0.10 |
| 16 | The cheap social layer | 06 2.5, 2.7, 2.9. GR-69 RULED, MM-8 (roster, chat, browser), MM-11, MM-20, MM-47, GR-70, GR-72, CE-8, GR-82 | PROVISIONAL and DECIDED | Ruled in D-7: the Hearthrise on weekend 1 and the world boss on weekend 3 |
| 17 | One world boss as a sample of one, whose chest pays gear or a buff | 06 2.3. MM-2 to MM-7 | PROVISIONAL | Ruled in D-6: Mossback at the Mill Pond, with its chest. Its art is the asset director's list. MM-7 waits on a real death rate |
| 18 | Two cheap engine tests: heroes against heroes (MM-41), one boss room at Levels 25, 52 and 75 (GR-30) | 06 2.6, 02 item 6 | MM-41 DECIDED | Their results |
| 19 | Premium for the account, and test Crowns | 04 2.8, 2.9. PREM-1 DECIDED. MM-43 DECIDED, MM-35, MM-36, PREM-2 | Premium for the account is built. Test Crowns wait for a later playtest (S-17 a, RULED) | Nothing |
| 20 | "No hits landed": a strong four's hunt ended with no fight | 12 section 9 | Done. FB-1 fixed two engine stalls at 02364f03a | Nothing |

### 1.2 What waits, and until when

Chapter 14 (`14-the-rest.md`) plans every row below and names its lane, FR-1 to FR-18. Anything the engine decides is sized in the simulator. Only a player's choice is read live (Tyler 2026-11-21).

| Waits | Until |
|---|---|
| Both arenas, seasons, tickets and gear line (MM-12 to MM-16, MM-38 to MM-40, MM-45, MM-46) | FB-3's engine test shows heroes can fight heroes. Lane FR-10 |
| The castle, its Library and the clan XP room, labor, upkeep, votes, the treasury, the clan board, the standing gift (MM-9, MM-10, MM-44, MM-48, CH11-2) | Clans exist and people are in them. Lane FR-11 |
| Boss gear lines past the first, boss materials, the fall bonus (CE-1, MM-6 past the first chest) | The first boss has stood twice. D-19, then lane FR-12 |
| Bought boosts, the buff caps and the ceilings as final numbers (MM-24 to MM-26, MM-29 to MM-31, MM-42) | Deadly is sized and one buff is played in a cell. Lane FR-12 |
| Test Crowns, and the Crowns book as a priced design (MM-33 to MM-37, MM-43, PREM-2's price) | A later playtest runs test Crowns (S-17 a, RULED). Lane FR-16 |
| Necrotic and Storm, fists, status pairs (GR-16, GR-17, GR-20) | The weapon ways are distinct and Deadly is sized. D-15 and D-16, then lane FR-5 |
| The Catacombs beyond one wing, the Hall of Firsts, Honors (GR-36, GR-62) | The first build is played. Lane FR-8 for the Catacombs. D-17, D-18 and lane FR-15 for the rest |
| Sinks as a share of band gold and the yard's rate change (GR-8, GR-54, R16) | The wage is measured against played gold. Their form waits on Tyler's S-19 and S-20. Lane FR-3 |
| The market's standing orders, the Sell loot rule, the refill buying player stock (GR-50 parts 1 and 2) | Listings are used in the playtest. JUDGMENT. Lane FR-7 |
| R18 drops in hours, R19 the amount pipeline, R21 monsters on the formula, R22 endless modes, R23 | The first build is played. They move numbers or need a yes. JUDGMENT. R18 in lane FR-2, R19 and R21 in FR-1, R22 in FR-8 |
| Luck v3.1: the bar, the rivets, the Lucky ring (numbers ruled 2026-11-20, its lane parked) | R18, drops authored in hours, which the Luck bar lands on. Lane FR-2 |
| The unbuilt phases of the itemization plan (ruled 2026-11-18, kept in view 2026-11-21) | FB-8's gear curve lands. Then phase by phase, each with its own lane. JUDGMENT. Lanes FR-6, FR-8 and FR-9 |
| Small approved cuts still in the game: Potato, the Crafting bench's three salts, the Moonbloom seed in the Shop, the unused "resists a weapon" column | The lane that next holds each file removes it (Part C X-03) |
| Talent ranks 8 and up, tracks six to eight, the arena build | The sample of five tracks is played. D-14, then lane FR-13 |
| The week's castle labor in the rest plan | The castle. Lane FR-11 |
| The engine host before 10,000 accounts | Its own later call. Lane FR-17 sizes it on a synthetic load |
| Carter's Rest, the Ox Road and factions (D-3) | The first live hero reaches Level 95. Then lane FR-14. Open for Tyler's veto as D3-2 |

### 1.3 Scope calls this plan makes

Each is a designer-level call, made here as JUDGMENT. Four rest on reversals that were put to Tyler on the page and let stand: rows 5, 12, 15 and 16 of `00-the-game.md` section 5.3. They stand, so there is no new question (audit A-17).

1. **On call is in, the Library waits.** `decisions/all.json` lists "on-call heroes, the Library and the town day rule" as waiting. This plan builds on call, as its brief asks, and the ruling of 2026-11-21 on two stamina pools completes its spec. Its own `waitsOn` (the Security review, a playtest with two clans) can only be met once it is built. It is the first lane to ship dark if the date slips. The Library is a castle room, and the castle waits on clans existing. The integrator updates the `firstBuild` field.
2. **Prices: the wage curve and the account prices, not the sink shares.** Pairing 3 of chapter 09 asks that the Level law ship with sinks as a share of band gold (R16). The first build ships the law with the hero sinks still typed (Tempering, Hallmarks, linings), which Tyler kept on 2026-11-18. The account prices that four heroes break by 7 to 12 times (COMPUTED, 12 3.7) are set from the curve. That rests on reversal row 15.
3. **The market as built, opened on day one.** The account market is built (`hr-accrue/market.js`). Its door today is one config row, `hr_market_config.min_level` (Part C M-07). The first build opens it from the first loot and closes one laundering route. Standing orders wait. That rests on reversal row 12.
4. **The gear band and closed-form town work** rest on reversal rows 5 and 16, the same thin yes.
5. **The return card reads line providers.** FB-6 builds the card with a seam: a system adds a file that supplies its line, and never edits the card. Talents, on call and the world boss each add one. It is the shape that holds at ten times the systems.
6. **The Path is written once, in wave 1.** FB-5 writes every first-build Path row, each gated on a flag in its own system's data file. No later lane edits the Path table.
7. **Three generated data files read the matrix or the ruled table.** The derived number a ground carries (FB-8), the tier's risk line (FB-7) and the Level law (FB-8) are written by generators with `--check` drift guards. The ground number's generator reads the ground axis with the number held at 1, so a re-run never compounds.
8. **The staged chain.** COUNTED from `supabase/migration-notes`: of 1000 to 1035, 11 files (1000 to 1008) were applied on 2026-11-20 and 25 are staged (1009 to 1017 and 1020 to 1035. 1018 and 1019 do not exist). What this build does to each staged file it reverses is in the table below. An applied file can only be followed by a forward file. A staged file is retired with `node tools/chain-retire.mjs --retire` only when the later file holds its whole end state, proven identical. Otherwise it applies and a forward file follows it. JUDGMENT per file, and the owning lane may take the other path if the identity proof fails.

| File | State | This build | Lane |
|---|---|---|---|
| 1000, 1001 (three) | Applied | Followed by the Level law and the kill reward catalogues | FB-8 |
| 1009 | Staged | Applies (the refill steps are ruled). FB-9's forward file re-types the base and Blessing prices in the same tables | FB-9 |
| 1011 | Staged | Applies (it also holds the Shrine rungs). Followed by FB-9's deed and room prices | FB-9 |
| 1013, 1014 | Staged | Stand as written. The Weighhouse stays the first project as a building only, and only its words move (D-5) | FB-9 |
| 1015 | Staged | Retired, once FB-5's file sets all four slots free with the same end state | FB-5 |
| 1016 | Staged | Retired, once FB-8's generated law reproduces its ruled points (Level 10 in 6 hours) | FB-8 |
| 1020, 1023, 1031 | Staged | Retired, once FB-8's regenerated tier and scaled-hunt catalogues hold their end state | FB-8 |
| 1024 | Staged | Applies. FB-6 builds on it. Its Blessing price is followed by FB-8 and FB-9 | FB-6 |
| 1025 | Staged | Applies as written. S-14 a keeps "the rest hunt on" as the default. One file, not two (Part C C-04) | FB-6 |
| 1026 | Staged | Re-cut by FB-10. Counts kept, the sweep and the hunt THEN withdrawn (D-11) | FB-10 |

9. **The wipe.** Chapter 09 (row R13) says the Level curve lands at the wipe. This plan lands it on live heroes with no wipe, by the ruling of 2026-11-09. The plan's side stands and the integrator corrects 09 (Part C C-05). A wipe stays Tyler's call.
10. **Premium for the account** was ruled on 2026-11-20 and 2026-11-21 (PREM-1). FB-15 builds it, and under S-17 a (RULED) it is all FB-15 builds (Part C M-08).
11. **The Level 110 band's grounds.** Carter's Rest and the Ox Road are built and flagged `staged` (`src/data/hunts.js:35`). They do not open in the first build (D-3). The Morrow lane starts when the first live hero reaches Level 95. The band's gear is measured in the matrix only. Factions stay held with them, and that is open for Tyler's veto as D3-2.

## 2. Lanes

### 2.1 The order

| Wave | Lanes, at most four at once | What it leaves on the set |
|---|---|---|
| 0 | `lane/a-ci-reds-pre-wave` (the pre-wave lane, running now) clears T-04 to T-07. Tyler has answered the second sitting, and the designer has ruled every row of 2.4 but D-9, which lands before FB-11 starts | A branch whose only reds are named in 2.3 |
| 1 | FB-2, FB-3, FB-4 first half, FB-5. FB-1 is done | Engine batch 1. The replay on the fixed engine, then the arrival-kit run and the engine tests. Read once, the narrow town read, the flush and the hourly journal. Four heroes and the first hour |
| 2 | FB-8 stages 1 and 2, FB-6, FB-7, FB-10 | The gear curve, the coin line, the kill reward and the tier table. The company. The report. Town work and training in closed form |
| 3 | FB-8 stage 3, FB-9, FB-11, FB-12 | The Level law and the ladder. The wage and prices. Talents. The social layer. Engine batch 2 closes with one death sample |
| 4 | FB-4 second half, FB-13, FB-14, FB-15 | The 10 minute save behind its switch, the world boss, on call, Premium for the account. Engine batch 3 |
| 5 | FB-3 and the Coordinator | The full matrix, the death sample, the three generated files, the playtest readers, the visual and play gates, the rehearsal, the release |

FB-3 holds a slot in waves 1 and 5. Between waves it is resumed for short jobs (folding lanes' patch files into the registries, a diff run) in the gap a landed lane leaves. Heavy runs go to GitHub. The Coordinator names the day by which wave 4 must have started (audit A-18).

### 2.2 Who owns a shared file, by wave

A file has one writer at a time. "Then" means in that order inside the wave, the later lane merging the set into its branch first.

| File or folder | W1 | W2 | W3 | W4 |
|---|---|---|---|---|
| The engine: `src/core/combat-sim.js`, `combat.js`, `mitigation.js`, `vitals.js`, `member.js`, `hunt-rewards.js`, `src/core/hunt/*` except `tally.js` and `training.js` | FB-2 | FB-8 | FB-11 | FB-13, then FB-14 |
| `src/core/hunt/tally.js` | | FB-7 | | FB-13 |
| Training: `src/core/hunt/training.js`, `src/data/hunt-grounds.js`, `src/data/training.js`, `windows/training.js`, `windows/house-dummy.js` | | FB-10 | | |
| `src/data/balance-sheet.js`, `hunt-tiers.js` | FB-2 | FB-8 | FB-8 | |
| `src/data/monsters.js`, `tools/gen-hunt-sessions.mjs` | FB-2 | FB-8, then FB-10 (training and dummy rows) | | |
| `hr-accrue/hunt-settle.js`, `accrue-hunt.js` | FB-4 | FB-7, then FB-10 | | FB-4, then FB-14 |
| The rested bank: `hr-accrue/index.ts` (lines 1004 to 1106), `accrual.js`, `accrual-contract.js`, `accrual-window.js`, `tick.js` | FB-2's rested lines, then FB-4 | FB-10 | | |
| `hr-accrue/accrue-gather.js`, `accrue-artisan.js` | FB-2 (rested lines only) | FB-10 | | |
| `src/core/progression.js`, `src/core/perks.js` | FB-2 (rested lines) | | | |
| `src/data/perks.js` | FB-2 (rested payload) | | FB-9 (held rooms) | |
| `hr-accrue/intents.js` (verbs) | | FB-6 | | FB-13, then FB-14 |
| `src/data/shops.js` | FB-5 (hero slots) | | FB-9 (deeds, rooms) | |
| `src/data/homestead-tiers.js`, `src/data/town-works.js` | | | FB-9 | |
| `src/data/blessings.js`, `src/shell/bless-all.js`, `windows/death.js`, `windows/services.js` | | | FB-8 (rungs). Prices come from FB-9's price rows | |
| `src/data/hunt-tutorial.js` | FB-2 (class lines), then FB-5 | | FB-9 (the Weighhouse step) | |
| `src/shell/launcher.js` | FB-5 (splits it first) | | | |
| `src/shell/windows/party.js`, `hunt-prep*` | | FB-6 | FB-12 (the finder's import) | FB-14 |
| `windows/hunts.js`, `src/session/party-sections.js`, `src/session/character-session.js` | FB-2 (the bestiary call, a removal) | | FB-12 (the finder, removals) | |
| `src/social/*`, `src/data/chat-channels.js`, `src/data/text/hunts.js` | | | FB-12 | |
| `src/data/premium.js`, the stamina cap readers | | | | FB-15 |
| `tools/balance-program/**`, `tools/balance-sim/**`, `.github/workflows/balance-*.yml` | FB-3 | FB-3 | FB-3 | FB-3 |

**Shared on purpose, append only.** Each lane adds its own rows and the lane that merges second resolves a conflicting hunk (CLAUDE.md 3.3): `.github/workflows/smoke.yml` (CLAUDE.md section 5 has every lane register its guards there), `src/data/shell-windows.js`, `src/data/text/windows.js`, `src/data/refusal-words.js`, `src/data/settings.js`, the `CLIENT_RPCS` list in `tests/client-intent-surface.mjs`, `src/styles/windows.css` (Part C D-06).

**Regenerated by tools, never by hand.** The lane that merges second re-pins with the tool and proves the cause: engine-parity, restore-census, the edge size ceiling, the client RPC surface, `src/app/game-modules.js` (`tests/module-preload.mjs --write`), the dead-export baseline (its own `--write`), the boot-path ceiling (`--boot-path-raise` with its reason).

**The 600 line cap** (`tests/client-module-size.mjs`). `src/shell/launcher.js`, `src/shell/shell.js` and `src/session/character-session.js` sit exactly on it (MEASURED by Part C). FB-5 splits `launcher.js` before adding to it. No lane adds a line to `shell.js` or `character-session.js`. New intents go in their own files (Part C D-05).

### 2.3 The gate, and the three combat-engine batches

**The gate today.** MEASURED by Part C: `next` was red in all five runs read (44891464929, 44915263102, 44923311869, 44929856921, 44930255616). Its reds and their owners:

| Red | Step | Owner | Until |
|---|---|---|---|
| T-02 Level hours | `tests/level-curve.mjs`, job db-replay-8 | FB-8 stage 3 | Red by design until the Level law lands |
| T-03 Party class XP | `tests/party-class-xp-line.mjs`, job economy-selftests | FB-2, which rewrites it to the size-alone table with M-01 | Red by design until FB-2 merges, then green |
| T-04 Armor line, T-05 dead exports, T-06 boot path, T-07 Chat | `tests/armor-line.mjs`, `tests/dead-exports.mjs`, `tools/build-site.mjs`, `tests/chat-social.mjs` | The pre-wave lane, `lane/a-ci-reds-pre-wave` | Cleared before wave 1 |
| T-13 First-week bands, drop tables (big pull), and the two Glade Deadly pair lines in T-03 | `tests/first-week-bands.mjs`, `tests/drop-tables.mjs` big-pull case, `tests/party-class-xp-line.mjs` | FB-8 stage 2, which sets the tier blow dial and the coin line together from FB-3's lever table | Red by design from FB-8 stage 1 (the armor curve ×2.4, which measures right on armor) until the dials land. A lone hero's supply bill against its coin is a gold dial question, not a reason to hold the curve (Tyler 2026-11-21) |

**How the gate reads a known red.** A red step counts as known only if three things hold. The step is named in the table above. Every failure line it prints matches the known cause: for T-02 only the Level-hours contract rows C2, C3 and C5 of `tests/level-curve.mjs`, and for T-03 only the two harder-tier mixes on Carter's Rest and the Ox Road. Its owner has not merged yet. Any other red, or any new line in a known step, blocks the batch. No guard is loosened, skipped or re-pinned to get green (CLAUDE.md 2).

**JUDGMENT for the Coordinator on T-02.** Do not re-pin it earlier. Its target, Level 100 at 600 hunted hours, is the ruled table, so a re-pin would move a ruled number to match a drift. The only right fix is the Level law in FB-8 stage 3. Until then it stays red by design under the rule above.

**The Path guard is no new known red.** FB-5 ships its Path guard strict, with one named list: Levels 16, 25 and 26, which only FB-7's harder-tier rows can fill. A hole on that list prints and passes. Any other hole fails. FB-7 deletes the list in the commit that adds the generated tier-risk file, with a mutant that proves the guard bites (D-1, `review/05-designer-rulings.md` section 1.1).

**The batches.** CLAUDE.md section 3.3b batches and spaces engine changes. One lane holds the engine files of 2.2 at a time, in this order. Between batches nothing enters the engine until one GitHub run on `next` passes under the gate rule, with `tests/hunt-core/run-all.mjs`, `tests/hunt-core/engine-parity.mjs` (re-pinned by the batch's last lane, each cause proved), `tests/world-tick-parity.mjs` and a matrix diff from FB-3 on the fixed engine.

| Batch | Waves | Holders in order | Ends with |
|---|---|---|---|
| CB-1 | 1 | FB-1 (done at 02364f03a), FB-2 | The first run on `next` after FB-2 merges whose only reds are the known reds of the table above, each with its known text (T-02, and T-13 until FB-8 stage 2). Identity diffs for R1 to R4 and the R8 fold. Coefficient diffs for R6, R7, the two-thirds line and party XP by size alone |
| CB-2 | 2 and 3 | FB-8 (gear, coin, kill reward, tier table, the two group casters of D-10 and no tier row), then FB-11 (R20, stat lines, unlocks, the to-hit floor) | One death sample, 4 seeds of 8 hours on 14 grounds, with everything that moves survival in. The tier dial moves one step if it must. This is the one sizing pass the Talents ruling asks for. The sample also carries the full-game block of `14-the-rest.md` section 1, and the measures D-4 and D-10 ask of FB-3 |
| CB-3 | 4 | FB-13 (the boss room), then FB-14 (the guest seat in the settle) | The plain four's diff is empty. Neither mode moves it |

FB-8's stage 1 is data only (the gear curve), so it may start while FB-2 finishes. It takes the engine at stage 2.

**Read since, by the matrix lane.** MEASURED on runs 44957840040 and 44957843217, as that lane reported them at its merge. The confirm run of D-3 keeps the armor curve at ×2.4. The harder tiers are far deadlier at ×2.4, so CB-2 re-sizes the tier dial, as D-3 expected. The Dangerous seat, re-read on the base of D-3, moved from 1.327 to 1.153. The kill reward under Level 5 is registered, chapter 14's full-game block is in the death sample, and calibration C-1 has run. PROVISIONAL, all of it, until CB-2's one sizing pass.

The edge is deployed once, in the release window. The world's field list changes, so every running hunt's world restarts once at that deploy.

### 2.4 Where the designer rules first

Every row but D-9 is now RULED by the game designer (2026-11-21) and reported. Each ruling's own file carries the data rows, the words, a walk-through against real data and the edits it asked of this book. A ruling of the designer is not a ruling of Tyler's. Where one bends a ruling of his, it is on his veto list in `00-the-game.md` section 5.5.

| Id | Before | What the designer rules |
|---|---|---|
| D-1 | FB-5, FB-7 | **RULED 2026-11-21, `review/05-designer-rulings.md` section 1.** The Path is one table of 21 row families that types no Level. The wand card says "About 100 gold". The coach rings only screen controls in the first hour. A harder tier is offered by rule: the last hunt there read Safe and the tier's risk row, at the gear the party wears, is inside the ruled death band. It was: Every first-build Path row and its opener. The wand card's cost line. The weapon cards' tags once FB-3's check C1 reads, a data row FB-5 fills last. Where the first objective sits so Chat never covers it, with the art director. The first Dangerous offer: today it is Level 8 on Wickstead, where a mid four reads 142 deaths in 1,000 hours and an arrival four wipes (MEASURED, R2 and R4, before the fix). The risk line reads the gear state the party wears, one of the matrix's three, and FB-7 owns it (audit A-6) |
| D-2 | FB-6 | **RULED 2026-11-21, `review/05-designer-rulings.md` section 2.** "Wear upgrades" is a standing plan line that dresses every hero at each Start and each hunt end, in town. Nothing changes inside a running hunt. The leader is the engine's front hero and may be pinned. "Needs you" is eight kinds in a fixed order, one row a kind, three shown. It was: Gear found mid-hunt: worn at a safe moment in the hunt, or one press on the return card. The leader's default (the front hero). The order of "Needs you" |
| D-3 | FB-8 stage 1, armor half | **RULED 2026-11-21, `review/08-designer-d3.md`.** The armor curve is ×2.4, or ×1.6 if the confirm run holds the same steps. The arrival kit is the mid kit one band back, in gear only, graded by survival, pace and the tier it can hold. Tiers 1 to 7 keep their built armor (veto D3-1). Carter's Rest, the Ox Road and factions stay staged (veto D3-2). The kill reward under Level 5 is ruled in its section 2. It was: The arrival kit, from FB-3's coupled run on the fixed engine of the armor curve probe, the arrival skill offset and the jewelry share. The band asks 1.15 to 1.35 of the mid kit's damage. It read 2.2 under Level 45 (MEASURED, R0 and L, before the fix). Also whether Carter's Rest and the Ox Road open, and factions with them (Part C M-03) |
| D-4 | FB-8 stage 3 | **RULED 2026-11-21, `review/06-designer-rulings-w1.md` section 5.** The threshold is 5 hunted hours, Tyler's own number, with a reason under S-12 a. Rungs halve what is left and open near Levels 97, 140 and 257. It was: The Blessing ladder's threshold and rungs, on the replayed death sample. Chapter 12 sized 2 hours on the old engine (COMPUTED on R0) |
| D-5 | FB-9 | **RULED 2026-11-21, `review/06-designer-rulings-w1.md` section 4.** Refills, Blessings, the talent reset, rename and colors are rows of hours. The refill's base is 2 hours (reversal 28, for veto). Deeds are set once in account-days. `wageShare` opens at 0.80. The Weighhouse stays a building only, so 1013 and 1014 stand. It was: Which prices are rows of hours, the refill's base hours, and the account prices set once from the curve. What the Weighhouse project becomes now that the market opens on day one: it stays the town's project as a building only, so 1013 and 1014 stand and only its words move, or the first project builds something else and gets a new row and its art (audit A-9, Part C M-06, C-03) |
| D-6 | FB-13 | **RULED 2026-11-21, `review/06-designer-rulings-w1.md` section 2.** Mossback, an old brook bear, at the Mill Pond. The chest pays a buff at 2 Normal party-hours, one Mossback Cloak at 6 and the buff's second week at 12. Both names are new and not in `src/data` yet. It was: The sample boss: name, place, room, phases, chest rows and trophy, on the one monster formula, with its portrait, world sprite and room for the asset director. The chest pays the boss's first gear line or a buff, as ruled on 2026-11-21 (audit A-7) |
| D-7 | FB-12 | **RULED 2026-11-21, `review/06-designer-rulings-w1.md` section 1.** A 28 day cycle. In the first build the Hearthrise is weekend 1 and the world boss weekend 3. The fire lights at +10% and gains +3% a mark to +25%. The weekly Open Halls row is retired. It was: The calendar's rows for the first months and the Hearthrise weekend's size |
| D-8 | FB-14 | **RULED 2026-11-21, `review/06-designer-rulings-w1.md` section 3.** On call opens at hero Level 10, once the account has a friend or a clan. The default tier limit is Dangerous. `onCallXpShare` stays 0.10. It was: On call's opening Level, the default tier limit, `onCallXpShare` |
| D-9 | Before FB-11 starts | **Not ruled yet.** The Talents curve's half point (audit A-13: at rank 10 a hero's first five points are worth nothing it can see, and chapter 12 computed that rank 4 makes them worth about 3%). The five tracks' ceilings and unlock sizes after FB-3 plays the four stat lines and one unlock on the fixed engine |
| D-10 | FB-8 stage 2, after S-12 is answered | **RULED 2026-11-21, `review/06-designer-rulings-w1.md` section 6.** Party-wide damage stays in the data's `group` rows and gets no tier row in the first build. Hask's Ford and the Muster Barrows each gain a group caster in FB-8 stage 2. It was: Party-wide damage, withdrawn from the sitting as S-13. It is already in the game as data: monster spells of shape `group` in `src/data/monster-spells.js`, ruled 2026-11-08, worth 0 to 8% of a four's damage on nine grounds (MEASURED, R0). The data layer first, as the formula brief asks, and a tier row only if the data cannot hold the count. Reported, not asked (audit A-2) |
| D-11 | FB-6, FB-10 | **RULED 2026-11-21, `review/05-designer-rulings.md` section 3.** The usual ending is a standing job with no count that starts no hunt, never loops and stops by itself after 24 hours. No rest plan ending starts a hunt. Reversal rows 27 and 27b, which Tyler let stand on 2026-11-21. It was: A rest plan's usual ending, withdrawn from the sitting as S-16: a standing job with no count, or "wait in town". It starts no hunt and does not loop. Reported, and listed as reversal row 27 for Tyler's veto (audit A-3). FB-10 decides staged 1026 with it |

### 2.5 Rules every lane follows

- Branch from the newest `origin/set/v0.2.144`. Merge the set into the branch and re-test before reporting. The Coordinator merges with zero conflict hunks or not at all.
- A migration is named by `node tools/new-migration.mjs <slug>` at dispatch time. Each carries its section 4 self-check and replays on `tests/schema-drift.mjs` with a byte-identical second apply. Staged only. The Coordinator applies in the release window.
- No dial, ladder rung, Talent size or generated file is sized on a run older than FB-1's fix at 02364f03a. FB-3's replay comes first (audit A-0).
- Lanes run plain tests locally and proofs only for the guards they edit (2026-11-21). GitHub judges the rest.
- Anything touching combat, death, hunt sessions, stamina or supplies ships a test with the hunt viewed and one with the browser closed.
- A lane delivers its balance cells as a patch file under `tools/balance-program/patches/` and a short request in its report. FB-3 alone writes `standards.mjs`, `knobs.json` and `proposals.json`.
- Every number a player can act on renders from the server projection. No residue field is added by any lane.
- A lane that changes existing player state carries a live-state row: what moves on the 7 live accounts, the rule, and the line for the release note. No refund and no protection code (2026-11-07, 2026-11-09).
- The art director reads each new screen when its lane lands, not only at the visual gate (audit A-14).
- Finish with a `LANE DONE:` commit listing the tests run, with exit codes.

### 2.6 The lanes

#### FB-1 `lane/a-no-fight-strong-four`. Lane A. Systems engineer. Done.

Merged at 02364f03a. Two engine stalls fixed in `src/core/hunt/pull-cycle.js` and `targeting.js`, each with a regression test: a pack that respawned around a passing party froze a strong four, and a fought pack's monster was left with no target after a hero died, so the rest of the party stood until the hunt gave up. Every balance run before it played the stalled engine. COUNTED by the audit in the committed proposed-game cache: 12 of 442 cells ended `no_fight`, all of them Level 60 fours on Deadly (audit A-0).

#### FB-2 `lane/c-formula-steps`. Lane C. Systems engineer. Waves 1 and 2. Engine batch 1.

| | |
|---|---|
| Builds | R1 (dead rules, with the rested bank whole, below), R2 (named constants), R3 (one implementation of each rule, one death function in whole numbers in both runtimes), R4 (a monster row stores its blow), R5's Tower half (no heat), R6's floor half (one power floor), R7 (a tier's dial applied once, one source for hero health), R8's fold and cut with the visible two-thirds line (MM-19, knob `levelShareLine`). Party XP by size alone as a step that moves numbers, beside the fold (M-01). The cut bestiary pieces whole: the charm ladder, the trophy ladder, the collection log switch, the `trophy_claim` verb and `hr_bestiary_activate`, keeping only what the planned Bestiary reads, named in its report (Part C X-02). The two folds of GR-25 (one roll rule, one tier flag) if S-15 is a or b |
| The rested bank | `src/core/rested.js`, `hr-accrue/accrue-rested.js`, the member hook, its 15 references in `hr-accrue/index.ts`, its lines in `accrual.js`, `accrual-contract.js`, `accrual-window.js`, `tick.js`, `accrue-gather.js`, `accrue-artisan.js`, `src/core/progression.js` (the charge on each town XP gain), `src/core/perks.js` and `src/data/perks.js` (the House Library's payload), and `player_state.rested_xp` and `rested_at` in `hr_apply` and `hr_state_of`. `clan_rested_grant` is dropped in the same migration, so no live function points at a dropped column (Part C D-01, L-05) |
| Owns | The engine files of 2.2 in wave 1. `src/data/balance-sheet.js`, `hunt-tiers.js`, `monsters.js` (the blow column), `tower.js`, `abilities.js`, `runes.js`. For M-01: `src/data/party-class-xp.js`, `src/core/hunt/xp-share.js`, `src/shell/hunt-list.js`, `src/shell/windows/party-roster.js`, `src/data/text/party.js`, the class lines of `src/data/hunt-tutorial.js`, `tools/gen-hunt-sessions.mjs`. For X-02: `src/data/bestiary-charms.js`, `src/core/trophies.js`, `hr-accrue/trophy-claim.js`, the bestiary call in `src/session/character-session.js` (a removal), the cut rows of `src/data/bestiary.js`. The rested files above, first in the wave |
| Migrations | About six: the monster and hunt-session catalogues with the blow column and the size-alone party table, the Tower catalogue, the rested bank's server half with `clan_rested_grant`, the bestiary pieces, the XP chain where SQL reads it |
| Edge | Yes |
| Authority | The two-thirds line and the party share are computed in the settle from server Levels and the server's table. The death function is one rule in SQL and core, proven equal |
| Tests | `tests/hunt-core/run-all.mjs`, `engine-parity.mjs` (re-pinned, causes), `tests/world-tick-parity.mjs`, `tests/hunt-sessions-settle.mjs`, the curves' parity at 20 Levels (R3), a two-thirds test viewed and closed (a Level 5 behind a Level 37 four earns about 1.2 times its pace, COMPUTED in 06 2.8), `tests/party-class-xp-line.mjs` rewritten to the size-alone table with a mutation proof, `tests/party-ui.mjs`, the rested readers (`tests/accrue-envelope-away.mjs`, `session-core.mjs`, `gold-intents.mjs`, `clan-journal-guard.mjs`, `perk-channel.mjs`, `room-purpose.mjs` and the rest of the 25 test files that read "rested", Part C T-10), `tests/xp-frac-carry.mjs`, `tests/schema-drift.mjs`, `tests/restore-census.mjs`, `tests/migration-names.mjs`, `tests/apply-order-honesty.mjs`, `tests/dead-exports.mjs` |
| Matrix | `R7-tier-dial-once.json` and `party-xp-by-size.json` become built. Knob `levelShareLine`. Identity diffs for R1 to R4 |
| Live state | L-05: 21 heroes hold rested XP, 1,663 in all (COUNTED, production). It goes. Note: "Rested XP is gone." L-08: the Tower's weekly board in its week when heat leaves: the week reads under the new rule from the release, and the note says so. JUDGMENT |
| Depends on | FB-1 |
| Ruled 2026-11-21 | S-15 a: all five special rules are approved, so both folds are built here: the roll rule into GR-13 and the tier flag into one content flag, with no change in play |

#### FB-3 `lane/b-matrix-next`. Lane B. Systems engineer (the matrix lane). Waves 1 and 5, resumed between.

| | |
|---|---|
| Builds | Already on the set at 86f389b47: chapter 12's band changes 1 to 7, 9 and 10, the Level law fitted at the ruled points, and a manual `balance-diff` workflow with seeds and hours as inputs. **First in wave 1, the replay (audit A-0):** a `no_fight` end reads as a tool red, then the full matrix, the death sample at 2.5 and the lineup cells are replayed on the fixed engine. S-11, S-12 and S-14 are re-issued with the new readings and the run id. If the Level 60 lineups change, the classes look of S-10 is reopened. Then: band change 8 once S-11 is answered, and change 11 once the book drops check G's last clause (12-7-4). V5: `architecture-register.mjs --check` and `--selftest` in CI. The coupled arrival-kit run for D-3, 4 seeds of 8 hours. Check C1 for D-1. The two engine tests: heroes on both sides of one fight (MM-41), and one boss room at Levels 25, 52 and 75 (the hall check). Old against new Level for every XP value, from the two curves, for L-04. Mixed-Level and guest-seat cells (MM-19, OC1 to OC3). One unlock in a cell for D-9. Between waves: fold patch files, run diffs. Wave 5: the full matrix on the assembled set, the death sample, the three generated files re-run, and read-only playtest readers (3.5) |
| Owns | `tools/balance-program/**`, `tools/balance-sim/**`, `.github/workflows/balance-*.yml` |
| Migrations | None |
| Edge | None |
| Authority | None. Tools read, never write game data. Production reads are read-only |
| Tests | `balance-matrix.mjs --selftest` with a `no_fight` mutant, the workflow's own selftest, the register guard's selftest. Proofs only for guards it edits |
| Matrix | All of it |
| Live state | None |
| Depends on | Nothing. V5's register can go green, because S-15 a is ruled |
| Ruled 2026-11-21 | D-1: a middle-of-band point for the five grounds under Level 32. D-3: the confirm run of `review/08-designer-d3.md` section 1.5 and the C1 confirm of its section 2.3. GR-38's stand-in leaves every cell under Level 110, and the seat is re-read on that base before FB-8 stage 3. D-4: the four measures of `review/06-designer-rulings-w1.md` section 5.4. D-10: the four measures of its section 6.4 join CB-2's death sample. Chapter 14: the full-game block of its section 1 joins that sample, and the calibration C-1 to C-5 of its section 2 runs against production, read-only and in aggregate |

#### FB-4 `lane/c-settle-cost`. Lane C. Reliability engineer. Wave 1, second half in wave 4.

| | |
|---|---|
| Builds | First half, study 48 steps 1, 3, 4 and 5: read once (the settle's party read evaluated once), the narrow town read, confirm in the edge and save at the flush with its written failure case, the hourly journal (one row a hero an hour an activity, from the parked `lane/c-ledger-fold` or retiring it), the plan fixes (indexes for the journal by user and day, the skill and XP curves by XP, the progress key, the hunt limits). The four operator tools moved to the journal's new grain (Part C M-05). An alarm: the settle read's mean beside `db_pct`, red over 40 ms. Second half: the 10 minute save for closed hunts (or 1.2 s of engine time) and the tab's confirm and heartbeat only, shipped behind a switch that is armed after one night on production (audit A-12) |
| Owns | `hr-accrue/hunt-settle.js`, `accrue-hunt.js`, `accrual*.js`, `tick.js`, `tick-reads.js`, `tick-contract.js`, `envelope.js`, after FB-2's rested lines. `src/session/hunt-poll.js`, `town-poll.js`, `live-link.js`. `tools/vitals.mjs`, `tools/economy-watch.local.mjs`, `tools/char-state.local.mjs`, `tools/hunt-health.local.mjs` |
| Migrations | About four, then about one with the switch |
| Edge | Yes |
| Authority | The journal stays the complete record as hourly sums. Every day cap reads the same on a replayed day. Never restore or evict on uncertainty |
| Tests | `tests/per-player-cost.mjs` (statements a save stay 4), `tests/hunt-sessions-settle.mjs` TICK-1, `platform-cost.mjs window` (identical end states and journal sums), `tests/ledger-rollup.mjs`, the midnight both-path arm extended to the day budget, `tests/world-tick-parity.mjs`. Closed path: a hunt that ends unwatched is simulated to its true end and the rest plan starts from that end. The report counts the tests that read single journal rows (Part C counted 121 files) |
| Matrix | None. Cost, not balance |
| Live state | The journal's old rows stay as they are. New rows are hourly from the release |
| Depends on | FB-2's rested lines. The second half on the first half and its switch |

#### FB-5 `lane/c-first-hour`. Lane C. Backend architect, with the art director and the asset director. Wave 1.

| | |
|---|---|
| Builds | Four starter slots at no cost (retires staged 1015). The account kit once with the first hero, the hero kit once a slot, practice weapons only for a remade hero (CE-10). The weapon pick at creation from the starter set rows, no card preselected, the "Good first hero" mark, heroes two to four pre-filled as shield, staff and bow in one press, the look copy (GR-24). The Path table with every first-build row (1.3 point 6). Tutorial and coach state on the account, never on the hero. The first objective never under Chat, with Chat still open by default (2026-10-22). The Cellar's end card says "Build your party". "It is safe to close the game" before the first leave. Player text the change makes false (Part C M-02): "Hero slots: 1 to start", "No classes, nothing to pick", the coach's "Buy a hero slot", the summary's "Next buy: Hero slot" |
| Owns | `src/app/hero-create.js`, `slot-offer.js`, `character-strip.js`, `roster-faces.js`. `src/session/account-session.js` and `hr-accrue/unlock-catalogue.js` (the slot buy, Part C D-07). `src/data/start-kit.js`, `shops.js` (hero slot rows), `hunt-tutorial.js` after FB-2, `tips.js`, `how-to-play.js`, `text/slots.js`, `text/coach.js`, `text/summary.js`, a new Path table in `src/data`. `src/core/goals.js`, `src/shell/next-buy.js`. `src/session/tutorial-sections.js`. `src/shell/start-open.js`, `window-manager.js` (open rules only), `launcher*.js`, splitting `launcher.js` first |
| Migrations | About three: the slots, the kit grants with their once-only self-check, tutorial state on the account with its seed |
| Edge | Yes, for `unlock-catalogue.js` |
| Authority | Slots and kits granted by RPC from the server catalogue (`hr_start_kit`), once, journalled. The pick sends a starter set id the server checks |
| Tests | `tests/hero-slot-buy.mjs` rewritten to starter slots. `tests/slot-price-guard.mjs` rewritten to four free slots with a mutation proof, or retired with a written proof that no other guard loses a catch. `tests/hero-slots-one.mjs`, `four-hero-slots.mjs`, `_slots.mjs`, `play-cap.mjs`, `balance-guard.mjs` (Part C T-09). A kit test (once an account, once a slot, a remade hero gets practice weapons only, existing accounts get nothing). `tests/start-kit-pace.mjs`. The Path guard: every Level 1 to 30 names a next thing within 3 Levels. Tutorial once for four heroes. The first objective visible with Chat open. `tests/client-module-size.mjs` after the split |
| Matrix | Check C3 as a standing cell: the default company, with the four that has no healer printed beside it |
| Live state | L-01: 9 hero slots were bought with gold by 4 accounts, 385,000 gold in all (COUNTED, production). No refund (2026-11-07, 2026-11-09). Note: "All four hero slots are free. Gold paid for slots is not returned." L-02: the 7 accounts and 22 heroes that exist are marked as granted in the same migration, so nobody is paid the kit again. L-03: 21 of 22 heroes hold coach state in `player_state.client_state` under `coach` (COUNTED, production). The seed: an account counts as taught for a step if any of its heroes is |
| Depends on | D-1. FB-2's class lines in `hunt-tutorial.js` |
| Ruled 2026-11-21 | D-1: every first-build Path row of `review/05-designer-rulings.md` section 1.1, in one new data file that types no Level. The press reads "Build your party". The pick wears the whole STARTER_SETS row. DANGER_LEVEL and DANGER_KIT are retired. The wand card's cost line reads "About 100 gold", with the clause that its loot sells for more (D-3). The Path guard ships strict with its named list of Levels 16, 25 and 26 |

#### FB-6 `lane/c-company`. Lane C. Backend architect (FB-5's agent), with the asset director. Wave 2.

| | |
|---|---|
| Builds | One plan for each hero on one company card, any line set once for all four. One Start that the server expands into the same per-hero starts, including the three recruits' lone Cellar hunts. Own heroes partied by the plan with no invite, a hunting hero joined at its hunt's end and never refused with no way forward. The leader named by the plan (D-2). "If one falls" as one plan line, with staged 1025 holding its shape until S-14 is answered. Tamsin's task taken on entry (GR-78). Each ground pointing to one of the hero's Setups. The slots themselves are built and priced already (`src/data/gold-sinks.js:22`, `hr_setup_slot_buy`, Part C D-03). "Equip upgrades for all four" on the end card and the return card, and the mid-hunt rule (D-2). One return card with line providers. The rest plan's queue, its ending per D-11 |
| Owns | `src/session/carry-on-intents.js`, `party-intents.js`, `preset-intents.js`, `preset-read.js`, `hunt-after-intents.js`, `hunt-after-sections.js`, `loot-intents.js`. `src/shell/carry-on.js`, `away-recap.js`, `back-in-town.js`, `after-hunt.js`, `hunt-after.js`, `upgrade-plan.js`, `hunt-go.js`, `prep-draft.js`, `setup-words.js`, `windows/party.js`, `windows/hunt-prep*`, `windows/away.js`. `src/data/hunt-after.js`, `basic-setups.js`, `party.js`. `hr-accrue/intents.js` |
| Migrations | About four: the company Start, the party door and leader and the fall line, the ground's pointer to a Setup, equip for four with the mid-hunt rule and the task on entry |
| Edge | Yes |
| Authority | One Start is one intent through the existing doors and checks. Equip moves items only between one account's heroes, by RPC, through the server's wield gate |
| Tests | `tests/carry-on.mjs` and `tests/hunt-carry-race.mjs`, viewed and closed. Four hunts from one press, viewed and closed. The party door with a hunting hero. The Setup pointer. A tank with no armor at the end card is dressed by one press. The return card holds at most three "Needs you", ranked. `tests/job-counts.mjs`, `tests/party-flow.mjs`, `tests/party-ui.mjs` |
| Matrix | None new |
| Live state | L-08: "leave together" is ticked on all 22 heroes (COUNTED, production). Staged 1025 turns every tick to unset, and its own note asks for the line: "Your heroes no longer all come home when one falls unless you choose it." The line changes if S-14 changes the default |
| Depends on | FB-5 |
| Ruled 2026-11-21 | D-2: the plan line "Wear upgrades" beside "Keep my party blessed". The test reads "a tank with no armor at the end card is dressed at the next Start with no press", viewed and closed. A visiting player gets one mid-hunt press that leaves, equips and goes back in. The pick of what is better moves to `src/core`. The leader defaults to the engine's front hero by `ROLE_ORDER` and may be pinned. The eight "Needs you" kinds are rows of `hunt-after.js`, owned here. D-11: this lane owns the rest plan's rows, and no ending starts a hunt. S-14 a: the default is "the rest hunt on", so staged 1025 applies as written and the release line stands |

#### FB-7 `lane/c-hunt-report`. Lane C. Backend architect, with the asset director. Wave 2.

| | |
|---|---|
| Builds | GR-66's free risk block: lowest health for each hero with the monster and blow, close calls under a quarter, what ran out and when, each death with its Level XP and hours and what Blessings saved, and the one word Safe, Close or Near death. The tier's own line before Enter, generated from the replayed matrix and read at the gear state the party wears (D-1), the first harder tier offer included. The rules block: fired, never fired with the reason, the change line, the share. Lowest health and the tally's three fields in the server tally, so survival can be calibrated |
| Owns | `src/core/hunt/tally.js`, `hr-accrue/hunt-settle.js` and `accrue-hunt.js` in wave 2 before FB-10, `src/hunt-view/summary-model.js`, `summary-recorder.js`, `death-explain.js`, `src/session/hunt-summaries.js`, `src/shell/result-block.js`, `windows/hunt-summary.js`, `windows/hunt-detail.js`. A new generated tier-risk file in `src/data` and its generator |
| Migrations | About two: the session row counters, the free block of the analyzer |
| Edge | Yes |
| Authority | A read-only projection of server counters. Nothing can be spent from it |
| Tests | The analyzer parity arms extended. The same block for a hunt viewed and closed. The generator's `--check` with a mutant. `tests/per-player-cost.mjs`: no added statement |
| Matrix | The player and the matrix read the same counter. FB-3 re-generates the tier line in wave 5 |
| Live state | None. Old hunts show the block they had |
| Depends on | FB-4 first half, FB-3's replay, D-1 |
| Ruled 2026-11-21 | D-1: this lane owns `offerMax`, `minHours`, the reader of the gear state the party wears by its weakest hero, and the words of `review/05-designer-rulings.md` section 1.4. It adds the event `first_harder_tier` and deletes the Path guard's named list in the commit that adds the generated tier-risk file. Chapter 14: the kept row for a finished hunt, if it adds no statement |

#### FB-8 `lane/c-pace`. Lane C. Systems engineer (FB-2's agent), with the asset director for any new item row. Waves 2 and 3. Engine batch 2, first holder.

| | |
|---|---|
| Builds | Stage 1, the gear curve (R10, R11): the curve in `src/data` at +17% bands, tiers 1 to 7 as samples of it, the Level 110 band as the played sample past Krell (its grounds per D-3), uniques at exchange rates, the armor half per D-3. Stage 2 (R9, R12): one coin line, XP a health point on the pace line with one kill-rate reference, the derived number a ground carries written by a generator, one tier table with one pull number a tier (Dangerous 5, Deadly 8, both blows 2.5 times Normal pending the replay, health 1.10 and 1.15, Level XP 1.10 and 1.25), the per-ground dials and the floor-16 pull rule removed in the same step, any tier row D-10 rules. Stage 3 (R13): the Level law's convex cut from a generator, on the seat S-11 picks, reproducing 1016's ruled points, and the Blessing ladder's rungs (D-4) |
| Owns | `src/data/gear-tiers.js`, `items.js` where a gear row is overridden, `wave3-uniques.js`, `hunt-xp.js`, `hunt-tiers.js`, `balance-sheet.js`, `scaled-hunts.js`, `monsters.js` and `tools/gen-hunt-sessions.mjs` before FB-10, `blessings.js`, `src/shell/bless-all.js`, `windows/death.js`, `windows/services.js` (Part C D-07), `src/core/hunt-rewards.js`, `src/core/xp.js`, the engine files of 2.2 in wave 2. New generated ground-pace and Level law files and their generators. If D-3 opens the two grounds: `src/data/hunts.js` (the `staged` flag) |
| Migrations | About seven, mostly generated: items, ground tiers and hunt sessions, scaled hunts and the Tower, the Level curve (follows applied 1000, retires staged 1016), XP a kill (follows applied 1001), the Blessing ladder. Retires staged 1020, 1023 and 1031 (1.3 point 8) |
| Edge | Yes |
| Authority | XP and coin are minted only in the settle from server catalogues. The Level curve is a generated server table with a drift guard. A Blessing is bought by RPC at the server's price, journalled |
| Tests | `tests/hunt-core/run-all.mjs` and `engine-parity.mjs`, `tests/hunt-core/hunt-tiers.mjs` with its vacuous mutants fixed, `tests/level-curve.mjs` (T-02 green here), `tests/armor-line.mjs`, `tests/weapon-line.mjs`, `tests/temper-uniques.mjs` (Part C T-04), each generator's `--check` with a mutant, a ladder test (a rung opens past the threshold, price from the server, journalled), death viewed and closed, `tests/xp-frac-carry.mjs`, the scaled-hunt tests |
| Matrix | `bp-gear-step-117.json`, `R10-gear-curve.json`, `R12-kill-reward.json`, `bp-tiers-2500.json` and `R13-level-law.json`, fitted at the ruled points on the Dangerous seat (S-11 c), become built. The death sample after stage 2 and again at the end of CB-2, both on the fixed engine |
| Live state | L-04: every one of the 22 heroes moves under the new law. Their Level XP spans 0 to about 102 million: 6 heroes under 1 million, 4 from 1 to 10 million, 8 from 10 to 50 million, 4 over 50 million (COUNTED, production). FB-3 computes old against new Level for every XP value. Gear is gated by Level at equip only, so a hero whose Level falls keeps what it wears. Note: "Every hero's Level was re-cut on the new Level table. XP is unchanged." L-08: 20 heroes hold each of the three Blessings (COUNTED, production). They keep them, and the ladder adds rungs past the third |
| Depends on | FB-2 (R7). FB-3's replay. FB-9's price rows before the ladder is sold |
| Ruled 2026-11-21 | D-3, stage 1: the armor rows of `review/08-designer-d3.md` section 1.4, `armorCurve` at 0.96 and 1.488, tiers 1 to 7 as built with the curve writing armor from Level 110, and the heavy trade of its section 4. The two grounds stay staged, so this lane does not take `hunts.js`. Stage 2: the kill reward's low end at exponent 1.1 and the rule that a ground carries a number from Level 10. D-10, stage 2: the group rows `river_chill` and `grave_chill`, and no tier row. D-4, stage 3: the rule of `review/06-designer-rulings-w1.md` section 5.2 with generated rung Levels. Its test: a death costs the pace seat no more than 5 hours with every rung held, at Levels 100, 200, 300 and 400. S-11 c: the law is fitted on the Dangerous seat, re-read on the base of D-3. S-12 a: the dial is sized for the count on arrival |

#### FB-9 `lane/c-economy`. Lane C. Backend architect. Wave 3.

| | |
|---|---|
| Builds | The wage curve (R15): `wage(L)` from the coin line and the kill-rate reference, on a mid four on Normal, computed by the server from a generated table. Prices as rows of hours: the refill's base (steps RULED), Blessings at every rung, the talent reset, rename and colors. Before any price, the rooms the book cuts are added to `HELD_HOME_ROOMS` (`src/data/homestead-tiers.js:38`): the Cellar's five food rungs and the sixteen speed rungs (Part C X-01). Then the account prices of CE-5 set once from the curve: deeds, room rungs and chests. The screen's "about 3 hours of hunting". The market open from the first loot (GR-55), which today is the config row `hr_market_config.min_level`. The stackable price ceiling with no minimum a unit closed (GR-59b). The Weighhouse per D-5, with its words |
| Owns | A new `src/core/wage.js` (pure, both runtimes) and a new price-hours file in `src/data`. `src/data/stamina-refill.js`, `shops.js` (deeds and rooms), `homestead-tiers.js`, `src/data/perks.js` (held rooms), `town-works.js`, the Weighhouse step of `hunt-tutorial.js`. The market's SQL, `src/session/market-intents.js`, `src/shell/market-*.js`, `src/shell/windows/market/*` (Part C D-07), `windows/havora/works.js`, `sink-words.js` |
| Migrations | About four: the wage table (generated), price rows and the RPCs that read them (following staged 1009), the held rooms and the account prices (following staged 1011), the market's door and the laundering route. 1013 and 1014 stand (D-5) |
| Edge | Possibly, where `spend.js` prices a purchase |
| Authority | Every price is computed on the server from its own wage table and the hero's server Level. One ledger row a purchase. The market keeps its locks and caps |
| Tests | Core and SQL wage equal at 20 Levels. A forged price refused for a refill and a Blessing. The refill bought and spent with the hunt viewed and with the browser closed (audit A-15). `tests/market-v2.mjs`, `tests/market-edge.mjs`, a day-one market test, a GR-59b test |
| Matrix | Knob `wageShare`. FB-3 adds the wage reader to bands G-8 and S10 |
| Live state | L-06: 54 owned unlocks over 6 accounts in `player_progress` (kind `unlock`): room 24, temper 16, property 13, bank 1 (COUNTED, production). Everything owned is kept at the price paid. A held room keeps what is owned and sells no more. Note: "Prices changed. What you own stays yours" |
| Depends on | FB-8 stage 2 |
| Ruled 2026-11-21 | D-5: this lane owns the hours rows (the refill's base 2, Blessings 0.4, 0.6 and 1.0, a rung past the third a fifth of the hours it saves, the talent reset 3, rename 8, colors 1), the deed generator with its one factor for rooms and chests, `wageShare` at 0.80, the Weighhouse's words and its tutorial step. Its tests add the refill's six prices at Levels 20 and 200 in hours, a set-once deed equal to its generated row, and the market open with the Works unfinished. The refill's base is open for Tyler's veto as reversal 28 |

#### FB-10 `lane/c-town-closed`. Lane C. Reliability engineer (FB-4's agent). Wave 2.

| | |
|---|---|
| Builds | Town work paid in closed form for training, gathering and benches: at the start, at each paid hour and at a stop, every roll seeded at the start. Training is a hunt today, a yard or dummy session on a one-pocket ground settled by the combat engine (`src/data/training.js:15-21`), so it leaves the engine for closed form here, with training items burned by paid time and the play cap no longer counting it as a hunt (Part C D-02). The screen moves in real time as a prediction nothing can spend (CE-7). A press that needs the items or the level settles the job first. The yard fee at 100 gold times the skill level an hour (RULED 2026-11-20) on the flat rate as ruled, since GR-54's rate change waits. A standing job with no count, which stops after 24 hours (D-11). Staged 1026 kept, re-cut or withdrawn with D-11. A town-hour fixture, a replayed day equal to tick settles, and a synthetic load of 1,000 accounts |
| Owns | `hr-accrue/tick-gather.js`, `accrue-gather.js`, `accrue-artisan.js`, `tick-artisan.js`, `set-activity.js`, `settle-first.js`, the `tick*.js` and `accrual*.js` files from FB-4, `hunt-settle.js` and `accrue-hunt.js` after FB-7. Training (2.2): `src/core/hunt/training.js`, `src/data/hunt-grounds.js`, `src/data/training.js`, `windows/training.js`, `windows/house-dummy.js`, the dummy and training rows of `monsters.js` and `tools/gen-hunt-sessions.mjs` after FB-8. `src/core/skill-sim.js`, `artisan-sim.js`, `artisan.js`. `src/shell/town-work.js`, `training-now.js`, `training-words.js`, `away-work.js`. `src/session/town-intents.js`, `training-intents.js`, `training-sections.js` |
| Migrations | About four: closed-form job rows, training out of the hunt path, the yard fee, the sweep and 1026's fate |
| Edge | Yes |
| Authority | XP, items and gold from town work are paid only by the server at the three points, from server catalogues and the server clock. Journalled through the hourly journal |
| Tests | `tests/world-tick-parity.mjs` gather arm, the replayed-day equality, each activity viewed and closed, `tests/settle-carry-defer.mjs`, `tests/conservation-fuzz.mjs`, the fee's self-check, the load test's report. The 21 test files that test training as a hunt, among them `combat-training.mjs`, `combat-training-db.mjs`, `training-gear-db.mjs`, `training-window.mjs` (with its clock pinned, T-08) and `mode-death.mjs` (Part C T-11) |
| Matrix | The town-hour fixture feeds bands T7 and TD1 through FB-3 |
| Live state | L-08: 14 heroes were gathering and 8 idle at the count (COUNTED, production). At the release each running job is settled to the instant by the old path and restarts in closed form from there. JUDGMENT. Note: "Town work now pays by the hour" |
| Depends on | FB-4 first half, FB-7 (hunt-settle.js), FB-8 (monsters.js) |
| Ruled 2026-11-21 | D-11: this lane owns the server half of the standing job and re-cuts staged 1026. Its counts are kept. Its sweep that starts jobs and its "hunt THEN" are withdrawn. A standing job runs until the hero next hunts, its bag fills, or 24 hours pass. The first-build choices are Gather the best I can, Train and Wait in town. Labor and Fuel the Hearth wait |

#### FB-11 `lane/c-talents`. Lane C. Systems engineer (FB-3's agent), with the asset director. Wave 3. Engine batch 2, second holder.

| | |
|---|---|
| Builds | Chapter 10 as specified, with the half point D-9 rules: `src/data/talents.js` and `src/core/talents.js`, R20 (one modifier table, identity) with its "when" column, the four stat lines through the member, Linger and the five rank 3 unlocks (Focus fire, Surrounded, Draw fire in the shooter rule and switchable, Deep well, Carry over), the to-hit floor that CORE-4 owes because Footing is the first rating row. One row a hero with raise-only points, the six RPCs (spend, plan, use suggested, copy, switch, reset), points raised in the settle and spent by the plan with the browser closed, the projection, the Talents panel from the Character window, one return-card provider |
| Owns | `src/data/talents.js`, `src/core/talents.js`, a new modifier table in `src/core`, the engine files of 2.2 in wave 3 (the member read, `targeting.js`, `status.js`, `vitals.js`), `src/data/to-hit.js`, `src/shell/windows/character/*`, new talent intent and section files in `src/session` |
| Migrations | About three: the table and projection, the RPCs with ledger and clamps, the catalogue |
| Edge | Yes |
| Authority | Chapter 10 section 9. The client sends a track id and a count only. The reset price is computed on the server in hours of wage, free under Level 30, ten a day, one ledger row each, free ones included |
| Tests | The seven self-checks of chapter 10 9.4. A point arriving mid-hunt, viewed and closed, gives one result. R20's empty diff. Each unlock in and out of its case. `tests/hunt-core/engine-parity.mjs`. `tests/layering.mjs` |
| Matrix | The six knobs of chapter 10 5.4, bands TL1 to TL4, builds A to D. The game's own `talents.js` replaces the matrix's scratch hook |
| Live state | Every hero is granted the points its highest Level earns, with no plan, so they show as free points on the return card |
| Depends on | FB-2 (R3), FB-8 stage 2 (the engine handed over), FB-9 (the wage), D-9 |

#### FB-12 `lane/c-social`. Lane C. Backend architect, with the art director and the asset director. Wave 3.

| | |
|---|---|
| Builds | Chat and clans: the Local tab and the live party finder removed (RULED, GR-69), the server's `hr_hunt_party_finder` dropped with it, Global in small batches with a slow mode (31-1), a Clan tab, the clan roster, chat and browser on the clan RPCs the server already holds. Every castle, feast, upkeep, vote and work-order call is hidden, never dropped, because the castle is built later (Part C X-04). Applied 1003 revoked client writes on `clan_member`, and this lane reads it before opening clans. Then friends for each account with one request (MM-47), the friend link at sign-up (GR-72), the presence strip on a ground and heroes at work in town with quiet presence (MM-20, GR-70), and the calendar with the Hearthrise weekend sized by the fire (MM-11, CE-8). The party window's "Open the party finder" and its text in `src/data/text/hunts.js` go with the finder |
| Owns | `src/social/*`, `src/data/chat-channels.js`, `social-menu.js`, `social-settings.js`, `town-presence.js`, `town-criers.js`, `live-events.js`, `hearth.js`, `text/hunts.js`. `src/session/town-presence.js`, `live-event-sections.js`, `hearth-intents.js`. `windows/chat*.js`, `friends.js`, `party-finder.js` (deleted), `windows/party.js` and `windows/hunts.js` (the finder's imports), `src/session/party-sections.js` and `character-session.js` (removals only), new clan windows, `live-events-view.js` |
| Migrations | About four: chat kinds and the finder's RPC, clan grants with the castle calls hidden, friends and the link, the presence read and calendar rows |
| Edge | None expected |
| Authority | Names and lines checked on the server with blocks, mutes and the filter. Founding a clan costs gold by RPC, journalled. The event's XP comes from the server's calendar row and clock only |
| Tests | `tests/chat-social.mjs`, `tests/chat-broadcast.mjs`, `tests/town-presence.mjs`, the four clan guards by name (`tests/clan-economy-sinks.mjs`, `clan-feast-catalogue-drift.mjs`, `clan-deposit-ownership.mjs`, `clan-journal-guard.mjs`, Part C T-12) with the hidden calls refused and never dropped, a friends link test from both sides, the weekend's XP on a closed hunt by the server clock, `tests/party-flow.mjs`, `tests/party-ui.mjs`, `tests/client-intent-surface.mjs` |
| Matrix | Event XP is in no cell. FB-3 prints the weekend beside the pace readings |
| Live state | L-07 is closed: 0 clans and 0 clan members (COUNTED, production). Note: "The party finder and the Local tab are gone" |
| Depends on | Nothing |
| Ruled 2026-11-21 | D-7: this lane builds the `world_boss` event type, the 28 day anchor, the fire row, its hourly fold and the boss mark's column, and removes `open_halls`. Its tests add the fire's size read once at the lighting, the day cap of four shares, the reset, the boss mark, and a range refused past 1250 |

#### FB-13 `lane/c-world-boss`. Lane C. Systems engineer (FB-8's agent), with the asset director. Wave 4. Engine batch 3, first holder.

| | |
|---|---|
| Builds | One sample boss (D-6): one server-wide pool, rooms scaled to the party's Level by the one monster formula and the hall number, the ruled phases, the one tier table, points as bars broken times the tier's XP multiplier, the pool sized by weekly active accounts with a floor, a window of about 72 hours on the server clock, a chest at three point thresholds by the account's own points that pays the boss's first gear line or a buff, a trophy and the plaque, a death that is a normal death (MM-7), the risk reading on the card, the parties in the fight on the presence strip. Level XP about a Normal hunt's, no coin. The boss's portrait, world sprite and room through the art manifests and `tests/world-assets.mjs` |
| Owns | `src/core/hunt/boss-room.js`, `boss-phases.js`, `tally.js` in wave 4, a new world boss data file, `src/session/boss-intents.js` (its world boss part), a new world boss window, `hr-accrue/intents.js` in wave 4, the boss's rows in `src/data/monster-art.js` |
| Migrations | About three: the pool and window with a fold of one statement a minute, the send and points in the session row, the chest from a server catalogue, journalled |
| Edge | Yes |
| Authority | Points are counted only in the settle. The pool is folded by the server. The chest is granted by RPC against the server's points, once an account a boss |
| Tests | The boss viewed and closed. The fold is idempotent. The chest once at each threshold. A death in the room costs what a death costs elsewhere, with Blessings. `tests/world-assets.mjs`. The plain four's diff is empty |
| Matrix | Knobs `bossPoolPerAccount`, `bossPoolFloor`, the hall number. FB-3's boss room cells at three Levels |
| Live state | None |
| Depends on | FB-8 (the tier table), FB-7 (the risk reading), FB-12 (presence), FB-11 (the modifier table, for the buff) |
| Ruled 2026-11-21 | D-6: the boss is Mossback at the Mill Pond. This lane adds two spell rows, the boss row, the add row for Rook's poachers, the cape generator for the Mossback Cloak in four cuts, the trophy and its allowlist line, the Chronicle page, the window's words, the plaque and the fire mark. The marks are 2, 6 and 12 Normal party-hours. The fall bonus waits. The asset director's list is `review/06-designer-rulings-w1.md` section 2.6 |

#### FB-14 `lane/c-on-call`. Lane C. Backend architect. Wave 4. Engine batch 3, second holder. The first lane to ship dark if the date slips.

| | |
|---|---|
| Builds | Chapter 11 section 1: the consent row, the window on the server clock (once in 24 hours, 12 hours long), hire stamina as its own pool (`hire_stamina_ms`, 12 hours, full when a window opens, drained only by a guest settle, no refill sold), Seat as part of the party start (friends and clan mates only), Recall, the guest seat in the settle at `onCallXpShare`, no coin, drops or supplies to the owner, the caller's purse stocking the guest, no loss on death, the two-thirds line, one ledger row a seat, the clamps, and the screens (the rest plan switch, Seat in Friends and the roster, the guest card with hire stamina, a second bar on the hero strip, one return-card provider) |
| Owns | New on-call data and core files, the engine files of 2.2 after FB-13 (the guest credit), `hunt-settle.js` after FB-4's second half, `windows/party.js` and `hunt-prep*`, `hr-accrue/intents.js` after FB-13 |
| Migrations | About three: consent and window with hire stamina, Seat and Recall, the settle credit and ledger |
| Edge | Yes |
| Authority | The one cross-account write in the build. The only caller input is which consenting hero sits where. Hire stamina is raised only by a window opening. No intent can raise it |
| Tests | Chapter 11 1.8's eight self-checks. The guest credited the same with the caller's browser open and closed. An own hunt changes hire stamina by nothing and a guest hunt changes own stamina by nothing |
| Matrix | Knobs `onCallXpShare`, `hireStaminaHours`, `onCallSeatsPerParty`. Bands OC1 to OC3 through FB-3 |
| Live state | None. Every hero starts with on call off |
| Depends on | FB-6, FB-10, FB-12, FB-4 second half, FB-13 |
| Ruled 2026-11-21 | D-8: this lane owns `src/data/on-call.js`. On call opens at hero Level 10, the default tier limit is Dangerous, the default "who" is friends and clan, and `onCallXpShare` is 0.10. Its tests add the refusal for a tier over the limit and for a hero under Level 10 |

#### FB-15 `lane/c-premium-and-crowns`. Lane C. Backend architect. Wave 4. Premium for the account only. Test Crowns wait (S-17 a, RULED 2026-11-21).

| | |
|---|---|
| Builds | Premium for the account in place of each character, as ruled (PREM-1): the 12 hour bar on every hero, the analyzer, the daily claim with no press. S-17 a is ruled, so nothing after this sentence is built here. It moves to lane FR-16. Had b been chosen: a Crown balance on the account, the weekly test-Crown allowance behind one server switch, off by default, every grant journalled and removed before Early Access, the amount Tyler names (MM-43), the Crown Exchange (MM-35: one server-owned book, fixed lots, one trade then bound, 1% to list and 4% of the gold both burned), the eight clamps (MM-36), no seeded price, and thirty days of Premium bought with Crowns. No real-money purchase is built. If c: the beta Premium switch is turned off and no Crowns are built. If a: the beta switch stays on and no Crowns are built |
| Owns | `src/data/premium.js`, the stamina cap readers. If b: a new Crowns data file, new Crown intent files in `src/session`, a new exchange window |
| Migrations | About two for Premium for the account. About three more if b: the balance and ledger kinds, the switch, the book and clamps |
| Edge | Possibly, for the exchange's verbs |
| Authority | Every Crown and gold movement by RPC on a server-owned book, server clock, per-call and per-day clamps, an append-only ledger |
| Tests | Premium read by every hero's stamina cap, viewed and closed. If b: a self-check for each clamp, a forged price or lot refused, fees burned and gold conserved, the switch off grants nothing |
| Matrix | None. FB-3 reads Premium's bar in the stamina-day model |
| Live state | L-08: Premium is active on 3 of 22 heroes (COUNTED, production), all from the owner's own grant, since no player can buy it today. The account keeps the latest end date any of its heroes held. JUDGMENT. Note: "Premium now covers every hero on the account" |
| Depends on | FB-9 |
| Ruled 2026-11-21 | S-17 a: this lane shrinks to Premium for the account. Every "if b" line above is not built. The closed-beta switch keeps Premium on for every hero in the playtest. Test Crowns and the Crown Exchange move to lane FR-16 of chapter 14 |

## 3. Gates and the release

### 3.1 Assembly and the record gate

Lanes merge into `set/v0.2.144` as they land. The set is pushed to `next` and GitHub judges it there, one run at a time, with the nightly behind it, under the gate rule of 2.3. A red is fixed forward by the lane that wrote it. The record gate is the GitHub matrix on `release/vX.Y.Z` (CLAUDE.md 3.3). Production stays frozen on v0.2.143 except for P0 hotfixes (2026-11-21).

Wave 5 runs the full matrix once on the assembled set, the death sample at the sized dials, and all three generated files: the ground number, the tier risk line and the Level law, so the law is fitted with Talents in (audit A-10). The matrix is a report and gates nothing, because GR-88 is PROVISIONAL. One cell is a gate: check C3, the default company holding the Sewer on Normal at Level 5. JUDGMENT.

### 3.2 The visual and play gates

- **Visual gate**, on the assembled set, desktop first, then 922 by 423 if usage allows, screenshots read by the art director: creation, town with Chat open, Hunts, the end card, the return card, the company card, the party window, the Talents panel, Chat with the Clan tab, the clan browser, the calendar, the market, the world boss window and its room, the Crown Exchange if built, and combat and inventory because CSS moves.
- **Play gate before the release**, on `tools/qa/local-world.mjs` (the real `play.html` and engine on the replayed chain): a new account from the sign-in screen, four heroes, the first hour to the Sewer, the first harder tier offer, close, skip 8 hours, the return card, equip for four, Carry on, Talents at Level 10, a death and its card. Read as page text. This replays the four-hero hour of `review/02-four-hero-hour.md` against its five fixes.
- **Play gate after the apply**, on live as the QA account: reload, pick a hunt, hunt, the hunt ends, back in town, one-tap refill, the bag, reload, and a fresh account's first minutes.
- **The player-text gate, before the release.** `node tools/player-read.local.mjs <base>` lists every player line that is new or changed since the base. A fresh reader, who has not seen the design, judges each one before the release: does it read like a person wrote it, in plain words, and does it say what the player can do next. The designer rulings added many player lines (the Path, "Needs you", the plan lines, the Weighhouse, Mossback, the calendar and on call), so this gate is not optional for this build. A line the reader fails goes back to the lane that owns its file.

### 3.3 The release window

1. Bump, one CHANGELOG entry in player words, push `release/vX.Y.Z`, GitHub green.
2. Rehearse with `tools/restore-drill.local.mjs` on a copy of production: the numbered chain from 1009 that is still staged after the retirements of 1.3 point 8 (25 files today), this build's files (about 50), then the edge deploy on the copy. Every self-check passes there. The rehearsal times the window and records what running hunts do in it.
3. Out of the window: the held files, each waiting on its own word. `2027-05-27-arm-factions.sql` (D-3 keeps factions held, and Tyler may veto that as D3-2), `2027-02-10-playtest-open.sql`, `2027-02-14-market-off.sql`, `2027-02-20-market-wipe.sql`, `2027-02-20-market-wipe-resume.sql`, `2027-02-25-character-wipe.sql` (Part C C-06).
4. **Running hunts.** Between the first world-shape catalogue and the edge deploy, running hunts sit on the old engine with new catalogues. JUDGMENT, from the same thing on 2026-10-31: expect every hunt to pause until the deploy, then restart its world once. The window is kept as short as the rehearsal shows, and the note says hunts paused (audit A-11).
5. The Coordinator applies one file a call with `tools/apply-migration.mjs` in sequence order, then re-measures `live-hash-drift --live --write` and flips each sidecar in one commit.
6. One local `node tests/run-smoke.mjs`, then the edge deploy with `pack-edge --hash` equal to the live `payload_sha256`.
7. Push `main`. Once Pages serves the version, the Discord note.

**Live characters.** The release lands on the 7 accounts and 22 heroes as they stand, by the rulings of 2026-11-07 and 2026-11-09. There is no wipe, no refund and no protection code. Chapter 09's line that the Level curve lands at the wipe is corrected by the integrator to this (Part C C-05). The 9 hero slots bought for 385,000 gold are not refunded, and a refund would be a grant (audit L-01). The release note says what moved on existing characters, one line each, from the live-state rows of 2.6:

| What moved | Lane |
|---|---|
| All four hero slots are free. Gold paid for slots is not returned | FB-5 |
| The tutorial counts as done for the account where any hero has done it | FB-5 |
| Every hero's Level was re-cut on the new table. XP is unchanged | FB-8 |
| Rested XP is gone | FB-2 |
| Heroes no longer all come home when one falls unless you choose it | FB-6 |
| Prices changed. What you own stays yours | FB-9 |
| Town work pays by the hour | FB-10 |
| Talent points arrived for every Level already reached | FB-11 |
| Premium covers every hero on the account | FB-15 |
| The party finder and the Local tab are gone | FB-12 |
| The XP weekend is now the Hearthrise, every four weeks | FB-12 |
| The market is open from day one. The town is still raising the Weighhouse, and you can give toward it at Works | FB-9 |
| Hunts paused during the update | The Coordinator |

The read-only production counts behind these rows were taken on 2026-11-21. The queries are in `review/04c-existing-game-coverage.md` section 2.6, and the Coordinator re-runs them on release day.

### 3.4 After it ships

A blind playthrough audit of what changed, learning only from the screen, and a Level 1 to 20 pass. Findings go to fix lanes. The game designer re-reads the changed systems and the new-player path (CLAUDE.md 3.5).

### 3.5 What the playtest must measure

FB-3 builds read-only readers in wave 5. Production is read, never written. The live game holds 7 accounts today (COUNTED, production), so most rows below need more players than that. Who plays is ruled (S-18 c): the playtest runs in two steps. First the accounts in now play, to catch what breaks. Then about 30 accounts are invited, once the play gate and one blind first-hour pass are clean. The rows that need more than a handful of accounts are read in the second step. Chapter 14 changes what the playtest is for: anything the engine decides is sized in the simulator and calibrated against production, and the playtest reads only what a player chooses.

| Measure | Read from | Accounts it needs | It settles |
|---|---|---|---|
| Deaths in 1,000 hunted hours by ground, tier and Level band, a party-hour and a hero-hour, with lowest health | The server tally (FB-7) and the ledger | Hundreds of hunted hours a tier and band. COMPUTED: at the ruled floor of 10 in 1,000 hours, 300 hunted hours show about 3 deaths | CORE-1, GR-27 and S-12's counts. The ladder's threshold (GR-7). MM-7 |
| Real gold: net gold a hero-hour by Level and tier, the store's share, vendor against market | The ledger | Every account that plays, read by Level band | The wage formula against played gold within 10% (GR-51). CE-4, CE-5, GR-58 |
| Which fours players run, by weapon way, tier and Level | Session rows | As many as play. JUDGMENT: under 10 accounts shows taste, not a pattern | S-10 c: whether the classes rule returns as one row |
| The first hour: time to four heroes hunting, quit points, return visit length (under 4 minutes) | Session replays and the Path's events | Five strangers, as the review asks (section 7) | GR-79, GR-80, C3 past minute 17 |
| Talents: the share of each way on the same top two tracks, banked points, resets | The talents rows and ledger | About 30. COMPUTED: 20 heroes on each of six ways (audit A-5) | TAL-1's test: under 80% sameness |
| On call: the share of party hours with a guest | Seat ledger rows | Two clans with players in them (chapter 11 section 8) | CH11-1. Under 5% means a newcomer's helper only |
| The world boss: stamina spent on it, fall time against 36 to 60 hours | The pool and points | Any. The floor lets one account fell it | MM-2 to MM-5 |
| Crowns: not read in this playtest. Test Crowns wait (S-17 a) | The exchange ledger, in a later playtest | UNKNOWN | The review's test: over a fifth of accounts buy Crowns with gold |
| Database-seconds an account-day | `platform-cost.local.mjs minutes` | Any | The budget of 15 cents an account a month (2026-11-21) |

### 3.6 Security

The one full adversarial review is a hard gate before Early Access and not before the betas (CLAUDE.md 2 and 3.7). It must cover every surface below, and the staged chain from 1009, which rides the same release. Four staged files are surfaces of their own (audit A-21).

| Surface | Lane | What moves |
|---|---|---|
| Staged 1014: the Weighhouse goal, a shared money surface by its own note | FB-9 | Gold given to a shared project |
| Staged 1017: Tend the field, one press for every plot | The staged chain | Farm sinks and XP |
| Staged 1024: Carry on, one press for the account | FB-6 | Gold and items |
| Staged 1026: job counts and a sweep that starts jobs every minute | FB-10 | Town work started by the server |
| Four starter slots, the account kit and the hero kit a slot | FB-5 | Items and gold granted on creation |
| One Start, the party door, the leader, the fall line, Tamsin's task on entry | FB-6 | Hunts started, task gold |
| The ground's pointer to a Setup, equip for four, the mid-hunt equip | FB-6 | Items between heroes |
| The report's counters and the tier's risk line | FB-7 | Data shown |
| Read once, the narrow town read, the flush, the hourly journal, the 10 minute save and its switch | FB-4 | The settle path, day caps read from the journal |
| Closed-form town work and training, the yard fee | FB-10 | XP, items, gold |
| The death function in two runtimes, the XP chain, the two-thirds line, party XP by size, R7, the rested bank's removal | FB-2 | XP lost and credited |
| The coin line, the kill reward, the ground number, the tier table, the Level curve, the Blessing ladder | FB-8 | XP and gold minted, Blessing gold |
| The gear curve and uniques | FB-8 | Item stats |
| The wage table, every price in hours, the account prices, the market's day-one door, the stackable ceiling | FB-9 | Gold |
| Talents: six RPCs, the reset, points raised in the settle | FB-11 | Gold, combat rows |
| Clans on the 2026-08 RPCs with the castle calls hidden, clan chat, Global's slow mode, friends, the sign-up link, presence, the calendar's XP weekend | FB-12 | Gold, names, XP multiplier, data shown |
| The world boss pool, points, window and chest. The chest grants items and a buff by points. The fall writes the fire | FB-13 | Items, buffs, XP, the Hearthrise's size |
| On call: the cross-account XP write, hire stamina, consent, Seat and Recall | FB-14 | XP to another account's hero |
| Premium for the account. Test Crowns, the exchange and its clamps wait (S-17 a) and join the review with lane FR-16 | FB-15 | Premium |

## 4. Risks and what is UNKNOWN

- **The replay.** Every survival, death and lineup reading so far played an engine with two stalls. UNKNOWN how far the death counts, the 2.5 dial, the ladder's 2 hours and S-14's "the four die together" move on the fixed engine. Nothing is sized until FB-3 has replayed them.
- **Fit to the beta date.** About 15 lanes, a pre-wave lane, three engine batches and about 50 new migrations. JUDGMENT, the audit's: waves 1 to 3 fit the end of December and wave 4 is at risk. If it slips, FB-14 and then FB-13 ship dark behind their switches and Path flags. FB-15 has no Crowns half now (S-17 a).
- **One release window.** About 75 files apply one at a time, 25 of them staged today. The rehearsal on a production copy is the mitigation. There is no point-in-time restore (2026-11-19), so the restore drill is scripted and not run on production.
- **The gate.** T-02 stays red by design until wave 3. The gate rule of 2.3 holds only if each red line is read against its known text.
- **The tier dial may move once more.** CB-2's death sample runs with the gear curve, the kill reward, Talents' unlocks and any tier row D-10 rules. UNKNOWN by how much.
- **Gold.** The tool's coin reads 1.24 times real (R0). Every price is PROVISIONAL until the playtest's real gold.
- **The arrival kit.** Ruled in D-3. Confirmed by FB-3's run of its section 1.5. The first hour's survival rests on it.
- **Too few players.** With 7 accounts the Talents and on-call tests cannot be read. S-18 c answers it in two steps: the accounts in now, then about 30 once the play gate and a blind first-hour pass are clean. UNKNOWN whether 30 can be found.
- **Talents' unlocks need three new engine hooks.** Their cost is not estimated (chapter 10).
- **Server cost.** Four heroes with 48 rested hours a day, training out of the engine, town work drawn in town, and a watched tab. The 1,000-account load test is new in FB-10.
- **Generated game data.** The ground number, the tier risk line and the Level law move whenever the matrix or the table moves. Their drift guards bind them. JUDGMENT that this is safe only while nobody edits them by hand.
- **Many new player lines.** The designer rulings wrote the words for the Path, "Needs you", the Weighhouse, Mossback, the calendar and on call. None has been read by a stranger. The player-text gate of 3.2 is the mitigation.
- **Mossback's cloak.** It is the best cape at its rung for its way to fight until crafted cloaks roll perks. That is a small tension with CE-1 rule 3, accepted for the first build (`review/06-designer-rulings-w1.md` section 2.4).

## 5. The sitting

`review/03-sitting-2.json` holds the questions Tyler answers now in `questions`, and the held ones in `held`, each in the shape of `01-sitting.json`. `review/03-sitting-2.md` is the same text to read. Each option says what it costs, with its evidence label, and none is recommended.

| Answer | Status | Lanes that wait on it |
|---|---|---|
| S-15 | RULED, a: all five approved | FB-2 builds the two folds. V5's register in FB-3 can go green. The gentle grounds stay, so check C3 stands |
| S-17 | RULED, a: Premium for all, test Crowns wait | FB-15 builds Premium for the account only |
| S-18 | RULED, c: the accounts in now, then about 30 | The playtest of 3.5 runs in two steps |
| S-11 | RULED, c: the Dangerous seat now | FB-8 stage 3, band change 8. The law reads again before Early Access |
| S-12 | RULED, a: the count on arrival | FB-8 stage 2. D-4 and D-10 are ruled on it |
| S-14 | RULED, a: the rest hunt on | FB-6's default line. Staged 1025 applies as written |

**The third sitting.** `review/07-sitting-3.json` and its `.md` twin hold two questions, both OPEN: S-19, whether standing upgrades are priced as a share of band gold or keep his typed prices, and S-20, whether the yard's rate follows the skill curve or stays flat as he ruled three times. No first-build lane waits on either. Lane FR-3 of chapter 14 does.

**On his veto list, also OPEN.** Reversal 28 (the refill's 2 hours, "Veto R-1"), D3-1 (early armor tiers) and D3-2 (factions not in the first build). Each is built as the designer ruled it unless he says the veto.

S-13 and S-16 are withdrawn. The designer rules both and reports them, as D-10 and D-11. S-16's subject stays on the reversal list as row 27, for Tyler's veto.
