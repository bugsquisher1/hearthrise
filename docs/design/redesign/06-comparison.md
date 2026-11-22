# 06. Comparison with the existing overhaul

Written 2026-11-21 on `lane/rd-compare`, from `set/v0.2.144` at b596f0398. Docs only. This is deliverable 4 of the reset request of 2026-11-21. It is a judgment for review. Nothing here is a ruling and nothing here is final.

**The two candidates.** A is the existing overhaul: `docs/design/overhaul/` chapters 00 to 14, its 159 decision rows and the designer rulings in `review/05`, `06`, `08` and `10`. B is the fresh design: `01-identity.md`, `02-architecture.md`, `03-opportunities.md` and `05-roadmap.md` in this folder. I wrote neither.

**Labels.** MEASURED is an engine run, with its run. EVIDENCE is something read in the code, the data or a played session, with its source. COMPUTED is arithmetic on named inputs. JUDGMENT is my opinion. SPECULATIVE is a guess that a test can settle.

**What was not available.** The math strategy (`04-math-strategy.md`) had not landed on `origin/lane/rd-math` when this was written. So B's "power step" has no definition yet, and every verdict that leans on it says so.

## 0. One screen for Tyler

**The short verdict.** B has the better diagnosis and the better skeleton. A has almost all of the evidence, the tools, and the two packages that were actually played. Neither is ready to be approved whole. The right next design is B's frame with a named list of A's parts inside it, and with one test run before anything else is believed. (JUDGMENT)

**Why B's skeleton wins.** A's own measurements show that its structure fails in three places that no number can fix.

1. A four's pace is held by the respawn, so gear, buffs and Talents are worth about nothing on the easy tier. A planted +100% damage moved pace 0.8 to 8.7%. (MEASURED, the matrix lane's unlock cell at 856ffcaf4, read in `review/10-designer-d9-halls.md`)
2. The harder tiers are a cliff. A four is safe or it wipes, and the step between is a few percent of one dial. (MEASURED, runs 44925664434 and 44928035806, `12-balance-pass.md` section 3.1)
3. A party is one health bar. One front hero takes 92 to 100% of the damage on nine of fourteen grounds. (MEASURED, run 44920906999, section 4.1)

A's answer to all three was to keep the structure and re-size the numbers. B's answer is to change the structure. Chapter 12 itself says the measurements argue for a new mechanic. (EVIDENCE, `12-balance-pass.md` section 4.1 item 3)

**Why B cannot be approved on trust.** B has no run, no played minute and no math file. Its nine packages all hang on one untested mechanic, the climb with a fall back. If that mechanic does not settle at a step, packages 1, 2, 4 and 6 lose their reason. B's own roadmap says so and puts that probe first. I agree with the order and I would go further: nothing else in B should be detailed until that probe has a result. (JUDGMENT)

**Where B oversells.** Four things B presents as new are already in the game or in A. (EVIDENCE, read in `src/data` on this branch)

- Monster wind-ups and a bar condition that sees them. Eighteen monster spell rows carry a wind-up, the condition "the pack has monsters casting" exists, and Shelter already fires on it. A's row GR-18 lets a blow break a wind-up.
- A stance. The game has Offensive, Balanced and Defensive fight stances today. B's Careful, Steady and Bold is a different thing under the same word.
- Rolled rule perks on gear. A's crafted jewelry already rolls from a pool of 23 perks, and one of them is "your first blow on a fresh monster hits harder", which is B's own first Trait example.
- The first hour. After the designer's ruling D-1, A's first hour already starts with one hero and forms the party at Level 5 with one press.

So the real gap between the candidates is smaller than B's text suggests on packages 1, 8 and 9, and larger on packages 2, 3 and 6.

**The verdict by package.**

| # | Package | Verdict | Label |
|---|---|---|---|
| 1 | Combat and skills | Merge. B's frame, A's built mechanics and measured lineups | JUDGMENT on MEASURED failures of A |
| 2 | Equipment | Take B. It is the only candidate that answers the gear requirement of 2026-11-21. Seed it from A's perk pool and unique kinds | JUDGMENT. Nothing in B is measured |
| 3 | Hunting and monsters | Take B on probation. It becomes the design only if the climb probe passes. A's tier table is the fallback | SPECULATIVE, against MEASURED failures of A |
| 4 | Party | Merge. B's reach and pay rule, A's on-call design and its mixed-Level line | JUDGMENT on MEASURED K-8 |
| 5 | Economy and crafting | Merge. Least evidence on both sides. A's tools, B's law, company trades as a test and not a given | JUDGMENT |
| 6 | Long-term progression | Merge. B's one unit as a hypothesis, A's hand-made beats | SPECULATIVE until the math file and probe V8 |
| 7 | Social and endgame | Take A. It is the only candidate that accounts for arenas and the castle, which are now a confirmed requirement. Take B's order of building | EVIDENCE |
| 8 | The first hour | Take A's walked path. Test B's two changes on it | EVIDENCE, the played hour |
| 9 | Away and return | Take A. B's package is A's design with two additions, and both additions are good | EVIDENCE, the played hour |

