# Hearthrise, the game we are building. Chapter 02: the world

Game designer, 2026-11-21, on `lane/d-book-world`. Design only. No game code, data or migration is touched.

This chapter is the design of record for regions, hunting grounds, monsters, bosses and halls, the Burning Tower and the Unmarked Catacombs. It replaces the world parts of the documents in section 8.

**How to read a status.**

- **RULED** carries the date or id of Tyler's ruling.
- **DECIDED** carries the call id and "Fable 2026-11-21". The game designer decided the call and an adversarial check corrected it. Its row is in `decisions/all.json`.
- **DECIDED (reversal, Tyler may veto)** changes one of Tyler's rulings. The first tag in the chapter names the ruling. It stands unless he vetoes it.
- **TYLER CONFIRMS** is a money call or a grant, with the one recommendation.
- **CUT (Tyler approves)** is a removal that waits for his yes.
- **OPEN** has no recommendation yet, and says what decides it.

**How to read a number.** TARGET is what the design aims at. COMPUTED is arithmetic on the ruled table or the formulas. REGISTER is a coefficient's starting value in the formula register (`tools/balance-program/formulas/knobs.json`), tuned only through the balance matrix. MEASURED is a matrix run on a proposed change, and it says how thin the run was. Formula ids (C-MON-STATS and so on) and step ids (R12 and so on) are from the formula architecture, which chapter 09 carries.

Every ground, monster, boss and key named here was checked against `src/data` on this branch. Names that exist only in the plan are marked "designed".

---

## 1. The experience

**Minute 5.** Your four heroes stand in the Mill Cellar. Rats come three at a time, nothing hits hard, and nobody dies. The Cellar is gentle on purpose. It teaches one thing: a hunt runs by itself and your job is what you send into it.

**Hour 2.** The Hunts page offers the Thicket and the Sewer. Each ground card says one line about what the ground asks. The Sewer says it swarms you. You put an area strike on a bar, send the four, and close the game. When you come back the log has a line worth reading: the Cistern Spider fell twice and dropped a Rare.

**Hour 20.** You are in the Barrow March. The Slake's card says frost. Krell's Hold says archers will shoot your back row. Those two grounds overlap in nothing you bring, so you keep a saved kit for each. You pick a harder tier because your tank and healer can hold it, and you watch the supply bill to see if you were right. A Hall Key drops about once a hunted day. You bank a few, then press once to fight the hall with all of them.

**Some weeks in.** The four walks into Krell's Hall with a tank, a healer and two more. He calls his guard at half health and rages under a quarter. You lose the first fight to the hall's fire, change one bar rule, and win the second. The prize is something no ground drops.

**Hour 2,000.** You are deep in the fourth or fifth region. The newest ground is still the best XP in the game. But the piece you want this week drops in the Pyre Field, a ground you left a year ago, so you buy hours there at your own Level and its monsters stand up to meet you. On the weekend the Tower's board moves because you gained Levels, the Catacombs ask what you packed, and a world boss stands over Havora with one health bar the whole server is cutting down.

The feeling the world must give at every one of those points is the same. Where you hunt is a decision, what you bring changes with it, and no ground is ever finished with you.

---

## 2. The design

### 2.1 The rules everything in this chapter obeys

| # | Rule | Status |
|---|---|---|
| W1 | Hunting is instanced. A party hunts in its own copy of a ground. Other accounts are seen and never fought over | RULED 2026-10-15. Presence is chapter 06 (MM-20) |
| W2 | Hunts are idle and keep running on the server after the browser closes | RULED 2026-10-18 |
| W3 | Any hero may enter any ground. A ground under your Level range is a warned choice with one confirm. No Level is refused | RULED 2026-11-04 |
| W4 | A monster's blow reads its stats against the hero's stats. Nothing in a fight reads the gap between a hero's Level and a ground's band | RULED 2026-11-04, 2026-11-18 |
| W5 | Balance is fixed at the formula layer. No ground, monster or boss carries its own math or its own patch | RULED 2026-11-21 |
| W6 | No immunities. Every resistance and weakness is a percent | RULED 2026-11-06 |
| W7 | A mechanic belongs in an idle hunt only when its answer is set before the hunt: a bar rule, a target setting, a piece of gear, a lining or a seat | DECIDED GR-31, Fable 2026-11-21. It is the test every mechanic in 2.5 passed |
| W8 | No random modifiers on packs. A ground's question is fixed and printed on its card | DECIDED GR-31, Fable 2026-11-21 |
| W9 | There are no balance targets by party size. The pace seat is an account's own four in mid gear | RULED 2026-11-21 (GR-67) |
| W10 | Nothing planned is cut. An unbuilt ground or mode stays hidden until it works | RULED 2026-11-21 |
| W11 | Every time number assumes 12 hunted hours a day, read in low, mid and best gear, to Level 400 and past it | RULED 2026-11-21 |

### 2.2 Regions, and the road to Level 400

A region is about 55 Levels, six grounds and two bosses. The last boss lives in a keyed hall. **RULED 2026-11-18** (itemization plan section 13, answer 8).

| Region | Levels | Grounds | Gear it carries | Elements its monsters use | State |
|---|---|---|---|---|---|
| Greenhaven | 1 to 50 | Mill Cellar, Meadowbrook Thicket, the Sewer, Wickstead, Mosslight Glade, Coppercap Warrens | Tiers 1 to 3 | Fire, frost, poison | Built |
| The Barrow March | 45 to 110 | Hask's Ford, the Slake, the Muster Barrows, the Pyre Field, Krell's Hold, then Krell's Hall | Tiers 4 to 6, tier 7 from the Hold and the Hall | Fire, frost | Built |
| The Morrow Hills | 110 to 165 | Carter's Rest, the Ox Road, the Night Shift (designed), Wyvern Roost, the Old Guard (designed), the Bellows (designed). Bosses: the Roost Mother (designed) and Father Gault (designed) | Finishes tier 7, then the first bands of named uniques | Fire, frost, poison. Necrotic arrives on the Ox Road. Storm arrives on the Old Guard | Three grounds built and hidden, three designed |
| The Unmarked Catacombs | 165 to 189 (the band runs to 189 so staged content lasts 120 days, GR-6a) | One ground under Havora, rooms and corridors. The descent (2.9) is a second door at any Level | The next band | Necrotic's home, with poison and frost | Ground built and hidden. Its loot rows are not written |
| Region 4 | 185 to 240 | Six, two bosses | The next bands | At least two, set with the region | Structure only |
| Region 5 | 240 to 295 | Six, two bosses | The next bands | Storm's home | Structure only |
| Region 6 | 295 to 350 | Six, two bosses | The next bands | At least two | Structure only |
| Region 7 | 350 to 400 and on | Six, two bosses | The next bands | At least two | Structure only |

Statuses for that table:

- The region list, the Levels and the elements are **RULED 2026-11-18** (plan section 2 and Appendix B2). Greenhaven's and the March's grounds are **RULED** as built. The Sewer opens at Level 5 (**RULED 2026-11-18**).
- The Catacombs ground stays as a hunting ground beside the descent. **RULED 2026-11-16.**
- "The next bands" is deliberate. How wide a gear band is belongs to chapter 03 (**DECIDED GR-4, Fable 2026-11-21, reversal of two bands a region of 2026-11-18 and the Luck step of 2026-11-20, Tyler may veto**: a band is one fixed step of the gear curve, opening at about +17%, with bands at Levels 110, 129, 151, 176, 206, 241, 282, 330 and 386, so every region holds at least one band edge). The world only promises that every region carries at least one band.
- Regions 4 to 7 have a shape and no content. Tyler ruled that they be sketched now (**RULED 2026-11-20, A-10**). No sketch of record exists. **OPEN**, see section 5.

