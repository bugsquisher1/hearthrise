# Part F: is every mechanic that matters in the simulation matrix

Critical review of the overhaul, the owner's point 5, feeding points 2 and 6. Branch `lane/d-critical-review-framework`, on `set/v0.2.144` at 3bcd313d5. Docs only. No game code, data, cache or migration was changed.

Labels used here. MEASURED means the real engine or a cached real-engine run, with the command named. COMPUTED means arithmetic on named inputs. JUDGMENT is my opinion. UNKNOWN is unknown. CODE means I read it in the file at the line given.

---

## 0. One screen

**The question.** Does the proposed simulation matrix include every major mechanic that moves hunting, combat, progression and the economy?

**The answer. No.** The matrix is a good instrument for one thing and it is honest about its limits. But it measures a narrow slice of the game, and many decisions in the book rest on what lies outside that slice.

1. **What a matrix cell is.** One party of harness heroes, on one ground, for one or two hours, on the real engine, starting at full health with 50,000 gold, 12 hours of stamina, an empty bag and store-bought supplies. CODE: `tests/hunt-core/fixtures/play-ground.mjs:127-129`, `tools/balance-program/progression-grid.mjs:146`.
2. **What a cell never holds.** Timed buffs, perks other than Tempering, Blessings, event XP, bestiary multipliers, companions, a stamina limit that binds, a purse that runs dry, home-made supplies, the market, town work, crafting, the Tower, the Catacombs, boss halls and their prizes, scaled hunts, and every MMO layer piece. Each of these is wired in the engine or planned in the book. None is in a cell.
3. **The registry says the same thing in numbers.** MEASURED from `tools/balance-program/proposals.json`: 23 proposals can be played and 90 are listed as not modelled. Of the 13 switched on in the "proposed game", two are identities that move no number, one is arithmetic with no patch, and two are labelled HYPOTHESIS.
4. **It is calibrated against one hunt.** One player, one day, one party of four, one ground, one tier, 39 hero-hours. Nothing lone, no pair, no three, and nothing under Level 77 on current rules. The target game starts every account with four heroes at Level 1. There is no real hour of that shape at all.
5. **Known faults, re-checked on today's code.** Three are fixed. Five are still there. The dead hero still stands up: my probe cell died 59 times in one hour. The store bill still reads 1.87 times real. The matrix's four still puts 96% of the damage on the tank against a real 69%. The full matrix of 4,338 cells has still never been run. The subset is still one seed for one hour.
6. **What it can legitimately claim today.** That a change moves no number. Which bands a change moves and in which direction. A four's Level pace on open content to roughly 10%. That is all.
7. **What it cannot claim.** Any gold number. Any survival or death number. Anything about a lone hero or a new player. Anything past Level 185 beyond shape. Anything about buffs, paid boosts, the market, town work, the Tower or the MMO layer. Whether anything is fun.
8. **So what.** About 60 of the 155 calls lean on a mechanic the matrix lacks or reads badly. They are listed in section 6 as candidates for PROVISIONAL. The largest group is every gold, price and sink number. The second is the buff and paid boost ceilings, which are products of numbers that were never played together.

JUDGMENT. The instrument is not the problem. Chapter 09 section 2.5 of the book states most of these limits plainly. The problem is that the decision rows do not carry those limits forward. A row that says "MEASURED on the uncalibrated harness, direction only" is still filed as DECIDED.

---

## 1. Read log and commands

