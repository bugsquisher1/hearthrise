# Chapter 05: Progression and the long game

Part of "Hearthrise: the game we are building", the combined design of record. Lane `lane/d-book-progression` (game designer, 2026-11-21), cut from `set/v0.2.144`. Docs only. No game code, data or migration was changed.

**How to read the labels.**

- **RULED** (date or id): Tyler decided it. It is the game.
- **DECIDED** (call id, Fable 2026-11-21): the game designer decided the call and an adversarial check corrected it. Its row is in `decisions/all.json`.
- **DECIDED (reversal, Tyler may veto)**: it changes one of Tyler's rulings. The first tag in the chapter names the ruling. It stands unless he vetoes it.
- **TYLER CONFIRMS**: a money call or a grant, with the one recommendation.
- **CUT (Tyler approves)**: a removal that waits for his yes.
- **OPEN**: nobody has a ruling, and the line says what decides it.
- **TARGET**: a number the design aims at. **COMPUTED**: arithmetic on the ruled tables and on XP rates the simulator measured. Nothing in this chapter is a measurement of a curve, because a curve moves no fight.
- **PROVISIONAL**: every number from Level 185 up. The simulator's heroes and grounds past 185 are projections.
- **Chapter arithmetic**: worked in this chapter from numbers on the page, not run through a tool.

The pace seat is the clock everything is timed on: a four in mid gear on suggested talent builds (`10-level-choices.md`), with no buffs, on the hardest tier it holds, hunting 12 hours a day (RULED 2026-11-21, 50-1 and the 12 hour ruling). Every account has four heroes from day 1 (RULED 2026-11-21), so every account sits in this seat.

---

**The status words, re-issued 2026-11-21.** Tyler adopted the critical review (`review/00-critical-review.md`), and the book now uses three honest words. They replace the list above. **DECIDED** means evidence and rulings support it. Where Tyler also said yes on the page, the tag says so. **PROVISIONAL** means a reasonable plan that has not been tested, and the first tag in a chapter names what it waits on. **OPEN** means it waits on Tyler. **RULED** is kept only for what Tyler ruled knowing what it was: his typed words, his own executive decisions, and a pick where he wrote a note, and his answers at the sitting of 2026-11-21, where he saw every option's cost. A quick pick on the page is a real yes and reads "Tyler said yes on the page", never RULED. **PROPOSAL** marks a design made in the fold of 2026-11-21 that Tyler has not seen. CUT and KEPT record his picks on the cut list. The record is `decisions/all.json` and `00-the-game.md`.

## 1. The experience

**Minute 5.** Four heroes stand in town and the first hunt is running. Level bars move fast. No Level under 10 takes more than two hours, and the four passes Level 10 inside its first sitting. Skills tick up beside the Level: the hero who swings gets Melee, the hero being hit gets Defense. Nothing asks the player to study a system. The numbers going up are the lesson.

**Hour 20.** The four is well on the road to Level 50, which it reaches near hour 62. Each hero has a shape now. One is the front row because its Defense says so. The resting heroes are at the rocks, the river and the benches, and the account has "its miner" and "its cook". A death has happened at least once and cost minutes, because Blessings are free at low Level and a low hero has little to lose. The Tower has been climbed for the first time. The Luck bar has its first few percent. The player knows the next gear tier by its Level and can see it coming.

**Day 31.** Krell's Hold. This is the end of the generous stretch. Past it, drops get rare and strong, Levels take most of a day each, and a death is a real price.

**Hour 2,000.** The four is near Level 232 (COMPUTED, PROVISIONAL) on day 167. A Level takes about 14 hunted hours, so there is one most days. Level 200 was an event the whole server saw. Each hero carries five Blessings into Deadly, because an unblessed death would cost more than four days of hunting and a blessed one costs an evening. Inner Flame has lit a row of Kindlings, so two tanks on the same server are no longer the same hero. The week has a beat: one Tower climb, six chest opens, a descent into the Catacombs on what the party carried. The Luck bar is past +25% and still climbing. The Honors page always shows something about to land.

**What the long game promises.** Levels never end, and the cost of each one only ever rises slowly. Nothing a player earned is taken away except by a death, and a death is always a choice made before the hunt, with its price on the card.

---

## 2. The design

### 2.1 Level

| Rule | Status |
|---|---|
| Level is uncapped. It is the score of a hero and the gate to grounds and gear tiers | RULED 2026-10-14, 2026-11-21 (40-formula-brief §7) |
| A Level gives +10 max health and +10 max mana and nothing else. Formula P11: health 150 + 10 a Level, mana 100 + 10 a Level. Knobs `heroHp`, `heroMana` | RULED (as built, kept by 44) |
| No blow reads a Level. A fight is stats against stats | RULED 2026-11-04, 2026-11-18 |
| Gear names a Level to wear it (P35). Tiers 1 to 7 are worn at Levels 1, 15, 30, 45, 60, 75 and 88 | RULED (gear tiers) |
| Level 200 is a big deal | RULED 2026-10-14. Section 2.11 is how the game says so |
| No prestige, no rebirth and no fourteenth skill. A hero earns a talent point every five Levels. Points are stored as rows, and no blow reads a Level | DECIDED GR-64, Fable 2026-11-21, for the three refusals. Talents are RULED 2026-11-21 for the rhythm and PROVISIONAL (TAL-1, `10-level-choices.md`) for the design |

Level's worth shrinks by itself as it grows: +10 health is 0.47% at Level 200 and 0.24% at Level 400. It needs no diminishing rule beyond the Level law below.

### 2.2 The Level law

**The rule.** Tyler's table of hours is the law. The XP a Level costs is never typed. It is derived:

`XP for Level L = hours for Level L (from the table) x what an hour pays at Level L (the pace contract) x the pace seat's multiple`

| Part | What it is | Formula, knob | Status |
|---|---|---|---|
| The table of hours | 6 h to Level 10, 36 h to 25, 168 h to 50, 600 h to 100, 1,680 h to 200, 3,120 h to 300, 4,580 h to 400, then 6,720 h to 500, 13,440 h to 750, 23,520 h to 1,000 | Content rows. Knob `hoursPerLevel`. Step R13 | RULED 2026-10-25, and 2026-11-21 (50-1, 50-2: the seat is the four, Level 400 is 4,580 hours, day 382) |
| Between the ruled points | Joined on a log scale and carried past the last point at the last slope | P01, derived | PROVISIONAL GR-6, waits on the kill reward and the tiers, because the seat's multiple is not one number until then, Tyler said yes on the page, reversal of the hours of the 2026-10-25 table and "Level 400 is day 382", let stand on the page |
| The pace contract | What an hour pays at Level L: `1385 x L^1.274` | P02. Knob `paceContract`. Step R12 | PROVISIONAL GR-5, waits on the death fault fixed in the measuring tool, then the death sample of 4 seeds by 8 hours, Tyler said yes on the page (the contract becomes the law the kill reward follows) |
| The pace seat's multiple | One number: what the pace seat earns over the contract once the kill reward and the harder tiers are settled | Coefficient, fitted once at R13 | PROVISIONAL GR-6, Tyler said yes on the page, reversal, let stand on the page. TARGET inside the ruled 1.8 to 2.5 (2026-11-16, 21-4) |
| Where the law starts | **Level 50.** Levels 1 to 50 are held on a lone new hero: Level 10 in 6 hours on the starting gear, no Level under 10 over 2 hours | Content rows under 50 | RULED 27-2 (2026-11-20) for the early rule. PROVISIONAL GR-6, Tyler said yes on the page, reversal, let stand on the page for the start at 50 |
| The curve never chases a ground | A ground that pays over the contract is a ground number, fixed on the ground or in the kill reward. The Level law is never re-fitted to a ground | Layer rule | RULED 2026-11-21 (fix at the formula layer) |

**What the law gives the pace seat** (COMPUTED from the XP rates the simulator measured, `review-progression.mjs law`. Level 185 and up PROVISIONAL):

| Level | Ruled hours | Hours on the law from Level 50 | Day at 12 hours | Hours this Level costs (chapter arithmetic on the joined table) |
|---|---|---|---|---|
| 10 | 6 | 2 | 0 | under 2 |
| 50 | 168 | 62 | 5 | 1.9 before the law, 6.2 on it |
| 88, Krell's Hold | | 368 | 31 | about 10 |
| 100 | 600 | 494 | 41 | 11.0 at Level 99, 8.9 at 100 |
| 110 | | 585 | 49 | about 9 |
| 185 | | 1,390 | 116 | about 12 |
| 200 | 1,680 | 1,574 | 131 | 12.5 |
| 300 | 3,120 | 3,014 | 251 | 15.9 at Level 299, 13.9 at 300 |
| 400 | 4,580 | 4,474 | 373 | 15.3, then 19.6 on the way to 500 |

**Four things the law carries with it.**

