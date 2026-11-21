# Balance program 52: design review, combat styles

Game-designer, `lane/d-review-combat`, 2026-11-21, on `set/v0.2.144`. No game code, data or migration was changed in either phase.

**Phase A** (sections 2 to 6, 8 and 9) was reading and analysis only, with one small read-only count of the monster table. **Phase B** (section 10, and sections 1 and 7 rewritten from it) measured the top proposals on the real engine with the balance matrix. Where section 10 disagrees with an older section, section 10 wins, and 10.9 lists every verdict that changed. Phase B added five patch files under `tools/balance-program/patches/combat-*.json` and nothing else.

Briefs: `45-design-brief.md` (main), `40-formula-brief.md` (every change below names its layer: formula, coefficient, curve or content row).

**Labels.** EVIDENCE means read from the code or data named, cited from a measurement another lane ran, or MEASURED in section 10 with its command. HYPOTHESIS means a design judgement that a build or a playtest still has to prove.

---

## 1. Summary for Tyler

*Rewritten after phase B. Section 10 has the measurements. Where a number below is measured it says so.*

**Verdict.** The combat styles are well engineered and thinly differentiated, and the engine now says the same thing in numbers. Eight weapon ways exist. In a party only three jobs exist. They are stand in front, deal damage and heal. On Deadly today a four does not need two of them. A hammer and three mages with no healer and no shield was the fastest four I measured at Level 60, with no deaths. If we built this from scratch today I would keep the weapons, the roles from the worn set, the lanes, the bar budget and the spell rule. I would not build sixteen mirrored Necrotic and Storm spells in one go, I would not build the fists as six rows, and I would give each weapon one job in a four that no other weapon does.

**The 5 changes that matter most.**

1. **Make Deadly a fight before anything else in this area.** Measured on the real engine at Levels 60 and 110, one seed and one hour a cell. Swapping the shield tank for a hammer made the four 10% and 5% faster with no deaths. Dropping the healer for a third mage made it 22% faster at Level 60. Four mages with nobody in front held Deadly with no deaths. Every role idea below is worth nothing until this changes. This is the harder tiers lane (L16).
2. **Give every weapon one party job that is a rule on the bar.** The hammer breaks a monster's spell windup. The bow shoots what is shooting the back row. The mage stops monsters mending. Measured: a second melee hero in a four costs 8 to 13% today, and the bow seat is the cheapest seat to replace.
3. **Ship seven Necrotic and Storm spells first, one per weapon.** Your ruling of sixteen stands as the end state. The other nine are redesigned after the seven are played, so that no two weapons share one trick. The itemization fit (47) reached the same answer.
4. **Repair the weapon weakness table.** No monster can be weak to axes. Measured: reading axes as the sword's side lifts the lone axes 1.5 to 4.8% from Level 10 to 60 and moves no other way. The axes are still the slowest melee way after it, so Rend needs a bigger share as well.
5. **Rebuild the fists as two rows.** The Hands and one Palm. The Palm strikes on mana in the element you chose, and feeding it a rune is the stronger cast. That keeps the plan's gold promise and covers Storm and Necrotic with no extra rows.

**What is actively harming the game.**

- The shield tank is the slowest way alone (0.84 to 0.92 of the hammer, measured) and makes a four slower too. It is also the hero every new player starts as. The Game Director's blind play found the same thing from the other side.
- The wand is 20 to 31% faster than the hammer alone at Levels 30 to 110 (measured), and it stacks. Its only price is gold.
- Since Mend became a share of max HP, the Magic skill does nothing for a weapon hero. Measured: letting Magic add max mana cuts casters' store bills 2 to 4%, moves no pace and passes the matrix gate with no unintended band.

**What phase B changed in my own view.**

- The sword alone is not dominated any more. After the spell rule it measures level with the hammer from Level 10 to 60. I withdraw that finding.
- A different stat line does not make the crossbow a different weapon. A third more strength and a quarter less accuracy moved it 3 to 6%. Its identity has to come from its spell list and its shield.
- Letting physical strikes read weapon weakness (roadmap step R6) is small, at most 3.5% on any way. The order against the table repair does not matter much.
- Turning Cut should unlock at Level 1 for the axes and the hammer and stay at 10 for the sword, as the formula audit recommends. I had asked for Melee 5 for all.

**What I would add.** One mechanic. A status can open a monster to one kind of damage, so a Chilled monster takes more from a hammer and a Bleeding one takes more from Necrotic. I would also lift the hold on the skill tree for a small written sample, because past hunted hour 254 nothing on any hero's bar ever changes again.

**What I would not add.** No ninth weapon. No attack speed. No new rune family past Storm and Bone.

---

## 2. Systems review

### 2.1 What the area is, as built

EVIDENCE for this whole section: `src/data/abilities.js`, `hunt-roles.js`, `gear-tiers.js`, `rule-subjects.js`, `runes.js`, `statuses.js`, `elements.js`, `monster-classes.js`, `party-class-xp.js`, `to-hit.js`, `fists.js`, `src/core/combat.js`, `src/core/hunt/damage.js`, `abilities.js`.

| System | What it is | Plugs into | Earns its place? |
|---|---|---|---|
| Role from the worn set | Weapon and off-hand name a role key, the key names a role and an ability list. 8 keys, 7 lists, 5 roles | every other row here, the party finder, the XP table | Yes. It is the cleanest thing in the area. Classless and still readable |
| The 2 s swing | One basic-attack interval for every hero and monster, no speed stat anywhere (ruled 10-15) | to-hit, max hit, ammo bills, lanes | Yes. Speed would be a second damage law for no decision an idle player makes |
| Weapon rows | 8 families x 7 tiers, each an accuracy number and a strength number, some two-handed | max hit, to-hit, drops, crafting | Partly. See 2.2: the accuracy number is worth almost nothing |
| Weapon weakness | Each of 11 monster classes is weak to one of sword, hammer, ranged, magic: +20% damage and +15% to-hit on basic blows | grounds, the bestiary, gear demand | Idea yes, table no. See 2.3 |
| Abilities and lanes | 23 live rows on three lanes (offense 2 s, support 2 s, heal 1 s), first usable slot fires | the bar, runes, mana, Magic XP | Yes |
| The spell rule | Every cast is a share of the caster's largest blow, x a rune tier step of 1.0 to 1.4 | weapons, skills, runes | Yes. Right rule. Its side effect is 2.4 |
| The bar budget and `replaces` | A family's offense rows fill at most 0.85 of the lane, a new row stands in for an old one | every future spell | Yes. This is what stops spell creep |
| Rune families and tiers | 6 live families (8 with Storm and Bone), 5 tiers, bound runes land in full and store runes 75% | Runecrafting, the store, gold | Yes for Fire, Ice, Earth, Water. Thin for Poison and Rupture (one spell each) |
| The rule engine | Conditions on every slot: own HP, ally HP, monsters in the area, party HP, mana, a monster casting, has or lacks an effect | every spell | Yes, and it is underused. Offense rows almost all fire "when ready". See 4.1 |
| Statuses | Bleed (stacks to 5), Chill (slows swings and windups 30 to 50%), Sickness (+10% taken), Withered (dark, heals halved) | Rend, Frost Slam, Hoarfrost, Green Sickness, Blight | Yes. Four statuses, four jobs, no overlap in kind |
| Elements | Ember, frost, poison (Necrotic and Storm dark). Percent only, never immunity | spells, monster classes, resist gear | Yes |
| Stances | Offensive +10% dealt and taken, Defensive -10% dealt and -15% taken | every blow | Weak. See 2.6 |
| Party XP table | One table by party size and how many of 4 classes it holds | every party hunt | Yes as a table. Its class step is too small to shape a party. See 2.5 |
| Combat skills | Melee, Ranged, Magic, Defense, uncapped, trained by use | max hit, to-hit, unlocks | Melee, Ranged, Defense yes. Magic on a weapon hero no. See 2.7 |

### 2.2 The weapons: what really differs

EVIDENCE: `gear-tiers.js` WEAPON_FAMILIES, tier 7 rows (accuracy / strength).

| Family | Tier 7 | Hands | Role | What it has that no other weapon has |
|---|---|---|---|---|
| Sword | 42 / 35 | one | tank with a shield, damage without | the only tank weapon, the only melee element (Flame Strike) |
| Warhammer | 32 / 68 | two | damage | the hardest plain blow, Quarry Blow |
| Hatchets | 42 / 38 | two (a pair) | damage | Rend and the bleed |
| Bow | 45 / 36 | two | Ranger | nothing the crossbow lacks |
| Crossbow | 43 / 37 | one | Ranger | may wear a shield |
| Wand | 42 / 45 | one, plus a spellbook | Mage | two elements, the best area damage |
| Staff | 36 / 49 | two | Healer | every heal |
| Fists (dark) | tiers 1 and 2 only | two | damage | own heal, element by choice |

Three findings.

