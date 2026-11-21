# The overhaul: a critical review

Written 2026-11-21 on `lane/d-critical-review-main`, from `set/v0.2.144`. The reviewer wrote none of the overhaul. No game code, data or migration was changed. The balance framework has its own audit in `F-framework-audit.md` in this folder.

Labels used here. MEASURED is a run on the real engine or a count from a file, with its source. COMPUTED is arithmetic on named inputs. JUDGMENT is a design opinion. UNKNOWN means nobody knows.

## 0. One screen

**Are we making the right decisions?** Partly. The foundations are right. Too much on top of them is called decided when it is a guess.

**Has the whole ecosystem been understood and validated?** Understood on paper: mostly. Validated: no. The book says so itself in chapter 09: "every band reports and none gates" until the measuring tool is fixed.

COUNTED from `decisions/all.json`, 155 rows:

| What | Rows |
|---|---|
| Carry any real-engine measurement or played evidence | 34 |
| Carry none | 121 |
| Call themselves a hypothesis | 51 |
| Of those, still carry the status DECIDED | 46 |
| Rows for the MMO layer (clans, world bosses, events, arenas) | 49 |
| Of those, carry a measurement | 1 |

What the tool can carry today, in the book's own words: a change that moves no number, and the Level pace of a party of four within about 10%. Survival, deaths, gold, anything about one hero alone, and everything past Level 185 are "direction only" or projected.

**Solid.**
- The formula rule: one engine, numbers in data, no patch for one ground or weapon. It is your brief.
- Gear that grows in a straight line with Level. MEASURED to Level 5,000 on stand-in gear.
- The Level table as law, with XP derived from it.
- The small combat fixes that were measured (axes, weak sides, mana from Magic, heal prices).
- The first party hunt for a new account. MEASURED: 0 deaths in 128 hero-hours.
- One plan, one Start and one return card for the account. It follows your first principle.

**Shaky.**
- Deadly and death. The two ruled numbers do not fit together, and nothing has measured a death rate.
- Every gold number. The tool reads a party's store bill at 1.7 to 2.2 times real.
- The Crowns loop. Nobody has shown that a player with gold wants Crowns.
- Your approvals. 23 reversals were let stand in 25 seconds. Six of your picks contradict each other.

**Should stop or wait.**
- Sizing rewards, seasons and tickets for two arenas before one test shows heroes can fight heroes.
- Castle rooms, the clan board, boss gear lines and bought boosts as first-build work.
- Calling any tier, death or price number decided before the tool is fixed.

The honest summary: about a third of this is a sound base and worth building. About half is a reasonable plan that has not been tested and should be labelled that way. The MMO layer is a design document, not a decision.

## Read log

| Source | How much | Note |
|---|---|---|
| The request, the common brief, the part brief, the list of earlier audit failures | Whole | |
| The rulings of record | Whole, 519 lines | Private. Cited by date only |
| The picks from the Rulings page of 2026-11-21 | All 79, with option text and times | Earlier picks read through the rulings file |
| `00-the-game.md` | Whole | |
| `01-core-and-combat.md` | Whole | |
| `02-world.md` | The region table and the runway rows only | Not whole |
| `03-items-and-crafting.md` | 2.1 to 2.4, 2.9, 2.14 to 2.16 | Not whole |
| `04-economy-and-crowns.md` | 2.2, 2.3, 2.6, 2.8 to 2.10 | Not whole |
| `05-progression.md` | 2.1 to 2.7, 2.16 | Not whole |
| `06-mmo-layer.md` | Sections 1 and 2 | Sections 3 to 8 not read |
| `07-home-and-town.md` | 2.10, 2.11 | Not whole |
| `08-player-experience.md` | 2.1 to 2.4 | Not whole |
| `09-platform-and-measurement.md` | 2.2 opening, 2.3.5, 2.4 to 2.6 | Not whole |
| `decisions/all.json` | Every row read by script for status and evidence. 20 rows read in full | |
| `decisions/review.md` | Whole | Read after my own view was formed |
| `61-review-audit.md` | Sections 1, 3, 4, 6 | |
| `31-plan-audit.md`, `60-game-review.md`, the `ruled` list in 62 | Not read | I used section 3 of `00` for the ruled list |
| Code | Searches only | `src`, `supabase`, `tools/balance-program` |

