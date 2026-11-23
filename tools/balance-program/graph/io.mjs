// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph/io.mjs — WHAT EVERY FORMULA READS AND WRITES, TYPED (Balance Lab phase 1; docs/design/redesign/
// 07-balance-lab.md section 3.1). The typed layer on tools/balance-program/formulas/formulas-architecture.json: one row a formula id of
// that register, and nothing here repeats what the register already says (what the formula computes, its state, its class).
//
// A ROW:  'ID': f([homes], [reads], [writes], { as, skip, note })
//   home    'file#binding,binding': the top-level bindings of the rule code this formula lives in. 'TABLE.key' is one first-level key
//           of a shared table. The derivation reads exactly these. A formula with no rule code (SQL only, unbuilt, cut, a tool) has no
//           home and says why in `note`.
//   reads   '+q' raising q raises what this formula writes · '-q' lowers it · '~q' moves it, the direction depends on the case ·
//           '!q' an OFFLINE dependency: a table that was measured or typed from q by hand and is not re-read when q moves.
//           '+q>w' limits the read to the write w (a formula with two outputs that q moves differently).
//           '@+q' a CAREER read: it acts between hunts, never inside one (earned XP becoming a Level). The trace of a hunt does not
//           pass through it, and `lab ask` names it so the long way round is not forgotten.
//   writes  'q': a quantity this formula produces.
//   A read or write the code cannot show is written ['+q', 'the reason']. Without a reason the check demands to find q's token in the
//   home, so a declaration nobody can point at in the code fails.
//   as      { token: 'q' } what a shared token means in THIS home (`hp` is a monster's HP in the stat formula and a landed amount in hurt)
//   skip    { token: 'the reason' } a token in the home that is not a quantity there
//
// SIGNS ARE JUDGMENT, read from the formula's text in the register and from the code. They are checked against measurement:
// tools/balance-program/graph.mjs prints the sign-match rate between the trace built from these rows and the played sweeps.
//
// OUTCOME READERS (O-...) are not game formulas. The register's row E14 says it: "XP an hour, kills an hour and gold an hour. No formula
// computes these." The engine's loop makes them. Each O- row states which quantities a measured outcome follows, by hand, and stands in
// the graph where E14 stands in the register.
// ════════════════════════════════════════════════════════════════════════

const f = (home, reads, writes, o = {}) => Object.freeze({ home: Object.freeze(home), reads: Object.freeze(reads), writes: Object.freeze(writes), ...o });
const NO_HOME = Object.freeze([]);

const ROLLS = 'src/core/combat.js#playerCombatRolls';
const EFFECT = 'src/core/hunt/abilities.js#effect';
const RATIO = 'src/data/to-hit.js#TO_HIT,toHitRatio,heldToHit';
const ARG = 'the amount arrives as the argument: the caller rolled it';
const SHEET = 'src/data/balance-sheet.js#formulaStats,STAT_FORMULA,MONSTER_ROLES';

