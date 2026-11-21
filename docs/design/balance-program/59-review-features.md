# Balance program 59: features, retention and cost against value

Design review of `lane/d-review-features` (game-designer, 2026-11-21), cut from `set/v0.2.144`. **Phase A: reading and analysis only.** No game code, data or migration was changed. Nothing was played and no grid was run in this phase, by the brief's rule. The briefs of record are `45-design-brief.md` and `40-formula-brief.md`.

**What this review owns.** The 14 retention systems and the 8 platform systems of `00-inventory.md`, three systems no domain owns (`companions`, `skill-tree`, `pvp-ctf`), one system the inventory has no row for (the end card), and the features layer that sits on top of other domains: conditional rules, setups, loot plans, the away and return loop, Tamsin's tally, titles, the small gold sinks, the Premium daily claim. For every other system this file gives only its cost set against its value (section 2.2). Its balance belongs to its own review.

**Labels.** EVIDENCE names its source. HYPOTHESIS is a design judgment that phase B or a playtest must test. RULED is a ruling of record, newest wins. Sources: REAL is `10-real-players.md` (4 people, 1,334 hunted hours, read 2026-11-20). COST is `28-platform.md` (production statement time over 20.1 days). PLAYED is the blind play in `27-retention.md`. VITALS is `node tools/vitals.mjs`, run once today, read-only (1 to 5 accounts a day over the last 8 days). INVENTORY is `00-inventory.md`. CODE is a file on this branch.

**Layers** (brief 40). Every change below is placed at one: FORMULA (a shared rule), COEFFICIENT (one number of a shared rule), CURVE (a table over Level), ROW (a content or catalogue row), SCREEN (words and layout over server facts, no rule moves). Nothing here asks for special-case code.

---

## 1. One screen for Tyler

**Verdict on the area.** The loop is good and the shelf around it is too wide. Hunt, come back, prepare, hunt again works, and the away card is the best screen in the game. Around that loop sit about forty features. Four real people have played 1,334 hours and only about fifteen systems were used by more than one of them. The answer to your question "are some features introducing far more maintenance and balance complexity than gameplay value" is yes, and section 2.2 names each one. The answer to "would we build it the same way" for this area is no. We would build one loop, one second reward clock, one place that says what comes next, and we would show a new player only the rooms that have something in them.

**The five changes that matter most.**

1. **One kill ladder instead of four.** Tamsin's tally, the Bestiary, title unlocks and the trophy ladder all count the same kills of the same creature and pay four different things on four different screens. Make them one ladder with Tamsin as its face. The first stage pays her gear piece. Later stages pay Luck. One stage opens the title. Nobody takes a task by hand again.
2. **The Path. One table that says when every system opens.** Today that knowledge is scattered across the coach, the Town menu, What next and the Book. One table drives all four. A new hero sees three Town lines instead of ten. Every Level from 1 to 30 names the next thing that opens. Crowd features such as the Crier and the market stay shut until the server has enough people for them.
3. **A hunt report that says how close you came to dying and what each bar rule did.** You ruled that death costs 6% with no cap. A player who is not watching needs to know the risk before the death, not after. This also gives conditional rules their missing feedback, which is the heart of an idle game with preparation.
4. **Town work is paid without the combat engine, and every press counts as server cost.** Your budget is 60 database-seconds an account a day. Four heroes working their 12 rested hours cost about 34 of those 60 before one hunt is settled. You already ruled this fix for training. It has to cover gathering and benches too.
5. **The second hero opens at Level 10.** This is where I think you are wrong. You ruled the first slot stays at 400,000 gold. That keeps a new player alone for about 60 hours. Those are the hours with the most deaths, the slowest Levels and both of our lost players. The game you describe, with roles and parties, starts at the second hero.

**What is actively harming the game.**

- Four kill ladders that do not know about each other. A real player killed 3,251 wolves that Tamsin would have paid for, because the task was never taken.
- Ten Town menu lines and 53 coach cards for a Level 1 hero. One of those cards told a hero to buy a house in minute two.
- Fourteen built systems no player can reach. They hold 37 tables and 71 server functions. Every replay, every envelope and the one big Security review carry them.
- A price on saving a setup. The first principle says a decision is made once and remembered. Charging for the memory taxes the best habit a player can have. Nobody has ever paid it.
- One hero for the first 60 hours, as above.

