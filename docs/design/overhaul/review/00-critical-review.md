# The overhaul: a critical review

Written 2026-11-21 on `lane/d-critical-review-main`, on `set/v0.2.144` at 730ff5ac1, after the fold of Tyler's picks. The reviewer wrote none of the overhaul. No game code, data or migration was changed. The balance framework has its own audit, `F-framework-audit.md`, in this folder.

Labels. MEASURED is a run on the real engine or a count from a file, with its source. COMPUTED is arithmetic on named inputs. JUDGMENT is a design opinion. UNKNOWN means nobody knows.

## 0. One screen

**Are we making the right decisions?** Partly. The foundations are right. Too much on top of them is called decided, and now ruled, when it is an untested plan.

**Has the whole ecosystem been understood and validated?** Understood on paper: mostly. Validated: no.

COUNTED from `decisions/all.json` after the fold, 155 rows:

| What | Rows |
|---|---|
| Carry any real-engine measurement or played evidence | 34 |
| Carry none | 121 |
| Call themselves a hypothesis | 52 |
| Of those, carry the status DECIDED or RULED | 51 |
| Rows for the MMO layer (clans, world bosses, events, arenas, Crowns) | 49 |
| Of those, carry a measurement | 1 |
| Now stamped "RULED (Tyler, 2026-11-21)" | 43 |

The framework audit adds the other half. Of about 55 mechanics that move the game, about 20 run for real in a simulated cell, 12 are pinned or approximated, and 23 are absent. The absent ones include buffs, most perks, Blessings, the market, town work, crafting, the Tower, halls and the whole MMO layer. The tool is checked against one real hunt of 39 hero-hours.

**Solid.**
- The formula rule: one engine, numbers in data, no patch for one ground or weapon. It is your brief.
- Gear that grows in a straight line with Level. MEASURED to Level 5,000 on stand-in gear.
- The Level table as law, with XP derived from it.
- The small combat fixes that were measured inside what the tool can read (axes, weak sides, mana from Magic, heal prices).
- One plan, one Start and one return card for the account. It follows your first principle.

**Shaky.**
- Deadly and death. The two ruled numbers do not fit an idle game, and nothing has measured a death rate.
- Every gold number, price and sink. The tool reads a party's store bill at 1.87 times real, and no wage formula exists.
- The Crowns loop. Nobody has shown that a player with gold wants Crowns.
- Your approvals. 23 reversals were let stand in 25 seconds. Your picks contradict each other in seven places.
- The fold itself. It turned four of your "keep it" answers into new designs you have not seen.

**Should stop or wait.**
- Sizing rewards, seasons and tickets for two arenas before one test shows heroes can fight heroes.
- Castle buildings, the clan board, boss gear lines and bought boosts as first-build work.
- Calling any tier, death, buff or price number decided before the tool is fixed.

The honest summary. About a third of this is a sound base and worth building. About half is a reasonable plan that has not been tested and should say so. The MMO layer is a design document, not a decision.

## Read log

| Source | How much | Note |
|---|---|---|
| The request, the common brief, the part brief, the list of earlier audit failures | Whole | |
| The rulings of record | Whole, 519 lines | Private. Cited by date only |
| The picks of 2026-11-21 from the Rulings page | All 67, with option text and times | Earlier picks read through the rulings file |
| `00-the-game.md` | Whole before the fold. After the fold: the changed lines I cite | |
| `01-core-and-combat.md` | Whole, before the fold | |
| `02-world.md` | The region table and the runway rows | Not whole |
| `03-items-and-crafting.md` | 2.1 to 2.4, 2.9, 2.14 to 2.16 | Not whole |
| `04-economy-and-crowns.md` | 2.2, 2.3, 2.6, 2.8 to 2.10 | Not whole |
| `05-progression.md` | 2.1 to 2.7, 2.16 | Not whole |
| `06-mmo-layer.md` | Sections 1 and 2 | Sections 3 to 8 not read |
| `07-home-and-town.md` | 2.10, 2.11 | Not whole |
| `08-player-experience.md` | 2.1 to 2.4 | Not whole |
| `09-platform-and-measurement.md` | 2.2 opening, 2.3.5, 2.4 to 2.6 | Not whole |
| `decisions/all.json` | Every row read by script for status and evidence, before and after the fold. About 30 rows read in full | |
| `decisions/review.md`, `F-framework-audit.md` | Whole | Both read after my own view was formed |
| `61-review-audit.md` | Sections 1, 3, 4, 6 | |
| `31-plan-audit.md`, `60-game-review.md`, the `ruled` list in 62 | Not read | I used section 3 of `00` for the ruled list |
| Code | Searches only | `src`, `supabase`, `tools/balance-program` |

