#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/formulas/combat-register.mjs — THE COMBAT FORMULA AND EXCEPTION REGISTERS (balance program 41, Tyler's
// formula-driven brief 40-formula-brief.md §8 items 1-3), the ONE place they are written.
//
//   node tools/balance-program/formulas/combat-register.mjs            counts, and any row that is malformed
//   node tools/balance-program/formulas/combat-register.mjs --write    writes tools/balance-program/formulas/formulas-combat.json and the three
//                                                                       generated tables inside docs/design/balance-program/41-formulas-combat.md
//                                                                       (between its GENERATED markers; the prose around them is hand-written)
//   node tools/balance-program/formulas/combat-register.mjs --check    exit 1 when formulas-combat.json or the doc's tables are not what this file writes
//                                                                       (compared as text: an LF and a CRLF checkout read the same)
//   node tools/balance-program/formulas/combat-register.mjs --selftest plants CRLF and changed rows on in-memory texts: CRLF alone must read in
//                                                                       step, a changed row or value must still read STALE; exit 1 when a case fails
//
// READ-ONLY toward the game: it imports nothing from src/ and changes no game file. A row is evidence a person read (file:line at
// set/v0.2.144 e6ea19170), so a line number can go stale: the id and the symbol name are the durable half.
// CLASS: 1 foundational mechanic · 2 content parameter (belongs in data) · 3 intentional special mechanic (needs Tyler's explicit yes)
//        · 4 accidental complexity (eliminate). STATUS: C confirmed (the code path was read, and measured where it says so) · H hypothesis.
// mutant-anchors: none — --selftest plants CRLF and changed rows on in-memory texts; no tracked file is patched
// ci-step: economy-selftests | Combat formula register - a CRLF checkout reads in step, a changed row or value reads STALE
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/formulas/combat-register.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const JSON_FILE = join(HERE, 'formulas-combat.json');
const DOC_FILE = join(ROOT, 'docs', 'design', 'balance-program', '41-formulas-combat.md');

const F = (id, computes, impl, params, deps, consumers, random) => ({ id, computes, impl, params, deps, consumers, random });
const D = 'deterministic';