**The rules every region follows.**

| Rule | Status |
|---|---|
| Equal counts of First Flame and Last Ember grounds past Krell. Hunting the opposite side's ground pays a faction benefit. No ground is closed to either side | RULED 2026-11-14 |
| A faction pair of grounds shares one Level band and one XP line. The pair differs by faction, weapon weakness, signature and drops, never by pay. Carter's Rest and the Ox Road are the first pair | DECIDED GR-32, Fable 2026-11-21 |
| A region opens in two steps: four grounds and its hall first, then its last two grounds. Six stays the planning number | DECIDED GR-33, Fable 2026-11-21 |
| A region names one new rule before its grounds are drawn: a new element, a new signature or a new monster trait that no older ground has. The Morrow Hills' rule is the factions plus Necrotic and Storm | DECIDED GR-33, Fable 2026-11-21 |
| No ground is best at everything. No bound gear. Gear is worn by Level only | RULED (plan section 2) |
| Villains are shared and never joinable. Krell ends the March, Gault ends the Morrow Hills. The next region continues the story | RULED 2026-11-14 |
| A new ground is authored as a pack of data rows. A batch is 20 rows or fewer, sampled and played first | RULED (CLAUDE.md section 10) |

**The runway at 12 hours a day.**

The Level table is the clock of a mid-geared four on the hardest tier it holds, and Level 400 is 4,580 hunted hours, which is day 382. **RULED 2026-11-21.** Read on that table, the pace seat reaches each door on these days. All days are COMPUTED from the ruled table (standards section 2.1). No account has played past Level 79, so none of them is a measurement.

| Door | Level | Hunted hours | Day at 12 h | A region lasts |
|---|---|---|---|---|
| The Barrow March | 45 | about 120 | 10 | |
| Krell's Hold | 88 | about 465 | 39 on the table, 31 if the table starts at Level 50 (GR-6) | |
| The Morrow Hills | 110 | 714 | 60 | 52 days |
| The Catacombs ground | 165 | about 1,350 | 112 | 19 days |
| Region 4 | 185 | 1,577 | 131 | 53 days |
| Region 5 | 240 | about 2,210 | 184 | 53 days |
| Region 6 | 295 | about 2,850 | 237 | 66 days |
| Region 7 | 350 | about 3,640 | 303 | 79 days |
| Level 400 | 400 | 4,580 | 382 | |

What the world owes that clock:

| # | Promise | Number | Status |
|---|---|---|---|
| RW1 | Grounds open at Early Access | At least 120 days for the pace seat. On the law that is everything through the Catacombs ground. Its band runs to Level 189, where the plain four stands at 1,440 hours, which is day 120. No new ground is drawn for it (GR-6a). At Level 185 it would read day 116 | RULED 2026-11-21 (standards call 7). The Level it lands on is COMPUTED |
| RW2 | A region is open before the first fours reach its door | 30 days ahead | RULED 2026-11-21 (call 7) |
| RW3 | Authoring pace | A new region at least every 53 days through region 5, then 66 and 79. A best-geared four is about 15% faster, so plan on 45 | COMPUTED from RW2 and the table. **OPEN**: no lane says who draws a region or how fast (section 5) |
| RW4 | Region 4 must be open | About day 55 after the Early Access wipe. That is 30 days before the fastest seat a player can hold all the time (about 1.36 times the plain pace) ends staged content near day 85 | COMPUTED. DECIDED (GR-6a, Fable 2026-11-21) |
| RW5 | Past the last open region there is always something to chase that needs no new ground | An old ground at your Level (2.6), the Tower's floors (2.8), the Catacombs (2.9), the Bestiary, Luck and Very Rares (chapter 05), world bosses and events (chapter 06) | DECIDED GR-9, Fable 2026-11-21 for the first. The others are RULED systems |
| RW6 | Level 400 is not an end | Every formula in this chapter is checked at Levels 1,000, 2,000 and 5,000 on the matrix | RULED 2026-11-21 (formula brief section 7). The check is chapter 09's |

One conflict sits under this table and this chapter does not hide it. Tyler ruled that Krell is day 18 for a four (2026-11-21). The same day he ruled that the Level table is the four's own clock. On that clock Level 88 computes to day 31 to 39. Day 18 came from a four running at 2.2 times a table timed on a lone hero. Both rulings cannot hold at once. If day 18 is the truth, a four passes Level 185 on day 60, and 120 days of ground at Early Access means regions 4 and 5 must be finished too. **DECIDED (GR-6b, Fable 2026-11-21, reversal of "day 18 for a four" of 2026-11-21, Tyler may veto):** Krell's Hold is day 31 for the plain mid-geared four, and a four with best gear and buffs is there between day 18 and day 24. Every chapter quotes that one day, and RW1, RW3 and RW4 are read on it.

### 2.3 What a hunting ground is

A ground is a pack of data: a map with pockets, five or so monsters with their weights, a route, its drops, and one row that says what kind of fight it is. Nothing about its XP, coin or danger is typed by hand.

**The ground row.** These are the only things a ground declares.

| Field | What it holds | Status |
|---|---|---|
| Band | Floor and top Level. A ground is in range across its band and the card shows it | RULED |
| Region and faction | Past Krell every ground belongs to the First Flame or the Last Ember | RULED 2026-11-14 |
| Encounter type | Plain, or built for a party. A party ground's monsters carry three numbers from the formula: more health, a softer blow, and XP for each health point (`partyGroundHp`, `partyGroundBlow`). The Sewer, the Warrens and the Muster Barrows are the party grounds | DECIDED GR-5, Fable 2026-11-21. MEASURED on the proposed removal of the type: without it a four on Normal runs out of monsters and falls to 0.74 to 1.31 of the pace line, so the type stays |
| The roster | Monsters with a role and a weight each. The mix is uneven: a common majority, some uncommon, one rare variant | RULED 2026-10-18 |
| Pockets and packs | How many stand in each pocket on Normal, the respawn, and the largest pull its rooms can hold | Content facts. DECIDED GR-27, Fable 2026-11-21 that the rooms' limit is the only pull number a ground owns |
| The signature | One question the ground asks, from the list in 2.4 | DECIDED GR-31, Fable 2026-11-21 |
| Wall element | The element of its group spell, and the monster part that makes the lining against it | RULED 2026-11-18 |
| The named rare | One elite with a phase trait (2.5) | DECIDED GR-35, Fable 2026-11-21 |
| The boss | On the last pocket of the route, where a ground has one | RULED as built |
| Nodes | Ore, wood or other gathering nodes, with the gather setting | RULED as built. Chapter 07 |

What a ground does **not** declare: an XP multiplier, a gold multiplier, its own tier dials, or a health override. What a kill pays is derived from the pace line and one reference kill rate (`paceContract`, `killRateRef`, step R12), the same way on every ground. **DECIDED GR-5, Fable 2026-11-21.** The formula analysis says the missing kill-rate term is why grounds needed hand corrections. That cause is not yet proven by a derivation run on the matrix, and that run is the proof this design waits for.