I read about 45% of the book's lines. I did not re-read the chapters after the fold. I checked the fold through the decision file and searches. A claim about a chapter I did not read whole rests on the parts listed.

## 1. What you actually approved

### 1.1 How thin the approvals are

MEASURED from the page's own timestamps.

| Sitting | Items | Time | What it held |
|---|---|---|---|
| Morning | 10 | 3 min 16 s | The gear curve got 58 seconds. The kill reward got 4. The Level table got 2 |
| Afternoon | 57 | 5 min 47 s | 16 money calls, a grant, 23 reversals, 16 cuts, one plan step |
| The 23 reversals alone | 23 | 25 s | Every one "let it stand". About one second each |

You also said that day that you had no idea how to answer most of these. So a pick is real, and it is not informed consent. The book now prints 43 rows as "RULED (Tyler)". JUDGMENT: that word is too strong for a one-second answer. A later reader will treat those rows as closed.

### 1.2 Your own picks that contradict each other

| # | The conflict | State |
|---|---|---|
| 1 | Keep on-call heroes, and let "no on-call heroes" stand | OPEN on the page |
| 2 | Keep the party finder and Local chat, and let their removal stand | OPEN on the page |
| 3 | Keep priced setup slots, and let free slots stand | OPEN on the page |
| 4 | Keep a clan library and Level XP room, against your ruling that clans give no Level XP | OPEN on the page |
| 5 | Capped death in the morning, then the Blessing ladder let stand in the afternoon | OPEN on the page |
| 6 | Keep the castle's old parts, and let the simple per-member castle stand | **Not on the page.** The fold built both. See 1.3 row 2 |
| 7 | Yes to "a ceiling written in numbers. Nobody passes it" (MM-28), then no to the gear ceiling (MM-32) | **Not on the page.** Both rows now read RULED |

### 1.3 Changes that bend a ruling, or are new, and were never put to you

These are the headline. None is on the list of 23.

| # | The change | What it bends | Your yes |
|---|---|---|---|
| 1 | **The rested bank now pays.** +50% Level XP on up to 24 missed hunted hours. You kept a thing that was described to you as "moving no number" | A new XP catch-up system. Nothing like it is ruled | Silent. Made in the fold, unplayed |
| 2 | **The castle is now five buildings of ten levels, with labor, upkeep that switches buffs off, votes and a treasury.** About a year to finish. Its row reads "RULED (Tyler)" | Your "keep it" was one word on a cut list. The design is the integrator's | Silent. Made in the fold |
| 3 | Farm soil tiers became an account upgrade. 103 unused monster rows became a pool for later regions | Same pattern, smaller | Silent. Made in the fold |
| 4 | After your two "no" answers, five money rows were re-written (MM-28, MM-31, MM-33, MM-36, PREM-2): no opening gold price, the cap as a count of Crowns | Money calls are yours | Silent |
| 5 | **Premium "makes timed buffs last a quarter longer"** in five places, each tagged RULED (Tyler). The option you picked says it does not | Your pick on MM-21 | No. The book states the opposite of your answer |
| 6 | GR-25 approves five built special rules "never put to Tyler" (gentle first grounds, the boss blow cap, three training bases, the roll rule, the tier flag) | The formula brief: a deliberate special rule needs your explicit approval | Silent |
| 7 | "If one hero falls, all come home" is the default (chapter 08). It cites the 2026-10-22 default | 27-1 as amended 2026-11-21: for an account's own heroes the default is off | Silent |
| 8 | "Holding a tier" needs net gold over zero, and the pace seat is the tier a party "holds". So profit helps set the Level clock | 2026-11-13: profit is reported, never used to tune | Silent |
| 9 | Party XP by size alone retires your 2026-10-31 rule (party XP is better only with different classes) | 2026-10-31 | Thin yes. See below |
| 10 | The book's first paragraph still says "Harder tiers ask for a real party with a tank and a healer" and "one ceiling that a player who never pays can also reach" | Your GR-3 and MM-32 picks | Stale |