export const FORMULAS = [
  // ── a hero's blow ──
  F('C-HERO-POWER', "A hero's largest blow (maxHit): floor(0.35 x (weapon skill + worn +skill) + 0.6 x summed damage bonus + 2), then x the weakness factor, then x (1 + damage buff). Never under 1",
    ['src/core/combat.js:358-426 playerCombatRolls', 'src/core/member.js:136 heroSnapshot (the unit\'s maxHit)'],
    'literals 0.35 / 0.6 / 2 at combat.js:391. COMBAT_BALANCE.strengthLevelScale / strengthBonusScale / playerBaseMaxHit (combat.js:38-40) hold the same numbers but the engine never reads them',
    ['P-SKILL-LEVEL (progression)', 'C-GEAR-WEAPON', 'C-WEAKNESS', 'C-BUFF-BONUS'], ['C-BASIC-BLOW', 'C-SPELL-HIT', 'C-SPELL-HEAL', 'C-SPELL-SHELL', 'C-STATUS-TICK', 'character sheet (hr-accrue/character-sheet.js:114)', 'wiki (src/shell/wiki-model.js:117-126)', 'upgrade plan (src/shell/upgrade-plan.js:161)'], D),
  F('C-HERO-TOHIT', "A hero's chance to land a basic blow: ratio(20 + skill + worn accuracy, the monster's evasion) x 1.15 on a weak-weapon match, held to 5%..97%. Steady then turns a share of the misses into hits",
    ['src/core/combat.js:384-389', 'src/data/to-hit.js:134-140 toHitRatio, heldToHit'], 'TO_HIT { base 20, min 0.05, max 0.97 } (to-hit.js:117). WEAKNESS_BONUS.accuracy 1.15 (combat.js:31)',
    ['P-SKILL-LEVEL (progression)', 'C-GEAR-WEAPON', 'C-MON-STATS', 'C-WEAKNESS', 'C-JEWEL-PERKS'], ['C-BASIC-BLOW', 'character sheet', 'wiki'], 'one chance draw a swing (rollAttack)'),
  F('C-BASIC-BLOW', 'One basic blow: miss is 0, a hit is a whole number 1..maxHit with equal odds (mean (maxHit + 1) / 2)',
    ['src/core/combat.js:482-485 rollAttack', 'src/core/hunt/damage.js:215-223 roll', 'src/core/hunt/damage.js:305-316 blow'], 'none of its own',
    ['C-HERO-POWER', 'C-HERO-TOHIT', 'C-CRIT', 'C-HURT'], ['C-HURT', 'E-KILL-RATE (economy)', 'P-WEAPON-XP (progression)'], 'the hunt seed stream: chance, then int'),
  F('C-CRIT', 'Critical basic blows: chance = clamp(gear critB + crit buff + set bonus + Keen, 0, 0.60). A crit is max(damage + 1, floor(damage x 1.5)). The set bonus is 1% a tier for 5+ armor pieces of one tier and line',
    ['src/core/combat.js:428-432', 'src/core/combat.js:488-494 rollCrit, applyCrit', 'src/core/combat.js:252-270 armorSetBonus'], 'COMBAT_BALANCE.critMult 1.5, critCap 0.60 (combat.js:64-65). Leather critB 0.004 x tier a piece (gear-tiers.js:215)',
    ['C-GEAR-ARMOR', 'C-JEWEL-PERKS', 'C-BUFF-BONUS'], ['C-BASIC-BLOW'], 'one chance draw on a landed hero blow with a chance above 0'),
  F('C-WEAKNESS', 'The damage factor against one monster: weapon weakness 1.20 x bane (at most 1.40) x weapon element (at most 1.15), the product held to 1.90. A weapon match also gives x1.15 accuracy',
    ['src/core/combat.js:301-345 weaknessInfo', 'src/core/bane.js:155 baneMultFor', 'src/core/elements.js:120-123 elementMultFor'], 'WEAKNESS_BONUS (combat.js:31), MAX_BANE_MULT 1.40 (core-model.js:256), MAX_ELEMENT_MULT 1.15 and MAX_TOTAL_DAMAGE_MULT 1.90 (elements.js:56-60), MAX_COMBINED_DAMAGE_MULT 1.68 (bane.js:62, unused)',
    ['C-MON-STATS (the row\'s weaponWeak, class, elements)'], ['C-HERO-POWER', 'C-HERO-TOHIT', 'C-BASIC-BLOW'], D),
  // ── the one damage door ──
  F('C-HURT', 'Every amount that lands on a unit, in this order. On a monster: x element (a weakness at the tag\'s weakPm share) then minus the defence cut, x the cast\'s power (version, store, surge, mark), x the boss guard, x the dealer\'s stance, x the target\'s stance, at least 1, x Tempering. On a hero: x power, x stances, then the armor chain. Then the spell shell, then HP',
    ['src/core/hunt/damage.js:117-145 hurt', 'src/core/hunt/damage.js:153-192 landHit'], 'no numbers of its own. Nine floors in a row',
    ['C-ELEMENT-MON', 'C-MON-DEF', 'C-CAST-POWER', 'C-VULN', 'C-BOSS-PHASE', 'C-STANCE', 'C-ARMOR-CHAIN', 'C-TEMPER', 'C-SPELL-SHELL'], ['every kill and every death', 'E-SUPPLY-USE (economy)', 'P-DEFENSE-XP, P-WEAPON-XP (progression)', 'the analyzer tally'], 'none itself (Tempering\'s part of a point: one draw)'),
  F('C-MON-DEF', "A monster's defence: floor(def x 0.03) whole points off every blow and every tick it takes", ['src/core/combat.js:462-464 defenceReduction'],
    'COMBAT_BALANCE.monsterDefenseDamageReduction 0.03. def = 0.08 x Level x role (balance-sheet.js STAT_FORMULA.def, MONSTER_ROLES)', ['C-MON-STATS'], ['C-HURT', 'C-HERO-POWER (the sheet\'s copy)'], D),
  F('C-ELEMENT-MON', "What an element is worth on a monster: 1000 - 10 x its profile's percent, the percent held to ELEMENT_PCT. A row with weakPm lands only that share of a weakness",
    ['src/core/elements.js:71-76 elementPermille', 'src/core/hunt/damage.js:111 weakShare', 'src/core/hunt/targeting.js:53 elementOn'], 'ELEMENT_PCT bounds (src/data/elements.js). weak +15, resist 25, former immunity 50 (ruling 2026-11-06)', ['C-MON-STATS'], ['C-HURT', 'C-WEAKNESS'], D),
  F('C-VULN', 'A target that takes more: Hunter\'s Mark (unit fields markPm until markUntil) plus the strongest marking status (takenPm), added and folded into the cast\'s power',
    ['src/core/hunt/damage.js:69-76 takenPmOf', 'src/core/hunt/damage.js:166-170', 'src/core/hunt/abilities.js:411-414'], "the mark row's bonusPct and durMs (abilities.js). Sickness takenPm 100 for 6 s (statuses.js)", ['C-STATUS'], ['C-HURT'], D),
  F('C-STANCE', 'Stance: Offensive deals and takes x1.10, Defensive deals x0.90 and takes x0.85', ['src/data/rule-subjects.js:38-42 HUNT_STANCES', 'src/core/hunt/damage.js:130-131'], 'HUNT_STANCES', [], ['C-HURT'], D),
  F('C-TEMPER', 'Tempering: Blows raises what lands on a monster and every heal by rungs x the ladder\'s permille. Armor (with worn steadyPm and a food\'s steady) lowers what reaches the hero, last, never past the cap. The part of a point is a chance',
    ['src/core/temper.js:38-57', 'src/core/hunt/damage.js:137', 'src/core/mitigation.js:83'], 'src/data/temper.js ladders (1% a rung tiers 2-6, 0.4% Dawnsteel, 0.5% unique bands)', ['E-TEMPER-COST (economy)'], ['C-HURT', 'C-SPELL-HEAL', 'C-ARMOR-CHAIN'], 'one draw a blow, only for a hero holding a rung'),
  // ── casts ──
  F('C-SPELL-HIT', 'A damaging cast: each hit rolls a whole number from max(ceil(top / 2), base lo) to max(top, base hi), top = floor(maxHit x hitPm / 1000). Then C-HURT. It never misses and never crits',
    ['src/data/abilities.js:356-360 hitRange', 'src/data/abilities.js:422-425 blowShare', 'src/core/hunt/abilities.js:392-400'], 'each row\'s hitPm and base (abilities.js:159-336). ABILITY_RULES.hitLowPm 500',
    ['C-HERO-POWER', 'C-CAST-POWER', 'C-HURT'], ['E-KILL-RATE (economy)', 'cast-facts.js (the bar\'s words)'], 'one int a hit'),
  F('C-SPELL-HEAL', 'A heal: floor(max(floor(maxHit x healPm / 1000), base) x power / 1000), whole (no roll), x Tempering, less the heal cut, capped at missing HP. Mend alone: floor(maxHp x 110 / 1000) x power',
    ['src/data/abilities.js:367-376 castAmount', 'src/core/hunt/abilities.js:353-361 healOne'], 'each row\'s healPm and base. Mend healHpPm 110 (abilities.js:335)', ['C-HERO-POWER', 'P-VITALS (progression)', 'C-CAST-POWER', 'C-TEMPER', 'C-HEAL-CUT'], ['survival, E-SUPPLY-USE (economy: a heal replaces food)'], D),
  F('C-SPELL-SHELL', 'A shell: floor(max(floor(maxHit x shieldPm / 1000), base) x power / 1000), a pool that a blow spends before HP. A recast of a self shell refunds the unused part as mana. A party shell never lowers a bigger one',
    ['src/data/abilities.js:367-376', 'src/core/hunt/abilities.js:285-291 shieldRefund', 'src/core/hunt/damage.js:138-139'], 'each row\'s shieldPm and base', ['C-HERO-POWER', 'C-CAST-POWER'], ['C-HURT'], D),
  F('C-CAST-POWER', 'A cast\'s power in permille: the rune tier\'s step (1000 / 1100 / 1200 / 1300 / 1400 at skill 1 / 15 / 30 / 45 / 60) x the store\'s share for a store rune x Surge when it surges',
    ['src/data/runes.js versionStep, versionLevel', 'src/data/abilities.js:429-432 versionOf', 'src/core/hunt/abilities.js:343', 'src/core/hunt/abilities.js:490'], 'RUNE_TIERS stepPm and level. BASIC_EFFECT_SHARE (supply-basics.js). SURGE_MULT_PM (jewelry.js)',
    ['P-SKILL-LEVEL (progression: the version gate)', 'E-RUNE-SUPPLY (economy)', 'C-JEWEL-PERKS'], ['C-SPELL-HIT', 'C-SPELL-HEAL', 'C-SPELL-SHELL', 'C-STATUS'], 'Surge: one draw a cast for a wearer'),
  F('C-STATUS', 'Statuses, one generic engine: a ticking one (Bleed: scale = max(tier share, floor(maxHit x 33 x tier share / 1000)), tick = round(roll 1..3 x scale / 1000) a stack a second, 5 stacks, 6 s), a marking one (takenPm), a slowing one (Chill: clock x (1000 + slowPm) / 1000, 30% to 50% by rune tier), a heal-cutting one (Withered)',
    ['src/core/hunt/status.js:58-124', 'src/data/statuses.js', 'src/core/hunt/damage.js:95-100 slowed'], 'STATUSES rows. Bleed tierPermille [1000..1400], Chill tierPermille [1000..1667]', ['C-HERO-POWER', 'C-CAST-POWER'], ['C-HURT', 'C-VULN', 'C-HEAL-CUT', 'C-CLOCKS'], 'one int a tick for a ranged tick'),
  F('C-HEAL-CUT', 'Every heal a Withered unit takes: n - floor(n x cut / 1000). A hero 30% (less by its necrotic resistance), a monster 50%', ['src/core/hunt/heal-cut.js:26-43'], 'STATUSES.withered healCutPm (dark behind NECROTIC_STORM.live)', ['C-STATUS', 'C-RESIST-HERO'], ['C-SPELL-HEAL', 'C-LEECH', 'C-REGEN (the wraps\' own heal)', 'food (economy)'], D),
  F('C-LEECH', 'Life leech: floor(HP a hit took x leechPm / 1000) back to the caster (Reave 300). Mana back: min(mana spent, hits x manaPerHit + kills x manaPerKill). Focus: a kill returns focusPm of max mana',
    ['src/core/hunt/abilities.js:367-373 leechBack', 'src/core/hunt/abilities.js:519-524 manaBack', 'src/core/hunt/damage.js:196-201 focusBack'], 'row fields leechPm, manaPerHit, manaPerKill (abilities.js:321-327). jewel focus', ['C-HURT', 'C-HEAL-CUT'], ['survival', 'E-SUPPLY-USE (economy: drink)'], D),
  F('C-CLOCKS', 'Attack speed: every basic attack is 2,000 ms for heroes and monsters with no speed modifier. A cast locks its lane (offense 2 s, support 2 s, heal 1 s) and its own cooldown. Chill stretches a swing and a windup',
    ['src/core/combat.js:63 tickMs', 'src/data/abilities.js:111 ABILITY_LANES', 'src/core/hunt/damage.js:208 restart', 'src/core/hunt/abilities.js:482-483'], 'tickMs 2000 (ruled 2026-10-15). Lanes. Each row\'s cdMs', ['C-STATUS'], ['C-BASIC-BLOW', 'every cast', 'C-MON-SPELL'], D),
  F('C-MANA', 'Mana: regenerates 25% of max a minute x the Inner Flame rate. A caster\'s basic costs 1 mana. A cast costs its version\'s mana, never more with level',
    ['src/core/hunt/abilities.js:535-542 regenMana', 'src/data/hunt-roles.js:46-49', 'src/data/abilities.js versions'], 'ABILITY_RULES.manaRegenPctPerMin 25', ['P-VITALS (progression)', 'P-INNER-FLAME (progression)'], ['every cast', 'E-SUPPLY-USE (economy: drink)', 'P-MAGIC-XP (progression: paid per mana)'], D),
  F('C-REGEN', 'HP regeneration: 0.3% of max a second in a fight and 6% out of one, x the Inner Flame rate 1 + P / (P + 50). The fist wraps add selfHealPm a second',
    ['src/core/hunt/pull-cycle.js:305-322', 'src/core/vitals.js:72-75 regenPermille'], 'VITALS.inFightRegenPermillePerS 3 (core-model.js). HUNT_TUNING.oocRegenPermillePerS 60. FLAME_REGEN { maxPermille 1000, k 50 }', ['P-VITALS', 'P-INNER-FLAME (progression)', 'C-HEAL-CUT'], ['survival', 'E-KILL-RATE (economy: the rest between pulls)'], D),
  // ── a monster's blow and a hero's defence ──
  F('C-MON-BLOW', "A monster's largest blow: floor(atk x the art tier's scale), scale 5.4 for tiers 1-2, 4.0 for 3-4, 3.0 for 5, 2.2 for 6. It rolls 1..that like a hero's",
    ['src/core/combat.js:473-477 monsterMaxHit', 'src/core/hunt/damage.js:247-255'], 'COMBAT_BALANCE.monsterAttackDamageScale 5.4 and monsterDamageScaleByTier (combat.js:45-56), restated as balance-sheet.js:340 DAMAGE_SCALE_BY_TIER',
    ['C-MON-STATS', 'C-TIER'], ['C-HURT', 'C-MON-SPELL', 'pull-cycle.js:72 biggestBlowOn (the warning)'], 'chance, then int'),
  F('C-MON-TOHIT', "A monster's chance to land: ratio(aim, 20 + Defense + worn +Defense + guard), held to 5%..97%. Guard is the defB of gear outside the armor weights (a shield, a cape)",
    ['src/core/combat.js:443-449', 'src/core/combat.js:468-470 monsterAccuracy', 'src/core/combat.js:181 guardB'], 'TO_HIT', ['C-MON-STATS', 'C-TIER', 'P-SKILL-LEVEL (progression: Defense)', 'C-GEAR-ARMOR'], ['C-HURT', 'P-DEFENSE-XP (progression)'], 'one chance draw'),
  F('C-ARMOR-CHAIN', 'What armor does to a landed blow, in fixed order: dodge (medium) = floor(650 x P / (P + 0.4 x L)), absorb (heavy) = floor(750 x P / (P + 0.62 x L)), the resistance, ward (light) = floor(P x 1.5) flat, Tempering, and never more than 60% in all. L is the ATTACKER\'s Level, with the tier\'s dial on it',
    ['src/core/mitigation.js:44-87', 'src/core/hunt/damage.js:107-108 armourVs', 'src/core/hunt/damage.js:158-162 the dodge roll'], 'ARMOUR_MITIGATION (core-model.js:168-173). ARMOUR_WEIGHT',
    ['C-GEAR-ARMOR', 'C-MON-STATS (its Level)', 'C-TIER (levelAtTier)', 'C-RESIST-HERO', 'C-TEMPER'], ['C-HURT', 'character sheet (hr-accrue/character-sheet.js:93)'], 'dodge: one chance draw for a medium wearer'),
  F('C-RESIST-HERO', "A hero's resistance: taken = 1000 - min(cap, summed worn resistPm), cap 40% an element and 10% physical. Storm also burns mana for half the HP it took. Necrotic lands Withered",
    ['src/core/elements.js:87-111', 'src/core/combat.js:219-229 resistOf', 'src/core/hunt/damage.js:178-184'], 'HERO_RESIST_PM and ELEMENT_ON_HERO (src/data/elements.js)', ['C-GEAR-ARMOR'], ['C-ARMOR-CHAIN', 'C-HEAL-CUT'], D),
  // ── monsters ──
  F('C-MON-STATS', 'A monster row from its Level, role, ground floor and fit: HP = (4.95 + 1.76 x L) x role x fit, blow = a share (13.2% to 22%) of a same-Level hero\'s base HP, aim and evasion from the reference hero (lands 70%, is landed on 85%), def = 0.08 x L x role',
    ['src/data/balance-sheet.js:351-386 formulaStats', 'src/data/balance-sheet.js:128-195 STAT_FORMULA', 'src/data/balance-sheet.js:205-219 MONSTER_ROLES', 'tools/gen-ground-stats.mjs (writes the rows)'],
    'STAT_FORMULA { ramp 8..16, hit 0.40..0.70, heroHit 0.85, blow 0.132..0.22, gentleCap 0.11, hp, def, fit.party }. MONSTER_ROLES', ['C-REF-HERO', 'P-VITALS (progression: refHp)'],
    ['C-MON-BLOW', 'C-MON-TOHIT', 'C-MON-DEF', 'C-HERO-TOHIT', 'C-RUN-ROOM', 'C-SCALED', 'P-KILL-XP (progression: xp is on the same row)', 'E-KILL-COIN (economy: gp is on the same row)'], D),
  F('C-REF-HERO', 'The reference hero a monster is written against: a measured career (the lone hammer) [Level, skill, Defense, worn accuracy] every 5 Levels to 100, sparser to 1,000, straight past it. aimFor and evasionFor invert the ratio',
    ['src/data/to-hit.js:120-168', 'tools/gen-ref-hero.mjs (generates the table)'], 'REF_HERO (generated). Worn accuracy stops at 32 from Level 90', ['P-SKILL-CURVE (progression)', 'C-GEAR-WEAPON'], ['C-MON-STATS', 'C-TIER (raisedHit)'], D),
  F('C-TIER', 'Normal, Dangerous, Deadly: a pull size and three dials. dmgPm multiplies atk, aim AND the monster\'s Level as armor reads it. hpPm its HP. xpPm its kill XP. On a gentle ground the tier first takes back the ground\'s kindness, so its dmgPm is solved per floor',
    ['src/data/balance-sheet.js:426-485 TIER_DIALS, tierRowFor', 'src/data/hunt-tiers.js:122-131 levelAtTier, atTier', 'src/data/balance-sheet.js:437-461 the per-ground overrides'],
    'TIER_DIALS { dangerous: pull 8, lift 0.8, 1170 / 1100 / 1100. deadly: pull 8, lift 1, 1330 / 1150 / 1250 }. TIER_PULL_FROM_FLOOR 16. Four grounds carry their own dials',
    ['C-MON-STATS'], ['C-MON-BLOW', 'C-MON-TOHIT', 'C-ARMOR-CHAIN', 'E-KILL-RATE (economy: the pull)', 'P-KILL-XP, P-DEFENSE-XP (progression)'], D),
  F('C-MON-SPELL', "A monster's spell: it rolls from half to all of floor(its largest blow x hitPm / 1000), then the hero's armor as any blow. A worn shield takes 30% off a marked spell. A mend puts the same roll back on a packmate. The first cast waits a random share of the cooldown",
    ['src/data/monster-spells.js:57-102', 'src/core/hunt/monster-spells.js:130-200'], 'each spell row. SPELL_ROLL.lowPm 500. SHIELD_BRACE.markedPm 300. FAIR_WARNING. SPELL_STAGGER.spanPm 1000', ['C-MON-BLOW', 'C-ARMOR-CHAIN', 'C-RESIST-HERO', 'C-HEAL-CUT'], ['C-HURT', 'P-DEFENSE-XP (progression)'], 'int a hit. The stagger draw'),
  F('C-BOSS-PHASE', 'A boss\'s two lines on his HP: adds arrive at addsPm and he takes only guardPm of every blow while one stands. Under enragePm his atk and aim are x enrageAtkPm, and one named spell\'s cooldown is x cdPm',
    ['src/core/hunt/boss-phases.js:38-89'], 'each boss row\'s phases (monsters.js:830,845. grounds/krells_hold/pack.js:350,360. grounds/muster_barrows/pack.js:178)', ['C-MON-STATS'], ['C-HURT', 'C-MON-BLOW', 'C-MON-TOHIT', 'C-MON-SPELL'], D),
  F('C-BOSS-ROOM', 'A boss room: one fight, a time limit, his kill ends it, nothing resets. A called room pays nothing. A keyed hall pays as a ground. A boss is the formula\'s boss role: HP x5, blow x1.1 held to 33% of the FLOOR hero\'s HP',
    ['src/core/hunt/boss-room.js:21-32', 'src/data/boss-calls.js', 'src/data/boss-halls.js', 'src/data/balance-sheet.js:218 the boss role'], 'BOSS_CALL_RULES.limitMs 10 min. BOSS_HALL_RULES. MONSTER_ROLES.boss.floorCap 0.33', ['C-MON-STATS', 'C-BOSS-PHASE'], ['E-BOSS-PAY (economy)'], D),
  F('C-RUN-ROOM', 'A Burning Tower floor or a Catacomb room F: 5 monsters, each the stat formula at Level F on a floor-F ground, a Keeper (boss role) every 10th. Past floor 100 every blow is x1.012 a floor, compounding. Floor 300 is the last row',
    ['src/core/hunt/tower.js', 'src/data/tower.js:49-60', 'src/data/tower.js:114-124'], 'TOWER_RULES / CATACOMB_RULES { roomSize 5, landingEvery 10, floorTop 300, heat { from 100, perFloorPm 12 }, limits 3 and 10 min }', ['C-MON-STATS'], ['P-RUN-XP (progression: TOWER_PARTY_XP)', 'E-RUN-KEYS (economy)'], D + ' (rooms are picked by number, no dice)'),
  F('C-SCALED', 'A scaled hunt: the same formula with the ground\'s floor moved to the leader\'s Level and every monster up by the same gap. Normal and Dangerous only', ['src/data/scaled-hunts.js:159-190'],
    'SCALED_HUNTS { xpPm 730, partyPm 700, coinPm, tiers }. SCALE_EXCEPTIONS (the Thicket at half danger)', ['C-MON-STATS', 'C-TIER'], ['P-KILL-XP (progression)', 'E-SCALED-FEE (economy)'], D),
  // ── who hits whom ──
  F('C-TARGET', 'Aggro is rules, not threat numbers: a pack turns on the pull\'s leader. Challenge takes every monster within 6 tiles that is not on a tank and holds it 8 s. A Healer\'s basic draws a free monster 18% of the time. A shooter aims at the hero farthest back. A tank under 90% of the strongest tank\'s HP never takes a turn',
    ['src/core/hunt/targeting.js:164-260', 'src/data/hunt-roles.js:43-49 peel', 'src/data/hunt-roles.js:145 CHALLENGE', 'src/core/hunt/shooters.js'], 'CHALLENGE { radius 6, holdMs 8000, holderMinHpPm 900 }. Healer peel 180', ['P-VITALS (maxHp for the hold floor)'], ['who takes C-HURT', 'P-DEFENSE-XP (progression: only blows taken train it)'], 'the peel draw'),
  F('C-AREA', 'Area and extra targets: a shape (the 3x3, a line of len, a ring of r) hits every engaged monster it covers for the FULL roll each, up to maxHits. Follow-through repeats a basic blow on one neighbour. An area arrow hits its footprint',
    ['src/core/hunt/abilities.js:424-435', 'src/core/hunt/shapes.js', 'src/core/hunt/damage.js:229-234', 'src/core/hunt/damage.js:280-288'], 'ABILITY_RULES.areaSide 3. Row fields len, r, maxHits (Turning Cut 8)', ['C-SPELL-HIT', 'C-TIER (the pull is how many stand there)'], ['E-KILL-RATE (economy)', 'P-KILL-XP (progression)'], 'int a target'),
  F('C-LEASH', 'A pack lives in its room plus a margin (1 tile unless the ground says more). If the aggro holder leaves, the pack resets and heals. A called or keyed boss never resets', ['src/core/hunt/leash.js', 'src/data/hunt-tuning.js:36'], 'HUNT_TUNING.leashMarginDefault 1. A ground\'s leashMargin', [], ['C-TARGET', 'C-BOSS-PHASE'], D),
  F('C-PULL', 'How many stand in a fight: the ground\'s packs on Normal, the tier\'s pull on a harder tier (8, the Glade\'s Dangerous 6, none under floor 16). A monster\'s HP is its row\'s x hpPm for every party size',
    ['src/core/hunt/pull-cycle.js:99-100', 'src/data/hunt-tiers.js:114 pullOfTier'], 'TIER_DIALS pulls. Ground pockets', ['C-TIER'], ['C-AREA', 'E-KILL-RATE (economy)'], D),
  // ── gear values ──
  F('C-GEAR-ARMOR', 'Armor points: tiers 1-7 are a hand table per slot (plate) x 1.00 plate, 0.55 leather, 0.30 cloth, with each line\'s trades derived from the points. Past tier 7 the staged line is Dawnsteel x max(1, Level / 110), and each unique is hand-sized under it',
    ['src/data/gear-tiers.js:64-69 the slot table', 'src/data/gear-tiers.js:204-234 ARMOUR_LINES', 'tools/balance-sim/staged/armor-line.js:64-70 lineArmor'], 'the slot table. defMul. LINE_ANCHOR_LEVEL 110, LINE_TRADE 0.05', ['P-GEAR-LEVELS (progression: worn by Level)'], ['C-ARMOR-CHAIN', 'C-MON-TOHIT (guard)', 'P-VITALS (heavy HP, light mana)', 'C-CRIT'], D),
  F('C-GEAR-WEAPON', 'Weapon accuracy and damage: tiers 1-7 are hand tables per family. Past tier 7 the staged line is Dawnsteel x max(1, Level / 110)',
    ['src/data/gear-tiers.js:77-150 WEAPON_FAMILIES', 'tools/balance-sim/staged/weapon-line.js:72-81 lineWeapon'], 'the family tables. WEAPON_LINE_ANCHOR 110', ['P-GEAR-LEVELS (progression)'], ['C-HERO-POWER', 'C-HERO-TOHIT'], D),
  F('C-JEWEL-PERKS', 'Worn modifiers and how each stacks: jewel perks (Keen, Steady, Follow, Surge, Focus) count the largest once. Resistance sums, then caps. +skill sums. The own heal takes the largest. critB sums',
    ['src/core/combat.js:96-109', 'src/core/combat.js:207-248', 'src/data/jewelry.js'], 'each item row', ['E-JEWEL-COST (economy)'], ['C-HERO-TOHIT', 'C-CRIT', 'C-AREA', 'C-CAST-POWER', 'C-LEECH', 'C-HERO-POWER'], D),
  F('C-BUFF-BONUS', 'The injected bonus reader: a food buff or a perk adds to damage, crit and steady (a damage cut). Permanent perks are held to 20%', ['src/core/combat.js:425-428', 'src/core/buffs.js:63-75', 'src/core/perks.js:87 PERMANENT_CAP', 'src/core/mitigation.js:30'], 'BUFFS_DEF. PERMANENT_CAP 0.20', ['E-FOOD (economy)'], ['C-HERO-POWER', 'C-CRIT', 'C-TEMPER'], D),
  F('C-TRAINING', 'The training yard\'s dummy: its blow never takes a hero under a floor, and it never falls', ['src/core/hunt/training.js dummyBlow, dummyStands', 'src/core/hunt/damage.js:141-143'], 'the dummy rows', [], ['P-SKILL-XP (progression)', 'E-YARD-FEE (economy)'], D),
];