**Arenas and the full castle (confirmed 2026-11-21, relayed during this lane).** They stay in the game. They may ship later, and they must be accounted for in the design, the economy and the power budget now. On that test A passes and B, as written on this branch, fails. A has buff caps for every shared source, a power budget with a measured reading, a castle price rule and a named home for late gold. B moved both to a later bet and reserved nothing for them. Section 2.7 has the detail. The lead designer is updating B's package 7 and roadmap, and that text had not landed when this was written.

**The five things that most need your eye.** Section 4 has the full list.

1. Talents and Inner Flame removed. You lifted the hold on a build choice the same morning.
2. Clans, events and bosses stop paying combat power in B. You typed the opposite that morning, and a castle with buff rooms cannot live under that rule.
3. "Solo" is redefined to mean one player with four heroes. Your words set solo beside four-hero parties.
4. Death leaves the default game. On two of three stances a party falls back and should never die.
5. The first build that was ready for the end of December is paused, and B gives no dates.

## 1. How I judged

Each package was read in both candidates, then against the same evidence: chapter 12 sections 3 and 4, the played hour in `review/02-four-hero-hour.md`, tensions K-8 and K-9 in `tools/balance-program/targets.json`, the 164 levers and their flags in `docs/design/balance-baseline/02-lever-registry.md`, and the assumption audit. Where B says something is new, I looked for it in `src/data`.

**Three cautions on the evidence that both candidates use.**