**On row 9.** The Coordinator asked whether your GR-3 pick covers this. It does, in words. The option you chose reads "pay party XP by size alone". It also matches your 2026-11-16 ruling of one flat formula by size. But you gave it 42 seconds, and nobody told you it ends the classes rule. It belongs on the reversal list.

**Why rows 5 and 10 matter.** The next round is told to work only from the book. The fold fixed two stale chapter lines I had found (factions, next ground). It left these. I found them without reading every chapter whole, so there are more.

### 1.4 The listed reversals that deserve a real read

All were let stand in 25 seconds. These change something a player feels or the economy runs on. Each is discussed in section 7.

| Id | What changes | Why it needs a real yes |
|---|---|---|
| GR-7 | A Blessing ladder past the third Blessing | It undoes most of the "no cap" you chose twice. Conflict 5 |
| GR-4 | Gear bands as a fixed +17% step, not two a region | It re-times every upgrade past Level 110 |
| GR-8 | Hallmark, Tempering and lining prices as a share of a band's gold | You kept the typed prices on 2026-11-18 on purpose |
| GR-6, 6a, 6b | Level 100 at 494 hours, Krell on day 31, staged content ends day 116 | Three of your numbers move |
| GR-54 | The yard's rate follows the skill curve | You kept the flat rate three times |
| GR-55 | The market opens on day one | It removes the town's first shared goal |
| MM-9 | The castle priced by member | You declined this exact option once |
| MM-18, GR-69 | No on-call heroes, no party finder, no Local chat | They remove ways players meet. Conflicts 1 and 2 |
| CE-7 | Town work is written at the start, each paid hour and the stop | Sound, and still a change to what you ruled |

## 2. Math is not design

Each row splits one big recommendation. The last column is what no formula can answer.

| Recommendation | MEASURED | COMPUTED | JUDGMENT | Only play can say |
|---|---|---|---|---|
| Gear grows in a straight line with Level | Pace holds to Level 5,000 on stand-in gear | Band edges at +17% | That +17% is the right size | Whether a +5% band is felt as an upgrade |
| Plate sits at the 60% armor cap from Level 110 on | Nothing | The cap holds to Level 5,000 | "So the need for a healer is constant by design" | Whether armor that only keeps you level feels like loot |
| The Level law | A four's XP rate, on one real party, within about 10% | Day 31, day 116, day 373 | That Levels 1 to 50 keep the old timing | Whether the jump at Level 50, from 1.9 to 6.2 hours a Level, reads as a wall |
| Deadly is the best way for a four to level | No death rate anywhere | The pay-off tables, on an assumed death count | That 50 to 100 deaths in 1,000 hours is a good struggle | Whether anyone presses Deadly, and whether a death on the morning card makes them quit |
| Every price in hours of your own hunting | The coin knob moves gold and nothing else | Nothing. The wage formula is not written | "The one price a player can reason about" | Whether a game where nothing ever gets cheaper still feels like getting richer |
| Sinks cost 1.2 to 1.4 times a band's gold | Nothing | Shares on a trial curve | That this forces interesting choices | Whether players choose differently, or all fill the same track |
| The paid edge: 1.22 from paying, 1.65 with every cap | Nothing. No cell has ever held a buff | A product of three targets | "Real, not broken" | Whether it is felt, and whether it is resented |
| A world boss as one shared pool | Nothing | Fall time of 36 to 60 hours by formula | That a shared health bar feels like fighting together | Whether anyone spends stamina on it |
| Clan buildings that pay standing buffs | Nothing | Stage times | That a weekly gift for +5% damage is a clan and not a tax | Whether clans form around it |
| The rested bank at +50% | Nothing | Nothing | "A way back, never a way ahead" | Whether it teaches players to skip days |