**The three tiers.** One choice for each ground, remembered for each ground. In a party the leader chooses and members read it.

| Tier | What it is | Status |
|---|---|---|
| Normal | The ground as built. In range it is near zero risk | RULED 2026-10-25, 2026-11-05 |
| Dangerous | A bigger pull, a percent more difficulty, a percent more XP | RULED 2026-11-05, 2026-11-07 |
| Deadly | The biggest pull the rooms hold, hits hardest, pays most XP | RULED 2026-11-05, 2026-11-07 |
| Coin for each kill never changes with the tier | | RULED 2026-11-07 |
| One difficulty for every party size | | RULED 2026-11-08 |
| The harder tiers hit harder, sized on a party with a healer and monsters that shoot the back row | | RULED 2026-11-20 (21-3) |
| A mid-geared party on Deadly dies 50 to 100 times in 1,000 hours, at every Level | | RULED 2026-11-21 |
| One tier table for every ground. One pull number for each harder tier. No ground carries its own tier dials (`tierPull`, `tierDanger`, `tierHp`, `tierXp`) | | DECIDED GR-27, GR-5, Fable 2026-11-21 |
| Dangerous brings five. Deadly brings the full box of eight, or the most the rooms hold | | DECIDED GR-27, Fable 2026-11-21 as the leading candidate. MEASURED on the proposed pull, one seed and one hour a cell, at the dial of the test build: a hero in band holds five near 35 to 49% health with no deaths, for 35 to 65% more XP than Normal, and a four keeps 2.1 to 2.5 of the pace line. Not yet played at the ruled harder dial. The harder tiers lane sets the number from its long sample |
| Deadly is sized so a four with a shield tank and a healer holds it, and a four without them does not | | DECIDED GR-3, Fable 2026-11-21. Chapter 01 owns the dials |
| The Mill Cellar offers Normal only. A tier a ground or mode does not offer is one content flag | | RULED 2026-11-05. The flag is DECIDED GR-25, Fable 2026-11-21 |
| The gentle ramp: a ground whose floor is Level 8 or under has monsters that land less often and hit softer, rising in a straight line to the full formula at floor 16. It is the only Level threshold in monster stats | | DECIDED GR-25, Fable 2026-11-21 |

**The ground card.** Each card shows the band, the tier, what the ground asks in one label, the best weapon against its monsters, its wall element, its drops as a percent for each kill, and its named rare. The words come from the ground row. The layout is the art director's. **DECIDED GR-31, Fable 2026-11-21.** Chapter 08 owns the screen.

**Remembered once.** The tier and one Setup are stored for each ground and applied when the party moves there. A Setup holds the weapon, the worn set, the linings, the unique, the bar and the target mode, and it can be copied to another hero or ground. **RULED** for the tier (2026-11-05) and **DECIDED GR-48 and GR-84, Fable 2026-11-21** for the Setup. A ground you have set up once never asks again.

### 2.4 Every ground asks one question

A signature is a fact about a ground's composition: which roles, which spell, at what weight. It is a content row, never a rule of its own. Its strength is one shared coefficient for every ground, so six signatures do not become six sets of hand dials. **DECIDED GR-31, Fable 2026-11-21.** That players change what they bring is a HYPOTHESIS, and playtest 5 in section 6 is what settles it.

| Signature | Made of | What answers it, set once |
|---|---|---|
| Volleys | Shooters at a higher weight | A shield wall for the back row, a healer rule, armor on the casters, the "shooters first" target mode (GR-19, chapter 01) |
| The cold, the fire, the poison | A group spell on a common monster | The lining for that element |
| Menders | A mender in most pulls | The target setting, a burst slot, Necrotic's cut to healing |
| Shield wall | Heavies as the majority | A hammer or magic |
| The swarm | A pull one or two larger than the tier's, all swarm | An area slot |
| Glass and fast | Glass as the majority | Defense, a shield, food |

**How a signature is dosed.**

- On the harder tiers it bites at full strength. TARGET: a party that does not answer it pays 1.5 to 2 times the supply bill of one that does. A death comes only far under the band, because a death costs 6% of all Level XP.
- On Normal it is taught by how often it happens, not by how hard it hits. MEASURED on the proposed doubling of the Slake's Cold Bilge: on Normal nothing moved, because a pull of four dies before the caster casts. On Deadly a pair's bill rose 35 to 47% and a four's worst moments fell from 68% health to 33%. Nothing off the Slake moved.
- The limit on a regular monster's spell against a hero at the ground's floor becomes a curve by the hero's answer, in place of one flat number. **OPEN.** It is a formula question for chapter 01.

**The grounds.** The two sampled first are the Slake and Krell's Hold. The rest are assignments from each ground's existing rows, expanded only after the sample is played.

| Ground | Band | Built for | It asks | Carried by | Wall element | Named rare | Boss |
|---|---|---|---|---|---|---|---|
| Mill Cellar | 1 to 4 | The first minutes | Nothing. Normal only | | | | |
| Meadowbrook Thicket | 5 to 15 | The first plain fight | Nothing. It teaches the plain fight | | | Dire Gray | Old Grayjaw, kept plain |
| The Sewer | 5 to 25 | A party | The swarm | Drain Rats and Culvert Bats in big packs | Poison | Cistern Spider | The Rat King |
| Mosslight Glade | 16 to 31 | Any | The poison | The Walking Vine's spore cloud | Poison | Goblin Sluicer | Rook the Poacher, who gains a phase row |
| Wickstead | 20 to 32 | Any | **OPEN.** Candidates from its rows: the Barn Spider's venom or the Turncoat's smoke | | Poison or fire | None yet. It needs one | |
| Coppercap Warrens | 32 to 50 | A party | The fire | The Goblin Digger's blasting charge | Fire | Hobgoblin Foreman | Chief Coppercap |
| Hask's Ford | 45 to 60 | Any, the March's plain entry | Shield wall | The Fordsunk and the Bannerman | | Bannerman | |
| The Slake | 58 to 72 | Any | The cold. **Sample** | The Bargeman's Cold Bilge | Frost | Color Sergeant | |
| The Muster Barrows | 55 to 75 | A party | **OPEN.** Its regulars cast nothing. A second shooter ground in the March is the leading idea | | | Barrow Knight | Captain Hask |
| The Pyre Field | 70 to 90 | Any | The fire | The Stoker's burning ash | Fire | Provost | |
| Krell's Hold | 85 to 110 | Any | Volleys. **Sample** | Hask's Lookouts, with the Pyre Priest mending | Fire | Gatekeeper, who drops the Hall Key | Lord Krell, in his Hall |
| Carter's Rest | one band with the Ox Road, from 110 | Last Ember's ground | The swarm | Troll Pickers | Fire | The Landlord | |
| The Ox Road | the same band | First Flame's ground | Menders | The Drover | Necrotic | Wagonmaster | |
| The Night Shift (designed) | 122 to 140 | | **OPEN** | | Poison | | |
| Wyvern Roost | 125 to 142 | Ranged heroes. Swords are resisted | Glass and fast | Wyvern Fledglings and the Ledge Wyvern | Fire | Brood Wyvern | The Roost Mother (designed) |
| The Old Guard (designed) | 138 to 155 | | **OPEN** | | Frost, and Storm as a second spell | | |
| The Bellows (designed) | 145 to 165 | | **OPEN** | | Fire | | Father Gault (designed), in his hall |
| Unmarked Catacombs | 165 to 189 | Rooms and corridors | **OPEN.** Necrotic's home | Night Carter, Keeper Dunn | Necrotic, poison, frost | Keeper Dunn | |

