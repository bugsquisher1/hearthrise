# 14. The rest of the overhaul

Written 2026-11-21 on `lane/d-plan-rest`, cut from `set/v0.2.144` at a94dd6e25. Docs only. No game code, data, migration or tool was changed. Chapters 00 to 13 and `decisions/` were not edited. Section 8 lists the edits for the integrator.

Labels. MEASURED is a run on the real engine, with its run id. COUNTED is a count from a file by script, or from production where it says so. COMPUTED is arithmetic on named inputs. JUDGMENT is a design or planning opinion. UNKNOWN means nobody knows. Nothing here is measured against the game that runs today. Lane sizes and migration counts are JUDGMENT.

Run ids. R0 is GitHub run 44920906999 (chapter 12). R6 is 44948522187, the replay on the engine fixed at 02364f03a (FB-3, milestone 1): the Dangerous four reads 1.261 times the pace contract, the Deadly four with no death 1.741, and all cells together read 44 deaths in 1,000 hours on Deadly and 5 on Dangerous.

## 0. One screen for Tyler

**Your point, and where it holds.** "i dont understand why we have to wait on play testing when we can control the true simulation by doing it correctly" (2026-11-21). For anything the engine decides you are right. The balance tool runs the game's own engine (`src/core/combat-sim.js`, through `tools/balance-sim/cell.mjs` and the edge settle), so a death rate, a pace, an hour to a drop or a gold income at a given choice is computed, not guessed. Your Talents ruling of 2026-11-21 set the same principle: balance happens once. So no row in this chapter waits on a playtest to be planned or sized.

**Where it does not hold.** The engine computes what happens for a given choice. It cannot compute the choice: which tier a player picks, what a seller asks, how a clan votes, what a Crown sells for. Those are the eight measures of section 3.3. Each still gets a build and a default number from the simulator now. Only its final value is read live.

**What "correct" takes.** The tool's standard four reads 1.26 times the kills of the one real four (chapter 12 section 1). On recorded heroes with their own bars and stock the engine prices supplies about right (the framework audit, section 4). So the gap is mostly in what the tool assumes a hero wears, knows and does, not in the engine. Section 2 is the calibration FB-3 runs against production, read-only and in aggregate, so the tool's numbers can be taken as truth.

**The scope.** Every item that 13 section 1.2 says waits, and the 100 decision rows whose `builtIn` is not a first-build lane (COUNTED from `decisions/all.json`). Luck v3.1, the unbuilt phases of the itemization plan, and the Early Access gate of CLAUDE.md 3.7 are among them.

