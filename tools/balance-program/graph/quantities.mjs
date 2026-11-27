// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph/quantities.mjs — THE CLOSED LIST OF QUANTITIES THE MODEL GRAPH SPEAKS IN (Balance Lab phase 1;
// docs/design/redesign/07-balance-lab.md section 3.1 "typed reads and writes ... from one closed list").
//
// A QUANTITY is a named amount a mechanic consumes or produces: a stat, a chance, a rate, a price, an outcome the matrix measures.
// Every read and write in tools/balance-program/graph/io.mjs names one of these and nothing else. Adding a quantity is adding a row
// here. The check (tools/balance-program/graph.mjs --check) fails a read or write of a name that is not on this list.
//
// KINDS
//   stat      a value the rule code computes or holds (a hero's largest blow, a monster's HP, a kill's XP)
//   outcome   a number the balance matrix measures (tools/balance-program/matrix-metrics.mjs METRICS). Its id is the metric's id
//   emergent  a rate no formula computes and no metric prints, needed to connect the two (the share of hunted time spent in a fight)
//
// TOKENS are how the rule code spells the quantity: identifier and property names, exact and case-sensitive. The derivation
// (graph/derive.mjs) finds each token in a formula's home and the check compares what it finds with what io.mjs declares. A token
// several quantities share (`hp`, `maxHit`, `level`) is a candidate for each: the formula's declaration says which one it means.
// A quantity with no tokens cannot be derived from code. Every read or write of it carries a written reason.
// ════════════════════════════════════════════════════════════════════════

const q = (id, kind, label, tokens = []) => Object.freeze({ id, kind, label, tokens: Object.freeze(tokens) });
const S = 'stat', O = 'outcome', E = 'emergent';