Statuses for that table:

- Bands are **RULED** as built or as planned, with two moves. Wickstead moves from 8 to 18 up to about 20 to 32, and the Slake from 50 to 65 up to about 58 to 72. Both fill a band that held one ground, and both are data. **DECIDED GR-32, Fable 2026-11-21.**
- Carter's Rest and the Ox Road share one band near 110 to 128. **DECIDED GR-32, Fable 2026-11-21.** The exact band is set when the pair is re-fit.
- Signatures are **DECIDED GR-31, Fable 2026-11-21**, except the rows marked OPEN, which are assigned in the batch after the two-ground sample.
- The Catacombs ground opens only when grounds exist for Levels 142 to 165. **DECIDED** (no call id, Fable 2026-11-21, from world review G15). Wyvern Roost and the Catacombs ground cannot be judged until their loot rows are written, which is chapter 03's work.
- New maps go where the days are. The first 45 Levels hold six grounds and take under a week. Levels 85 to 110 hold one ground and take about three weeks. **DECIDED GR-32, Fable 2026-11-21.**

### 2.5 Monsters

**One formula writes every monster.** A monster is a Level, a role and an encounter type. `C-MON-STATS` writes its health, blow, aim, evasion, defense, XP and coin. **RULED** as the architecture (2026-11-21, formula layer). **DECIDED GR-86, Fable 2026-11-21** that every monster row reads it with no hand-typed stats (step R21).

| Part | Formula | Knob | Label |
|---|---|---|---|
| Health | (4.95 + 1.76 x Level) x role x encounter type | `monsterHp`, `partyGroundHp` | REGISTER |
| Blow | A share of a same-Level hero's base health, 13.2% on a gentle ground rising to 22% | `monsterDamage`, `heroHp` | REGISTER |
| Aim | Lands 70% on the reference hero at equal Level, 40% on a gentle ground | `monsterAccuracy` | REGISTER |
| Defense | 0.08 a Level, times the role | `monsterDefense`, `monsterDefenseCut` | REGISTER |
| XP and coin | Priced for each health point, then derived from the pace line and the kill rate | `xpPerKill`, `coinLine`, `killRateRef` | REGISTER, then derived at R12 and R9 |

The health line is a combat number, a pace number and a gold number at once, because XP and coin are priced on it. Combat owns it, and any move to it is judged on all three. Tyler's standing direction is that monsters are a little harder everywhere, one step of the formula and never a ground at a time (**RULED 2026-11-19**, a default of +10% health and damage). The final value is set through the matrix with the harder tiers.

**Six roles.** REGISTER values, as multipliers on the formula.

| Role | Health | Blow | Defense | Its job in a pull |
|---|---|---|---|---|
| Swarm | 0.8 | 0.85 | 0.5 | Numbers. The first kills |
| Regular | 1 | 1 | 1 | The common majority |
| Glass | 0.75 | 1.1 | 0.5 | Fast, fragile, hits hard |
| Heavy | 1.2 | 0.8 | 3 | Holds the line. Often carries the ground's spell |
| Elite | 1.6 | 1 | 4 | The named rare. Carries the Rare rows |
| Boss | 5 | 1.1, held to a third of the health of a hero at his ground's floor | | One fight with phases |

The boss blow bound is **DECIDED GR-25, Fable 2026-11-21**. It says a boss must never one-shot the hero his ground is written for.

**Classes, weakness and elements.**

| Rule | Number | Status |
|---|---|---|
| Eleven monster classes. A weapon that matches a class does more damage and lands more often | 1.20 damage, 1.15 accuracy (`weaknessDamage`) | RULED as built. REGISTER |
| An element a monster is weak to | 15% more | RULED 2026-11-06 |
| An element it resists | 25% less. What was once an immunity is 50% less | RULED 2026-11-06 |
| Only people are weak to Necrotic | | RULED 2026-11-21 (32-7) |
| The ground card names the best weapon against the ground. The Barrow March is undead on 16 of 17 rows, so the hammer leads there for 40 Levels, and the card says so | | DECIDED GR-31, Fable 2026-11-21 |

**Mechanics that work in idle combat.** Each one below exists as a data model, and each has an answer the player sets before the hunt (rule W7).

| Mechanic | What it does | The answer | Status |
|---|---|---|---|
| Group spell | The whole party takes damage. The windup is shown and it cannot be stepped out of | The lining for its element, a party heal rule | RULED 2026-11-08 |
| Marked spell: cone, ring, line, blast | A heavy hit on a place. The tank holds it, ranged heroes and casters step off | A shield braces it. Seats | RULED 2026-11-08 |
| Shooter | Hits the back row | A shield wall, armor on casters, the "shooters first" target mode | RULED as built. The one mechanic on record that changed a real party's hunt: 28% of a four's damage landed on the healer |
| Mender | Heals its pack | The target setting, a burst slot, Necrotic | RULED as built |
| Phases: adds, a guard while adds stand, an enrage, a hastened spell | A fight in stages | Challenge, an area slot, the target setting, the eat rules | RULED 2026-11-05 for bosses |
| Phases on any monster | A phase is a monster property, not a boss property. Elements, the guard and the adds read the same row door as every other stat | | DECIDED GR-35, Fable 2026-11-21, with formula step R3 |

**The named rare is an event.** Each ground's elite carries one phase trait: a guard while its packmates stand, or a small wave, or an enrage. It is about one pull in 24. It teaches the questions a boss asks before the boss does, and it puts a line in the log worth reading. Old Grayjaw stays plain, because a first ground teaches the plain fight. **DECIDED GR-35, Fable 2026-11-21.**

**Considered and not in the game.**

- Random affixes on packs. In an idle hunt a random modifier is a cost nobody chose. The signature is the idle form of the same idea. **DECIDED GR-31, Fable 2026-11-21.**
- A status that opens a monster to one kind of damage is a sample of three pairs only. **DECIDED GR-20, Fable 2026-11-21** in chapter 01, and a HYPOTHESIS.
- A blow that breaks a monster's spell windup belongs to the hammer's Earth rune strike. **DECIDED GR-18, Fable 2026-11-21, reversal of "no stagger" of 2026-10-23, Tyler may veto** in chapter 01.

**Rows that leave.** 103 monster rows stand in no hunt, three hunts have no ground (Bramble Edge, Goblin Warren, Ridge Camp), and four boss copies exist only for a second boss door. None is on any roadmap, so the no-cut ruling does not protect them. They are removed, and their art stays in the library. Two conditions: about 80 items wait on monsters from that roster and are checked first, and the list goes to Tyler as part of the one cut list. **DECIDED GR-34, Fable 2026-11-21. CUT (Tyler approves), cut list 1.** Nothing is deleted before he has seen the list.

### 2.6 An old ground at your own Level

Levels never end and maps do. This is the system that makes the two fit.

