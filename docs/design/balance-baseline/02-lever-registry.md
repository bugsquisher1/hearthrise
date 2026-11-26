# Balance baseline 02: the Balance Lever Registry

Lane BL-2 (systems engineer, 2026-11-21). Deliverable 2 of Tyler's directive of 2026-11-21, "Establish a Global Balance Baseline Before the Overhaul", Phase 2. BL-1 builds the baseline snapshot and the regression harness, BL-3 the target spec, and a later lane runs sensitivity on the levers listed here. **No gameplay number was changed.**

**The baseline.** Every value here was read from the overhaul's starting build: `set/v0.2.144` at `861ae52e3`, pushed as `baseline/overhaul-start` (Tyler's correction of 2026-11-21, not the live game). The registry stamps the commit it read and says whether the rule code still matches it.

**Where it lives.**

- `tools/balance-program/levers.json` is the machine-readable registry: every lever with its eight fields, the not-a-lever reasons and the pins the check holds. It is generated, never edited by hand.
- `tools/balance-program/levers/*.mjs` hold the rows a person writes: `combat.mjs` (Tyler's categories 1 to 11), `world.mjs` (12 to 14 and 19), `gear-economy.mjs` (15 to 18 and 20) and `not-levers.mjs`.
- `tools/balance-program/levers.mjs` reads those rows and the tree. `--write` rewrites the JSON and the tables on this page. `--check` fails a structural problem. `--selftest` proves the check bites.
- `tools/balance-program/census.mjs` gained `bindingsOf`, the unit the check counts.

Labels. CONFIRMED means read in the code at the baseline. MEASURED means a played run on the real engine, named. COMPUTED means arithmetic on named inputs. HYPOTHESIS means not yet checked. JUDGED marks a call of mine. A number in a generated table is counted by the tool, not typed.

---

## 1. What the registry holds

<!-- GENERATED:COUNTS (tools/balance-program/levers.mjs --write) -->
| Category | Levers | Global | Archetype | Content | Exception | On a knob | Not playable | A test asserts it |
|---|---|---|---|---|---|---|---|---|
| Base damage coefficients | 14 | 13 | 1 | 0 | 0 | 4 | 9 | 5 |
| Skill scaling | 11 | 8 | 0 | 3 | 0 | 1 | 4 | 7 |
| Level scaling | 9 | 7 | 0 | 0 | 2 | 4 | 3 | 6 |
| Weapon power and attack frequency | 6 | 2 | 3 | 1 | 0 | 1 | 0 | 2 |
| Spell coefficients, costs, cooldowns and areas | 15 | 6 | 1 | 7 | 1 | 1 | 3 | 5 |
| Healing and shielding | 2 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| Armor and mitigation | 6 | 3 | 2 | 0 | 1 | 3 | 1 | 2 |
| Resistances | 5 | 2 | 0 | 2 | 1 | 0 | 2 | 2 |
| Critical chance and damage | 3 | 1 | 1 | 0 | 1 | 1 | 0 | 0 |
| Life and mana leech | 2 | 0 | 0 | 2 | 0 | 0 | 1 | 0 |
| Regeneration | 6 | 5 | 0 | 0 | 1 | 2 | 4 | 2 |
| Monster HP, damage, armor, resistances and behavior | 33 | 13 | 8 | 4 | 8 | 5 | 18 | 22 |
| Spawn pacing and encounter composition | 10 | 7 | 0 | 3 | 0 | 0 | 6 | 5 |
| Monster XP and loot values | 18 | 9 | 0 | 2 | 7 | 2 | 8 | 10 |
| Equipment stats and progression | 24 | 10 | 4 | 10 | 0 | 0 | 16 | 18 |
| Imbuement effects | 2 | 1 | 0 | 1 | 0 | 0 | 2 | 1 |
| Consumable costs and effectiveness | 9 | 4 | 3 | 2 | 0 | 1 | 1 | 2 |
| Party bonuses and interactions | 6 | 1 | 3 | 0 | 2 | 2 | 2 | 3 |
| Rare-drop probabilities | 8 | 4 | 0 | 3 | 1 | 0 | 6 | 5 |
| Economy sources and sinks | 44 | 31 | 2 | 11 | 0 | 0 | 39 | 32 |
| **All** | **233** | 127 | 28 | 52 | 26 | 27 | 125 | 129 |
<!-- END GENERATED:COUNTS -->

<!-- GENERATED:CENSUS (tools/balance-program/levers.mjs --write) -->
| | Count |
|---|---|
| Top-level bindings in the rule code that hold a typed number | 757 (in 263 files, 17468 typed numbers) |
| Claimed by a lever | 323 |
| Claimed by a not-a-lever reason | 434 |
| Unclaimed | 0 |
| Exceptions, intentional and accidental | 17 and 9 |
| Values read at | 861ae52e3 (origin/baseline/overhaul-start). Rule code and migrations the same as the baseline: NO |
<!-- END GENERATED:CENSUS -->

**Every typed number in the rule code is accounted for.** The census walks every top-level binding of `src/core`, `src/data` and `supabase/functions/hr-accrue`, functions and values alike. Each one that holds a typed number is claimed by a lever (the binding a lever's line sits in, or a table that holds a lever's rows) or by a written reason it is not a lever (a target, a validator's bounds, art, words, plumbing). None is unclaimed.

**One lever per mechanism, not one per row.** A content attribute is one lever with its rows counted by `--write` from the game's own modules. Examples, all COMPUTED at the baseline: `mon.rows` is 190 monster rows, 72 on a formula roster and 118 typed by hand. `rare.band-rows` is 320 Scarce, Rare, Key and Trophy drop rows with chances from 0.0005 to 0.05. `spell.shares` is 13 damaging rows of 23 spells, 390 to 1,400 permille of the blow.

**What is not a lever.** Targets are what a lever is judged against, so they belong to BL-3: `BALANCE_SHEET`, `LEVEL_PACE` (the pace contract), `BAND_TARGETS` and the measured party lines the Hunts window prints. Validators' bounds are written into the lever's valid range instead. The reason for each is in `not-levers.mjs`.

## 2. How to read a row

Each lever in `levers.json` carries Tyler's seven fields and an eighth.

1. **Where it lives.** `sites`: file, line, the source line as written and the binding. Resolved from an exact anchor text at `--write`, so the line is never typed by hand.
2. **Value or definition.** `definition` in words. The source line in `sites` is the value as written today. For a content lever, `rows.today` holds the counts and the range.
3. **Valid range and constraints.** `range`: validators, caps, server twins and Tyler's rulings that fix a number.
4. **Systems and outcomes.** `touches` in words. `outcomes` are the balance matrix's METRIC ids the lever moves (JUDGED from the formula). `formulas` are its ids in `formulas-architecture.json`, and `reach` counts the formulas those feed directly and the whole downstream (COMPUTED).
5. **Class.** `global`, `archetype` or `content`, or an exception: `exception-intentional` (44's class 3) or `exception-accidental` (44's class 4, a number that patches another number).
6. **Data, code or SQL.** `change`, from where the lever lives.
7. **Tested.** `tests.asserts`: a test whose subject is the lever, checked by the tool to read the lever's name. `tests.mentions`: every test file that names its binding. `verdict` says asserted, mentioned only or none. A mention is not a proof that the test goes red when the value moves. That is a mutation proof, and the sensitivity lane's.
8. **How the simulator perturbs it.** `perturb.kind` is one of four.
   - `knob`: an existing knob in `formulas/knobs.json`. A knob multiplies on top of the tree's value. `also` names the other knobs on the same lever. Every one of the 35 live knobs maps to a lever, and the check fails if one does not.
   - `patch`: an `edits` text that `balance-matrix.mjs --diff` can apply. `perturb.from` gives the exact line, unique in its file and inside a planted tree. A content lever is patched on a row's own line. `existingPatches` names the patch files that already move it.
   - `variant`: an existing matrix cell variant (`binds`, `buff`, the bar's thresholds).
   - `not-playable`: a coverage gap, with its reason in the gap list (section 4).

## 3. Redundant, ineffective and contradictory parameters

Each row below is a flag on a lever, with its evidence label. The sources are the formula architecture (`docs/design/balance-program/44-formula-architecture.md`, rows by id), chapter 12 (`docs/design/overhaul/12-balance-pass.md`) and what this lane read.

**The four known results Tyler's brief names.**

- **Armor did nothing past Level 30 at x1.** On `armor.curve` and `armor.cap`. A full mid set holds more than 2.4 times the armor the 60% cap can use, so an armor step moves damage taken by -0.8% to +1% past Level 45 (MEASURED, chapter 12 section 3.6). The knob `armorCurve` multiplies on top of the tree's k. A lane that also moves k in `core-model.js` and then plays `bp-armor-curve-240.json` applies the step twice.
- **The built protection buff does nothing at the armor cap.** On `cons.food-buffs`. The `defense` buff writes to the same capped cut, median 0.0% (MEASURED, chapter 12 section 3.8). The Tempering Armor track works inside the same cap (`gear.temper-effect`, COMPUTED).
- **Unlock damage is invisible on Normal (the D-9 cell).** Focus fire, +6% to a shared target, was near invisible to a four on Normal and felt only on a tier's edge (MEASURED, `patches/tal-focus-fire.json`, merge 642f0988c). Talents are not in the rule code at the baseline, so this is a finding on a planned lever, not a row. The designer retired Focus fire in D-9 (861ae52e3). The same shape shows on built levers: a +15% damage buff paid a median +2% pace (`cons.food-buffs`), and a tier is a cliff (`mon.tier-danger`).
- **GR-30's hall number as a cliff.** On `mon.boss-rooms`. One number on a boss's health against a fixed 10-minute clock means a hall is won or lost at a damage threshold (COMPUTED from the rule). The hall number is not built and no run plays a hall, so its size is a HYPOTHESIS until the hall grader plays Levels 25, 52 and 75.

<!-- GENERATED:FLAGS (tools/balance-program/levers.mjs --write) -->
| Kind | Lever | What | Evidence |
|---|---|---|---|
| redundant | `blow.skill-term` Skill term of the largest blow | The same three numbers are named in COMBAT_BALANCE (strengthLevelScale, strengthBonusScale, playerBaseMaxHit) and only the wiki reads those. Move one and the wiki prints a formula the game does not run | 44 X-POWER-LITERALS, CONFIRMED |
| redundant | `blow.named-twins` The named blow constants the engine does not read | A second copy of blow.skill-term and blow.gear-term | 44 X-POWER-LITERALS, CONFIRMED |
| redundant | `damage.combined-cap-unused` The exported second damage ceiling | A second ceiling beside MAX_TOTAL_DAMAGE_MULT 1.90. The two disagree and neither binds | 44 X-DORMANT-FACTORS, CONFIRMED |
| redundant | `skill.magic-xp` Magic XP a mana spent | Two stacked constants: 1.5 for every cast times the row's own multiplier (1.6 on 30 rows, 0.25 on 16, 0 on 2), so no row uses 1.0 and a caster's real rate is 2.4 | 44 P-X48, CONFIRMED |
| redundant | `skill.town-xp-dial` Global town-skill XP dial | Inner Flame's recipe XP is authored at 40 so that 40 x 0.39 lands 15.6: two numbers to say one | 44 P-X24, CONFIRMED |
| redundant | `level.curve` Level XP curve | Brackets at 10, 15 and 16 exist only to give back XP taken from Levels 7 to 9 with the total at Level 21 held (a one-Level bracket at 15 with a rise of 74,323 beside 4,630 and 300) | 44 P-X02, CONFIRMED |
| redundant | `spell.floor` Beginner's floor on a cast | A second number on every row for one rule. The clean form is one floor on power | 44 X-SPELL-FLOOR, CONFIRMED |
| redundant | `spell.mana-cost` Spell mana costs | Mana a version is a hand-written x1.2 ladder typed on 16 spell rows | 44 S-X03, HYPOTHESIS (not read row by row) |
| redundant | `spell.roll-low` Spell roll floor | The same rule written twice with two constants (hitLowPm 500 here, SPELL_ROLL.lowPm 500 for monster spells) | 44 X-ROLL-TWINS, CONFIRMED |
| redundant | `spell.rune-step` Rune tier step | The same ladder typed again on Bleed (tierPermille 1000..1400) | 44 X-TIER-LADDER-TWINS, CONFIRMED |
| redundant | `spell.mark` Hunter's Mark and Sickness (a target takes more) | Two mechanisms for one effect: a unit field and a status row, added | 44 X-MARK-TWO-WAYS, CONFIRMED |
| redundant | `crit.set-bonus` Armor set crit bonus | Looks like a leftover. If wanted it is a data row, not a function | 44 X-SET-CRIT, HYPOTHESIS |
| redundant | `mon.blow-line` Monster blow line and the gentle cap | gentleCap 0.11 sits on top of the ramp's low end 0.132: two numbers for the gentle blow | 44 X-GENTLE-CAP, HYPOTHESIS until the grid shows the ramp alone holds the fresh hero |
| redundant | `mon.roles` Monster roles | gentleHp on heavy and elite (1.0 and 1.2 where the role says 1.2 and 1.6): an XP and coin fix written into combat stats | 44 X-GENTLE-HP, HYPOTHESIS |
| redundant | `mon.party-fit` Party ground monster formula | Three patches inside the fit (hitFull -0.3, blowShape 1.6, tierLift false) each compensate another formula | 44 X-PARTY-FIT-PATCHES, CONFIRMED |
| redundant | `mon.party-fit` Party ground monster formula | gp 1.17 and gpFull 0.53 stack on coin that is already per HP (HP x2.5): two compensating dials for one party coin share | 44 E-X05, CONFIRMED |
| redundant | `mon.art-tier-scale` Monster damage by art tier | Written twice. For the 72 formula rows it does nothing but rounding | 44 X-ART-TIER-SCALE, CONFIRMED |
| redundant | `mon.rows` A monster row's stats (formula rows and hand rows) | 118 of 190 rows bypass the formula for no design reason. Which of them a live hunt still fields is a HYPOTHESIS (53-review-world counts 103 unused) | 44 X-HAND-ROWS, CONFIRMED |
| redundant | `mon.spell-warning` A monster spell's warning and roll | SPELL_ROLL.lowPm 500 is the hero spell's hitLowPm 500 written again | 44 X-ROLL-TWINS, CONFIRMED |
| redundant | `spawn.respawn` Pack respawn time | Written on the hunt row and on the ground row. The engine reads the ground's | CONFIRMED (pull-cycle.js reads inst.ground.respawnMs only) |
| redundant | `danger.ref-step` A ground's reference step, band and kill rate | A per-ground number that stands in for one absolute step unit (LR-1: no per-ground dial). It retires when grounds carry absolute bands | 02 package 3 cost. JUDGMENT |
| redundant | `danger.formula-step` Where a formula ground's reference monsters stand | A second per-ground step beside refStep (LR-1: no per-ground dial). It retires with absolute steps | 27 stage 6. JUDGMENT |
| redundant | `danger.rows-kept` The kill rate a ground's coin and drop rows were written at | A per-ground number for coin until coin is written in hours (LR-1) | 27 stage 9. JUDGMENT |
| redundant | `mf.ref` The reference company a formula ground is anchored on | A measured table by Level that stands in for the reference company's damage in steps. It retires when hero power is counted in steps (04 section 1, wave 3) | JUDGMENT |
| redundant | `reward.xp-floor-fit` Early-ground XP fit | Falls away with the ground-fit fix (a kill reward that follows kills an hour) | 44 E-X04, CONFIRMED |
| redundant | `reward.ground-xp-fit` Per-ground XP fit | Outputs of the missing kill-rate term, hand-fitted (re-fitted 11-08, 11-11, 11-19). Knobs.json lists it under notKnobs | 44 E-X01, CONFIRMED |
| redundant | `reward.ground-gp-fit` Per-ground gold fit | One x0.7 typed 11 times and patched 3 more times in the shop's prices (the sale dial) | 44 E-X02 and E-X19, CONFIRMED |
| redundant | `reward.drop-bonus` Old-roster drop bonus | A row that should drop more can say so in its ch | 44 E-X14, CONFIRMED |
| redundant | `reward.drop-band-fallback` Drop band fallback | Two ways to know a row's band | 44 E-X16, CONFIRMED |
| redundant | `rare.band-rows` Scarce, Rare, Key and Trophy drop chances | Every chance is a hand-typed output of a measured hour. The band's hours on the row would derive it, as the Hearthfind already does | 44 E-X33, CONFIRMED |
| redundant | `rare.hearthfind` Hearthfind odds | killsPerHour is a measured constant typed on the row. It does not move when monsters do | 44 E-X39, CONFIRMED |
| redundant | `gear.jewel-perks` Jewel perks | One word, two mechanics: the jewel Steady (misses that land) and the food buff "defense" written to steady (a damage cut) | 44 X-STEADY-TWO-MEANINGS, CONFIRMED |
| redundant | `gear.item-stats` Item rows' stats and requirements | One field, defB, feeds two formulas by item class | 44 X-DEFB-TWO-JOBS, CONFIRMED |
| redundant | `cons.food-heal-scale` The food heal scale | A scale already folded into every heal row | CONFIRMED (read: core-model.js comment and readers) |
| redundant | `party.class-xp` Party XP by size and classes | Nine cells hand-fitted, three re-cut for one measured case each | 44 P-X08, CONFIRMED |
| redundant | `econ.sale-rates` What gear sells for | A hand-typed share a tier, each derived in a comment as the last x 1.3 / the book climb. No row for tier 8 | 44 E-X17 and E-X18, CONFIRMED |
| redundant | `econ.market` Market fee, cut and ceiling | The fee, cut, ceiling and gates live only as SQL column defaults, not as a src/data row | 44 E-X22, CONFIRMED |
| ineffective | `blow.named-twins` The named blow constants the engine does not read | Moving them changes no outcome | CONFIRMED (read: only src/shell/wiki-model.js reads them) |
| ineffective | `blow.weakness-damage` Weapon weakness damage | Spells do not read it: a cast is a share of the NEUTRAL blow, so a caster gets nothing from a weakness | 44 X-SPELLS-SKIP-WEAKNESS, CONFIRMED (that it is unintended is a HYPOTHESIS) |
| ineffective | `blow.weakness-damage` Weapon weakness damage | The hatchets (weaponType axe) match no monster: WEAPON_AXES has no axe side, so the axes way never gets this bonus | 52-review-combat H1 and patches/combat-1.json, CONFIRMED there |
| ineffective | `damage.element-cap` Weapon element damage cap | Sits in the damage expression with nothing feeding it | 44 X-DORMANT-FACTORS, CONFIRMED |
| ineffective | `damage.total-cap` Damage product cap | Binds only with bane and a weapon element, both dormant | 44 X-DORMANT-FACTORS, COMPUTED |
| ineffective | `damage.bane-cap` Bane damage cap | A factor with nothing feeding it | 44 X-DORMANT-FACTORS, CONFIRMED |
| ineffective | `weapon.family-tables` Weapon accuracy and damage by family (the gear formula's profiles) | No formula past tier 7 (Level 88): today's gear earns 0.91 of the pace at Level 400, 0.47 at 1,000, and cannot hunt at 2,000 | 44 summary item 1, MEASURED there (progression-engine-probe.json) |
| ineffective | `spell.shares` A spell's share of the blow | A spell never misses and never crits and takes no weakness, so accuracy, crit and the weapon weakness are worth less the more a hero casts | 44 X-SPELLS-SKIP-WEAKNESS, CONFIRMED |
| ineffective | `spell.rune-step` Rune tier step | Ends at skill 60: past it a skill level adds nothing to a cast but the blow's own 0.35 | 44 X-VERSION-LADDER, CONFIRMED |
| ineffective | `armor.curve` Armor against the attacker's Level | At x1, armor past Level 30 is worth nothing at any band size: a full MID set holds more than 2.4 times the armor the 60% cap can use | 12-balance-pass section 3.6, MEASURED (L, bp-armor-curve-240.json: x2.4 takes 18 to 32% more damage and pace does not move) |
| ineffective | `armor.cap` Mitigation cap | An armor step is worth nothing once a set is at the cap: -0.8% to +1% damage taken past Level 45 at either step, target 3 to 5% | 12-balance-pass section 3.6 table, MEASURED (R0 and L) |
| ineffective | `armor.weights` Armor weights: points, HP and mana | Back heroes are almost never hit, so their armor weight does nothing on nine grounds | 12-balance-pass section 4.1, MEASURED (R0) |
| ineffective | `resist.weapon-resist-unread` Authored weapon resistances | The bestiary prints a resistance the fight does not apply | 44 S-X01, CONFIRMED |
| ineffective | `resist.storm-necrotic` Storm mana burn and Necrotic heal cut | Dark: no shipped table holds Necrotic or Storm | CONFIRMED (necrotic-storm.js live false) |
| ineffective | `crit.size-and-cap` Crit size and chance cap | Spells never crit, so crit is worth less the more a hero casts | 44 X-SPELLS-SKIP-WEAKNESS, CONFIRMED |
| ineffective | `mon.level-by-tier` A Level from the art tier | If every fielded row has a Level this is dead | 44 X-LEVEL-BY-TIER, HYPOTHESIS (not checked) |
| ineffective | `mon.boss-phases` Boss phases | Elements, the enrage line, the guard and the adds read MONSTERS[kind] directly, past the row door a what-if uses, so a what-if can move a blow but not a phase | 44 X-ROW-DOOR-BYPASS, CONFIRMED (impact HYPOTHESIS) |
| ineffective | `spawn.respawn` Pack respawn time | A hidden ceiling on kills an hour: past it a gear upgrade stops paying on that ground | 44 E-X34, HYPOTHESIS (report 69: two Level 45s cleared Wickstead faster than it respawned) |
| ineffective | `spawn.gather-nodes` Gather nodes on hunting grounds | Inert data (pack comments: "inert until the hunt-gathering engine lands") | CONFIRMED (read) |
| ineffective | `reward.coin-line` Coin a kill | Past floor 16 coin a HP point never moves again, while sinks are lists that end: from Level 110 gold only piles up | 44 E-X03 and summary item 4, CONFIRMED |
| ineffective | `reward.drop-cap` Drop chance cap | The featured multiplier is an argument nobody passes (the boss-of-the-day file 44 cites is gone from the tree) | 44 E-X27, CONFIRMED. Src/core/botd.js absent on set |
| ineffective | `rare.bestiary-mults` Bestiary drop and damage multipliers | Dead on the hunt path | 44 E51 and E-X26, CONFIRMED. Trophies.js TROPHY_DAMAGE_ARM_ENABLED false |
| ineffective | `gear.material-tiers` Gear tiers: their Levels and value | The ladder ends at tier 7 (Level 88). Past Level 110 kill speed falls on today's gear | 44 Levels table (88, 111, 300), MEASURED there |
| ineffective | `gear.armor-table` Gear stat budget: the curves and the slot split | A tier of armor is worth 23 to 58% early and nothing once a set is at the 60% cap | 12-balance-pass item 6, MEASURED |
| ineffective | `gear.worn-skill` +skill on worn gear | A flat number of skill levels: one level is 0.35 of a point of the largest blow at every Level, so its worth falls as the blow grows | 44 P-X38, CONFIRMED |
| ineffective | `cons.food-buffs` Food and drink buffs | The built protection row (a 10% cut off every blow) does nothing for a capped hero: median 0.0%, within 1% in 19 of 24 cells | 12-balance-pass section 3.8, MEASURED |
| ineffective | `cons.food-buffs` Food and drink buffs | A +15% damage buff paid +0 to +11% pace, median +2% | 12-balance-pass section 3.8, MEASURED |
| ineffective | `party.tank-rules` Challenge and the healer's peel | A party is close to one health bar: back heroes' armor, Defense and weight do nothing on nine grounds | 12-balance-pass section 4.1, MEASURED (R0) |
| ineffective | `econ.town-sinks` Town sinks (powder, rounds, criers, setup slots, colors, the House dummy) | Every gold sink is a list that ends. From Level 110 gold only piles up | 44 summary item 4, CONFIRMED |
| ineffective | `econ.training` Training yard pay and fee | One flat rate for every skill and level, so skill 75 to 100 takes 51 to 243 yard hours a level | 44 P-X28 and Levels table, COMPUTED there |
| ineffective | `econ.bounty` Bounty rewards | Status unknown: no client or engine surface was found reading it | 44 E53 "unknown", HYPOTHESIS |
| contradictory | `damage.permanent-cap` Cap on permanent perks | A companion's XP bonus is added after this cap, on its own curve | 44 P-X27, HYPOTHESIS |
| contradictory | `skill.weapon-xp` Melee and Ranged XP a point of damage | The three weapon skills advance on three bases (damage, mana, the attacker's Level a blow) | 44 P-X41, CONFIRMED |
| contradictory | `skill.defense-xp` Defense XP a blow aimed | A tier's dmgPm also raises the Level this reads, so Deadly on Wickstead pays 2.7 times the Defense XP | 44 X-TIER-TRIPLE, CONFIRMED |
| contradictory | `skill.reference-career` The reference hero monsters are written against | Past Level 1,000 the straight line reads Melee 375 at Level 5,000 where the skill curve allows about 248 | 44 P-X42, CONFIRMED |
| contradictory | `level.hero-hp` Hero HP a Level | The monster formula sizes blows on 150 + 10 x L, a hero has 150 + 10 x (L - 1): every blow share is 10 HP a hero does not have | 44 X-REFHP-OFF-BY-ONE, CONFIRMED |
| contradictory | `level.death-loss` Death XP loss | Written twice with different arithmetic: a float multiply in JS, exact numeric in SQL. They differ by one from Level 50,637 | 44 P-X19, CONFIRMED |
| contradictory | `level.mode-share` Session mode XP share (the Tower, the Catacombs) | The Catacombs' mode row is a copy of the Tower's, marked ASSUMED | 44 P-X15, CONFIRMED |
| contradictory | `spell.cooldowns` Spell cooldowns | Rend stays 6 s and the axes lose Power Strike (Tyler 32-3, ALTERNATIVE, ruled 2026-11-21) is not yet in the rows | rulings-of-record 32-3. The rows on set still give the axes Power Strike, HYPOTHESIS until a builder reads the bar |
| contradictory | `spell.unlocks` Spell unlock levels | Turning Cut unlocks at Melee 10 for every weapon, so the lone hammer reads -24% at the Thicket in Levels 1 to 9 | 44 X-TURNING-CUT-10, CONFIRMED |
| contradictory | `spell.roll-low` Spell roll floor | Three shapes for an amount: a swing rolls 1..max (mean 50%), a spell 50%..100% (mean 75%), a heal or shell does not roll | 44 X-THREE-ROLLS, CONFIRMED |
| contradictory | `spell.chill` Chill | Chill carries its own tier ladder (1000..1667) where every other tiered effect reads the rune step (1000..1400) | 44 X-TIER-LADDER-TWINS, CONFIRMED |
| contradictory | `heal.shares` Heal and shell shares of the blow | Heal spells fall behind health from about Level 185 (both grow, at different rates) | 44 summary, Level 185 row, MEASURED there |
| contradictory | `mon.hp-line` Monster HP line | The sheet still says the engine scales monster HP 55 to 100% by party size. It has not since 2026-11-08 | 44 X-STALE-HP-NOTE, CONFIRMED |
| contradictory | `mon.def` Monster armor and its cut | Two orders for one blow: the sheet, wiki and upgrade plan take the cut before the weakness. The engine rolls first, then subtracts | 44 X-SHEET-ORDER, CONFIRMED |
| contradictory | `mon.danger-ramp` The gentle-ground ramp | A Level threshold that changes combat math. 44 asks for Tyler's explicit yes. Tyler S-15 a (2026-11-21) approved "gentle first grounds" | 44 X-DANGER-RAMP. Rulings-of-record S-15 |
| contradictory | `mon.roles` Monster roles | The boss blow is held to a third of the FLOOR hero's HP however deep he lives: a designer rule, never ruled by Tyler | 44 X-BOSS-FLOOR-CAP, CONFIRMED |
| contradictory | `mon.art-tier-scale` Monster damage by art tier | A monster's damage depends on its art | 44 summary item 7 |
| contradictory | `mon.rows` A monster row's stats (formula rows and hand rows) | The Rat King's attack is held at 6 so his Tail Lash stays under 35% of the floor hero: the cap should bound his spell, not his attack | 44 X-NAMED-RAT-KING, CONFIRMED |
| contradictory | `mon.spells` Monster spells | Three spells had their multiples lowered so the +10% monster step would not pass 35% of a floor hero (Hot Coal, Bone Slide, Snuff the Candles): a bound written as three rows | 44 X-SPELL-HOLDS, HYPOTHESIS (rows not read) |
| contradictory | `mon.boss-kinds` Boss kinds and the ramp | The boss blow is held to a third of the FLOOR hero's HP however deep he lives: a designer rule, never ruled by Tyler | 44 X-BOSS-FLOOR-CAP, CONFIRMED |
| contradictory | `mon.boss-rooms` Boss room clocks (halls and called bosses) | GR-30's hall number acts on HP against a fixed clock, so a hall is won or lost at a DPS threshold: a cliff by construction, like the tiers. Nobody has sized a hall at Levels 25, 52 and 75 | 02-world GR-30 PROVISIONAL. Cliff COMPUTED from the rule, HYPOTHESIS until the hall grader plays it |
| contradictory | `reward.xp-line` Level XP a kill | No term for how fast a ground's monsters die, so every ground got a hand correction. The Level curve, the pace target and kill XP were then fitted to each other in a circle | 44 summary item 2, CONFIRMED |
| contradictory | `rare.bestiary-mults` Bestiary drop and damage multipliers | Luck v3.1 (Tyler 2026-11-20) cuts the charm ladder. The rows remain | rulings-of-record LUCK v3.1 |
| contradictory | `gear.accessories` Jewelry and cloaks | The kit wears a tier 3 ring, tier 2 studs and necklace and a tier 3 cloak at every Level from 30, because nothing later has a source | 54-review-items call 1 and patches/items-2.json, CONFIRMED there. MEASURED value 12-balance-pass |
| contradictory | `gear.uniques` Unique, chest and boss pieces | Each unique's armor was sized to "the most that keeps its measure under the line", four digits from 1.0000: any engine change moves the measure | 44 X-ARMOR-LINE-FIT, CONFIRMED |
| contradictory | `cons.rune-price` Store rune price by tier | A default bar that spends gold (Rend on the two-axe default) | 44 X-REND-DEFAULT, CONFIRMED |
| contradictory | `cons.food-buffs` Food and drink buffs | Luck v3.1 (Tyler 2026-11-20) cuts the four foods' drop buffs. The rows remain | rulings-of-record LUCK v3.1 |
| contradictory | `party.class-xp` Party XP by size and classes | Tyler S-10 c (2026-11-21): party XP by SIZE ALONE for the first build. The class table is live (patches/party-xp-by-size.json plays the ruling) | rulings-of-record S-10 |
| contradictory | `party.under-floor` Under-floor Level share | A Level-keyed cut on party XP is live. Tyler's 2026-11-08 ruling ("XP share rule applies regardless") was recorded as this cut being CUT | 44 P-X06, CONFIRMED |
| contradictory | `econ.store-lag` The store a tier behind, and its floor | The live store (econ.store-kit) prices a use at the buyer's step with no lag (lane/econ-followups) and gives three quarters of its crafted partner's effect (about 82 steps behind, not 20): the formula's store good, a tier behind in strength and price at once, is not yet the hunt's (wave 4) | src/data/store-kit.js header. Tools/balance-program/redesign/trades/measure.mjs. COMPUTED |
| contradictory | `econ.blessing-price` The Blessing's price | Free under Level 30: a Level threshold that changes a price on purpose (a young hero's death is under 2.5 h, its wage-priced Blessing more than its hours pay) | 44 P-X20. Kept by the designer 2026-11-22 |
| contradictory | `econ.training` Training yard pay and fee | The fee in code (50 + 6 a level) is not the fee Tyler ruled (100 gold x skill level an hour, 2026-11-20 24-8) | 44 P-X30, CONFIRMED |
| contradictory | `econ.companions` Companions | Added after the +20% permanent cap, on its own curve | 44 P-X27, HYPOTHESIS |
| contradictory | `econ.market` Market fee, cut and ceiling | 44 and 43 quote the cut as 1.5%. The newest config write on this tree sets 4% (house_tax_bp 150 -> 400) | CONFIRMED (read: 2027-01-12-market-account.sql line 310) |
<!-- END GENERATED:FLAGS -->

**What this lane found that the earlier audits did not have.**

- `econ.market`. The Weighhouse's cut is 4% on the baseline (`house_tax_bp` set to 400 in `2027-01-12-market-account.sql`). The formula registers quote 1.5%.
- `spawn.respawn`. The engine reads the ground row's `respawnMs` only. The same number is also written on the hunt row.
- `cons.food-heal-scale`. `FOOD_HEAL_SCALE` x12 is folded into every heal row already. Only a test reads it.
- `reward.drop-cap`. The `featured` multiplier is an argument nobody passes, and the boss-of-the-day file 44 cites is gone from the tree.
- `leech.rows`. No leech or mana-back row is in the shipped spell table. Every one sits behind `NECROTIC_STORM.live` (false), so life and mana leech today come only from two jewel perks.
- `econ.bank`. The bank's base, growth and stacks are written in `gold-ladders.js` and again in `shops.js` `DERIVED_PRICES`.
- `rare.bestiary-mults`. Luck v3.1 cut the charm ladder (Tyler 2026-11-20). The rows remain, and none is read on the hunt path.

## 4. What the simulator cannot perturb today

These are coverage gaps for BL-1 and the sensitivity lane. Each gap's reason is one of these:

- `sql-only`: the server decides in SQL. The engine never reads it.
- `outside-hunt`: town work (gathering, benches, crafting), the market, sinks past the store and the House.
- `not-in-runs`: the engine plays it, but no matrix run does. That covers the Tower, the Catacombs, scaled hunts, halls and called bosses, the yard and live events.
- `harness-fixed`: the harness sets the value itself, for example skills from `skill-lines.mjs` and the cell's purse.
- `player-policy`: a player's choice, where the matrix plays one default.
- `no-seam`: the engine has no switch a cell can use.
- `not-built`: ruled or staged, not in the engine.
- `dead`: nothing on the hunt path reads it.

<!-- GENERATED:NOT_PLAYABLE (tools/balance-program/levers.mjs --write) -->
| Gap | Lever | Category | Why |
|---|---|---|---|
| dead | `blow.named-twins` The named blow constants the engine does not read | Base damage coefficients | no fight reads them: a change moves the wiki only |
| dead | `cons.food-heal-scale` The food heal scale | Consumable costs and effectiveness | no fight reads it: the heals in items.js, drinks.js and supply-basics.js are already multiplied |
| dead | `damage.bane-cap` Bane damage cap | Base damage coefficients | zero items carry a bane |
| dead | `damage.combined-cap-unused` The exported second damage ceiling | Base damage coefficients | nothing on the hunt path reads it: a perturbation changes no outcome |
| dead | `damage.element-cap` Weapon element damage cap | Base damage coefficients | no worn item carries an element (imbuements are BUILD-LATER, Tyler 2026-11-21) |
| dead | `damage.total-cap` Damage product cap | Base damage coefficients | cannot bind while bane and the weapon element are 1 |
| dead | `rare.bestiary-mults` Bestiary drop and damage multipliers | Rare-drop probabilities | the charm damage ladder has no caller, trophy damage returns 1 while TROPHY_DAMAGE_ARM_ENABLED is false, relicMult is projected and never read |
| dead | `resist.weapon-resist-unread` Authored weapon resistances | Resistances | no engine code reads weaponResist |
| harness-fixed | `econ.companions` Companions | Economy sources and sinks | a cell carries no companion |
| harness-fixed | `econ.recruits` Recruits: three heroes in one press | Economy sources and sinks | a cell names its own party and Levels |
| harness-fixed | `econ.start-gold` Starting gold and kit | Economy sources and sinks | a cell sets its own purse |
| harness-fixed | `party.size` Party size | Party bonuses and interactions | the matrix plays parties 1 to 4 by design |
| harness-fixed | `regen.inner-flame` Inner Flame regeneration rate | Regeneration | a cell's Inner Flame level is the harness's, not trained in the cell |
| harness-fixed | `skill.curve` Combat skills on the Level clock | Skill scaling | cells take skills from tools/balance-sim/skill-lines.mjs, not from the curve (planned knob skillCurve, V1) |
| not-built | `carry.price` Carry-over: parts and a fee a Trait step | Economy sources and sinks | the verb waits for trait_pieces (wave 4) |
| not-built | `flame.levers` The Inner Flame: burn, room, luck, top rank, curve, fuel worth | Rare-drop probabilities | no roller reads luck until lane/drop-formula (wave 4). The switch inner_flame is off |
| not-built | `gear.ground-tier` The base tier a scale ground drops | Equipment stats and progression | read as the item Level of every scale drop (danger.js scaleItemLevels, lane/r10) and the base of the power step. No matrix RUN names a scale ground |
| not-built | `gear.rarity-hours` The rarity ladder in hunted hours, depth on the Rare odds, the top rank and the made piece's roll | Equipment stats and progression | dark: GEAR_STEPS.traitsLive false, nothing hands the settle a roll (tools/balance-program/redesign/drops/first-trait.mjs reads the roller alone) |
| not-built | `gear.signatures` Signatures: each named piece's one rule, as reaction rows | Equipment stats and progression | dark: SIGNATURE_RULES.live false, nothing drops or hands one. Only the tests hand a hero `wornSignature` (tests/hunt-core/signature-rules.mjs) |
| not-built | `gear.slot-weights` Gear slot weights | Equipment stats and progression | the power step (R9) reads it |
| not-built | `gear.step-tier` A gear tier in steps, and how far ahead gear is worn | Equipment stats and progression | the power step (R9) reads it. No engine path does yet |
| not-built | `gear.trait-budget` Trait steps by rank and the Trait guards | Equipment stats and progression | no roller or fight reads Traits until wave 4 (V7 sizes them on the engine) |
| not-built | `gear.trait-rank-gate` The highest Trait rank a ground rolls, by its entry Level | Equipment stats and progression | no roller reads it until wave 4 |
| not-built | `gear.trait-trade` A trade Trait's gain, and the percents a Trait card shows | Equipment stats and progression | hidden: nothing rolls or plays Traits until wave 4 |
| not-built | `gear.traits` Traits: the rule, its condition and its source | Equipment stats and progression | hidden: nothing rolls or plays them |
| not-built | `imbue.parts` Imbuement parts | Imbuement effects | the Artificing bench that makes an imbuement from its part is the K1 job slice's. The switch imbuements is off |
| not-built | `imbue.rules` Imbuements: 2 steps each, 20 hunted hours, the fee | Imbuement effects | the switch imbuements is off. The bench, the items and the fight conditions are owed (21 section 3.9) |
| not-built | `ledger.aura` Party auras: steps on every ally in reach while the move is slotted | Equipment stats and progression | no move names an aura yet (the Wraps stay hidden). The Lab slots a scratch move (tools/balance-program/redesign/e3/e3-lab.json) |
| not-built | `ledger.ramp-slices` The power ledger: the ramp and the slice caps | Equipment stats and progression | no source writes a ledger row yet (Traits wave 4, talents L8, Temper L11, imbuements wave 4) |
| not-built | `leech.rows` Spell leech and mana back | Life and mana leech | every leech row sits behind NECROTIC_STORM.live (false), and no default bar casts them |
| not-built | `loot.pity` Personal loot pity: growth and the base share | Rare-drop probabilities | the roller is lane/drop-formula's. The switch personal_loot is off |
| not-built | `regen.fist-wraps` The fist wraps' own heal | Regeneration | fists are a hidden two-row sample with no way in the engine's style list |
| not-built | `resist.storm-necrotic` Storm mana burn and Necrotic heal cut | Resistances | dark behind src/data/necrotic-storm.js live: false. The knobs stormDrain and necroticCut move numbers no cell reads until a patch switches it on |
| not-built | `roads.borrow-bands` The Roads: borrowing priced by value, and the Level a borrow opens at | Equipment stats and progression | dark behind TALENT_RULES.live |
| not-built | `roads.near-fall` Near fall-back: how close to the stance's line a Roads condition fires | Equipment stats and progression | dark behind TALENT_RULES.live |
| not-built | `roads.nodes` The Roads sample's nodes: crossroads, waystones and vows, in steps and move modifiers | Equipment stats and progression | dark behind TALENT_RULES.live. Alloc-run.mjs measures the five allocations |
| not-built | `roads.rules` The Roads: a point a Level, vow slots, borrowed moves, the idle point's cost | Equipment stats and progression | dark behind TALENT_RULES.live. The Lab runs it with tools/balance-program/redesign/roads/alloc-run.mjs |
| not-built | `spawn.gather-nodes` Gather nodes on hunting grounds | Spawn pacing and encounter composition | the hunt-gathering engine is not built |
| not-built | `spell.answers` The answers to a wind-up: Parried's window and the push bound | Spell coefficients, costs, cooldowns and areas | no played bar slots Parry or Stagger yet: both are the player's picks, off every default bar (23 section 9 step 8 re-runs the move table) |
| not-built | `spell.status-keys` Stacking keys: how one effect's sources count | Spell coefficients, costs, cooldowns and areas | no hero carries an add-key status yet |
| not-built | `spell.statuses-hidden` The hidden statuses (E2): Poison, Armor Break, Weakened, Silenced, Burning Ground, Guarded, Emboldened, Renewing, and the engine pieces: Mending, Echo, Sapped, Frozen Ground | Spell coefficients, costs, cooldowns and areas | hidden: no move, Trait or Signature lands them yet (the Roads, the Wraps) |
| not-built | `temper.steps` Temper on steps: ranks by Level, price in hours of wage, the re-seat | Equipment stats and progression | the switch temper_steps is off and the Temper Kit is not an item. T1 measured with tools/balance-program/candidates/temper-5.json |
| not-in-runs | `amount.blow-top` A hero's blow at a gap of 0, by weapon type | Base damage coefficients | played by the V1 probe. No matrix run plans a stance |
| not-in-runs | `amount.defense-split` Armor and ward by armor weight | Armor and mitigation | played by the V1 probe. No matrix run plans a stance |
| not-in-runs | `amount.pressure` What a monster's row blow lands at a gap of 0 | Monster HP, damage, armor, resistances and behavior | played by the V1 probe (stage3 cells). No matrix run plans a stance |
| not-in-runs | `amount.roll-spread` The one roll of every amount | Base damage coefficients | played by the V1 probe. No matrix run plans a stance |
| not-in-runs | `bands.absolute` A ground's band in absolute steps | Monster XP and loot values | a cut, not a play: tools/new-ground.mjs measures the bridge under it |
| not-in-runs | `danger.band-rule` How every ground's band is cut from its three Lab cells | Monster XP and loot values | a cut, not a play: tools/new-ground.mjs re-measures every ground with it |
| not-in-runs | `danger.climb` The climb and the fall back | Spawn pacing and encounter composition | played by the V1 probe only |
| not-in-runs | `danger.coin-level` The scale's coin level | Monster XP and loot values | played by the V1 probe only |
| not-in-runs | `danger.formula-step` Where a formula ground's reference monsters stand | Monster HP, damage, armor, resistances and behavior | played by the V1 probe only (tools/balance-program/redesign/tuning/roles) |
| not-in-runs | `danger.holder-line` The holding tank's line | Monster HP, damage, armor, resistances and behavior | played by spell-run.mjs (plan P) on the real engine |
| not-in-runs | `danger.loot-step` Loot follows depth | Monster XP and loot values | played by the V1 probe (candidate loot-depth-off pairs it away) |
| not-in-runs | `danger.pay` Pay by depth | Monster XP and loot values | played by the V1 probe only. The server bounds it (hr_danger_level_xp_max, 1055) |
| not-in-runs | `danger.pay-floor` Pay floor under the reference step | Monster XP and loot values | played by the V1 probe from a held start (lane/r9 tools/balance-program/redesign/r9). The server bounds only the most a kill pays (hr_danger_level_xp_max), which the floor never raises |
| not-in-runs | `danger.power-gear` The power step on gear | Monster HP, damage, armor, resistances and behavior | played by the V1 probe (candidates power-tier-back / -ahead / -offense-back / -defense-back / -tier-back-under-cap). No matrix run plans a stance |
| not-in-runs | `danger.power-gear-below` The power step under the ground's gear Level | Monster HP, damage, armor, resistances and behavior | played by the V1 probe (candidates power-tier-back / power-tier-ahead) |
| not-in-runs | `danger.power-skill` The power step on skill | Monster HP, damage, armor, resistances and behavior | played by the V1 probe (the skill cell, --skill-delta. Candidate skill-weight-off pairs the weight away) |
| not-in-runs | `danger.power-step` Danger power step | Monster HP, damage, armor, resistances and behavior | the V1 probe plays it (a patch of this line moves its held step). No matrix run plans a stance |
| not-in-runs | `danger.pull` Danger pull growth | Spawn pacing and encounter composition | played by the V1 probe only |
| not-in-runs | `danger.readiness` Pulls on readiness | Spawn pacing and encounter composition | played by the V1 probe only |
| not-in-runs | `danger.ref-step` A ground's reference step, band and kill rate | Monster XP and loot values | played by the V1 probe only |
| not-in-runs | `danger.rows-kept` The kill rate a ground's coin and drop rows were written at | Monster XP and loot values | played by the V1 probe only (tools/balance-program/redesign/tuning/roles) |
| not-in-runs | `econ.training` Training yard pay and fee | Economy sources and sinks | the matrix plays hunts, not the yard |
| not-in-runs | `econ.training-items` Training items | Economy sources and sinks | the engine reads it and cell.mjs could play it, but no matrix RUN plays that mode (the Tower, the Catacombs, scaled hunts, boss halls and calls, the yard, live events) |
| not-in-runs | `level.hours` Hours a Level takes | Level scaling | a design target the pay is derived from: a move changes Levels an hour by construction, never what a company holds (tools/balance-program/redesign/hours/fit.mjs reads it back) |
| not-in-runs | `level.mode-share` Session mode XP share (the Tower, the Catacombs) | Level scaling | no matrix run plays a run ground (tools/balance-sim/tower-climb.mjs fits it apart) |
| not-in-runs | `level.xp-event` The Hearthrise XP weekend and its fire | Level scaling | no run schedules an event. The level_xp cell variant (buff:caps) stands in for a timed Level XP bonus. The fire is read by SQL (1043-hearthrise.sql), never by the engine |
| not-in-runs | `mf.blow-cap` A formula monster's largest steady blow | Monster HP, damage, armor, resistances and behavior | played by the V1 probe |
| not-in-runs | `mf.encounter-per-hero` Monsters a pull brings a hero | Spawn pacing and encounter composition | played by the V1 probe (candidates mf-*) |
| not-in-runs | `mf.encounter-size` A formula monster size by encounter type | Monster HP, damage, armor, resistances and behavior | played by the V1 probe (Captain Hask on Muster Barrows) |
| not-in-runs | `mf.mend` A Warder's mend | Monster HP, damage, armor, resistances and behavior | played by the V1 probe (candidate mf-hasks: the Bannerman) |
| not-in-runs | `mf.ref` The reference company a formula ground is anchored on | Monster HP, damage, armor, resistances and behavior | played by the V1 probe |
| not-in-runs | `mf.role-dials` Role power dials (armor, seconds to kill, pressure, wind-up share and size) | Monster HP, damage, armor, resistances and behavior | played by the V1 probe through the candidates mf-muster / mf-hasks / mf-wing (tools/balance-program/redesign/mf). No matrix run plans a stance |
| not-in-runs | `mf.windup-scale` Wind-up size and frequency (the death-risk dials) | Monster HP, damage, armor, resistances and behavior | played by the V1 probe |
| not-in-runs | `mon.boss-kinds` Boss kinds and the ramp | Monster HP, damage, armor, resistances and behavior | the matrix plays no boss room. Tools/balance-program/redesign/halls/hall-bench.mjs fits halls apart |
| not-in-runs | `mon.boss-rooms` Boss room clocks (halls and called bosses) | Monster HP, damage, armor, resistances and behavior | no run plays a hall. The hall grader at Levels 25, 52 and 75 is owed (13-build-plan) |
| not-in-runs | `mon.run-rooms` Tower and Catacomb rooms | Monster HP, damage, armor, resistances and behavior | tools/balance-sim/tower-curve.mjs plays climbs apart from the matrix |
| not-in-runs | `party.under-floor` Under-floor Level share | Party bonuses and interactions | every matrix cell seats one Level (mixed-Level cells are owed: 13-build-plan MM-19, OC1 to OC3) |
| not-in-runs | `roles.table` Monster roles (reach, range, splash, held, blow) | Monster HP, damage, armor, resistances and behavior | played by the V1 probe with --styles (lineups) against the roles-off candidate. No matrix run plans a stance |
| not-in-runs | `sustain.mana-seconds` The reference healer's mana in seconds of casting | Regeneration | a definition checked against the heal row and the pool, not a dial the engine reads yet |
| not-in-runs | `sustain.shares` Sustain shares at the reference (regeneration, heal spells, food) | Regeneration | a reading the V1 probe makes (tools/balance-program/redesign/foundations/run.mjs). The engine reads the heal rows and rates, not these yet |
| outside-hunt | `damage.permanent-cap` Cap on permanent perks | Base damage coefficients | the kits hold no House rooms or renown, so no cell carries a permanent perk to cap |
| outside-hunt | `econ.bank` Bank and key ring | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.bench-tax` Public bench tax | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.clans` Founding a clan | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.faction-stock` The quartermasters' stock (the two sides' pieces) | Economy sources and sinks | a piece is claimed or bought in town, never by a cell |
| outside-hunt | `econ.gold-estimate-risk` A Risk's gold an hour against Steady, as the Hunts window estimates it | Economy sources and sinks | a printed estimate, never read by a cell |
| outside-hunt | `econ.hearth` The Hearth: fuels and burns | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.hero-slots` Hero slots | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.house` House: property, rooms, chests, room perks | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.hunt-block` Bought hunting block price | Economy sources and sinks | a block is bought in town or mid-hunt, never by a cell. Tools/balance-program/stamina-day.mjs models the day |
| outside-hunt | `econ.jewelry-crafting` Jewelry tiers, Hallmark and rolls | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.job-fee` The job fee | Economy sources and sinks | a gold sink of town work |
| outside-hunt | `econ.refill` Stamina refill price | Economy sources and sinks | retired from play. Tools/balance-program/stamina-day.mjs models the day |
| outside-hunt | `econ.reset-price` Talent reset price | Economy sources and sinks | a reset is bought in town, never by a cell |
| outside-hunt | `econ.shop-prices` Shop offers | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.store-lag` The store a tier behind, and its floor | Economy sources and sinks | the cells buy at the live catalogue's price (econ.store-kit) until the store moves onto this rule |
| outside-hunt | `econ.stream-cover` The cover of each hunting stream | Economy sources and sinks | a sink size, read by the job slice |
| outside-hunt | `econ.tally` Tally task rewards | Economy sources and sinks | the cells hold no task |
| outside-hunt | `econ.tool-wear` Tools that break after 12 hours of use | Economy sources and sinks | town work |
| outside-hunt | `econ.town-sinks` Town sinks (powder, rounds, criers, setup slots, colors, the House dummy) | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.town-work` Gathering, cooking and crafting rates | Economy sources and sinks | town work (gathering and benches) is not simulated by the matrix |
| outside-hunt | `econ.town-works` The Weighhouse goal | Economy sources and sinks | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `econ.trade-curve` Yield, quality and speed on one curve | Economy sources and sinks | town work is not a hunt cell. Measure.mjs plays the job over seeds |
| outside-hunt | `econ.trade-kinds` The trades' kinds of good | Economy sources and sinks | content |
| outside-hunt | `econ.trade-table` Trade XP to 99 | Economy sources and sinks | trade XP is town work |
| outside-hunt | `econ.trade-work` Town work behind a kit-hour: the line and stage shares, the ladder, the durable goods | Economy sources and sinks | town work is not a hunt cell. Tools/balance-program/redesign/trades/measure.mjs plays the closed-form job |
| outside-hunt | `econ.wage-base` The wage at step 0 | Economy sources and sinks | a price, never read by a cell. Tools/balance-program/redesign/w/fit.mjs reads it against the measured pay |
| outside-hunt | `econ.wage-step` The wage's growth a step | Economy sources and sinks | a price, never read by a cell. Fit.mjs fits it |
| outside-hunt | `econ.work-day` A hero's daily town work | Economy sources and sinks | town work is not a hunt cell. 09 section 5.8 names the labor model the Lab must add |
| outside-hunt | `econ.work-premium` Premium's extra town work | Economy sources and sinks | town work is not a hunt cell |
| outside-hunt | `rare.chest-keys` Chest keys and opens | Rare-drop probabilities | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `rare.chest-luck` Chest weapon chance: warmth and stokes | Rare-drop probabilities | chests are opened in town |
| outside-hunt | `skill.flame-curve` Inner Flame's curve | Skill scaling | Inner Flame trains at the Hearth, never in a cell |
| outside-hunt | `skill.gathering-table` Capped skill XP table (Levels 1 to 99) | Skill scaling | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| outside-hunt | `skill.town-xp-dial` Global town-skill XP dial | Skill scaling | a town system the matrix does not simulate: town work (gathering, benches, crafting), the market, sinks past the store, the House |
| player-policy | `damage.stance` Stance damage and damage taken | Base damage coefficients | every cell plays each way's default stance (rule-subjects.js ROLE_DEFAULTS: balanced), so a patch to these rows moves no cell unless the defaults move too |
| player-policy | `danger.stances` Risk stance thresholds | Monster HP, damage, armor, resistances and behavior | the stance is the player's risk choice. The V1 and V2 probes play each |
| sql-only | `danger.start` Danger start margin | Spawn pacing and encounter composition | the server freezes the start. The probe plays a start by its own --start-from margin |
| sql-only | `econ.bounty` Bounty rewards | Economy sources and sinks | the value lives in a SQL function or table. The engine the matrix runs never reads it |
| sql-only | `econ.hearthfind-day` Hearthfind daily clamp | Economy sources and sinks | the value lives in a SQL function or table. The engine the matrix runs never reads it |
| sql-only | `econ.market` Market fee, cut and ceiling | Economy sources and sinks | the market lives in SQL. The matrix holds no market |
| sql-only | `econ.offline-cap` Town work offline cap | Economy sources and sinks | the value lives in a SQL function or table. The engine the matrix runs never reads it |
| sql-only | `rare.hearthfind` Hearthfind odds | Rare-drop probabilities | the find is rolled against a generated server catalogue with a per-day clamp in SQL. No matrix metric reads it |
<!-- END GENERATED:NOT_PLAYABLE -->

Four more gaps sit outside any lever row, because the levers are not in the rule code at the baseline. Talent unlocks and Linger have no unlock seam until R20's "when" column, so `tal-focus-fire.json` plants one on the scratch copy. Heroes against heroes cannot be played, because sides are fixed in 93 places across 22 modules (MM-41). The gear curve past tier 7 (R10), the Luck bar and linings live only as tools or rulings. The planned knobs in `knobs.json` name the roadmap step that brings each one.

**Mixed-Level parties are not played.** Every matrix cell seats one Level, so the under-floor share (`party.under-floor`) and guest seats are unmeasured (13-build-plan MM-19, OC1 to OC3).

## 5. The levers with the widest reach

Ranked by the formulas a lever's own formulas feed directly (COMPUTED from the 197-edge graph), then by the matrix outcomes it moves (JUDGED). The downstream closure is shown, but it does not rank: 59 formulas sit on a circle, so nearly every lever reaches 76 to 79 of them. The sensitivity lane's measured matrix replaces this ranking.

<!-- GENERATED:REACH (tools/balance-program/levers.mjs --write) -->
| Lever | Formulas it feeds directly (COMPUTED) | Matrix outcomes it moves (JUDGED) | Formulas downstream (COMPUTED) | Perturbed by | Class |
|---|---|---|---|---|---|
| `level.hero-hp` Hero HP a Level | 17 | 11 | 79 | knob `heroHp` | global |
| `danger.pay` Pay by depth | 17 | 6 | 77 | NOT PLAYABLE (not-in-runs) | global |
| `danger.power-step` Danger power step | 16 | 19 | 79 | NOT PLAYABLE (not-in-runs) | global |
| `mon.rows` A monster row's stats (formula rows and hand rows) | 14 | 19 | 79 | patch | content |
| `mon.hp-line` Monster HP line | 14 | 9 | 78 | knob `monsterHp` | global |
| `mon.aim-evasion` Monster aim and evasion | 13 | 9 | 79 | knob `monsterAccuracy` | global |
| `blow.gear-term` Gear term of the largest blow | 13 | 8 | 79 | knob `playerAttack` | global |
| `mon.level-by-tier` A Level from the art tier | 13 | 0 | 79 | patch | exception-accidental |
| `mf.role-dials` Role power dials (armor, seconds to kill, pressure, wind-up share and size) | 12 | 20 | 80 | NOT PLAYABLE (not-in-runs) | archetype |
| `mf.ref` The reference company a formula ground is anchored on | 12 | 19 | 80 | NOT PLAYABLE (not-in-runs) | exception-intentional |
| `mon.boss-kinds` Boss kinds and the ramp | 12 | 19 | 80 | NOT PLAYABLE (not-in-runs) | archetype |
| `mon.party-fit` Party ground monster formula | 12 | 19 | 80 | knob `partyGroundHp` | exception-intentional |
| `mon.roles` Monster roles | 12 | 19 | 80 | patch | archetype |
| `gear.item-stats` Item rows' stats and requirements | 12 | 19 | 79 | patch | content |
| `gear.material-tiers` Gear tiers: their Levels and value | 12 | 19 | 78 | patch | archetype |
| `danger.formula-step` Where a formula ground's reference monsters stand | 12 | 15 | 80 | NOT PLAYABLE (not-in-runs) | exception-intentional |
| `mf.blow-cap` A formula monster's largest steady blow | 12 | 11 | 80 | NOT PLAYABLE (not-in-runs) | global |
| `mf.windup-scale` Wind-up size and frequency (the death-risk dials) | 12 | 11 | 80 | NOT PLAYABLE (not-in-runs) | global |
| `mon.blow-line` Monster blow line and the gentle cap | 12 | 11 | 80 | knob `monsterDamage` | global |
| `mon.danger-ramp` The gentle-ground ramp | 12 | 11 | 80 | patch | exception-intentional |
| `skill.reference-career` The reference hero monsters are written against | 12 | 9 | 79 | patch | content |
| `mf.encounter-size` A formula monster size by encounter type | 12 | 8 | 80 | NOT PLAYABLE (not-in-runs) | archetype |
| `mf.mend` A Warder's mend | 12 | 8 | 80 | NOT PLAYABLE (not-in-runs) | archetype |
| `danger.pay-floor` Pay floor under the reference step | 10 | 6 | 78 | NOT PLAYABLE (not-in-runs) | global |
| `armor.weights` Armor weights: points, HP and mana | 9 | 11 | 79 | patch | archetype |
<!-- END GENERATED:REACH -->

## 6. Keeping it true

- **`node tools/balance-program/levers.mjs --check`** exits 1 when:
  - a new top-level binding in the rule code holds a typed number and no lever or reason claims it.
  - a claimed binding gains a typed number, or a table gains a new numeric field.
  - a lever's anchor is gone.
  - a knob, patch, gap or test a row names does not hold.
  - a live knob maps to no lever.
  - the rows changed and `--write` was not run.
- **A moved value is not a failure.** A balance lane moves values. Every number written in an anchor matches any number, so `hpPerLevel: 10` still finds `hpPerLevel: 12`, while a renamed or deleted line is lost. `--check` counts how many lines and values moved, and `--write` re-reads them (`--strict` makes it fatal).
- **`--selftest`** plants every problem in memory and proves each is caught, and that a new row and a moved value pass. Its step is generated from the guard's header (`node tests/ci-shape.mjs --write`) and runs `--selftest` and `--check`.
- **Proved on the real tree** (mutations made and reverted, exit codes seen): a new constant in `hunt-tuning.js` exits 1 (unclaimed). A new key in `HUNT_TUNING` exits 1 (new key). `hpPerLevel` moved from 10 to 12 exits 0 and reads "1 changed". `hpPerLevel` renamed exits 1 (lost anchor and new key).
- **A balance lane** runs `levers.mjs --write` and commits `levers.json` with its change. A new mechanism gets a lever row before its numbers land.

**What the check cannot see.**

- Numbers written as 0, 1, 2, 100 or 1000 are invisible to the census rule (the blow's base 2, `SHOP_PREMIUM` 2, the leash margin 1). Those are listed by hand.
- A table pinned `open` (keyed by item ids, such as recipes, rooms and shields) can gain a numeric field unseen.
- A binding claimed by a reason is never pinned.
- SQL catalogues are listed by hand. The check proves their anchors exist, never that no new SQL constant appeared.

## 7. What was and was not verified

- **Verified (exit codes seen).** `levers.mjs --selftest` (24 proofs), `levers.mjs --check`, `census.mjs --selftest` (22 proofs), both selftests under `tools/mutant-gate.mjs`, and `tests/ci-shape.mjs`.
- **Every line and value.** Read by the tool from the tree at the baseline commit.
- **Every class, range, outcome list and flag.** JUDGED by this lane from the code, with its evidence label. Flags quoting 44 or chapter 12 carry those documents' labels, and were not re-measured here.
- **Not done.** No lever was played. The sensitivity of each lever is the later lane's. The "asserted" test verdict means a test reads the lever, not that it fails when the value moves.
