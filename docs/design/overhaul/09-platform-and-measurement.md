# Chapter 09: Platform, formulas and measurement

Part of "Hearthrise: the game we are building", the combined design of record. Lane `lane/d-book-platform`, systems engineer, 2026-11-21. No game code, data or migration was changed.

This chapter covers four things that every other chapter stands on:

1. The formula architecture, which is how every number in the game is made.
2. The order the work is built in, as 28 steps.
3. What an account may cost the server, and the design that keeps it there.
4. The measuring instrument, which is how we know a design does what it says, and what must wait for real players.

**Status marks.** Every design statement carries one.

- **RULED** is Tyler's ruling, with its date or call id.
- **DECIDED** carries the call id and "Fable 2026-11-21". The game designer decided the call and an adversarial check corrected it. Its row is in `decisions/all.json`.
- **DECIDED (reversal, Tyler may veto)** changes one of Tyler's rulings. The first tag in the chapter names the ruling. It stands unless he vetoes it.
- **TYLER CONFIRMS** is a money call or a grant, with the one recommendation.
- **CUT (Tyler approves)** is a removal that waits for his yes.
- **OPEN** has no recommendation yet. The line says what decides it.
- **PENDING 48** marks an answer that waits on the server cost study, `48-platform-cost.md`. It had not landed on `origin/set/v0.2.144` when this chapter was written (checked 2026-11-21). A draft sits on `lane/d-platform-cost`, unfinished and unreviewed, and nothing here is taken from it.

**Number labels.** TARGET is a number the design aims at. COMPUTED is arithmetic on the game's own numbers. MEASURED is the real engine played by the simulator. ESTIMATED is a sized guess with its method. EVIDENCE names real play. A measured number appears in this chapter only as evidence about a proposed design or about whether the simulator is true.

---

## 1. The experience

**Minute 5.** A new player opens the Book and reads how a hit is made: skill, weapon and a flat base, in the same three numbers the server uses. Nothing in the game is a secret multiplier. The first fight starts at once and never stutters, because the server runs it and the screen only draws it.

**Hour 20.** The player sets four heroes hunting, closes the game and goes to bed. The hunt keeps running on the server. In the morning every kill, drop, Level and coin is there, and so is the work the heroes did in town after their stamina ran out. Nothing was lost because a tab was shut, and nothing was gained by leaving one open.

**Hour 2,000.** The heroes are far past Level 300. Gear, monsters, prices and rewards still follow the same formulas they followed at Level 10, so a new region feels like the game the player learned, only larger. A world boss weekend, a clan castle and two arenas run beside the hunt and the game is no slower for it.

**For the people building it.** One dial moves one thing everywhere. A ground that reads too dangerous is never patched by hand. The question is always which formula, coefficient, curve or data row is responsible. The Balance Lab shows the proposed game beside its targets, and a change ships only after the balance matrix has played it on the real engine and shown what else it moved.

---

## 2. The design

### 2.1 The formula architecture

#### 2.1.1 The rules of the architecture

| # | Rule | Status |
|---|---|---|
| 1 | The game is formula-driven. Balance is fixed at the formula layer. No ground, weapon, monster or spell gets its own patch or its own math | RULED 2026-11-21 (the formula brief, `40-formula-brief.md`) |
| 2 | Every change names its layer, in this order of preference: formula, then coefficient, then curve, then content data. Special-case code is never a fix | RULED 2026-11-21 |
| 3 | Each mechanic category has one framework that is centralized, deterministic, data-driven, composable, scalable to any Level, auditable and globally tunable. It is one framework a category, not one formula for everything | RULED 2026-11-21 |
| 4 | Every formula is public. It lives in one data source, carries no hidden special case, and the in-game wiki renders it from the same constants the engine reads | RULED 2026-11-08 |
| 5 | A hero's blow never reads the hero's own Level, and no multiplier is keyed on a hero's Level against a ground's floor. Blows are stats against stats | RULED 2026-11-04 and 2026-11-18 |
| 6 | Levels have no end. Every formula is tested far past Level 400 | RULED 2026-11-21 (the formula brief, section 7) |
| 7 | Intentional differences stay. A special rule is kept when it is documented and Tyler has approved it by name | RULED 2026-11-21 |
| 8 | No new formula or abstraction is added unless it removes complexity or fixes correctness | RULED 2026-11-21 (the formula brief, section 8) |
| 9 | One combat engine runs every fight, watched or not, at a 10 second settlement and 100 ms steps | RULED (CLAUDE.md section 6) |

#### 2.1.2 The four classes of rule

Every rule in the game belongs to exactly one class. The class decides where it lives.

| Class | What it is | Where it lives | Count in the model | Status |
|---|---|---|---|---|
| 1. Foundational | A mechanic the whole game shares | The shared engine, `src/core` | 12 | RULED 2026-11-21 |
| 2. Content number | A value that describes one piece of content | A data row in `src/data` | 25 families | RULED 2026-11-21 |
| 3. Intentional special rule | A deliberate difference, written down | Data, with a documented reason and Tyler's approval by name | 35. 26 carry a ruling on record. 9 wait on GR-25 | RULED for the 26. DECIDED (GR-25, Fable 2026-11-21) for the 9 |
| 4. Accidental | A number that exists to correct another number | Nowhere. The game we are building has none | 0 kept. One fallback in a helper is unproven (`E-X36`) and is checked when its file is next opened | RULED 2026-11-21 as a principle |

The inventory behind these counts is `tools/balance-program/formulas/formulas-architecture.json`, written by `architecture-register.mjs`. COUNTED: 107 formulas after the same formula filed by two audits was merged into one (42 combat ids, 23 progression, 42 economy), 198 edges between them, and 67 of those cross a category. EVIDENCE about the audit, not a design number: 115 of its 129 classified rows were confirmed by reading code and 14 are hypotheses that each say what would confirm them.