| Rule | Detail | Status |
|---|---|---|
| Any outgrown ground can be hunted at the party leader's Level | The same rows through the same formula, with the ground's floor moved to that Level and every monster up by the same gap (`C-SCALED`). It is the read the Tower already uses for any roster | RULED 2026-11-07 |
| It is bought by the hour | A slider, up to 24 banked hours a ground. Time ticks down only while hunting there, on the server clock | RULED 2026-11-07 |
| The price | A share of an hour's wage at the hero's Level (`wageShare`) | DECIDED GR-51, Fable 2026-11-21, chapter 04 |
| Normal and Dangerous only | The same content flag the Mill Cellar uses | DECIDED GR-25, Fable 2026-11-21 |
| It always pays less Level XP than the ground at your Level | Its XP share is an output of the kill reward, never a typed number. TARGET: under 1.0 of the at-Level ground on every ground at every checkpoint, alone and as a party. A HYPOTHESIS of 0.85 to 0.9 at the frontier | RULED 2026-11-20 (22-9) for the direction. The derivation is DECIDED GR-5, Fable 2026-11-21 |
| One drop rule | It drops its own rows at its own rarity. Gear rows pay at the hero's band. Past tier 7 its hourly drop is crafting stock and gem chips. The rarer-Rare step is read at the band the loot is paid at. Its lining parts still drop | DECIDED GR-9, Fable 2026-11-21. "Loot scales" is RULED 2026-11-07, and lining parts from old grounds are RULED 2026-11-18 |
| It keeps its signature, its named rare and its Bestiary lines | So at Level 150 "where do I hunt" has fifteen answers that differ by drops, parts, weakness and what they ask, never by XP | DECIDED GR-9, Fable 2026-11-21 |
| Free against paid | The system opens as ruled, with the hourly price. Whether players at the frontier use it is read for two weeks (playtest 4). The price is one data row and can go to zero. Free depth on every ground is the leading design if the reading supports it | DECIDED GR-9, Fable 2026-11-21 |
| A new region stays the best XP in the game and the only source of new named pieces | | DECIDED GR-9, Fable 2026-11-21 |

Three things this system is for. It is the standing answer past the last open region (RW5). It is how a lining part from an old ground stays reachable. And it is the only way the Bestiary's long stages can be finished: COMPUTED on the Landlord of Carter's Rest at about 20 kills an hour, stage 1 of 2,500 kills is 125 hunted hours and stage 4 of 20,000 is 1,000, while a hero is in that band for about 135.

**Whose Level: the leader's, as ruled. DECIDED (MM-19, Fable 2026-11-21).** The ruling says the leader's. The world review asked for the lowest hero's, so a veteran and a newer friend can share a ground and nobody dies to it. An account's own four are near one Level, so this matters only for mixed accounts. It is decided with MM-19 in chapter 06, which sets the one visible rule for mixed Levels in a fight.

### 2.7 Bosses and halls

**One boss door.** Every boss has a hall, and every hall has a key. **DECIDED GR-28, Fable 2026-11-21, reversal of 2026-11-14 and 22-8, Tyler may veto.** It re-opens the 2026-11-14 rulings on the boss call and the daily kill, and 22-8.

| Rule | Detail | Status |
|---|---|---|
| A boss stands on his ground's route | The last pocket. He pays like a monster with a rare table. Every hunt meets him | RULED as built |
| A hall is one room and one fight | A time limit of 10 minutes. His kill ends it. A death ends it. Nothing resets | RULED as built |
| A key opens the hall | It drops on the hall's ground from the named rare. Any seat's key opens the door. It is used win or lose | RULED 2026-11-11 (the Gatekeeper drops the Hall Key), and as built |
| Hall Keys trade | | RULED |
| One key is one prize roll | The key is the only clock. No second daily limit sits on top of it | DECIDED GR-28, Fable 2026-11-21, reversal, Tyler may veto. Replaces one roll a hero a day (RULED 2026-11-14), which stands until this is ruled |
| A key's pace | TARGET: about one key a hero a hunted day | DECIDED GR-28, Fable 2026-11-21, reversal, Tyler may veto. The number is chapter 03's drop band |
| Fight with N keys | One press on the hall's door. The fights run one after another like a hunt, with the bar and party remembered, and they stop at the first death, as every hunt does | DECIDED GR-28, Fable 2026-11-21, reversal, Tyler may veto |
| A hero's first roll on a hall always lands a piece | | RULED 2026-11-14 |
| A mid-region boss's pieces stay repeatable | Under one key, one roll, a hero can spend every key it finds. This keeps the Morrow weapon grid whole, where the Roost Mother's pieces are a family's first unique | DECIDED GR-28, Fable 2026-11-21, reversal, Tyler may veto |
| Which bosses have halls | The Rat King, Chief Coppercap, Captain Hask and Lord Krell, then the Roost Mother and Father Gault, then two in every later region. Old Grayjaw and Rook stay route bosses | DECIDED GR-28, Fable 2026-11-21, reversal, Tyler may veto. Old Grayjaw and Rook stay route bosses for good, so no hall exists under Level 20 |
| A hall is built for a four | The card says the party it asks for. An account has four heroes from its first day, so every account can field one | RULED 2026-11-17 for Krell, 2026-11-21 for the four heroes |

**What a hall boss is.** The formula's boss role at his Level, times one hall number that is the same for every hall. The hall number acts on the boss's health, and so on the 10 minute clock, never on his blows. A hall lost on Normal by a mid-geared four in band is lost to the clock, and deaths in a hall stay inside the death band of the tier chosen. No boss is tuned by hand. The Rat King is one monster row, used on the Sewer route and in his hall. **DECIDED GR-30 and GR-28, Fable 2026-11-21.** HYPOTHESIS until the hall grader plays it at Levels 25, 52 and 75.

- TARGET: a four in band, in mid gear, on the food the card names, wins 80 to 90% of fights. The weakest named lineup loses, and so does the same party on the next cheaper food. A guard holds that floor (HA-FLOOR).
- Evidence for sizing it: on the proposed spell rule every one of 36 tested parties won Krell's hall 38 to 40 times in 40. That is inside the letter of the fit and outside its purpose. If every party wins, the party you bring does not matter.
- His phases are the same data rows any monster may carry: adds at half health, a guard while one stands, an enrage under a quarter, and one spell that casts faster under his line. **RULED 2026-11-05.** The tank holds his heavy hit, the casters step off it, and an unavoidable pulse reaches the whole party now and then. **RULED 2026-11-08.**

**What a hall's prize holds.** Only what no ground drops. **DECIDED GR-29, Fable 2026-11-21.**

| On the roll | Not on the roll |
|---|---|
| The boss's own uniques, each a sidegrade with one real property | Standard tier gear. It drops on grounds like every other tier |
| The region's gem for jewelry | Coin beyond what the fight pays |
| A Trophy | |
| The first-win piece | |

**Krell's Hold and Krell's Hall.** The Hold is the last ground of the Barrow March, Levels 85 to 110, and the longest single stretch in the first two regions. The Hall is the end of the region.