| Source | How much | Why |
|---|---|---|
| The owner's request, the common brief, the part brief, the observed failures list | whole | the task |
| `tools/balance-program/balance-matrix.mjs` | lines 1 to 530 whole, the selftest body skimmed | the harness |
| `tools/balance-program/matrix-plan.mjs` | whole | which cells exist |
| `tools/balance-sim/cell.mjs` | whole | what a cell plays and records |
| `tests/hunt-core/fixtures/play-ground.mjs` | whole | what a harness hero is given |
| `tools/balance-program/progression-grid.mjs` | lines 1 to 260 | the cell builder |
| `tools/balance-program/matrix-metrics.mjs` | lines 1 to 200 | the metrics and the derived tables |
| `tools/balance-program/matrix-calibration.mjs` | whole | calibration |
| `tools/balance-program/standards.mjs` | header, and the band, power source and X1 to X28 tables printed by script | the bands |
| `tools/balance-program/grid-kit.mjs` | lines 1 to 60 | the kit rules |
| `tools/balance-program/proposals.json` | every row printed by script | what is and is not modelled |
| `src/core/member.js`, `src/core/hunt/xp-share.js`, `src/core/hunt-rewards.js` | whole | the member the engine reads, XP and kill pay |
| `src/core/combat-sim.js` | header only | the loop's contract |
| Every other file in `src/core` and `src/core/hunt` (60 files) | the first seven lines of each, plus searches | the mechanic list. A claim about one of these files rests on its header and a search, not a full read |
| `supabase/functions/hr-accrue/accrue-hunt.js`, `hunt-settle.js`, `accrual.js` | searches only | which modifiers the settle injects |
| `src/data/**` | file list and searches only | switches and tables |
| `docs/design/balance-program/51-baseline.md` | whole, except the per-band rows of the gold, gear, atlas and town families in sections 5 and 6 | faults and calibration |
| `10-real-players.md`, `11-krell-hunt-2026-11-20.md` | the first 45 and 40 lines | what real play covers |
| `docs/design/overhaul/09-platform-and-measurement.md` | section 2.4 and 2.5 whole, headings for the rest | what the book claims for the instrument |
| `docs/design/overhaul/decisions/all.json` | every row's id, call and the first 150 characters of its evidence, by script | which calls rest on what |
| The rulings of record | searches only. I make no claim here about what the owner approved | frame only |
| The picks file, chapters 00 to 08, studies 52 to 61 | not read | another part's job |

**Commands run.** All read-only. Outputs went to the session scratchpad.

1. `node tools/balance-program/census.mjs`, exit 0.
2. `node tools/balance-program/balance-matrix.mjs --report --subset`, exit 0. No play. It did not print STALE.
3. `node tools/balance-program/balance-matrix.mjs --report --subset --base proposed`, exit 0. No play. It did not print STALE.
4. `node tools/balance-program/progression-grid.mjs --report`, exit 0. No play.
5. `node tools/balance-program/balance-matrix.mjs --selftest`, exit 0, green in 7 seconds.
6. A probe script of mine in the scratchpad. It calls `planMatrix` to count cells, then plays two cells through `buildCell` and `runCell`, one seed for one hour each. It writes nothing.
7. `node -e` one-liners that print `standards.mjs`, `proposals.json`, `knobs.json` and `decisions/all.json`.
8. `grep` searches across `src/core`, `src/data`, `supabase/functions/hr-accrue` and the tools.

**The census as a cross-check.** It counts 1,454 top-level functions in the rule code. 149 hold a typed number and 24 of those are named in a register. It sees functions, not data tables or named constants, so it cannot stand in for this walk. It did confirm one thing for me. The rule code under `hr-accrue` holds the most unnamed numbers, in `intents.js`, `hunt-settle.js`, `tick-gather.js`, `set-activity.js`, `market.js` and `spend.js`. Those are the economy and town paths, which is exactly where the matrix has no cell.

---

## 2. What a cell is

Every cell of the grid, the matrix and the solver's rate table is built by one function, `buildCell`. That is a real strength. It also means one list describes them all.

**A cell sets:** the ground, the party's weapon ways, the Level, the skill line for that Level, the kit for the gear state, Tempering rungs where the kit has them, the tier, and the tier's pull. CODE: `progression-grid.mjs:146`.

**The fixture then fills in the rest with constants:** full health, 50,000 gold, a gold floor of 0, 12 hours of stamina, an empty inventory, no deaths today, no perks, no buffs. CODE: `play-ground.mjs:127-129`.

**It runs on the real engine.** The path is `runCell`, then the edge settle `accrueHunt`, then `src/core/combat-sim.js`. So to-hit, armor, the mitigation cap, spells, runes, statuses, monster spells, shooters, pulls, tiers, seats, threat, healing, food, drink, the store, drops and the party XP table are all the game's own code. I count that as real.

**Sample size.** MEASURED by my probe.

| Run | Cells | Seeds and hours | State |
|---|---|---|---|
| The subset, used for every diff | 259 | 1 seed, 1 hour | cached and fresh |
| The proposed game, same cells | 259 | 1 seed, 1 hour | cached and fresh |
| The full matrix | 4,338, in 8,676 seed jobs | 2 seeds, 2 hours | never run. No `balance-matrix.json` exists |
| The progression grid | 1,363 | 2 seeds, 2 hours | cached, in report mode |