const X = (id, where, what, why, cls, status, fix) => ({ id, where, what, why, class: cls, status, fix });

export const EXCEPTIONS = [
  // ── duplicates ──
  X('X-POWER-LITERALS', 'src/core/combat.js:391 against combat.js:38-40 and src/shell/wiki-model.js:126', 'The engine computes a hero\'s largest blow from the literals 0.35, 0.6 and 2. The named constants with the same values are read only by the wiki. Change one and the wiki prints a formula the game does not run',
    'history starts 2026-11-03 (d4dc6908c). The constants predate the rebuild', 4, 'C', 'formula layer: the expression reads COMBAT_BALANCE. One guard that the wiki terms equal the engine\'s'),
  X('X-SHEET-ORDER', 'src/core/combat.js:422-423 against src/core/hunt/damage.js:126,309-314', 'Two orders for one blow. The sheet, the wiki and the upgrade plan read floor((maxHit - cut) x weakness). The engine rolls 1..floor(maxHit x weakness), then subtracts the cut from the roll',
    'the b495 truncation fix kept the subtraction in the roll helper after the hunt engine moved it into hurt()', 4, 'C', 'formula layer: playerCombatRolls stops subtracting defence. Every reader takes the cut from C-MON-DEF'),
  X('X-REFHP-OFF-BY-ONE', 'src/data/balance-sheet.js:131 against src/core/vitals.js:61 and SQL hr_max_hp (supabase/migrations/2027-02-10-settle-plan-cache.generated.sql:996)', 'The monster formula sizes blows on a hero of 150 + 10 x L HP. A hero has 150 + 10 x (L - 1). Every blow share is 10 HP a hero does not have (6% at Level 1, 0.5% at 200). The same formula is also written a third time in SQL, on generated constants',
    'two files written weeks apart', 4, 'C', 'formula layer: STAT_FORMULA.refHp calls vitals.maxHpFor(L, 0). The SQL twin stays (server authority) and gets a parity test against the JS at 20 Levels'),
  X('X-ROLL-TWINS', 'src/data/abilities.js:422-425 blowShare against src/data/monster-spells.js:99-102 spellHit', 'One function written twice with two constants (hitLowPm 500, SPELL_ROLL.lowPm 500)', '2026-11-08 833de2595 added the monsters\' copy. 2026-11-20 aef332af9 gave heroes the same rule', 4, 'C', 'formula layer: one shareRoll(power, pm) in src/core, one constant'),
  X('X-TIER-LADDER-TWINS', 'src/data/runes.js stepPm against src/data/statuses.js bleed.tierPermille and chill.tierPermille', 'The rune step ladder 1000..1400 is typed again on Bleed. Chill carries a different ladder, 1000..1667, for the same five tiers', 'the bleed predates the spell rule. Chill is 2026-11-19, the tank runes', 4, 'C', 'coefficient layer: a ticking status reads versionStep. Chill\'s own ladder becomes a named row with a why, or takes the common one'),
  X('X-SCALE-TWINS', 'src/core/combat.js:56 against src/data/balance-sheet.js:340', 'The art tier damage scale is restated in the sheet. A test pins the two equal', 'the sheet must divide by what the engine multiplies by', 4, 'C', 'gone with X-ART-TIER-SCALE'),
  X('X-MARK-TWO-WAYS', 'src/core/hunt/damage.js:166 against src/core/hunt/abilities.js:411-414', 'Two mechanisms for "this target takes more": Hunter\'s Mark writes unit fields (markPm, markUntil). Green Sickness is a status row (takenPm). They are added', 'the mark is 10-19. Statuses learned takenPm later', 4, 'C', 'formula layer: the mark becomes a marking status row. Two world fields go'),
  X('X-ROW-DOOR-BYPASS', 'src/core/hunt/targeting.js:53, src/core/hunt/boss-phases.js:39,48,55', 'Elements, the enrage line, the guard and the adds read MONSTERS[kind] directly. Every other stat goes through rowOf(inst, kind), the door a scaled hunt, a Tower room and the simulator\'s what-if use. So a what-if can move a blow but not a resistance or a phase',
    '2026-11-05 f451acdb8 (phases) and the element reader predate the instance table', 4, 'C', 'formula layer: both read rowOf. IMPACT IS A HYPOTHESIS: no live table moves these fields today'),
  X('X-STEADY-TWO-MEANINGS', 'src/core/combat.js:388 (jewel steady: misses that land) against src/core/mitigation.js:30 (steadyPm and a food\'s steady: a damage cut)', 'One word, two mechanics, and the food buff is labelled "Damage cut" under the id defense', 'jewelry 11-05, the cape and the food later', 4, 'C', 'data layer: rename one. No number moves'),
  X('X-STALE-HP-NOTE', 'src/data/balance-sheet.js:145 against src/core/hunt/pull-cycle.js:99', 'The sheet still says the engine scales monster HP 55-100% by party size. Since 2026-11-08 it does not', 'ONE DIFFICULTY ruling 2026-11-08', 4, 'C', 'delete the sentence'),
  // ── compensating multipliers and thresholds ──
  X('X-ART-TIER-SCALE', 'src/core/combat.js:45-56,473-477', 'A monster\'s damage is atk x a scale picked by its ART tier: 5.4, 4.0, 3.0 or 2.2. For the 72 formula rows it does nothing but rounding: the formula divides the blow by the same number. It still decides the damage of the 118 hand rows',
    'CORE_NUMBERS 2026-10-19 addendum: one flat 5.4 two-shot a Level 90 hero, so tiers 4-6 were flattened. Tier 3 moved to 4.0 on 10-21', 4, 'C', 'formula layer: the row stores the blow (a whole number of HP). The scale and its twin go. Hand rows are converted once, digit for digit'),
  X('X-HAND-ROWS', 'src/data/monsters.js', '118 of 190 monster rows are on no formula roster: their hp, atk, aim, evasion and def are typed by hand (the old roster, the Hearthfind and called bosses, Krell\'s hall, the dummy). 70 of the 72 roster rows equal the formula exactly',
    'the formula is 2026-11-06. Older rows were ported to keep their to-hit, never re-derived', 2, 'C', 'data layer: each row gets a role and reads the formula, or is listed as a named exception with its reason. WHICH OF THE 118 ARE FIELDED TODAY IS A HYPOTHESIS (tools/balance-program/formulas/roster-drift.mjs counts them)'),
  X('X-NAMED-RAT-KING', 'src/data/balance-sheet.js:336 FORMULA_EXCEPTIONS.rat_king', 'His attack is held at 6 where the formula says 8, so his Tail Lash stays under 35% of the floor hero\'s HP', 'Tyler 2026-11-18 "open at 5" plus the designer\'s 35% boss rule', 3, 'C', 'better at the formula layer: the boss cap should bound his SPELL, not his attack. Then the row is the formula\'s'),
  X('X-NAMED-HASK-LOOKOUT', 'src/data/balance-sheet.js:337 FORMULA_EXCEPTIONS.hasks_lookout', 'His blow is the Farmhands\' share, not his role\'s, "while engine piece 2 is unbuilt he swings in melee". Shooters are built now and he is one (range 5, tier-read.mjs)', '2026-11-13 lane/b-barrow-packs', 4, 'H', 'the stated reason is gone. Whether a lone hero at the floor is safe on the role\'s blow is the hypothesis: one grid cell answers it'),
  X('X-DANGER-RAMP', 'src/data/balance-sheet.js:137,343-348 STAT_FORMULA.ramp', 'A ground whose floor is 8 or under is gentle: monsters land 40% and hit 13.2% of a hero\'s HP. From floor 16 they land 70% and hit 22%. A straight line between', '2026-11-07: fresh heroes in practice sets hunt the first grounds', 3, 'C', 'keep, as the ONE early-game curve. It is a Level threshold that changes combat math, so it needs Tyler\'s explicit yes'),
  X('X-GENTLE-CAP', 'src/data/balance-sheet.js:158 blow.gentleCap 0.11', 'On top of the ramp, no blow on a gentle ground may pass 11% of the FLOOR hero\'s HP', '2026-11-07 5c5de4170: fresh Thicket heroes dipped under 25% HP', 4, 'H', 'coefficient layer: fold into the ramp\'s low end. A hypothesis until the grid shows the ramp alone holds the fresh hero'),
  X('X-GENTLE-HP', 'src/data/balance-sheet.js:213,215 MONSTER_ROLES gentleHp', 'Heavy and elite monsters have less HP on a gentle ground (1.0 and 1.2 where the role says 1.2 and 1.6)', '2026-11-07: extra HP there "only inflated the kill\'s XP and coin"', 4, 'H', 'this is an XP and coin fix written into combat stats. Overlap: progression and economy lanes'),
  X('X-PARTY-FIT', 'src/data/balance-sheet.js:193-195 STAT_FORMULA.fit.party', 'A party ground\'s monsters are a different formula: HP x2.5, blow x0.75, XP x0.8', '2026-11-06: built for four heroes\' damage on one tank', 2, 'C', 'keep as an ENCOUNTER TYPE in data (it is one row for every party ground, not a per-ground number)'),
  X('X-PARTY-FIT-PATCHES', 'src/data/balance-sheet.js:195 hitFull -0.3, blowShape 1.6, tierLift false', 'Three patches inside the party fit: to-hit 30 points lower on a full party ground, the same swing worth as fewer bigger blows on a gentle one, and harder tiers that lift nothing',
    '2026-11-07 (blowShape: "tier-2 cloth felt at the Sewer"). 2026-11-13 (hitFull: a lone hero at the Warrens "lived on its potions"). tierLift: a gentle party ground\'s Deadly killed its four 195 times', 4, 'C', 'each one compensates another formula (ward\'s flat cut, the lone hero on a party ground, the tier lift). Fix those and delete the three'),
  X('X-TIER-PER-GROUND', 'src/data/balance-sheet.js:437-459 BASE_TIER_OVERRIDES', 'Four grounds carry their own tier dials: the Glade (Dangerous pulls 6, HP 1400 and 1450), the Warrens (HP 1150 and 1250), the Thicket (no HP, XP 1050 and 1080), the Sewer (HP 1150 and 1250, XP 1220)',
    '2026-11-16/17 lane/d-flat-party-xp: fours killed too fast for the XP. The ladder rule (a ground\'s top tier must not beat the next ground\'s Normal)', 4, 'C', 'the exact case the brief names. The cause is kill-rate and XP: fix at P-KILL-XP and the pull, then every ground takes TIER_DIALS whole. Overlap: progression lane'),
  X('X-TIER-PULL-FLOOR', 'src/data/balance-sheet.js:413 TIER_PULL_FROM_FLOOR 16', 'Under ground floor 16 a harder tier brings no more monsters', '2026-11-08: a lone area hero out-earned the next ground', 3, 'C', 'conflicts with Tyler 2026-11-07 "Dangerous and Deadly keep the bigger pulls". For Tyler'),
  X('X-CELLAR-NORMAL-ONLY', 'src/data/balance-sheet.js:450', 'The Mill Cellar offers only Normal', 'Coordinator 2026-11-05, in Tyler\'s tier ruling', 3, 'C', 'keep. A content flag'),
  X('X-TIER-TRIPLE', 'src/data/hunt-tiers.js:122,130 and src/core/hunt/damage.js:108', 'A tier\'s dmgPm is applied three times: to the blow, to the aim, and to the monster\'s Level as armor reads it (and as Defense XP is paid). On the Thicket and Wickstead the solved dmgPm is 2115 and 2685, so on Wickstead\'s Deadly a Level 8 monster is read by armor as Level 21, and each blow aimed at a hero pays 2.7 times the Defense XP (hunt-rewards.js:62). From Hask\'s Ford up it costs plate 2 to 5 points of absorb (tools/balance-program/formulas/tier-read.mjs)',
    '2026-11-04 f1d68555e: one dial for everything', 4, 'C', 'formula layer: the dial moves the blow and the aim. Armor and Defense XP read the row\'s own Level. Overlap: progression lane (P-DEFENSE-XP)'),
  X('X-TOWER-HEAT', 'src/data/tower.js:57 and src/core/hunt/tower.js heatOpts', 'Past floor 100 every blow is x1.012 a floor, compounding: x10.9 by floor 300. The number moved 10 to 12 to hold a guard', '2026-11-19 b7c73732c. Tyler 2026-11-20 already DROPPED the heat patch (one Levels-per-floor row instead). Plan L18 owes it', 4, 'C', 'already ruled. Listed so it is not forgotten'),
  X('X-TOWER-TOP', 'src/data/tower.js:54 floorTop 300', 'A floor above 300 plays floor 300\'s monsters', 'the server\'s per-floor bound needs a last row', 3, 'C', 'a cap on an endless mode. Needs Tyler\'s yes or a formula that reads any floor'),
  X('X-SCALED-THICKET', 'src/data/scaled-hunts.js:41-44 SCALE_EXCEPTIONS', 'A scaled Thicket reaches only half danger', '2026-11-07: "its wolves run down a lone archer"', 4, 'C', 'a per-ground combat number. The cause is the bow against a melee pack, which the real Thicket hides by being gentle'),
  X('X-SCALED-NO-DEADLY', 'src/data/scaled-hunts.js:144', 'Deadly is not offered on a scaled hunt', 'designer 2026-11-07', 3, 'C', 'a content rule. For Tyler with the scaled-hunt card'),
  X('X-SPELL-HOLDS', 'src/data/balance-sheet.js:121-123 (named there: Hot Coal, Bone Slide, Snuff the Candles)', 'Three monster spells had their multiples lowered so the +10% monster step would not pass 35% of a floor hero', '2026-11-19 lane/d-harder-monsters', 4, 'H', 'the rows were not read. If true, the 35% rule belongs in the spell formula as a bound, not in three rows'),
  // ── spells ──
  X('X-SPELL-FLOOR', 'src/data/abilities.js:356-376 (hitRange, castAmount `floored`) and src/core/hunt/status.js:69', 'The beginner\'s floor: every cast lands max(its share of the blow, its old version-I number). Past about Level 15 the share is always larger. At Level 1 a Greater Mend lands its floor of 50 on a hero with 150 HP',
    'Tyler 2026-11-21 call 32-8 ("heals and first strikes are not cut in half"). Built by lane/c-spell-rule as its Call 1, still waiting for the designer\'s yes', 3, 'C', 'see Conflicts 1. The clean alternative is a floor on POWER (one number: a hero\'s blow is never read under N), not a second number on every row'),
  X('X-MEND-MAXHP', 'src/data/abilities.js:335 healHpPm 110', 'Mend heals a share of max HP, not of the blow', 'Tyler 2026-11-21 call 32-4', 3, 'C', 'approved. Documented as the second of two heal kinds'),
  X('X-THREE-ROLLS', 'src/core/combat.js:484, src/data/abilities.js:422, src/data/abilities.js:373', 'Three shapes for "an amount": a swing rolls 1..max (mean 50%), a spell hit rolls 50%..100% (mean 75%), a heal or shell does not roll', 'the swing is the old engine\'s. The spell roll is the monsters\'. Whole heals are lane/c-spell-rule\'s Call 5', 3, 'C', 'see Conflicts 6. One roll rule with a per-kind spread in data would do all three'),
  X('X-SPELLS-SKIP-WEAKNESS', 'src/core/hunt/damage.js:305-316 (blow) against src/core/hunt/abilities.js:392-400 (strike)', 'Weapon weakness (+20% damage, +15% accuracy, on 189 of 190 monsters) and bane apply to basic blows only. A spell is a share of the NEUTRAL blow. A spell also never misses and never crits, so accuracy, evasion, Keen and critB do nothing for it',
    'spells were fixed numbers until 2026-11-21. The spell rule made them shares of the blow without deciding which blow', 4, 'C', 'see Conflicts 2. THAT IT IS UNINTENDED IS A HYPOTHESIS'),
  X('X-VERSION-LADDER', 'src/data/runes.js RUNE_TIERS', 'Five versions, +10% each, the last at skill 60. Nothing after it, on a game with endless Levels. The plan (B5) said x1.6', 'Tyler 2026-10-23 (five tiers at 1/15/30/45/60). lane/c-spell-rule Call 4 chose 1.4', 2, 'C', 'see Conflicts 5'),
  X('X-TURNING-CUT-10', 'src/data/abilities.js:194 unlock 10, maxHits 8', 'The merged area strike unlocks at Melee 10 for every weapon, so the axes and the hammer have no area move for Levels 1-9 (lone hammer -24% at the Thicket)', 'Tyler 2026-11-19 (the sword speeds up later). lane/c-spell-rule Call 3', 2, 'C', 'see Conflicts 7. A per-weapon unlock is a data field, not code'),
  X('X-REND-DEFAULT', 'src/data/rule-subjects.js ROLE_RULES melee_dps', 'Rend sits on the default two-axe bar and spends a 1 g rune a cast', 'lane/c-spell-rule Call 2', 2, 'C', 'content. Overlap: economy lane (E-RUNE-SUPPLY: a default bar that spends gold)'),
  X('X-DARK-ROWS', 'src/data/abilities.js:275-327 (Brand, Reave, Updraft, Blight, the fist strikes)', 'Converted to shares at their old Level 60 worth, never sized', 'lane/c-spell-rule Call 6. Lanes L43, L44', 2, 'H', 'content, owed by those lanes. Not measured here'),
  X('X-PARTY-ONLY-ROWS', 'src/data/abilities.js `alone`, `party`, partyOnly; src/core/hunt/abilities.js:315-319', 'A row may fire only alone, only in a party, or party-only for a tank', 'Tyler 2026-11-09 and 2026-11-19', 3, 'C', 'approved. One shared gate, read from data'),
  X('X-REPLACES', 'src/core/hunt/abilities.js:250-253 clockOf', 'A row that stands in for another shares its cooldown', 'the whole-game audit\'s change 3', 1, 'C', 'keep'),
  X('X-ACTION-SET-SKIPS', 'src/data/abilities.js:144-148', 'Presets that skip rune or area rows (mana_train, boss)', 'spec §3.7, ASSUMED', 2, 'C', 'keep as data'),
  X('X-BRACE', 'src/data/monster-spells.js:62 SHIELD_BRACE, src/core/hunt/monster-spells.js:150', 'A worn shield takes 30% off a marked monster spell, by item type', 'Tyler 2026-11-08 "the tank absorbing the boss hits"', 3, 'C', 'approved in direction. Cleaner as a stat on the shield row (bracePm) than a rule keyed on the slot'),
  X('X-ELEMENT-RULES', 'src/data/elements.js ELEMENT_ON_HERO, src/core/hunt/damage.js:178-184', 'Storm burns mana for half the HP taken. Necrotic lands Withered', 'Tyler 2026-11-18 approved the two elements. The numbers are PROPOSED, dark behind a switch', 3, 'C', 'needs Tyler\'s yes on the two rules before the switch goes on'),
  // ── gear and modifiers ──
  X('X-DEFB-TWO-JOBS', 'src/core/combat.js:181 and src/core/mitigation.js:33-41', 'One item field, defB, feeds two formulas by item class: on armor it is armor points, on a shield or cape it is guard in the to-hit roll', 'ruling K7, 2026-10-18', 2, 'C', 'data layer: two fields (armor, guard). No number moves'),
  X('X-SET-CRIT', 'src/core/combat.js:252-270 armorSetBonus', 'Five pieces of one tier and line give crit, 1% a tier, for plate and cloth as much as leather. Its default line is "plate"', '"Wave 5c / b283", the old client', 4, 'H', 'looks like a leftover. If wanted it is a data row (set bonuses), not a function'),
  X('X-STACKING-RULES', 'src/core/combat.js:96-109,207-248', 'Five stacking rules for worn modifiers: largest-once (perks), largest (own heal), sum (+skill, critB), sum-then-cap (resistance), and the weakness product with two ceilings', 'each added by its own lane', 4, 'C', 'formula layer: one modifier table { key, combine: sum | max, cap } that equipmentStats folds'),
  X('X-DORMANT-FACTORS', 'src/core/combat.js:306-324, src/core/bane.js:62, src/core/charms.js (charmDamageMultFor)', 'Three factors sit in the damage expression with nothing feeding them: bane (0 items carry one), the weapon element (eq.element is always null), the charm damage ladder (no caller). A second ceiling, 1.68, is exported and unused',
    'the closed rebuild cut their sources and kept the seams', 4, 'C', 'not a cut list: imbuements are on the roadmap, so the element seam is BUILD-LATER (Tyler 2026-11-21). The unused 1.68 and the charm ladder can go'),
  X('X-TEMPER-ROUNDING', 'src/core/temper.js:13-15', 'Tempering rounds by chance (the part of a point is a draw). Every other step floors', '2026-11-04: +1% on a blow of 20 paid nothing', 3, 'C', 'the right idea in one place only. See X-FLOOR-CHAIN'),
  X('X-FLOOR-CHAIN', 'src/core/hunt/damage.js:123-137', 'Up to nine floors in a row on one blow. On small numbers each one is a hidden cut: a 10-point hit through three 1.1 / 0.9 steps is not what the product says', 'steps were added one at a time', 4, 'H', 'formula layer: multiply the permilles, floor once. THE SIZE IS A HYPOTHESIS (largest in the first 15 Levels)'),
  X('X-ARMOR-LINE-FIT', 'tools/balance-sim/staged/armor-line.js LINE_SAMPLE, tests/armor-line.mjs AL3', 'Each unique\'s armor was sized to "the most that keeps its measure under the line", four digits from 1.0000. Any engine change moves the measure', '2026-11-16/18 lane/d-armor-line-v2', 4, 'C', 'see section 6.1'),
  X('X-LINE-IN-TOOLS', 'tools/balance-sim/staged/armor-line.js:64-70, weapon-line.js:72-81', 'The only formula for gear past tier 7 lives in a simulator folder, with the Dawnsteel numbers typed again beside it', 'a hidden sample may not be imported by src/', 4, 'C', 'the formula (not the sample) moves to src/data as the gear curve'),
  // ── foundations, listed so nobody "cleans" them ──
  X('X-ONE-INTERVAL', 'src/core/combat.js:63', 'One 2.0 s basic attack for everyone, no speed stat', 'Tyler 2026-10-15', 1, 'C', 'keep. "Attack speed" on Tyler\'s list is this plus cooldowns and Chill'),
  X('X-TOHIT-RAILS', 'src/data/to-hit.js:117', 'Every chance is held to 5%..97%', 'Tyler 2026-11-20, 21-1', 1, 'C', 'keep. On the projected gear line a hero reaches 95% near Level 2,000 (section 7)'),
  X('X-MIN-ONE', 'src/core/hunt/damage.js:135, mitigation.js:86, combat.js:422,493', 'Every landed blow deals at least 1', 'engine contract', 1, 'C', 'keep'),
  X('X-MITIGATION-CAP', 'src/data/core-model.js:172 capPm 600', 'Armor never takes more than 60% of a blow', 'Tyler 2026-10-18 (K7)', 1, 'C', 'keep'),
  X('X-CRIT-CAP', 'src/core/combat.js:64-65', 'Crit chance at most 60%, a crit x1.5', 'pre-rebuild', 1, 'C', 'keep'),
  X('X-RESIST-CAPS', 'src/data/elements.js HERO_RESIST_PM, ELEMENT_PCT', 'A hero resists at most 40% of an element and 10% physical. A monster profile is bounded both ways', 'Tyler 2026-11-06 (no immunities), 2026-11-08, 2026-11-14', 1, 'C', 'keep'),
  X('X-ATTACKER-LEVEL', 'src/core/mitigation.js:12', 'Armor is measured against the attacker\'s Level', 'Tyler 2026-11-04 "just simply harder"', 1, 'C', 'keep. It is why armor must grow with Level (section 7)'),
  X('X-BOSS-FLOOR-CAP', 'src/data/balance-sheet.js:218 floorCap 0.33', 'A boss\'s blow is held to a third of the FLOOR hero\'s HP, however deep he lives', 'designer 2026-10-21, after a Sewer death', 3, 'C', 'a designer rule, never ruled by Tyler. Needs his yes'),
  X('X-BOSS-PHASE-ROWS', 'monsters.js:830,845; grounds/krells_hold/pack.js:350,360; grounds/muster_barrows/pack.js:178', 'Each boss carries his own line numbers (enrage x1.15 to x1.8, guard 80%)', 'Tyler 2026-11-05 "phases"', 2, 'C', 'a model case: one mechanic, numbers in data'),
  X('X-CALLED-ROOM', 'src/core/hunt/boss-room.js:23-26', 'A called boss room pays nothing. A keyed hall pays', 'Tyler 2026-11-04/05', 3, 'C', 'approved. Overlap: economy lane'),
  X('X-DUMMY', 'src/core/hunt/training.js', 'A dummy\'s blow cannot kill and it cannot die', 'Tyler 2026-11-08', 3, 'C', 'approved'),
  X('X-CASTER-BASIC', 'src/data/hunt-roles.js:46-49, src/core/hunt/damage.js:342-356', 'A basic attack costs by weapon: a wand or staff 1 mana, a bow one arrow, a melee weapon nothing', 'Tyler 2026-10-15, 2026-10-23', 3, 'C', 'approved. Overlap: economy lane (E-SUPPLY-USE)'),
  X('X-ROLE-TARGET-NUMBERS', 'src/data/hunt-roles.js:48,145', 'Healer peel 18%, Challenge radius 6, hold 8 s, the 90% weak-tank floor', 'ASSUMED in the spec, 10-22 for the floor', 2, 'C', 'data. Never measured'),
  X('X-LEVEL-BY-TIER', 'src/data/core-model.js:200 MONSTER_LEVEL_BY_TIER', 'A monster with no Level gets one from its art tier', 'CORE_NUMBERS Q5', 4, 'H', 'if every fielded row has a Level this is dead. Not checked'),
  X('X-MUTABLE-ROWS', 'src/data/monster-spells.js:68 SPELL_STAGGER, MONSTERS rows, GROUND_TIERS', 'Data the engine reads is left unfrozen so the simulator can edit it in place and put it back', 'tools/balance-sim what-ifs', 4, 'C', 'architecture: what-ifs go through the instance\'s row door (rowOf) and an options object, never by mutating shared data'),
  X('X-POWER-TOOLS', 'tools/balance-sim/armor-power.mjs, weapon-power.mjs', 'Two guards (armor-line, weapon-line) judge gear by a closed-form "pace and safety" read built from the engine\'s roll helpers, not by a played hunt', 'speed: a played hunt per piece per ground is slow', 4, 'H', 'the brief asks for the real engine. Bodies not fully read, so the size of the gap is unknown'),
  // ── found here, owned elsewhere ──
  X('X-OTHER-LEVEL-SHARE', 'src/core/hunt/xp-share.js:78, src/data/hunt-tuning.js:56', 'The under-floor Level share cut is still live. Tyler 2026-11-08: "XP share rule applies regardless"', 'risk ladder 2026-11-03', 4, 'C', 'PROGRESSION LANE. A Level threshold in party XP that a ruling removed'),
  X('X-OTHER-GROUND-FITS', 'src/data/balance-sheet.js:306,317 GROUND_XP_FIT, GROUND_GP_FIT, xp.floorFit, gp.line', 'Per-ground XP and coin multipliers on the monster formula', '2026-11-07 to 11-19', 4, 'C', 'PROGRESSION and ECONOMY LANES. They sit in the same function as the combat stats, so a combat change moves them'),
];