| Part | Design | Status |
|---|---|---|
| The Hold's question | Volleys. The Lookouts shoot the back row and the Pyre Priest mends | DECIDED GR-31, Fable 2026-11-21 (sample) |
| The key | The Gatekeeper drops the Hall Key | RULED 2026-11-11 |
| The party | A tank, a healer and two more. A three losing is fine | RULED 2026-11-17 |
| When | Weeks, not months | RULED 2026-11-21. The day is the open conflict in 2.2 |
| Tier 7 | Tier 7 drops like every tier. Dawnsteel armor is the Hold's hourly drop. Dawnsteel weapons, the shield and the spellbook are Scarce rows in the Hold. None of them is a Rare row, so the Hold's six Rare rows stay free for its named pieces | DECIDED GR-29 and CE-6, Fable 2026-11-21. Evidence: MEASURED, a hero without his tier 7 weapon hunts the Hold about 9% slower |
| The Hall's roll | Krell's two ruled uniques (heavy legs with physical resistance, a tank shield), five sidegrade weapons that take the plain rows' place, his gem, his Trophy | Uniques RULED 2026-11-14 and 2026-11-18. The rest DECIDED GR-29, Fable 2026-11-21. Items are chapter 03's |
| Drops stay generous through Krell and turn really rare after | | RULED 2026-11-20 |
| His rows | Left alone until hand rows move onto the formula, then he is the boss role times the hall number | DECIDED GR-30, Fable 2026-11-21 |

**How a world boss connects.** A world boss (chapter 06) is the same boss room. Each account sends its four into its own room, the boss is the formula's boss role at that party's Level, and the party's damage comes off one pool the server shares. **DECIDED MM-2, Fable 2026-11-21.** It reuses three things from this chapter: the boss room, the formula at any Level from 2.6, and phases as data. What it pays, how big the pool is and what a death costs there are chapter 06's (MM-3 to MM-7). The boss door is ruled before the world boss so events build on one boss system.

### 2.8 The Burning Tower

A weekly test of how strong your party is. It scores preparation, not hours at the screen.

| Rule | Detail | Status |
|---|---|---|
| Its own challenge | Floors get harder as the party climbs. Each floor is the stat formula at that floor's Level | RULED 2026-11-14 |
| The curve is one row | Levels for each floor. TARGET: a set-up four tops out between its Level and its Level plus 25, at every Level. Two Levels a floor is the evidence value | RULED 2026-11-20 (22-1). Sized after the combat laws land |
| It never ends | Floors read the formula at any Level, past floor 300 | DECIDED (no call id, Fable 2026-11-21, step R22, chapter 09) |
| A death costs nothing | In exchange the Tower pays 37.5% of a kill's Level XP, about half of hunting's XP an hour, and no coin | RULED 2026-11-14 |
| No hero from Level 10 to 30 earns more in the Tower than hunting | The kill share is fit on a played hero | RULED 2026-11-20 (22-7) |
| It opens at Level 10 and uses stamina | A line tells the player the door opened | RULED 2026-11-18. The line is DECIDED (no call id, Fable 2026-11-21, 22 card T4) |
| Landings every 10 floors | Before a run pick any landing up to your best. A party starts at the highest landing every member has reached | RULED 2026-11-16 |
| Each landing cleared gives a key | Bronze, Silver, Gold, Platinum, then later tiers as an open table. TARGET: the Silver, Gold and Platinum landings arrive near Levels 25, 58 and 100 | RULED 2026-11-14. The Levels follow from 22-1 |
| Keys open the Hearth Chest | Six opens a week for each hero for the Tower's key family. The limit is on opens, not on keys earned. About 30 keys can be held | RULED 2026-11-16, kept 2026-11-21 |
| A hero opens only keys from a landing it has itself reached | Keys may pass between an account's heroes through Storage and never trade outside it | RULED 2026-11-20 (22-5), 2026-11-14 |
| The climb is a standing order | "Climb the Tower" is a line inside the after-the-hunt plan, and the week's opens are one press for the account with the remembered stoke | RULED 2026-11-20 (22-6, as amended) |
| It stays weekly | No daily mode. The ruled fixes are built and nothing is added | DECIDED GR-37, Fable 2026-11-21 |
| It takes the one party XP table | No second table by size | DECIDED GR-36, Fable 2026-11-21 |
| A board | Best floor ever, for heroes and parties | RULED 2026-11-14. **OPEN**: once the top floor follows Level, the board needs a "this week" view or a season |

