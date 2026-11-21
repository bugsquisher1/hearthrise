# Balance program 42: the formula audit, character progression

Lane `lane/d-formulas-progression`, on `set/v0.2.144` at e6ea19170, 2026-11-21. The brief is Tyler's, `40-formula-brief.md`. Nothing in the game was changed. The machine-readable register is `tools/balance-program/formulas/formulas-progression.json`. The numbers come from two read-only probes in the same folder: `progression-probe.mjs` (the curves, Level 1 to 5,000) and `progression-engine-probe.mjs` (the real engine at Levels 200 to 5,000, results in `progression-engine-probe.json`).

Labels: CONFIRMED means I read the code path and, where it matters, measured it. HYPOTHESIS says what would confirm it. MEASURED means the real engine played it. COMPUTED means the game's own functions were called.

## Summary for Tyler

**What I counted.** 37 formulas run character progression. Around them sit 48 exceptions. 3 are foundational rules. 8 are content numbers that belong in data. 17 are intentional special rules, and 5 of those have no approval of yours on record. 20 are accidental complexity. 46 are confirmed and 2 are hypotheses.

**The good news.** The core is sound. HP, mana, the skill curve, the death share and the party split are each one small formula in one place. Monster blows are written as a share of hero HP, so a same-Level monster hits for 22% of a hero's health at Level 10 and at Level 5,000. The edge function imports the same files the browser does, so there is no second engine.

**The five worst problems.**

1. **Gear is the only thing that keeps a hero level with the monsters, and the game has no gear past Level 88.** A hero's hit is 0.35 a skill level plus 0.6 a point of weapon strength. Monster health grows 1.76 a Level forever. Skill cannot keep up, so gear has to. With today's real gear a lone hero earns 0.91 of the pace at Level 400, 0.47 at Level 1,000, and cannot hunt at all at Level 2,000. With the gear line the simulator invents (Dawnsteel times Level over 110) the pace holds from 200 to 5,000. That line lives in a tools folder, not in the game.
2. **The Level curve, the pace target and the XP a kill pays are fitted to each other in a circle.** Each time one moved, another got a patch. The result is 15 per-ground XP multipliers, 13 per-ground tier rows, a kill XP formula with two "hold the pace" factors baked in, a scaled-hunt XP number changed seven times, and a Level table re-cut eight times in four weeks. This is the exact thing your brief asks us to stop.
3. **Skills stop mattering.** Skill 100 costs 111 million XP and skill 200 costs 28 billion. At Level 1,000 skill is 14% of a hit, and at 5,000 it is under 5%. On the real engine 261 extra skill levels at Level 1,000 were worth 12% more XP. The yard pays a flat 30,000 an hour, so skill 100 takes 243 yard hours for one level. A +4 skill Tower weapon is worth about 1.4 points of damage at any Level.
4. **Rulings and code disagree in four places.** The under-Level XP cut you ruled out on 11-08 is still live. The Tower heat you dropped on 11-20 is still live. The rested bank fills on the server and pays nothing. The damage formula's named dials are read by the wiki only, so changing them changes the wiki and not the game.
5. **The simulator feeds the real engine heroes that cannot exist.** Past the measured Levels it draws skills on a straight line. At Level 400 it plays a hero with skill 198 where the curve allows about 132, so those cells take 24% less damage than a real hero would. The progression grid's Levels 185 to 400 are all played this way.

**Where things break.**

| What | Level |
|---|---|
| Today's gear stops keeping pace | about 300 |
| Skill is under a quarter of a hit | about 400 |
| A hero alone cannot hunt in today's gear | about 2,000 |
| The yard stops being worth an hour | skill 75 to 100, a hero near Level 100 |
| One death costs over 89 hunted hours unblessed | 300, then 759 hours at 1,000 and 6,246 at 5,000 |
| The Tower stops getting harder | floor 300 |
| The Level curve itself | holds. Level 1,000 is 22,459 hours, Level 5,000 is 203,570, each Level 34 to 54 hours |
| The party split | holds. A four earns 0.70 to 0.74 of a lone hero on Normal at every Level from 200 to 5,000 |

**Calls for you.** There are ten, in section 8. The three that matter most: make the gear line past Dawnsteel a rule of the game, decide whether skill should still matter at high Level, and decide whether the under-Level XP cut stays or goes.

---

## 1. Formula inventory

Every formula below is deterministic unless a named roll is listed. File and line are on this commit. Full parameters are in `formulas-progression.json`.

### 1.1 Experience