The subset holds lone heroes and fours only. It has no pair and no three. The book's chapter 09 says the subset is 207 cells. It is 259 today.

---

## 3. The mechanic list, built from the code

"Real" means the game's own code runs in the cell. "Constant" means the engine reads it but the harness pins it so it never varies. "Absent" means no cell holds it. Calibration is against the one real hunt of section 4.

### 3.1 Combat

| Mechanic | Where | In the matrix | Calibrated | Bands | Notes |
|---|---|---|---|---|---|
| To-hit, crit, max hit | `src/core/combat.js`, `src/data/to-hit.js` | real, with knobs | kills within 11% on one party | P, S | the real hunt predates the to-hit change |
| Armor, dodge, absorb, ward, the cap | `src/core/mitigation.js`, `hunt/damage.js` | real, with knobs | no. A four's damage total reads about a third low | S1, S3 to S5 | open question in study 51 |
| Max health, mana, regeneration | `src/core/vitals.js` | real. Regeneration is inferred, not an event | no | S | `cell.mjs` header says a dip can read deeper than it was |
| Spells, runes, the spell rule | `hunt/abilities.js`, `src/data/runes.js` | real | no. No real player has played the spell rule | P, G | study 51 caveat 1 |
| Rune tier a caster buys | `tools/balance-sim/played.mjs` | approximated by a kit rule | no. This is the store bill fault | G | F5 |
| Statuses, bleed, heal cut | `hunt/status.js`, `hunt/heal-cut.js` | real | no | none direct | a status tick is one of the census's unnamed numbers |
| Monster spells and windups | `hunt/monster-spells.js`, switch on at `src/data/monster-spells.js:158` | real | no | S | |
| Shooters | `hunt/shooters.js` | real | split yes in real seats, total no | S | only three grounds have them |
| Pulls and tier dials | `hunt/pull-cycle.js`, `src/data/hunt-tiers.js` | real, with knobs and three patches | kills within 11% on Deadly only | P9, P10, S6 | Normal and Dangerous have no real party on current rules |
| Seats, threat, Challenge | `hunt/roles.js`, `hunt/targeting.js` | real engine, wrong lineup | no for the matrix's four | S | F16 and F11. Tank positions are unnamed numbers per the census |
| Bar setup and conditions | `hunt/conditions.js`, `src/data/start-kit.js` | one "played" bar per role | no | none | real players' hours to Level 10 spread eight times, fastest to slowest. Standard X20 names setup quality |
| Elements, weakness, bane | `src/core/elements.js`, `bane.js` | real where the kit carries them | no | none | |
| Tempering | `src/core/temper.js`, `member.js:279` | real, rung 0, 2 or 5 by gear state | no | E | unique bands are shut |
| Jewelry perks | `member.js:125` | real for the built ones | no | E | the book's GR-39 row says 18 of 23 perks have no engine hook |
| Linings, 12 perk seats, worn in, jewelry tiers 4 to 7 | not built | absent. Listed as ruled, never played | no | none | `grid-kit.mjs` header |
| Necrotic and Storm, fists | `src/data/necrotic-storm.js:34`, `src/data/fists.js:30`, both switched off | absent | no | none | |
| Timed buffs: damage, crit, drop rate, steady, gold find | `member.js:60`, `combat.js:425`, `hunt-rewards.js:135` and `:155` | absent. The hook exists, no cell sets it | no | none | this is the engine slot the whole MMO buff table would use |
| Hone and ammo | `src/core/ammo.js` | real | no | G | |

### 3.2 Hunting and progression