What is in the chest (weapons at the next tier's numbers, warmth, stoking, reforging a piece up a key tier, two-attribute pieces from the Level 200 key, fusing) is chapter 03's. The Tower's job in this chapter is to be a formula-made place whose top moves with every Level a hero gains.

### 2.9 The Unmarked Catacombs

Its own mode, with its own question. The Tower asks how strong your party is. The Catacombs ask what you packed.

| Rule | Detail | Status |
|---|---|---|
| Its own mode, its own board | A descent under Havora. A second door at any Level, beside the 165 to 185 hunting ground | RULED 2026-11-16 |
| Pick a wing before the run | No forks during the run. The Flooded Wing pays the Waterlogged Key and leans to boots. The Bone Wing pays the Bone Key and leans to helmets. The lean is 70 to 30 | RULED 2026-11-16 |
| A vault door every 10th room | Bronze at rooms 10 to 30, Silver at 40 to 60, Gold at 70 to 90, Platinum from 100 | RULED 2026-11-16 |
| The same Hearth Chest, the same key tiers | The reward line is armor. Six opens a week for the Catacomb key family, counted apart from the Tower's six | RULED 2026-11-16 |
| The store does not reach you | You fight on the food, drink, runes and arrows you carried down, and the run ends when they are gone. This is the one place running out of a supply ends a run | RULED 2026-11-20 (22-4) |
| Clan rations may go down with you | Limited by the week | RULED 2026-11-20 (30-8) |
| A death costs nothing | Keeper Dunn carries you up. About half of hunting's XP, no coin | RULED 2026-11-16 |
| The pack is a preset | Chosen once, refilled in one press | DECIDED (no call id, Fable 2026-11-21, 22 card). It is the first-principle rule applied here |
| Build one wing and one key first | The played sample comes before the other 36 armor pieces. The mode's numbers are copies of the Tower's until the matrix plays them | DECIDED GR-36, Fable 2026-11-21 |
| The descent walks the map's chambers | A new room every ten doors, so the mode shows the place Tyler asked for | DECIDED (no call id, Fable 2026-11-21, 22 card, its row C2) |
| A glove wing | The ruled home for won gloves, built after the sample | RULED 2026-11-18. BUILD-LATER |

The HYPOTHESIS to test: a pack is a preset, so the packing decision may be made in the first three descents and then repeat unchanged. It stays a decision only if deeper doors change what the right pack is.

---

## 3. How it connects

| Chapter | This chapter reads from it | This chapter feeds it |
|---|---|---|
| 01 Core and combat | The hero's stats, the amount pipeline, the tier dials and what Deadly asks (GR-3), target modes (GR-19), spell rules, Necrotic and Storm | The monster formula, roles, monster spells and phases, each ground's signature, the pull each tier brings |
| 03 Items and crafting | The gear curve and bands (GR-4), drop bands in hours (GR-87), the six Rare rows a ground (GR-42), special pieces and signature stones on three grounds (GR-40), linings, the Hearth Chest's contents | Where every item drops: ground rows, hall rolls, the drop rule for an old ground, the wall element and its lining part, the ground template |
| 04 Economy and Crowns | The wage curve that prices an hour on an old ground (GR-51), key trade, the supply bill | Coin for each kill as one line, the sinks a ground creates (linings, hours on old grounds), what keys are worth |
| 05 Progression | The Level table and its start (GR-6), the cost of a death and Blessings (GR-7), the Bestiary, Luck, Honors (GR-62) | The door days in 2.2, kill XP as a derived number, Tower and hall firsts as honors |
| 06 The MMO layer | Rule 0 (MM-1), world boss rules (MM-2 to MM-7), mixed Levels in one fight (MM-19), the presence strip on grounds (MM-20), events that feature a ground | The boss room, the formula at any Level, phases as data, the hall and key system events build on |
| 07 Home and town | Gathering nodes on grounds, crafted food and drink for the Catacombs pack, Havora as the door to the Tower and Catacombs | A consumer for home-made supplies that gold cannot shortcut |
| 08 Player experience | The Path that says when each ground and mode opens (GR-79), the ground card, the return card, Tamsin's task taken on entry (GR-78), moving to the next ground when outgrown (GR-81) | The words on every card, the log lines worth reading, what the first hour's four heroes hunt |
| 09 Platform and measurement | The matrix as the gate (GR-88), formula steps R3, R12, R21 and R22, server cost for a hall queue and a boss pool | Band rows on the ground axis, the hall grader, cells for a ground played above its band |

---

## 4. The calls in this chapter, as decided

In decision-book order.

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-27 | What the harder tiers bring | One pull number for each tier, the same on every ground. Five on Dangerous is the leading candidate, set by the harder tiers lane | DECIDED (Fable 2026-11-21) |
| GR-5 | What a kill pays | The kill reward follows the pace line with one kill-rate reference. One tier table. Party grounds stay an encounter type with three numbers | DECIDED (Fable 2026-11-21) |
| GR-28 | One boss door | Every boss that pays a prize is a keyed hall. One key is one prize roll. "Fight with N keys" is one press and stops at the first death | DECIDED (reversal, Tyler may veto). Changes 2026-11-14 and 22-8 (Fable 2026-11-21) |
| GR-29 | A hall's prize | Only what no ground drops. Plain Dawnsteel drops in the Hold: armor hourly, and weapons, shield and spellbook as Scarce rows (CE-6) | DECIDED (Fable 2026-11-21) |
| GR-9 | An old ground at your own Level | Open it as ruled, by the hour, with one drop rule. Read frontier use, then rule free against paid | DECIDED (Fable 2026-11-21) |
| MM-2 | The world boss form (chapter 06) | One shared pool, fought in each account's own boss room | DECIDED (Fable 2026-11-21) |
| GR-25 | Special monster rules with no ruling on record | Keep the gentle ramp and the boss blow bound. A tier a ground does not offer is one flag | DECIDED (Fable 2026-11-21) |
| GR-31 | A signature for each ground | One question, on the card, full strength on harder tiers, taught by frequency on Normal. Sample the Slake and Krell's Hold | DECIDED (Fable 2026-11-21) |
| GR-33 | The shape of a region | Six grounds, opened as four and a hall, then two. One new rule a region | DECIDED (Fable 2026-11-21) |
| GR-34 | Dead rows | Remove 103 monster rows, three hunts and four boss copies, after the item check, on the one cut list | DECIDED (Fable 2026-11-21) |
| GR-30 | The hall boss | The boss role times one hall number that acts on health and the 10 minute clock, never on blows. A mid-geared four wins 80 to 90%. HYPOTHESIS until the hall grader plays it | DECIDED (Fable 2026-11-21) |
| GR-32 | Thin bands and pairs | Wickstead to about 20 to 32, the Slake to about 58 to 72. A faction pair pays alike | DECIDED (Fable 2026-11-21) |
| GR-35 | The named rare | One phase trait each | DECIDED (Fable 2026-11-21) |
| GR-36 | The Catacombs | Their own mode. One wing and one key first. The one party table | DECIDED (Fable 2026-11-21) |
| GR-37 | The Tower's beat | Weekly | DECIDED (Fable 2026-11-21) |
| GR-86 | Every monster on the formula (chapter 09) | No hand-typed monster stats | DECIDED (Fable 2026-11-21) |

---

**Cuts in this chapter.** CUT (Tyler approves), cut list 1: 103 monster rows no hunt uses, three hunts with no ground and four boss copies (GR-34), after the item check. Cut list 15: the per-ground tier dials (GR-5) and the "no bigger pulls under floor 16" rule (GR-27).

## 5. Still missing

| # | What nobody has decided or designed | Who decides |
|---|---|---|
| 1 | **Krell on day 18 against the four's own table.** Two rulings of 2026-11-21 give day 18 and day 31 to 39. The runway in 2.2 moves by a factor of two with the answer | Closed as a reversal Tyler may veto. GR-6b: day 31 for the plain four |
| 2 | **Regions 4 to 7 have no sketch of record.** A-10 ruled sketch them now. The only draft is a working name and five sample pieces for region 4 in a document the plan replaced. Each needs its place, its one new rule, its faction pairs, its two bosses and its elements | The game designer |
| 3 | **How fast a region can be drawn.** The table asks for a new region every 45 to 53 days. No lane says who draws them, at what cost, or what happens when art falls behind | The art and asset directors, then Tyler |
| 4 | **The Morrow Hills between Levels 142 and 165.** The Old Guard and the Bellows are a name and a weapon grid. The Night Shift is the same. The Catacombs ground cannot open until they exist | The game designer |
| 5 | **Signatures for six grounds** (Wickstead, the Muster Barrows, the Night Shift, the Old Guard, the Bellows, the Catacombs ground), and the shared dose coefficient's value | The game designer, after the two-ground sample is played |
| 6 | **The hall number and the early halls.** Nobody has sized a hall at Levels 25, 52 and 75, or said what key and prize the Rat King, Chief Coppercap and Captain Hask carry | The game designer, with chapter 03, for the keys and prizes. The hall number acts on health and the clock (GR-30), and the hall grader plays it at Levels 25, 52 and 75 |
| 7 | **Whose Level an old ground takes**, the leader's (ruled) or the lowest hero's | Closed. MM-19: the leader's, as ruled |
| 8 | **What an old ground at your Level costs in gold at the frontier**, and whether that sink is needed once the price can go to zero | Closed. GR-9: the fee is one data row that can go to zero, and frontier use is read for two weeks |
| 9 | **The Tower's board once the top follows Level.** A week view or a season | The game designer |
| 10 | **The Bestiary.** Its deep dive is queued behind the balance work (2026-11-11), and its stage bonus is undecided. This chapter only sizes how long its stages take | The game designer. The stage bonus is a design call. The deep dive stays queued behind the balance work |
| 11 | **The faction benefit for hunting the opposite side's ground.** Ruled to exist and to matter (31-8), not sized | The game designer, chapter 05 |
| 12 | **Loot rows for Wyvern Roost and the Catacombs ground** | Chapter 03 |
| 13 | **The measuring gaps in section 6**: no matrix cell for a ground above its band, no hall on the ground axis, no band rows on the ground axis | Chapter 09 |

---

## 6. How we will know it works

**On the matrix.** Every change in this chapter is a matrix diff before it is a release (GR-88). The instrument is not yet true in every seat: a four's pace can carry a decision, a four's gold and survival are direction only, and cells from Level 185 up are stand-ins.

| Check | Passes when | Kind |
|---|---|---|
| The kill reward (R12) | The typed XP fits are deleted and every ground stays inside the pace band with none typed back | Derivation |
| One tier table | Every ground takes the table whole. Deadly pays more than Dangerous. A kit that cannot hold a tier earns less after deaths than on the tier below | Coefficient |
| Deadly's death count | A mid-geared party: 50 to 100 deaths in 1,000 hours at every checkpoint | Band S6 |
| Every monster on the formula (R21) | A coefficient diff a ground, in batches of 20 rows | Coefficient |
| A signature | The diff moves only its own ground's cells. Unanswered, the supply bill is 1.5 to 2 times the answered one on the harder tiers | Coefficient. Needs the back row hit as in real play |
| An old ground at your Level | Under 1.0 of the at-Level ground on every ground at Levels 50, 80, 110, 150, 185 and 240, alone and as a party | Needs a new cell |
| A hall | A four in band wins 80 to 90%. The weakest named lineup and the next cheaper food lose (HA-FLOOR) | The hall grader |
| The Tower | A set-up four's top floor less its Level is +5 to +25 in every Level band. Cells at floors 300, 500 and 1,000 run | Band, and R22 |
| The runway | R1: a region open 30 days ahead. R2: 120 days at Early Access. R3: Levels authored a month over Levels the pace seat gains a month is at least 1.0 | Bands R1 to R3 |
| Any Level | The formula's monsters hold at Levels 1,000, 2,000 and 5,000 | The representative run |

**Only players can say.**

| Question | The playtest | Reads as |
|---|---|---|
| Does an old ground at your Level feel like content? (playtest 4) | The system on as ruled for accounts past Level 110, two weeks | Share of frontier hours on old grounds. Hours a day hold. Then rule free against paid |
| Does anyone change a setup for a ground? (playtest 5) | Two grounds in one band, opposite signatures, equal XP | Ground-specific setups a hunt. Share of hunts started with a saved kit |
| Does the risk reading change the tier a player picks? (playtest 9) | Before and after the hunt report | Share of hunted hours by tier. Deaths in 1,000 hours on Deadly |
| Is a hall worth a key? | After the one boss door | Halls opened a week by accounts past Level 85. Red at zero for a week |
| Does the Catacombs pack stay a decision? | Four weeks of descents | Distinct packs a hero uses |
| Is the Tower an errand or a score? | Weekly | Heroes with a climb over heroes past Level 10, target over 50%. Median top floor less Level |
| Do players spend stamina on a world boss, and does a shared bar feel like company? | Chapter 06's playtests | Chapter 06 |

---

## 7. Superseded

What this chapter dropped from its sources, and why.

| Dropped | From | Why |
|---|---|---|
| "Remove the party-ground formula" | World review, phase A | Its own phase B measurement refuted the cause. The type stays with three numbers, and the fix is the kill reward |
| "Dangerous brings the pack as built" | World review, phase A | Measured as Normal plus 4%. A pull of five is the candidate |
| "Risen grounds: free on every ground now, in place of hours" | World review 4.1, from-scratch change 4 | The cold audit: the ruled system has never been open to a player, so its zero uses say nothing. Open it as ruled, read it, then rule the price |
| "A four runs out of ground on day 27" and every day built on a four at 2.2 times the table | Standards 2.7, world review, game review 4.3 | The Level table is ruled as the four's own clock. Those days are kept only as the open conflict in 2.2 |
| "Krell at about month 4" | Plan 30, retention dive | Ruled stale on 2026-11-21 |
| "Do not add a world boss" | World review section 5, game review 2.4 | Tyler ruled world bosses into the MMO layer on 2026-11-21. Rule 0 answers the review's objection, since a boss stands for days and nobody has to be anywhere at a set hour |
| "Four grounds a region for good" | World review, phase A | Six is ruled. The review withdrew it until the Morrow Hills are played |
| "The Tower and the Catacombs become one climb mode" | From-scratch change 3 | Written without ruling 22-4. Their own mode is ruled, and carrying your supplies down makes it a different decision |
| "Keep both boss doors and give Captain Hask a call" | Endgame dive, formula architecture | Five sources ask for one door. One real use of the second door on record |
| "Earlier bosses are call series" and "a daily personal roll" | Itemization plan section 2 | Both become one key, one roll under GR-28. The plan's rule that a mid-region boss's pieces stay repeatable is kept |
| Krell's rows raised by hand | The alternative in GR-30 | A per-boss patch, which the formula ruling forbids |
| A level-gap share cut for a hero under a ground's band | Built rule | Ruled out on 2026-11-08 and by rule W4 |
| Party pace bands by size, and "every Dangerous party stands at or over its heroes alone" | Standards P6 and P7, ruling 2026-11-16 | No solo or group targets, ruled 2026-11-21 |
| Bands "two a region, about 27 Levels each" as a fixed count | Itemization plan section 2 | GR-4 makes a band a fixed step of the gear curve. Chapter 03 carries it |
| The region 4 working name and samples as a design | `itemization-roadmap.md` | That file is replaced by the plan. The name is not ruled and its style is not checked |
| The Tower's heat patch, and a Tower XP boost for new heroes | Built rules | Ruled out on 2026-11-20 (22-1, 22-7) |
| The old dungeons, raids and their second currency | Dark systems | Ruled cut on 2026-11-20 (22-10). A hall at each region's end is what they became |
| Per-ground XP, gold and tier dials, and every "as it is now" count of them | World review 2.9, formula architecture | They are outputs of a missing formula term. The design has none, so the counts have no place in this book |

---

## 8. Source map

| Document | Sections this chapter replaces |
|---|---|
| `balance-program/53-review-world.md` | All of it |
| `balance-program/22-endgame.md` | The Tower, Catacombs, bosses and halls, the boss call, scaled hunts and old dungeons cards, and rulings 22-1, 22-4 to 22-10. The chest and reforging cards go to chapter 03 |
| `balance-program/44-formula-architecture.md` | C-MON-STATS, C-TIER, C-PULL, C-SCALED, C-BOSS-PHASE, C-BOSS-ROOM, the party fit, hand rows, per-ground tier dials, and steps R3, R12, R21, R22 as they touch the world. The rest is chapter 09's |
| `balance-program/60-game-review.md` | Sections 1.2, 2.4, 4.3 and 8.3, and calls GR-5, GR-9, GR-25 and GR-27 to GR-37 as they touch the world |
| `balance-program/62-decision-book.md` and `.json` | The World area, and GR-9, GR-27, GR-28, GR-29 in the decide-first list |
| `balance-program/47-itemization-fit.md` | Rows 2b to 2d, C9, C15, C16, C20 and C21 as they touch regions and bosses, M10, and Findings 1 and 2 as they touch grounds and keys |
| `itemization-plan.md` | Section 2 (regions and Levels), the ground template's world half, Appendix A Finding 1's ground list, Appendix B2 |
| `balance-program/46-from-scratch.md` | Change 4, and the boss and Tower parts of change 3 |
| `balance-program/49-mmo-layer.md` | Nothing replaced. Section 5.1 is connected in 2.7 and stays chapter 06's |
| `balance-program/50-standards.md` | Section 2.7 (the runway) and bands R1 to R4 |
| `balance-program/61-review-audit.md` | Findings H11, H12 and M7, and its alternative for GR-9 and GR-27, all applied |