**The classification.** COUNTED by script over the 100 rows, each in one class by its main question (section 3). The items of 13 section 1.2 that are not rows (Luck, the itemization phases, the yard's rate, the Early Access gate) are classified beside them.

| Class | What decides it | Rows |
|---|---|---|
| 1. SIZED IN THE SIMULATOR | The engine or the simulated income | 61 |
| 2. NEEDS A DESIGN FIRST | A designer ruling, D-12 to D-23 | 12, and the design half of 6 class 1 rows |
| 3. ONLY PLAYERS CAN ANSWER | A player's choice | 2 rows (GR-50, MM-34), and 8 measures in all, each built with a simulator default |
| No number to size | Built from its design: screens, a gauge, a gate | 4 |
| Nothing to build | A rule already true, a guard, or a superseded row | 21 |

**The plan.** 18 lanes, FR-1 to FR-18, in five waves after the first build's wave 4, at most four at once. Four more combat-engine batches, CB-4 to CB-7. Where an item moves combat balance and the tool can play it now, its sizing joins CB-2's single sizing pass as a "full-game block". Otherwise it is sized to CB-2's dials, which are the frame: content fits the dials, never the reverse.

**The dates.** The first build ships as planned. Chapter 14's lanes merge into the next set after v0.2.144, and its only work inside the first build is FB-3's full-game block and the calibration, both GitHub runs and between-wave jobs. Early Access is UNKNOWN. JUDGMENT: the region art in FR-4 and FR-14 is the long pole, not the simulator.

**What Tyler answers.** Two questions in `review/07-sitting-3.json`, each a design call that would reverse a ruling of his: S-19, whether standing upgrades are priced as a share of band gold or keep his typed prices, and S-20, whether the yard's rate follows the skill curve or stays flat as he ruled three times.

## Read log

| Source | How much |
|---|---|
| `13-build-plan.md`, `review/04-pre-wave-audit.md`, `review/04c-existing-game-coverage.md`, `review/05-designer-rulings.md` sections 0 and 3 | Whole, except 05 by section |
| `decisions/all.json` | All 159 rows' `builtIn`, by script. The decision text of the 100 rows in scope, read in full |
| `12-balance-pass.md`, `review/F-framework-audit.md` | Whole, earlier in this lane's session |
| `docs/design/itemization-plan.md` | Sections 0, 11 and the headings of 15 (Luck v3.1) and Appendix B |
| Chapters 01 to 11 | The sections cited by each row. Not re-read whole |
| The rulings of record | The 2026-11-18 to 2026-11-21 block. Private. Cited by date only |
| Code | `src/data/fists.js` and `necrotic-storm.js` switch headers, `hr-accrue/hunt-seed.js` header, `tools/balance-program/real-players.local.mjs` header, the tool listing. Searches for chips, salvage, commissions, sockets, Luck |

## 1. How chapter 14 is balanced once

1. **CB-2's dials are the frame.** The tier table (pull, blows, health, XP) is sized once in the first build's CB-2 death sample (13 section 2.3). Every later piece of combat content is sized to those dials.
2. **The full-game block.** Where the tool can already play a chapter 14 item through a switch, a data row, a knob or the buff hook, FB-3 adds it as one more block of CB-2's death sample. The dial pick reads both blocks. If they disagree, the chapter 14 content is re-sized to fit, at its own rows (the formula brief, 2026-11-21: fix the content layer, not a ground).

| In the full-game block | How the tool plays it |
|---|---|
| Necrotic and Storm, the seven-spell sample | The `live` switch of `src/data/necrotic-storm.js` in the matrix's scratch copy |
| Fists, the two rows | The switch of `src/data/fists.js` |
| GR-14, Rend and bleed raised, axes edged | A data patch |
| CORE-3, the +30% cap on "takes more" | A knob |
| GR-22, Magic adds 0.5% max mana | A knob |
| Every damage and XP cap full: the buff rows, the castle's War and Library rows, the bought damage boost | The buff hook (`member.js`), played in R1 already. Protection rows wait on CORE-4's rating row, built in FR-12, and are sized there at the fixed dials |
| Boss and arena layer pieces | The best-gear state, since a layer piece spends no more than the band's best unique (CE-1) |

3. **What cannot join it, and why.** R19 and R21 are engine code and content re-cuts, so FR-1 re-reads every band after them and moves a dial one step only if a band fails. Linings, the 18 perks with no hook, GR-18's windup break and Talent unlocks past rank 3 have no engine hook yet. Each is sized in its own lane at the fixed dials, under a band that bounds its effect on the plain four. Arenas fight heroes and touch no hunt dial. Tower, Catacombs and halls are modes that read the same tier table, so their cells run at the fixed dials.
4. **A build proves its patch.** A lane that builds an item sized earlier as a patch shows that the built change moves the bands exactly as the patch did (proof kind "coefficient", 09 section 2.2).
5. **If the full-game block slows CB-2,** it runs right after CB-2 against the chosen dials. The first build is not delayed, and rule 1 still holds. JUDGMENT.

## 2. What makes the simulator correct

**What is already true.** A cell runs the game's engine, the game's data and the game's tally. That is why a rate on it can be called MEASURED.

**What is not yet true, and the fix.** Five things, each an FB-3 job, read-only on production and in aggregate, through `tools/balance-program/real-players.local.mjs` (which never lets an account id, name or session leave the machine).

| # | What | Why | How | Passes when |
|---|---|---|---|---|
| C-1 | **The heroes the tool plays.** Gear tier worn, skill levels, bar slots and stock, by Level band | JUDGMENT: most of the 1.26 is here, with the rest in the real hunt having run on older rules. The tool assumes an arrival, a mid and a best kit. Real Defense on back seats was 21 to 32 levels under the tool's line (framework audit 3.2) | Read what the 22 live heroes wear and know (COUNTED, production, 2026-11-21: 7 accounts, 22 heroes). Place the three gear states at measured shares of real heroes instead of assumed ones. Fit the skill line to real heroes by seat | Each assumed input sits inside the spread of real heroes at its Level band |
| C-2 | **Rates an hour, like for like.** Kills, Level XP, coin, store spend, supplies used, deaths in 1,000 hours, by ground, tier, party size and Level band | A rate is only checked against a hunt on the same rules and the same kind of party | Aggregate the journal by activity hour. Build matrix cells from C-1's real inputs on the engine commit that was live, and compare | Kills, XP and coin within 10%, store spend within 15%, deaths inside their count's interval |
| C-3 | **Who takes the blows.** The front seat's share and the party's total damage taken | Survival is the number the tool reads worst. The real share was 0.69, the tool's proposed-game four 0.77 (chapter 12 section 1) | The analyzer tally by seat, once FB-7 keeps lowest health and the seat split | Front share within 10 points, total within 20% |
| C-4 | **Town work.** Gathering and bench XP and items an hour | Real players spent 1.57 times as many hours on town work as on hunting (framework audit 3.3), and no cell plays it | The journal's town rows against `skill-sim.js` and `artisan-sim.js` | Within 10% an hour by skill band |
| C-5 | **The new rules.** C-1 to C-4 again on hunts played on the first build | Calibrating today's rules proves the engine and the inputs. Only hunts on the new rules prove the new rules' inputs | The same readers after the release | As above |

**An exact replay is not available.** The engine is deterministic, so a recorded hunt with its seed would replay to the swing. But each session's seed is keyed by a server secret that no client role can read (`hr-accrue/hunt-seed.js`), and `hunt_sessions` and its tally are pruned. So FB-3 compares rates over many hunts with fresh seeds. An exact replay could only run inside the server and is not planned.

**One ask of the first build.** JUDGMENT: FB-7 keeps one row for each finished hunt (the party's inputs at the start and the tally's outputs) long enough to read, if it adds no statement to a settle, which is FB-7's own rule. Without it the first build's playtest hunts are pruned before C-5 can read them. If it would grow FB-7, it becomes the first job of FR-1 and the first weeks of hunts are lost to calibration.

**What "correct" can never cover.** The choices of section 4. The tool plays a policy (which tier, which ground, how often a player visits). After the release C-1 reads the real policy, and the tool plays that.

**Sample size.** 22 heroes cover some Level bands and not others (COUNTED, production: 6 heroes under 1 million Level XP, 4 from 1 to 10 million, 8 from 10 to 50 million, 4 over 50 million). A band with no real hero stays calibrated only by the engine, and says so.

## 3. Every item, classified

Rows are `decisions/all.json` ids. Lanes are section 5's.

### 3.1 SIZED IN THE SIMULATOR

| Rows and items | What the simulator sizes | Lane |
|---|---|---|
| GR-16 Necrotic and Storm, the seven, then sixteen. GR-17 fists. GR-21 the crossbow's list | Each spell's share, the heal cut, the mana drain, the fist's lone gold and XP (the fist promise, ruled 2026-11-18: best lone gold, comfortable, within 15% XP) | FR-5 |
| GR-12 strikes read weakness. GR-14 weapon weakness and Rend. GR-15 Turning Cut and Rend. GR-18 Quarry Blow's windup break. GR-19 shooters first. GR-22 Magic and mana. CORE-3 the cap on "takes more" | Each rule's coefficient, held by X19 (every way within 1.5 of the median) at the fixed dials | FR-5 |
| GR-23 rune tiers past 60 and the Tower at any floor (R22) | The tier step and the Tower's row against P2 to Level 5,000 | FR-5, FR-8 |
| R19 one amount pipeline. R21 every monster on the formula | Identity where it can be. Each ground's move toward the contract | FR-1 |
| GR-87 drops authored in hours (R18) and one sale formula (R17). GR-42 Rare rows. GR-35 the named rare. CE-6 Dawnsteel. GR-29 a hall's prize | Hours to a drop from the measured kill rate, by ground and gear state | FR-2 |
| Luck v3.1 (numbers ruled 2026-11-20): the bar, Lucky Rivets, the Lucky ring, the Magic Find budget, rarer Rares past Krell | Hours to the bar's ranks and to a Rare at each band, on simulated kills | FR-2 |
| CE-2 the earned material buff | Its +10% on material rows, in hours | FR-12 |
| GR-38 jewelry and cloaks past Level 30. GR-39 perk sizes. GR-40 build pieces before Krell. GR-41 a unique's property. GR-43 the Crafting bench. GR-45 Runecrafting 61 to 99. GR-46 salvage. Itemization phases 2 to 4, 7 and 8 | Slot class power from the gear curve, perk sizes inside a weapon step, bench rates in `artisan-sim.js`, salvage yield against the Shop | FR-6 |
| Itemization phase 6 linings. GR-47 curing and the Cellar | Lining power at the fixed dials, cure time and fee against simulated income | FR-9 |
| GR-49 chest reforging. Itemization phase 10 (fusing, the glove wing) | Keys and opens against drop hours | FR-8 |
| GR-36 the Catacombs' one wing. GR-37 the Tower's beat. GR-28 keyed halls with the boss call folded in, and the hall number | Mode cells at the fixed dials. The hall grader at Levels 25, 52 and 75 | FR-8 |
| GR-8 sinks as a share of band gold (R16). The yard's rate change (GR-54, a 13 section 1.2 item). GR-52 the store's healing line (R14). GR-53 the House dummy. GR-57 the hunt budget. CE-9 the Kitchen's burn relief. GR-73 the mount fee | Every price in hours of the calibrated wage. GR-8 and GR-54 wait on S-19 and S-20 for their form | FR-3 |
| GR-9 scaled hunts' hourly fee | The fee on the wage curve. The drop rule | FR-3 |
| MM-12 to MM-16, MM-38 to MM-40, MM-45 arenas | Fight length, each style against each style in the Even Arena, band matching in the Open Arena | FR-10 |
| CE-1 boss and arena gear lines | A layer piece's budget, the band's best unique | FR-12 |
| MM-24 to MM-26, MM-29 to MM-31 buffs, boosts and the readings. MM-42 events that pay buffs and gear | Each row's effect on pace and safety, played on the buff hook. The readings held by tests | FR-12 |
| MM-9 the castle's stage prices. CH11-2 the Library's step. MM-44 the standing gift. MM-10 the board's marks | Stage prices in account-days of simulated gold. The Library is arithmetic (+4.9%, MEASURED R1) | FR-11 |
| MM-33 the weekly Crown cap | Its anchor, one account-week of simulated gold | FR-16 |
| CH11-3 the town day (band TD1). The engine host before 10,000 accounts | Rested hours filled, from C-4's model. A synthetic load of 10,000 accounts. The spend stays Tyler's later call | FR-11, FR-17 |
| GR-71 factions: Bulwark and Reap, ruled to matter (2026-11-21) | The two skills' size | FR-14 |
| GR-32 thin bands: Wickstead to about 20 to 32, the Slake to about 58 to 72 | Pace across each new band | FR-14 |

### 3.2 NEEDS A DESIGN FIRST

New designer rows, numbered after 13's D-1 to D-11. Each is ruled before its lane starts, and reported. A row marked "report" is a fold proposal Tyler has not seen, sent with a veto line as the review asked (critical review, section 7 row 14).

| Id | Rows | What the designer must decide | Before |
|---|---|---|---|
| D-12 | GR-33, GR-34 (report) | Regions 4 to 7: a sketch of record each, the region's one new rule, its six grounds and bands, the Morrow Hills between Levels 142 and 165, and whether rosters come first from the unused monster row pool | FR-4 |
| D-13 | GR-31 | The six signatures, after the two-ground sample (the Slake's cold, Krell's volleys) | FR-14 |
| D-14 | TAL-1 past the sample | Unlocks at ranks 8, 15, 25 and 40, tracks six to eight, the arena build | FR-13 |
| D-15 | GR-16, GR-21, GR-17 | The nine later Necrotic and Storm spells under "no two weapons share a mechanic", the crossbow's full list, the fist's own heal | FR-5 |
| D-16 | GR-20 | Status pairs: stay a paper sample, or a design for more fours | FR-5 |
| D-17 | GR-76, GR-73 | What each House room rung sells in place of speed. The Hall of Firsts once rows carry a mountable flag | FR-3, FR-15 |
| D-18 | GR-62, GR-63 (report) | The Honors sample, then batches of 20 or fewer. The two old kill ladders as tracks on one kill count | FR-15 |
| D-19 | MM-6 past the first, MM-12 | Bosses two and on, each with its line, after the sample boss has stood twice. The arena's house teams | FR-12, FR-10 |
| D-20 | MM-46, MM-48 | Capture the flag and the clan's shared hunt, kept hidden until both sides can be filled | Later |
| D-21 | GR-71 | What a faction gains on the opposite side's grounds | FR-14 |
| D-22 | GR-74 (report), GR-77 | Soil tiers and crops with no consumer. The dropped seed on one Morrow Hills ground | FR-15 |
| D-23 | GR-44, 03 items 3, 4 and 6 | The cost to reforge a unique up a band, the Tempering ladder's form after S-19, the three signature stones, the worn-in sample on Krell's five weapons | FR-6 |

### 3.3 ONLY PLAYERS CAN ANSWER

| What | Why it cannot be simulated | Built now with this default | Lane |
|---|---|---|---|
| The Crown's gold price (MM-34, ruled 2026-11-21: players set it) | It is what a payer and a buyer agree. No engine decides it | The book opens with no seeded price, as ruled. The cap reads one account-week of simulated gold | FR-16 |
| Whether players with gold want Crowns | A preference | The test Crowns of S-17, if built | FB-15, FR-16 |
| Market asks and whether standing orders fill (GR-50) | What each player chooses to sell, and at what ask | A suggested price on every book from reference values (drop hours, kill rates and recipes) | FR-7 |
| How clans use a castle: which building they vote for, whether members give their share | Votes and gifts are choices | Stage prices and buff sizes from the simulator | FR-11 |
| Which fours, tiers and grounds players run, and how often they visit (S-10 c, GR-9's frontier use) | The engine gives the outcome of each choice, not the choice. The live death rate is a mix of choices | The tool's policy, read again by C-1 after the release | FB-3 |
| Who an arena ladder holds, and who meets whom | The population on the server | House teams and band borrowing (MM-38) | FR-10 |
| How much stamina accounts spend on a world boss, so its fall time | A choice each weekend | The pool's floor and the re-size after each boss (MM-4) | FB-13 |
| Whether a system is felt: a band step, a Talent rank, a build that is a choice and not a tax form | A feeling, and which tracks players pick | The TL bands and the sameness test of chapter 10 section 12 | FR-13 |

### 3.4 No number to size, and nothing to build

**No number. Built from its design.** CORE-2 (the party window names the four reasons to hunt together), GR-59a (the gauge, one daily line from the journal), GR-75 (three home looks and look-only visiting, art in FR-15), GR-88 (the matrix diff as the release gate, turned on in FR-18 once section 2's calibration passes).

**Nothing to build.** The row is a rule already true, a guard, or superseded.

| Rows | Why |
|---|---|
| GR-11, GR-13 | In FB-2 already: R6's floor half, and the roll fold under S-15. Their `builtIn` is wrong |
| GR-26, GR-56b | Built as ruled |
| MM-17, GR-83, MM-29-XP, CE-3 | "Never" rules. Each gets a guard where a catalogue can break it: no PvP intent on a ground, no daily row, no XP or drop boost in the store |
| MM-28, MM-32, MM-37 | Structural. A guard that the store sells no gear and that the Even Arena reads no paid row |
| MM-21, MM-27 | True by construction: every layer is open to all, and all gear trades. Premium's 30 tickets ride FR-10 |
| MM-1 | A design check every shared feature passes |
| MM-22 | A direction, met by the castle's stage prices |
| MM-23 | Its order is replaced by this chapter's |
| GR-60, GR-61, GR-65, MM-18 | Superseded or withdrawn |
| GR-64 | Reworded by Talents. An edit for the integrator |

## 4. The order

### 4.1 Waves

Chapter 14's lanes branch from the newest set and merge into the set after v0.2.144. None merges into `set/v0.2.144`, and none touches a file a first-build fix lane holds during wave 5.

| Wave | Lanes, at most four at once | Engine batch |
|---|---|---|
| 6 | FR-1, FR-2, FR-3, FR-4 | CB-4: FR-1 |
| 7 | FR-5, FR-6, FR-7, FR-8 | CB-5: FR-5, then FR-6's hooks |
| 8 | FR-9, FR-10, FR-11, FR-12 | CB-6: FR-9's hooks, then FR-10 |
| 9 | FR-13, FR-14, FR-15, FR-16 | CB-7: FR-13 |
| 10 | FR-17, FR-18 | None. The last combat replay is FR-18's |

Wave 6 can start in the first build's wave 5, since wave 5 holds only FB-3 and the Coordinator. Between engine batches the gate rule of 13 section 2.3 holds.

**After Early Access.** Regions after the first new one are a standing content lane: designed in D-12, sized by the ground number's generator and the tier table, drawn by the art and asset directors. Chapter 11 puts the first new region's door at about day 50 after launch on the fastest held seat. COMPUTED there, before the replay.

### 4.2 Who owns a shared file

The engine files are those of 13 section 2.2. Mode files are carved out for the lane that owns the mode, and each such lane proves the plain four's diff is empty.

| File or folder | W6 | W7 | W8 | W9 |
|---|---|---|---|---|
| The engine (13 section 2.2) | FR-1 | FR-5, then FR-6 | FR-9, then FR-10 | FR-13 |
| `src/core/hunt/tower.js`, `boss-room.js`, `boss-phases.js`, the Catacombs files | | FR-8 | FR-12 (boss lines) | |
| `src/data/monsters.js` | FR-1 (R21 rows), then FR-2 (drop rows) | | | FR-14 |
| `src/data/loot-bands.js`, `loot-sale.js`, `src/core/drops.js` | FR-2 | | | |
| `src/data/gold-sinks.js`, `gold-ladders.js`, `stamina-refill.js`, `homestead-tiers.js`, `training.js`, `shops.js` | FR-3 | | | FR-15 (`homestead-tiers.js`) |
| `src/data/jewelry.js`, `perks.js`, `recipes.js`, `items.js` | | FR-6 | FR-9 (lining rows) | FR-14 (region rows) |
| `src/data/temper.js`, `imbuements.js` | | FR-6 (Tempering) | FR-9 | |
| The market's SQL and `src/shell/windows/market/*` | | FR-7 | | FR-16 (the Crown book's window) |
| `src/data/premium.js`, the Crown files | | | | FR-16 |
| `src/data/live-events.js`, the modifier table's rows | | | FR-12 | |
| The clan RPCs and windows | | | FR-11 | |
| `src/data/talents.js`, `src/core/talents.js` | | | | FR-13 |
| `src/data/hunts.js`, `hunt-grounds.js`, `src/data/grounds/*`, `factions.js` | FR-4 (sketches only, no data) | | | FR-14 |
| `tools/balance-program/**` | FB-3 | FB-3 | FB-3 | FB-3 |

The append-only and regenerated files of 13 section 2.2 keep their rule here.

## 5. The lanes

Every lane follows 13 section 2.5. Each is sized at CB-2's dials on a run no older than R6, and on the calibration of section 2 once it lands.

#### FR-1 `lane/c-pipeline-and-monsters`. Lane C. Systems engineer. Wave 6. CB-4.

| | |
|---|---|
| Builds | R19, one amount pipeline rounded once with a trace a blow can print. R21, every monster row read from the one formula, a ground at a time, in batches of 20 rows or fewer. Then every band re-read, and a tier dial moved one step only if a band fails |
| Owns | The engine files. `src/data/monsters.js` (stat rows), `balance-sheet.js` |
| Migrations | About three, generated: monster and hunt-session catalogues, a batch at a time |
| Edge | Yes |
| Authority | No value moves except through the settle |
| Tests | `tests/hunt-core/run-all.mjs`, `engine-parity.mjs` with each cause, `tests/world-tick-parity.mjs`, the combat replay, both paths for a hunt |
| Matrix | The coefficient diff, largest under Level 15. The first-hour cell C3 must hold |
| Live state | Live heroes meet re-cut monsters. Note: "Monsters were re-balanced" |
| Depends on | It may start in wave 5 and merges only after the first build is released, since it moves the first hour's numbers. R6 or later |

#### FR-2 `lane/c-drops-and-luck`. Lane C. Backend architect. Wave 6.

| | |
|---|---|
| Builds | R17, one sale formula. R18, every drop row authored in hunted hours at the ground's floor, with the chance derived, in batches of 20. At most six Rare rows a ground (GR-42), the named rare's phase trait (GR-35), Dawnsteel as Scarce rows (CE-6), a hall's prize holding only what no ground drops (GR-29). Luck v3.1 as ruled on 2026-11-20: the account bar (rank n costs 100 times n squared Luck), Lucky Rivets bound to the account, the Lucky ring as a tradable seventh ring perk, one Magic Find budget a hero, Rare rows past Krell 15% rarer at band 8 rising to 25% at band 18, the Very Rare band at 60 to 90 hours. The store sells no drop or material boost (CE-3, a guard) |
| Owns | `src/data/loot-bands.js`, `loot-sale.js`, `src/core/drops.js`, `party-split.js`, the drop rows of `monsters.js` after FR-1, new Luck data and core files |
| Migrations | About five: drop catalogues a batch at a time, the Luck bar and rivets, the ring row, the sale formula |
| Edge | Yes |
| Authority | Drops are rolled only in the settle. Luck reads a server column that only rises. Rivets are bound. Every rivet spent and every rank bought is journalled |
| Tests | `tests/hunt-core/drop-tables.mjs`, the lucky-find guards, a Luck test viewed and closed, the CE-3 guard with a mutant |
| Matrix | Bands D1, D2, E2. The atlas and path solver read hours to each piece at each gear state |
| Live state | Owned items stay. Drop odds move. Note: "Drop rates are now set in hours of hunting" |
| Depends on | FR-1's monster rows |

#### FR-3 `lane/c-sinks-and-prices`. Lane C. Backend architect. Wave 6.

| | |
|---|---|
| Builds | Standing upgrade prices in the form S-19 picks (GR-8, R16). The yard's rate in the form S-20 picks (GR-54). The store's healing on one gold-a-hit-point line, with runes and ammunition in the same step (GR-52, R14). The House dummy's rungs at 25 to 50 hours of the yard fee (GR-53). The hunt budget in place of the gold floor (GR-57). The Kitchen's burn relief outside Yield (CE-9). The scaled-hunt fee on the wage curve (GR-9). The House rooms that sell kept materials (D-17, GR-76). The small cuts the book made (Potato, the Moonbloom seed in the Shop) |
| Owns | `src/data/gold-sinks.js`, `gold-ladders.js`, `stamina-refill.js`, `homestead-tiers.js`, `training.js`, `shops.js`, `scaled-hunts.js`, `supply-basics.js` |
| Migrations | About four: price rows in hours, the dummy, the hunt budget, the House rooms |
| Edge | Possibly, in `spend.js` |
| Authority | Every price from the server's wage table and the server's Level. One ledger row a purchase |
| Tests | A forged price refused for each surface. The hunt budget ends a hunt viewed and closed. G-8, G-10, E3, E4 and S10 through FB-3 |
| Matrix | Knobs `sinkShare`, `healPrice`, the yard's rate. C-4's town model for the yard |
| Live state | What is owned stays at the price paid. Note: "Prices for upgrades changed" |
| Depends on | S-19, S-20, D-17. FB-9's wage. C-2 and C-4 |

#### FR-4 `lane/d-regions`. Design and art. Game designer with the asset director. Wave 6.

| | |
|---|---|
| Builds | D-12: a sketch of record for regions 4 to 7, each region's new rule and its six grounds and bands. One region timed from sketch to drawn art, which is the runway's missing number (critical review section 7, row 11). No game data |
| Owns | Docs and art drafts only |
| Migrations | None |
| Edge | None |
| Authority | None |
| Tests | The world art budget and palette rules (`tests/world-assets.mjs`) on drafts |
| Matrix | None yet. FR-14 sizes the grounds |
| Live state | None |
| Depends on | Nothing |

#### FR-5 `lane/c-combat-content`. Lane C. Systems engineer. Wave 7. CB-5, first holder.

| | |
|---|---|
| Builds | Necrotic and Storm: the elements, the Withered status, the Bone rune family, Storm shown for Air, and the seven spells, one a weapon, sized on the full-game block, then the nine of D-15 (itemization phases 6b and 6c). Fists: the Hands and the Palm (GR-17), then fist tiers 3 to 7 and their two spells (phases 1 and 12). The crossbow's list (GR-21). GR-12, GR-14, GR-15, GR-18, GR-19, GR-22, CORE-3. Rune tiers past 60 (GR-23). Status pairs per D-16 |
| Owns | The engine files. `src/data/necrotic-storm.js`, `fists.js`, `abilities.js`, `runes.js`, `statuses.js`, `elements.js` |
| Migrations | About four: rune and spell catalogues, the fist rows, the Bone family |
| Edge | Yes |
| Authority | Spells and runes come only from server catalogues. A rune spent is a supply the settle charges |
| Tests | `tests/hunt-core/necrotic-storm.mjs`, `fist-play.mjs`, `spell-rule.mjs`, `spell-rows.mjs`, engine-parity, each new spell viewed and closed |
| Matrix | The cells of section 6. Each built row proves its patch's diff |
| Live state | New spells appear on bars as options. Note: "New spells and the fist" |
| Depends on | FR-1. D-15, D-16 |

#### FR-6 `lane/c-crafted-gear`. Lane C. Backend architect, systems engineer for the hooks. Wave 7. CB-5, second holder.

| | |
|---|---|
| Builds | Itemization phases 2 to 4, 7 and 8, and 11's property hooks: jewelry and cloaks to tier 7 from the gear curve with gem chips first (GR-38), the perk sizes (GR-39) and hooks for the 18 perks that have none, the Fine order, belts to the Crafting bench as outfitter (GR-43), ladders for tiers 4 to 7 in batches of 20, the Sealing Rune at Runecrafting 75 and 88 (GR-45), salvage as a loot line behind the no-mint guard with reference values (GR-46, 03 item 11), the three special pieces and the signature stones (GR-40), the seven property kinds past tier 7 (GR-41), the worn-in sample on Krell's five weapons (D-23) |
| Owns | `src/data/jewelry.js`, `perks.js`, `recipes.js`, `items.js`, `temper.js`, `patterns.js`, `special-attributes.js`. The engine files for the hooks, after FR-5 |
| Migrations | About six, mostly generated catalogues, with salvage and the reference values |
| Edge | Yes |
| Authority | Rolls on the server. Salvage pays from a server catalogue. The no-mint guard holds that no loop makes gold or Luck from nothing |
| Tests | `tests/hunt-core/jewelry-play.mjs`, the no-mint guard with a mutant, `tests/armor-line.mjs`, `weapon-line.mjs`, `temper-uniques.mjs`, each hook in and out of its case |
| Matrix | E1, E7 and the 12-seat bound of one weapon step |
| Live state | Owned pieces keep their rolls |
| Depends on | FR-5 (the engine handed over). D-23 |

#### FR-7 `lane/c-market-orders`. Lane C. Backend architect. Wave 7.

| | |
|---|---|
| Builds | GR-50 parts 1 and 2: standing buy orders with the gold held by the server, the Sell loot rule to the best order, the supply refill buying player stock under the store, one book for each piece with grade and perks as filters (03 item 13 decides how a perk is stored on a held piece), a suggested price on every book, "always list these". Single commissions with jewelry tiers 5 to 7 (GR-44) |
| Owns | The market's SQL, `hr-accrue/market.js`, `src/shell/windows/market/*`, `src/session/market-intents.js` |
| Migrations | About four |
| Edge | Yes |
| Authority | Escrow held by the server, resolved once, with a time limit. A fill is one batched call at dispatch or refill. Nothing on the hunt's settle |
| Tests | `tests/market-v2.mjs`, `market-edge.mjs`, an escrow test that conserves gold, the refill viewed and closed |
| Matrix | None. Fill rates are section 3.3 |
| Live state | Open listings stay |
| Depends on | FR-2's reference values. FR-6's perk storage |

#### FR-8 `lane/c-modes`. Lane C. Systems engineer. Wave 7.

| | |
|---|---|
| Builds | Keyed halls with the boss call folded in, "fight with N keys" as one press (GR-28), the hall number on health and the clock (GR-30). The Tower weekly with a "this week" column and any floor from one row (GR-37, GR-23). The Catacombs' one wing and one key, the pack as a preset (GR-36). Chest reforging and fusing and the glove wing (GR-49, phase 10) |
| Owns | `src/core/hunt/tower.js`, `boss-room.js`, `boss-phases.js`, the Catacombs files, `src/data/tower.js`, `boss-halls.js`, `boss-calls.js`, `chests.js`, `catacomb-armor.js` |
| Migrations | About four |
| Edge | Yes |
| Authority | Keys and opens are counted on the server. Prizes roll there. Weekly limits on the server clock |
| Tests | `tests/boss-hall.mjs`, `boss-call.mjs`, the Tower tests, a Catacombs wing viewed and closed, the plain four's empty diff |
| Matrix | The hall grader at Levels 25, 52 and 75. Tower cells at floors 300, 500 and 1,000 |
| Live state | Keys and chests owned stay. The boss call's state moves to keys. Note: "The boss call is now part of the halls" |
| Depends on | FR-2 (the prize rows) |

#### FR-9 `lane/c-linings`. Lane C. Backend architect, systems engineer for the hooks. Wave 8. CB-6, first holder.

| | |
|---|---|
| Builds | Itemization phase 6: sockets, element guards, leech, wear by hunting time, one item and gold a lining (ruled 2026-11-18), 12 hours of hunting a lining, stacking to 48 a socket. Curing in House slots as a standing order, the Cellar as the curing room (ruled 2026-11-20), the salts leaving the Crafting bench (GR-43, GR-47). Phase 9's good batch and House curing slots |
| Owns | `src/data/imbuements.js`, the lining rows of `items.js` and `recipes.js`, the engine files for the hooks |
| Migrations | About four |
| Edge | Yes |
| Authority | Wear is charged by the settle by hunted time. Cures finish on the server clock. Fees journalled |
| Tests | A lining worn viewed and closed, leech under GR-16's shared cap, cure slots and fees |
| Matrix | A lining band at the fixed dials, sized in this lane since no hook exists before it |
| Live state | None. Nothing is socketed today |
| Depends on | FR-6. FR-3's prices |

#### FR-10 `lane/c-arenas`. Lane C. Systems engineer with a backend architect. Wave 8. CB-6, second holder.

| | |
|---|---|
| Builds | Both arenas on the engine path FB-3's test proved: opponents as saved setups and house teams (MM-12, D-19), the Even Arena's reference kits and the Open Arena's real gear (MM-13), rating tiers with season rewards (MM-14), tickets at 5 a day banking to 20 and to 30 with Premium (MM-15, MM-21), three offered (MM-16, MM-38, MM-39), two pools (MM-40), spending banked tickets in one press (MM-45), the arena's gear line inside the layer budget (CE-1) |
| Owns | New arena data, core and session files, the engine files for the fight after FR-9 |
| Migrations | About four |
| Edge | Yes |
| Authority | Fights run on the server from saved setups. Ratings, tickets and rewards are server columns. Two accounts on one network are never offered each other |
| Tests | A fight replays to the same result. The Even Arena reads no gear or paid row (MM-37 guard). Tickets bank and spend |
| Matrix | PvP cells, each style against each style at the reference kit |
| Live state | None |
| Depends on | FB-3's engine test. D-19 for house teams |

#### FR-11 `lane/c-castle`. Lane C. Backend architect. Wave 8.

| | |
|---|---|
| Builds | The full castle as ruled at the sitting (S-7 b): five buildings of ten levels on the town project engine, priced for each member with a floor of five (MM-9), labor as a town job in the rest plan up to a weekly cap (CH11-3), the treasury paying upkeep first, upkeep that switches the buffs off, one standing vote an account, Clan Standing as a tally that pays no power. The Library at +0.5% Level XP a level (CH11-2). The standing gift (MM-44). The weekly board paying by mark (MM-10). Built on the castle RPCs FB-12 hid |
| Owns | The clan RPCs and windows, `src/data/town-works.js` for castle stages, the castle rows of the modifier table |
| Migrations | About five |
| Edge | Possibly |
| Authority | Gifts, labor value and stage costs on the server, journalled in the clan ledger |
| Tests | The four clan guards of 13 FB-12, a stage bought and finished, upkeep missed switching the buffs off, the Library's row in the settle viewed and closed |
| Matrix | Stage prices in account-days (G-8). The castle rows in the buff cells. Band CX1 |
| Live state | Clans that exist keep their roster |
| Depends on | FB-11's modifier table. FR-3's wage prices |

#### FR-12 `lane/c-buffs-boosts-bosses`. Lane C. Backend architect with the asset director. Wave 8.

| | |
|---|---|
| Builds | MMO-layer buffs as rows of one table with standing and timed caps (MM-24, MM-25), the protection rows on the Defense rating that CORE-4 owes, the two boosts sold for gold on the wage curve, one a knob (MM-29, MM-30), the readings held by tests (MM-26, MM-31), events that pay buffs and gear (MM-42), the earned material buff (CE-2), the world boss's fall bonus and boss gear lines past the first (MM-6, CE-1, D-19) |
| Owns | The modifier table's rows, `src/data/live-events.js`, the boss line rows, `boss-room.js` for boss lines |
| Migrations | About four |
| Edge | Yes |
| Authority | Buffs come only from server rows on the server clock. A boost is bought by RPC and burned. One bought boost a knob |
| Tests | Caps hold when rows stack. A boost viewed and closed. The readings' tests |
| Matrix | The buff block of CB-2 and the layer pieces at best gear |
| Live state | None |
| Depends on | FB-11's table. FB-13's sample boss stood twice (time, not players) for lines past the first |

#### FR-13 `lane/c-talents-two`. Lane C. Systems engineer. Wave 9. CB-7.

| | |
|---|---|
| Builds | D-14: unlocks at ranks 8, 15, 25 and 40 for the five tracks, tracks six to eight, the arena build at the reference points |
| Owns | `src/data/talents.js`, `src/core/talents.js`, the engine files for the hooks |
| Migrations | About two |
| Edge | Yes |
| Authority | Chapter 10 section 9 |
| Tests | Chapter 10's self-checks, each unlock in and out of its case |
| Matrix | TL1 to TL4 with unlocks |
| Live state | Points spent stay. New ranks open as Levels allow |
| Depends on | FR-10 (the arena build). D-14 |

#### FR-14 `lane/c-first-new-region`. Lane C. Backend architect with the game designer and the asset director. Wave 9.

| | |
|---|---|
| Builds | The first region past staged content from FR-4's sketch: six grounds and a hall, their monsters on the one formula, the ground number from its generator, Rare rows, the uniques grid of phase 11, patterns (GR-44), the dropped seed (GR-77), the signatures (D-13). The thin bands (GR-32). Factions open with their benefit (D-21) and their skills sized (GR-71), and the held faction file applied |
| Owns | `src/data/hunts.js`, `hunt-grounds.js`, `src/data/grounds/*`, `factions.js`, the region's rows of `monsters.js` and `items.js` |
| Migrations | About six, generated |
| Edge | Yes |
| Authority | As every ground |
| Tests | `tests/world-assets.mjs`, the ground pack tests, the region's cells |
| Matrix | P2 on each new ground, the tier bands at the fixed dials |
| Live state | Grounds whose bands move (Wickstead, the Slake) move for everyone. Note: "Some grounds changed Levels" |
| Depends on | FR-4. D-13, D-21 |

#### FR-15 `lane/c-honors-and-home`. Lane B. Backend architect with the art director. Wave 9.

| | |
|---|---|
| Builds | The Honors page and its first sample (GR-62, D-18). The Hall of Firsts (GR-73). Three home looks and look-only visiting (GR-75). Soil tiers and the kill-ladder tracks if D-22 and D-18 keep them. The party window naming the four reasons (CORE-2) |
| Owns | `src/data/honor-roll.js`, `titles.js`, `homestead-tiers.js`, the farm rows, the home windows |
| Migrations | About three |
| Edge | None expected |
| Authority | Honors claim themselves from server counters. Mount fees journalled |
| Tests | Honors claim once. Visiting reads one projection and polls nothing |
| Matrix | None. No power |
| Live state | Firsts already earned count |
| Depends on | D-17, D-18, D-22 |

#### FR-16 `lane/c-crowns-book`. Lane C. Backend architect. Wave 9. Only what FB-15 did not build.

| | |
|---|---|
| Builds | The Crown Exchange if S-17 was not b, then in every case the weekly cap re-derived from the 7 day median (MM-33), the path through the book (MM-34), the gauge (GR-59a). The Crown's real-money price is Tyler's money call before Early Access (PREM-2) |
| Owns | `src/data/premium.js`, the Crown files, the exchange window |
| Migrations | About three |
| Edge | Possibly |
| Authority | MM-35 and the eight clamps of MM-36. Every movement journalled |
| Tests | A self-check for each clamp. Gold conserved with fees burned |
| Matrix | The cap's anchor in account-weeks of simulated gold |
| Live state | Test Crowns, if granted, are removed before Early Access (MM-43) |
| Depends on | S-17's answer. FR-3's wage |

#### FR-17 `lane/c-scale`. Lane C. Reliability engineer. Wave 10.

| | |
|---|---|
| Builds | Study 48 step 9: changed sections only and one heartbeat. The server cost of the market, the gauge, the castle and the arenas. A synthetic load of 10,000 accounts, which sizes the engine host decision that stays Tyler's spend |
| Owns | `hr-accrue/envelope.js`, `src/session/envelope.js`, the heartbeat files |
| Migrations | About two |
| Edge | Yes |
| Authority | A poll that changed nothing returns only a version. A reload always shows the full state |
| Tests | `tests/per-player-cost.mjs`, the load report |
| Matrix | None |
| Live state | None |
| Depends on | Waves 6 to 9 landed |

#### FR-18 The Early Access gate. The Coordinator with the security engineer, the QA engineer and the game designer. Wave 10.

| | |
|---|---|
| Builds | CLAUDE.md 3.7 as a scheduled lane. The one full adversarial Security review of every new or changed server surface, from 13 section 3.6 and every lane here, GO with its changes landed. The full mutation sweep green on the launch build with no waivers. Security briefs protect existing player data again, and census re-pins follow every apply. The play gate moves before `main`, on a staging origin with the QA account signed in. Every combat-engine deploy passes the combat replay. The designer's full re-read. The Steam and legal review of rolls, tradeable gems and patterns (03 item 17). The test-Crown switch removed (MM-43). The beta Premium switch off (2026-10-23). GR-88's matrix gate turned on, once section 2's calibration has passed |
| Owns | No game file. The gate's checklist and its reports |
| Migrations | Those that remove the test switches |
| Edge | As the review requires |
| Authority | Security holds veto |
| Tests | The full sweep and the in-page suite |
| Matrix | The full matrix once on the launch build, read as a gate |
| Live state | The Early Access wipe (ruled 2026-10-17) is Tyler's date to name |
| Depends on | Waves 6 to 9. FR-17 |

## 6. What FB-3 adds for chapter 14

FB-3 alone writes `standards.mjs`, `knobs.json` and `proposals.json` (13 section 2.5). Lanes deliver patch files.

| For | Cells | Knobs | Bands |
|---|---|---|---|
| The full-game block in CB-2 (section 1) | The CB-2 death sample's cells with each switch and patch on | `necroticCut`, `stormDrain`, `takesMoreCap` (0.30), `magicManaPerLevel` (0.005) | S4, S6 at the chosen dials, X19 |
| Necrotic, Storm, the crossbow (FR-5) | The eight ways, lone and in a four, mid gear, Levels 25, 60, 110, 185, 400, Normal and Deadly | Each spell's share | X19, and a new NS1: no way's new spell is worth more than one weapon step |
| Fists (FR-5) | The fist way alone, and a four with a fist | The fist's heal | F1: the best lone gold of any way. F2: lone XP within 15% of the best way. F3: no death alone on Normal at a band floor (ruled 2026-11-18) |
| GR-14 (FR-5) | The lone axes against the hammer, Levels 30 to 110 | Rend's share, bleed | Axes at 0.95 to 1.00 of the hammer |
| Rune tiers, the Tower (FR-5, FR-8) | The reference hero's skill to Level 5,000. Tower floors 300, 500, 1,000 | `runeTierEvery` (15), `runeTierStep` (0.10) | P2. A four tops out between its Level and Level plus 25 (ruled 2026-11-20) |
| Drops in hours, Luck (FR-2) | The atlas and path solver on calibrated kill rates | `bandHours`, the Luck curve | D1, D2, E2. The Luck bar's hours as ruled |
| Crafted gear, linings (FR-6, FR-9) | Jewelry tiers 4 to 7 with matched and unmatched perks. Linings once hooked | Slot class share 6%, perk sizes | E1, E7, the 12-seat bound |
| Sinks (FR-3) | The wage reader at each band, C-4's town model | `sinkShare`, `healPrice`, the yard's rate | G-8, G-10, E3, E4, S10, T7, TD1 |
| Arenas (FR-10) | Each style against each style in the Even Arena. Band-matched Open Arena fights | The reference kit rows | A new AR1: no style wins over 55% of fights against any other in the Even Arena. JUDGMENT, a starting band |
| Buffs, boosts, castle (FR-11, FR-12) | R1's buff block with the castle rows and the two boosts | The caps | The readings of MM-26 and MM-31, report only. CX1 |
| Talents past the sample (FR-13) | Builds A to D with unlocks | Unlock sizes | TL1 to TL4 |

## 7. Risks and what is UNKNOWN

- **Calibration on 22 heroes.** Bands with no real hero are calibrated only by the engine (section 2). UNKNOWN until the first build's players fill them.
- **The full-game block in CB-2.** It adds GitHub time to the first build's sizing pass. If it slows CB-2 it runs after, and content is sized to the dials either way.
- **R19 and R21 re-read every band.** If a band fails, a dial moves one step after the first build has shipped. Live heroes then feel it, told in the note.
- **Region art.** One region has never been timed from sketch to shipped. The runway after Early Access rests on it.
- **Money surfaces.** FR-2, FR-3, FR-6, FR-7, FR-9, FR-11, FR-12 and FR-16 all move gold or items, and all enter the one Security review at FR-18.
- **Two fold proposals and one design Tyler has not seen** (GR-34, GR-74, GR-63's ladders) are reported with a veto line, not asked. If he vetoes one, its lane loses a step and nothing else moves.

## 8. For the integrator

| Where | Edit |
|---|---|
| `00-the-game.md` | The index gains chapter 14. Section 1.1's "what waits" table points each row to its FR lane. The words "waits for the playtest" become "sized in the simulator, and only a player's choice is read live" (Tyler 2026-11-21) |
| `13-build-plan.md` | Section 1.2: each row gains its FR lane. Section 2.3: CB-2's death sample gains the full-game block of 14 section 1. Section 2.6: FB-3 gains the calibration C-1 to C-5 of 14 section 2, and FB-7 the kept row a finished hunt, if it adds no statement |
| `09-platform-and-measurement.md` | Section 2.6: the validation plan names 14 section 2 as the calibration, and GR-88's gate turns on after it |
| `06-mmo-layer.md` section 2.11 | Each waiting row points to its FR lane |
| `decisions/all.json` | Each of the 100 rows' `builtIn` becomes its FR lane, "nothing to build" with the reason, or class 3 with its default. GR-11 and GR-13 point to FB-2. GR-64 is reworded for Talents. Add `openForTyler` rows S-19 and S-20 |
| `review/05-designer-rulings.md` | Nothing. D-12 to D-23 are new rows for the designer's next ruling file |
