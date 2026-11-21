# Hearthrise, the game we are building. Chapter 01: core and combat

Lane `lane/d-book-combat`, written 2026-11-21 on `set/v0.2.144`. This chapter is the combat design of record. It replaces the combat parts of the balance program documents named in section 8. It changes no game code, data or migration.

**How to read the labels.**

| Label | Meaning |
|---|---|
| RULED (date or id) | Tyler decided it. It is the game |
| RECOMMENDED (call id) | The design this chapter builds on if Tyler takes the recommendation. The call id is the row of the decision book that decides it |
| OPEN | Nobody has decided it and there is no recommendation yet. The line says what decides it |
| TARGET | A number the design aims at. For a coefficient it is the value the design opens on, and the balance matrix proves it or moves it |
| COMPUTED | A number that falls out of a formula or a tool. Nobody types it |
| MEASURED | Evidence about the proposed design, read on the real engine. Never a target |

Formula ids (C-HERO-POWER and so on) are the ids of the combat register, `tools/balance-program/formulas/formulas-combat.json`. Knob names (`tierDanger` and so on) are the names in `tools/balance-program/formulas/knobs.json`.

---

## 1. The experience

**Minute 5.** You have four heroes and each holds a weapon you picked. You send them into the Mill Cellar. They fight without you. Every two seconds a hero swings, and every few seconds a strike or a heal fires from a bar you can read. Numbers land that make sense: the hammer hits hard and slow, the staff keeps people standing, the sword and shield takes the blows. Nothing misses for a reason you cannot see, and the first strikes and the first heals land whole.

**Hour 20.** Your four stand around Level 20 and you have learned that the fight rewards preparation. You chose a tier for the ground. You changed a rule on a bar because monsters were shooting your healer. You carry a second weapon for a ground whose monsters are weak to it. You tried Deadly a little early, lost a hero to a pack your tank could not hold, and understood why. The harder tier is a fight your party has to be built for, and when it holds, it pays more.

**Hour 2,000.** Your heroes are past Level 200. The same rules still run the fight, and you can still read them: a hit is skill plus gear, a spell is a share of that hit, armor takes a share off, an element adds or removes a percent. Your gear rides a curve that keeps pace with the monsters. Your rune tiers kept climbing with your skills. The questions you answer are the same ones as at hour 20, with more pieces on the table: which four, which weapons, which rule on which slot, which tier on which ground.

**What you never do.** You never fire a skill by hand (RULED 10-16). You never repeat a decision you already made. A bar, a stance and a target mode are set once and remembered for each hero. A tier is remembered for each ground (RULED 11-05).

---

## 2. The design

### 2.1 The formula architecture

**One engine.** RULED (CLAUDE.md sections 1 and 6). One combat engine runs every hunt, watched or not, on the server, in 100 ms combat steps inside a 10 second settlement. There is no away mode and no second copy of the fight. The client sends intents and draws what the server returns.

**A formula-driven game.** RULED 2026-11-21 (the formula brief, `40-formula-brief.md`). Combat is one framework for each kind of mechanic. Each framework is centralized, deterministic, data-driven, composable, scalable to any Level, auditable and globally tunable. Differences between weapons, monsters and grounds are intentional, written in data, and documented. No ground, weapon, monster or spell has its own math.

**The nine mechanics.** RECOMMENDED (GR-85 for the steps that move no number, GR-86 for the engine steps, GR-4 for the gear curve). Everything in combat is one of these.

| # | Mechanic | What it is | Formula ids |
|---|---|---|---|
| 1 | Power | One number for each unit: its largest hit. Everything a unit does is a share of its Power | C-HERO-POWER, C-MON-BLOW |
| 2 | Rating against rating | The chance to land is one ratio of the attacker's rating to the defender's | C-HERO-TOHIT, C-MON-TOHIT, C-REF-HERO |
| 3 | One amount pipeline | Every amount (swing, spell hit, tick, monster blow, heal, shell) runs the same stages in the same order and is rounded once | C-HURT, C-BASIC-BLOW, C-SPELL-HIT, C-SPELL-HEAL, C-SPELL-SHELL |
| 4 | The armor chain | Dodge, absorb, resistance, ward, in a fixed order with one cap | C-ARMOR-CHAIN, C-RESIST-HERO |
| 5 | The monster formula | Every monster is written from a Level, a role and an encounter type | C-MON-STATS |
| 6 | One tier table | Normal, Dangerous and Deadly are one table for every ground | C-TIER, C-PULL |
| 7 | The gear curve | What a weapon or armor piece of a given Level carries, at every Level | C-GEAR-WEAPON, C-GEAR-ARMOR |
| 8 | One modifier table | Every worn or cast modifier is a key, a combine rule and a cap | C-JEWEL-PERKS, C-BUFF-BONUS, C-WEAKNESS, C-VULN |
| 9 | Sustain | Two kinds of heal, regeneration as a percent of the maximum | C-SPELL-HEAL, C-REGEN, C-MANA, C-LEECH |

**The amount pipeline.** RECOMMENDED (GR-86, roadmap step R19). Every amount is `roll(Power x share) x the product of its modifiers`. The stages run in this order and no other.

1. **Source.** The rune tier step, the store rune share, Surge or a crit, the dealer's stance.
2. **Target vulnerability.** The element on the target, and marks and statuses that make it take more.
3. **Target mitigation.** A monster's defense, or a hero's armor chain.
4. **Shell.** A shell spends before health.
5. **Health.**

Modifiers multiply in permille. The amount is rounded once, at the end, and the part of a point is settled by chance. A bonus of 1% then pays at Level 5 as honestly as at Level 500 (RECOMMENDED, GR-13 and GR-86). Each blow can emit a short trace of its stages. The hunt analyzer and the in-game wiki read that trace, because every formula is public (RULED 11-08).

**The modifier table.** RECOMMENDED (GR-86, roadmap step R20). One table holds every modifier a hero can wear or cast. A new perk, lining or status is a row in it and never a new rule in code.

