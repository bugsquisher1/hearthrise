# Balance program 44: the formula architecture, whole game

Lane `lane/d-formula-architecture` (systems architect, 2026-11-21), on `set/v0.2.144`. The brief is Tyler's, `40-formula-brief.md`. This is the synthesis of its section 8: the whole-game items 3, 5, 6 and 7, and the deduped versions of items 1, 2 and 4. It rests on the three category audits (`41-formulas-combat.md`, `42-formulas-progression.md`, `43-formulas-economy.md`) and their registers. **No game code, data, migration or guard logic was changed.**

The tables marked GENERATED are written by `tools/balance-program/formulas/architecture-register.mjs` from the three registers and one merge list, so every count on this page is counted, not typed. The same content is machine-readable in `tools/balance-program/formulas/formulas-architecture.json`. The knob set is `tools/balance-program/formulas/knobs.json`.

Labels. CONFIRMED and HYPOTHESIS are each lane's own marks, kept row by row. MEASURED means the real engine played it. COMPUTED means the game's own functions were called. PROJECTED means Levels past 185, where gear and grounds are stand-ins. JUDGED marks a call of mine in section 5, with its reason.

The design side (what the game should be) belongs to the Game Director (`46-from-scratch.md`) and the eight reviews (`52` to `59`). Where one of them asks the formula audit a question, the answer is here and says so.

---

## 1. Summary

**Is Hearthrise one formula system or a pile of exceptions today?** It is one formula system at the core with a pile of exceptions around it. The core is real. One engine runs every fight. Every blow goes through one door. One formula writes 70 of the 72 newer monsters. Rewards have one generator. No hunting ground has its own combat code. The pile is in the numbers around that core. Of 129 exceptions, 57 are accidental, and almost all of those are numbers that patch another number.

**The counts, after merging what two or three lanes filed twice.**

| | Count |
|---|---|
| Formulas | 107 (131 before the merge) |
| Exceptions | 129 (154 before the merge, 3 added from the design reviews) |
| Foundational rules to keep | 12 |
| Content numbers that belong in data | 25 |
| Intentional special rules | 35. 26 have a ruling of yours on record. 9 have none |
| Accidental complexity | 57 |
| Confirmed by reading the code | 115. The other 14 are hypotheses and each says what would confirm it |

**The ten worst violations.**

1. **The game has no formula for gear past Level 88.** Monster health and hero health grow with Level forever. Weapons and armor stop at tier 7. A hero in today's gear earns 0.91 of the pace at Level 400, 0.47 at Level 1,000 and cannot hunt at Level 2,000. The only formula that fixes it sits in a simulator folder.
2. **What a kill pays has no term for how fast a ground's monsters die.** So every ground got a hand correction. That is 15 XP multipliers, 13 tier rows, a floor rule, and a scaled-hunt number changed seven times. The Level curve, the pace target and kill XP were then fitted to each other in a circle.
3. **A tier's difficulty dial is applied three times.** It raises the blow, the hit chance, and the monster's Level as armor reads it. On Wickstead's Deadly a Level 8 monster counts as Level 21 against armor and pays 2.7 times the Defense XP.
4. **Gold coming in is a formula and every gold sink is a list that ends.** The 0.7 gold cut is typed 11 times and patched 3 more times in the shop's prices. Tempering, hero slots and the House all stop. From Level 110 gold only piles up.
5. **Rules you made and the code disagree.** The Level-keyed party XP cut you ruled out on 11-08 is live. The Tower heat you dropped on 11-20 is live. The yard fee is not the fee you ruled. The rested bank fills and pays nothing.
6. **The wiki shows damage numbers the engine does not read.** The hit formula uses 0.35, 0.6 and 2 typed in place. The named dials with the same values are read by the wiki only.
7. **118 of 190 monsters are typed by hand, and a monster's damage depends on its art tier.** The art tier multiplier is 5.4, 4.0, 3.0 or 2.2. It does nothing for formula monsters and decides the damage of the rest.
8. **Party grounds carry three patches inside their formula, and four grounds carry their own tier dials.** Each one was added because one party on one ground read wrong.
9. **Spells ignore half the combat stats and nobody decided that.** A spell cannot miss, cannot crit and gets no weapon bonus. Accuracy and crit gear are worth less the more a hero casts.
10. **The measuring tools do not yet measure the game.** Past Level 185 the simulator plays heroes with skills the game cannot give. Its party's healer takes 1% of the damage where the real one takes 28%. Its store bill is twice the real one. A blow can be replayed but not explained, because nothing records which step took what.

**The Levels where formulas break.**

| Level | What breaks |
|---|---|
| 5, 10 and 16 | The Level curve's hand rows meet. The cost of a Level jumps 4.1 times at 5 and 1.9 times at 10 and 16 |
| 30 on | All three Blessings cost minutes of gold and save days of XP. Never a choice |
| Skill 60 | The last rune tier. Nothing after it |
| Skill 75 to 100 | The yard pays one flat rate, so one skill level takes 51 to 243 yard hours |
| 88 | The last gear tier |
| 110 on | Priced sinks end. The scaled-hunt price stops climbing. Gold piles up |
| 111 | Kill speed starts to fall on today's gear |
| 120 | Plate leaves its 60% cap and fades |
| 185 | Heal spells fall behind health. The simulator's gear and grounds become stand-ins |
| 300 | Today's gear stops keeping pace. One death costs over 89 hunted hours |
| Tower floor 100, then 300 | Blows compound 1.2% a floor. Past 300 the Tower replays floor 300 |
| 400 | Skill is under a quarter of a hit. XP a kill starts to outrun the pace line |
| 1,000 | Skill is 14% of a hit. A death costs 759 hunted hours |
| 2,000 | A hero alone cannot hunt in today's gear |

**What holds to Level 5,000.** The monster formula, hero health and mana, the tail of the Level curve, the party split, crit and leech. On a gear curve that grows with Level the pace holds from Level 200 to 5,000 with no other change.

**What I propose.** No new mechanics. One framework for each category, built from what the game already does somewhere: a gear curve, a kill reward that follows the pace line, one tier table, one wage curve for prices. That removes 56 of the 57 accidental exceptions. 33 knobs are live today and 18 more arrive with the model. The work is 28 ordered steps. 11 fit the 0.2.144 beta whole and 2 more in part, because they change no number, fix a bug or build a ruling you already made. The rest come later. 11 steps need your yes before they start.

**What I need from you.** Section 8. The four that unblock the most work are the gear curve, the kill reward, the hidden party XP cut and the one-number spell floor.

---

## 2. The deduped formula and exception inventory

Three lanes filed 131 formulas and 154 exceptions. The same thing was often filed twice: the largest blow is in combat and in progression, the tier table is in all three. The merge keeps one row, names the ids it absorbed, and says which lane owns which half. Where two lanes gave the same thing different classes, I picked one and the row says why. That happened 6 times.

<!-- GENERATED:COUNTS (tools/balance-program/formulas/architecture-register.mjs --write) -->
| | The three lanes | After dedupe |
|---|---|---|
| Formulas | 128 (combat 41, progression 36, economy 51) | **106** (22 were the same formula filed twice) |
| Exceptions | 149 (combat 65, progression 47, economy 37) | **125** (27 merged away, 3 added from the design reviews) |
| Class 1, foundational | | 12 |
| Class 2, content number | | 24 |
| Class 3, intentional special rule | | 33 (25 with a ruling on record, 8 with none) |
| Class 4, accidental | | 56 |
| Confirmed, hypothesis | | 112, 13 |
| Rows where two lanes disagreed on the class | | 5 |
| Edges between formulas | | 193 (64 cross a category) |
| Formulas that sit on a circle | | 56 |
<!-- END GENERATED:COUNTS -->

Ids. Combat rows keep their ids (`C-...`, `X-...`). Progression and economy both numbered their exceptions X01 on, so those are `P-X01` and `E-X01` here. Three rows are mine, `S-X...`, raised by the design reviews and checked: an authored resistance column that no engine code reads, the store's hand-typed heal prices, and the mana ladder (a hypothesis, not read). One thing a review raised was wrong: `SUPPLY_SHOP_OFFERS` is not dead. The Shop's price list is built from it (`src/data/shops.js:451-454`).

Two corrections the combat lane took after the other two audits landed, both carried here. The reference hero's straight line past Level 1,000 overstates skill, so the played numbers of `42` section 7.2 are the ones quoted on this page. And a dry shot at x0.25 (`src/core/ammo.js` `AMMO_DRY_MULT`) is a multiplier on the basic blow that the combat inventory missed. It is merged into `C-BASIC-BLOW`.

### 2.1 Formulas

Full parameters, every implementation site and every consumer are in each lane's own register. This is the index, one row a formula.