**The pattern.** The overhaul is strongest where a formula keeps something level for ever: gear, monsters, heals, prices. It is weakest at the question you asked: is the feature good. "It scales to Level 5,000" was used several times where the open question is whether it is fun at Level 20.

**Two examples to keep.**
- The book computes that plate armor sits at the cap from Level 110 on, and presents that as a strength. It also means a plate hero's new armor never makes it tougher. It only stops it falling behind. Your ruling says an armor step is 3 to 5% less damage. Nobody checked the two against each other.
- The ceiling of 1.65 assumes damage times damage times XP gives pace. The framework audit found a ground where kills are set by respawn, so a damage buff buys nothing there. Where a buff lets a party hold a higher tier, the gain is a step and the ceiling is too low. Nobody knows which is common.

## 3. Missing interactions

### 3.1 The joins

| Join | What it touches | What was tested | What is unknown |
|---|---|---|---|
| **Four heroes from the start** | The first hour, the 5.5M gold the slots used to take, server cost times four, thirteen skills over four heroes, one purse, main-hero identity, clans | MEASURED on the simulator: a new four holds the first party ground, 4 seeds of 8 hours, 0 deaths. PLAYED twice: minutes 0 to 17, with one hero | The simulated hero has never died on Normal. Real new players died 7 times in 78 hours. Minutes 17 to 60 were never played. No real account has played this opening |
| **Party XP and your GR-3 pick** | The classes XP table, "one job for each seat", the cast break, shooters first, the pre-filled healer, the pace seat, the Level law | MEASURED, 2 seeds of 1 hour, direction only: the dial separates healer from no healer. It does not separate shield from hammer at Level 110, because both sit at the armor cap | With XP by size alone and no lineup test, what makes preparing a party a decision |
| **Deadly, deaths and Blessings** | The Level clock, the idle promise, two visits a day, Blessing prices, the world boss room | The simulator saw no deaths in all but three Deadly cells. One real four died once in 449 party-hours. A dead simulated hero stands up at once: the framework audit's probe died 59 times in an hour and stayed the same Level. No cell holds a Blessing | The real death rate at any dial. See 3.2 |
| **The gear curve, the market, Crowns and MM-32** | Level gates on gear, Tempering, Hallmarks, linings, boss pieces, the Open Arena, four heroes on one purse | Nothing. No market is in any tool. The Crowns book does not exist. The simulated kit does not wear uniques from Level 110 to 185 | What a payer really reaches. Gear is worn by Level, so a payer cannot wear a higher band. Inside a band, a payer with double the gold can finish every sink while a free player is designed to afford 70 to 80%. With no opening price and no gold target, the size of the edge is whatever the market gives |
| **Clans, world bosses and arenas** | Buff caps, Deadly sizing, the Level clock, the next region's opening day, gold sinks, Crown demand, content (13 boss weekends a year, a gear line each) | One row has a computed check. MEASURED by search: no arena, world boss or Crown exchange code exists | Whether heroes can fight heroes in the engine. What 20 to 30 playtesters make of features sized for 1,000 |
| **Town work in closed form and the server budget** | 48 rested hero-hours a day, the yard as the keystone sink, the "real time" ruling, castle labor (new in the fold) | MEASURED: saving a closed hunt every 100 seconds or every 20 minutes gives the same result on four fixtures. The 109 database-seconds saved is ESTIMATED | No fixture for a town hour. No load test. Drawing working heroes in town is not costed. Town work is in no cell, and real players spent 1.57 times as long on it as on hunting |
| **The first hour** | Weapon pick, three recruits, one Start, the first party, the rest plan, farming, the first home | The data walk-through is done and honest. Three recruits together in the Cellar were MEASURED at 0.53 of one alone, and the design was changed | The changed design is not built and not played |

