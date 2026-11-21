# Balance program 59: features, retention and cost against value

Design review of `lane/d-review-features` (game-designer, 2026-11-21), cut from `set/v0.2.144`. **Phase A was reading and analysis. Phase B (section 0) measured what can be measured and corrected four verdicts.** No game code, data or migration was changed in either phase. Nothing was played and no matrix diff was run. The briefs of record are `45-design-brief.md` and `40-formula-brief.md`.

**What this review owns.** The 14 retention systems and the 8 platform systems of `00-inventory.md`, three systems no domain owns (`companions`, `skill-tree`, `pvp-ctf`), one system the inventory has no row for (the end card), and the features layer that sits on top of other domains: conditional rules, setups, loot plans, the away and return loop, Tamsin's tally, titles, the small gold sinks, the Premium daily claim. For every other system this file gives only its cost set against its value (section 2.2). Its balance belongs to its own review.

**Labels.** EVIDENCE names its source. HYPOTHESIS is a design judgment that phase B or a playtest must test. RULED is a ruling of record, newest wins. Sources: REAL is `10-real-players.md` (4 people, 1,334 hunted hours, read 2026-11-20). COST is `28-platform.md` (production statement time over 20.1 days). PLAYED is the blind play in `27-retention.md`. VITALS is `node tools/vitals.mjs`, run once today, read-only (1 to 5 accounts a day over the last 8 days). INVENTORY is `00-inventory.md`. CODE is a file on this branch.

**Layers** (brief 40). Every change below is placed at one: FORMULA (a shared rule), COEFFICIENT (one number of a shared rule), CURVE (a table over Level), ROW (a content or catalogue row), SCREEN (words and layout over server facts, no rule moves). Nothing here asks for special-case code.

---

## 0. Phase B: what was measured, and what changed

