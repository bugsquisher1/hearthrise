# 27. The formula overhaul: every number in the game, as a formula of the new model

2026-11-22, `lane/formula-overhaul`, game designer, on `set/v0.2.144`. Tyler, the same day: "Hold off on the decisions until you've completely overhauled all the fucking formulas like I've been asking for 2 days." This file is the program for that. It lists every formula family in the game, says which ones are already on the new model and which are still the old game's, puts them in the order they have to be rebuilt, and gives each remaining lane its scope. It also does the first rebuild itself: the hours a Level takes is now a formula with three levers (row P-1), not a hand table.

Read with `04-math-strategy.md` (the intended formula for every system), `19-power-ledger.md` (every source of power in steps) and `24-content-pipeline.md` (how content is added). `26-architecture-pass.md` was not on origin when this was written.

**Tags.** NEW: built on the new model (the step, the reference company, times and shares, the wage). OLD: a formula, but the old game's family (straight lines in Level, a cap, a fit to a kill rate). HAND: hand-typed numbers or fitted tables with no formula behind them. NOT BUILT: the design exists, the code does not. MEASURED, COMPUTED, JUDGMENT as in `04`.

## 0. One screen

| State | Rows | Share |
|---|---|---|
| NEW | 19 | 32% |
| OLD (formula, old family) | 22 | 37% |
| HAND (typed or fitted tables) | 14 | 24% |
| NOT BUILT | 4 | 7% |
| **All** | **59** | |

So about two thirds of the game's math is still the old game's. The new model is in place at the top of the chain (the step, the hours, the wage, the Danger scale and its stances, the store) and at its edges (Traits, bought time, Hearthfinds). The middle of the chain, the fight itself, is still old: a hero's blow is still `0.35 x skill + 0.6 x gear + 2`, armor is still a capped percent against the attacker's Level, heals are still shares of the caster's biggest hit, and every monster is still a straight line in Level with per-ground fits. The power step is bolted on after that old chain, not in place of it (`src/core/hunt/danger.js:178`). That is why every measurement today sits on a mix.

**The order in one line.** The step and the hours (done) → the amount pipeline (the fight in steps) → monsters and statuses derived from it (in flight, must be written to re-derive) → the gear catalogue on steps → bands re-cut in absolute steps → skills on the clock → every price in wage hours → every drop in hours → Tower and bosses → the parked decisions → progress stored as a Level and a share.

**The hours a Level takes, rebuilt here.** `hours(L) = 20 x L² / ((L + 100) x (L + 6))`. Level 10 on the first day, Level 50 in about two weeks, Level 200 in about five and a half months, Level 400 in about fifteen, then a Level every two hunting days forever. Section 3 has the curve and the read-back on the real engine.

## 1. The master table

One row per formula family. "04" is the intended formula (`04-math-strategy.md` section). "Code today" is where the number lives now. "Needs" is the rows it is measured against or reads. "Order" is its place in the build chain of section 2.

