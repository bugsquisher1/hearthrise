# 06. Comparison with the existing overhaul

Written 2026-11-21 on `lane/rd-compare`, from `set/v0.2.144` at b596f0398. Refreshed the same day against the set at 604fc9386, after B gained three sections: 1b on Talents, 2b on the flame and 7b on arenas and the castle. Packages 1, 2, 6 and 7, the departures and the one screen were judged again. Docs only. This is deliverable 4 of the reset request of 2026-11-21. It is a judgment for review. Nothing here is a ruling and nothing here is final.

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

**Why B cannot be approved on trust.** B has no run, no played minute and no math file. Its nine packages and its three new sections all hang on one untested mechanic, the climb with a fall back. If that mechanic does not settle at a step, packages 1, 2, 4 and 6 lose their reason, and so do evolutions, because a branch is the same kind of row that measured as invisible on today's structure. B's own roadmap puts that probe first. I agree with the order and I would go further: nothing else in B should be detailed until that probe has a result. (JUDGMENT)

**What the refresh changed.** B took three confirmed or floated requirements of 2026-11-21 and wrote them in. Two of my earlier findings are closed by it: Talents are kept as a build choice, and arenas and the castle are in the design with budgets set aside. The flame as Luck is written much as section 2.10 of the first issue argued. On all three, B is now the stronger text. On all three, nothing is measured, and each brings one new problem that section 2 names.

**A warning on complexity.** B began by cutting layers. After the refresh, one move on a hero's bar can be changed by its rank, by up to three branch picks, by a Trait, by a Signature, by an imbuement and by the stance. A piece of gear has five parts. The flame has two parts and a memory. Each is argued well alone. Nobody has counted them together against the reset's line on complexity without player value. (JUDGMENT)

**Where B oversells.** Four things B presents as new are already in the game or in A. (EVIDENCE, read in `src/data` on this branch)

- Monster wind-ups and a bar condition that sees them. Eighteen monster spell rows carry a wind-up, the condition "the pack has monsters casting" exists, and Shelter already fires on it. A's row GR-18 lets a blow break a wind-up.
- A stance. The game has Offensive, Balanced and Defensive fight stances today. B's Careful, Steady and Bold is a different thing under the same word.
- Rolled rule perks on gear. A's crafted jewelry already rolls from a pool of 23 perks, and one of them is "your first blow on a fresh monster hits harder", which is B's own first Trait example.
- The first hour. After the designer's ruling D-1, A's first hour already starts with one hero and forms the party at Level 5 with one press.

So the real gap between the candidates is smaller than B's text suggests on packages 1, 8 and 9, and larger on packages 2, 3 and 6.

**The verdict by package.**

| # | Package | Verdict | Label |
|---|---|---|---|
| 1 | Combat and skills | Merge. B's frame and its move evolutions, on A's built mechanics and measured lineups | JUDGMENT on MEASURED failures of A. Evolutions are untested |
| 2 | Equipment | Take B, with the flame as Luck. Seed Traits from A's perk pool and unique kinds, and carry A's guard rails on Luck | JUDGMENT. Nothing in B is measured |
| 3 | Hunting and monsters | Take B on probation. It becomes the design only if the climb probe passes. A's tier table is the fallback | SPECULATIVE, against MEASURED failures of A |
| 4 | Party | Merge. B's reach and pay rule, A's on-call design and its mixed-Level line | JUDGMENT on MEASURED K-8 |
| 5 | Economy and crafting | Merge. Least evidence on both sides. A's tools, B's law, company trades as a test and not a given | JUDGMENT |
| 6 | Long-term progression | Merge. B's one unit as a hypothesis, A's hand-made beats. B now has an answer for Level 200 | SPECULATIVE until the math file and probe V8 |
| 7 | Social and endgame | Merge. The two candidates now agree. A's designs, B's accounting: the side seam first, budgets set aside, every target read with and without them | JUDGMENT. The seam count is MEASURED |
| 8 | The first hour | Take A's walked path. Test B's two changes on it | EVIDENCE, the played hour |
| 9 | Away and return | Take A. B's package is A's design with two additions, and both additions are good | EVIDENCE, the played hour |