export const QUANTITIES = Object.freeze([
  // ── the hero ──
  q('hero.level', S, 'The hero\'s Level', ['level', 'heroLv', 'leaderLevel']),
  q('hero.levelXp', S, 'Level XP a hero is credited from a kill', ['splitKillXp', 'shareKillXp', 'levelXp', 'xp']),
  q('level.cost', S, 'Level XP one Level costs (the Level curve)', ['charXpForLevel', 'charLevelFromXp', 'xpForLevelOn', 'LEVEL_CURVE', 'LEVEL_ROWS', 'levelCurveRows', 'levelCurveRowsOf']),
  q('hero.skill', S, 'A combat skill\'s level, worn +skill included', ['accLvl', 'dmgLvl', 'skillPlusOf', 'skillPlusWorn', 'levelOf', 'skillLevel', 'skillLevelFromXp', 'meleePlus', 'rangedPlus', 'magicPlus', 'defensePlus', 'SKILL_PLUS_FIELDS']),
  q('skill.xpRaw', S, 'Skill XP a blow, a cast or a monster\'s swing earns, before the grant', ['hitXpPerDamage', 'magicXpMult', 'magicXpFor', 'defenseXp', 'COMBAT_XP']),
  q('hero.skillXp', S, 'Combat skill XP a hero is credited', ['grantXp', 'trainingTick']),
  q('skill.cost', S, 'Skill XP one skill level costs (the skill curves: the Level clock, Inner Flame\'s)', ['skillXpForLevel', 'SKILL_CURVE', 'FLAME_SKILL_CURVE', 'totalsOf', 'walkOf', 'refHealthOf']),
  q('town.skill', S, 'A gathering or crafting skill\'s level (the capped table)', ['XP_TABLE', 'MAX_LEVEL', 'levelFromXp', 'xpForLevel', 'xpToNext']),
  q('hero.maxHit', S, 'A hero\'s largest blow', ['maxHit', 'playerBaseMaxHit', 'strengthLevelScale', 'strengthBonusScale']),
  q('hero.hitChance', S, 'A hero\'s chance to land a basic blow', ['accuracy', 'toHitRatio', 'heldToHit', 'TO_HIT', 'accBonus']),
  q('hero.crit', S, 'Critical blows: the chance and the size', ['critChance', 'critB', 'critBuff', 'critMult', 'critCap', 'rollCrit', 'applyCrit', 'armorSetBonus', 'setBonus']),
  q('hero.weakFactor', S, 'The damage factor against one monster (weapon weakness, bane, weapon element)', ['damageMult', 'weaponMult', 'baneMult', 'elementMult', 'weaknessInfo', 'WEAKNESS_BONUS', 'accuracyMult', 'MAX_TOTAL_DAMAGE_MULT', 'MAX_ELEMENT_MULT', 'elementMultFor']),
  q('hero.blow', S, 'One basic blow\'s amount (0 on a miss)', ['rollAttack']),
  q('hero.castAmount', S, 'A damaging cast\'s amount a hit', ['hitRange', 'hitPm', 'castAmount']),
  q('hero.castPower', S, 'A cast\'s power in permille (rune tier, store share, Surge)', ['versionStep', 'versionLevel', 'surge', 'surged', 'BASIC_EFFECT_SHARE', 'runeTier']),
  q('hero.healCast', S, 'A heal spell\'s amount', ['healPm', 'healHpPm', 'healOne', 'heals', 'castAmount']),
  q('hero.shell', S, 'A shell\'s pool (spent before HP)', ['shieldPm', 'shield', 'shieldBy', 'shells', 'landsShield', 'shieldRefund', 'castAmount']),
  q('hero.maxHp', S, 'A hero\'s max HP', ['maxHpFor', 'maxHp', 'hpBase', 'hpPerLevel']),
  q('hero.maxMana', S, 'A hero\'s max mana', ['maxManaFor', 'maxMana']),
  q('hero.manaRegen', S, 'Mana a hero regenerates', ['regenMana', 'manaRegenPctPerMin', 'manaMilli', 'mana']),
  q('hero.manaCost', S, 'Mana a hero spends on casts', ['mana', 'manaBack']),
  q('hero.regen', S, 'HP a hero regenerates (in and out of a fight, self-heal included)', ['hpMilli', 'oocRegenPermillePerS', 'inFightRegenPermillePerS', 'selfHealPm', 'selfHealWorn', 'tickHeroes']),
  q('flame.rate', S, 'The Inner Flame\'s rate on regeneration', ['regenPm', 'regenPermille', 'FLAME_REGEN']),
  q('hero.leech', S, 'HP and mana a hit or a kill gives back', ['leechPm', 'leechBack', 'manaPerHit', 'manaPerKill', 'focusPm', 'focusBack']),
  q('hero.mitigation', S, 'The share of a landed blow a hero\'s armor removes', ['dodgePm', 'absorbPm', 'ward', 'keepPm', 'mitigate', 'mitigationOf', 'mitigationFor', 'ARMOUR_MITIGATION', 'capPm', 'NO_MITIGATION']),
  q('hero.resist', S, 'A hero\'s element and physical resistance', ['resistPm', 'resistProfile', 'heroElementPermille', 'resistOf']),
  q('hero.buff', S, 'Injected bonuses: damage, crit and steady from food and perks', ['dmgBuff', 'steady', 'steadyPm']),
  q('stance', S, 'Stance: Offensive deals and takes more, Defensive less', ['HUNT_STANCES', 'stanceOf', 'dealt']),
  // ── gear ──
  q('gear.tier', S, 'The gear tier a hero may wear (a Level requirement)', ['LEVEL_REQ', 'reqLv']),
  q('gear.weapon', S, 'Weapon accuracy and damage on worn gear', ['WEAPON_FAMILIES', 'str', 'strBonus', 'accuracyBonusField', 'strengthBonusField', 'equipmentStats', 'ammoShare']),
  q('gear.armor', S, 'Armor points on worn gear', ['ARMOUR_SLOTS', 'armourValues', 'armorPointsOf', 'armourVs', 'def']),
  q('gear.guard', S, 'Guard: Defense from gear outside the armor weights (a shield, a cape)', ['guardB', 'holdsShield', 'SHIELD_BRACE', 'markedPm']),
  q('gear.perk', S, 'Jewel perks (Keen, Steady, Follow, Surge, Focus)', ['jewel', 'jewelPerksOf', 'keen']),
  q('gear.special', S, 'Special attributes on chest gear', ['SPECIAL_ATTRIBUTES', 'SPECIAL_TIERS']),
  q('hero.steady', S, 'The steady cut on damage taken: a cape and a steady meal', ['steadyPmOf', 'armorPm', 'cutAmount']),
  q('perk.permanent', S, 'Permanent perk bonuses (rooms, renown, a companion), held to a cap', ['PERMANENT_CAP', 'clampPermanent', 'permanentBonus', 'GOVERNED']),
  q('perk.xp', S, 'XP channels from perks (allXP, combatXP)', ['allXP', 'combatXP', 'xpMultiplierParts']),
  q('perk.goldFind', S, 'Gold find from perks', ['goldFind', 'goldFindMult', 'applyGoldFind']),
  // ── the monster ──
  q('mon.level', S, 'A monster\'s Level', ['level', 'levelAtTier', 'MONSTER_LEVEL_BY_TIER', 'scaleLevelFor']),
  q('mon.hp', S, 'A monster row\'s HP (the stat formula\'s)', ['hp']),
  q('mon.fightHp', S, 'The HP a monster stands with in a fight (the row\'s, times the tier\'s dial)', ['maxHp', 'placeRow']),
  q('mon.atk', S, 'A monster row\'s attack stat', ['atk', 'blowShare', 'blowShape', 'bossBlow']),
  q('mon.maxHit', S, 'A monster\'s largest blow', ['monsterMaxHit', 'maxHit', 'monsterAttackDamageScale', 'monsterDamageScaleByTier', 'DAMAGE_SCALE_BY_TIER']),
  q('mon.aim', S, 'A monster\'s aim', ['aim', 'aimFor', 'monsterAim', 'monsterAccuracy']),
  q('mon.evasion', S, 'A monster\'s evasion', ['evasion', 'evasionFor', 'monsterEvasion', 'heroHit']),
  q('mon.hitChance', S, 'A monster\'s chance to land on a hero', ['accuracy', 'monsterCombatRolls', 'playerDefense']),
  q('mon.def', S, 'A monster\'s defence stat', ['def']),
  q('mon.defCut', S, 'Whole points a monster\'s defence takes off every blow', ['defenceReduction', 'monsterDefenseDamageReduction']),
  q('mon.element', S, 'What an element is worth on a monster', ['elementPermille', 'elementOn', 'weakShare', 'weakPm', 'ELEMENT_PCT']),
  q('mon.spell', S, 'A monster spell\'s amount and clock', ['spellHit', 'hitPm', 'SPELL_ROLL', 'windupMs', 'spellRow', 'spellCdOf', 'spellCds', 'SPELL_BOUNDS']),
  q('mon.guard', S, 'The share of a blow a guarded boss takes', ['guardPm', 'guardPmOf']),
  q('ref.hero', S, 'The reference hero a monster row is written against', ['REF_HERO', 'refHero', 'refHeroAt']),
  q('tier.dmg', S, 'A tier\'s damage dial (attack, aim and the Level armor reads)', ['dmgPm']),
  q('tier.hp', S, 'A tier\'s HP dial', ['hpPm']),
  q('tier.xp', S, 'A tier\'s kill XP dial', ['xpPm']),
  q('tier.pull', S, 'A tier\'s pull size', ['pull', 'pullOfTier', 'TIER_PULL_OVERRIDES', 'TIER_PULL_FROM_FLOOR', 'pullFromFloor']),
  // ── statuses and clocks ──
  q('status.tick', S, 'A ticking status\'s damage (Bleed)', ['tickAmount', 'stackScale', 'blowPm', 'tickStatuses']),
  q('status.mark', S, 'A marking status (the target takes more)', ['takenPm']),
  q('status.wither', S, 'Withered: a heal-cutting status', ['healCutPm']),
  q('unit.slow', S, 'A slowing status on a unit\'s clock (Chill)', ['slowPm', 'slowPmOf', 'slowed']),
  q('mon.vuln', S, 'How much more a marked target takes', ['takenPmOf', 'markPm', 'markUntil']),
  q('heal.cut', S, 'The cut on every heal a Withered unit takes', ['healCutPmOf', 'healTaken']),
  q('clock.swing', S, 'Milliseconds between basic attacks, heroes and monsters', ['tickMs']),
  q('clock.cast', S, 'Cast clocks: lanes and cooldowns', ['cdMs', 'ABILITY_LANES', 'readyAt', 'clockOf', 'cdPm']),
  // ── a fight ──
  q('dmg.toMon', S, 'An amount that lands on a monster', ['hurt', 'landHit']),
  q('dmg.toHero', S, 'An amount that lands on a hero', ['hurt', 'landHit']),
  q('training.dummy', S, 'The training dummy\'s floor and standing rule', ['dummyBlow', 'dummyStands']),
  q('aggro', S, 'Which hero a monster turns on', ['challengeFrom', 'holdMs', 'peel', 'pickInForce', 'holderTank', 'turnTanks', 'leashAllows', 'resetPack']),
  q('party.size', S, 'Living heroes in the party', ['living', 'livingAt', 'livingOf']),
  q('pull.size', S, 'How many monsters stand in a fight', ['spawnPack', 'density', 'spawnAdds', 'addsPm']),
  q('pull.rows', S, 'Which monsters a pull spawns', ['pullRows', 'towerRoom', 'roomOf', 'rolesOf', 'poolAt']),
  q('pack.respawn', S, 'How long a cleared pack takes to come back', ['respawnMs', 'respawnAtMs', 'respawnPacks']),
  q('pull.gap', S, 'The time between pulls (travel, regroup)', ['regroupMs', 'regroupRadius', 'travel', 'phaseMs', 'runPhase']),
  q('fight.targets', S, 'How many monsters one cast or blow hits', ['areaSpec', 'maxHits', 'covers', 'followThrough', 'FOLLOW_TAG']),
  q('fight.share', E, 'The share of hunted time spent in a fight'),
  // ── rewards ──
  q('kill.xp', S, 'Level XP one kill pays', ['xp', 'groundXp', 'GROUND_XP_FIT', 'floorFit', 'xpFitAt']),
  q('xp.share', S, 'A hero\'s share of a kill\'s Level XP (party table, mode, under-floor)', ['partyPm', 'partyClassXp', 'PARTY_CLASS_XP', 'SOLO_XP_PM', 'TOWER_PARTY_XP', 'underFloorSharePm', 'SESSION_MODES']),
  q('xp.event', S, 'A hero\'s own Level XP multiplier (an XP weekend, a live row)', ['multOf', 'LIVE_EVENTS', 'LIVE_EVENT_TYPES']),
  q('pace.contract', S, 'The Level XP an hour a ground must pay at its Level', ['contractXpPerH']),
  q('kill.coin', S, 'Coin one kill pays', ['gp', 'groundGp', 'GROUND_GP_FIT', 'coinPm', 'perHp', 'gpFitAt']),
  q('coin.share', S, 'A seat\'s share of a kill\'s coin', ['splitEven']),
  q('hero.coin', S, 'Coin a hero banks from a kill'),
  q('drop.base', S, 'A drop row\'s written chance (the band\'s promise)', ['BAND_TARGETS', 'ch']),
  q('drop.chance', S, 'A drop row\'s chance after every multiplier', ['effectiveDropChance', 'dropMult', 'dropBuff', 'dropBonus', 'featuredMult', 'trophyDropMultFor', 'memoryDropMult']),
  q('drop.items', S, 'Items a kill drops', ['rollDropTable', 'dropped']),
  q('drop.rare', S, 'Rare, Trophy, prize and chest odds, and who takes the piece', ['rareRoll', 'prizeChance', 'prizeSlices', 'rollPrize', 'deriveOneIn', 'CHEST_LUCK']),
  q('item.book', S, 'An item\'s book value', ['book', 'imbueValueFor']),
  q('sale.rate', S, 'The share of book value the shop pays (gear rate, income dial)', ['VENDOR_GEAR_RATES', 'gearSaleRate', 'saleFitPm']),
  q('sale.price', S, 'What the shop pays for one unit', ['vendorPriceOf']),
  q('shop.price', S, 'What the shop charges for one unit', ['SHOP_OFFERS', 'supplyOffer', 'SUPPLY_PRICE_LIST']),
  q('shop.cheapest', S, 'The cheapest shop price of one unit of an item', ['cheapestShopUnitPrice']),
  q('supplies.used', S, 'Supplies a hunt uses (units)', ['consumeOrder', 'slotWants', 'starved', 'use']),
  q('supplies.cost', S, 'Gold a hunt spends on store supplies', ['goldOut']),
  q('death.xpLoss', S, 'What a death takes (Level XP and skill progress)', ['deathXpLoss', 'levelDeathLoss', 'skillDeathLoss', 'DEATH_XP_LOSS']),
  q('death.mode', S, 'A session mode\'s share of a death\'s loss', ['deathLossPm', 'modeDeathShare']),
  q('blessing.price', S, 'A Blessing\'s gold price', ['blessingPrice']),
  q('reset.price', S, 'A Talent reset\'s gold price (lane/level-costs: hours of the wage at the hero\'s Level)', ['resetPrice']),
  q('blessing.cut', S, 'The share of a death\'s loss a Blessing takes off'),
  q('stamina', S, 'The stamina bar (hunted hours a start)', ['STAMINA_MAX_MS']),
  q('refill.price', S, 'A stamina refill\'s gold price', ['refillPrice']),
  q('sink.bank', S, 'Bank rung prices', ['bankRungPrice']),
  q('sink.town', S, 'Town sink prices', ['SINK_RULES']),
  q('sink.temper', S, 'Temper on steps\' prices, in hours of wage', ['TEMPER_STEPS']),
  q('sink.slots', S, 'Hero slot prices', ['HERO_SLOTS']),
  q('sink.house', S, 'Property, room, storage and curing slot prices', ['PROPERTY_TIERS', 'ROOM_RUNGS', 'STORAGE_CHESTS', 'HELD_HOME_OFFERS', 'HELD_HOME_ROOMS']),
  q('sink.works', S, 'The Weighhouse goal and gifts', ['TOWN_WORKS']),
  q('sink.bench', S, 'The public bench\'s cut', ['feeMgOf', 'taxFor']),
  q('sink.other', S, 'Prices held only in SQL or not built yet (market fees, Hallmarks, the yard fee, bounties, Luck, linings)'),
  q('gold.day', S, 'Gold in and out an account-day'),
  // ── what the matrix measures (ids are matrix-metrics.mjs METRICS ids) ──
  q('dps', O, 'Actual DPS (the party)'),
  q('dpsHero', O, 'DPS a hero'),
  q('ttkS', O, 'Seconds to kill'),
  q('killsPerH', O, 'Kill rate (the party)'),
  q('takenPerH', O, 'Damage taken an hour'),
  q('healPerH', O, 'Healing an hour'),
  q('lowHpTypical', O, 'Typical low HP (a fight\'s lowest, median)'),
  q('lowHpP10', O, 'Low HP, the worst tenth of fights'),
  q('hpUnder30', O, 'Time under 30% HP'),
  q('hpUnder10', O, 'Time under 10% HP'),
  q('deathsPer1000h', O, 'Deaths a 1,000 hours'),
  q('huntedShare', O, 'Share of the time offered that was hunted'),
  q('suppliesPerH', O, 'Supplies used an hour (units)'),
  q('storePerH', O, 'Supply gold an hour'),
  q('netPerH', O, 'Gold profit or loss an hour (after the store)'),
  q('levelXpPerH', O, 'Level XP an hour'),
  q('netLevelXpPerH', O, 'Level XP after deaths an hour'),
  q('hoursPerLevel', O, 'Hours for the next Level'),
  q('xContract', O, 'Level XP over the pace contract'),
  /* the sustain counters (Balance Lab phase 2: the engine's tally, src/core/hunt/tally.js) */
  q('sustainRatio', O, 'Healing received (food, spells, regeneration) over damage taken'),
  q('regenShare', O, 'Share of the healing received that is regeneration'),
  q('manaWaitsPerH', O, 'Times a rule of the bar waited for mana an hour'),
]);

export const QUANTITY_IDS = Object.freeze(QUANTITIES.map((x) => x.id));
export const OUTCOME_IDS = Object.freeze(QUANTITIES.filter((x) => x.kind === 'outcome').map((x) => x.id));

/** token -> the quantity ids it may mean. */
export function tokenIndex(quantities = QUANTITIES) {
  const m = new Map();
  for (const x of quantities) for (const t of x.tokens) { if (!m.has(t)) m.set(t, []); m.get(t).push(x.id); }
  return m;
}
