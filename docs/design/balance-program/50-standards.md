# Balance program 50: the standards

The yardstick for the whole game plan (Tyler, 2026-11-21). Every system, every dive and the plan itself are measured against this file. It sets standards. It redesigns nothing. The same bands are data in `tools/balance-program/standards.mjs`, which the harness and the balance guard read.

Written by the standards auditor on `lane/d-standards`. No game code, data or migration was changed. It supersedes the measurement frame of `01-model.md` sections 3 to 5, the town hours in `model.mjs`, and the scope of `lane/d-twelve-hours` wherever they differ. That lane is merged (89d13ec0a): `HUNT_HOURS_A_DAY` is 12 in `model.mjs`, the gold model and the guard are re-based, and G20 reads the fourth hero at 3.9 weeks. It fixed the hours. It did not add gear states, checkpoints, parties of two and three, or town time.

**Labels.** RULED (Tyler, with the date). PROPOSED (the auditor's band, waiting for Tyler or for evidence). CITED (a genre benchmark or another file's measurement). COMPUTED (arithmetic here on the game's own data rows, not played). REAL (production, from `10-real-players.md`). Nothing in this file was measured by playing. A PROPOSED band is a target to test, never a finding.

**CITED genre numbers** come from the auditor's memory of public sources. Each one is marked "verify" and a research pass must check it before Tyler rules on a band that leans on it.

---

## 0. What Tyler said, and what it changes

1. "you should always be assuming that every person is going to hunt 12 hours a day since it's an idle game."
2. "this should all also be measured by progression of characters, all of this from lvl 1-300 should be measured as if the player was in BEST IN SLOT GEAR a low tier, and a mid tier."
3. "in fact, we might as well go 1-400 now that i think of it."
4. "there are likely other standards missed that i would like fable to plan ahead for, to prompt the audit."
5. The bar of 11-20: every system balanced together, unique, fun, studio quality, optimized, scalable. "IF IT IS SHOWING SIGNS OF DIFFICULTY SCALING THE BALANCE OR RE-BALANCING, WE NEED TO CONSIDER ADJUSTING THE SYSTEMS."

Three things the old frame got wrong, found while writing this one:

- **The 12 hour day was already ruled on 2026-10-25** ("Baseline: 12 hours of active hunting daily, without purchased stamina"). `01-model.md` set it aside ("the pace table's 12 hours a day describes nobody") and counted every week at 3.3 hours. So this is a return to a ruling, and every "weeks" number in the plan is 3.6 times too long.
- **A free hero already reaches 12 hours a day with no refill.** Stamina drains 1:1 hunting and rests 1:1 at every other instant (`src/data/hunt-sessions.js`). A day has 24 hours, so any hero that never lets its bar sit full hunts exactly 12. The free 8 hour bar needs two visits about 12 hours apart (8 hours, then 4). Premium's 12 hour bar needs one. So the bar sets how many visits the day takes. It does not set the hours. (COMPUTED from the data rows, and the merged model charges 0 refills at 12 h. Nobody has watched the server do it. "Verify the stamina day on the server" is the first line of the harness spec, 5.2.)
- **Nearly everyone ends up a four.** At 12 hours the fourth hero arrives in about 4 weeks (RULED text, 11-21). A four on Deadly is ruled at 1.8 to 2.5 times the lone pace. So the Level table Tyler ruled (Level 200 in 140 days) describes a lone hero that almost nobody will be after the first month. On today's numbers a mid-geared four passes Level 200 on about day 66 and Level 400 on about day 174 (COMPUTED). That is the first thing Tyler must rule on (section 9, call 1).

---

## 1. The measurement frame

### 1.1 The clock

| Thing | Standard | Label |
|---|---|---|
| Hunted hours a hero a day | **12**, every hero, every day, no refill | RULED 11-21, 10-25 |
| How a free hero gets there | two visits about 12 hours apart: 8 hours, then 4 | COMPUTED from the stamina rule |
| How a Premium hero gets there | one visit a day | COMPUTED |
| Rested hours a hero a day | 12. This is all the town time there is (benches, nodes, farm, yard, curing) | COMPUTED |
| **Town hours a hero a day** | **12: a resting hero is always working.** Every town system is sized for a hero that fills all 12 rested hours, and is also printed at the real 4 so we see what a player who skips town gets | PROPOSED, call 13. The 12 h ruling covers hunting. `model.mjs` still holds the real 2 to 6. The reason is the same as the ruling: it is an idle game, a job costs one press, so assume the hours are used |
| The Ceiling player | 24 hunted hours a hero a day: six refills of 4 hours, every day | RULED rows (`stamina-refill.js`). Hours past 12 cost 2 refill hours each, because the hero stops resting |
| A week, a month | 84 and 360 hunted hours a hero | COMPUTED |
| Real-player data | calibrates rates an hour. Never hours a day | RULED 11-21 |

Every duration in the program is written in **hunted hours** and in **days at 12 h**, side by side. A number in weeks with no hours beside it is not accepted.

### 1.2 The checkpoints: Level 1 to 400

31 checkpoints. Dense early, on every gear gate, then wider.

`1, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 88, 100, 110, 125, 145, 165, 185, 200, 225, 250, 275, 300, 325, 350, 375, 400`

Why these: 1 to 10 is the first day and where both light real players quit. 15, 30, 45, 60, 75 and 88 are the Levels gear tiers 2 to 7 are worn at (`gear-tiers.js`), so each is an "arrival" moment. 110, 125, 145 and 165 are the unique bands (`temper.js`). 185 is the end of staged content. 200, 300 and 400 are ruled milestones. Each checkpoint is played on the ground the game itself recommends at that Level.

| Stretch | Levels | State of the content | How it is measured | Label on every number |
|---|---|---|---|---|
| A | 1 to 110 | OPEN: grounds players can enter today, through Krell's Hold | the real engine on real rows | MEASURED |
| B | 110 to 185 | STAGED: built and hidden (Carter's Rest, the Ox Road, the Wyvern Roost, the Catacombs, the armor and weapon lines) | the real engine with the staged rows opened (`openAlso`, `uniques`) | MEASURED, STAGED |
| C | 185 to 400 | SKETCHED: regions 4 to 7, about 55 Levels and six grounds each (RULED 11-18) | the real engine on **placeholder grounds** (section 4.3): monsters from `STAT_FORMULA` at the floor, pay from the contract, gear from the projected line | PROJECTED |

A PROJECTED number says what the formulas do when nothing new is designed. It finds walls and runaways early. It is never quoted as how a region will play.

### 1.3 Parties and tiers

| Axis | Values | Rule |
|---|---|---|
| Party | 1, 2, 3, 4 of the account's own heroes | Lone: the hammer is the unit, and every way to fight is measured at MID for parity. Two: the better of tank + Mage and bow + Healer. Three: tank, Healer, Mage. Four: tank, Healer, bow, Mage |
| Tier | Normal, Dangerous, Deadly | Every tier the ground offers. A party is also reported on **the hardest tier it holds** (section 2.3 says what "holds" means) |
| Supplies | the played bar. A quarter of supplies home-made from Level 30, the rest from the store | Held the same for all three gear states, so the gear axis reads only gear. ASSUMED until the town model of section 4 measures what 12 rested hours make |

Where a cell cannot exist it is skipped by rule, not by hand: parties under Level 5 (the Sewer opens at 5), tiers a ground does not have.

### 1.4 The three gear states

Each state is a rule a tool applies to the game's data. Nobody types a kit. The builder is `tools/balance-sim/gear.mjs` with the options named below.

| | **LOW: the arrival kit** | **MID: the kit the game hands you** | **BEST IN SLOT** |
|---|---|---|---|
| The idea | What you wear the day you walk into a new band, having bought nothing. Also the player who never upgrades (REAL: 0.9% of dropped gear is ever worn) | A player who wears what drops and spends a little | Everything that exists and can be worn at that Level. Gold, luck and time do not limit it |
| Weapon, off-hand, six armor slots | the ladder piece **one tier under** the Level's tier (`tierOffset: -1, only: 'all'`). Under Level 15: the start kit alone | the ladder piece of the Level's tier in every slot. Past tier 7: what a ground or a boss drops (`uniques: true`) | the best wearable piece from any source at or under that Level (`uniques: true, chest: true`): Tower chest weapons, Catacomb armor, uniques, named shields |
| Rings, earrings, necklace, cloak | none | plain pieces of the highest jewelry tier the Level can wear | highest tier, Hallmarked with two perks, the best pair for the way by measured XP |
| Tempering | none | rung 2 of 5 on both tracks of the worn tier. It costs 3/31 of a track's gold for 2/5 of its power | 5 of 5 on both tracks |
| Linings | none | none | every socket, the best tier for the Level, the element that answers the ground, up to the 40% cap |
| Combat skills | 8 under the career line from Level 30, sliding from 0 at Level 10 (REAL: 7 to 10 under by Level 60) | on the career line (`skill-lines.json`) | career line + 10. The "trains every rested hour" reading is printed beside it and judges nothing (RULED 31-7) |
| Ammunition, whetstones | the store's basic | the Level's tier | the Level's tier |
| Ruled sources not built yet | none | none | each enters at its ruled budget, marked PROJECTED: perks on 12 seats, worn in, jewelry tiers 4 to 7, Necrotic and Storm, faction skills, two-attribute chest pieces from the Level 200 key |

**When each power source becomes obtainable** (READ FROM DATA unless marked):

| Source | From Level | Row |
|---|---|---|
| Gear tiers 1 to 7 | 1, 15, 30, 45, 60, 75, 88 | `gear-tiers.js` MATERIAL_TIERS |
| Unique bands (staged, hidden) | 110, 125, 145, 165 | `temper.js` TEMPER_UNIQUE_BANDS, `staged/armor-line.js`, `weapon-line.js` |
| Tempering | 15 (tier 2) to 88 (tier 7, smaller rungs). Unique bands shut | `temper.js` |
| Tower chest weapons | Bronze 10, Silver 40, Gold 70, Platinum 100. Six opens a hero a week | `chests.js` CHEST_KEYS |
| Catacomb armor (staged) | key tiers 2, 4, 6, 7 | `catacomb-armor.js` |
| Jewelry | tier 2 (Hallmark from 30), tier 3 (45). Tiers 4 to 7 RULED, not built | `jewelry.js` |
| Linings | tiers at 1, 30, 80 | `imbuements.js` IMBUE_TIER_FLOORS |
| Trained skills | 10 (the yard) | `training.js` |
| Past 185 | a projected band every 20 Levels, each step inside the ruled +5 to 8% and 3 to 5% | PROJECTED, section 4.3 |

**BiS is a ceiling, not a day.** The frame measures what BiS is worth. How long it takes to get there is its own band (2.5), because a source capped by the week can exist at a Level and still be out of reach for a player moving at 12 hours a day.

---

## 2. The bands

A band has a target and a red line. "x contract" is Level XP an hour a head over `contractXpPerH(Level)`. "x MID" is the same cell in the MID kit. Days are at 12 h. Bands apply at every checkpoint unless a range is given.

### 2.1 Pace

Hours each Level takes and the day it arrives, at 1.00 x contract (COMPUTED from `LEVEL_CURVE` and the contract on this commit):

| Level | Hunted hours, total | Day at 12 h | Hours for this Level | Ruled target (10-25) |
|---|---|---|---|---|
| 10 | 6 | 0.5 | 2.5 | 6 h |
| 25 | 45 | 3.7 | 2.8 | 36 h (early grounds pay over the contract, so the played hero is nearer) |
| 50 | 147 | 12 | 5.6 | 168 h |
| 100 | 600 | 50 | 11.2 | 600 h |
| 110 | 714 | 60 | 11.7 | |
| 185 | 1,577 | 131 | 11.4 | |
| 200 | 1,748 | 146 | 11.5 | 1,680 h |
| 300 | 2,907 | 242 | 11.8 | 3,120 h |
| 400 | 4,580 | 382 | 20.8 | none. 4,580 is also the geometric midpoint of the ruled 300 and 500 |

| # | Band | Target | Red | Label, reason |
|---|---|---|---|---|
| P1 | The pace seat reaches the ruled Levels on the ruled days | within 10% of the table | over 15% | RULED 10-25. **Which seat is the pace seat is call 1.** Until ruled: the lone MID hero on Normal |
| P2 | Lone MID on Normal | 0.95 to 1.10 x contract | under 0.85, over 1.25 | RULED tolerance. Guard G1 today |
| P3 | Lone LOW on Normal | 0.80 to 0.90 x MID | under 0.70, over 0.95 | PROPOSED. One weapon step (5 to 8%, RULED) plus accessories and two rungs. Under 0.70 the arrival feels like a wall. Over 0.95 gear does not matter |
| P4 | Lone BiS on Normal | 1.10 to 1.20 x MID | over 1.25 | PROPOSED, call 3. The plan's own stack reads +10% (the four's cap, 30-2) to +26% (lone at 118) |
| P5 | BiS over LOW, same seat | at most 1.50 | over 1.60 | PROPOSED. Past this the content cannot be written for both |
| P6 | Party a head over lone, same tier, MID | two 1.05 to 1.15, three 1.10 to 1.20, four 1.15 to 1.25 | four under 1.0 from Level 10 on a party ground | RULED 10-25 section 5 |
| P7 | Party a head on the hardest tier it holds, MID | two 1.2 to 1.5, three 1.5 to 2.0, four 1.8 to 2.5 x contract | four over 2.6, two over 1.7 | Four RULED (11-16, 21-4). Two and three PROPOSED: the plan assumed 1.2 and 2.0 and never played them (call 8) |
| P8 | The four on Deadly in BiS | at most 2.75 x contract | over 2.9 | RULED 30-2 |
| P9 | A harder tier, for a kit that holds it, over Normal | Dangerous 1.10 to 1.25, Deadly 1.30 to 1.60 in XP an hour | Deadly under Dangerous | PROPOSED from the tier rows (XP a kill 1.10 and 1.25, a pull of 8) |
| P10 | A harder tier for a kit that does not hold it | XP an hour after deaths is **under** the tier below | over it | RULED direction 11-08: "Either they are strong enough to do the harder content or they aren't" |
| P11 | No wall | no Level under 10 over 2 h. Level 10 in 6 h. No Level over twice the one before | as written | RULED 27-2, `LEVEL_PACE.smooth` |
| P12 | A Level a day | the pace seat gains at least one Level in every 12 hunted hours to Level 300, and one in every 24 to Level 400 | over 13 h under 300, over 24 h under 400 | PROPOSED. Today it holds by a hair: 11.8 h at Level 300, 20.8 h at 400. CITED: daily-progress idle games keep a visible step a session (verify) |
| P13 | Events | at most +0.25, one at a time, under 5% of all Level XP | over | RULED 27-5, restated for a player who hunts through the whole weekend |

### 2.2 Survival and death

| # | Band | LOW | MID | BiS | Label, reason |
|---|---|---|---|---|---|
| S1 | Normal, in band: typical lowest health | 45 to 70% | 60 to 80% | 75 to 95% | MID RULED 10-25 section 3. LOW and BiS PROPOSED one band either side |
| S2 | Normal, in band: deaths in 1,000 hunted hours | at most 5 | at most 1 | at most 0.1 | MID RULED. A 12 h day is 83 days to 1,000 hours, so "1" means a lone MID hero dies on Normal about once a quarter |
| S3 | Dangerous, in band: lowest health | under 35%, it dies | 35 to 60% | 55 to 75% | MID RULED (the "Hard" row) |
| S4 | Deadly, in band: lowest health | dies | 25 to 40% | 35 to 50% | RULED both ways and they disagree: 10-25 "Extreme" says 15 to 40%, guard G5 says 35 to 50%. PROPOSED: G5 is the BiS row and the MID row sits between |
| S5 | Damage taken an hour | 1.15 to 1.35 x MID | 1.00 | 0.80 to 0.90 x MID | PROPOSED. An armor step is 3 to 5% (RULED 10-25 section 9). Measured today: a tier behind is 13 to 26% early, 5 to 10% late |
| S6 | **The death tax**: Level XP lost to deaths over Level XP earned, on that tier | Deadly over 30% | Normal under 1%, Dangerous 2 to 6%, Deadly 6 to 12% | half of MID's | PROPOSED, call 5. It replaces "deaths in 1,000 hours" on the harder tiers, because the cost of one death grows with Level and a fixed death rate cannot hold at every Level |
| S7 | A 12 hour unattended hunt on Normal finishes | 9 in 10 | 99 in 100 | always | RULED 10-25 for the properly equipped. LOW PROPOSED |

**What one death costs** (COMPUTED: 6% of total Level XP over the contract rate, and with all three Blessings):

| Level | Unblessed | Fully blessed | In days at 12 h, unblessed |
|---|---|---|---|
| 30 | 2.0 h | 0.5 h | 0.2 |
| 50 | 5.1 h | 1.3 h | 0.4 |
| 100 | 21.7 h | 5.4 h | 1.8 |
| 200 | 56.8 h | 14.2 h | 4.7 |
| 300 | 89 h | 22 h | 7.4 |
| 400 | 148 h | 37 h | 12.3 |

| # | Band | Target | Label |
|---|---|---|---|
| S8 | One death, fully blessed | never more than one day of hunting (12 h) | PROPOSED, call 4. It breaks at about Level 175 today |
| S9 | One death, unblessed | never more than four days (48 h) | PROPOSED, call 4. It breaks at about Level 175 today |
| S10 | The Blessing set | costs under a fifth of the hours it saves, priced in the buyer's own net gold | PROPOSED. 21-8's "two lone hours" was sized against a death worth 7 to 27 hours |

### 2.3 "Holds a tier"

A kit holds a tier when all three are true over the nightly sample: its death tax is inside S6's MID row, its lowest health is inside S3 or S4, and its net gold is over zero. The frame reports the hardest tier each cell holds. The standard: **MID holds Dangerous in band from Level 16 and Deadly as a four. BiS holds Deadly at every party size it is offered. LOW holds Normal and nothing else** (PROPOSED).

### 2.4 Gold

No band names a gold number that has not been measured on this frame. They are shapes and shares.

| # | Band | Target | Red | Label, reason |
|---|---|---|---|---|
| G-1 | Lone MID net gold an hour on Normal | never falls from one checkpoint to the next | any fall | RULED (G7, 24-2) |
| G-2 | Store bill over coin earned, MID in band | Normal under 15%, Dangerous 25 to 40%, Deadly 45 to 65% | Deadly under 35% | PROPOSED from REAL (48% for the real four) and "struggle or pay" |
| G-3 | LOW net gold on Normal | 0.6 to 0.85 x MID, never under zero | under zero | PROPOSED. A new arrival must still earn its way to MID |
| G-4 | The four on Deadly, MID, in band | 3,000 to 8,000 a hero-hour at Levels 50 to 110, never under zero with a quarter own stock | under zero | RULED 30-5 |
| G-5 | LOW on Deadly | nets under zero | over zero | RULED direction 11-19: "they should likely be wasting money" |
| G-6 | BiS on Deadly | nets at least what MID nets on Dangerous | under | PROPOSED. The top kit must turn the top tier into profit, or gold cannot pay for itself |
| G-7 | Gold a day | every checkpoint prints net gold a 12 h day, for one hero and for the account's four | | the unit every price is read in |
| G-8 | Every price, in days of the buyer's own net gold | a small buy under 1 day. A band goal 3 to 10 days. A long goal 20 to 60 days. Nothing that carries power over 90 days | over 90 | PROPOSED. CITED: long idle goals sit at weeks, not seasons (verify) |
| G-9 | Repeating sinks a day over gold in a day, MID | 35 to 50% at every checkpoint from Level 30 | under 25%, over 65% | the plan's dashboard promise, now a band |
| G-10 | Standing prices of a band over the band's net gold, lone MID | 1.2 to 1.4 | outside | RULED 11-18 ("choose what matters"), G15 |
| G-11 | Server-wide gold destroyed over gold created, a day | 0.85 to 1.00 from the second month | under 0.7 for a week | PROPOSED. CITED: EVE Online publishes this ratio monthly as its health line (verify) |
| G-12 | Gold bought with Crowns | makes a thing sooner, never makes it possible | any power only gold can reach | RULED 11-18 |

### 2.5 Gear: the gaps, the cost, the churn

| # | Band | Target | Red | Label, reason |
|---|---|---|---|---|
| E1 | A major upgrade | every 15 to 25 Levels. +5 to 8% hunting performance for a weapon. 3 to 5% less damage for armor | outside | RULED 10-25 sections 8 and 9 |
| E2 | LOW to MID, time | every slot's current-tier piece has dropped inside the first 15% of the band's hours through Krell, 35% after | over 25%, over 50% | PROPOSED from RULED 11-20 "generous to Krell, rare after" |
| E3 | LOW to MID, gold | under 10% of the band's net gold | over 20% | PROPOSED. MID is what the game hands you |
| E4 | MID to BiS, gold | 100 to 140% of the band's net gold for a lone MID hero. A hero that spends everything reaches 70 to 80% of the pool | under 80% | RULED direction 11-18. Same as G-10, read on gear |
| E5 | MID to BiS, time | every source's median wait is under half the band's length through Krell. Past Krell under the whole band, and the piece carries forward | over the band's length | PROPOSED, call 6. **It fails today.** Bands under Level 88 last 3 to 11 days and a chest piece takes weeks of six opens |
| E6 | Something you wear changes | at least once in 24 hunted hours to Level 110, once in 60 after. Any slot, rung, perk or lining tier counts | over 36, over 90 | PROPOSED. CITED: loot games aim for an equip change a session early (verify) |
| E7 | The Add pool (accessories, perks, Tempering, worn in, trained skills) | at most one weapon step of XP and one armor step of damage, at every checkpoint | over +10% | the model's cap, G10 |
| E8 | No gold-for-power offer cheaper than Tempering's cheapest rung | at least 1 lone hour of gold a 1% | under | G12 |

### 2.6 Drops and Luck, on the 12 hour clock

| # | Band | In hours (RULED) | In days at 12 h (COMPUTED) |
|---|---|---|---|
| D1 | A Very Rare, through Krell | 60 to 90 h a hero | one every 5 to 7.5 days a hero. An own four finds one every 1.3 to 1.9 days |
| D2 | A Very Rare, past Krell | 60 to 90 h of an own four | one every 5 to 7.5 days an account |
| D3 | The Luck bar | +16% at 500 h, +39% at 5,000 h | day 42 and day 417. "5,000 hours" was read as years. It is 14 months (call 9) |
| D4 | Magic Find, all sources | at most 104 a hero | RULED |

### 2.7 Content runway

The day a 12 h player reaches each door (COMPUTED from 2.1. The four runs at 2.2 x from Level 10, which is four friends. An own four is later by the slot ladder, about 2 to 4 weeks at 12 h):

| Door | Level | Lone MID | Four MID on Deadly | Ceiling (BiS four, 24 h) |
|---|---|---|---|---|
| The Barrow March | 45 | day 10 | day 5 | day 2 |
| Krell's Hold | 88 | day 39 | day 18 | day 8 |
| **End of open content** | 110 | **day 60** | **day 27** | **day 11** |
| The Catacombs (staged) | 175 | day 122 | day 55 | day 23 |
| **End of staged content** | 185 | **day 131** | **day 60** | **day 25** |
| Region 5 (sketched) | 240 | day 184 | day 84 | day 35 |
| Region 6 | 295 | day 237 | day 108 | day 46 |
| Region 7 | 350 | day 303 | day 138 | day 58 |
| Level 400 | 400 | day 382 | day 174 | day 73 |

| # | Band | Target | Red | Label |
|---|---|---|---|---|
| R1 | A region is open before the four MID 12 h player reaches its door | 30 days ahead at a launch, 14 days after | behind | PROPOSED, call 7 |
| R2 | Open content at the Early Access launch | at least 120 days for the four MID player | under 90 | PROPOSED. Today it is 27 days open and 60 with everything staged |
| R3 | Levels the team authors a month over Levels the frontier player gains a month | at least 1.0 | under 0.8 for two months | PROPOSED. The four gains about 69 Levels a month past Level 110, the lone hero 31. A region is 55 |
| R4 | Past the last region | a chase that does not need a new ground: the Tower's floors, the Catacombs, the Bestiary, Luck, Very Rares | none exists | PROPOSED. CITED: Tibia and Melvor Idle both lean on uncapped or post-cap goals between content drops (verify) |

**R3 is a sign of difficulty scaling.** If the Level table stays on the lone hero's clock, a team must ship a six-ground region every 24 days to stay ahead of fours. That is a system question (call 1), not a content schedule.

### 2.8 Server cost

| # | Band | Target | Red | Label, reason |
|---|---|---|---|---|
| C1 | Database time a hunted hero-hour | at most 4 seconds | over 5 | PROPOSED from 28's "after four changes" row (about 3.6, COMPUTED) |
| C2 | Database time an account-day, four heroes at 12 h | at most 190 seconds | over 220 | COMPUTED: today's engine reads about 600 on the same account, by interpolating 28's table. Not measured |
| C3 | Journal rows | at most 1 a hero an hour an activity | over 2 | RULED 28-2 |
| C4 | Money an account-month | at most $0.50 at 1,000 accounts, $0.30 at 10,000 | over | PROPOSED, call 10. Money is Tyler's |
| C5 | Capacity | 1,000 accounts of four heroes at 12 h on one database under 70% CPU at the busy hour. 10,000 on a plan that exists, with room | does not fit | PROPOSED. 28 sized this at 3.3 h, where 10,000 already "do not fit at any price" before its fixes |
| C6 | A new system | no new statement on the settle path, no poll, nothing that grows with players times players | any | the model's allowance, kept |

---

## 3. The other standards the program never measured

Each is a dimension the audit must be prompted with. Verdict, band, what the harness computes, who owns it. Domains: combat (21), endgame (22), items (23), economy (24), social (25), home (26), retention (27), platform (28).

| # | Standard | Verdict | The band | The harness computes | Owner |
|---|---|---|---|---|---|
| X1 | **Account shape**: 1, 2, 3, 4 heroes, and the day each slot arrives | KEEP | Slots at 400k, 1.5M, 4M (RULED). The day each arrives at 12 h is printed, not assumed. The "own four in about 15 weeks" of 31-5 was at 3.3 h and reads about 4 weeks now (call 2 confirms the target) | `gold-model.mjs --slots` on the 12 h clock, from a played life, at LOW, MID and BiS income | 24 |
| X2 | **Account age**: day 1, day 30, day 180 | KEEP | At each age the account has something to buy inside 10 days of gold (G-8) and something to chase inside 7 days. No age has "nothing to want" (REAL: 2.09M held, 17% spent) | the account life: Level, gold held, standing prices left, open chases, at each age | 27 |
| X3 | **Server age and the newcomer on an old server** | KEEP | A day-1 account on a day-180 server reaches MID as fast as on a new one, or faster. Its first party is findable inside one visit. Old gear on the market costs under 3 days of its gold | a newcomer life with the market's floor prices and empty low grounds | 25, 24 |
| X4 | **Who pays**: free, Premium, Crowns seller | KEEP | Free reaches every Level, drop, ground and tier (RULED 11-18). Premium changes visits a day and comfort, never hours. A Crowns seller reaches BiS sooner, by at most half the time, and reaches nothing a free player cannot (call 11) | days to MID and to BiS for each payer at 5 checkpoints | 24 |
| X5 | **Who you hunt with**: alone, own party, friends, strangers | KEEP | Own four and four friends read within 10% a head. A mixed party never beats an own party by more than the shared-supply saving. An on-call hero never out-earns the same hero hunting for its owner | the same cell with one, two and four accounts in it | 25 |
| X6 | **The stamina day**: free bar, Premium bar, refills | KEEP | 12 h free in two visits, 12 h Premium in one, 24 h with six refills (COMPUTED). The first refill of a day costs under the net gold of the 4 hours it buys at every checkpoint. A day of six is gold-neutral at Level 80 (G22) | hours a day and net gold a day for 0 to 6 refills | 24 |
| X7 | **Viewed against browser closed** | KEEP as a check, no band | Identical by rule (CLAUDE.md section 6). The grid runs the one engine, so the check is that no cell differs when replayed with a watcher | the both-paths replay on 5 cells a night | 28 |
| X8 | **The death penalty by Level** | KEEP | S6, S8, S9, S10 | the table in 2.2 from live rows, and the death tax in every harder-tier cell | 21 |
| X9 | **Away and back**: 8 h, 24 h, 7 days, 30 days | KEEP | 8 h away loses nothing. 24 h away loses at most half a day and the card says so. 7 days away loses no placement, no stock and no streak (RULED: streaks never reset). The first press back restarts everything (Carry on). No return costs over 3 minutes before all four heroes hunt | hours lost, presses and minutes to full hunting, by gap | 27 |
| X10 | **Session shape** | KEEP | The 12 h day takes at most 2 visits free and 1 Premium, each under 4 minutes for four heroes (REAL: a visit is 2 to 5 minutes). Presses a visit that repeat a decision already made: zero (the first principle) | visits needed a day and presses a visit, counted from the intent list | 27 |
| X11 | **The chase by horizon**: first hour, day, week, month, six months | KEEP | Hour 1: a Level every 15 minutes and a first upgrade. Day 1 (12 h): Level 12 to 13, a second ground, a first Bestiary stage. Week 1: Level 35 to 40, the first hero slot, tier 3. Month 1: Level 75 to 80 alone, or Krell as a four, with four heroes. Month 6: about Level 235 alone, past everything staged today. Every horizon names one goal the player can read on screen | the reward log of a played life: every Level, upgrade, stage, slot and rare, with its hour | 27 |
| X12 | **The longest dry spell** | ADD | No stretch of hunted hours with no reward of any kind longer than 30 minutes under Level 10, 2 hours to Level 50, 6 hours to Level 110, 12 hours after (RULED 10-25: "Avoid long periods without a sense of progression") | the longest gap in the reward log, by checkpoint | 27 |
| X13 | **Gear churn** | KEEP | E1, E6 | the hours between worn-set changes in a played life, by gear state | 23 |
| X14 | **Economy health over time** | KEEP | G-9, G-11. Gold held an account at day 30, 90 and 180 stays under 20 days of its own income. Item prices: a tier's gear floor stays over its Shop price at 10, 1,000 and 10,000 players | the server gold model: created, destroyed and held a day by server age and population | 24 |
| X15 | **Where old items go** | ADD | Every gear tier has a sink that takes at least 60% of what drops at day 180 (Shop, salvage, Tempering salts, reforging). Nothing binds (RULED), so without this the floor of every old piece is the Shop | pieces dropped against pieces destroyed a day, by tier | 23 |
| X16 | **Content runway against team throughput** | KEEP | R1 to R4 | the runway table from live rows, and the authored Levels a month from the pack log | 22, 28 |
| X17 | **Server cost and capacity** | KEEP | C1 to C6 | `per-player-cost` with every fixture at 12 h, and the 1,000 account run | 28 |
| X18 | **Phone against desktop** | KEEP, thin | No balance band: one web core, one rule set. The standard is X10 met on a phone in landscape with the same number of presses | the press count on the sheet layout | 28 |
| X19 | **Way-to-fight parity** | ADD | At MID, alone, every way is within 1.5 of the median way (G2), and the slow ones are the ruled ones (sword and shield, sword alone early). In a four every role is wanted: a four without it is at least 10% slower or 20% less safe | every way at every checkpoint at MID. The four with one seat swapped | 21 |
| X20 | **Setup quality** | ADD | The default bar a new hero gets reads at least 0.85 of the played bar at every checkpoint to Level 30. A player should not need a guide to be at MID | default rules against the played bar, MID kit | 21, 27 |
| X21 | **Town work at 12 rested hours** (call 13) | ADD | A gathering or bench skill reaches 99 in 60 to 120 days of one hero's 12 rested hours. A third of a hero's supplies can be home-made inside its own rested hours. Every town hour has a consumer | hours to 99 a skill and stock made a rested day, from the recipe rows | 26 |
| X22 | **Weekly gates against a 12 hour pace** | ADD | No weekly cap is the only way to a power source inside a band that lasts under two weeks (E5). Weekly resets land at the same instant for all boards | band lengths in weeks beside every weekly cap | 22 |
| X23 | **Luck, by percentile** | ADD | Every chance-based goal is printed at the 10th, 50th and 90th percentile in days. The 90th is never over three times the median for anything that carries power | the percentile table from the drop rows and chest odds | 23 |
| X24 | **Ranks at equal hours** | ADD | When everyone hunts 12 h, a board ranks setup, party and tier, which is good. A board that refills can buy must say so or have a no-refill twin | the rank gap between a 12 h and a 24 h account on each board | 27 |
| X25 | **Many heroes, one owner** | KEEP from 10-25 | One player's four never earns more than 4.4 times one hero's gold or items a day ("monitor one player running four characters for disproportionate economic advantage"). The 4 heroes a hashed IP cap holds | account gold and items a day at 1 to 4 heroes | 24, 28 |
| X26 | **Confidence** | ADD | A band is judged only on a sample that can see it: XP and gold on 2 seeds x 2 h or more, a death rate on 4 seeds x 8 h or more, a rare row on its formula. Every grid cell carries its sample size | the sample size and spread beside every cell | all |
| X27 | **Harness against real play** | KEEP | The harness reads within 10% of real play on XP and 20% on gold at every seat it judges (K1), on at least three real parties, including a pair and a lone hero | the calibration table | 21 |
| X28 | **Teaching** | KEEP | Every system a player meets under Level 30 is named on screen before it is needed, and a blind play finds it without help | the blind-play list, read by a fresh reader | 27 |

Cut from the candidate list: none. Folded: "free against Premium against Crowns" and "the stamina day" stay apart because one is about money and one is about visits.

---

## 4. The checklist every system passes on this frame

Every one of the 115 systems in `00-inventory.md` gets a card. The thirteen answers of `02-requirements.md` stay. These fifteen lines are what "on the frame" adds. A blank is not allowed.

| # | Line | What counts as an answer |
|---|---|---|
| K1 | **Purpose** | The player problem, the decision, what it plugs into. Still useful at hour 100 and hour 1,000, where hour 1,000 is day 83 |
| K2 | **Where it sits in the progression** | The checkpoint it opens at, the checkpoint it stops mattering, and what replaces it |
| K3 | **Its effect at LOW, MID and BiS** | Three numbers at each checkpoint it touches. A system that only matters at BiS says so |
| K4 | **Its effect by party and tier** | Lone and four at least. Any cell where it reads differently is reported |
| K5 | **Sources and sinks a day at 12 h** | Gold, items, hours and attention in and out, a hero-day and an account-day |
| K6 | **Its price in days** | Every price in days of the buyer's own net gold, at the Level it is bought |
| K7 | **Its share of the day** | Hunted hours, rested hours and visits it asks for. Rested hours are 12 and no more |
| K8 | **The repeat check** | Every press repeated by hand, for four heroes, and what should remember it |
| K9 | **Scale** | At 10, 1,000 and 10,000 players, and on a day-1 and a day-180 server |
| K10 | **Server cost at 12 h** | Against C1 to C6 |
| K11 | **Exploit surface** | What a forged value, four own heroes, a bought-gold account and a 24 h account each get from it |
| K12 | **Teaching** | Where the player first meets it and the line that explains it |
| K13 | **Telemetry** | The counter that tells us it is used and the one that tells us it is broken |
| K14 | **Uniqueness** | Which other system gives the same decision, and which one keeps it |
| K15 | **Rulings** | Every ruling of record it rests on, by date. Any it strains |

**Verdict:** keep, fix, merge or cut. A system that cannot fill K3 or K5 with a number is "unmeasured", which is a verdict of its own and blocks the plan.

---

## 5. The harness spec

One tool makes the grid. One file holds it. The guard reads both.

### 5.1 What it computes

`node tools/balance-program/grid.mjs` writes `tools/balance-program/grid.json`. A cell is (checkpoint, gear state, party size, tier). Full grid: 31 x 3 x 4 x 3 = 1,116 cells, less the skipped ones.

Every cell, a head, an hour: Level XP and x contract. Main skill XP. Coin in, store bill by kind, net gold. Damage taken and healed. Lowest health (typical and 10th percentile). Deaths, and the death tax. Kill speed. Supplies used by kind. Rare rows by formula. The sample (seeds, hours, spread). The content state (OPEN, STAGED, PROJECTED).

Derived tables, each from cells and data rows only:

| Table | From |
|---|---|
| Hours to next Level, total hours and day at 12 h, for each seat | cells + `LEVEL_CURVE` |
| LOW, MID and BiS ratios in kill speed, XP, damage taken and net gold | cells |
| The hardest tier each kit holds | cells + 2.3 |
| Party and tier advantage | cells |
| Death cost in hours, and the Blessing's worth | `hunt-sessions.js`, `blessings.js`, cells |
| LOW to MID and MID to BiS: gold, hunted hours, days, by source, at the 10th, 50th and 90th percentile | drop rows, chest odds, price rows, cells |
| Net gold a day, sinks a day, every price in days | cells + price rows |
| The account life: slots, Levels and gold by day, for 1 to 4 heroes | cells + `slot-ladders.js` |
| The runway: the day each door is reached, by seat | the hours table + ground rows |
| The reward log and the longest dry spell | a played life (`life.mjs`) |
| Town: stock and skill XP a rested day | recipe and node rows |
| Server cost a hero-day and an account-day | `tests/per-player-cost.mjs` at 12 h |

### 5.2 One check first, then three builders

0. **Verify the stamina day on the server.** Play one free hero and one Premium hero through 48 hours on the local world (`tools/qa/local-world.mjs`, time skip): the free hero hunts 8 hours then 4 a day on two starts 12 hours apart, the Premium hero 12 on one start, neither buys a refill, and both read 12.0 hunted hours a day. If the server disagrees, the clock of 1.1 is wrong and everything waits.

1. **The kit builder.** `kitFor(level, state, way)` for the three states of 1.4, on top of `tools/balance-sim/gear.mjs`. It prints what each slot wears and why. It fails loudly if a state cannot be built from data.
2. **The projector.** Placeholder grounds from Level 185 to 400: a floor every 9 Levels, six to a region, monsters from `STAT_FORMULA` (`tools/pack.mjs propose`), pay from the contract, and a gear line that adds one band every 20 Levels inside E1. Staged under `tools/balance-sim/staged/`, never in `src/`.
3. **The town model.** What 12 rested hours make, by skill and Level, from the recipe and node rows. No engine plays town, so it is READ FROM DATA and says so.

### 5.3 Runtime budget

| Run | Sample | Cells | Budget | When |
|---|---|---|---|---|
| Release guard | 2 seeds x 1 h | about 120: 12 checkpoints x 3 gear states x lone and four, on Normal and the hardest tier | 4 minutes | every release, in `smoke.yml` |
| Nightly grid | 2 seeds x 2 h | all 1,116 | 60 minutes on the worker pool | nightly |
| Nightly deaths | 4 seeds x 8 h | a rotating third of the harder-tier cells | 60 minutes | nightly. The only run that judges S2 to S7 |
| On demand | any | one cell or one column | seconds | a dive, a lane |

The cell times are ASSUMED from 28's measured 5 to 9 seconds a point. The first job of the harness build is to measure them and re-cut these budgets.

### 5.4 How the guard checks the bands

`tests/balance-guard.mjs` imports `BANDS` from `standards.mjs`. For each band it reads the cells or the table the band names, and prints target, measured and state. A band starts in **report**. It turns **red** in the lane that lands the change it guards, and never goes back. The old lines map across: G1 is P2, G3 is P7, G4 is P8, G5 is S4, G7 is G-1, G8 is G-4, G10 is E7, G12 is E8, G15 is G-10, G16 is C2, G19 is P7, G20 is X1. G18 is X6: the merged lane already moved it to 12 hours a day with no new press, and it now also reads the two-visit day. `--mutate` plants one change a band and each must turn its own band red. No band that judges a party turns red while X27 is out of band.

---

## 6. The gap list

Every place the plan, the dives and the audits did not measure on this frame, and what rests on it. 34 gaps. Lane ids are `30-plan.md` section D, guard ids its section E.

| # | The gap | Decisions resting on it | Lanes | Guard |
|---|---|---|---|---|
| 1 | Every "weeks" and "days" number is counted at 3.3 hunted hours a day. At 12 h each is 3.6 times shorter | 30-1, 24-9, 31-5, 31-6, 26-3, 25-4, 24-10, 27-5, 31-2 | L06, L22, L42 | G9, G20 |
| 2 | G18 held the Own four to 3.3 to 5.3 hours a day. Re-based to 12 by the merged lane. The plan text of section E still prints the old band | 25-1 | L40 | G18 |
| 3 | On-call heroes spend "idle stamina, 4.7 of 8 hours a day". At 12 h there is none. An on-call hour is an hour the owner's hero did not hunt for itself | 25-1, plan C12 and S4 | L40 | G18 |
| 4 | "Stamina does not bind" is false on this frame, so what Premium's bar and a refill are worth was never measured. A refill is now hours 13 to 16 | 24-1, 24-3, 24-4, A-6, A-7 | L06, L27 | G22 |
| 5 | The yard was sized against 14 to 20 idle hours. A hero has 12 rested hours, shared with every bench, node and cure | 21-7, 24-8, 26-5, 26-10, A-4, A-5, 31-7 | L19 | G11, G12 |
| 6 | No LOW kit was ever played past the start kit. Nobody knows if an arrival survives Normal at Levels 15, 30, 45, 60, 75, 88 or 110 | 21-1, 21-2, 21-3 | L15, L16 | G1, G5 |
| 7 | BiS is "fully invested", COMPUTED by multiplying dives' cells at eight points. It was never built from data or played. Chest armor, uniques and linings are not in it | 30-2, 23-5, 22-2, 22-3 | L29, L37, L52 | G4, G10 |
| 8 | MID is "the played kit": what a few recorded heroes wore, with no rule for Tempering or jewelry tier | every number in `ref.json` | L14 | all |
| 9 | Eight reference points. Nothing between Level 10 and 30. No tier-gate arrival. Nothing played past 175. Levels 240 and 400 are formulas | A-10, 24-2, 24-11, 30-3 | L47, L56 | G1, G15 |
| 10 | The pair and the three are ASSUMED at 1.2 and 2.0 | 30-1, plan C4, 24-9, 31-5 | L16 | G19 |
| 11 | Dangerous was never a cell of its own. Only Normal and Deadly were played | 21-3 | L16 | G3, G5 |
| 12 | The Level table is held on the lone hero. The four, which is nearly everyone after a month, runs 2.2 times faster: Level 200 on day 66, Level 400 on day 174 | 21-4, 30-1, 30-2, 27-2 | L05, L16 | G1, G3 |
| 13 | The runway: "the Morrow Hills must be open about six weeks after a wipe" was the 8.4 h player. A 12 h four leaves open content on day 27 and staged content on day 60 | 31-2, 30-7, A-10 | L47, L52, L56 | none |
| 14 | A death's cost was read to about Level 110 (7 to 27 hours). It is 57 hours at Level 200 and 148 at 400 | 21-8, plan C3 | L23 | none |
| 15 | Two ruled death bands disagree (10-25 "Extreme" and G5), and neither is checked against the cost of a death at that Level | 21-3, 30-5 | L16 | G5 |
| 16 | Very Rares and Luck were ruled in hours and read in weeks at 3.3 h. At 12 h an own four finds a Very Rare every 1.3 to 1.9 days through Krell, and the Luck bar's far end is 14 months | 23-3, 30-3, plan C5, A-9, 27-3, 30-4, 30-9 | L20, L34, L47 | G13 |
| 17 | Weekly caps against a 12 h pace: six opens a week and a chest piece in 7 to 8 weeks, in bands that last 3 to 11 days | 22-1, 22-2, 22-3, 22-5, 22-6 | L18, L29, L30 | G21 |
| 18 | Tempering's share of a band's gold was sized on one hero's life. Four heroes pool one purse | 23-2, 24-11, 24-12 | L35 | G12, G15 |
| 19 | The four's gold uses "a third of supplies home-made", REAL at 1.57 town hours a hunted hour. At 12 h it is 1.0 at most | 30-5, 25-8 | L16, L22, L32 | G8 |
| 20 | Benches, the farm, curing and room rungs were sized on that same town time | 26-1, 26-2, 26-4, 26-7 | L09, L33, L38 | none |
| 21 | Server-sized sinks (the market goal of 20k gold a weekly account, Town Works, the castle, the clan fee) were sized on 3.3 h income | 24-7, 24-10, 25-4, 25-6 | L06, L42 | none |
| 22 | Server cost was sized on a 3.3 h account (177 database-seconds a day). The same account at 12 h reads about 600 today and about 190 after the fixes, by interpolation. "Small holds 260 accounts" and the 250-account gate are both stale | 28-1, 28-2, 28-3, 28-5, 28-9, 30-7 | L11, L12, L13 | G16, G17 |
| 23 | The event share (under 5% of all Level XP) was never read for a player who hunts 36 hours of a 3-day weekend | 27-5 | L26 | none |
| 24 | The Bestiary's stage clock ("a stage every 20 to 60 minutes early") and its total hours were not laid on the 12 h day | 27-3 | L20 | none |
| 25 | "Two visits a day of under four minutes" was observed, not designed. The frame needs two visits 12 hours apart, and nobody counted the presses of that day | 27-1 | L07, L08 | none |
| 26 | Boards at equal hours rank setup and refills. Whether a refill buys a rank was never asked | 27-4, 24-1 | L26 | none |
| 27 | G20's target ("the own four in about 15 weeks", ruled on 31-5) is a 3.3 h number. The ruling text of 11-21 already reads it as about 4 weeks at 12 h. The guard needs the target restated | 31-5, 31-6, 24-9 | L06 | G9, G20 |
| 28 | The Tower and the Catacombs were measured with one Level 60 four and staged rows, at one gear state | 22-1, 22-4, 22-7, 30-8 | L18, L48 | G21 |
| 29 | Scaled hunts are checked at three Levels in one kit | 22-9 | L31 | G24 |
| 30 | The spell audit sizes every cast at Level 10 and Level 60, in one kit | 32-1 to 32-8, 21-5, 21-6, 21-10 | L17, L43, L44 | G2, G23 |
| 31 | The harness is calibrated on one party, on one day, at Krell | every party band | L14 | K1 |
| 32 | Faction skills are ruled to "matter" and are sized on nothing | 31-8, 25-9 | L53 | G4 |
| 33 | Account age, server age and the newcomer were judged as designs. None has a number | 24-6, 24-7, 25-3 | L40, L41 | none |
| 34 | Gold past tier 7 and the price index past Krell are formulas with no played cell under them | 24-2, 24-11 | L22, L47 | G15 |

**Closed in part on 11-21 by `lane/d-twelve-hours`:** gaps 1, 2 and 27 have their hours fixed in the model, the gold model and the guard. The decisions resting on them still need their numbers re-read, and none of the other 31 gaps moved. Town time (gaps 5, 19, 20) was left at the real 2 to 6 hours on purpose, for this file to set.

**What was measured well and stands:** the start kit to Level 10 (27-2, L05, G6) is a real LOW-kit measurement on a played life. The drop tables matched their listed chances in real play. The first-hour text and Carry on (L03, L04, L07 to L10) rest on blind play, not on the frame.

---

## 7. The overhaul sequence

| Step | What | Owes | Gate |
|---|---|---|---|
| 0 | **Tyler rules** on section 9 | calls 1 to 4 and 13 at least. They set the bands every later step reads | none of steps 3 to 5 start on a PROPOSED band for calls 1 to 4 |
| 1 | **Harness build** (one lane, systems + designer) | the kit builder, the projector, the town model, `grid.mjs`, measured cell times, `standards.mjs` wired into the guard in report mode, G18 deleted | every kit prints from data. The grid runs inside its budget |
| 2 | **Calibrate** | X27 on at least three real parties, including a lone hero and a pair | in band, or the party bands stay in report |
| 3 | **Baseline** | the full grid on today's set. One page: every band, target against measured, the red list ranked by first-hour value | the page is read cold by someone who did not build the harness |
| 4 | **Domain re-dives**, eight, against the checklist | a card a system with K1 to K15 filled from grid cells. A verdict each. Every ruled decision the dive owns marked **stands**, **re-size** (the number moves, the ruling does not) or **re-open** (Tyler must see it again) | no blank. No number without its cell |
| 5 | **Plan re-issue** | `60-plan.md` and its decisions file. Every lane names the band it moves and the cells that prove it. Section D re-ordered | no lane rests on an open gap of section 6 |
| 6 | **Audit against these standards** | a cold read by an auditor who wrote none of it: every band, every gap closed or carried with a date, every checklist line | verdict yes, or back to step 4 |
| 7 | **Guard lines turn red** as each lane lands | | CLAUDE.md section 4 |

**What can keep building during steps 1 to 4** (it rests on play, rules or server work, not on a number from the frame): L01 to L04, L07 to L10, L12, L13, L21, L24, L25, L36, L39, L45, L46, L57.

**What should not ship a number until its cells exist:** L05 (re-check on the frame), L06 (the slot and refill rows are ruled, so they ship, and their guard targets wait), L15, L16, L17, L18, L19, L20, L22, L23, L27, L29, L31, L32, L33, L35, L37, L40, L42, L47, L48, L52, L53, L56.

---

## 8. Signs of difficulty scaling

Tyler asked for these to be called out. Four places where a band can only be met by changing a system, not a number:

1. **The Level table and the four** (gap 12, R3). A lone-seat table plus a 2.2 x four means content is eaten at twice the planned speed. Tuning cannot fix it. Either the table moves to the four or the four's advantage shrinks.
2. **Death at 6% of total Level XP** (gap 14). It grows without end. No Blessing price or death rate holds from Level 30 to Level 400 under one flat share.
3. **Weekly caps in a 12 hour game** (gap 17). A cap a week was a pacing tool for a 3 hour player. At 12 h it is the only clock in the game that does not run on hunted hours.
4. **Rested hours are now scarce** (gaps 5, 19, 20). 12 hours shared by the yard, six benches, the farm, three gathering skills and curing. Every town system was sized as if a hero had 20.

---

## 9. Tyler rules on

Each call has a recommendation and an alternative. Until a call is ruled the recommended band is used as PROPOSED.

1. **Whose clock is the Level table?** Your table says Level 200 in 140 days at 12 hours. That is a lone hero today. Nearly everyone will run four heroes after the first month, and a four levels about twice as fast. On today's numbers a four hits Level 200 on day 66 and Level 400 on day 174. Recommended: the table is the clock of a mid-geared four on the hardest tier it holds, and a lone hero is slower by the party advantage. Level XP past about Level 50 gets re-fit to that. Alternative: keep the table on the lone hero and accept that fours get there in half the days. The team would then need a new region every 24 days.

2. **Days to Level 400.** Your table stops at 300 (260 days) and picks up at 500 (560 days). Recommended: Level 400 at 4,580 hunted hours, which is 382 days at 12 hours. That is where today's curve already lands and it sits between your two numbers. Alternative: 4,800 hours, an even 400 days.

3. **How much better is best in slot than mid?** Recommended: about 15% faster kills and about 15% less damage taken, at every Level. That is enough to feel and to pay for, and small enough that one set of monsters works for everyone. Alternative: about 30% on both. Gear feels huge, but Deadly would have to be written for best in slot only and bought gold becomes a much bigger edge.

4. **What does dying cost at high Levels?** The rule is 6% of all your Level XP. At Level 100 that is 22 hours of hunting. At Level 200 it is 57 hours. At Level 400 it is 148 hours, which is 12 days of play. With every Blessing it is a quarter of that. Recommended: keep 6% and cap it in hours. A death never costs more than 48 hours without Blessings or 12 hours with all three. Alternative: keep 6% flat with no cap and let high Levels fear death the way Tibia does.

5. **How often should Deadly kill a mid-geared party?** Your October table said 50 to 100 deaths in 1,000 hours. At 12 hours a day that is a death every day or two a hero, and past Level 100 each one costs days. Recommended: judge it by XP instead. On Deadly a mid-geared party loses 6 to 12% of the XP it earns to deaths. Low gear loses over 30% and should step down. Best in slot loses half as much as mid. Alternative: keep a flat death count at every Level.

6. **How long should best in slot take?** Recommended: inside a band, the gold for all of it costs a bit more than the band earns, so you choose. The time-gated pieces take under half the band through Krell and up to the whole band after. That means weekly limits like six chest opens a week need to bend for bands that only last a week or two at 12 hours. Alternative: keep the weekly limits as they are and accept that chest pieces under Level 88 are skipped by fast players.

7. **How far ahead must content be?** At 12 hours a four leaves today's open grounds on day 27 and everything we have staged on day 60. Recommended: Early Access opens with at least 120 days of grounds for that player, and every new region is open 30 days before the first fours reach it. Alternative: 60 days at launch and a long chase past the last region that needs no new grounds.

8. **How much faster are two heroes and three heroes?** The four is ruled at 1.8 to 2.5 times a lone hero on its hardest tier. Two and three were guessed. Recommended: two heroes 1.2 to 1.5 times, three heroes 1.5 to 2.0 times, each step worth feeling. Alternative: two and three stay close to a lone hero and the jump comes at four.

9. **Luck on the new clock.** You approved the Luck bar at +16% after 500 hours and +39% after 5,000 hours. At 12 hours a day those are day 42 and month 14. Recommended: keep the hours as they are. Month 14 is a good far goal. Alternative: stretch it so the far end is about three years.

10. **What may a player cost us?** Four heroes hunting 12 hours a day cost about three and a half times what the plan budgeted. Recommended: at most 50 cents an account a month at 1,000 accounts and 30 cents at 10,000, and the server work is sized to hit that. Alternative: you set a different number, or we size to the hardware and see what it costs.

11. **How much sooner may bought gold get you there?** A player who sells Crowns for gold reaches the same gear as everyone else, only sooner. Recommended: at most twice as fast to best in slot, and never anything a free player cannot reach. Alternative: no limit on how much sooner, only on what.

12. **Is two visits a day the free game?** A free hero reaches 12 hours with two visits about 12 hours apart. Premium does it in one. Refills are only for hunting more than 12. Recommended: yes, that is the design, and we say it on the stamina bar. Alternative: the free bar should take three visits, so Premium is worth more.

13. **Do heroes work in town when they are not hunting?** A hero rests 12 hours a day. Recommended: yes, assume every resting hero is at a bench, a node or the yard for all 12 hours, and size the town for that. We also print what a player gets if they only do 4. Alternative: size the town on the 2 to 6 hours real players did, and accept that a player who fills every hour gets far more than planned.