I read about 45% of the book's lines. A claim below about a chapter I did not read whole rests on the parts listed.

## 1. What you actually approved

### 1.1 How thin the approvals are

MEASURED from the page's own timestamps.

| Sitting | Items | Time | What it held |
|---|---|---|---|
| Morning | 10 | 3 min 16 s | The gear curve got 58 seconds. The kill reward got 4. The Level table got 2 |
| Afternoon | 57 | 5 min 47 s | 15 money calls, a grant, 23 reversals, 16 cuts, one plan step |
| The 23 reversals alone | 23 | 25 s | Every one "let it stand". About one second each |

You also said that day that you had no idea how to answer most of these. So "let it stand" is real, and it is not informed consent. I treat it as a thin yes.

### 1.2 Your own picks that contradict each other

Five are on the page as Clear up. I found two more that are not.

| # | The conflict | On the Clear-up list |
|---|---|---|
| 1 | Keep on-call heroes (cut 2), and let "no on-call heroes" stand (reversal 18) | Yes |
| 2 | Keep the party finder and Local chat (cuts 3, 4), and let their removal stand (reversal 21) | Yes |
| 3 | Keep priced setup slots (cut 14), and let free slots stand (reversal 13) | Yes |
| 4 | Keep a clan library and Level XP room (cut 6), against your ruling that clans give no Level XP | Yes |
| 5 | Capped death in the morning (GR-7 alternative), then the Blessing ladder let stand (reversal 1) | Yes |
| 6 | Keep the castle's labor, votes, upkeep, treasury and ten-level buildings (cut 5), and let the simple per-member castle stand (reversal 19). Both cannot be built | **No** |
| 7 | Yes to "one ceiling written in numbers" (MM-28), then no to the gear ceiling (MM-32) and no to the gold path (MM-34). The book's first paragraph still promises the ceiling | **No** |

### 1.3 Changes that bend a ruling and were never put to you

These are the headline. None is on the list of 23.

| # | The change | The ruling it bends | Your yes |
|---|---|---|---|
| 1 | GR-3 was decided as "Deadly must fail a party with no tank or no healer". You had picked the other option that morning: no lineup test, party XP by size alone | Your pick of 2026-11-21 | No. Decided against it. The fold is correcting it |
| 2 | GR-25 approves five built special rules "never put to Tyler" (gentle first grounds, the boss blow cap, three training bases, the roll rule, the tier flag) | The formula brief of 2026-11-21: a deliberate special rule needs your explicit approval | Silent |
| 3 | "If one hero falls, all come home" is the default (GR-80, chapter 08). The chapter cites the 2026-10-22 default | 27-1 as amended 2026-11-21: for an account's own heroes the default is off | Silent |
| 4 | Chapter 06 lets each hero pick its own faction, with one account on both sides. The decision file says the opposite | 25-10 of 2026-11-20: one faction for the account | Silent. The chapter is stale |
| 5 | Chapter 08 sends a party to the next ground by itself when a ground is outgrown. The decision file refuses this | 27-1: no hunt starts by itself | Silent. The chapter is stale |
| 6 | "Holding a tier" needs net gold over zero, and the pace seat is the tier a party "holds". So profit helps set the Level clock | 2026-11-13: profit is reported, never graded and never used to tune | Silent |
| 7 | Rune tiers continue past the fifth, one every 15 skill levels (GR-23) | 2026-10-23: five rune tiers | Silent. Small, and in the spirit of the ruling |
| 8 | Chapter 04 says Premium makes timed buffs last a quarter longer | Your pick on MM-21: it does not | Silent. Stale |

Rows 4, 5 and 8 matter more than they look. The next round is told to work only from the book. The book's own check says it did not re-read every paragraph. I found these three without reading every chapter whole, so there are more.

### 1.4 The listed reversals that deserve a real read

All 23 were let stand in 25 seconds. These nine change something a player feels or the economy runs on. Each is discussed in section 7.

