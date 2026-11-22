# 06. Coverage: what the simulator includes, approximates and excludes

Deliverable 6 of the balance baseline request (Tyler, 2026-11-21). Lane `lane/bl-baseline`, systems engineer.

The baseline is the overhaul's starting point: branch `baseline/overhaul-start`, which is `set/v0.2.144` frozen at `861ae52e3`. Every statement here is about that tree and the harness on `lane/bl-baseline` that measures it.

Labels. MEASURED names the run or command. COMPUTED is arithmetic on named inputs. CODE means I read it at the file named. JUDGMENT is my opinion. UNKNOWN is unknown.

This report builds on the framework audit (`docs/design/overhaul/review/F-framework-audit.md`) and chapter 12 section 9 (`docs/design/overhaul/12-balance-pass.md`). Where a row has changed since the audit, the last column says so.

---

## 0. One screen

1. **The engine is real.** Every cell plays `src/core/combat-sim.js` through the edge settle (`supabase/functions/hr-accrue`, `accrueHunt`), driven by `tests/hunt-core/fixtures/play-ground.mjs`. To-hit, armor, the mitigation cap, spells, runes, statuses, monster spells, shooters, pulls, tier dials, seats, threat, healing, food, drink, store buys, drops and the party XP table are the game's own code. CODE: `tools/balance-sim/cell.mjs` header.
2. **The heroes are harness heroes.** Each one wears a kit built by rule, has skills from a measured career line, uses one "played" bar for its way, buys every supply from the store, starts each hunt at full health with 50,000 gold and 12 hours of stamina, and holds three Blessings by arithmetic. None of these is a real player's choice. CODE: `tools/balance-program/progression-grid.mjs` `buildCell`, `play-ground.mjs`.
3. **What a cell cannot see at all.** Town work, the market, crafting, home-made supplies, live events, timed buffs, Talents, fists, Necrotic and Storm, the Tower, boss halls, scaled hunts, training, Hearthfind, companions, mixed-Level parties, heroes against heroes, and every choice a real player makes about which tier to pick or when to log in.
4. **Calibration is thin.** One real four at Krell's Hold for one day (39 hero-hours) and four aggregate rows of real fours on Deadly (C-2, 396.5 hero-hours in all). Nothing lone, nothing on Normal or Dangerous, nothing under Level 32. Section 4 has the numbers on this pin.
5. **What the baseline can claim.** Which outcomes a change moves, in which direction, and by how much against measured run-to-run noise, across every way, gear state, tier, open ground and party shape in live content. Kills, XP and coin an hour for a four on Deadly to about 5 to 20% of real play.
6. **What it cannot claim.** Absolute gold (an upper bound, see 3.3), absolute survival on Normal and Dangerous (no real data), anything about a real player's day, and anything past Level 110, which is not live content (the `beyond` block measures it on staged and placeholder grounds and labels it so).

My count (JUDGMENT, my own grouping): of 53 mechanics in section 2, 20 run for real in a cell (two of them with a harness-approximated reading), 9 are approximated or pinned to a constant, 23 are absent, and one (the rested bank) no longer exists.

---

## 1. What one baseline cell is

| Input | What the harness sets | Where |
|---|---|---|
| Ground | the game's own advice for the Level and party size (`recommendedHunt`), open grounds only. The `grounds` block names each open ground. The `beyond` block uses the matrix's staged and placeholder grounds | `progression-grid.mjs` `groundAt`, `baseline/scenarios.mjs` |
| Party | one of the engine's eight weapon ways alone, the pairs and the three of `standards.mjs` PARTIES, the standard four in the real Krell four's seats (hammer, bow, mage, healer), or one of eight lineups | `matrix-plan.mjs`, `standards.mjs` |
| Kit | LOW, MID or BIS, each a rule over `src/data` (LOW is the arrival kit: the MID kit one band back in gear), Tempering rungs by state | `grid-kit.mjs`, `standards.mjs` GEAR_STATES |
| Skills | the career line measured on the engine (`skill-lines.json`), the front seat trained in Defense as the party career's front was | `skill-lines.mjs`, `standards.mjs` SEAT_DEFENSE |
| Bar | one "played" bar a way, casters shopping one rune tier under what Magic allows (BIS: what Magic allows) | `tools/balance-sim/played.mjs` |
| Supplies | every heal, drink, rune and arrow bought from the store when used | `cell.mjs` `bagFor` with supply `store` |
| Purse and stamina | 50,000 gold, a floor of 0, a 12 hour bar. Neither binds in any baseline cell (the longest hunt is 8 hours) | `play-ground.mjs` |
| Death | the real rule: a death ends that hero's hunt and costs 6% of Level XP, cut by three Blessings, and the hero stays home for the rest of the seed. The rest of a party hunts on | `cell.mjs` header, `buildCell` |
| Time | one continuous hunt a seed, 1 hour at Levels 1 to 9, 2 at 10 to 29, 4 at 30 to 59, 8 from 60 (check C3: 8). Eight seeds | `baseline/scenarios.mjs` |