/* edges inside the category, and the ones that leave it */
export const EDGES = [
  ['P-SKILL-LEVEL', 'C-HERO-POWER'], ['C-GEAR-WEAPON', 'C-HERO-POWER'], ['C-WEAKNESS', 'C-HERO-POWER'], ['C-BUFF-BONUS', 'C-HERO-POWER'],
  ['C-HERO-POWER', 'C-BASIC-BLOW'], ['C-HERO-TOHIT', 'C-BASIC-BLOW'], ['C-CRIT', 'C-BASIC-BLOW'], ['C-BASIC-BLOW', 'C-HURT'],
  ['C-HERO-POWER', 'C-SPELL-HIT'], ['C-HERO-POWER', 'C-SPELL-HEAL'], ['C-HERO-POWER', 'C-SPELL-SHELL'], ['C-HERO-POWER', 'C-STATUS'],
  ['C-CAST-POWER', 'C-SPELL-HIT'], ['C-CAST-POWER', 'C-SPELL-HEAL'], ['C-CAST-POWER', 'C-SPELL-SHELL'], ['C-CAST-POWER', 'C-STATUS'],
  ['C-SPELL-HIT', 'C-HURT'], ['C-STATUS', 'C-HURT'], ['C-STATUS', 'C-VULN'], ['C-STATUS', 'C-HEAL-CUT'], ['C-STATUS', 'C-CLOCKS'],
  ['C-VULN', 'C-HURT'], ['C-ELEMENT-MON', 'C-HURT'], ['C-MON-DEF', 'C-HURT'], ['C-STANCE', 'C-HURT'], ['C-TEMPER', 'C-HURT'], ['C-BOSS-PHASE', 'C-HURT'],
  ['C-SPELL-SHELL', 'C-HURT'], ['C-ARMOR-CHAIN', 'C-HURT'], ['C-RESIST-HERO', 'C-ARMOR-CHAIN'], ['C-TEMPER', 'C-ARMOR-CHAIN'], ['C-GEAR-ARMOR', 'C-ARMOR-CHAIN'],
  ['C-HEAL-CUT', 'C-SPELL-HEAL'], ['C-HEAL-CUT', 'C-LEECH'], ['C-HURT', 'C-LEECH'], ['C-TEMPER', 'C-SPELL-HEAL'],
  ['C-REF-HERO', 'C-MON-STATS'], ['C-MON-STATS', 'C-MON-BLOW'], ['C-MON-STATS', 'C-MON-TOHIT'], ['C-MON-STATS', 'C-MON-DEF'], ['C-MON-STATS', 'C-HERO-TOHIT'], ['C-MON-STATS', 'C-ELEMENT-MON'], ['C-MON-STATS', 'C-WEAKNESS'],
  ['C-TIER', 'C-MON-BLOW'], ['C-TIER', 'C-MON-TOHIT'], ['C-TIER', 'C-ARMOR-CHAIN'], ['C-TIER', 'C-PULL'], ['C-MON-STATS', 'C-TIER'],
  ['C-MON-BLOW', 'C-MON-SPELL'], ['C-MON-BLOW', 'C-HURT'], ['C-MON-TOHIT', 'C-HURT'], ['C-MON-SPELL', 'C-HURT'], ['C-BOSS-PHASE', 'C-MON-BLOW'], ['C-BOSS-PHASE', 'C-MON-SPELL'],
  ['C-MON-STATS', 'C-RUN-ROOM'], ['C-MON-STATS', 'C-SCALED'], ['C-MON-STATS', 'C-BOSS-ROOM'], ['C-TIER', 'C-SCALED'],
  ['C-TARGET', 'C-HURT'], ['C-LEASH', 'C-TARGET'], ['C-PULL', 'C-AREA'], ['C-SPELL-HIT', 'C-AREA'], ['C-JEWEL-PERKS', 'C-HERO-TOHIT'], ['C-JEWEL-PERKS', 'C-CRIT'], ['C-JEWEL-PERKS', 'C-CAST-POWER'],
  ['C-GEAR-ARMOR', 'C-MON-TOHIT'], ['C-GEAR-ARMOR', 'C-CRIT'], ['C-GEAR-WEAPON', 'C-HERO-TOHIT'], ['C-GEAR-WEAPON', 'C-REF-HERO'],
];
export const EDGES_OUT = [
  ['progression', 'P-SKILL-LEVEL -> C-HERO-POWER, C-HERO-TOHIT, C-MON-TOHIT', 'how fast a skill level arrives decides how fast power grows. The spell rule made every cast depend on it too'],
  ['progression', 'P-SKILL-CURVE -> C-REF-HERO -> C-MON-STATS', 'every monster\'s aim and evasion are written against a measured career. A skill-curve change re-authors every monster'],
  ['progression', 'P-VITALS (HP 150 + 10 a Level, mana, armor weight shares) -> C-MON-STATS, C-SPELL-HEAL (Mend), C-REGEN, C-TARGET', 'monster blows are a share of hero HP. HP growth is the anchor of all incoming damage'],
  ['progression', 'P-GEAR-LEVELS -> C-GEAR-WEAPON, C-GEAR-ARMOR', 'gear is worn by Level. Past tier 7 there is no gear, so combat stops scaling (section 7)'],
  ['progression', 'C-MON-STATS, C-TIER -> P-KILL-XP', 'kill XP is priced per monster HP point on the same row. More HP is more XP a kill'],
  ['progression', 'C-TIER (levelAtTier), C-MON-TOHIT -> P-DEFENSE-XP', 'Defense trains by the attacker\'s Level, which a tier multiplies'],
  ['progression', 'C-HURT -> P-WEAPON-XP. C-MANA -> P-MAGIC-XP', 'weapon skills train on HP removed, Magic on mana spent'],
  ['progression', 'C-RUN-ROOM -> P-RUN-XP (TOWER_PARTY_XP), party XP tables, the under-floor share', 'party XP math differs by mode (X-OTHER-LEVEL-SHARE)'],
  ['economy', 'C-MON-STATS -> E-KILL-COIN', 'coin a kill is priced per HP point on the same row (GROUND_GP_FIT, gp.line)'],
  ['economy', 'C-HURT, C-PULL, C-AREA, C-CLOCKS -> E-KILL-RATE', 'kills an hour is hero damage over monster HP plus walking and resting'],
  ['economy', 'C-MON-BLOW, C-ARMOR-CHAIN, C-SPELL-HEAL, C-REGEN, C-LEECH -> E-SUPPLY-USE', 'food and drink bought is damage taken less free healing. A heal spell is food not bought'],
  ['economy', 'E-RUNE-SUPPLY, BASIC_EFFECT_SHARE -> C-CAST-POWER, C-BASIC-BLOW', 'a store rune or arrow lands 75%. The default axe bar spends a 1 g rune a cast (X-REND-DEFAULT)'],
  ['economy', 'E-TEMPER-COST -> C-TEMPER. E-JEWEL-COST -> C-JEWEL-PERKS. E-FOOD -> C-BUFF-BONUS', 'gold sinks buy combat percent'],
  ['economy', 'C-BOSS-ROOM, C-SCALED, C-RUN-ROOM -> fees, keys and what they pay', 'the modes share the monster formula and differ only in pay'],
];