| Mechanic | Where | In the matrix | Calibrated | Bands | Notes |
|---|---|---|---|---|---|
| Kill XP and the party class table | `hunt/xp-share.js:70` | real, with knobs | XP a kill exact, XP an hour within 11% on one four | P | |
| The under-floor share for a low seat | `hunt/xp-share.js:78` | real but never triggered. Every cell is one Level | no | none | the mixed-Level line of MM-19 has no cell |
| Skill XP by route | `hunt-rewards.js` | real | skill lines match within 1 to 4 levels at 45 to 79, per study 10 | none direct | |
| The skill a hero has at a Level | `tools/balance-sim/skill-lines.json` | a fitted line, then the reference curve past 100 | partly | all | V1 is fixed. Real Defense on back seats is 21 to 32 under the line |
| Live event XP | `accrue-hunt.js:145`, `src/core/live-events.js` | absent | no | P13, no reader | the real hunt ran 54% of its hours inside a +25% event |
| Bestiary relic multiplier | `member.js:351` | absent | no | none | |
| Bestiary charms and trophies | `src/core/charms.js`, `trophies.js` | absent. Nothing in the engine or the edge imports either file | no | none | unwired code |
| Companions | `src/core/companion-perk.js` | absent. The settle passes no companion | no | none | |
| The rested bank | `src/core/rested.js`, `member.js:220` | real and inert. A hunt passes zero | n/a | none | the "rested off" patch is an identity for this reason |
| Death and its cost | `combat-sim.js:194`, `action-rules.js:337` | approximated badly | no | S6, S11 | F4. Section 5 |
| Blessings | `src/data/blessings.js:53`, applied in the database | absent. Arithmetic only | no | S11 | the registry says the engine holds no Blessing for a harness hero |
| Stamina and refills | `action-rules.js:298`, `src/data/stamina-refill.js` | constant. 12 hours given, cells last 1 or 2 | no | X6 | a separate model, `stamina-day.mjs`, covers the day |
| Premium | not in the engine member | absent | no | X4 | |
| Tiers past Level 185, Levels 1,000 to 5,000 | `grid-project.mjs` | projected on a placeholder ground and gear line | cannot be | all, labelled | shape only |
| The Tower, its heat, the Catacombs | `hunt/tower.js:144`, `src/data/tower.js` | absent from every plan. The cell runner can play a climb, no run asks it to | no. The one real climb reached floor 182 where the older simulator said 66 to 70 past Level | none | |
| Boss halls and the daily prize | `hunt-rewards.js:105`, `hunt/boss-room.js` | absent. No cell sets the prize flag | no | none | hall win rates in the book came from a separate study |
| Boss calls, scaled hunts, training | `hunt/boss-phases.js`, `src/data/scaled-hunts.js`, `hunt/training.js` | absent | no | none | |
| Hearthfind | `hunt-rewards.js:148` | absent. The flag is false | no | none | |

### 3.3 Economy

| Mechanic | Where | In the matrix | Calibrated | Bands | Notes |
|---|---|---|---|---|---|
| Coin a kill | `hunt-rewards.js:120` | real | within 9% on one four | G | |
| Loot value | `tools/balance-sim/cell.mjs:435` | approximated. Every drop is sold to the vendor at once | no | G | an upper bound on coin, a lower bound if a market exists |
| Drop tables and rare rolls | `src/core/drops.js`, `party-split.js` | real | rare rows land at their odds in real play, per study 10 | D1, D2 | the Very Rare tier does not exist yet |
| Luck | no engine hook. One comment in `drops.js` | absent | no | D4 | |
| The store bill | `hunt/consumables.js`, `src/data/supply-basics.js` | real engine, wrong shopping | no. 1.87 times real | G-2 to G-9 | F5 |
| Home-made supplies | none in a cell | a flat quarter taken off the bill by arithmetic | no. Real play was about a third | G | `progression-grid.mjs` `ownShareAt` |
| The purse and the gold floor | `member.js` `sharePurses` | constant. 50,000 gold, floor 0 | no | none | a hero can never run out, so "spending while you sleep" has no cell |
| Gathering, benches, cooking, farming | `skill-sim.js`, `artisan-sim.js`, `farm.js`, the `accrue-gather` and `accrue-artisan` paths | absent from the matrix. The atlas and solver compute over data | no | T1 to T7. T3 has no reader | real players spent 1.57 times as many hours on town work as on hunting |
| Bench tax, tools, room perks | `bench-tax.js`, `tools.js`, `perks.js` | absent | no | none | |
| The market, listings, fees | `supabase/functions/hr-accrue/market.js`, not read | absent | no | none | every price between players is outside every tool |
| Salvage, crafting, Hallmarks, reforging | data and `artisan.js` | absent. Prices are read from data by the kit builder | no | E3, E4, G-10 | unjudged past Level 185 |
| Gold sinks, prices, the wage | `src/data/gold-sinks.js`, `gold-ladders.js` | absent. The wage formula does not exist yet | no | G-10, G-11 | the registry lists step R15 as not written |
| Server-wide gold over time | `gold-model.mjs` | a separate model | no | G-9, G-11 | |

### 3.4 The MMO layer and money. All PROPOSED, none built