**The hub formulas.** COUNTED: twelve formulas each reach 78 of the 107. A change to any of them is a whole-game change and is judged on the whole matrix: `C-MON-STATS` (the monster formula), `C-GEAR-WEAPON` and `C-GEAR-ARMOR` (gear stats), `P03` (the combat skill curve), `C-TIER` (the tier table), `C-HERO-POWER` (the hero's blow), `C-CAST-POWER` (what a cast reads), `C-STATUS` (statuses), `C-TEMPER` (Tempering), `P11` (hero health and mana), `P01` (the Level curve) and `E14` (XP, kills and gold an hour, which no formula computes and the matrix measures).

#### 2.1.3 The combat framework

Nine mechanics. Their sizes belong to chapter 01. Their shape is fixed here.

| # | Mechanic | The rule | Formula ids | Status |
|---|---|---|---|---|
| 1 | Power | One number a unit, its largest hit. A hero's is `skillPower x skill + gearPower x weapon damage + basePower`, read from named constants that the wiki also reads. A monster's is a share of a same-Level hero's health, stored on its row as a whole number | `C-HERO-POWER`, `C-MON-BLOW` | DECIDED (GR-85, Fable 2026-11-21, steps R2 and R4) |
| 2 | Rating against rating | Hit chance is the attacker's rating against the defender's, one ratio for heroes and monsters | `C-HERO-TOHIT`, `C-MON-TOHIT` | RULED (kept as built, 2026-11-08 public formulas) |
| 3 | One amount pipeline | Every amount (a swing, a spell hit, a tick, a monster blow, a heal, a shell) is `roll(Power x share) x the product of its modifiers`, multiplied in permille and rounded once, in one fixed order. Each blow can emit a short trace of its stages, so any outcome can be explained | `C-BASIC-BLOW`, `C-SPELL-HIT`, `C-SPELL-HEAL`, `C-SPELL-SHELL`, `C-HURT` | DECIDED (GR-86, Fable 2026-11-21, step R19). One roll rule with the spread as a number for each kind, and heals at a spread of zero, is GR-13 |
| 4 | The armor chain | Dodge, absorb and ward in the ruled order, capped at 60%, read against the monster's own Level | `C-ARMOR-CHAIN` | RULED 2026-10-18 for the cap. DECIDED (GR-85, Fable 2026-11-21, step R7) for the monster's own Level |
| 5 | The monster formula | Every monster is written from a Level, a role and an encounter type. Nothing about a monster's strength depends on its art | `C-MON-STATS` | DECIDED (GR-86, Fable 2026-11-21, step R21, and GR-85 step R4) |
| 6 | One tier table | Normal, Dangerous and Deadly are one table for every ground: a pull, a difficulty percent and an XP percent. Coin a kill never scales with a tier. The difficulty dial moves the blow and the aim, and is applied once | `C-TIER`, `C-PULL` | RULED 2026-11-05 and 2026-11-07 for the shape. DECIDED (GR-85, Fable 2026-11-21, step R7, GR-5 and GR-27) for one table with no per-ground rows |
| 7 | The gear curve | See 2.1.4 | `C-GEAR-WEAPON`, `C-GEAR-ARMOR` | DECIDED (GR-4, Fable 2026-11-21, reversal of two bands a region of 2026-11-18 and the Luck step of 2026-11-20, Tyler may veto) |
| 8 | One modifier table | Every worn, cast, earned or bought modifier is a row: a key, a combine rule (sum or largest) and a cap. Clan rooms, boss buffs, event buffs and bought boosts are rows in this same table | `C-BUFF-BONUS`, `C-JEWEL-PERKS`, `C-STATUS` | DECIDED (GR-86, Fable 2026-11-21, step R20, and MM-24 for the MMO layer's rows) |
| 9 | Sustain | Two heal kinds in data: a share of Power or a share of max health | `C-SPELL-HEAL`, `C-LEECH`, `C-REGEN` | RULED 2026-11-21 (32-4: Mend heals about 11% of max health) for the second kind |

**How spells read the combat stats.** A cast reads the weakness of its own damage kind: weapon weakness for a physical strike, the element for an elemental spell. A spell never misses and never crits. Accuracy and crit are basic-attack stats and the wiki says so. DECIDED (GR-12, Fable 2026-11-21). The cost stays on the table: accuracy and crit gear are worth less the more a hero casts, and whether accuracy still earns a stat line is read on the matrix's gear-step cells before it is ruled. One power floor on the blow a cast reads serves the first Levels in place of a floor on each spell row. DECIDED (GR-11, Fable 2026-11-21, building the ruled 32-8).

#### 2.1.4 The progression framework

| Mechanic | The rule | Formula ids | Status |
|---|---|---|---|
| The gear curve | A game formula in `src/data`, linear in the Level a piece is worn at, because monster health and hero health are both linear in Level and gear on any other curve drifts against them. A band is a fixed percent step of power, never a fixed count of Levels. The reference hero that every monster's aim and evasion are written against reads the curve. A unique spends a budget from the curve at published exchange rates, so its armor is arithmetic | `C-GEAR-WEAPON`, `C-GEAR-ARMOR`, `C-REF-HERO`, `P35` | DECIDED (GR-4, Fable 2026-11-21, reversal, Tyler may veto). The band's size is a tier's worth, about +24% of the line, with bands at Levels 110, 136, 169, 210, 260, 322 and 400. It is owned by chapter 03 |
| The Level law | Hours to each Level is content Tyler owns: the ruled points, joined by a straight line on a log scale and carried past the last point at the last slope. The pace contract is the one law for what an hour pays at Level L. The XP a Level costs is derived: hours times what an hour pays, times the pace seat's multiple | `P01`, `P02` | RULED 2026-11-21 for the table (Level 400 at 4,580 hunted hours, day 382) and the pace seat (a mid-geared four on the hardest tier it holds). DECIDED (GR-6, Fable 2026-11-21, reversal of the hours of the 2026-10-25 table and "Level 400 is day 382", Tyler may veto) for the derivation from Level 50 |
| The kill reward | XP a health point is `contract(L) / reference kill-health an hour(L)`, one reference line for the whole game. A ground carries at most one derived number, for how its layout (walking, pack size, respawn) moves kill-health an hour against the reference. The generator writes it from the matrix with a stated tolerance of 5%. Nobody types it | `E01`, `E14` | DECIDED (GR-5, Fable 2026-11-21, step R12) |
| One XP chain | Kill XP x tier x mode x party x event. Each factor is one table for the whole game. The lone hero's share is the first cell of the party table. The Tower and the Catacombs take the same table. A hero far under its party's top Level follows one visible line: at two thirds of the top Level or more it keeps its full share, and below that its share is its Level over that line | `P20`, `P21`, `P22`, `P25`, `P27` | DECIDED (GR-85, Fable 2026-11-21 for the fold, GR-36 for the Tower and Catacombs, MM-19 for the two thirds line). The party table's cells belong to chapter 06. No band sets one party size against another (RULED 2026-11-21, GR-67) |
| Skills | The combat skill curve is one formula. Skill gains its late worth through rune tiers past skill 60, one every 15 skill levels, on the gear curve. The hit stays skill plus gear and never skill times gear | `P03`, `P05`, `P06`, `P07`, `P08` | DECIDED (GR-23, Fable 2026-11-21) |
| Death | 6% of all Level XP and 6% of each combat skill's progress, flat, with no cap. One function, in whole numbers, the same in both runtimes | `P28` | RULED 2026-11-21 (50-4) |

#### 2.1.5 The economy framework

| Mechanic | The rule | Formula ids | Status |
|---|---|---|---|
| The coin line | Coin a kill is one line by monster Level times monster health. One number where four stacked dials would give the same gold | `E23`, `E24`, `E25` | DECIDED (GR-51, Fable 2026-11-21, step R9) |
| The wage curve | `wage(L)` is what a lone mid-geared hero nets in an hour on Normal at Level L. The server computes it as a formula: the coin line times the kill reward's reference kill rate, less the supply share. A simulator is never in the path of a server price. The matrix checks the formula against played net gold within 10% | `E56`, `E17`, `E36`, `E37`, `E42` | DECIDED (GR-51, Fable 2026-11-21, step R15) |
| Repeating prices in hours | Every price that repeats (the refill, a Blessing, the yard, a scaled hour) is a number of hours of the wage curve | `E17`, `E37`, `E42` | DECIDED (GR-51, Fable 2026-11-21). The yard fee of 100 gold x skill level an hour is RULED (24-8) and is the first row on the curve |
| Sinks as a share of band gold | Tempering, Hallmarks and linings each cost a share of the band's wage, so every band has its sinks by construction. A band's standing upgrades cost 1.2 to 1.4 of the band's net gold, so players choose. The House stays typed content, judged by the same band | `E38`, `E40`, `E55`, `E43` | RULED 2026-11-18 for the size. DECIDED (GR-8, Fable 2026-11-21, reversal of the typed prices kept on 2026-11-18, Tyler may veto, step R16) for the formula, sized on an account of four heroes |
| The heal price | A store heal costs hit points times one gold-a-hit-point line, with its top near 0.60. A heal item's size is a share of the reference health of its tier, on the gear curve | `E18`, `E29`, `E30` | DECIDED (GR-52, Fable 2026-11-21, step R14), after harness fault F5 closes |
| Drops in hours | A drop row is authored as hours a piece for a hero at the ground's floor, and the chance is derived from the kill rate | `E44`, `E45`, `E46`, `E15` | DECIDED (GR-87, Fable 2026-11-21, step R18) |
| One sale formula | What a shop pays is one formula of tier that holds at tier 8 and beyond | `E26`, `E27`, `E28` | DECIDED (GR-87, Fable 2026-11-21, step R17) |
| Hero slots | No price. All four heroes from the start | none | RULED 2026-11-21 (GR-2) |

These are money surfaces. Each one is a server migration, staged, and inside the Security review of section 2.6.

#### 2.1.6 The knobs

A knob is one named multiplier on numbers the game itself reads. The set is `tools/balance-program/formulas/knobs.json` (schema `hearthrise.balance-knobs/1`). The matrix and the Balance Lab read that one file. The register tool reads every value from the tree, so a lane that moves a coefficient runs one command and nothing is typed twice.

**33 knobs the matrix can turn.** RULED 2026-11-21 that the game is globally tunable. The set itself is DECIDED (GR-85, Fable 2026-11-21, step V5 guards it).

| Group | Knobs | Formula | What they move |
|---|---|---|---|
| Hero combat | `playerAttack`, `critMult`, `weaknessDamage`, `toHitBase`, `spellRollLow` | `C-HERO-POWER`, `C-CRIT`, `C-WEAKNESS`, `C-HERO-TOHIT`, `C-SPELL-HIT` | Every hit, spell, heal and shell. The ceiling of crit builds. What matching a weapon to a monster is worth. The spread of a spell hit |
| Clocks and mana | `attackInterval` (2,000 ms, RULED 2026-10-15), `manaRegen`, `regen` | `C-CLOCKS`, `C-MANA`, `C-REGEN` | Attack speed for heroes and monsters. Casts an hour. Downtime and food bought |
| Monsters | `monsterDamage`, `monsterHp`, `monsterAccuracy`, `monsterDefense`, `monsterDefenseCut`, `heroAccuracy` | `C-MON-STATS`, `C-MON-DEF` | All incoming damage, kill time everywhere, small hits against big ones, every hero's hit chance at equal Level |
| Encounter type | `partyGroundHp`, `partyGroundBlow` | `C-MON-STATS` | What "built for a party" means |
| Tiers | `tierDanger`, `tierHp`, `tierXp`, `tierPull` | `C-TIER`, `C-PULL` | Blows, health, reward and pull on Dangerous and Deadly |
| Hero body | `heroHp`, `heroMana` | `P11` | Health, and every monster blow with it. Casts before a drink |
| Armor | `armorMitigation`, `armorCurve`, `mitigationCap` (60%, RULED 2026-10-18) | `C-ARMOR-CHAIN` | What armor is worth and how fast a set falls behind |
| Rewards | `xpPerKill`, `xpByLevel`, `coinPerKill`, `storeSupplyShare` | `E01`, `E23`, `C-CAST-POWER` | Hours a Level everywhere, gold in, store supplies against crafted ones |
| Party | `soloXp`, `partyXp` | `P21` | The party table's cells |
| Progression | `levelCurve`, `deathLoss` (6%, RULED 2026-11-21) | `P01`, `P28` | How long every Level takes, and the cost of a death |

Knobs marked RULED are measured with freely and never shipped at a new value without Tyler. Several knobs pick different numbers on one source line (the four tier knobs, the two armor knobs, the two XP knobs, the two party ground knobs). `knobs.json` marks them `sharesLineWith`, and a patch that moves two of them applies both picks to the one line.

**18 knobs that arrive with the model.** Each is created by the roadmap step named. None is playable before its step lands.

| Knob | What it sets | Step | Status |
|---|---|---|---|
| `skillPower`, `gearPower`, `basePower` | The three terms of a hero's blow, each on its own | R2 | DECIDED (GR-85, Fable 2026-11-21) |
| `powerFloor` | The one beginner's floor on the blow a cast reads | R6 | DECIDED (GR-11, Fable 2026-11-21) |
| `runeStep` | A rune tier as a base and a step, with no last tier | R6, R22 | DECIDED (GR-23, Fable 2026-11-21) |
| `gearSlope`, `gearBandStep` | The gear curve's slope and the size of a band | R10 | DECIDED (GR-4, Fable 2026-11-21, reversal, Tyler may veto) |
| `gearExchange` | What a unique may buy with its budget | R11 | DECIDED (GR-4, Fable 2026-11-21, reversal, Tyler may veto) |
| `paceContract` | What an hour pays at Level L | R12 | DECIDED (GR-5, Fable 2026-11-21) |
| `killRateRef` | The one reference kill rate | R12 | DECIDED (GR-5, Fable 2026-11-21) |
| `hoursPerLevel` | The ruled table of hours | R13 | DECIDED (GR-6, Fable 2026-11-21, reversal, Tyler may veto) |
| `skillCurve` | The combat skill curve. The matrix can move it because its heroes' skills come from the curve | V1 | Built in the instrument (see 2.4.4) |
| `coinLine` | Coin by monster Level | R9 | DECIDED (GR-51, Fable 2026-11-21) |
| `healPrice` | Gold a hit point at the store | R14 | DECIDED (GR-52, Fable 2026-11-21) |
| `wageShare` | A repeating price as hours of the wage | R15 | DECIDED (GR-51, Fable 2026-11-21) |
| `sinkShare` | A standing sink as a share of band gold | R16 | DECIDED (GR-8, Fable 2026-11-21, reversal, Tyler may veto) |
| `saleStep` | The sale formula's step a tier | R17 | DECIDED (GR-87, Fable 2026-11-21) |
| `bandHours` | Drop promises in hours | R18 | DECIDED (GR-87, Fable 2026-11-21) |

**Numbers that are never knobs.** `knobs.json` lists six families that nobody tunes, because each is the output of a formula the model supplies: per-ground XP fits, per-ground gold fits, per-ground tier rows, patches inside the stat formula, a damage scale keyed on art tier, and scaled-hunt shares. The game we are building has none of them. If one reads wrong, the fix is the knob it names. RULED 2026-11-21 (the formula brief).

### 2.2 The order of the work: 28 steps

The order is a design decision. Each step is proven before the next one leans on it. The instrument comes first, because a wrong ruler makes every later number wrong. Then the steps that move no number, because they turn typed numbers into knobs at no balance risk. Then the gear curve before the kill reward, because the reward's reference line is measured on heroes whose power keeps pace. Then the Level law, which reads the reward. Prices come last, because the wage reads the coin line and the kill rate.

No build lane starts until every decision is ruled and a build plan exists (RULED 2026-11-21). This section is the ordering that plan will follow. Measurement and tool work that changes no game number is recommended to go ahead before the plan, because the calls depend on it. That is RULED 2026-11-21: studies, calibration and audits may run before the build plan.

Server changes in any step are staged, never applied by a lane, and the client half follows the apply (CLAUDE.md section 3.3, lane C).

**Proof kinds.** Identity: the matrix diff is empty. Coefficient: the moved bands equal the patch's targets. Derivation: the typed numbers are gone and the band they held stays in tolerance on every ground. Section 2.4.2 defines them.

**Track V: make the instrument true. Tools only.**

| Step | What it builds | Proof | Needs | Status |
|---|---|---|---|---|
| V1 | The simulator's heroes carry the skills the game's own curve allows at every Level | The grid's selftest: skill at Level 400 over the curve's answer goes red | none | DECIDED (GR-85, Fable 2026-11-21). Built in the instrument and proven (fault F15) |
| V2 | One cell builder for the grid, the matrix and the solver's rates, carrying each tier's pull | The calibration cell reads within 10% of the real party on kills an hour | none | DECIDED (GR-85, Fable 2026-11-21). Built and proven (fault F14) |
| V3 | One death rule in the harness, the game's own: a death ends that hero's hunt. A failing cell reports the time to the first death | The same cell and seeds give the same deaths in every file | V2 | DECIDED (GR-85, Fable 2026-11-21). Half built. The two files agree. The instant stand-up is open (fault F4) |
| V4 | Harness seats take damage the way real seats do | The front seat's share of damage within 10 points of real play, and the party's total within 20% | V2 | DECIDED (GR-85, Fable 2026-11-21). The split is proven on the real lineup (fault F16). The total reads a third low and is open |
| V5 | The matrix diff is the gate, and the formula registers are guarded in CI | `architecture-register.mjs --check` and `--selftest`. A new accidental row, or a special rule with no recommendation, fails | the matrix `--diff` | DECIDED (GR-88, Fable 2026-11-21) |

**Track R: the model.**

| Step | What it builds | Layer | Proof | Needs | Status |
|---|---|---|---|---|---|
| R1 | A tree with no rule that is written and does nothing | code | Identity. `dead-exports` | none | DECIDED (GR-85, and GR-63, Fable 2026-11-21 for the rested bank) |
| R2 | The blow reads its named constants, and the wiki reads the same ones | formula | Identity. One test that the wiki's terms are the engine's, with a mutant | none | DECIDED (GR-85, Fable 2026-11-21) |
| R3 | One implementation of each rule: one spell roll, one rune ladder, one status row for a mark, one door for elements and phases, one death function in whole numbers in both runtimes | formula | Identity. The curves' parity test at 20 Levels | R2 | DECIDED (GR-85, Fable 2026-11-21) |
| R4 | A monster row stores its own blow as a whole number | formula, data | Identity. The combat replay | R2 | DECIDED (GR-85, Fable 2026-11-21). An engine change, so it rides the one combat batch |
| R5 | Two rulings built: the Tower with no heat patch, and the yard fee at 100 gold x skill level an hour | coefficient | The Tower's floor cells. The fee's SQL self-check | none | RULED 2026-11-20 (the Tower heat dropped in the four dives, and 24-8) |
| R6 | Spell amounts: one power floor, a strike reads weapon weakness, the rune step as a base and a step | formula, coefficient | Coefficient, on Levels 1 to 15 and on the melee ways | R2, V1 | DECIDED (GR-11, Fable 2026-11-21 for the floor, GR-12 for weakness, GR-23 for the rune step) |
| R7 | A tier's difficulty dial applied once, and one source for hero health | formula | Coefficient, on the harder tiers. Defense XP an hour | V3, V4 | DECIDED (GR-85, Fable 2026-11-21). Ships with one step of the dial if the lowest-health bands need it |
| R8 | One XP chain: the lone share as the first cell of the party table, the visible two thirds line, and the Tower and Catacombs on the same table | formula | Identity for the fold. Coefficient for the line | none | DECIDED (GR-85, Fable 2026-11-21 for the fold, MM-19 for the line, GR-36 for the Tower and Catacombs) |
| R9 | One coin line | coefficient | Identity in total: coin a hero-hour the same on every ground | none | DECIDED (GR-51, Fable 2026-11-21) |
| R10 | The gear curve in `src/data`, read by the reference hero | formula | Derivation: the pace holds from Level 110 to 5,000 | V1 | DECIDED (GR-4, Fable 2026-11-21, reversal, Tyler may veto) |
| R11 | Uniques spend a budget at exchange rates | coefficient | The armor line within 1%, where a red means re-derive one rate | R10 | DECIDED (GR-4, Fable 2026-11-21, reversal, Tyler may veto) |
| R12 | The kill reward follows the pace line, with one tier table and one pull number a tier | formula | Derivation: band P2 on every ground with no typed fit | V1 to V5, R7, R10 | DECIDED (GR-5 and GR-27, Fable 2026-11-21). The largest single step. It moves XP on every ground at once |
| R13 | The Level curve derived from the table of hours and the contract | curve | Band P1 exact at every ruled point. P11 and P12 | R12 | DECIDED (GR-6, Fable 2026-11-21, reversal, Tyler may veto). Lands at the wipe |
| R14 | Heal price and heal size on one line | coefficient | Bands G-2, G-4 and G-5 | fault F5 closed | DECIDED (GR-52, Fable 2026-11-21) |
| R15 | The wage curve, and repeating prices in hours | formula, server | Bands G-8, G-9 and S10. SQL self-checks. Security review | R9, R12 | DECIDED (GR-51, Fable 2026-11-21). Money surface |
| R16 | Standing sinks as a share of band gold | coefficient, server | Bands G-10, E3 and E4 | R10, R15 | DECIDED (GR-8, Fable 2026-11-21, reversal, Tyler may veto). Money surface |
| R17 | One sale formula | formula | Band G-1. The market floor and bench tax hold | R9 | DECIDED (GR-87, Fable 2026-11-21) |
| R18 | Drops authored in hours | data | Bands D1, D2 and E2. The Luck bar lands on this | R12 | DECIDED (GR-87, Fable 2026-11-21). Rows move in batches of 20 |
| R19 | One amount pipeline, rounded once, with a trace | formula | Coefficient, largest in the first 15 Levels. The combat replay | R3, R4 | DECIDED (GR-86 and GR-13, Fable 2026-11-21). The engine's inner loop, so it rides a combat batch |
| R20 | One modifier table | formula | Identity | R3 | DECIDED (GR-86, Fable 2026-11-21). The MMO layer's buffs and bought boosts need it (MM-24) |
| R21 | Every monster reads the formula | data | Coefficient, a ground at a time, in batches of 20 rows | R4 | DECIDED (GR-86, Fable 2026-11-21) |
| R22 | Endless modes read any Level: the Tower reads any floor from one row, and rune tiers have no last tier | formula | The Tower's cells at floors 300, 500 and 1,000 | R5, R10 | DECIDED (GR-23, Fable 2026-11-21) |
| R23 | The simulator never edits shared data. Data rows are frozen and the matrix's scratch copy is the only what-if door | tools | The matrix selftest refuses a write outside the scratch copy | V5 | DECIDED (GR-88, Fable 2026-11-21) |

**What must ship together.** These pairings bind the build plan. DECIDED as a set (GR-85, GR-5, GR-6, GR-8, Fable 2026-11-21, reversal, Tyler may veto).

| # | These ship together, or in this order | Why |
|---|---|---|
| 1 | R10 before R12 | The reward's reference line is measured on heroes whose power keeps pace |
| 2 | R12 with the one tier table and the one pull number | Each per-ground number stands in for the kill-rate term. Remove them before R12 and the first grounds overpay |
| 3 | R13 with R16, after R12 and after Deadly's dials are set | A longer band earns more gold against the same prices, so the sinks must move with the law. The Blessing ladder past the third (GR-7) ships in the release where Deadly starts to bite |
| 4 | R7 with one step of the tier dial | Armor reads the monster's own Level, so the dial may need one step to hold the ruled lowest-health bands |
| 5 | The two thirds line in the same step that makes the XP chain | MEASURED on the proposed chain with no rule: a Level 5 hero behind a Level 37 party earns about 6 times its pace. COMPUTED with the line: about 1.2 times |
| 6 | R14 after fault F5 closes | The heal price sets every harder tier's net gold, and the simulator's store bill is the number it would be judged on |
| 7 | R20 before any MMO buff, clan room or bought boost | They are rows in the one modifier table and their caps are applied there |
| 8 | Closed-form town work with the yard's rate and fee (section 2.3.4) | Closed form rewrites how a training hour is paid, so all three move in one change |

### 2.3 Server cost

#### 2.3.1 The budget

| Band | Target | Status |
|---|---|---|
| C4 | An account costs at most $0.15 a month at 1,000 active accounts (about $150 a month), and no more for each account at 10,000 | RULED 2026-11-21 |
| C2 | Database time an account-day: at most 60 seconds at 1,000 accounts and 24 at 10,000 | COMPUTED from C4 and published list prices that are ASSUMED. It is a best case, because the plan it lands on has shared cores. Whether 60 holds is PENDING 48 |
| C1 | Database time a hunted hero-hour: at most 1.25 seconds at 1,000 accounts and 0.5 at 10,000 | COMPUTED from C2 |
| C3 | Journal rows: at most one a hero an hour an activity | RULED 2026-11-20 (28-2) |
| C4b | The lines of the bill that are not the database (plan, journal disk, edge calls, Realtime, egress): at most $80 a month at 1,000 accounts and $1,015 at 10,000 | ASSUMED from list prices. To be re-read for the 12 hour day. PENDING 48. If these grow, C2 shrinks |
| C5 | 1,000 accounts of four heroes at 12 hours fit one database under 70% CPU at the busy hour. 10,000 fit a plan that exists, with room | DECIDED (GR-1, Fable 2026-11-21). PENDING 48 |
| C6 | A new system adds no statement on the settle path, no poll, and nothing that grows with players times players | RULED 2026-11-20 (the allowance of 28 section 3) |

Compute upgrades are Tyler's call for each spend. The server stays on its small plan until a busy hour reads 50%. RULED 2026-11-20 (28-3).

#### 2.3.2 The account the budget is sized on

Every account runs four heroes from its first day (RULED 2026-11-21, GR-2). Each hero hunts 12 hours a day (RULED 2026-11-21) and works in town for all 12 rested hours (RULED 2026-11-21, 50-13). One Premium covers the account (RULED 2026-11-21).

So an account-day is 48 hunted hero-hours and 48 town hero-hours, from day 1, for every account. No price slows the arrival of heroes, so nothing but the design below stands between an account and its cost. Heroes are never limited for cost reasons. RULED 2026-11-20 (28-9), and carried by the four-hero ruling.

#### 2.3.3 The system allowance

Every system in every chapter is held to these lines. A system that needs more comes back to this chapter before it is designed further. RULED 2026-11-20 (28 section 3), kept as band C6.

| Line | Allowance for a hero that uses the system |
|---|---|
| Statements on the settle path | 0 new |
| Journal rows | 1 a hero-hour an activity, never one a settle or a kill |
| Row writes | 1 a hero-hour outside the settle's own tables |
| Polls | 0. Nothing asks on a timer. A version rides the one heartbeat and a list is read when it moves |
| State sections | A new section is read when its window opens, or is versioned. It never rides every watched poll |
| Cron | No job under a minute, and none whose work grows with accounts |
| Engine time | A change to what a settle simulates states its engine time a window on the hardest party ground on Deadly. A fixture proves it before the change merges: a Deadly four, a Tower climb and a town hour (RULED 2026-11-20, 28-10) |
| Players x players | Nothing. A board, a town, a roster or a room is cut into rooms of a fixed size |

#### 2.3.4 The design that meets it

| # | Design | Status |
|---|---|---|
| 1 | **A watched hunt costs what an away hunt costs.** The edge holds the engine and the last saved state and answers the viewer from them every 16 seconds, so the fight on screen never freezes and Leave is never slower. The database saves on the flush, and at once on anything that matters: a death, a Level, a Leave, the hunt's end, a rare drop, and every money intent. Nothing a purchase, a gate or another player can read ever comes from unsaved state, and a save replays the same seeds | RULED 2026-11-20 (28-1) and 2026-11-10 (no frozen fight) |
| 2 | **The hourly journal.** One `player_ledger` row a hero an hour an activity (hunting, supplies bought, supplies used, gathering, a bench), closed at the hunt's end. Every audit and day cap that reads the journal keeps its sums | RULED 2026-11-20 (28-2) |
| 3 | **Delta envelopes.** A poll that changed nothing returns a version. A settle returns only the sections it moved. The envelope stays the truth, replaced and never merged upward (CLAUDE.md section 6) | DECIDED (GR-1, Fable 2026-11-21) |
| 4 | **Town presence by push.** A town instance pushes its moves on its own topic. A player alone in an instance is sent nothing. The account's own working heroes are drawn at their stations so the town is never empty | RULED 2026-11-20 (28-7). Drawing other accounts' heroes at work while their owner is away is DECIDED (GR-70, Fable 2026-11-21) and its cost is PENDING 48 |
| 5 | **One heartbeat.** Friends, the market and boards ride one version in the heartbeat. A board is refreshed when it is read and stale, never on a timer for nobody | RULED 2026-11-20 (28 section 3, polls 0) |
| 6 | **Town work paid in closed form.** See below | DECIDED (GR-1, Fable 2026-11-21). Training alone is RULED 2026-11-20 (28-11) |
| 7 | **How an away hunt is saved.** See below | OPEN. PENDING 48 |
| 8 | **Fewer presses.** One Start, one plan and one return card for the four heroes, a task that takes itself, and a starting loot plan. About 20 presses a day in place of 100 | DECIDED (GR-80, GR-78, Fable 2026-11-21). Owned by chapter 08. It is cost work as well as design work |
| 9 | **One Global chat.** Lines are batched on the existing connection, with a slow mode when crowded | RULED 2026-11-21 (31-1) and 2026-11-20 (28-6). A client holds a small fixed number of live topics, so every social tab (Global, clan, whispers, party) rides one multiplexed topic and a new tab never needs a new connection. That part is OPEN and PENDING 48 |
| 10 | **One world, built in rooms.** One database until about 25,000 accounts. Every shared thing is built in rooms (town instances of 60, boards a world) so a second world is a new database and never a redesign | RULED 2026-11-20 (28-5). The 25,000 is ESTIMATED for a lighter day than the ruled one and is PENDING 48 |
| 11 | **One account a player is declared, and enforced by the economy.** Day caps, contributor gates, account-bound Luck and keys, and game master action on report. The four-heroes-a-network cap stays and is not treated as the guard | RULED 2026-11-20 (28-8) |
| 12 | **Backups.** No point-in-time recovery through the wiped betas. Decided again at Early Access, when a lost day is lost Crowns that people paid for: either point-in-time recovery or a restore drill run for real each month | RULED 2026-11-19 and 2026-11-20 (28-4) |

**Town work in closed form.** A job in town (a training session, a gathering trip, a bench run) is three statements: one at the start, one when its count ends and one at stop. The server computes what the hours paid from the rows and the clock. No combat engine runs and no settle fires for a hero in town.

- One yield rule covers training, gathering and benches. It sits beside the skill grant (`P05`) and the training pay formula (`P09`), which pays a share of the skill level's cost and never one flat rate. DECIDED (GR-1 and GR-54, Fable 2026-11-21, reversal of 2026-11-14, 21-7 and A-5, Tyler may veto).
- Yields are identical in the mean to an hour settled step by step. Every roll is seeded at the start, so stopping early or late cannot pick a better outcome. DECIDED (GR-1, Fable 2026-11-21).
- The journal holds one row a hero an hour a job (band C3).
- COMPUTED for the proposed design: 48 town hero-hours cost about 0.5 database-seconds an account-day in closed form. The same hours settled by the engine would cost about 34 of the 60. So closed form is needed on every path to the budget. It does not reach the budget alone.
- Not yet proven: that a job is three statements. A town-hour fixture in `tests/per-player-cost.mjs` settles it (RULED 28-10 asks for the fixture).

**How an away hunt is saved. OPEN, PENDING 48.** This is the one line of the account-day that the ruled and recommended designs leave over budget, and it is a system question, not a tuning.

| Line of the proposed account-day, four heroes at 12 and 12 hours | Database-seconds | Label |
|---|---|---|
| Hunt saves, 48 hunted hero-hours away in a four, saved at the flush | 121 | COMPUTED |
| Tab reads, with delta envelopes | 24 | COMPUTED, on the assumption that deltas cut a read four times |
| Town work in closed form | 0.5 | COMPUTED |
| Presses, 20 a day | 1.4 | COMPUTED |
| A tab standing alone in town | 0 | RULED design |
| The MMO layer (section 2.3.5) | under 3 | ESTIMATED |
| **The proposed account-day** | **about 150** | COMPUTED. 2.5 times the budget |
| The budget at 1,000 accounts, and at 10,000 | 60, and 24 | COMPUTED from the ruled $0.15 |

How far to trust the table: it is arithmetic on production means read at 3.3 hunted hours a day and stretched to the ruled 12 and 12. It has never been measured at 12 hours.

To fit 60, the hunt's saves must come down from 121 to about 31. Two designs reach that, and study 48 chooses and sizes one:

- **A slower idle flush.** About 9 to 10 saves a hero-hour, which is a flush near every 6 minutes. Deaths, Levels, Leave, rare drops and money intents still save at once, so nothing a player can see should change. HYPOTHESIS.
- **A cheaper save at the same pace.** A save of about 20 ms. HYPOTHESIS.

Whichever is chosen, three properties are fixed design and not open. RULED (CLAUDE.md sections 1 and 6).

1. The server is the only author. A save replays the same seeds, so a crash between flushes re-plays the same fight and can never roll a better one.
2. Anything another player, a gate or a purchase can read is saved before it is read.
3. A hunt keeps running with the browser closed, and it ends for the same reasons whether watched or not.

The 10,000 account budget of 24 seconds is past both options as sized, and two thirds of that bill is not the database. It is OPEN and PENDING 48.

#### 2.3.5 The cost envelope for world bosses, clans, events and arenas

Rule 0 of the MMO layer is that every shared feature works while both players are asleep (DECIDED, MM-1, Fable 2026-11-21). That rule is also the cost rule: no part needs two people at the screen in the same minute, so no part needs a live connection between players.

The whole layer is held to **under 3 database-seconds an account-day**. ESTIMATED in study 49. PENDING 48 for the measured answer. Every part obeys band C6.

| Part | How it stays inside the allowance | Envelope | Status |
|---|---|---|---|
| World boss | A boss fight is an ordinary four in an ordinary instance. It spends stamina, so it takes the place of hunted hours and adds none. New damage folds into the one shared pool in one statement a minute while a boss stands. The pool is never written once a hit | TARGET under 0.1 database-seconds an account-day added. Check D of the validation plan measures it with 1,000 synthetic boss rooms | DECIDED (MM-2, MM-3, MM-4, Fable 2026-11-21) |
| Clans | A gift is one press and one journal row. A roster is read when its window opens and is bounded by the roster size. The board is one weekly fold. The castle's totals are a bucket a day a project, summed on read, so 10,000 gifts in a minute never queue on one row | Close to nothing | DECIDED (MM-8, MM-9, MM-10, Fable 2026-11-21, reversal of 25-4, the castle gate of 25-3 and 31-3, Tyler may veto) |
| Events | A calendar written a year ahead as data rows. An event's buff is a row in the one modifier table, read at the settle with the hero's other modifiers | 0 new statements | DECIDED (MM-11, MM-42, Fable 2026-11-21, reversal of the second half of 27-5, Tyler may veto) |
| The two arenas | A fight reads two saved setups, simulates in the edge and writes one result. Opponents are saved setups and house teams, never live players. Tickets bound the count: 5 a day for each arena, banking to 20 | ESTIMATED 0.13 to 0.2 database-seconds a fight, under 2 an account-day for both arenas | DECIDED (MM-12, MM-13, MM-15, MM-40, Fable 2026-11-21). The engine check MM-41 comes first |
| The presence strip | One small read a minute while a hunt is on screen, or none if it rides the hunt's own update | ESTIMATED about 0.5 | DECIDED (MM-20, Fable 2026-11-21) |
| Buffs, clan rooms and bought boosts | Rows in the one modifier table, summed and capped by the server at the settle | 0 new statements | DECIDED (MM-24, MM-25, MM-30, Fable 2026-11-21, with MM-30 for Tyler to confirm) |

Three rules hold every later MMO design to the envelope. RULED 2026-11-20 (28 section 3) for the first two. DECIDED (MM-1, Fable 2026-11-21) for the third.

1. Anything where N players write one row a second is refused until it is cut into rooms or folded on a timer.
2. A shared total is a fold of journal rows, never a hot row.
3. No part opens a live channel between two players' fights.

#### 2.3.6 Tables that grow

A table that only grows has a prune or a fold before it meets a crowd. RULED 2026-11-20 (28 section 6, approved as recommended).

| Table family | Rule |
|---|---|
| The journal | One row a hero an hour an activity, kept 90 days |
| Hunt sessions | Pruned, with a one-row summary a session kept for 90 days that records the tier, the gear tier worn and the hero's lowest health. Calibration needs all three (section 2.4.4) |
| Run boards (the Tower, the Catacombs, the arenas) | A hero's best and last 20. The rest fold weekly |
| Chest opens, boss chest claims | Fold past 90 days into a count a hero a tier |
| Clan and faction journals | Weekly totals past 90 days |
| Job logs and cron logs | Pruned to 7 days. No row is written when nothing was due |
| Chat | 60 days for lines, 30 for whispers |

### 2.4 The measuring instrument

#### 2.4.1 The parts

| Part | What it is | Where |
|---|---|---|
| The standards | 108 bands, each with a target, a red line, a label and an owner | `tools/balance-program/standards.mjs`, `50-standards.md` |
| The grid | Level 1 to 400 at 31 checkpoints x three gear states (low, mid, best in slot) x party x tier, at 12 hunted hours a hero a day, played on the real engine. 1,363 cells | `progression-grid.mjs`, `grid-derive.mjs` |
| The balance matrix | The grid's own cells and judge, plus Levels 1,000, 2,000 and 5,000, every weapon way, every gear step by slot class, and every ground at both ends of its band. It plays a patch on a scratch copy of the real engine and data, on the same dice before and after | `balance-matrix.mjs`, `matrix-scratch.mjs` |
| The atlas and the solver | Every source of every item and the best path through them, computed on the matrix's measured rates | `atlas/`, `paths/`, `sources.mjs` |
| The Balance Lab | The dashboard. The real engine in a browser, with every knob as a slider | `tools/balance-lab/v3` |
| The registers | The formula inventory, the knob set and their guards | `tools/balance-program/formulas/` |

The frame is RULED 2026-11-21: Level 1 to 400, three gear states, 12 hunted hours a day, with standards set first. One source of rates feeds every tool: each cell is the grid's own `buildCell`, each judge is the grid's own `judgeGrid`, and the solver reads the matrix's table.

#### 2.4.2 The matrix and its gate

**The gate.** A matrix diff is the release gate for every balance change. DECIDED (GR-88, Fable 2026-11-21). A patch names its `targets`. Anything else it moves is flagged UNINTENDED. A change with an UNINTENDED band outside seed noise goes back to its lane.

| Kind of proof | The claim | The proof |
|---|---|---|
| Identity | "This refactor changes no number" | The diff is empty: every cell is the same before and after on the same seeds. Pass or fail, with no tolerance |
| Coefficient | "This knob moves these bands and nothing else" | The moved bands equal the patch's targets |
| Derivation | "This typed number is now derived" | The typed numbers are deleted in the patch, and the band they held stays in tolerance on every ground |

**The runs.**

| Run | Cells | When |
|---|---|---|
| The subset | 207 cells: Levels 10, 30, 60, 110, 185, 400, 1,000, 2,000 and 5,000, every weapon way, three gear states, lone and four, Normal and the hardest tier, and each gear step by slot class | Every diff |
| The full matrix | Every checkpoint, way, party, tier, step and ground | Nightly |
| The death run | A rotating third of the harder-tier cells at 4 seeds of 8 hours | Nightly. The only run that can see a death rate |
| The release guard | About 120 cells at 2 seeds of 1 hour, inside 4 minutes | Every release |

Levels past 185 are PROJECTED on placeholder grounds and a projected gear line, and every reading there says so. A lone-against-four pairing in the subset is a pair of seats to play, not a band. No band sets one party size against another (RULED 2026-11-21).

**What GR-88 adds to the gate.** DECIDED (GR-88, Fable 2026-11-21).

- Band S11, XP after deaths, so a change to a death rule can never pass silently. Built in the instrument.
- Band rows on the ground axis, so a ground patch moves a band and is not read by hand.
- The four lineups that Deadly must turn red: fours without a tank or a healer (GR-3).
- A band's mode moves one way. It starts in report. It turns red in the lane that lands the change it guards, and never goes back (`50-standards.md` 5.4).
- The registers are guarded in CI (step V5).

**How a guard stays honest.** The matrix selftest proves that every knob finds its numbers, that a patch outside the scratch copy is refused and the real tree is never written, that an empty patch plays every cell exactly as the tree does, and that planted attack and monster patches are seen. Every diff prints the calibration beside its result, so a reader always sees how far the harness is from real play.

**What the matrix has already decided about proposed designs.** MEASURED on the scratch copy. Each row is evidence about a proposal, read with the trust limits of 2.4.4.

| Patch file | The proposal it plays | Result | Carried as |
|---|---|---|---|
| `combat-3` | Magic adds 0.5% max mana a level for every hero | PASS. 19 improved, 0 unintended | DECIDED (GR-22, Fable 2026-11-21) |
| `economy-1` | The store's heal prices on one line | PASS. 15 improved, 0 unintended | DECIDED (GR-52, Fable 2026-11-21) |
| `progression-3-rested-off` | No rested bank | An identity in 207 cells | DECIDED (GR-63, Fable 2026-11-21) |
| `combat-1`, `combat-4`, `combat-5` | Axes read the sword's weak side, and a physical strike reads weapon weakness | Small, at most 3.5% on one way | DECIDED (GR-12, GR-14, Fable 2026-11-21) |
| `world-2b-dangerous-five` | Dangerous brings five | Holds at the dial it was played on. Not yet played at the harder dial ruled on 2026-11-20 | DECIDED shape only (GR-27, Fable 2026-11-21) |
| `world-3-slake-signature` | A ground signature at double dose | Bites small parties first on the harder tiers | A sample for chapter 02 |
| `economy-2` | Every supply at full effect | An upper bound: a four on Deadly up to 12% faster and 30% safer | The reason tiers are sized before the idle market opens (GR-50) |
| `combat-2`, `economy-3`, `social-1`, `social-2` | A heavier crossbow line, gold in cut 15%, the party size row | Withdrawn or deferred | Not in the design |
| `progression-1-level-law` | A trial power-law curve | Withdrawn. To be re-cut on the ruled table when the kill reward lands | GR-6 |
| `progression-2-fourth-blessing` | The death share halved | Moved no band, which is how band S11 came to exist | GR-7 |
| `world-1-one-fit` | The party-ground formula removed | Refuted the cause it tested | GR-5 |

#### 2.4.3 The 108 bands, and which can be judged

COUNTED from `standards.mjs`: 108 bands in ten families.

| Family | Bands | What it holds |
|---|---|---|
| P, pace | 21 | The Level table, the gear ratios, tier advantage, the first hours |
| S, survival and death | 23 | Lowest health, death counts by tier and gear, the Blessing, XP after deaths |
| G, gold | 12 | Store bills by tier, net gold, prices in days, sinks against a band |
| E, gear | 13 | The size of a step, the cost and time to best in slot, crafting's share |
| D, drops and Luck | 3 | Very Rare hours and the Luck bar |
| R, runway | 3 | Days of content |
| C, server cost | 10 | Section 2.3.1 |
| A, atlas | 7 | Every item has a source and a use |
| T, town | 7 | What 12 rested hours make |
| B, best path | 9 | The solver's paths |

Six of the 21 pace bands set one party size against another (P6.2, P6.3, P6.4, P7.2, P7.3, P7.4). They are dropped as targets and print nothing on the gate or the dashboard. RULED 2026-11-21 (GR-67). That leaves 102 standing bands.

**How far each family can be trusted.** EVIDENCE about the instrument, from `51-baseline.md`. Every band stays in report mode until the faults in 2.4.4 close.

| What is read | State | Can it carry a decision |
|---|---|---|
| An identity proof (an empty diff) | Exact | **Yes, with no caveat** |
| A four's pace (P1, P8, P12, R2) | Judged. The harness reads about 10% slow against the one real party, at the edge of tolerance | **Yes, as a four's pace.** The pace seat's tier leans on "holds", which reads gold, so a cell at the edge of holding a tier is read with care |
| A four's gold (G-2, G-4, G-5, G-6, G-9 party rows), and tier reward (P9, P10) | Judged, and fails calibration. The simulated store bill reads 1.7 to 2.2 times real (fault F5) | Direction only |
| A four's survival (S3, S4, S5, S6 party rows) | Cannot be calibrated. Real hunts record no lowest health, and the harness total reads a third low | Direction only |
| Death counts on the harder tiers (S6) | Thin at 28 of 31 checkpoints until the nightly death run has gone round, three nights. On a failing cell the count is a retry count (fault F4) | No. Read a failing cell as "does not hold" |
| Normal's death bands (S2, S7) | Judged on a pool of 1,120 hero-hours a gear state. Resolves about 1 in 1,000 and no finer | Yes, to that resolution |
| XP after deaths (S11) | Derived from the ruled death count and the ruled cost on measured XP. Reads at every checkpoint | Yes, as a derived number |
| Every lone band | Not calibrated. No real lone hour exists on the rules being measured | No. With no solo or group targets, little rests on it |
| Low against mid gear from Level 110 to 185 | Judged, and wrong. The kit builder does not wear the unique lines there (fault F6) | No |
| Everything past Level 185 | PROJECTED | Shape only |
| Very Rare hours (D1, D2) | A stand-in until the Very Rare exists | No |
| Server cost (C1, C2, C3) | A model on production means. Reads about 110 seconds a day high on C1 and C2 and low on C3 (fault F9) | Direction only. PENDING 48 |
| 19 bands with no reader | Among them E5, P13, G-11, R1, R3, C4, C4b, C5, T3 and B7: chest pieces, events, server-wide gold, schedules and money are not cells | No. Each needs its own reader or model |

Of the 108, 89 have a reader and 19 do not. The grid reads 85, and the atlas and the solver read 23.

#### 2.4.4 Harness faults

**Proven fixed.** Each carries a check that was shown to bite by mutating the fix.

| Fault | What is now true |
|---|---|
| V1 (F15) | Heroes past Level 100 carry the skills the game's own curve allows. The lone hammer is the reference hero at every Level |
| V2 (F14) | One cell builder and one writer of the rates. The solver and the grid agree. The median cell differs by 0.6% |
| V4 (F16) | Seated as the real four sits, the harness splits damage 67 to 31 between the front seat and the healer. Real play reads 69 to 75 and 25 to 28 |
| F1, F2, F3 | Best-over-low gear is read on Normal only. Normal's death bands are judged on a pool. Gear cost is unjudged where projected gear has no price |

**Open.**

| Fault | What it does | What closes it | Status |
|---|---|---|---|
| V3 and F4 | A dead harness hero stands up at once and hunts on, so a death count on a failing cell is a retry count | The harness follows the game's own rule: a death ends that hero's hunt until the next visit, and a failing cell reports time to the first death and hours lost | DECIDED (GR-85, Fable 2026-11-21, step V3). It follows a ruling and needs no new one |
| F5 | The party's store bill reads 1.7 to 2.2 times real, because the simulated kit buys the rune tier its Magic allows and real players buy lower | A kit rule: mid gear casts one rune tier under what its Magic allows, a healer's heals use the cheapest water rune, best in slot casts the tier its Magic allows. Then one play of the grid | DECIDED (GR-52, Fable 2026-11-21): the kit rule in this row is the rule. Then the grid is played once |
| F6 | The kit builder never wears the unique lines at Levels 110 to 185 | The unique lines in `grid-kit.mjs` | Tools work |
| F7 | The Deadly death band judges a lone hero against the party's count | The S6 rows name the four as the seat they judge, which the no-targets ruling already implies | DECIDED (GR-88, Fable 2026-11-21) |
| F8 | One party band compares a party and a lone hero on different grounds | Closed by the ruling: the band is dropped (GR-67) | RULED 2026-11-21 |
| F9 | The cost bands are a model on means read before the cost work was measured | A fresh read after study 48 | PENDING 48 |
| F10 | A re-run of a cell through the tool replays the same seeds | A fresh-seed option | Tools work |
| F11 | The grid's four is the standard's four with a shield tank, and players field a hammer in front. The front seat reads 9% faster with the hammer | The real four as a second named party | Tools work |
| F12 | The solver's chance runs barely vary, so band B8 is not judged on real spread | Chance that varies in `paths/` | Tools work |
| F13 | Band D2 has no row to read from Level 125 | A row | Tools work |
| The damage total | A four's total damage taken reads a third low on the one ground that can be compared | One watched hour of a real four with the tally recording damage by source | OPEN. Needs real play |

**What the instrument needs, in order.** DECIDED (GR-85, GR-88, Fable 2026-11-21).

1. The death rule of V3.
2. The kit's rune rule of F5, then one play of the grid.
3. The damage total.
4. Lowest health, tier and gear tier in the hunt tally. This is a small server change and waits for the build plan.
5. The unique lines in the kit builder, and the real four as a named party.
6. Readers for the 19 bands that have none.
7. A second real party to calibrate against.

#### 2.4.5 The Balance Lab

The Balance Lab is the global balance dashboard. It runs the real engine in a browser, bundled from the same files the server runs, with the 33 knobs as sliders.

| # | Rule | Status |
|---|---|---|
| 1 | It opens on the proposed game: every recommended proposal is on, and each is a toggle | RULED 2026-11-21 |
| 2 | It shows the proposed game against its targets, which are the standards' bands and Tyler's rulings. It has no column for any other game | RULED 2026-11-21 (the current game is irrelevant, newest) |
| 3 | Sliders tune the proposed game. Moving a slider replays the matrix's own cells live and shows the precomputed sweep of that knob over the 207-cell subset, as each cell's change in every metric | RULED 2026-11-21 (the formula brief) |
| 4 | It stays local for now. Tyler's findings go to the dashboard lane, each with a test | RULED 2026-11-21 |
| 5 | A proposal is a patch file under `tools/balance-program/patches` (schema `hearthrise.balance-patch/1`) naming its kind and its targets. The Lab's toggles and the matrix's `--diff` read the same files | DECIDED (GR-88, Fable 2026-11-21) |
| 6 | It carries no row for one party size against another | RULED 2026-11-21 (GR-67) |
| 7 | Every panel prints the calibration and the trust state of the band it shows, taken from the table in 2.4.3, so a red that rests on a faulty reading says so | DECIDED (GR-88, Fable 2026-11-21) |
| 8 | Three sides are held equal by `tools/balance-lab/parity.mjs`: a cell in the Lab plays what the simulator's cell plays, a knob moves what the scratch copy moves, and formula rows re-written in the Lab are the generator's | Built in the instrument |
| 9 | The 18 arriving knobs appear as sliders when their roadmap step lands, and not before | DECIDED (GR-85, Fable 2026-11-21) |

Not yet true of the Lab, and the dashboard lane's work: rule 1 needs every recommended proposal cut as a patch file, and the model steps R10, R12 and R13 cannot be toggled until they exist as staged formulas the Lab can read. Until then the Lab shows the proposed game as far as the patches reach and says which proposals it cannot yet play.

### 2.5 What can be trusted from the simulator, and what must wait for real players

**The simulator can be trusted for:**

| What | How far |
|---|---|
| "This change moves no number" | Completely. An empty diff is exact |
| "This change moved only what it aimed at" | Yes, for the direction and for which bands moved. The size is as good as the band's row in 2.4.3 |
| A four's Level pace | Yes, within about 10%, read slow |
| Whether a formula holds at Level 1,000 to 5,000 | The shape, on projected content |
| A derived number such as XP after deaths | Yes, as arithmetic on a ruled count and a measured rate |
| Whether something has a source and a use | Yes. The atlas reads data |

**The simulator gives direction only for:** a four's gold, a four's survival, anything about a lone hero, death counts on the harder tiers, low gear against mid gear from Level 110 to 185, and server cost. No number in those families is offered as a result until its fault in 2.4.4 closes.

**No simulation result is ever offered as an answer to these.** They wait for real players.

- Whether it is fun.
- Whether a roll feels right: a wide swing, a spell that never misses, a heal that is always the same number.
- Whether an upgrade is felt. The band says a percent. Only a player can say they noticed.
- Whether Deadly feels like a struggle. This is direction from Tyler, never a pass or fail test (2026-11-19).
- What players really buy and wear. The simulated kit buys by rule.
- Who really hunts together, and in which seats.
- Prices between players. The market is a floor and a ceiling to every tool here, never a price.
- Where people quit.
- Whether a stranger with four heroes from the first hour stays.
- Whether players with gold want Crowns, and whether a 60% edge is felt as an edge or resented as a wall.

### 2.6 The validation plan and playtests

**Order.** DECIDED (GR-85, GR-88, MM-23, Fable 2026-11-21).

1. Make the instrument true (2.4.4).
2. The checks that need no players (table A).
3. Each roadmap step is proven by its kind of proof before the next step leans on it (2.2).
4. The Discord playtest reads behavior against targets set in advance (table B).
5. The questions only players can settle (table C).

**How much a playtest can show.** COMPUTED: with 30 accounts a measured share of 50% could be anywhere from about 32% to 68%. Seeing a 20 point difference between two groups takes about 97 accounts in each. So every read below is a behavior or a count with a target set in advance, and none is a comparison of two groups.

**Table A. Checks with no players, before any build.**

| # | Question | How | Target | Decides |
|---|---|---|---|---|
| A1 | Does the stamina day read 12.0 hunted hours on the server, free and Premium? | One free hero and one Premium hero through 48 hours on the local world with time skip | 12.0 each, with no refill bought. EVIDENCE about the instrument: the stamina-day tool reads 12.02 | Whether the clock of the whole frame is right. If the server disagrees, everything waits |
| A2 | Can heroes fight heroes in the engine? | A four against a four on the replay harness, about a day of systems work | It runs, in bounded edge time, and no one style wins every time | Whether the arenas are a large or a very large build (MM-41) |
| A3 | What does the boss pool cost? | 1,000 synthetic boss rooms | Under 0.1 database-seconds an account-day added | MM-2 |
| A4 | What must a boss chest pay? | The grid: chest value and XP for each stamina hour beside a Normal hunt at Levels 20, 60 and 110 | Neither a loss nor the best XP in the game | MM-6 |
| A5 | Does the two thirds line hold? | The grid, eight carried cells with the rule on | A carried seat earns a little more than alone, never several times more | MM-19 |
| A6 | Does the power budget hold? | The grid: a mid-geared four with no buffs against a best-in-slot four with every cap full, at Levels 20, 60 and 110 | Kill speed within 1.25 to 1.40. Level pace within 1.6 to 1.8. No cell where the buffed four holds a tier the plain four cannot enter | MM-25, MM-26. The Crowns book does not open until this is green |
| A7 | Is a town job three statements, and what do an away four, a Deadly four and a Tower climb cost? | Fixtures in `tests/per-player-cost.mjs`, read at the 12 and 12 hour day | Band C2 | GR-1. PENDING 48 |
| A8 | Does 1,000 accounts of four fit? | A synthetic load test of the proposed save design | Band C5 | GR-1. PENDING 48. Scale is proven with synthetic load, never with staged cohorts (CLAUDE.md section 3.3b) |
| A9 | One real lone hour and one real pair hour, with the kit written down | The daily play gate on the QA account | Calibration cells exist | How far any lone reading can be trusted |

**Table B. The Discord playtest.** 20 to 30 strangers, 14 days, two weekends. Clans from day 1, a world boss on both weekends, the arena in week two if check A2 passes. DECIDED (MM-23, Fable 2026-11-21).

| Read | Target | A bad sign |
|---|---|---|
| Share reaching Level 10, 16 and 32, return on day 2 and day 7, and heroes each account really runs | Read, with no comparison group | Four heroes in the first hour reads as a wall |
| Share of active accounts that hit the boss at least once | Over half on both weekends | Under a quarter, or a drop between weekends |
| Share of weekend stamina spent on the boss | 10% to 35% | Near zero or near all |
| Hours for the boss to fall | 36 to 60 | Under 12, or never |
| Accounts in a clan by day 7 | Over a third | Under a tenth |
| Clans with gifts from three or more members | Half | One giver a clan |
| Arena fights an account a day | 2 or more. Over a third of accounts with 10 or more fights | Under a tenth of accounts |
| Arena win rate of each style pairing | Every pairing between 40% and 60% | One style above 65% |
| Accounts holding at least one earned buff in a week | Over two thirds | Under a third |
| Timed cap filled by earned buffs against bought boosts | Both above a quarter | All bought, or none bought |
| Accounts that sell test Crowns for gold, and that buy them with gold | Each over a fifth of active accounts | No buyers |
| The gold price of a Crown against the reference price | Inside half to twice | Pinned at an edge of the band |
| Level pace of the top tenth of accounts against the median at the same hours | Under 1.6 | Over 1.7, which means the ceiling leaks |
| Share of hunted hours by tier, and deaths in 1,000 hours on Deadly | Read against bands S6 and the hunt report | Players avoid Deadly entirely |
| Database-seconds an account-day, read from production | Band C2 | Over 70 |
| Five players asked "is buying Crowns worth it, and is it fair?" | Most say worth it, most say fair | "Not worth it" or "pay to win" from most |

Testing the Crowns loop in a free, wiped playtest means every account receives the same weekly allowance of test Crowns by one server switch. That is a grant, so it needs Tyler's explicit yes. TYLER CONFIRMS (MM-43, a grant). Recommended yes, for the wiped Discord playtest only: the same amount for every account, one server switch that is off by default and removed before Early Access, and every grant journalled.

**Table C. Questions only players can settle.** DECIDED as the reading list (no call id, Fable 2026-11-21). Each has its measure set in advance.

| # | Question | Reads as | Fits |
|---|---|---|---|
| 1 | Does a stranger with four heroes from the start stay? | Five first sessions recorded with the player talking aloud | The first invite wave |
| 2 | Do players wear and trade a named piece, or sell it? | Worn against sold | The first invite wave |
| 3 | Does an old ground at your Level feel like content? | Share of frontier hours on scaled hunts | Accounts past Level 110, two weeks |
| 4 | Does anyone change a setup for a ground? | Ground-specific setups a hunt | Two grounds with opposite signatures |
| 5 | Is a broken cast satisfying, or invisible in an idle hunt? | Whether players keep the rule on | A hammer four for a week |
| 6 | Does the table past Level 50 feel like progress or a wall? | Sessions a day from Level 50 to 60 | The heaviest players, a week |
| 7 | Is a death read on the morning card a quit moment? | Whether the account presses anything within 48 hours. Red if returns drop by a third | Beta telemetry |
| 8 | Does the risk reading change the tier a player picks? | Share of hunted hours by tier | With the hunt report |
| 9 | Do standing orders fill when nobody visits a market? | Orders filled a day | 30 or more accounts, two weeks |
| 10 | Do players pick Luck over gold when both numbers are shown? | The loot plan's own counts | After salvage |
| 11 | Are Kindlings a build or a formality? | Under 80% of heroes on the same pick | Five sample rungs |
| 12 | Is one Rare reveal every 40 minutes a moment? | How many reveals a four looks at | Three hours on one ground |
| 13 | Does hiding systems until their Level help, or hide depth? | What a blind reader expects to unlock | A blind first hour |
| 14 | Is the bar fun to tune, or copied once and never opened? | Slots changed a hero a week | Two weeks with the bar report |
| 15 | Is a 60% paid edge felt, and is it resented? | The two heaviest testers' own words | Direction only (MM-31) |

**What would change the design.** DECIDED (MM-23, Fable 2026-11-21).

- The top accounts' pace runs past the ceiling: a cap is leaking, and the Crowns book does not open until check A6 is green.
- Nobody with gold buys Crowns: the store's lists are re-cut before launch.
- Check A2 shows heroes cannot stand on both sides of a fight without a rewrite: the arenas become their own program after the beta.
- Almost nobody spends stamina on a shared target on either weekend: the world boss moves down the order and the castle or the arena moves up.
- Band C2 reads over its red line with real accounts: no MMO part opens until the save design of 2.3.4 is proven.

### 2.7 Security scope for the money surfaces

**The gate.** One thorough adversarial Security review of every new or changed server surface is a hard gate before Steam Early Access. It is not required before the betas, which are wiped. Security holds a veto. RULED (CLAUDE.md sections 2 and 3.7, Tyler 2026-10-17 and 2026-10-25).

**The standing rules every money surface obeys.** RULED (CLAUDE.md sections 1, 2 and 6).

1. The server owns anything tradeable, rankable or contributable. It is written only by server functions with server-side catalogues, the server clock, clamps on each call and each day, and an append-only journal.
2. A client value that crosses to another player is never trusted: not gold, quantity, price, name or timestamp.
3. Player state is never fabricated. A test account becomes real by being played.
4. Per-user row security on every player table. The client's callable surface is a fixed baseline, and drift from it is detected.
5. Every Crowns surface is a money surface. RULED 2026-11-21.

**The scope of the one review.** No lane has sized this review for the MMO layer. The list below is the scope this book proposes. OPEN: the Security engineer sizes and owns it (decision book, "still waiting").

| # | Surface | What the review must prove | Design status |
|---|---|---|---|
| 1 | **The Crowns book** (Crowns sold to players for gold) | Crowns are a number on the account written only by the server. Eight clamps hold: a weekly cap on Crowns sold and bought, a price band of half to twice the 7 day median, one trade and then bound, a hold after purchase for the payment provider's chargeback window, a Level door with the same-network guard, the boost catalogue and its cap, no power rows in the store, and a journal row for every Crown bought, listed, sold, bound and spent. It has its own escrow and is reviewed as its own surface | TYLER CONFIRMS (MM-35, MM-36), building the ruled 24-5 |
| 2 | **The Crowns store and bought boosts** | A server catalogue with server prices and a server clock. One bought boost a knob at a time. A bought boost and an earned buff fill the same timed cap, applied by the server in the one modifier table. A test proves the store has no row for gear, materials, gold, Levels, skill levels, chests or rating. Luck is never sold (RULED 2026-11-20) | TYLER CONFIRMS (MM-29, MM-30) |
| 3 | **The paid ceiling** | The caps cannot be stacked past: at most 60% more Levels an hour than a plain mid-geared four, zero bands of gear ahead, and about double a week's gold. Check A6 is the proof on the grid, and it is green before the book opens | TYLER CONFIRMS (MM-31, MM-32, MM-33) |
| 4 | **The market** | Listing, buying, escrow, the fee and the house cut. Day caps on listings, spend and proceeds, sized against real item prices. Gold moved to another account through junk at the price floor is bounded. Standing buy orders and the idle refill buy only inside the same clamps. One book for each piece, so an order can name a rolled piece | RULED 2026-11-20 for the Weighhouse (24). DECIDED (GR-50, Fable 2026-11-21) for standing orders |
| 5 | **The two arenas** | A fight is simulated by the server from two saved setups. No client value sets a rating, a result, a ticket count or a reward. Tickets bank to a server cap. The even arena reads nothing bought, proven by a test that a bought boost or better gear moves no even-arena outcome. Rating cannot be traded up by feeding wins between accounts on one network. Every arena write is journalled | DECIDED (MM-12 to MM-16, MM-38 to MM-40, Fable 2026-11-21) |
| 6 | **World boss chests and boss gear** | The chest pays by the claimant's own points, counted by the server from its own rooms. A claim is idempotent. The pool cannot be moved by a client value. Boss pieces are ordinary tradeable gear and mint only from a chest | DECIDED (MM-5, MM-6, MM-27, Fable 2026-11-21) |
| 7 | **Clan gifts, the castle and room buffs** | Gifts are one-way. A member holds a room's buff by giving that week's share and never by roster size. A contributor gate that alternate accounts cannot pass with token gifts. A leader cannot empty a finished castle of its members. Work is counted by the server from hunted minutes, never sent by the client | DECIDED (MM-8, MM-9, MM-10, Fable 2026-11-21, reversal, Tyler may veto) |
| 8 | **Every repeating price and sink** | The wage curve is computed by the server. Refills, Blessings, the yard fee, scaled hours, Tempering, Hallmarks, linings and curing slots are each a server function with a server price | DECIDED (GR-51, GR-8, Fable 2026-11-21, reversal, Tyler may veto) |
| 9 | **The save design** | Nothing a purchase, a gate or another player can read comes from unsaved state. A save replays the same seeds. A player cannot buy a Blessing or swap a bar only when the seeds show a death is coming | RULED design condition (28-1). The seed horizon fix is staged |
| 10 | **Mint paths** | No item or gold can be created by salvage, good batch, commissions, a cancelled cure or a mount. A no-mint guard exists before salvage and commissions do | DECIDED (GR-46, Fable 2026-11-21 for salvage, GR-44 for commissions). Owned by chapter 03 |
| 11 | **Chest opens and keys** | A hero that never climbed cannot open keys passed through Storage | RULED direction 2026-11-20 (22-5) |
| 12 | **Chat** | A new-account rate and report from the menu, before chat meets gold sellers | OPEN. Owned by chapter 06 |
| 13 | **Game master tools** | The walled account cannot trade, list or rank. Its log is immutable | RULED 2026-11-05 |
| 14 | **Account deletion** | A deleted hero leaves account-owned rows with the account. A held name, a clan it leads and a market escrow are each resolved | Staged. RULED to apply before Early Access (28) |
| 15 | **The play cap** | Four heroes an account and four a hashed network. One account a player is declared and enforced by the economy clamps above, so every surface in this table is reviewed assuming a player can run a second account | RULED 2026-11-20 (28-8) |

Hired and on-call heroes are not in the game (DECIDED, MM-18, Fable 2026-11-21, reversal of 25-1 and the on-call board of 25-3, Tyler may veto), so no hero-lending trade surface is in scope. PvP on the hunting grounds is never built (DECIDED, MM-17, Fable 2026-11-21), so no surface exists there.

**Order inside the review.** DECIDED (no call id, Fable 2026-11-21, and the security engineer may reorder it): surfaces 1 to 3 are reviewed as one bundle, because the ceiling is only as strong as its weakest clamp. Surface 4 comes before them, because the Crowns book reuses the market's caps. No Crowns surface is armed for anyone until its Security GO and until check A6 is green.

---

## 3. How it connects

| This chapter | Reads from | Feeds |
|---|---|---|
| The combat framework (2.1.3) | Chapter 01 (combat) for every size: spell shares, the tier dials, the pull number, weapon weakness | Chapter 01 (combat) with the knob set and the proof each change must pass |
| The gear curve and the knobs it creates | Chapter 03 (items) for the band's size, exchange rates, uniques, jewelry's share and the itemization plan | Chapter 03 (items) with the reference hero, and chapter 02 with a line that new regions are drawn on |
| The Level law and the kill reward | Chapter 05 (progression) for the table of hours, the death rules and the Blessing ladder | Chapter 05 (progression) and chapter 02 with one tier table and one derived number a ground |
| The wage curve, the coin line and sinks | Chapter 04 (economy and Crowns) for every price in hours, the sink shares and the early sinks that take the place of the slot ladder | Chapter 04 (economy and Crowns) with a wage the server can compute, and chapter 07 with the curve its rungs are priced on |
| The server allowance (2.3.3) | Every chapter. Each system states its statements, rows, polls and engine time | Every chapter. A system over the allowance comes back here first |
| Closed-form town work | Chapter 07 (home and town) for the yard, gathering, benches and curing. Chapter 08 (player experience) for the job queue | Chapter 07 (home and town) with one yield rule and the three-statement job |
| The MMO cost envelope (2.3.5) | Chapter 06 (the MMO layer) for bosses, clans, events and arenas | That chapter with under 3 database-seconds an account-day and the three rules of 2.3.5 |
| The matrix and the bands | Every chapter's targets, as bands in `standards.mjs` | Every chapter's section 6, which names the bands and checks that judge it |
| The Balance Lab | Every chapter's recommended proposals, as patch files | Tyler, as the proposed game against its targets |
| The Security scope (2.7) | Chapter 04 (economy and Crowns) for the market. Chapter 06 (the MMO layer) for Crowns, arenas, bosses and clans | The build plan, as a hard gate before Early Access |
| Chapter 08 (player experience) | The hunt report reads counters the settle already writes. The Path's population gate keeps empty rooms from polling | The risk reading needs lowest health in the hunt tally, which calibration also needs (2.4.4) |

---

## 4. The calls in this chapter, as decided

In decision-book order. Each line is the call and the decision this chapter takes.

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-85 | The formula steps that move no number, and a tier's dial applied once | Go: V1 to V5, R1 to R5, R7, the floor half of R6 and the fold of R8 | DECIDED (Fable 2026-11-21) |
| GR-88 | The balance matrix as the gate | Yes, with band S11, ground-axis band rows, the four Deadly lineups, and guarded registers | DECIDED (Fable 2026-11-21) |
| GR-1 | How the server reaches its budget | Rule closed-form town work for training, gathering and benches. Hold the away hunt's save until study 48 lands | DECIDED (Fable 2026-11-21) |
| MM-1 | Rule 0: every shared feature works while both players are asleep | Yes. It is the cost rule of the MMO layer as well as its design rule | DECIDED (Fable 2026-11-21) |
| GR-4 | The gear curve | Linear in Level. Past tier 7 a band is a fixed step that opens at about +17% (110, 129, 151, 176, 206, 241, 282, 330, 386). Uniques are a spend of their band. The two Luck numbers are keyed by Level | DECIDED (reversal, Tyler may veto). Changes two bands a region of 2026-11-18 and the Luck step of 2026-11-20 (Fable 2026-11-21) |
| GR-5 | What a kill pays | The pace line with one kill-rate reference and one tier table | DECIDED (Fable 2026-11-21) |
| GR-6 | The Level table | From Level 50 the table of hours is the law. The four runs 106 hours ahead, so Level 100 lands at 494 hours and Level 400 on day 373 | DECIDED (reversal, Tyler may veto). Changes the hours of the 2026-10-25 table and "Level 400 is day 382" (Fable 2026-11-21) |
| GR-8 | Sinks as a share of band gold | Tempering, Hallmarks and linings cost a share of a band's gold, 1.2 to 1.4 of what the band earns. The slot gold follows the order of CE-4 first, then the castle | DECIDED (reversal, Tyler may veto). Changes the typed prices kept on 2026-11-18 (Fable 2026-11-21) |
| GR-11, GR-12, GR-13 | The spell floor, how spells read the stats, one roll rule | One floor. Strikes read weapon weakness, spells never miss or crit. One roll with a spread for each kind | DECIDED (Fable 2026-11-21) |
| GR-23 | Endless ladders | Rune tiers past skill 60 every 15 skill levels, and the Tower reads any floor from one row | DECIDED (Fable 2026-11-21) |
| GR-25 | Nine special rules with no ruling on record | Approve as the formula audit recommends, each by name | DECIDED (Fable 2026-11-21) |
| GR-36 | The Tower and Catacombs party table | They take the one party table | DECIDED (Fable 2026-11-21) |
| GR-51, GR-52 | The wage curve and the store's healing | Prices in hours of a wage the server computes. One gold-a-hit-point line, after fault F5 closes. F5's kit rule is decided in GR-52: one rune tier under what Magic allows for mid gear, and the cheapest water rune for a healer | DECIDED (Fable 2026-11-21) |
| GR-63 | Dead ladders | Delete the rested bank and the two old kill ladders | DECIDED (Fable 2026-11-21) |
| GR-70 | The town draws heroes at work | Yes, once study 48 sizes it | DECIDED (Fable 2026-11-21) |
| GR-86 | The later engine steps | One amount pipeline with a trace, one modifier table, every monster on the formula | DECIDED (Fable 2026-11-21) |
| GR-87 | Drops and sales | Drops authored in hours. One sale formula | DECIDED (Fable 2026-11-21) |
| MM-19 | Mixed Levels in one fight | The visible two thirds line, in the same step as the XP chain | DECIDED (reversal, Tyler may veto). Changes the party XP rulings of 2026-11-08 (Fable 2026-11-21) |
| MM-23 | The order for planning | Approve, with the instrument first | DECIDED (Fable 2026-11-21) |
| MM-24, MM-25, MM-30 | Buffs as rows with caps | One modifier table. Protection is written on the Defense rating and the timed drop row is material find. A bought boost and an earned buff fill the same cap | MM-24 and MM-25 are DECIDED (Fable 2026-11-21). MM-30 is TYLER CONFIRMS |
| MM-31 to MM-36 | The paid ceiling and the eight clamps | One ceiling as a reading held by a test (1.65 with every cap full, about 1.22 from paying alone), and the eight clamps, all inside the Security review, with check A6 green before the book opens | TYLER CONFIRMS, each with one recommendation in `00-the-game.md` |
| MM-41 | One engine check for both arenas | Measure heroes on both sides of a fight before either arena is planned | DECIDED (Fable 2026-11-21) |
| MM-43 | Test Crowns in the playtest | No recommendation. It is a grant and needs Tyler's explicit yes | TYLER CONFIRMS (grant) |

---

## 5. Still missing

| # | What is missing | Who decides, and what decides it |
|---|---|---|
| 1 | **Study 48 itself.** How an away hunt is saved. Whether 60 database-seconds holds on shared cores. The bill's lines that are not the database, re-read for the 12 hour day. What a town that draws working heroes costs. A measured envelope for bosses, clans, events and arenas | The reliability engineer, then Tyler. Until it lands, section 2.3 cannot say the game fits $0.15 |
| 2 | **The 10,000 account budget.** 24 database-seconds an account-day is past every design sized so far, and two thirds of that bill is not the database | Study 48 |
| 3 | **Whether measurement and tool work may go ahead before the build plan.** The gear band, the kill reward and the harder tiers' pull each need a measurement, and all of them need the instrument made true | Closed. RULED 2026-11-21: studies, calibration and audits may run |
| 4 | **The Security review's size and owner for the MMO layer.** Section 2.7 is a proposed scope, not a sized review | The Security engineer |
| 5 | **The kit's rune rule (F5).** Nobody has ruled which rune tier a mid-geared hero is assumed to buy | Closed. GR-52: mid gear casts one rune tier under what its Magic allows, a healer's heals use the cheapest water rune, and best gear casts the tier its Magic allows |
| 6 | **A second calibration party.** Every party band rests on one real four | Real play. The playtest supplies it |
| 7 | **Readers for 19 bands.** Events, server-wide gold, schedules, money and chest pieces are not cells | The matrix lane, each with its own model |
| 8 | **Bands for the MMO layer.** The standards hold no band for the buff caps, the power budget, the paid ceiling, arena win rates or the Crowns price. Checks A3 to A6 and table B name targets, and none is a band in `standards.mjs` yet | The matrix lane with the MMO layer study, after MM-25, MM-26 and MM-31 are ruled |
| 9 | **A band for the early economy of four heroes.** No band reads what an account of four earns and spends in its first week | Chapter 04 (economy and Crowns), then a band here |
| 10 | **The Lab's proposal set.** Not every recommended proposal exists as a patch file, and the model steps cannot be toggled until they are staged | The dashboard lane |
| 11 | **The hunt tally's three fields.** Lowest health, tier and gear tier worn. Survival cannot be calibrated without the first | Systems, in the build plan |
| 12 | **Test Crowns in the playtest (MM-43).** An equal weekly grant to every account is still a grant. Without it the Crowns rows of table B cannot be read before launch | TYLER CONFIRMS (MM-43, a grant), recommended yes for the wiped Discord playtest only |
| 13 | **Whether a watched four of four people on four accounts changes the save design.** Study 49 says a party is an account's own heroes, so the case may not exist | Study 48. MM-18 is decided, so a party is an account's own heroes and the case does not exist unless Tyler vetoes that reversal |
| 14 | **Content authoring pace against the runway, timed.** Every ground, band, boss and recipe family ends its lane with its working hours (RULED 28-12). No lane has yet said who draws regions or how fast | The art and asset directors, then Tyler |
| 15 | **The build plan's unit.** The plan of record is written in lanes and waves for a beta. It is re-issued once the calls are ruled, in the order of section 2.2 | The Coordinator, after the rulings |

---

## 6. How we will know it works

**The formula architecture.**

- `architecture-register.mjs --check` and `--selftest` are green in CI. A new accidental row fails. A special rule with no recommendation fails.
- Every identity step (R1, R2, R3, R4, R20, and the fold of R8) shows an empty diff on the subset.
- The wiki's terms are the engine's, proven by one test with a mutant.
- The gear curve holds band P2 from Level 110 to 5,000 with no other change, and band E1 reads a step at its ruled size.
- Band P2 holds on every ground with no typed fit after R12.
- Band P1 is exact at every ruled point after R13.
- The wage formula reads within 10% of played net gold.

**Server cost.**

- Bands C1, C2 and C3 read green from fixtures at the 12 and 12 hour day: an away four, a Deadly four, a Tower climb and a town hour.
- A synthetic load of 1,000 accounts of four holds band C5.
- Check A3 reads under 0.1 for the boss pool, and the whole MMO layer reads under 3.
- In the playtest, database-seconds an account-day read from production stay under band C2's red line of 70.
- Band C4 is read from the real bill each month.

**The instrument.**

- The calibration table: a four's kills an hour within 10% of real, the front seat's share within 10 points, the party's damage total within 20%, and net gold within tolerance once F5 closes.
- The same cell and seeds give the same deaths in every file.
- The matrix selftest and the Lab's parity check are green.
- The count of bands with no reader falls from 19 to 0.
- A band moves from report to red only in the lane that lands the change it guards.

**Players.** Tables B and C of section 2.6, each read against the target written beside it.

**Security.** A GO on every surface of section 2.7 with its changes landed, the full mutation sweep green on the launch build with no waivers, and check A6 green before any Crowns surface is armed.

---

## 7. Superseded

| Dropped | Why |
|---|---|
| The server budget of $0.50 an account-month at 1,000 accounts and $0.30 at 10,000 (`50-standards.md` call 10) | Tyler re-ruled it to $0.15 the same day. Newest wins |
| Hero slot prices as the server's brake on cost (`28-platform.md` section 3 and 28-9) | All four heroes from the start, RULED 2026-11-21. The budget is sized on four heroes from day 1 |
| Cost sized on an account that hunts 3.3 hours a day, and every table built on it: the reference players, "1,000 accounts fit", the 19 and 24 cent rows, the plan sizes (`28-platform.md`) | Every player hunts 12 hours a hero a day and works 12, RULED 2026-11-21. Those rows are evidence about rates only |
| "Four changes take an account to about 60 database-seconds" (`28-platform.md`) | COMPUTED at the ruled day by `59-review-features.md`: the same changes and closed-form town work leave about 147. The newer computed result on the ruled frame wins |
| "The budget cannot be met without closed form", read as closed form being enough (`59` phase A) | 59's own phase B corrected it: necessary and not sufficient |
| 60 database-seconds presented as a ruled number (`60-game-review.md` first issue) | The cold audit (61, M3): Tyler ruled $0.15. The 60 is COMPUTED from assumed list prices and is a best case |
| A 6 minute flush as part of the cost call (`60` first issue, G-1) | The cold audit split it. Closed form is recommended now. The flush is a HYPOTHESIS with a second option and waits on study 48 |
| Global chat in rooms of 250 (`28-platform.md` section 5 and 28-6) | Tyler ruled one Global chat with batched lines and a slow mode (2026-11-20, 2026-11-21) |
| A gear band of about +6.5%, about 7 Levels apart at Level 110 (`44` section 5.2) | The review and the itemization fit (60 GR-4, 47) size a band at a tier's worth, about +24%. The adversarial check then opened the knob at about +17%, the largest step that keeps a band edge in every region. The later synthesis and the itemization fit win. The architecture is the same: a percent step on a linear curve |
| The Level law as one fitted power law (`42`, and matrix patch `progression-1`) | Withdrawn. The ruled table of hours is the law (44, 56, GR-6) |
| The hidden Level cut removed with nothing in its place (`44` step R8) | MEASURED: with no rule a carried hero earns about 6 times its pace. The visible two thirds line replaces it in the same step (MM-19) |
| Party size bands P6.2 to P7.4, lone-against-four judgments, and matrix patches `social-1` and `social-2` | No solo or group balance targets, RULED 2026-11-21 |
| A comparison column for the existing game in the Balance Lab, and every before-and-after reading against that game | The current game is irrelevant, RULED 2026-11-21 (the newer of two rulings that morning). The Lab compares the proposed game with its targets |
| The inventory's counts of what exists in the existing game, the list of worst violations and the list of Levels where its formulas break (`44` sections 1 and 2.2) | This book describes the game we are building. The model keeps the 107 formulas and the four classes |
| "11 steps fit the 0.2.144 beta" as a release split (`44` section 7) | Decisions first and no build lanes until a build plan exists, RULED 2026-11-21. The order of the steps stands. The release each lands in is the build plan's call |
| Harness faults V1, V2 and V4 listed as open (`44` section 6.1), and "the grid's four kills 558 an hour" | Fixed and proven in `51-baseline.md`. The 558 was the solver's table, not the grid |
| Hired and on-call heroes as a Security surface (`28` section 7, `60` section 10.4) | Not in the game (MM-18, DECIDED, Fable 2026-11-21, reversal, Tyler may veto) |
| Honors-only, no-power rewards for the MMO layer, and a single normalized arena (`49` first issue) | Rewards are buffs and gear, and there are two arenas, RULED 2026-11-21 |
| "No limit on how much sooner" for bought gold with no stated ceiling (`50` call 11) | Crowns give real advantages that are not broken, RULED 2026-11-21. The ceiling of MM-31 to MM-33 states it |
| Staged cohorts and soaks as a way to open a channel | Arm for everyone after the Security GO and prove scale with synthetic load (CLAUDE.md section 3.3b) |

---

## 8. Source map

| Source | Sections this chapter replaces |
|---|---|
| `40-formula-brief.md` | The architecture's rules (carried as 2.1.1). The brief itself stays the verbatim record |
| `44-formula-architecture.md` | Section 1 (summary), 2 (the deduped inventory, as counts), 3.2 (the hub formulas), 5 (the unified model and the knobs), 6 (the validation plan) and 7 (the roadmap). Section 8's calls are carried by their GR ids |
| `41`, `42`, `43` (the three category audits) | Taken through 44, which is their dedupe |
| `28-platform.md` | The budget lines of section 3, the dark systems of section 5, the growing tables of section 6, the exploit surface of section 7 and the rulings of section 11. Its cost tables are superseded (section 7 above) |
| `59-review-features.md` | Section 0.2 (the account-day against the budget) and trace 4 (town work in closed form and the price of a press) |
| `48-platform-cost.md` | Nothing yet. PENDING. When it lands it replaces the OPEN and PENDING lines of section 2.3 |
| `50-standards.md` | Section 2.8 (server cost bands), section 5 (the harness spec), and the frame of sections 1 and 11 as it bears on measurement |
| `51-baseline.md` | All of it, as 2.4.3, 2.4.4 and 2.5 |
| `60-game-review.md` | Sections 4.5 (server cost), 5 (systems interaction, as it bears on order), 7 (the validation plan), 8.10 (architecture calls) and the platform lines of 10 |
| `61-review-audit.md` | Its corrections M3 and G-1, applied |
| `62-decision-book.json` and `.md` | The ruled list, the first-decision order and the waiting list, as they bear on this chapter |
| `49-mmo-layer.md` | The server cost lines of sections 5.1 to 5.7 and 6.1, the money-surface rules and clamps of 5.9, and section 7 (playtests and measurements) |
| `tools/balance-lab/v3`, `tools/balance-program/formulas/knobs.json`, `tools/balance-program/patches` | The Lab's rules (2.4.5), the knob set (2.1.6) and the patch table (2.4.2) |