### 3.2 The largest hole: nobody counted the hours a death costs an idle party

Two of your rulings from 2026-11-21:
- A death costs 6% of all Level XP, with no cap.
- A mid-geared four on Deadly dies 50 to 100 times in 1,000 hours.

The book checked these against XP only, and added the Blessing ladder so the XP works out. It did not count hunting time lost.

COMPUTED by me. Inputs: the death band above, read per party-hour. A death ends that hero's hunt. No hunt starts by itself. The book's default that all four come home.

| Stamina bar | Away sessions that end early | Hunting time lost |
|---|---|---|
| 8 hours, free | 33 to 55% | 18 to 31% |
| 12 hours, Premium | 45 to 70% | 25 to 42% |

That is before the 6%. If instead the other three hunt on, they do it without their tank or their healer. If the band is meant per hero-hour, it is worse. Premium, sold as one saved visit a day, loses the most.

So the tier that is meant to be the best way to level breaks "close the game and come back in 8 hours". The simulator cannot see it, because its dead hero stands up at once.

This is not a tuning detail. It decides whether Deadly is for idle players or only for watching players. It needs your decision, with these numbers in front of you.

### 3.3 Other joins nobody closed

- **One tier table against a flat death count.** MEASURED in the decision's own evidence: at Level 60 Deadly bites at 2.66 times Normal. At Level 110 it needs about 3.3. The fix is promised by a step that is not built.
- **Buffs against Deadly.** Deadly is sized on a plain four. A fully buffed four is about 32% faster and takes 10% less. The players most likely to hunt Deadly are the ones it is not sized for.
- **Buffs against the content runway.** The fastest seat needs the next region open on about day 55. Nobody has said who draws a region or how long it takes.
- **Crown demand.** Boosts were moved from Crowns to gold. Premium is "weak on purpose". All four heroes are free. What is left for a player with gold to want Crowns for is Premium and looks. The whole money model rests on that one trade.
- **The yard against town work, and now castle labor.** All three use the same 12 rested hours.
- **The rested bank against two visits a day and Premium.** A free player who visits once now gets half of the missed hours back. That is part of what Premium sells.
- **Skill against gear.** COMPUTED in chapter 01: skill is 40% of a hit at Level 110 and 14% at Level 1,000. Uncapped skills are part of the game's identity, and training items are sold.

## 4. Scope

**Is the overhaul improving the core or spreading?** Both. JUDGMENT: about half the decisions improve the core loop. The other half designs systems that do not exist.

MEASURED by search of `src` and `supabase`: there is no arena code, no world boss system and no Crown exchange. The book also lists 101 items as still missing, 22 designs with no call id, and 18 new knobs. The fold added four more designs in an afternoon.

Your direction is clear and I am not arguing with it: heavy work on clans, world bosses and events, two arenas, rewards that are buffs and gear. What is not yours yet is the shape and size of each.

**The minimum cohesive game for the first build.** JUDGMENT.

1. Four heroes in the first hour, with one plan, one Start and one return card.
2. The hunt report with the free risk reading.
3. The formula steps that move no number.
4. Harder tiers that really bite, sized on a fixed tool, with the question in 3.2 settled first.
5. The gear curve to tier 7, and one band past Krell as a played sample.
6. The kill reward and the Level law, in that order.
7. Town work in closed form, because the server budget needs it.
8. The market, with prices redone only where four heroes break them.
9. The cheap social layer: presence, Global chat, clan roster, chat and browser, the calendar with the Hearthrise weekend.
10. One world boss as a sample of one. It is an ordinary four in an ordinary room plus one shared number.