| Mechanic | In the matrix | Notes |
|---|---|---|
| Four heroes from the first hour | called an identity. The matrix never charged for a slot | no real account has played that opening |
| One modifier table for every buff | absent. It does not exist in the engine | the registry lists it as not written |
| Clan buffs, event buffs, arena buffs, boss buffs | absent | |
| Bought timed boosts | absent | |
| World bosses, arenas | absent. The engine has never run heroes on both sides | the book's own row MM-41 says this is the missing evidence |
| The Crown Exchange, keyed halls as a door, the Kindlings | absent | |
| Clan castle, factions, on-call or mixed-Level play | absent. The matrix plays one account's heroes | |

**The count.** JUDGMENT on my own rows. Of about 55 mechanics, 20 run for real in a cell. Only kill rate, XP and coin have any calibration, and all three rest on the same single party. About 12 are pinned or approximated. About 23 are absent.

---

## 4. Calibration: what "checked against real play" means here

MEASURED from the cached report, command 2. The matrix's standard four against the one real hunt:

| | Real | The matrix's four | Ratio |
|---|---|---|---|
| Kills a party-hour | 1,251 | 1,386 | 1.11 |
| Level XP a hero-hour | 1,001,000 | 1,107,648 | 1.11 |
| Coin a hero-hour | 15,100 | 16,504 | 1.09 |
| Store gold a hero-hour | 10,600 | 19,790 | 1.87 |
| Front hero's share of damage taken | 0.69 | 0.96 | 1.40 |
| Healer's damage taken an hour | 48,900 | 467 | 0.01 |
| Front hero's damage dealt an hour | 67,400 | 33,242 | 0.49 |

Four things a reader should know.

1. **One hunt.** One person's four heroes, Level 77 to 80, one ground, Deadly, one day, 39 hero-hours, zero deaths. Study 51 says so plainly. Every party band in the framework rests on it.
2. **The book says the harness reads 10% slow. The cache reads 11% fast.** Both are true and the difference matters. The 11% fast is today's engine against the hunt as it was played. The 10% slow comes from a guard line that first restates the real hunt upward by two formula changes, each measured by the simulator against itself. So the "real" side of that ratio is partly the instrument's own output. I did not re-run that guard line. JUDGMENT: "within about 10%, direction unsure" is the honest reading. "Reads slow" is not established.
3. **The store fault is a shopping fault, not an engine fault.** MEASURED from the same report. When the engine plays the recorded heroes with their own bars and stock, it reads 4,227 store gold against that fixture's real 5,216. The harness's own kit rule reads 19,790. So the engine prices supplies about right, and the harness hero buys the wrong things.
4. **The calibration row means nothing on the proposed game.** There the same four reads 0.73 of the real XP, by design, because the proposal changes what a kill pays. That is correct. It also means that once the proposed formulas land, there is no real data left to check the instrument against until people play the new rules.

**What has no real data at all.** A lone hero on current rules. A pair. A three. Any party on Normal or Dangerous. Anything under Level 77. A new account with four heroes. A lowest-health reading from any real hunt, because the server tally does not record one.

---

## 5. The known faults, re-checked on today's code

| Fault | Today | How I checked |
|---|---|---|
| Skills in a straight line past the measured Levels | **Fixed.** The lone hammer plays Melee 129 at Level 400 | MEASURED, command 2, the "skills played" line. Past 1,000 the line is nearly flat, 167 to 183 |
| Two cell builders that disagreed | **Fixed.** One `buildCell` feeds the grid, the matrix and the rates | CODE, `matrix-plan.mjs` header and imports |
| The ground axis had no band rows | **Fixed.** | MEASURED, the selftest line "the ground axis carries band rows" |
| No lowest-health reading in the harness | **Fixed in the harness.** Still missing from the real tally, so it cannot be calibrated | CODE, `cell.mjs` encounter tracking. The tally half is study 51's claim |
| A dead hero stands up at once | **Still there.** A lone low-gear hero at Level 20 on Deadly died 59 times in one hour across 59 fresh hunts | MEASURED, command 6. CODE, `cell.mjs:205-411` |
| A change to the death cost is invisible | **Half there.** A derived band exists. It multiplies a ruled death count by a ruled cost. No cell carries a death's XP loss into the next hunt, because each new hunt starts from the cell's Level | CODE, `matrix-metrics.mjs` `afterDeaths`. MEASURED: the probe hero "lost" 4.27 million Level XP in an hour and was still Level 20 |
| The store bill reads 1.7 to 2.2 times real | **Still there.** 1.87 today, 1.64 on the proposed game | MEASURED, commands 2 and 3 |
| The matrix's four sits in the wrong seats | **Still there by choice.** 96% on the tank against a real 69% | MEASURED, command 2. Real seats are played only in the calibration columns |
| No pair or three cells | **Still there in the subset.** The full run has them and has never run | MEASURED, command 6 |
| One seed for one hour | **Still there.** | CODE, `matrix-plan.mjs:69`. MEASURED, the cache header |
| The full matrix was never run | **Still there.** 4,338 cells now, not the 4,322 the docs give | MEASURED, command 6, and no cache file exists |
| Gold numbers are upper bounds | **Still there.** Loot is sold to the vendor at once, the purse never empties | CODE, `cell.mjs:435`, `play-ground.mjs:128` |
| Dropped party-size bands still print | **Still there.** The grid report still prints the six party-size bands the book says print nothing | MEASURED, command 4 |