---

## 2. Mechanic by mechanic

INCLUDED means the game's own code runs in the cell. APPROXIMATED means the cell has it, but by a harness rule, a constant or arithmetic rather than by play. EXCLUDED means no baseline cell holds it.

### 2.1 Combat

| Mechanic | Where | In the baseline | Notes | Since the F audit |
|---|---|---|---|---|
| To-hit, crit, max hit | `src/core/combat.js`, `src/data/to-hit.js` | INCLUDED | | same |
| Armor, dodge, absorb, ward, the 60% cap | `src/core/mitigation.js`, `hunt/damage.js`, `src/data/core-model.js` ARMOUR_MITIGATION | INCLUDED | FB-8 stage 1 changes the armor k (section 08 demo) | same |
| Max health, mana, regeneration | `src/core/vitals.js` | INCLUDED, regeneration APPROXIMATED in the reading | the engine emits no regeneration event, so the harness infers a constant rate a settle window. A dip can read a little deeper than it was | same |
| Spells, runes, the spell rule | `hunt/abilities.js`, `src/data/runes.js` | INCLUDED | | same |
| Which rune tier a caster buys | `played.mjs` shoppingTier | APPROXIMATED by a rule | the rule copies the real four's shopping (11-krell section 4) | fixed since the audit's store fault (section 4) |
| Statuses, bleed, heal cut | `hunt/status.js`, `hunt/heal-cut.js` | INCLUDED | | same |
| Monster spells and windups | `hunt/monster-spells.js`, switch on at `src/data/monster-spells.js:158` | INCLUDED | | same |
| Shooters | `hunt/shooters.js` | INCLUDED | | same |
| Pulls and tier dials | `hunt/pull-cycle.js`, `src/data/hunt-tiers.js` | INCLUDED | the FB-1 stall fix (02364f03a) is in the pin | the stall is fixed |
| Seats, threat, Challenge | `hunt/roles.js`, `hunt/targeting.js` | INCLUDED | the standard four now sits as the real four did | the seat fault is fixed |
| Bar setup and conditions | `hunt/conditions.js`, `src/data/start-kit.js` | APPROXIMATED, one played bar a way | real players' setups vary widely (the audit: hours to Level 10 spread eight times) | same |
| Elements, weakness, bane | `src/core/elements.js`, `bane.js` | INCLUDED where the kit carries them | | same |
| Tempering | `src/core/temper.js` | APPROXIMATED, rung 0, 2 or 5 by gear state | | same |
| Jewelry perks | `src/core/member.js` | INCLUDED for the built ones | | same |
| Linings, perk seats, jewelry past tier 3 | not built | EXCLUDED | | same |
| Necrotic and Storm, fists | `src/data/necrotic-storm.js:34`, `src/data/fists.js:30`, both `live: false` | EXCLUDED | the matrix's `deaths-full` run plays them on a patch | same |
| Timed buffs | `member.js`, `combat.js`, `hunt-rewards.js` | EXCLUDED from the baseline | the matrix's buff variants play one buff. The baseline holds none, because the starting game gives a player no standing buff | the matrix gained the hook |
| Talents | no engine seam on the pin | EXCLUDED | cells carry each way's suggested build, which bites only on the matrix's scratch hook | new since the audit |
| Hone and ammo | `src/core/ammo.js` | INCLUDED | | same |
| The gear curve past Level 110 and its exchange rates | `src/data/gear-curve.js`, `gear-tiers.js` (FB-8 stage 1) | EXCLUDED in effect | no item a cell wears reads them yet. Under Level 110 the curve is its own samples, and past 110 the kits come from the staged rows and `grid-project.mjs`'s projected line. MEASURED, run 44985095603: FB-8 stage 1 moved no beyond-block cell's DPS or pace. The matrix plays the curve only through its R10 plan step, a harness stand-in | new |