**What should wait.** Nothing here is cut. Each stays planned.

| Wait | Until |
|---|---|
| Both arenas, their seasons, tickets and gear line | The one-day engine test shows heroes can fight heroes |
| Castle buildings, upkeep, labor, votes, the clan board | Clans exist and people are in them |
| Boss gear lines past the first, boss materials, the fall bonus | The first boss has stood twice |
| Bought boosts and the buff caps as final numbers | Deadly is sized, and one buff has been played in a cell |
| The Crowns book as a priced design | Test Crowns have run in the playtest |
| The Blessing ladder | A real death rate exists |
| The rested bank as a paying system | You have seen it. It is new |
| The sixteen Necrotic and Storm spells, fists, status pairs, Kindlings | The eight weapon ways are distinct and Deadly is sized. The book already says this |
| The Catacombs mode beyond one wing, the Hall of Firsts, the Honors catalogue | The first build is played |
| Sinks as a share of band gold, and the yard rate change | The wage can be measured. Until then your typed prices are no worse |

**What to merge.** The book merged the saved kit with the Setup, and the Hearthrise with the world weekend. Both are right.

## 5. The balance framework

The full audit is [`F-framework-audit.md`](F-framework-audit.md). It answers your point 5 and I did not redo it.

What it means for trusting the decisions. The tool is honest and narrow. It can prove that a change moves no number, show which bands a change moves, and read a four's Level pace to about 10% on one real party. It cannot support any gold, survival or death number, anything about a new player, anything past Level 185 beyond shape, or anything about buffs, the market, town work or the MMO layer. The full matrix of 4,338 cells has never been run. The audit lists about 60 of the 155 calls as resting on what the tool lacks. I agree with that list and add about 20 more that rest on design nobody has played.

## 6. Decided or provisional

I re-sorted the 155 rows. This is my sort by evidence and ruling, not a row-by-row re-derivation. A row can sit in two groups, so the counts are approximate.

| Group | Rows | The rule I used |
|---|---|---|
| **SOUND** | about 45 | Builds a ruling without changing it, or is a no-number formula step, or is a small change measured inside what the tool can read, or is a plain "we will not build this" |
| **PROVISIONAL** | about 80 | The framework audit's five groups (about 60), plus rows that call themselves a hypothesis or rest on an unbuilt system |
| **Reversal with a thin yes** | 20 | On the list, let stand in a second, not contradicted |
| **OPEN** | 4 rows, 5 items | The page's Clear-up list |
| **UNAPPROVED** | about 12 | Section 1.3 rows 1 to 8, and conflicts 6 and 7 |
| **WRONG** | 3 | Below |

**Wrong, and why.**
- **Premium and timed buffs.** Five places say the opposite of your pick and tag it as yours.
- **MM-28 beside MM-32.** "Nobody passes it" and "no designed gear ceiling" are both printed as ruled. One has to go.
- **The fall default in chapter 08.** It quotes a default you changed the same week.

**The important provisional rows, and what each waits on.**