| Id | What changes | Why it needs a real yes |
|---|---|---|
| GR-7 | A Blessing ladder past the third Blessing | It undoes most of the "no cap" you chose twice. Conflict 5 above |
| GR-4 | Gear bands as a fixed +17% step, not two a region | It re-times every upgrade past Level 110 |
| GR-8 | Hallmark, Tempering and lining prices as a share of a band's gold | You kept the typed prices on 2026-11-18 on purpose |
| GR-6, 6a, 6b | Level 100 at 494 hours, Krell on day 31, staged content ends day 116 | Three of your numbers move |
| GR-54 | The yard's rate follows the skill curve | You kept the flat rate three times |
| GR-55 | The market opens on day one | It removes the town's first shared goal |
| MM-9 | The castle priced by member | You declined this exact option once |
| MM-18, GR-69 | No on-call heroes, no party finder, no Local chat | Conflicts 1 and 2. They remove ways players meet |
| CE-7 | Town work is written at the start, each paid hour and the stop | Needed for the server budget. Sound, and still a change to what you ruled |

## 2. Math is not design

Each row splits one big recommendation. The last column is what no formula can answer.

| Recommendation | MEASURED | COMPUTED | JUDGMENT | Only play can say |
|---|---|---|---|---|
| Gear grows in a straight line with Level | Pace holds to Level 5,000 on stand-in gear | Band edges at +17% | That +17% is the right size | Whether a +5% band is felt as an upgrade at all |
| Plate sits at the 60% armor cap from Level 110 on | Nothing | The cap holds to Level 5,000 | "So the need for a healer is constant by design" | Whether new armor that only keeps you level feels like loot |
| The Level law | XP rates under Level 185 | Day 31, day 116, day 373 | That Levels 1 to 50 stay on the old timing | Whether the jump at Level 50, from 1.9 to 6.2 hours a Level, reads as a wall |
| Deadly is the best way for a four to level | No death rate anywhere | The pay-off tables, on an assumed death count | That 50 to 100 deaths in 1,000 hours is a good struggle | Whether anyone presses Deadly, and whether a death on the morning card makes them quit |
| The Blessing ladder | Nothing | "Deadly pays to Level 400" | Five hours as the right pain | The same |
| Every price in hours of your own hunting | The coin knob moves gold and nothing else | Nothing. The wage formula is unchecked | "The one price a player can reason about" | Whether a game where nothing ever gets cheaper still feels like getting richer |
| Sinks cost 1.2 to 1.4 times a band's gold | Nothing | Shares on a trial curve | That this forces interesting choices | Whether players choose differently, or all fill the same track |
| The paid edge: 1.22 from paying, 1.65 with every cap | Nothing | A product of three targets | "Real, not broken" | Whether it is felt, and whether it is resented. The book says this itself |
| A world boss as one shared pool | Nothing | Fall time of 36 to 60 hours by formula | That a shared health bar feels like fighting together | Whether anyone spends stamina on it |
| Clan rooms that pay standing buffs | Nothing | Stage times | That a weekly gift for +5% damage is a clan and not a tax | Whether clans form around it |
| One Rare reveal every 40 minutes for a four | Nothing | From six rows | That this is still a moment | Whether players look |

The pattern. The overhaul is strongest where a formula keeps something level for ever: gear, monsters, heals, prices. It is weakest at the question you asked: is the feature good. "It scales to Level 5,000" was used several times where the open question is whether it is fun at Level 20.

One example to keep. The book computes that plate armor sits at the cap from Level 110 to 5,000 and presents that as a strength. It also means a plate hero's new armor past Level 110 never makes it tougher. It only stops it falling behind. Your ruling says an armor step is 3 to 5% less damage. Nobody checked the two against each other.

## 3. Missing interactions

### 3.1 The joins

