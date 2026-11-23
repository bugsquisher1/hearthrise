// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph/moves.mjs — WHAT EACH KNOB AND EACH LEVER MOVES WHEN IT IS RAISED (Balance Lab phase 1). The join of
// tools/balance-program/levers.json and formulas/knobs.json to the quantities of graph/quantities.mjs. Nothing here repeats a lever's
// site, range, class or tests: those stay in the lever registry.
//
//   '+q'  raising the number raises q · '-q' lowers it · '~q' moves it, the direction depends on the case
//   ['+q', 'the reason'] when q is not a quantity the lever's own formulas write (the check demands the reason)
//
// DERIVED WHERE IT CAN BE. A lever needs no row here when
//   it is played through a knob: it moves what its first knob moves (KNOB_MOVES), or
//   its formulas write exactly one quantity: it moves that one, upward.
// Every other lever is declared by hand in LEVER_MOVES, and the check fails a lever that has neither.
// A row in LEVER_MOVES overrides both derivations (a lever that shares a knob with two others and moves one term of it).
// ════════════════════════════════════════════════════════════════════════

/* one row a knob of tools/balance-program/formulas/knobs.json */
export const KNOB_MOVES = Object.freeze({
  playerAttack: ['+hero.maxHit'],
  critMult: ['+hero.crit'],
  weaknessDamage: ['+hero.weakFactor'],
  toHitBase: [['~hero.hitChance', 'the base stands on both sides of both to-hit ratios, and the monster rows are re-written from it'], ['~mon.hitChance', 'the same base, the monster\'s side']],
  heroAccuracy: ['-mon.evasion'],
  attackInterval: ['+clock.swing'],
  spellRollLow: [['+hero.castAmount', 'the low end of a cast\'s roll is ABILITY_RULES in src/data/abilities.js, read by hitRange']],
  manaRegen: ['+hero.manaRegen'],
  storeSupplyShare: ['+hero.castPower'],
  monsterDamage: ['+mon.atk'],
  monsterHp: ['+mon.hp'],
  monsterAccuracy: ['+mon.aim'],
  monsterDefense: [['+mon.def', 'the def line is STAT_FORMULA in src/data/balance-sheet.js, which C-MON-STATS writes and C-MON-DEF reads']],
  monsterDefenseCut: ['+mon.defCut'],
  partyGroundHp: ['+mon.hp'],
  partyGroundBlow: ['+mon.atk'],
  tierDanger: ['+tier.dmg'],
  tierHp: ['+tier.hp'],
  tierXp: ['+tier.xp'],
  tierPull: [['+tier.pull', 'the pull is a column of TIER_DIALS, which C-TIER writes and C-PULL reads']],
  heroHp: ['+hero.maxHp', ['+mon.atk', 'the same two numbers (VITALS hpBase and hpPerLevel) are read by STAT_FORMULA.refHp, so the blow of a monster is written from them too']],
  heroMana: ['+hero.maxMana'],
  armorMitigation: ['+hero.mitigation'],
  armorCurve: ['-hero.mitigation'],
  mitigationCap: ['+hero.mitigation'],
  regen: ['+hero.regen'],
  xpPerKill: ['+kill.xp'],
  xpByLevel: ['+kill.xp'],
  coinPerKill: ['+kill.coin'],
  soloXp: ['+xp.share'],
  partyXp: ['+xp.share'],
  levelCurve: ['+level.cost'],
  deathLoss: ['+death.xpLoss'],
  necroticCut: ['+heal.cut'],
  stormDrain: [['+hero.manaCost', 'a Storm hit burns mana for half the HP it took (C-RESIST-HERO lands it, the drain is spent mana)']],
});