1. **It runs 106 hours ahead of the ruled table at every ruled Level.** The four does Levels 1 to 50 in 62 hours against the 168 a lone new hero is ruled on. That is 18% early at Level 100, 6% at 200 and 2% at 400. The pace band P1 judges Level 100 with those 106 hours allowed. So Level 100 lands at 494 hours against the ruled 600, and Level 400 lands on day 373 against the ruled day 382. The 18% at Level 100 is past the standards' own 15% red line. Both are changes to ruled numbers and are on Tyler's reversal list. PROVISIONAL GR-6, Tyler said yes on the page, reversal, let stand on the page.
2. **The step at Level 50 is smoothed.** A Level would jump from 1.9 to 6.2 hours, 3.3 times the one before, and the ruled smooth rule allows 2. The law ramps in over about eight Levels, 50 to 58. PROVISIONAL GR-6, Tyler said yes on the page, reversal, let stand on the page. The ramp is the first piece of the same line as the rest of the law (GR-6d).
3. **A Level never gets cheaper.** Joining the ruled points on a log scale makes a Level cheaper at Level 100 (11.0 hours, then 8.9) and again at Level 300 (15.9, then 13.9, chapter arithmetic). The law is cut so the hours a Level costs never fall and never more than double, and it still passes through every ruled point. The cut has one rule, so it is one line and not one of many: the non-falling line through every ruled total that has the smallest largest step between two Levels. A generator writes it from the table and nobody types a point (DECIDED GR-6d, Fable 2026-11-21). The hours-a-Level column of the table above still shows the log join at Levels 100, 300 and 400, and the generator replaces it. PROVISIONAL GR-6, Tyler said yes on the page, reversal, let stand on the page. The Level 300 dip was not in any source and is new here.
4. **The Level-a-day band follows the ruled table.** The table itself needs 10.8 hours a Level from 100 to 200 and 14.4 from 200 to 300. The band P12 reads at most 15 hours a Level to Level 300 and 24 to Level 400. DECIDED (no call id, Fable 2026-11-21, the baseline's amendment, PROPOSED band).

**Order of work.** The law cannot be fitted until the kill reward (R12, GR-5) and the harder tiers (GR-3, GR-27) are settled, because the seat's multiple is not one number until then. Evidence about the proposed design: on measured rates the seat reads 2.83 times the contract at Level 50, 2.05 at 100 and about 1.45 from 185 on. The law lands in the same release as prices as a share of band gold (R16, GR-8), because a band that lasts about twice as long earns about twice the gold against any typed price. PROVISIONAL GR-6, Tyler said yes on the page, reversal, let stand on the page.

**Krell's day.** RULED 2026-11-21: "Krell will not take 4 months", and the record carries day 18 for a four. On the law the plain pace seat reaches Krell's Hold on day 31 (COMPUTED). Day 18 was computed for a four running at 2.2 times the contract on a table timed for a lone hero, before the table was ruled to be the four's own clock. Both cannot be exact: Level 88 on day 18 and Level 100 at 600 hours would put 12 Levels across 32 days. This chapter reads the ruling by its words, weeks and not months. Day 31 is four and a half weeks for a plain four, and a four with best gear and buffs is there between day 18 and day 24 (section 2.4). PROVISIONAL (GR-6b, Tyler said yes on the page, reversal of "day 18 for a four" of 2026-11-21, let stand on the page): day 31 for the plain seat, and every chapter quotes that one day. The strongest way to keep day 18 exact was to start the law at Level 88, not 50. Chapter arithmetic for that start: Level 100 on day 27 (46% early against the ruled 600 hours), Level 200 on day 117, staged content ends about day 101, Level 400 on day 358. It costs 15 days of runway, so it was not taken.

**The seat the law is timed on is the four on Dangerous. RULED (Tyler, 2026-11-21, the second sitting, S-11 c). The law reads again before Early Access. Its numbers stay PROVISIONAL.** What follows is the reading he was shown. The law is now fitted at the ruled points, so whichever four is the clock lands on the ruled table: Level 100 at 600 hunted hours and Level 400 on day 382. MEASURED on run 44931089433: the four on Dangerous reads 1.263 times the pace contract, and a four on Deadly that never dies reads 1.579. The ratio is 1.25.

| Which four is the clock | That four | The other four | Level 400 for the other four |
|---|---|---|---|
| The four on Dangerous, the idle tier of S-6 | Lands on the table: Level 100 at 600 hours, Level 400 on day 382 | A four that farms Deadly safely is about 25% ahead, at Level 100 in about 480 hours | About day 305 |
| The four on Deadly that never dies | Lands on the table: Level 100 at 600 hours, Level 400 on day 382 | The four on Dangerous needs about 25% longer, at Level 100 in about 750 hours | About day 477 |

COMPUTED on the ratio of the two readings. The Deadly reading of 1.579 is taken over checkpoints that include Levels 60 and 75, and the run played the engine before the two stall fixes at 02364f03a. The replay on the fixed engine read 1.261 on Dangerous and 1.741 on Deadly with no death (MEASURED, run 44948522187), and S-11 was answered on those. The matrix lane then re-read the Dangerous seat on the base of D-3 at 1.153 (MEASURED, run 44957840040, as that lane reported it). These numbers replace the earlier run's 1.266 and 1.492, which chapter 12 printed. Every day in this section and in 2.4 is PROVISIONAL on that answer.

**Past Level 400.** The table runs on to Level 1,000 and the slope carries on from there. The Level curve itself holds to Level 5,000 (MEASURED on the engine, 42: each Level 34 to 54 hours). What keeps a hero able to hunt at those Levels is the gear curve, which `03-items-and-crafting.md` owns (GR-4).

**Past the last ground.** XP an hour stops rising at the top ground while a Level's cost keeps rising. A Level at 250 hunted on a Level 185 ground costs about 1.5 times the table (COMPUTED). That soft wall is right and needs no rule. Over-Level hunting is allowed (RULED 2026-10-14).

### 2.3 XP: what a kill pays

| Rule | Formula, knob | Status |
|---|---|---|
| A kill pays XP by the monster's health: XP a health point = contract(L) over the reference kill-health an hour at Level L. One reference line for the whole game | E01, P02. Knobs `paceContract`, `killRateRef`. Step R12 | PROVISIONAL GR-5, Tyler said yes on the page |
| A ground carries at most one derived number: how its layout moves kill-health an hour against the reference. A generator writes it from the matrix with a 5% tolerance. Nobody types it | Derived data | PROVISIONAL GR-5, Tyler said yes on the page |
| One XP chain, each factor one table for the whole game: kill XP x tier x mode x party x event | P20 | DECIDED GR-5, GR-85, Tyler said yes on the page 2026-11-21, with GR-5 PROVISIONAL, Tyler said yes on the page |
| Tier: one table for every ground. A tier is a bigger pull, a percent of difficulty and a percent of XP. Coin a kill never scales with a tier | Knobs `tierXp`, `tierDanger`, `tierHp`, `tierPull` | RULED 2026-11-05, 2026-11-07. One pull number a tier is PROVISIONAL GR-27, Tyler said yes on the page |
| Mode: the Tower and the Catacombs pay 37.5% of a kill's Level XP, and a death there costs nothing | P25, one row of the mode table | RULED 2026-11-14 (the Tower). The Catacombs' copy is ASSUMED until played |
| Party: one table by size alone. A four of one weapon way and a mixed four are paid the same. The lone hero is its first cell. The Tower and the Catacombs take the same table | P21, P22. Knobs `partyXp`, `soloXp` | RULED (GR-3, Tyler 2026-11-21, the sitting: party XP by size alone, which replaces the classes rule of 10-31). One table for every mode is PROVISIONAL GR-36, waits on Deadly sized, and the system built |
| Event: Level XP +25% at most, one at a time. The whole world once a month, one ground's own weekend in between | P27 | RULED 27-5 (2026-11-20) |
| Buffs on Level XP: a standing cap of +5% and a timed cap of +25%. The world weekend fills the timed cap by itself | The modifier table of `06-mmo-layer.md` | PROVISIONAL MM-25, waits on one buff played in a cell |
| The rested bank is cut. The Level table is the only clock, and a missed day is simply missed | P30 and its argument on P05 deleted. Step R5 | CUT. RULED (GR-63, Tyler 2026-11-21, the sitting). Evidence: switching it off moved no number in 207 measured cells |
| No gold-funded or paid server XP buff | | RULED 2026-11-04 (the avoid list). Section 5 flags how bought timed boosts meet this |

### 2.4 Whose clock the table is: the plain four or the buffed four

**PROVISIONAL (GR-6a, Tyler said yes on the page, with MM-26).**

The collision. The Level table is the clock of a mid-geared four (RULED 50-1). With every buff cap full a four gains at most about 65% more Levels an hour than that plain four. MM-26 and MM-31 quote that one ceiling, and nobody holds it outside a Hearthrise weekend. Paying alone is worth about 22%. So the same Level arrives on different days.

Chapter arithmetic, every hour of the plain seat divided by the multiple. The last column overstates what anyone can hold, because the Level XP part is one weekend in four:

The plain four carries suggested talent builds. The three faster clocks below each gain a factor of at most 1.012 from the fastest build over the suggested one (COMPUTED in `10-level-choices.md`, PROVISIONAL (TAL-1, `10-level-choices.md`)), which moves no day in the table by more than a few. At the sitting Tyler ruled that a clan room pays a standing Level XP bonus (S-4). Every clan member then levels faster than the Level table all the time. The clan room is the Library: +0.5% Level XP a level, +5% at level ten (PROVISIONAL (CH11-2, `11-on-call-and-clan-xp.md`)). The Level table stays the clock of the plain four, which is now also the four in no clan. COMPUTED there, in days at 12 hours a day:

| Door | The plain four, in no clan | A plain four with a full Library | The fastest held seat before | The fastest held seat now, about 1.44 |
|---|---|---|---|---|
| Krell's Hold (88) | 31 | 30 | 23 | 22 |
| End of open content (110) | 49 | 47 | 36 | 34 |
| End of staged content (185) | 116 | 110 | 85 | 80 |
| Level 400 | 373 | 355 | 274 | 259 |

The early rows overstate the Library, because a new account cannot reach a castle in its first weeks and a Library takes at least 10 weeks to fill.

| Door | Plain mid four (the law) | Paying alone, 1.22 | The fastest seat held all the time, 1.36 (best gear, both damage caps, the weekend averaged) | Every cap full, 1.65, on a Hearthrise weekend only |
|---|---|---|---|---|
| Krell's Hold (88) | day 31 | day 25 | day 23 | day 19 |
| End of open content (110) | day 49 | day 40 | day 36 | day 30 |
| End of staged content | day 116 at Level 185, day 120 at Level 189 | day 95 | day 85 | day 70 |
| Level 400 | day 373 | day 306 | day 274 | day 226 |

**PROVISIONAL (GR-6a, Tyler said yes on the page): the table is the clock of the plain four. Buffs are rows on top of the law and the law never reads them.** Three reasons.

1. **The ruling's own words.** The seat is "a mid-geared party of four". Every account sits in it from day 1 without spending or joining anything. A clock should be the seat everyone has.
2. **Buffs must be an edge.** Crowns and the MMO layer must give real advantages (RULED 2026-11-21). If the table were timed on the buffed four, a plain four would run 39% behind the ruled hours and buffs would be a tax to get back to normal. Timed on the plain four, every buff is felt as time gained.
3. **The formula layer.** The XP chain is kill XP x tier x mode x party x event. Buffs are the last factor. A law that reads its own modifiers has to be re-fitted every time a buff row is added, which is the circle the Level law exists to end.

**What that costs, and where it is paid.** The runway has two ruled bands and they read two different seats:

- **R2, 120 days of grounds at Early Access, is read on the plain four**, as the standards wrote it ("for the four MID player"). On the law that is day 116 at Level 185, four days short. No new ground is drawn. The top staged ground's band runs to Level 189, where the plain four stands at 1,440 hours, which is day 120.
- **R1, a region open 30 days before the first fours arrive, is read on the fastest seat**, because the first fours to arrive are the buffed ones. On the numbers above the first region past staged content has to be open by about day 50 after launch, not day 86. It was about day 55 before the Library (R1, read on the fastest held seat, which now ends staged content on about day 80). That is a content schedule the art and asset directors must size, and it is the real price of MM-26.

If that schedule cannot be met, the fix belongs in the buff caps (MM-25) and never in the Level law: lower the timed Level XP cap, or shorten how many hours a week it can be full. `05-progression.md` asks the MMO layer for one number it does not yet state: the time-averaged pace gain of a player who fills every timed cap as often as the calendar and the store allow. R1 is sized on that number.

### 2.5 Death and Blessings

| Rule | Formula, knob | Status |
|---|---|---|
| A death ends the hunt and sends the hero to town. No knockouts, no resume, the same viewed or away | | RULED 2026-11-09 |
| A death costs 6% of the hero's total Level XP, flat, with no cap in hours. It can take a Level, never below Level 1 | P28. Knob `deathLoss` | RULED 2026-11-09, 2026-11-21 (50-4) |
| A death costs 6% of each combat skill's progress into its level | P28 | RULED 2026-11-09 |
| A death takes Inner Flame progress like every combat skill | P-X18 | RULED 2026-10-25. GR-65 asked for an exemption and was WITHDRAWN by the review, because Tyler was asked directly and refused it |
| Blessings 1 to 3 cut the cost by 25%, 50% and 75%. A death uses them up | Content rows | RULED 2026-11-10 |
| "Keep me blessed" is remembered for each hero: all, the first three, or none. Chosen once | | RULED 21-8 (2026-11-20) |
| The set of three costs about two hours of a lone hero's gold at its Level, the first one cheap | Step R15. Knob `wageShare` | RULED 21-8 |
| Every Blessing is priced as a share of the hours it saves, under a fifth, in the buyer's own gold. Free at low Level falls out of that price, with no Level threshold | Band S10. Step R15 | PROVISIONAL GR-7 with GR-51, waits on the store-bill fault fixed and a wage formula that exists, with GR-7 RULED at the sitting |
| **The ladder.** Past the third Blessing, a new one opens whenever a fully blessed death would cost the pace seat over five hunted hours. Each halves what is left | Content rows, placed by rule | RULED GR-7, Tyler 2026-11-21, the sitting (re-opens 50-4 in effect, and adds to the three of 2026-11-10) |
| The risk reading is free. Every player sees how close a hunt came to a death, and the deaths per 100 hours of that ground and tier, before pressing Start | A server-held rate. No formula | PROVISIONAL GR-66, waits on the playtest or measurement its own row names, Tyler said yes on the page |

**The identity underneath** (COMPUTED). On any curve shaped like the ruled table, 6% of total Level XP is about 3.2% of every hour the hero has ever hunted, and 0.8% with three Blessings. The cost of a death grows in a straight line with a hero's lifetime, for ever.

**What one death costs the pace seat, in hunted hours** (COMPUTED on the law from Level 50. Level 300 and 400 PROVISIONAL):

| Level | Unblessed | Three Blessings | The ladder | Blessings held on the ladder |
|---|---|---|---|---|
| 100 | 22.0 | 5.5 | 2.7 | 4 |
| 200 | 53.4 | 13.4 | 3.3 | 5 |
| 300 | 105.4 | 26.4 | 3.3 | 6 |
| 400 | 150.2 | 37.6 | 4.7 | 6 |

**Where the rungs fall** (COMPUTED from the five hour rule on the law): Blessing 4 at Level 97, Blessing 5 at Level 140, Blessing 6 at Level 257 (PROVISIONAL), and none more before Level 400. The Levels are outputs of the rule. If the law moves, the rungs move with it and nobody types them.

**Why a ladder and not a cap.** The unblessed death keeps every hour of its bite, which is the fear Tyler ruled for. The ladder is paid in gold, so it is "struggle or pay" (2026-11-19) and a sink that grows with Level. Know what it is: for a player who pays, it holds a blessed death tighter than the 12 hour cap Tyler turned down on 2026-11-21.

**On call.** A death on call costs nothing and uses no Blessing. The death still ends that hero's hunt. RULED for "no loss on death" (Tyler 2026-11-21, the sitting, S-1). The rest is PROVISIONAL (CH11-1, `11-on-call-and-clan-xp.md`), section 1.7.

**The ladder's threshold: 5 hours, PROVISIONAL.** The ladder is RULED (S-5). RULED by the designer 2026-11-21 (D-4), `review/06-designer-rulings-w1.md` section 5: the threshold is 5 hunted hours of the pace seat, Tyler's own number, now with a reason. Chapter 12 had moved it to 2 hours so Deadly would pay through the whole band. S-12 a turned that goal down: Deadly should not pay on the day a four arrives and should pay once it grows past the edge. At 5 hours the break-even sits at about 40 to 58 deaths in 1,000 hours, the floor of the arrival band (COMPUTED on run 44948522187). The rung Levels are the ones in the table above, about 97, 140 and 257. The threshold holds while the median break-even at the worst point sits from 30 to 60. It moves one step, to 4 or 6 hours, outside that. It waits on FB-3's measures and the playtest death rate.

### 2.6 Death against the Deadly death band

Two targets are ruled. A mid party on Deadly dies 50 to 100 times in 1,000 hunted hours, the same count at every Level (RULED 50-5, band S6). A death costs 6% with no cap (RULED 50-4). Deadly is also meant to be the best way for a four to level (RULED 2026-11-16). At the sitting of 2026-11-21 Tyler accepted what that costs an idle party (RULED, S-6): Deadly is a tier you watch or gamble on, and idle players mostly use Dangerous. With all four coming home on a death, an away party loses 18 to 31% of its hunting time on the 8 hour bar and 25 to 42% on the 12 hour bar, before the 6% (COMPUTED in the critical review from the ruled death band). MEASURED in `12-balance-pass.md` (R2 and R4): a four on the edge of Deadly loses 16 to 34% of an 8 hour bar when left alone. So Deadly is the best way to level for a four that is watched, and not for an idle one.

**They do not fit together past about Level 100 on three Blessings.** This is arithmetic on measured XP rates and an assumed death count. It is not a measurement. Evidence about the simulator: it recorded no deaths in all but three Deadly cells, and the one real four died once in 449 party hours, 2.2 in 1,000 (THIN).

Deaths in 1,000 hours at which a fully blessed mid four on Deadly earns exactly what the same four heroes earn alone on Normal (COMPUTED on the law. Deadly pays while the true count is under the number):

| Level | Three Blessings | The ladder |
|---|---|---|
| 75 | 131 | 131 |
| 100 | 78 | 155 |
| 145 | 49 | 197 |
| 200 | 32 | 127 |
| 300 | 14 | 112 |
| 400 | 9 | 73 |

The first checkpoint where the blessed four earns less a head than the same heroes alone on Normal:

| Kit and tier (ruled death band) | Three Blessings, band's low end | Band's high end | The ladder, low end | High end |
|---|---|---|---|---|
| Mid on Deadly (50 to 100) | Level 145 | Level 100 | never | Level 225 |
| Mid on Dangerous (10 to 30) | Level 325 | Level 165 | never | never |
| Best in slot on Deadly (10 to 30) | Level 400 | Level 225 | never | never |

**The design.** With the ladder, Deadly pays a mid four across the whole ruled band to Level 400, except at the very top of the band from Level 225, where a party steps down to Dangerous or gears up. That is the intended shape: Deadly is for a party that prepared, and best in slot always holds it. RULED GR-7, Tyler 2026-11-21, the sitting.

**When it ships.** In the release where the harder tiers are made to bite (GR-3, GR-27), sized then on the long death sample and not on the band. RULED GR-7, Tyler 2026-11-21, the sitting.

**The check that guards it.** Band S11: on the hardest tier the mid four holds, Level XP a head after deaths at the top of the ruled death count is at least what the same heroes earn alone on Normal, read once with every Blessing and once with none. PROVISIONAL GR-88, waits on the measuring tool's faults fixed and the full matrix run once, Tyler said yes on the page. Without it a change to the death rule passes every other band silently.

### 2.7 A death in a world boss room

**PROVISIONAL (MM-7, waits on a real death rate, and Tyler's answer on the hunting hours a death costs an idle party, with GR-7).**

The collision. A world boss stands for about 72 hours and is fought while the player is away (MM-2, MM-3). MM-7 says a death in the boss room costs the normal death. That is 6% with no cap, in a room a hero is sent to for points and gear, where Level XP is only about what a Normal hunt pays.

**PROVISIONAL (MM-7): a death in the boss room costs the normal death, and it is built with GR-7, never before it.** One rule set for every fight outside the Tower and the Catacombs. Four conditions make it fit:

1. **One death a send, by the rule that already stands.** A death ends the hunt and sends the hero to town, and no hunt starts by itself (RULED 2026-11-09, 27-1). A boss send spends stamina like a hunt, so a send is one stamina bar and not 72 hours. The worst an away weekend can do is one death for each hero for each time the player chose to send it. Carry on never sends a hero into a boss room.
2. **The boss room takes the one tier table and the one death band.** The room is scaled to its party, and the hall number acts on the boss's health and the clock, never on his blows. So deaths in the room stay inside the death band of the tier chosen: at most 1 death in 1,000 hours for a mid party in band on Normal (S2). This is a HYPOTHESIS until the hall grader plays it. The first send defaults to Normal. Dangerous and Deadly carry the ruled counts of S6. No boss gets a death rule or a damage patch of its own (RULED 2026-11-21, formula layer).
3. **Blessings and the ladder apply, and "keep me blessed" covers boss sends.** With the ladder a blessed boss death costs the same three to five hours at every Level. Without the ladder a Level 300 hero risks 26 hours for a chest roll and the harder boss tiers empty out from about Level 100, the same collision as section 2.6.
4. **The risk reading shows on the boss card.** Deaths per 100 hours for the tier, and what one death costs this hero blessed and unblessed, before the send (GR-66).

*Strongest alternative: the boss room is a row on the mode table with a free death, like the Tower. It is safer for an away player, and it removes the only risk in the tier choice, so every account sends on Deadly and the points rule has to carry all the weight.*

### 2.8 The skills

Thirteen skills, and the count is right. Four combat skills are uncapped. Nine town skills cap at 99. No skill is added, merged or removed (DECIDED GR-64, Fable 2026-11-21).

**The two curves.**

| Curve | Formula | Status |
|---|---|---|
| Combat skills | XP from level s to s+1 = `15 x s^2 x 1.04^(s-1)`, no cap. P03. Knob `skillCurve` | RULED (kept by 44 and 56). A level is worth 2% damage at Level 10 and 0.5% from Level 110, so the curve diminishes by itself |
| Town skills | A 99 row table. P04 | RULED (kept) |
| A hit stays skill plus gear, never skill times gear. Knobs `skillPower`, `gearPower`, `basePower` | Step R2 | PROVISIONAL GR-23 |
| Skill keeps its late worth through what it unlocks: rune tiers past skill 60, one every 15 skill levels, and hit chance. Knob `runeStep` | Step R6, R22 | PROVISIONAL GR-23 |
| A town skill from 1 to 99 takes 60 to 120 days of one hero's 12 rested hours | Band T1 | TARGET (PROPOSED band). Heroes work all 12 rested hours is RULED 50-13 |

**Each skill and its ladder.**

| Skill | What it is for | How it grows | Ladder and status |
|---|---|---|---|
| Melee, Ranged | What a hero is. Skills do not move with the weapon, so a style is an investment without a vocation | Damage dealt x 1.5 (P06) | RULED 2026-10-14 (classless). Uncapped |
| Magic | The caster's skill, and the rune tiers a hero can cast | Mana spent x 1.5 x the ability's multiple (P08) | Cast tiers at skill 1, 15, 30, 45, 60 (RULED 2026-10-23), then 75, 90 and every 15 on (PROVISIONAL GR-23). Each level adds 0.5% max mana for every hero (DECIDED GR-22, Fable 2026-11-21) |
| Defense | Who the front row is | Blows aimed at an armored hero, doubled when a shield turns one (P07) | RULED (kept). The to-hit ratio gives it its value (`01-core-and-combat.md`). Three bases for three jobs is kept: RULED (GR-25, Tyler 2026-11-21, the second sitting, S-15 a), 44 special rule P-X41 |
| Inner Flame | The hero's regen. It is no longer the home of a hero's build, which is Talents (`10-level-choices.md`). Its flat stretch past level 100 is OPEN again with no owner | Bones and fuels burned at the Hearth by a loot rule set once, with no hero time spent | Uncapped on the combat curve. Bones by loot rule RULED 21-9. Kindlings SUPERSEDED GR-61, by Tyler's 2026-11-21 ruling on level choices, see `10-level-choices.md`, reversal of the skill tree hold of 2026-11-05, let stand on the page. Section 2.9 |
| Woodcutting, Mining, Fishing | What a resting hero does. Three chains: logs to planks, ore to bars, fish to food | Node work in rested hours | 1 to 99 (RULED, kept as three). |
| Farming | The timed chain: crops to drinks and meals | Plots | 1 to 99. A crop opens at its Farming level and nothing else (PROPOSAL GR-74, made in the fold 2026-11-21, not yet seen by Tyler) |
| Cooking | Food and drink for every hunt | Bench | 1 to 99: shrimp and herring, trout and bread at 15, lobster and soup at 30, swordfish and stews at 45, shark and pies at 60, Frostfin and Ember Tart at 75, Moonfish and Moonbloom Elixir at 88 (itemization plan §8, source of record) |
| Smithing | Tools, whetstones, salts, and all jewelry: rings, earrings and necklaces. It reforges named shields and chest pieces. It makes no armor and no weapons | Bench | 1 to 99. Jewelry tier 2 at 15, tier 3 and Hallmark tier 2 at 30, tier 4 and Hallmark 3 at 45, tier 5 and Hallmark 4 at 60, tier 6 and Hallmark 5 at 75, tier 7 and Hallmark 6 at 88, Hallmark tier 7 at 99. RULED 2026-11-18. Tiers 4 to 7 built is PROVISIONAL GR-38 |
| Crafting | The outfitter: cloaks, belts, linings, arrows and bolts, planks and beams | Bench | 1 to 99. Stitched linings at 15, Corded at 45, Sealed at 75, cloak and belt tiers beside Smithing's. Cloaks and belts RULED 2026-11-18. The outfitter job and the cut-and-stitch step of linings DECIDED GR-43, Fable 2026-11-21. Its three temper salt recipes leave in the lane that ships linings |
| Runecrafting | The supply of every caster, and of hammers and tanks | Bench | 1 to 99. Blank and Chalked at 1, Scored 15, Etched 30, Carved 45, Graven 60 (RULED 2026-10-23). Storm runes at 25 and Bone runes at 40 (RULED 32-1). The Sealing Rune at 75 and 88, used by tier 6 and tier 7 Hallmarks (DECIDED GR-45, Fable 2026-11-21). Rune tiers at 75 and 90 arrive with the cast tiers (PROVISIONAL GR-23) |

**The top of every bench.**

| Rule | Status |
|---|---|
| Good batch: a consumable bench job sometimes makes double, about 2% at level 1 rising to about 10% at 99. No gold moves | RULED 2026-11-18 |
| 99 is the license. Past it: patterns for every worn recipe past tier 7 (eight a region unlock ten recipes), staples for the hero at 99 who brings that region's ore or hide, region materials only from that region | RULED (itemization plan §8, §13). Patterns teaching the account is DECIDED GR-44, Fable 2026-11-21 |
| The maker's mark: make a set number of a region's pieces and the account's Fine chance for that region rises a little, capped | RULED 2026-11-18 (§13 answer 3) |
| Crafting gives a quarter to a half of the step from mid gear to best gear, and a player who never crafts can buy it | RULED 50-15 |

**First principle.** Town skills are per hero and Storage is the account's, so one crafter serves four heroes and nobody levels a skill four times. With four heroes from day 1 a new account can easily start Mining on all four. The skill screen says which hero already holds each skill for the account. OPEN: the wording and where it shows belongs to the Path (GR-79).

### 2.9 Inner Flame and Kindlings

**Superseded for the build choice.** On 2026-11-21 Tyler lifted his 11-05 hold. A build choice every five Levels is designed now and built with the first build. That ruling supersedes GR-61, which put Kindlings on paper only and tied the choice to Inner Flame. The design is chapter 10, `10-level-choices.md`, called Talents. The Kindling rows below are kept as the record of GR-61 and are not the plan. Inner Flame itself, as a skill, is unchanged by this.

| Rule | Status |
|---|---|
| Inner Flame gives health and mana regen on the curve P / (P + 50): +29% at level 20, +50% at level 50 | RULED (kept) |
| Bones burn by a loot rule: "Burn" sits beside Sell and Keep on the loot plan. Tower Cinders can be stoked into the climb or burned for Flame XP | RULED 21-9, 2026-11-14 |
| **Kindlings.** Every ten Inner Flame levels a hero lights one Kindling, a small permanent passive picked from three. Each rung offers one pick for each job a hero can do: hold, kill, keep alive | SUPERSEDED GR-61, by Tyler's 2026-11-21 ruling on level choices, see `10-level-choices.md`, reversal, let stand on the page (re-opens the 2026-11-05 hold on the skill tree, for a written spec and a paper sample of five rungs only) |
| The whole track spends the 2% of the Add budget that was set aside for worn in. It touches no drop and no Magic Find and copies no jewelry perk. Every Kindling is a row on a channel the engine already has. It never multiplies | SUPERSEDED GR-61, by Tyler's 2026-11-21 ruling on level choices, see `10-level-choices.md`, reversal, let stand on the page (the three fences of the itemization fit, C10) |
| The pick is made at the Hearth, saved with the setup and copyable to another hero. It is free to change under Flame 30. Past that a re-light burns Cinders | SUPERSEDED GR-61, by Tyler's 2026-11-21 ruling on level choices, see `10-level-choices.md`, reversal, let stand on the page. The re-light price is OPEN until the sample is played |
| It is built after the to-hit ratio and the spell rule are live, so it is balanced once | SUPERSEDED GR-61, by Tyler's 2026-11-21 ruling on level choices, see `10-level-choices.md`, reversal, let stand on the page |
| Town Works, the Hearthrise event and flame powders become one Great Hearth the server feeds. Inner Flame stays a hero's skill, with its regen and its fuels | PROVISIONAL GR-82, Tyler said yes on the page, reversal of 2026-10-25, let stand on the page (`08-player-experience.md` owns it) |

Why this skill. The game is named for the Hearth. Every input already drops in every hunt, the skill is uncapped so there is always a next Kindling, and the choice is pure preparation: made in town, remembered, copied. Rungs come every few days early and every few weeks late.

A sample shape only, not rows: a rung might offer "regen counts double under 30% health", "the first blow on a fresh monster cannot miss" or "food heals a tenth more". Five rungs are written and played before any batch.

### 2.10 The yard, the dummy and training items

| Rule | Formula, knob | Status |
|---|---|---|
| The yard is for catching up a skill that fell behind, and it is the only way to re-spec a style. The yard screen says what an hour will buy before the player pays | | RULED 21-7 (2026-11-20) |
| The yard costs 100 gold for each level of the trained skill, each hour | Step R15 moves it onto the wage curve | RULED 24-8, 26-5 (2026-11-20) |
| The yard's rate follows a share of the skill level's cost and never passes half of what hunting pays that skill. The fee follows the rate | P09. Step R19 | PROVISIONAL GR-54, Tyler said yes on the page, reversal of 2026-11-14, 21-7 and A-5, let stand on the page (re-opens 2026-11-14, A-5 and 21-7, which keep a flat 30,000 skill XP an hour). Evidence about the flat rate: a skill level takes 51 to 243 yard hours from skill 75 (COMPUTED) |
| The House dummy ends the yard fee. Its unlocks are rungs by skill band, each priced at 25 to 50 hours of the yard fee at that band | Wage curve | RULED 2026-11-08 and 26-5 for "ends the fee" and the payback. The rungs by band are DECIDED GR-53, Fable 2026-11-21 |
| A dummy's blow cannot kill and it cannot die | P-X29 | RULED 2026-11-08 |
| Training items come in 1, 6, 12, 24 and 48 hour sizes and double the training rate while their hours last. Premium gives one 1 hour item a day, and with one Premium for each account the claim needs no press | P09 | RULED 2026-10-17, 24-4 (2026-11-20), 2026-11-21 (one Premium an account). The claim with no press is PROVISIONAL GR-84. What one Premium gives across four heroes is DECIDED (PREM-1, Tyler said yes on the page 2026-11-21), with one recommendation in chapter 04 |
| Training items stay off the Crowns store until the yard fee and the to-hit ratio are live | | RULED 2026-11-20 (26-10) |
| The "trains every rested hour" reading is printed and judges nothing | | RULED 31-7 |
| Defense training is sized by the to-hit ratio so yard hours cannot buy a large cut in damage taken | `01-core-and-combat.md` | RULED 2026-11-18 (direction: "definitely NOT" intended) |

### 2.11 Milestones: the Honors page

| Rule | Status |
|---|---|
| One page in the Book. An honor is one row: a condition the server already counts and a prize that is never power | PROVISIONAL GR-62 |
| Conditions: kills of a creature, a boss felled, a Tower or Catacombs landing reached first, a round Level, a Hearthfind held, a named fuel burned | PROVISIONAL GR-62 |
| Prizes: a title, a piece for the Hall of Firsts at home, an outfit piece, a line to the server. Titles keep their gold price after the kills are earned | PROVISIONAL GR-62. The gold price is RULED 2026-11-04 |
| Level 100, 200, 300 and 400 each give a title and a line to the whole server | PROVISIONAL GR-62. On a large server the Level 100 line goes to friends and clan only, so the world line stays rare. That narrowing is OPEN inside GR-62 |
| Honors are derived on read from counters the server already holds. Nothing is stored that can drift, and stages claim themselves with no press | PROVISIONAL GR-62 |
| A find list for each ground sits on the page and pays no Luck | DECIDED GR-48, Fable 2026-11-21 |
| The Trophy room becomes the Hall of Firsts, the place honors are shown at home, with a mounting fee for each piece hung | DECIDED GR-73, Fable 2026-11-21 (re-opens 26-6. `07-home-and-town.md` owns it) |
| The four Hearthfinds stay and are listed on the page. Lucky finds are never cut | RULED 2026-11-20 (23-7) |
| The Chronicle stays its own tab. It is story and opens by place. Tamsin's Tally stays, and a task is taken when a hero enters its ground | RULED (kept). The self-taking task is DECIDED GR-78, Fable 2026-11-21 |
| Six leaderboards, each opening on this week | RULED 27-4 |
| The collection log, the per-monster trophy ladder and the class charm ladder are gone | RULED 27-7, 27-3. The removal with its fixture check is CUT GR-63, RULED by Tyler 2026-11-21 at the sitting |

It starts as a sample of five honors: two boss Trophies, one title, Level 100 and a first Platinum landing. It is worth building only if every prize is worn or hung where other players see it. A checklist in a menu fails the purpose test and is cut.

### 2.12 The Burning Tower

The Tower is the one place a build is scored on something other than XP an hour. It is a weekly beat and stays one (PROVISIONAL GR-37). An idle endgame scores preparation, not hours at the screen.

| Rule | Formula, knob | Status |
|---|---|---|
| Difficulty is one "Levels per floor" row. A good party tops out between its Level and 25 floors past it, at every Level. There is no heat | One row. Sized after the to-hit ratio | RULED 22-1 (2026-11-20) |
| The Tower reads any floor from that one row, so it never stops getting harder | | PROVISIONAL GR-23 |
| Landings pay keys: Bronze at landing 10, Silver at 40, Gold at 70, Platinum at 100, then one key tier a band | Content rows | RULED (built), itemization plan §6 for "one a band" |
| Six chest opens a week for each hero, and a hero opens only a key from a landing it reached itself | | RULED 22-5, 50-6 |
| Chest weapons are as strong as the next tier's weapon plus a flat skill bonus, 4 to 8% faster when worn. Past Level 110 they carry the next band's budget. They are rare and never bound | | RULED 22-2, 2026-11-18. The flat bonus kept is DECIDED GR-26, Fable 2026-11-21 |
| Base chest chance 16, 8, 4.5 and 2% by key tier, then 2% | | RULED (plan §6) |
| Two-attribute chest pieces from the Level 200 key, 1 in 4, then half from Level 300, with fusing | | RULED 2026-11-18 (§13 answer 4). PROVISIONAL numbers |
| Chest reforging: the piece, 6 keys of the next tier, that tier's metal or hide, gold and one of the six opens make the next tier's piece with the same attribute. It is built before any new key tier | | RULED 22-3, §13 answer 6 |
| The weekly climb is a line inside Carry on. One press queues it, it runs once after the hunt and never loops | | RULED 22-6 |
| The Tower pays 37.5% of a kill's Level XP, a death there costs nothing, and it never beats hunting for XP at Levels 10 to 30 | P25 | RULED 2026-11-14, 22-7 |
| Cinders from the chest: stoke the next climb, or burn for Flame XP | | RULED 2026-11-14 |

The Tower as a progression: a hero's top floor moves with every Level and every gear step. A new landing comes about every 20 Levels past Platinum, which is about three weeks on the law (COMPUTED, PROVISIONAL). Each first landing is an honor.

### 2.13 The Catacombs

| Rule | Status |
|---|---|
| The store does not reach a descent. The party fights on the food, drink, runes and arrows it carried down, and the run ends when they are gone | RULED 22-4 (2026-11-20) |
| The Catacombs stay their own mode with their own doors. One wing and one key are built and played first, before the other pieces | PROVISIONAL GR-36 |
| Three wings pay armor through the same four key tiers and the same six opens: the Bone Wing leans helmets, the Flooded Wing leans boots, the third wing leans gloves 70% with helmets and boots 15% each | RULED 2026-11-18 (the glove wing), itemization plan §6. The third wing's twelve rows are PROPOSED |
| Clan rations may be carried down, capped by the week | RULED 30-8 (2026-11-20) |
| The mode row (37.5% Level XP, free death) and the door Level are copies of the Tower's | ASSUMED until the matrix plays them. OPEN, decided by the sample wing |
| The Catacombs take the one party table | PROVISIONAL GR-36 |
| The Unmarked Catacombs is also a hunting ground at Levels 165 to 185, and it needs its own uniques before it opens | RULED (plan §2, §6). PROVISIONAL |

The Catacombs as a progression: depth is a function of what the party can carry and how little it wastes, so bag rungs, cooking, runecrafting and the bar all show up as doors reached. HYPOTHESIS: a pack is a preset, so packing stays a decision only if deeper doors change what the right pack is. The sample wing answers it.

### 2.14 Luck and the Bestiary

Luck is the account's long chase. It only fills, it reads sources that already exist, and nothing sells it.

| Rule | Formula | Status |
|---|---|---|
| One Luck bar for the account. Raise-only. Percent n of Magic Find costs `100 x n^2` Luck | Luck v3.1 | RULED 2026-11-20 |
| The hours: +16% at 500 hours (day 42) and +39% at 5,000 hours (day 417) for one hero salvaging everything. A far stop at +100% | Band D3 | RULED 2026-11-20, 50-9 |
| Two feeds and no more: Lucky Rivets used, and Bestiary stages. Rivets are account-bound | | RULED 2026-11-20. Kept by GR-48 |
| The Bestiary counts kills for the account. Finishing a creature's stage pays a lump of Luck into the bar and claims itself. It has a page in the Book and ships first | | RULED 2026-11-20 (27-3) |
| The Lucky ring: the seventh ring perk, +1 to +4% Magic Find at tiers 2 to 7, 500 x tier^2 rivets and the Hallmark fee, tradable. A hero holds 104 Magic Find at most | Band D4 | RULED 2026-11-20 |
| Magic Find moves Rare rows by the full percent and Trophy rows on their own lower curve. It never moves commons, keys, the Hearth Chest, Hearthfinds, coin or XP | | RULED 2026-11-20 |
| Past Krell, Rare rows are 15% rarer at the first band and 25% rarer at the last. The two numbers are keyed to Level with the same end points, not to a band count | | RULED 2026-11-20 for the cut. The re-key is PROVISIONAL GR-4, waits on one band played on the curve, Tyler said yes on the page, reversal of two bands a region of 2026-11-18 and the Luck step of 2026-11-20, let stand on the page |
| A Very Rare lands every 60 to 90 hunted hours a hero through Krell, and every 60 to 90 hours of the own four past Krell | Bands D1, D2 | RULED 2026-11-20 |
| The Crowns store never sells Luck | | RULED 2026-11-20 |

On the Level law a band lasts about twice as long in hours, so the 10,000 kill stage of a creature lands in the middle of its band and not as the party leaves (HYPOTHESIS, for the matrix).

### 2.15 The content runway

| Stretch | Levels | State | Day the plain pace seat reaches its end |
|---|---|---|---|
| Open at Early Access | 1 to 110, through Krell's Hold | Built | day 49 |
| Staged | 110 to 189: the Morrow Hills and the Unmarked Catacombs, whose band runs to 189 | Built or designed, hidden until each works | day 120 |
| Sketched | 185 to 400: regions of about 55 Levels and six grounds each | Sketched now (RULED A-10) | day 373, PROVISIONAL |

| Rule | Status |
|---|---|
| 120 days of grounds at Early Access for the four in mid gear (band R2) | RULED 50-7. On the law Level 185 reads day 116. PROVISIONAL (GR-6a, Tyler said yes on the page): no new ground. The Catacombs ground's band runs to Level 189, which is day 120 |
| Each region is open 30 days before the first fours arrive (band R1) | RULED 50-7. Read on the fastest seat: PROVISIONAL (GR-6a, Tyler said yes on the page), section 2.4 |
| Regions are about 55 Levels and six grounds, to Level 400 | RULED 2026-11-18 (§13 answer 8). Opened as four grounds and a hall, then two: PROVISIONAL GR-33 |
| Drops are generous through Krell and really rare and strong after | RULED 2026-11-20 |
| An old ground can be hunted at the party's own Level, with one drop rule, and its lining parts still drop | RULED 22-9, 2026-11-07, 2026-11-18. The one drop rule is PROVISIONAL GR-9 |
| Past the last region there is always a chase that needs no new ground: the Tower's floors, the Catacombs, Bestiary stages, Luck, Very Rares, Kindlings, Honors, old grounds at Level (band R4) | TARGET (PROPOSED band) |
| Levels the team authors a month over Levels the frontier gains a month is at least 1.0 (band R3) | TARGET (PROPOSED band). Past Level 110 the plain seat gains about 34 Levels a month on the law (chapter arithmetic: 75 Levels in 67 days) and a region is 55 |

### 2.16 The three gear states

Every progression number in the game is read at three gear states, Level 1 to 400, at 12 hours a day (RULED 2026-11-21). Each state is a rule a tool applies to the game's data. Nobody types a kit.

| | LOW: the arrival kit | MID: the kit the game hands you | BEST IN SLOT |
|---|---|---|---|
| The idea | What a hero wears the day it walks into a new band, having bought nothing | A player who wears what drops and spends a little. **The pace seat wears this** | Everything that exists and can be worn at that Level |
| Weapon, off-hand, armor | One tier under the Level's tier. Under Level 15, the start kit | The Level's tier in every slot. Past tier 7, what a ground or a boss drops | The best piece from any source: Tower chest weapons, Catacomb armor, uniques, named shields |
| Jewelry and cloak | None | Plain pieces of the highest tier the Level can wear | Highest tier, Hallmarked with two perks |
| Tempering | None | Rung 2 of 5 on both tracks | 5 of 5 on both tracks |
| Linings | None | None | Every socket, the best tier, the element that answers the ground |
| Combat skills | On the career line (D-3) | On the career line | Career line + 10 |
| Ammo | The Shop's basic arrow and whetstone (D-3) | | |

| Band | Target | Status |
|---|---|---|
| Best in slot over mid | About 15% faster kills (1.10 to 1.20) and about 15% less damage taken (0.80 to 0.90) | RULED 50-3. Bands P4, S5 |
| Low under mid | 0.80 to 0.90 of mid's pace for a lone hero on Normal (P3). Damage taken is reported (S5.low) | RULED by the designer 2026-11-21 (D-3). Band P3. S5.low is a report, never a grade |
| Best in slot over low | At most 1.50 on Normal | TARGET (PROPOSED). Band P5 |
| Deaths in 1,000 hours on Deadly | Low over 200, mid 50 to 100, best in slot 10 to 30 | Mid RULED 50-5. Low and best in slot PROPOSED. Band S6 |
| A major upgrade | +5 to 8% hunting performance for a weapon, 3 to 5% less damage for armor | RULED 2026-10-25. How often is the gear curve's call: PROVISIONAL GR-4, Tyler said yes on the page, reversal, let stand on the page, bands at Levels 110, 129, 151, 176, 206, 241, 282, 330 and 386 |
| Time to a full best in slot set | About one band's length through Krell, one to two regions after | RULED 50-14 |
| Gold from mid to best in slot | A bit more than a band earns. A hero chooses what matters | RULED 2026-11-18, 50-6. Priced as a share of band gold: PROVISIONAL GR-8, Tyler said yes on the page, reversal of the typed prices kept on 2026-11-18, let stand on the page |
| Paying | Has no designed gear ceiling. It can put a hero way ahead, bounded by what the player market holds and by the hero Level a piece needs | RULED MM-32, Tyler 2026-11-21, his own note |

How the states meet progression. The Level law is timed on MID. LOW is ruled to fail the harder tiers, so a hero that arrives in a new band hunts Normal until it is dressed. Best in slot is what makes Deadly hold at the top of the death band and what halves a party's Blessing bill. The gear curve that keeps all three states level with the monsters past Level 110 is `03-items-and-crafting.md`'s formula, and the Level law depends on it.

**The pace seat is the four on Dangerous.** RULED (Tyler, 2026-11-21, the second sitting, S-11 c). The Level table is timed on the mid-geared four on Dangerous now, and the law reads again before Early Access from the real XP an hour of the fours players run. The ruled points do not move: Level 100 at 600 hunted hours and Level 400 on day 382. The seat is re-read on the base of D-3 before FB-8 stage 3 fits the law.

**The arrival kit is the mid kit one band back, in gear only.** RULED by the designer 2026-11-21 (D-3), `review/08-designer-d3.md`. An arrival is graded by what a player feels: it never dies on Normal, its low point, its pace, and for a party the tier it can hold.

---

## 3. How it connects

| This chapter | Reads from | Feeds |
|---|---|---|
| The Level law | **`01-core-and-combat.md` and `02-world.md`**: the kill reward (GR-5), the harder tiers (GR-3, GR-27). **`03-items-and-crafting.md`**: the gear curve (GR-4), which the kill reward's reference line needs first | **`04-economy-and-crowns.md`**: a band's length in hours sets a band's gold, so sinks as a share of band gold (GR-8) land with it. **`02-world.md`**: the day each region must be open. **Every chapter**: every day number |
| XP chain | **`01-core-and-combat.md`**: the tier table. **`06-mmo-layer.md`**: the party buffs, the buff caps (MM-25), the event calendar (MM-11, MM-42) | The Level law's seat multiple |
| The plain four as the clock | **`06-mmo-layer.md`**: the power budget (MM-26) and the pace ceiling (MM-31) | **`02-world.md` and the art plan**: R1 is read on the fastest seat |
| Death and Blessings | **`01-core-and-combat.md`**: the death count each tier delivers. **`04-economy-and-crowns.md`**: the wage curve that prices a Blessing (GR-51) | **`04-economy-and-crowns.md`**: a sink that grows with Level. **`06-mmo-layer.md`**: the boss room's death (MM-7). **`08-player-experience.md`**: the risk reading on the hunt card (GR-66) and the return card |
| Skills | **`03-items-and-crafting.md`**: recipes, jewelry tiers, linings, patterns. **`07-home-and-town.md`**: benches, the dummy, curing | **`01-core-and-combat.md`**: skill in the hit and the to-hit ratio, rune tiers. **`04-economy-and-crowns.md`**: the yard fee, bench tax |
| Kindlings | **`01-core-and-combat.md`**: the Add budget and the channels a Kindling may sit on. **`03-items-and-crafting.md`**: the three fences | **`08-player-experience.md`**: the Great Hearth (GR-82). Setups carry the picks |
| Honors | **`02-world.md`**: bosses and landings. Server counters | **`07-home-and-town.md`**: the Hall of Firsts (GR-73). **`06-mmo-layer.md`**: the server line and titles in town |
| The Tower, the Catacombs | **`01-core-and-combat.md`**: the Levels-per-floor row after the to-hit ratio. **`03-items-and-crafting.md`**: chest lines and reforging | Keys, Cinders, firsts for Honors |
| Luck | **`03-items-and-crafting.md`**: salvage, the Lucky ring, loot bands | Rare rows on every ground |
| The three gear states | **`03-items-and-crafting.md`**: the gear curve and every source | The frame every chapter's numbers are measured in |

**What must ship with what.**

1. The gear curve (GR-4), then the kill reward (GR-5), then the Level law (GR-6). Never in another order.
2. The Level law with sinks as a share of band gold (GR-8). Alone, the law halves every typed price against a band's gold. Evidence about the proposed design: on a trial curve the ratio of a band's standing prices to its gold fell from 0.39, 0.66 and 0.38 to 0.19, 0.40 and 0.18 at Levels 60, 110 and 185, against a ruled 1.2 to 1.4.
3. The Blessing ladder (GR-7) with the harder tiers (GR-3, GR-27), and the boss room's death (MM-7) with both.
4. The old kill ladders become tracks on the one kill count in the lane that builds the Bestiary and Luck (KEPT, Tyler's pick on the page 2026-11-21. How they stay is a PROPOSAL he has not seen).
5. Crafting's three salts leave in the lane that ships linings, not before.
6. Kindlings after the to-hit ratio and the spell rule.

---

## 4. The calls in this chapter, as decided

In decision-book order.

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-4 | The gear curve as a game formula | Linear in Level. Past tier 7 a band is a fixed step that opens at about +17% (110, 129, 151, 176, 206, 241, 282, 330, 386). Uniques are a spend of their band. The two Luck numbers are keyed by Level | PROVISIONAL. Waits on one band played on the curve. Tyler said yes on the page 2026-11-21. It changes The item plan section 2 (two bands a region, 2026-11-18), a major upgrade every 15 to 25 Levels (2026-10-25), the Luck step of 2026-11-20, which he let stand on the page |
| GR-5 | What a kill pays | The kill reward follows the pace line, with one tier table. Owned by `01-core-and-combat.md`. The Level law waits on it | PROVISIONAL. Waits on the death fault fixed in the measuring tool, then the death sample of 4 seeds by 8 hours. Tyler said yes on the page 2026-11-21. Cut list 15, Tyler said yes to the cut on the page 2026-11-21. |
| GR-6 | The Level table | From Level 50 the table of hours is the law. The four runs 106 hours ahead, so Level 100 lands at 494 hours and Level 400 on day 373. The law is fitted at the ruled points. MEASURED on run 44931089433: the four on Dangerous reads 1.263 and a four on Deadly that never dies 1.579. Whichever is the clock lands on the table, and the other reaches Level 400 on about day 305 or day 477. The clock is the four on Dangerous (S-11 c, RULED at the second sitting), read again before Early Access | PROVISIONAL. Waits on the kill reward and the tiers, because the seat's multiple is not one number until then. Tyler said yes on the page 2026-11-21. It changes The table of 2026-10-25, and "Level 400 is day 382" of 2026-11-21, which he let stand on the page. MEASURED in `12-balance-pass.md` (R0, R4). Waits on the seat re-read on the base of D-3 before FB-8 stage 3 fits the law, and on the playtest death rate |
| GR-7 | Death once Deadly bites | Keep 6% flat with no cap. Past the third Blessing a new one opens whenever a blessed death would cost over five hours. Rungs at Levels 97, 140 and 257. Ships with the harder tiers . Chapter 12 moved the threshold to 2 hours, and D-4 returns it to five after S-12 a | RULED (Tyler, 2026-11-21, the sitting). The five hours stays PROVISIONAL until a real death rate exists. The five hours is RULED by the designer 2026-11-21 (D-4), `review/06-designer-rulings-w1.md` section 5, and waits on FB-3's measures and the playtest death rate |
| GR-8 | Sinks as a share of a band's gold | Tempering, Hallmarks and linings cost a share of a band's gold, 1.2 to 1.4 of what the band earns. The slot gold follows the order of CE-4 first, then the castle | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists. Tyler said yes on the page 2026-11-21. It changes The typed prices kept on 2026-11-18 (Hallmarks 150k, 250k, 400k, 600k), which he let stand on the page |
| GR-9 | An old ground at your Level | Switch scaled hunts on as ruled, with one drop rule. Owned by `02-world.md`. It is the runway past the last region | PROVISIONAL. Waits on the playtest or measurement its own row names |
| GR-22 | Magic on a weapon hero | 0.5% max mana a Magic level for every hero | DECIDED (Fable 2026-11-21) |
| GR-23 | Skill at high Level, endless ladders | A hit stays skill plus gear. Rune tiers every 15 skill levels past 60. The Tower reads any floor from one row | PROVISIONAL. Waits on the kill reward and the tiers, because the seat's multiple is not one number until then |
| GR-26 | Chest weapons | Keep the flat skill bonus | DECIDED (Fable 2026-11-21) |
| GR-36 | The Catacombs | Their own mode. One wing and one key first. The one party table | PROVISIONAL. Waits on Deadly sized, and the system built |
| GR-37 | The Tower's beat | Weekly. Build the ruled fixes and stop | PROVISIONAL. Waits on Deadly sized, and the system built |
| GR-43 | The Crafting bench | The outfitter: cloaks, belts, linings, ammunition | DECIDED (Fable 2026-11-21). Cut list 10, Tyler said yes to the cut on the page 2026-11-21. |
| GR-45 | Runecrafting 61 to 99 | A Sealing Rune at 75 and 88 | DECIDED (Fable 2026-11-21) |
| GR-48 | Luck's feeds and the find list | Two feeds for Luck, a find list on the Honors page, and one remembered Setup for each ground, which holds weapon, worn set, linings, bar and target mode | DECIDED (Fable 2026-11-21) |
| GR-53 | The House dummy | It ends the yard fee. Unlock rungs by skill band at 25 to 50 hours of the fee | DECIDED (Fable 2026-11-21) |
| GR-54 | The yard's rate | It follows the skill curve and never passes half of hunting. Re-opens three rulings | PROVISIONAL. Waits on the store-bill fault fixed and a wage formula that exists. Tyler said yes on the page 2026-11-21. It changes 2026-11-14, and 21-7 and A-5 of 2026-11-20, which he let stand on the page |
| GR-61 | A permanent build choice | Lift the hold for a spec and a paper sample of five Kindling rungs only | SUPERSEDED by Tyler's 2026-11-21 ruling on level choices. See `10-level-choices.md`. It changes The skill tree hold of 2026-11-05, which he let stand on the page |
| GR-62 | Honors | One page, one rule, no power. A server line at Levels 100, 200, 300 and 400 | PROVISIONAL. Waits on the playtest or measurement its own row names |
| GR-63 | The rested bank and the old kill ladders | The rested bank is cut. Keeping the two old kill ladders as tracks on the one kill count is a PROPOSAL he has not seen | RULED (Tyler, 2026-11-21, the sitting) for the cut |
| GR-64 | No new skill and no prestige | No prestige, no rebirth and no fourteenth skill. A hero earns a talent point every five Levels, stored as rows, and no blow reads a Level (`10-level-choices.md`) | DECIDED (Fable 2026-11-21), amended by Tyler's 2026-11-21 ruling on level choices |
| GR-65 | Inner Flame and death | WITHDRAWN. A death takes Inner Flame progress like every combat skill, as ruled on 2026-10-25 | WITHDRAWN |
| GR-66 | The risk reading | Free for every player | PROVISIONAL. Waits on the playtest or measurement its own row names. Tyler said yes on the page 2026-11-21 |
| GR-73 | The Hall of Firsts | The Trophy room becomes the Hall of Firsts, with no mount rungs sold and a mounting fee for each piece hung. It builds ruling 26-6 | DECIDED (Fable 2026-11-21). Cut list 12, Tyler said yes to the cut on the page 2026-11-21. |
| GR-88 | The matrix as the gate | Owned by `09-platform-and-measurement.md`. It must carry band S11, XP after deaths | PROVISIONAL. Waits on the measuring tool's faults fixed and the full matrix run once. Tyler said yes on the page 2026-11-21 |
| MM-7 | A death in the boss room | The normal death, as one row on the mode table. One death a send, the first send on Normal, Blessings apply and the card shows the risk. Deaths stay inside the tier's death band. Built with GR-7 | PROVISIONAL. Waits on a real death rate, and Tyler's answer on the hunting hours a death costs an idle party |
| MM-25 | The buff caps | Damage +5% standing and +10% timed. Protection as Defense rating rows worth about 5% and 5% less damage an hour. Level XP +25% timed only, from the Hearthrise weekend. Material find +10% timed, earned only. Town work +10%. No coin buff | PROVISIONAL. Waits on one buff played in a cell |
| MM-26, MM-31 | The power budget and the pace ceiling | Owned by `06-mmo-layer.md` and chapter 04. One ceiling as a reading held by a test: 1.65 with every cap full, about 1.22 from paying alone. The table stays the plain four's clock and R1 is read on the fastest seat, about 1.36 | MM-26: PROVISIONAL. Waits on one buff played in a cell. MM-31: PROVISIONAL. Waits on one buff played in a cell. The clause re-derived after his two "no" answers was never put to him.. Tyler said yes on the page 2026-11-21 |

---

**Cuts in this chapter.** CUT, RULED at the sitting (S-9), cut list 7: the rested bank (GR-63). The two old kill ladders of the same cut line he kept on the page, and how they stay is a PROPOSAL. CUT (Tyler said yes on the page 2026-11-21), cut list 10: the Crafting bench's three salt recipes (GR-43).

**Ruled at the sitting.** RULED (GR-7, Tyler 2026-11-21, the sitting, S-5): the Blessing ladder. 6% flat stays. Past the third Blessing a new one opens whenever a blessed death would cost over five hunted hours. The five hours stays PROVISIONAL until a real death rate exists.


**Withdrawn.** GR-65 asked that a death take no Inner Flame progress. The adversarial check refused it, because Tyler was asked directly on 2026-10-25 and kept the loss. A death takes Inner Flame progress like every combat skill.

## 5. Still missing

| # | What nobody has decided | What decides it |
|---|---|---|
| 1 | **Krell's day against the table.** Day 18 and Level 100 at 600 hours cannot both be exact for the same seat | Closed for now. PROVISIONAL (GR-6b): day 31 for the plain four. Tyler let it stand on the page |
| 2 | **The time-averaged pace of a buffed four.** MM-26 gives the ceiling with every cap full. Nobody has said how many hours a week the timed caps can be full, so the day the first fours reach a region is a range of day 67 to 91 | Closed. MM-26 and GR-6a: a player who earns every buff and buys nothing averages about 1.3 times the plain pace over a month, and the fastest seat held all the time is about 1.36 |
| 3 | **Whether a bought timed boost may fill the Level XP cap.** MM-28 to MM-30 sell timed boosts for Crowns and put them in the same caps as earned buffs. A bought Level XP boost collides with the 2026-11-04 avoid list (no paid XP boost through the Crowns link) and the 2026-11-18 line that power is never sold directly for Crowns. The 2026-11-21 ruling says Crowns must give real advantages. Tyler has not said which wins for Level XP | Closed. Tyler said yes on the page (MM-29-XP). No Level XP boost is sold, for Crowns or for gold |
| 4 | **The seat's multiple.** One number, not known until the kill reward and the harder tiers are measured | A derivation run on the matrix after GR-5 and GR-27 |
| 5 | **The law's ramp at Level 50 and its fit through the ruled points** so a Level never gets cheaper | Closed. GR-6d: the convex cut with the smallest largest step |
| 6 | **The five hour threshold of the Blessing ladder.** It is a proposal. Three or eight hours would move every rung | GR-7 is RULED (Tyler 2026-11-21, the sitting). The five hours is ruled by the designer (D-4) and stays PROVISIONAL until FB-3 measures it and a real death rate exists |
| 7 | **Blessing prices for rungs 4 to 6**, and whether the set is always worth buying | Set by D-5: a fifth of the hours a rung saves. Read on band S10 |
| 8 | **What a death takes from a hero in a boss room on Normal for a new account.** Blessings are near free at low Level by the price rule, but nobody has walked a Level 20 four through its first boss weekend | The MMO decider, before MM-7 is final. A walk-through in `06-mmo-layer.md` |
| 9 | **The Kindling rows.** No rung exists. The re-light price, the number of rungs before the track thins out, and what fills the 2% are all unwritten | The paper sample of five, after GR-61 |
| 10 | **The Honors catalogue.** The sample of five is named and nothing else | The sample, then batches of 20 or fewer |
| 11 | **The Catacombs' own numbers.** Mode share, door Levels and the third wing's twelve rows are copies or proposals | The sample wing (GR-36) |
| 12 | **Tower landings past Platinum.** "One key tier a band" is ruled. Which band edges it follows waits on the gear curve's bands (GR-4) | `03-items-and-crafting.md` |
| 13 | **The one staged ground that closes the four days** between day 116 and the ruled 120 | Closed. GR-6a: no new ground. The Catacombs ground's band runs to Level 189, which is day 120 |
| 14 | **Who draws regions, and how fast.** The plain seat gains about 34 Levels a month past Level 110 and a buffed seat up to about 58 | The art and asset directors, then Tyler |
| 15 | **What one Premium gives across four heroes**: the 12 hour stamina bar, the daily training item, the analyzer | Closed. Tyler said yes on the page (PREM-1) |
| 16 | **How the first hour teaches thirteen skills to an account with four heroes** without four heroes training the same skill | The game designer, inside GR-79, with a walk-through against the real starting kit |
| 17 | **The Defense, Melee and Magic training bases on record** (three bases for three jobs) | Closed. GR-25: keep the three bases |
| 18 | **Whether a morning death card is a quit moment.** No simulation can answer it | Playtest 8, section 6 |

---

## 6. How we will know it works

**The matrix.** Each change is proven on the balance matrix before the next one leans on it (GR-88).

| Change | Kind of proof | Bands that judge it |
|---|---|---|
| The rested bank removed | Identity: the diff is empty | None may move. Proven: 207 cells, 0 flags |
| The two old kill ladders read the one kill count | Identity, on a fixture hero holding 20,000 kills: one counter a monster a hero, and the old rungs read it | None may move |
| The kill reward (R12) | Derivation: the typed fits are deleted and the pace band holds on every ground | P2 on every ground |
| The Level law (R13) | Derivation | P1: the pace seat reaches the ruled Levels within 10%, with 106 hours allowed at Level 100. P11: no Level under 10 over 2 hours, Level 10 in 5 to 7 hours, no Level over twice the one before. P12: at most 15 hours a Level to 300 and 24 to 400. Nothing in a fight may move |
| Sinks with the law (R16) | Derivation | G-10 and E4: a band's standing prices are 1.0 to 1.4 of the band's gold |
| The Blessing ladder | Coefficient | S11, blessed and unblessed: on the hardest tier the mid four holds, XP after deaths at the top of the ruled death count is at least Normal's. S10: the set costs under a fifth of the hours it saves |
| The harder tiers | Coefficient | S6: mid on Deadly dies 50 to 100 times in 1,000 hours, mid on Dangerous 10 to 30, best in slot on Deadly 10 to 30 |
| Gear states | Read on every run | P3, P4, P5, S5 |
| The power budget | The grid, no players | A plain mid four against a best in slot four with every cap full at Levels 20, 60 and 110: kill speed 1.25 to 1.40, Level pace 1.6 to 1.8, and no cell where the buffed four holds a tier the plain four cannot enter (this last clause fails by design on a cliff, `12-balance-pass.md` section 3.8, and is for Tyler, 12 section 7 item 4) (49 test G) |
| The runway | Printed on every run | R2 on the plain seat at 120 days. R1 on the fastest seat. R3 at 1.0 or more |
| Town skills | Read from data | T1: 60 to 120 days from 1 to 99 |

The representative run is Levels 10, 30, 60, 110, 185, 400, 1,000, 2,000 and 5,000, three gear states, Normal and the hardest tier. Levels past 185 are projected and say so.

**Is the instrument true.** Not yet, and the baseline says where. A four's pace reads about 10% slow against the one real four and can carry a decision. A four's gold and survival are direction only. A simulated hero that dies stands up and hunts on, so no death count from the simulator means anything until it follows the game's own rule. The ladder is therefore sized on the long death sample, never on a two hour cell.

**Only players can settle these.**

| # | Question | The playtest | Reads as |
|---|---|---|---|
| 7 | Does the table past Level 50 feel like progress or a wall? | The two heavy players after a week on the law | Sessions a day from Level 50 to 60 |
| 8 | Is a death read on the morning card a quit moment? | Beta telemetry on every death costing over one Level | Did the account press anything within 48 hours. Red if returns drop by a third |
| 9 | Does the risk reading change the tier a player picks? | The hunt report live | Share of hunted hours by tier. Deaths in 1,000 hours on Deadly |
| 12 | Are Kindlings a build or a formality? | Five sample rungs on paper, then on heroes | Under 80% of heroes of a weapon family on the same picks, and somebody re-lights |
| | Is one Honors page used? | Titles worn for each hundred heroes past Level 30, weekly | Under 10 after a month means cut the page |
| | Do Levels 7 to 10 hold a new account with four heroes? | The first invite wave | Share of new accounts reaching Level 10 |
| | Does the Catacombs pack stay a decision? | Four weeks of descents | Distinct packs a hero uses |
| H | Is a 60% pace edge felt, and is it resented? | The two heaviest testers, shown the ceiling table | Their own words. Direction only for MM-31 |

Numbered rows keep their numbers from the game review's list.

---

## 7. Superseded

| Dropped | Why |
|---|---|
| The fitted power law `0.643 x L^1.485` at 2.0 times the contract, and every hour, day and death cost quoted from it (56 phase A and the trial column of 56 §0.2) | Withdrawn by its author after the cold audit (61 C1). It is 31% fast at Level 100 and 30% slow at 400 on the full grid. The ruled table itself is the law (44 call 13) |
| Blessing rungs at Levels 160, 255, 410, 650 (56 phase A) and 100, 185, 275, 400 (60 first issue) | Typed by hand. The rungs are outputs of the five hour rule: 97, 140 and 257 |
| "MEASURED: Deadly pays less than Normal from Level 145" | It is computed on an assumed death count (61 C2). Kept only as the conditional tables of section 2.6 |
| "Past Level 200 four heroes alone on Normal is best" | True only if the ruled death band is reached with three Blessings. With the ladder it is false to Level 400 |
| The capped death (46, and 50-4's recommended option) | Tyler ruled 6% flat with no cap on 2026-11-21 |
| Deadly judged by XP lost (50-5 recommended) | Tyler ruled the flat death count |
| Rune tiers respaced to 1, 20, 40, 60, 80 (56 call 5) | It moves a 2026-10-23 ruling. The Sealing Rune fills the gap (47 C12) |
| Crafting's salts removed at once (56) | Until linings ship they are all Crafting makes at 45, 60 and 75 (47 C13) |
| Kindlings capped at one weapon-tier step (56 phase A) | The itemization fit's three fences are tighter: the 2% set aside for worn in |
| "No build choice on Level", which had refused marks every five Levels (46 change 5) in favor of Kindlings | RULED 2026-11-21: a build choice every five Levels is designed now and built with the first build. It is Talents, `10-level-choices.md`. No blow reads a Level, because points are stored rows |
| The Tower and the Catacombs merged into one mode (46 change 3) | Written without ruling 22-4. Judged after the descent is played |
| A gear band step that compounds (56 hypothesis, 50's "every 20 Levels") | Answered by the gear curve: linear in Level, bands by size (44, GR-4) |
| The party size ladder and every solo, pair and three band (P6, P7's pair and three rows, 50-8, the "REGRESSED for solo viable" finding of 56) | RULED 2026-11-21: no solo or group targets. Lone numbers are printed and judge nothing |
| Hero slot prices and "an own four is later by the slot ladder" (50 §2.7, 31-5) | RULED 2026-11-21: all four heroes from the start |
| "Krell at about month 4" (30-plan) and "month 4 to 6" (27-retention) | Stale 3.3 hour frame. RULED 2026-11-21 |
| The standards' runway table of a four at 2.2 times the contract (50 §2.7: Krell day 18, staged content day 60, Level 400 day 174) | Computed before the table was ruled to be the four's own clock. Kept only as the question in section 2.2 |
| The yard's flat rate kept until Level 300 (56's position on 44 call 15) | The synthesis (60, GR-54) recommends the rate follow the skill curve. It still needs Tyler, because it re-opens three rulings |
| The dummy halving the yard fee (60 first issue) | It reversed a payback Tyler approved on 2026-11-20 (61 C3). Rungs by skill band keep both rulings |
| P12 at 12 hours a Level | The ruled table itself needs 14.4 from Level 200 to 300 |
| The Bestiary counted for each hero (2026-10-22) | RULED 2026-11-20: it counts for the account |
| Premium for each hero (2026-10-17) | RULED 2026-11-21: one Premium for each account |
| The rested bank, the clan rested grant, the collection log, the charm ladder, the per-monster trophy ladder, the Shrine flame rungs, the Tower heat | Ruled cut (2026-11-20) or proven to pay nothing |
| Every comparison with the game as it stands, as a baseline | RULED 2026-11-21: judged against the target only. Measured numbers appear here only as evidence about a proposed design or about the simulator |

---

## 8. Source map

This chapter replaces these, for progression:

| Document | Sections replaced |
|---|---|
| `56-review-progression.md` | All of it. §0.2 to §0.5 corrected numbers are the source of sections 2.2, 2.5 and 2.6 |
| `60-game-review.md` | §1.5, §2.5, the progression rows of §2.6, §4.1 to §4.3, §4.7, §8.6, and rows 1 and 2 of §10.4 |
| `61-review-audit.md` | C1, C2, C3, H8 and H13 as they bear on GR-6, GR-7, GR-53, GR-54 and GR-65 |
| `62-decision-book.md` and `.json` | The Progression block, GR-6 and GR-7 in the decide-first list, MM-7, and the missing decision on MM-26 and MM-31 against the Level law |
| `44-formula-architecture.md` | §5.2 (the pace law and the XP chain), roadmap R5, R12, R13, calls 9, 10, 13, 14, 15, special rules P-X14, P-X15, P-X18, P-X20, P-X28 |
| `42-formulas-progression.md` | The Level curve, skill curve, death and yard findings, and where each breaks past Level 400 |
| `21-combat.md` | The pace rows (B3, B7, B8) and calls 21-7, 21-8, 21-9 |
| `22-endgame.md` | Calls 22-1 to 22-7 as they define the Tower, the Catacombs and the chest as progressions |
| `27-retention.md` | Calls 27-2 to 27-5 and 27-7, and the milestone cells |
| `50-standards.md` | §1.1, §1.2, §1.4, §2.1, §2.2, §2.5 to §2.7 as they frame this chapter, and rulings 1 to 5, 7, 9, 13 to 15 of §11 |
| `51-baseline.md` | Bands P1, P11, P12, S11 and the calibration verdict as it bears on pace and death |
| `49-mmo-layer.md` | §5.1 (death in the boss room) and §5.8 (the power budget) as they bear on the Level law |
| `47-itemization-fit.md` | C10, C12, C13, C19 |
| `itemization-plan.md` | §6 (chest gear as a progression), §8 (the skills, 1 to 99 and after), §13 answers 3, 4, 6 and 8, §15 (Luck v3.1) |