function problems() {
  const out = [];
  const ids = new Set();
  for (const r of [...FORMULAS, ...EXCEPTIONS]) { if (ids.has(r.id)) out.push('duplicate id ' + r.id); ids.add(r.id); }
  const fids = new Set(FORMULAS.map((f) => f.id));
  for (const [a, b] of EDGES) for (const x of [a, b]) if (!fids.has(x) && !/^[PE]-/.test(x)) out.push('edge names no formula: ' + x);
  for (const f of FORMULAS) if (!f.impl.length || !f.computes) out.push(f.id + ': no implementation or description');
  for (const x of EXCEPTIONS) {
    if (![1, 2, 3, 4].includes(x.class)) out.push(x.id + ': class ' + x.class);
    if (!['C', 'H'].includes(x.status)) out.push(x.id + ': status ' + x.status);
  }
  return out;
}

export function counts() {
  const byClass = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const x of EXCEPTIONS) byClass[x.class]++;
  return { formulas: FORMULAS.length, exceptions: EXCEPTIONS.length, byClass, confirmed: EXCEPTIONS.filter((x) => x.status === 'C').length, hypothesis: EXCEPTIONS.filter((x) => x.status === 'H').length };
}

const esc = (s) => String(s).replace(/\|/g, '\\|');
function tables() {
  const f = ['| id | what it computes | where | parameters | reads | read by | dice |', '|---|---|---|---|---|---|---|',
    ...FORMULAS.map((r) => '| ' + [r.id, r.computes, r.impl.join('<br>'), r.params, r.deps.join(', ') || 'none', r.consumers.join(', '), r.random].map(esc).join(' | ') + ' |')].join('\n');
  const x = ['| id | class | status | where | what it does | why it exists | the fix, and its layer |', '|---|---|---|---|---|---|---|',
    ...EXCEPTIONS.map((r) => '| ' + [r.id, r.class, r.status === 'C' ? 'CONFIRMED' : 'HYPOTHESIS', r.where, r.what, r.why, r.fix].map(esc).join(' | ') + ' |')].join('\n');
  const e = ['Inside combat (' + EDGES.length + ' edges, read "left feeds right"):', '', ...EDGES.map(([a, b]) => '- ' + a + ' -> ' + b), '',
    'Leaving combat:', '', '| lane | edge | why it matters |', '|---|---|---|', ...EDGES_OUT.map((r) => '| ' + r.map(esc).join(' | ') + ' |')].join('\n');
  return { FORMULAS: f, EXCEPTIONS: x, EDGES: e };
}