| Join | What it touches | What was tested | What is unknown |
|---|---|---|---|
| **Four heroes from the start** | The first hour, the 5.5M gold the slots used to take, server cost times four, thirteen skills over four heroes, one purse, "main character" identity, clans | MEASURED: a new four holds the first party ground, 4 seeds of 8 hours. PLAYED twice: minutes 0 to 17, with one hero | Minutes 17 to 60 were never played. One Start is not built. Whether a stranger stays. What replaces the slot goal in week one is a hypothesis |
| **Party XP and your GR-3 pick** | The class-mix XP table, the "one job for each seat" design, the cast break, shooters first, status pairs, the pre-filled healer, the pace seat, the Level law | MEASURED, 2 seeds of 1 hour, direction only: the dial separates healer from no healer. It does not separate shield from hammer at Level 110, because both sit at the armor cap | With XP by size alone, what makes preparing a party a decision. Section 2.10 of chapter 01 was built on the option you turned down |
| **Deadly, deaths and Blessings** | The Level clock, the idle promise, two visits a day, Blessing prices, the world boss room, the risk reading | The simulator saw no deaths in all but three Deadly cells. One real four died once in 449 party-hours. A dead simulated hero stands up at once | The real death rate at any dial. See 3.2 |
| **The gear curve, the market, Crowns and MM-32** | Level gates on gear, Tempering, Hallmarks, linings, boss pieces, the Open Arena, four heroes on one purse | Nothing. No market has run. The Crowns book does not exist. The kit builder does not wear uniques from Level 110 to 185 | What a payer can really reach. Gear is worn by Level, so "bands ahead" is impossible by structure. Inside a band a payer finishes every sink on four heroes while a free player is designed to afford 70 to 80% on one. Whether that is "way ahead" in play |
| **Clans, world bosses and arenas** | Buff caps, Deadly sizing, the Level clock, the next region's opening day, gold sinks, the Crowns loop, content (13 boss weekends a year, a gear line each) | One row has a computed check (mixed Levels). MEASURED by search: no arena, world boss or Crown exchange code exists | Whether heroes can fight heroes in the engine. What a town of 10 to 30 playtesters makes of features sized for 1,000 |
| **Town work in closed form and the server budget** | 48 rested hero-hours a day, the yard as the keystone sink, the "real time" ruling, Security | MEASURED: saving a closed hunt every 100 seconds or every 20 minutes gives the same result on four fixtures. The 109 database-seconds saved is ESTIMATED | No fixture for a town hour. No load test at 1,000 accounts. Drawing working heroes in town is not costed. Closed form must pay exactly what the tick pays, unproven |
| **The first hour** | Weapon pick, three recruits, one Start, the first party, the rest plan, farming, the first home | The data walk-through is done and honest. Three recruits together in the Cellar were MEASURED at 0.53 of one alone, and the design was fixed | The fixed design (three lone hunts on one Start) is not built and not played |

### 3.2 The largest hole: nobody counted the hours a death costs an idle party

Two of your rulings from 2026-11-21:
- A death costs 6% of all Level XP, with no cap.
- A mid-geared four on Deadly dies 50 to 100 times in 1,000 hours.

The book checked these against XP only, and added the Blessing ladder so the XP works out. It did not count hunting time lost.

COMPUTED by me. Inputs: the death band above, read per party-hour. An 8 hour free stamina bar. A death ends that hero's hunt. No hunt starts by itself. The book's default that all four come home.

- One death every 10 to 20 hours means an 8 hour away session ends early 33 to 55% of the time.
- The hours left on the bar are lost for all four heroes until the next visit.
- On average that is about 20 to 40% of a Deadly party's hunting time, before the 6%.

If instead the other three hunt on, they do it without their tank or their healer. Either way, the tier that is meant to be the best way to level breaks "close the game and come back in 8 hours". The simulator cannot see this, because its dead hero stands up at once.

This is not a tuning detail. It decides whether Deadly is something an idle player uses or something only a watching player uses. It needs your decision, with real numbers, not a one-second click.

### 3.3 Other joins nobody closed

- **One tier table against a flat death count.** MEASURED in the decision's own evidence: at Level 60 Deadly bites at 2.66 times Normal. At Level 110 it needs about 3.3. One dial does not bite the same at both Levels. The fix is promised by a later step that is not built.
- **Buffs against Deadly.** Deadly is sized on a plain four. A fully buffed four is about 32% faster and takes 10% less. So the players most likely to hunt Deadly are the ones it is not sized for.
- **Buffs against the content runway.** The fastest seat needs the next region open on about day 55 after launch. Nobody has said who draws a region or how long it takes.
- **Crown demand.** Boosts were moved from Crowns to gold. Premium is "weak on purpose". All four heroes are free. What is left for a player with gold to want Crowns for is Premium and looks. The whole money model rests on that one trade.
- **The yard against town work.** Both use the same 12 rested hours. The yard is called the sink that never ends, at a cost of 4,800 gold times skill level a day for four heroes. Whether anyone then gathers or crafts is unread.
- **Skill against gear.** COMPUTED in chapter 01: skill is 40% of a hit at Level 110 and 14% at Level 1,000. Uncapped skills are part of the game's identity, and training items are sold for gold and Crowns.

## 4. Scope

**Is the overhaul improving the core or spreading?** Both. JUDGMENT: about half the decisions improve the core loop. The other half designs systems that do not exist yet.