### 2.2 Hunting and progression

| Mechanic | Where | In the baseline | Notes | Since the F audit |
|---|---|---|---|---|
| Kill XP and the party class table | `hunt/xp-share.js` | INCLUDED | | same |
| The under-floor share for a low seat | `hunt/xp-share.js` | EXCLUDED in effect | every cell is one Level, so the rule never triggers | same |
| Skill XP by route | `hunt-rewards.js` | INCLUDED | | same |
| The skill a hero has at a Level | `skill-lines.json` | APPROXIMATED, a measured career line | held fixed on both sides of a comparison: a change to skill XP moves the XP outcome, not the next cell's skills | same |
| A hero levelling inside a cell | the settle | INCLUDED | a cell plays 1 to 8 hours, so its hero gains Levels inside it (COMPUTED: about 1.3 Levels in a 4 hour cell at 30). The cell is read at its starting Level | new |
| Live event XP | `accrue-hunt.js`, `src/core/live-events.js` | EXCLUDED | the 28 day calendar on the pin pays XP events no cell sees | same |
| Bestiary relic, charms, trophies | `member.js`, `charms.js`, `trophies.js` | EXCLUDED | | same |
| Companions | `companion-perk.js` | EXCLUDED | | same |
| The rested bank | removed on the pin (GR-63) | not applicable | | removed |
| Death and its cost | `combat-sim.js`, `action-rules.js` | INCLUDED | a death ends the hunt and the hero stays home. The audit's "dead hero stands up" fault is fixed | fixed |
| Blessings | `src/data/blessings.js`, applied in the database | APPROXIMATED by arithmetic | three held at every death, the tree's own cut (`BLESSING_CUT_PERMILLE`) applied to the engine's own XP loss, bought again after each death. The matrix's S-5 ladder (past Level 100 each ladder Level halves a blessed death) is a proposal and is stripped from every baseline job | the ladder was in the first pin runs, see 01 section 1 |
| Stamina and refills | `action-rules.js`, `src/data/stamina-refill.js` | APPROXIMATED, a 12 hour bar that never binds | the day is a separate model, `stamina-day.mjs` | same |
| Levels past live content | the matrix's STAGED and PROJECTED stretches | APPROXIMATED, the `beyond` block only | staged grounds with the staged rows opened from 110 to 185, a placeholder ground and a projected gear line past 185. Labelled "not live" in every report | new block |
| The Tower, the Catacombs, boss halls, boss calls, scaled hunts, training | `hunt/tower.js`, `hunt/boss-room.js`, `boss-phases.js`, `src/data/scaled-hunts.js`, `hunt/training.js` | EXCLUDED | the cell runner can play a climb, but no baseline block asks | same |
| Hearthfind | `hunt-rewards.js` | EXCLUDED, the flag is false | | same |
| Four heroes from the start | the pin's start flow | INCLUDED as check C3 | the default company on the Millrace Sewer at Level 5 | new |

### 2.3 Economy

| Mechanic | Where | In the baseline | Notes | Since the F audit |
|---|---|---|---|---|
| Coin a kill | `hunt-rewards.js` | INCLUDED | | same |
| Loot value | `cell.mjs` | APPROXIMATED, every drop sold to the vendor at once | an upper bound on coin a market would not pay, and a lower bound where a market pays more | same |
| Drop tables and rare rolls | `src/core/drops.js`, `party-split.js` | INCLUDED | the outcome `rareItemsPerH` counts the engine's own rare-drop hints. There is no Very Rare tier | same |
| Luck | no engine hook | EXCLUDED | | same |
| The store bill | `hunt/consumables.js`, `src/data/supply-basics.js` | INCLUDED, the shopping APPROXIMATED | section 4 shows how close it now reads | improved |
| Home-made supplies | no cell | EXCLUDED from the baseline's own net gold | the matrix's `netPerH` takes a flat quarter off the bill from Level 30. The baseline's `netPerH` does not, and says so | same |
| The purse and the gold floor | `member.js` sharePurses | APPROXIMATED, a constant that never binds | the matrix's binds variant plays a dry purse | same |
| Gathering, benches, cooking, farming | `skill-sim.js`, `artisan-sim.js`, the gather and artisan accruals | EXCLUDED | C-4: real heroes spent 1.57 times as many hours on town work as on hunting | same |
| Bench tax, tools, room perks | `bench-tax.js`, `tools.js`, `perks.js` | EXCLUDED | | same |
| The market, listings, fees | `hr-accrue/market.js` | EXCLUDED | | same |
| Salvage, crafting, reforging | `artisan.js` | EXCLUDED | prices are read from data by the kit builder only | same |
| Gold sinks past the store and Blessings | `src/data/gold-sinks.js`, clan founding (100,000 gold on the pin) | EXCLUDED | | new sinks on the pin |
| Server-wide gold over time | `gold-model.mjs` | EXCLUDED, a separate model | | same |