export const FORMULA_IO = Object.freeze({
  // ── combat: the hero's blow ──
  'C-HERO-POWER': f([ROLLS, 'src/core/combat.js#COMBAT_BALANCE.strengthLevelScale,COMBAT_BALANCE.strengthBonusScale,COMBAT_BALANCE.playerBaseMaxHit'], ['+hero.skill', '+gear.weapon', '+hero.weakFactor', '+hero.buff', '-mon.defCut'], ['hero.maxHit'],
    { note: 'playerCombatRolls takes the monster\'s defence cut off the largest blow (defenceReduction). hurt takes the same cut off every amount that lands on a monster. The register\'s text names only the second' }),
  'C-HERO-TOHIT': f([ROLLS, RATIO], ['+hero.skill', '+gear.weapon', '-mon.evasion', '+hero.weakFactor', '+gear.perk'], ['hero.hitChance']),
  'C-CRIT': f([ROLLS, 'src/core/combat.js#armorSetBonus,rollCrit,applyCrit,COMBAT_BALANCE.critMult,COMBAT_BALANCE.critCap'], ['+gear.perk', '+hero.buff', ['+gear.armor', 'a set bonus counts worn armor pieces of one tier and line, read off the item rows']], ['hero.crit']),
  'C-BUFF-BONUS': f([ROLLS], [['+perk.permanent', 'the injected bonus reader (ctx.bonus) is built from perks in src/core/perks.js makeBonus']], ['hero.buff']),
  'C-BASIC-BLOW': f(['src/core/combat.js#rollAttack'], ['+hero.maxHit', '+hero.hitChance', ['+hero.crit', 'a crit is rolled on the same blow by rollCrit, called beside rollAttack in src/core/hunt/damage.js']], ['hero.blow']),
  'C-WEAKNESS': f(['src/core/combat.js#weaknessInfo'], [['+gear.weapon', 'the weapon\'s type and its element arrive on the equipment stats'], ['+gear.special', 'bane is a special attribute on worn gear']], ['hero.weakFactor', 'drop.chance'],
    { as: { accuracy: 'hero.weakFactor' }, note: 'weaknessInfo also carries the monster\'s dropBonus out as dropMult, so a drop\'s chance passes through the weakness reader' }),
  'C-HURT': f(['src/core/hunt/damage.js#hurt'],
    [['+hero.blow>dmg.toMon', ARG], ['+hero.castAmount>dmg.toMon', ARG], ['+status.tick>dmg.toMon', ARG], '+mon.element>dmg.toMon', '-mon.defCut>dmg.toMon', ['+hero.castPower>dmg.toMon', 'the cast\'s power is the ability row\'s mult'],
      ['+mon.vuln>dmg.toMon', 'a mark is folded into the cast\'s power by the caller'], '+mon.guard>dmg.toMon', '+temper.blows>dmg.toMon', '+stance', ['+mon.maxHit>dmg.toHero', ARG], ['+mon.hitChance>dmg.toHero', 'a blow that misses never reaches hurt'], ['+mon.spell>dmg.toHero', ARG],
      '-hero.mitigation>dmg.toHero', '-hero.shell>dmg.toHero', '-temper.armor>dmg.toHero', '~training.dummy>dmg.toHero', ['~aggro>dmg.toHero', 'which hero a monster turns on decides whose armor meets the blow']],
    ['dmg.toMon', 'dmg.toHero'], { as: { hp: ['dmg.toMon', 'dmg.toHero'], shield: 'hero.shell', armorPm: 'temper.armor', blowsPm: 'temper.blows', dealt: 'stance' }, skip: { armourVs: 'the worn armor is passed on to mitigate: C-ARMOR-CHAIN reads it' } }),
  'C-MON-DEF': f(['src/core/combat.js#defenceReduction,COMBAT_BALANCE.monsterDefenseDamageReduction'], ['+mon.def'], ['mon.defCut'], { as: { def: 'mon.def' } }),
  'C-ELEMENT-MON': f(['src/core/elements.js#elementPermille'], [], ['mon.element']),
  'C-VULN': f(['src/core/hunt/damage.js#takenPmOf', EFFECT], ['+status.mark'], ['mon.vuln']),
  'C-STANCE': f(['src/data/rule-subjects.js#HUNT_STANCES'], [], ['stance']),
  'C-TEMPER': f(['src/core/temper.js#rungPmOf,blowsPmOf,armorPmOf,temperedAmount'], ['+temper.rungs', '+gear.armor>temper.armor', ['+hero.buff>temper.armor', 'worn steadyPm and a food\'s steady join the armor cut where the unit is built']], ['temper.blows', 'temper.armor'], { as: { def: 'gear.armor' } }),
  // ── combat: casts ──
  'C-SPELL-HIT': f(['src/data/abilities.js#hitRange,blowShare,castAmount', EFFECT], ['+hero.maxHit'], ['hero.castAmount'], { as: { blowShare: 'hero.castAmount', landHit: 'hero.castAmount', hitPm: 'hero.castAmount' } }),
  'C-SPELL-HEAL': f(['src/data/abilities.js#castAmount', EFFECT], ['+hero.maxHit', '+hero.maxHp', ['+hero.castPower', 'the cast\'s power is the argument pm'], ['+temper.blows', 'Tempering raises every heal where it lands'], ['-heal.cut', 'the heal cut is taken where the heal lands']], ['hero.healCast'],
    { as: { hp: 'hero.healCast' } }),
  'C-SPELL-SHELL': f(['src/data/abilities.js#castAmount', 'src/core/hunt/abilities.js#landsShield,shieldRefund', EFFECT], ['+hero.maxHit', ['+hero.castPower', 'the cast\'s power is the argument pm']], ['hero.shell', ['hero.manaCost', 'a recast of a self shell refunds the unused part as mana']],
    { as: { mana: 'hero.manaCost' }, skip: { maxHp: 'landsShield passes the caster\'s max HP on to castAmount, where only Mend reads it' } }),
  'C-CAST-POWER': f(['src/data/runes.js#versionStep,versionLevel', 'src/core/hunt/abilities.js#surged', EFFECT], ['+hero.skill', ['+gear.perk', 'Surge is a jewel perk, read off the unit as surgePm']], ['hero.castPower'],
    { as: { level: 'hero.skill' }, skip: { heals: 'Surge asks only whether the row lands a number', shells: 'the same question' } }),
  'C-STATUS': f(['src/core/hunt/status.js#stackScale,tickAmount,stacksOf,countOf,applyStatus,tickStatuses'], ['+hero.maxHit>status.tick', '+hero.castPower', '-hero.resist'],
    ['status.tick', ['status.mark', 'a marking status is a row with takenPm, landed by applyStatus'], ['status.wither', 'a heal-cutting status is a row with healCutPm, landed by applyStatus'], ['unit.slow', 'a slowing status is a row with slowPm, landed by applyStatus']],
    { as: { maxHit: 'hero.maxHit', runeTier: 'hero.castPower', landHit: 'status.tick', resistPm: 'hero.resist', healCutPm: 'status.wither' } }),
  'C-HEAL-CUT': f(['src/core/hunt/heal-cut.js#healCutPmOf,healTaken'], ['+status.wither', ['-hero.resist', 'a hero\'s necrotic resistance shortens the cut, read where Withered lands']], ['heal.cut']),
  'C-LEECH': f(['src/core/hunt/abilities.js#leechBack,manaBack', 'src/core/hunt/damage.js#focusBack', EFFECT], [['+dmg.toMon', 'the HP a hit took arrives as the argument'], '-heal.cut', '+hero.maxMana'], ['hero.leech'],
    { as: { hp: 'hero.leech', maxHp: 'hero.leech', mana: 'hero.leech', manaBack: 'hero.leech' } }),
  'C-AREA': f(['src/core/hunt/abilities.js#effect', 'src/data/abilities.js#areaSpec', 'src/core/hunt/damage.js#followThrough'],
    [['+pull.size', 'a shape hits every engaged monster it covers, so more standing is more hit']], ['fight.targets'],
    { as: { landHit: 'fight.targets' }, skip: { living: 'a party heal or shell walks the living heroes', weakPm: 'the hit\'s weak share is passed on to hurt: C-ELEMENT-MON\'s', challengeFrom: 'a taunt row is handed to C-TARGET\'s challengeFrom' },
      note: 'effect is the one resolver of a cast, so it is also a home of the hit, the heal, the shell, the mark, the leech and the cast\'s power. Area and extra targets are the part it decides itself' }),
  'C-CLOCKS': f(['src/core/combat.js#COMBAT_BALANCE.tickMs', 'src/core/hunt/damage.js#slowed,slowPmOf'], ['+unit.slow'], ['clock.swing', ['clock.cast', 'lanes and cooldowns are rows of src/data/abilities.js ABILITIES and ABILITY_LANES']]),
  'C-MANA': f(['src/core/hunt/abilities.js#regenMana'], ['+hero.maxMana', '+flame.rate'], ['hero.manaRegen', ['hero.manaCost', 'a cast\'s mana is its row\'s in src/data/abilities.js ABILITIES, spent in fire']]),
  'C-REGEN': f(['src/core/hunt/pull-cycle.js#tickHeroes'], ['+hero.maxHp', '+flame.rate', '-heal.cut'], ['hero.regen'], { as: { hp: 'hero.regen', maxHp: 'hero.maxHp' } }),
  // ── combat: the monster's blow and the hero's armor ──
  'C-MON-BLOW': f(['src/core/combat.js#monsterMaxHit,COMBAT_BALANCE.monsterAttackDamageScale,COMBAT_BALANCE.monsterDamageScaleByTier'], ['+mon.atk', ['+tier.dmg', 'the tier\'s dial multiplies atk before this is called (src/data/hunt-tiers.js atTier)']], ['mon.maxHit'], { as: { atk: 'mon.atk' } }),
  'C-MON-TOHIT': f(['src/core/combat.js#monsterCombatRolls,monsterAccuracy,monsterAim', RATIO], ['+mon.aim', '-hero.skill', '-gear.guard', ['+tier.dmg', 'the tier\'s dial multiplies aim before this is called']], ['mon.hitChance'],
    { as: { accuracy: 'mon.hitChance', toHitRatio: 'mon.hitChance', heldToHit: 'mon.hitChance', TO_HIT: 'mon.hitChance' }, skip: { maxHit: 'monsterCombatRolls returns the largest blow beside the chance: C-MON-BLOW computes it', monsterMaxHit: 'the same' } }),
  'C-ARMOR-CHAIN': f(['src/core/mitigation.js#curve,NO_MITIGATION,mitigationOf,mitigationFor,mitigate'], ['+gear.armor', '-mon.level', ['-tier.dmg', 'the tier\'s dial raises the Level armor reads'], ['+hero.resist', 'the resistance is one step of the chain, passed in as the element\'s permille'], '+temper.armor'], ['hero.mitigation'],
    { as: { level: 'mon.level' } }),
  'C-RESIST-HERO': f(['src/core/elements.js#resistProfile,heroElementPermille', 'src/core/combat.js#resistOf'], [['+gear.special', 'resistPm is an attribute a worn piece carries']], ['hero.resist', ['status.wither', 'a Necrotic hit lands Withered']]),
  'C-MON-STATS': f([SHEET, 'src/data/to-hit.js#aimFor,evasionFor'],
    ['+mon.level', ['+hero.maxHp>mon.atk', 'a blow is a share of a same-Level hero\'s base HP (STAT_FORMULA.refHp reads VITALS)'], '+ref.hero>mon.aim,mon.evasion'], ['mon.hp', 'mon.atk', 'mon.aim', 'mon.evasion', 'mon.def'],
    { as: { hp: 'mon.hp', level: 'mon.level', def: 'mon.def', heldToHit: 'mon.aim', TO_HIT: 'mon.aim', accuracy: 'ref.hero' }, skip: { maxHit: 'DAMAGE_SCALE_BY_TIER turns a blow back into atk: C-MON-BLOW owns the scale', DAMAGE_SCALE_BY_TIER: 'the same' } }),
  'C-REF-HERO': f(['src/data/to-hit.js#REF_HERO,refHeroAt'], ['+hero.level', ['!hero.skill', 'the career table was measured on a played lone hammer'], ['!gear.weapon', 'the same career wore the weapon line of its day']], ['ref.hero'], { as: { level: 'hero.level', accuracy: 'ref.hero' } }),
  'C-TIER': f(['src/data/balance-sheet.js#TIER_DIALS,tierRowFor,TIER_PULL_FROM_FLOOR,TIER_PULL_OVERRIDES', 'src/data/hunt-tiers.js#atTier,levelAtTier,pullOfTier'], [], ['tier.dmg', 'tier.hp', 'tier.xp', 'tier.pull'],
    { skip: { level: 'levelAtTier raises the monster\'s Level as armor reads it: the write is tier.dmg', levelAtTier: 'the same', hp: 'atTier multiplies the row\'s HP by the dial: the write is tier.hp', atk: 'atTier multiplies atk by the dial: the write is tier.dmg', aim: 'the same', xp: 'atTier multiplies the row\'s kill XP by the dial: the write is tier.xp' } }),
  'C-MON-SPELL': f(['src/data/monster-spells.js#FAIR_WARNING,SPELL_ROLL,SHIELD_BRACE,SPELL_STAGGER,firstCastSteps,MAX_SPELLS,SPELL_BOUNDS,minWindupMs,spellHit'], [['+mon.maxHit', 'the largest blow arrives as the argument'], '-gear.guard'], ['mon.spell'], { as: { hitPm: 'mon.spell', cdMs: 'mon.spell' } }),
  'C-BOSS-PHASE': f(['src/core/hunt/boss-phases.js#swingRow,guardPmOf,crossLines,hastened,spellCdOf,hastenNow'], [], ['mon.guard', 'mon.atk', 'mon.aim', 'mon.spell', ['pull.size', 'his adds are spawned when the line is crossed (spawnAdds)']],
    { as: { cdMs: 'mon.spell', cdPm: 'mon.spell' }, skip: { hp: 'a boss\'s lines are read off his HP share', maxHp: 'the same' } }),
  'C-BOSS-ROOM': f(['src/core/hunt/boss-room.js#roomOf'], [], ['pull.rows']),
  'C-RUN-ROOM': f(['src/core/hunt/tower.js#towerRoom,rolesOf,poolAt,towerLevelOf,heatOpts'], [], ['pull.rows', ['mon.level', 'a floor is the stat formula at Level F'], ['mon.atk', 'past floor 100 every blow is x1.012 a floor']], { as: { level: 'mon.level' } }),
  'C-SCALED': f(['src/data/scaled-hunts.js#formulaOf,scaledStats,scaledRow'], ['+hero.level'], ['mon.level', 'mon.hp', 'mon.atk', 'mon.aim', 'mon.evasion', 'mon.def', 'kill.xp', 'kill.coin', 'xp.share', 'drop.rolls'],
    { as: { hp: 'mon.hp', level: 'mon.level', def: 'mon.def', xp: 'kill.xp', xpPm: 'kill.xp' } }),
  'C-TARGET': f(['src/core/hunt/targeting.js#peel,isTank,underHoldFloor,pickInForce,turnTanks,holderTank,challengeable,challengeFrom'], ['~hero.maxHp'], ['aggro'], { as: { maxHp: 'hero.maxHp' }, skip: { living: 'the living tanks are counted to pick a holder', livingOf: 'the same' } }),
  'C-LEASH': f(['src/core/hunt/leash.js#inArea,heldPocket,leashAllows,holderOutside,isAdd,resetPack'], [], ['aggro', 'mon.fightHp'], { as: { hp: 'mon.fightHp', maxHp: 'mon.fightHp' }, note: 'a pack that resets heals to full' }),
  'C-PULL': f(['src/core/hunt/pull-cycle.js#placeRow,spawnPack,startPull'], ['+mon.hp>mon.fightHp', '+pull.rows>pull.size', ['+tier.hp>mon.fightHp', 'atTier multiplies the row\'s HP by the dial where the monster is placed'], ['+tier.pull>pull.size', 'the tier\'s pull is the count the rows are filled to']], ['mon.fightHp', 'pull.size'], { as: { hp: ['mon.fightHp', 'mon.hp'] } }),
  'C-GEAR-ARMOR': f(['src/data/gear-tiers.js#ARMOUR_SLOTS'], [['+gear.tier', 'the table is one row a tier']], ['gear.armor'], { as: { def: 'gear.armor' } }),
  'C-GEAR-WEAPON': f(['src/data/gear-tiers.js#WEAPON_FAMILIES'], [['+gear.tier', 'the table is one row a tier']], ['gear.weapon'], { as: { atk: 'gear.weapon' } }),
  'C-JEWEL-PERKS': f(['src/core/combat.js#jewelPerksOf,equipmentStats,selfHealWorn'], [], ['gear.perk', ['hero.crit', 'critB sums across worn pieces'], ['hero.skill', '+skill sums across worn pieces'], 'hero.regen', 'gear.guard', 'hero.buff'],
    { skip: { resistOf: 'equipmentStats carries the worn resistance on: C-RESIST-HERO sums and caps it', resistPm: 'the same', skillPlusWorn: 'equipmentStats carries the worn +skill on: P15 sums it', equipmentStats: 'the summing reader itself' },
      note: 'equipmentStats is the one reader that walks the worn set: every worn modifier a fight reads is summed or picked here' }),
  'C-TRAINING': f(['src/core/hunt/training.js#dummyBlow,dummyStands'], [], ['training.dummy'], { as: { hp: 'training.dummy', maxHp: 'training.dummy' } }),
  // ── progression ──
  'P01': f(['src/core/xp.js#levelCurveRowsOf,LEVEL_ROWS,levelCurveRows,totalIn,xpForLevelOn,charXpForLevel,charLevelFromXp'], [['@+hero.levelXp>hero.level', 'the total arrives as the argument'], ['!pace.contract', 'the curve was fit to the pace contract by hand']], ['level.cost', ['hero.level', 'charLevelFromXp returns the Level a total makes']]),
  'P02': f(['src/data/balance-sheet.js#contractXpPerH'], [['!levelXpPerH', 'the contract was written from measured Level XP an hour']], ['pace.contract']),
  'P03': f(['src/core/xp.js#SKILL_TOTAL,powNum,powDen,growSkillTo,isCapped,skillCapOf,skillXpForLevel,skillLevelFromXp'], ['@+hero.skillXp>hero.skill'], ['skill.cost', 'hero.skill'],
    { as: { xp: 'hero.skillXp' }, skip: { MAX_LEVEL: 'a capped skill is handed to P04\'s table', xpForLevel: 'the same', levelFromXp: 'the same' } }),
  'P04': f(['src/core/xp.js#XP_TABLE,MAX_LEVEL,levelFromXp,xpForLevel,xpToNext,xpPct'], [], ['town.skill'], { as: { xp: 'town.skill' } }),
  'P05': f(['src/core/progression.js#grantXp'], [['+skill.xpRaw', 'the amount arrives as the argument'], '+perk.xp'], ['hero.skillXp'], { as: { skillLevelFromXp: 'hero.skillXp' } }),
  'P06': f(['src/core/hunt-rewards.js#rewardSwing,hitSkillOf'], [['+dmg.toMon', 'the damage a blow dealt arrives on the swing event']], [['skill.xpRaw', 'the swing\'s XP is handed to the grant by the caller']],
    { skip: { mana: 'the mana a cast spent is passed to P08', xpPm: 'the tier\'s dial is passed to the kill payer', livingAt: 'the living heroes are passed to the kill payer', shield: 'whether the hero holds a shield is passed to P07', magicXpFor: 'P08\'s', defenseXp: 'P07\'s', magicXpMult: 'P08\'s' } }),
  'P07': f(['src/core/hunt-rewards.js#defenseXp'], [['+mon.level', 'the attacker\'s Level is read off its row'], '+tier.dmg', '+gear.guard', ['~aggro', 'Defense XP is paid for a blow aimed at this hero']], ['skill.xpRaw'], { as: { shield: 'gear.guard', levelAtTier: 'tier.dmg' } }),
  'P08': f(['src/core/hunt/xp-share.js#magicXpFor'], [['+hero.manaCost', 'the mana spent arrives as the argument']], ['skill.xpRaw']),
  'P09': f(['src/core/hunt/training.js#slicer,SLICERS,sliceOf,trainingTick'], ['~clock.swing'], ['hero.skillXp'], { note: 'the pay is a rate an hour, sliced over the swings of that hour' }),
  'P11': f(['src/core/vitals.js#maxHpFor,maxManaFor'], [['+hero.level', 'the Level arrives as the argument'], ['+gear.armor', 'heavy slots raise HP and light slots raise mana (the armor weights)']], ['hero.maxHp', 'hero.maxMana']),
  'P15': f(['src/core/combat.js#skillPlusOf,skillPlusWorn'], [['+gear.special', 'a +skill is an attribute a worn piece carries']], ['hero.skill']),
  'P19': f(['src/data/special-attributes.js#SPECIAL_TIERS,SPECIAL_ATTRIBUTES'], [['+gear.tier', 'an attribute\'s size is by gear tier']], ['gear.special'], { skip: { resistPm: 'a row names the field it adds to: C-RESIST-HERO sums it', critB: 'the same: C-JEWEL-PERKS sums it', def: 'the same', maxHp: 'the same', reqLv: 'a sample piece names the Level that may wear it' } }),
  'P20': f(['src/core/hunt/xp-share.js#splitKillXp,shareKillXp,multOf'], ['+kill.xp', '+xp.share', '+tier.xp', '+xp.event', ['-party.size', 'a kill is split among the living heroes']], ['hero.levelXp'], { as: { xp: ['kill.xp', 'hero.levelXp'] }, skip: { heroLv: 'a seat\'s Level is passed to the under-floor share (P23)' } }),
  'P21': f(['src/data/party-class-xp.js#SOLO_XP_PM,PARTY_CLASS_XP,partyClassXp'], [], ['xp.share']),
  'P22': f(['src/data/tower.js#TOWER_PARTY_XP'], [], ['xp.share']),
  'P23': f(['src/data/hunt-grounds.js#underFloorSharePm'], [['+hero.level', 'the seat\'s Level arrives as the argument']], ['xp.share']),
  'P25': f(['src/data/session-modes.js#SESSION_MODES'], [], ['xp.share', 'death.mode'], { as: { xpPm: 'xp.share' } }),
  'P27': f(['src/data/live-events.js#LIVE_EVENT_TYPES,LIVE_EVENTS'], [], ['xp.event']),
  'P28': f(['src/core/action-rules.js#levelDeathLoss,skillDeathLoss,modeDeathShare,deathXpLoss'], ['+hero.levelXp', '+skill.cost', '+hero.skill', '+death.mode', ['+level.cost', 'the loss is a share of the total Level XP a Level stands on'], ['-blessing.cut', 'a Blessing cuts the loss where the death is settled']], ['death.xpLoss'], { as: { xp: 'hero.levelXp', levelXp: 'hero.levelXp' }, skip: { level: 'the Level is returned beside the loss' } }),
  'P30': f(NO_HOME, [], [], { note: 'CUT 2026-11-21 (the register keeps the row): the rested bank reads and writes nothing' }),
  'P31': f(['src/core/perks.js#PERMANENT_CAP,GOVERNED,governed,own,clampPermanent,permanentBonus,makeBonus'], [], ['perk.xp', 'perk.permanent', 'perk.goldFind']),
  'P35': f(['src/data/gear-tiers.js#LEVEL_REQ'], [['+hero.level', 'a piece names the Level that may wear it']], ['gear.tier']),
  'P37': f(NO_HOME, [['+hero.level', 'the simulator gives a hero the skills of its Level'], ['!skill.cost', 'the lines were measured on the skill curve of their day']], [['hero.skill', 'tools/balance-sim/skill-lines.mjs: in a simulated cell this row sets the skill, not P03']], { note: 'tools only: tools/balance-sim/skill-lines.mjs is not rule code' }),
  // ── hunting and economy ──
  'E01': f([SHEET, 'src/data/balance-sheet.js#GROUND_XP_FIT'], ['+mon.level', '+mon.hp', ['!pace.contract', 'the XP line and each ground\'s fit were typed until the ground paid its contract']], ['kill.xp'], { as: { xp: 'kill.xp' } }),
  'E10': f(['src/data/hunt-grounds.js#pullRows'], [['+tier.pull', 'the fill rows go round up to the tier\'s pull']], ['pull.rows']),
  'E11': f(['src/core/hunt/pull-cycle.js#respawnPacks'], [], ['pack.respawn'], { skip: { spawnPack: 'a pack that is back is placed by C-PULL\'s spawnPack' } }),
  'E12': f(['src/core/hunt/pull-cycle.js#runPhase,travel,nextPocket'], ['+pack.respawn'], ['pull.gap'], { skip: { tickHeroes: 'the phase loop calls the heroes\' regeneration step: C-REGEN owns it' } }),
  'E14': f(NO_HOME, [], [], { note: 'emergent: no formula computes XP, kills or gold an hour. The O- rows below stand for it' }),
  'E15': f(['src/core/hearthfind.js#deriveOneIn'], [['!killsPerH', 'actions an hour is an authored number a row, typed from a measured rate']], ['drop.rare']),
  'E16': f(['src/data/hunt-sessions.js#STAMINA_MAX_MS'], [], ['stamina']),
  'E17': f(['src/data/stamina-refill.js#refillPrice'], [['+hero.level', 'the hero\'s Level arrives as the argument'], ['+stamina', 'the price is by the minutes of the bar a refill restores']], ['refill.price']),
  'E18': f(['src/core/hunt/consumables.js#consume,use'],
    [['+dmg.toHero>supplies.used', 'a heal is used on missing HP'], ['+hero.manaCost>supplies.used', 'a draught is used on missing mana'], ['-hero.healCast>supplies.used', 'a spell heal leaves less HP for food to restore'], ['-hero.regen>supplies.used', 'the same'], ['-hero.leech>supplies.used', 'the same'],
      ['-hero.manaRegen>supplies.used', 'regenerated mana leaves less for a draught'], ['-hero.maxMana>supplies.used', 'a larger pool goes longer before a draught'], ['+shop.price>supplies.cost', 'a store unit costs the catalogue\'s unit price']],
    ['supplies.used', 'supplies.cost'], { as: { use: 'supplies.used' }, skip: { livingOf: 'the living heroes are walked in turn' } }),
  'E20': f(['src/core/hunt/consumables.js#slotWants,consumeOrder,takeover,kindOfAction'], [], ['supplies.used'], { note: 'the rules of use (which slot, under what HP or mana, on what cooldown) are rows a player sets: this formula reads no other formula\'s number' }),
  'E23': f([SHEET, 'src/data/balance-sheet.js#GROUND_GP_FIT'], ['+mon.level', '+mon.hp'], ['kill.coin']),
  'E24': f(['src/core/pacing.js#goldFindMult,applyGoldFind'], [['+coin.share', 'the seat\'s share arrives as the argument'], '+perk.goldFind'], ['hero.coin'], { as: { applyGoldFind: 'hero.coin', goldFindMult: 'perk.goldFind', goldFind: 'perk.goldFind' } }),
  'E25': f(['src/core/party-split.js#splitEven'], [['+kill.coin', 'the kill\'s coin arrives as the argument'], ['-party.size', 'it is split among the seats']], ['coin.share']),
  'E26': f(['supabase/functions/hr-accrue/catalogue.js#vendorPriceOf'], ['+item.book', ['+sale.rate', 'the gear rate and the income dial arrive on the item row'], ['+shop.cheapest', 'a bid is never over half the cheapest shop price']], ['sale.price']),
  'E27': f(['src/data/loot-bands.js#VENDOR_GEAR_RATES,gearSaleRate'], [], ['sale.rate']),
  'E28': f(['src/data/loot-sale.js#saleFitPm'], [], ['sale.rate']),
  'E29': f(['src/core/shop-buyback.js#cheapestShopUnitPrice'], [['+shop.price', 'the offers arrive as the argument']], ['shop.cheapest']),
  'E30': f(['src/data/shops.js#supplyOffer,SHOP_OFFERS,SUPPLY_PRICE_LIST,DERIVED_PRICES'], [['+item.book', 'listed gear, tools and seeds sell at 2 x book']], ['shop.price'], { skip: { VENDOR_GEAR_RATES: 'DERIVED_PRICES names the sale rates beside the shop\'s: E27 owns them', reqLv: 'an offer names the Level that may buy it', HERO_SLOTS: 'the slot prices are E39\'s' } }),
  'E31': f(['src/data/imbuements.js#IMBUE_TIER_FLOORS,imbueTierFor,IMBUE_DROP,imbueValueFor'], [['+mon.level', 'the monster\'s Level arrives as the argument']], ['item.book']),
  'E32': f(NO_HOME, [['+sale.price', 'the floor is the shop\'s bid'], ['+item.book', 'the ceiling is book x 100']], [['sink.other', 'the listing fee and the house cut']], { note: 'SQL only: supabase/migrations/2027-01-12-market-account.sql' }),
  'E33': f(['src/core/bench-tax.js#feeMgOf,taxFor,dueNext,canPayNext,payCraft,craftsCovered'], [['+sale.price', 'the cut is a share of what the output sells for']], ['sink.bench']),
  'E34': f(['src/data/gold-ladders.js#bankRungPrice'], [], ['sink.bank']),
  'E36': f(['src/data/gold-sinks.js#SINK_RULES'], [['+hero.level', 'a priced-by-Level sink reads base + perLevel x Level']], ['sink.town']),
  'E37': f(['src/core/wage.js#blessingPrice'], [['+hero.level', 'the Level arrives as the argument']], ['blessing.price', ['blessing.cut', 'the one Blessing\'s cut is a field of the same row (src/data/blessings.js BLESSING)']]),
  'E38': f(['src/data/temper.js#TEMPER_TIERS,TEMPER_MATERIALS,TEMPER_TIER_RUNG_PM'], [], ['sink.temper', ['temper.rungs', 'a rung is what the gold buys']]),
  'E39': f(['src/data/shops.js#HERO_SLOTS'], [], ['sink.slots']),
  'E40': f(NO_HOME, [], [['sink.other', 'the Hallmark fee by jewel tier']], { note: 'SQL only: supabase/migrations/2027-03-14-jewelry-hallmark.sql' }),
  'E41': f(['src/data/town-works.js#TOWN_WORKS'], [], ['sink.works']),
  'E42': f(NO_HOME, [['+hero.skill', 'the fee is 100 gold x skill level an hour']], [['sink.other', 'the public yard\'s fee']], { note: 'SQL only and staged: supabase/migrations/2027-04-16-combat-training.sql' }),
  'E43': f(['src/data/homestead-tiers.js#HELD_HOME_OFFERS,HELD_HOME_ROOMS,PROPERTY_TIERS,ROOM_RUNGS,STORAGE_CHESTS'], [], ['sink.house']),
  'E44': f(['src/core/drops.js#effectiveDropChance'], ['+drop.base'], ['drop.chance'], { note: 'reads the row\'s written chance and the multipliers on it (the monster\'s dropBonus, a drop buff, a featured row) and writes the chance after them' }),
  'E45': f(['src/core/drops.js#rollDropTable,rollsOf'], ['+drop.chance', '+drop.rolls'], ['drop.items']),
  'E46': f(['src/data/loot-bands.js#BAND_TARGETS'], [['!killsPerH', 'each row\'s chance is typed by hand until a test\'s measured hours land in the band']], ['drop.base']),
  'E47': f(['src/core/party-split.js#rareRoll'], [['+drop.items', 'the unit to give arrives as the argument']], ['drop.rare']),
  'E48': f(['src/core/drops.js#prizeChance,prizeSlices,rollPrize'], [], ['drop.rare'], { as: { ch: 'drop.rare' } }),
  'E49': f(['src/data/chests.js#CHEST_LUCK'], [], ['drop.rare']),
  'E51': f(['src/core/trophies.js#trophyDropMultFor,trophyDamageMultFor,memoryDropMult'], [], ['drop.chance'], { note: 'dead on the hunt path: nothing in a hunt reads these multipliers' }),
  'E52': f(NO_HOME, [], [['drop.chance', 'Boss of the day x1.5 drops'], ['kill.xp', 'and x1.25 XP']], { note: 'dead on the hunt path, and its file src/core/botd.js is gone from the tree' }),
  'E53': f(NO_HOME, [], [['sink.other', 'a bounty\'s reward']], { note: 'SQL only: supabase/migrations/2026-08-23-bounty.sql' }),
  'E54': f(NO_HOME, [], [['drop.chance', 'one Magic Find budget a hero'], ['sink.other', 'a Luck rank costs 100 x n^2']], { note: 'unbuilt (ruled 2026-11-20)' }),
  'E55': f(NO_HOME, [], [['hero.resist', 'an element guard'], ['hero.leech', 'or a leech']], { note: 'unbuilt (ruled 2026-11-18)' }),
  'E56': f(NO_HOME, [['+killsPerH', 'hero-hours times what an hour of kills pays'], ['+hero.coin', 'coin in'], ['+sale.price', 'sold loot'], ['-supplies.cost', 'store supplies'], ['-refill.price', 'refills'], ['-blessing.price', 'Blessings'], ['-sink.bank', 'bought sinks'], ['-sink.town', 'bought sinks'], ['-sink.temper', 'bought sinks'],
    ['-sink.slots', 'bought sinks'], ['-sink.house', 'bought sinks'], ['-sink.works', 'gifts'], ['-sink.bench', 'taxes'], ['-sink.other', 'fees held in SQL']], [['gold.day', 'tools/balance-program/gold-model.mjs approximates it']], { note: 'no formula in the game: a tool approximates the account-day' }),
});