MEASURED by search of `src` and `supabase`: there is no arena code, no world boss system and no Crown exchange. Those are new builds from zero. The book also holds 101 items it lists as still missing, 22 designs with no call id, and 18 new knobs.

Your direction is clear and I am not arguing with it: heavy work on clans, world bosses and events, two arenas, rewards that are buffs and gear. What is not yours is the shape and the size of each. Those were decided by one lane in one day with one measurement.

**The minimum cohesive game for the first build.** JUDGMENT.

1. Four heroes in the first hour, with one plan, one Start and one return card.
2. The hunt report with the free risk reading.
3. The formula steps that move no number.
4. Harder tiers that really bite, sized on a fixed measuring tool, with the death question in 3.2 settled first.
5. The gear curve to tier 7, and one band past Krell as a played sample.
6. The kill reward and the Level law, in that order.
7. Town work in closed form, because the server budget needs it.
8. The market, with prices redone only where four heroes break them.
9. The cheap social layer: presence, Global chat, clan roster, clan chat and browser, the calendar with the Hearthrise weekend.
10. One world boss as a sample of one. It is an ordinary four in an ordinary room plus one shared number, so it is cheap to try.

**What should wait.** Nothing here is cut. Each is planned and stays planned.

| Wait | Until |
|---|---|
| Both arenas, their seasons, tickets and gear line | The one-day engine test shows heroes can fight heroes |
| Castle rooms that pay buffs, the weekly share, the clan board | Clans exist and people are in them |
| Boss gear lines past the first, boss materials, the fall bonus | The first boss has stood twice |
| Bought boosts and the buff caps as final numbers | Deadly is sized. Otherwise every boost re-sizes it |
| The Crowns book as a priced design | Test Crowns have run in the playtest |
| The Blessing ladder | A real death rate exists |
| The sixteen Necrotic and Storm spells, fists, status pairs, Kindlings | The eight weapon ways are distinct and Deadly is sized. The book already says this |
| The Catacombs mode beyond one wing, the Hall of Firsts, the Honors catalogue | The first build is played |
| Sinks as a share of band gold, and the yard rate change | The wage can be measured. Until then the ruled typed prices are no worse |

**What to merge.** The book already merged the saved kit with the Setup, and the Hearthrise with the world weekend. Both are right.

