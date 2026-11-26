# Balance program 41: the combat formulas, audited

Lane `lane/d-formulas-combat`, read at `set/v0.2.144` e6ea19170 (2026-11-21). The brief is Tyler's, `40-formula-brief.md`. This is the combat third of its section 8, items 1 to 5 and 7. Nothing in the game was changed. The registers are also machine-readable in `tools/balance-program/formulas/formulas-combat.json`, written from one source (`tools/balance-program/formulas/combat-register.mjs`), so a later guard can refuse a new class 4 row.

## 0. One screen for Tyler

**What I found.** Combat runs on 42 formulas. Around them sit 67 exceptions. 8 are sound foundations. 10 are content numbers that belong in data. 17 are deliberate special rules that need your yes. 32 are accidental and should go. 58 of the 67 are confirmed by reading the code path. 9 are hypotheses and each says what would confirm it.

**The good news.** The core is closer to your brief than you fear. There is one combat engine and the server runs the same files the browser does, so there is no second copy of the fight. Every blow in the game goes through one function. To-hit is one ratio. Every spell is now a share of the caster's own hit. 70 of the 72 newer monsters are written by one formula from a Level and a role. No hunting ground has its own combat code.

**The bad news.** The exceptions live in the numbers around that core, not in the code. Hunting grounds do not have custom algorithms, but four of them have custom difficulty dials, party grounds use a different monster formula with three patches inside it, and 118 of 190 monsters are still typed by hand.

**The five worst.**

1. **The game has no formula for gear past Level 90.** Monster HP, monster damage and hero HP all grow with Level forever. Weapons and armor stop at tier 7. Read on the real functions, a hero who keeps tier 7 needs 6.5 swings to kill a same-Level monster at Level 110, 19 at Level 400 and 137 at Level 5,000. Plate falls from the 60% cap to 40% at Level 400. The only formula that fixes it sits in a simulator folder, outside the game.
2. **Four grounds carry their own tier dials** (the Glade, the Warrens, the Thicket, the Sewer), and bigger pulls are switched off under ground Level 16. Each was added because a party killed too fast for the XP on that ground. This is the exact pattern your brief names.
3. **A tier's difficulty dial is applied three times.** It raises the blow, the hit chance, and the monster's Level as armor reads it. On Wickstead's Deadly a Level 8 monster counts as Level 21 against armor, and every blow there pays 2.7 times the Defense XP.
4. **A monster's damage depends on its art tier.** Its attack is multiplied by 5.4, 4.0, 3.0 or 2.2 depending on which art set it belongs to. This was a patch from October. For formula monsters it now does nothing but rounding. For the 118 hand-typed ones it still decides their damage.
5. **Spells ignore half the combat stats.** A basic hit can miss, can crit and gets +20% against a monster weak to the weapon. A spell cannot miss, cannot crit and gets no weapon bonus. Since every spell became a share of the hit, accuracy and crit gear are worth less the more a hero casts. Nobody decided that.

**Where it breaks at high Level.**

| What | Starts to misbehave | How |
|---|---|---|
| Kill speed on today's gear | Level 111 | monster HP keeps growing, the weapon does not |
| Armor on today's gear | about Level 120 | plate leaves its 60% cap and fades toward nothing |
| Heal spells on today's gear | about Level 185 | a heal is a share of the hit, and HP outgrows the hit |
| The Tower | floor 100 | blows compound 1.2% a floor, 10.9 times by floor 300 (you already ruled this out) |
| Skill levels, if gear grows with Level | about Level 1,000 | the skill is 40% of a hit at Level 110, 14% at 1,000, 7% at 5,000 |
| Hit chance, if gear grows with Level | about Level 2,000 | accuracy on gear climbs, the monsters' evasion does not follow, 85% drifts to 95% |
| Crit and leech | never | crit is capped at +30% damage, leech is one spell at 30% |

**What I need from you.** Eleven calls, in section 8. The three that unblock the most work: how gear grows past Level 90 (call 3), whether the first-hours floor on spells stays (call 1), and whether spells should read weapon weakness, accuracy and crit (call 2).

## 1. Formula inventory

42 formulas. "Reads" and "read by" name other rows here. A name starting P- or E- belongs to the progression or the economy lane.