function register() {
  return { category: 'combat', doc: 'docs/design/balance-program/41-formulas-combat.md', brief: 'docs/design/balance-program/40-formula-brief.md', readAt: 'set/v0.2.144 e6ea19170',
    classes: { 1: 'foundational mechanic', 2: 'content parameter, belongs in data', 3: 'intentional special mechanic, needs Tyler\'s explicit approval', 4: 'accidental complexity, eliminate' },
    status: { C: 'confirmed: the code path was read, measured where the row says so', H: 'hypothesis: the row says what would confirm it' },
    counts: counts(), formulas: FORMULAS, exceptions: EXCEPTIONS, edges: EDGES.map(([from, to]) => ({ from, to })), edgesOut: EDGES_OUT.map(([lane, edge, why]) => ({ lane, edge, why })) };
}

function docWith(text, t) {
  let out = text;
  for (const k of Object.keys(t)) {
    const a = '<!-- GENERATED:' + k + ' (tools/balance-program/formulas/combat-register.mjs --write) -->', b = '<!-- END GENERATED:' + k + ' -->';
    const i = out.indexOf(a), j = out.indexOf(b);
    if (i < 0 || j < i) throw new Error('combat-register: the doc has no ' + k + ' markers');
    out = out.slice(0, i + a.length) + '\n' + t[k] + '\n' + out.slice(j);
  }
  return out;
}