/* ── THE OUTCOME READERS: what each measured outcome follows. Hand-declared, every row, with the reason. ── */
const o = (reads, writes, why) => Object.freeze({ reads: Object.freeze(reads), writes: Object.freeze(writes), why });
export const OUTCOME_READERS = Object.freeze({
  'O-TTK': o(['+mon.fightHp', '-dmg.toMon', '+clock.swing', '+clock.cast', '-fight.targets', '+pull.size'], ['ttkS'], 'A kill takes the monster\'s standing HP over what lands on it a second. More monsters standing share the party\'s damage'),
  'O-FIGHT': o(['+ttkS', '+pull.size', '-pull.gap', '-pack.respawn'], ['fight.share'], 'Hunted time is fights plus the walk and the wait between them. Longer fights, or shorter gaps, raise the share spent fighting'),
  'O-KILLS': o(['-ttkS', '-pull.gap', '-pack.respawn', '+pull.size', '+huntedShare'], ['killsPerH'], 'Kills an hour: how fast a monster falls, how many stand, and how long until the next pull. A hero whose hunt ended kills no more while the party hunts on (EX-0002, 2026-11-21)'),
  'O-DPS': o(['+dmg.toMon', '-clock.swing', '-clock.cast', '+fight.targets', '+fight.share', '+huntedShare'], ['dps', 'dpsHero'], 'Damage a hunted second counts the walks and rests, so it follows the share of time spent in a fight. A hero whose hunt ended deals no more while the party hunts on (EX-0002, 2026-11-21)'),
  'O-TAKEN': o(['+dmg.toHero', '+fight.share', '+pull.size', '-clock.swing', '~aggro'], ['takenPerH'], 'Damage taken an hour: what a blow lands, how many monsters swing, how often, and how much of the hour they are alive'),
  'O-HEAL': o(['+takenPerH', '-heal.cut'], ['healPerH'], 'Every heal is capped at missing HP, so healing received follows damage taken: a larger heal does not raise it (the sweeps read healing down under a stronger hero). A cut on what lands does lower it: a planted heal cut read healing down on 30 of the 31 cells that moved (EX-0002, 2026-11-21)'),
  'O-LOWHP': o(['-dmg.toHero', '-pull.size', '+clock.swing', '+hero.maxHp', '+hero.healCast', '+hero.regen', '+hero.leech', '-ttkS'], ['lowHpTypical', 'lowHpP10'], 'A fight\'s lowest HP share: the burst that lands a second against the pool and what refills it, over the fight\'s length. Slower swings are less burst'),
  'O-UNDER': o(['-lowHpTypical', '-lowHpP10'], ['hpUnder30', 'hpUnder10'], 'Time spent under an HP line follows how low fights go'),
  'O-DEATHS': o(['-lowHpP10'], ['deathsPer1000h'], 'A death is the tail of the low-HP spread reaching zero'),
  'O-HUNTED': o(['-deathsPer1000h', '+stamina'], ['huntedShare'], 'A death or an empty bar ends a hunt, and the rest of the offered time is not hunted'),
  'O-SUPPLIES': o(['+supplies.used', '+takenPerH', '+fight.share'], ['suppliesPerH'], 'Food follows HP lost and draughts follow mana spent in fights'),
  'O-STORE': o(['+suppliesPerH', '+supplies.cost'], ['storePerH'], 'The store bill is units used times what a unit costs'),
  'O-NET': o(['+killsPerH', '+hero.coin', '+drop.items', '+sale.price', '-storePerH'], ['netPerH'], 'Gold an hour: coin and sold loot from kills, less the store bill'),
  'O-XP': o(['+killsPerH', '+hero.levelXp'], ['levelXpPerH'], 'Level XP an hour is kills an hour times what a kill credits the hero'),
  'O-NETXP': o(['+levelXpPerH', '-deathsPer1000h', '-death.xpLoss', '+huntedShare'], ['netLevelXpPerH'], 'Level XP after deaths: what was earned, less what deaths took, over the time offered'),
  'O-HOURS': o(['-levelXpPerH', '+level.cost'], ['hoursPerLevel'], 'Hours for the next Level: what the Level costs over Level XP an hour'),
  'O-CONTRACT': o(['+levelXpPerH', '-pace.contract'], ['xContract'], 'Level XP an hour over the pace contract at that Level'),
  /* THE SUSTAIN COUNTERS (Balance Lab phase 2: the engine's tally, src/core/hunt/tally.js, read by matrix-metrics.mjs) */
  'O-SUSTAIN': o(['+hero.healCast', '+hero.regen', '+hero.leech', '+supplies.used', '-deathsPer1000h'], ['sustainRatio'], 'Healing received over damage taken. Every heal is capped at missing HP, so it sits near 1 while heroes live: what a death takes is never healed back'),
  'O-REGENSHARE': o(['+hero.regen', '-hero.healCast', '-hero.leech', '-supplies.used'], ['regenShare'], 'Regeneration over everything that came back: more from spells, leech or food leaves less missing HP for regeneration to fill'),
  'O-MANAWAIT': o(['+hero.manaCost', '-hero.manaRegen', '-hero.maxMana', '-supplies.used'], ['manaWaitsPerH'], 'A rule waits for mana when a cast costs more than the pool holds: dearer casts, slower regeneration, a smaller pool and fewer draughts each make it wait more'),
});
/** Where the harness reads each outcome (the readers cite it). */
export const OUTCOME_SOURCE = 'tools/balance-program/matrix-metrics.mjs';

/* ── INTERACTIONS: declared pairs the register's edges do not hold. One shape for every kind of pair, so a later node kind (a gear
   Trait) needs no new field: { id, kind, members: [node id, node id], q, sign, because, source }.
     kind     'feeds' (the first writes what the second reads) · 'stacks' (both write one quantity) · 'excludes' · 'pair' (two picks a
              hero can hold together, read by the dominance check: Trait pairs go here)
     members  node ids of graph.json: a formula id, an outcome reader id, a lever id, or 'trait:<id>' once Traits exist
   Empty today on purpose: every pair found is a finding first (--check lists them), and a row here is how a finding is answered. ── */
export const INTERACTIONS = Object.freeze([]);

/* ── NO INTERACTION, BECAUSE: a written record that clears one ghost edge. { a, b, q, because }. `q` may be '*' for every quantity the
   pair shares. A record that matches no ghost is stale and fails the check. ── */
export const NO_INTERACTION = Object.freeze([]);