- **Much of chapter 12 waits on a replay.** Its own header says every death number, the Level 60 lineups and the Muster Barrows rows were played before two engine stall fixes. B quotes several of these as settled. They are directions. (EVIDENCE, `12-balance-pass.md` header and `13-build-plan.md` section 4)
- **The tool leans soft.** Its standard four reads 1.26 times the kills of the one real four and takes 0.58 of the front hero's real damage an hour. (MEASURED, run 44920906999, chapter 12 section 1)
- **Real play is tiny.** The town-hours file is 15 heroes on 4 accounts. The played hour is one play by a reviewer who had read the design. (EVIDENCE, `calibration/c4.json` and the played hour's section 6)

**One finding about A as a whole.** Of its 159 rows, 24 rest on a measurement and 80 read as fact without one. The audit found no row that rests on an approved new requirement. (EVIDENCE, `00-assumption-audit.md` section 0) So A is not a tested design that B is trying to unseat. It is a mostly untested design with a good measuring tool. The tool is the part with the most value.

## 2. The nine packages

### 2.1 Combat and skills

**Where A falls short.**
- Armor past Level 30 does nothing, at any band size, because a mid set holds over 2.4 times what the 60% cap can use. (MEASURED, chapter 12 section 3.6)
- A shield front and a hammer front hold alike at Level 110, so two of the styles are one style there. (MEASURED, run 44925664434)
- Talents as stat lines cannot be felt. The fastest build is at most 2.2% ahead and an empty build costs under 3%. (MEASURED, run 44920906999)
- Sixteen combat rows adjust one formula family and none compares another. (EVIDENCE, the audit's assumption 3)
- The registry lists dead or doubled combat numbers: three damage caps nothing feeds, weakness that spells never read, axes that match no monster. (EVIDENCE, lever registry section 3)

**Where B is weaker or untested.**
- Wind-ups are billed as a new engine batch and as "the main way a good bar beats a lazy one". They exist today, and A's own row on breaking one calls its value in an idle hunt a hypothesis. B needs to say what its wind-ups do that today's do not. (EVIDENCE, `src/data/monster-spells.js`, `condition-metrics.js`, row GR-18)
- B does not say what happens to the eleven monster classes with their weapon weakness and three elements. It proposes "a small set of damage types" and six monster roles as if the page were blank. (EVIDENCE, `src/data/monster-classes.js`)
- "The bar is the build" needs many more moves than bar slots. The game has 23. B gives no count, no sample and no cost for writing the rest. (EVIDENCE, `src/data/abilities.js`)
- Six jobs for six weapon families is a class system by another door if each family has one job. B lists fixed classes as a rejected alternative and does not show how its jobs differ. (JUDGMENT)
- Ratio defenses and counted sustain are sound ideas with no model yet. They wait on the math file.

**What survives from A.** The cast warning and its bar condition. Breaking a wind-up (GR-18). "Shooters first" and the target modes. The decisions on whether spells miss, crit and read weakness (GR-12, GR-14). A hit as skill plus gear and never skill times gear (GR-23). The measured lineup table of chapter 12 section 4.1 item 5, which is the only data on what a party needs. The designer's D-9 idea that an unlock is one row with a "when" in the bar's own conditions, which is the same shape as B's rule table.

**Verdict: merge.** Take B's frame: styles differ by job, defenses on a ratio, healing and mana counted, no stat-line tree. Build it from A's existing mechanics and not from zero. Hold the removal of Talents for Tyler, because the measured failure is of stat lines and not of a build choice. (JUDGMENT, on the MEASURED failures above)

### 2.2 Equipment and progression

**Where A falls short.**
- It rests on fixed stats for each item, which the requirement of 2026-11-21 supersedes. No row of A answers that requirement. (EVIDENCE, the audit, R-12 and assumption 7)
- Best gear is worth 2% of pace to a four on the easy tier and 5 to 7% on the harder ones, against an aim of 15%. (MEASURED, run 44920906999, tension K-10)
- A fixed +17% step and a 15 to 25 Level gap cannot both hold past about Level 150. (COMPUTED, tension K-9)
- Luck, special attributes, jewelry perks and glyphs are four layers that each nudge one number. (EVIDENCE, `src/data`)

**Where B is weaker or untested.**
- Nothing is measured. Not one Trait has been written as a row or run.
- A Trait's worth depends on package 3. On today's structure a conditional +6% was invisible on the easy tier. A Trait is the same kind of row. If the climb fails, Traits are dull for the same measured reason Talents were. (MEASURED for the precedent, 856ffcaf4. JUDGMENT for the link)
- B's examples are conditional percents. "Your first hit on a full-health target hits harder" is a number with a "when". That may still be good, but "a rule, not a number" claims more than the examples show. (JUDGMENT)
- Carry-over creates a repeated decision. Every new base tier in a slot with a carried Trait asks the same question again, with the same answer and a new bill. Under the first principle that needs a standing rule in the plan, and B does not have one. (JUDGMENT)
- Carry-over may also end the chase. Once a hero holds the best Trait for its job in each slot, every later drop is a base to carry onto. B lists this as an open question. It is the central one.
- Free copying of ladder bars plus tradeable Traits is a fast road to one solved kit. B names the risk in two places and offers gear as the cure for copying and copying as the cure for setup work. (JUDGMENT)
- It is the largest new money and trade surface in either candidate, and B says nothing on how single-piece listings meet Crowns sold for gold. That is Tyler's area and it must be asked.

**What survives from A.** The jewelry perk pool of 23, as the seed of the Trait list. The seven kinds of unique property that change a decision (GR-41), as the seed of Signatures. Drops authored in hunted hours with the chance derived (GR-87). The named rare of each ground (GR-35). Tempering that carries up. One market book for each piece with grade and perks as filters (GR-50). The Hallmark fee, as a model for "aim a roll at a cost", which B leaves open.

**Luck and Inner Flame.** Section 2.10 compares the three versions, including the idea relayed during this lane.

**Verdict: take B,** because A has no candidate here at all. Start from A's parts and from the sample of five Traits on one ground that B already asks for. Do not write a pool of 30 before that sample is played. (JUDGMENT)

### 2.3 Hunting and monsters

**Where A falls short.** This is where A's evidence is strongest, and it is evidence against A.
- The respawn caps a four, so power buys safety and almost no pace. (MEASURED, 856ffcaf4 and run 44924971088)
- The response to a tier dial is a cliff. Of 56 Deadly cells one read inside the aimed band of deaths, forty had none and six wiped. (MEASURED, run 44925664434)
- One table cannot hold a death count on every ground. Reaching the aimed count on the middle tier needs it to hit harder than the top tier. (MEASURED, tension K-2)
- When the front falls the rest die in the same hunt, in 121 of 129 cases. (MEASURED, run 44948522187, tension K-13)
- The registry counts 27 exceptions among 164 levers, eight of them on monsters, and per-ground fits that were re-typed three times. (EVIDENCE, lever registry sections 1 and 3)

**Where B is weaker or untested.**
- The climb has never run. It may swing between steps and never settle. B says this itself. (SPECULATIVE)
- Removing the respawn cap removes the one thing that bounds kills an hour. That bound is also what bounds gold, drops and server work for a strong party. B's cost line reads "a climbing hunt costs what a hunt costs now" and then "to be measured". Those cannot both stand. (JUDGMENT)
- "Pay rises faster than monster health" on a scale with no top is geometric income. It can work, but only with sinks on the same curve, and B's sinks are a list and not a model. (JUDGMENT)
- If Careful and Steady never die, death and Blessings matter only to players who choose Bold. B keeps Blessings as a gold sink in package 6. A sink that most players never meet is not a sink. (JUDGMENT)
- Whether Bold is always best when left alone decides if the stance is a choice. Nothing shows it yet.
- "Danger 40" against a named tier is a clarity question B leaves open. The word "stance" is already taken.

**What survives from A.** One table at the formula layer and no dial for one ground. The reading that each ground is a ladder (chapter 12 section 3.1), which is the same insight as the climb, found by measurement. Each ground asks one question (GR-31), with its measured Slake sample. Party-wide casters placed by data on every ground from Level 8 (D-10). The free risk reading before Start (GR-66). No hunt starts by itself. The whole matrix tool, which is the only way to run B's probe.

**Verdict: take B on probation.** It is the one proposal on the table that addresses all three measured failures at once. Run probe V1 on one ground first. If a four does not settle at a step, or a small gain in power does not move that step, fall back to A's tier table with party-wide damage built in, which is the change chapter 12 already argued for. (SPECULATIVE for B. MEASURED for the failures it answers)

### 2.4 Party

**Where A falls short.**
- A four earns each hero 1.4 to 2.6 times the XP of hunting apart, and only 0.53 to 0.77 of the gold. A's rows read the rule on XP only. (MEASURED, run 44920906999, tension K-8)
- Three of four heroes are almost never hit, so their armor and Defense do nothing and Defense never trains. (MEASURED, chapter 12 section 4.1)
- No solo and no group targets exist. The reset asks for both. (EVIDENCE, the audit's assumption 5)

**Where B is weaker or untested.**
- B's fix for gold is arithmetic that has to come out right. With an even split, a four out-earns its heroes apart only if its total pay an hour is over four times a lone hero's. That needs the four to hold many steps deeper, or each step to pay a lot. No run shows either. (COMPUTED from B's own rule)
- The same arithmetic cuts the other way. The better it works, the worse a lone hero looks. B then defines solo as one player with a company. Tyler's line sets solo viability beside four-hero parties, which reads as one hero alone. (EVIDENCE, the audit's row ID-5)
- Personal loot multiplies drops by seats. B says rates are set per hero. It does not say what four times the plain gear does to the market or to storage.
- Catch-up and a paid cut for hired heroes are both open doors for second accounts. A's on-call design closes them: the hired hero takes no coin and no drops, has its own hire stamina that nothing sells, and earns a small share of XP. (EVIDENCE, row CH11-1)

**What survives from A.** Own heroes join with no invite. The on-call design with its two stamina pools. One visible line for mixed Levels (MM-19). The shared supply bill. The measured result that a front hero and a healer are needed and that no one damage type wins.

**Verdict: merge.** Take B's reach into the back row and its one pay rule for XP and gold. Take A's on-call rules over B's cut. Add a target for a lone hero, which neither has. (JUDGMENT, on MEASURED K-8)

### 2.5 Economy and crafting

**Where A falls short.**
- Typed prices are 7 to 12 times too small beside what an account of four earns, and full best gear costs 0.18 of a band's gold against an aim of 1.2 to 1.4. (COMPUTED on MEASURED income, chapter 12 section 3.7, tension K-6)
- Gold in the tool is an upper bound, and the wage formula that every price should read does not exist. (EVIDENCE, row GR-51)
- 23 of 26 economy levers cannot be played by the simulator at all. (EVIDENCE, lever registry section 4)

**Where B is weaker or untested.**
- B inherits every one of those gaps. Its economy is a set of good rules with no faucet or sink model. "Sinks scale with wealth" is a wish until the wage exists.
- Company-owned trades rest on one reading of 15 heroes: 1.57 town hours for each hunted hour. Those heroes had a 12 hour stamina bar, so much of that town time was the only thing left to do. It shows the hours exist. It does not show players want them merged. (EVIDENCE, `calibration/c4.json`. JUDGMENT on its meaning)
- It also cuts up to three quarters of the trade grind, which is content. B notes this and does not size it.
- "The store sells basics only and players make the rest" needs players. With a handful of accounts a shard has no market, and a new player falls back on self-supply for everything.
- "Best gold and best XP sit at different depths" is a fine aim and a hard one. It is a pricing result that must hold at every Level.

**What survives from A.** The wage curve as the source of every price, with "about 3 hours of hunting" beside it (GR-51). The market that runs itself with standing buy orders and loot rules (GR-50). The measured account-day of gold. Town work in closed form, which the server budget needs. Self-supply. The fee and cut, both burned.

**Verdict: merge, and call it the least proven package in both.** B's law ("drops give the item, trades improve it and keep it running") is the right spine, and it is already most of what A built. Treat company trades as a test with its own question for Tyler and not as settled. (JUDGMENT)

### 2.6 Long-term progression

**Where A falls short.**
- The Level law is one table fitted at two points, and one seat multiple cannot hold both. (MEASURED, tension K-7)
- Gear has no formula past tier 7. Today's gear earns 0.47 of the pace at Level 1,000 and cannot hunt at 2,000. (MEASURED, lever registry flag on `weapon.family-tables`)
- Nothing reads past Level 400.
- The Level table from 2026-10-25 fixes almost every other number before design starts. (EVIDENCE, the audit's assumption 2)

**Where B is weaker or untested.**
- "A Level is one power step forever" has no math yet. A fixed ratio for each step over Levels with no cap is exponential growth in every number the server stores and every number a player reads. That needs an answer before it is a design. (JUDGMENT)
- If heroes, monsters, gear and prices all grow on one ratio, Level 900 at Danger 900 plays exactly like Level 90 at Danger 90. B quotes a playtester who said Tower floors 100 to 170 "felt the same" as proof against A's curve. A uniform step gives that sameness by design. Only hand-made content breaks it, and B's own open question asks if formula depth is enough. (JUDGMENT)
- Nothing in B makes Level 200 an event, which the game's north star asks for.
- Removing damage from the bestiary, room perks and the clan Library takes away three chases. B is right that they cannot be felt today. Whether players miss them is a different question.

**What survives from A.** Each region names one new rule before its grounds are drawn (GR-33). The Tower as a weekly beat with a best-ever board (GR-37). No prestige and no rebirth (GR-64). The home as a showcase others visit. The Level table, kept as a hypothesis about hours and not as law.

**Verdict: merge.** One unit for Levels, gear and monsters is the cleanest answer offered to K-9 and it should be the first thing the math lane proves or kills. Keep A's rule that hand-made content sets the beat, because that is what stops the sameness. (SPECULATIVE until probe V8 and the math file)

### 2.7 Social and endgame

**The test for this package changed during the lane.** Tyler confirmed on 2026-11-21 that arenas and the full castle stay in the game. They may ship later. They must be accounted for in the design, the economy and the power budget now. Both candidates are judged on that.

**Where A falls short.**
- Two arenas are planned on an engine where heroes cannot fight heroes. Sides are fixed in 93 places. A knows it: its row MM-41 makes that engine test the first arena work of any kind. (EVIDENCE, lever registry section 4)
- Its power budget was computed and then measured wrong. The book said every cap full reads 1.72 times a plain four. The run read 1.29 to 1.48. A damage buff of +15% paid a median +2% of pace. So the castle's War room is worth about 1% to a four, and the budget's arithmetic does not describe the game. (MEASURED, runs 44924971088 and 44925664434, chapter 12 section 3.8)
- The cause is package 3 again. On a cliff with a respawn cap, a buff is worth nothing until a party stands on an edge, and then it is worth a whole tier. A budget in percents cannot hold that.
- The castle's prices are not sized. Typed account prices were 7 to 12 times too small. (COMPUTED, chapter 12 section 3.7)
- A hall on health and a clock rewards four damage dealers. A's designer already withdrew it. (EVIDENCE, `review/10-designer-d9-halls.md`)

**Where B is weaker.** On the new requirement B fails as written.
- It moves both arenas to `03-opportunities.md` as a later bet and shrinks the castle to one project. Nothing in its economy package prices a castle, and nothing in it leaves room in a power budget for a clan buff or an arena reward. (EVIDENCE, B's package 7 section 3)
- Its balance line says clan and event rewards must not be combat power a lone company cannot get. A castle of rooms that carry standing buffs is exactly that. So the requirement does not only add two features to B. It contradicts one of B's rules, and B has to choose. (JUDGMENT)
- B has no power budget at all yet. Its principle "power is felt as depth" makes this harder and not easier. If every percent now moves the step a party holds, then a +5% War room is no longer worth 1%. It is worth real depth, and caps written for a game where buffs did little would be far too generous. Neither candidate has sized shared buffs for a game where power is felt. (JUDGMENT)
- The hire board as "the party finder" is A's on-call design with a board on it. Both are unproven and both need a population that does not exist yet.
- B drops the clan Library, the one buff measured to pay a four its full size. (MEASURED, run 44924971088)

**What survives from A.** Nearly all of it.
- The modifier table where every buff is one row, and one cap for each kind of buff across every source (MM-24, MM-25). This is the mechanism the requirement asks for. The numbers in it are hypotheses.
- The ceiling as a reading held by a test and not as a new limit (MM-26), re-measured on whatever package 3 becomes.
- The castle as one project at a time, priced by member with a floor of five, so a small clan can build (MM-9).
- The castle as the long home for late gold (MM-22). B's economy needs a wealth sink of this size and has none as large.
- Arena opponents as saved setups and house teams, never live players (MM-12). It fits "works while both players sleep".
- Two arenas, one that evens every stat and one that reads real gear (MM-13), with rewards by rating tier.
- The engine test before any arena is planned (MM-41).
- The rule that every shared feature works while both players are asleep, with its count of 5 shared windows in 675 (MM-1). The world boss as one shared pool fought from each account's own room (MM-2). The cheap layer of chat, roster, presence and calendar.

**What B adds that is worth taking.** Building order: the cheap layer first, arenas and castle buildings after the hunt holds. The question of an arena that is native to automated combat, "company against company by bar", asked before two arenas are built on a move set made for monsters. Ladders that show the bars behind an entry.

**Verdict: take A.** It is the only candidate that meets the confirmed requirement, and its mechanism is the right one: one modifier table, one cap for each kind, a tested ceiling, a priced castle. Three things must change inside it. The caps are re-sized after package 3 is settled, because their worth changes with it. The castle is priced from the wage. The arena waits on the engine test and is designed for automated combat. B's rule against shared combat power is the thing to drop, or to restate as a cap. (EVIDENCE for A's coverage. MEASURED for the budget's miss. JUDGMENT for the rest)

### 2.8 The first hour

**Where A falls short.** As built and played: no weapon pick, the tutorial restarted for each hero, the first tip pointed under Chat, about 12 presses a hero, and a tank that fought nine hours in no armor. (EVIDENCE, the played hour) As designed after D-1, most of that is already answered.

**Where B is weaker.** B describes this package as a departure. It is mostly A's path. After D-1, A starts one hero, ends the first ground at Level 5, and offers "Build your party" as one press with three pre-filled recruits. (EVIDENCE, `review/05-designer-rulings.md` section 1.1, rows 1 to 6) The real differences are two.

1. A shows four slots on the first screen. B shows one hero.
2. A's recruits start at Level 1 and catch up in their own short hunts. B's recruits "join near the first hero's Level", which is a grant of Levels.

B's package has no walk-through against real data, and says so. A's has one, with a guard on it. B also keeps the first return at "about 8 hours" without re-arguing the hunting day.

**What survives from A.** The Path table and its guard. Hunting inside two minutes. The weapon pick that wears the starter row. The words "Build your party". "Safe to close" said out loud. The first rest plan.

**Verdict: take A's walked path and test B's two changes on it.** Hiding three empty slots is cheap and probably right. The Level grant saves about eleven minutes and needs sizing as a grant. A blind first hour by a stranger settles both. (EVIDENCE)

### 2.9 Away and return

**Where A falls short.** Setup slots were priced at 15,000 and 40,000 gold, which is a price on remembering a choice. The report says how close a hunt came to a death and not why it ended. (EVIDENCE, rows GR-56a and GR-66)

**Where B is weaker.** B's package is A's: one plan, one Start, one return card with at most three decisions, the report, "equip upgrades for all four", the rest plan. B adds two things. Both are good. Neither is tested.
- The cause line and "the one change most likely to help". Wrong advice is worse than none, and the counters it needs do not exist yet.
- Free plans that copy between heroes, companies and ladder entries.

B keeps the stamina bar as "the hunting day" in one line. The audit ranked the bar and the 12 hour day among the twelve assumptions that most need a fresh argument. B does not give one. (EVIDENCE, the audit's assumption 12)

**What survives from A.** All of it except the slot prices.

**Verdict: take A, add the cause line, and ask Tyler about the slot price,** which he answered at a sitting with the costs in front of him. (EVIDENCE, the played hour)

### 2.10 Luck and Inner Flame, three versions

During this lane the Coordinator relayed an idea of Tyler's that the lead designer is writing into `02-architecture.md`: Luck becomes Inner Flame, fed by burning creature remains at the hearth, and it raises rare-drop and Trait chances. It had not landed on `origin/lane/rd-vision` when this was written, so this section judges the idea as relayed and not a text.

| | A, the existing overhaul | B, as written on this branch | The relayed idea |
|---|---|---|---|
| Inner Flame | A fifth combat skill for each hero. It gives health and mana regen on a curve. Trained by burning bones and fuels at the Hearth by a loot rule. It is lost on death. Its stretch past level 100 is open with no owner | Removed | The home of Luck |
| Luck | One bar for the account that only fills. Two feeds: Lucky Rivets from salvaged gear, and bestiary stages. Each percent of Magic Find costs more. A Lucky ring adds a little for one hero. Rares only | Folded into Traits and the bestiary. The last bestiary stage gives a small boost to that monster's rare chance | Raised by burning remains at the hearth. Lifts rare-drop and Trait chances |
| What bones are for | Regen | Open. B asks "what should bones become" | Luck |

(EVIDENCE: `05-progression.md` section 2.8, `03-items-and-crafting.md` section 2.11, `src/data/hearth.js`, B's package 5 open questions)

**Is it stronger? Yes, than either written version, with three conditions.** (JUDGMENT)

- **Against A.** It merges two systems into one and gives each a reason the other lacked. A's Inner Flame was trained 16 hero-hours by 15 heroes while mining took 769, and its reward is regen that nobody sees. A's Luck is a good formula fed by a strange item, the last rivet of salvaged gear. Burning what you killed to get luckier against what you hunt is one sentence a player can repeat. It also keeps the hearth, the named fuels that color the town's fire, and every bone drop already in the data. (EVIDENCE, `calibration/c4.json` and `src/data/hearth.js`)
- **Against B.** It answers B's open question about bones, gives the drop chase a long account-wide ladder that B removed, and puts back a sink for a common drop. It costs B one of its cuts, and that is fine.

**The three conditions.**
1. **Keep A's shape for the curve.** One total for the account, raise-only, each percent costing more, so four heroes are not four times as lucky. A already worked this out and it should carry over whole.
2. **It lifts the chance that a drop happens, and never which Trait rolls.** If the flame can steer a roll, it is the reroll bench B rightly refused.
3. **One feed, set once.** Remains burn by a loot rule in the plan, with no hero time and no clicks. Salvage should then go back to being a material source, so Luck does not have two feeds that compete.

Two questions stay open. Does regen leave the flame, or stay as a small second effect? And does a death still take flame progress, which was kept on purpose on 2026-10-25? Under this idea the flame is account luck and not a combat skill, so a death loss on it would be hard to explain. That is Tyler's to say.

## 3. Keep, change, remove

One table for the whole game. "From" says which candidate the item comes from. Every remove is a proposal for Tyler.

| | Item | From | Why |
|---|---|---|---|
| **Keep** | The matrix tool, the calibration files and the lever registry | A | The only way to test anything in B |
| | One engine, one table at the formula layer, no dial for one ground | A | Core, and B agrees |
| | The action bar, its conditions, cast warnings and wind-up breaks | A | Already built. B's combat stands on them |
| | The wage curve as the source of prices, and the market that runs itself | A | B adopts both |
| | One plan, one Start, one return card, the rest plan, gear that gets worn | A | Played. B adopts all of it |
| | The Path table for the first hour, with its walk-through and guard | A | The only walked sequence in either candidate |
| | On-call heroes with hire stamina and no coin or drops | A | Safer than a paid cut |
| | "Works while both players sleep" as the social test | A | Thin evidence, right direction |
| | Town work in closed form | A | The server budget needs it |
| | Each ground asks one question, each region names one new rule | A | B says the same in other words |
| | The jewelry perk pool and the seven unique property kinds | A | The seed of Traits and Signatures |
| | The Luck curve: one account total, each percent costs more | A | Carries into the hearth idea |
| | Arenas and the full castle, in the design, the economy and the power budget now, built later | A | Confirmed requirement of 2026-11-21. Only A accounts for them |
| | One modifier table and one cap for each kind of buff | A | The mechanism the power budget needs |
| **Change** | Three hand-picked tiers become a scale the party climbs, if the probe passes | B | Answers the cliff, the respawn cap and the re-picked dial |
| | The respawn as the pace cap becomes pulls on readiness, with a measured server cost | B | Lets power be felt |
| | Fixed-stat gear gains rolled Traits and hand-made Signatures | B | The requirement of 2026-11-21 |
| | Coin and loot scale with depth as XP does | B | The gold half of K-8 |
| | Monsters reach the back row by rule and not only by placed casters | B, on A's D-10 | The one-health-bar party |
| | Armor on a capped line becomes a ratio | B | Armor that does nothing past Level 30 |
| | The gear curve and the Level law share one unit | B | K-9, once the math exists |
| | The report says why a hunt ended | B | The largest gap in what is read today |
| | Setup slots become free and copyable | B | The first principle. Tyler's call |
| | Luck and Inner Flame become one hearth system | Tyler's idea | Section 2.10 |
| | Typed prices are regenerated from the wage | Both | 7 to 12 times off today |
| | The buff caps and the power ceiling are re-sized once power can be felt | A's rows, B's frame | The book said 1.72 and the run read 1.29 to 1.48 |
| **Remove** | Talents as stat lines | B | Measured as unfelt. The build choice itself is a separate question |
| | Stacked small percents: special attributes, glyphs, room perks, bestiary damage | B | Each is a few percent nobody can feel |
| | Dead and doubled numbers in the rule code | Registry | Named one by one in its section 3 |
| | Per-ground fits and tier overrides | Both | The formula-layer rule |
| | A hall decided by health and a clock | Both | Withdrawn by A's designer already |
| | Companions in combat | B | No evidence either way. Tyler's call |
| | The rule that nothing planned is cut | Audit | It blocked the purpose test |

## 4. The departures in B that most need Tyler's eye

The first six are on B's own list. The rest are mine. Each line says what the evidence does and does not show.

| # | Departure | What the evidence shows | What it does not |
|---|---|---|---|
| 1 | The four heroes arrive at about Level 5, not on the first screen | A's path after D-1 already forms the party at Level 5. The true change is hiding three empty slots and granting recruits their Levels | Whether a stranger wants four slots in view. No blind play exists |
| 2 | Talents removed | Stat lines cannot be felt away from an edge (MEASURED) | That a build choice every five Levels is wrong. On the edge, builds decided who lived: 0 deaths against 12. B's replacement has no move list |
| 3 | Inner Flame removed | 16 hero-hours of use among 15 heroes | Anything about a redesigned flame. Section 2.10 argues to keep it as the home of Luck |
| 4 | Trades owned by the account | Town hours are large (1.57 to 1, 15 heroes) | That players want them merged. It also cuts the trade grind by up to three quarters |
| 5 | Free Setup slots | The first principle, and a played hour where setup was the slowest part | Nothing against it. It reverses an answer given at a sitting, so it is his to re-give |
| 6 | Arenas and the full castle moved later | Settled during this lane: they stay and must be accounted for now. B as written does not, and its rule against shared combat power conflicts with castle buffs. The engine still cannot run heroes against heroes (93 places) | How large shared buffs may be once power is felt as depth |
| 7 | Companions out of combat | Nothing. The simulator carries no companion | Everything. This is pure judgment |
| 8 | Clans, events and bosses stop paying combat power | The Library is the one buff that pays a four in full (MEASURED). The castle requirement now points the other way | What the caps should be. It also reverses a typed ruling of that morning |
| 9 | "Solo" means one player with a company | Nothing | B's pay rule makes a lone hero worse the better the party rule works. Neither candidate has a lone-hero target |
| 10 | Death leaves the default game | The cliff makes today's deaths arbitrary (MEASURED) | Whether a game where most players never die keeps its tone, or its Blessing sink |
| 11 | The stamina bar is kept as "the hunting day" with no fresh argument | Nothing either way | Whether a cap on hunted hours is right for an idle game. It is also what Premium sells, so it is his |
| 12 | Factions paused. Bestiary damage, room perks, charms and glyphs cut | They are small percents today | Whether they would be felt once power is felt as depth |
| 13 | Store supplies cut to basics | Best runes paid for themselves (one playtest) | That a market exists to replace the store at today's population |
| 14 | The first build is paused and no dates are given | B's stages are sound in order | How long. A had about 15 lanes aimed at the end of December. B has six waves, four approvals and no estimate |
| 15 | The existing monster classes, weapon weakness and the spell list are not mentioned | They exist in data | Whether B keeps, merges or replaces them |

## 5. What neither candidate answers yet

1. **What a lone hero is for, in numbers.** A dropped solo targets. B redefined solo. The reset asks what makes solo play worthwhile.
2. **The power step.** B names it as the unit of everything and leaves it to a file that has not landed. A never had one.
3. **A model of gold.** Faucets and sinks for an account, with a wage. Both candidates say it is needed. Neither has it, and the simulator cannot play 23 of the 26 economy levers.
4. **How Traits, single-piece listings and Crowns sold for gold meet.** It decides what paying buys. It is Tyler's area and neither design sizes it.
5. **Whether there should be a cap on hunted hours at all,** and how long a day is. Every time number in both designs rests on it.
6. **Server cost for an account under B.** Pulls on readiness, climbing parties and a row for each Trait piece, against the monthly budget that still binds.
7. **Population.** Both assume shards, a market and hired heroes. A handful of accounts play today. Neither says what the game is with 30 players.
8. **What makes Level 200 an event,** and what breaks the sameness of formula depth between hand-made regions.
9. **What happens to the first-build code already merged on the set** and to the staged migrations 1036 to 1045. The audit raised it. Neither design owns it.
10. **Whether skill loss on death, and death itself, still earn their place** once a party falls back first.
11. **An arena that fits automated combat, and a power budget for shared buffs that survives package 3.** A has the rows and a budget that measured wrong. B has neither yet.
12. **How true the evidence is.** The replay of chapter 12 on the fixed engine is still owed, and both candidates lean on the numbers it will move.

## 6. What I did not check

- I ran no simulation and played no build. Every MEASURED line is quoted from the run named beside it.
- The math strategy had not landed, so nothing here judges it.
- Chapters 01 to 11 of A were read through their decision rows, chapter 00, chapter 12, the build plan and the four designer ruling files, and not line by line.
- Which of chapter 12's numbers move on the fixed engine is not established.
- The claims that a mechanic "already exists" come from reading `src/data` on this branch. I did not play them.
- B was judged as it stood on this branch at b596f0398. The lead designer's updates for the hearth idea and for arenas and the castle had not landed on `origin/lane/rd-vision` at the last fetch.
- The relayed Luck and Inner Flame idea was judged from one sentence. If the written text differs, section 2.10 should be re-read against it.
- Cost sizes are not compared, because B gives letter sizes and A gives lanes, and neither gives days.