1. **The accuracy number on a weapon is close to worthless on the new to-hit rule.** EVIDENCE, by the formula (`to-hit.js`, `balance-sheet.js` heroHit 0.85, `combat.js` max hit = 0.35 x skill + 0.6 x strength + 2). A same-Level monster is written so the reference hero lands 85%. At Level 60 the reference rating is about 99. Ten more points of accuracy lifts 85% to about 86.4%, which is +1.6% damage. Ten more points of strength is +6 max hit on about 46, which is +13%. So strength is worth about eight times accuracy. The sword's "accurate" identity and the hammer's "inaccurate" drawback are both about 1.5%. The hammer's 31% bigger blow is the only thing a player feels. This is why the sword alone measures 0.85 to 0.96 of the hammer (CITED, `21-combat.md` B5) and why bow against crossbow cannot be told apart.
2. **Bow and crossbow are one weapon with two names.** Same list, numbers within 5%, and the crossbow adds a shield. CITED (`21-combat.md` B5): the crossbow has the bow's XP, half its damage taken and the hammer's gold. The bow is dominated.
3. **The sword alone is the tank with its shield off.** It is not a separate weapon and should not be judged as one. Its real value is that one hero can go from tank to damage and back by ground with no retraining and one weapon. That is worth keeping and worth saying on the screen. Its empty hand is unused.

### 2.3 Weapon weakness: the table is broken

EVIDENCE, a read-only count of `src/data/monsters.js` (190 rows, by the class each resolves to) run for this review:

| Weak to | Monsters | Share |
|---|---|---|
| hammer | 68 | 36% |
| ranged | 58 | 31% |
| sword | 44 | 23% |
| magic | 19 | 10% |
| axe | 0 | 0% |
| fists | 0 | 0% |

- `monster-classes.js` WEAPON_AXES is `sword, hammer, ranged, magic`. A hatchet's `weaponType` is `axe` and the fists' is `fists`. `combat.js weaknessInfo` matches on equality, so **neither can ever match**. The axes are the one live family that never gets the +20% and +15%.
- The hammer is the hardest hitter and is also the weak-side weapon on the most monsters at every Level band (20 of 55 under Level 26).
- `weaponResist` carries over 100 entries across the table and sits on every class card ("Resists: Magic"). EVIDENCE: no file under `src/core`, `src/shell`, `src/hunt-view` or `src/session` reads it. It is a column that does nothing.
- The bonus lands on basic blows only (`damage.js blow`). A cast reads the hero's plain max hit, so under the spell rule the weak-side weapon matters less than it did.

The idea is good and I would keep it: it is the one reason a Melee hero owns more than one weapon family, and it gives grounds a flavor. The table needs the fix in section 3.

### 2.4 The spells after the spell rule

The spell rule is right and I do not reopen it. What it shows is that a damage spell now has four properties only: its **shape** (one target, 3x3, line, ring), its **element**, its **rider** (a status or a return) and its **cost**. Two rows with the same four are the same spell.

| Check | Finding | Label |
|---|---|---|
| Same spell twice | **Quarry Blow is Flame Strike without the element**: both are 140% of the blow, 8 s, 10 mana, the same version ladder. Flame Strike gives a decision (is this ground weak to fire). Quarry Blow gives none: it is on if it pays for its rune and off if not | EVIDENCE (`abilities.js` rows) |
| Same status twice | Frost Slam and Hoarfrost both Chill, and Chill does not stack (`statuses.js` maxStacks 1, the strongest wins). A four with a shield tank and a mage gets one Chill, not two | EVIDENCE |
| Same mechanic three times | Reave, Leech Bolt and Draw are one leech. Brand, Updraft, Live Hand and the rest are one mana return | EVIDENCE (`32-spell-audit.md` B1) |
| Rows that are a choice | Fireball or Frost Lance by pack size. Flame Volley or Raking Shot by element. Greater Mend, Circle of Renewal, Spring Tide by how many are hurt (in a four Spring Tide gives about 2.5 times the healing a point of mana of either of the others, once a minute) | EVIDENCE (shares and cooldowns in `abilities.js`) |
| Rows that are never a choice | Power Strike, Precision Shot, Turning Cut, Rend, Hunter's Mark: slotted once, fire when ready, never revisited | EVIDENCE (default bars, `rule-subjects.js`) |
| When the bar stops changing | Last new spell at skill 20 (about hunted hour 6). Last version at skill 60 (hour 254). Nothing after, to Level 400 | CITED (`32-spell-audit.md` B3) |
| What a rune tier is worth now | +10% a tier. Graven costs 44 gold at the store against Carved 28. Real players already pick Carved and Etched | EVIDENCE (`runes.js` stepPm), CITED (`11-krell-hunt` section 5) |

I agree with the 11-20 audit that nothing live is filler enough to cut. I disagree with it on four points: it accepted the hammer's rune strike as a copy, it accepted sixteen mirrored spells as the shape of L44, it kept the fists at six rows with a shared clock, and it treated "the long chase has no spell in it" as fine.

### 2.5 Party roles and compositions

| Seat | What it adds to a four today | Label |
|---|---|---|
| Sword and shield | Holds the pack (Challenge). Frost Slam: every monster beside it swings 30 to 50% slower for 4 s of every 6. Shelter: a party shell on a cast warning | EVIDENCE |
| Hammer, axes, sword alone | Damage. Nothing else | EVIDENCE: no support row, no status that helps an ally |
| Bow, crossbow | Damage, and Hunter's Mark: one monster takes 20% more for 8 s of every 12 | EVIDENCE |
| Wand | The most damage, and a Chill the tank already brings | EVIDENCE |
| Staff | Every heal, a shell on one ally, and Green Sickness: everything hit takes 10% more | EVIDENCE |

What real play says (CITED, `11-krell-hunt-2026-11-20.md`, one person, one day, THIN):

- The four was **hammer, bow, mage, healer**. No shield, no Challenge. Deadly, 5 to 9 Levels under the floor, 0 deaths, 2.85 to 3.2 times the pace contract.
- Damage dealt an hour: mage 82,500, hammer 67,400, bow 51,600, healer 34,400. The bow is the weakest damage seat by a wide margin.
- 28% of the damage taken landed on the healer, nearly all from monsters that shoot the back row. The simulator puts 97% on the tank.
- 85% of healing was Greater Mend on the cheapest rune, at about 0.07 gold a health point against 1.5 for store food.

What the table says (EVIDENCE, `party-class-xp.js`): a four holding 1, 2, 3 or 4 classes is paid 970, 1580, 1670 or 1700. So one class is punished hard (-43%), and after that the step is tiny: three classes is 2% under four, two classes is 7% under.

Three readings.

1. **The tank has no job yet.** EVIDENCE: the real four above, and the spell rule lane's own line after its re-measure, "G5 the four's low point 68-70% -> 71-73% (Deadly is not a fight)" (`CONFLICTS.md`, 2026-11-21). Until L16 lands, the shield is the slowest way to level and a strictly worse fourth than a hammer.
2. **I expect mage stacking to be the best four.** HYPOTHESIS. Swapping the bow for a second mage costs 2% on the table and, on the Krell numbers, adds about 13% party damage. The wand already leads every way by 1.14 to 1.32 after the spell rule (CITED, the same CONFLICTS entry, G2). Phase B measures tank or hammer + mage + mage + healer against the mixed four.
3. **Every account is one person's four, built once and kept.** CITED (`10-real-players.md`: 91% of hunt hours in a party, every party one person's own heroes). A hero's skill is its commitment: a bow hero that becomes a hammer hero starts Melee from nothing. So "which four do I build" is the biggest combat decision in the game, made at about Level 10, and today the honest answer is "one of each, hammer in front". That decision deserves more than one right answer.

### 2.6 Stances and targeting