<!-- GENERATED:FORMULAS (tools/balance-program/formulas/architecture-register.mjs --write) -->
| id | also filed as | categories | what it computes | where | state |
|---|---|---|---|---|---|
| C-HERO-POWER | P13 | combat, progression | A hero's largest blow (maxHit): floor(0.35 x (weapon skill + worn +skill) + 0.6 x summed damage bonus + 2), then x the weakness factor, then x (1 + damage buff). Never under 1 **Owner:** combat owns the expression. Progression owns what a skill level is worth | src/core/combat.js:358-426 playerCombatRolls | live |
| C-HERO-TOHIT |  | combat | A hero's chance to land a basic blow: ratio(20 + skill + worn accuracy, the monster's evasion) x 1.15 on a weak-weapon match, held to 5%..97%. Steady then turns a share of the misses into hits | src/core/combat.js:384-389 | live |
| C-BASIC-BLOW | E19 | combat, hunting and economy | One basic blow: miss is 0, a hit is a whole number 1..maxHit with equal odds (mean (maxHit + 1) / 2) **Owner:** combat owns the blow, and a dry shot at x0.25 (src/core/ammo.js AMMO_DRY_MULT) is a multiplier on it that the combat inventory missed. Economy owns the bill | src/core/combat.js:482-485 rollAttack | live |
| C-CRIT |  | combat | Critical basic blows: chance = clamp(gear critB + crit buff + set bonus + Keen, 0, 0.60). A crit is max(damage + 1, floor(damage x 1.5)). The set bonus is 1% a tier for 5+ armor pieces of one tier and line | src/core/combat.js:428-432 | live |
| C-WEAKNESS |  | combat | The damage factor against one monster: weapon weakness 1.20 x bane (at most 1.40) x weapon element (at most 1.15), the product held to 1.90. A weapon match also gives x1.15 accuracy | src/core/combat.js:301-345 weaknessInfo | live |
| C-HURT |  | combat | Every amount that lands on a unit, in this order. On a monster: x element (a weakness at the tag's weakPm share) then minus the defence cut, x the cast's power (version, store, surge, mark), x the boss guard, x the dealer's stance, x the t… | src/core/hunt/damage.js:117-145 hurt | live |
| C-MON-DEF |  | combat | A monster's defence: floor(def x 0.03) whole points off every blow and every tick it takes | src/core/combat.js:462-464 defenceReduction | live |
| C-ELEMENT-MON |  | combat | What an element is worth on a monster: 1000 - 10 x its profile's percent, the percent held to ELEMENT_PCT. A row with weakPm lands only that share of a weakness | src/core/elements.js:71-76 elementPermille | live |
| C-VULN |  | combat | A target that takes more: Hunter's Mark (unit fields markPm until markUntil) plus the strongest marking status (takenPm), added and folded into the cast's power | src/core/hunt/damage.js:69-76 takenPmOf | live |
| C-STANCE |  | combat | Stance: Offensive deals and takes x1.10, Defensive deals x0.90 and takes x0.85 | src/data/rule-subjects.js:38-42 HUNT_STANCES | live |
| C-TEMPER | P17 | combat, progression | Tempering: Blows raises what lands on a monster and every heal by rungs x the ladder's permille. Armor (with worn steadyPm and a food's steady) lowers what reaches the hero, last, never past the cap. The part of a point is a chance **Owner:** combat lands the rung. Economy prices it (E38) | src/core/temper.js:38-57 | live |
| C-SPELL-HIT | P14 | combat, progression | A damaging cast: each hit rolls a whole number from max(ceil(top / 2), base lo) to max(top, base hi), top = floor(maxHit x hitPm / 1000). Then C-HURT. It never misses and never crits **Owner:** combat owns what a cast lands (also C-SPELL-HEAL, C-SPELL-SHELL, C-CAST-POWER). Progression owns what it trains | src/data/abilities.js:356-360 hitRange | live |
| C-SPELL-HEAL |  | combat | A heal: floor(max(floor(maxHit x healPm / 1000), base) x power / 1000), whole (no roll), x Tempering, less the heal cut, capped at missing HP. Mend alone: floor(maxHp x 110 / 1000) x power | src/data/abilities.js:367-376 castAmount | live |
| C-SPELL-SHELL |  | combat | A shell: floor(max(floor(maxHit x shieldPm / 1000), base) x power / 1000), a pool that a blow spends before HP. A recast of a self shell refunds the unused part as mana. A party shell never lowers a bigger one | src/data/abilities.js:367-376 | live |
| C-CAST-POWER |  | combat | A cast's power in permille: the rune tier's step (1000 / 1100 / 1200 / 1300 / 1400 at each tier's skill gate, runes.js versionLevel) x the store's share for a store rune x Surge when it surges | src/data/runes.js versionStep, versionLevel | live |
| C-STATUS |  | combat | Statuses, one generic engine: a ticking one (Bleed: scale = max(tier share, floor(maxHit x 33 x tier share / 1000)), tick = round(roll 1..3 x scale / 1000) a stack a second, 5 stacks, 6 s), a marking one (takenPm), a slowing one (Chill: cl… | src/core/hunt/status.js:58-124 | live |
| C-HEAL-CUT |  | combat | Every heal a Withered unit takes: n - floor(n x cut / 1000). A hero 30% (less by its necrotic resistance), a monster 50% | src/core/hunt/heal-cut.js:26-43 | live |
| C-LEECH |  | combat | Life leech: floor(HP a hit took x leechPm / 1000) back to the caster (Reave 300). Mana back: min(mana spent, hits x manaPerHit + kills x manaPerKill). Focus: a kill returns focusPm of max mana | src/core/hunt/abilities.js:367-373 leechBack | live |
| C-CLOCKS |  | combat | Attack speed: every basic attack is 2,000 ms for heroes and monsters with no speed modifier. A cast locks its lane (offense 2 s, support 2 s, heal 1 s) and its own cooldown. Chill stretches a swing and a windup | src/core/combat.js:63 tickMs | live |
| C-MANA |  | combat | Mana: regenerates 25% of max a minute x the Inner Flame rate. A caster's basic costs 1 mana. A cast costs its version's mana, never more with level | src/core/hunt/abilities.js:535-542 regenMana | live |
| C-REGEN | P12 | combat, progression | HP regeneration: 0.3% of max a second in a fight and 6% out of one, x the Inner Flame rate 1 + P / (P + 50). The fist wraps add selfHealPm a second **Owner:** combat owns regeneration. Progression owns the Inner Flame level it reads | src/core/hunt/pull-cycle.js:305-322 | live |
| C-MON-BLOW |  | combat | A monster's largest blow: floor(atk x the art tier's scale), scale 5.4 for tiers 1-2, 4.0 for 3-4, 3.0 for 5, 2.2 for 6. It rolls 1..that like a hero's | src/core/combat.js:473-477 monsterMaxHit | live |
| C-MON-TOHIT |  | combat | A monster's chance to land: ratio(aim, 20 + Defense + worn +Defense + guard), held to 5%..97%. Guard is the defB of gear outside the armor weights (a shield, a cape) | src/core/combat.js:443-449 | live |
| C-ARMOR-CHAIN |  | combat | What armor does to a landed blow, in fixed order: dodge (medium) = floor(650 x P / (P + 0.4 x L)), absorb (heavy) = floor(750 x P / (P + 0.62 x L)), the resistance, ward (light) = floor(P x 1.5) flat, Tempering, and never more than 60% in… | src/core/mitigation.js:44-87 | live |
| C-RESIST-HERO |  | combat | A hero's resistance: taken = 1000 - min(cap, summed worn resistPm), cap 40% an element and 10% physical. Storm also burns mana for half the HP it took. Necrotic lands Withered | src/core/elements.js:87-111 | live |
| C-MON-STATS | E02 | combat, hunting and economy | A monster row from its Level, role, ground floor and fit: HP = (4.95 + 1.76 x L) x role x fit, blow = a share (13.2% to 22%) of a same-Level hero's base HP, aim and evasion from the reference hero (lands 70%, is landed on 85%), def = 0.08… **Owner:** combat owns the HP line. XP and coin are priced per HP point on the same row, so a change to it is an XP and coin change the same day | src/data/balance-sheet.js:351-386 formulaStats | live |
| C-REF-HERO | P36 | combat, progression | The reference hero a monster is written against: a measured career (the lone hammer) [Level, skill, Defense, worn accuracy] every 5 Levels to 100, sparser to 1,000, straight past it. aimFor and evasionFor invert the ratio **Owner:** progression computes the career. Combat reads it. Past Level 1,000 its straight line overstates skill (375 at 5,000 against about 248): quote the played numbers of 42 section 7.2 | src/data/to-hit.js:120-168 | live |
| C-TIER | P24, E04 | combat, progression, hunting and economy | Normal, Dangerous, Deadly: a pull size and three dials. dmgPm multiplies atk, aim AND the monster's Level as armor reads it. hpPm its HP. xpPm its kill XP. On a gentle ground the tier first takes back the ground's kindness, so its dmgPm is… **Owner:** one table, three readers: combat the damage and Level half, progression the XP dial, economy the pull as kill rate | src/data/balance-sheet.js:426-485 TIER_DIALS, tierRowFor | live |
| C-MON-SPELL |  | combat | A monster's spell: it rolls from half to all of floor(its largest blow x hitPm / 1000), then the hero's armor as any blow. A worn shield takes 30% off a marked spell. A mend puts the same roll back on a packmate. The first cast waits a ran… | src/data/monster-spells.js:57-102 | live |
| C-BOSS-PHASE |  | combat | A boss's two lines on his HP: adds arrive at addsPm and he takes only guardPm of every blow while one stands. Under enragePm his atk and aim are x enrageAtkPm, and one named spell's cooldown is x cdPm | src/core/hunt/boss-phases.js:38-89 | live |
| C-BOSS-ROOM |  | combat | A boss room: one fight, a time limit, his kill ends it, nothing resets. A called room pays nothing. A keyed hall pays as a ground. A boss is the formula's boss role: HP x5, blow x1.1 held to 33% of the FLOOR hero's HP | src/core/hunt/boss-room.js:21-32 | live |
| C-RUN-ROOM | P33 | combat, progression | A Burning Tower floor or a Catacomb room F: 5 monsters, each the stat formula at Level F on a floor-F ground, a Keeper (boss role) every 10th. Past floor 100 every blow is x1.012 a floor, compounding. Floor 300 is the last row **Owner:** combat owns a floor's monsters. Progression owns what a floor pays | src/core/hunt/tower.js | live |
| C-TARGET |  | combat | Aggro is rules, not threat numbers: a pack turns on the pull's leader. Challenge takes every monster within 6 tiles that is not on a tank and holds it 8 s. A Healer's basic draws a free monster 18% of the time. A shooter aims at the hero f… | src/core/hunt/targeting.js:164-260 | live |
| C-AREA |  | combat | Area and extra targets: a shape (the 3x3, a line of len, a ring of r) hits every engaged monster it covers for the FULL roll each, up to maxHits. Follow-through repeats a basic blow on one neighbour. An area arrow hits its footprint | src/core/hunt/abilities.js:424-435 | live |
| C-LEASH |  | combat | A pack lives in its room plus a margin (1 tile unless the ground says more). If the aggro holder leaves, the pack resets and heals. A called or keyed boss never resets | src/core/hunt/leash.js | live |
| C-PULL | E13 | combat, hunting and economy | How many stand in a fight: the ground's packs on Normal, the tier's pull on a harder tier (8, the Glade's Dangerous 6, none under floor 16). A monster's HP is its row's x hpPm for every party size **Owner:** combat owns how many stand. Economy reads it as kill rate | src/core/hunt/pull-cycle.js:99-100 | live |
| C-GEAR-ARMOR |  | combat | Armor points: the one gear formula (src/core/gear-stats.js gearStats): the weight's profile (plate 1000, leather 550, cloth 300 permille) x the slot's share (GEAR_SLOT_PM) x the defense budget at the piece's item Level, each line's trades… | src/core/gear-stats.js gearStats, scaleItems | live |
| C-GEAR-WEAPON | P16 | combat, progression | Weapon accuracy and damage: the one gear formula, the family's profile x the slot's share (a two-handed weapon the shield's too) x the offense budget at the piece's item Level; on a Danger-scale ground read at the ground's base item Level.… **Owner:** combat owns what a piece carries (also C-GEAR-ARMOR). Progression owns the Level it is worn at (P35) | src/core/gear-stats.js gearStats, scaleItems | live |
| C-JEWEL-PERKS | P18 | combat, progression | Worn modifiers and how each stacks: jewel perks (Keen, Steady, Follow, Surge, Focus) count the largest once. Resistance sums, then caps. +skill sums. The own heal takes the largest. critB sums **Owner:** combat lands the perk. Economy prices the Hallmark (E40) | src/core/combat.js:96-109 | live |
| C-BUFF-BONUS |  | combat | The injected bonus reader: a food buff or a perk adds to damage, crit and steady (a damage cut). Permanent perks are held to 20% | src/core/combat.js:425-428 | live |
| C-TRAINING |  | combat | The training yard's dummy: its blow never takes a hero under a floor, and it never falls | src/core/hunt/training.js dummyBlow, dummyStands | live |
| P01 |  | progression | Level curve: total Level XP to reach a Level, and the Level a total makes | src/core/xp.js:126-175 | live |
| P02 |  | progression | Pace contract: the Level XP an hour a ground must pay at its own Level: 1385 x L^1.274 | src/data/balance-sheet.js:92 | live |
| P03 |  | progression | Combat skill curve: XP from skill level s to s+1 = floor(15 x s^2 x 1.04^(s-1)), no cap | src/core/xp.js:68-112 | live |
| P04 |  | progression | Capped skill table: gathering and crafting levels 1 to 99 from a 99-row XP table | src/core/xp.js:24-61 | live |
| P05 |  | progression | Skill XP grant: credited XP = floor(carry + base x (1 + allXP + combatXP)), base = amount x 0.39 unless the skill is exempt (the rested quantum is gone: P30 cut 2026-11-21) | src/core/progression.js:110-152 | live |
| P06 | E09 | progression, hunting and economy | Weapon skill XP from a blow: Melee or Ranged XP = damage dealt x 1.5 **Owner:** progression owns the three skill XP routes (P06, P07, P08) | src/core/hunt-rewards.js:245 | live |
| P07 |  | progression | Defense XP from a monster's blow: 0.2 x the attacker's Level (raised by the tier's damage dial) per blow aimed at an armored hero, x2 when a shield turns it | src/core/hunt-rewards.js:59-63 | live |
| P08 |  | progression | Magic XP from a cast: floor(mana spent x 1.5 x the ability's multiplier) | src/core/hunt/xp-share.js:143-148 | live |
| P09 |  | progression | Training pay: 30,000 skill XP a settled hour for any skill at any level, 200% while a training item's hours last | src/core/hunt/training.js:85-121 | live |
| P11 |  | progression | Max HP and max mana: HP = floor((150 + 10 x (L-1)) x (1000 + 280 x heavy slots / 6) / 1000); mana the same with 100, 10 and 350 x light slots / 6 | src/core/vitals.js:58-69 | live |
| P15 |  | progression | +skill on worn gear: a worn piece's meleePlus / rangedPlus / magicPlus / defensePlus adds whole skill levels wherever a fight reads the skill | src/core/combat.js:89-110 | live |
| P19 |  | progression | Special attributes and chest gear: one attribute a piece at a size by gear tier, with a cap across everything worn | src/data/special-attributes.js:20-90 | live |
| P20 | E03 | progression, hunting and economy | Kill XP split: hero Level XP = floor(kill XP x mode share / living heroes x party factor / 1000 x scaled-hunt party share x the hero's own multiplier x the under-floor share) **Owner:** progression owns the split | src/core/hunt/xp-share.js:66-85 | live |
| P21 | E05 | progression, hunting and economy | Party class table: permille of a kill shared by the living heroes, by party size and classes held; a hero alone 1150 **Owner:** progression owns the party table | src/data/party-class-xp.js:54,79,141-152 | live |
| P22 |  | progression | Run ground pay: a Tower kill pays each hero the hours table's share of its own Level over refKillsHead x the depth ratio at the floor's gap x payPm x the room's share, split evenly (lane/tower-boss-formula) | src/core/hunt/tower.js#towerShareXp | live |
| P23 | E06 | progression, hunting and economy | Under-floor Level share: a seat under the ground's floor AND under 66.7% of the party's top Level keeps floor(1000 x (Level / (top x 0.667))^2) permille of its share **Owner:** progression owns the under-floor share | src/data/hunt-grounds.js:536-541 | live |
| P25 | E08 | progression, hunting and economy | Session mode share: the Tower and the Catacombs pay 37.5% of a kill's Level XP and a death there costs nothing **Owner:** progression owns the mode share | src/data/session-modes.js:26-45 | live |
| P27 |  | progression | XP weekend: +25% Level XP a kill for 72 hours every 14 days; live rows add, never past +50% | src/data/live-events.js:26-34,90-95 | live |
| P28 |  | progression | Death cost: Level XP lost = floor(total Level XP x 0.06 x the mode's share); each combat skill loses floor(0.06 x its progress into its level) | src/core/action-rules.js:313-346 | live |
| P30 |  | progression | Rested bank: CUT 2026-11-21 (FB-2, 1040-rested-bank-cut.sql; the sitting S-9 C): no rested bank. It was one charge every 6 minutes to a cap of 80 (120 with the Library), a spent charge a flat quantum of at most 1,600 XP |  | live |
| P31 |  | progression | Perk XP channels: allXP and combatXP sum from rooms, renown, buffs and a companion; permanent sources are held to +20%; a companion's bonus = base x (1 + 0.05 x (level - 1)) and is added after the cap | src/core/perks.js:87-140,217-280 | live |
| P35 |  | progression | Gear worn by Level: every piece of equipment names a hero Level as its requirement | src/data/gear-tiers.js:33 | live |
| P37 |  | progression | Skill lines (simulator projection): the skills the balance simulator gives a hero at a Level; past the measured line a straight line on its last ten Levels | tools/balance-sim/skill-lines.mjs:91-104 | tools only |
| E01 | P32 | hunting and economy, progression | Level XP one kill pays: max(min, a x L^b) x HP x role.xp x fit.xp x groundXpFit x floorFit **Owner:** hunting owns XP a kill. Progression reads it as an input | src/data/balance-sheet.js:359-396 (formulaStats, the xp line) | live |
| E10 |  | hunting and economy | Which monsters a pull spawns: the pocket's authored rows, then its non-boss fill rows round again up to the density | src/data/hunt-grounds.js:551-560 (pullRows) | live |
| E11 |  | hunting and economy | A cleared pack is back ground.respawnMs after it was cleared, never mid-fight | src/core/hunt/pull-cycle.js:175-183 (respawnPacks) | live |
| E12 |  | hunting and economy | The time between pulls: travel at hero speed, regroup at least 1.5 s within 7 tiles, out-of-combat regen 6% of max HP a second | src/core/hunt/pull-cycle.js:328-358 (runPhase) | live |
| E14 |  | hunting and economy | XP an hour, kills an hour and gold an hour. No formula computes these. The target is contractXpPerH = 1385 x L^1.274 and the engine is the only reader of the real value | src/data/balance-sheet.js:92 (contractXpPerH) | live (emergent) |
| E15 |  | hunting and economy | A trophy find's odds: oneIn = round(actions an hour x authored hours). Nothing scales it | src/core/hearthfind.js:120-123 (deriveOneIn) | live |
| E16 |  | hunting and economy | Hunting spends one ms of stamina a ms hunted. The bar holds 8 h free, 12 h Premium | src/data/hunt-sessions.js:175 (STAMINA_MAX_MS) | live |
| E17 |  | hunting and economy | ceil((base + perLevel x L) x (stepDen + stepNum x (n-1)) x minutes / (stepDen x 240)). Six a day, 4 h each at most | src/data/stamina-refill.js (refillPrice) | live |
| E18 |  | hunting and economy | What a hunt spends on supplies: own stock first, then store units at the catalogue's unit price, down to the hero's gold floor | src/core/hunt/consumables.js:170 (consume) | live |
| E20 |  | hunting and economy | When a heal, a mana draught or a buff is used, and its cooldown | src/core/hunt/consumables.js:170-195 | live |
| E23 |  | hunting and economy | Coin a kill: mean = 0.30 x line x HP x role.gp x fitGp x groundGpFit, rolled lo..2 x mean - lo so the mean holds | src/data/balance-sheet.js:359-396 (formulaStats, the gp lines) | live |
| E24 |  | hunting and economy | floor(share x (1 + max(0, goldFind))) on monster coin only | src/core/pacing.js:119-128 (goldFindMult, applyGoldFind) | live |
| E25 |  | hunting and economy | A kill's coin split evenly, the remainder one coin each from a seat that moves with the kill | src/core/party-split.js:48-58 (splitEven) | live |
| E26 |  | hunting and economy | What the shop pays: book x gear rate (by tier), x0.20 if raw, x the ground's income dial, never under its lower-tier twin where the dial put it there, never over half the cheapest shop price | supabase/functions/hr-accrue/catalogue.js:340-359 (vendorPriceOf) | live |
| E27 |  | hunting and economy | The share of book value worn gear sells for, by tier, with one carve-out for tier-2 hourly armor | src/data/loot-bands.js:89-106 (VENDOR_GEAR_RATES, gearSaleRate) | live |
| E28 |  | hunting and economy | A drop sells at the highest income dial of the grounds that drop it. Anything also gathered or crafted is exempt | src/data/loot-sale.js:44-55 (saleFitPm) | live |
| E29 |  | hunting and economy | The cheapest gold price of one unit of each item across single-line shop offers | src/core/shop-buyback.js:28-45 | live |
| E30 |  | hunting and economy | A shop offer's price: an authored row. The listed gear, tools and seeds sell at 2 x book | src/data/shops.js | live |
| E31 |  | hunting and economy | An imbuement part's book value: 2 gold a monster Level. Its tier: 1, 2 or 3 at Levels 1, 30, 80 | src/data/imbuements.js:50-64 | live (the item only sells) |
| E32 |  | hunting and economy | Listing fee = max(fee_min, ceil(qty x ask x 1%)). The house takes ceil(gross x 1.5%). Floor = the shop's bid. Ceiling = max(ceiling_min, book x 100) | supabase/migrations/2027-01-12-market-account.sql:302-336, 657, 1143 | live |
| E33 |  | hunting and economy | A public bench takes 15% of what a job's output sells for, in milligold with a carry, free under half a gold | src/core/bench-tax.js:20-58 | live |
| E34 |  | hunting and economy | round(3000 x 1.32^k), ten rungs | src/data/gold-ladders.js (bankRungPrice) | live |
| E36 |  | hunting and economy | A town sink's price: the n-th of its price row today, or base + perLevel x Level | src/data/gold-sinks.js (SINK_RULES) | live |
| E37 | P29 | hunting and economy, progression | 0 under Level 30, else base + perLevel x (Level - 30). Three tiers cut a death's XP loss 25, 50, 75% **Owner:** economy owns the price. Progression owns what a death costs | src/data/blessings.js (blessingPrice) | live |
| E38 |  | hunting and economy | Five rungs a track a gear tier, each doubling in gold, each worth 1% (0.4% on tier 7), plus crafted salts | src/data/temper.js (TEMPER_TIERS, TEMPER_MATERIALS, TEMPER_TIER_RUNG_PM) | live |
| E39 |  | hunting and economy | 400,000 / 1,500,000 / 4,000,000 gold for slots 2 to 4 | src/data/shops.js:59-75 | live |
| E40 |  | hunting and economy | 25,000 / 100,000 / 150,000 / 250,000 / 400,000 / 600,000 gold a piece by jewel tier 2 to 7 | supabase/migrations/2027-03-14-jewelry-hallmark.sql (hr_hallmark) | live |
| E41 |  | hunting and economy | The Weighhouse's goal: max(250,000, 20,000 x weekly active accounts). A gift is 100 at least, 25,000 a day at most | src/data/town-works.js | live |
| E42 | P10 | hunting and economy, progression | The public yard's fee: ruled 100 gold x skill level an hour **Owner:** economy owns the fee | supabase/migrations/2027-04-16-combat-training.sql (hr_training_fee) | staged |
| E43 |  | hunting and economy | Property, room, storage chest and curing slot prices: hand-typed ladders | src/data/homestead-tiers.js | live |
| E44 |  | hunting and economy | min(0.95, ch x monster dropBonus x (1 + dropRate buff) x featured). A row at 100% is untouched | src/core/drops.js:41-48 (effectiveDropChance) | live |
| E45 |  | hunting and economy | One roll a row a kill. On a scaled hour, ceil(lootPm / 1000) rolls of chance x lootPm / 1000 / k | src/core/drops.js:58-84 (rollDropTable, rollsOf) | live |
| E46 |  | hunting and economy | A row's promise in hours a piece a hero at the ground's floor. Each row's ch is typed by hand until the test's measured hours land in the band | src/data/loot-bands.js:43-54 (BAND_TARGETS) | live |
| E47 |  | hunting and economy | Who takes a Rare or Trophy unit: highest of 1..100 among heroes who have not won since everyone last did | src/core/party-split.js:74-97 (rareRoll) | live |
| E48 |  | hunting and economy | One roll over the boss's rows as slices of 1. A hero's first roll ever fills the empty part onto the rows marked first | src/core/drops.js:87-129 (prizeChance, prizeSlices, rollPrize) | live |
| E49 |  | hunting and economy | min(1, weaponPm x warmth x stoke): warmth +4% a dry key up to x3, stokes x1.7 / 2.5 / 3.3 for 3 / 7 / 12 keys of Cinders | src/data/chests.js:143-153 (CHEST_LUCK) | live |
| E51 |  | hunting and economy | Charm x trophy drop multiplier capped at 1.07, and a boss relic multiplier up to 1.25 | src/core/trophies.js:190-231 | dead on the hunt path |
| E52 |  | hunting and economy | Boss of the day x1.5 drops and x1.25 XP, weekly x2.0 and x1.5 | src/core/botd.js:54-56 | dead on the hunt path |
| E53 |  | hunting and economy | A bounty's kill count and reward, in SQL only | supabase/migrations/2026-08-23-bounty.sql (hr_bounty_reward) | unknown |
| E54 | P34 | hunting and economy, progression | Account Luck: rank n costs 100 x n^2. One Magic Find budget of 104 a hero. Past Krell, Rare rows 15% rarer at band 8 to 25% at band 18 **Owner:** economy owns the Luck bar, unbuilt |  | unbuilt (ruled 2026-11-20) |
| E55 |  | hunting and economy | A lining: one monster part + gold, cured 4 h in a House slot, lasts 12 hunted hours, stacks to 48 h a socket. Effects: an element guard (Stitched 20%, Sealed 30%, capped 40% with gear) or a leech | docs/design/itemization-plan.md section 5 (design) | unbuilt (ruled 2026-11-18) |
| E56 |  | hunting and economy | Gold in and gold out an account-day at 12 h: 48 hero-hours x (coin + sold loot) minus store supplies, refills, taxes and bought sinks | tools/balance-program/gold-model.mjs (APPROXIMATES: six Levels to 118, typed real rows, assumed ratios) | no formula in the game; approximated in tools |
<!-- END GENERATED:FORMULAS -->

### 2.2 Exceptions

Class 4 first, then 3, 2 and 1.

<!-- GENERATED:EXCEPTIONS (tools/balance-program/formulas/architecture-register.mjs --write) -->
| id | also filed as | class | status | what it does | where | the fix |
|---|---|---|---|---|---|---|
| X-POWER-LITERALS | P-X23 | 4 | CONFIRMED | The engine computes a hero's largest blow from the literals 0.35, 0.6 and 2. The named constants with the same values are read only by the wiki. Change one and the wiki prints a formula the game does not run | src/core/combat.js:391 against combat.js:38-40 and src/shell/wiki-model.js:126 | formula layer: the expression reads COMBAT_BALANCE. One guard that the wiki terms equal the engine's |
| X-SHEET-ORDER |  | 4 | CONFIRMED | Two orders for one blow. The sheet, the wiki and the upgrade plan read floor((maxHit - cut) x weakness). The engine rolls 1..floor(maxHit x weakness), then subtracts the cut from the roll | src/core/combat.js:422-423 against src/core/hunt/damage.js:126,309-314 | formula layer: playerCombatRolls stops subtracting defence. Every reader takes the cut from C-MON-DEF |
| X-REFHP-OFF-BY-ONE |  | 4 | CONFIRMED | The monster formula sizes blows on a hero of 150 + 10 x L HP. A hero has 150 + 10 x (L - 1). Every blow share is 10 HP a hero does not have (6% at Level 1, 0.5% at 200). The same formula is also written a third time in SQL, on generated constants | src/data/balance-sheet.js:131 against src/core/vitals.js:61 and SQL hr_max_hp (supabase/migrations/2027-02-10… | formula layer: STAT_FORMULA.refHp calls vitals.maxHpFor(L, 0). The SQL twin stays (server authority) and gets a parity test against the JS at 20 Levels |
| X-ROLL-TWINS |  | 4 | CONFIRMED | One function written twice with two constants (hitLowPm 500, SPELL_ROLL.lowPm 500) | src/data/abilities.js:422-425 blowShare against src/data/monster-spells.js:99-102 spellHit | formula layer: one shareRoll(power, pm) in src/core, one constant |
| X-TIER-LADDER-TWINS |  | 4 | CONFIRMED | The rune step ladder 1000..1400 is typed again on Bleed. Chill carries a different ladder, 1000..1667, for the same five tiers | src/data/runes.js stepPm against src/data/statuses.js bleed.tierPermille and chill.tierPermille | coefficient layer: a ticking status reads versionStep. Chill's own ladder becomes a named row with a why, or takes the common one |
| X-MARK-TWO-WAYS |  | 4 | CONFIRMED | Two mechanisms for "this target takes more": Hunter's Mark writes unit fields (markPm, markUntil). Green Sickness is a status row (takenPm). They are added | src/core/hunt/damage.js:166 against src/core/hunt/abilities.js:411-414 | formula layer: the mark becomes a marking status row. Two world fields go |
| X-ROW-DOOR-BYPASS |  | 4 | CONFIRMED | Elements, the enrage line, the guard and the adds read MONSTERS[kind] directly. Every other stat goes through rowOf(inst, kind), the door a scaled hunt, a Tower room and the simulator's what-if use. So a what-if can move a blow but not a resistance or a phase | src/core/hunt/targeting.js:53, src/core/hunt/boss-phases.js:39,48,55 | formula layer: both read rowOf. IMPACT IS A HYPOTHESIS: no live table moves these fields today |
| X-STEADY-TWO-MEANINGS |  | 4 | CONFIRMED | One word, two mechanics, and the food buff is labelled "Damage cut" under the id defense | src/core/combat.js:388 (jewel steady: misses that land) against src/core/mitigation.js:30 (steadyPm and a foo… | data layer: rename one. No number moves |
| X-STALE-HP-NOTE |  | 4 | CONFIRMED | The sheet still says the engine scales monster HP 55-100% by party size. Since 2026-11-08 it does not | src/data/balance-sheet.js:145 against src/core/hunt/pull-cycle.js:99 | delete the sentence |
| X-ART-TIER-SCALE | X-SCALE-TWINS, P-X22 | 4 | CONFIRMED | A monster's damage is atk x a scale picked by its ART tier: 5.4, 4.0, 3.0 or 2.2. For the 72 formula rows it does nothing but rounding: the formula divides the blow by the same number. It still decides the damage of the 118 hand rows | src/core/combat.js:45-56,473-477 | formula layer: the row stores the blow (a whole number of HP). The scale and its twin go. Hand rows are converted once, digit for digit |
| X-HAND-ROWS | E-X35 | 4 | CONFIRMED | 118 of 190 monster rows are on no formula roster: their hp, atk, aim, evasion and def are typed by hand (the old roster, the Hearthfind and called bosses, Krell's hall, the dummy). 70 of the 72 roster rows equal the formula exactly **Class decided here:** combat filed it 2, economy 4 as a hypothesis. The formula exists and 118 rows bypass it for no design reason: 4. Which of them a live hunt still fields stays a hypothesis (53-review-world counts 103 that no hunt uses) | src/data/monsters.js | data layer: each row gets a role and reads the formula, or is listed as a named exception with its reason. WHICH OF THE 118 ARE FIELDED TODAY IS A HYPOTHESIS (tools/balance-program/formulas/roster-dr… |
| X-NAMED-HASK-LOOKOUT |  | 4 | HYPOTHESIS | His blow is the Farmhands' share, not his role's, "while engine piece 2 is unbuilt he swings in melee". Shooters are built now and he is one (range 5, tier-read.mjs) | src/data/balance-sheet.js:337 FORMULA_EXCEPTIONS.hasks_lookout | the stated reason is gone. Whether a lone hero at the floor is safe on the role's blow is the hypothesis: one grid cell answers it |
| X-GENTLE-CAP |  | 4 | HYPOTHESIS | On top of the ramp, no blow on a gentle ground may pass 11% of the FLOOR hero's HP | src/data/balance-sheet.js:158 blow.gentleCap 0.11 | coefficient layer: fold into the ramp's low end. A hypothesis until the grid shows the ramp alone holds the fresh hero |
| X-GENTLE-HP |  | 4 | HYPOTHESIS | Heavy and elite monsters have less HP on a gentle ground (1.0 and 1.2 where the role says 1.2 and 1.6) | src/data/balance-sheet.js:213,215 MONSTER_ROLES gentleHp | this is an XP and coin fix written into combat stats. Overlap: progression and economy lanes |
| X-PARTY-FIT-PATCHES |  | 4 | CONFIRMED | Three patches inside the party fit: to-hit 30 points lower on a full party ground, the same swing worth as fewer bigger blows on a gentle one, and harder tiers that lift nothing | src/data/balance-sheet.js:195 hitFull -0.3, blowShape 1.6, tierLift false | each one compensates another formula (ward's flat cut, the lone hero on a party ground, the tier lift). Fix those and delete the three |
| X-TIER-PER-GROUND | P-X11, E-X08 | 4 | CONFIRMED | Four grounds carry their own tier dials: the Glade (Dangerous pulls 6, HP 1400 and 1450), the Warrens (HP 1150 and 1250), the Thicket (no HP, XP 1050 and 1080), the Sewer (HP 1150 and 1250, XP 1220) | src/data/balance-sheet.js:437-459 BASE_TIER_OVERRIDES | the exact case the brief names. The cause is kill-rate and XP: fix at P-KILL-XP and the pull, then every ground takes TIER_DIALS whole. Overlap: progression lane |
| X-TIER-TRIPLE |  | 4 | CONFIRMED | A tier's dmgPm is applied three times: to the blow, to the aim, and to the monster's Level as armor reads it (and as Defense XP is paid). On the Thicket and Wickstead the solved dmgPm is 2115 and 2685, so on Wickstead's Deadly a Level 8 monster is read by arm… | src/data/hunt-tiers.js:122,130 and src/core/hunt/damage.js:108 | formula layer: the dial moves the blow and the aim. Armor and Defense XP read the row's own Level. Overlap: progression lane (P-DEFENSE-XP) |
| X-TOWER-HEAT | P-X16 | 4 | CONFIRMED | Past floor 100 every blow is x1.012 a floor, compounding: x10.9 by floor 300. The number moved 10 to 12 to hold a guard | src/data/tower.js:57 and src/core/hunt/tower.js heatOpts | already ruled. Listed so it is not forgotten |
| X-TOWER-TOP | P-X17 | 4 | CONFIRMED | A floor above 300 plays floor 300's monsters **Class decided here:** combat filed it 3, progression 4. Nobody designed "the Tower ends at floor 300": the server's bound is a generated table with a last row. A limit of the build, not a design choice: 4 | src/data/tower.js:54 floorTop 300 | a cap on an endless mode. Needs Tyler's yes or a formula that reads any floor |
| X-SPELL-HOLDS |  | 4 | HYPOTHESIS | Three monster spells had their multiples lowered so the +10% monster step would not pass 35% of a floor hero | src/data/balance-sheet.js:121-123 (named there: Hot Coal, Bone Slide, Snuff the Candles) | the rows were not read. If true, the 35% rule belongs in the spell formula as a bound, not in three rows |
| X-SPELLS-SKIP-WEAKNESS |  | 4 | CONFIRMED | Weapon weakness (+20% damage, +15% accuracy, on 189 of 190 monsters) and bane apply to basic blows only. A spell is a share of the NEUTRAL blow. A spell also never misses and never crits, so accuracy, evasion, Keen and critB do nothing for it | src/core/hunt/damage.js:305-316 (blow) against src/core/hunt/abilities.js:392-400 (strike) | see Conflicts 2. THAT IT IS UNINTENDED IS A HYPOTHESIS |
| X-SET-CRIT |  | 4 | HYPOTHESIS | Five pieces of one tier and line give crit, 1% a tier, for plate and cloth as much as leather. Its default line is "plate" | src/core/combat.js:252-270 armorSetBonus | looks like a leftover. If wanted it is a data row (set bonuses), not a function |
| X-STACKING-RULES |  | 4 | CONFIRMED | Five stacking rules for worn modifiers: largest-once (perks), largest (own heal), sum (+skill, critB), sum-then-cap (resistance), and the weakness product with two ceilings | src/core/combat.js:96-109,207-248 | formula layer: one modifier table { key, combine: sum \| max, cap } that equipmentStats folds |
| X-DORMANT-FACTORS |  | 4 | CONFIRMED | Three factors sit in the damage expression with nothing feeding them: bane (0 items carry one), the weapon element (eq.element is always null), the charm damage ladder (no caller). A second ceiling, 1.68, is exported and unused | src/core/combat.js:306-324, src/core/bane.js:62, src/core/charms.js (charmDamageMultFor) | not a cut list: imbuements are on the roadmap, so the element seam is BUILD-LATER (Tyler 2026-11-21). The unused 1.68 and the charm ladder can go |
| X-FLOOR-CHAIN |  | 4 | HYPOTHESIS | Up to nine floors in a row on one blow. On small numbers each one is a hidden cut: a 10-point hit through three 1.1 / 0.9 steps is not what the product says | src/core/hunt/damage.js:123-137 | formula layer: multiply the permilles, floor once. THE SIZE IS A HYPOTHESIS (largest in the first 15 Levels) |
| X-ARMOR-LINE-FIT |  | 4 | CONFIRMED | Each unique's armor was sized to "the most that keeps its measure under the line", four digits from 1.0000. Any engine change moves the measure | tools/balance-sim/staged/armor-line.js LINE_SAMPLE, tests/armor-line.mjs AL3 | see section 6.1 |
| X-LINE-IN-TOOLS | P-X32 | 4 | CONFIRMED | The only formula for gear past tier 7 lives in a simulator folder, with the Dawnsteel numbers typed again beside it **Class decided here:** combat filed it 4 (the formula sits in a tools folder), progression 2 (the gear rows are absent). One cause, one fix, at the formula layer: 4 | tools/balance-sim/staged/armor-line.js:64-70, weapon-line.js:72-81 | the formula (not the sample) moves to src/data as the gear curve |
| X-LEVEL-BY-TIER |  | 4 | HYPOTHESIS | A monster with no Level gets one from its art tier | src/data/core-model.js:200 MONSTER_LEVEL_BY_TIER | if every fielded row has a Level this is dead. Not checked |
| X-MUTABLE-ROWS |  | 4 | CONFIRMED | Data the engine reads is left unfrozen so the simulator can edit it in place and put it back | src/data/monster-spells.js:68 SPELL_STAGGER, MONSTERS rows, GROUND_TIERS | architecture: what-ifs go through the instance's row door (rowOf) and an options object, never by mutating shared data |
| X-POWER-TOOLS |  | 4 | HYPOTHESIS | Two guards (armor-line, weapon-line) judge gear by a closed-form "pace and safety" read built from the engine's roll helpers, not by a played hunt | tools/balance-sim/armor-power.mjs, weapon-power.mjs | the brief asks for the real engine. Bodies not fully read, so the size of the gap is unknown |
| P-X02 |  | 4 | CONFIRMED | Brackets at 10, 15 and 16 exist only to give back XP taken from Levels 7 to 9 with the total at Level 21 held: a one-Level bracket at 15 with a rise of 74,323 beside rises of 4,630 and 300 | src/data/core-model.js:80-82 |  |
| P-X06 | X-OTHER-LEVEL-SHARE, E-X10 | 4 | CONFIRMED | A Level-keyed cut on a party seat's XP share is live. Tyler's 2026-11-08 ruling ('XP share rule applies regardless') was recorded as: this cut is CUT | src/data/hunt-grounds.js:536-541; src/core/hunt/xp-share.js:78; src/data/hunt-tuning.js:53-56 | PROGRESSION LANE. A Level threshold in party XP that a ruling removed |
| P-X19 |  | 4 | CONFIRMED | The death share is written twice with different arithmetic: a float multiply in JS, exact numeric in SQL. They agree for every total under about 3e15 XP and at every Level to 50,636, and differ by one above it (first at Level 50,637), where the SQL bound woul… | src/core/action-rules.js:317; supabase/migrations/2027-04-23-session-modes.sql:153 |  |
| P-X21 |  | 4 | CONFIRMED | The Hunts page works out the death percent in the browser from the data constant and the server's cut | src/shell/hunt-list.js:179 |  |
| P-X24 |  | 4 | CONFIRMED | A global XP dial of 0.39 with an exempt list, and Inner Flame's recipe XP authored at 40 so that 40 x 0.39 lands 15.6 | src/core/pacing.js:17-22; src/data/core-model.js:230-232 |  |
| P-X25 |  | 4 | CONFIRMED | The skill grant has two rounding paths: the carried remainder, and an older floor of at least 1 for a state with no remainder map | src/core/progression.js:132-140 |  |
| P-X26 |  | 4 | CONFIRMED | The rested bank fills on the server and pays nothing. All four grant callers pass a quantum of 0 | removed 2026-11-21 by FB-2 (1040-rested-bank-cut.sql): the rested files are deleted and the grant callers pas… |  |
| P-X27 |  | 4 | HYPOTHESIS | A companion's XP bonus is added after the +20% permanent cap, on its own curve, restated from a client file | src/core/companion-perk.js:71-76,101-121 |  |
| P-X34 |  | 4 | CONFIRMED | Past Level 110 a Tempering ladder is keyed on the piece's Level band instead of its tier, because every piece past Dawnsteel is still tier 7 | src/data/temper.js:107-117 |  |
| P-X42 |  | 4 | CONFIRMED | The reference hero past Level 1,000 is a straight line. It reads Melee 375 at Level 5,000, where the skill curve allows about 248 | src/data/to-hit.js:56-66 |  |
| P-X43 |  | 4 | CONFIRMED | The simulator gives heroes past the measured line skills on a straight line: 198 at Level 400 and 438 at Level 1,000, where the curve allows about 132 and 177. The progression grid's Levels 185 to 400 are played on it | tools/balance-sim/skill-lines.mjs:99-103 |  |
| E-X01 | P-X04, X-OTHER-GROUND-FITS | 4 | CONFIRMED | GROUND_XP_FIT: a per-ground multiplier on XP a kill, 15 different numbers from 0.76 to 1.22 | src/data/balance-sheet.js:309, src/data/grounds/*/pack.js xpFit (9 packs) | E14 becomes the formula: XP a kill = contract pace / the ground's measured kills an hour, derived by the generator the way Hearthfind derives oneIn |
| E-X02 |  | 4 | CONFIRMED | GROUND_GP_FIT: x0.7 on coin and on what loot sells for, typed on 11 grounds (every ground from the Glade up) | src/data/balance-sheet.js:319, src/data/grounds/*/pack.js gpFit (9 packs) | fold it into the gold line: line.hi 1.4 x 0.7 = 0.98. One number, no per-ground row |
| E-X04 | P-X05 | 4 | CONFIRMED | xp.floorFit: XP a kill x0.67 on a ground whose floor is 8 or under, climbing to x1 at floor 32 | src/data/balance-sheet.js:165 | falls away with X01's fix |
| E-X05 |  | 4 | CONFIRMED | A party ground's coin dials: x1.17 gentle, x0.53 full, on top of the line. The comment says 1.17 exists so a Sewer kill pays what it paid before the line moved | src/data/balance-sheet.js:194 (fit.party.gp, gpFull) | a party ground's monsters have 2.5x HP and coin is per HP, so coin a kill is already 2.5x. State one party coin share instead of two compensating dials |
| E-X14 |  | 4 | CONFIRMED | dropBonus 1.15 on seven old-roster rows (the Slime of the Mill Cellar among them): the re-homed compensation for a retired `neutral` weapon class | src/data/monsters.js:113 (slime) and six more, src/core/combat.js:327-334 | delete the field and the term. A row that should drop more says so in its ch |
| E-X17 |  | 4 | CONFIRMED | VENDOR_GEAR_RATES: a hand-typed sale share a gear tier (0.5, 0.5, 0.14, 0.075, 0.033, 0.015, 0.007), each derived in a comment as the last x 1.3 / the book climb | src/data/loot-bands.js:89 | the comment's rule is the formula: sale(tier) = sale(tier 1) x 1.3^(tier-1). Compute it; there is no row for tier 8 |
| E-X18 |  | 4 | CONFIRMED | Tier-2 helmet, body, legs and boots sell at 0.3 of book, every other tier-2 piece at 0.5 | src/data/loot-bands.js:97-104 | falls away with X17's formula |
| E-X19 |  | 4 | CONFIRMED | The sale dial's three patches: an item sells at the HIGHEST dial of the grounds that drop it, anything also gathered or crafted is exempt, and a dialed piece is floored at its lower-tier twin's sale | src/data/loot-sale.js:44-73, supabase/functions/hr-accrue/catalogue.js:349-356 | all three go when X02 is folded into the formula |
| E-X26 |  | 4 | CONFIRMED | relicMult: the Bestiary's boss relic multiplier (promised up to x1.25 in loot-bands.js) is projected in every envelope, copied onto every member by the settle, and nothing reads it | src/core/member.js:348-356, supabase/functions/hr-accrue/hunt-settle.js:708-711, src/data/loot-bands.js:53 (b… | delete the copy and the projection, or wire it through E44. Luck v3.1 cut the charm ladder, so delete |
| E-X27 |  | 4 | CONFIRMED | featuredMult in the drop formula and the boss-of-the-day bonuses have no caller on the hunt path | src/core/drops.js:46, src/core/botd.js:54-56 | delete the argument and the constants, or list them BUILD-LATER if live events will use them |
| E-X28 |  | 4 | CONFIRMED | The Hearthfind header says an attended session rolls more finds than an away one through a second RNG stream. No such stream exists in the code any more | src/core/hearthfind.js:12-39 | delete the paragraph. It describes a rule the game no longer has |
| E-X36 |  | 4 | HYPOTHESIS | speedKeyFor falls back to gatherSpeed for any skill it does not list. The comment itself calls this a live bug class | src/core/pacing.js:73-77 | throw on an unlisted skill. Owner: progression lane (skill pacing) |
| E-X37 |  | 4 | CONFIRMED | The gold model approximates instead of running the engine: six Levels to 118, real-player rows typed in, sold loot assumed 0.366 of coin, income past 84 assumed harness x 0.92, store bill assumed harness x 0.26 | tools/balance-program/gold-model.mjs:36-60 | read coinPerH, incomePerH, storePerH and netPerH from progression-grid.json at all 31 checkpoints and three gear states |
| E-X38 |  | 4 | CONFIRMED | The drop odds a player reads are computed in the browser without the hero's drop-rate buff, so the screen can disagree with the roll | src/shell/hunt-ground-facts.js:186, src/shell/monster-facts.js:108 | moot once Luck v3.1 cuts the food drop buffs; then the page must show the Luck bar's effect from the envelope |
| S-X01 |  | 4 | CONFIRMED | weaponResist is an authored column on monster rows that no engine code reads. The bestiary prints a resistance the fight does not apply | src/data/grounds/hasks_ford/pack.js:25,121 and four more packs, src/data/monsters.js | formula layer: C-WEAKNESS reads it as the mirror of weaponWeak, or the column and the bestiary line go. Raised by 52-review-combat |
| X-NAMED-RAT-KING |  | 3 | CONFIRMED | His attack is held at 6 where the formula says 8, so his Tail Lash stays under 35% of the floor hero's HP | src/data/balance-sheet.js:336 FORMULA_EXCEPTIONS.rat_king | better at the formula layer: the boss cap should bound his SPELL, not his attack. Then the row is the formula's |
| X-DANGER-RAMP |  | 3 | CONFIRMED | A ground whose floor is 8 or under is gentle: monsters land 40% and hit 13.2% of a hero's HP. From floor 16 they land 70% and hit 22%. A straight line between | src/data/balance-sheet.js:137,343-348 STAT_FORMULA.ramp | keep, as the ONE early-game curve. It is a Level threshold that changes combat math, so it needs Tyler's explicit yes |
| X-PARTY-FIT | E-X06 | 3 | CONFIRMED | A party ground's monsters are a different formula: HP x2.5, blow x0.75, XP x0.8 **Class decided here:** combat filed it 2 (an encounter type in data), economy 3. It is a second set of stat coefficients picked by what kind of ground a monster lives on, and 53-review-world asks to remove it. A rule that changes the monster formula by ground needs Tyler's yes: 3 | src/data/balance-sheet.js:193-195 STAT_FORMULA.fit.party | keep as an ENCOUNTER TYPE in data (it is one row for every party ground, not a per-ground number) |
| X-TIER-PULL-FLOOR | P-X13, E-X07 | 3 | CONFIRMED | Under ground floor 16 a harder tier brings no more monsters **Class decided here:** combat and economy filed it 3, progression 4 as a hypothesis. It is a deliberate rule of 2026-11-08 that conflicts with a ruling of 2026-11-07, so it is Tyler's to settle: 3. That it is unneeded stays a hypothesis | src/data/balance-sheet.js:413 TIER_PULL_FROM_FLOOR 16 | conflicts with Tyler 2026-11-07 "Dangerous and Deadly keep the bigger pulls". For Tyler |
| X-CELLAR-NORMAL-ONLY | P-X12, E-X09 | 3 | CONFIRMED | The Mill Cellar offers only Normal | src/data/balance-sheet.js:450 | keep. A content flag |
| X-SPELL-FLOOR | P-X40 | 3 | CONFIRMED | The beginner's floor: every cast lands max(its share of the blow, its old version-I number). Past about Level 15 the share is always larger. At Level 1 a Greater Mend lands its floor of 50 on a hero with 150 HP | src/data/abilities.js:356-376 (hitRange, castAmount `floored`) and src/core/hunt/status.js:69 | see Conflicts 1. The clean alternative is a floor on POWER (one number: a hero's blow is never read under N), not a second number on every row |
| X-MEND-MAXHP | P-X39 | 3 | CONFIRMED | Mend heals a share of max HP, not of the blow | src/data/abilities.js:335 healHpPm 110 | approved. Documented as the second of two heal kinds |
| X-THREE-ROLLS |  | 3 | CONFIRMED | Three shapes for "an amount": a swing rolls 1..max (mean 50%), a spell hit rolls 50%..100% (mean 75%), a heal or shell does not roll | src/core/combat.js:484, src/data/abilities.js:422, src/data/abilities.js:373 | see Conflicts 6. One roll rule with a per-kind spread in data would do all three |
| X-PARTY-ONLY-ROWS |  | 3 | CONFIRMED | A row may fire only alone, only in a party, or party-only for a tank | src/data/abilities.js `alone`, `party`, partyOnly; src/core/hunt/abilities.js:315-319 | approved. One shared gate, read from data |
| X-BRACE |  | 3 | CONFIRMED | A worn shield takes 30% off a marked monster spell, by item type | src/data/monster-spells.js:62 SHIELD_BRACE, src/core/hunt/monster-spells.js:150 | approved in direction. Cleaner as a stat on the shield row (bracePm) than a rule keyed on the slot |
| X-ELEMENT-RULES |  | 3 | CONFIRMED | Storm burns mana for half the HP taken. Necrotic lands Withered | src/data/elements.js ELEMENT_ON_HERO, src/core/hunt/damage.js:178-184 | needs Tyler's yes on the two rules before the switch goes on |
| X-TEMPER-ROUNDING |  | 3 | CONFIRMED | Tempering rounds by chance (the part of a point is a draw). Every other step floors | src/core/temper.js:13-15 | the right idea in one place only. See X-FLOOR-CHAIN |
| X-BOSS-FLOOR-CAP |  | 3 | CONFIRMED | A boss's blow is held to a third of the FLOOR hero's HP, however deep he lives | src/data/balance-sheet.js:218 floorCap 0.33 | a designer rule, never ruled by Tyler. Needs his yes |
| X-CALLED-ROOM | E-X31 | 3 | CONFIRMED | A called boss room pays nothing. A keyed hall pays | src/core/hunt/boss-room.js:23-26 | approved. Overlap: economy lane |
| X-DUMMY | P-X29 | 3 | CONFIRMED | A dummy's blow cannot kill and it cannot die | src/core/hunt/training.js | approved |
| X-CASTER-BASIC |  | 3 | CONFIRMED | A basic attack costs by weapon: a wand or staff 1 mana, a bow one arrow, a melee weapon nothing | src/data/hunt-roles.js:46-49, src/core/hunt/damage.js:342-356 | approved. Overlap: economy lane (E-SUPPLY-USE) |
| P-X07 |  | 3 | CONFIRMED | A hero alone earns +15% Level XP | src/data/party-class-xp.js:54 |  |
| P-X09 | E-X13 | 3 | CONFIRMED | The Tower and the Catacombs use a second party table by size only, with no class mix and no solo boost. Its pair and three rows are ASSUMED | src/data/tower.js:60; src/core/hunt/xp-share.js:72-74 | keep, documented: a session mode, not a hunting ground. Party math that differs by ground, on purpose |
| P-X14 |  | 3 | CONFIRMED | The Tower pays 37.5% of a kill's Level XP and a death there costs nothing | src/data/session-modes.js:35-36 |  |
| P-X15 |  | 3 | CONFIRMED | The Catacombs' mode row is a copy of the Tower's, marked ASSUMED, and so is its door Level | src/data/session-modes.js:37-45; src/data/tower.js:115-125 |  |
| P-X18 |  | 3 | CONFIRMED | A death takes 6% of the TOTAL Level XP but 6% of each skill's progress INTO its level, and Inner Flame is one of those skills | src/core/action-rules.js:313-325; src/data/skills.js:44 |  |
| P-X20 | E-X23 | 3 | CONFIRMED | Blessings are free under Level 30 | src/data/blessings.js:36 | keep if Tyler confirms. A Level threshold that changes a price on purpose |
| P-X28 |  | 3 | CONFIRMED | Training pays one fixed rate for every skill and level | src/data/training.js:47 |  |
| P-X33 | E-X24 | 3 | CONFIRMED | Dawnsteel's Tempering rung is 0.4% and a unique band's 0.5%, where every other tier's is 1% | src/data/temper.js:47,94 | keep. Already approved |
| P-X35 |  | 3 | CONFIRMED | Tier 1 gear has no Tempering ladder | src/data/temper.js:7 |  |
| P-X37 |  | 3 | CONFIRMED | Boss gems fix one thing about a jewelry roll (the Rat King's Crown Shard and Crown) | src/data/jewelry.js:122-126 |  |
| P-X38 |  | 3 | CONFIRMED | +skill on gear is a flat number of skill levels. One level is 0.35 of a point of largest blow at every Level, so its worth falls as the blow grows | src/core/combat.js:89-110; src/data/chests.js; src/data/catacomb-armor.js:48-49 |  |
| P-X41 |  | 3 | CONFIRMED | The three weapon skills advance on three different bases: Melee and Ranged on damage dealt, Magic on mana spent, Defense on the attacker's Level per blow aimed | src/core/hunt-rewards.js:59-63,245,266 |  |
| P-X44 |  | 3 | CONFIRMED | The XP weekend: +25%, added, never past +50% | src/data/live-events.js:27-33,91-92 |  |
| E-X03 |  | 3 | CONFIRMED | The coin line climbs x0.5 to x1.4 with the ground's floor between 1 and 16, then is flat forever | src/data/balance-sheet.js:175 (STAT_FORMULA.gp.line) | keep as the early-game ramp, documented. Past floor 16 coin a HP point never moves again, which is the inflation finding |
| E-X29 |  | 3 | CONFIRMED | A hero's first roll on a hall boss always lands a piece | src/core/drops.js:101-106 | keep. Already approved |
| E-X30 |  | 3 | CONFIRMED | Chest luck: warmth after dry keys and paid stokes | src/data/chests.js:143-153 | keep. One formula for every key family already |
| E-X32 |  | 3 | CONFIRMED | 29 imbuement parts drop with nothing to feed: they only sell, and their tier steps at monster Levels 30 and 80 | src/data/imbuements.js:50-110, src/data/catalogue-coherence.js VENDOR_TRASH | BUILD-LATER as linings (E55). Do not cut |
| X-VERSION-LADDER |  | 2 | CONFIRMED | Five versions, +10% each, the last at skill 60. Nothing after it, on a game with endless Levels. The plan (B5) said x1.6 | src/data/runes.js RUNE_TIERS | see Conflicts 5 |
| X-TURNING-CUT-10 |  | 2 | CONFIRMED | The merged area strike unlocks at Melee 10 for every weapon, so the axes and the hammer have no area move for Levels 1-9 (lone hammer -24% at the Thicket) | src/data/abilities.js:194 unlock 10, maxHits 8 | see Conflicts 7. A per-weapon unlock is a data field, not code |
| X-REND-DEFAULT |  | 2 | CONFIRMED | Rend sits on the default two-axe bar and spends a 1 g rune a cast | src/data/rule-subjects.js ROLE_RULES melee_dps | content. Overlap: economy lane (E-RUNE-SUPPLY: a default bar that spends gold) |
| X-DARK-ROWS |  | 2 | HYPOTHESIS | Converted to shares at their old Level 60 worth, never sized | src/data/abilities.js:275-327 (Brand, Reave, Updraft, Blight, the fist strikes) | content, owed by those lanes. Not measured here |
| X-ACTION-SET-SKIPS |  | 2 | CONFIRMED | Presets that skip rune or area rows (mana_train, boss) | src/data/abilities.js:144-148 | keep as data |
| X-DEFB-TWO-JOBS |  | 2 | CONFIRMED | One item field, defB, feeds two formulas by item class: on armor it is armor points, on a shield or cape it is guard in the to-hit roll | src/core/combat.js:181 and src/core/mitigation.js:33-41 | data layer: two fields (armor, guard). No number moves |
| X-BOSS-PHASE-ROWS |  | 2 | CONFIRMED | Each boss carries his own line numbers (enrage x1.15 to x1.8, guard 80%) | monsters.js:830,845; grounds/krells_hold/pack.js:350,360; grounds/muster_barrows/pack.js:178 | a model case: one mechanic, numbers in data |
| X-ROLE-TARGET-NUMBERS |  | 2 | CONFIRMED | Healer peel 18%, Challenge radius 6, hold 8 s, the 90% weak-tank floor | src/data/hunt-roles.js:48,145 | data. Never measured |
| P-X01 |  | 2 | CONFIRMED | The Level curve is a table of 16 brackets, 12 of them under Level 21, re-fitted or re-cut 8 times between 2026-10-27 and 2026-11-20 | src/data/core-model.js:15-88 |  |
| P-X03 |  | 2 | CONFIRMED | The brackets at 110 and 300 are fitted by hand to the contract with no ground there. Hours a Level sit flat at 11.2 to 11.8 from Level 100 to 300, then reach 20.8 at Level 400 | src/data/core-model.js:85-86 |  |
| P-X08 |  | 2 | CONFIRMED | The party table's nine cells are hand-fitted, three of them re-cut for one measured case (the one-class pair for a shield and hatchets on the Pauper Vaults, the two top four cells for Deadly's HP) | src/data/party-class-xp.js:72-79 |  |
| P-X30 |  | 2 | CONFIRMED | The yard fee in the code (50 + 6 a level) is not the fee Tyler ruled (100 a level) | src/data/training.js:53-54 |  |
| P-X31 |  | 2 | CONFIRMED | Gear stats are hand-typed arrays, and single cells were tuned to pass one guard on one ground (the warhammer's tiers 2 and 3, Steel Hatchets 14/16, Mithril Hatchets 19/21) | src/data/gear-tiers.js:66-150 |  |
| P-X47 |  | 2 | CONFIRMED | The Luck bar is ruled and lives only in a simulator file | tools/balance-sim/staged/luck.js |  |
| P-X48 |  | 2 | CONFIRMED | Magic XP a mana is two stacked constants: 1.5 for every cast, times the row's own multiplier (1.6 on 30 rows, 0.25 on 16, 0 on 2). A caster's real rate is 2.4 a mana and no row uses 1.0 | src/data/hunt-xp.js:23; src/data/abilities.js (magicXpMult); src/data/hunt-roles.js |  |
| E-X16 |  | 2 | CONFIRMED | Two ways to know a row's band: its own `band`, else its odds against DROP_BAND_MAX (rare 5%, uncommon 15%) | src/core/drops.js:14-30 | every row names its band (lucky finds stay, ruled 11-20); delete the odds fallback |
| E-X20 |  | 2 | CONFIRMED | VENDOR_RAW_RATE 0.20 and SHOP_BUYBACK_RATE 0.5 are authored in the edge function, and restated in src/data/shops.js | supabase/functions/hr-accrue/catalogue.js:307, 324, src/data/shops.js DERIVED_PRICES, src/data/scaled-hunts.j… | author them in src/data; the edge imports them |
| E-X22 |  | 2 | CONFIRMED | The market's fee (1%), cut (1.5%), ceiling (book x 100) and gates live only as SQL column defaults in hr_market_config | supabase/migrations/2027-01-12-market-account.sql:302-336, supabase/migrations/2026-08-17-market-v2.sql:542 | a src/data/market.js row and a generated config, like every other catalogue |
| E-X25 |  | 2 | CONFIRMED | TEMPER_TIERS: a hand-typed first rung a gear tier (2,000 / 7,000 / 8,000 / 12,000 / 16,000 / 40,000). The comments price each at 40 to 52% of its band's gold. There is no row past tier 7 | src/data/temper.js TEMPER_TIERS | price = a ruled share of the band's net gold (G-10: 1.2 to 1.4 of a band for all standing prices), computed for any tier |
| E-X33 |  | 2 | CONFIRMED | Every Scarce, Rare, Key and Trophy row's chance is typed by hand until a test measures its hours inside the band | src/data/loot-bands.js:43-54, every banded row in src/data/monsters.js and the packs | author HOURS on the row and derive the chance from the measured kills an hour, the way Hearthfind already does |
| E-X34 |  | 2 | HYPOTHESIS | respawnMs is typed a ground (32 s to 90 s) and is a hidden ceiling on kills an hour once a party clears faster than packs return | src/data/hunt-grounds.js:192-348, src/core/hunt/pull-cycle.js:285 (report 69: two Level 45s cleared Wickstead… | confirm on the grid: BiS kills an hour against pockets x pack / respawn. If it binds, gear upgrades stop paying on that ground |
| E-X39 |  | 2 | CONFIRMED | The Hearthfind's kills an hour is a measured constant typed on each row | src/data/hearthfind.js | read it from the ground-rate table the atlas already measures, so it moves when monsters do |
| S-X02 |  | 2 | CONFIRMED | The store's five heals are a hand price table: 0.19, 0.33, 0.83, 1.50 and 1.75 gold a hit point from shrimp to shark, nine times apart, while coin a kill is a formula | src/data/supply-basics.js BASIC_SUPPLIES (heal rows) | coefficient layer: price = hit points x one gold-a-hit-point line. Raised by 55-review-economy |
| S-X03 |  | 2 | HYPOTHESIS | Mana a version is a hand-written x1.2 ladder typed on 16 spell rows. Confirm by reading the versions of each row in src/data/abilities.js | src/data/abilities.js versions | coefficient layer: one step beside RUNE_TIERS stepPm. Raised by 52-review-combat, not read here |
| X-REPLACES |  | 1 | CONFIRMED | A row that stands in for another shares its cooldown | src/core/hunt/abilities.js:250-253 clockOf | keep |
| X-ONE-INTERVAL |  | 1 | CONFIRMED | One 2.0 s basic attack for everyone, no speed stat | src/core/combat.js:63 | keep. "Attack speed" on Tyler's list is this plus cooldowns and Chill |
| X-TOHIT-RAILS |  | 1 | CONFIRMED | Every chance is held to 5%..97% | src/data/to-hit.js:117 | keep. On the projected gear line a hero reaches 95% near Level 2,000 (section 7) |
| X-MIN-ONE |  | 1 | CONFIRMED | Every landed blow deals at least 1 | src/core/hunt/damage.js:135, mitigation.js:86, combat.js:422,493 | keep |
| X-MITIGATION-CAP |  | 1 | CONFIRMED | Armor never takes more than 60% of a blow | src/data/core-model.js:172 capPm 600 | keep |
| X-CRIT-CAP |  | 1 | CONFIRMED | Crit chance at most 60%, a crit x1.5 | src/core/combat.js:64-65 | keep |
| X-RESIST-CAPS |  | 1 | CONFIRMED | A hero resists at most 40% of an element and 10% physical. A monster profile is bounded both ways | src/data/elements.js HERO_RESIST_PM, ELEMENT_PCT | keep |
| X-ATTACKER-LEVEL |  | 1 | CONFIRMED | Armor is measured against the attacker's Level | src/core/mitigation.js:12 | keep. It is why armor must grow with Level (section 7) |
| P-X36 |  | 1 | CONFIRMED | A jewelry perk counts once per hero at its largest worn size, never a sum. Surge lands a cast at x1.5 | src/core/combat.js:235-250; src/data/jewelry.js:63 |  |
| P-X45 |  | 1 | CONFIRMED | The curves' ceilings: Level totals are exact to Level 63,243, and the skill walk stops at skill 476 | src/core/xp.js:77,115-121 |  |
| P-X46 | E-X21 | 1 | CONFIRMED | Server twins of the curves, vitals, fee, price and death bound | SQL hr_char_level, hr_skill_level, hr_max_hp, hr_max_mana, hr_regen_permille, hr_training_fee, hr_blessing_pr… | keep SQL as the authority. Either the client shows only the server's quote (the envelope already carries most), or each pair names its equality test in this register |
| E-X15 |  | 1 | CONFIRMED | A drop chance is capped at 0.95 after multipliers, and a 100% row is never multiplied | src/core/drops.js:43, 47 | keep. Move 0.95 to a named data constant |
<!-- END GENERATED:EXCEPTIONS -->

---

## 3. The dependency map

### 3.1 The picture

```
                    PROGRESSION                              COMBAT                                   HUNTING AND ECONOMY

   pace contract P02 ──────────────┐
        │                          │
        v                          │
   Level curve P01 ──> hero HP P11 ─┼──> MONSTER ROW C-MON-STATS ──> monster blow, aim ──┐
        │                          │      (HP, blow, aim, evasion,                       │
        │                          │       and XP and coin on the same row)              v
        ├──> gear worn by Level P35 ──> GEAR C-GEAR-WEAPON / ARMOR ──> armor chain ──> ONE DAMAGE DOOR C-HURT
        │                                   │                                            ^      │
   skill curve P03 ──────────────> HERO POWER C-HERO-POWER ──> swings, spells,           │      │
        ^                              (0.35 skill + 0.6 gear + 2)   heals, shells ──────┘      │
        │                                                                                       v
        │                                              TIER TABLE C-TIER ──> pull, blow, HP, XP │
        │                                                                                       │
        └── skill XP P06 P07 P08 <── damage dealt, blows taken, mana spent <─────────────────────┤
                                                                                                │
   kill XP split P20 <── XP a kill E01 <── monster HP                                           v
        │                                                              KILLS AN HOUR E14 (no formula, only measured)
        v                                                                 │            │              │
   Level curve P01 (the loop closes)                                      v            v              v
                                                                    drop hours E46   coin E23    supply bill E18
   pace contract P02 <── re-pinned to what E14 measured                   │            │              │
        (THE CIRCLE: the target is fitted to the grounds                  v            v              v
         and the grounds are fitted to the target)                    drop chance   SHOP BID E26   ACCOUNT DAY E56
                                                                                    (market floor,   (gold in less gold out,
                                                                                     bench tax)       no formula in the game)
```

### 3.2 The few formulas the rest depend on

Ranked by how many formulas read each one directly. "Reaches in all" is nearly flat, and that is a finding in itself: three out of four formulas can reach the game's two play loops (a skill trains by fighting, a Level raises health), so a change almost anywhere comes back round.

<!-- GENERATED:HUBS (tools/balance-program/formulas/architecture-register.mjs --write) -->
| formula | what it is | category | read directly by | reaches in all | of 106 |
|---|---|---|---|---|---|
| C-MON-STATS | A monster row from its Level, role, ground floor and fit: HP = (4.95 + 1.76 x L) x role x… | combat | 11 | 78 | 74% |
| C-GEAR-WEAPON | Weapon accuracy and damage: the one gear formula, the family's profile x the slot's share… | combat | 9 | 78 | 74% |
| P03 | Combat skill curve: XP from skill level s to s+1 = floor(15 x s^2 x 1.04^(s-1)), no cap | progression | 9 | 78 | 74% |
| C-TIER | Normal, Dangerous, Deadly: a pull size and three dials. dmgPm multiplies atk, aim AND the… | combat | 7 | 78 | 74% |
| C-HERO-POWER | A hero's largest blow (maxHit): floor(0.35 x (weapon skill + worn +skill) + 0.6 x summed… | combat | 6 | 78 | 74% |
| P01 | Level curve: total Level XP to reach a Level, and the Level a total makes | progression | 6 | 78 | 74% |
| P11 | Max HP and max mana: HP = floor((150 + 10 x (L-1)) x (1000 + 280 x heavy slots / 6) / 100… | progression | 6 | 78 | 74% |
| C-CAST-POWER | A cast's power in permille: the rune tier's step (1000 / 1100 / 1200 / 1300 / 1400 at eac… | combat | 4 | 78 | 74% |
| C-GEAR-ARMOR | Armor points: the one gear formula (src/core/gear-stats.js gearStats): the weight's profi… | combat | 4 | 78 | 74% |
| C-STATUS | Statuses, one generic engine: a ticking one (Bleed: scale = max(tier share, floor(maxHit… | combat | 4 | 78 | 74% |
| C-TEMPER | Tempering: Blows raises what lands on a monster and every heal by rungs x the ladder's pe… | combat | 4 | 78 | 74% |
| E14 | XP an hour, kills an hour and gold an hour. No formula computes these. The target is cont… | economy | 4 | 78 | 74% |
<!-- END GENERATED:HUBS -->

Read as a design statement, seven numbers carry the game:

1. **The monster row** (`C-MON-STATS`). Health, blow, aim and evasion from a Level and a role. It also carries the kill's XP and coin, so the health line is a combat knob, a pace knob and a gold knob at once.
2. **Gear** (`C-GEAR-WEAPON`, `C-GEAR-ARMOR`). Feeds hero power, hit chance, armor, the reference hero, and every gear price.
3. **The skill curve** (`P03`). Feeds power, both hit chances, rune tiers, the yard, the death cost.
4. **The tier table** (`C-TIER`). One row moves blow, aim, health, XP, the pull, and today also armor and Defense XP.
5. **Hero power** (`C-HERO-POWER`). Every swing, spell, heal, shell and bleed is a share of it.
6. **Hero health** (`P11`). Every monster blow is a share of it.
7. **The Level curve** (`P01`). Health, gear requirements, the death cost and Blessing prices all read it.

One more sits at the center and is not a formula at all: **kills an hour** (`E14`). Every hours-based promise reads it (the pace, drop hours, lucky finds, net gold), and only the engine knows its value. Every per-ground correction in the game is a stand-in for it.

### 3.3 Edges and circles

<!-- GENERATED:EDGES (tools/balance-program/formulas/architecture-register.mjs --write) -->
Edges that cross a category (64, read "left feeds right"):

- P03 (progression) -> C-HERO-POWER (combat)
- P02 (progression) -> E01 (economy)
- E01 (economy) -> P20 (progression)
- C-TIER (combat) -> P20 (progression)
- P35 (progression) -> C-GEAR-WEAPON (combat)
- P15 (progression) -> C-HERO-POWER (combat)
- C-HERO-POWER (combat) -> P06 (progression)
- P03 (progression) -> E42 (economy)
- P03 (progression) -> C-REGEN (combat)
- C-TIER (combat) -> P07 (progression)
- E37 (economy) -> P28 (progression)
- P01 (progression) -> E37 (economy)
- P04 (progression) -> C-JEWEL-PERKS (combat)
- C-GEAR-WEAPON (combat) -> P19 (progression)
- P25 (progression) -> C-RUN-ROOM (combat)
- P22 (progression) -> C-RUN-ROOM (combat)
- P03 (progression) -> C-REF-HERO (combat)
- P02 (progression) -> C-REF-HERO (combat)
- P11 (progression) -> C-SPELL-HIT (combat)
- C-MON-STATS (combat) -> E01 (economy)
- C-MON-STATS (combat) -> E23 (economy)
- C-TIER (combat) -> E10 (economy)
- C-PULL (combat) -> E10 (economy)
- C-BASIC-BLOW (combat) -> E18 (economy)
- P03 (progression) -> C-HERO-TOHIT (combat)
- P03 (progression) -> C-MON-TOHIT (combat)
- P03 (progression) -> C-CAST-POWER (combat)
- P11 (progression) -> C-MON-STATS (combat)
- P11 (progression) -> C-SPELL-HEAL (combat)
- P11 (progression) -> C-REGEN (combat)
- P11 (progression) -> C-TARGET (combat)
- P11 (progression) -> C-MANA (combat)
- P35 (progression) -> C-GEAR-ARMOR (combat)
- C-GEAR-ARMOR (combat) -> P11 (progression)
- C-MON-TOHIT (combat) -> P07 (progression)
- C-TARGET (combat) -> P07 (progression)
- C-HURT (combat) -> P06 (progression)
- C-MANA (combat) -> P08 (progression)
- C-TRAINING (combat) -> P09 (progression)
- C-HURT (combat) -> E14 (economy)
- C-PULL (combat) -> E14 (economy)
- C-AREA (combat) -> E14 (economy)
- C-CLOCKS (combat) -> E14 (economy)
- C-REGEN (combat) -> E14 (economy)
- C-MON-BLOW (combat) -> E18 (economy)
- C-ARMOR-CHAIN (combat) -> E18 (economy)
- C-SPELL-HEAL (combat) -> E18 (economy)
- C-REGEN (combat) -> E18 (economy)
- C-LEECH (combat) -> E18 (economy)
- C-MANA (combat) -> E18 (economy)
- E30 (economy) -> C-CAST-POWER (combat)
- E30 (economy) -> C-BASIC-BLOW (combat)
- E38 (economy) -> C-TEMPER (combat)
- E40 (economy) -> C-JEWEL-PERKS (combat)
- E55 (economy) -> C-RESIST-HERO (combat)
- E55 (economy) -> C-LEECH (combat)
- C-BOSS-ROOM (combat) -> E48 (economy)
- C-RUN-ROOM (combat) -> E49 (economy)
- C-GEAR-WEAPON (combat) -> E27 (economy)
- C-GEAR-WEAPON (combat) -> E30 (economy)
- C-GEAR-WEAPON (combat) -> E38 (economy)
- C-GEAR-WEAPON (combat) -> E40 (economy)
- P28 (progression) -> E37 (economy)
- E14 (economy) -> P02 (progression)

Formulas that sit on a circle, where a change comes back round to its own input (56): C-AREA, C-ARMOR-CHAIN, C-BASIC-BLOW, C-CAST-POWER, C-CLOCKS, C-CRIT, C-ELEMENT-MON, C-GEAR-ARMOR, C-GEAR-WEAPON, C-HERO-POWER, C-HERO-TOHIT, C-HURT, C-JEWEL-PERKS, C-MANA, C-MON-BLOW, C-MON-DEF, C-MON-SPELL, C-MON-STATS, C-MON-TOHIT, C-PULL, C-REF-HERO, C-REGEN, C-RESIST-HERO, C-SPELL-HIT, C-SPELL-SHELL, C-STATUS, C-TARGET, C-TEMPER, C-TIER, C-VULN, C-WEAKNESS, E01, E10, E12, E14, E30, E37, E38, E40, E46, E55, P01, P02, P03, P05, P06, P07, P08, P11, P15, P19, P20, P22, P23, P28, P35
<!-- END GENERATED:EDGES -->

Two kinds of circle are in that list, and they are not the same thing.

- **Play loops, which are the game.** Damage dealt trains the weapon skill, which raises power, which raises damage dealt. Kill XP raises the Level, which raises health, which sizes the monsters. These are meant to exist. They are why a balance change has to be played over a career and not read off one fight.
- **The authoring circle, which is the problem.** The pace contract was re-pinned to what the grounds were measured to pay (2026-11-11 and 11-19). The grounds' XP was fitted to the contract. The Level curve was fitted to both. Nothing in that circle is fixed, so each re-measure produced a patch. Section 5.2 breaks it by making the contract the one law and deriving the other two.

---

## 4. The architecture assessment, by the seven principles

| Principle | Whole-game verdict | Where it holds | Where it breaks |
|---|---|---|---|
| **Centralized** | Mostly yes | One engine, imported by the server with no vendored copy. One damage door. One reward generator. Curves, health, death and the split each have one home | The hit formula's coefficients are typed in place and the named ones are a second copy (`X-POWER-LITERALS`). Hero health is written three ways and one is a Level off (`X-REFHP-OFF-BY-ONE`). The gear formula past tier 7 is outside the game (`X-LINE-IN-TOOLS`). The shop's bid needs four files (`E-X19`, `E-X20`). Market fees live only as SQL column defaults (`E-X22`). Two projections of the same hero disagree (`P-X42`, `P-X43`) |
| **Deterministic** | Yes | No `Math.random` in any formula read by any lane. One seeded stream, units in id order, every draw named. Chest and Hallmark rolls are on the server | One weak point. Shared data rows are left unfrozen so the simulator can edit them in place (`X-MUTABLE-ROWS`) |
| **Data-driven** | Half | Spells, statuses, boss phases, tiers, modes, Blessings, Tempering and training are rows | 118 hand-typed monsters (`X-HAND-ROWS`). Gear is hand-typed cells (`P-X31`). About 300 drop chances typed by hand (`E-X33`). And the worst kind: data rows doing a formula's job, which is 15 XP fits, 11 gold fits, 13 tier rows (`E-X01`, `E-X02`, `X-TIER-PER-GROUND`) |
| **Composable** | Half | Statuses and shapes compose: a new status is a row. The XP split is one chain of factors | "Takes more damage" exists twice (`X-MARK-TWO-WAYS`). Worn modifiers stack five ways (`X-STACKING-RULES`). Three roll shapes for one idea (`X-THREE-ROLLS`). The shop's bid is five stacked rules, three of which undo another (`E-X19`). Two links of the XP chain are keyed on Level or floor (`P-X06`, `E-X04`) |
| **Scalable** | No | Monster stats, hero health and mana, the Level curve's tail, the party split, every ratio (tier XP, events, Tempering percent) | The hero half stops: gear at 88, rune tiers at skill 60, the Tower at floor 300. Skill fades to nothing. Sinks are lists that end at tier 7. Food heals fixed amounts while health grows. The death cost grows about L^1.7 against a Blessing price that grows as L |
| **Auditable** | No | A kill's XP can be traced through seven named factors. Any hunt can be replayed from its seed | A blow cannot be explained: `hurt` returns the final number and no event says which of nine steps took what. A sale price needs four files. Net gold a day has no single trace. The pace is a measurement of grounds that were tuned to it |
| **Globally tunable** | Half | The to-hit base, the monster blow share, health a Level, the death share, the tier table and coin a health point each move everything they should | One knob moves three things (`X-TIER-TRIPLE`). The hero power coefficients are not knobs at all. A global change must then be re-fitted in up to 28 per-ground rows before the guards go green. The 2026-11-19 "+10% monsters" step is the proof: one coefficient, then five follow-up re-fits |

**The one-line read.** The game passes the two principles that are about code (centralized, deterministic) and fails or half-passes the five that are about numbers. That is good news for the roadmap. Almost nothing here needs the engine rebuilt. It needs numbers derived in place of typed.

**Server authority (CLAUDE.md sections 1 and 6).** Two rows are the browser working out a number the server owns: the death percent on the Hunts page (`P-X21`) and drop odds without the hero's buff (`E-X38`). Both break the rule that every number a player can act on comes from the server's projection. They are small, and they are in the roadmap as step R3. Whether every input the client hands the shared pure functions is the server's projection was not traced by any lane. That stays a hypothesis.

**Server cost.** No formula runs a database statement per kill (`43` section 9). The cost is journalling at the settle cadence, which is the platform lanes' work. One rule for this roadmap follows from it: no model change may add a statement per kill or per settle, and every price that moves to a formula must stay computable in SQL from generated rows, the way `hr_level_curve` is today.

---

## 5. The proposed unified model

The rule from the brief, applied to every item below: no new formula or abstraction unless it removes complexity or fixes correctness. Each framework names what it removes. Each of the ten candidates the lanes raised gets a verdict of mine, marked JUDGED.

### 5.1 Combat: Power, one amount pipeline, one monster formula

Nine mechanics, all of which exist today in a messier form (`41` section 5 has the detail).

1. **Power.** One number a unit: the largest hit. Hero: `skillPower x skill + gearPower x weapon damage + basePower`, read from named constants. Monster: a share of a same-Level hero's health, stored on the row as a whole number.
2. **Rating against rating.** The to-hit ratio as built.
3. **One amount pipeline.** Every amount (swing, spell hit, tick, monster blow, heal, shell) is `roll(Power x share) x the product of its modifiers`, multiplied in permille and rounded once, in one fixed order. Each blow can emit a short trace of its stages.
4. **The armor chain** as ruled, read against the monster's own Level.
5. **The monster formula** writes every monster from a Level, a role and an encounter type.
6. **One tier table**, the same on every ground.
7. **The gear curve.**
8. **One modifier table**: each worn or cast modifier is a key, a combine rule (sum or largest) and a cap.
9. **Sustain**: two heal kinds in data, a share of Power or a share of max health.

**JUDGED: a tier's damage dial applied once. Yes, and in 0.2.144.** The dial should move the blow and the aim. Armor and Defense XP should read the monster's own Level. This is a correctness bug, not a tuning choice: nobody meant a Level 8 monster to count as Level 21. Blow and aim both stay on the dial because "harder" should mean hits harder and lands more often, which is your 11-04 "just simply harder". Evidence: `tools/balance-program/formulas/tier-read.mjs`, COMPUTED.

**JUDGED: how spells read miss, crit and weakness. One answer for each.**
- **Weakness: yes, by damage kind.** A spell with an element already reads the monster's element profile. A physical strike (Power Strike, Turning Cut) is a share of the neutral blow and reads nothing. A cast should read the weakness of its own damage kind: weapon weakness for a physical strike, the element for an elemental spell. One rule, and it closes the gap without re-sizing elemental rows.
- **Miss: no.** A spell that never misses is a plain rule a player likes, and a missed cast would burn a paid rune for nothing. Accuracy stays a basic-attack stat and the wiki says so.
- **Crit: no.** Crit is capped at +30% damage on basic hits. Letting spells crit raises every caster by up to 30% on a crit build and means re-sizing every spell row. Nothing is broken today that this would fix.
- The cost of this answer is real and stays on the table: accuracy and crit gear are worth less the more a hero casts. `52-review-combat` computes weapon accuracy at about an eighth of weapon damage. Whether accuracy is still worth a stat line is a question for the matrix's gear-step cells, and it is HYPOTHESIS until they are played.

### 5.2 Progression: one pace law, a gear curve, one XP chain

**JUDGED: a gear curve as a game formula in `src/data`. Yes. It is the most important item on this page.** It is the only change that fixes a CONFIRMED break (kill speed from Level 111, the game ending near Level 300), and `42` MEASURED on the real engine that with it the pace holds from Level 200 to 5,000. The shape I recommend, with reasons:

- **Linear in the Level a piece is worn at.** Monster health is linear (4.95 + 1.76 a Level). Hero health is linear (150 + 10 a Level). Gear on any other family of curve drifts against both. The staged line, Dawnsteel x Level / 110, is already linear. The seven hand tiers become its samples.
- **Bands by percent, not by Level count.** On a straight line a band every 20 Levels is +18% at Level 110 and +1% at Level 2,000 (`42` section 7.6). An upgrade should be a fixed step of power, about +6.5% (your 10-25 ruling of 5 to 8% for a weapon). That puts bands about 7 Levels apart at 110, 20 apart at 300 and 65 apart at 1,000.
- **The reference hero reads the curve.** Otherwise hit chance drifts from 85% to 95% by Level 2,000 (`41` section 7, COMPUTED).
- **A unique spends a budget from the curve at published exchange rates.** Its armor is then arithmetic, not a simulator result at the fourth digit. That is the formula-layer fix for the red `tests/armor-line.mjs` AL3 guard, which will otherwise go red on every engine batch (`41` section 6.1).

Two things the curve does not solve, and both are for you (section 8). On a curve that keeps pace, skill shrinks to 14% of a hit at Level 1,000. And `56-review-progression` reads the standards' "+5 to 8% a band every 20 Levels" as compounding, which would be the one exponential in the hero. The code's projector is linear, so the standard and the code disagree. Linear with percent bands is the answer to both readings.

**JUDGED: one Level law with the curve as canonical. Yes, but the law is your table, not a fitted power.** Today the Level curve is 16 hand brackets. The progression lane offers one power law that lands six ruled points within 8% and puts Level 400 at 5,090 hours where you ruled 4,580. I would not trade a ruled number for a tidier formula. The clean form that keeps every ruling:

- **Hours to each Level is the content you own**: the ruled points (6 h, 36 h, 168 h, 600 h, 1,680 h, 3,120 h, 4,580 h, on to 23,520 h at Level 1,000), joined by a straight line on a log scale and carried on past the last point at the last slope.
- **The pace contract is the one law**: what an hour pays at Level L, `a x L^b`.
- **The Level curve is derived**: the XP a Level costs is the hours it takes times what an hour pays, times the pace seat's multiple (you ruled the seat on 11-21: a MID four on the hardest tier it holds).

That removes the hand brackets (`P-X01`, `P-X02`, `P-X03`), is exact at every ruled point, and ends the circle: the contract no longer gets re-pinned to a measurement.

**JUDGED: a kill reward with a kill-rate term, replacing the 15 XP fits and 11 gold fits. Yes for XP, and the gold fits need no such term.** The two lanes offer two versions. Progression would compute the reference kill rate from the blow formula. Economy would have the generator measure each ground on the grid and write one factor. My call:

- XP a health point becomes `contract(L) / reference kill-health an hour(L)`, one reference line for the whole game. The exponent 0.4 and the two "hold the pace" factors (x0.96, x0.88) go. So does the drift `43` found, where XP a kill outruns the contract by 8% at Level 400 and about 30% at 5,000.
- A ground then needs at most **one derived number**: how its layout (walking, pack size, respawn) moves kill-health an hour against the reference. The generator writes it from the matrix, the way Hearthfind odds are already derived from a measured rate. Nobody types it. `53-review-world` reaches the same place from the design side: a map's walking is a content fact.
- The risk is the one the armor-line guard already shows: a number derived from a simulation moves whenever the engine moves. So the derived number carries a stated tolerance (5%), is re-written only by `--write` in the lane that moves a formula, and the guard says "re-derive", never "re-fit by hand".
- The 11 gold fits are one number, x0.7, typed 11 times. They fold into the coin line (5.3). No kill-rate term is needed for gold.

**JUDGED: per-ground tier dials folded into data. They are already data. The right move is to delete them, in the same step as the kill reward.** Each exists because a four killed too fast for the XP on that ground, which is the missing kill-rate term again. Once the reward is derived, every ground takes the one tier table. One field stays as honest content: how many monsters a ground's rooms can hold on a harder tier (the Glade's 6). That is geography, not balance.

**JUDGED: party XP. One table for every mode, and one chain with no hidden keys.**
- The chain is: kill XP x tier x mode x party x event. Each factor is one table for the whole game.
- The lone hero's +15% becomes the first cell of the party table. The number is yours and stays. It is one constant less, and `57-review-social` found every other cell was rescaled by it.
- The Tower and the Catacombs take the same table. Your 11-16 words were one table and not a unique formula everywhere.
- The Level-keyed cut for a low hero in a high party goes, as you ruled on 11-08. It is keyed on a ground's floor, which makes it a per-ground party rule, and the wiki cannot state it simply. See section 8 for the other side.
- Whether the table pays for a mix of classes or for size alone is a design question (`57` argues size alone, against your 10-31 ruling). The architecture does not care. It is one table either way.

### 5.3 Hunting and economy: reward a health point, one wage curve

**JUDGED: one wage curve for prices. Yes for every price that repeats. Not for one-off account goods.**
- `wage(L)` is what a lone MID hero nets in an hour on Normal at Level L. `55-review-economy` wants it read from the matrix. I would not put a simulator in the path of a server price. The wage should be a formula the server can compute: the coin line times the same reference kill rate the kill reward uses, less the supply share. The matrix then checks it against played net gold within 10%.
- Every repeating price row holds hours, not gold: the refill, the Blessing, the yard, a scaled hour. Six price lines that are each straight in Level against a wage that is not become one curve and one number a price.
- Hero slots stay typed (400k, 1.5M, 4M). You ruled them three times in two days. They are one-off account goods, not a curve.
- These are money surfaces. Each is a server migration, staged, and inside the one Security review before Early Access (CLAUDE.md section 2).

**JUDGED: a heal price formula. Yes, and it needs a second half the lanes did not name.** The store charges 0.19 gold a hit point for shrimp and 1.75 for shark, nine times apart, typed by hand, while coin a kill is a formula. So price becomes hit points times one gold-a-hit-point line. The second half: the food ladder stops at 396 hit points while hero health passes 1,140 at Level 100 and 10,140 at Level 1,000 (`41` section 7). A heal item's size should be a share of the reference health of its tier, on the same curve as gear, or eating becomes forty bites a fight. One caution. The harness reads a party's store bill at about twice the real one (`51-baseline.md` fault F5), so the size of the heal price problem is a HYPOTHESIS until that is fixed. The shape of the fix is not.

**JUDGED: sinks priced as a share of band gold. Yes for standing sinks that ride the gear curve.** You ruled the size on 11-18: a band's standing upgrades cost 1.2 to 1.4 of the band's net gold, so players choose. Today that is typed ladders that end at tier 7. Tempering, Hallmarks and linings should each cost a share of the band's wage, so every band has its sinks by construction. The House stays typed content. Its rooms are things, not a curve. It is still judged by the same band.

**The other four economy mechanics** are the economy lane's and I take them as written (`43` section 5): the four stacked coin dials become one coin line by monster Level (same gold, one number), one tier table, drops authored in hours with the chance derived, and one sale formula that works at tier 8.

### 5.4 What the model removes

<!-- GENERATED:REMOVES (tools/balance-program/formulas/architecture-register.mjs --write) -->
| Framework | Roadmap steps | Accidental exceptions it removes |
|---|---|---|
| Dead rules deleted | R1 | `E-X26`, `E-X27`, `E-X28`, `X-STALE-HP-NOTE` |
| Power from named constants, and a row that stores its blow | R2, R4, R7 | `X-POWER-LITERALS`, `X-ART-TIER-SCALE`, `X-REFHP-OFF-BY-ONE` |
| Each duplicate becomes one | R3 | `X-ROLL-TWINS`, `X-TIER-LADDER-TWINS`, `X-MARK-TWO-WAYS`, `X-ROW-DOOR-BYPASS`, `X-STEADY-TWO-MEANINGS`, `P-X19`, `P-X21`, `E-X38` |
| One tier table, applied once | R7, R12 | `X-TIER-TRIPLE`, `X-TIER-PER-GROUND`, `X-PARTY-FIT-PATCHES` |
| One XP chain | R5, R8, R22 | `P-X06`, `X-TOWER-HEAT`, `X-TOWER-TOP` |
| One coin line and one sale formula | R9, R17 | `E-X02`, `E-X05`, `E-X17`, `E-X18`, `E-X19` |
| The gear curve and exchange rates | R10, R11 | `X-LINE-IN-TOOLS`, `X-ARMOR-LINE-FIT`, `P-X34`, `X-POWER-TOOLS` |
| The pace law and the derived kill reward | V1, R12, R13 | `E-X01`, `E-X04`, `X-GENTLE-HP`, `X-GENTLE-CAP`, `P-X02`, `P-X42`, `P-X43` |
| Spells read their own weakness | R6 | `X-SPELLS-SKIP-WEAKNESS` |
| Drops authored in hours | R18 | `E-X14` |
| One amount pipeline | R19 | `X-FLOOR-CHAIN`, `X-SHEET-ORDER` |
| One modifier table | R20 | `X-STACKING-RULES`, `X-SET-CRIT`, `X-DORMANT-FACTORS`, `S-X01` |
| Every monster reads the formula | R21 | `X-HAND-ROWS`, `X-NAMED-HASK-LOOKOUT`, `X-LEVEL-BY-TIER`, `X-SPELL-HOLDS` |
| One skill grant | later, with the wipe | `P-X24`, `P-X25`, `P-X26`, `P-X27` |
| The simulator stops editing and approximating | R23 | `X-MUTABLE-ROWS`, `E-X37` |
| **In all** | | **55 of 56** |
| No framework behind it | | `E-X36` |
<!-- END GENERATED:REMOVES -->

The register tool checks this table: every id in it is a class 4 row, named once. The one row with no framework behind it is a fallback in a helper, and it is a hypothesis.

### 5.5 The global tuning knobs

The full set is `tools/balance-program/formulas/knobs.json`, in the format of the matrix lane's `tools/balance-program/knobs.mjs` (schema `hearthrise.balance-knobs/1`), so the dashboard can swap to it. It keeps the matrix lane's 19 ids and adds 14. Every value below was read from the tree by the register tool. `--check` reads STALE when a number or a line moves, and `--write` reads the values again, so a lane that moves a coefficient runs one command.

**Live today (33).** The matrix can turn each of these now.

| Knob | Today | What it moves |
|---|---|---|
| `playerAttack` | 0.35 a skill level, 0.6 a point of weapon damage, 2 flat | Every hit, spell, heal, shell and bleed. Kill speed |
| `critMult` | 1.5 | The ceiling of crit builds (with the 60% chance cap, +30%) |
| `weaknessDamage` | 1.20 | What matching a weapon to a monster is worth |
| `toHitBase` | 20 | How much one point of skill, accuracy or Defense is worth at low Level |
| `heroAccuracy` | 0.85 | Every hero's hit chance at equal Level |
| `attackInterval` | 2,000 ms (ruled 10-15) | Attack speed for heroes and monsters |
| `spellRollLow` | 500 permille | The spread of a spell hit. Variance and close calls |
| `manaRegen` | 25% of max a minute | Casts an hour, drink bought |
| `storeSupplyShare` | 0.75 | Store supplies against crafted ones |
| `monsterDamage` | 13.2% to 22% of hero health, gentle cap 11% | All incoming damage, food bought, deaths |
| `monsterHp` | 4.95 + 1.76 a Level | Kill time everywhere, and XP and coin a kill |
| `monsterAccuracy` | 40% gentle, 70% full | How often monsters land |
| `monsterDefense` | 0.08 a Level | Small hits against big ones |
| `monsterDefenseCut` | 3% a point | The same, from the other side |
| `partyGroundHp`, `partyGroundBlow` | x2.5, x0.75 | What "built for a party" means |
| `tierDanger` | 1170, 1330 permille | Blows on Dangerous and Deadly |
| `tierHp` | 1100, 1150 | Monster health on harder tiers |
| `tierXp` | 1100, 1250 | The reward side of risk against reward |
| `tierPull` | 8, 8 | Kill rate, area damage, what a tank holds |
| `heroHp` | 150 + 10 a Level | Health, and every monster blow with it |
| `heroMana` | 100 + 10 a Level | Casts before a drink |
| `armorMitigation` | dodge 650, absorb 750, ward 1500 | What armor is worth |
| `armorCurve` | 0.4, 0.62 | How fast a set falls behind |
| `mitigationCap` | 60% (ruled 10-18) | The real armor number on any curve that keeps pace |
| `regen` | 0.3% a second in a fight, 6% out | Downtime, food bought |
| `xpPerKill` | 1.436 a health point, floor 2.534 | Hours a Level, everywhere |
| `xpByLevel` | L^0.4 | Whether XP a kill outruns the pace line at high Level |
| `coinPerKill` | 0.30 a health point | Gold in |
| `soloXp` | 1150 permille (ruled 11-11) | Lone against party |
| `partyXp` | nine cells, 880 to 1700 | The same |
| `levelCurve` | 210, then 16 rises | How long every Level takes. The death cost |
| `deathLoss` | 6% (ruled 11-21) | The cost of a death |

**Arriving with the model (18).** Each names the roadmap step that creates it.

| Knob | Today | Arrives |
|---|---|---|
| `skillPower`, `gearPower`, `basePower` | 0.35, 0.6, 2, typed in place and moved together | R2 |
| `powerFloor` | 17 per-row spell floors | R6 |
| `runeStep` | five typed steps, the last at skill 60 | R6 |
| `gearSlope`, `gearBandStep` | none in the game | R10 |
| `gearExchange` | each unique sized by hand | R11 |
| `paceContract` | 1385 x L^1.274, read only by the judge | R12 |
| `killRateRef` | 15 XP fits and 13 tier rows stand in for it | R12 |
| `hoursPerLevel` | 16 hand brackets | R13 |
| `skillCurve` | 15 x s^2 x 1.04^(s-1). The matrix cannot move it until its heroes' skills come from the curve | V1 |
| `coinLine` | four stacked dials | R9 |
| `healPrice` | five hand prices | R14 |
| `wageShare` | six price lines | R15 |
| `sinkShare` | typed ladders | R16 |
| `saleStep` | seven typed shares | R17 |
| `bandHours` | about 300 typed chances | R18 |

**Not knobs.** `knobs.json` also lists six families of numbers nobody should tune, because each is the output of something missing: the 15 XP fits, the 11 gold fits, the 13 tier rows, nine patches inside the stat formula, the art tier damage scale and the two scaled-hunt shares.

**One note for the matrix lane.** Several audited knobs pick different numbers on the same source line (the four tier knobs, the two armor knobs, the two XP knobs, the two party ground knobs). `knobs.json` marks them with `sharesLineWith`. A patch that moves two of them must apply both picks to the one line, where today's `patchEdits` builds each knob's edit from the untouched line.

---

## 6. The balance validation plan

### 6.1 Fix the calibration first

A before-and-after diff is only worth what the harness is worth. Four faults are open with `lane/d-baseline`. Each one decides which bands a model change may be judged on. Nothing in sections 6.2 or 7 that claims a survival, gold or lone-hero effect ships on a harness number until its fault is closed.

| # | Fault | What it does | The fix | Done when |
|---|---|---|---|---|
| V1 | `tools/balance-sim/skill-lines.mjs` straight-lines skills past the measured career | A Level 400 hero plays with skill 198 where the curve allows about 132, and 438 against 177 at Level 1,000. Those cells take 24% less damage than a real hero (`42`, MEASURED). Every cell from 185 up is too kind | One computed reference hero: the skill the curve's cost allows after the contract's hours. The simulator's skill lines and the to-hit table both read it | Skill at 400 and 1,000 is within 5% of the curve's own answer, and the cells from 185 up are re-played |
| V2 | The grid's four kills 558 an hour at Krell's Deadly at Level 85. The real four kills 1,251 | When the baseline lane replayed the real hunt on the harness (Level 79, the rules of that day) it read 1,183. So the grid's cell is not the cell that was calibrated. Until it is, every pace, drop-hours and gold number for a four on a harder tier may be half what it should be | One cell builder for the grid, the matrix and the solver's ground rates, carrying the tier's pull. The lane has this in progress | The grid's Krell cell reads within 10% of 1,251, the tolerance the standards already set |
| V3 | The solver's `ground-rates.json` and the grid disagree on a lone hero's deaths on Deadly (0 against 104 to 219 in 4 hero-hours) | Two tools, two answers, and the solver's best paths read the kinder one. Under it sits a second fault: a dead harness hero stands up at once and hunts on, so a death count on a failing cell is a retry count | One death rule, the game's: a death ends the hunt. A failing cell reports minutes to the first death. Both files come from the one cell builder | The same cell and seeds give the same deaths in both files |
| V4 | Harness seats take about 1% of the damage. The real healer takes 28% | The harness tank takes 97% of a four's damage against 69% real, and the four takes 28% less in all. Every party survival band, and the supply bill with it, is read on a fight that does not happen | Find which rule the harness seats do not exercise. The candidates are the Healer's 18% peel, shooters that aim at the farthest hero, area spells and the heroes' real bars. That is a HYPOTHESIS list, not a diagnosis | On the Krell cell the tank's share is within 10 points of 69% and the four's damage taken is within 20% of real |

Two more from the baseline's list bear on this plan. The harness four's store bill is about twice real, because its kit rule buys the Level's own rune tier and the real player does not (F5). And no real lone, pair or three hours exist on the current rules, so those seats cannot be calibrated at all until someone plays them. The daily play gate can supply the first cells.

**What can be judged today, honestly.** A four's pace: yes, the harness reads 5% slow on XP and kills. Anything about survival, gold, a lone hero, a pair or a three: report only.

### 6.2 How the matrix proves a change

The matrix lane's `--diff patch.json` plays a patch on a scratch copy of the real engine and the real data, never an approximation, and compares it with the untouched tree on the same seeds. A patch names its `targets`. Anything else it moves is flagged UNINTENDED. Three kinds of proof cover every step of the roadmap.

| Kind | The claim | The proof |
|---|---|---|
| **Identity** | "This refactor changes no number" | The diff is empty: every cell of the subset run is the same before and after, on the same seeds. An empty diff is a hard pass or fail, with no tolerance to argue about |
| **Coefficient** | "This knob moves these bands and nothing else" | The diff's moved bands equal the patch's targets. An UNINTENDED band outside seed noise sends the change back |
| **Derivation** | "This typed number is now derived" | The typed numbers are deleted in the patch, and the band they were holding stays in tolerance on every ground without them |

The representative run for a diff is the matrix lane's subset: Levels 10, 30, 60, 110, 185, 400, 1,000, 2,000 and 5,000, every weapon way, three gear states, lone and four, Normal and the hardest tier, and each gear step by slot class. The full matrix runs nightly. The Levels past 185 are PROJECTED and say so.

### 6.3 Which bands judge each change

Band ids are `50-standards.md` section 2.

| Change | Kind | Judged by | Must not move |
|---|---|---|---|
| The blow reads named constants (R2) | Identity | the empty diff | anything |
| Duplicates to one (R3) | Identity | the empty diff | anything |
| The row stores its blow, art tier scale out (R4) | Identity | the empty diff, plus the combat replay | anything |
| The Tower heat out, the yard fee in (R5) | Coefficient | the Tower's floor cells past 100. The yard's cost in days of gold (G-8) | hunting cells |
| Spell floor as one number, strikes read weapon weakness (R6) | Coefficient | P2 and S1 at Levels 1 to 15, P11 (no wall, Level 10 in 6 hours). The melee ways' pace against the median | Levels past 20 for the floor |
| A tier's dial once (R7) | Coefficient | S3, S4, S6 on harder tiers. Defense XP an hour. P9 | Normal cells |
| The solo cell folded, the hidden cut out (R8) | Identity for the fold. Coefficient for the cut | the empty diff. Then P6 and P7 for a party with a low hero | lone cells |
| One coin line (R9) | Identity in total | G-1, G-4, coin a hero-hour on every ground | XP |
| The gear curve and exchange rates (R10, R11) | Derivation | P2 from Level 110 to 5,000 (pace holds). E1 (a step is +5 to 8%). P3, P4, P5 (LOW, MID and BiS ratios). S5. The armor line's AL3 within 1% | Levels under 88 |
| The kill reward and the tier table (R12) | Derivation | P2 on every ground with no typed fit. P9 and P10 (harder tiers pay more, and only for a kit that holds them). The ladder rule, as a band | deaths, damage taken |
| The Level law (R13) | Derivation | P1 (the ruled days), P11, P12 (a Level a day) | anything in a fight |
| Heal price and size (R14) | Coefficient | G-2 (store bill over coin: Normal under 15%, Dangerous 25 to 40%, Deadly 45 to 65%), G-4, G-5 | pace |
| The wage curve (R15) | Derivation | G-8 (every price in days of the buyer's own gold), G-9 (repeating sinks 35 to 50% of gold in), S10 (the Blessing) | anything in a fight |
| Sinks as band gold (R16) | Derivation | G-10 (1.2 to 1.4 of a band), E3, E4 | pace |
| The sale formula, drops in hours (R17, R18) | Derivation | G-1, D1, D2, E2, E5 | pace |

### 6.4 What only real players can judge

The matrix measures outcomes. It cannot measure whether they are good. These stay with real play, and no simulation result should be offered as an answer to them.

- **Whether it is fun.** `46-from-scratch.md` played the first hour and was bored from minute 20 to minute 55 on numbers the bands would pass.
- **Whether a roll feels right.** A wide swing, a spell that never misses, a heal that is always the same number.
- **Whether an upgrade is felt.** The band says +5 to 8%. Only a player can say they noticed.
- **Whether Deadly feels like a struggle.** Your 11-19 direction, which you said was a direction and not a test.
- **What players really buy and wear.** The harness kit buys the best rune of its Level. The real player did not, and 0.9% of dropped gear was ever worn.
- **Who really hunts together.** Every real pair was two melee heroes. The harness seats a tank and a Mage.
- **Prices between players.** The market is a floor and a ceiling to every tool here, never a price.
- **Where people quit.** Both players who never got a second hero left at Levels 7 to 9.

---

## 7. The migration roadmap

Ordered. Each step improves the system without breaking what works, and each is proven before the next one leans on it. "0.2.144" means the step fits the beta release because it changes no number, or builds a ruling you already made. Server changes in any step are staged, not applied, and the client half follows the apply (CLAUDE.md section 3.3, lane C).

**Track V: make the instrument true. All tools, all 0.2.144, all before any number moves.**

| Step | What | Layer | Replaces | Guard that proves it | Risk | Depends on | Release | Tyler first |
|---|---|---|---|---|---|---|---|---|
| V1 | The simulator's heroes get skills from the curve | tools | the straight line (`P-X43`), and the reference hero's line past 1,000 (`P-X42`) | the grid's `--selftest` with a plant: skill at Level 400 over the curve's answer goes red | low. Cells from 185 up read harder afterwards, which is the truth | none | 0.2.144 | no |
| V2 | One cell builder, calibrated on kills an hour | tools | two builders that disagree | the calibration table: Krell's Deadly four within 10% of 1,251 | low | none | 0.2.144 | no |
| V3 | One death rule in the harness | tools | the instant retry, and two files with two answers | the same cell and seeds give the same deaths in the grid and in the ground rates | medium. Every death band re-reads | V2 | 0.2.144 | no |
| V4 | Harness seats take damage like real ones | tools, and the engine if the cause is there | a fight where the tank takes 97% | the calibration table: tank share within 10 points of 69% | medium. The cause is not known yet | V2 | 0.2.144 | no |
| V5 | The diff is the gate, and the registers are guarded | tools, tests | review by eye | `architecture-register.mjs --check` and `--selftest` in CI. A new class 4 row, or a class 3 row with no recommendation, fails | low | the matrix lane's `--diff` | 0.2.144 | no |

**Track R: the model.**

| Step | What | Layer | Replaces | Guard that proves it | Risk | Depends on | Release | Tyler first |
|---|---|---|---|---|---|---|---|---|
| R1 | Delete rules that are written and do nothing | code clean-up | the unread relic multiplier, the boss-of-the-day bonus with no caller, the unused 1.68 ceiling, the charm ladder with no caller, two stale comments (`E-X26`, `E-X27`, `E-X28`, `X-STALE-HP-NOTE`, part of `X-DORMANT-FACTORS`) | empty diff. `dead-exports` | low | none | 0.2.144 | no |
| R2 | The blow reads its named constants | formula | `X-POWER-LITERALS`. Gives `skillPower`, `gearPower`, `basePower` | empty diff. One test that the wiki's terms are the engine's, with a mutant | low | none | 0.2.144 | no |
| R3 | Each duplicate becomes one | formula | the spell roll twin, the bleed's copy of the rune ladder, the mark as a status row, the row door for elements and phases, one word for two "steady" rules, two fields for armor and guard, one death function in whole numbers in both runtimes, the browser's death percent and drop odds read from the server (`X-ROLL-TWINS`, `X-TIER-LADDER-TWINS`, `X-MARK-TWO-WAYS`, `X-ROW-DOOR-BYPASS`, `X-STEADY-TWO-MEANINGS`, `X-DEFB-TWO-JOBS`, `P-X19`, `P-X21`, `E-X38`) | empty diff. The curves' parity test at 20 Levels | low to medium. Many small edits. Batch them by file | R2 | 0.2.144 | no |
| R4 | A monster row stores its blow | formula, data | the art tier damage scale and its twin (`X-ART-TIER-SCALE`). Hand rows are converted digit for digit | empty diff. The combat replay | medium. It touches every monster row once. It is an engine change, so it rides the one combat batch | R2 | 0.2.144 | no |
| R5 | Build two rulings already made | coefficient | the Tower heat (dropped 11-20), the yard fee (100 a skill level, ruled 24-8) | the Tower's floor cells. The fee's SQL self-check | low | none | 0.2.144 | no. Already ruled |
| R6 | Spell amounts: one power floor, strikes read weapon weakness, the rune step as a base and a step | formula, coefficient | 17 per-row floors (`X-SPELL-FLOOR`), `X-SPELLS-SKIP-WEAKNESS`, the typed ladder | coefficient diff on Levels 1 to 15, and on the melee ways | medium. The first hours are where players quit | R2, V1 | 0.2.144 for the floor. Later for weakness | **yes** (8.2 calls 6 and 7) |
| R7 | A tier's dial applied once, and one source for hero health | formula | `X-TIER-TRIPLE`, `X-REFHP-OFF-BY-ONE` | coefficient diff on harder tiers. Defense XP an hour | medium. Harder tiers get a little easier on armor and Defense trains slower there. The dial may need one step up to hold S3 and S4 | V3, V4 | 0.2.144 | no. A correctness fix |
| R8 | One XP chain | formula | the solo constant folded into the table (`P-X07`), the hidden Level cut (`P-X06`), the Tower's own table (`P-X09`) | empty diff for the fold. Coefficient diff for the cut | low for the fold. Medium for the cut: a low hero behind a high party earns freely again | none | 0.2.144 for the fold and the cut. Later for the Tower's table | **yes** for the Tower's table. The cut is ruled |
| R9 | One coin line | coefficient | four stacked coin dials and three sale-price patches (`E-X02`, `E-X03`, `E-X05`, `E-X19`) | identity in total: coin a hero-hour the same on every ground | low | none | later | **yes** (call 4) |
| R10 | The gear curve in `src/data` | formula | the staged line in a tools folder, the hand tier tables as samples (`X-LINE-IN-TOOLS`, `P-X31`, `P-X34`) | derivation diff: pace holds from 110 to 5,000. The reference hero reads it | medium. The first formula that reaches every item | V1 | later | **yes** (calls 1, 19) |
| R11 | Uniques spend a budget at exchange rates | coefficient | hand-sized uniques (`X-ARMOR-LINE-FIT`), a closed-form gear guard (`X-POWER-TOOLS`) | AL3 within the measure's own 1%, where a red means re-derive one rate | low | R10 | later | no, once R10 is approved |
| R12 | The kill reward follows the pace line, and one tier table | formula | 15 XP fits, the floor fit, 13 tier rows, the scaled-hunt shares, three party-fit patches, the gentle cap (`E-X01`, `E-X04`, `X-TIER-PER-GROUND`, `E-X11`, `X-PARTY-FIT-PATCHES`, `X-GENTLE-CAP`, `X-GENTLE-HP`) | derivation diff: P2 on every ground with no typed fit | high. The largest single change. It moves XP on every ground at once. It needs V2 to V4 closed | V1 to V5, R7 | later | **yes** (calls 2, 5) |
| R13 | The Level curve derived from hours and the contract | curve | 16 hand brackets (`P-X01` to `P-X03`) | P1 exact at every ruled point. P11, P12 | medium. No live hero's Level may move before the wipe, so it lands at the wipe | R12 | later | **yes** (call 13) |
| R14 | Heal price and heal size on one line | coefficient | five hand prices (`S-X02`) | G-2, G-4, G-5 | medium. It sets every harder tier's net gold | the store-bill fault F5 | later | **yes**. A new price rule |
| R15 | The wage curve, and repeating prices in hours | formula, server | six price lines | G-8, G-9, S10. SQL self-checks. Security review | medium. Money surface | R9, R12 | later | **yes** (calls 14, 15, 17) |
| R16 | Standing sinks as a share of band gold | coefficient, server | typed ladders that end (`E-X25`) | G-10, E3, E4 | medium. Money surface | R10, R15 | later | **yes** (call 18) |
| R17 | One sale formula | formula | seven typed shares and a tier-2 patch (`E-X17`, `E-X18`, `E-X20`) | G-1. The market floor and bench tax unchanged at tiers 1 to 7 | low | R9 | later | no |
| R18 | Drops authored in hours | data | about 300 typed chances, the old 1.15 bonus rows (`E-X33`, `E-X14`, `E-X16`, `E-X39`) | D1, D2, E2. The Luck bar lands on this | medium. Many rows, done in batches of 20 | R12 | later | no |
| R19 | One amount pipeline, rounded once, with a trace | formula | nine floors in a row, three roll shapes, no way to explain a blow (`X-FLOOR-CHAIN`, `X-SHEET-ORDER`, `X-THREE-ROLLS`, `X-TEMPER-ROUNDING`) | coefficient diff, largest in the first 15 Levels. The combat replay | high. It is the engine's inner loop | R3, R4 | later | **yes** (call 8) |
| R20 | One modifier table | formula | five stacking rules, the set bonus, the unread resistance column (`X-STACKING-RULES`, `X-SET-CRIT`, `S-X01`) | empty diff | low | R3 | later | no |
| R21 | Every monster reads the formula | data | 118 hand rows, two named rows (`X-HAND-ROWS`, `X-NAMED-HASK-LOOKOUT`, `X-NAMED-RAT-KING`) | coefficient diff a ground. Batches of 20 rows | medium | R4 | later | no |
| R22 | Endless modes read any Level | formula | the Tower's last row at floor 300, rune tiers that end at skill 60 (`X-TOWER-TOP`, `X-VERSION-LADDER`) | the Tower's cells at floors 300, 500 and 1,000 | low | R5, R10 | later | **yes** (calls 9, 12) |
| R23 | The simulator stops editing shared data | tools, architecture | unfrozen rows (`X-MUTABLE-ROWS`), a gold model that approximates (`E-X37`) | the matrix's scratch copy is the only what-if door. Data rows are frozen | low | V5 | later | no |

**By release.** 0.2.144: V1 to V5, R1 to R5, R7, the floor half of R6 and the fold and the cut of R8. That is 11 steps and two half steps, and every one either moves no number, fixes a bug, or builds a ruling. Later: the rest of R6 and R8, and R9 to R23. Eleven steps need your yes before they start: R6, the Tower half of R8, R9, R10, R12, R13, R14, R15, R16, R19 and R22.

**Why this order.** The instrument first, because a wrong ruler makes every later number wrong. Then the changes that move nothing, because they turn typed numbers into knobs and cost no balance risk. Then the two ruled items. Then the gear curve before the kill reward, because the reward's reference line has to be measured on heroes whose power keeps pace. Then the Level law, which reads the reward. Prices last, because the wage reads the coin line and the kill rate.

---

## 8. Tyler approves

### 8.1 Every intentional special rule, with one recommendation each

35 rows after the merge. "Approved" is the date of your ruling on record. Nine have none.

<!-- GENERATED:CLASS3 (tools/balance-program/formulas/architecture-register.mjs --write) -->
| id | what it is | approved | recommendation | why |
|---|---|---|---|---|
| X-NAMED-RAT-KING | His attack is held at 6 where the formula says 8, so his Tail Lash stays under 35% of the floor hero's HP | 2026-11-18 ("open at 5") | **Fold into a shared mechanic** | The boss cap should bound his spell, not his attack. Then his row is the formula's and the named exception goes |
| X-DANGER-RAMP | A ground whose floor is 8 or under is gentle: monsters land 40% and hit 13.2% of a hero's HP. From floor 16 they land 70% and hit 22%. A straight line between | **none on record** | **Keep and document** | One early-game curve for every ground under Level 16. Gentle first grounds are right. Document it as the only Level threshold in monster stats |
| X-PARTY-FIT (E-X06) | A party ground's monsters are a different formula: HP x2.5, blow x0.75, XP x0.8 | **none on record** | **Keep and document** | Keep "built for a party" as one encounter type with three numbers (HP, blow, XP). Remove its three inner patches. 53-review-world asks to remove the whole type: the matrix decides between them |
| X-TIER-PULL-FLOOR (P-X13, E-X07) | Under ground floor 16 a harder tier brings no more monsters | **none on record** | **Remove** | It contradicts the 2026-11-07 ruling that harder tiers keep the bigger pulls. Its cause is kill reward with no kill-rate term, which the kill reward formula fixes |
| X-CELLAR-NORMAL-ONLY (P-X12, E-X09) | The Mill Cellar offers only Normal | 2026-11-05 | **Keep and document** | A content flag on the tutorial ground. It changes no formula |
| X-SPELL-FLOOR (P-X40) | The beginner's floor: every cast lands max(its share of the blow, its old version-I number). Past about Level 15 the share is always larger. At Level 1 a Greater Mend la… | 2026-11-21 (32-8, the effect) | **Fold into a shared mechanic** | Keep the effect you ruled. Replace 17 per-row floors with one number: a cast never reads a hit under N |
| X-MEND-MAXHP (P-X39) | Mend heals a share of max HP, not of the blow | 2026-11-21 (32-4) | **Keep and document** | The second of two heal kinds, a share of max HP. It is the one heal that never falls behind at high Level |
| X-THREE-ROLLS | Three shapes for "an amount": a swing rolls 1..max (mean 50%), a spell hit rolls 50%..100% (mean 75%), a heal or shell does not roll | **none on record** | **Fold into a shared mechanic** | One roll rule with the spread as one number a kind of amount: swings, spell hits, heals. Three rows of one rule |
| X-PARTY-ONLY-ROWS | A row may fire only alone, only in a party, or party-only for a tank | 2026-11-09 and 2026-11-19 | **Keep and document** | One shared gate read from data. Tank spells are party only by your ruling |
| X-BRACE | A worn shield takes 30% off a marked monster spell, by item type | 2026-11-08 (direction) | **Fold into a shared mechanic** | Make it a stat on the shield row, so a future shield can carry more or less of it. No rule keyed on a slot |
| X-ELEMENT-RULES | Storm burns mana for half the HP taken. Necrotic lands Withered | 2026-11-18 (the two elements) | **Keep and document** | Storm burning mana and Necrotic cutting heals are what make the two elements different. The numbers need your yes before the switch goes on |
| X-TEMPER-ROUNDING | Tempering rounds by chance (the part of a point is a draw). Every other step floors | **none on record** | **Fold into a shared mechanic** | Rounding by chance is the right idea. Use it once, at the end of the one amount pipeline, for every blow. Then small bonuses pay at low Level everywhere |
| X-BOSS-FLOOR-CAP | A boss's blow is held to a third of the FLOOR hero's HP, however deep he lives | **none on record** | **Keep and document** | A boss must not one-shot the hero his ground is written for. Keep it as a bound in the monster formula and it needs your yes |
| X-CALLED-ROOM (E-X31) | A called boss room pays nothing. A keyed hall pays | 2026-11-04 and 2026-11-05 | **Keep and document** | A called fight is practice and a keyed hall is the reward. Two rows of one room mechanic |
| X-DUMMY (P-X29) | A dummy's blow cannot kill and it cannot die | 2026-11-08 | **Keep and document** | The training yard needs a target that cannot kill or die |
| X-CASTER-BASIC | A basic attack costs by weapon: a wand or staff 1 mana, a bow one arrow, a melee weapon nothing | 2026-10-15 and 2026-10-23 | **Keep and document** | A basic attack costs by weapon. It is the supply identity of each way of fighting |
| P-X07 | A hero alone earns +15% Level XP | 2026-11-11 | **Fold into a shared mechanic** | Fold the +15% into the base of the one party table as its first cell. The number stays. One constant less |
| P-X09 (E-X13) | The Tower and the Catacombs use a second party table by size only, with no class mix and no solo boost. Its pair and three rows are ASSUMED | **none on record** | **Fold into a shared mechanic** | The Tower takes the one party table. Your 2026-11-16 words were one table and not a unique formula everywhere |
| P-X14 | The Tower pays 37.5% of a kill's Level XP and a death there costs nothing | 2026-11-14 | **Keep and document** | The Tower trades XP for a free death. It is one row of the mode table |
| P-X15 | The Catacombs' mode row is a copy of the Tower's, marked ASSUMED, and so is its door Level | 2026-11-16 (the mode, not the numbers) | **Keep and document** | Keep the Catacombs on the mode table. Its copied numbers stay marked ASSUMED until the matrix plays them |
| P-X18 | A death takes 6% of the TOTAL Level XP but 6% of each skill's progress INTO its level, and Inner Flame is one of those skills | 2026-11-09 and 2026-11-21 | **Keep and document** | Level XP loses a share of the total and a skill a share of its progress. Take Inner Flame off the list: it is trained at the Hearth, not in a fight |
| P-X20 (E-X23) | Blessings are free under Level 30 | 2026-10-18 | **Fold into a shared mechanic** | Free under Level 30 falls out of a price that follows the hours a Blessing saves. Early deaths cost minutes, so the price is near zero with no threshold |
| P-X28 | Training pays one fixed rate for every skill and level | 2026-11-14 | **Remove** | One fixed rate makes the yard worthless near skill 100. Pay a share of the skill level's cost. This changes a ruling, so it is your call |
| P-X33 (E-X24) | Dawnsteel's Tempering rung is 0.4% and a unique band's 0.5%, where every other tier's is 1% | 2026-11-15 and 2026-11-16 | **Fold into a shared mechanic** | A rung is worth less on stronger gear. Make the rung size one line by gear Level, so the next band needs no new hand number |
| P-X35 | Tier 1 gear has no Tempering ladder | 2026-11-04 | **Keep and document** | Starter gear has no Tempering. A content flag |
| P-X37 | Boss gems fix one thing about a jewelry roll (the Rat King's Crown Shard and Crown) | 2026-11-14 | **Keep and document** | Boss gems fix one thing about a jewelry roll. A content rule on the craft, not a combat formula |
| P-X38 | +skill on gear is a flat number of skill levels. One level is 0.35 of a point of largest blow at every Level, so its worth falls as the blow grows | 2026-11-14 against 2026-11-18 | **Remove** | A flat +4 skill is about 1.4 damage at any Level, and you asked for major upgrades. Make it a percent of the blow |
| P-X41 | The three weapon skills advance on three different bases: Melee and Ranged on damage dealt, Magic on mana spent, Defense on the attacker's Level per blow aimed | **none on record** | **Keep and document** | Melee trains on damage dealt, Magic on mana spent, Defense on blows taken. Three bases for three different jobs. It needs your yes on record |
| P-X44 | The XP weekend: +25%, added, never past +50% | 2026-11-20 (27-5) | **Keep and document** | Events add and never pass +50%. One line of the XP chain |
| E-X03 | The coin line climbs x0.5 to x1.4 with the ground's floor between 1 and 16, then is flat forever | 2026-11-03 ("harder pays more on one line") | **Fold into a shared mechanic** | The coin line that climbs from x0.5 to x1.4 over the first grounds is one of four stacked coin dials. Fold all four into one coin line by monster Level |
| E-X29 | A hero's first roll on a hall boss always lands a piece | 2026-11-14 | **Keep and document** | A hero's first hall roll always lands. A good first-time moment |
| E-X30 | Chest luck: warmth after dry keys and paid stokes | 2026-11-14 to 2026-11-16 | **Keep and document** | Chest warmth and stokes are the pity rule. Bounded by construction |
| E-X32 | 29 imbuement parts drop with nothing to feed: they only sell, and their tier steps at monster Levels 30 and 80 | 2026-11-18 (linings, BUILD LATER) | **Keep and document** | The parts wait for linings. Nothing planned is cut. When linings land, part value becomes one line by monster Level with no steps |
<!-- END GENERATED:CLASS3 -->

### 8.2 Where a clean formula and an approved ruling conflict

The three lanes raised 27 calls. Merged, they are 19. Each has both sides and one recommendation.

| # | The ruling or the built rule | The clean formula | My recommendation |
|---|---|---|---|
| 1 | 11-14 and 11-16: past tier 7 every piece is a named unique with its own stat mix, and a line is a budget | A gear curve in the game that every piece is priced against | **Approve the gear curve as a game formula, linear in Level, with bands by percent.** Uniques stay exactly as you ruled, as spends of the curve at published rates. Nothing past Level 300 holds without it |
| 2 | 11-07: one tier table, and "Dangerous and Deadly keep the bigger pulls". Built: four grounds with their own dials, and no bigger pulls under ground Level 16 | One table, and the XP problem fixed where XP is priced | **Remove the per-ground dials and the floor-16 rule in the same step as the kill reward (R12).** Not before, or the first grounds pay too much again |
| 3 | 11-08: "XP share rule applies regardless", recorded as cut. The Level-keyed cut is live | The same, one chain with no Level or floor key | **Remove it now, as you ruled.** The other side is real: without it a Level 1 hero behind three Level 37s earned 190,000 XP an hour. Today that is a player's own alt on their own account. `57-review-social` asks for a visible Level range in its place once heroes can be lent across accounts. That rule should ship with lending, not before |
| 4 | 11-16: "cut income instead". Built as x0.7 typed on 11 grounds plus three shop patches | One coin line | **Fold it into the one coin line.** Same gold, one number |
| 5 | Not ruled: party grounds are a second set of monster coefficients (health x2.5, blow x0.75, XP x0.8) | One monster formula | **Keep "built for a party" as one encounter type with those three numbers, and delete its three inner patches.** `53-review-world` wants the whole type removed because the three party grounds are also the best lone grounds. That is a kill reward problem (call 2) and should be judged again after R12 |
| 6 | 11-21 (32-8): heals and first strikes are not cut in half in the first hours. Built as a floor on each of 17 spell rows | No per-row floor | **One floor on Power: a cast never reads a hit under one stated number.** Same effect, one number, and `52-review-combat` asks for the same |
| 7 | Built, never decided: spells cannot miss, cannot crit, and skip weapon weakness | A spell is a blow and reads all three | **A physical strike reads weapon weakness. Spells never miss and never crit.** Section 5.1 has the reasons |
| 8 | Built: swings roll 1 to max, spell hits roll half to full, heals do not roll | One roll rule | **One rule with the spread as a number a kind.** Heals keep a spread of zero, so a heal is always the same number, which a player can plan around. Swings keep their wide roll |
| 9 | 10-23: five rune tiers at skill 1, 15, 30, 45, 60. Built at +10% a tier where the plan said +15% | A ladder that does not end on an endless game | **Keep +10%, which is built and measured. Continue the tiers past 60, one every 15 skill levels, when the gear curve lands.** This is also the cheapest answer to call 10 |
| 10 | Not ruled: on any gear curve that keeps pace, skill falls to 14% of a hit by Level 1,000. Your 11-05 words say trained skills are the point of a classless game | Skill and gear terms that grow together | **Keep the hit as skill plus gear. Do not make it skill times gear.** Give skill its high-Level worth through things it unlocks: rune tiers past 60 (call 9) and hit chance, where 261 extra skill levels were MEASURED at 56% less damage taken. A new multiplying formula is exactly what the brief says not to add, and nobody reaches Level 400 for a year |
| 11 | 11-14: Tower weapons give +1 to +4 skill. 11-18: they should be major upgrades | A bonus that scales | **Make it a percent of the blow.** +4 skill is about 1.4 damage at any Level. Both rulings cannot hold, and the later one is the one you care about |
| 12 | Built: the Tower replays floor 300 above floor 300. A scaled hunt offers no Deadly | Endless modes that read any Level | **The Tower reads any floor from one Levels-a-floor row, the same row your 11-20 ruling put in place of the heat.** Scaled hunts without Deadly is a content flag and is in 8.1 |
| 13 | 11-21: Level 400 at 4,580 hunted hours. One power law fits the ruled points within 8% and lands 400 near 5,090 | The Level curve as one law | **Keep 4,580. Make your table of hours the law.** The curve is derived from it and the contract (section 5.2). No ruled number moves |
| 14 | 11-21 (50-4): a death costs 6% flat with no cap. Blessings that remove 75% of it cost minutes of gold at every Level | A price that follows value | **Keep 6% flat. Price the Blessing set at a share of the hours it saves, in the buyer's own gold.** At Level 1,000 a set costs 44,100 gold and saves 569 hours. `46-from-scratch` disagrees with the 6% itself. That is a design call and it can wait a year |
| 15 | 11-14: the yard pays one rate at every skill level | A rate that scales | **Let the rate follow a share of the skill level's cost.** At one flat rate the yard is worth a twentieth of a hunted hour by Level 1,000. This changes a ruling, so it is yours |
| 16 | Not ruled: the Tower's party table has no class mix and no solo boost. The Catacombs' numbers are copies marked ASSUMED | One party table | **The Tower and the Catacombs take the one table.** The Catacombs' share and door Level stay ASSUMED until the matrix plays them |
| 17 | "Every player hunts 12 hours a day". The first refill costs a party hero more than the four hours earn from Level 40 | Prices in hours of the buyer's own wage | **Hold this one.** The harness reads a party's store bill at twice the real one, so the finding may be half its size. Decide after the calibration faults close |
| 18 | 11-18: sinks sit above a band's gold on purpose. Every standing sink is a list that ends at tier 7 | Sinks as a share of band gold | **Price Tempering, Hallmarks and linings as a share of the band's gold, at your ruled 1.2 to 1.4.** Then every band has its sinks by construction |
| 19 | 10-25: a major upgrade every 15 to 25 Levels, worth +5 to 8% | A gear curve that is linear in Level | **Rule the upgrade by its size, not by a count of Levels.** On a straight line +6.5% is 7 Levels at 110, 20 at 300 and 65 at 1,000. "Every 15 to 25 Levels" is true only around Level 300. The other choice, a fixed Level gap with a fixed percent, compounds and outruns everything past Level 400 |

**Owned by the design reviews, not decided here.** Whether party XP pays for a mix of classes or for size alone (`57`, against your 10-31 ruling). Whether Turning Cut unlocks at Level 1 for axes and hammers (`52`). A per-weapon unlock is a data field either way. Whether grounds deepen past their band for free (`46` change 4, `53`). That one is formula-friendly: it is the scaled-hunt mechanic the game already has, and it would use the same monster formula with no new math.

**Already ruled, not built, no call needed.** Drop the Tower heat (11-20). The yard fee of 100 gold a skill level (24-8). Jewelry tiers 4 to 7. The Luck bar (11-20). Linings (11-18).

---

## 9. What was and was not verified

**Run on this branch.** `architecture-register.mjs` (counts, `--check`, `--selftest`), `combat-register.mjs --check` and `--selftest`, the read that fills `knobs.json` (all 33 knobs located on the tree, each at exactly the lines it names), `tests/ci-shape.mjs` and `tests/guard-hygiene.mjs`.

**Read, not re-measured.** Every number about the game on this page is one of the three lanes' or the baseline lane's, with their label. I played no hunt. I re-read source only where I added a row or a knob: the stat formula's coefficient block, the store's supply rows, the knob lines, and the searches behind `S-X01`, `S-X02` and the `SUPPLY_SHOP_OFFERS` correction.

**Judgments, not findings.** Everything marked JUDGED in section 5, every recommendation in section 8, the six class decisions in section 2, and the release column of section 7. They are reasoned from the lanes' evidence. None has been through the matrix, because the matrix's `--diff` is not on the set yet.

**Not done.** No patch was played. The knob file was located on the tree two ways: by the register tool, and by the matrix lane's own `locateKnob` imported from its worktree (33 knobs, 0 bad). The matrix's `--diff` itself was not run, because `lane/c-balance-matrix` is not merged. The cross-category edge list was written by hand from the three lanes' own "edges that leave" tables. The hub ranking is computed from it. A missing edge would lower a rank, not invent one. The four calibration faults are described from the baseline lane's draft page and the brief. I confirmed none of them by running the harness.

**Housekeeping done here.** The three registers are `formulas-combat.json`, `formulas-progression.json` and `formulas-economy.json`, so `tools/lib/guard-deps.mjs` no longer maps them to the guards named after `src/core/combat.js` and `progression`. `combat-register.mjs --check` now compares as text, so a checkout with CRLF line endings reads the same as one with LF, and its new `--selftest` plants CRLF. The same is true of `architecture-register.mjs`. Both selftests are registered in `smoke.yml` from their headers (`tests/ci-shape.mjs --write`), because `tests/guard-hygiene.mjs` refuses a proof that no workflow runs.

Reproduce: `node tools/balance-program/formulas/architecture-register.mjs --check` and `--selftest`.