**The five things that most need your eye.** Section 4 has the full list.

1. **Gold can now buy luck.** In B the flame is fed by remains, and remains trade. A's Luck was bound to the account on purpose, so that nothing sold it.
2. **A point every Level is mostly a small percent.** With "spend as suggested" as a standing rule, the real choices are about three branch picks a move. Is that what "every level" meant?
3. **"Solo" is redefined** to mean one player with four heroes. Your words set solo beside four-hero parties.
4. **Death leaves the default game.** On two of three stances a party falls back and should never die.
5. **The first build that was aimed at the end of December is paused,** and B now has seven waves, four approvals and no dates.

## 1. How I judged

Each package was read in both candidates, then against the same evidence: chapter 12 sections 3 and 4, the played hour in `review/02-four-hero-hour.md`, tensions K-8 and K-9 in `tools/balance-program/targets.json`, the 164 levers and their flags in `docs/design/balance-baseline/02-lever-registry.md`, and the assumption audit. Where B says something is new, I looked for it in `src/data`.

**Three cautions on the evidence that both candidates use.**

- **Much of chapter 12 waits on a replay.** Its own header says every death number, the Level 60 lineups and the Muster Barrows rows were played before two engine stall fixes. B quotes several of these as settled. They are directions. (EVIDENCE, `12-balance-pass.md` header and `13-build-plan.md` section 4)
- **The tool leans soft.** Its standard four reads 1.26 times the kills of the one real four and takes 0.58 of the front hero's real damage an hour. (MEASURED, run 44920906999, chapter 12 section 1)
- **Real play is tiny.** The town-hours file is 15 heroes on 4 accounts. The played hour is one play by a reviewer who had read the design. (EVIDENCE, `calibration/c4.json` and the played hour's section 6)

**One finding about A as a whole.** Of its 159 rows, 24 rest on a measurement and 80 read as fact without one. The audit found no row that rests on an approved new requirement. (EVIDENCE, `00-assumption-audit.md` section 0) So A is not a tested design that B is trying to unseat. It is a mostly untested design with a good measuring tool. The tool is the part with the most value.

## 2. The nine packages

### 2.1 Combat and skills, with Talents as move evolutions

**Where A falls short.**
- Armor past Level 30 does nothing, at any band size, because a mid set holds over 2.4 times what the 60% cap can use. (MEASURED, chapter 12 section 3.6)
- A shield front and a hammer front hold alike at Level 110, so two of the styles are one style there. (MEASURED, run 44925664434)
- Talents as stat lines cannot be felt. The fastest build is at most 2.2% ahead and an empty build costs under 3%. (MEASURED, run 44920906999)
- A's Talents give a point every five Levels on tracks beside the bar. The requirements of 2026-11-21 ask for evolved moves and a point every Level. A has neither. (EVIDENCE, row TAL-1)
- Sixteen combat rows adjust one formula family and none compares another. (EVIDENCE, the audit's assumption 3)
- The registry lists dead or doubled combat numbers: three damage caps nothing feeds, weakness that spells never read, axes that match no monster. (EVIDENCE, lever registry section 3)

**Where B is weaker or untested: the frame.**
- Wind-ups are billed as a new engine batch and as "the main way a good bar beats a lazy one". They exist today, and A's own row on breaking one calls its value in an idle hunt a hypothesis. B needs to say what its wind-ups do that today's do not. (EVIDENCE, `src/data/monster-spells.js`, `condition-metrics.js`, row GR-18)
- B does not say what happens to the eleven monster classes with their weapon weakness and three elements. (EVIDENCE, `src/data/monster-classes.js`)
- Six jobs for six weapon families is a class system by another door if each family has one job. (JUDGMENT)
- Ratio defenses and counted sustain are sound ideas with no model yet. They wait on the math file.

**Where B is weaker or untested: evolutions (section 1b).** The first draft removed Talents. B now says that read the evidence too widely, which is the point this file made in its first issue. The new design is the better of the two candidates. It still has six problems.
1. **The rank is a stat line.** The sample ranks are "about 3% longer" and "about 2% more". That is the thing measured as unfelt, and the thing B's own identity file cuts. B's "honest limit" admits that past the last branch the choice is which move gets the percent. With a point every Level and ranks with no top, most points a hero ever spends are of this kind. (JUDGMENT, on the MEASURED precedent)
2. **Not spending is a penalty, so the choice is a duty.** A third of each Level's power arrives through the point, and monsters grow a full step. Four heroes then owe a decision at every Level, and early Levels are minutes apart. Under the first principle that has to be a standing rule, and B offers one. But once "spend as suggested" is on, the every-Level choice is gone for that player, and what is left is about three branch picks a move. That may be exactly right. It is not what the words "something to choose at every Level" promise. (JUDGMENT)
3. **"No best path" and "a felt choice" pull against each other.** If every rank is worth the same wherever it goes, and every branch of a mark has one budget, the best build beats the suggested one by a little. A's Talents met that same target and were judged unfelt for it. B's answer is that branches matter at the edge of a step. That is A's measured result too: 0 deaths against 12 on the edge, and nothing away from it. So evolutions stand or fall with package 3. (MEASURED for the precedent, run 44925664434)
4. **Spells already have stronger versions.** Every rune spell carries five versions today, bought by deeper runes. B's ranks are a second ladder on the same move and B does not say what happens to the first. (EVIDENCE, the `versions` field in `src/data/abilities.js`)
5. **The writing load is large and must be good.** About eight branch rows a move on 26 moves is over 200 rows before any new move is written. B says to start with the two sampled moves, which is right and is the standing rule on batches. (COMPUTED from `src/data/abilities.js`)
6. **Some branches take a decision off the bar.** "Fires by itself when a monster goes for a back-row hero" is a condition. The bar is where conditions live. Two homes for one kind of choice needs a rule. (JUDGMENT)

What B gets right here and A did not: evolutions live on the moves and not on a second screen. The sample is written on two real moves, Challenge and Mend. The server counts points from the Level it holds. Level 200 opens a final form, which gives that Level a meaning. Probe V11 is the right test.

**What survives from A.** The cast warning and its bar condition. Breaking a wind-up (GR-18). "Shooters first" and the target modes. The decisions on whether spells miss, crit and read weakness (GR-12, GR-14). A hit as skill plus gear and never skill times gear (GR-23). The measured lineup table of chapter 12 section 4.1 item 5. From A's Talents: a plan set once that spends new points with no press, a reset for gold, and the designer's four D-9 unlocks, which B already takes as branches.

**Verdict: merge.** Take B's frame and B's evolutions over A's stat tracks. Build both from A's existing mechanics. Before any pool is written, play the two sampled moves and answer one question first: can the rank between branches be dropped or made coarse, so that a point is never a 2% line? (JUDGMENT, on the MEASURED failures above. Evolutions are SPECULATIVE until probe V11)

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

**Luck and Inner Flame.** B now carries the flame as Luck in its section 2b. Section 2.10 judges it against A's two systems. In short: it is stronger than either of A's, and it gives up one protection A had.

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
- If heroes, monsters, gear and prices all grow on one ratio, Level 900 at Danger 900 plays exactly like Level 90 at Danger 90. B quotes a playtester who said Tower floors 100 to 170 "felt the same" as proof against A's curve. A uniform step gives that sameness by design. The refresh helps a little: branch picks and new moves break it while hand-made content lasts. Past the last branch B's own text says the choice is small. (JUDGMENT)
- The bestiary now pays nothing but knowledge and a trophy. The first draft gave its last stage a rare-chance boost, and A fed Luck from its stages. One feed for Luck is cleaner. It also leaves a kill count chase with no mechanical reward at the end, and that should be a choice made on purpose. (EVIDENCE, B's package 6 and `03-items-and-crafting.md` section 2.11)
- Flame Level to 99 is a new long chase with no combat power in it. That is a good shape. Its hours are not sized.
- Removing damage from the bestiary and room perks takes away chases that cannot be felt today. Whether players miss them is a different question.

**What the refresh fixed.** Level 200 now opens a final form for one move, so the north star's "Level 200 is a big deal" has an answer. The clan Library is back, inside a reserved slice.

**What survives from A.** Each region names one new rule before its grounds are drawn (GR-33). The Tower as a weekly beat with a best-ever board (GR-37). No prestige and no rebirth (GR-64). The home as a showcase others visit. The Level table, kept as a hypothesis about hours and not as law.

**Verdict: merge.** One unit for Levels, gear and monsters is the cleanest answer offered to K-9 and it should be the first thing the math lane proves or kills. Keep A's rule that hand-made content sets the beat, because that is what stops the sameness. (SPECULATIVE until probe V8 and the math file)

### 2.7 Social and endgame, with arenas and the full castle

**The test.** Tyler confirmed on 2026-11-21 that arenas and the full castle stay in the game. They may ship later. They must be accounted for in the design, the economy and the power budget now. The first issue of this file found that A met that test and B did not. B has since added section 7b. Both are judged again.

**Where A falls short.**
- Two arenas are planned on an engine where heroes cannot fight heroes. Sides are fixed in 93 places in 22 modules. A makes the engine test the first arena work (MM-41) and plans nothing for the engine until it is run. (MEASURED, `tools/balance-program/engine-checks.mjs --mm41`)
- Its power budget was computed and then measured wrong. The book said every cap full reads 1.72 times a plain four. The run read 1.29 to 1.48. A damage buff of +15% paid a median +2% of pace, so the castle's War room is worth about 1% to a four. (MEASURED, runs 44924971088 and 44925664434, chapter 12 section 3.8)
- The cause is package 3 again. On a cliff with a respawn cap, a buff is worth nothing until a party stands on an edge, and then it is worth a whole tier. A budget in percents cannot hold that.
- The castle's prices are not sized. Typed account prices were 7 to 12 times too small. (COMPUTED, chapter 12 section 3.7)
- A accounts for these features by capping them after the base game is sized. Nothing is set aside before.

**Where B now stands.** B keeps both, takes A's designs by reference, and adds an accounting that A lacks. Three parts of it are better than A's.
1. **The side seam goes into the first engine batch.** Every unit carries a side, and a hunt is side A against side B. That batch already rewrites targeting, so it is one pass and not two. It is proven by a mirrored fight that should split about evenly (probe V10).
2. **Budgets are set aside before targets are written.** A slice of power for clan buffs and one for arena rewards, a share of sinks and a share of town hours for the castle.
3. **Every target is read twice,** with the slice on and with it off, and both must sit inside the range. That is a real mechanism. It bounds the slice by the width of the target bands, and it means the castle can arrive later and move no other number.

**Where B is weaker or untested.**
- Nothing is sized. The slices have no number, and B's sink budget is a share of a model that does not exist in either candidate.
- The seam is bundled with the riskiest change in the design. Wave 1 also carries the power step, the Danger scale and the climb. B's proof for the seam is "a hunt replay is unchanged", and no replay can be unchanged in a batch that changes hunts on purpose. The seam should land first as its own step that moves no number, proven by replay, and the climb after it. A's plan had exactly that kind of step. (JUDGMENT)
- If power is felt as depth, a +5% buff is no longer worth 1%. It is worth real depth. So A's caps cannot be carried over as numbers, and B has not said what replaces them. Reading every target twice will show the problem. It does not solve it.
- B adopts five buildings of ten levels and about a year of work without putting them through its own purpose test. Opening one building at a time is the right hedge.
- Whether moves made to beat monsters give a good fight between heroes is still open in both. Arena gear as a sidegrade line has not been read against Traits and Signatures.
- The hire board as "the party finder" is A's on-call design with a board on it. Both are unproven and both need a population that does not exist yet.

**What survives from A.** The designs themselves, which B now cites.
- One modifier table where every buff is one row, and one cap for each kind across every source (MM-24, MM-25). The numbers in it are hypotheses.
- The ceiling as a reading held by a test (MM-26), re-measured on whatever package 3 becomes.
- The castle as one project at a time, priced by member with a floor of five (MM-9), and as the long home for late gold (MM-22).
- Arena opponents as saved setups and house teams, never live players (MM-12). Two arenas, one evened and one that reads real gear (MM-13).
- The rule that every shared feature works while both players are asleep, with its count of 5 shared windows in 675 (MM-1). The world boss as one shared pool (MM-2). The cheap layer of chat, roster, presence and calendar.

**Verdict: merge, and the two candidates now agree.** A's designs with B's accounting. Change one thing in B's plan: land the side seam alone, before the climb, as a step that moves no number. And hold the cap numbers open until package 3 is settled, because that decides what a percent is worth. (JUDGMENT. The seam count is MEASURED. The budget's miss is MEASURED)

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

### 2.10 Luck and Inner Flame

Tyler floated the idea on 2026-11-21: move Luck to Inner Flame, fed by burning creature remains at the hearth. B's first draft removed Inner Flame. B now has section 2b, which recommends the idea. It is marked as under evaluation.

| | A, the existing overhaul | B, section 2b |
|---|---|---|
| Inner Flame | A fifth combat skill for each hero. Regen on a curve. Trained by burning bones and fuels by a loot rule. Lost on death. Its stretch past level 100 is open with no owner | One flame for the account. It is Luck and nothing else. No regen |
| Luck | One bar for the account that only fills. Two feeds: Lucky Rivets from salvaged gear, and bestiary stages. Each percent costs more. A Lucky ring adds a little for one hero | Two parts. Flame Level is permanent, rises to 99 with everything ever burned, and is the room. Height is fuel, and burns down only while the company hunts |
| What it moves | The chance of a Rare. A written list of things it never moves, and a floor on how often the rarest piece can come | The chance of a Rare, and the chance a Trait rolls at rank 2 or 3. Never which Trait |
| Can it be bought | No. Rivets and the bar are bound to the account. "Nothing sells the bar" | Yes, through gold. Remains trade |
| A dry run | Nothing | The flame warms a little on a long run with no Rare, up to a small cap |

(EVIDENCE: `05-progression.md` section 2.8, `03-items-and-crafting.md` section 2.11, `src/data/hearth.js`, B's section 2b)

**Is B's version stronger? Yes. It is the best of the three texts, and it gives up one thing A had.** (JUDGMENT. Nothing about drops is measured in either candidate, because no reader exists for rares)

**What it does better than A.**
- Two systems become one, and each gets the reason the other lacked. A's Inner Flame drew 16 hero-hours from 15 heroes while mining drew 769, and its reward is regen that nobody sees. A's Luck is a good formula fed by a strange item. Burning what you killed to get luckier is one sentence a player can repeat. (EVIDENCE, `calibration/c4.json`)
- It adds a decision A's bar never had. "Tonight we chase drops" is a different plan from "tonight we level".
- Remains become a three-way choice of burn, sell or craft, which removes goods every hunted hour.
- The stoke rule lives in the plan and is set once. Most of the server side is built.
- It meets the three conditions the first issue of this file set: one flame for the account with falling returns, a lift to chance that never picks the Trait, and one feed.

**Where it is weaker than A, or untested.**
1. **Gold now buys luck.** A bound its Luck items to the account and ruled that the store may not sell a drop boost (row CE-3). In B remains trade, so gold buys a full flame, and Crowns sold for gold reach it. B names this and leaves it to the owner. It is the largest change in what paying can buy that either candidate holds.
2. **It is upkeep.** A's bar only filled. A flame that burns down asks for feeding for ever. If a full flame is always worth it, that is a tax and the "choice" is a chore. B says so and asks for a played week. With remains on a market the price will float to whatever the luck is worth, so this cannot be settled in a simulator alone.
3. **It reaches into the roll.** Raising the chance of rank 2 or 3 is a small step past "chance only". It is safe only while rank stays a small range, as package 2 says it is.
4. **It lost A's guard rails.** A listed what Luck never moves, such as keys, hall prizes and coin, and set a floor on how fast the rarest piece can come at any Luck. B has neither line.
5. **The dry-run warmth makes rare drops a little scheduled.** B asks whether it is wanted. I would start without it. One system doing three things is how layers come back.
6. **Personal loot with one shared flame** means four seats roll on the same luck. That is the right way round. It has not been sized with drop rates set for each hero.

**What survives from A.** The curve where each percent costs more. The list of what Luck never moves. The floor on the rarest drops. Fuels as data rows, named fuels and the colored fire. The question A fought over, whether a death takes flame progress, goes away, because an account's flame is not a hero's skill. B should say that in one line.

**Verdict: take B's section 2b, with A's guard rails put back and the dry-run warmth held out of the first sample.** Whether luck may be bought with gold is Tyler's question and should be asked before the flame is sized. (JUDGMENT)

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
| | The Luck curve: one account total, each percent costs more | A | Carried into the flame |
| | Arenas and the full castle, in the design, the economy and the power budget now, built later | A's designs, B's accounting | Confirmed requirement of 2026-11-21. Both now account for them |
| | The list of what Luck never moves, and the floor on the rarest drops | A | B's flame dropped both |
| | A Talent plan that spends points with no press, and a reset for gold | A | B takes both into evolutions |
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
| | Luck and Inner Flame become one flame for the account, fed by remains | Tyler's idea, B's section 2b | Section 2.10 |
| | A build choice every five Levels on stat tracks becomes move evolutions with a point every Level | Tyler's requirement, B's section 1b | Section 2.1. The rank between branches needs a second look |
| | A side on every unit, landed alone before the climb | B, re-ordered | Arenas need it, and a replay can prove it only if nothing else moves |
| | Typed prices are regenerated from the wage | Both | 7 to 12 times off today |
| | The buff caps and the power ceiling are re-sized once power can be felt | A's rows, B's frame | The book said 1.72 and the run read 1.29 to 1.48 |
| **Remove** | Talents as stat lines | B | Measured as unfelt. The build choice is kept as evolutions |
| | Inner Flame as a regen skill for each hero, the Luck bar by hours, Lucky Rivets | B | Folded into the flame |
| | Stacked small percents: special attributes, glyphs, room perks, bestiary damage | B | Each is a few percent nobody can feel |
| | Dead and doubled numbers in the rule code | Registry | Named one by one in its section 3 |
| | Per-ground fits and tier overrides | Both | The formula-layer rule |
| | A hall decided by health and a clock | Both | Withdrawn by A's designer already |
| | Companions in combat | B | No evidence either way. Tyler's call |
| | The rule that nothing planned is cut | Audit | It blocked the purpose test |

## 4. The departures in B that most need Tyler's eye

B's own list had six. The refresh closed three of them: Talents are kept, Inner Flame is kept as Luck, and arenas and the castle stay. Each closed one left a smaller question behind, and those are rows 2, 3 and 6. Rows 7 on are mine. Each line says what the evidence does and does not show.

| # | Departure | What the evidence shows | What it does not |
|---|---|---|---|
| 1 | The four heroes arrive at about Level 5, not on the first screen | A's path after D-1 already forms the party at Level 5. The true change is hiding three empty slots and granting recruits their Levels | Whether a stranger wants four slots in view. No blind play exists |
| 2 | Talents become move evolutions, with a point every Level | Stat lines cannot be felt (MEASURED). Rules that change a seat decided who lived on the edge: 0 deaths against 12 | That the rank between branches is more than a stat line. With "spend as suggested" on, the every-Level choice becomes about three branch picks a move |
| 3 | Inner Flame becomes Luck, fed by remains that trade | The old skill was barely trained (16 hero-hours). The burn and the colored fire are built | Whether luck should be buyable with gold. A bound it to the account on purpose. Also whether a flame that burns down reads as a choice or as upkeep |
| 4 | Trades owned by the account | Town hours are large (1.57 to 1, 15 heroes) | That players want them merged. It also cuts the trade grind by up to three quarters |
| 5 | Free Setup slots | The first principle, and a played hour where setup was the slowest part | Nothing against it. It reverses an answer given at a sitting, so it is his to re-give |
| 6 | Arenas and the castle are kept, with the engine seam in wave 1 and budgets reserved | The engine cannot run heroes against heroes today (93 places, MEASURED). A's cap numbers measured wrong | How big the reserved slices are. Whether the seam should ride in the same batch as the climb. I say it should not |
| 7 | Companions out of combat | Nothing. The simulator carries no companion | Everything. This is pure judgment |
| 8 | "Solo" means one player with a company | Nothing | B's pay rule makes a lone hero worse the better the party rule works. Neither candidate has a lone-hero target |
| 9 | Death leaves the default game | The cliff makes today's deaths arbitrary (MEASURED) | Whether a game where most players never die keeps its tone, or its Blessing sink |
| 10 | The stamina bar is kept as "the hunting day" with no fresh argument | Nothing either way | Whether a cap on hunted hours is right for an idle game. It is also what Premium sells, so it is his |
| 11 | Factions paused. Bestiary damage, room perks, charms and glyphs cut. The bestiary pays knowledge and a trophy only | They are small percents today | Whether they would be felt once power is felt as depth, and whether a kill count needs a reward at its end |
| 12 | Store supplies cut to basics | Best runes paid for themselves (one playtest) | That a market exists to replace the store at today's population |
| 13 | The first build is paused and no dates are given | B's stages are sound in order | How long. A had about 15 lanes aimed at the end of December. B has seven waves, four approvals and no estimate |
| 14 | The existing monster classes, weapon weakness, the spell list and the five rune versions of each spell are not mentioned | They exist in data | Whether B keeps, merges or replaces them. Ranks and rune versions are two ladders on one move |
| 15 | The count of things that change one move | Rank, three branch marks, a Trait, a Signature, an imbuement and the stance, each argued alone | Whether a player can read the sum. Nobody has counted them together |

## 5. What neither candidate answers yet

1. **What a lone hero is for, in numbers.** A dropped solo targets. B redefined solo. The reset asks what makes solo play worthwhile.
2. **The power step.** B names it as the unit of everything and leaves it to a file that has not landed. A never had one.
3. **A model of gold.** Faucets and sinks for an account, with a wage. Both candidates say it is needed. Neither has it, and the simulator cannot play 23 of the 26 economy levers.
4. **How Traits, single-piece listings and Crowns sold for gold meet.** It decides what paying buys. It is Tyler's area and neither design sizes it.
5. **Whether there should be a cap on hunted hours at all,** and how long a day is. Every time number in both designs rests on it.
6. **Server cost for an account under B.** Pulls on readiness, climbing parties and a row for each Trait piece, against the monthly budget that still binds.
7. **Population.** Both assume shards, a market and hired heroes. A handful of accounts play today. Neither says what the game is with 30 players.
8. **What breaks the sameness of formula depth** between hand-made regions and past the last hand-made branch. B now answers Level 200 itself with a final form.
9. **What happens to the first-build code already merged on the set** and to the staged migrations 1036 to 1045. The audit raised it. Neither design owns it.
10. **Whether skill loss on death, and death itself, still earn their place** once a party falls back first.
11. **An arena that fits automated combat, and the size of shared buffs once power is felt.** A has rows and a budget that measured wrong. B has reserved slices with no number.
13. **Whether luck may be bought.** Remains that trade make it so. It is a money question and it is Tyler's.
14. **What a drop reader says.** Nothing reads rare drops or Luck today, so no version of Luck, old or new, has ever been tested.
12. **How true the evidence is.** The replay of chapter 12 on the fixed engine is still owed, and both candidates lean on the numbers it will move.

## 6. What I did not check

- I ran no simulation and played no build. Every MEASURED line is quoted from the run named beside it.
- The math strategy had not landed, so nothing here judges it.
- Chapters 01 to 11 of A were read through their decision rows, chapter 00, chapter 12, the build plan and the four designer ruling files, and not line by line.
- Which of chapter 12's numbers move on the fixed engine is not established.
- The claims that a mechanic "already exists" come from reading `src/data` on this branch. I did not play them.
- B was judged as it stands on the set at 604fc9386. Packages 3, 4, 5, 8 and 9 did not change in the refresh and were not judged again.
- Sections 1b, 2b and 7b of B were read in full. None has a run, a played sample or a number that is not marked as a hypothesis.
- Cost sizes are not compared, because B gives letter sizes and A gives lanes, and neither gives days.