- **Stances.** A back-row hero takes almost nothing (the bow 2,000 damage an hour against the hammer's 118,700, CITED). So Offensive is a free +10% for every hero that is not being hit, and Defensive is a cheap -15% for the one that is. Each seat has one right answer. HYPOTHESIS: once Deadly bites, the stance becomes a real dial for a hero alone (kill faster or live). I keep it for that reason and would not spend effort on it.
- **Target modes.** Nearest, lowest HP, highest HP %, strongest, follow the leader. Missing: the one a Ranger needs, "what is hitting my back row". See 4.2.

### 2.7 Combat skills

| Skill | Finding | Label |
|---|---|---|
| Melee | One skill for sword, shield, axes, hammer and fists. Free swapping inside it is the best flexibility in the game | EVIDENCE (`skills.js` FAMILY_SKILL) |
| Ranged | One skill, two weapons that are the same weapon | EVIDENCE |
| Magic, on a caster | Gates rune versions and trains from mana spent. Fine | EVIDENCE |
| Magic, on a weapon hero | **No consumer.** A melee row's versions read Melee (`abilitySkill`). Mend is now 11% of max HP (ruled 32-4). Max mana is Level and light armor only (`core-model.js` VITALS). Yet every rune strike and every Mend still pays Magic XP at a quarter. The Skills window shows a number that does nothing | EVIDENCE |
| Defense | Two populations: the hero in front keeps it level with its main skill, everyone else stops at 2 to 37. That is correct behavior and the yard exists to fix a neglected one | CITED (`10-real-players.md` section 3) |
| Past skill 85 | A level comes less than once in five Levels and is worth about half a percent | CITED (`21-combat.md` B3) |

### 2.8 Where monsters meet the styles

A separate lane owns monsters. These are the four places a monster mechanic is the reason a style exists, and each is in the game already (EVIDENCE: `monster-spells.js` shapes, `shooters.js`, the grounds' packs).

| Monster mechanic | The style that should answer it | Does it today? |
|---|---|---|
| A whole-group spell with a windup | Shelter (tank), Spring Tide (healer), resist gear | Yes. A fourth answer, breaking the cast, is missing (4.1) |
| Shooters that hit the back row | the Ranger | No. Nothing lets a hero target them first (4.2) |
| Monsters that mend | Blight's Withered (mage, dark) | Not live. This is the best reason to ship Blight |
| High defense (a flat 3% of defense off every blow) | the hammer's big blow | Yes, silently. Small multi-hit blows (Rend's two hits) lose more to it |

---

## 3. Content rationalization

Verdicts: KEEP, REMOVE, MERGE, REDESIGN, ADD, DEFER. The 8 criteria are written out for the significant rows in 3.2.

### 3.1 The table

**Live abilities (23)**

| Row | Verdict | Reason in one line |
|---|---|---|
| Challenge | KEEP | The tank's defining button. Its worth depends on L16 |
| Frost Slam | KEEP | The strongest party defense in the game, a percentage, holds at every Level |
| Shelter | KEEP | The tank's answer to a group spell |
| Flame Strike | KEEP | The sword's one element decision |
| Power Strike | KEEP | Repaired by the spell rule |
| Turning Cut | KEEP, one number moves | Unlock at Melee 5 for every weapon that holds it (section 7, call 3) |
| Rend | KEEP | The axes' identity. On the default bar is right (call 2) |
| Quarry Blow | REDESIGN | A copy of Flame Strike. It becomes the cast breaker (4.1) |
| Hunter's Mark | KEEP | A percentage. Gains its job from the new target mode (4.2) |
| Flame Volley | KEEP | A real choice beside Raking Shot |
| Precision Shot | KEEP | Repaired by the spell rule |
| Raking Shot | KEEP | The area a resistant monster cannot shrug off |
| Fireball, Frost Lance, Hoarfrost | KEEP (3) | A real three-way choice by pack and element |
| Arcane Barrier | KEEP | Self only by ruling |
| Greater Mend, Circle of Renewal, Spring Tide | KEEP (3) | Three sizes of one job, and they are chosen between by how many are hurt and by mana |
| Green Sickness | KEEP | The healer's contribution to party damage |
| Protective Ward | KEEP | A blow that is coming, where a heal answers one that landed |
| Undertow | KEEP | Ruled and cheap. Note: a lone healer can already swap to a wand on the same Magic skill, so this serves only the player who owns no wand |
| Mend | KEEP | 11% of max HP is the right form |

**Dark and paper rows**

| Row | Verdict | Reason |
|---|---|---|
| Brand (sword, Storm) | ADD in the first seven | Built, measured, fits the tank (mana back feeds its rune spells) |
| Blight (wand, Necrotic) | ADD in the first seven | The party's answer to monsters that mend. It must name the row it stands in for |
| Fester (axes, Necrotic) | ADD in the first seven | Harder on a bleeding monster. The best design on the list: it builds on what the weapon does |
| Anvil Ring (hammer, Storm) | ADD in the first seven | The hammer's first element, standing in for Turning Cut |
| Fork Shot (bow, Storm) | ADD in the first seven | Stands in for Precision Shot |
| Leech Bolt (crossbow, Necrotic) | ADD in the first seven | Sustain fits the self-reliant crossbow of section 3.2 |
| Static Ward (staff, Storm) | ADD in the first seven | A shell, standing in for Protective Ward, against the element that burns mana |
| Reave, Updraft (built) | DEFER | The second spell for the sword and the wand. Stay dark until the first seven are played |
| Toll, Crossarc, Pall Arrow, Live Bolt, Tithe (paper) | DEFER | The second spell for each family. Decide after the first seven |
| Live Hand, Draw (paper, fists) | REMOVE | Not needed: the Palm takes any rune's element (below) |
| Fist Hands x3 | REDESIGN, merge to 1 | One row, no rune, no element |
| Fist Palm x3 | REDESIGN, merge to 1 | One row. Its element is the rune it spends |

**Rune families (8)**

| Family | Verdict | Reason |
|---|---|---|
| Fire, Ice, Earth, Water | KEEP (4) | Each feeds buttons a seat cannot play without |
| Poison, Rupture | KEEP (2), thin | One spell each. Poison gains a second consumer from the fist Palm. Rupture stays the axes' own (ruled 10-23) with one spell, and is the first family to fold into another if the rune catalogue ever has to shrink |
| Storm, Bone | ADD (2) | Ruled, at Runecrafting 25 and 40 |

**Weapon ways (9)**

| Way | Verdict | Reason |
|---|---|---|
| Sword and shield | KEEP | The only holder. Worth depends on L16 |
| Sword alone | KEEP | The tank's shield-off mode. Say so on the screen |
| Hatchets | REDESIGN (small) | Onto the weakness table. Its job in a four: the long-lived target |
| Warhammer | KEEP | The simple first weapon. Gains the cast breaker |
| Bow | REDESIGN | Dominated by the crossbow alone and by the wand in a four. Becomes the party Ranger |
| Crossbow | REDESIGN | Becomes the self-reliant Ranger: heavier bolt, shield, its own list |
| Wand | KEEP | Watch for stacking in phase B |
| Staff | KEEP | The seat itself |
| Fists | REDESIGN, then ADD | Two rows, any rune. Then ship as ruled |

**Mechanics**

| Mechanic | Verdict | Reason |
|---|---|---|
| Role from the worn set, lanes, bar budget, `replaces`, the spell rule, the 2 s swing | KEEP (6) | The foundation is right |
| Weapon weakness table | REDESIGN | Axes and fists can never match. Two content rows fix it |
| `weaponResist` | REMOVE | Read by nothing |
| The weapon accuracy number | hand off | Worth about an eighth of strength. The items and formula lanes decide if it stays a stat |
| The beginner's floor (`base` on 17 live rows, 27 with the dark ones) | REDESIGN | One floor on the blow a cast reads, in place of a floor on every row (call 1) |
| Spell versions | MERGE into the rune tier | A version is now only "the rune's tier, if your skill allows it". One idea, not two |
| Stances | KEEP | A real dial only once Deadly bites |
| Target modes | ADD one row | "Shooters first" |
| Statuses (4) | KEEP | |
| A status opens one kind of damage | ADD, as a sample of three | 4.3 |
| A cast that breaks a windup | ADD | 4.1 |
| Elements | KEEP | |
| Party XP table | KEEP | Do not use it to fix stacking. Fix the seats |
| Melee, Ranged, Defense | KEEP (3) | |
| Magic on a weapon hero | REDESIGN | Give it a consumer (4.5) |
| A ninth weapon family | do not add | Eight are not yet distinct |
| Long-term style picks (the held skill tree) | DEFER the build, write a sample now | 4.4 |

**Counts.** 81 rows judged, and one handed off (the accuracy number). KEEP 46 (22 abilities, 6 rune families, 5 weapon ways, 13 mechanics). REDESIGN 10 (Quarry Blow, the fist Hands, the fist Palm, hatchets, bow, crossbow, the fists as a way, the weakness table, the beginner's floor, Magic on a weapon hero). ADD 12 (seven spells, two rune families, one target mode, the status rule, the cast break). DEFER 9 (seven second spells, the style picks, any ninth weapon). REMOVE 3 (`weaponResist`, Live Hand, Draw). MERGE 1 (versions into rune tiers). Inside their REDESIGN the six built fist rows become two.

### 3.2 The eight criteria, for the significant ones

**A. Seven Necrotic and Storm spells first, not sixteen (challenges the 11-18 ruling "each weapon type to have a spell for both")**

1. Player value: each weapon gains one new spell that fits it. A player learns "the axes do Necrotic, the hammer does Storm" in one line.
2. Depth: the element a hero can bring becomes a reason to pick a weapon and a reason to build a four a certain way. With sixteen, every hero has everything and the element is no part of the build.
3. Uniqueness: sixteen mirrored rows repeat one leech and one mana return across eight families. Seven do not repeat.
4. Interaction: Storm and Bone rune demand is about half. Runecrafting keeps both families at 25 and 40. A four covers both elements between its heroes.
5. Balance: unchanged rule: each stands in for a row, +5% for one. No family ever holds both, so the "+10% for both" case does not exist.
6. Cost: 7 rows, 7 icons, 7 measurements in place of 16. L44 is under half the size.
7. Long-term: the other nine stay available as later content, when a region needs them.
8. Recommendation: ADD seven, DEFER nine. HYPOTHESIS on fun. EVIDENCE on cost and on the repetition.

**B. Quarry Blow breaks a windup**

1. Player value: the hammer gets a moment in a four that the party sees: the cast bar on a monster snaps.
2. Depth: a real bar rule. "Use when ready" for damage, or "use when a monster is casting" to save the party a hit. The condition already exists (`enemy_casting`).
3. Uniqueness: nothing in the game stops a cast today. Chill only slows one.
4. Interaction: 4.1 and section 5.
5. Balance: one reusable effect on the ability row, a foundational mechanic in brief 40's terms. No immunities: on a boss it lengthens the windup by a share instead of ending it.
6. Cost: one effect field, one engine branch in the monster cast step, both paths tested. Medium.
7. Long-term: every later monster with a spell makes it worth more.
8. Recommendation: REDESIGN. It revisits "no stagger" (10-23) in a narrower form: it never stops a swing, only a windup. Tyler's call.

**C. Fists as two rows, the Palm casting any rune**

1. Player value: "feed it a rune and it hits with that element" is one sentence. Six near-identical buttons is not.
2. Depth: the element choice is what you load, by ground, remembered with the ground's setup. Any of eight families, where the six-row design offered three.
3. Uniqueness: the only weapon whose element is not fixed. That is the ruled identity ("elemental flexibility") delivered by one mechanic.
4. Interaction: fists become a consumer of every rune family, which helps the thin ones. They need no Necrotic or Storm spell of their own.
5. Balance: lane fill 0.67 (Power Strike 6 s, and the Hands at 6 s with the Palm standing in for them, the 11-20 audit's own number), inside the 0.85 cap. The half-weakness field (`weakPm`) can go if the rune's cost is the price of flexibility. One content parameter: "element: the rune's".
6. Cost: fewer rows than the built sample. Small.
7. Long-term: every future rune family is new fist content for free.
8. Recommendation: REDESIGN, then ADD in L43.

**D. The crossbow becomes its own weapon**

1. Player value: a Ranger who hunts alone has a weapon built for it. A Ranger in a four has a different one.
2. Depth: bow or crossbow becomes a choice by how you play, on one Ranged skill, so a hero can own both.
3. Uniqueness: today zero. After: bow = Mark, the area shots, shooters first. Crossbow = shield, a heavier bolt, single target, Leech Bolt.
4. Interaction: two ammo lines mean two fletching products. Shields gain a second customer.
5. Balance: content rows only: the crossbow's strength up and accuracy down along the hammer's shape, and its list drops Hunter's Mark and the two area shots for one heavy single shot. Lane fill stays under the cap.
6. Cost: one list of about three rows (ruled 32-6 already gives it a list). Small to medium.
7. Long-term: holds, it is a shape and not a number.
8. Recommendation: REDESIGN. It overlaps the fists' "comfortable alone" promise on purpose: one is the Melee way to hunt alone, one the Ranged way.

**E. The weakness table**

1. Player value: an axe hero can be the right weapon somewhere.
2. Depth: a Melee hero has three weapons to choose between by ground, not two.
3. Uniqueness: n/a, it is a repair.
4. Interaction: more demand for hatchet drops. Bestiary words change from "sword" to "edged" and from "hammer" to "blunt".
5. Balance: two content rows: hatchets read the sword's side as "edged", fists read the hammer's as "blunt". No class moves. No formula changes.
6. Cost: small. Delete `weaponResist` in the same change.
7. Long-term: every later weapon names its side.
8. Recommendation: REDESIGN (repair). EVIDENCE, not a hypothesis.

**F. Sword and shield, kept as is**

1. Player value: none today in a four, by the real run above.
2. Depth: the tank is the build that trades its own speed for a party's safety. That is a real trade only where safety is scarce.
3. Uniqueness: the only holder.
4 to 7. Its worth is entirely L16's. If an in-band four still holds Deadly without a shield after L16, the tank fails the purpose test and Challenge should move to "any Melee hero in Defensive stance".
8. Recommendation: KEEP, with that test named now so it is judged by a measurement and not by habit.

---

## 4. Missing opportunities

Each is from brief 45 section 5, with why Hearthrise in particular gains from it.

### 4.1 A cast that breaks a windup (monster mechanics that work with automated combat, style identity)

**Why Hearthrise.** Tyler's stated purpose for monster spells is that the whole party takes damage so hunts feel engaging (11-08). Today a party has three answers: shell it, heal it, resist it. All three are "take the hit". A fourth answer, "stop the hit", is the only one a damage dealer can give, and it is decided on the bar in town, which is exactly where this game puts its decisions.

**Shape.** Quarry Blow (hammer, Earth rune, 8 s) keeps its damage. If its target is winding up a spell, the windup ends and that monster's spell clock restarts. On a boss it adds a share to the windup instead. One per cast, so a pack with three casters still lands two.

Criteria: value high (visible, legible). Depth: a bar rule with two right answers. Unique: yes. Interaction: section 5. Balance: one effect, percentages on bosses. Cost: medium. Long-term: grows with content. **ADD.** HYPOTHESIS. Playtest tells: do players set the rule, and does a four with a hammer take measurably less on a caster ground.

### 4.2 "Shooters first" (features that make hunting more engaging without attention, party roles)

**Why Hearthrise.** EVIDENCE that the problem is real: 28% of a real four's damage landed on the healer from monsters shooting the back row. The simulator did not even model it. The Ranger is the weakest damage seat in that same four and has no job. One target mode gives the Ranger the job of protecting the back row, set once and remembered.

**Shape.** One row in TARGET_MODES: take first the monster that is attacking from range, then the leader's target. The default for the bow. Hunter's Mark follows the target, so the marked monster is the shooter.

Criteria: value high for a tiny change. Depth: a choice between adding damage to the leader's target and protecting the healer. Unique: yes. Interaction: fewer healer drinks, less mana spent. Balance: a targeting rule, no number. Cost: small (one data row, one ordering in `targeting.js`, both paths). Long-term: every ground with shooters. **ADD.** HYPOTHESIS on size. Phase B: the healer's damage taken and the four's drink bill, on Hask's Ford and Krell's Hold.

### 4.3 A status opens one kind of damage (style identity, player cooperation, long-term customization)

**Why Hearthrise.** One person builds four heroes and lives with them for hundreds of hours. The game needs that build to be a puzzle with several good answers. Pairs that work together give that with no attention during the hunt, and they make two accounts' fours look different.

**Shape.** A status row may name one damage kind and a share: a monster under it takes that much more from that kind. Start with three, all on statuses that exist:

| Status (who applies it) | Opens it to | Who gains |
|---|---|---|
| Chill (tank's Frost Slam, mage's Hoarfrost) | blunt blows, +15% | hammer, fists |
| Bleed (axes' Rend) | Necrotic, by Fester's own rule | axes, the Necrotic mage |
| Sickness (healer's Green Sickness) | poison, +15% in place of its flat +10% for poison hits | the fist Palm on a Poison rune |

One total cap on "takes more" from all marks and statuses together, as `MAX_TOTAL_DAMAGE_MULT` already caps weakness x bane x element.

Criteria: value: the four becomes a build. Depth: high. Unique: nothing reads a status for damage today except Sickness's flat mark. Interaction: section 5. Balance: one extension of the existing `takenPm`, one cap. Cost: medium, and the risk is stacking. Long-term: very high, every new status or damage kind is a new pairing. **ADD as a sample of three.** HYPOTHESIS. Playtest tells: do players find a pair without being told, and does any pair become the only four.

### 4.4 Something for the bar past hour 254 (long-term customization, milestones between upgrades)

**Why Hearthrise.** Levels are unlimited and Level 200 is hour 1,680. A combat skill level past 85 is worth half a percent. Two heroes with the same weapon and the same gear are the same hero, which is the opposite of Tyler's own wish that "each character isn't exactly the same" (11-18). Gear will carry some of this. It will not carry style.

**Shape, as a proposal to write down and not to build.** At main-skill milestones past 60 (70, 80, 90, 100 and on), a hero picks one of two or three small changes to a spell of the weapon it holds. Example for the hammer at 70: Turning Cut reaches one tile further, or Quarry Blow's clock restarts when its target dies. Picks belong to the weapon family, so a hero that changes weapon keeps them and earns the new family's separately. This gives the slow uncapped skill a reward a veteran can see, and it is styles without vocations.

Criteria: value high in the long game, zero in the first 100 hours. Depth: high. Unique: the game has no permanent build choice at all today. Interaction: it must live inside the bar budget (a pick changes a row, never adds one). Cost: large. **DEFER the build past the beta. Write one family's sample now.** This asks Tyler to lift the 11-05 hold on the skill tree for a spec only.

### 4.5 Magic that does something on every hero (skills that are all meaningful)

**Why Hearthrise.** A skill on the Skills window that grows and does nothing breaks the promise that every skill has a consumer (CLAUDE.md 3.5).

**Shape.** Max mana gains a small share for each Magic level, for every hero: one coefficient in VITALS. A weapon hero's Magic then means more casts between drinks, and the fists (Melee blows, Magic strikes) become coherent.

Criteria: value small but honest. Depth: a reason for a weapon hero to care about rune strikes. Unique: yes. Interaction: casters' drink bills fall, so the caster's gold cost has to be re-read. Balance: one coefficient at the formula layer. Cost: small. **REDESIGN.** HYPOTHESIS on the size. The strongest alternative is to stop paying Magic XP to weapon heroes at all.

### 4.6 Looked at and not recommended

| Idea | Why not |
|---|---|
| A ninth weapon (spear, dagger, summoner) | The eight are not distinct yet. A dagger has no identity without attack speed, which is ruled out. A summoner is the companions system, which is held |
| Attack speed by weapon | A second damage law. In an idle hunt its only decisions are ammo per damage and overkill, both small |
| Crit as a weapon's identity | Crit is gear's (uniques, Keen). Spells never crit. Leave it to the items lane |
| More heal or shell spells | The healer has three sizes of heal and a shell. The lane is full |
| A second party support class | Do it through riders on existing weapons (4.1 to 4.3), not a new seat |

---

## 5. Interaction traces

All HYPOTHESES for phase B to measure with the matrix diff. Each names its layer.

**T1. The weakness repair (content rows).**
- Combat: hatchets gain +20% damage and +15% to-hit on basic blows against the 44 sword-side monsters. Expect the axes' lone pace up 4 to 7% where matched and unchanged elsewhere. Casts do not move.
- Progression: the ways band (G2) tightens at the bottom, where the axes sat at 0.82 at Level 105 before the spell rule.
- Economy and gear: a Melee hero has a reason to own hatchets beside a hammer. More demand for a drop family that is a Rare at tiers 3 and 5 to 7.
- Parties: none.
- Watch for: the hammer staying the weak-side weapon on 36% of monsters. If the hammer leads G2 among Melee after this, move a class from blunt to edged. That is the monster lane's row.

**T2. Quarry Blow breaks a windup (one new effect, formula layer).**
- Combat: on a ground with casters, a four with a hammer takes less group damage. Expect the healer's Spring Tide to fire less and Shelter to be worth less in that four.
- Economy: Earth becomes a four-consumer family (Shelter, Arcane Barrier, Protective Ward, Quarry Blow). Healer drinks fall.
- Parties: the hammer and the shield tank now compete for the Melee seat on a caster ground with different answers. That is the wanted outcome.
- Bosses and the Tower: a lengthened windup gives casters longer to step off, so the dodgeable heavy hit gets easier. Size the share so a boss fight's loss rate moves under 5 points.
- Watch for: monster spells becoming trivial, which would undo Tyler's purpose for them. One break a cast and an 8 s clock are the limits. UNINTENDED if any ground's group spells land under half as often.

**T3. Seven spells, not sixteen (content rows).**
- Combat: no family holds two new spells, so the largest gain from the new elements is +5% a hero, not +10%.
- Economy: Storm and Bone rune use about halves. Check that a Runecrafter still has a reason to bind them at 25 and 40.
- Crafting: 10 recipes either way.
- Parties: a four's element cover now depends on which weapons it holds. A four of sword, bow, wand, staff has Storm three times and Necrotic once.
- Watch for: a ground of people (weak to Necrotic by 32-7) where a four with no axes, crossbow or wand has no answer. That is acceptable (no immunities, 15% at stake) and is the point.

**T4. "Shooters first" (targeting row).**
- Combat: the Ranger's damage moves from the leader's target to the shooter. The pack's first kill comes later, the healer takes less.
- Economy: healer drinks down. On the Krell numbers the healer took 48,900 an hour, so even a third off is real mana.
- Parties: the bow has a job the second mage does not, which is the counter to mage stacking that does not touch the XP table.
- Watch for: slower kills overall on grounds with few shooters. The mode falls back to the leader's target when none is shooting.

**T5. A status opens one damage kind (formula extension plus content rows).**
- Combat: tank + hammer and mage + hammer pairs gain up to 15% on the hammer's blows while Chill holds (4 s of 6).
- Progression: the best four on a ground may change from "one of each".
- Economy: Ice rune demand up (the Chill has to be kept up).
- Parties: this is the trace that matters. IMPROVED if three or more different fours sit within 5% of the best on most grounds. REGRESSED if one pair becomes mandatory.
- Watch for: stacking with Hunter's Mark (+20%) and Sickness (+10%). One cap on the product.

**T6. The fists as two rows (content rows, one content parameter).**
- Combat: lane fill 0.67 against the sample's 2.08. The fists' pace must be re-read against its "within 15%" promise.
- Economy: a new consumer for every rune family, Poison most of all.
- Watch for: the fists becoming the best answer on every weak-element ground because they can always match. The rune is the price. If that is not enough, keep the half-weakness field.

**T7. The crossbow's own line (content rows).**
- Combat: fewer, heavier bolts. The lone crossbow should keep about today's pace and gold.
- Economy: bolts and arrows become two markets. A heavier bolt means fewer shots an hour and a smaller ammo bill, which is part of its identity.
- Parties: the bow stays the party Ranger because the crossbow has no Mark and no area.
- Watch for: the crossbow with a shield replacing the tank. It cannot Challenge, so it should not.

**T8. Magic adds max mana (coefficient).**
- Combat: every caster casts longer between drinks.
- Economy: the mage and healer's drink bill falls. The wand already nets less gold than any way, so this narrows that gap and may make the wand's lead larger in effect. Size it small.
- Watch for: REGRESSED if the wand's net gold a hunt passes the bow's.

---

## 6. The priority list

Complexity S, M, L. Risk low, medium, high.

**Critical**

| # | Item | Why | Complexity | Risk | Benefit | Depends on |
|---|---|---|---|---|---|---|
| C1 | Roles have no job until Deadly is a fight | EVIDENCE: a real four with no shield, under-Level, 0 deaths. Every role identity in this review is worth nothing without it | L16's | L16's | Everything below | L16 (the harder tiers) |

**High impact**

| # | Item | Complexity | Risk | Benefit | Depends on |
|---|---|---|---|---|---|
| H1 | The weakness table repair, and `weaponResist` removed | S | low | The axes stop being the one weapon that is never right. EVIDENCE | the monster lane for bestiary words |
| H2 | Seven Necrotic and Storm spells, the other nine deferred | M (smaller than L44 as planned) | low | Half the content, more identity | Tyler's call on 11-18 |
| H3 | Fists as two rows, the Palm on any rune | S to M | medium | The ruled identity in one mechanic | L43, H2 |
| H4 | Quarry Blow breaks a windup | M | medium | The hammer's job in a four | Tyler's call on "no stagger", L16 |
| H5 | "Shooters first" target mode | S | low | The bow's job, and a real observed problem solved | none |
| H6 | The crossbow's own line | M | low | Two Rangers in place of one twice | ruled 32-6 gives it the list |

**Medium impact**

| # | Item | Complexity | Risk | Benefit | Depends on |
|---|---|---|---|---|---|
| M1 | A status opens one damage kind, three pairs | M | high (stacking) | The four as a build | C1, H4, a playtest |
| M2 | Magic adds max mana | S | medium | A dead skill gets a consumer | phase B size |
| M3 | The beginner's floor as one coefficient | S | low | 17 per-row floors become one number | formula audit lane |
| M4 | Turning Cut at Melee 5 | S | low | The hammer and axes get their area strike when packs begin | none |

**Low impact**

| # | Item | Complexity | Risk | Benefit |
|---|---|---|---|---|
| L1 | Say what the sword alone is, on the weapon's card | S | low | Nobody picks it thinking it is a damage weapon |
| L2 | Versions folded into the rune tier in the words | S | low | One idea fewer to teach |
| L3 | Stance defaults by seat (back row Offensive) | S | low | Removes a false choice |

**Remove or simplify**

| # | Item | Why |
|---|---|---|
| R1 | `weaponResist` | Read by nothing |
| R2 | Four of the six fist rows | One mechanic does it |
| R3 | Live Hand, Draw | Replaced by R2's mechanic |
| R4 | Quarry Blow as a copy of Flame Strike | Same spell twice |

**Defer**

| # | Item | When |
|---|---|---|
| D1 | The second Necrotic or Storm spell for each family | After the first seven are played |
| D2 | Long-term style picks at skill milestones | Sample written now, built after the beta |
| D3 | An off-hand for the sword alone | With the quivers, as late off-hands |
| D4 | Any ninth weapon | Not before the eight are distinct |

**Where only real players can tell.**

| Question | The playtest |
|---|---|
| Is a broken cast satisfying, or invisible in an idle hunt? | A hammer four on a caster ground for a week. Do players keep the rule on "when a monster is casting"? |
| Do seven spells feel like less than sixteen? | Ask after two weeks which new spell each player uses. If nobody names a missing one, nine were never needed |
| Do players find a status pair without being told? | Ship one pair with a line on both spell cards. Count the fours that hold both halves |
| Is "feed it a rune" readable on the fists? | A blind first hour with the wraps |
| Does anyone choose the bow over a second mage? | The roster of fours on Deadly a month after H5 |

---

## 7. Tyler decides

Rewritten after phase B. Each is one recommendation, its reason, and the strongest alternative.

1. **Deadly and the tank's test.** Recommend the harder tiers lane sizes Deadly so that an in-band four with a shield tank and a healer holds it, and the same four with a hammer in front or with no healer does not. Reason: measured, both of those fours are faster today and neither dies. If the shield still loses after L16, Challenge moves to any Melee hero in Defensive stance and the shield becomes plain armor. Alternative: leave Deadly and accept that the best four is a hammer and three mages.
2. **Necrotic and Storm.** Recommend seven spells first, one per weapon (Storm for sword, hammer, bow and staff. Necrotic for axes, crossbow and wand). Sixteen stays the end state as you ruled. The other nine are redesigned after the seven are played, under one rule: no two weapons share a mechanic. Reason: the plan's nine as written repeat one leech and one mana return. Alternative: build all sixteen from the plan as written.
3. **Quarry Blow.** Recommend it breaks a monster's spell windup. Reason: as built it is Flame Strike with no element, and a second melee hero costs a four 8 to 13% today because it brings nothing but damage. This reopens "no stagger" (10-23) in a narrow form: it never stops a swing. Alternative: leave it as built.
4. **Fists.** Recommend two rows. The Hands on mana with no element. The Palm on mana in the element you chose, with a rune as the stronger cast. Reason: six near-identical buttons for the "simple" weapon, and the fist prototype lost gold when every strike cost a rune. Alternative: the six rows on one shared clock.
5. **The crossbow.** Recommend its identity comes from its list and its shield: single target, no Mark, no area shots, Leech Bolt. Leave its numbers where they are. Reason: measured, a heavier stat line moved it only 3 to 6%, and in a four it already costs 16 to 24% less at the store than the bow for 1 to 2% less XP. Alternative: a list that copies the bow's.
6. **Weapon weakness.** Recommend axes count as "edged" with swords, fists as "blunt" with hammers, the unused "resists" column goes, and Rend's share rises until the axes sit with the other melee ways. Reason: measured, the repair alone leaves the axes 2 to 13% behind the hammer and last among the damage ways. Alternative: give axes their own side and move three monster classes to it.
7. **The party table.** Recommend it stays as it is until Deadly is a fight. Reason: the social review (57) asks for a table that reads size only. Measured, four mages already kill as fast as the mixed four on Deadly and do not die, so on a size-only table they would be the best four in the game. Alternative: size only now, as 57 recommends, and fix the mage in combat afterwards.
8. **Magic on a weapon hero.** Recommend Magic adds a little max mana for every hero (measured at half a percent a level). Reason: the skill has no use on a weapon hero today, and the change cut store bills 2 to 4% with nothing else moving. Alternative: stop paying Magic XP to weapon heroes.
9. **The skill tree hold (11-05).** Recommend lifting it for a written sample only: one weapon family, four picks at skill 70 to 100. Reason: nothing on any bar changes after hunted hour 254 and Levels are endless. Alternative: keep the hold and let gear alone carry the long game.
10. **The six spell rule calls** (`CONFLICTS.md`, 2026-11-21). The formula audit (41, 44) has answered them and I agree with every answer:
    - Call 1, the beginner's floor: **one floor on the blow a cast reads, in place of 17 per-row floors** (roadmap R6, the 0.2.144 half). Three lanes reached this separately.
    - Call 2, Rend on the default Melee set: **yes.**
    - Call 3, Turning Cut's unlock: **Level 1 for the axes and the hammer, 10 for the sword.** This is 41's answer and I drop my "Melee 5 for all". It gives the hammer and the axes back exactly what the merge took and keeps your 11-19 ruling whole.
    - Call 4, the x1.4 ladder: **yes.**
    - Call 5, heals land whole: **yes.**
    - Call 6, the dark rows: **sized by L43 and L44 on calls 2 and 4 above.**

---

## 8. For other areas

| To | What |
|---|---|
| Formula audit (41 to 44) | (1) A weapon's accuracy is worth about an eighth of its strength on the ratio at 85% base to-hit. Is accuracy still a stat? (2) The flat 3% of defense off every blow favors big single blows over multi-hit rows and ticks. Intended or accidental? (3) `weaponResist` is an authored column with no reader. (4) The beginner's floor is 17 per-row numbers that one coefficient could replace. (5) Mana per version is a hand-written x1.2 ladder on 16 rows, which is one coefficient. (6) `party`, `alone`, `weakPm` and the row-level `skill` are four special flags, each on one to three rows: classify them |
| Monsters and grounds | (1) The weak-side counts: hammer 68, ranged 58, sword 44, magic 19 of 190. (2) Storm is weak on 7 monsters and one below Level 173, so a Storm spell's worth is its rider until the Old Guard. (3) Shooters put 28% of a real four's damage on the healer. Which grounds have them, by design? (4) Monsters that mend are Blight's only reason: Krell's Hold and the Ox Road. (5) If the cast break is approved, every caster needs a "broken" state and bosses a windup share |
| Tiers (L16) | Critical C1. Size Deadly on the real four (hammer in front, healer on Chalked Water), and run the tank's test of section 7 item 8 |
| Items and gear | (1) Medium armor gives no pool, only dodge, and the back row is rarely hit: what does a Ranger wear and why? (2) The sword alone has an empty hand. (3) The crossbow's line needs its seven tier rows re-cut. (4) Fist wraps exist at tiers 1 and 2 only |
| Economy and crafting | (1) Earth becomes the busiest rune family if the cast break ships. (2) Seven spells halve Storm and Bone rune demand. (3) A healer heals at 0.07 gold a health point against 1.5 for food, so "struggle or pay" does not pay in a four |
| Social and parties | The party table's step from three classes to four is 2%. It will not stop two mages. Do not fix that in the table |
| Game Director (60) | Combat's answer to the overarching question: same foundation, far fewer mirrored rows, and one job a weapon |

---

## 9. Evidence and hypotheses

**EVIDENCE, read from the code and data on `set/v0.2.144`:**

- Every row, share, cooldown, lane, unlock and flag: `src/data/abilities.js`.
- Quarry Blow and Flame Strike carry the same `hitPm` 1400, `cdMs` 8000, mana 10 and version ladder.
- Roles, keys and the shield arm: `src/data/hunt-roles.js`. Bow and crossbow both resolve to the `ranged` list.
- Weapon tier rows: `src/data/gear-tiers.js` WEAPON_FAMILIES.
- The weakness axis and its reader: `monster-classes.js` WEAPON_AXES, `combat.js weaknessInfo`, `damage.js blow` (basic blows only).
- The weak-side counts: a read-only loop over `MONSTERS` (190 rows) run for this review. Axe 0, fists 0.
- `weaponResist` has no reader under `src/core`, `src/shell`, `src/hunt-view`, `src/session` (searched).
- Chill, Sickness and Withered do not stack. Bleed stacks to five: `statuses.js`.
- The party cells 970 / 1580 / 1670 / 1700: `party-class-xp.js`.
- Magic has no reader on a weapon hero: `abilities.js` (`abilitySkill`, Mend's `healHpPm`), `core-model.js` VITALS.
- The accuracy against strength arithmetic: `to-hit.js` (the ratio, base 20, REF_HERO), `balance-sheet.js` heroHit 0.85, `combat.js` max hit. Calculated, not played.
- The one basic-attack interval: `combat.js` COMBAT_BALANCE.tickMs.

**EVIDENCE, cited from other lanes' measurements:**

- The real four at Krell's Hold, its seats, damage, healing and deaths: `11-krell-hunt-2026-11-20.md`. THIN: one person, one day.
- Party hours, own fours, Defense by seat, heroes that changed weapon: `10-real-players.md`. Two to five accounts.
- The ways table before the spell rule and the lane fills: `21-combat.md` B4, B5.
- The bar never changing after hour 254, the dead rows, the dark rows' lane fills: `32-spell-audit.md`.
- What moved under the spell rule (G2 1.14 to 1.32, G5 71 to 73%, the hammer -24% without an area strike): `CONFLICTS.md`, 2026-11-21.

**HYPOTHESES, for phase B or a playtest:**

- Mage stacking is the best four.
- The shield tank is needed after L16.
- The axes are best on long-lived targets and worst on packs.
- Each interaction trace in section 5, with its IMPROVED, REGRESSED and UNINTENDED lines.
- One floor near 16 on the blow reproduces the first six hours within the pace guard.
- Every statement that something will be fun.

**Not done in phase A** (section 10 is the phase B record). Nothing was played. No grid, matrix or browser run. `51-baseline.md` had not landed when this was written, so its red list is not reflected. The paper spells' full text (itemization plan Appendix B3) was read through the 11-20 audit's summary of it, not the appendix itself. The monster count is the whole table, not only the monsters on live grounds.

---

## 10. Phase B: layers, measurements, and what changed

Phase B, 2026-11-21, on `set/v0.2.144` 358417cb0 merged into this lane. Read first: `41-formulas-combat.md`, `44-formula-architecture.md` (sections 5, 7, 8), `46-from-scratch.md`, `47-itemization-fit.md` (rows 7, 13-5, 13-7, B3, F5, C4, C5), `57-review-social.md` (its party table call), and `docs/design/itemization-plan.md` section 7 and Appendix B.

### 10.1 How it was measured

- **The matrix diff.** `node tools/balance-program/balance-matrix.mjs --diff tools/balance-program/patches/combat-<n>.json --subset --workers 2 --blocks ways --only 10,30,60,110` (combat-3 also played `--blocks ways,four --only 30,60,110`). The real engine on a scratch copy, the same dice before and after, one seed and one hour a cell, MID gear, Normal for the lone ways. Each run took 34 to 73 seconds. `pc-load` read 20 to 45% CPU before each.
- **The lineups.** The matrix plays one four (tank, healer, bow, mage). To test party claims I played other fours through the matrix's own exports (`loadGridData`, `loadKits`, `buildCell`, `playJobs`, `cellMetrics`) from a one-off read-only script, on the tree as it stands: MID gear, the hardest tier, the grid's own ground for a four at that Level (the Muster Barrows at 60, Krell's Hold at 110), one seed, one hour. No patch. **One seed and one hour is thin. Read the lineups as direction and size, not as a balance number.** The matrix lane should add these lineups as real cells (10.6).
- **The calibration caveats apply** (printed on every run): the harness four kills 11% more than the real one, its tank takes 96% of the damage where the real front takes 69%, and its store bill is 1.9 times the real one. So party store and gold are upper bounds, and "the healer is not needed" is understated in the harness if anything, because the harness sends almost nothing at the back row.
- **Time.** Nothing in this review is counted in weeks. Where a horizon is needed it is 50-standards 2.7 (Krell's Hold on day 18 for a four on Deadly).

### 10.2 Every top proposal, with its layer

Formula and step ids are 44's and 41's. Knob ids are `tools/balance-program/formulas/knobs.json`.

| # | Proposal | Layer | Formula, exception or step | Measured? |
|---|---|---|---|---|
| C1 | Deadly is a fight | coefficient | `tierDanger`, `tierHp` (C-TIER). Owned by L16 | Yes, as lineups (10.4) |
| H1 | Axes read the sword's side, fists the hammer's. `weaponResist` goes | content row (a family to side map) plus one deletion | C-WEAKNESS, exception S-X01 | Yes, combat-1 |
| H1b | Rend's share up until the axes sit with the melee ways | coefficient on a content row (`hitPm`, bleed `blowPm`) | C-SPELL-HIT | Sized by need, not yet patched (10.5) |
| H2 | Seven Necrotic and Storm spells first | content rows | L44, 47 C4 | No: the rows are paper. HYPOTHESIS about content |
| H3 | Fists as two rows, the Palm on mana with a rune as the stronger cast | content rows, one content parameter (the element a row lands) | L43, 47 C5 | No: no fist way in the matrix. HYPOTHESIS about content |
| H4 | Quarry Blow breaks a windup | formula (one new reusable effect on a row, read in the monster cast step) | a new mechanic beside C-MON-SPELL. Class 1 in brief 40's terms, needs Tyler's yes | No: the effect does not exist. HYPOTHESIS |
| H5 | "Shooters first" target mode | content row (TARGET_MODES) plus one ordering in the targeting formula | C-TARGET | No: the harness four sends 0.5% of damage to the healer, so the matrix cannot see the problem this solves (10.6) |
| H6 | The crossbow's own line | content rows | C-GEAR-WEAPON for the stat half, the ability list for the rest | Stat half yes, combat-2. List half is content, HYPOTHESIS |
| M1 | A status opens one damage kind | formula (extends `takenPm` with a damage-kind key), then content rows, under 44's one modifier table (X-STACKING-RULES) | C-HURT | No. HYPOTHESIS |
| M2 | Magic adds max mana | coefficient | P-VITALS, beside `heroMana` | Yes, combat-3 |
| M3 | One floor on the blow a cast reads | coefficient | X-SPELL-FLOOR, roadmap R6, planned knob `powerFloor` | Not by me: the matrix starts at Level 10 and the floor acts under about 15. R6's own diff on Levels 1 to 15 is the measurement |
| M4 | Turning Cut's unlock | content row (a per-weapon unlock field) | X-TURNING-CUT-10 | Not by the matrix (Level 10 is past it). CITED: lone hammer 24% slower at the Thicket without it |
| - | Physical strikes read weapon weakness (44's, not mine) | formula | X-SPELLS-SKIP-WEAKNESS, R6 second half | Yes, combat-4 and combat-5 |
| D2 | Style picks at skill milestones | new system | none. HYPOTHESIS about content | No |

### 10.3 The lone ways today (the before column of every run)

MEASURED, lone, MID, Normal. Level XP an hour as a share of the hammer's, and net gold an hour.

| Way | 10 | 30 | 60 | 110 | Net gold an hour at 60 |
|---|---|---|---|---|---|
| Sword and shield | 0.84 | 0.91 | 0.92 | 0.84 | 12,461 |
| Sword alone | 0.96 | 1.00 | 1.00 | 0.93 | 15,388 |
| Hammer | 1.00 | 1.00 | 1.00 | 1.00 | 16,820 |
| Axes | 0.86 | 0.95 | 0.88 | 0.87 | 14,023 |
| Bow | 0.94 | 1.09 | 1.09 | 1.01 | 7,122 |
| Crossbow and shield | 0.95 | 1.08 | 1.05 | 0.96 | 15,333 |
| Wand | 1.11 | 1.21 | 1.31 | 1.20 | 83 |
| Staff | 0.82 | 0.89 | 0.91 | 0.89 | -2,203 |

Readings. The wand leads by 20 to 31% from Level 30 and pays for it in gold. The axes are the slowest damage way at three of four Levels. The sword alone is level with the hammer to Level 60, which the spell rule did (its strikes scale now). Every lone way is over the pace band P2 (0.95 to 1.10 of the contract) at Levels 10, 60 and 110: that is a baseline red, not something a patch here caused, and it is why the diff calls any speed-up "REGRESSED away".

### 10.4 The fours (lineups on Deadly, no patch)

MEASURED, one seed, one hour, MID. Level XP a hero-hour, against the matrix's four.

| Four | Level 60: XP, vs mixed | Low HP, deaths | Level 110: XP, vs mixed | Low HP, deaths |
|---|---|---|---|---|
| tank, healer, bow, mage (the mixed four) | 797,900 | 0.78, 0 | 1,203,700 | 0.86, 0 |
| **hammer**, healer, bow, mage | 878,500, +10% | 0.75, 0 | 1,265,700, +5% | 0.86, 0 |
| tank, healer, **mage**, mage | 857,900, +8% | 0.78, 0 | 1,218,800, +1% | 0.86, 0 |
| hammer, healer, mage, mage | 915,900, +15% | 0.76, 0 | 1,261,400, +5% | 0.87, 0 |
| **hammer, mage, mage, mage** (no healer) | 970,100, +22% | 0.49, 0 | 1,220,700, +1% | 0.82, 0 |
| mage, mage, mage, healer (nobody in front) | 702,300, -12% | 0.84, 0 | 1,184,800, -2% | 0.87, 0 |
| mage x4 (one class, cell 970) | 465,500, -42% | 0.78, 0 | 735,400, -39% | 0.82, 0 |
| tank, healer, **crossbow**, mage | 781,600, -2% | 0.78, 0 | 1,188,100, -1% | 0.86, 0 |
| tank, healer, **hammer**, mage | 717,900, -10% | 0.77, 0 | 1,106,000, -8% | 0.84, 0 |
| tank, healer, **axes**, mage | 692,600, -13% | 0.77, 0 | 1,064,000, -12% | 0.83, 0 |
| hammer x4 | 449,500, -44% | 0.37, 1 in the hour | 593,000, -51% | 0.66, 0 |

What this turns from hypothesis into evidence:

1. **The shield tank is a worse fourth than a hammer.** +10% and +5% for swapping it out, no deaths, the same low point. Phase A had this from one real hunt. The engine agrees.
2. **The healer is not needed on Deadly at Level 60.** A hammer and three mages is the fastest four measured there, dips to 49% and does not die. Its store bill is the highest (24,400 against 15,500), so it pays gold for the speed.
3. **Nobody is needed in front.** Three mages and a healer, and four mages, both hold Deadly with no deaths. Four mages kill 944 and 1,614 monsters an hour against the mixed four's 925 and 1,506. Only the one-class cell (970 against 1,700) keeps them from being the best four.
4. **Mage stacking is real and modest with a tank (+8%, +1%), and larger without one.** Phase A's hypothesis holds in direction. The bigger effect is not the second mage. It is that the two "safety" seats can be dropped.
5. **A second melee hero is the worst use of a seat**: -8 to -13%, of which 2 points are the class cell. The axes are the worst of them. This is the measured size of "melee damage brings nothing but damage".
6. **The crossbow is the better Ranger in a four for gold**: 1 to 2% less XP for a store bill 16 to 24% lower.

The tier dials are L16's. The finding for L16: on today's dials the low point of a Deadly four is 0.75 to 0.87 with no deaths, and a four with no healer bottoms at 0.49 and lives.

### 10.5 The patches

| Patch | What it plays | Target | Flags | Gate |
|---|---|---|---|---|
| `combat-1.json` | axes read the sword's weak side | pace | IMPROVED 0, REGRESSED 2, UNINTENDED 1 | FAIL (1 unintended) |
| `combat-2.json` | crossbow: accuracy -23%, strength +33% at tier 7 | pace | IMPROVED 0, REGRESSED 3, UNINTENDED 5 | FAIL |
| `combat-3.json` | Magic adds 0.5% max mana a level | gold, survival | IMPROVED 19, REGRESSED 5, UNINTENDED 0 | **PASS** |
| `combat-4.json` | a physical strike reads weapon weakness (44 R6) | pace | IMPROVED 3, REGRESSED 7, UNINTENDED 29 | FAIL |
| `combat-5.json` | combat-1 and combat-4 together | pace | IMPROVED 3, REGRESSED 8, UNINTENDED 31 | FAIL |

**combat-1, the weakness repair.** Only the axes moved. Level XP an hour: +1.5% at 10, +3.8% at 30, +4.8% at 60, 0 at 110 (Krell's Hold has no sword-side monsters for a lone hero). Damage taken -2.6 to -4.8%. Against the hammer the axes go from 0.86 / 0.95 / 0.88 / 0.87 to 0.88 / 0.98 / 0.92 / 0.87.
- REGRESSED, axes P2 at 10 (1.286 to 1.305) and 60 (1.120 to 1.173): the axes were already over the pace band and went further over. Every way is over it today. Against the other ways this is the wanted direction.
- UNINTENDED, axes S1.mid at 60 (0.890 to 0.899, still off): the low point of a typical fight rose one point because fights are shorter. Traced: it is the same effect as the pace move, on the survival band. Harmless.
- Verdict: KEEP the proposal, and it is **not enough**. The axes stay last among the damage ways. Rend's share and its bleed have to come up as well (H1b), sized so the axes land between 0.95 and 1.00 of the hammer at Levels 30 to 110. That is one content coefficient, to be patched once R6's floor is in so each number moves once.

**combat-2, the crossbow's stat line.** Only the crossbow moved: Level XP 0 at 10, +3.1% at 30, +5.4% at 60, +6.0% at 110.
- REGRESSED, crossbow P2 at 30, 60, 110: it was over the band and went further.
- UNINTENDED: S1.mid at 110 (0.892 to 0.925): it took 15% less damage there because monsters died sooner. G-2 and G-9 (the store's share of income) at 30, 60, 110 moved under a point each: heavier bolts change kills an hour and so the share. All five are the pace move seen from the survival and gold bands.
- Verdict: **CHANGED.** A third more strength for a quarter less accuracy is worth 3 to 6%. That is too little to make a weapon feel different and it pushes a way that is already fast further over the band. The stat-line half of H6 is withdrawn. The crossbow's numbers stay. Its identity is its list and its shield. It also corrects my phase A arithmetic, which predicted about +10% for this trade at Level 60. It measured +5%, so that arithmetic overstated strength against accuracy.

**combat-3, Magic adds max mana.** No way's pace, kills or damage moved. Store gold fell 2.3 to 3.8% for the mage and the healer, 1.6 to 3.6% for the bow, crossbow and sword at Level 30, and 0.9 to 2.5% for the four. Net gold rose 2.9 to 4.1% for the casters where it was positive (the mage's net at 60 went from 83 to 582 gold an hour, which prints as +601%).
- IMPROVED 19: the store-share bands G-2 and G-9 moved toward their range for the mage, the healer and the four, and G-1 (net gold rising from checkpoint to checkpoint) for the mage and the healer at 60.
- REGRESSED 5: G-9 at Level 30 for the bow, crossbow and sword moved half a point away, because those ways already spend under the band's floor and now spend a little less. G-2.deadly at 30 and G-4 at 110 for the four moved 1 to 2%. All five are the same cheaper drinks.
- UNINTENDED 0. Gate PASS.
- My phase A worry was that it widens the wand's lead. Measured: the wand's XP did not move at all. Its gold moved 3 to 4%. Verdict: KEEP, at this size.

**combat-4 and combat-5, strikes read weapon weakness (44's R6).** Median Level XP change by way: tank 0, sword 0 (up to +3.5% at 60), hammer -0.3% (+2.5% at 110), bow +0.7%, crossbow +0.9%, axes 0. With the table repaired as well (combat-5) the axes read +0.5% at 10, +5.8% at 30, +7.3% at 60 against today.
- The 29 and 31 UNINTENDED rows are small moves of the survival and store-share bands on the ways whose strikes got 20% bigger on some monsters, plus dice: changing one strike's roll changes every later roll in that hour, so a way with no physical strike on a weak-side monster still moved a point (the hammer at 60 reads -1.1%). No row changed a band's status except bow G-9 at 110 (off to ok) and sword G-2 at 10 (off to ok).
- Verdict: I agree with 44's call. The effect is small, at most 3.5% on one way at one Level. **CHANGED:** phase A warned that R6 on today's lopsided table would favor the hammer. Measured, it does not in any way that matters. The two changes can ship in either order. Shipping them together gives the axes the most (+7.3% at 60).

### 10.6 What the matrix could not measure, and the run that would

| Proposal | Why not | What settles it |
|---|---|---|
| H4, the cast break | the effect is not built | Build it on a scratch branch behind the row. Matrix cells on the grounds with casters (53 counts 14 casters of 52 open-ground monsters), a hammer four against the mixed four. Then a week of play: do players keep the rule on "when a monster is casting" |
| H5, shooters first | the harness four sends 0.5% of its damage to the healer where the real four sends 28.5% | Fix the calibration first: the matrix needs the real four's lineup and a ground whose shooters reach the back row. Then the healer's damage taken and drinks, before and after |
| H2, seven spells | paper rows | L44's own sample measurement, with the leech linings (47 M13) |
| H3, the fists | no fist way in the matrix | L43, after the itemization plan's Finding 5 is re-run on the spell rule engine |
| M1, status pairs | not built | A three-pair sample. IMPROVED if three or more different fours sit within 5% of the best. Then play |
| M3, the floor | the matrix starts at Level 10 | R6's diff on Levels 1 to 15 |
| The lineups of 10.4 | played once, one seed | **For the matrix lane:** add `hammer,healer,bow,mage`, `hammer,mage,mage,mage`, `mage,mage,mage,healer` and `mage x4` to the four block, at 2 seeds. They are the cells L16 has to turn red to green |

### 10.7 Where the other docs decided, and whether I agree

| Doc | Decision in my area | My answer |
|---|---|---|
| 41 call 1, 44 section 8 row 6, roadmap R6 | One floor on the blow a cast reads, in 0.2.144 | **Agree.** Three lanes reached it separately (41, 44, this review). That is convergence |
| 41 call 2, 44 section 5.1 | A physical strike reads weapon weakness. Spells never miss and never crit | **Agree**, and measured small (combat-4) |
| 41 call 7 | Turning Cut from Level 1 for weapons without a shield, 10 for the sword | **Agree. I change my answer** from "Melee 5 for all". A per-weapon unlock is a data field and it bends no ruling |
| 44 S-X01 | `weaponResist` is read by nothing: wire it or delete it | **Delete.** Wiring it would add a third weakness sign for players to track, on a system measured at under 5% |
| 44 S-X03 | The mana ladder as one coefficient | Agree |
| 44 X-PARTY-ONLY-ROWS | Keep the alone and party-only gates, documented | Agree |
| 47 C4 | Sixteen stays the end state. My seven are the first batch. The other nine are redesigned so no two weapons share a mechanic | **Agree.** It is a better answer than my "defer nine", because it keeps the ruling and still removes the mirrored rows |
| 47 C5 | Fists as two rows, with the Palm striking on mana and a rune as the stronger cast | **Agree.** I had the rune as the only way to cast it. The plan's Finding 5 shows that loses gold from Level 42 |
| 47 M13 | Spell leech and lining leech measured together | Agree. It applies to Leech Bolt in the first seven |
| 46 section 3c | Defer Necrotic and Storm and the fists whole | **Disagree in part.** Both are ruled and both give a weapon its identity. Order them after L16, not out of the plan |
| 46 (the starting hero) | The default hero is sword and shield, the worst lone pick, and its next spells are party only | **Same conclusion, reached separately.** Measured here: 0.84 to 0.92 of the hammer alone, and 5 to 10% slower as the front of a four. Let the player pick the first weapon |
| 57 call 2 | Party XP reads size only. The class count goes | **Conflict. Keep the class count for now.** Measured: four mages kill as fast as the mixed four on Deadly and do not die, so on a size-only table they are the best four in the game. 57 itself says that in that case the fix belongs in combat. I agree with that sentence. So the order is L16 first, then re-measure, then 57's table |
| 53 (handoff to 52) | The model four kills 558 an hour on Krell's Deadly in the grid against 1,251 real | The matrix's four reads 1,386 there and my lineup 1,506 at Level 110. The grid cell 53 read is stale against the matrix. For the baseline lane |

### 10.8 The itemization plan

Read: section 7 (the fist line), Appendix B1 to B3, Finding 5, and Tyler's section 13 answers through 47.

| Plan | This review |
|---|---|
| 13-5, "each weapon type to have a spell for both" | Kept as the end state (47 C4). Changes the plan's sample from four spells to seven, and its batch of ten to a redesigned nine |
| Section 7, cost: "elemental strikes on mana, a rune is the optional stronger cast" | Kept. I drop "the Palm needs a rune" |
| Section 7, element "by choice through Charged Hands", and Live Hand and Draw | Changed: one Hands row and one Palm row. The Palm covers Storm and Necrotic, so Live Hand and Draw are not built |
| 13-7, the fist promise | Unchanged. To be re-measured in L43 |
| B1, Necrotic cuts healing and Storm burns mana on a hero | Agrees. It is the monster side of the elements and the reason Static Ward (staff, Storm) is in the first seven |
| 13-12, quivers as late bow off-hands | Agrees with keeping the bow two-handed and distinct from the crossbow with a shield |

### 10.9 Verdicts that changed since phase A

| Row | Phase A | Now | Why |
|---|---|---|---|
| Sword alone | "dominated, 0.85 to 0.96 of the hammer" | KEEP, and not dominated | Measured level with the hammer from 10 to 60 after the spell rule |
| Crossbow | REDESIGN its stat line and its list | REDESIGN its list only | combat-2: the stat line is worth 3 to 6% |
| The accuracy number | "about an eighth of strength" | worth more than that in play | combat-2 predicted about +10% on that arithmetic and measured +5% |
| Hatchets | REDESIGN (the table) | REDESIGN (the table and Rend's share) | combat-1: the repair leaves the axes last |
| Turning Cut's unlock | Melee 5 for all | Level 1 for axes and hammer, 10 for the sword | 41's answer is cleaner |
| The seven second Necrotic and Storm spells | DEFER | REDESIGN, then build | 47 C4 |
| Fist Palm | a rune every cast | on mana, a rune is the stronger cast | 47 C5 and Finding 5 |
| R6 weakness against the table repair | "repair the table first" | either order | combat-4 and combat-5 |
| Mage stacking | HYPOTHESIS | EVIDENCE in direction, +8% and +1% with a tank | 10.4 |
| "The tank has no job" | EVIDENCE from one real hunt | EVIDENCE from the engine as well | 10.4 |
| Magic adds max mana | HYPOTHESIS, medium risk | EVIDENCE, gate PASS | combat-3 |
| The healer in a four | not questioned | not needed on Deadly at Level 60 | 10.4 |

The verdict counts of section 3.1 move in one place: the seven second spells go from DEFER to REDESIGN (the fists' two, Live Hand and Draw, stay removed because the Palm covers them). KEEP 46, REDESIGN 17, ADD 12, DEFER 2, REMOVE 3, MERGE 1.