/* LINE ENDINGS. This file writes LF. A checkout with core.autocrlf hands the doc and the register back with CRLF, so every read goes
   through lf(): the comparison is on the text, never on how a checkout ends its lines (2026-11-21: --check read STALE on a Windows
   checkout whose tables matched). */
const lf = (s) => s.replace(/\r\n/g, '\n');
/** What --check calls stale, from the two files' texts (null = the file is missing). Pure, so --selftest can plant on it. */
function staleOf(jsonText, docText, json) {
  const stale = [];
  if (jsonText == null || lf(jsonText) !== json) stale.push('formulas-combat.json');
  if (docText == null || lf(docText) !== docWith(lf(docText), tables())) stale.push('41-formulas-combat.md tables');
  return stale;
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

const bad = problems();
if (bad.length) { console.error('combat-register: ' + bad.join('\n  ')); process.exit(2); }
const json = JSON.stringify(register(), null, 1) + '\n';
const mode = process.argv[2];
if (mode === '--write') {
  writeFileSync(JSON_FILE, json);
  if (existsSync(DOC_FILE)) writeFileSync(DOC_FILE, docWith(lf(readFileSync(DOC_FILE, 'utf8')), tables()));
  console.log('wrote ' + JSON_FILE + (existsSync(DOC_FILE) ? ' and the tables of ' + DOC_FILE : ' (no doc yet)'));
} else if (mode === '--check') {
  const stale = staleOf(read(JSON_FILE), read(DOC_FILE), json);
  if (stale.length) { console.error('combat-register: STALE ' + stale.join(', ') + ' (run --write)'); process.exit(1); }
  console.log('combat-register: in step');
} else if (mode === '--selftest') {
  /* Plants on in-memory texts only: no file is written. The doc is built from this file's own tables, so the cases do not depend on
     the checkout being in step. */
  const crlf = (s) => lf(s).replace(/\n/g, '\r\n');
  const t = tables();
  const doc = docWith(Object.keys(t).map((k) => '<!-- GENERATED:' + k + ' (tools/balance-program/formulas/combat-register.mjs --write) -->\n<!-- END GENERATED:' + k + ' -->').join('\nprose\n') + '\n', t);
  const row = '| ' + FORMULAS[0].id + ' |';
  const cases = [
    ['LF, in step', staleOf(json, doc, json), 0],
    ['CRLF checkout of both files, in step', staleOf(crlf(json), crlf(doc), json), 0],
    ['mixed endings in the doc, in step', staleOf(json, doc.replace('\n', '\r\n'), json), 0],
    ['CRLF doc with one table row changed', staleOf(crlf(json), crlf(doc.replace(row, row + ' planted |')), json), 1],
    ['CRLF doc with a table row removed', staleOf(json, crlf(doc.split('\n').filter((l) => !l.startsWith(row)).join('\n')), json), 1],
    ['CRLF register with one value changed', staleOf(crlf(json.replace('"category": "combat"', '"category": "planted"')), crlf(doc), json), 1],
    ['a missing register and a missing doc', staleOf(null, null, json), 2],
  ];
  let red = 0;
  for (const [name, stale, want] of cases) {
    const ok = stale.length === want;
    if (!ok) red++;
    console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + (stale.length ? 'STALE ' + stale.join(', ') : 'in step') + (ok ? '' : ' (wanted ' + want + ' stale)'));
  }
  if (!doc.includes(row) || !json.includes('"category": "combat"')) { console.log('FAIL a plant found nothing to change: the change cases prove nothing'); red++; }
  if (red) { console.error('combat-register --selftest: ' + red + ' case(s) FAILED'); process.exit(1); }
  console.log('combat-register --selftest: ' + cases.length + ' cases');
}
console.log(JSON.stringify(counts()));