**One caution on "cut".** You kept eight of the sixteen cuts. Four of those keeps (unused monster rows, the rested bank, farm soil tiers, the castle's old parts) reverse decisions that are written into chapters as done. The fold has to carry them.

## 5. The balance framework

The full audit is `F-framework-audit.md` in this folder. It answers your point 5. I did not redo it.

What it means for trusting the decisions, from what I read myself. The book's own chapter 09 says the tool can carry two kinds of claim today: "this change moves no number", and a four's Level pace within about 10%. Every survival, death and gold reading is direction only, and Levels past 185 are projected. A first census of the rule code (MEASURED, `tools/balance-program/census.mjs`) found 1,454 rule functions, 149 holding a typed number, and 24 of those named by a formula register. So any decision that rests on survival, deaths, gold or "the registers cover the game" is provisional until the framework audit's fixes land.

## 6. Decided or provisional

I re-sorted the 155 rows by one rule each. This is my sort by evidence label and ruling, not a row-by-row re-derivation.

| Group | Rows | The rule I used |
|---|---|---|
| **SOUND** | about 45 | Builds a ruling without changing it, or is a no-number formula step, or is a measured small change, or is a plain "we will not build this" |
| **PROVISIONAL** | about 80 | Calls itself a hypothesis or a target, or rests on the unbuilt MMO layer, an unbuilt formula step, the gold reading, the survival reading, or Levels past 185 |
| **Reversal with a thin yes** | 20 | On the list of 23, let stand in a second, not contradicted |
| **UNAPPROVED or OPEN REVERSAL** | 9 | Four listed reversals your other picks contradict (GR-7, GR-56a, MM-18, GR-69). GR-3, decided against your pick. Four from table 1.3 (GR-25, the fall default in GR-80, the chapter text of GR-71 and GR-81) |
| **WRONG** | 3 | Below |

**Wrong, and why.**
- **GR-3 as written.** It asks Deadly to fail a four with a hammer in front. Its own measurement says the dial cannot do that once both wear plate at the cap. You also picked the other option.
- **The fall default in GR-80.** It quotes a default you changed the same week.
- **"One ceiling that a player who never pays can also reach"**, in the book's first paragraph and in MM-28. After your no on MM-32 and MM-34 that sentence promises something you declined to promise.

**The important provisional rows, and what each waits on.**

| Row | Waits on |
|---|---|
| CORE-1, GR-27, GR-5: the tier numbers and one tier table | A step that is not built, and the death sample of 4 seeds by 8 hours |
| GR-7 and MM-7: the Blessing ladder, and a normal death in a boss room | A real death rate. Your answer to 3.2 |
| GR-6, 6a, 6b: the Level law's numbers | The kill reward and the tiers. The book says the seat's multiple "is not one number until then" |
| GR-4: the band size | One band played on the curve |
| GR-8, GR-51, CE-4, CE-5: every price and the first week's economy | A wage that can be measured. The book calls its own sizes a hypothesis |
| MM-25, MM-26: buff caps and the 1.65 reading | Check A6 in chapter 09, not run |
| MM-2 to MM-6: the world boss | The hall check at three Levels, and one boss stood |
| MM-12 to MM-16, MM-38 to MM-40: both arenas | The engine test |
| MM-8 to MM-10: clan buffs, castle, board | Clans existing |
| MM-28 to MM-37: the Crowns engine | Test Crowns in a playtest. Security |
| GR-1, CE-7: closed-form town work | A town-hour fixture and a load test |
| GR-79, GR-80: the first hour and the company plan | Being built and played past minute 17 |
| GR-16, GR-17, GR-20, GR-61: new spells, fists, status pairs, Kindlings | Deadly sized. Unimplemented, by the book's own order |
| GR-88: the matrix as the release gate | The framework audit |

## 7. The 15 most consequential decisions

Ranked by how much each can change what Hearthrise is, how it plays, its economy or its build.

| # | The decision | My recommendation | Evidence | Unknown | Did you approve the direction |
|---|---|---|---|---|---|
| 1 | **Four heroes from the first hour.** The account, not the hero, is the player | Keep. It is the frame for everything. Treat the first hour as unproven | MEASURED: the first party hunt is safe. PLAYED: only the one-hero opening | Whether a new player stays. What your own 2026-11-09 reasons for slow alts (main-hero identity, room for guilds) now look like | Yes, 2026-11-21, your own call |
| 2 | **Deadly, death and the idle promise.** 6% with no cap, 50 to 100 deaths in 1,000 hours, plus a ladder to soften it | Make provisional. Decide 3.2 first | No measured death rate. COMPUTED: 20 to 40% of hunting time lost on top of the XP | Whether an idle player can use Deadly at all | Partly. You ruled both numbers. The ladder is open (conflict 5) |
| 3 | **The Crowns loop.** Crowns buy Premium and looks. Boosts sell for gold. Payers sell Crowns for gold | Make provisional. Test with test Crowns before pricing anything | None. JUDGMENT throughout | Whether players with gold want Crowns when Premium is weak and heroes are free | Yes to the model (2026-11-18, 2026-11-21). The details got seconds. Two were no |
| 4 | **The MMO layer as designed.** 49 decisions: boss pool, clan buffs, calendar, two arenas | Wait on most. Build the cheap social layer and one sample boss | 1 measurement in 49 rows. No code exists | Almost all of it | Yes to the direction. The shapes are not yours yet |
| 5 | **Rule 0, and the removals that follow.** Nothing needs two players at once. No on-call heroes, no party finder, no Local chat | Make provisional. Your "keep" picks stand until a playtest says otherwise | MEASURED, thin: four testers overlapped in 5 of 675 ten-minute windows | Whether an MMO where nobody ever needs anybody feels like an MMO. You raised this worry yourself on 2026-11-21 | Yes to rule 0 in 14 seconds. The removals are conflicts 1 and 2 |
| 6 | **What makes a party a decision.** Your pick: no lineup test, XP by size alone | Follow your pick. Then shrink the role machinery to a sample: the cast break, shooters first | MEASURED, direction only: the dial cannot make the shield matter at the armor cap | What replaces roles as the reason to prepare | Yes, your pick. It also retires your 2026-10-31 class-mix rule |
| 7 | **The gear curve.** Linear in Level, +17% bands for ever | Keep the line. Band size provisional. Check it against the armor cap | MEASURED for the line. One seed for the step size | Whether a band is felt. Whether plate upgrades mean anything past Level 110 | Thin. 58 seconds, then 1 second |
| 8 | **The Level law.** Your table is the law. Levels 1 to 50 stay as they are. The plain four is the clock | Keep the rule. Numbers provisional | COMPUTED from measured rates under Level 185 | The seat's multiple. The wall at Level 50 | Partly. The table is yours. Three of its numbers move (reversals 2, 3, 4) |
| 9 | **Prices in hours, sinks as a share of a band.** No typed price survives | Wait. Use it for new prices only, and keep your typed prices until the wage is measured | COMPUTED on a trial curve. The gold reading fails calibration | Whether it kills the feeling of getting richer | Thin. You kept typed Hallmark prices on purpose on 2026-11-18 |
| 10 | **The formula architecture and its 28 steps.** One pipeline, one modifier table, every monster from one formula | Keep. Build the no-number steps first. Bring the five special rules to you as your brief requires | Identity proofs are exact. The census shows the registers name 24 of 149 typed-number functions | How much rule code the plan has not seen | Yes, your brief |
| 11 | **The content runway.** A new region every 45 to 53 days, six grounds and two bosses each | Decide who draws regions and how fast before any launch date is printed | COMPUTED. No owner, no timing | Whether one studio can feed an uncapped game at 12 hours a day | Yes to 120 days at launch. The pace after it is unowned |
| 12 | **The buff caps and the power budget.** +15% damage, about 10% protection, +25% XP | Make provisional | COMPUTED only | How buffs interact with Deadly and the region door | The direction yes. The numbers are untested |
| 13 | **Town work in closed form.** Paid at the start, each hour and the stop | Keep. It is the only path to the server budget | ESTIMATED. One part measured | Exact parity with today's pay. Load at 1,000 accounts | Yes, thin (20 seconds, then 1) |
| 14 | **The first hour and the company plan.** Two beats, one Start, one return card | Keep. Build it early and play it with strangers | Walked against real data. Minutes 17 to 60 unplayed | Whether four heroes in minute 17 is a gift or a wall | Follows your rulings. No reversal |
| 15 | **The matrix as the release gate.** A balance change ships only if the matrix agrees | Keep as a report. Do not let it gate until the framework audit's fixes land | The tool's own trust table | See the framework audit | Yes, 23 seconds |

**What must be measured or played before each is called decided.**

| # | Before it is decided |
|---|---|
| 1, 14 | Five strangers play the first hour with four heroes and talk aloud |
| 2 | The simulator follows the real death rule. Then the death sample at the raised dial. Then your answer on lost hours |
| 3 | Test Crowns in the playtest. Do over a fifth of accounts buy them with gold |
| 4, 5 | The engine test for arenas. One boss weekend. Clans by day 7. Do playtest friends ask for the things that were removed |
| 6 | The lineup cells at the sized dial, with XP by size |
| 7 | One band played on the curve. One run of heavy, medium and light armor past Level 110 |
| 8 | The kill reward built, then the law fitted once |
| 9 | The store-bill fault fixed, then the wage checked against played gold |
| 10 | The census extended, so the registers are known to cover the rules |
| 11 | One region timed from sketch to shipped |
| 12 | The buffed four against the plain four at three Levels |
| 13 | A town-hour fixture and a synthetic load of 1,000 accounts |
| 15 | The framework audit's list |

## 8. What should happen next

Five steps, before any build plan.

1. **Fix the measuring tool first.** The death rule, the rune rule for the simulated kit, the damage total. Then run the death sample. Until then no tier, death, Blessing or gold number is called decided.
2. **One real sitting with you, eight questions at most.** The seven conflicts in 1.2 and the lost-hours question in 3.2. Each with what it costs, not a recommended button.
3. **Play the first hour with four heroes.** By hand on a test account now, then with five strangers once it is built. It is the largest unplayed change in the book.
4. **Narrow the first build to section 4.** Mark the MMO rows as planned and waiting. Run the two cheap tests that size what waits: heroes against heroes in the engine, and one boss room at three Levels.
5. **Re-issue the book in three words: decided, provisional, open.** Fix the stale chapter text in 1.3. Give the content runway an owner before a launch date is printed.

The overhaul is not wrong. It is early. Most of what it calls decided is a good plan waiting for a test.