### 1.1 Hero power

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| P-0 | The step and the reference company | `amount = base share x s ^ gap`, `s` = 1 + `powerStep` (§1). Reference company: a Steady four at Level L, kit and skill at Level | `src/data/danger.js:78` (`DANGER.powerStep` 0.35%), `src/core/hunt/danger.js:178` (`powerPm`: the gear part's steps on a blow, applied after the old chain) | NEW | none | 0, done |
| P-1 | Hours a Level takes | `ceiling x L / (L + half)` plus an early floor (§5) | `src/data/core-model.js:106` (`LEVEL_HOURS` 20 / 100 / 6, `levelHoursOf`), `src/core/hunt/danger.js:195`, server twin in `1061` (staged). **This lane** | NEW | P-0 | 1, done here |
| P-2 | Level XP curve (the stored total) | None: store a Level and a share of it (§5) | `src/data/core-model.js:68` (`LEVEL_CURVE`, 16 hand-fitted brackets), `src/core/xp.js:117`, SQL `hr_level_curve` | HAND | P-1 | 12 (last) |
| P-3 | Combat skill XP curve | Time parity: skill level n costs `skillPace` x the hours of Level n (§4) | `src/data/core-model.js` `SKILL_CURVE` (`pacePm` 1000, `xpPerHealthHour` 120 MEASURED, `top` 10,000), `src/core/xp.js`, the rating's line `src/core/bands.js skillLevelPm`, SQL `hr_skill_curve` (`1069`, staged); the pay is still `COMBAT_XP` / `src/data/hunt-xp.js` | NEW | P-1, D-1 | 7, done (§2.5) |
| P-4 | What a rating is made of | Weighted mean of Level, skill and gear item Level (`weightGear`, `weightSkill`) (§1) | Only the gear part is built (`danger.js:123` `POWER.weightGearPm` 1000, `weightGearBelowPm` 500). Skill reaches a blow through `src/core/combat.js:391` and to-hit, not through a weight | OLD | P-0 | 3 |
| P-5 | Health and mana (the display curve) | One display curve shared by heroes and monsters, cancels in every contest (§1) | `src/data/core-model.js:163` (`VITALS` 150 + 10 L, kept). Heavy armor +28% health and light +35% mana are real power outside the ledger | OLD | P-0 | 3 |
| P-6 | Power ledger slices | Slices of steps, ramp `min(1, L / 200)` (§12, `19`) | `src/data/power-ledger.js:32`, `:43`, `src/core/power-ledger.js` | NEW | P-0 | 0, done |
| P-7 | Death cost | `deathHours` of progress, cut by Blessings (§5) | `src/data/hunt-sessions.js:148` (`DEATH_XP_LOSS` 6% of total Level XP), `src/data/blessings.js:53` | OLD | P-1, P-2 | 8 |

### 1.2 Gear

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| G-1 | Gear base by steps | Item Level x slot weight, tier = `tierSteps`, `wearAhead` (§10) | `src/data/gear-steps.js:52` (`tierSteps` 20, `slotPm`, `wearAhead` 10), `danger.js:123` | NEW | P-0 | 0, done |
| G-2 | Every item row's combat numbers | None: a row is slot, tier and weight or family. Its power is its item Level | `src/data/gear-tiers.js:40` (`MATERIAL_TIERS`), `:63` (`ARMOUR_SLOTS` def by 7 Levels), `:77` (`WEAPON_FAMILIES` atk / str), `:162` (`SPELLBOOKS`), `src/data/slot-ladders.js:52`, `jewelry.js:40`, `catacomb-armor.js`, `wave3-uniques.js:7`, `special-attributes.js:30`, `shields.js`, `tower-weapons.js`, `items.js:24`. Only scale-ground drops carry an item Level (`danger.js scaleItemLevels`); the rest read `reqLv` | HAND | G-1, D-1 | 5 |
| G-3 | Traits | Rank 1 to 3 = `traitSteps` on its best cell, conditional, no stacking (§10) | `src/data/traits.js:34` (40 rows, hidden), `gear-steps.js` `traitSteps` 4 / 7 / 10, `conditionalStepsMax` 20 | NEW | G-1, M-2 | 9 (roller) |
| G-4 | Signatures | A rule row with a "when", inside the gear slice (§15, `15`) | Not built | NOT BUILT | G-3 | 9 |
| G-5 | Temper | Steps: rank r = +1 item Level on the slot, cap 5, priced in wage hours (`21` D-2) | `src/data/temper.js:17` to `:103` (1% a rung, typed tier price tables), `src/core/temper.js:39` | HAND | G-1, E-1 | 8 |
| G-6 | Imbuements | Steps against one damage type, consumable slice 6 (§15, `21` D-1) | `src/data/imbuements.js:50` (tier floors 1 / 30 / 80), `:64` (value = 2 x Level) | OLD | P-6, E-1 | 8 |
| G-7 | Inner Flame (luck) | Moves Rare odds and rank, never steps (`02` 2b) | `src/data/core-model.js:224` (`FLAME_REGEN`, the old regen meaning), `:258` (`FLAME_FUEL`), `src/data/chests.js:143` (`CHEST_LUCK`) | OLD | R-2 | 9 |

### 1.3 Monsters

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| M-1 | Monster health, blow, aim, defense | A step and a role. Health from the role's seconds to kill for the reference company at gap 0, blow from its pressure share (§6) | `src/data/balance-sheet.js:117` (`STAT_FORMULA` lines in Level), `:206` (old role multipliers), `:340` (`DAMAGE_SCALE_BY_TIER` by art tier), `:359` (`formulaStats`), `src/data/core-model.js:228` (`MONSTER_LEVEL_BY_TIER`), `src/data/monsters.js:110` (rows). **In flight: `lane/monster-formula`** | OLD | P-0, D-1, M-2 | 4 |
| M-2 | Roles: who a monster hits | Reach, front / back / area / weakest (§6) | `src/data/monster-roles.js:59` (reach built). Seconds-to-kill and pressure columns not yet on the row | NEW | P-0 | 4 (columns) |
| M-3 | Wind-ups and monster spells | A role's wind-up share, size and frequency levers (§6) | `src/data/monster-spells.js:57` (warning), `:111` (typed rows) | HAND | M-1 | 4 |
| M-4 | Encounters and pulls on the scale | Pull grows by a step, `encounterPerHero` with the party (§6, §8) | `danger.js:78` (`pullStep`, `pullMax`), `src/core/hunt/danger.js:87` (`dangerDial`), `danger.js:190` (`CLIMB`), readiness `readyPm` | NEW | P-0 | 0, done (party size not yet a term) |
| M-5 | The old tiers and party fits | Retired: the Danger scale replaces them | `balance-sheet.js:438` (`TIER_DIALS`), `:487` (`TIER_PULL_OVERRIDES`), `:194` (party fit 2.5 x health, 0.75 x blow), `src/data/scaled-hunts.js:41` | OLD | S-5 | 6 (retire) |

### 1.4 Damage, mitigation, healing, mana, statuses

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| D-1 | A hero's blow | Base share of the target's reference health x `s ^ gap`, one roll spread (§2, §12) | `src/core/combat.js:391` (`maxHit = 0.35 x skill + 0.6 x gear + 2`, rolls 1 to max), `:31` weakness, `:63` attack interval | NEW on the scale (`src/core/hunt/amount.js`, lane/stage3-pipeline) | P-0, P-4 | 3 |
| D-2 | Hit chance | Dropped, or one fixed base miss (§2) | `src/data/to-hit.js:30` (ratio rails 5% to 97%), `:33` (`REF_HERO` table monsters' aim is inverted from) | SWITCH (`AMOUNT.hitRoll`, true for 0.3.0) | D-1 | 3 (retire) |
| D-3 | Armor, ward, resistances | Armor and ward as defense ratings in the same contest, no cap (§2) | `src/core/mitigation.js:53` (dodge / absorb / ward against the attacker's Level), `src/data/core-model.js:196` (`ARMOUR_MITIGATION`, 60% cap), `src/data/elements.js:51`, `:63` | NEW on the scale (armor and ward ratings, `defenseSplit` in steps) | D-1 | 3 |
| D-4 | Spells and runes | A move's base share and cost share in the rule table (§12, §13) | `src/data/abilities.js:385` (`castAmount`: share of `maxHit`), `:136` (`ABILITY_RULES`), `src/data/runes.js:46` (`RUNE_TIERS`) | NEW on the scale (shares of the caster's top; a version's step is still a base-share multiplier) | D-1 | 3 |
| D-5 | Healing (spells, food, drinks) | Share of reference health x `s ^ (healer's rating - Level)` (§3) | Heal shares on `abilities.js` rows (share of the caster's biggest hit), `src/data/core-model.js:268` (`FOOD_HEAL_SCALE` 12), supply rows | NEW on the scale (heals through the contest; food a share of the ground Level's reference) | D-1 | 3 |
| D-6 | Mana | `manaSeconds`, `manaRegen`, cost as a share (§3) | `VITALS` mana 100 + 10 L, `abilities.js:138` regen | PART (costs as shares of the reference mana; pool still `VITALS`, `manaSeconds` read only) | D-1 | 3 |
| D-7 | Regeneration, rest, readiness | `restRate`, pulls on readiness (§3, §8) | Readiness built (`danger.js` `readyPm` 800). Rates old: `core-model.js` `inFightRegenPermillePerS` 3, `src/data/hunt-tuning.js:38` (`oocRegenPermillePerS` 60) | OLD (scale-free permille rates; `restRate` not yet a lever) | D-1 | 3 |
| D-8 | Crit, element and bane caps | Conditional steps under `conditionalStepsMax` (§2) | `combat.js:64` (crit), `:267` (set bonus), `src/core/elements.js:56`, `:60`, `core-model.js:284` (`MAX_BANE_MULT`), `src/core/perks.js:87` | NEW on the scale (conditional steps: crit as its mean, answers, marks, slows, Tempering) | D-1, P-6 | 3 |
| D-9 | Statuses (bleed, chill, sickness) | A tick is a share of reference health x `s ^ gap`, a mark or slow is steps (§2, §12) | `src/data/statuses.js:74` (bleed ticks 1 to 3 flat, `blowPm` 33, rune-tier permille). **In flight: `lane/e2-e3-statuses`** | HAND | D-1 | 4 |

### 1.5 Drops

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| R-1 | Drop chances on monster rows | Authored in hours: chance = 1 / (N hours x the reference kill rate) (§11) | Typed chances on `src/data/monsters.js` rows, `src/core/drops.js:14` (`DROP_BAND_MAX`), `:47` (cap), `src/data/loot-bands.js:43` (`BAND_TARGETS`) | HAND | P-1, M-4, S-5 | 9 |
| R-2 | Rare and Very Rare (rarity hours) | Hours for each rarity, depth raises the odds and the rank (§10, `12` 8) | Not built | NOT BUILT | R-1 | 9 |
| R-3 | Pity on the rare roll | Chance rises with each miss, one lever a rarity (§10) | Not built (`src/data/party.js:23` is the party's roll fairness, not pity) | NOT BUILT | R-2 | 9 |
| R-4 | Hearthfinds (the super-rare) | Authored in hours | `src/data/hearthfind.js:116` (100 to 400 hours), `:189` | NEW | P-1 | done |
| R-5 | Bestiary, chests and keys | Bestiary stages as a share of hours, chest odds in hours | `src/data/bestiary.js:91` (drop x1.03, damage x1.01), `src/data/chests.js:108`, `:143` | HAND | R-1 | 9 |
| R-6 | What the shop pays for loot | A share of the item's step's wage value (`13`) | `src/data/loot-bands.js:89` (`VENDOR_GEAR_RATES` typed) | HAND | E-1 | 8 |

### 1.6 Pay, wage, prices, supplies

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| E-1 | The wage | `wage(step) = wageBase x (1 + payStepCoin) ^ step` (§11) | `src/data/wage.js:45` (12,880 and 0.4%), `:66` | NEW | P-0 | 0, done |
| E-2 | Level XP a kill, on the scale | Share of the hero's own Level: `1 / (hours x ref kills) x payStepXp ^ gap` (§5, §7) | `src/core/hunt/danger.js:211` (`levelShareXp`), `danger.js:104` (`PAY` refKillsHead 120, payStepXp 0.7%, gapMax 120, floor 0.5) | NEW | P-1 | 0, done |
| E-3 | Coin a kill, on the scale | One coin ratio a step, an hour a step deeper pays `payStepCoin` more (§11) | `danger.js:104` (`coinPm` 6400), `src/core/hunt/danger.js:102` (`COIN_STEP`) | NEW | E-1 | 0, done |
| E-4 | Store prices and supplies | `supplyShare` of gross, price in wage seconds (§3, §11) | `src/data/store-kit.js:40`, `:67` (derived), `src/data/supply-basics.js:56`, `:63`, `:99`. Crafted partners' book values still typed | NEW | E-1, D-5 | 0, done (re-measure at 8) |
| E-5 | Bought time (hunting and work blocks) | `block hours x price per hour x wage(L) x growth ^ n` (§11) | `src/data/time-blocks.js:29`, `:44`, `src/data/work-day.js:38` | NEW | E-1 | 0, done |
| E-6 | Town sinks and shop prices | Price rows in hours of wage at the buyer's or the item's step (§11) | `src/data/shops.js:59`, `gold-sinks.js:63`, `homestead-tiers.js:41`, `training.js:48`, `bench-tax.js:22`, `recruits.js:32`, `gold-ladders.js:45`, `hearth.js:52` | HAND | E-1 | 8 |
| E-7 | Blessings price | Hours of wage at the hero's Level (§11) | `src/data/blessings.js:64` (`blessingPrice(tier, level)`, its own Level formula) | OLD | E-1, P-7 | 8 |
| E-8 | Talent resets | `resetHours x wage(L) x resetGrowth ^ n` (§11) | Not built | NOT BUILT | E-1 | 8 |
| E-9 | The Hunts window's gold estimate | wage(held step), no stance factor once the step is absolute | `src/data/gold-estimate.js:22` (Careful 630, Steady 1000, Bold 1270 permille, measured once) | HAND | E-3, S-5 | 11 |
| E-10 | Pay off the scale, and party tables | Retired: one pay rule (§7) | `src/data/balance-sheet.js:165` (XP = 1.436 x L^0.4 x health), `:175` (coin 0.30 a health point), `:309` (`GROUND_XP_FIT`), `:319` (`GROUND_GP_FIT`), `src/data/party-class-xp.js:55`, `:80`, `src/data/hunt-tuning.js:56` (under-floor share) | OLD | S-5 | 6 (retire) |
| E-11 | Starting gold and the start kit | Hours of wage at Level 1 | `src/data/start-kit.js:44`, `:124` | HAND | E-1 | 8 |

### 1.7 Town work and professions

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| T-1 | The work day | A day of work hours, Premium +2 (§11, `09`) | `src/data/work-day.js:23` | NEW | none | done |
| T-2 | Trade XP to 99 | The capped table stays: a cap is a goal (§4) | `src/core/xp.js:24` (`XP_TABLE`) | HAND (kept on purpose) | none | none |
| T-3 | The town pace dial | Retired: a work-hour's yield is set in hours of kit (`09` 4.3) | `src/core/pacing.js:17` (`PACE` xp 0.39, action 1.6), `:33` (`SPEED_FUSE`) | OLD | T-4 | 8 |
| T-4 | Recipes, yields, crafted prices | Goods worth `townWageShare` x wage(L) a work-hour (`09` 4.3) | `src/data/recipes.js:313`, `src/data/gathering.js`, `src/core/artisan.js`, crafted book values | HAND | E-1, E-4 | 8 |
| T-5 | Town works and farming | Hours of wage | `src/data/town-works.js:32`, `src/core/farm.js` | HAND | E-1 | 8 |

### 1.8 Tower and bosses

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| B-1 | The Tower | Rooms as encounters on steps, `rampPerMinute` on bosses (§6) | `src/data/tower.js:47` (`TOWER_RULES`), `:60` (`TOWER_PARTY_XP` 1.0 to 1.3), `:115` Catacomb rules | OLD | M-1, D-1 | 10 |
| B-2 | Boss halls and named waves | Threat that grows: `rampPerMinute` by encounter type (§6) | `src/data/boss-halls.js:35`, lever `mon.boss-rooms` | OLD | M-1, D-1 | 10 |

### 1.9 Risk, stances, the fall back, the bands

| # | Family | 04 formula | Code today | State | Needs | Order |
|---|---|---|---|---|---|---|
| S-1 | Stances | Two thresholds on the low-health tail (§9, `02` package 3) | `danger.js:197` (`RISKS` 450 / 650, 250 / 450, 120 / 300) | NEW | D-1, M-1 | 11 (re-read) |
| S-2 | The holder's line | A line safe over the largest blow the ground lands | `danger.js:210` (`HOLDER.linePm` 800) | NEW | M-1, M-3 | 11 |
| S-3 | Climb and fall | One rule for every stance | `danger.js:190` (`CLIMB`) | NEW | S-1 | done |
| S-4 | Pay floor and the gap ceiling | `payGapMax`, a floor under the reference (§7) | `danger.js:104` (`floor` 0.5, `gapMax` 120) | NEW | E-2 | done |
| S-5 | Ground bands | Absolute steps: one step is one Level of strength on every ground (`02` package 3, wave 2) | `danger.js:159` (`DANGER_GROUNDS`, refStep / floor / top / refKillsHead measured in each ground's own steps) | NEW (a wave-1 bridge) | M-1, D-1 | 6 |

### 1.10 Contradictions the game book found, ruled

From `lane/game-book` (`docs/book/00-index.md`, "Contradictions found"). Each is a formula with two or three answers in the docs and code. The program designer rules each one here (2026-11-22). The ruling is the answer of record, the owner rebuilds it at the stage named, and the losing text is corrected by that owner.

| # | Contradiction | Ruling | Owner row | Order |
|---|---|---|---|---|
| K-1 | **Party XP.** Three answers: the data's make-up table (`src/data/party-class-xp.js:55`, a lone hero +15% `SOLO_XP_PM` 1150, party cells by size and class count), ruling S-10 c ("by size alone"), and `02` / `04` §7 ("no table") | **One number a party size, all 1.0, no class term, no solo bonus.** That is `04`'s `partyPay` lever written as a row a size, which is S-10 c's "by size alone" and `02`'s "no table" at once: a kill's share is split evenly and a four earns more a head because it holds deeper. The lone +15% and the class count go. A size row moves off 1.0 only if the combined matrix reads PARTY-1 (a four a head over its heroes apart) under 1.0. On the scale this is already true. The table lives on only on the off-scale grounds and retires with them | E-10 | 6 |
| K-2 | **The roll to hit.** `02` and `08` drop it, `20` says 0.3.0 keeps today's hit math | **Both are right about different times, and it goes.** 0.3.0 ships before the amount pipeline exists, so it keeps today's math (`20` is a release doc). The end state has no hit contest and no base miss: a blow always lands, dodge and block are moves and Traits (designer's call, `04` §2's open question, closed). `to-hit.js` and `REF_HERO` are deleted by the pipeline lane | D-2 | 3 |
| K-3 | **Store price.** `store-kit.js:40` prices the store at `storeCeiling` 1.5x the crafted good, `supply-basics.js:56` and `:201` sell a basic at 75% strength and tools and gear at `SHOP_PREMIUM` 2x book | **One ceiling, 1.5, priced per unit of effect.** A basic at 75% strength costs 1.5 x 0.75 = 1.125x the crafted good's price, so the store is always dearer for what it does. `SHOP_PREMIUM` 2 is retired into `storeCeiling` (tools, gear and seeds read it too). One lever, one rule: the store sells at `storeCeiling` over the crafted partner's value per unit of what it does | E-4 | 8 |
| K-4 | **Live holdovers with no 0.3 owner**: feast-dish XP and damage buffs, the bestiary's damage and drop bonuses (`src/data/bestiary.js:91`, `:94`, `:105`), the Hearthrise XP event fed by hearth fuel (`src/data/live-events.js` `hearthrise`, `type: 'xp_bonus'`) | **Damage buffs go into the ledger, XP buffs are cut, drop bonuses become luck.** A feast's damage buff is a conditional step in the consumable slice (6), so it competes with imbuements instead of stacking on top. Every XP buff is cut: the hours a Level takes is the law (P-1), and an XP boost a player can buy with gold is the paid XP edge the money rules forbid. The bestiary's +1% damage is cut (a permanent number outside the ledger). Its drop bonus and the Hearthrise event move under the flame: the event becomes a world luck event (Rare odds and rank, under `kitSpreadMax`), still fed by hearth fuel, never XP | P-6 (damage), G-7 (luck), D-8 | 3 (damage cut), 9 (luck) |
| K-5 | **Each ground needs a `refLevel`.** The econ-followups lane read prices 2 to 6% low when they read `gearLevel` (the base item Level) as the ground's Level | **Add `refLevel` to every `DANGER_GROUNDS` row now**: the Level its `refStep` was measured at (today `tests/level-curve.mjs REF_LEVEL`, which then reads the row). Prices, the wage at a ground and the gold estimate read `refLevel`. `gearLevel` stays what it is, the base item Level of what drops. Small data change, any lane, before stage 6. At stage 6 the field goes, because in absolute steps `refStep` is `refLevel` by definition. (2 to 6% is in band, so nothing waits on it) | S-5 | now, retired at 6 |
| K-6 | **Band width against the gap between tiers.** `tests/balance-guard.mjs` G7 reads depth 1 of the next tier's ground against depth 20 of the last at 0.43 to 0.71: the bands are far wider than the 20 Levels between tiers | **The handover is the rule, the width follows from it.** Depth 20 of one ground and depth 1 of the next must pay within 0.9 to 1.1 of each other for the same company, so moving on never feels like a pay cut. With absolute steps a band is about one tier wide (the ground's Level span) plus the spread between stances, not 230 of its own steps. This is the same cause as F-1 (the pay gap reads the ground's reference step, not the hero's Level) and is fixed by the same cut. G7's reading stays at 0.43 to 0.71 until stage 6, which is the honest reading | S-5 | 6 |

## 2. The order

A row can only be rebuilt once the rows it is measured against are final, or it will be re-measured again later. The chain is short at the top and wide at the bottom.

| Stage | What | Rows | Why here | State |
|---|---|---|---|---|
| 0 | The step, the reference company, the wage, the scale's pay, bought time | P-0, P-6, G-1, M-4, E-1, E-2, E-3, E-4, E-5, S-3, S-4 | Everything else is a multiple of these | Done |
| 1 | **The hours a Level takes** | P-1 | Sizes every kill's pay, the skill clock, death in hours, drops in hours | **Done in this lane** |
| 2 | (reserved: the reference times) | `fightShare`, role seconds to kill | 04 §14 stage 1 normalization. Written as levers by stage 3's lane, solved by bisection after stage 4 | Owed |
| 3 | **The amount pipeline**: the fight in steps | D-1 to D-8, P-4, P-5 | Monsters are sized against what the reference company deals and takes. Until a blow is `base share x s ^ gap`, every monster number is sized against the old chain | **Built on the scale** (lane/stage3-pipeline, §2.2); P-5, D-7 and off-scale grounds still old |
| 4 | **Monsters and statuses derived** | M-1, M-2 columns, M-3, D-9 | Health from seconds to kill, blow from pressure, ticks as shares | **In flight** (monster-formula, e2-e3-statuses) |
| 5 | **The gear catalogue on steps** | G-2 | Phase A can go now. Phase B needs stage 3 | Not started |
| 6 | Bands re-cut in absolute steps, every ground on the scale, the pay gap read against the hero's Level | S-5, M-5, E-10, F-1 | Needs stages 3 to 5 final, then one `new-ground.mjs` run a ground | Not started (wave 2) |
| 7 | Skills on time parity | P-3 | Needs P-1's clock and stage 3's `weightSkill` | **Built** (lane/skills-time-parity, §2.5) |
| 8 | Every price in wage hours, death in hours, town work | P-7, G-5, G-6, E-6, E-7, E-8, E-11, R-6, T-3, T-4, T-5 | Needs the wage (done) and the kit share re-measured after stage 6 | Not started |
| 9 | Every drop in hours, the roller, pity, Signatures, the flame | R-1, R-2, R-3, R-5, G-3 roller, G-4, G-7 | Needs the reference kill rate after stage 6 | Not started (wave 4) |
| 10 | Tower and bosses with a ramp | B-1, B-2 | Needs stage 4's role rows and `rampPerMinute` | Not started |
| 11 | The parked decisions, read on one matrix | S-1, S-2, E-9, section 4 | Needs everything above | Parked |
| 12 | Progress stored as a Level and a share | P-2 | Touches the ledger, ranking and every reader of total XP. Last, so it is done once | Not started |

### 2.1 The two lanes in flight: what they must not do

- **`lane/monster-formula` (stage 4) runs before stage 3.** That is fine only if the generator takes the hero side as an input. A monster's health must be written as "the reference company's damage a second at gap 0 x the role's seconds to kill", read from the engine's own hero output, never a typed line in Level. Then when stage 3 replaces the hero's blow, the monsters re-derive by re-running the generator and nothing is re-fitted by hand. A health or blow number typed as a function of Level is the old family and fails this row.
- **`lane/e2-e3-statuses` (stage 4).** A tick must be a share of the target's reference health, so it scales with the contest and not with a flat 1 to 3. A slow or a mark is a conditional step inside `conditionalStepsMax`. The rune-tier permille table goes: a rune tier is a step.

### 2.2 Scope: the amount pipeline (stage 3, built on the scale 2026-11-23)

The biggest lane, and the hub. An engine batch (L in `04` §12).

- One function for every amount, four stages in order: base share from the move's row, `x s ^ gap` with active conditional steps, `x` one roll (`rollSpread` ±20%), `x` the target's display health. Rounded once. A trace of each stage.
- Ratings: offense and defense = `(1 - weightGear - weightSkill) x Level + weightSkill x skill + weightGear x gear item Level`, plus the ledger's conditional steps.
- Armor and ward as two defense ratings. A piece spends its item Level between them by weight (heavy mostly armor, light mostly ward, medium even): three rows.
- Retires: `combat.js:391` (`maxHit`), the to-hit contest and `REF_HERO`, `mitigation.js` and its 60% cap, the heavy-armor health and light-armor mana bonuses, `FOOD_HEAL_SCALE`, the rune-tier and bane caps, and `powerPm`'s after-the-chain patch.
- Heals use the same pipeline (healer's rating minus its own Level). Mana is `manaSeconds` of full casting with `manaRegen` a minute, costs as shares.
- Levers it adds: `weightGear`, `weightSkill`, `rollSpread`, the armor / ward split (3), `manaSeconds`, `manaRegen`, `sustainFree`, `sustainHealer`, `restRate`.
- Proof: 04 §14 stage 0, the scale test (Levels 30, 300, 3,000 at gap 0 read the same), the slope test and the weights test.
- Both paths (CLAUDE.md §4): a hunt viewed and a hunt with the browser closed play the same.

**Built (lane/stage3-pipeline, 2026-11-23).** On the Danger scale only (off it the old chain plays, byte for byte: engine-parity's four tier pins held). `src/core/hunt/amount.js`, levers in `src/data/amount.js`, test `tests/hunt-core/amount.mjs`:
- a hero's blow = move share x `blowTopBp[weapon]` / 10000 x refHealth(ground refLevel) x s ^ round(offense - R + conditional) x roll; a monster's blow = its row's blow at the step x `pressurePm` / 1000 x refHealth(hero L) / refHealth(refLevel) x s ^ round(R - armor or ward + conditional) x roll; a heal or a shell = share x top x refHealth(healer L) x s ^ round(offense - L + heal steps) x roll. R is the reference company's rating (`bands.js bandAbs refPm`), the ratings `bands.js ratingPm`, refHealth `150 + 10 (L - 1)`, the roll `rollSpreadPm` 200, rounded once.
- MEASURED, the scale test (Muster moved to Level L as shares, the roll to hit off, 6 seeds x 4 h): held 370.8 / 372.2 / 370.1 / 369.0 (sd 4 to 6) at Levels 30 / 60 / 300 / 3,000, XP 0.61x the formula at each, kit share 0.29 to 0.30, fall backs 1.8 to 2.3 an hour, no death, the front's share 0.82 to 0.83, sustain 140 / 795 / 63 at each. Passes.
- MEASURED, the reduced matrix (6 seeds x 8 h from step 0, held from hour 3, the roll to hit on): Muster L60 Steady holds 618 (before the pipeline 620), XP 1.01x, kit 0.29, no Careful or Steady death; Hask's Ford L52 593 (588), XP 1.11x; the Bone Wing outgrew its old band (1.77x), re-cut by `new-ground.mjs` (ref 540, top 605), then 1.04x. C-2 fails both before and after and further after: a weapon a tier back moves Muster's Steady hold -1.7 steps (before -15.5), armor -7.8 (-22.2): a gear tier is only its rating steps now (`weightGearPm` / `weightGearBelowPm`, the designer's). The roll to hit off needs `pressurePm` about 230 (200 holds 642).
- Still old math: P-5 (heavy armor's health, light armor's mana), D-7's rates, a version's `stepPm` and the stance and guard multipliers as base shares, the to-hit ratio while `hitRoll` holds, monster rows (stage 4), and every ground off the scale (stage 6).

### 2.3 Scope: the gear catalogue on steps (stage 5, not started)

Two phases, so the first can start now.

**Phase A (now, data only).**
1. Every gear row carries an item Level, `iL = tierLevel(its tier)` (`gear-steps.js`), not just the scale grounds' drops. `reqLv` stops being read as power.
2. One generator, `tools/gen-gear.mjs`, writes every row's combat numbers from three things: slot, tier and its weight (armor) or family (weapon). No row types an `atk`, `str` or `def`. Today's tables (`gear-tiers.js` `ARMOUR_SLOTS` def, `WEAPON_FAMILIES` atk / str, `SPELLBOOKS`, `slot-ladders.js`, `shields.js`, `tower-weapons.js`, `catacomb-armor.js`) become rows of slot, tier and kind. The interim formula is fitted once to today's tables so the old chain still reads sensible numbers until phase B.
3. Uniques and special attributes are sorted: a rule that changes how a move plays goes to Signatures (G-4). A conditional number goes to the Trait pool (G-3). A flat number on top of the base is cut (`wave3-uniques.js`, `special-attributes.js`, `jewelry.js` perks).
4. A guard: no gear row holds a typed combat number. Every gear row's item Level is on the tier grid.

**Phase B (after stage 3).** The pipeline reads item Level, so the generated `atk`, `str` and `def` and their readers are deleted. A piece is then slot, item Level, weight or family, rarity, Traits. Measured on the matrix: one tier up on a whole kit moves the held depth by 1 to 3 depths (C-2), at Levels 60 and 175.

### 2.4 Scope: the Level hours (stage 1, done here)

Done: section 3. What is left, and where it goes:
- The XP curve under it (P-2) stays as the stored total until stage 12. On the scale it cancels out of pace (a kill pays a share of the next Level), so refitting its brackets now would be a server migration on a number that is going away.
- Grounds off the scale (Levels 1 to 44 and 76 to 164 today) still pay by the old row XP and the old curve. They follow the formula once they join the scale at stage 6. Until then their pace is the old table's, which matches the formula within about 11% from Level 25 to 400 and is slower on the first day (Level 10 in 6 hours against 4.2) (section 3).
- `LEVEL_PACE.early` and `newPlayer` (the Mill Cellar promises) are old-content targets. They retire with those grounds at stage 6.

### 2.5 Scope: skills on the Level clock (stage 7, built 2026-11-23)

Built (`lane/skills-time-parity`): `src/data/core-model.js SKILL_CURVE`, `src/core/xp.js`, the rating's skill line `src/core/bands.js skillLevelPm`, the server twin `tools/gen-skill-curve.mjs` (`1069-skill-time-parity.generated.sql`, STAGED), tests `tests/bands.mjs` BD-1 and BD-2, the measurement `tools/balance-program/redesign/skills/parity.mjs`.

- **The formula.** XP from skill level n to n + 1 = `floor(pacePm / 1000 x levelHoursOf(n) x xpPerHealthHour x refHealth(n))`: a skill level costs `skillPace` x the hours that Level takes, counted in the reference skill XP an hour. Levers: `pacePm` (skillPace) 1000, band 800 to 1250; `xpPerHealthHour` 120, MEASURED (the main skill XP a hunted hour of the Steady mixed four's damage dealers over the reference health of their Level, on every scale ground at its reference Level: Hask's Ford 142 / 124, Muster Barrows 132 / 146, the Bone Wing 108 / 99, the Flooded Wing 107 / 111), band 100 to 140; `top` 10,000 (52 years of 10 hour days).
- **The rating.** A skill reads as the Level the clock gives it: at pace 1000 the skill itself. The measured `SKILL_LINE` table is gone.
- **Inner Flame** keeps the old geometric curve (`FLAME_SKILL_CURVE`): its Hearth fuel's XP is sized on it, and 21 retires the skill's XP.
- **Live heroes** keep their XP and read it on the new curve: a skill under 80 reads lower (30 reads 14, 60 reads 44), over 80 higher (100 reads 136).

**Old against new, the hours to a skill** (hunted hours from Level 1 on the hours formula; COMPUTED at the reference rate, MEASURED rates from `parity.mjs` on the grounds the game sends a four to, the hammer's Melee):

| Skill | Old curve, reference rate | Clock, reference rate (the Level's own hours) | Old curve, measured rates | Clock, measured rates |
|---|---|---|---|---|
| 10 | 0.3 h | 4.2 h | 0.4 h | 5.8 h |
| 30 | 10.6 h | 54 h | 14.5 h | 89 h |
| 60 | 122 h | 215 h | 155 h | 233 h |
| 100 | 921 h | 543 h | 1,383 h | 933 h |

The hammer's Melee at Level 10 / 30 / 60 / 100 / 150 / 200 on the measured rates: old 20 / 40 / 67 / 81 / 91 / 107, clock 8 / 22 / 56 / 82 / 108 / 165. The old curve put a skill twice its Level in the first day and half of it by Level 200; the clock keeps it near its Level wherever the ground pays the reference rate.

**What it found** (the dial for each, none moved here unless named):
1. **The grounds off the scale pay skill XP at a third of the scale's rate.** The Glade and the grounds at Levels 80 to 135 pay 34 to 48 XP a point of reference health an hour, the Sewer 81 to 92, the Warrens 91 to 106, the scale 99 to 146. A specialist trails its Level there (Melee 22 at Level 30, 82 at Level 100). Stage 6 (every ground on the scale) closes it.
2. **Defense pays 0.4 to 0.65 of the main skill** (`COMBAT_XP.defenseXpPerLevelPermille` 200) and **casters' Magic 0.25 to 1.5 of it** (the mage 30 on the wings, the healer 184 on Muster): the pay dials (`COMBAT_XP`, `HUNT_XP`), the designer's.
3. **The yard's flat 30,000 XP an hour** is the clock's rate only at skill 11 (0.34 of it at 60, 0.22 at 100). Tyler's 1:1 ruling reads as `TRAINING_RULES.xpPerHour` = `xpPerHealthHour` x `refHealthOf(skill)`: one row.
4. **REF_HERO stays the measured old careers** (Melee 21 at Level 10, 60 at 60, 103 at 200; `tools/gen-ref-hero.mjs` reads the snapshot as measured). Every monster's aim and evasion is written on it, so an early hero on the clock carries less skill than its monsters were written for and a late one more. Re-derive it on the clock with the monster rows (the monster lanes).
5. **The new player** carries Melee 8 and Defense 7 at Level 10 (the old curve gave 20 and 16) and kills slower: `LEVEL_CURVE` steps 11 to 15 eased 872 to 4,360 XP so Level 15 to 16 takes 4.40 h, inside `start-kit-pace` SK-2's 4.5 (was 4.64).
6. **Town skills** (gathering and crafting) stay on the capped 99 table (04 section 4), unchanged.

**Muster Barrows, read after the change** (MEASURED, `v1-climb.mjs`, the Steady mixed four, 4 seeds x 8 h held from hour 4, the same seeds on the base and on this tree; the harness's heroes before are the measured careers, after the careers re-read on the clock, `tools/balance-sim/skill-lines.mjs`):

| Company | Before: held step, depth, pay | After |
|---|---|---|
| Arriving (Level 55, one tier back) | 542.5, depth 1, 0.66x | 573.8, depth 1, 0.81x |
| Reference (Level 60, the ground's kit) | 608.4, depth 9, 1.06x | 617.5, depth 10, 1.11x |
| Strong (Level 75, best kit, skills over the line), Steady | 684.9, depth 18, 1.55x | 697.5, depth 20, 1.61x |
| Strong, Bold | 699.2, depth 20 | 700, depth 20 |

In band: the arriving four reads depth 1 (at most 6), the reference its share of the band (10), the strong four the top (at least 16; Bold at least 19), so the climb still runs 1 to 20. They hold a little deeper because at Levels 55 to 75 a specialist's main skill on the clock is its Level (55, 60, 75) where the old careers held 48, 52 and 61, so it lands more blows on monsters written for REF_HERO (finding 4). **One band moved:** the reference's kit share of the hour rose from 0.29 to 0.35 (EL-KIT 0.2 to 0.3, store 4,804 to 6,308 gold an hour): its higher Ranged and Magic reach the next arrow and rune tiers about six Levels sooner. The dial is the supply tiers' skill gates (a gate at skill n now means Level n) or `STORE_KIT`, the designer's; `tests/econ-levers.mjs` EL-KIT reads its kept report, so nothing is red until that report is re-run.

## 3. The hours a Level takes: the rebuild and its result

**The formula.** `hours(L) = ceiling x L² / ((L + half) x (L + early))`, `src/data/core-model.js:106`. It rises from minutes to `ceiling` and stays there. Three whole levers: `ceiling` 20 (band 16 to 24), `half` 100 (60 to 140), `early` 6 (2 to 10). The server computes the same rational in `hr_danger_hours_for` (folded into the staged `1061`, pinned to the engine at seven Levels).

**Why this family.** `04` §5's "rise, then level off", with the early floor turned into an early speed-up. Everything in the new model is counted in Levels: gear tiers, Danger steps, prices. A curve that keeps slowing makes the whole game slow in lockstep. A curve that levels off gives a far player one step of everything at a steady beat. The retired hand table took 40 hours a Level at Level 1,000 and was still rising. This takes 18.

**The designer's targets** (hunted hours, days on the 10 hour day, COMPUTED):

| Level | Hours for that Level | Hours to reach it | Days at 10 h | The retired table |
|---|---|---|---|---|
| 2 | 0.03 (2 min) | 0.03 | | |
| 5 | 0.43 | 0.6 | first hour | 0.25 h (the Cellar promise) |
| 10 | 1.14 | 4.2 | day 1 | 6 |
| 25 | 3.2 | 36 | day 4 | 36 |
| 50 | 6.0 | 151 | day 15 | 168 |
| 100 | 9.4 | 543 | week 8 | 600 |
| 200 | 12.9 | 1,683 | month 5.5 | 1,680 |
| 400 | 15.8 | 4,600 | month 15 | 4,580 (in `04`) |
| 1,000 | 18.1 | 14,930 | year 4 | 23,520 |
| 2,000 | 19.0 | 33,560 | | |

So it keeps the old table's feel to Level 400 (the part players will meet in Early Access) and fixes the far end. Level 200 takes about 168 days of full hunting days, 140 with Premium. That is the big deal Tyler asked for, not a wall: no Level past the first few takes more than twice the one before (C8d), and the step from Level 199 to 200 is 13 hours, a day and a third.

**Why a four.** The formula is the hours of the reference company, a Steady four. Every account runs four heroes and the four together is the obvious way to hunt (Tyler 2026-11-21). A lone hero is slower by however much less deep it holds. No solo target is set (Tyler 2026-11-21).

**Read back on the real engine.** Because a kill's pay is derived from the formula, a four that holds its ground's reference step at its ground's reference kill rate earns the formula exactly. What the engine decides is how far real companies sit from that. `tools/balance-program/redesign/hours/fit.mjs` plays the Steady mixed four (hammer, bow, mage, healer, MID kits, from its held start, the real death rule) on every scale ground across its band and past its top.

MEASURED (`hours/fit.mjs`, 4 seeds x 4 h a cell from the held start, 19 cells, 247 s; `tools/balance-program/redesign/hours/fit.json`). Ratio is Level XP a head an hour over the formula's. Realized is the hours that Level really took that four.

| Ground (band) | Level | Held step (ref / top) | Kills a head an hour | Ratio (sd) | Formula h | Realized h | Deaths |
|---|---|---|---|---|---|---|---|
| Hask's Ford (45-60) | 45 | 569 (590 / 710) | 208 | 0.83 (0.02) | 5.5 | 6.6 | 0 |
| | 50 | 584 | 214 | 0.92 (0.01) | 6.0 | 6.4 | 0 |
| | 55 | 578 | 218 | 0.99 (0.03) | 6.4 | 6.5 | 0 |
| | 60 (top, Muster's kit) | 656 | 234 | 1.56 (0.03) | 6.8 | 4.4 | 0 |
| | 70 (outgrown) | 692 | 252 | 2.27 (0.10) | 7.6 | 3.3 | 0 |
| Muster Barrows (55-75) | 55 | 543 (590 / 710) | 103 | 0.71 (0.09) | 6.4 | 9.1 | 0 |
| | 60 | 608 | 104 | 0.97 (0.02) | 6.8 | 7.1 | 0 |
| | 65 | 622 | 101 | 1.03 (0.03) | 7.2 | 7.0 | 0 |
| | 70 | 655 | 101 | 1.12 (0.03) | 7.6 | 6.8 | 0 |
| | 75 (top) | 689 | 108 | 1.55 (0.06) | 7.9 | 5.1 | 0 |
| | 90 (outgrown) | 710 (held at the top) | 112 | 1.97 (0.02) | 8.9 | 4.5 | 0 |
| Bone Wing (165-185, staged) | 165 | 473 (480 / 545) | 155 | 0.95 (0.03) | 12.0 | 12.6 | 0 |
| | 175 | 486 | 157 | 1.03 (0.03) | 12.3 | 12.0 | 0 |
| | 185 | 502 | 158 | 1.11 (0.03) | 12.6 | 11.4 | 0 |
| | 200 (outgrown) | 480 | 150 | 0.95 (0.03) | 12.9 | 13.6 | 0 |
| Flooded Wing (165-185, staged) | 165 | 447 (440 / 510) | 150 | 0.94 (0.03) | 12.0 | 12.7 | 0 |
| | 175 | 445 | 150 | 1.03 (0.03) | 12.3 | 11.9 | 0 |
| | 185 | 457 | 158 | 1.23 (0.02) | 12.6 | 10.2 | 0 |
| | 200 (outgrown) | 440 | 145 | 0.97 (0.04) | 12.9 | 13.4 | 0 |

**What it says.**
1. **The formula is delivered where a band exists.** At every band middle the four earns 0.97 to 1.03 of the formula (Muster 60 and 65, Hask's Ford 55, both wings 175). Across a band it runs from about 0.7 to 0.95 at the entry Level to 1.1 to 1.25 at the top, so a four that climbs through a band levels at about the formula's pace on average. The hours curve needs no refit: it is a design target and the engine meets it. No death in 76 seed-runs.
2. **Levels 20 to 44, 76 to 164 and past 185 have no scale ground**, so they cannot be read on the scale. Their pace is the formula's by construction once a band exists there (the scale test, 04 §14). Today they pay by the old row XP, fitted to the retired table, which matches the formula within about 11% from Level 25 to 400 and is slower on the first day (section 3's table).
3. **Finding F-1: an outgrown ground pays more, not less.** Past a band's top Level the four holds deeper (its kit tier is the next ground's) and the pay climbs toward the gap ceiling, 2.31x. Hask's Ford pays a Level 70 four 2.27x the formula, where the ground it should be on (Muster) pays 1.12x. That is the wrong incentive: staying on a ground you outgrew is twice as fast as moving on. The cause is the wave-1 pay gap, read against the ground's reference step, not the hero's Level (04 §7 reads `payStep ^ (monster step - hero Level)`, so an outgrown ground fades by itself). The wings do not show it at 200 because the MID kit at 200 has no wing tier to jump to. **Fix: stage 6 (S-5).** With absolute steps the gap reads the hero's Level, and a ground's top pays the formula at its top Level. Until then the band's top (`topStep`) is the only brake. Not changed here, because the fix is the absolute-step cut, and a patch on the wave-1 gap would be measured again at stage 6.
4. **Kills a head an hour differ by ground** (101 to 252) and pay is split over each ground's measured `refKillsHead`. That is the wave-1 bridge. In the end state one reference kill rate holds everywhere (role seconds to kill and `fightShare`, stage 4).

**Re-pinned.** `tests/level-curve.mjs` C7 (T-02 re-aimed) reads the formula through `hoursForLevel`. A new claim C8 holds the formula to its design promises, so a lever move is judged on what it promises a player: Level 10 inside the first 10 hour day, Level 200 in 120 to 240 days, it levels off (no Level at or over the ceiling, Level 2,000 under 1.25 times Level 400), and no wall from Level 2 on. Four planted defects turn it red. `tests/hunt-core/danger.mjs` pins the engine to the formula at nine Levels.

## 4. Decisions parked until the formulas are done

Each waits on named rows. None is decided here, because each would be decided on numbers that are about to move.

| Decision | Today | Waits on | Why it can't be read before | How it settles |
|---|---|---|---|---|
| The tank's fall-back line | `HOLDER.linePm` 800 (Steady 20%), against the ruled 600 (15%), because 15% killed tanks on Muster (CONFLICTS 11-22) | M-1, M-3, D-1, D-3 | A line is safe only above the largest single blow. Today that blow is a Muster Knight's typed row through the old armor cap | Once blows are role pressure shares, the line is derived: `linePm` = the largest blow's share of reference health on the hardest role plus a margin. Read on the matrix at every band |
| How many Signatures | `15-signature-candidates.md`, none built | G-2 phase A, G-3, R-2 | A Signature sits in the gear slice with the Traits. How many fit depends on what is left of the slice and how many rare pieces exist (rarity hours) | Sized in steps on the dominance check (V7), then the count is how many rules pass it |
| The gold estimate's stance factors | Careful 630, Steady 1000, Bold 1270, measured once; now read about 760 / 1000 / 1060 | E-3, S-5, S-1 | The estimate reads the hero's Level, not the held step, because a wave-1 step is not a Level | With absolute steps it reads wage(held step). The factors go |
| The Bold factor | Bold beats Steady in a watched session and loses over a day, with deaths | M-1, M-3, P-7, S-1 | Bold's day is decided by its death rate (wind-ups) and what a death costs (6% of total XP today, hours under P-7) | Re-read Bold's day on the matrix with `deathHours` and role wind-ups. Then the thresholds move, not a factor |
| Level 70 pay | A Level 70 four on Muster earns about 1.14 of wage(70) | S-5 | A Level 70 four holds about 35 steps deeper than a Level 60 four on the same ground, because one wave-1 step is not one Level | With absolute steps, pay over wage is 1.0 at the reference by construction. Read the band on the matrix |
| Careful at 0.73 | Careful at Level 70 reads about 0.73 against the EL-PAY band | S-5, S-4, M-1 | Careful's pace is its kills a pull and the pay floor under the reference, both measured on wave-1 steps and old monsters | Re-read on the matrix. The floor (`PAY.floor`) is the lever, not the stance |
| An outgrown ground pays more (F-1, section 3) | Hask's Ford pays a Level 70 four 2.27x the formula, Muster 1.12x | S-5 | The pay gap reads the ground's reference step, not the hero's Level | Stage 6 reads the gap against the hero's Level (04 §7). Then a ground fades as it is outgrown, with no special rule. Read on the matrix: past every band's top Level the ratio falls under 1 |
| `refKillsHead` per ground | 120 / 220 / 155 / 150, measured | M-1, S-5 | A ground's own kill rate is a measurement of its own rows | Stage 6 re-measures it with `new-ground.mjs`. In the end state one reference kill rate (`fightShare`, role seconds) holds on every ground |

## 5. The measuring plan: one combined Lab run

When stages 3 to 6 land, the whole set is proven together on one matrix, on the real engine, before any parked decision is made. One run, one report, held seeds kept apart.

**Stage 0 first (04 §14), on a thin slice.** The scale test (the reference company at gap 0 at Levels 30, 300 and 3,000 reads the same seconds to kill, lowest health, fight share, supply share and share of a Level an hour), the slope test (supply bill, then pace, then fall backs, then deaths, in that order, over more steps than one gear tier) and the weights test (ten steps of offense, defense and sustain on each seat each move the held depth). If one fails, the model goes back to design before anything below runs.

**The matrix.**

| Axis | Values | Count |
|---|---|---|
| Ground and Level | Every scale ground at its entry, middle and top Level, plus one Level past the top | about 4 a ground |
| Lineup | The mixed four, a tank and healer with two damage dealers of each style, a four of one style for each of 4 styles, a lone hero of each style | 4 + 4 + 4 = 12 |
| Stance | Careful, Steady, Bold | 3 |
| Kit | The 10th, 50th and 90th percentile kit from the sampler (LOW / MID / BIS until it exists) | 3 |
| Seeds | 6 search seeds (1000 to 1005) and 6 held-out (2000 to 2005), a full 10 hour day each, from a held start | 12 |

With 6 scale grounds by then that is about 24 x 12 x 3 x 3 = 2,592 cells, 12 days each. Too big to play whole every time. So: the mixed four and the lone hero on every cell (the anchor), the other lineups on Steady with the MID kit only, and the held-out seeds only on the final regression. About 600 cells, run on GitHub or the cloud, never locally.

**What it reads, and the line each reading must hold.**

| Reading | Target | Rows it proves |
|---|---|---|
| Level XP a head an hour over the hours formula, the four at its held depth | 0.8 to 1.2 (T-02, C7) at every band middle, and under 1.0 one tier past every band's top (F-1) | P-1, E-2, S-5 |
| Coin a hero-hour over wage(Level) on Steady | 0.95 to 1.05 (EL-PAY) | E-1, E-3, S-5 |
| Kit share of gross on Steady | 0.2 to 0.3 | E-4, D-5, D-6 |
| Held depth spread over the last 8 hours | under 1 depth (C-1) | S-1, S-3 |
| One gear tier up on a whole kit | moves the held depth 1 to 3 depths, either way (C-2) | G-1, G-2, P-4 |
| Deaths on Careful and Steady | none, pooled (C-3) | S-1, S-2, M-3 |
| Bold over Steady | above 1 in a 2 hour watched session, under 1 over a day (C-4) | S-1, P-7 |
| Careful over Steady | 0.55 to 0.70 (C-5) | S-4, S-1 |
| A four a head over its heroes apart | above 1.0 for XP and net gold (PARTY-1, PARTY-2) | E-2, E-3, M-4 |
| Lineups | no lineup deepest on every ground, every lineup deepest somewhere (STYLE-3, V4) | M-1, M-2, D-1 |
| Front hero's share of damage taken | the role mix's designed share, never 92 to 100% everywhere | M-2, D-3 |
| Fight, move and recover shares | fight near `fightShare` at the reference | D-7, M-4 |
| The low-health tail (10th percentile) | sits above the stance's fall-back line on Steady at the reference | S-1, S-2 |
| Traits | none in the best kit on more than the set share of cells, every one best somewhere (dominance) | G-3, G-4 |

**Rules.** Every comparison plays the same seeds before and after. A reading whose interval straddles its line is unresolved and gets more seeds, never a moved target. Death rates are read pooled. The search sees the search seeds, the final regression plays the held-out ones. The parked decisions of section 4 are read off this run, in one sitting, together.

## 6. Not checked

- I did not run the amount pipeline, the monster generator or the gear generator. They do not exist. Their scopes are JUDGMENT.
- Lines in section 1 were read on `set/v0.2.144` at the lane's base and move as files change. The lever registry (`tools/balance-program/levers.json`) is the line-exact inventory.
- The off-scale grounds' pace against the formula was not measured. The comparison in section 2.4 is against the retired table they were fitted to.