Phase B, 2026-11-21, after merging `set/v0.2.144` (003f6f019: the formula audits 41 to 44, the Game Director's `46-from-scratch.md`, `47-itemization-fit.md`, the other seven reviews, the real-engine matrix). Sections 1 to 9 below are phase A with its verdicts corrected where this section says so.

**No matrix diff was run, and here is why.** `node tools/pc-load.local.mjs` read CPU 100%, and the Coordinator's rule was no diff over 80%. It would also have measured nothing: none of this review's proposals moves a knob of `tools/balance-program/formulas/knobs.json`, and the one that moves a number a fight can feel (the second hero) needs pair cells, which the cached subset does not hold (153 lone cells and 54 fours). So this review has no patch file. Two things were measured without play, by a new read-only tool, `tools/balance-program/review-features.mjs`.

### 0.1 Every top proposal: layer, measure, flags

| # | Proposal | Layer, with 44's ids | Measured in phase B | Flags | Still a hypothesis, and what would settle it |
|---|---|---|---|---|---|
| 1 | Town work paid in closed form | **formula.** One yield rule for training, gathering and benches. It sits beside P05 (the skill grant), replaces P-X28 (the yard's flat rate, which 44 section 8.1 already recommends removing) and rides the roadmap's "one skill grant" step and R5's yard fee. Journal half: 43 E18 | `review-features.mjs cost`, below | none (no band of `standards.mjs` is played by it). Against band C2 it reads IMPROVED and still red | That a job is 3 statements. Settled by a town-hour fixture in `tests/per-player-cost.mjs` (RULED 28-10 asks for it) |
| 2 | The second hero on the first evening | **content row.** E39 (`src/data/shops.js:59-75`), and the guard G20 that reads it | not measurable: no pair cells in the cache and no diff tonight | none | Whether a pair keeps a new player. Two beta invite waves (section 6) |
| 3 | The hunt report | **no formula.** A screen over counters the engine already computes. The matrix's `lowHpP10` is the same reading (brief 40 section 6) | `review-features.mjs risk`, below | none | Whether players change tier on it. Share of hunted hours by tier before and after |
| 4 | The Path and the population gate | **content row**, no formula id. By the brief's rule that makes it a hypothesis about content | not a matrix question | none | Blind first hour, locked lines shown against absent |
| 5 | The tally takes itself (was: one kill ladder) | **content row** and a server rule in the tally's own tables. No formula id | not a matrix question. 56 notes the harness heroes hold no kill counts | none | Tally pays a hero-day (0.4 of 3 today) |
| 6 | Setup slots free | **content row** (`gold-sinks.js`), the R16 family of standing sinks | not needed: 0 purchases ever | none | none |
| 7 | Next ground when outgrown, the starting loot plan, the Week | **content rows** (`hunt-after.js`, the L21 kind rules, the L26 snapshot) | not matrix questions | none | Section 6's playtests |

### 0.2 Measure 1: the account-day against the ruled 60 database-seconds

`node tools/balance-program/review-features.mjs cost`. COMPUTED: arithmetic on `model.mjs` COST.real (production means of 2026-11-20, taken at 3.3 hunted hours a day) stretched to the ruled day of four heroes, 12 hunted and 12 rested hours each. Not measured at 12 hours. Each step adds one planned change.

| Step | Hunt settles | Tab reads | Town work | Presses | Town tab | Total | Times the budget | Journal rows a day |
|---|---|---|---|---|---|---|---|---|
| 0 Today | 382 | 209 | 34 | 11 | 9.4 | **645** | 10.7 | 12,546 |
| 1 The server-cost lane (L01) | 382 | 96 | 34 | 11 | 9.4 | 532 | 8.9 | 12,546 |
| 2 Commit at the flush (L12, ruled) | 121 | 96 | 34 | 11 | 9.4 | 270 | 4.5 | 5,217 |
| 3 Delta envelopes (L24) | 121 | 24 | 34 | 7.1 | 9.4 | 195 | 3.3 | 5,217 |
| 4 Town alone sends nothing (L25, ruled) | 121 | 24 | 34 | 7.1 | 0 | 186 | 3.1 | 5,217 |
| 5 The hourly journal (L13, ruled) | 121 | 24 | 34 | 7.1 | 0 | 186 | 3.1 | 192 |
| 6 Carry on and the plans: 20 presses a day | 121 | 24 | 34 | 1.4 | 0 | 180 | 3.0 | 192 |
| 7 **Town work in closed form** | 121 | 24 | 0.5 | 1.4 | 0 | **147** | 2.4 | 160 |

What it says.

1. **Phase A overstated this proposal and I am correcting it.** I wrote that the budget "cannot be met otherwise". True, and incomplete. Closed-form town work takes 34 seconds off and the account still reads 147, which is 2.4 times the budget. It is necessary. It is not sufficient.
2. **It is necessary because of what is left without it.** With every planned fix and the town still settled 37 times an hour, town work and tab reads leave the hunt settle under 1 second of the 60. With closed form they leave it 34 seconds.
3. **The remaining gap is the away hunt's own commit, and that is the platform review's call.** 34 seconds over 48 hunted hero-hours is about 10 commits a hero-hour at today's 70 ms, against 36 today. That is a flush about every 6 minutes instead of every 90 seconds, or a commit of about 20 ms at today's cadence. A death, a Level, a Leave, a rare drop and every money intent already force a commit at once under L12's written failure case, so a slower idle flush should change nothing a player can see. HYPOTHESIS, handed to the platform re-dive.
4. **Supply rows.** 43 E18: 114 of the 216 journal rows a hunted hero-hour are one row a supply kind a settle. Summed on the hunt's session they are 2 rows an hour. The hourly journal (step 5) already contains that fix. I agree with 43 and have nothing to add.
5. **Presses are a real line.** 100 presses a day is 11 seconds, a sixth of the whole budget. Carry on, the loot plan by kind and a tally that takes itself are cost work as well as design work.

Assumed, and printed by the tool beside each step: 100 presses and 2 hours of a town tab a day today, 20 presses after Carry on, two jobs a hero a day, three statements a job, delta envelopes cutting a read four times (28's own assumption).

### 0.3 Measure 2: does the low-health reading warn before a death?

`node tools/balance-program/review-features.mjs risk`, over the cached matrix subset (`balance-matrix-subset.json`, commit f746b5f85, the real engine, 207 cells, 1 seed x 1 hour a cell). `lowHpP10` is the health share the worst tenth of fights fell to.

| The cell's lowHpP10 | Cells | With a death | Under Level 185: cells | With a death |
|---|---|---|---|---|
| under 10% | 6 | 6 | 1 | 1 |
| 10 to 25% | 2 | 1 | 2 | 1 |
| 25 to 50% | 9 | 2 | 1 | 0 |
| 50% and over | 190 | 0 | 88 | 0 |

Every one of the 9 cells with a death read under 50%, and none of the 190 cells at 50% or over held one. Eight cells read under 50% with no death in their hour, and those are the near misses a player would want to hear about. One of them is a lone hammer on Deadly at Level 30, at 17%. So the number the hunt report would print does separate safe hunts from risky ones in the engine. EVIDENCE that the reading carries signal. PROVISIONAL on size: one seed and one hour a cell, where standard X26 asks 4 seeds x 8 hours for a death rate, and 115 of the cells sit at Level 185 or over, where the harness skill line is still wrong (44 step V1).

### 0.4 Where others decided something in this area

| Source | What it decided | Do I agree |
|---|---|---|
| 44 P-X26, 56 patch 3 | The rested bank fills and pays nothing. Switching it off moved no band in 207 cells (flags 0, 0, 0). REMOVE | **Yes.** A system that pays zero on every path has no cost-against-value case at all. It also takes `accrue-rested` out of the engine. It is not the stamina bar, which the screen also calls rest. Keep the words apart |
| 44 R1 | Delete the unread relic multiplier, the boss-of-the-day bonus and the charm ladder | **Yes.** These are the old kill ladders phase A wanted gone |
| 44 section 8.1, P-X28 | Training's one fixed rate should go, and pay a share of the skill level's cost | **Yes**, and it should land in the same change as closed form, since both rewrite how a training hour is paid |
| 44 section 4, server cost | No model change may add a statement a kill or a settle | **Yes.** The hunt report must fit that: counters in the row the settle already writes |
| 44 section 8.2 call 17 | Hold the refill price until the harness store bill is right | **Yes** |
| 47 C19 | Luck keeps two feeds. A kill ladder is fine only if all six of the plan's stage payments survive | **Yes, and phase A broke it.** I had stage 1 pay Tamsin's piece in place of its 50 Luck. Corrected in 0.5 |
| 47 C23 | I misread the 11-18 ruling. Tyler turned down wanted and unwanted lists on weekly orders, not weekly orders | **Yes, my error.** Section 4.8 and decision 9 are corrected. Weekly orders stay BUILD-LATER (47 M3), judged against the ground weekend and the Week card |
| 47, on the loot plan | The starting loot plan should exist | Agreed by both |
| 46 section 3c | Companions stay hidden, as ruled | **Yes.** I withdraw my REMOVE. See 0.5 |
| 46 change 3 | One Great Hearth out of Inner Flame, Town Works, the Hearthrise event and flame powders | **Yes for the three in my area** (Town Works, the event, powders). Three small rooms around one landmark become one. Inner Flame is the combat review's |
| 46 section 3d | A job queue: fish, then cook, then hunt | **Yes.** It is one more row in the table that holds "when the hunt ends" and a job's "then", under the same rule that a plan never loops |
| 46 section 3b | Let the player pick a starting weapon | **Yes.** The default is the way Tyler ruled slow alone on purpose |

**Convergence, reached independently, which I count as evidence.**

- **The second hero early.** The Game Director's change 1 ("second hero in the first evening", about 10,000 gold) and my decision 5 ("Level 10, a price a Level 10 hero holds") are the same change found from two sides: 46 from play and the shape of the game, mine from the quit point and the lone stretch. The economy review, a third voice, says slots must not rise again and calls Level 1 to 33 "the weakest stretch we have". I adopt 46's number, about 10,000 gold, so there is one recommendation and not two.
- **A risk reading for the player.** The world review asks for each hero's lowest health in the tally. The progression review's row 3 puts deaths per 100 hours on the hunt card. The plan's lane L16 already records lowest health. Mine is the same counter shown to the player. Four sources, one counter.
- **Setup slots free.** The economy review (its row 29) removes the price for the same reason in nearly the same words.
- **Hold dark systems shut until a stranger stays.** The last line of 46's change 3 is the population gate stated as a rule.

**Conflicts, with one side recommended.**

| Conflict | The other side | My side | Recommend |
|---|---|---|---|
| The tally | 55 (row 9) and 56 (row 41) KEEP it as its own system: the one repeatable kill job, used by all four real people, and its purpose (a gear piece you are missing) is not the Bestiary's | Phase A merged it into one kill ladder | **Their side.** Verdict changed in 0.5 |
| Titles | 56 builds one Honors page out of five lists, titles among them | Phase A made a title a stage of the ladder | **56's side.** One Honors page is the same merge with a better home |
| The first slot | 57 keeps the slot ladder as the real party system and leans on on-call heroes for the early party. Ruling 11-09 priced slots so that friends are the fast way to a four | 46 and I open the second hero on the first evening | **46's side**, and the two fit together: slots three and four still make friends and on-call heroes the fast way to a four. On-call needs other people, at a population the game does not have yet |
| Paid setup slots | 46 says keep the small sinks and stop adding | 55 and I remove the price | **Remove the price.** Two reviews, 0 purchases, and it is one row |

### 0.5 Verdicts changed since phase A

| Row | Phase A | Phase B | Why |
|---|---|---|---|
| 7 Bestiary, tally, titles, trophy ladder | MERGE into one kill ladder | **Tally: KEEP, and it takes itself** (the task for the ground you enter is taken on entry, per hero, no press). **Bestiary: KEEP as ruled**, all six Luck payments. **Titles: MERGE into 56's Honors page. Old ladders: REMOVE** (44 R1) | Two reviews keep the tally with reasons I accept. 47 C19 holds the Luck payments. My own evidence was the take press (3,251 wolves untaken), and taking itself fixes that at a fraction of the cost and risk |
| 15 Companions | REMOVE the old build | **DEFER, stay hidden as ruled** | Against a 10-22 ruling, against 46, and the 11-21 ruling keeps what is planned for later. The saving was replay weight only. 44's P-X27 (a companion's XP bonus added after the cap) is a note for whoever redesigns them |
| 30 Town work in closed form | "the budget cannot be met otherwise" | **Necessary, not sufficient.** Still Critical | Measure 1 |
| 31 The hunt report | HYPOTHESIS that the reading is useful | **EVIDENCE that it carries signal**, provisional on sample | Measure 2 |
| C2 The second hero | Level 10, price unstated, "two people and a confound" | **First evening, about 10,000 gold** (46's number). Confidence raised by convergence. Still needs the beta cohort | 0.4 |
| 4.8 and decision 9 | "Tyler cut weekly order lists" | Corrected: he cut daily goals (10-22) and turned down wanted and unwanted lists. Weekly orders are BUILD-LATER | 47 C23 |
| New rows | none | **Rested bank: REMOVE** (44 P-X26, 56 patch 3). **Job queue: ADD** (46) | 0.4 |

**Counts after phase B (46 rows).** KEEP 21. REMOVE 5 (Open Halls, the old leftovers, the gift code, the setup slot price, the rested bank). MERGE 2 (titles into the Honors page, the three setup nouns). REDESIGN 8 (adds the tally's take press). ADD 7 (adds the job queue). DEFER 5 (adds companions). The old kill ladders are 44 R1's and are not counted twice.

**On time.** Phase A's "about 60 hours alone" is hunted hours: 5 days at 12 hours a day. The ruled slot ladder puts the fourth hero at about 4 weeks at 12 hours (50-standards section 0). Where phase A said "the 15-week target" it quoted a 3.3 hour reading and is corrected below. These come from 50-standards, not the grid.

**On the itemization plan.** I read it through `47-itemization-fit.md` (C19, C23, M3 and its loot plan row), not in full. Three places touch this area: Luck's two feeds (I now comply), weekly orders (I had misread, corrected), and the starting loot plan (47 endorses it, with Salvage as a line beside Sell under L34).

---

## 1. One screen for Tyler

**Verdict on the area.** The loop is good and the shelf around it is too wide. Hunt, come back, prepare, hunt again works, and the away card is the best screen in the game. Around that loop sit about forty features. Four real people have played 1,334 hours and only about fifteen systems were used by more than one of them. The answer to your question "are some features introducing far more maintenance and balance complexity than gameplay value" is yes, and section 2.2 names each one. The answer to "would we build it the same way" for this area is no. We would build one loop, one second reward clock, one place that says what comes next, and we would show a new player only the rooms that have something in them.

**The five changes that matter most.**

1. **Tamsin's tally takes itself, and the kill counts stop competing.** Phase A asked for one kill ladder. Phase B narrows it, because two other reviews keep the tally for good reasons. The task for the ground you enter is taken when you enter, with no press. The Bestiary pays Luck as you ruled. Titles move to one Honors page. The two old hidden ladders are deleted.
2. **The Path. One table that says when every system opens.** Today that knowledge is scattered across the coach, the Town menu, What next and the Book. One table drives all four. A new hero sees three Town lines instead of ten. Every Level from 1 to 30 names the next thing that opens. Crowd features such as the Crier and the market stay shut until the server has enough people for them.
3. **A hunt report that says how close you came to dying and what each bar rule did.** You ruled that death costs 6% with no cap. A player who is not watching needs to know the risk before the death, not after. This also gives conditional rules their missing feedback, which is the heart of an idle game with preparation.
4. **Town work is paid without the combat engine, and every press counts as server cost.** Your budget is 60 database-seconds an account a day. Four heroes working their 12 rested hours cost about 34 of those 60. You already ruled this fix for training. It has to cover gathering and benches too. Computed in phase B: with every planned fix the account reads 180, and this takes it to 147. It is needed and it is not enough. The rest is how often an away hunt is saved, which is the platform review's call.
5. **The second hero opens on the first evening, for about 10,000 gold.** This is where I think you are wrong, and the Game Director reached the same change without reading this review. You ruled the first slot stays at 400,000 gold. That keeps a new player alone for about 60 hunted hours, which is five days at 12 hours a day. Those are the hours with the most deaths, the slowest Levels and both of our lost players. The game you describe, with roles and parties, starts at the second hero.

**What is actively harming the game.**

- A task board that must be pressed on every new ground, beside two hidden kill ladders no screen shows. In the blind play 3,251 wolves were killed that Tamsin would have paid for, because the task was never taken.
- Ten Town menu lines and 53 coach cards for a Level 1 hero. One of those cards told a hero to buy a house in minute two.
- Fourteen built systems no player can reach. They hold 37 tables and 71 server functions. Every replay, every envelope and the one big Security review carry them.
- A price on saving a setup. The first principle says a decision is made once and remembered. Charging for the memory taxes the best habit a player can have. Nobody has ever paid it.
- One hero for the first 60 hunted hours, as above.
- A rested bank that fills on the server and pays nothing on any path. Switching it off moved no number in 207 measured cells.

**What I would add.** The hunt report. The Path. One weekly card that compares your week with your last week, which works on a server of ten. A starting loot plan so nobody meets 24 dropdowns. One new line for "when the hunt ends": go to the next ground when this one is outgrown. That is all. I would add no daily quests, no login calendar and no battle pass. You cut daily goals on 10-22 and you were right. The visit is the daily.

---

## 2. Systems review

### 2.1 What the area is for

Retention in an idle game is three questions. Does the first hour teach the loop? Does every visit end with the heroes busy and the player wanting the next visit? Is there always something named to chase at the hour, day, week and month? The platform half is one question. Can four heroes hunt 12 hours a day for 15 cents a month?

| Question | Today | Source |
|---|---|---|
| First hour | 17 good minutes to Level 5, then five dead moments. v0.2.143 fixed four of them (the rune card, "Got it", the Cellar page, the job's end) | PLAYED, CHANGELOG |
| The visit | 8 to 10 presses a hero a return, one of them a decision. Carry on is built on this branch (`src/shell/carry-on.js`, migration 1024) and job counts with a "then" are built (1026) | PLAYED, CODE |
| The chase | 8 of 52 horizon cells empty, 7 thin. Empty at Level 17 alone for the day, and at 110 and past for everything | 27 question 2 |
| Who stays | 5 of 5 accounts came back on day 2. The two light players stopped at Levels 7 to 9. Nobody with one or two heroes has passed Level 9 | REAL |
| Cost | About 600 database-seconds an account-day at 12 hours against a ruled 60. The four planned fixes reach about 190 | 50-standards 2.8 |

### 2.2 Cost against value, every system

Build weight is what a feature drags through every migration replay, test run and the pre-EA Security review (INVENTORY counts: tables, server functions). Running cost is database time whoever uses it (COST). Use is REAL. A feature is **over** when its weight or running cost is far above what players got from it, **fair** when they match, **cheap** when it gives more than it costs.

| Feature | Build weight | Running cost | Real use | Read | Owner |
|---|---|---|---|---|---|
| Hunts, the settle | 20 tables, 65 functions | 27% of database time. 2.5 s a hero-hour away, 13.9 watched | 152,027 settles, everyone | fair. It is the game. Watched is nine times away | 28 re-dive |
| The envelope | 13 tables, 42 functions, 51 sections | 15% of database time. 48 ms a read, on every press and poll | everyone | **over**. Every feature that added a section is paid by every poll | here |
| Town presence | 10 tables, 34 functions, a 502-line session module | 7 to 8% of database time | drew players in a town that held none | **over** at 10 players, the north star at 1,000. RULED 28-7: push, nothing when alone | social |
| Cron jobs | 27 jobs | 32% of database time whoever plays | none directly | fixed overhead. Vanishes as a share at scale. Leaderboards rebuild and frame prune grow | here |
| Our own dashboards | tools | 7.5% of database time | us | **over**. RULED: read roll-ups | here |
| Leaderboards | 3 tables, 8 functions, 16 boards | 2.8% of database time, rebuilt every 5 minutes | "1st of 1" | **over**. RULED 27-4: six boards, weekly, refresh on read | here |
| Market read on load | part of market | 1.4% of database time, 76 ms every load | 3 sales ever, to a test account | **over**. RULED: a version in the heartbeat | economy |
| Tamsin's tally | 9 tables, 11 functions | inside the settle | 85 taken, 176 paid, all 4 people. 2% of gold in. 0.4 pays a hero-day of 3 allowed | used by everyone and built heavy. Taken by hand on every ground | here |
| Bestiary | 1 function, counters ride the settle | none new | one line on the sheet | cheap, and nothing shows it. RULED 27-3: build with Luck | here |
| Titles | 1 table, in the sink set | none | 0 real | **over** as a separate system. A fourth kill count | here |
| Trophies ladder | 2 functions | none | 6 drops, hidden multipliers | being cut (RULED 30-9, L20) | items |
| Small gold sinks: Crier, Rounds, powders, colors, rename, setup slots | 6 tables, 27 functions | none | 0 cries, 2 rounds, 8 powders, 0 colors, 0 renames, 0 slots. 0.4% of gold out | **over** today. 27 functions on the Security list for 48,000 gold. Crowd features with no crowd | economy, here |
| Action bar, conditions, setups, presets | 8 tables, 27 functions | inside the settle | 18 setups and 9 presets saved, 2 people | fair. This is the identity feature. Three nouns for one idea | combat, here |
| Loot plan | 4 tables, 9 functions | one row a batch | 44% of gear sold by rule, 43% by hand. Rules on 2 of 5 accounts | cheap. Not found by three of five players | items, here |
| Away card, after-hunt, Carry on, job counts | 2 tables, 7 functions, plus 1024 and 1026 | off the settle path | 68% of hunts had no after-hunt choice. 59% of hero life idle | cheap. The highest value per line of code in the game | here |
| Coach and tips | 3 functions, 53 cards, 1,376 lines of data | one `hr_mark_seen` a card | every new hero | fair, and growing. One card an hour to write, each with a walk-through test | here |
| What next | client lines | none | named different next grounds on two screens at Level 9 | cheap and unreliable | here |
| Wiki, Chronicle | data only | none | unknown, opens not journalled | cheap | here |
| Analyzer, personal bests | 1 table, 8 functions | read on open | everyone sees the basic block | cheap | here |
| Live events | 3 tables, 9 functions | read through the plan cache | +25% for 72 h in 336, under 1% of XP earned | cheap. An event is a row | here |
| Rare moments | 2 tables, 1 function | a notice row | 1,568 reveals | cheap. RULED 27-6: stays on every Rare | here |
| Settings, widgets | 1 table, 15 files | 21 KB of WAL a residue write | everyone | fair. The write is the fix | here |
| Training | 5 tables, 14 functions | a session costs a full hunt | 5 sessions, one person | **over**. RULED 28-11: closed form | home |
| Gathering and benches | the artisan engine, 7 functions | 0.7 s a hero-hour, 37 settles | 2,098 hero-hours, 3 people | fair today, **over** on the 12 rested hour clock (section 5, trace 4) | home, here |
| Farming | 6 tables, 12 functions | presses | all 4 people | fair. The one town system everyone uses | home |
| House, rooms, storage | 8 tables, 20 functions | sections on the state read | 25% of gold out, 2 people | fair | home |
| Tower, chest | 21 tables, 36 functions | a climb is a hunt, unmeasured | one climb, one person | heavy for one user. Judged by its own review | endgame |
| Boss halls, boss calls | 3 tables, 17 functions | a row a day | 1 hall, 1 call | two doors to one boss. A merge candidate | endgame |
| Scaled hunts | 4 tables, 7 functions | hunt cost | 0, switch off | unproven, and three later features lean on it | endgame |
| Market | 7 tables, 17 functions, 2 crons | above | 7 listings, 0 real buys | crowd feature with no crowd | economy |
| Parties | 14 tables, 65 functions | cheaper a head than lone | 91% of hours, 0 with a second person | fair for own fours. Unproven for people | social |
| Chat, friends | 9 tables, 44 functions | the social poll writes on every tick | 374 lines, 1 friend link | fair. RULED: one heartbeat | social |
| Town Works | 3 tables, 7 functions | a row a gift | 6 gifts, one person | fair once sized to actives (RULED 24-7) | economy |
| Premium, login claim | 1 table, 7 functions | none | everyone is Premium in the beta | unmeasurable until the switch is off | economy |
| Moderation, access, accounts | 17 tables, 70 functions | `hr_access_check` 0.85 ms on every call, 1.5% of database time | everyone | fair. Required | here |
| **Dark, 14 systems**: clans (5 systems), factions, companions, old dungeons, the Catacombs descent, lucky finds, uniques, Necrotic and Storm, fists, the old leftovers | **37 tables, 71 functions** | the collection read on the engine's request path. Otherwise replay time only | 0 | **over** by definition until each opens. Planned ones stay (RULED 11-21). Unplanned ones go | each owner |

**Reading it.** Three patterns explain nearly every "over".

1. **Crowd features on an empty server.** The Crier, Rounds, powders, the market, the finder, 16 boards, town presence, Town Works. Each is fine at 1,000 accounts and a dead room at 10. Today each costs polls, cron or menu space for nobody. The fix is not to cut them. It is to stop showing and stop polling a room until it has people (the population gate, section 4).
2. **The same counter sold four times.** Kills of one creature feed the tally, the Bestiary, titles and trophies. Four ladders, four screens, four sets of rules.
3. **Things settled through the combat engine that are not combat.** Training, gathering, benches. Each pays a constant rate and is charged like a fight.

### 2.3 The systems this review owns, one by one

**`first-hours`** (the coach, 53 cards). Purpose: teach the loop to someone who has never played an idle MMO. Plugs into everything. It earns its place for the 15 or so cards that teach the loop (hunt, Level, the bar, sell, wear, close the game, come back). The other cards exist because a system has no natural moment of introduction, so a card was written to point at it. That is why the deck grew to 1,376 lines and why "Got it" could walk a Level 1 hero to "buy a house" (PLAYED). Each new system adds a card, a walk-through test and a sentence in Tyler's voice. EVIDENCE: `src/data/hunt-tutorial.js` holds the unlock Levels as loose constants (KNOWN_LEVEL 5, DAY_ONE_LEVEL 7, DANGER 8, TOWER_LEVEL 10, WEIGHHOUSE_LEVEL 10, ROLL_LEVEL 16). Verdict REDESIGN: the deck splits into a short loop deck and one card an unlock, read from the Path.

**`what-next`**. Purpose: answer "what do I do now". It matters more at hour 100 than at hour 1 and it is the weakest at hour 100: the account with 2.09M gold and nothing it wants (REAL) is this system failing. EVIDENCE: its lines live in three client files and the inventory points at a fourth that is not it (27's inventory note). It named Mosslight Glade at Level 16 to a Level 9 hero while the end card named Wickstead (PLAYED). Verdict REDESIGN into the Path.

**`away-return`** (the away card, after-hunt, Carry on, job counts, alerts). Purpose: the game is played in visits of 2 to 5 minutes around absences of 2 to 11 hours (REAL). This is the semi-idle promise. Everything ruled for it is built or planned (L07, L08, L21, L30). It earns its place more than any other feature here. Verdict KEEP, with two additions in section 4: the night in three lines, and "next ground when outgrown".

**The end card** (no inventory row). It holds Equip, Bless, Next ground, Next buy, Hunt again, and three dives put more on it. It is the decision surface of the game and should be a named system with one rule: it shows at most three things that need a decision, ranked, and everything else is one press ("Carry on"). Verdict KEEP, add the row to the registry.

**`analyzer`**. Purpose: "is this hunt good for me". It answers for XP and gold. It does not answer "is this hunt safe" or "is my bar good" (CODE: no low-water or closest-call reading in `hunt-summary.js`, `hunt-summaries.js` or `widgets/analyzer.js`). Verdict KEEP, with the hunt report added.

**`bestiary`, the tally, titles, the trophy ladder.** Verdict MERGE, section 3 row 7 and trace 1.

**`leaderboards`**. RULED: six, weekly first. I agree and add nothing but the Week card, which uses the same snapshot. The purpose test for a board on a server of ten is "compare me with my own last week", and that belongs on the return card, not in a window that is rebuilt every 5 minutes whoever looks (COST).

**`live-events`**. RULED: world weekend monthly, a ground's weekend between, never over +25%. Verdict KEEP as ruled. One simplification: Open Halls is already on the cut line (L06). The event calendar should be generated a year ahead from rows and never run by hand. A one-person team cannot run live ops by attention.

**`rare-moments`**. RULED 27-6: the reveal stays on every Rare. The dive recommended otherwise and lost. KEEP as ruled. The roll-through on the away card (L26) is the right repair.

**`wiki`, `lore`**. Zero server cost, data only. KEEP. The Chronicle teaser on "Next ground" (R12) is the cheapest pull in the game and is planned.

**`settings`**. KEEP. Its one cost is the residue write of 21 KB a change (COST), a platform fix.

**`game-modes`**. DEFER, as ruled. Per account (RULED 27-9).

**`old-server-leftovers`, `discord-gift`**. REMOVE, as ruled (L10, L36). Nothing to add except urgency: `hr_trait_buy` is a granted purchase RPC on a dead feature.

**`companions`** (dark: 1 table, 2 functions, 22 unlock rows, 5 files). The old design is a pet that grants a perk. RULED 10-22: keep it hidden "for a later redesign", and 10-24: no pet work until the core is solid. So this recommendation goes against a ruling and says so. No lane of `30-plan.md` section D builds pets, the ruling itself says the built design will be redone, and a pet perk would be a seventh power lever beside gear, Tempering, jewelry, linings, Blessings and Luck when brief 40 asks for fewer levers. Verdict REMOVE the built perk rows and functions now, and keep "pets, later" on the roadmap as a look or a collection with no stat. What is removed is the old build, not the idea.

**`skill-tree`** (RULED 11-05: on hold, do not spec or build until Tyler raises it). Brief 45 lists "long-term character customization". Uncapped Levels that give only HP, mana and gear gates is a real gap past Level 100. A tree is also the most expensive way to fill it and it strains "classless, switch styles freely". Verdict DEFER, and hand the gap itself to the combat and progression reviews with two conditions: any Level-based choice is a coefficient row under the shared formulas, and it can be changed in town for gold.

**`pvp-ctf`** (idea). An idle capture-the-flag needs a crowd online at one instant. Verdict DEFER until a busy hour holds 1,000 heroes. Nothing should be built toward it before then.

**`settle-engine`, `envelope`**. The platform re-dive owns the answer. What this review adds is the feature-side reading in trace 4: the budget cannot be met by making the settle cheaper alone, because town work and presses are outside it.

**`accounts`, `access`, `moderation`, `operations`, `content-tooling`**. KEEP all five. `access`: drop the per-request check when the door opens at Early Access. `content-tooling`: its throughput is the true ceiling on retention. A region lasts the fastest player a week and costs two (28 section 8). So features that turn old content into new hours (tiers, scaled hunts, the ladder's late stages, the Tower) are worth more than any new side system. That is the test I applied to every ADD below.

**`account-deletion`**. Staged and required by the store. Verdict ADD (apply).

---

## 3. Content rationalization

Significant rows carry the eight criteria of brief 45. Short rows carry the verdict and its reason.

| # | Item | Verdict | Reason |
|---|---|---|---|
| 1 | Wiki of formulas | KEEP | Zero cost, the game's honesty feature |
| 2 | Chronicle and lore | KEEP | Zero server cost. Its teasers pull toward the next ground |
| 3 | Away card, after-hunt plan, Carry on, job counts, alerts | KEEP | The loop itself. Built or planned |
| 4 | The end card | KEEP | Name it as a system. At most three decisions shown |
| 5 | Analyzer and personal bests | KEEP | Gains the hunt report (row 31) |
| 6 | Leaderboards, six weekly boards | KEEP as ruled | 27-4 |
| 7 | Bestiary, Tamsin's tally, title unlocks, the old ladders | **Changed in phase B (0.5).** Tally KEEP and it takes itself. Bestiary KEEP as ruled. Titles MERGE into the Honors page. Old ladders REMOVE | The criteria below are phase A's, kept for the record |
| 8 | Live events calendar | KEEP as ruled | 27-5. Generated a year ahead, never hand-run |
| 9 | Open Halls event | REMOVE | Only waived a fee that is itself being removed (L06) |
| 10 | Rare reveal on every Rare | KEEP as ruled | 27-6 |
| 11 | Settings and widgets | KEEP | |
| 12 | Game modes | DEFER | Ruled after launch |
| 13 | Old server leftovers (bounties, workers, collection log, renown, traits) | REMOVE | Ruled. Revoke `hr_trait_buy` first |
| 14 | Discord gift code | REMOVE | Ruled. Pays a dead currency |
| 15 | Companions | **DEFER (changed in phase B).** Stay hidden as ruled | Phase A recommended removing the old build. Withdrawn: 46 and the 11-21 ruling |
| 16 | Skill tree | DEFER | On hold as ruled (11-05). Hand the customization gap to combat and progression |
| 17 | Idle PvP capture the flag | DEFER | Needs a crowd at one instant |
| 18 | The coach, 53 cards | **REDESIGN** | Criteria below (the Path) |
| 19 | What next | **REDESIGN** | Folded into the Path |
| 20 | Conditional rules (14 tests, 3 a slot, 3 stop rules) | KEEP | The identity feature. Needs feedback (row 31), not more tests |
| 21 | Setups, action sets, hunt presets | MERGE | One noun, "Setup". A ground remembers the setup last used there, so a preset is never picked twice. Hand to combat |
| 22 | Paid setup slots (15,000 and 40,000) | **REMOVE the price** | Criteria below |
| 23 | Loot plan | KEEP | L21 makes it by kind. Add the starting plan (row 34) |
| 24 | Town Crier, Rounds, flame powders | KEEP, shut by the population gate | Crowd features. No more work on them until 50 accounts a day |
| 25 | Hero colors (paid change), rename | KEEP | Cheap, standard, used at scale |
| 26 | Premium daily claim | REDESIGN | A press with no decision, every day. Grant it into Storage on the first visit of the day. Hand to economy |
| 27 | Town presence | KEEP as ruled | 28-7 |
| 28 | Town Works | KEEP as ruled | 24-7, 24-10 |
| 29 | Training settled as a hunt | REDESIGN as ruled | 28-11, closed form |
| 30 | Gathering and bench jobs settled 37 times an hour | **REDESIGN** | Criteria below (trace 4) |
| 31 | The hunt report: risk reading and bar report | **ADD** | Section 4 |
| 32 | The Path and the population gate | **ADD** | Section 4 |
| 33 | "Next ground" as a when-the-hunt-ends line | **ADD** | Section 4 |
| 34 | A starting loot plan | ADD | Section 4 |
| 35 | The Week card | ADD | Section 4 |
| 36 | Account deletion | ADD | Staged. Apply before Early Access |
| 37 | Return notice (web push: "your heroes are rested") | DEFER | Section 4 |
| 38 | Settle engine, watched cadence | REDESIGN as ruled | 28-1 |
| 39 | Envelope, 51 sections on every read | REDESIGN as ruled | Delta envelopes. Add the section rule of trace 4 |
| 40 | Accounts | KEEP | |
| 41 | Access check on every request | KEEP until Early Access, then REMOVE the check | 1.5% of database time for a closed door |
| 42 | Operations (cron, alarms, capacity) | KEEP | Three small fixes ruled |
| 43 | Moderation and GM tools | KEEP | Report from the chat menu before chat meets a crowd |
| 44 | Content tooling | KEEP | Time every ground (RULED 28-12) |

**Counts in phase A (phase B's are in 0.5).** KEEP 20 (5 of them "as ruled"). REMOVE 5. MERGE 2 (covering 7 systems). REDESIGN 7 (3 of them as ruled). ADD 6. DEFER 4. Total 44 rows. Rows 18, 19 and 32 are one build.

### Row 7. One kill ladder (phase A's MERGE, withdrawn in phase B for the narrower change in 0.5)

| Criterion | Answer |
|---|---|
| Player value | One page per creature that always has a next stage. Today the same kills pay on four screens or on none. The tally is the one side feature all four real players used (REAL), so its face is the one to keep |
| Strategic depth | "Stay for the next stage or move on" becomes a real question at every ground. Today a task is a chore to remember: 3,251 wolves were killed with no task taken (PLAYED) |
| Uniqueness | Four systems give the same decision. One keeps it. Tamsin notching a tally stick is already the lore of counting kills (CODE: `tally-tasks.js` header) |
| System interaction | Stage 1 pays what the tally pays now (her next Scarce piece for that hero's weight, and gold). Stages 2 to 6 pay Luck by v3.1 (RULED). One middle stage opens the creature's title for its gold price. The top stage is where the rebuilt Trophy room hangs a mount (L51). Scaled hunts are the late stages' consumer |
| Balance impact | Fits the shared model better than today: one counter, one stage table (a CURVE of counts), rewards as ROWS. Gold in falls by at most the tally's 2% (REAL: 249,155 of 14.27M) unless stage gold replaces it. The Magic Find budget is untouched: stages pay exactly v3.1's Luck |
| Complexity cost | Removes the take, drop, hold-three, three-a-day and "keep this task" rules and most of 9 tables and 11 functions. The kill counters already ride the settle. A stage is derived on read. Net server cost goes down. UI: one page in the Book and Tamsin's board becomes a view of it |
| Long-term value | The last two stages are 900 to 6,300 lone hours (27 question 4). It is the only chase that grows with every creature added and costs no new content |
| Recommendation | MERGE. Layer: CURVE (the stage counts) and ROWS (rewards). L20 already builds the stages. This changes its shape before it is built, which is the cheap moment |

Open detail for phase B: the tally is per hero and the Bestiary counts per account (RULED 11-20). HYPOTHESIS: counts per account, and the stage 1 gear piece is paid once to each hero of the account the first time that hero visits Tamsin after the stage is reached.

### Row 15. Companions (phase A's REMOVE, withdrawn in phase B)

Player value: none today, nobody can reach it. Depth: a perk pick, which jewelry perks already give. Uniqueness: duplicates jewelry and Tempering. Interaction: one more multiplier in every cell of the grid. Balance: a seventh lever against brief 40's "fewer, better-understood mechanics". Complexity: 1 table, 2 functions, 22 unlock rows, 5 files, and a stale catalogue reseed in the chain. Long-term: a collection could matter, and cosmetic pets can do that with no stat. Recommendation: REMOVE the old build, keep the idea of pets on the roadmap as looks. This goes against the 10-22 "keep hidden for a later redesign" ruling, because a redesign will not reuse perk rows the formula brief argues against.

### Rows 18, 19, 32. The Path (REDESIGN and ADD)

| Criterion | Answer |
|---|---|
| Player value | The player always knows what opens next and when. A new hero sees the three Town lines it can use, not ten (PLAYED). Each arrival is its own announcement |
| Strategic depth | Low by itself. It makes the real decisions findable. Tempering had one buyer because one person found it (REAL) |
| Uniqueness | Replaces four partial copies of the same knowledge: coach constants, the Town menu, What next lines, the Book's bands |
| System interaction | Every system gets one row: what opens it (a Level, a first event such as "first stamina end", or a count of weekly active accounts), the line that announces it and the window it lives in. The coach, the menu, What next, the end card and the wiki read that row |
| Balance impact | None on numbers. It is the teaching standard X28 and the chase standard X11 made checkable: a guard can assert every Level from 1 to 30 has a named next thing within 3 Levels |
| Complexity cost | One data file and its readers. It deletes loose constants and about two thirds of the coach deck over time. Each new system costs one row instead of a card, a menu edit and a What next line |
| Long-term value | Regions 2 to 7 and every later system announce themselves through it. At hour 1,000 it still answers "what next" |
| Recommendation | ADD the table, REDESIGN the coach and What next onto it. Layer: ROW. Size M |

The population gate is the same row's third kind of opener. CODE: the server already counts weekly active accounts for the Town Works goal (`hr_weekly_actives`, `town-works.js` perActive). The Crier, Rounds, the market card, the party finder card and the boards open when that count passes a row's number. RULED 27-8 deferred the zero-use alarm "until we have more players". This is the same idea turned into a rule the game itself follows.

### Row 22. Paid setup slots (REMOVE the price)

Player value of the price: none. Depth: none. Interaction: it discourages saving a decision, which the first principle (10-18) calls the point of the game. Balance: 55,000 gold a hero in total, about one day of a Level 30 hero's coin (REAL: 5,059 an hour), paid once, so it is not a sink. Complexity: its own RPC, quote and section. Use: 0 purchases against 18 free setups saved (REAL, VITALS). Recommendation: every hero gets the full count free. Layer: ROW (`gold-sinks.js` free: 5, prices: empty). Alternative: keep the price and accept that it earns nothing.

### Row 30. Town work in closed form (REDESIGN)

Player value: none visible, which is the point. Depth: none. Interaction: lets ruling 50-13 (heroes work all 12 rested hours) be true without breaking ruling C4 (15 cents). Balance: one FORMULA, yield = rate x time with the rolls seeded at start, used by training, gathering and benches alike. That is brief 40's "one framework for each category of mechanic". Complexity: L, engine and server. It replaces the per-tick town settle. Long-term: required for the budget at any population. Recommendation: REDESIGN. The numbers are in trace 4.

---

## 4. Missing opportunities

Brief 45 section 5, the lines this area owns: features that make hunting more engaging without constant attention, meaningful milestones between major upgrades, endgame goals beyond gaining Levels. Each is tested against one question: does it turn hours the player already has into decisions, without asking for attention during the hunt?

### 4.1 The hunt report: risk and rules (ADD, High)

**What.** Two blocks on the end card and the away card. *Risk:* the lowest your HP went and what did it, how many times you fell under a quarter, and a plain reading ("on this hunt you would die about once in 30 hours"). *Rules:* for each bar slot, how often it fired and what share of your damage or healing it did, and one line when a slot never fired.

**Why Hearthrise specifically.** Death is 6% of all Level XP with no cap (RULED 50-4): 22 hours at Level 100, 148 at Level 400. Deadly is judged by a flat death count (RULED 50-5). The player is not watching. So the single most expensive event in the game arrives with no warning that an idle player can read. Every other game with this penalty is watched. And conditional rules are named in the identity as where decisions live, yet the game never tells a player whether a rule did anything. The only feedback is XP an hour.

| Criterion | Answer |
|---|---|
| Player value | Tier choice becomes a judgment instead of a gamble. A changed bar rule shows its effect on the next card |
| Strategic depth | High. It is the feedback loop for the three biggest idle decisions: ground, tier, bar |
| Uniqueness | Nothing gives it today (CODE). The Premium "Taken" and "Dealt" tabs are the nearest |
| System interaction | Reads the engine's own run. Feeds tiers, Blessings ("keep me blessed" has a reason), the bar, linings |
| Balance impact | None on numbers. The same readings are brief 40 section 6's "dangerous HP thresholds" and "death frequency", so the balance matrix and the player see one measure |
| Complexity cost | M. A handful of counters a hero a hunt, kept in the session tally row that already exists. No new statement on the settle path and no journal row (C6). HYPOTHESIS until Systems confirms the counters fit the tally row |
| Long-term value | Rises with Level, because the price of a death rises with Level |
| Recommendation | ADD. Layer: SCREEN over engine counters. The risk reading is free to every player. See "Tyler decides" 3 |

### 4.2 The Path and the population gate (ADD, High)

Section 3. Why Hearthrise specifically: it has 84 live systems and a one-person voice. A game this wide either introduces its systems one at a time or loses people in the menu. Both lost players stopped at the Levels where the coach opened the town to them all at once (Level 7, REAL and PLAYED).

### 4.3 "Next ground" when the hunt ends (ADD, Medium)

**What.** One new row for "When the hunt ends": if the hunt ended because the ground was outgrown, go to the recommended lone ground on Normal, once. It rides the same door as a manual start and the same one-step rule as a job's "then hunt" (CODE: `hunt-after.js` JOB_NEXTS, "a plan never loops").

**Why Hearthrise specifically.** Under Level 16 a ground lasts one to eight hours and the hunt ends itself when outgrown. A new player who closes the game in the Cellar at Level 4 comes back to a hero that stopped at Level 5 and stood in town all night. The Cellar's "outgrown, go to the Thicket" press is the best moment of the first hour (PLAYED). This gives that moment to the player who was away. It does not add hunted hours: stamina still ends the day, so the visit and Premium's longer bar keep their value (RULED 27-1, 50-12).

Criteria in short: value high for the first 20 hours and near zero after. Depth: the choice is made once on the hunt's page. Unique. Interaction: lone deaths are highest at Levels 1 to 15 (8.9 per 100 hours, REAL), so it must only ever pick Normal on the recommended lone ground. Balance: none. Cost S: a ROW in `hunt-after.js` and the server's start. Risk: it strains the words of 27-1 ("no hunt ever starts by itself"). It keeps their intent, as the job's "then hunt" already does. Recommendation: ADD.

### 4.4 A starting loot plan (ADD, Medium)

Every new account starts with a plan already set: sell gear worse than what is worn, keep what a bench the hero can use takes, burn bones. The player edits it, never builds it. EVIDENCE: 43% of gear was sold by hand, three of five accounts have no rule, one player never sold at all and quit at Level 9, and the first plan is 24 dropdowns (REAL, PLAYED). Why Hearthrise: its first principle says a decision is made once. A decision the game can make sensibly for a new player should be made zero times. Cost S on top of L21 (ROWS: default kind rules). Risk: a default that sells something wanted. L21's rule "never sells a Rare or better unless ticked" covers it.

### 4.5 The Week (ADD, Medium)

**What.** On the first return after the week turns (the same instant as the chest reset and the weekly boards), one card: this week against last week for the account. Levels gained, hours hunted, best find, ladder stages, Tower floor, rank moves, and what just reset.

**Why Hearthrise specifically.** Progress happens while the player is away, in pieces a 3-minute visit cannot add up. On a server of ten a leaderboard says "1st of 1". A comparison with your own last week works at any population and gives the week a shape without a single chore. It reuses the weekly snapshot the six boards already need (27 question 5), so its server cost is one read a week an account.

Criteria in short: value medium, strongest for the twice-a-day player. Depth low, it is a mirror. Unique. Interaction: one clock for chest, boards and the card. Balance: none, it pays nothing, and it must stay that way or four-hero accounts farm it. Cost S once L26 exists. Long-term value high: it is the same at week 1 and week 80. Recommendation: ADD with L26.

### 4.6 The night in three lines (part of row 3, Low)

The away card adds, under its totals: the closest call, what ran out, and the best find. All three come from the hunt report's counters. It makes the away card a story and a prompt to prepare.

### 4.7 A return notice (DEFER)

"All your heroes are rested" as a web push. The free game is two visits a day 12 hours apart (RULED 50-12) and a missed visit is lost hours, so a prompt at the right minute is worth real retention. The service worker exists. But Steam has no push channel, the desktop build is first, and a notice nobody asked for is the fastest way to lose goodwill. DEFER to the mobile build, opt-in only.

### 4.8 What I looked at and do not recommend

- **Daily quests, a login calendar, a season pass.** Every idle game has them. Tyler cut daily goals (10-22). Weekly orders are a different thing and stay on the plan for later (47 C23 and M3, correcting phase A). They are chores, they repeat a decision by hand every day, and on four heroes they are four chores. The visit, the stamina bar and the weekly turn are enough beats.
- **A standing loop that restarts hunts when stamina is full.** Ruled out by 27-1 and I agree: it makes the free game zero visits a day and Premium's bar worth nothing.
- **More condition tests for the bar.** Fourteen tests and three stop rules already exceed what any real player has used (18 setups, 2 people). Feedback first.
- **Achievements as a separate system.** The kill ladder, titles on it and the Week cover it without a new counter.

---

## 5. Interaction traces

Each is a hypothesis for phase B to measure with the matrix diff where the engine can say.

**Trace 1. One kill ladder (phase A. Phase B keeps only the take press, the Honors page and the deletes, so the gold, gear and crafting effects below do not happen).** Combat: none. Progression: a second reward clock under Levels 5 to 30. The first stage lands 20 to 60 minutes into the Thicket (27, estimate). The dry-spell standard X12 should read shorter. Economy: tally gold (2% of gold in) either moves to stage rewards or leaves. The repeatable "keep this task" faucet ends, which removes a small daily cap from the model. Titles become a stage unlock, so their gold price stays a sink. Gear: Tamsin's piece still arrives in the first hour, now without a press. A hero is never sent back for a piece it missed. Crafting: once pieces are given she pays the ground's material today, and that would end. Check it is not a needed source (catalogue coherence). Parties: the tally counts for every hero in the instance and the ladder counts per account. An own four fills a stage four times as fast, which 27 already sized. Server: fewer tables and no new statement. UNINTENDED to watch: players parking on a weak creature for stages. Respawn caps it (27).

**Trace 2. The Path and the population gate.** Combat, gear, economy: no numbers move. Progression: every Level under 30 names a next thing. Teaching: fewer cards. Risk: hiding the Tower, the Chest and the market until their Level hides the game's depth from a player deciding whether to stay. HYPOTHESIS: a locked line with its Level ("Burning Tower, Level 10") keeps the promise without the clutter. Only a blind playtest can tell which reads better. Economy: gating the market by population delays the player economy on a small server. That matches RULED 24-7, where the market opens through the Town Works goal. Parties: the finder card opens when there is someone to find. Server: polls for shut rooms stop. This is where the town-alone and market-read fixes get their rule.

**Trace 3. The hunt report.** Combat: players who see a risk reading will step down a tier sooner or buy Blessings sooner. Deadly's death count (S6) may fall below its band because players avoid it, not because it got easier. That is a real second-order effect on a ruled band, and the grid cannot see it. Economy: Blessing gold a hunted hour should rise (0.06% of gold out today, REAL). Store supply bills may rise as players set heal rules better. Progression: fewer large XP losses, so the pace table reads slightly faster in real play than in a harness with deaths. Parties: a per-seat risk line shows the tank's risk is the party's risk (13 of 14 party deaths were the melee hero, REAL). Server: a few counters a hunt.

**Trace 4. Town work in closed form, and the price of a press.** COMPUTED from 28's production means, not measured at 12 hours:

| Line of an account-day, four heroes at 12 h | Today | Source |
|---|---|---|
| The whole budget | 60 s | RULED C2 |
| 48 hunted hero-hours, all away, in a four (2.5 s each) | 120 s | COST |
| 48 rested hero-hours at a node or bench (0.7 s each) | 34 s | COST |
| 100 presses (59 ms the intent, 48 ms the state read) | 11 s | COST |
| Two hours of an open tab standing in town | 9 s | COST |

So the settle fixes alone cannot reach 60. Three lines outside the hunt add up to 54 of the 60. Closed-form town work takes 34 to about 1 (a statement at start, at the count's end and at stop). Carry on, the starting loot plan and the merged ladder cut presses, which is the first principle and the bill agreeing with each other. The town-alone ruling removes the fourth line. Combat: none. Economy: yields must be identical in the mean, and the rolls must be seeded at start so a player cannot stop and restart to re-roll. Crafting: Good batch (ruled) becomes a seeded roll in the same formula. Progression: skill XP at the stop or the count, not every tick, so a skill Level arrives in steps on the screen. The client may show the predicted bar since nothing spends it (CLAUDE.md section 6). Risk: both-paths tests for every town activity.

**Trace 5. The second hero on the first evening.** Combat: a pair is 1.2 to 1.5 times a lone hero (RULED 50-8), so Levels 10 to 32 run faster. The Level 10 to 15 XP that L05 "takes back" may need to move again. Progression: the player meets a second weapon style and the party window 50 hours sooner. Economy: two heroes earn about twice the gold, so slots three and four arrive sooner unless their prices carry the ruled timing of the full four (RULED 31-5, read at 3.3 hours as about 15 weeks and at 12 hours as about 4). The guard G20 that reads the first slot would be rewritten. Gear: two heroes need two kits, and that doubles early gear demand and the meaning of drops (0.9% of dropped gear is ever worn, REAL). Parties: the Sewer opens to an own pair at Level 10. Server: one more away hero is 2.5 s a hunted hour before the fixes. UNINTENDED: 400,000 is today the first real gold goal ("the month has a name", 27). Moving it leaves gold with nothing named between 220 and the third slot unless the deeds and Tempering carry it.

**Trace 6. Next ground when outgrown.** Progression: removes idle hours for new heroes, most under Level 16. Combat: more unattended first hours on a new ground, where lone deaths are highest. Normal only. Economy and gear: none. Tally or ladder: a hero that moves on by itself must not lose a task, one more reason for trace 1.

---

## 6. Priority list

| Class | # | Change | Complexity | Risk | Expected benefit | Depends on | Basis |
|---|---|---|---|---|---|---|---|
| Critical | C1 | Town work (gathering, benches, training) in closed form, and presses and open tabs counted in the server budget | L, engine and server | Medium. Both-paths tests, seeded rolls | 180 to 147 database-seconds an account-day. Necessary and not sufficient (0.2) | L13, L19's training form, 44 P-X28 | EVIDENCE: `review-features.mjs cost`, computed. Not measured at 12 h |
| Critical | C2 | The second hero on the first evening, about 10,000 gold (E39) | S, a row and guard G20 | High. Reverses a ruling made three times this week | The largest lever on the Level 7 to 32 stretch where both light players stopped | Slot prices 3 and 4 carry the four's timing | HYPOTHESIS, with convergence: 46 change 1 independently, 55 against any further raise. Needs a beta cohort |
| High | H1 | The tally takes itself on the ground a hero enters. Titles to the Honors page. Old ladders deleted (44 R1) | S to M | Low | No kills wasted for want of a press. Fewer presses a return | L20, 56's Honors page | EVIDENCE: 3,251 wolves untaken (PLAYED), 0.4 pays a hero-day of 3. Narrowed in phase B |
| High | H2 | The Path and the population gate | M | Low to medium. Hiding may hide depth | First-hour clarity, a named next thing at every Level, dead rooms stay shut | none | EVIDENCE: PLAYED dead moments, loose constants. HYPOTHESIS on the hiding. Blind play |
| High | H3 | The hunt report: risk and rules, risk free to all | M | Low | Makes tier and bar choices real under uncapped death | L16 already records lowest health | EVIDENCE that the reading separates death cells from safe ones (0.3, small sample). HYPOTHESIS on behaviour |
| Medium | M1 | A starting loot plan | S | Low | Nobody meets 24 dropdowns. Fewer presses | L21 | EVIDENCE: REAL sold-by-hand share |
| Medium | M2 | Next ground when outgrown | S | Medium. Early lone deaths | No idle nights for new heroes | L08's door | EVIDENCE: PLAYED. HYPOTHESIS on the size |
| Medium | M3 | The Week card | S | Low | A weekly beat that works on a server of ten | L26's snapshot | HYPOTHESIS. Return rate on the first visit after the turn would tell |
| Low | L1 | The night in three lines on the away card | S | Low | The away card prompts preparation | H3 | HYPOTHESIS |
| Low | L2 | The Premium claim granted without a press | S | Low | One fewer daily press with no decision | L27 | EVIDENCE: first principle |
| Low | L3 | The end card gets its inventory row and the three-decision rule | S | Low | Stops three reviews overloading one card | none | EVIDENCE: 27 inventory note |
| Remove or simplify | X1 | The rested bank removed (was: the old companion build, withdrawn) | S | Low | One dead system out of the XP path and the engine | 44 P-X26, the roadmap's skill-grant step | EVIDENCE: 56 patch 3, flags 0, 0, 0 |
| Remove or simplify | X2 | Setup slots free | S, a row | Low | Removes a tax on the first principle | none | EVIDENCE: 0 purchases |
| Remove or simplify | X3 | Setups, action sets and presets under one noun, remembered a ground | M | Medium | One idea to learn instead of three | combat review | HYPOTHESIS |
| Remove or simplify | X4 | The old leftovers, the gift code, Open Halls | built into L06, L10, L36 | Low | Ruled | none | RULED |
| Remove or simplify | X5 | The coach deck shrinks onto the Path | M, over time | Low | Fewer cards to write, test and keep true | H2 | EVIDENCE: 1,376 lines, 53 cards |
| Defer | D1 | Return notice | M | Medium | Retention on phones | the mobile build | HYPOTHESIS |
| Defer | D2 | Skill tree | L | High | Long-term customization | combat and progression reviews | HYPOTHESIS |
| Defer | D3 | PvP capture the flag, game modes | L | High | Replay | population, launch | RULED after launch |

**Where only real players can tell.**

| Question | The playtest that tells |
|---|---|
| Does a second hero at Level 10 keep people? | Two beta invite waves. One on today's slot rule, one with the Level 10 slot. Read the share that reaches Level 16 and Level 32, and the Level histogram of accounts quiet for 3 days |
| Does one ladder feel better than a task board? | Blind play to Level 16 on each, by a fresh reader, plus stages reached an account a week against tally pays a hero-day (0.4 today) |
| Does hiding systems until their Level help or hide depth? | Blind first hour with locked lines shown and with them absent. Ask the reader what they expect to unlock |
| Does the risk reading change tier choice? | Share of hunted hours by tier before and after, and deaths in 1,000 hours on Deadly |
| Does the Week bring people back? | Accounts whose first press of a week is within a day of the turn |

---

## 7. Tyler decides

1. **The tally takes itself.** *Recommend: the task for the ground a hero enters is taken on entry with no press, the Bestiary ships as ruled with all six Luck payments, and titles go on one Honors page.* The one side feature everyone used is the one that needs a press per ground. Strongest alternative: phase A's full merge into one kill ladder, which two other reviews argue against.
2. **The Path.** *Recommend: one table says what opens every system (a Level, a first event or enough active accounts), and the Town menu, the coach, What next and the Book all read it.* It is the cheapest way to make a wide game feel deliberate, and each new system then costs a row. Strongest alternative: keep the coach deck and only hide Town menu lines by Level (R14 as planned).
3. **The risk reading is free.** *Recommend: every player sees how close a hunt came to a death. The per-rule report can sit in the Premium analyzer if you want it there.* With an uncapped 6% death, selling the warning would read as selling safety. Strongest alternative: both blocks in the Premium analyzer, with the free card showing only "close calls: 3".
4. **Town work without the combat engine.** *Recommend: gathering and benches are paid in closed form like the training ruling, and the 60-second budget is stated with lines for presses and open tabs.* Your two rulings, 12 rested hours and 15 cents, do not fit together otherwise. Strongest alternative: budget the town at 4 rested hours and accept that a player who fills all 12 costs more than the cap.
5. **The second hero on the first evening.** *Recommend: the second slot costs about 10,000 gold, what one hero banks by Level 8 to 10. Slots three and four keep your prices and carry the ruled timing of the full four.* The Game Director recommends the same change independently, and the economy review says slots must not rise again. Nearly everyone ends up a four, the Level table is now timed on a four, and the stretch you keep players alone in is the one with the most deaths and both of our lost players. Strongest alternative: keep 400,000 and let on-call heroes (25-1) be the early party, which needs other people online.
6. **Setup slots are free.** *Recommend: remove the two prices.* Nobody has paid them and they charge for remembering a decision. Strongest alternative: keep them as a small sink.
7. **The rested bank is removed.** *Recommend: delete it.* It fills on the server and pays nothing on any path, and switching it off moved no number in 207 measured cells (56 patch 3, 44 P-X26). Strongest alternative: make it pay, which adds an XP lever the pace law would then have to carry. Phase A's call here, removing the old companion build, is withdrawn: companions stay hidden as you ruled.
8. **Next ground when outgrown.** *Recommend: allow it as a one-step "when the hunt ends" choice, Normal only.* It keeps the intent of "no hunt starts by itself" because the player chose it and stamina still ends the day. Strongest alternative: the away card says "outgrown 5 hours ago" and offers the next ground in one press.
9. **No dailies.** *Recommend: rule that Hearthrise has no daily quests, login calendar or season pass, so nobody proposes them again.* The visit, the stamina bar, the weekly turn and the monthly project are the beats. Weekly orders are not covered by this and stay on the plan for later. Strongest alternative: leave it unruled and judge each proposal as it comes.
10. **How often an away hunt is saved.** *Recommend: ask the platform review to size an idle flush of about 6 minutes, with every death, Level, Leave, rare drop and money intent still saved at once.* After every planned fix and closed-form town work the account still reads 147 against 60, and the away commit is all that is left. Strongest alternative: keep the 90 second flush and make each commit about 20 ms.

---

## 8. For other areas

| To | Finding |
|---|---|
| Economy | Slot one (decision 5). Setup slot prices (decision 6). The tally's 2% of gold in if the ladder merge is taken. The Premium claim as an automatic grant. Refill presses: up to six a hero a day by hand, so a "keep me topped up to N" line inside Carry on is the first-principle form, and it will raise the sink's use. The small sinks (Crier, Rounds, powders) hold 27 functions for 0.4% of gold out: no more work on them until the population gate opens them |
| Combat and progression | The customization gap past Level 100 that the skill tree was ruled for: answer it with coefficient rows, not a tree. Setups, action sets and presets under one noun, remembered a ground. The hunt report's counters are the same "dangerous HP thresholds" brief 40 asks the matrix for: build once, read twice. If decision 5 is taken, the Level 10 to 32 curve is read on a pair |
| Items | The ladder's stage 1 reward is Tamsin's gear pick. The trophy ladder folds in. The starting loot plan rides L21. Titles become stage unlocks |
| Endgame | Boss halls and boss calls are two doors to one boss for one real use each: a merge candidate. Scaled hunts are leaned on by the ladder's late stages, linings and old-ground life, and have 0 real uses with the switch off: prove them first. Tower climbs need a cost fixture (RULED 28-10) |
| Social | The population gate decides when the Crier, the finder card and the boards show. Town presence is the dearest feature per unit of use today. The Week card wants the clan line when clans open |
| Home | Closed-form town work changes how gathering and bench XP arrive (in steps). Training is the pattern. The eight rooms are eight inventory rows for one rung engine: one row |
| Platform re-dive | Trace 4's table. A rule for the envelope: a feature's section is read when its window opens, or versioned, never on every poll. The dark systems' 37 tables and 71 functions as replay and review weight. `hr_trait_buy` revoked first. The collection read on the engine's request path |
| Game Director (60) | The pattern across this area: counters and rooms were built once per feature instead of once per game. The ladder, the Path and closed-form work are the same repair in three places |
| Coordinator | Inventory fixes: add the end card. `discord-gift` and `bestiary` are not live as listed (27). `what-next` points at the wrong file. The eight rooms fold into `room-perks` |

---

## 9. Evidence and hypotheses

**Evidence, with its source.**

- Use of every system, gold in and out, visits, the two stopped accounts, 43% of gear sold by hand, 59% idle hero life: `10-real-players.md`, production read 2026-11-20. Four people. Every first-week number is two people.
- Database time by statement, the cost of a hero-hour and of an open tab, the cost of a press: `28-platform.md`, production over 20.1 days at 3.3 hunted hours a day.
- The 60-second budget and the 600 and 190 readings: `50-standards.md` section 2.8, computed by interpolation, not measured.
- Zero-use list (rounds, cries, setup slots, titles, hero colors) and 1 to 5 accounts a day: `node tools/vitals.mjs`, run once on 2026-11-21, read-only.
- Tables and functions per system, and the 14 dark systems (37 tables, 71 functions, summed here from its rows): `00-inventory.md`.
- First-hour dead moments, presses per return, the Level 9 What next mismatch: the blind play in `27-retention.md`. Four of its dead moments shipped fixed in v0.2.143 (CHANGELOG).
- Built on this branch: Carry on (`src/shell/carry-on.js`, `src/session/carry-on-intents.js`, migration 1024), job counts and "then hunt" (`src/data/hunt-after.js`, 1026), 14 condition tests and 3 stop rules (`src/data/condition-metrics.js`), 53 coach cards (`src/data/hunt-tutorial.js`), `hr_weekly_actives` (`src/data/town-works.js`).
- No risk or closest-call reading exists on the end card or analyzer: a grep of three files. The Premium "Taken" tab was not opened, so it may hold part of it.

**Computed here, not measured.** Trace 4's table (28's means times the 12 hour day). The small sinks' 0.4% of gold out (48,000 of 11.36M). Dark-system sums.

**Hypotheses.** That one ladder feels better than a task board. That hiding systems until their Level reads as promise and not as emptiness. That a second hero at Level 10 keeps players (two people, and "one hero" is confounded with "new"). That a risk reading changes tier choice, and by how much. That closed-form town work reaches about 1 second an account-day. That the session tally row can hold the report's counters with no new statement. That the Week card moves return rate. The per-hero and per-account detail of the ladder's first reward.

**Not done.** Nothing was played in either phase. No matrix diff was run: the PC read 100% CPU and no proposal here moves a knob (section 0). `51-baseline.md` had not landed when phase B was written, so no row cites it. Of the other documents, 46 was read in its summary, section 3 and changes 1, 3, 4 and 5. 44 was read in sections 5.4 and 7 and searched in sections 2 and 8. 47 and 52 to 58 were read by search for this area's topics, not in full. The itemization plan was read through 47. The budget table in 0.2 is computed from production means taken at 3.3 hours a day and is not a measurement at 12.

**Added in phase B.** `tools/balance-program/review-features.mjs` (`cost`, `risk`). Reads only, writes nothing, plays nothing.