**What I would add.** The hunt report. The Path. One weekly card that compares your week with your last week, which works on a server of ten. A starting loot plan so nobody meets 24 dropdowns. One new line for "when the hunt ends": go to the next ground when this one is outgrown. That is all. I would add no daily quests, no login calendar and no battle pass. You cut daily goals on 10-22 and weekly order lists on 11-18, and you were right both times. The visit is the daily.

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
| 7 | Bestiary + Tamsin's tally + title unlocks + trophy ladder | **MERGE** | Criteria below |
| 8 | Live events calendar | KEEP as ruled | 27-5. Generated a year ahead, never hand-run |
| 9 | Open Halls event | REMOVE | Only waived a fee that is itself being removed (L06) |
| 10 | Rare reveal on every Rare | KEEP as ruled | 27-6 |
| 11 | Settings and widgets | KEEP | |
| 12 | Game modes | DEFER | Ruled after launch |
| 13 | Old server leftovers (bounties, workers, collection log, renown, traits) | REMOVE | Ruled. Revoke `hr_trait_buy` first |
| 14 | Discord gift code | REMOVE | Ruled. Pays a dead currency |
| 15 | Companions, the built perk system | **REMOVE** | Criteria below. Against the 10-22 ruling, said plainly. The idea of pets stays for later |
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

**Counts.** KEEP 20 (5 of them "as ruled"). REMOVE 5. MERGE 2 (covering 7 systems). REDESIGN 7 (3 of them as ruled). ADD 6. DEFER 4. Total 44 rows. Rows 18, 19 and 32 are one build.

### Row 7. One kill ladder (MERGE)

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

### Row 15. Companions (REMOVE)

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

- **Daily quests, a login calendar, a season pass.** Every idle game has them. Tyler cut daily goals (10-22) and weekly order lists (11-18). They are chores, they repeat a decision by hand every day, and on four heroes they are four chores. The visit, the stamina bar and the weekly turn are enough beats.
- **A standing loop that restarts hunts when stamina is full.** Ruled out by 27-1 and I agree: it makes the free game zero visits a day and Premium's bar worth nothing.
- **More condition tests for the bar.** Fourteen tests and three stop rules already exceed what any real player has used (18 setups, 2 people). Feedback first.
- **Achievements as a separate system.** The kill ladder, titles on it and the Week cover it without a new counter.

---

## 5. Interaction traces

Each is a hypothesis for phase B to measure with the matrix diff where the engine can say.

**Trace 1. One kill ladder.** Combat: none. Progression: a second reward clock under Levels 5 to 30. The first stage lands 20 to 60 minutes into the Thicket (27, estimate). The dry-spell standard X12 should read shorter. Economy: tally gold (2% of gold in) either moves to stage rewards or leaves. The repeatable "keep this task" faucet ends, which removes a small daily cap from the model. Titles become a stage unlock, so their gold price stays a sink. Gear: Tamsin's piece still arrives in the first hour, now without a press. A hero is never sent back for a piece it missed. Crafting: once pieces are given she pays the ground's material today, and that would end. Check it is not a needed source (catalogue coherence). Parties: the tally counts for every hero in the instance and the ladder counts per account. An own four fills a stage four times as fast, which 27 already sized. Server: fewer tables and no new statement. UNINTENDED to watch: players parking on a weak creature for stages. Respawn caps it (27).

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

**Trace 5. The second hero at Level 10.** Combat: a pair is 1.2 to 1.5 times a lone hero (RULED 50-8), so Levels 10 to 32 run faster. The Level 10 to 15 XP that L05 "takes back" may need to move again. Progression: the player meets a second weapon style and the party window 50 hours sooner. Economy: two heroes earn about twice the gold, so slots three and four arrive sooner unless their prices carry the "own four in about 15 weeks" target (RULED 31-5). The guard G20 that reads the first slot would be rewritten. Gear: two heroes need two kits, and that doubles early gear demand and the meaning of drops (0.9% of dropped gear is ever worn, REAL). Parties: the Sewer opens to an own pair at Level 10. Server: one more away hero is 2.5 s a hunted hour before the fixes. UNINTENDED: 400,000 is today the first real gold goal ("the month has a name", 27). Moving it leaves gold with nothing named between 220 and the third slot unless the deeds and Tempering carry it.

**Trace 6. Next ground when outgrown.** Progression: removes idle hours for new heroes, most under Level 16. Combat: more unattended first hours on a new ground, where lone deaths are highest. Normal only. Economy and gear: none. Tally or ladder: a hero that moves on by itself must not lose a task, one more reason for trace 1.

---

## 6. Priority list