<!-- GENERATED:FORMULAS (tools/balance-program/formulas/combat-register.mjs --write) -->
| id | what it computes | where | parameters | reads | read by | dice |
|---|---|---|---|---|---|---|
| C-HERO-POWER | A hero's largest blow (maxHit): floor(0.35 x (weapon skill + worn +skill) + 0.6 x summed damage bonus + 2), then x the weakness factor, then x (1 + damage buff). Never under 1 | src/core/combat.js:358-426 playerCombatRolls<br>src/core/member.js:136 heroSnapshot (the unit's maxHit) | literals 0.35 / 0.6 / 2 at combat.js:391. COMBAT_BALANCE.strengthLevelScale / strengthBonusScale / playerBaseMaxHit (combat.js:38-40) hold the same numbers but the engine never reads them | P-SKILL-LEVEL (progression), C-GEAR-WEAPON, C-WEAKNESS, C-BUFF-BONUS | C-BASIC-BLOW, C-SPELL-HIT, C-SPELL-HEAL, C-SPELL-SHELL, C-STATUS-TICK, character sheet (hr-accrue/character-sheet.js:114), wiki (src/shell/wiki-model.js:117-126), upgrade plan (src/shell/upgrade-plan.js:161) | deterministic |
| C-HERO-TOHIT | A hero's chance to land a basic blow: ratio(20 + skill + worn accuracy, the monster's evasion) x 1.15 on a weak-weapon match, held to 5%..97%. Steady then turns a share of the misses into hits | src/core/combat.js:384-389<br>src/data/to-hit.js:134-140 toHitRatio, heldToHit | TO_HIT { base 20, min 0.05, max 0.97 } (to-hit.js:117). WEAKNESS_BONUS.accuracy 1.15 (combat.js:31) | P-SKILL-LEVEL (progression), C-GEAR-WEAPON, C-MON-STATS, C-WEAKNESS, C-JEWEL-PERKS | C-BASIC-BLOW, character sheet, wiki | one chance draw a swing (rollAttack) |
| C-BASIC-BLOW | One basic blow: miss is 0, a hit is a whole number 1..maxHit with equal odds (mean (maxHit + 1) / 2) | src/core/combat.js:482-485 rollAttack<br>src/core/hunt/damage.js:215-223 roll<br>src/core/hunt/damage.js:305-316 blow | none of its own | C-HERO-POWER, C-HERO-TOHIT, C-CRIT, C-HURT | C-HURT, E-KILL-RATE (economy), P-WEAPON-XP (progression) | the hunt seed stream: chance, then int |
| C-CRIT | Critical basic blows: chance = clamp(gear critB + crit buff + set bonus + Keen, 0, 0.60). A crit is max(damage + 1, floor(damage x 1.5)). The set bonus is 1% a tier for 5+ armor pieces of one tier and line | src/core/combat.js:428-432<br>src/core/combat.js:488-494 rollCrit, applyCrit<br>src/core/combat.js:252-270 armorSetBonus | COMBAT_BALANCE.critMult 1.5, critCap 0.60 (combat.js:64-65). Leather critB the same on every piece, the leather profile even critB over the defense budget (gear-profiles.js; 0.028 at Dawnsteel) | C-GEAR-ARMOR, C-JEWEL-PERKS, C-BUFF-BONUS | C-BASIC-BLOW | one chance draw on a landed hero blow with a chance above 0 |
| C-WEAKNESS | The damage factor against one monster: weapon weakness 1.20 x bane (at most 1.40) x weapon element (at most 1.15), the product held to 1.90. A weapon match also gives x1.15 accuracy | src/core/combat.js:301-345 weaknessInfo<br>src/core/bane.js:155 baneMultFor<br>src/core/elements.js:120-123 elementMultFor | WEAKNESS_BONUS (combat.js:31), MAX_BANE_MULT 1.40 (core-model.js:256), MAX_ELEMENT_MULT 1.15 and MAX_TOTAL_DAMAGE_MULT 1.90 (elements.js:56-60), MAX_COMBINED_DAMAGE_MULT 1.68 (bane.js:62, unused) | C-MON-STATS (the row's weaponWeak, class, elements) | C-HERO-POWER, C-HERO-TOHIT, C-BASIC-BLOW | deterministic |
| C-HURT | Every amount that lands on a unit, in this order. On a monster: x element (a weakness at the tag's weakPm share) then minus the defence cut, x the cast's power (version, store, surge, mark), x the boss guard, x the dealer's stance, x the target's stance, at least 1, x Tempering. On a hero: x power, x stances, then the armor chain. Then the spell shell, then HP | src/core/hunt/damage.js:117-145 hurt<br>src/core/hunt/damage.js:153-192 landHit | no numbers of its own. Nine floors in a row | C-ELEMENT-MON, C-MON-DEF, C-CAST-POWER, C-VULN, C-BOSS-PHASE, C-STANCE, C-ARMOR-CHAIN, C-TEMPER, C-SPELL-SHELL | every kill and every death, E-SUPPLY-USE (economy), P-DEFENSE-XP, P-WEAPON-XP (progression), the analyzer tally | none itself (Tempering's part of a point: one draw) |
| C-MON-DEF | A monster's defence: floor(def x 0.03) whole points off every blow and every tick it takes | src/core/combat.js:462-464 defenceReduction | COMBAT_BALANCE.monsterDefenseDamageReduction 0.03. def = 0.08 x Level x role (balance-sheet.js STAT_FORMULA.def, MONSTER_ROLES) | C-MON-STATS | C-HURT, C-HERO-POWER (the sheet's copy) | deterministic |
| C-ELEMENT-MON | What an element is worth on a monster: 1000 - 10 x its profile's percent, the percent held to ELEMENT_PCT. A row with weakPm lands only that share of a weakness | src/core/elements.js:71-76 elementPermille<br>src/core/hunt/damage.js:111 weakShare<br>src/core/hunt/targeting.js:53 elementOn | ELEMENT_PCT bounds (src/data/elements.js). weak +15, resist 25, former immunity 50 (ruling 2026-11-06) | C-MON-STATS | C-HURT, C-WEAKNESS | deterministic |
| C-VULN | A target that takes more: Hunter's Mark (unit fields markPm until markUntil) plus the strongest marking status (takenPm), added and folded into the cast's power | src/core/hunt/damage.js:69-76 takenPmOf<br>src/core/hunt/damage.js:166-170<br>src/core/hunt/abilities.js:411-414 | the mark row's bonusPct and durMs (abilities.js). Sickness takenPm 100 for 6 s (statuses.js) | C-STATUS | C-HURT | deterministic |
| C-STANCE | Stance: Offensive deals and takes x1.10, Defensive deals x0.90 and takes x0.85 | src/data/rule-subjects.js:38-42 HUNT_STANCES<br>src/core/hunt/damage.js:130-131 | HUNT_STANCES | none | C-HURT | deterministic |
| C-TEMPER | Tempering: Blows raises what lands on a monster and every heal by rungs x the ladder's permille. Armor (with worn steadyPm and a food's steady) lowers what reaches the hero, last, never past the cap. The part of a point is a chance | src/core/temper.js:38-57<br>src/core/hunt/damage.js:137<br>src/core/mitigation.js:83 | src/data/temper.js ladders (1% a rung tiers 2-6, 0.4% Dawnsteel, 0.5% unique bands) | E-TEMPER-COST (economy) | C-HURT, C-SPELL-HEAL, C-ARMOR-CHAIN | one draw a blow, only for a hero holding a rung |
| C-SPELL-HIT | A damaging cast: each hit rolls a whole number from max(ceil(top / 2), base lo) to max(top, base hi), top = floor(maxHit x hitPm / 1000). Then C-HURT. It never misses and never crits | src/data/abilities.js:356-360 hitRange<br>src/data/abilities.js:422-425 blowShare<br>src/core/hunt/abilities.js:392-400 | each row's hitPm and base (abilities.js:159-336). ABILITY_RULES.hitLowPm 500 | C-HERO-POWER, C-CAST-POWER, C-HURT | E-KILL-RATE (economy), cast-facts.js (the bar's words) | one int a hit |
| C-SPELL-HEAL | A heal: floor(max(floor(maxHit x healPm / 1000), base) x power / 1000), whole (no roll), x Tempering, less the heal cut, capped at missing HP. Mend alone: floor(maxHp x 110 / 1000) x power | src/data/abilities.js:367-376 castAmount<br>src/core/hunt/abilities.js:353-361 healOne | each row's healPm and base. Mend healHpPm 110 (abilities.js:335) | C-HERO-POWER, P-VITALS (progression), C-CAST-POWER, C-TEMPER, C-HEAL-CUT | survival, E-SUPPLY-USE (economy: a heal replaces food) | deterministic |
| C-SPELL-SHELL | A shell: floor(max(floor(maxHit x shieldPm / 1000), base) x power / 1000), a pool that a blow spends before HP. A recast of a self shell refunds the unused part as mana. A party shell never lowers a bigger one | src/data/abilities.js:367-376<br>src/core/hunt/abilities.js:285-291 shieldRefund<br>src/core/hunt/damage.js:138-139 | each row's shieldPm and base | C-HERO-POWER, C-CAST-POWER | C-HURT | deterministic |
| C-CAST-POWER | A cast's power in permille: the rune tier's step (1000 / 1100 / 1200 / 1300 / 1400 at each tier's skill gate, runes.js versionLevel) x the store's share for a store rune x Surge when it surges | src/data/runes.js versionStep, versionLevel<br>src/data/abilities.js:429-432 versionOf<br>src/core/hunt/abilities.js:343<br>src/core/hunt/abilities.js:490 | RUNE_TIERS stepPm and level. BASIC_EFFECT_SHARE (supply-basics.js). SURGE_MULT_PM (jewelry.js) | P-SKILL-LEVEL (progression: the version gate), E-RUNE-SUPPLY (economy), C-JEWEL-PERKS | C-SPELL-HIT, C-SPELL-HEAL, C-SPELL-SHELL, C-STATUS | Surge: one draw a cast for a wearer |
| C-STATUS | Statuses, one generic engine: a ticking one (Bleed: scale = max(tier share, floor(maxHit x 33 x tier share / 1000)), tick = round(roll 1..3 x scale / 1000) a stack a second, 5 stacks, 6 s), a marking one (takenPm), a slowing one (Chill: clock x (1000 + slowPm) / 1000, 30% to 50% by rune tier), a heal-cutting one (Withered) | src/core/hunt/status.js:58-124<br>src/data/statuses.js<br>src/core/hunt/damage.js:95-100 slowed | STATUSES rows. Bleed tierPermille [1000..1400], Chill tierPermille [1000..1667] | C-HERO-POWER, C-CAST-POWER | C-HURT, C-VULN, C-HEAL-CUT, C-CLOCKS | one int a tick for a ranged tick |
| C-HEAL-CUT | Every heal a Withered unit takes: n - floor(n x cut / 1000). A hero 30% (less by its necrotic resistance), a monster 50% | src/core/hunt/heal-cut.js:26-43 | STATUSES.withered healCutPm (dark behind NECROTIC_STORM.live) | C-STATUS, C-RESIST-HERO | C-SPELL-HEAL, C-LEECH, C-REGEN (the wraps' own heal), food (economy) | deterministic |
| C-LEECH | Life leech: floor(HP a hit took x leechPm / 1000) back to the caster (Reave 300). Mana back: min(mana spent, hits x manaPerHit + kills x manaPerKill). Focus: a kill returns focusPm of max mana | src/core/hunt/abilities.js:367-373 leechBack<br>src/core/hunt/abilities.js:519-524 manaBack<br>src/core/hunt/damage.js:196-201 focusBack | row fields leechPm, manaPerHit, manaPerKill (abilities.js:321-327). jewel focus | C-HURT, C-HEAL-CUT | survival, E-SUPPLY-USE (economy: drink) | deterministic |
| C-CLOCKS | Attack speed: every basic attack is 2,000 ms for heroes and monsters with no speed modifier. A cast locks its lane (offense 2 s, support 2 s, heal 1 s) and its own cooldown. Chill stretches a swing and a windup | src/core/combat.js:63 tickMs<br>src/data/abilities.js:111 ABILITY_LANES<br>src/core/hunt/damage.js:208 restart<br>src/core/hunt/abilities.js:482-483 | tickMs 2000 (ruled 2026-10-15). Lanes. Each row's cdMs | C-STATUS | C-BASIC-BLOW, every cast, C-MON-SPELL | deterministic |
| C-MANA | Mana: regenerates 25% of max a minute x the Inner Flame rate. A caster's basic costs 1 mana. A cast costs its version's mana, never more with level | src/core/hunt/abilities.js:535-542 regenMana<br>src/data/hunt-roles.js:46-49<br>src/data/abilities.js versions | ABILITY_RULES.manaRegenPctPerMin 25 | P-VITALS (progression), P-INNER-FLAME (progression) | every cast, E-SUPPLY-USE (economy: drink), P-MAGIC-XP (progression: paid per mana) | deterministic |
| C-REGEN | HP regeneration: 0.3% of max a second in a fight and 6% out of one, x the Inner Flame rate 1 + P / (P + 50). The fist wraps add selfHealPm a second | src/core/hunt/pull-cycle.js:305-322<br>src/core/vitals.js:72-75 regenPermille | VITALS.inFightRegenPermillePerS 3 (core-model.js). HUNT_TUNING.oocRegenPermillePerS 60. FLAME_REGEN { maxPermille 1000, k 50 } | P-VITALS, P-INNER-FLAME (progression), C-HEAL-CUT | survival, E-KILL-RATE (economy: the rest between pulls) | deterministic |
| C-MON-BLOW | A monster's largest blow: floor(atk x the art tier's scale), scale 5.4 for tiers 1-2, 4.0 for 3-4, 3.0 for 5, 2.2 for 6. It rolls 1..that like a hero's | src/core/combat.js:473-477 monsterMaxHit<br>src/core/hunt/damage.js:247-255 | COMBAT_BALANCE.monsterAttackDamageScale 5.4 and monsterDamageScaleByTier (combat.js:45-56), restated as balance-sheet.js:340 DAMAGE_SCALE_BY_TIER | C-MON-STATS, C-TIER | C-HURT, C-MON-SPELL, pull-cycle.js:72 biggestBlowOn (the warning) | chance, then int |
| C-MON-TOHIT | A monster's chance to land: ratio(aim, 20 + Defense + worn +Defense + guard), held to 5%..97%. Guard is the defB of gear outside the armor weights (a shield, a cape) | src/core/combat.js:443-449<br>src/core/combat.js:468-470 monsterAccuracy<br>src/core/combat.js:181 guardB | TO_HIT | C-MON-STATS, C-TIER, P-SKILL-LEVEL (progression: Defense), C-GEAR-ARMOR | C-HURT, P-DEFENSE-XP (progression) | one chance draw |
| C-ARMOR-CHAIN | What armor does to a landed blow, in fixed order: dodge (medium) = floor(650 x P / (P + 0.4 x L)), absorb (heavy) = floor(750 x P / (P + 0.62 x L)), the resistance, ward (light) = floor(P x 1.5) flat, Tempering, and never more than 60% in all. L is the ATTACKER's Level, with the tier's dial on it | src/core/mitigation.js:44-87<br>src/core/hunt/damage.js:107-108 armourVs<br>src/core/hunt/damage.js:158-162 the dodge roll | ARMOUR_MITIGATION (core-model.js:168-173). ARMOUR_WEIGHT | C-GEAR-ARMOR, C-MON-STATS (its Level), C-TIER (levelAtTier), C-RESIST-HERO, C-TEMPER | C-HURT, character sheet (hr-accrue/character-sheet.js:93) | dodge: one chance draw for a medium wearer |
| C-RESIST-HERO | A hero's resistance: taken = 1000 - min(cap, summed worn resistPm), cap 40% an element and 10% physical. Storm also burns mana for half the HP it took. Necrotic lands Withered | src/core/elements.js:87-111<br>src/core/combat.js:219-229 resistOf<br>src/core/hunt/damage.js:178-184 | HERO_RESIST_PM and ELEMENT_ON_HERO (src/data/elements.js) | C-GEAR-ARMOR | C-ARMOR-CHAIN, C-HEAL-CUT | deterministic |
| C-MON-STATS | A monster row from its Level, role, ground floor and fit: HP = (4.95 + 1.76 x L) x role x fit, blow = a share (13.2% to 22%) of a same-Level hero's base HP, aim and evasion from the reference hero (lands 70%, is landed on 85%), def = 0.08 x L x role | src/data/balance-sheet.js:351-386 formulaStats<br>src/data/balance-sheet.js:128-195 STAT_FORMULA<br>src/data/balance-sheet.js:205-219 MONSTER_ROLES<br>tools/gen-ground-stats.mjs (writes the rows) | STAT_FORMULA { ramp 8..16, hit 0.40..0.70, heroHit 0.85, blow 0.132..0.22, gentleCap 0.11, hp, def, fit.party }. MONSTER_ROLES | C-REF-HERO, P-VITALS (progression: refHp) | C-MON-BLOW, C-MON-TOHIT, C-MON-DEF, C-HERO-TOHIT, C-RUN-ROOM, P-KILL-XP (progression: xp is on the same row), E-KILL-COIN (economy: gp is on the same row) | deterministic |
| C-REF-HERO | The reference hero a monster is written against: a measured career (the lone hammer) [Level, skill, Defense, worn accuracy] every 5 Levels to 100, sparser to 1,000, straight past it. aimFor and evasionFor invert the ratio | src/data/to-hit.js:120-168<br>tools/gen-ref-hero.mjs (generates the table) | REF_HERO (generated). Worn accuracy stops at 32 from Level 90 | P-SKILL-CURVE (progression), C-GEAR-WEAPON | C-MON-STATS, C-TIER (raisedHit) | deterministic |
| C-TIER | Normal, Dangerous, Deadly: a pull size and three dials. dmgPm multiplies atk, aim AND the monster's Level as armor reads it. hpPm its HP. xpPm its kill XP. On a gentle ground the tier first takes back the ground's kindness, so its dmgPm is solved per floor | src/data/balance-sheet.js:426-485 TIER_DIALS, tierRowFor<br>src/data/hunt-tiers.js:122-131 levelAtTier, atTier<br>src/data/balance-sheet.js:437-461 the per-ground overrides | TIER_DIALS { dangerous: pull 8, lift 0.8, 1170 / 1100 / 1100. deadly: pull 8, lift 1, 1330 / 1150 / 1250 }. TIER_PULL_FROM_FLOOR 16. Four grounds carry their own dials | C-MON-STATS | C-MON-BLOW, C-MON-TOHIT, C-ARMOR-CHAIN, E-KILL-RATE (economy: the pull), P-KILL-XP, P-DEFENSE-XP (progression) | deterministic |
| C-MON-SPELL | A monster's spell: it rolls from half to all of floor(its largest blow x hitPm / 1000), then the hero's armor as any blow. A worn shield takes 30% off a marked spell. A mend puts the same roll back on a packmate. The first cast waits a random share of the cooldown | src/data/monster-spells.js:57-102<br>src/core/hunt/monster-spells.js:130-200 | each spell row. SPELL_ROLL.lowPm 500. SHIELD_BRACE.markedPm 300. FAIR_WARNING. SPELL_STAGGER.spanPm 1000 | C-MON-BLOW, C-ARMOR-CHAIN, C-RESIST-HERO, C-HEAL-CUT | C-HURT, P-DEFENSE-XP (progression) | int a hit. The stagger draw |
| C-BOSS-PHASE | A boss's two lines on his HP: adds arrive at addsPm and he takes only guardPm of every blow while one stands. Under enragePm his atk and aim are x enrageAtkPm, and one named spell's cooldown is x cdPm | src/core/hunt/boss-phases.js:38-89 | each boss row's phases (monsters.js:830,845. grounds/krells_hold/pack.js:350,360. grounds/muster_barrows/pack.js:178) | C-MON-STATS | C-HURT, C-MON-BLOW, C-MON-TOHIT, C-MON-SPELL | deterministic |
| C-BOSS-ROOM | A boss room: one fight, a time limit, his kill ends it, nothing resets. A called room pays nothing. A keyed hall pays as a ground. A boss is the formula's boss role: HP x5, blow x1.1 held to 33% of the FLOOR hero's HP | src/core/hunt/boss-room.js:21-32<br>src/data/boss-calls.js<br>src/data/boss-halls.js<br>src/data/balance-sheet.js:218 the boss role | BOSS_CALL_RULES.limitMs 10 min. BOSS_HALL_RULES. MONSTER_ROLES.boss.floorCap 0.33 | C-MON-STATS, C-BOSS-PHASE | E-BOSS-PAY (economy) | deterministic |
| C-RUN-ROOM | A Burning Tower floor or a Catacomb room F: 5 monsters, each the stat formula at Level F on a floor-F ground, a Keeper (boss role) every 10th. Past floor 100 every blow is x1.012 a floor, compounding. Floor 300 is the last row | src/core/hunt/tower.js<br>src/data/tower.js:49-60<br>src/data/tower.js:114-124 | TOWER_RULES / CATACOMB_RULES { roomSize 5, landingEvery 10, floorTop 300, heat { from 100, perFloorPm 12 }, limits 3 and 10 min } | C-MON-STATS | P-RUN-XP (progression: TOWER_PARTY_XP), E-RUN-KEYS (economy) | deterministic (rooms are picked by number, no dice) |
| C-TARGET | Aggro is rules, not threat numbers: a pack turns on the pull's leader. Challenge takes every monster within 6 tiles that is not on a tank and holds it 8 s. A Healer's basic draws a free monster 18% of the time. A shooter aims at the hero farthest back. A tank under 90% of the strongest tank's HP never takes a turn | src/core/hunt/targeting.js:164-260<br>src/data/hunt-roles.js:43-49 peel<br>src/data/hunt-roles.js:145 CHALLENGE<br>src/core/hunt/shooters.js | CHALLENGE { radius 6, holdMs 8000, holderMinHpPm 900 }. Healer peel 180 | P-VITALS (maxHp for the hold floor) | who takes C-HURT, P-DEFENSE-XP (progression: only blows taken train it) | the peel draw |
| C-AREA | Area and extra targets: a shape (the 3x3, a line of len, a ring of r) hits every engaged monster it covers for the FULL roll each, up to maxHits. Follow-through repeats a basic blow on one neighbour. An area arrow hits its footprint | src/core/hunt/abilities.js:424-435<br>src/core/hunt/shapes.js<br>src/core/hunt/damage.js:229-234<br>src/core/hunt/damage.js:280-288 | ABILITY_RULES.areaSide 3. Row fields len, r, maxHits (Turning Cut 8) | C-SPELL-HIT, C-TIER (the pull is how many stand there) | E-KILL-RATE (economy), P-KILL-XP (progression) | int a target |
| C-LEASH | A pack lives in its room plus a margin (1 tile unless the ground says more). If the aggro holder leaves, the pack resets and heals. A called or keyed boss never resets | src/core/hunt/leash.js<br>src/data/hunt-tuning.js:36 | HUNT_TUNING.leashMarginDefault 1. A ground's leashMargin | none | C-TARGET, C-BOSS-PHASE | deterministic |
| C-PULL | How many stand in a fight: the ground's packs on Normal, the tier's pull on a harder tier (8, the Glade's Dangerous 6, none under floor 16). A monster's HP is its row's x hpPm for every party size | src/core/hunt/pull-cycle.js:99-100<br>src/data/hunt-tiers.js:114 pullOfTier | TIER_DIALS pulls. Ground pockets | C-TIER | C-AREA, E-KILL-RATE (economy) | deterministic |
| C-GEAR-ARMOR | Armor points: the one gear formula (src/core/gear-stats.js gearStats): the weight's profile (plate 1000, leather 550, cloth 300 permille) x the slot's share (GEAR_SLOT_PM) x the defense budget at the piece's item Level, each line's trades a share of the same budget, a named piece its statPlus; on a Danger-scale ground read at the ground's base item Level (scaleItems). Past tier 7 the staged line is Dawnsteel x max(1, Level / 110), and each unique is hand-sized under it | src/core/gear-stats.js gearStats, scaleItems<br>src/data/gear-profiles.js GEAR_CURVES, GEAR_SLOT_PM, GEAR_PROFILES<br>tools/balance-sim/staged/armor-line.js:64-70 lineArmor | the defense curve, the slot split, the weights' profiles. LINE_ANCHOR_LEVEL 110, LINE_TRADE 0.05 | P-GEAR-LEVELS (progression: worn by Level) | C-ARMOR-CHAIN, C-MON-TOHIT (guard), P-VITALS (heavy HP, light mana), C-CRIT | deterministic |
| C-GEAR-WEAPON | Weapon accuracy and damage: the one gear formula, the family's profile x the slot's share (a two-handed weapon the shield's too) x the offense budget at the piece's item Level; on a Danger-scale ground read at the ground's base item Level. Past tier 7 the staged line is Dawnsteel x max(1, Level / 110) | src/core/gear-stats.js gearStats, scaleItems<br>src/data/gear-profiles.js GEAR_CURVES, GEAR_PROFILES<br>tools/balance-sim/staged/weapon-line.js:72-81 lineWeapon | the offense curve and the family profiles. WEAPON_LINE_ANCHOR 110 | P-GEAR-LEVELS (progression) | C-HERO-POWER, C-HERO-TOHIT | deterministic |
| C-JEWEL-PERKS | Worn modifiers and how each stacks: jewel perks (Keen, Steady, Follow, Surge, Focus) count the largest once. Resistance sums, then caps. +skill sums. The own heal takes the largest. critB sums | src/core/combat.js:96-109<br>src/core/combat.js:207-248<br>src/data/jewelry.js | each item row | E-JEWEL-COST (economy) | C-HERO-TOHIT, C-CRIT, C-AREA, C-CAST-POWER, C-LEECH, C-HERO-POWER | deterministic |
| C-BUFF-BONUS | The injected bonus reader: a food buff or a perk adds to damage, crit and steady (a damage cut). Permanent perks are held to 20% | src/core/combat.js:425-428<br>src/core/buffs.js:63-75<br>src/core/perks.js:87 PERMANENT_CAP<br>src/core/mitigation.js:30 | BUFFS_DEF. PERMANENT_CAP 0.20 | E-FOOD (economy) | C-HERO-POWER, C-CRIT, C-TEMPER | deterministic |
| C-TRAINING | The training yard's dummy: its blow never takes a hero under a floor, and it never falls | src/core/hunt/training.js dummyBlow, dummyStands<br>src/core/hunt/damage.js:141-143 | the dummy rows | none | P-SKILL-XP (progression), E-YARD-FEE (economy) | deterministic |
<!-- END GENERATED:FORMULAS -->

## 2. Exception inventory

Class 1 foundational mechanic. Class 2 content parameter. Class 3 intentional special mechanic that needs Tyler's explicit approval. Class 4 accidental complexity. The git history of `src/` starts on 2026-11-03 (d4dc6908c), so an older "why" is taken from the code's own dated comments.

How each item on the brief's section 2 list came out:

| The brief asks for | Found |
|---|---|
| Grounds with custom combat math | No custom code. Custom numbers: X-TIER-PER-GROUND, X-TIER-PULL-FLOOR, X-PARTY-FIT-PATCHES, X-DANGER-RAMP, X-GENTLE-CAP, X-SCALED-THICKET |
| Monsters that bypass damage or defense | None bypass the damage door. Two named stat exceptions (X-NAMED-RAT-KING, X-NAMED-HASK-LOOKOUT), 118 hand rows (X-HAND-ROWS), the dummy (X-DUMMY), a boss's guard (in C-BOSS-PHASE, shared) |
| Spells with different math for the same job | X-THREE-ROLLS, X-SPELLS-SKIP-WEAKNESS, X-MEND-MAXHP, X-SPELL-FLOOR, X-MARK-TWO-WAYS |
| Weapon or equipment special cases | X-BRACE, X-SET-CRIT, X-DEFB-TWO-JOBS, X-CASTER-BASIC, X-STACKING-RULES |
| Level thresholds that change math | X-DANGER-RAMP (ground floor 8 to 16), X-TIER-PULL-FLOOR (16), X-ART-TIER-SCALE, X-VERSION-LADDER (skill 60), X-TURNING-CUT-10, X-TOWER-HEAT (floor 100), X-TOWER-TOP (300), and gear ending at Level 90 |
| Party math that differs by ground | X-PARTY-FIT, X-PARTY-FIT-PATCHES, X-TIER-PER-GROUND, X-PARTY-ONLY-ROWS. The party XP tables are the progression lane's |
| Compensating multipliers | X-ART-TIER-SCALE, X-GENTLE-CAP, X-GENTLE-HP, X-PARTY-FIT-PATCHES, X-TOWER-HEAT, X-SPELL-HOLDS, X-SCALED-THICKET |
| Duplicates written differently | X-POWER-LITERALS, X-SHEET-ORDER, X-REFHP-OFF-BY-ONE, X-ROLL-TWINS, X-TIER-LADDER-TWINS, X-SCALE-TWINS, X-LINE-IN-TOOLS |
| Unexplained caps and floors | All explained. The foundational ones are listed so nobody removes them: X-TOHIT-RAILS, X-MIN-ONE, X-MITIGATION-CAP, X-CRIT-CAP, X-RESIST-CAPS |

<!-- GENERATED:EXCEPTIONS (tools/balance-program/formulas/combat-register.mjs --write) -->
| id | class | status | where | what it does | why it exists | the fix, and its layer |
|---|---|---|---|---|---|---|
| X-POWER-LITERALS | 4 | CONFIRMED | src/core/combat.js:391 against combat.js:38-40 and src/shell/wiki-model.js:126 | The engine computes a hero's largest blow from the literals 0.35, 0.6 and 2. The named constants with the same values are read only by the wiki. Change one and the wiki prints a formula the game does not run | history starts 2026-11-03 (d4dc6908c). The constants predate the rebuild | formula layer: the expression reads COMBAT_BALANCE. One guard that the wiki terms equal the engine's |
| X-SHEET-ORDER | 4 | CONFIRMED | src/core/combat.js:422-423 against src/core/hunt/damage.js:126,309-314 | Two orders for one blow. The sheet, the wiki and the upgrade plan read floor((maxHit - cut) x weakness). The engine rolls 1..floor(maxHit x weakness), then subtracts the cut from the roll | the b495 truncation fix kept the subtraction in the roll helper after the hunt engine moved it into hurt() | formula layer: playerCombatRolls stops subtracting defence. Every reader takes the cut from C-MON-DEF |
| X-REFHP-OFF-BY-ONE | 4 | CONFIRMED | src/data/balance-sheet.js:131 against src/core/vitals.js:61 and SQL hr_max_hp (supabase/migrations/2027-02-10-settle-plan-cache.generated.sql:996) | The monster formula sizes blows on a hero of 150 + 10 x L HP. A hero has 150 + 10 x (L - 1). Every blow share is 10 HP a hero does not have (6% at Level 1, 0.5% at 200). The same formula is also written a third time in SQL, on generated constants | two files written weeks apart | formula layer: STAT_FORMULA.refHp calls vitals.maxHpFor(L, 0). The SQL twin stays (server authority) and gets a parity test against the JS at 20 Levels |
| X-ROLL-TWINS | 4 | CONFIRMED | src/data/abilities.js:422-425 blowShare against src/data/monster-spells.js:99-102 spellHit | One function written twice with two constants (hitLowPm 500, SPELL_ROLL.lowPm 500) | 2026-11-08 833de2595 added the monsters' copy. 2026-11-20 aef332af9 gave heroes the same rule | formula layer: one shareRoll(power, pm) in src/core, one constant |
| X-TIER-LADDER-TWINS | 4 | CONFIRMED | src/data/runes.js stepPm against src/data/statuses.js bleed.tierPermille and chill.tierPermille | The rune step ladder 1000..1400 is typed again on Bleed. Chill carries a different ladder, 1000..1667, for the same five tiers | the bleed predates the spell rule. Chill is 2026-11-19, the tank runes | coefficient layer: a ticking status reads versionStep. Chill's own ladder becomes a named row with a why, or takes the common one |
| X-SCALE-TWINS | 4 | CONFIRMED | src/core/combat.js:56 against src/data/balance-sheet.js:340 | The art tier damage scale is restated in the sheet. A test pins the two equal | the sheet must divide by what the engine multiplies by | gone with X-ART-TIER-SCALE |
| X-MARK-TWO-WAYS | 4 | CONFIRMED | src/core/hunt/damage.js:166 against src/core/hunt/abilities.js:411-414 | Two mechanisms for "this target takes more": Hunter's Mark writes unit fields (markPm, markUntil). Green Sickness is a status row (takenPm). They are added | the mark is 10-19. Statuses learned takenPm later | formula layer: the mark becomes a marking status row. Two world fields go |
| X-ROW-DOOR-BYPASS | 4 | CONFIRMED | src/core/hunt/targeting.js:53, src/core/hunt/boss-phases.js:39,48,55 | Elements, the enrage line, the guard and the adds read MONSTERS[kind] directly. Every other stat goes through rowOf(inst, kind), the door a scaled hunt, a Tower room and the simulator's what-if use. So a what-if can move a blow but not a resistance or a phase | 2026-11-05 f451acdb8 (phases) and the element reader predate the instance table | formula layer: both read rowOf. IMPACT IS A HYPOTHESIS: no live table moves these fields today |
| X-STEADY-TWO-MEANINGS | 4 | CONFIRMED | src/core/combat.js:388 (jewel steady: misses that land) against src/core/mitigation.js:30 (steadyPm and a food's steady: a damage cut) | One word, two mechanics, and the food buff is labelled "Damage cut" under the id defense | jewelry 11-05, the cape and the food later | data layer: rename one. No number moves |
| X-STALE-HP-NOTE | 4 | CONFIRMED | src/data/balance-sheet.js:145 against src/core/hunt/pull-cycle.js:99 | The sheet still says the engine scales monster HP 55-100% by party size. Since 2026-11-08 it does not | ONE DIFFICULTY ruling 2026-11-08 | delete the sentence |
| X-ART-TIER-SCALE | 4 | CONFIRMED | src/core/combat.js:45-56,473-477 | A monster's damage is atk x a scale picked by its ART tier: 5.4, 4.0, 3.0 or 2.2. For the 72 formula rows it does nothing but rounding: the formula divides the blow by the same number. It still decides the damage of the 118 hand rows | CORE_NUMBERS 2026-10-19 addendum: one flat 5.4 two-shot a Level 90 hero, so tiers 4-6 were flattened. Tier 3 moved to 4.0 on 10-21 | formula layer: the row stores the blow (a whole number of HP). The scale and its twin go. Hand rows are converted once, digit for digit |
| X-HAND-ROWS | 2 | CONFIRMED | src/data/monsters.js | 118 of 190 monster rows are on no formula roster: their hp, atk, aim, evasion and def are typed by hand (the old roster, the Hearthfind and called bosses, Krell's hall, the dummy). 70 of the 72 roster rows equal the formula exactly | the formula is 2026-11-06. Older rows were ported to keep their to-hit, never re-derived | data layer: each row gets a role and reads the formula, or is listed as a named exception with its reason. WHICH OF THE 118 ARE FIELDED TODAY IS A HYPOTHESIS (tools/balance-program/formulas/roster-drift.mjs counts them) |
| X-NAMED-RAT-KING | 3 | CONFIRMED | src/data/balance-sheet.js:336 FORMULA_EXCEPTIONS.rat_king | His attack is held at 6 where the formula says 8, so his Tail Lash stays under 35% of the floor hero's HP | Tyler 2026-11-18 "open at 5" plus the designer's 35% boss rule | better at the formula layer: the boss cap should bound his SPELL, not his attack. Then the row is the formula's |
| X-NAMED-HASK-LOOKOUT | 4 | HYPOTHESIS | src/data/balance-sheet.js:337 FORMULA_EXCEPTIONS.hasks_lookout | His blow is the Farmhands' share, not his role's, "while engine piece 2 is unbuilt he swings in melee". Shooters are built now and he is one (range 5, tier-read.mjs) | 2026-11-13 lane/b-barrow-packs | the stated reason is gone. Whether a lone hero at the floor is safe on the role's blow is the hypothesis: one grid cell answers it |
| X-DANGER-RAMP | 3 | CONFIRMED | src/data/balance-sheet.js:137,343-348 STAT_FORMULA.ramp | A ground whose floor is 8 or under is gentle: monsters land 40% and hit 13.2% of a hero's HP. From floor 16 they land 70% and hit 22%. A straight line between | 2026-11-07: fresh heroes in practice sets hunt the first grounds | keep, as the ONE early-game curve. It is a Level threshold that changes combat math, so it needs Tyler's explicit yes |
| X-GENTLE-CAP | 4 | HYPOTHESIS | src/data/balance-sheet.js:158 blow.gentleCap 0.11 | On top of the ramp, no blow on a gentle ground may pass 11% of the FLOOR hero's HP | 2026-11-07 5c5de4170: fresh Thicket heroes dipped under 25% HP | coefficient layer: fold into the ramp's low end. A hypothesis until the grid shows the ramp alone holds the fresh hero |
| X-GENTLE-HP | 4 | HYPOTHESIS | src/data/balance-sheet.js:213,215 MONSTER_ROLES gentleHp | Heavy and elite monsters have less HP on a gentle ground (1.0 and 1.2 where the role says 1.2 and 1.6) | 2026-11-07: extra HP there "only inflated the kill's XP and coin" | this is an XP and coin fix written into combat stats. Overlap: progression and economy lanes |
| X-PARTY-FIT | 2 | CONFIRMED | src/data/balance-sheet.js:193-195 STAT_FORMULA.fit.party | A party ground's monsters are a different formula: HP x2.5, blow x0.75, XP x0.8 | 2026-11-06: built for four heroes' damage on one tank | keep as an ENCOUNTER TYPE in data (it is one row for every party ground, not a per-ground number) |
| X-PARTY-FIT-PATCHES | 4 | CONFIRMED | src/data/balance-sheet.js:195 hitFull -0.3, blowShape 1.6, tierLift false | Three patches inside the party fit: to-hit 30 points lower on a full party ground, the same swing worth as fewer bigger blows on a gentle one, and harder tiers that lift nothing | 2026-11-07 (blowShape: "tier-2 cloth felt at the Sewer"). 2026-11-13 (hitFull: a lone hero at the Warrens "lived on its potions"). tierLift: a gentle party ground's Deadly killed its four 195 times | each one compensates another formula (ward's flat cut, the lone hero on a party ground, the tier lift). Fix those and delete the three |
| X-TIER-PER-GROUND | 4 | CONFIRMED | src/data/balance-sheet.js:437-459 BASE_TIER_OVERRIDES | Four grounds carry their own tier dials: the Glade (Dangerous pulls 6, HP 1400 and 1450), the Warrens (HP 1150 and 1250), the Thicket (no HP, XP 1050 and 1080), the Sewer (HP 1150 and 1250, XP 1220) | 2026-11-16/17 lane/d-flat-party-xp: fours killed too fast for the XP. The ladder rule (a ground's top tier must not beat the next ground's Normal) | the exact case the brief names. The cause is kill-rate and XP: fix at P-KILL-XP and the pull, then every ground takes TIER_DIALS whole. Overlap: progression lane |
| X-TIER-PULL-FLOOR | 3 | CONFIRMED | src/data/balance-sheet.js:413 TIER_PULL_FROM_FLOOR 16 | Under ground floor 16 a harder tier brings no more monsters | 2026-11-08: a lone area hero out-earned the next ground | conflicts with Tyler 2026-11-07 "Dangerous and Deadly keep the bigger pulls". For Tyler |
| X-CELLAR-NORMAL-ONLY | 3 | CONFIRMED | src/data/balance-sheet.js:450 | The Mill Cellar offers only Normal | Coordinator 2026-11-05, in Tyler's tier ruling | keep. A content flag |
| X-TIER-TRIPLE | 4 | CONFIRMED | src/data/hunt-tiers.js:122,130 and src/core/hunt/damage.js:108 | A tier's dmgPm is applied three times: to the blow, to the aim, and to the monster's Level as armor reads it (and as Defense XP is paid). On the Thicket and Wickstead the solved dmgPm is 2115 and 2685, so on Wickstead's Deadly a Level 8 monster is read by armor as Level 21, and each blow aimed at a hero pays 2.7 times the Defense XP (hunt-rewards.js:62). From Hask's Ford up it costs plate 2 to 5 points of absorb (tools/balance-program/formulas/tier-read.mjs) | 2026-11-04 f1d68555e: one dial for everything | formula layer: the dial moves the blow and the aim. Armor and Defense XP read the row's own Level. Overlap: progression lane (P-DEFENSE-XP) |
| X-TOWER-HEAT | 4 | CONFIRMED | src/data/tower.js:57 and src/core/hunt/tower.js heatOpts | Past floor 100 every blow is x1.012 a floor, compounding: x10.9 by floor 300. The number moved 10 to 12 to hold a guard | 2026-11-19 b7c73732c. Tyler 2026-11-20 already DROPPED the heat patch (one Levels-per-floor row instead). Plan L18 owes it | already ruled. Listed so it is not forgotten |
| X-TOWER-TOP | 3 | CONFIRMED | src/data/tower.js:54 floorTop 300 | A floor above 300 plays floor 300's monsters | the server's per-floor bound needs a last row | a cap on an endless mode. Needs Tyler's yes or a formula that reads any floor |
| X-SPELL-HOLDS | 4 | HYPOTHESIS | src/data/balance-sheet.js:121-123 (named there: Hot Coal, Bone Slide, Snuff the Candles) | Three monster spells had their multiples lowered so the +10% monster step would not pass 35% of a floor hero | 2026-11-19 lane/d-harder-monsters | the rows were not read. If true, the 35% rule belongs in the spell formula as a bound, not in three rows |
| X-SPELL-FLOOR | 3 | CONFIRMED | src/data/abilities.js:356-376 (hitRange, castAmount `floored`) and src/core/hunt/status.js:69 | The beginner's floor: every cast lands max(its share of the blow, its old version-I number). Past about Level 15 the share is always larger. At Level 1 a Greater Mend lands its floor of 50 on a hero with 150 HP | Tyler 2026-11-21 call 32-8 ("heals and first strikes are not cut in half"). Built by lane/c-spell-rule as its Call 1, still waiting for the designer's yes | see Conflicts 1. The clean alternative is a floor on POWER (one number: a hero's blow is never read under N), not a second number on every row |
| X-MEND-MAXHP | 3 | CONFIRMED | src/data/abilities.js:335 healHpPm 110 | Mend heals a share of max HP, not of the blow | Tyler 2026-11-21 call 32-4 | approved. Documented as the second of two heal kinds |
| X-THREE-ROLLS | 3 | CONFIRMED | src/core/combat.js:484, src/data/abilities.js:422, src/data/abilities.js:373 | Three shapes for "an amount": a swing rolls 1..max (mean 50%), a spell hit rolls 50%..100% (mean 75%), a heal or shell does not roll | the swing is the old engine's. The spell roll is the monsters'. Whole heals are lane/c-spell-rule's Call 5 | see Conflicts 6. One roll rule with a per-kind spread in data would do all three |
| X-SPELLS-SKIP-WEAKNESS | 4 | CONFIRMED | src/core/hunt/damage.js:305-316 (blow) against src/core/hunt/abilities.js:392-400 (strike) | Weapon weakness (+20% damage, +15% accuracy, on 189 of 190 monsters) and bane apply to basic blows only. A spell is a share of the NEUTRAL blow. A spell also never misses and never crits, so accuracy, evasion, Keen and critB do nothing for it | spells were fixed numbers until 2026-11-21. The spell rule made them shares of the blow without deciding which blow | see Conflicts 2. THAT IT IS UNINTENDED IS A HYPOTHESIS |
| X-VERSION-LADDER | 2 | CONFIRMED | src/data/runes.js RUNE_TIERS | Five versions, +10% each, the last at skill 60. Nothing after it, on a game with endless Levels. The plan (B5) said x1.6 | Tyler 2026-10-23 (five tiers at 1/15/30/45/60). lane/c-spell-rule Call 4 chose 1.4 | see Conflicts 5 |
| X-TURNING-CUT-10 | 2 | CONFIRMED | src/data/abilities.js:194 unlock 10, maxHits 8 | The merged area strike unlocks at Melee 10 for every weapon, so the axes and the hammer have no area move for Levels 1-9 (lone hammer -24% at the Thicket) | Tyler 2026-11-19 (the sword speeds up later). lane/c-spell-rule Call 3 | see Conflicts 7. A per-weapon unlock is a data field, not code |
| X-REND-DEFAULT | 2 | CONFIRMED | src/data/rule-subjects.js ROLE_RULES melee_dps | Rend sits on the default two-axe bar and spends a 1 g rune a cast | lane/c-spell-rule Call 2 | content. Overlap: economy lane (E-RUNE-SUPPLY: a default bar that spends gold) |
| X-DARK-ROWS | 2 | HYPOTHESIS | src/data/abilities.js:275-327 (Brand, Reave, Updraft, Blight, the fist strikes) | Converted to shares at their old Level 60 worth, never sized | lane/c-spell-rule Call 6. Lanes L43, L44 | content, owed by those lanes. Not measured here |
| X-PARTY-ONLY-ROWS | 3 | CONFIRMED | src/data/abilities.js `alone`, `party`, partyOnly; src/core/hunt/abilities.js:315-319 | A row may fire only alone, only in a party, or party-only for a tank | Tyler 2026-11-09 and 2026-11-19 | approved. One shared gate, read from data |
| X-REPLACES | 1 | CONFIRMED | src/core/hunt/abilities.js:250-253 clockOf | A row that stands in for another shares its cooldown | the whole-game audit's change 3 | keep |
| X-ACTION-SET-SKIPS | 2 | CONFIRMED | src/data/abilities.js:144-148 | Presets that skip rune or area rows (mana_train, boss) | spec §3.7, ASSUMED | keep as data |
| X-BRACE | 3 | CONFIRMED | src/data/monster-spells.js:62 SHIELD_BRACE, src/core/hunt/monster-spells.js:150 | A worn shield takes 30% off a marked monster spell, by item type | Tyler 2026-11-08 "the tank absorbing the boss hits" | approved in direction. Cleaner as a stat on the shield row (bracePm) than a rule keyed on the slot |
| X-ELEMENT-RULES | 3 | CONFIRMED | src/data/elements.js ELEMENT_ON_HERO, src/core/hunt/damage.js:178-184 | Storm burns mana for half the HP taken. Necrotic lands Withered | Tyler 2026-11-18 approved the two elements. The numbers are PROPOSED, dark behind a switch | needs Tyler's yes on the two rules before the switch goes on |
| X-DEFB-TWO-JOBS | 2 | CONFIRMED | src/core/combat.js:181 and src/core/mitigation.js:33-41 | One item field, defB, feeds two formulas by item class: on armor it is armor points, on a shield or cape it is guard in the to-hit roll | ruling K7, 2026-10-18 | data layer: two fields (armor, guard). No number moves |
| X-SET-CRIT | 4 | HYPOTHESIS | src/core/combat.js:252-270 armorSetBonus | Five pieces of one tier and line give crit, 1% a tier, for plate and cloth as much as leather. Its default line is "plate" | "Wave 5c / b283", the old client | looks like a leftover. If wanted it is a data row (set bonuses), not a function |
| X-STACKING-RULES | 4 | CONFIRMED | src/core/combat.js:96-109,207-248 | Five stacking rules for worn modifiers: largest-once (perks), largest (own heal), sum (+skill, critB), sum-then-cap (resistance), and the weakness product with two ceilings | each added by its own lane | formula layer: one modifier table { key, combine: sum \| max, cap } that equipmentStats folds |
| X-DORMANT-FACTORS | 4 | CONFIRMED | src/core/combat.js:306-324, src/core/bane.js:62, src/core/charms.js (charmDamageMultFor) | Three factors sit in the damage expression with nothing feeding them: bane (0 items carry one), the weapon element (eq.element is always null), the charm damage ladder (no caller). A second ceiling, 1.68, is exported and unused | the closed rebuild cut their sources and kept the seams | not a cut list: imbuements are on the roadmap, so the element seam is BUILD-LATER (Tyler 2026-11-21). The unused 1.68 and the charm ladder can go |
| X-TEMPER-ROUNDING | 3 | CONFIRMED | src/core/temper.js:13-15 | Tempering rounds by chance (the part of a point is a draw). Every other step floors | 2026-11-04: +1% on a blow of 20 paid nothing | the right idea in one place only. See X-FLOOR-CHAIN |
| X-FLOOR-CHAIN | 4 | HYPOTHESIS | src/core/hunt/damage.js:123-137 | Up to nine floors in a row on one blow. On small numbers each one is a hidden cut: a 10-point hit through three 1.1 / 0.9 steps is not what the product says | steps were added one at a time | formula layer: multiply the permilles, floor once. THE SIZE IS A HYPOTHESIS (largest in the first 15 Levels) |
| X-ARMOR-LINE-FIT | 4 | CONFIRMED | tools/balance-sim/staged/armor-line.js LINE_SAMPLE, tests/armor-line.mjs AL3 | Each unique's armor was sized to "the most that keeps its measure under the line", four digits from 1.0000. Any engine change moves the measure | 2026-11-16/18 lane/d-armor-line-v2 | see section 6.1 |
| X-LINE-IN-TOOLS | 4 | CONFIRMED | tools/balance-sim/staged/armor-line.js:64-70, weapon-line.js:72-81 | The only formula for gear past tier 7 lives in a simulator folder, with the Dawnsteel numbers typed again beside it | a hidden sample may not be imported by src/ | the formula (not the sample) moves to src/data as the gear curve |
| X-ONE-INTERVAL | 1 | CONFIRMED | src/core/combat.js:63 | One 2.0 s basic attack for everyone, no speed stat | Tyler 2026-10-15 | keep. "Attack speed" on Tyler's list is this plus cooldowns and Chill |
| X-TOHIT-RAILS | 1 | CONFIRMED | src/data/to-hit.js:117 | Every chance is held to 5%..97% | Tyler 2026-11-20, 21-1 | keep. On the projected gear line a hero reaches 95% near Level 2,000 (section 7) |
| X-MIN-ONE | 1 | CONFIRMED | src/core/hunt/damage.js:135, mitigation.js:86, combat.js:422,493 | Every landed blow deals at least 1 | engine contract | keep |
| X-MITIGATION-CAP | 1 | CONFIRMED | src/data/core-model.js:172 capPm 600 | Armor never takes more than 60% of a blow | Tyler 2026-10-18 (K7) | keep |
| X-CRIT-CAP | 1 | CONFIRMED | src/core/combat.js:64-65 | Crit chance at most 60%, a crit x1.5 | pre-rebuild | keep |
| X-RESIST-CAPS | 1 | CONFIRMED | src/data/elements.js HERO_RESIST_PM, ELEMENT_PCT | A hero resists at most 40% of an element and 10% physical. A monster profile is bounded both ways | Tyler 2026-11-06 (no immunities), 2026-11-08, 2026-11-14 | keep |
| X-ATTACKER-LEVEL | 1 | CONFIRMED | src/core/mitigation.js:12 | Armor is measured against the attacker's Level | Tyler 2026-11-04 "just simply harder" | keep. It is why armor must grow with Level (section 7) |
| X-BOSS-FLOOR-CAP | 3 | CONFIRMED | src/data/balance-sheet.js:218 floorCap 0.33 | A boss's blow is held to a third of the FLOOR hero's HP, however deep he lives | designer 2026-10-21, after a Sewer death | a designer rule, never ruled by Tyler. Needs his yes |
| X-BOSS-PHASE-ROWS | 2 | CONFIRMED | monsters.js:830,845; grounds/krells_hold/pack.js:350,360; grounds/muster_barrows/pack.js:178 | Each boss carries his own line numbers (enrage x1.15 to x1.8, guard 80%) | Tyler 2026-11-05 "phases" | a model case: one mechanic, numbers in data |
| X-CALLED-ROOM | 3 | CONFIRMED | src/core/hunt/boss-room.js:23-26 | A called boss room pays nothing. A keyed hall pays | Tyler 2026-11-04/05 | approved. Overlap: economy lane |
| X-DUMMY | 3 | CONFIRMED | src/core/hunt/training.js | A dummy's blow cannot kill and it cannot die | Tyler 2026-11-08 | approved |
| X-CASTER-BASIC | 3 | CONFIRMED | src/data/hunt-roles.js:46-49, src/core/hunt/damage.js:342-356 | A basic attack costs by weapon: a wand or staff 1 mana, a bow one arrow, a melee weapon nothing | Tyler 2026-10-15, 2026-10-23 | approved. Overlap: economy lane (E-SUPPLY-USE) |
| X-ROLE-TARGET-NUMBERS | 2 | CONFIRMED | src/data/hunt-roles.js:48,145 | Healer peel 18%, Challenge radius 6, hold 8 s, the 90% weak-tank floor | ASSUMED in the spec, 10-22 for the floor | data. Never measured |
| X-LEVEL-BY-TIER | 4 | HYPOTHESIS | src/data/core-model.js:200 MONSTER_LEVEL_BY_TIER | A monster with no Level gets one from its art tier | CORE_NUMBERS Q5 | if every fielded row has a Level this is dead. Not checked |
| X-MUTABLE-ROWS | 4 | CONFIRMED | src/data/monster-spells.js:68 SPELL_STAGGER, MONSTERS rows, GROUND_TIERS | Data the engine reads is left unfrozen so the simulator can edit it in place and put it back | tools/balance-sim what-ifs | architecture: what-ifs go through the instance's row door (rowOf) and an options object, never by mutating shared data |
| X-POWER-TOOLS | 4 | HYPOTHESIS | tools/balance-sim/armor-power.mjs, weapon-power.mjs | Two guards (armor-line, weapon-line) judge gear by a closed-form "pace and safety" read built from the engine's roll helpers, not by a played hunt | speed: a played hunt per piece per ground is slow | the brief asks for the real engine. Bodies not fully read, so the size of the gap is unknown |
| X-OTHER-LEVEL-SHARE | 4 | CONFIRMED | src/core/hunt/xp-share.js:78, src/data/hunt-tuning.js:56 | The under-floor Level share cut is still live. Tyler 2026-11-08: "XP share rule applies regardless" | risk ladder 2026-11-03 | PROGRESSION LANE. A Level threshold in party XP that a ruling removed |
| X-OTHER-GROUND-FITS | 4 | CONFIRMED | src/data/balance-sheet.js:306,317 GROUND_XP_FIT, GROUND_GP_FIT, xp.floorFit, gp.line | Per-ground XP and coin multipliers on the monster formula | 2026-11-07 to 11-19 | PROGRESSION and ECONOMY LANES. They sit in the same function as the combat stats, so a combat change moves them |
<!-- END GENERATED:EXCEPTIONS -->

## 3. Dependency map

The shape in one paragraph. Two numbers sit at the root of all combat. **Hero power** (C-HERO-POWER, the largest hit) feeds every swing, every spell, every heal, every shell and every bleed. **The monster row** (C-MON-STATS) feeds every monster blow, every monster spell, the hero's hit chance, the Tower, the Catacombs, scaled hunts and bosses. Both run into one door, C-HURT. So a change to how a skill level or a weapon point becomes power moves all hero output at once, and a change to the stat formula moves all content at once. That is the property the brief asks for. The trouble is on the edges: the monster row is authored against hero HP and a measured hero career that belong to progression, and the same row carries the kill's XP and coin.

<!-- GENERATED:EDGES (tools/balance-program/formulas/combat-register.mjs --write) -->
Inside combat (67 edges, read "left feeds right"):

- P-SKILL-LEVEL -> C-HERO-POWER
- C-GEAR-WEAPON -> C-HERO-POWER
- C-WEAKNESS -> C-HERO-POWER
- C-BUFF-BONUS -> C-HERO-POWER
- C-HERO-POWER -> C-BASIC-BLOW
- C-HERO-TOHIT -> C-BASIC-BLOW
- C-CRIT -> C-BASIC-BLOW
- C-BASIC-BLOW -> C-HURT
- C-HERO-POWER -> C-SPELL-HIT
- C-HERO-POWER -> C-SPELL-HEAL
- C-HERO-POWER -> C-SPELL-SHELL
- C-HERO-POWER -> C-STATUS
- C-CAST-POWER -> C-SPELL-HIT
- C-CAST-POWER -> C-SPELL-HEAL
- C-CAST-POWER -> C-SPELL-SHELL
- C-CAST-POWER -> C-STATUS
- C-SPELL-HIT -> C-HURT
- C-STATUS -> C-HURT
- C-STATUS -> C-VULN
- C-STATUS -> C-HEAL-CUT
- C-STATUS -> C-CLOCKS
- C-VULN -> C-HURT
- C-ELEMENT-MON -> C-HURT
- C-MON-DEF -> C-HURT
- C-STANCE -> C-HURT
- C-TEMPER -> C-HURT
- C-BOSS-PHASE -> C-HURT
- C-SPELL-SHELL -> C-HURT
- C-ARMOR-CHAIN -> C-HURT
- C-RESIST-HERO -> C-ARMOR-CHAIN
- C-TEMPER -> C-ARMOR-CHAIN
- C-GEAR-ARMOR -> C-ARMOR-CHAIN
- C-HEAL-CUT -> C-SPELL-HEAL
- C-HEAL-CUT -> C-LEECH
- C-HURT -> C-LEECH
- C-TEMPER -> C-SPELL-HEAL
- C-REF-HERO -> C-MON-STATS
- C-MON-STATS -> C-MON-BLOW
- C-MON-STATS -> C-MON-TOHIT
- C-MON-STATS -> C-MON-DEF
- C-MON-STATS -> C-HERO-TOHIT
- C-MON-STATS -> C-ELEMENT-MON
- C-MON-STATS -> C-WEAKNESS
- C-TIER -> C-MON-BLOW
- C-TIER -> C-MON-TOHIT
- C-TIER -> C-ARMOR-CHAIN
- C-TIER -> C-PULL
- C-MON-STATS -> C-TIER
- C-MON-BLOW -> C-MON-SPELL
- C-MON-BLOW -> C-HURT
- C-MON-TOHIT -> C-HURT
- C-MON-SPELL -> C-HURT
- C-BOSS-PHASE -> C-MON-BLOW
- C-BOSS-PHASE -> C-MON-SPELL
- C-MON-STATS -> C-RUN-ROOM
- C-MON-STATS -> C-BOSS-ROOM
- C-TARGET -> C-HURT
- C-LEASH -> C-TARGET
- C-PULL -> C-AREA
- C-SPELL-HIT -> C-AREA
- C-JEWEL-PERKS -> C-HERO-TOHIT
- C-JEWEL-PERKS -> C-CRIT
- C-JEWEL-PERKS -> C-CAST-POWER
- C-GEAR-ARMOR -> C-MON-TOHIT
- C-GEAR-ARMOR -> C-CRIT
- C-GEAR-WEAPON -> C-HERO-TOHIT
- C-GEAR-WEAPON -> C-REF-HERO

Leaving combat:

| lane | edge | why it matters |
|---|---|---|
| progression | P-SKILL-LEVEL -> C-HERO-POWER, C-HERO-TOHIT, C-MON-TOHIT | how fast a skill level arrives decides how fast power grows. The spell rule made every cast depend on it too |
| progression | P-SKILL-CURVE -> C-REF-HERO -> C-MON-STATS | every monster's aim and evasion are written against a measured career. A skill-curve change re-authors every monster |
| progression | P-VITALS (HP 150 + 10 a Level, mana, armor weight shares) -> C-MON-STATS, C-SPELL-HEAL (Mend), C-REGEN, C-TARGET | monster blows are a share of hero HP. HP growth is the anchor of all incoming damage |
| progression | P-GEAR-LEVELS -> C-GEAR-WEAPON, C-GEAR-ARMOR | gear is worn by Level. Past tier 7 there is no gear, so combat stops scaling (section 7) |
| progression | C-MON-STATS, C-TIER -> P-KILL-XP | kill XP is priced per monster HP point on the same row. More HP is more XP a kill |
| progression | C-TIER (levelAtTier), C-MON-TOHIT -> P-DEFENSE-XP | Defense trains by the attacker's Level, which a tier multiplies |
| progression | C-HURT -> P-WEAPON-XP. C-MANA -> P-MAGIC-XP | weapon skills train on HP removed, Magic on mana spent |
| progression | C-RUN-ROOM -> P-RUN-XP (TOWER_PARTY_XP), party XP tables, the under-floor share | party XP math differs by mode (X-OTHER-LEVEL-SHARE) |
| economy | C-MON-STATS -> E-KILL-COIN | coin a kill is priced per HP point on the same row (GROUND_GP_FIT, gp.line) |
| economy | C-HURT, C-PULL, C-AREA, C-CLOCKS -> E-KILL-RATE | kills an hour is hero damage over monster HP plus walking and resting |
| economy | C-MON-BLOW, C-ARMOR-CHAIN, C-SPELL-HEAL, C-REGEN, C-LEECH -> E-SUPPLY-USE | food and drink bought is damage taken less free healing. A heal spell is food not bought |
| economy | E-RUNE-SUPPLY, BASIC_EFFECT_SHARE -> C-CAST-POWER, C-BASIC-BLOW | a store rune or arrow lands 75%. The default axe bar spends a 1 g rune a cast (X-REND-DEFAULT) |
| economy | E-TEMPER-COST -> C-TEMPER. E-JEWEL-COST -> C-JEWEL-PERKS. E-FOOD -> C-BUFF-BONUS | gold sinks buy combat percent |
| economy | C-BOSS-ROOM, C-RUN-ROOM -> fees, keys and what they pay | the modes share the monster formula and differ only in pay |
<!-- END GENERATED:EDGES -->

## 4. Architecture assessment against the seven principles

| Principle | Verdict | Evidence |
|---|---|---|
| Centralized | Mostly yes | One engine (`src/core/combat-sim.js`), and the edge imports `src/core` directly, 87 imports and no vendored copy. One damage door (`hurt`). Breaks: the hero's hit is computed from literals while the published constants are a second copy (X-POWER-LITERALS). The sheet and the engine order one blow differently (X-SHEET-ORDER). Hero HP is written three ways and one is off by a Level (X-REFHP-OFF-BY-ONE). The gear formula past tier 7 is not in the game (X-LINE-IN-TOOLS) |
| Deterministic | Yes | No `Math.random`, one seeded stream, units in id order, every draw named in the inventory. One weak point: shared data rows are left unfrozen so the simulator can edit them in place (X-MUTABLE-ROWS) |
| Data-driven | Half | Spells, statuses, boss phases, monster spells and tiers are rows. But 118 of 190 monsters are hand-typed stats (X-HAND-ROWS), damage hangs on an art tier (X-ART-TIER-SCALE), and several data values are really patches on a formula (X-PARTY-FIT-PATCHES, X-TIER-PER-GROUND, X-GENTLE-CAP) |
| Composable | Half | Statuses and shapes compose well: a new status is a row. But "takes more damage" exists twice (X-MARK-TWO-WAYS), worn modifiers stack five different ways (X-STACKING-RULES), and three roll shapes exist for one idea (X-THREE-ROLLS) |
| Scalable | No | The monster side is endless by formula. The hero side stops at tier 7 gear, rune tier V (skill 60) and a Tower table that ends at floor 300. Section 7 |
| Auditable | No | A blow can be reproduced from its seed but not explained. `hurt` returns the final number only. No event says which of its nine steps took what. The analyzer and the wiki cannot answer "why did this hit for 41". The grid measures outcomes per cell and cannot attribute them to a formula |
| Globally tunable | Half | Good knobs exist: the to-hit base, the monster blow share, HP per Level, the tier table, the armor curve. But the hero's power coefficients are not readable knobs (literals), one knob moves three things (X-TIER-TRIPLE), and a global change must also be re-fitted in up to 14 per-ground numbers (four tier overrides, six XP fits, two coin fits, two named rows) before the guards go green. The 2026-11-19 "+10% monsters" step shows it: one coefficient, then five follow-up re-fits |

**Where the simulations approximate.** The progression grid plays the real settle (its header: worker, cell, hr-accrue settle, `combat-sim.js`), which is what the brief asks for. Against the brief's sections 5 and 6 it lacks, as far as its header says: a before-and-after run of the whole matrix for one changed coefficient, a monster archetype axis, hunts longer than 2 hours a cell (the death sample runs 8), and per-formula attribution (it cannot say whether a slower cell is to-hit, HP or armor). Past Level 185 its gear is a projection. Two gear guards (`tests/armor-line.mjs`, the weapon line's) judge on a closed-form read, not a played hunt (X-POWER-TOOLS, a hypothesis). The client reads the same pure functions for its words (`src/shell/cast-facts.js`, `monster-facts.js`, `wiki-model.js`, `upgrade-plan.js`) and holds no copy of a formula. Whether every input it hands them is the server's projection was not traced here: a hypothesis for the synthesis lane.

## 5. Proposed combat model

Nine mechanics. None is new. Each exists today in a messier form, and each replaces several rows of section 2.

1. **Power.** One number per unit: the largest hit. Hero: `K_SKILL x skill + K_GEAR x weapon damage + K_BASE`. Monster: a share of a same-Level hero's HP. Everything a unit does is a share of its Power. The coefficients are named constants the engine reads. Removes X-POWER-LITERALS, X-ART-TIER-SCALE, X-SCALE-TWINS.
2. **Rating against rating.** The to-hit ratio as built. Keep.
3. **One amount pipeline.** Every amount (swing, spell hit, tick, monster blow, monster spell, heal, shell) is `roll(Power x share) x the product of its modifiers`, multiplied in permille and floored once, with a fixed stage order: source (version, supply share, surge or crit, stance), target vulnerability (element, statuses), target mitigation (monster defence, or the armor chain), shell, HP. The roll's spread is one field per kind of amount. Each blow emits a short trace of its stages for the analyzer. Removes X-ROLL-TWINS, X-FLOOR-CHAIN, X-SHEET-ORDER, X-MARK-TWO-WAYS and makes combat auditable. X-THREE-ROLLS becomes three rows of one rule.
4. **The armor chain.** As ruled (K7), read against the monster's own Level. Removes X-TIER-TRIPLE.
5. **The monster formula.** `formulaStats(Level, role, encounter type)` writes every monster. Hand rows get roles. A named exception is a row with a reason. The boss cap bounds the spell, so the Rat King is a formula row. Removes X-HAND-ROWS and both named rows.
6. **One tier table.** Pull, damage, HP and XP, the same on every ground. A ground differs by what it fields, never by its dials. The per-ground rows go once kill XP is priced correctly (progression lane). Removes X-TIER-PER-GROUND.
7. **The gear curve.** One formula in `src/data` for what a weapon or an armor piece of a given Level carries, covering tiers 1 to 7 and every Level after. The hand tables become its samples. A unique spends a budget from that curve at published exchange rates (section 6.1). Removes X-LINE-IN-TOOLS, X-ARMOR-LINE-FIT, and the Level 111 break.
8. **One modifier table.** Each worn or cast modifier is a key with a combine rule (sum or largest) and a cap. Removes X-STACKING-RULES, X-STEADY-TWO-MEANINGS, X-DEFB-TWO-JOBS, X-SET-CRIT.
9. **Sustain.** Two heal kinds only, both in data: a share of Power, or a share of max HP. Regeneration stays a percent of max.

**The global knobs, and what each moves.**

| Knob | Today | Moves |
|---|---|---|
| K_SKILL, K_GEAR, K_BASE | 0.35, 0.6, 2 (literals) | all hero damage, heals, shells and bleeds, kill speed, and how much a skill level is worth against a gear step |
| TO_HIT.base | 20 | how much one point of skill or Defense is worth at low Level |
| STAT_FORMULA.heroHit, hit.hi | 0.85, 0.70 | every hero's and every monster's hit chance at equal Level |
| STAT_FORMULA.blow.hi | 0.22 of hero HP | all incoming damage, food bought, deaths |
| STAT_FORMULA.hp | 4.95 + 1.76 a Level | kill time everywhere, and through it XP and coin a kill |
| STAT_FORMULA.def, the 0.03 cut | 0.08 a Level, 3% a point | small hits against big ones (bleeds, area spells, multi-hit) |
| The gear curve's slope | none past tier 7 (staged: Level / 110) | whether hero power and armor keep pace with Level, forever |
| ARMOUR_MITIGATION k and cap | 0.4, 0.62, 60% | what armor is worth and when a set falls behind |
| The roll spread | swings 1 to max, spells half to full | variance, close calls, the feel of a hit |
| TIER_DIALS | 1170 / 1330 damage, 1100 / 1150 HP | the price of Dangerous and Deadly on every ground |
| The version ladder | +10% a rune tier, ends at 60 | what a rune tier is worth |
| critMult, critCap | 1.5, 60% | the ceiling of crit builds |
| Mana and HP regen | 25% a minute, 0.3% a second | casts an hour, drink bought, downtime |

## 6. The two open items

### 6.1 The armor-line guard (tests/armor-line.mjs, AL3)

**What is red.** I ran it: exit 1, six lines, each a staged unique between 0.07% and 0.60% over the line (the Breastplate twice, the Leg Plates, the Visor, the Watchman's Helm, the Limewashed Plate). I did not re-fit them.

**Is a piece's armor a formula or hand-written?** Both, in layers.

- Tiers 1 to 7 are a hand table of plate points per slot (`src/data/gear-tiers.js:64-69`) times a line multiplier, 1.00 plate, 0.55 leather, 0.30 cloth. A table plus a multiplier, generated into items. Class 2.
- Past tier 7 the LINE is a formula: Dawnsteel's points x max(1, Level / 110) (`tools/balance-sim/staged/armor-line.js:64-70`). Class 1, in the wrong folder.
- Each unique's own armor number is hand-written. And it was not derived from the line by arithmetic. It was sized by running the measure and taking "the most armor that keeps its trade under the line" (the file's own words). The Visor is 70 where 71 reads 1.0005. Class 4: a content value solved against the simulator at the fourth digit.

**Why it went red.** The guard's score is the mean of two measured ratios, pace and safety, read through the engine's roll helpers. Safety is damage taken, and that depends on how often monsters hit. The to-hit lane changed how often they hit, so every safety ratio moved by a few tenths of a percent. Nothing is wrong with the pieces or the engine. The pieces were authored with zero headroom against a number that every combat change moves. It will go red again on the next engine batch.

**The formula-layer fix.** A unique's budget should be arithmetic on its stats, not a simulation result.

1. Move the line formula into `src/data` as the gear curve (model item 7).
2. Publish exchange rates as coefficients: how many armor points one point of weapon accuracy, weapon damage, crit or resistance costs, per armor weight. Derive each rate once from the engine, at the anchor, and pin it.
3. A unique's armor is then `line armor x (1 - the summed price of its other stats)`, written by a generator. Its trade is exact by construction.
4. AL3 keeps its measurement, but as a check that the exchange rates are still honest, with a stated tolerance of the measure's own resolution (about 1%), and a red there means "re-derive a rate", one coefficient, never "re-size six items".

Layer: formula (the curve), then coefficient (the rates). No content value is hand-fitted again. Until that is built the guard is honestly red, and the honest state for the lane that owns it is red with this reason, not a re-fit.

### 6.2 The six spell design calls

| Call | What was built | Class | Where it goes |
|---|---|---|---|
| 1. The beginner's floor | every cast lands max(its share, its old version-I number) | 3 (X-SPELL-FLOOR) | Conflicts 1. It is a real max() exception. Your 32-8 words ask for its effect, not for this shape. A floor on Power itself would be one number, not one per row |
| 2. Rend on the default axe bar | the default two-axe bar casts Rend on a 1 g rune | 2 (X-REND-DEFAULT) | content. Listed for the economy lane: a default bar that spends gold every cast |
| 3. Turning Cut unlocks at Melee 10 | the axes and the hammer lost their area move for Levels 1 to 9 | 2 (X-TURNING-CUT-10) | Conflicts 7. A per-weapon unlock is a data field |
| 4. The version ladder is x1.4, not x1.6 | +10% a rune tier | 2 (X-VERSION-LADDER) | Conflicts 5. The bigger question is that the ladder ends at skill 60 |
| 5. Heals and shells land whole | hits roll half to full, heals do not roll | 3 (X-THREE-ROLLS) | Conflicts 6. In the proposed model it is one roll rule with a spread per kind |
| 6. The dark rows were converted, not sized | Brand, Reave, Updraft, Blight, the fist strikes | 2 (X-DARK-ROWS) | content, owed by L43 and L44. Not a formula question |

## 7. Scalability

Method. `node tools/balance-program/formulas/combat-probe.mjs` calls the game's own functions (the roll builder, the armor chain, the vitals, the stat formula, the reference hero, the spell amounts) at each Level. It is one blow at a time, not a hunt: it shows what each formula returns, which is what a scaling audit needs. The hero is the reference hero (the measured lone hammer) in full plate with a warhammer, against a same-Level `regular` on a full ground. Two gear cases, because the game has no item past tier 7: FROZEN (tier 7 forever, the game as built) and LINE (the staged formula, Dawnsteel x Level / 110, PROJECTED and not in the game). Under Level 90 gear is scaled by Level / 90, a simplification that is labelled in the probe. Party and solo divergence cannot be read from a single blow and is not claimed here.

**The monster side** grows in a straight line and is sound to Level 5,000: HP 199 at Level 110, 709 at 400, 8,805 at 5,000. Its largest blow stays 22% of a same-Level hero's base HP at every Level.

**The hero, FROZEN on tier 7 (the game as built).**

| Level | Largest hit | Swings to kill a regular | An elite | Plate absorb | A monster's top blow, % of max HP | Deadly box, % of max HP a second | Greater Mend V, % of max HP | Elite defence, % of a mean hit |
|---|---|---|---|---|---|---|---|---|
| 60 | 50 | 5.1 | 8.9 | 60% | 7.1 | 13.4 | 23.3 | 0 |
| 110 | 71 | 6.5 | 11.7 | 60% | 6.9 | 13.1 | 19.8 | 2.8 |
| 185 | 77 | 10.0 | 18.0 | 53% | 8.0 | 15.1 | 13.4 | 2.6 |
| 400 | 87 | 18.9 | 35.6 | 40% | 10.4 | 19.4 | 7.3 | 6.8 |
| 1,000 | 101 | 42.4 | 86.9 | 23% | 13.2 | 24.6 | 3.5 | 17.6 |
| 2,000 | 119 | 74.0 | 177.5 | 14% | 14.8 | 27.6 | 2.0 | 31.7 |
| 5,000 | 174 | 137.2 | 460.1 | 6% | 16.1 | 30.0 | 1.2 | 54.9 |

**The hero ON THE LINE (PROJECTED).**

| Level | Largest hit | Skill's share of the hit | Hero hit chance | Swings to kill a regular | Plate absorb | Deadly box, % of max HP a second | Greater Mend V, % of max HP |
|---|---|---|---|---|---|---|---|
| 110 | 71 | 40% | 85.1% | 6.5 | 60% | 13.1 | 19.8 |
| 185 | 105 | 33% | 86.8% | 7.2 | 60% | 12.9 | 18.2 |
| 400 | 195 | 23% | 89.8% | 8.1 | 60% | 12.9 | 16.3 |
| 1,000 | 431 | 14% | 93.1% | 8.9 | 60% | 12.9 | 14.7 |
| 2,000 | 820 | 9% | 95.1% | 9.1 | 60% | 12.8 | 14.1 |
| 5,000 | 1,987 | 7% | 96.5% | 9.3 | 60% | 12.8 | 13.7 |

**Each risk on the brief's list.**

| Risk | Verdict | Level and mechanism |
|---|---|---|
| Monster HP outgrowing player power | YES, on the game as built | From Level 111. HP is linear in Level. The hit is 0.35 x skill + 0.6 x weapon, the weapon stops at tier 7 and skill grows slowly (82 at 110, 129 at 400). Kill time +54% by 185, x2.9 by 400. CONFIRMED on the real functions |
| Equipment upgrades going meaningless | YES, both ways | As built there are no upgrades past 90. On the line the opposite: gear is 93% of the hit by Level 5,000 and a skill level is noise. The two terms must grow at related rates. CONFIRMED |
| Defense becoming too powerful | NO. It becomes too weak | Armor is read against the attacker's Level, so a fixed set fades: plate 60% at 110, 40% at 400, 6% at 5,000. On the line it sits at the 60% cap forever, which makes the cap, not the gear, the real number. Elite monster defence does the reverse to a frozen hero: it eats 55% of a mean hit at 5,000. CONFIRMED |
| Healing outpacing damage | NO. It falls behind | A heal is a share of the hit and HP is linear, so Greater Mend V goes from 20% of max HP at 110 to 7% at 400 as built. On the line it holds near 14 to 18%. Mend (11% of max HP) and regeneration are percent of max and never drift. Food is fixed sizes, so it falls behind HP too: economy lane |
| Runaway damage | NO for heroes. YES in the Tower | Hero output is linear at best. The Tower's heat compounds: x10.9 at floor 300. Already ruled out by Tyler, still in the data |
| Crit or leech dominance | NO | Crit chance caps at 60% and x1.5, so +30% damage at most, and only on basic hits. Leech is one spell at 30% of its own hit, about 1% of max HP a cast. By analysis |
| Hit chance | DRIFTS on the line | Monster evasion is written against a reference hero whose worn accuracy stops at 32. Gear accuracy on the line keeps climbing, so 85% becomes 90% at 400 and 95% at 2,000 and meets the 97% rail past 5,000. The reference must read the gear curve. CONFIRMED |
| Spell progression | STOPS at skill 60 | The last rune tier. After it a spell grows only with the hit. Not harmful, but one whole progression axis is finished in the first 5% of the Level range |
| Solo and party diverging | NOT MEASURED HERE (42 played it: no divergence on Normal, section 10) | Needs the grid past 185 on a real gear curve. HYPOTHESIS: the Deadly box deals 13% of a tank's max HP a second at the armor cap at every Level on the line, so the need for a healer is constant, and as built it rises to 30% |
| XP and inflation | other lanes | Kill XP and coin are priced per monster HP point on the same row, so the HP knob moves both |

**The one sentence.** The monster half of combat is ready for endless Levels and the hero half is not: it needs the gear curve, and the gear curve and the skill term need to be sized together so neither one swallows the other.

## 8. Conflicts for Tyler

Each one is an approved decision against a clean formula. Both sides are stated. None is resolved here.

1. **The spell floor.** Approved: 32-8, "heals and first strikes are not cut in half" in the first hours. Built as a second number on every spell row and a max(). Clean alternative: no per-row floor, and the early Level curve and early drop rows re-cut to the slower first hours (the lane measured Level 10 at 7.2 h against your 6). Middle path: one floor on Power (a cast never reads a hit under one stated number), one number in place of one per row. **Your call: keep the per-row floor as an approved exception, take the one-number floor, or re-cut the first hours.**
2. **Spells and the hit stats.** A spell is a share of the hit but skips miss, crit and the +20% weapon weakness. Clean: a spell is a blow, so it reads all three, and every spell row is re-sized once. Other side: "a spell never misses" is a plain, likeable rule and may be what you want. **Your call: spells stay sure and flat, or spells are blows.**
3. **Gear past tier 7.** Approved 2026-11-14 and 11-16: past tier 7 every piece is a named unique with its own stat mix, and a line is a budget. Clean formula: a gear curve in the game that every piece, unique or not, is priced against. These fit together only if the budget is arithmetic (section 6.1). **Your call: approve the gear curve as a formula in the game, with uniques as spends of it at published rates.**
4. **Skill against gear.** Not ruled anywhere. On any gear curve that keeps pace with monsters, the skill level's share of a hit shrinks toward nothing unless the skill term also scales. Your 11-05 words say trained skills are the point of the classless design. **Your call: what share of a hero's hit should come from the trained skill at Level 400 and beyond.**
5. **The rune ladder.** Approved 10-23: five tiers at skill 1, 15, 30, 45, 60. Built at +10% a tier where the plan said +15%. And it ends at 60 on an endless game. **Your call: 10% or 15%, and whether rune tiers continue past 60.**
6. **Three ways to roll.** Swings roll 1 to max. Spell hits roll half to full. Heals do not roll. Clean: one rule, with the spread as a number per kind. **Your call: is "heals are always the same number" a rule you want (the lane's Call 5), and should swings keep their wide roll.**
7. **Turning Cut at Melee 10.** Approved 11-19: the sword speeds up once its area strike comes online. Side effect of the merge: axes and hammers lost their Level 1 area move (lone hammer 24% slower at the Thicket). **Your call: Turning Cut from Level 1 for weapons without a shield, 10 for the sword.**
8. **Per-ground tier dials and the pull rule.** Approved 11-07: "Dangerous and Deadly keep the bigger pulls", and one tier table. Built: four grounds with their own dials and no bigger pulls under ground Level 16. Clean: one table, and the XP problem that caused them fixed where XP is priced. **Your call: confirm the per-ground dials are to be removed once the XP side is fixed, and whether the first three grounds get bigger pulls.**
9. **Party grounds as a different formula.** The party fit (HP x2.5, blow x0.75) is a fair encounter type. Its three inner patches are not. **Your call: confirm "built for a party" stays a monster attribute.**
10. **The danger ramp and the boss cap.** Two designer rules that change combat math by ground Level: grounds under Level 16 are gentler, and a boss's hit is held to a third of the floor hero's HP. Neither was ruled by you. Both look right. **Your call: a yes on each makes them documented class 3 rules.**
11. **The Tower past floor 300 and scaled hunts without Deadly.** Two content caps on modes that are meant to be endless or flexible. **Your call with those modes' cards.**

## 9. What was and was not verified

Verified by running: `tests/armor-line.mjs` (exit 1, the six lines above). The probe, the roster count (190 rows, 72 on a roster, 70 equal to the formula, 2 named) and the tier read, all on the game's own functions. Read in full: `src/core/combat.js`, `mitigation.js`, `elements.js`, `vitals.js`, `hunt/damage.js`, `hunt/abilities.js`, `hunt/heal-cut.js`, `hunt/boss-phases.js`, `hunt/boss-room.js`, `src/data/to-hit.js`, `hunt-tiers.js`, `hunt-tuning.js`, the formula half of `balance-sheet.js` and the rule halves of `abilities.js`, `statuses.js`, `runes.js`. Read by header and by search for their numbers only: `combat-sim.js`, `member.js`, `temper.js`, `bane.js`, `charms.js`, `buffs.js`, `perks.js`, `hunt/status.js`, `monster-spells.js`, `tower.js`, `targeting.js`, `leash.js`, `shooters.js`, `pull-cycle.js`, `consumables.js`, `training.js`, `scaled-hunts.js`, `gear-tiers.js`, the boss data files. Not read: `hunt/roles.js`, `conditions.js`, `shapes.js`, `marks.js`, `movement.js` (positioning, no amount is computed there as far as their callers show), and the individual spell, monster-spell and item rows beyond the ones quoted. A formula hiding in one of those would be missing from the inventory. Not verified: no hunt was played, so no XP, gold or death number here is new. The nine hypotheses are marked in the table. No game code, data, test or migration was changed.

The register is `tools/balance-program/formulas/formulas-combat.json` (the Coordinator's name for it). A bare `combat.json` shares its stem with `src/core/combat.js`, and `tools/lib/guard-deps.mjs` would have mapped every edit of it to 97 combat guards. With this name `node tools/guards-for.local.mjs` maps none.

Reproduce: `node tools/balance-program/formulas/combat-probe.mjs`, `roster-drift.mjs`, `tier-read.mjs`, `why.mjs <symbol>`, and `combat-register.mjs --check`.

## 10. Overlaps with the other two audits

Read after both were merged on the set (139747976). Where a finding is in two docs it is listed here once, with the lane that should own the fix. The dedupe lane decides.

| Finding | Here | There | Who should own it |
|---|---|---|---|
| The largest hit is computed from literals, the named constants are unread | C-HERO-POWER, X-POWER-LITERALS | 42: P13, X23, model M7 | combat owns the expression. Progression owns what a skill level is worth (Conflicts 4) |
| The art-tier damage scale | X-ART-TIER-SCALE, X-SCALE-TWINS | 42: X22, handed to combat | combat |
| The spell rule, Mend, the beginner's floor | C-SPELL-HIT, C-SPELL-HEAL, X-MEND-MAXHP, X-SPELL-FLOOR | 42: P14, X39, X40. Magic XP multipliers X48 stay there | combat for what a cast lands. Progression for what it trains |
| The reference hero | C-REF-HERO | 42: P36, X42, model M2 | progression computes it. Combat reads it. 42 found that past Level 1,000 its straight line reads Melee 375 at 5,000 where the skill curve allows about 248. My probe uses that same table, so its FROZEN rows past 1,000 are too kind to the hero and the real break is earlier. The LINE rows barely move, since gear is 90% of the hit there |
| Power against monsters at high Level | section 7, one blow at a time on the pure functions | 42 section 7.2, PLAYED on the real engine | the two agree. 42 measured a lone hero on today's gear at 0.91 of the pace at 400 and dying at 1,000. My probe says kill time x2.9 at 400 and x6.5 at 1,000. The played numbers are the ones to quote |
| Solo and party at high Level | not measured here | 42: a four on Normal earns 0.70 to 0.74 of a lone hero from 200 to 5,000, no divergence | progression. It closes the "not measured" row of my section 7 for Normal |
| Tier dials | C-TIER, X-TIER-PER-GROUND, X-TIER-PULL-FLOOR, X-TIER-TRIPLE | 42: P24. 43: E04, X07, X08 | one table, three readers. Combat owns the damage and Level half, progression the XP dial, economy the pull as kill rate |
| Monster HP | C-MON-STATS | 43: E02, E14, E23 (XP and coin are per HP point) | combat owns the HP line. A change to it is an XP and coin change the same day |
| Supplies a fight | C-MON-BLOW, C-ARMOR-CHAIN, C-SPELL-HEAL, C-REGEN, C-LEECH, X-CASTER-BASIC | 43: E18, E19, E20 | economy owns the bill. Combat owns damage taken less free healing. Dry ammo x0.25 (`src/core/ammo.js`) is in 43 and is missing from my inventory: it is a combat multiplier on a ranged hit and belongs in C-BASIC-BLOW |
| The danger ramp into coin | X-DANGER-RAMP | 43: the ramp feeds a party ground's coin dial | combat owns the ramp. Economy should not read it |
| Tempering and lining effects | C-TEMPER, C-RESIST-HERO, C-LEECH | 43: E38, E55 | economy prices them. Combat lands them |

**The Deadly hypothesis from 42.** 42 found, on one played hour a cell, that a lone MID hammer dies on Deadly at every Level from 200 up while a mixed four on the line never died, so Deadly may be free double XP for a four. It stays a HYPOTHESIS here. What the formulas say: the Deadly box is 8 monsters at x1.33, and on the pure functions it deals about 13% of the holder's max HP a second with plate at its 60% cap (section 7). A lone hero's free healing is Mend, 11% of max HP every 6 s, plus 0.3 to 0.6% a second of regeneration, about 2.4% a second in all, so it lives on food and on killing the box before the food lane (2 s) falls behind. A four has a second and third heal lane on the same target, shells that take blows before HP, and area hits that land the full roll on all 8 at once, so the box dies several times faster while the damage still arrives on one hero. Nothing in a tier scales with party size since 2026-11-08 (one difficulty for every group), so the formula gives a four its safety for free by construction. That is the mechanism. Whether it is a problem is a ruling question, because Tyler's 2026-11-16 line is that Normal is not meant for parties and a Deadly four may earn up to 2.5 times the contract (42 measured 1.95 to 2.22). What would settle it: the grid's death sample (4 seeds x 8 h) on Deadly for a lone hero and a four at 200, 400 and 1,000 on the line, read against 50-standards' flat death count for Deadly.