### 2.4 Modes, social layer and the MMO layer

| Mechanic | In the baseline | Notes |
|---|---|---|
| Clans, chat, the calendar, presence (the pin's social layer) | EXCLUDED | no balance number in a hunt reads them, except the calendar's events (2.2) |
| Party finder, mixed-Level parties, parties of several accounts | EXCLUDED | every party is one account's heroes at one Level |
| Heroes against heroes, arenas, world bosses | EXCLUDED | the engine cannot put a hero on the enemy side (MM-41's check) |
| Player policy: tier picked, hours a day, logins | EXCLUDED | the harness plays every tier at every Level. Which one a real player picks is a choice the baseline does not model |

---

## 3. The outcomes the request names, and what the harness cannot emit

| Outcome asked for | Emitted | How |
|---|---|---|
| Level XP and skill XP an hour | yes | `levelXpPerH`, `netLevelXpPerH` (after deaths, over the offered hours), each combat skill and the main skill |
| Kills an hour | yes | `killsPerH`, seconds to kill (median and slowest tenth), pulls |
| Damage dealt and taken by seat | yes | each cell's seats in its `m.seats` (style, share of damage taken, taken and dealt an hour, deaths) and the front seat's share as an outcome |
| Deaths in 1,000 hours | yes | counts and hours pooled, read as Poisson rates |
| Lowest health | yes, by the harness | each fight's lowest point (typical, worst tenth, worst hundredth) and the time under 30% and 10%, tracked from blows and heals with regeneration inferred. A fight in which the hero died can read its lowest point under zero: that is the killing blow's overkill, so read a value under 0 as "died in that fight" |
| Mana and supply sustainability | partly | mana spent, mana drinks and mana back an hour, supplies used and their gold. NOT emitted: time spent low on mana, casts held for want of mana, a supply running out. In the cell the store never runs dry and the purse never empties, so "does it last" cannot be read, only "how much it takes" |
| Supplies used | yes | units and gold an hour |
| Gold in, out and net | yes, as an upper bound | coin, vendor loot, rares, store, Blessings, net |
| Loot value | vendor value only | no market price exists in any tool |
| Rare-drop rate | yes | rare drops a hero-hour (engine), rare-table rolls a party-hour, and the matrix's per-row reveal rates |
| Time to Level | yes | hours for the next Level at every open checkpoint, and COMPUTED hours from Level 1 to 110 along the line for every way and the four |
| Anything else `cell.mjs` emits | kept in the outcome list or in the slim matrix metrics | close calls, monster hit rate, damage a monster swing, healing in and out, shields, sustain ratio, store share, the hunted share, the death tax |

**Gaps the harness cannot fill today.** UNKNOWN in every real-data sense, and not faked here:
1. Mana starvation (time near empty, casts skipped). The Balance Lab's sustain reads (`tools/balance-sim/sustain-reads.mjs`, on the set since this pin) take it from the engine's own sustain block, which the pinned tree's tally does not carry: every baseline cell reads `sustain: null`. A later pin on a tree with the block can read it.
2. A supply or purse running out mid-hunt in the baseline scenarios (the matrix's `binds` variants can).
3. Overhealing and healing efficiency (heals given are counted, heals wasted are not).
4. Threat and aggro distribution beyond the share of damage taken.
5. Any day-scale reading: stamina use, refills, logins, the away-and-return pattern.
6. Gold sinks past the store and Blessings, and any market price.
7. Event XP and any other server-side multiplier.
8. A real player's lowest health, which the server tally does not record, so the harness's lowest-health reading cannot be calibrated.

---

## 4. Calibration against production

All real numbers are aggregates already in the repo (`tools/balance-program/calibration/`). The reads behind them were read-only and aggregate only (`real-players.local.mjs`). No player is named.

### 4.1 The one real four at Krell's Hold (2026-11-20)

{{KRELL}}

### 4.2 C-2: the matrix four against real fours' recorded hunts, on this pin

{{C2}}

### 4.3 C-1: the heroes the tool plays against real heroes

`calibration/c1.json` (16 real heroes, read 2026-11-21). From Level 1 to 15 the MID kit carries more armor pieces and jewelry than real heroes wear (real heroes wear 2 to 6 fewer armor pieces and 4 or 5 fewer jewels). From 45 to 64 real heroes sit one to two weapon tiers and about one armor tier under MID, which is why C-2 plays its Level 61 row in the LOW kit. Bands 16 to 44 have no real hero, so the engine alone calibrates them.

### 4.4 C-4: town work against hunting

`calibration/c4.json`: 15 real heroes hunted 1,382 hours and spent 1,649 hours gathering and 526 hours crafting, 1.57 times as long in town as on the hunt. The baseline models none of that time. JUDGMENT: any gold or progression target that counts town income is outside what this baseline can test.

---

## 5. What this means for a reader of the regression report

1. A move in kills, XP, coin, damage taken or deaths, inside live content, between two trees on the same harness, is trustworthy as a move. Its size is measured against the noise in `01-baseline.md` section 5.
2. An absolute gold number is an upper bound. Compare gold between two trees, never against a price.
3. Survival on Normal and Dangerous has no real anchor. A change that moves deaths there is a real engine move, but whether the new rate is right is a design question.
4. Anything a change does to the excluded rows of section 2 is invisible. A candidate that touches one of them needs the adversarial review of `08-regression.md` section 6 before anyone calls it validated.

---

## 6. Fragile points

| Point | Risk | Guard |
|---|---|---|
| A death priced by the harness | the matrix's metrics and the grid judge typed the death price (`standards.mjs` DEATH_COST) a second time, so a death-cost change the engine played moved no reader | fixed in this lane: both read the tree's `src/core/action-rules.js` and `src/data/blessings.js` and refuse a data view without them (`balance-matrix.mjs --selftest` 9m, both typed readers caught as mutants) |
| A proposal inside the cell builder | the grid's `buildCell` lays proposals on every cell (the S-5 Blessing ladder), which a measurement of the game as it stands must not play | the baseline's plan hook strips the ladder (`baseline.mjs --selftest` 5b). Any further proposal the builder gains must be stripped the same way, or the baseline measures a game nobody plays |
| A `no_fight` end or the tally's "credits unit null" | an engine stall or fault read as a safe, slow cell | both engine fixes are in the pin. Every shard prints a TOOL RED and exits 1 on either |
| `armorCurve` as a knob | multiplies on top of a tree whose armor k already moved (FB-8 stage 1) | the baseline plays branches as they are and never lays that knob on a candidate |
| The jewelry stand-in (`patches/items-2.json`) | tier 7 jewelry leaks under Level 110 without its plan step | the baseline plays no proposal base unless asked. A base played through `--base` carries the plan steps the matrix gives it |
| The harness overlay | the measuring code differs between the two sides of a comparison | the overlay is one checkout's harness on both trees, its hash is in each results file, and the report warns when the two differ |
| The designer's staged item lines in `tools/balance-sim/staged` | they are game data that sits in a tools folder | the overlay keeps each tree's own copy (`TREE_OWN` in `baseline/tree.mjs`) |
| The hero levels inside a cell | a long cell drifts a Level or two from its label | the hours rule keeps low Levels short. A reader comparing two trees sees the same drift on both sides |
| Reads that depend on the tree | the cell runner now asks the played tree's tally for a sustain block (regeneration anchored on the engine, mana waits). The pin has none, so it infers regeneration. A candidate whose tree carries the block reads regeneration, time under 30% and 10% and the lowest-health figures the new way | compare those outcomes only between two trees that both carry the block, or both lack it. Where one does and one does not, a move in them may be the read, not the game, and the review says so |