| Class | # | Change | Complexity | Risk | Expected benefit | Depends on | Basis |
|---|---|---|---|---|---|---|---|
| Critical | C1 | Town work (gathering, benches, training) in closed form, and presses and open tabs counted in the server budget | L, engine and server | Medium. Both-paths tests, seeded rolls | Without it 60 seconds cannot be met at 12 rested hours | L13, L19's training form | EVIDENCE: computed from COST. Not measured at 12 h |
| Critical | C2 | The second hero opens at Level 10 | S, a row and a guard | High. Reverses a ruling made three times this week | The largest lever on the Level 7 to 32 stretch where both light players stopped | Economy review, slot prices 3 and 4 | HYPOTHESIS. EVIDENCE is two people and a confound. Needs a beta cohort |
| High | H1 | One kill ladder: tally, Bestiary, titles and trophies merged | M. Changes L20 before it is built | Medium. Tally is liked and used by all four players | A second reward clock with a face. Removes most of 9 tables | L20 | EVIDENCE for the overlap. HYPOTHESIS that one ladder feels better. Playtest |
| High | H2 | The Path and the population gate | M | Low to medium. Hiding may hide depth | First-hour clarity, a named next thing at every Level, dead rooms stay shut | none | EVIDENCE: PLAYED dead moments, loose constants. HYPOTHESIS on the hiding. Blind play |
| High | H3 | The hunt report: risk and rules, risk free to all | M | Low | Makes tier and bar choices real under uncapped death | counters in the session tally | EVIDENCE that nothing shows it. HYPOTHESIS on behaviour |
| Medium | M1 | A starting loot plan | S | Low | Nobody meets 24 dropdowns. Fewer presses | L21 | EVIDENCE: REAL sold-by-hand share |
| Medium | M2 | Next ground when outgrown | S | Medium. Early lone deaths | No idle nights for new heroes | L08's door | EVIDENCE: PLAYED. HYPOTHESIS on the size |
| Medium | M3 | The Week card | S | Low | A weekly beat that works on a server of ten | L26's snapshot | HYPOTHESIS. Return rate on the first visit after the turn would tell |
| Low | L1 | The night in three lines on the away card | S | Low | The away card prompts preparation | H3 | HYPOTHESIS |
| Low | L2 | The Premium claim granted without a press | S | Low | One fewer daily press with no decision | L27 | EVIDENCE: first principle |
| Low | L3 | The end card gets its inventory row and the three-decision rule | S | Low | Stops three reviews overloading one card | none | EVIDENCE: 27 inventory note |
| Remove or simplify | X1 | The old companion build removed, pets kept as a later idea | S to M, chain retire | Low | Less replay, less Security surface | Tyler, it reverses 10-22 | EVIDENCE: INVENTORY, no lane in the plan |
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

1. **One kill ladder.** *Recommend: merge Tamsin's tally, the Bestiary, title unlocks and the trophy ladder into one ladder per creature, with Tamsin as its keeper, before L20 is built.* Four systems count the same kills, and the one everyone used is the one that needs a press per ground. Strongest alternative: keep the tally as it is and make it take itself on the ground you enter.
2. **The Path.** *Recommend: one table says what opens every system (a Level, a first event or enough active accounts), and the Town menu, the coach, What next and the Book all read it.* It is the cheapest way to make a wide game feel deliberate, and each new system then costs a row. Strongest alternative: keep the coach deck and only hide Town menu lines by Level (R14 as planned).
3. **The risk reading is free.** *Recommend: every player sees how close a hunt came to a death. The per-rule report can sit in the Premium analyzer if you want it there.* With an uncapped 6% death, selling the warning would read as selling safety. Strongest alternative: both blocks in the Premium analyzer, with the free card showing only "close calls: 3".
4. **Town work without the combat engine.** *Recommend: gathering and benches are paid in closed form like the training ruling, and the 60-second budget is stated with lines for presses and open tabs.* Your two rulings, 12 rested hours and 15 cents, do not fit together otherwise. Strongest alternative: budget the town at 4 rested hours and accept that a player who fills all 12 costs more than the cap.
5. **The second hero at Level 10.** *Recommend: the second slot opens at Level 10 for a price a Level 10 hero holds. Slots three and four keep climbing and carry the 15-week target.* Nearly everyone ends up a four, the Level table is now timed on a four, and the stretch you keep players alone in is the one with the most deaths and both of our lost players. Strongest alternative: keep 400,000 and let on-call heroes (25-1) be the early party, which needs other people online.
6. **Setup slots are free.** *Recommend: remove the two prices.* Nobody has paid them and they charge for remembering a decision. Strongest alternative: keep them as a small sink.
7. **The old companion build is removed.** *Recommend: retire the built pet perk rows and functions now. Pets stay on the roadmap as looks or a collection with no stat.* You ruled on 10-22 to keep them hidden for a later redesign. A redesign will not reuse perks that would be a seventh power lever, and until then they ride every replay and the Security review. Strongest alternative: keep the rows dark as ruled.
8. **Next ground when outgrown.** *Recommend: allow it as a one-step "when the hunt ends" choice, Normal only.* It keeps the intent of "no hunt starts by itself" because the player chose it and stamina still ends the day. Strongest alternative: the away card says "outgrown 5 hours ago" and offers the next ground in one press.
9. **No dailies.** *Recommend: rule that Hearthrise has no daily quests, login calendar or season pass, so nobody proposes them again.* The visit, the stamina bar, the weekly turn and the monthly project are the beats. Strongest alternative: one daily task from Tamsin, which the merge above removes.

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

**Not done in phase A.** Nothing was played. No grid, matrix or browser run. `51-baseline.md` had not landed on the set when this was written, so no row cites it. The other seven reviews were not read, so the "owner" column in section 2.2 is this review's reading of the old dive domains. Phase B: place each change against the formula audit (41 to 44), run the matrix diff for traces 1, 4 and 5, and replace the computed budget table with a measured one.