**Two faults I add.**

- **A death is charged a minute it did not hunt.** CODE, `cell.mjs:408`. Each hunt counts as at least 60 seconds of the cell's hours. My probe hero hunted 0.19 hours and the cell booked 0.98. On a failing cell the hours are wrong as well as the deaths.
- **Every hunt starts at full health with a full purse and a full stamina bar.** So no cell can see a hero who arrives hurt, broke or tired. That is fine for a rate. It is not fine for any decision about what happens across a day, such as the refill price or spending while asleep.

---

## 6. Verdict by domain

### Combat
**Can claim.** That a formula change is an identity. Which ways and bands a combat change moves. Relative order between weapon ways alone, as a direction.
**Cannot claim.** How much damage a party really takes. Whether a party survives a tier. How a lineup really sits. Anything about Necrotic, Storm, fists, linings or the 12 perk seats.

### Hunting
**Can claim.** A four's kills and Level XP an hour on open content, to about 10%, on Deadly. Shape past Level 185.
**Cannot claim.** A lone hero's pace. A new player's first hours. Normal and Dangerous for a party, in calibrated terms. Death rates. The Tower, the Catacombs, boss halls, scaled hunts.

### Progression
**Can claim.** Arithmetic on the Level table: hours to a Level given an XP rate.
**Cannot claim.** That the XP rate under that arithmetic is the rate players will have. It leaves out event XP, the buff table, bought boosts, Premium, deaths, and the gap between a harness setup and a real one. The book's own ceilings put up to 1.58 to 1.65 times on top of the plain rate. None of that product has been played.

### Economy
**Can claim.** Coin a kill, to about 9% on one party. That a supply price change moves the bills it aims at.
**Cannot claim.** Net gold. Any price in days of income. Any sink share. Anything about the market, town work, crafting or home-made supplies. The framework has no wage formula yet, and its hunting gold is direction only by its own statement.

### The MMO layer and money
**Can claim.** Nothing. No piece of it exists in the engine or in a cell.
**Cannot claim.** Every number in it is COMPUTED by multiplying caps, or is a HYPOTHESIS with a playtest named.

---

## 7. Decisions that rest on what the matrix lacks

These are candidates for PROVISIONAL under the owner's point 6. I name the gap. I do not rule on the design. Evidence labels are quoted from the first 150 characters of each row in `decisions/all.json`, which is all I read of them.

**Group A. Every gold, price and sink number.** The gap: net gold is direction only, the wage formula does not exist, and town work, the market and home-made supplies are in no cell.
- GR-8, sinks that follow the gear.
- GR-51, prices in hours of a wage.
- GR-58, the refill price. Its own evidence line says every net gold number is direction only.
- CE-4 and CE-5, what early gold buys and early prices for an account of four.
- MM-22, where the slot gold goes. Its row says no measurement stands behind the new sizes.
- MM-33, the gold ceiling.
- GR-50 and GR-55, the market and when it opens.
- GR-54, GR-74, GR-76, GR-77, the yard, the farm, room rungs and seeds. All town-side.