| Row | Waits on |
|---|---|
| CORE-1, GR-27, GR-5: tier numbers and one tier table | A step that is not built, the death fault fixed, the death sample of 4 seeds by 8 hours |
| GR-7, MM-7: the Blessing ladder, a normal death in a boss room | A real death rate, and your answer to 3.2 |
| GR-6, 6a, 6b: the Level law's numbers | The kill reward and the tiers. The book says the seat's multiple "is not one number until then" |
| GR-4: the band size | One band played on the curve |
| GR-8, GR-51, GR-58, CE-4, CE-5, MM-22: every price and the first week's economy | The store-bill fault fixed, and a wage formula that exists |
| MM-24 to MM-26, MM-29 to MM-31: buff caps, boosts, the 1.65 reading | One buff played in a cell. The engine hook exists and no cell sets it |
| MM-2 to MM-6: the world boss | The hall check at three Levels, and one boss stood |
| MM-12 to MM-16, MM-38 to MM-40: both arenas | The engine test |
| MM-8 to MM-10: clan buffs, castle, board | Clans existing |
| MM-28 to MM-37: the Crowns engine | Test Crowns in a playtest. Security |
| GR-1, CE-7: closed-form town work | A town-hour fixture and a load test |
| GR-79, GR-80, C3: the first hour | Being built and played past minute 17, by real new players |
| GR-63, GR-74, GR-34, the kept parts of MM-9 | You seeing them at all |
| GR-16, GR-17, GR-20, GR-36 to GR-39, GR-61: spells, fists, perks, Catacombs, Kindlings | Deadly sized. Most are unimplemented |
| GR-88: the matrix as the release gate | The framework audit's fixes |

## 7. The 15 most consequential decisions

Ranked by how much each can change what Hearthrise is, how it plays, its economy or its build.

| # | The decision | My recommendation | Evidence | Unknown | Did you approve the direction |
|---|---|---|---|---|---|
| 1 | **Four heroes from the first hour.** The account, not the hero, is the player | Keep. Treat the first hour as unproven | MEASURED on the simulator only: the first party hunt is safe. PLAYED: only the one-hero opening | Whether a new player stays. What your own 2026-11-09 reasons for slow alts (main-hero identity, room for guilds) look like now | Yes, 2026-11-21, your own call |
| 2 | **Deadly, death and the idle promise.** 6% with no cap, 50 to 100 deaths in 1,000 hours, a ladder to soften it | Make provisional. Decide 3.2 first | No measured death rate. COMPUTED: 18 to 42% of hunting time lost on top of the XP | Whether an idle player can use Deadly at all | Partly. You ruled both numbers. The ladder is open |
| 3 | **The Crowns loop.** Crowns buy Premium and looks. Boosts sell for gold. No ceiling on gear, no opening price | Make provisional. Run test Crowns before pricing anything | None. JUDGMENT throughout | Whether players with gold want Crowns when Premium is weak and heroes are free | Yes to the model. The details got seconds. Five were re-written after your two "no" answers |
| 4 | **The MMO layer as designed.** 49 rows: boss pool, clan buffs, calendar, two arenas | Wait on most. Build the cheap social layer and one sample boss | 1 measurement in 49 rows. No code. No cell | Almost all of it | Yes to the direction. The shapes are not yours yet |
| 5 | **Rule 0 and the removals that follow.** Nothing needs two players at once. No on-call heroes, no finder, no Local chat | Make provisional. Your "keep" picks stand until a playtest says otherwise | MEASURED, thin: four testers overlapped in 5 of 675 ten-minute windows | Whether an MMO where nobody ever needs anybody feels like an MMO. You raised this yourself on 2026-11-21 | Yes to rule 0, in 14 seconds. The removals are open |
| 6 | **What makes a party a decision.** Your pick: no lineup test, XP by size alone | Follow your pick. Shrink the role machinery to a sample. Put the end of the classes rule on your list | MEASURED, direction only: the dial cannot make the shield matter at the armor cap | What replaces roles as the reason to prepare | Yes, thin, 42 seconds |
| 7 | **The gear curve.** Linear in Level, +17% bands for ever | Keep the line. Band size provisional. Check it against the armor cap | MEASURED for the line. One seed for the step size | Whether a band is felt. Whether plate upgrades mean anything past Level 110 | Thin. 58 seconds, then 1 second |
| 8 | **The Level law.** Your table is the law. The plain four is the clock | Keep the rule. Numbers provisional | COMPUTED on one party's XP rate. The clock leaves out events, buffs, deaths and the new rested bank | The seat's multiple. The wall at Level 50 | Partly. The table is yours. Three of its numbers move |
| 9 | **Prices in hours, sinks as a share of a band.** No typed price survives | Wait. Use it for new prices only | COMPUTED on a trial curve. Gold fails calibration. The wage formula is not written | Whether it kills the feeling of getting richer | Thin. You kept typed Hallmark prices on purpose on 2026-11-18 |
| 10 | **The formula architecture and its 28 steps.** One pipeline, one modifier table, every monster from one formula | Keep. Build the no-number steps first. Bring the five special rules to you | Identity proofs are exact. MEASURED by the census: registers name 24 of 149 functions that hold a typed number | How much rule code the plan has not seen | Yes, your brief |
| 11 | **The content runway.** A new region every 45 to 53 days, six grounds and two bosses each | Give it an owner and a timed sample before any launch date is printed | COMPUTED. No owner, no timing | Whether one studio can feed an uncapped game at 12 hours a day | Yes to 120 days at launch. The pace after it is unowned |
| 12 | **The buff caps and the power budget.** +15% damage, about 10% protection, +25% XP | Make provisional | COMPUTED only. No cell has held a buff | Whether the product holds. How buffs meet Deadly and the region door | The direction yes. The numbers are untested |
| 13 | **Town work in closed form.** Paid at the start, each hour and the stop | Keep. It is the only path to the server budget | ESTIMATED. One part measured | Exact parity with tick pay. Load at 1,000 accounts | Yes, thin |
| 14 | **The company plan and the fold's new systems.** One Start, one return card. Also the paying rested bank and the year-long castle | Keep the plan. Send the fold's new designs back as proposals | The plan follows your first principle. The new designs have no evidence | Everything about the new designs | The plan: yes. The new designs: no |
| 15 | **The matrix as the release gate** | Keep as a report. It gates nothing until its faults are fixed | The framework audit | Most of its 4,338 cells have never run | Yes, 23 seconds |