/* levers the two derivations cannot answer, or answer wrongly */
export const LEVER_MOVES = Object.freeze({
  // ── the hero's blow ──
  'blow.weakness-accuracy': ['+hero.hitChance'],
  'damage.element-cap': ['+hero.weakFactor'],
  'damage.total-cap': ['+hero.weakFactor'],
  'damage.bane-cap': ['+hero.weakFactor'],
  'damage.combined-cap-unused': ['+hero.weakFactor'],
  'resist.weapon-resist-unread': ['+hero.weakFactor'],
  'damage.permanent-cap': ['+hero.buff', '+perk.permanent'],
  'weapon.ammo': ['+hero.maxHit'],
  'crit.leather': ['+hero.crit'],
  // ── skills and Levels ──
  'skill.curve': ['+skill.cost', '-hero.skill'],
  'skill.reference-career': ['+ref.hero'],
  'level.mode-share': ['+xp.share', '~death.mode'],
  'level.blessing-cut': ['+blessing.cut'],
  /* lane/formula-overhaul: more hours a Level = slower Levels. On the scale a kill pays XP to the next Level over those hours, so XP a kill
     falls by the same ratio and the Level's cost in XP is untouched */
  'level.hours': [['-kill.xp', 'a scale kill pays (XP to the next Level / hours(L)) / the reference kills (danger.js levelShareXp)'], ['-hero.level', 'fewer Levels an hour at the same depth']],
  // ── clocks and casts ──
  'attack.cast-lanes': ['+clock.cast'],
  'spell.cooldowns': ['+clock.cast'],
  'spell.floor': ['+hero.castAmount', '+hero.healCast'],
  'spell.mana-cost': ['+hero.manaCost'],
  'spell.default-bar': ['~hero.manaCost'],
  'spell.bleed': ['+status.tick'],
  'spell.chill': ['+unit.slow'],
  'heal.shares': ['+hero.healCast', '+hero.shell'],
  'leech.on-kill-perks': ['+hero.leech'],
  // ── armor and resistance ──
  'armor.weights': ['~gear.armor', '~hero.maxHp', '~hero.maxMana'],
  'armor.shield-brace': ['-mon.spell'],
  'resist.hero-caps': ['+hero.resist'],
  'resist.storm-necrotic': ['+heal.cut', '+status.wither'],
  'resist.monster-profile': ['~mon.element'],
  'resist.class-elements': ['~mon.element'],
  // ── monsters ──
  'mon.danger-ramp': ['+mon.atk'],
  'mon.roles': ['~mon.hp', '~mon.atk', '~mon.aim', '~mon.evasion', '~mon.def'],
  'mon.rows': ['~mon.hp', '~mon.atk', '~mon.aim', '~mon.evasion', '~mon.def'],
  'mon.level-by-tier': [['+mon.level', 'MONSTER_LEVEL_BY_TIER sets the Level a row is written at, which C-MON-STATS reads']],
  'mon.behavior': ['~aggro', '~pull.gap'],
  'mon.boss-phases': ['+mon.guard', '+mon.atk', '+mon.aim'],
  'mon.leash': ['~aggro'],
  'mon.tier-overrides': ['~tier.dmg', '~tier.hp', '~tier.xp', '~tier.pull'],
  'mon.scaled-danger': ['+mon.atk', '+mon.aim'],
  'mon.run-rooms': ['+mon.level', '+mon.atk'],
  'mon.spell-warning': ['~mon.spell'],
  // ── spawns ──
  'spawn.composition': ['~pull.rows'],
  'spawn.density': [['+pull.size', 'density is how many a pocket holds, which the pull rows are filled up to']],
  'spawn.tier-pull-floor': ['~pull.size'],
  'spawn.gather-nodes': [['~town.skill', 'gather nodes feed the town skills, outside a hunt']],
  'weapon.role-reach': ['~aggro', '~pull.gap'],
  'party.positioning': ['~aggro', '~pull.gap'],
  'party.tank-rules': ['~aggro'],
  'party.size': ['~xp.share'],
  // ── rewards ──
  'reward.ground-gp-fit': ['+kill.coin', '+sale.rate'],
  'reward.row-xp-gp': ['~kill.xp', '~kill.coin'],
  'reward.common-drops': ['+drop.chance'],
  'rare.band-rows': ['+drop.base'],
  // ── gear ──
  'gear.material-tiers': ['+gear.weapon', '+gear.armor'],
  'gear.accessories': ['~gear.perk', '~hero.crit', '~hero.skill'],
  'gear.jewel-perks': ['+gear.perk'],
  'gear.uniques': ['+gear.armor', '+gear.special'],
  'gear.item-stats': ['~gear.armor', '~gear.weapon'],
  'gear.temper-effect': ['+temper.blows', '+temper.armor'],
  // ── supplies ──
  'cons.store-supplies': ['+shop.price'],
  'cons.food-buffs': ['+hero.buff', '+hero.coin'],
  'cons.use-rules': ['~supplies.used'],
  'cons.food-heal-scale': ['-supplies.used'],
  'cons.rune-price': ['+supplies.cost'],
  'cons.bag-guide': ['~supplies.used'],
  'cons.gold-floor': ['~supplies.cost'],
  'econ.shop-prices': ['+shop.price'],
  // ── the economy outside a hunt ──
  'econ.sale-rates': ['+sale.rate'],
  'econ.blessing-price': ['+blessing.price'],
  'econ.temper-price': ['+sink.temper'],
  'econ.house': ['+sink.house', '~perk.permanent'],
  'econ.training': ['+hero.skillXp', '+sink.other'],
  'econ.scaled-hunts': ['~kill.xp', '~kill.coin', '~drop.rolls', '~xp.share'],
  'econ.town-work': ['~town.skill', '~hero.skillXp'],
  'econ.jewelry-crafting': ['+sink.other', '~gear.perk'],
  'econ.companions': ['+perk.xp', '+perk.permanent', '+perk.goldFind'],
  'econ.recruits': [['~party.size', 'three recruits make a company of four own heroes from Level 5 (RD-Q6 a); whether they hunt together is the player\'s']],
  /* THE DANGER SCALE (src/data/danger.js, lane/v1-climb): on a stance the step writes the dial the tier row writes off it (danger.js dangerDial
     in inst.tier), so its levers move C-TIER's quantities; the pay is the scale's own and is named with its reason */
  'danger.power-step': ['+tier.hp', '+tier.dmg'],
  'danger.pull': ['+pull.size'],
  'danger.start': ['-tier.hp', '-tier.dmg'],
  'danger.climb': ['~tier.hp', '~tier.dmg'],
  'danger.stances': ['~tier.hp', '~tier.dmg'],
  /* a higher holder line breaks a tank's four off sooner: it holds shallower (23-spell-audit.md section 3) */
  'danger.holder-line': ['-tier.hp', '-tier.dmg'],
  'danger.pay': [['+kill.xp', 'on a stance a kill pays a share of the killer\'s own Level from the hours table (danger.js levelShareXp, read by xp-share.js), x the depth ratio'],
    ['+kill.coin', 'on a stance a kill\'s coin is the roll x the pull\'s share x the depth ratio at the wage\'s coin ratio (dangerDial coinPm, read by hunt-rewards.js payKill)']],
  /* THE POWER STEP ON GEAR (lane/r9; declared by lane/econ-levers on the merge, the base's graph --check named it) */
  'danger.power-gear': [['-tier.dmg', 'on the scale a blow at the hero is divided by (1 + powerStep)^steps of the gear part over the ground\'s base (danger.js powerPm)'],
    ['-tier.hp', 'a blow at a monster is multiplied by the same ratio, the same as less health to take']],
  'danger.power-gear-below': [['-tier.dmg', 'under the ground\'s base a gear step counts weightGearBelowPm: a smaller cut on a blow at the hero (danger.js gearSteps)'],
    ['-tier.hp', 'and a smaller cut on the hero\'s own blow']],
  /* THE ECONOMY LEVERS (lane/econ-levers): the pay floor, the scale's coin level and the store's basics, set together with the wage */
  'danger.pay-floor': [['+kill.xp', 'under the reference a kill pays at least PAY.floor of the table (danger.js depthRatio, read by levelShareXp)'],
    ['+kill.coin', 'the same floor on the coin depth ratio (dangerDial coinPm)']],
  'danger.coin-level': [['+kill.coin', 'a scale kill\'s coin is its roll x coinPm / 1000 (dangerDial coinPm, read by hunt-rewards.js payKill)']],
  'econ.store-kit': [['+shop.price', 'every store row\'s price is store-kit.js storePrice: its share of the wage at the row\'s step over the reference hour\'s use, floored by the crafted partner']],
  'econ.ammo-floor': [['+shop.price', 'a store shot or cast costs at least this x its crafted partner\'s book (store-kit.js storePrice\'s charge floor)']],
  /* MONSTER ROLES (src/data/monster-roles.js, lane/w2-roles-rows): who takes the blows, not how many */
  'roles.table': [['~tier.dmg', 'a role moves which hero a monster\'s blow lands on (reach) and adds a share of it on heroes beside the target (splash): the damage a seat takes, so the held step']],
  'econ.start-gold': [['+gold.day', 'a new hero\'s first purse is gold in, and no formula in the register writes it']],
  'econ.tally': [['+gold.day', 'a tally\'s reward is gold in, and no formula in the register writes it']],
  'econ.clans': [['~gold.day', 'clan fees and gifts move gold between accounts, and no formula in the register writes it']],
  'econ.offline-cap': [['+stamina', 'the cap on the hours a hunt runs unwatched, and no formula in the register writes it']],
  /* GEAR IN STEPS (src/data/gear-steps.js, lane/g-gear-steps): no formula in the register writes the step model yet */
  'gear.step-tier': [['~gear.tier', 'tierSteps is the item Levels a base tier spans and wearAhead how early a piece is worn (gear-steps.js tierLevel), so it moves the Level a tier is worn at']],
  'gear.slot-weights': [['~gear.weapon', 'the weights split a kit\'s item Level between slots, summing to 1000 (GS-1): a raised slot takes share from the others'],
    ['~gear.armor', 'the same split, the armor slots\' side']],
  'gear.trait-budget': [['+gear.special', 'a Trait of rank r adds traitSteps[r] to the gear part while its condition holds (gear-steps.js)']],
  'gear.trait-trade': [['+gear.special', 'a trade Trait adds tradeSteps to offense and takes traitSteps from defense while its condition holds (traits.js trade)']],
  'gear.traits': [['~gear.special','each Trait\'s condition and source decide when its steps count and on which ground it rolls']],
  /* THE POWER LEDGER (src/data/power-ledger.js, src/core/power-ledger.js, lane/ledger-l1-l3) */
  'gear.trait-rank-gate': [['+gear.special', 'a later entry Level opens a higher Trait rank on the ground (gear-steps.js maxRankAt), so more steps a found Trait can carry']],
  'ledger.ramp-slices': [['+gear.special', 'a higher slice cap or an earlier ramp lets more conditional steps count on a hero at once (power-ledger.js clampLedger)']],
  'gear.ground-tier': [['+gear.tier', 'a scale ground drops one base item Level (danger.js DANGER_GROUNDS gearLevel); a tier up is the next ground\'s base']],
  /* THE WAGE (src/data/wage.js, lane/w-wage) and the day's town work (src/data/work-day.js, R12): priced or capped outside the register */
  'econ.hunt-block': [['+refill.price', 'a bought hunting block is stamina sold for gold at priceHourPm hours of wage an hour (src/core/wage.js blockPrice)']],
  'econ.wage-base': [['+refill.price', 'every block price is written in hours of wage (wage.js wage, read by blockPrice)'],
    ['+sink.other', 'market prices and fees are written in hours of wage too (wave 4)']],
  'econ.wage-step': [['+refill.price', 'the wage grows by it a Level step, and a block is priced at the hero\'s step'],
    ['+sink.other', 'the same growth by depth for market prices and fees (wave 4)'],
    ['+kill.coin', 'the one coin ratio (lane/econ-levers): an hour a step deeper on the scale pays (1 + payStepCoin) more coin, a pull (1 + payStepCoin)(1 + powerStep) (dangerDial coinPm, COIN_STEP)']],
  'econ.work-day': [['+town.skill', 'more minutes of town work a UTC day are more gathering and bench runs (work-day.js freeMin, hr_work_day)']],
  'econ.work-premium': [['+town.skill', 'Premium\'s extra minutes are more town work a day (work-day.js premiumExtraMin)']],
  /* THE GOLD ESTIMATE (src/data/gold-estimate.js, lane/gold-per-hour): a printed number only; no fight, purse or clock reads it */
  'econ.gold-estimate-risk': [],
});