| Key | Combine rule | Cap | Status |
|---|---|---|---|
| Crit chance (leather armor, Keen, a set bonus, a buff) | sum | 60% | RECOMMENDED (GR-86). The cap and the 1.5 multiplier are TARGET |
| Resistance to one element | sum | 40% | RULED 11-08 in kind. The cap is TARGET |
| Physical resistance | sum | 10% | RULED 11-14 in kind (Krell's legs). The cap is TARGET |
| Jewel perks (Keen, Steady, Follow-through, Surge, Focus) | the largest counts once | each perk's own size | RULED 11-04 and 11-18. Sizes belong to the items chapter |
| Plus skill | sum | none | RULED 11-14. Flat levels, kept as ruled (RECOMMENDED, GR-26) |
| A hero's own heal over time | the largest | none | RECOMMENDED (GR-86) |
| Weapon weakness x bane x weapon element | product | 1.90 in all. Bane at most 1.40. Weapon element at most 1.15 | TARGET |
| "Takes more" on a monster (Hunter's Mark, plus the strongest marking status) | sum | one total cap | The cap's number is OPEN. It is set with the status pairs (GR-20) |
| Permanent perks and food buffs to damage | sum | 20% | TARGET |
| All mitigation on one blow | the chain of 2.4 | 60% | RULED 10-18 |
| A worn shield against a marked monster spell | a stat on the shield row | 30% at the opening row | RULED 11-08 in direction. RECOMMENDED as a stat, so a later shield can carry more or less (GR-86) |

**A tier's dial is applied once.** RECOMMENDED (GR-85, roadmap step R7). A harder tier's damage dial moves the monster's blow and its aim. That is what "harder" means: it hits harder and lands more often (RULED 11-04, "they are just simply harder"). Armor and Defense training read the monster's own Level and never a Level inflated by the tier. This is a correctness rule, not a tuning choice.

**The rule on special cases.** RULED 2026-11-21. Every rule in combat is one of four classes.

| Class | What it is | What happens to it |
|---|---|---|
| 1. Foundational mechanic | Belongs in the shared engine | Lives in one place |
| 2. Content parameter | A number on a data row | Moves to data |
| 3. Intentional special mechanic | A deliberate difference | Documented, and it needs Tyler's explicit yes |
| 4. Accidental complexity | A patch, a duplicate, a compensating multiplier | Removed |

Three working rules follow from it.

- **Every balance change names its layer**, in this order: formula, then coefficient, then curve, then content data. Special-case code is never a fix (RULED 11-21).
- **If a ground reads too dangerous, nobody edits that ground's damage.** The cause is a formula, a coefficient, a curve or a wrong data row, and the fix goes there (RULED 11-21).
- **The registers are guarded.** A new class 4 row, or a class 3 row with no recommendation, fails the build (RECOMMENDED, GR-88).

The intentional special rules in combat, each with its status.

| Rule | Design | Status |
|---|---|---|
| Gentle first grounds | A ground whose floor is Level 8 or under is gentle: monsters land 40% and their blow is 13.2% of a same-Level hero's health. From floor 16 they land 70% and hit 22%. A straight line between. It is the only Level threshold in monster stats | RECOMMENDED (GR-25) |
| The boss blow cap | A boss's largest blow is held to a third of the health of the hero his ground is written for. The cap bounds his spells too, so no boss row needs a hand number | RECOMMENDED (GR-25) |
| Built for a party | One encounter type with three numbers: health x2.5, blow x0.75, and XP per kill as an output of the kill reward | RECOMMENDED (GR-5) |
| A tier a ground or mode does not offer | One content flag. The Mill Cellar offers Normal only (RULED 11-05). A scaled hunt offers no Deadly through the same flag | RECOMMENDED (GR-25) |
| The beginner's floor | A cast never reads a blow under one stated number (2.8) | RECOMMENDED (GR-11) |
| Mend heals a share of max health | The second of the two heal kinds | RULED 32-4 (11-21) |
| Party-only rows | A row may fire only alone, only in a party, or only for a tank in a party | RULED 11-09 and 11-19 |
| What a basic attack costs | A wand or staff swing costs 1 mana, a bow shot one arrow, a melee swing nothing | RULED 10-15 and 10-23 |
| The training dummy | Its blow cannot kill and it cannot die | RULED 11-08 |
| Three training bases | Melee and Ranged train on damage dealt, Magic on mana spent, Defense on blows taken | RULED 10-18 and 11-05 in parts. On record as one rule: RECOMMENDED (GR-25) |
| Storm burns mana, Necrotic cuts healing | What makes the two elements different (2.5) | RULED 11-18 in kind. Numbers OPEN |

### 2.2 Hitting

**To-hit is a ratio.** RULED 21-1 (11-20). The chance to land a basic blow is the attacker's rating measured against the defender's, at every Level. A point of skill is worth the same share at Level 10 and at Level 400. No blow reads the hero's own Level, and no multiplier is keyed on a Level gap (RULED 11-04 and 11-18).

| Side | Rating | Against | Formula id |
|---|---|---|---|
| A hero's swing | `toHitBase` + weapon skill + worn accuracy | the monster's evasion | C-HERO-TOHIT |
| A monster's swing | its aim | `toHitBase` + Defense + worn plus Defense + guard (a shield, a cape) | C-MON-TOHIT |

| Number | Value | Label |
|---|---|---|
| A hero with normal skills lands on a same-Level monster | 85% (`heroAccuracy`) | TARGET |
| A same-Level monster lands on a hero with normal skills | 70% on a full ground (`monsterAccuracy`) | RULED 21-2 (11-20) |
| The same on a gentle ground | 40% | RECOMMENDED (GR-25) |
| `toHitBase` | 20 | TARGET |
| The rails | never under 5%, never over 97% | TARGET |
| A weak-side weapon | x1.15 to the chance | TARGET |

**The reference hero.** A monster's aim and evasion are written against a reference hero: the skills, Defense and worn accuracy a hero of that Level really has (C-REF-HERO). The reference hero reads the gear curve (RECOMMENDED, GR-4). COMPUTED on the proposed curve: if it did not, a hero's chance to land would drift from 85% to 90% at Level 400 and 95% at Level 2,000.

**Steady.** A share of a hero's misses turns into hits. It is one row of the modifier table with one meaning.

### 2.3 Damage

**A hero's Power.** RECOMMENDED (GR-23, GR-85 step R2). The largest hit is skill plus gear, added.

`Power = skillPower x (weapon skill + worn plus skill) + gearPower x weapon damage + basePower`

| Knob | Value | Label |
|---|---|---|
| `skillPower` | 0.35 a skill level | TARGET |
| `gearPower` | 0.6 a point of weapon damage | TARGET |
| `basePower` | 2 | TARGET |

The engine reads the three as named constants, so the wiki's terms are the engine's terms. The hit stays skill plus gear and never becomes skill times gear (RECOMMENDED, GR-23). COMPUTED on the proposed gear curve: skill is 40% of a hit at Level 110, 23% at 400 and 14% at 1,000. Skill keeps its late worth through what it unlocks: rune tiers that continue past skill 60 (2.8) and the to-hit ratio.

**A basic blow.** A miss is 0. A hit is a whole number from 1 to Power with equal odds, so a swing averages half its Power (C-BASIC-BLOW). Every basic attack takes 2,000 ms for heroes and monsters, and nothing in the game changes attack speed (RULED 10-15, `attackInterval`).

**One roll rule.** RECOMMENDED (GR-13). An amount's spread is one number for each kind of amount.

| Kind | Spread | Why |
|---|---|---|
| A swing | 1 to Power | The wide roll is the feel of a weapon |
| A spell hit | half to full (`spellRollLow` 500 permille) | A paid cast should never whiff |
| A heal or a shell | none | A heal answers a wound. A player can plan on one number |

**Crits.** A crit is a basic blow at x1.5 (`critMult`). Crit chance is the sum of its sources, capped at 60%, so a full crit build is worth at most +30% on basic blows (C-CRIT). Spells never crit (RECOMMENDED, GR-12). Crit is gear's identity and is owned by the items chapter.

**Weapon weakness.** Each monster class is weak to one side. A weak-side weapon deals +20% (`weaknessDamage`) and lands x1.15 as often (C-WEAKNESS).

| Side | Weapons | Status |
|---|---|---|
| Edged | sword, axes | RECOMMENDED (GR-14) |
| Blunt | hammer, fists | RECOMMENDED (GR-14) |
| Ranged | bow, crossbow | TARGET |
| Magic | wand, staff | TARGET |

Every weapon family can meet a weak monster. The unused "resists a weapon" column is removed, because nothing reads it and a third sign would add tracking without a decision (RECOMMENDED, GR-14). MEASURED: putting the axes on the edged side lifts the lone axes 1.5 to 4.8% from Level 10 to 60 and moves no other way.

**A cast reads the weakness of its own damage kind.** RECOMMENDED (GR-12, roadmap step R6). A physical strike (Power Strike, Turning Cut, Precision Shot) reads weapon weakness. An elemental spell reads the monster's element profile. Spells never miss. MEASURED: letting physical strikes read weakness moves any way by at most 3.5%.

**Stances.** Offensive deals and takes +10%. Defensive deals 10% less and takes 15% less (C-STANCE). A stance is set once for each hero and remembered. It becomes a real dial once the harder tiers bite.

**A monster's defense.** A monster takes whole points off every blow and every tick: 3% of its defense (`monsterDefenseCut`), where defense is 0.08 a Level times its role (`monsterDefense`, C-MON-DEF). It is why one big blow beats several small ones on a heavy or an elite, and it is the hammer's quiet edge.

### 2.4 Mitigation and armor

**The armor chain.** RULED 10-18. Armor weights do three different things, in a fixed order, with one cap on the total.

| Order | Step | Weight | Formula | Label |
|---|---|---|---|---|
| 1 | Dodge | Medium (leather) | chance = 650 permille x P / (P + 0.4 x L) | TARGET (`armorMitigation`, `armorCurve`) |
| 2 | Absorb | Heavy (plate) | share = 750 permille x P / (P + 0.62 x L) | TARGET |
| 3 | Resistance | any, from gear and linings | 1 minus the summed resistance, capped at 40% an element and 10% physical | TARGET |
| 4 | Ward | Light (cloth) | 1.5 flat points for each armor point | TARGET |
| 5 | Tempering's armor rungs, Steady from gear and food | any | last | TARGET |
| | The cap | | never more than 60% off one blow in all (`mitigationCap`) | RULED 10-18 |

P is the hero's armor points. L is the attacking monster's own Level (2.1). Mixed pieces blend by slot share, with no mixing penalty and no movement penalty for plate (RULED 10-18). Plate also raises max health by up to 28% and cloth raises max mana by up to 35% (RULED 10-14). Every piece is gated by the hero's Level and never by a skill (RULED 10-24).

**Armor keeps pace by construction.** Armor points come from the gear curve (the items chapter). COMPUTED on the proposed curve: a hero in plate of its Level sits at the 60% cap from Level 110 to Level 5,000, and a full Deadly pull deals about 13% of a tank's max health a second at every Level. So the need for a healer is constant by design, and the cap, not the gear, is the real armor number.

**A shield.** The shield makes the tank (RULED 10-23). It adds guard to the defender's rating, it carries the brace stat against marked monster spells, and its blocks train Defense extra (RULED 10-18). A crossbow may carry one, which makes a Ranger with guard and not a tank (RULED 10-23).

**A shell.** A shell is a pool that a blow spends before health (C-SPELL-SHELL). A recast of a self shell refunds the unused part as mana. A party shell never lowers a bigger one.

### 2.5 Elements

**Percent only.** RULED 11-06. No monster and no hero is immune to anything. Every element modifier is a percent of damage taken.

| On a monster | Value | Label |
|---|---|---|
| Weak | takes 15% more | TARGET (RULED 11-06 as the starting value) |
| Resists | takes 25% less | TARGET |
| The strongest resistance in the game | takes 50% less | TARGET |

**Five elements.** Fire, Ice and Poison, plus Necrotic and Storm (RULED 11-18). Each of the two new elements has one fixed rule that belongs to the element and not to any monster.

| Element | On a hero that is hit | A hero's spells of that element | Status |
|---|---|---|---|
| Storm | The hit also burns mana equal to half the health it took | Fast. They pay mana back or jump to a second monster | RULED 11-18 in kind. The numbers are OPEN and are set when the first seven spells are sized (GR-16) |
| Necrotic | For 6 seconds, everything that heals the hero heals 30% less. It does not stack | They drain health back, or leave a monster Withered so it heals half as much | The same |

A resistance lining cuts the damage and the element's rule by the same percent, capped at 40% like every element. A hero at the cap still loses 18% of healing to a Necrotic hit.

**Who is weak to what.**

| Monster kind | Necrotic | Storm | Status |
|---|---|---|---|
| People (humans and humanoids) | takes 15% more | normal | RULED 32-7 (11-21): only people are weak to Necrotic |
| Living beasts | normal | normal | RULED 32-7 |
| Undead | takes 25% less | normal | RECOMMENDED (GR-16), from the itemization plan B1 |
| Constructs | normal | takes 15% more | RECOMMENDED (GR-16) |
| Elementals | normal | takes 25% less | RECOMMENDED (GR-16) |
| Slimes | takes 50% less | takes 50% less | RULED 11-06 |

**Where monsters first cast them.** Necrotic on the Ox Road (Levels 112 to 128), with its home in the Unmarked Catacombs. Storm at the Old Guard (138 to 155), with its home in region 5. Heroes get their spells by skill, so a hero casts both long before a monster casts them back (RECOMMENDED, GR-16, from the itemization plan B2. The grounds belong to the world chapter).

**Why monsters cast at all.** Monster area spells exist so the whole party takes damage and the hunt feels engaging (RULED 11-08). Some are whole-group and unavoidable, with a shown windup. The answers are a shell, a heal, resistance on gear and linings, and breaking the cast (2.9). A boss also keeps a dodgeable heavy hit: the tank soaks it and casters step off (RULED 11-08).

### 2.6 Healing and sustain

**Two heal kinds, both in data.** RECOMMENDED (GR-86).

| Kind | Formula | Used by | Why |
|---|---|---|---|
| A share of the caster's Power | `Power x healPm x rune tier step` | every staff heal, every shell | It grows with the healer's weapon and skill |
| A share of max health | `max health x 11%` | Mend, the self-heal every hero has | RULED 32-4. It is the one heal that never falls behind, and it does not let a hammer heal itself more than a tank |

Heals land whole, less any heal cut, and never past missing health (C-SPELL-HEAL, C-HEAL-CUT).

**Regeneration.** Health regenerates 0.3% of max a second in a fight and 6% a second out of one (`regen`). Mana regenerates 25% of max a minute (`manaRegen`). Both are multiplied by the Inner Flame rate, `1 + P / (P + 50)`, a slowing curve, so food and drink stay necessary (RULED 10-14). All of these are a percent of the maximum and hold at every Level.

**Vitals.** Health is 150 + 10 a Level (`heroHp`). Mana is 100 + 10 a Level (`heroMana`). Magic adds 0.5% max mana for each level, for every hero (RECOMMENDED, GR-22). MEASURED: it cuts casters' store bills 2 to 4%, moves no pace, and passed the matrix gate with no unintended band. It gives the Magic skill a job on a weapon hero.

**Leech and mana back.** A leech returns a share of the health a hit took. A mana return gives mana for each hit or kill, never more than the cast spent (C-LEECH). Spell leech and lining leech are sized together under one row of the modifier table before either ships (RECOMMENDED, GR-16, from the itemization plan B5).

**Food and drink.** A heal item's size and price belong to the economy chapter (GR-52). Combat's requirement on it: a food's size is a share of the reference health of its tier, on the same curve as gear, so eating never becomes forty bites a fight at high Level.

**Does healing keep up.** COMPUTED on the proposed gear curve: Greater Mend on its top rune tier heals 20% of the target's max health at Level 110, 16% at 400 and 14% at 5,000. A staff's Power grows with the weapon and a hero's health grows a little faster. The slide is slow and the tool for it exists (a heal can move to the max health kind). See section 5.

### 2.7 Conditions

One generic status engine runs four statuses, each with one job (C-STATUS).

| Status | What it does | Who applies it | Label |
|---|---|---|---|
| Bleed | Ticks each second for each stack, up to 5 stacks, for 6 seconds. A tick is a share of the caster's Power, 3.3% of the blow at rune tier I, times the rune tier step | Rend (axes) | RULED 32-3 for the 6 seconds. The share is RECOMMENDED to rise (GR-14) |
| Chill | Slows the target's swings and spell windups by 30% to 50% by rune tier, for 4 seconds. The strongest wins, it does not stack | Frost Slam (tank), Hoarfrost (wand) | TARGET |
| Sickness | The target takes 10% more for 6 seconds | Green Sickness (staff) | TARGET |
| Withered | The target heals 50% less (a monster) or 30% less (a hero) for 6 seconds | Blight, Toll, Pall Arrow, and monster Necrotic | RECOMMENDED (GR-16). Numbers OPEN with the element |

**Hunter's Mark** is not a status a monster can shrug off. One monster takes 20% more for 8 seconds of every 12. In the modifier table it sits on the same "takes more" key as the marking statuses.

**A status opens one kind of damage.** RECOMMENDED (GR-20), a HYPOTHESIS, built as a sample of three after Deadly is sized. A status row may name one damage kind and a share. The risk is stacking, so all "takes more" sources share one total cap.

| Status | Opens the monster to | Who gains |
|---|---|---|
| Chill | blunt blows, +15% | hammer, fists |
| Bleed | Necrotic, by Fester's own rule | axes, the Necrotic mage |
| Sickness | Poison, +15% in place of its flat +10% | the fist Palm on a Poison rune |

The point is that an account's four becomes a puzzle with several good answers, decided in town. The test: three or more different fours sit within 5% of the best, and players find a pair without being told.

### 2.8 The spell rule

**Every cast is a share of its caster's own largest blow.** RULED 21-5 (11-20) and the spell rule of 11-21. Damage, heals, shells and bleeds all read Power. One growth rule, so nothing fades with Level and nothing needs new ranks.

`amount = roll(Power x the row's share) x the rune tier step x the store rune share x the pipeline of 2.1`

**The rune tier ladder.** A spell's version is the tier of the rune it spends, if the caster's skill allows that tier. It is one idea, not two (RECOMMENDED, GR-23).

| Tier | Rune | Skill | Step (`runeStep`) | Mana |
|---|---|---|---|---|
| I | Chalked | 1 | x1.0 | the row's base |
| II | Scored | 15 | x1.1 | x1.2 |
| III | Etched | 30 | x1.2 | x1.2 again |
| IV | Carved | 45 | x1.3 | x1.2 again |
| V | Graven | 60 | x1.4 | x1.2 again |
| VI and on | names in section 5 | one more every 15 skill levels | +0.1 each | the same step |

Tiers I to V at those skill levels are RULED 10-23. The +10% step is RECOMMENDED (GR-23). MEASURED: a deeper step cut Level 10 casts further. Tiers past 60 are RECOMMENDED (GR-23) and arrive with the gear curve. A rune a hero made lands in full. A store rune lands 75% (`storeSupplyShare`). The player picks the rune on each slot, and the game never picks a supply for them (RULED 10-21).

**The beginner's floor.** RECOMMENDED (GR-11). A cast never reads a blow under one stated number, `powerFloor`. A Level 1 hero's blow is 3 or 4, and a share of that would gut the first hours. The effect is ruled: heals and first strikes are not cut in half in the first hours (RULED 32-8). The floor is one number for the whole game. Past about Level 15 every cast is its share alone. Its value is COMPUTED from one requirement: a new hero with the starting kit reaches Level 10 in the ruled 6 hours. MEASURED: without a floor that hero took 7.2 hours and first-ground kills were 21 to 36% slower.

**Every cast is sized at Level 10 and at Level 60.** RULED 32-8 (11-21). A share fitted at one Level alone is wrong at the other.

**Spells never miss and never crit.** RECOMMENDED (GR-12). A paid rune should not burn for nothing, and "a spell always lands" is a plain rule a player likes. The cost is known and accepted: accuracy and crit gear are worth less the more a hero casts.

**New spells replace a slot, they do not add.** RULED 21-6 (11-20). Abilities sit on three lanes: offense (2 seconds), support (2 seconds) and heal (1 second). The first usable slot in a lane fires. A family's offense rows fill at most 0.85 of the offense lane. A new offense spell names the row it stands in for and shares its clock. So a new spell is a choice of element or shape, worth at most 5% for one and 10% for both, and it never makes everyone faster.

**Conditions on every slot.** Each slot carries a rule: own health, an ally's health, monsters in the area, party health, mana, a monster casting, has or lacks an effect. The rule is set once and saved with the setup.

**When rows arrive.** Unlocks are on the row's own skill.

| Skill | About Level | What opens |
|---|---|---|
| 1 | 1 | 16 abilities and Mend |
| 10 to 14 | 7 | Turning Cut (sword), Raking Shot, Frost Slam, Hoarfrost |
| 15 | 7 to 8 | rune tier II |
| 20 | 9 to 10 | Shelter, Spring Tide |
| 25 | 11 to 13 | the Storm spells, and Storm runes at Runecrafting 25 (RULED 32-1) |
| 30 | 15 to 17 | rune tier III |
| 40 | 27 to 29 | the Necrotic spells, and Bone runes at Runecrafting 40 (RULED 32-1) |
| 45 | 34 to 35 | rune tier IV |
| 60 | 59 to 60 | rune tier V |
| 75, 90, 105 and on | from about Level 90 | rune tiers VI and on (RECOMMENDED, GR-23). COMPUTED from the reference hero: skill 82 at Level 110 and 129 at Level 400, so about four more tiers arrive between Level 90 and Level 400 |

### 2.9 Every weapon way and its spells

Role comes from the worn weapon and off-hand, never from an outfit (RULED 10-16). Every hero can train Melee, Ranged, Magic and Defense and switch freely (RULED 10-14). There are no vocations. Roles are Melee, Ranger, Mage and Healer, and Tank is a function of a Melee hero with a shield (RULED 10-16). There is no ninth weapon and no attack speed by weapon. That is a decision not to build, RECOMMENDED by the game review (its section 2.2) with no call id of its own. Section 7 has the reasons.

Shares below are of the caster's Power at rune tier I. They are COMPUTED fits at Levels 10 and 60 and the matrix may move them. Mana is tier I to tier V.

**Every hero**

| Row | What it does | Share | Clock, cost | Status |
|---|---|---|---|---|
| Mend | Heals the hero | 11% of max health | 6 s, 15 mana | RULED 32-4 |

**Sword and shield, the tank.** The only way that holds a pack. It levels slowly alone on purpose (RULED 11-19). Its tank spells, Frost Slam and Shelter, hold, protect and control. They never make a lone tank kill faster, and they fire only in a party (RULED 11-19).

| Row | What it does | Share | Clock, cost | Unlock | Status |
|---|---|---|---|---|---|
| Challenge | Takes every monster within 6 tiles that is not on a tank and holds it 8 s | none | 8 s, free | 1 | RULED 11-19: only the shield has it |
| Power Strike | One target | 70% | 6 s, 6 mana | 1 | RULED 21-5 |
| Flame Strike | One target, Fire | 140% | 8 s, 10 to 21 mana, Fire rune | 1 | RULED. Off the tank's default bar (11-19) |
| Frost Slam | Chills every monster beside the tank | Chill 30 to 50% | 6 s, 6 to 12 mana, Ice rune | Melee 12 | RULED 11-19. Party only |
| Shelter | A shell on the whole party when a monster is casting | 289% | 30 s, 25 to 52 mana, Earth rune | Melee 20 | RULED 11-19. Party only |
| Brand | One target, Storm. A kill gives mana back. Stands in for a strike | sized with the first seven | 8 s, 10 to 21 mana, Storm rune | Melee 25 | RECOMMENDED (GR-16). Party only on the tank |
| Reave | One target, Necrotic. 30% of the damage comes back as health | second batch | 10 s, 12 to 25 mana, Bone rune | Melee 40 | RECOMMENDED (GR-16), redesign first |

**Sword alone.** The tank with its shield off. One hero goes from tank to damage and back by ground with no retraining. Its card says so. It holds Power Strike, Flame Strike, Brand, Reave and Turning Cut. It speeds up once Turning Cut opens at Melee 10 (RULED 11-19).

**Warhammer.** The hardest plain blow and the simple first weapon. Two hands.

| Row | What it does | Share | Clock, cost | Unlock | Status |
|---|---|---|---|---|---|
| Power Strike | One target | 70% | 6 s, 6 mana | 1 | RULED 21-5 |
| Turning Cut | Every monster around the hero, up to 8. Fires at 2 or more | 60% each | 8 s, 8 mana | 1 | RULED 32-2 (Cleave merged in). Unlock at 1: RECOMMENDED (GR-15) |
| Quarry Blow | One heavy hit on an Earth rune, the hammer's own strike. If the target is winding up a spell, the windup ends and that monster's spell clock restarts. On a boss it adds a share to the windup. It never stops a swing | 140% | 8 s, 10 to 21 mana, Earth rune | 1 | The strike is RULED 32-5. The cast break is RECOMMENDED (GR-18) and re-opens 10-23 ("no stagger") in a narrow form |
| Anvil Ring | Every monster beside the hero, Storm. Stands in for Turning Cut | first seven | 10 s, 12 mana, Storm rune | Melee 25 | RECOMMENDED (GR-16) |
| Toll | One heavy hit that leaves the target Withered. Stands in for Power Strike | second batch | 10 s, 12 mana, Bone rune | Melee 40 | RECOMMENDED (GR-16), redesign first |

**Hatchets (dual axes).** The bleed weapon. Its job in a four is the long-lived target. It does not hold Power Strike (RULED 32-3).

| Row | What it does | Share | Clock, cost | Unlock | Status |
|---|---|---|---|---|---|
| Rend | Two hits and a Bleed that stacks to five | 39% a hit, plus the bleed | 6 s, 8 to 17 mana, Rupture rune | 1 | RULED 32-3 (6 s). Its share and its bleed rise until the lone axes sit at 0.95 to 1.00 of the hammer from Level 30 to 110: RECOMMENDED (GR-14) |
| Turning Cut | As the hammer's | 60% each | 8 s, 8 mana | 1 | RECOMMENDED (GR-15) |
| Fester | One target, Necrotic. Half again as hard if it is bleeding | first seven | 8 s, 10 mana, Bone rune | Melee 40 | RECOMMENDED (GR-16). The best design of the sixteen, because it builds on what the weapon does |
| Crossarc | Storm, standing in for Turning Cut | second batch | 8 s, 10 mana, Storm rune | Melee 25 | RECOMMENDED (GR-16), redesign first |

Rend sits on the default axes bar on the cheapest store Rupture rune, with the hero's own runes used first (RECOMMENDED, GR-15). An unedited axes bar then has a strike at one target.

**Bow.** The party Ranger. Two hands, and quivers as late off-hands (RULED 11-18, answer 12). Its job in a four is the back row's guard: its default target mode is "shooters first" (2.10).

| Row | What it does | Share | Clock, cost | Unlock | Status |
|---|---|---|---|---|---|
| Hunter's Mark | One monster takes 20% more for 8 s | none | 12 s, 8 mana | 1 | TARGET |
| Precision Shot | One target | 75% | 6 s, 6 mana, 1 arrow | 1 | RULED 21-5 |
| Flame Volley | An area, Fire | 86% each | 10 s, 15 to 31 mana, Fire rune, 3 arrows | 1 | TARGET |
| Raking Shot | A line of 4 tiles, no element | 80% each | 8 s, 10 mana, 2 arrows | Ranged 10 | TARGET |
| Fork Shot | Hits the target and jumps to one more for 60%, Storm. Stands in for Precision Shot | first seven | 8 s, 12 mana, Storm rune, 1 arrow | Ranged 25 | RECOMMENDED (GR-16) |
| Pall Arrow | Necrotic over 6 seconds, and Withered | second batch | 10 s, 12 mana, Bone rune | Ranged 40 | RECOMMENDED (GR-16), redesign first |

**Crossbow.** The self-reliant Ranger. One hand, so it may wear a shield. It has its own spell list (RULED 32-6). Its identity is that list and the shield: single target, no Mark, no area shots (RECOMMENDED, GR-21). Its weapon numbers stay beside the bow's. MEASURED: a third more damage for a quarter less accuracy moved it only 3 to 6%, so a stat line does not make a weapon.

| Row | What it does | Status |
|---|---|---|
| Precision Shot | One target, 75%, 1 bolt | RECOMMENDED (GR-21) |
| Leech Bolt | One target, Necrotic. 30% of the damage comes back as health | RECOMMENDED (GR-16), first seven |
| Live Bolt | One heavy shot, Storm | RECOMMENDED (GR-16), second batch, redesign first. It cannot refund on a crit, because spells never crit |
| The rest of its list | OPEN. Single-target rows only. Section 5 |

**Wand, the Mage.** One hand plus a spellbook. Two elements and the best area damage. Its price is gold. Its job in a four is area damage and stopping monsters that mend.

| Row | What it does | Share | Clock, cost | Unlock | Status |
|---|---|---|---|---|---|
| Frost Lance | One target, Ice | 114% | 6 s, 20 to 41 mana, Ice rune | 1 | TARGET |
| Fireball | An area, Fire | 73% each | 8 s, 25 to 52 mana, Fire rune | 1 | TARGET |
| Hoarfrost | An area, Ice, and Chill | 53% each | 10 s, 22 to 46 mana, Ice rune | Magic 14 | TARGET |
| Arcane Barrier | A shell on the Mage alone | 229% | 20 s, 30 to 62 mana, Earth rune | 1 | RULED 10-23: self only |
| Blight | An area, Necrotic. Everything hit is Withered. It names the row it stands in for | first seven | 10 s, 25 to 52 mana, Bone rune | Magic 40 | RECOMMENDED (GR-16) |
| Updraft | An area, Storm, with mana back for each monster hit. It names the row it stands in for | second batch | 10 s, 22 to 46 mana, Storm rune | Magic 25 | RECOMMENDED (GR-16), redesign first |

**Staff, the Healer.** Two hands. Every heal, a shell, and a mark for party damage. There is no healer area damage. The big party heal is long, expensive and rule-driven (RULED 11-08). The lane is full: no more heals or shells are added.

| Row | What it does | Share | Clock, cost | Unlock | Status |
|---|---|---|---|---|---|
| Greater Mend | Heals one ally under 70% | 317% | 2 s, 25 to 52 mana, Water rune | 1 | TARGET |
| Circle of Renewal | Heals the party when two or more are under 80% | 160% each | 12 s, 50 to 104 mana, Water rune | 1 | TARGET |
| Spring Tide | The once-a-minute party save | 951% each | 60 s, 120 to 249 mana, Water rune | Magic 20 | RULED 11-08 |
| Protective Ward | A shell on one ally | 191% | 12 s, 25 to 52 mana, Earth rune | 1 | TARGET |
| Green Sickness | A weak area, Poison. Everything hit takes 10% more | 40% each | 10 s, 20 to 41 mana, Poison rune | 1 | TARGET |
| Undertow | The lone Healer's strike. Fires only alone | 89% | 20 s, 15 to 31 mana, Water rune | 1 | RULED 11-09 |
| Static Ward | A shell on an ally. Whatever hits it takes Storm damage. Stands in for Protective Ward | first seven | 12 s, 25 mana, Storm rune | Magic 25 | RECOMMENDED (GR-16) |
| Tithe | Drains one monster and heals the weakest ally | second batch | 10 s, 20 mana, Bone rune | Magic 40 | RECOMMENDED (GR-16), redesign first |

**Fists.** RULED 11-18, the identity: "Hearthrise's self-sufficient all-rounder", with steady single-target damage, elemental flexibility and enough sustain to hunt alone in comfort. In a four they fill a gap while tanks, healers and dedicated damage stay stronger in their roles. Good at everything, great at nothing. They ship after the spell rule (RULED 21-10).

| Dial | Design | Status |
|---|---|---|
| The promise | Within 15% of the best lone XP. Best net gold of any lone melee from Level 40 | RULED 11-18 (answer 7) |
| Damage | One target only. No area. Counts as Melee, on the blunt side | RULED 11-18. Blunt: RECOMMENDED (GR-14) |
| The Hands | One row. A strike on mana, with no element and no rune | RECOMMENDED (GR-17) |
| The Palm | One row. A strike on mana in the element the player chose. Feeding it a rune of any family is the stronger cast and sets its element. That covers Storm and Bone with no extra rows, and makes the fists a consumer of every rune family | RECOMMENDED (GR-17) |
| Sustain | Its own heal, about 0.8% of max health a second while hurt | OPEN. The plan's gold test is re-run on the spell rule first, because Mend at 11% of max health may be enough |
| Armor | Any weight | TARGET (the itemization plan section 7) |
| Source | Drops, as the eighth weapon family | RULED 11-18 |

MEASURED on a stand-in, before the spell rule: with every strike on a rune the store bill was 2 to 10 times the hammer's and the stand-in lost gold from Level 42. That is why the strikes cost mana and a rune is optional.

**Necrotic and Storm: sixteen spells.** RULED 11-18 and 32-6: every weapon family has a spell for both, and the crossbow has its own list. RECOMMENDED order (GR-16): seven first, one for each weapon, after Deadly is sized. Then the rest, redesigned after the seven are played, under one rule: no two weapons share a mechanic.

| Family | First seven | Second batch, redesigned first |
|---|---|---|
| Sword | Brand (Storm) | Reave (Necrotic) |
| Hammer | Anvil Ring (Storm) | Toll (Necrotic) |
| Axes | Fester (Necrotic) | Crossarc (Storm) |
| Bow | Fork Shot (Storm) | Pall Arrow (Necrotic) |
| Crossbow | Leech Bolt (Necrotic) | Live Bolt (Storm) |
| Wand | Blight (Necrotic) | Updraft (Storm) |
| Staff | Static Ward (Storm) | Tithe (Necrotic) |
| Fists | The Palm on a Storm rune or a Bone rune covers both | none |

That is seven, seven and the fists' two: sixteen. Each of the first seven is sized inside the bar budget and measured together with leech linings.

**Rune families.** Eight (RULED 10-23 for the first six, 11-18 for Storm and Bone).

| Family | Who spends it | Opens at Runecrafting |
|---|---|---|
| Fire | Flame Strike, Flame Volley, Fireball, the Palm | the items chapter |
| Ice | Frost Slam, Frost Lance, Hoarfrost, the Palm | the items chapter |
| Earth | Shelter, Arcane Barrier, Protective Ward, Quarry Blow | the items chapter |
| Water | Greater Mend, Circle of Renewal, Spring Tide, Undertow | the items chapter |
| Poison | Green Sickness, the Palm | the items chapter |
| Rupture | Rend | the items chapter |
| Storm | the Storm spells, the Palm | 25 (RULED 32-1) |
| Bone | the Necrotic spells, the Palm | 40 (RULED 32-1) |

### 2.10 Party roles, and what Deadly asks of a four

**The frame.** Every account runs four heroes from day 1 (RULED 11-21). The four together is the obvious way to hunt, because the same party buffs apply to everyone. There are no balance targets for a lone hero against a party, or for one party size against another (RULED 11-21, GR-67). A lone hero stays allowed as a slower choice and never a trap. Difficulty is one thing for every group size: one pull, one damage dial and one health dial for each tier (RULED 11-08).

**Who gets hit.** Aggro is rules, not threat numbers (C-TARGET).

- A pack turns on the hero who led the pull.
- Challenge takes every monster within 6 tiles that is not on a tank and holds it for 8 seconds.
- A Healer's basic attack draws a free monster 18% of the time.
- A monster that shoots aims at the hero farthest back.
- A pack lives in its room plus a margin. If the hero holding it leaves, the pack resets and heals. A boss never resets.

**Target modes.** Nearest, Lowest HP, Highest HP %, Strongest, Follow the leader, and one new mode: **Shooters first** (RECOMMENDED, GR-19). It takes first the monster that is attacking from range, then the leader's target. It is the bow's default, and Hunter's Mark follows it. MEASURED on a real four: 28% of the damage taken landed on the healer, nearly all from monsters shooting the back row.

**One job for each seat.** RECOMMENDED (GR-3, GR-18, GR-19, GR-16). Each weapon brings one thing to a four that no other weapon brings, and each job is a rule on a bar, set in town.

| Seat | Its job in a four | The rule on the bar |
|---|---|---|
| Sword and shield | Hold the pack. Slow it. Shell the party before a group spell | Challenge when ready. Frost Slam with monsters beside it. Shelter when a monster is casting |
| Staff | Keep four heroes alive. Add 10% to what the party deals | Three heals by how many are hurt. Green Sickness on a pack |
| Bow | Kill what is shooting the back row | Shooters first, with Hunter's Mark on that target |
| Wand | Area damage. Stop monsters mending | Fireball or Frost Lance by pack size. Blight where monsters heal |
| Hammer | The biggest single blow. Break a cast | Quarry Blow when a monster is casting |
| Axes | Grind down the long-lived target | Rend on the strongest. Fester on a bleeding one |
| Crossbow | A Ranger that looks after itself | Leech Bolt, a shield |
| Fists | Fill a gap | The Palm in the element the ground is weak to |

**What Deadly asks of a four.** RECOMMENDED (GR-3), building RULED 21-3 (11-20: the harder tiers hit harder, sized on a party with a healer and monsters that shoot the back row) and RULED 31-9 (spells are sized first, then Deadly).

Deadly is sized so that all three of these are true for a MID-geared four in band.

1. **A four with a shield tank and a healer holds it.** "Holds" means its deaths, its lowest health and its net gold all pass (2.11).
2. **The same four with a hammer in front in place of the shield does not hold it.**
3. **The same four with no healer does not hold it.**

Statements 2 and 3 are the lineup test. They are what make preparing a party a real decision. Four lineup cells join the balance matrix and must turn from holding to failing as the dials are sized (RECOMMENDED, GR-88): hammer, healer, bow, mage. Hammer and three mages. Three mages and a healer. Four mages.

MEASURED on the engine with the spell rule built, at the opening dial values, one seed and one hour for each cell, direction only: every one of those lineups held Deadly with no deaths at Levels 60 and 110, and a hammer with three mages was the fastest four at Level 60. So the opening dials are too low and the harder tiers work must raise them. The sizing uses only the tier table of 2.11 and the monsters' own stats. It never uses a rule keyed on party make-up.

**Why roles then matter, by formula.** A pull of eight needs a holder, because an unheld pack spreads its blows across cloth. The tier's blow and aim make that spread lethal. Shooters reach the back row, so someone must kill them or guard against them. Whole-group spells need a shell, a heal or a broken cast. Each is a stat or a row. None is special-case code.

**The party's pay.** The party buff is the party cell of the XP chain: `kill XP x tier x mode x party x event`, each factor one table for the whole game (RECOMMENDED, GR-85, roadmap step R8). The lone hero's +15% (RULED 11-11) is the first cell of that one table. The table pays more for a mix of classes than for one class (RULED 10-31, kept by GR-3). Its cells are re-cut after Deadly is sized, with no target for a lone hero against a party (RULED 11-21). A hero far below the party's top Level follows one visible line: at two thirds of the top Level or more it keeps its full share (RECOMMENDED, MM-19). The table itself belongs to the progression chapter.

### 2.11 The harder tiers

**One choice for each ground.** RULED 11-05 and 11-07. Normal, Dangerous or Deadly. A tier is a bigger pull, a percent of difficulty and a percent of XP. Coin per kill and drops per kill never change with the tier, because a tier costs no gold to enter. The leader chooses and members read it. Any hero may enter any ground on any tier. Pushing past your weight is a warned choice with one confirm press, and it pays more XP for more risk and a bigger supply bill (RULED 11-04 and 11-06).

**One tier table, the same on every ground.** RECOMMENDED (GR-5 and GR-27, roadmap steps R7 and R12). No ground carries its own dials. A ground differs by what it fields, never by its percents.

| | Normal | Dangerous | Deadly | Knob | Label |
|---|---|---|---|---|---|
| Pull, monsters in a fight | the ground's own packs | one number, the same on every ground. Five is the leading candidate | one number, the same on every ground. Eight | `tierPull` | The shape is RECOMMENDED (GR-27). The numbers are OPEN, set by the harder tiers sample |
| Blow and aim | x1.00 | x1.17 to open, sized up | x1.33 to open, sized up | `tierDanger` | TARGET. RULED 21-3 that it rises |
| Monster health | x1.00 | x1.10 | x1.15 | `tierHp` | TARGET |
| Level XP per kill | x1.00 | x1.10 | x1.25 | `tierXp` | TARGET |
| Coin and drops per kill | the same | the same | the same | none | RULED 11-07 |

**One pull number for each tier.** RECOMMENDED (GR-27). The one thing a ground adds is a map fact: how many monsters its rooms can physically hold. A room that holds six fields six on Deadly. That number comes from the map and nobody sets it to tune XP. The rule that withheld bigger pulls from the first grounds goes in the same step as the kill reward (RECOMMENDED, GR-5), because harder tiers keep the bigger pulls (RULED 11-07).

**Who each tier is for.**

| Tier | Built for | Evidence |
|---|---|---|
| Normal | Any hero in band. Near zero risk (RULED 10-25) | |
| Dangerous | A lone hero's hard tier, and a party's step up | MEASURED at the opening dial, one seed and one hour: a lone hero in band holds a pull of five at 35 to 49% health with no deaths from the Glade to Krell's Hold, for 35 to 65% more XP than Normal, and it costs most of the hour's gold. Not yet played at the raised dial |
| Deadly | A four with roles (2.10) | |

**The bands a tier is sized to.** These are what "sized" means. MID rows are RULED (10-25 and 11-21, call 50-5). LOW and BiS rows are RECOMMENDED (GR-88, from the standards, section 2.2).

| Band | LOW gear | MID gear | BiS gear |
|---|---|---|---|
| S1. Normal in band, typical lowest health | 45 to 70% | 60 to 80% | 75 to 95% |
| S2. Normal in band, deaths in 1,000 hunted hours | at most 5 | at most 1 | at most 0.1 |
| S3. Dangerous in band, lowest health | under 35%, it dies | 35 to 60% | 55 to 75% |
| S4. Deadly in band, lowest health | dies | 15 to 40% | 35 to 50% |
| S5. Damage taken an hour | 1.15 to 1.35 x MID | 1.00 | 0.80 to 0.90 x MID (RULED 11-21) |
| S6. Deaths in 1,000 hunted hours, the same count at every Level | Dangerous 60 to 150. Deadly over 200 | Dangerous 10 to 30. Deadly 50 to 100 | Dangerous 2 to 10. Deadly 10 to 30 |
| S7. A 12 hour unattended hunt on Normal finishes | 9 in 10 | 99 in 100 | always |

**Holding a tier.** RECOMMENDED (GR-88). A kit holds a tier when its deaths are at or under the top of its S6 row, its lowest health is inside S3 or S4, and its net gold is over zero. The standard: MID holds Dangerous in band from Level 16 and Deadly as a four. BiS holds Deadly. LOW holds Normal and nothing else.

**Outside your weight.** A party ten Levels under the band dies every few hours on Deadly (RULED 21-3). It should be struggling or paying (RULED 11-19, as direction). The cost comes from the monsters' own stats and never from a Level penalty (RULED 11-04).

**A death.** A death ends that hero's hunt and sends it to town. It costs 6% of the hero's total Level XP and 6% of each combat skill's progress, flat, with no cap (RULED 11-09 and 11-21). Blessings cut that. The cost and the Blessing ladder belong to the progression chapter.

### 2.12 Monster stats on the one formula

**Every monster is written by one formula** from its Level, its role and its encounter type (RECOMMENDED, GR-86, roadmap steps R4 and R21). No monster is typed by hand. A named exception is a row with a reason and Tyler's yes. A monster row stores its own blow, so no art set and no patch sits between the formula and the number.

| Stat | Formula | Knob | Label |
|---|---|---|---|
| Health | (4.95 + 1.76 x Level) x role x encounter type | `monsterHp` | TARGET. Includes the +10% of RULED 11-19 |
| Largest blow | a share of a same-Level hero's base health x role: 22% on a full ground, 13.2% on a gentle one | `monsterDamage` | TARGET. Includes the +10% of RULED 11-19 |
| Aim | solved from the reference hero so the monster lands 70% (40% gentle), plus its role | `monsterAccuracy` | RULED 21-2 for the 70% |
| Evasion | solved from the reference hero so the hero lands 85%, times its role | `heroAccuracy` | TARGET |
| Defense | 0.08 x Level x role | `monsterDefense` | TARGET |
| Level XP and coin per kill | priced per health point by the kill reward and the coin line | `killRateRef`, `coinLine` | The progression and economy chapters |

**Roles.** Six, each a row of multipliers. A ground's roster names a role for each monster (TARGET).

| Role | What it is | Health | Aim | Blow | Defense | Evasion | XP |
|---|---|---|---|---|---|---|---|
| Swarm | many and weak | x0.8 | -4 points | x0.85 | x0.5 | x0.9 | x1.0 |
| Regular | the baseline | x1.0 | 0 | x1.0 | x1.0 | x1.0 | x1.0 |
| Glass | fragile and quick to land: fliers, archers, casters | x0.75 | +5 points | x1.1 | x0.5 | x0.9 | x1.2 |
| Heavy | slow, thick, a softer blow | x1.2 | -10 points | x0.8 | x3.0 | x1.35 | x1.1 |
| Elite | the bruiser, the rare carrier | x1.6 | 0 | x1.0 | x4.0 | x1.5 | x1.15 |
| Boss | a long fight | x5 | 0 | x1.1, held to a third of the floor hero's health | x4.0 | x1.5 | x1.2 |

**Encounter types.** Two. An ordinary ground, and a ground built for a party: health x2.5 and blow x0.75 (`partyGroundHp`, `partyGroundBlow`), with XP per kill an output of the kill reward (RECOMMENDED, GR-5).

**A hall boss** is the boss role times one hall number, sized so a party in band wins 80 to 90% of the time on the food its card asks for, and the weakest named party loses (RECOMMENDED, GR-30). No boss is tuned by hand.

**Boss phases.** Two lines on a boss's health. Adds arrive at the first, and he takes only a share of every blow while one stands. Under the second he enrages: his blow and aim rise and one named spell casts faster (RULED 11-05, C-BOSS-PHASE). A ground's named rare gets one phase trait so it is an event and not a bigger health bar (RECOMMENDED, GR-35, the world chapter).

**Monster spells.** A monster's spell rolls from half to all of its largest blow times the spell's share, then meets the hero's armor as any blow (C-MON-SPELL). A marked spell shows a windup. The first cast waits a random share of its cooldown, so a pack does not cast as one.

**A monster above your Level** is simply harder: its blow is a bigger share of your health and its aim lands more often, because its stats are higher. Nothing else changes (RULED 11-04).

**The monster side scales forever.** COMPUTED on the formula: health 199 at Level 110, 709 at 400 and 8,805 at 5,000, with the largest blow at 22% of a same-Level hero's base health at every Level. COMPUTED on the proposed gear curve, a hero in gear of its Level:

| Level | Largest hit | Skill's share of the hit | Swings to kill a regular | Plate | A full Deadly pull, % of a tank's max health a second |
|---|---|---|---|---|---|
| 110 | 71 | 40% | 6.5 | at the 60% cap | 13.1 |
| 185 | 105 | 33% | 7.2 | at the cap | 12.9 |
| 400 | 195 | 23% | 8.1 | at the cap | 12.9 |
| 1,000 | 431 | 14% | 8.9 | at the cap | 12.9 |
| 5,000 | 1,987 | 7% | 9.3 | at the cap | 12.8 |

So combat holds its shape to any Level as long as gear rides the curve. That is why the gear curve (GR-4, the items chapter) is the most important formula combat depends on.

### 2.13 The global knobs

One file, `tools/balance-program/formulas/knobs.json`. The Balance Lab turns each of these on the real engine.

| Knob | Opens at | What it moves |
|---|---|---|
| `skillPower`, `gearPower`, `basePower` | 0.35, 0.6, 2 | Every hit, spell, heal, shell and bleed. Kill speed. What a skill level is worth against a gear step |
| `powerFloor` | COMPUTED from the 6 hour rule | The first 15 Levels of every cast |
| `runeStep` | +10% a tier, a tier every 15 skill levels | What a rune tier is worth |
| `critMult` | 1.5, with a 60% chance cap | The ceiling of crit builds |
| `weaknessDamage` | 1.20 | What matching a weapon to a monster is worth |
| `toHitBase` | 20 | What one point of skill, accuracy or Defense is worth at low Level |
| `heroAccuracy` | 0.85 | Every hero's chance to land at equal Level |
| `attackInterval` | 2,000 ms (RULED) | Attack speed for everyone |
| `spellRollLow` | 500 permille | The spread of a spell hit |
| `manaRegen` | 25% of max a minute | Casts an hour, drink bought |
| `storeSupplyShare` | 0.75 | Store runes against made ones |
| `monsterDamage` | 13.2% to 22% of hero health | All incoming damage, food bought, deaths |
| `monsterHp` | 4.95 + 1.76 a Level | Kill time everywhere, and XP and coin per kill |
| `monsterAccuracy` | 40% gentle, 70% full | How often monsters land |
| `monsterDefense`, `monsterDefenseCut` | 0.08 a Level, 3% a point | Small hits against big ones |
| `partyGroundHp`, `partyGroundBlow` | x2.5, x0.75 | What "built for a party" means |
| `tierDanger`, `tierHp`, `tierXp`, `tierPull` | section 2.11 | The price and the pay of Dangerous and Deadly on every ground |
| `heroHp`, `heroMana` | 150 + 10 a Level, 100 + 10 a Level | Health, mana, and every monster blow with them |
| `armorMitigation`, `armorCurve`, `mitigationCap` | 650, 750, 1.5. 0.4, 0.62. 60% | What armor is worth |
| `regen` | 0.3% a second in a fight, 6% out | Downtime, food bought |
| `gearSlope`, `gearBandStep`, `gearExchange` | the items chapter | Whether hero power and armor keep pace, forever |

---

## 3. How it connects

| Chapter | Combat reads from it | Combat feeds it |
|---|---|---|
| Progression (Levels, skills, death, Blessings) | The skill curve that sets weapon skill and Defense at each Level. Hero health and mana by Level. The pace line the kill reward follows | Kill speed and survival on every tier, which set hours for each Level. Deaths on the harder tiers, which set what a Blessing is worth (GR-7). The party cell of the XP chain |
| Items and crafting | The gear curve for weapon damage, accuracy and armor points (GR-4). Jewel perks, linings, Tempering rungs, uniques, all as rows of the modifier table. Rune tiers and where each family opens | The caps a perk or lining may reach. The exchange rates a unique spends its budget at. Demand for runes, ammunition, resist linings and second weapons |
| World (grounds, monsters, bosses) | Each ground's roster of roles, its room sizes, its encounter type, its monster spells and elements | The monster formula every row is written by. The one tier table. The boss role and the hall number (GR-30). The ground's "one question" (GR-31) is asked through shooters, group spells, armor, elements and menders |
| Economy | Food and drink sizes and prices (GR-52). Rune and ammunition prices. The coin line | Supply use an hour on every tier, which is the main gold cost of pushing. What "struggle or pay" costs |
| The first hour and features | Which weapons four new heroes start with (GR-24). Saved setups and a kit for each ground (GR-48). The hunt report and the "how close was that" reading (GR-66) | Default bars for each way. The blow trace the analyzer and the wiki show |
| The MMO layer | The Level line for mixed parties (MM-19). What world bosses, clans and events pay in buffs and gear | One engine for a world boss room and for both arenas. Arena heroes run these same formulas. Buffs from the layer are rows of the modifier table and never new math |
| Platform and cost | The budget for a settled hunt | One engine, one settle path, deterministic dice |

---

## 4. Open calls in this chapter

In decision-book order. Each line is the recommendation this chapter is written on.

| Id | The call | Recommendation |
|---|---|---|
| GR-85 | The formula steps that move no number | Approve. Named constants for Power, each duplicate becomes one, a monster row stores its blow, a tier's dial applied once, one XP chain |
| GR-88 | The gate | The balance matrix diff gates every balance change. It gains the four Deadly lineup cells and a band for XP after deaths. The registers are guarded |
| GR-3 | What Deadly must ask for | A four with a shield tank and a healer holds it. The same four with a hammer in front, or with no healer, does not |
| GR-27 | What the harder tiers bring | One pull number for each tier and no per-ground dial. The harder tiers sample sets the numbers. Five on Dangerous leads |
| GR-4 | The gear curve (items chapter) | Approve. Combat's scaling to any Level depends on it |
| GR-5 | The kill reward and one tier table (progression chapter) | Approve. It removes the per-ground tier dials and the pull rule on first grounds |
| GR-18 | Quarry Blow breaks a windup | Approve. It re-opens "no stagger" (10-23) in a narrow form |
| GR-20 | A status opens one kind of damage | Approve as a sample of three, under one total cap, after Deadly is sized |
| GR-24 | The starting weapon | The player picks it at creation, for each of the four heroes |
| GR-25 | Special rules never put to Tyler | Approve each: gentle first grounds, the boss blow cap, three training bases, one roll rule with chance rounding, one flag for a tier a ground does not offer |
| GR-11 | The beginner's floor | One floor on the blow a cast reads |
| GR-12 | Spells and the hit stats | A physical strike reads weapon weakness. Spells never miss and never crit |
| GR-13 | The roll | One rule. Heals and shells have no spread |
| GR-14 | Weapon weakness | Axes are edged, fists are blunt, the unused resists column goes, and Rend rises until the axes sit with the melee ways |
| GR-15 | Turning Cut and Rend | Turning Cut at Level 1 for axes and hammer, Melee 10 for the sword. Rend on the default axes bar |
| GR-16 | Necrotic and Storm | Seven first, one for each weapon, after Deadly. Sixteen in the end. No two weapons share a mechanic |
| GR-17 | Fists | Two rows, the Hands and the Palm. Re-run the gold test first |
| GR-19 | Shooters first | One new target mode, the bow's default |
| GR-21 | The crossbow | Its identity is its own list and its shield. Its numbers stay |
| GR-22 | Magic on every hero | +0.5% max mana for each Magic level |
| GR-23 | Skill at high Level | A hit stays skill plus gear. Rune tiers continue past 60, one every 15 skill levels |
| GR-26 | Plus skill on chest weapons | Keep the flat +1 to +4 as ruled |
| GR-30 | Hall bosses | The boss role times one hall number, sized to an 80 to 90% win rate in band |
| GR-86 | The later engine steps | One amount pipeline rounded once with a trace, one modifier table, every monster on the formula |
| MM-19 | Mixed Levels in one fight | One visible two thirds line for every party |

---

## 5. Still missing

Decisions or designs nobody has made yet in this area.

| # | What is missing | What decides it |
|---|---|---|
| 1 | **The tier numbers.** The raised `tierDanger` for Dangerous and Deadly, and the two pull numbers | The harder tiers sample (4 seeds by 8 hours) at the raised dial, read against S3, S4, S6 and the lineup test. It needs the instrument faults closed first (section 6) |
| 2 | **The party buffs, named.** The ruling says the same party buffs make hunting together obvious. The only party buff on the table is the party cell of the XP chain, and its cells are not re-cut yet | The progression and MMO layer chapters, after Deadly is sized |
| 3 | **The total cap on "takes more".** One number for Hunter's Mark, Sickness and the status pairs together | The three-pair sample of GR-20 |
| 4 | **The Necrotic and Storm numbers.** The mana burn share, the healing cut and its seconds, on heroes and on monsters | Sized with the first seven spells (GR-16). They need Tyler's yes before the elements switch on |
| 5 | **The shares of the dark rows.** Brand, Reave, Updraft, Blight and the fist strikes were converted to shares and never sized. The seven second-batch spells are not designed | The first seven played, then a redesign under "no two weapons share a mechanic" |
| 6 | **The crossbow's full list.** Only three of its rows are named | The game designer, with GR-21 |
| 7 | **The fist's own heal.** Whether Mend at 11% of max health is enough, or the 0.8% a second heal is needed | The plan's gold test re-run on the spell rule (GR-17) |
| 8 | **Whether weapon accuracy stays a stat line.** By formula it is worth about an eighth of weapon damage. MEASURED in play it is worth more than that, and still small | The matrix's gear-step cells, with the items chapter |
| 9 | **A guard for heals at high Level.** Staff heals slide from 20% to 14% of max health between Level 110 and 5,000 on the curve | A band that reads a heal in monster blows at Levels 185 and 400. If it fails, Greater Mend moves to the max health kind |
| 10 | **Names for rune tiers VI and on, and who makes them** | The items chapter, with GR-23 and GR-45 |
| 11 | **Something for the bar past the last rune tier.** A permanent build choice so two tanks differ | GR-61 (Kindlings), the progression chapter. Combat's fence: a pick changes a row inside the bar budget and never adds one |
| 12 | **Which weapons the four starting heroes hold, and their default bars** | The first hour's walked-through sequence (GR-24, GR-79) |
| 13 | **The value of `powerFloor`** | Roadmap step R6's own run on Levels 1 to 15 against the 6 hour rule |
| 14 | **The fist promise beside "no solo or group targets".** The promise is a lone-hero comparison between weapon ways. This chapter keeps it as ruled and reads it as an identity test for the weapon, not a party-size target | Tyler, only if he reads it differently |
| 15 | **Whether the engine can run heroes on both sides of a fight** | One measurement by the systems engineer, for the arenas (the MMO layer chapter) |
| 16 | **The weak-side weapon without a chore.** Weapon weakness asks a hero to hold a second weapon for some grounds. If the swap is made by hand before every hunt it is a repeated decision, which the first principle forbids | The saved kit for each ground (GR-48, the items and features chapters) must carry the weapon, the bar and the target mode together |
| 17 | **Death against the Deadly band.** 6% with no cap and 50 to 100 deaths in 1,000 hours do not fit together past about Level 100 once Deadly bites | GR-7, the progression chapter |

---

## 6. How we will know it works

**The balance matrix.** It plays a patch on a scratch copy of the real engine and the real data, on the same dice, and compares. The representative run is Levels 10, 30, 60, 110, 185, 400, 1,000, 2,000 and 5,000, every weapon way, three gear states (LOW, MID, BiS), lone and four, Normal and the hardest tier. Levels past 185 are projected and say so.

| Kind of proof | The claim | Used for |
|---|---|---|
| Identity | The change moves no number. The diff is empty | Named constants, each duplicate becoming one, a row storing its blow, the modifier table |
| Coefficient | The knob moves the bands it targets and nothing else | The tier dials, Rend's share, Magic's mana, the floor, the pipeline's single rounding |
| Derivation | A typed number is deleted and its band stays in tolerance on every ground | Every monster on the formula, one tier table with the kill reward |

**The checks this chapter owns.**

| Check | Pass |
|---|---|
| The lineup test | A MID four with a shield tank and a healer holds Deadly in band. The four lineup cells of 2.10 do not |
| Survival bands | S1 to S7 of 2.11, at three gear states |
| Ways against each other | Every lone damage way inside one band of the median. The axes at 0.95 to 1.00 of the hammer from Level 30 to 110. No way is the only answer |
| The bar budget | No family's offense rows fill more than 0.85 of the lane, with every new spell slotted |
| The first hours | A new hero with the starting kit reaches Level 10 in 6 hours, with the floor |
| Scaling | Swings to kill, armor at the cap, and the Deadly pull's damage a second stay flat from Level 110 to 5,000 on the gear curve |
| The registers | No class 4 row. No class 3 row without Tyler's yes |
| The trace | The wiki's terms for a blow are the engine's, proven with a planted change |

**Is the instrument true.** Not yet, and it says where (study 51). Until these close, every band reports and none gates.

| | |
|---|---|
| Can carry a decision | An identity proof, and a four's pace (about 10% slow against real play, at the edge of tolerance) |
| Direction only | A four's gold: the simulated kit buys the Level's own rune tier, so its store bill reads 1.7 to 2.2 times real. A four's survival: the damage total reads about a third low |
| Cannot be calibrated | A lone hero and a pair. With no solo or group targets, no decision rests on them |
| Closes it, in order | The harness follows the game's own death rule (a death ends that hero's hunt). The kit's rune rule, decided with the heal price. The damage total. Readers for the bands that have none. A second real party |

**What only players can settle.**

| Question | The playtest | Reads as |
|---|---|---|
| Does Deadly feel like a fight worth preparing for? | The beta, after the dials are raised | Share of hunted hours by tier. Deaths in 1,000 hours on Deadly. Which fours people run |
| Is a broken cast satisfying, or invisible in an idle hunt? | A hammer four on a caster ground for a week | Do players keep the rule on "when a monster is casting" |
| Does anyone change a setup for a ground? | Two grounds in one band with opposite demands and equal XP | Ground-specific setups for each hunt |
| Is the bar fun to tune, or copied once and never opened? | The bar report live for two weeks | Slots changed for each hero each week |
| Do players find a status pair without being told? | The three-pair sample | Whether three or more different fours sit within 5% of the best |
| Does the risk reading change the tier a player picks? | Before and after the hunt report | Share of hunted hours by tier |

---

## 7. Superseded

What this chapter dropped from its sources, and why.

| Dropped | From | Why |
|---|---|---|
| A four on Deadly at 2.0 to 2.5 times a lone hero, a four at 1.15 to 1.25 of a lone hero on the same tier, a pair and a three against the contract, "every Dangerous party at or over its heroes alone" | 21-4, the standards P6 and P7, 11-16, 50-8 | RULED 11-21: no solo or group balance targets |
| Per-ground tier dials, the "both tiers bring six" rows, and no bigger pulls on first grounds | 41, 53 | One tier table and one pull number for each tier (GR-27, GR-5). Room size stays as a map fact |
| Dangerous and Deadly as the same full pull | 53 phase A | The audit's alternative was taken: rule the shape, let the sample set the numbers (61, GR-27) |
| "Rule five monsters on Dangerous now" | 53, the first issue of 60 | Five was read at the opening dial on one seed. It leads and is not ruled (61) |
| A tier's dial raising the monster's Level as armor reads it | 41 | A correctness fix. The dial is applied once (GR-85) |
| A floor on each of 17 spell rows | the spell rule lane's call 1 | One floor on the blow a cast reads. Three lanes reached it separately (GR-11) |
| A rune tier worth +15%, and a ladder to x1.6 | the itemization plan B, 10-23's plan | +10% fits both Level 10 and Level 60 (32-8). MEASURED that a deeper step cuts first-hour casts |
| A rune ladder that ends at skill 60 | 10-23, read as five tiers and no more | Tiers continue past 60 on an endless game (GR-23) |
| Storm runes at Runecrafting 65 and Bone at 80 | 32 section D | RULED 32-1: 25 and 40 |
| Rend at 8 seconds with an 8 second bleed | 32 | RULED 32-3: 6 seconds, and the axes lose Power Strike |
| Mend as a share of the blow | 21-5 read strictly | RULED 32-4: about 11% of max health |
| Quarry Blow as Flame Strike without an element | the spell rule lane | It becomes the cast breaker (GR-18) |
| Turning Cut at Melee 5 for every weapon | 52 phase A | Level 1 for axes and hammer, 10 for the sword. The review changed its own answer (GR-15) |
| The crossbow's new stat line | 52 phase A | MEASURED at 3 to 6%. Withdrawn by its author |
| "The sword alone is dominated" | 52 phase A | MEASURED level with the hammer from Level 10 to 60 after the spell rule |
| Six fist rows on a shared clock, Live Hand and Draw | the itemization plan section 7 and B3, 32 | Two rows. The Palm covers Storm and Necrotic (GR-17, 47 C5) |
| The Palm needs a rune on every cast | 52 phase A | It strikes on mana and a rune is the stronger cast. The plan's Finding 5 showed a rune on every cast loses gold (47 C5) |
| Sixteen mirrored spells built as written, and a sample of four first | the itemization plan B3 and section 11 | Seven first, then a redesigned second batch (GR-16, 47 C4) |
| "The other nine are redesigned" | 60, 47 | Counted again: seven second-batch rows, plus the fists' two covered by the Palm |
| Live Bolt refunding its mana on a crit | the itemization plan B3 | Spells never crit (GR-12). It is redesigned with the second batch |
| Living beasts weak to Necrotic | the itemization plan B1 | RULED 32-7: only people |
| Defer Necrotic, Storm and the fists whole | 46 | Both are ruled, and nothing planned is cut (RULED 11-21) |
| Party XP by size only | 46, 57 phase A | MEASURED: four mages would then be the best four. The class mix stays (RULED 10-31) until Deadly asks for roles |
| Remove the party encounter type | 53 phase A | Kept as one encounter type with three numbers. MEASURED that it is not the cause of the overpay (GR-5) |
| The hit as skill times gear | 41 call 4, as an option | No new multiplying formula. Skill plus gear, with rune tiers and to-hit carrying skill's late worth (GR-23) |
| Plus skill as a percent of the blow | 44 call 11 | The flat +1 to +4 stays as ruled (GR-26, 47 C24) |
| A spell is a blow and reads miss, crit and weakness | 41 call 2, as an option | Weakness by damage kind only (GR-12) |
| "Do not build curing" | 58 phase A, 47 C11's side A | Ruled twice. It is built last, in the items chapter (GR-47). It is not a combat system |
| A Level-keyed share cut for a low hero, hidden | the built rule | One visible two thirds line (MM-19) |
| A ninth weapon, attack speed by weapon, crit as a weapon identity, a second support class, more heals | ideas weighed in 52 | The eight ways are made distinct first. Speed would be a second damage law for no decision an idle player makes |
| Every number offered as a before and after comparison | all sources | RULED 11-21: nothing is compared with the game that came before. Measured numbers here are evidence about the proposed design or about the instrument |
| Monster damage read through an art-set scale, and 118 hand-typed monster rows | 41 | A row stores its blow and every monster reads the formula (GR-86) |

---

## 8. Source map

The documents and sections this chapter replaces for combat.

| Source | Sections | Where it went |
|---|---|---|
| `40-formula-brief.md` | the whole brief | 2.1 |
| `41-formulas-combat.md` | sections 0 to 8 | 2.1 to 2.8, 2.12, 2.13 |
| `44-formula-architecture.md` | 5.1, 5.4, 5.5, 7 (steps V1 to V5, R1 to R8, R19 to R21), 8.1, 8.2 calls 5 to 11 | 2.1, 2.3, 2.8, 2.11, 2.12, 2.13, 6 |
| `52-review-combat.md` | all, with section 10 (phase B) over sections 1 to 9 where they differ | 2.3, 2.7 to 2.10, 5, 7 |
| `32-spell-audit.md` | A, B, C, E | 2.8, 2.9 |
| `60-game-review.md` | 1.1, 2.1, 2.2, 4.6, top 10 items 1 and 3, 7.1 to 7.3, 8.2, GR-27, GR-30, GR-85, GR-86, GR-88 | 2.9 to 2.12, 4, 6 |
| `62-decision-book.md` and `.json` | the Combat rows, the ruled list, decide-first items 1, 2, 5 and 6 | statuses throughout, 4 |
| `47-itemization-fit.md` | C4, C5, C11, C24 | 2.9, 7 |
| `docs/design/itemization-plan.md` | section 7, Finding 5, Appendix B1 to B5 | 2.5, 2.9 |
| `46-from-scratch.md` | its combat views: the company, roles, the starting hero, party XP by size | 1, 2.10, 7 |
| `50-standards.md` | 2.2, 2.3, and the rulings of sections 9 to 11 that touch combat | 2.11, 6 |
| `51-baseline.md` | sections 1, 2, 7, 8 | 6 |
| `53-review-world.md` | the harder tiers (its sections on the pull and the dials), Krell's hall | 2.11, 2.12 |
| `61-review-audit.md` | G-27 and the lineup evidence note | 2.11, 7 |
| `21-combat.md` | calls 21-1 to 21-6 and 21-10 | 2.2, 2.8, 2.9, 2.11 |
| `.claude/coordination/CONFLICTS.md` | "THE SPELL RULE", its six calls | 2.8, 2.9: call 1 at GR-11, calls 2 and 3 at GR-15, call 4 at GR-23, call 5 at GR-13, call 6 at section 5 row 5 |
| Rulings of record | 10-14 to 11-21, as cited on each line | throughout |