**Group B. Survival, death and the harder tiers.** The gap: survival cannot be calibrated, a failing cell counts retries, death rates rest on three checkpoints, and no cell holds a Blessing.
- GR-3 and CORE-1, what Deadly asks for and the raised dials. Two seeds of one hour on the uncalibrated harness.
- GR-27, what Dangerous brings. One seed, one hour, not played at the raised dial.
- GR-7, death past Level 100. Computed on an assumed death count.
- CORE-3, the cap on "takes more" effects.
- C3, the start-kit four in the Sewer. It was played properly, 128 hero-hours. But the harness hero has never died on Normal, and real new players died 7 times in 78 hours.

**Group C. The pace chain.** The gap: each link is computed on the one before, and the base is one party's XP rate.
- GR-5, what a kill pays. Computed, with a stated hypothesis about the cause.
- GR-6, GR-6a, GR-6b, the Level table and its clock. They sit on GR-5 and on a "plain four" that no buff, event or death touches.
- GR-4, the gear curve. Stand-in grounds, and the band size is a stated hypothesis. The kit builder also does not wear the unique lines from 110 to 185.
- GR-33 and GR-40, region length and build pieces before Krell. Both read days off the same table.
- GR-23, skill at high Level. Computed on the proposed gear curve.

**Group D. Buffs, boosts and ceilings.** The gap: the modifier table does not exist, no cell has ever held a timed buff, and the ceilings are products.
- MM-24, MM-25, MM-26, the buff table, the caps and the power budget.
- MM-29, MM-30, MM-31, MM-32, the store list, bought boosts and the pace and gear ceilings.
- CORE-4, buffs inside the 60% mitigation cap.
- CE-2 and MM-42, the timed drop buff and events that pay buffs.

One specific worry under group D. The ceilings assume that damage times damage times XP gives pace. On at least one ground the kill rate is set by respawn, not by damage. MEASURED in study 51 section 2.3: one ground reads 675 kills an hour with any two seats. Where that holds, a damage buff buys nothing and the ceiling is overstated. Where a buff lets a party hold a higher tier, the gain is a step, not a product, and the ceiling is understated. UNKNOWN which case is common.

**Group E. Unbuilt modes.** The gap: no cell at all.
- MM-2 to MM-7, world bosses. MM-12 to MM-16 and MM-38 to MM-40, arenas.
- MM-19, the mixed-Level line. The engine rule exists and no matrix cell mixes Levels.
- GR-36 and GR-37, the Catacombs and the Tower's beat. The one real climb already contradicted the older simulator by more than 100 floors.
- GR-39, perk sizes, and GR-38, jewelry past Level 30. The registry labels both hypothesis or ceiling.
- GR-16, GR-17, GR-20, Necrotic and Storm, fists, and statuses that open a damage kind.

**What is not on this list, and why.** GR-22, GR-52, GR-63, GR-14 and the identity steps of GR-85 were played on the matrix inside the range it can be trusted for: a targeted move with nothing else moving, or an empty diff. JUDGMENT: those are the framework working as designed. GR-52's size on a party bill is still tied to the store fault.

---

## 8. What would have to be true before these are final

Not a new call list. These are measurements and play, in the order I would want them.

1. **Play the target opening.** A new account, four heroes, the first hours, on live, with the kit written down. Nothing in the framework has a real hour of the target game's most common shape.
2. **Close the death fault and the store fault before quoting any survival or gold number.** Both are already decided in the book as tools work. Until they land, groups A and B stay provisional.
3. **Put one timed buff in a cell.** The engine hook exists at `member.js:60`. A single cell with +10% damage on three grounds would show whether the ceilings of group D are products or not. This is cheap and it tests the biggest unplayed assumption in the money design.
4. **Run the full matrix once.** It has never run. Until it does, nobody knows what most of its 4,338 cells say. The pair, the three, the ground axis for parties and most gear and tier mixes exist only there.
5. **Get a second real party**, and record lowest health in the server tally. Then survival can be checked at all.
6. **Say in each decision row what it waits on.** JUDGMENT: this is the cheapest fix of all. The evidence text already admits the limits. The status word does not.

---

## 9. What I did not check

- I did not read chapters 00 to 08, studies 52 to 61, or the picks file. Section 7 rests on each row's opening evidence text only. A row may carry stronger evidence further down than I saw.
- I did not re-run the guard line behind the "10% slow" figure.
- I read `market.js`, the gathering and artisan paths, and `src/data` by name and search only. The town and market rows of section 3.3 say "absent from the matrix", which I am sure of. I make no claim about how those systems behave.
- I did not run the full matrix, the death run, or any browser.
- My count of 55 mechanics is my own grouping. Another reader would cut it differently.