**What must be measured or played before each is called decided.**

| # | Before it is decided |
|---|---|
| 1 | A new account plays the four-hero opening on live with the kit written down. Then five strangers, talking aloud |
| 2 | The simulator follows the real death rule. Then the death sample at the raised dial. Then your answer on lost hours |
| 3 | Test Crowns in the playtest. Do over a fifth of accounts buy them with gold |
| 4, 5 | The engine test for arenas. One boss weekend. Clans by day 7. Whether playtest friends ask for what was removed |
| 6 | The lineup cells at the sized dial, with XP by size |
| 7 | One band played on the curve. One run of heavy, medium and light armor past Level 110 |
| 8 | The kill reward built, then the law fitted once |
| 9 | The store-bill fault fixed, a wage formula written, then checked against played gold |
| 10 | The census extended, so the registers are known to cover the rules |
| 11 | One region timed from sketch to shipped |
| 12 | One timed buff in a cell on three grounds. Then the buffed four against the plain four |
| 13 | A town-hour fixture and a synthetic load of 1,000 accounts |
| 14 | You reading the four new designs |
| 15 | The full matrix run once. A second real party |

## 8. What should happen next

Five steps, before any build plan.

1. **Fix the measuring tool first.** The death rule, the simulated kit's shopping, the seats. Run the full matrix once and put one buff in a cell. Until then no tier, death, Blessing, buff or gold number is called decided.
2. **One real sitting with you, ten questions at most.** The seven conflicts in 1.2, the lost-hours question in 3.2, the rested bank, and the end of the classes rule. Each with what it costs, not a recommended button.
3. **Play the first hour with four heroes.** By hand on a test account now. With strangers once it is built. It is the largest unplayed change in the book.
4. **Narrow the first build to section 4.** Mark the MMO rows as planned and waiting. Run the two cheap tests that size what waits: heroes against heroes in the engine, and one boss room at three Levels.
5. **Re-issue the book with three honest words: decided, provisional, open.** Keep "RULED" for what you ruled knowing what it was. Fix the lines in 1.3. Give the content runway an owner.

The overhaul is not wrong. It is early. Most of what it calls decided is a good plan waiting for a test.