| Id | Formula | Where | Reads | Read by |
|---|---|---|---|---|
| P01 | **Level curve.** Step from Level L to L+1 = first + rise x m + bend x m^2 inside a bracket, m = L minus the bracket's start. 16 brackets | `src/core/xp.js:126-175`, `src/data/core-model.js:68-88`. Server: `hr_level_curve` rows, generated | P02 (fitted to it) | HP and mana, death, Blessing price, gear requirements, the split |
| P02 | **Pace contract.** A ground pays 1385 x L^1.274 Level XP an hour at its own Level. Targets: Level 10 in 6 h up to Level 1,000 in 23,520 h, within 10% | `src/data/balance-sheet.js:92`, `src/data/core-model.js:110-124` | the measured ladder of open grounds | the curve's fit, the kill XP fit, the grid, the standards. The game itself never reads it |
| P32 | **Level XP a kill** (owned by the hunting lane, listed as an input). 1.436 x L^0.4 a point of monster HP, at least 2.534, x a floor fit, x the ground's own fit | `src/data/balance-sheet.js:165,309` | P02 | P20 |
| P20 | **Kill XP split.** Hero XP = floor(kill XP x mode share / living heroes x party factor x scaled share x the hero's multiplier x the under-floor share) | `src/core/hunt/xp-share.js:66-85` | P21 to P27, P32 | P01 |
| P21 | **Party table.** Permille of the kill shared by the living heroes. Alone 1150. Two: 880 or 1500. Three: 990, 1600, 1700. Four: 970, 1580, 1670, 1700, by classes held | `src/data/party-class-xp.js:54,79,141-152` | | P20 |
| P22 | **Run ground party table.** Tower and Catacombs: 1000, 1100, 1200, 1300 by size | `src/data/tower.js:60` | | P20 |
| P23 | **Under-floor Level share.** A seat under the ground's floor and under 66.7% of the party's top Level keeps (Level / (top x 0.667))^2 of its share | `src/data/hunt-grounds.js:536-541` | P01 | P20 |
| P24 | **Tier dials.** Dangerous: XP x1.10, HP x1.10, damage x1.17, pull 8. Deadly: XP x1.25, HP x1.15, damage x1.33, pull 8 | `src/data/balance-sheet.js:422-528`, `src/data/hunt-tiers.js:102-131` | | P20, P07 |
| P25 | **Mode share.** Tower and Catacombs pay 37.5% of a kill and a death costs nothing | `src/data/session-modes.js:26-45` | | P20, P28 |
| P26 | **Scaled hunt share.** 73% of the formula's XP, and a party keeps 70% of its cell | `src/data/scaled-hunts.js:90-140` | P32, P21 | P20 |
| P27 | **XP weekend.** +25% for 72 hours every 14 days. Rows add, never past +50% | `src/data/live-events.js:26-34,90-95` | | P20 |

### 1.2 Skills

| Id | Formula | Where | Reads | Read by |
|---|---|---|---|---|
| P03 | **Combat skill curve.** XP from level s to s+1 = floor(15 x s^2 x 1.04^(s-1)). No cap | `src/core/xp.js:68-112`, `src/data/core-model.js:130`. Server: `hr_skill_level` | | P13, P07, P10, P12, P28, to-hit |
| P04 | **Capped skill table.** 99 rows, gathering and crafting | `src/core/xp.js:24-61` | | recipes, P18 |
| P05 | **Skill XP grant.** Credit = floor(carry + base x (1 + allXP + combatXP)). Base is the amount x 0.39 unless the skill is exempt | `src/core/progression.js:110-152`, `src/core/pacing.js:16-21` | P30, P31 | P03, P04 |
| P06 | **Melee and Ranged XP.** Damage dealt x 1.5 | `src/core/hunt-rewards.js:245` | P13 | P05 |
| P07 | **Defense XP.** 0.2 x the attacker's Level for each blow aimed at an armored hero, x2 on a shield block. A tier's damage dial raises that Level | `src/core/hunt-rewards.js:59-63` | P24 | P05 |
| P08 | **Magic XP.** floor(mana spent x 1.5 x the row's multiplier) | `src/core/hunt/xp-share.js:143-148` | | P05 |
| P09 | **Training pay.** 30,000 XP a settled hour, 60,000 with a training item, at any skill level | `src/core/hunt/training.js:85-121`, `src/data/training.js:43-60` | | P03 |
| P10 | **Yard fee.** 50 + 6 x the skill level, gold an hour. Tyler ruled 100 x level (24-8), not built | `src/data/training.js:81-84`, `hr_training_fee` | P03 | gold sinks |
| P30 | **Rested bank.** A charge every 6 minutes, cap 80 or 120, worth up to 1,600 XP | `src/core/rested.js` | | P05, which is always handed 0 |
| P31 | **Perk XP channels.** allXP and combatXP, permanent sources held to +20%. A companion's bonus x (1 + 0.05 a level) is added after the cap | `src/core/perks.js:87-140`, `src/core/companion-perk.js:61-121` | | P05 |

### 1.3 Health, mana and power

| Id | Formula | Where | Reads | Read by |
|---|---|---|---|---|
| P11 | **Max HP and mana.** HP = (150 + 10 x (L-1)) x (1 + 0.28 x heavy slots / 6). Mana = (100 + 10 x (L-1)) x (1 + 0.35 x light slots / 6) | `src/core/vitals.js:58-69`. Server: `hr_vitals_of` | P01 | monster blows, Mend, food sizing |
| P12 | **Regen.** 1 + P / (P + 50), P the Inner Flame level | `src/core/vitals.js:72-75` | P03 | supply use |
| P13 | **Largest blow** (overlap: combat). floor(0.35 x skill + 0.6 x worn strength + 2) minus floor(monster defense x 0.03). The swing rolls 1 to that | `src/core/combat.js:358-430`, the numbers at line 384 | P03, P15, P16 | P14, P06, kill speed |
| P14 | **Spell scaling** (overlap: combat). A cast is a permille share of the caster's largest blow, x the rune version's step (1.0 to 1.4), never under a beginner's floor. Mend is a share of max HP | `src/data/abilities.js:20-36` | P13, P11 | P08, kill speed |
| P15 | **+skill on gear.** A worn piece adds whole skill levels: Tower weapons +1 to +4, Catacomb helms +2 or +3 | `src/core/combat.js:89-110` | | P13, to-hit |
| P36 | **Reference hero** (overlap: combat). The skills a career hero holds at each Level. Monster aim and evasion are written against it | `src/data/to-hit.js:35-66` | P03, P02 | combat |
| P37 | **Skill lines.** The skills the simulator gives a hero at a Level | `tools/balance-sim/skill-lines.mjs:91-104` | | the progression grid |

### 1.4 Gear

| Id | Formula | Where | Reads | Read by |
|---|---|---|---|---|
| P16 | **Gear ladder.** Seven tiers worn at Levels 1, 15, 30, 45, 60, 75, 88. Every stat is a hand-typed row of seven numbers | `src/data/gear-tiers.js:43-162` | P35 | P13, armor, P17 |
| P35 | **Worn by Level.** Every piece names a hero Level | `src/data/gear-tiers.js:33` | P01 | equip |
| P17 | **Tempering.** A rung is +1% blows and heals or 1% less damage taken, five rungs a track, one ladder a gear tier. Each rung costs double the last. The part of a point is one seeded draw | `src/core/temper.js:27-91`, `src/data/temper.js:17-126` | P16 | combat, gold sinks |
| P18 | **Jewelry.** Perk size by tier, the largest worn counts once. Roll odds by Crafting level. Hallmark fee by tier. Reforge at the fee difference | `src/data/jewelry.js:39-104,325-355` | P04 | combat, gold sinks |
| P19 | **Special attributes and chest gear.** One attribute a piece, sized by gear tier, capped across everything worn | `src/data/special-attributes.js`, `src/data/catacomb-armor.js`, `src/data/chests.js` | P16 | P15, resists |

### 1.5 Death, and the side progressions

| Id | Formula | Where | Reads | Read by |
|---|---|---|---|---|
| P28 | **Death cost.** Level XP lost = floor(total x 0.06 x the mode's share). Each combat skill loses floor(0.06 x its progress into its level). Never below Level 1 | `src/core/action-rules.js:313-346`. Server bound: `hr_death_xp_mode_max` | P01, P03, P25, P29 | the popup, the Hunts warning |
| P29 | **Blessings.** 25, 50 or 75% off the loss. Free under Level 30, then base + perLevel x (Level - 30). A death uses them up | `src/data/blessings.js:34-69`, `hr_blessing_take` | P01 | P28 |
| P33 | **Tower and Catacomb floors.** A floor's monsters are the stat formula at Level = floor, stopping at floor 300. Past floor 100 blows grow 1.2% a floor, compounding | `src/core/hunt/tower.js:41-124`, `src/data/tower.js:47-58` | P25, P22 | the boards, chest keys |
| P34 | **Luck bar.** Rank n costs 100 x n^2 Luck. Ruled, not in the game | `tools/balance-sim/staged/luck.js` | | drop odds, when built |

---

## 2. Exception inventory

Class 1 foundational, 2 content number, 3 intentional special rule, 4 accidental complexity. Every row is CONFIRMED unless it says HYPOTHESIS. History before 2026-11-03 is squashed in git, so older reasons come from the code's own notes.

### 2.1 Class 4: accidental complexity (20)

| Id | What | Where | Why it exists |
|---|---|---|---|
| X02 | Three Level brackets (10, 15, 16) exist only to hand back XP taken from Levels 7 to 9. One of them is a single Level with a rise of 74,323 between rises of 4,630 and 300 | `core-model.js:80-82` | 11-20, lane/c-levels-7-9: no live hero's Level may move |
| X04 | The curve, the contract and kill XP are fitted to each other. Kill XP carries x0.96 and x0.88 "hold the pace" steps, and all 15 grounds carry an XP multiplier from 0.76 to 1.22 | `balance-sheet.js:158-165,309`, each pack's `xpFit` | 11-08 to 11-19, one patch a re-measure. Overlap: hunting |
| X05 | A kill pays 0.67 of the formula on grounds with a floor of 8 or under, rising to all of it at 32 | `balance-sheet.js:165` | 11-08: a lone hero on the first grounds read 1.37 to 1.53 of the pace. Overlap: hunting |
| X06 | **The under-floor Level share is live.** The 11-08 ruling was recorded as: this cut is CUT | `hunt-grounds.js:536-541`, `xp-share.js:78` | 11-03: a Level 1 behind three Level 37s earned 190k XP an hour untouched |
| X10 | Scaled hunts have their own XP share (800, 700, 820, 790, 760, 740, 730) and party share (700) | `scaled-hunts.js:99-122` | each change held one guard. Overlap: hunting |
| X11 | 13 per-ground tier rows. The Glade's tiers have HP 1400 and 1450 where the table says 1100 and 1150 | `balance-sheet.js:458-487`, packs' `tierOverride` | 11-17: "Groups of four were killing them too fast for the XP they give". Overlap: hunting |
| X13 | A harder tier brings a bigger pull only from floor 16 up. HYPOTHESIS that it is unneeded. Confirm by measuring the first grounds on the table's pull | `balance-sheet.js:422` | the ladder under the Glade. Overlap: hunting |
| X16 | **The Tower's heat is live.** Tyler dropped it on 11-20 | `tower.js:57`, `core/hunt/tower.js:108-118` | 11-19, then raised from 10 to 12 on 11-20 to hold a guard |
| X17 | The Tower stops at floor 300. Higher floors replay floor 300 | `tower.js:55,121` | the server's bounds are a generated table |
| X19 | The death share is written twice with different arithmetic, a float in JS and exact numeric in SQL. COMPUTED: they agree on every total from 0 to 2,000,000, on 2.5 million random totals under 3e15, and at every Level to 50,636. They differ by one above about 3e15 XP, first at Level 50,637, where the SQL bound would refuse the settle | `action-rules.js:317`, `2027-04-23-session-modes.sql:153` | the engine prices, the settle bounds |
| X21 | The Hunts page works out the death percent in the browser | `src/shell/hunt-list.js:179` | 11-11 |
| X22 | A monster's blow is multiplied by a number keyed on its art tier (5.4, 4.0, 4.0, 3.0, 2.2), written twice. The stat formula divides by the same number, so it cancels for every formula monster | `combat.js:42-58,473-477`, `balance-sheet.js:340` | 10-19, before blows were written as a share of HP. Overlap: combat |
| X23 | **The damage dials the wiki shows are not the ones the engine reads.** Line 384 uses the literals 0.35, 0.6 and 2 | `combat.js:38-40,384`, `shell/wiki-model.js:126` | unknown. Overlap: combat |
| X24 | A global XP dial of 0.39 with an exempt list, and Inner Flame authored at 40 so that 40 x 0.39 lands on 15.6 | `pacing.js:17-22`, `core-model.js:230-232` | the b226 pacing overhaul |
| X25 | The skill grant has two rounding paths, one marked debt | `progression.js:132-140` | databases without the remainder column |
| X26 | **The rested bank fills and pays nothing.** All four grant callers pass 0 | `rested.js`, `accrue-rested.js`, `member.js:220,230` | "Rested XP is not server state yet" |
| X27 | A companion's XP bonus is added after the +20% cap, on a curve restated from a client file. HYPOTHESIS that it is dead. Confirm by reading whether a live hero can hold a companion | `companion-perk.js:71-121` | the balance guard books companions as dark |
| X34 | Past Level 110 a Tempering ladder is keyed on the piece's Level band, because every later piece is still "tier 7" | `temper.js:107-117` | 11-15: no tier 8 |
| X42 | The reference hero past Level 1,000 is a straight line. It reads Melee 375 at 5,000 where the curve allows about 248 | `to-hit.js:56-66` | the table stops at 1,000. Overlap: combat |
| X43 | The simulator's skills past the measured line are a straight line: 198 at Level 400, 438 at 1,000, against about 132 and 177 | `tools/balance-sim/skill-lines.mjs:99-103` | never checked against the curve's cost |

### 2.2 Class 3: intentional special rules (17)

| Id | What | Where | Approved |
|---|---|---|---|
| X07 | A hero alone earns +15% Level XP | `party-class-xp.js:54` | Tyler 11-11 |
| X09 | Tower and Catacombs use their own party table. Its pair and three rows are ASSUMED | `tower.js:60` | **not found** |
| X12 | The Mill Cellar is Normal only | `balance-sheet.js:470` | Tyler 11-05 |
| X14 | The Tower pays 37.5% XP and a death there is free | `session-modes.js:35-36` | Tyler 11-14 |
| X15 | The Catacombs' row and door Level are copies of the Tower's, marked ASSUMED | `session-modes.js:37-45` | the mode yes (11-16). **The numbers no** |
| X18 | A death takes 6% of the total Level XP but 6% of each skill's progress into its level. Inner Flame is on the list | `action-rules.js:313-325`, `skills.js:44` | Tyler 11-09 and 11-21. **Inner Flame not found** |
| X20 | Blessings are free under Level 30 | `blessings.js:36` | Tyler 10-18 |
| X28 | Training pays one fixed rate | `training.js:47` | Tyler 11-14 |
| X29 | The dummy never falls, never takes a hero under half HP, and the yard opens at Level 10 | `core/hunt/training.js:56-65` | Tyler 11-08 |
| X33 | Dawnsteel's Tempering rung is 0.4% and a unique band's 0.5% | `temper.js:47,94` | Tyler 11-15 and 11-16 |
| X35 | Tier 1 gear has no Tempering | `temper.js:7` | inside the 11-04 approval |
| X37 | Boss gems fix one thing about a jewelry roll | `jewelry.js:122-126` | Tyler 11-14 |
| X38 | +skill on gear is a flat number of levels | `combat.js:89-110` | Tyler 11-14. It does not deliver his 11-18 "pretty major upgrades" |
| X39 | Mend heals a share of max HP | `abilities.js:28-29` | Tyler 11-21 (32-4) |
| X40 | Every cast keeps a beginner's floor | `abilities.js:30-36` | **open**, CONFLICTS.md call 1 |
| X41 | Three skills advance on three bases: damage dealt, mana spent, the attacker's Level | `hunt-rewards.js:59-63,245,266` | the core model, whose own header says "pending Tyler's approval" |
| X44 | The XP weekend adds, never past +50% | `live-events.js:27-33` | Tyler 11-20 (27-5) |

### 2.3 Class 2: content numbers (8)

| Id | What | Where |
|---|---|---|
| X01 | The Level curve is a 16-row table, 12 rows under Level 21 | `core-model.js:15-88` |
| X03 | The brackets at 110 and 300 are fitted by hand with no ground there. Hours a Level are flat at 11.2 to 11.8 from 100 to 300, then 20.8 at 400 | `core-model.js:85-86` |
| X08 | The party table's nine cells, three re-cut for single measured cases | `party-class-xp.js:72-79` |
| X30 | The yard fee in code is not the ruled fee | `training.js:53-54` |
| X31 | Gear stats are hand-typed, with single cells tuned to pass one guard on one ground | `gear-tiers.js:66-150` |
| X32 | No gear past Dawnsteel is in the game's data | `gear-tiers.js:43-58` |
| X47 | The Luck bar lives in a simulator file | `tools/balance-sim/staged/luck.js` |
| X48 | Magic XP a mana is 1.5 x a per-row multiplier of 1.6, 0.25 or 0. No row uses 1.0 | `hunt-xp.js:23`, `abilities.js` |

### 2.4 Class 1: foundational (3)

X36 a jewelry perk counts once at its largest size. X45 the curves' ceilings (Level totals exact to 63,243, the skill walk stops at 476). X46 the server's twins of the curves, vitals, fee, price and death bound, generated or pinned by `tests/core-curves.mjs`.

---

## 3. Dependency map

**Inside progression** (reads from the left, feeds the right):

- P02 contract → P01 Level curve
- P02 contract → P32 kill XP → P20 split → P01
- P21, P22, P23, P24, P25, P26, P27 → P20
- P01 → P11 HP and mana, P35 worn by Level, P28 death, P29 Blessing price, P23
- P35 → P16 gear → P13 blow, P17 Tempering, P19 attributes → P15 +skill → P13
- P03 skill curve → P13 blow → P14 spells, P06 weapon XP
- P06, P07, P08, P09 → P05 grant → P03. P30 and P31 → P05
- P24 tiers → P07 Defense XP
- P03, P25, P29 → P28 death
- P03 and P02 → P36 reference hero, P37 skill lines

**The loop that matters.** P13 blow → kill speed → P20 Level XP an hour → measured against P02 → P02 re-pinned → P01 and P32 re-fitted → P20. And P13 → P06 → P03 → P13. Every power change runs through both.

**Edges that leave the category.**

| From | To | What |
|---|---|---|
| P13, P14, P17 | combat | kill speed, damage, healing, damage taken |
| P11 | combat | monster blows are a share of hero HP |
| P36 | combat | monster aim and evasion |
| P16 | combat | armor reads armor points against the attacker's Level |
| P32, P24, P26 | hunting and economy | XP a monster, tier pulls, scaled hunts |
| P10, P17, P18, P29 | hunting and economy | gold sinks |
| P34 | hunting and economy | drop odds |

---

## 4. Architecture assessment

| Principle | Holds | Breaks, with the evidence |
|---|---|---|
| **Centralized** | Curves, vitals, death and the split each have one JS home. The edge imports it | Blow constants in two places, the engine reading neither named one (X23). The damage scale written twice (X22). Death share in two arithmetics (X19). Two projections of the same hero, both wrong in different ways (X42, X43). Two party tables (X09) |
| **Deterministic** | Yes. The only rolls are named: the swing, a cast's half-to-full, Tempering's part of a point, the craft roll | None found |
| **Data-driven** | Tiers, modes, Blessings, Tempering and training are rows | Gear is hand-typed cells (X31). Gear past 88 is absent (X32). The curve's early rows are compensation, not content (X02) |
| **Composable** | The split is one chain of factors | Two links are keyed on Level or floor (X05, X06). Tempering switches its key at Level 110 (X34) |
| **Scalable** | HP, mana, monster blows, the curve, the party split | Gear (X32), skill worth (section 7.3), the yard (X28), +skill gear (X38), the Tower's floor cap (X17), Blessing price (section 7.5) |
| **Auditable** | A kill's XP can be traced through seven named factors | The pace cannot. It is a measurement of grounds that were tuned to it (X04). The wiki's damage numbers are not the engine's (X23). The grid's projected heroes are not on the curve (X43) |
| **Globally tunable** | HP a Level, the death share, the solo boost, the tier table each move everything | Moving the contract, the curve, kill XP or the blow needs a re-fit of the others plus up to 28 per-ground rows (X04, X11). Seven re-dials of one scaled-hunt number show the cost (X10) |

**What the progression grid lacks against sections 5 and 6 of the brief** (from its header and code, not a full review): it stops at Level 400. Its heroes past 185 use straight-line skills (X43). It plays one lone way, the hammer, at every gear state. Its cells are 2 hours, with a rotating 8-hour death sample. I found no before-and-after mode that diffs two commits across the matrix, HYPOTHESIS until the synthesis lane reads `grid-derive.mjs`.

---

## 5. Proposed model for progression

Nothing new is invented. Each item removes exceptions from section 2.

**M1. One pace law, and everything else derived from it.** Keep the contract `a x L^b` as the one statement of "what an hour pays at Level L". Then:
- The Level curve becomes `step(L) = hours a Level(L) x contract(L)`. Hours a Level is what Tyler actually rules on. COMPUTED: one law, hours to Level L = 0.40 x L^1.58, lands all six ruled points from 100 to 1,000 within 8%. One law for all nine points misses by up to 30%, so Levels 1 to 100 keep a short table. Removes X02 and X03.
- Kill XP becomes `contract(L) / reference kills an hour(L)`, where the reference comes from the blow formula on the reference hero. A ground that pays more or less says so as one declared content number, with a reason a player could read. Removes X04, X05.

**M2. One reference hero, computed.** `refHero(L)` = the skill the curve's cost allows after the contract's hours, in the gear line's gear. The to-hit table and the simulator's skill lines both read it. Removes X42 and X43, and makes "what does +1 skill cost at Level 800" a function call.

**M3. A gear line in data.** Stats past Dawnsteel are `Dawnsteel x Level / 110`, a band every N Levels, in `src/data`, not in tools. MEASURED: on that line the pace holds from Level 200 to 5,000 with no other change. A band is then a real tier, so Tempering keys on tier again (removes X34) and X32 closes.

**M4. One XP chain, no Level or floor keys.** Kill XP x tier x mode x party(size, classes) x event. Each factor is one table for the whole game. The under-floor share (X06), the floor fit (X05), the per-ground tier rows (X11) and the scaled party share (X10) either go or become declared class 3 rules with Tyler's name on them.

**M5. One death function in whole numbers.** `loss = total x permille / 1000` in integer arithmetic in both runtimes, and the browser reads the percent from the server. Removes X19 and X21.

**M6. One skill grant.** The carry path only. The 0.39 dial is folded into the authored numbers of the skills it touches, or each skill family names its dial in data. Removes X24 and X25. The rested bank (X26) is deleted or wired, never left filling.

**M7. The blow reads its named constants.** One line. Removes X23. The art-tier damage scale (X22) goes to the combat lane.

**The tuning knobs after this, and what each one moves.**

| Knob | Moves |
|---|---|
| K1 hours a Level (table to 100, law after) | how long every Level takes |
| K2 contract a and b | what every ground pays. The curve and kill XP follow with no re-fit |
| K3 skill curve base and growth | how fast skills rise, to-hit, the yard's worth |
| K4 HP and mana a Level | every monster blow, heal and supply size |
| K5 blow weights (skill, strength, flat) | how much of damage is skill and how much is gear |
| K6 gear line slope and band width | whether power tracks monster HP, and how big an upgrade feels |
| K7 party table and solo boost | solo against party |
| K8 tier table | risk against reward |
| K9 death share and Blessing cuts | the cost of a death |
| K10 mode shares | the Tower and Catacombs against hunting |
| K11 Tempering rung and price rule | gold-bought power |

---

Section 6 of the brief (the validation plan) and the cross-category map are the synthesis lane's.

## 7. Scalability

### 7.1 The Level curve (COMPUTED on the contract)

| Level | Total XP | Hours to reach | Days at 12 h | Hours for this Level | Against the ruled target |
|---|---|---|---|---|---|
| 10 | 105,733 | 6.4 | 0.5 | 2.5 | 1.06 |
| 50 | 17.0 M | 147 | 12 | 5.6 | 0.88 |
| 100 | 176.7 M | 600 | 50 | 11.2 | 1.00 |
| 200 | 1.12 B | 1,748 | 146 | 11.5 | 1.04 |
| 300 | 2.94 B | 2,907 | 242 | 11.8 | 0.93 |
| 400 | 7.04 B | 4,580 | 382 | 20.8 | the ruled 4,580 |
| 500 | 14.8 B | 6,917 | 576 | 25.6 | 1.03 |
| 1,000 | 116.3 B | 22,459 | 1,872 | 34.5 | 0.95 |
| 2,000 | 711.7 B | 60,433 | 5,036 | 40.8 | none |
| 5,000 | 7.44 T | 203,570 | 16,964 | 54.3 | none |

It is a table, not one formula: 16 rows, 12 of them under Level 21. The tail is a real formula and stays sane. Totals are exact integers to Level 63,243. Two shape faults. The step jumps 4.1 times at Level 5 (Cellar to Thicket) and 1.9 times at Levels 10 and 16, where the hand-cut rows meet. And hours a Level are flat from 100 to 300, then climb 76% by 400, because the row at 300 was fitted to hit two numbers. Standards P12 ("a Level a day") passes at 300 by 0.2 hours.

The Level 7 to 9 re-cut and the give-back are in rows 7, 8, 9, 10, 15 and 16. The code's note says the total at Level 21 is held. COMPUTED: it is 1,369,570 today.

### 7.2 Does power track the monsters (MEASURED, the real engine)

A lone hammer and a mixed four, MID kit, 2 seeds x 0.5 h a cell, on the grid's own placeholder ground. "Curve skills" are what the skill curve allows. "Line gear" is Dawnsteel x Level / 110. "Today's gear" is the best the data holds, the kit a Level 185 hero wears.

| Level | Lone, Normal, line gear | Lone, Normal, today's gear | Four, Normal, line gear | Four, Deadly, line gear | Four, Deadly, today's gear |
|---|---|---|---|---|---|
| 200 | 1.38 x contract | 1.28 | 0.97 | 2.22 | 2.01 |
| 400 | 1.37 | 0.91 | 1.00 | 2.08 | 1.46 |
| 1,000 | 1.43 | 0.47, dying | 1.04 | 1.95 | 0.24, dying |
| 2,000 | 1.48 | 0.02, dead | 1.10 | 1.95 | 0, dead |
| 5,000 | 1.63 | 0, dead | 1.16 | 2.05 | 0, dead |

- **On the line, the formulas hold to 5,000.** Nothing runs away. A lone hero drifts from 1.38 to 1.63 of the pace, which is slow and can be dialed with the line's slope.
- **Without new gear the game ends near Level 300.** The mechanism is monster HP outgrowing player power: 1.76 HP a Level against a hit that only gear can raise.
- **Solo and party do not diverge.** A four on Normal earns 0.70, 0.73, 0.73, 0.74 and 0.71 of a lone hero at the five Levels.
- **A lone MID hammer dies on Deadly at every Level from 200 up**, and a mixed four on the line did not die once. That is thin (one hour a cell), so it is a HYPOTHESIS for the combat lane: Deadly may be free double XP for a four.

### 7.3 Skill (COMPUTED, then MEASURED)

| Skill | XP for this level | Total | Yard hours for this level |
|---|---|---|---|
| 50 | 256,250 | 2.66 M | 8.5 |
| 75 | 1.54 M | 20.4 M | 51 |
| 100 | 7.28 M | 111 M | 243 |
| 150 | 116 M | 2.07 B | 3,883 |
| 200 | 1.47 B | 28.4 B | 49,053 |

The curve grows 4% a level, compounding. A hero's skill XP an hour grows about L^0.87. So skill rises with the logarithm of hours: about 81 at Level 100, 132 at 400, 177 at 1,000, 207 at 2,000, 248 at 5,000. My number and the game's own reference table agree to Level 1,000 (81 against 78, 132 against 129, 177 against 167).

Skill's share of a hit, on line gear: 40% at Level 100, 33% at 200, 23% at 400, 14% at 1,000, 9% at 2,000, 4.5% at 5,000. MEASURED: at Level 1,000 a hero with skill 438 against one with 177 earned 12% more XP and took 56% less damage. At 5,000, skill 2,038 against 248 was 3% more XP. So skill ends up a defense stat only, through to-hit.

The yard is worth three hunted hours of skill XP at Level 10 and a twentieth of one at Level 1,000.

### 7.4 HP and mana (COMPUTED)

HP is 150 + 10 a Level: 1,140 at 100, 10,140 at 1,000, 50,140 at 5,000. A same-Level regular's largest blow is 22% of it at every Level. Healing and supplies are the economy lane's, but Mend (11% of max HP) and the two "on each kill" perks scale with it and need no change.

### 7.5 Death and Blessings (COMPUTED)

| Level | Unblessed | All three Blessings | Levels lost unblessed | Blessing set, gold |
|---|---|---|---|---|
| 100 | 21.7 h | 5.4 h | 2 | 3,600 |
| 400 | 147.7 h | 36.9 h | 8 | 17,100 |
| 1,000 | 759 h | 190 h | 23 | 44,100 |
| 2,000 | 1,921 h | 480 h | 48 | 89,100 |
| 5,000 | 6,246 h | 1,562 h | 118 | 224,100 |

The cost in hours grows about L^1.7 because it is a share of the total. The flat 6% with no cap is Tyler's ruling to Level 400 (50-4). The Blessing price grows in a straight line, so by Level 1,000 a set costs 44,100 gold and saves 569 hours. That is no longer a choice. SQL and JS compute the death the same way in every reachable range (X19).

### 7.6 Gear steps and Tempering

A warhammer's strength steps +129%, +44%, +22%, +39%, +33%, +31% up the seven tiers. The steps are uneven because cells were tuned one at a time (X31). On a straight gear line a band every 20 Levels is +18% at Level 110 and +1% at Level 2,000, so upgrades go meaningless unless bands widen with Level (a band every fixed percent, not every fixed number of Levels). Tempering is a percent, so it scales, but its ladders stop at four closed unique bands (165).

### 7.7 Party XP, the multipliers, Tower and Catacombs

The party table is a ratio, so it scales. A head's share of a kill: alone 1150, a mixed pair 750, a mixed three 567, a mixed four 425. Tier XP is a ratio and scales. The XP weekend is a ratio. Rested XP pays nothing today. The Luck bar is not in the game. The Tower and the Catacombs stop at floor 300, so as progressions they end the day a party clears floor 300, and the heat (1.2% a floor, compounding) makes floors 100 to 300 grow 10.9 times in damage, a wall that Tyler already ruled out.

---

## 8. Conflicts and calls for Tyler

Each has both sides. None is resolved here.

1. **The gear line past Dawnsteel.** One side: the plan has uniques and bands to 400 by hand. Other side: nothing past Level 300 holds without a rule, and the simulator already uses one (Dawnsteel x Level / 110). Call: is that line the game's rule, with bands and uniques as content on top of it?
2. **Should skill still matter at high Level?** One side: today's shape is Tibia-like early and gear-led late, and nothing is broken by it. Other side: your brief lists "skill advancement" as progression, and by Level 1,000 a skill level is worth nothing a player can feel. A fix would be the blow as skill times gear, which is a combat-engine change.
3. **The under-Level XP cut (X06).** Your 11-08 words were "XP share rule applies regardless", recorded as cut it. It is live. One side: without it a Level 1 hero behind three Level 37s earned 190k XP an hour for free. Other side: it is a hidden Level rule the wiki cannot show simply.
4. **+skill gear against "pretty major upgrades" (X38).** 11-14 says Tower weapons give +1 to +4 skill "like Tibia". 11-18 says they should be major upgrades. +4 skill is about 1.4 damage at any Level. Both cannot hold. A percent of the blow would scale.
5. **The yard's fixed rate (X28).** Your 11-14 ruling is one rate at every level. On the 4% curve that makes the yard worthless near skill 100. Keep it as an early tool, or let the rate follow the skill?
6. **The death share past Level 400.** Flat 6% with no cap is ruled. It is 759 hunted hours at Level 1,000. And the Blessing set that saves 569 of them costs 44,100 gold. Should the Blessing price follow the hours it saves (standards S10 proposes this)?
7. **The Tower's own party table (X09).** 1000, 1100, 1200, 1300 by size, no class mix, no solo boost. Your 11-16 words were one table "vs having a unique formula everywhere". Is the Tower an approved exception?
8. **The Catacombs' numbers (X15).** Its XP share and door Level are copies of the Tower's, marked ASSUMED in the code. Approve them or have them measured.
9. **The Level curve's shape.** One law from Level 100 fits every ruled point within 8%. It puts Level 400 near 5,090 hours where you ruled 4,580. Keep the table and 4,580, or take the law and about 5,090?
10. **Two small confirmations.** A death also takes 6% of Inner Flame's progress, a skill trained at the Hearth and not in a fight (X18). And Melee, Magic and Defense advance on three different bases (X41), which the core model's own header still calls pending your approval.

**Ruled already, not built, no call needed:** drop the Tower heat (X16, plan L18). The yard fee of 100 a level (X30). Jewelry tiers 4 to 7. The Luck bar (X47).

---

## 9. Overlaps for the dedupe lane

| Item | Also in |
|---|---|
| P13 largest blow, X23 unread dials, X22 art-tier damage scale | combat |
| P14 the spell rule, X39 Mend, X40 the beginner's floor, X48 Magic XP multipliers | combat |
| P36 and X42 the reference hero | combat |
| Monster HP 4.95 + 1.76 a Level against the blow (section 7.2) | combat |
| Lone Deadly dies, a four never does (section 7.2) | combat |
| P32, X04, X05 kill XP and the ground fits | hunting and economy |
| P24, X11, X13 tier rows | hunting and economy |
| P26, X10 scaled hunts | hunting and economy |
| P10, P17, P18, P29 prices of gear steps, fees and Blessings | hunting and economy |
| P34, X47 the Luck bar | hunting and economy |

## 10. How to re-run

```
node tools/balance-program/formulas/progression-probe.mjs
node tools/balance-program/formulas/progression-engine-probe.mjs --levels 200,400,1000,2000,5000 --hours 0.5
```

The first takes a few seconds. The second is 120 seed jobs on 3 workers, about four minutes. Both only read.
