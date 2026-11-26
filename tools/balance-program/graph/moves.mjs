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
  'skill.supply-gates': [['-hero.maxHit', 'a later gate keeps a tier of ammo from a hero longer: a smaller blow'], ['-hero.castPower', 'and a rune spell on a lower version longer']],
  'crit.leather': ['+hero.crit'],
  // ── skills and Levels ──
  'skill.curve': ['+skill.cost', '-hero.skill'],
  'skill.flame-curve': ['+skill.cost'],
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
  'spell.statuses-hidden': ['~status.tick', '~status.mark'],
  'spell.status-keys': ['~status.mark'],
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
  'mon.run-rooms': ['+mon.level', '+mon.hp', '+mon.atk'],
  'mon.boss-kinds': ['~mon.hp', '~mon.atk'],
  'mon.spell-warning': ['~mon.spell'],
  // ── spawns ──
  'spawn.composition': ['~pull.rows'],
  'spawn.density': [['+pull.size', 'density is how many a pocket holds, which the pull rows are filled up to']],
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
  /* wave 3's answers (23-spell-audit.md section 4): a longer Parried window or a longer push means fewer monster blows land on the party */
  'spell.answers': [['-tier.dmg', 'a Parried monster\'s next blow lands nothing, and a Staggered one loses its wind-up and swings pushMs later (abilities.js answer, damage.js resolveAttacks, monster-spells.js land)']],
  'danger.pay': [['+kill.xp', 'on a stance a kill pays a share of the killer\'s own Level from the hours table (danger.js levelShareXp, read by xp-share.js), x the depth ratio'],
    ['+kill.coin', 'on a stance a kill\'s coin is the roll x the pull\'s share x the depth ratio at the wage\'s coin ratio (dangerDial coinPm, read by hunt-rewards.js payKill)']],
  /* THE POWER STEP ON GEAR (lane/r9; declared by lane/econ-levers on the merge, the base's graph --check named it) */
  'danger.power-gear': [['-tier.dmg', 'on the scale a blow at the hero is divided by (1 + powerStep)^steps of the gear part over the ground\'s base (danger.js powerPm)'],
    ['-tier.hp', 'a blow at a monster is multiplied by the same ratio, the same as less health to take']],
  'danger.power-gear-below': [['-tier.dmg', 'under the ground\'s base a gear step counts weightGearBelowPm: a smaller cut on a blow at the hero (danger.js gearSteps)'],
    ['-tier.hp', 'and a smaller cut on the hero\'s own blow']],
  /* THE FOUNDATIONS (lane/foundations-block): the skill part of the power step, the reference skill line and the healer's mana seconds */
  /* the amount pipeline (lane/stage3-pipeline, src/core/hunt/amount.js): on the scale a monster's blow lands its row's x pressurePm, and armor and ward are steps on the hero's two defense ratings */
  'amount.pressure': [['+tier.dmg', 'on the scale every monster blow is its row blow x pressurePm / 1000 before the step contest (amount.js blowAmount)']],
  'amount.defense-split': [['-tier.dmg', 'a heavy piece adds armorSteps to the armor rating: a smaller blow at its wearer from a plain blow (amount.js defenseGearPm)']],
  'danger.loot-step': [['+pull.rows', 'deeper than the reference a kill rolls its own table at dropPm over 1000 (danger.js dangerDial dropPm, drops.js effectiveDropChance): more rows of the pull drop']],
  'danger.power-skill': [['-tier.dmg', 'on the scale a skill over its career line divides a blow at the hero by (1 + powerStep)^steps of the skill part (danger.js skillSteps)'],
    ['-tier.hp', 'and multiplies the hero\'s blow at a monster by the same ratio, the same as less health to take']],
  'sustain.mana-seconds': [['-hero.manaCost', 'a longer pool in seconds is the same pool at a smaller cost a cast once a move\'s mana is a share of it (stage 3); today a definition the heal row is checked against']],
  /* THE ECONOMY LEVERS (lane/econ-levers): the pay floor, the scale's coin level and the store's basics, set together with the wage */
  'danger.pay-floor': [['+kill.xp', 'under the reference a kill pays at least PAY.floor of the table (danger.js depthRatio, read by levelShareXp)'],
    ['+kill.coin', 'the same floor on the coin depth ratio (dangerDial coinPm)']],
  'danger.coin-level': [['+kill.coin', 'a scale kill\'s coin is its roll x coinPm / 1000 (dangerDial coinPm, read by hunt-rewards.js payKill)']],
  /* (lane/monster-roles-ford-wings) the two bridges a formula ground can name beside its band */
  'danger.rows-kept': [['+kill.coin', 'a scale kill\'s coin x rowsKillsHead / the ground\'s reference kills (danger.js rowsKeptOf, on dangerDial coinPm)'], ['+drop.chance', 'and its drop table the same ratio (dropPmAt); the tier path keeps the rows as written']],
  'danger.formula-step': [['-mon.hp', 'raised, every formula monster of the ground stands that many steps weaker at any step (monster-formula.js refMultiple, danger.js formulaBasePull)'], ['-mon.atk', 'the same, its blows']],
  'econ.store-kit': [['+shop.price', 'every store row\'s price is store-kit.js storePrice: its share of the wage at the row\'s step over the reference hour\'s use, floored by the crafted partner']],
  'econ.ammo-floor': [['+shop.price', 'a store shot or cast costs at least this x its crafted partner\'s book (store-kit.js storePrice\'s charge floor)']],
  /* MONSTER ROLES (src/data/monster-roles.js, lane/w2-roles-rows): who takes the blows, not how many */
  'roles.table': [['~tier.dmg', 'a role moves which hero a monster\'s blow lands on (reach) and adds a share of it on heroes beside the target (splash): the damage a seat takes, so the held step']],
  /* MONSTERS FROM THE FORMULA (src/core/hunt/monster-formula.js, lane/monster-formula): on a formula ground only */
  'mf.role-dials': ['+mon.hp', '+mon.atk'],
  'mf.mend': [['+mon.fightHp', 'a Warder\'s mend puts health back on its packmates while the pull lasts']],
  'mf.encounter-per-hero': [['+pull.size', 'a formula ground\'s pull is heroes x encounterPerHero at the reference step (danger.js formulaPull)']],
  'mf.encounter-size': ['+mon.hp'],
  'mf.windup-scale': ['+mon.atk'],
  'mf.blow-cap': ['+mon.atk'],
  'mf.ref': [['~mon.hp', 'the measured reference scales every formula number: its damage a second scales health, its armor share the blows'], ['~mon.atk', 'the same'], ['~mon.aim', 'aim lands hit on the reference hero of refLevel'], ['~mon.evasion', 'evasion the same']],
  'econ.start-gold': [['+gold.day', 'a new hero\'s first purse is gold in, and no formula in the register writes it']],
  'econ.tally': [['+gold.day', 'a tally\'s reward is gold in, and no formula in the register writes it']],
  'econ.faction-stock': [['+sink.other', 'a paid hall or mount piece is gold out, once a company, priced at its top Level (src/data/factions.js stockPrice)']],
  'econ.clans': [['~gold.day', 'clan fees and gifts move gold between accounts, and no formula in the register writes it']],
  'econ.offline-cap': [['+stamina', 'the cap on the hours a hunt runs unwatched, and no formula in the register writes it']],
  /* GEAR IN STEPS (src/data/gear-steps.js, lane/g-gear-steps): no formula in the register writes the step model yet */
  'gear.step-tier': [['~gear.tier', 'tierSteps is the item Levels a base tier spans and wearAhead how early a piece is worn (gear-steps.js tierLevel), so it moves the Level a tier is worn at']],
  'gear.slot-weights': [['~gear.weapon', 'the weights split a kit\'s item Level between slots, summing to 1000 (GS-1): a raised slot takes share from the others'],
    ['~gear.armor', 'the same split, the armor slots\' side']],
  'gear.trait-budget': [['+gear.special', 'a Trait of rank r adds traitSteps[r] to the gear part while its condition holds (gear-steps.js)']],
  'gear.trait-trade': [['+gear.special', 'a trade Trait adds tradeSteps to offense and takes traitSteps from defense while its condition holds (traits.js trade)']],
  'gear.traits': [['~gear.special','each Trait\'s condition and source decide when its steps count and on which ground it rolls']],
  'gear.rarity-hours': [['+gear.special', 'fewer hours a rung (or deeper, or a taller flame) find Trait pieces sooner, so the special gear a kit carries rises (drop-hours.js, trait-roll.js)']],
  /* THE POWER LEDGER (src/data/power-ledger.js, src/core/power-ledger.js, lane/ledger-l1-l3) */
  'gear.trait-rank-gate': [['+gear.special', 'a later entry Level opens a higher Trait rank on the ground (gear-steps.js maxRankAt), so more steps a found Trait can carry']],
  'ledger.aura': [['+gear.special', 'an aura is a party ledger row on every ally in reach (src/core/hunt/auras.js auraRowsOn), counted by clampLedger as the slices are']],
  'ledger.ramp-slices': [['+gear.special', 'a higher slice cap or an earlier ramp lets more conditional steps count on a hero at once (power-ledger.js clampLedger)']],
  /* lane/roads-sample (17-talent-tree.md v3): dark behind TALENT_RULES.live; a build is ledger rows and move modifiers (src/core/talents.js grantsOf) */
  'roads.rules': [['+gear.special', 'a dearer idle point (pointSharePm) takes more steps off a hero who leaves points unspent, as a ledger cost (talents.js grantsOf, the ranks slice)']],
  'roads.borrow-bands': [['+gear.special', 'a smaller penalty or an earlier opening Level lets a borrowed move land more, sooner (talents.js borrowBand, talent-rows.js moddedRow)']],
  'roads.nodes': [['+gear.special', 'a bigger node number is more steps or a stronger move modifier on the hero that owns it, inside the build slice (talents.js grantsOf)']],
  'roads.near-fall': [['+gear.special', 'a wider near-fall band holds a near-fall row (Last Stand) more of the time (talent-rows.js holds)']],
  /* lane/flame-temper-build (21-flame-temper-imbue-loot.md): all dark behind hr_flags; the roller and the bench read them later */
  'flame.levers': [['+drop.base', 'a taller fire multiplies the Rare and Very Rare chance by (1 + luck) (inner-flame.js luckPm), read by the roller (wave 4)'],
    ['+sink.other', 'Remains burned on the fire are taken off the market (hr_flame_burn)']],
  'temper.steps': [['+gear.special', 'each seated rank is +1 item Level on its slot inside the gear part (danger.js gearPartPm)'], ['+sink.temper', 'ranks and re-seats are priced in hours of wage, burned']],
  'imbue.rules': [['+gear.special', 'an imbuement is 2 steps on its cell in the consumable slice (power-ledger.js), once the fight reads its condition'], ['+sink.other', 'the apply fee and the parts are burned']],
  'carry.price': [['+sink.other', 'parts and a fee in hours of wage a Trait step, burned (carry-over.js carryQuote)']],
  'loot.pity': [['~drop.base', 'pity keeps the long-run Rare rate the stated one and narrows the spread between heroes (personal-loot.js)']],
  'gear.ground-tier': [['+gear.tier', 'a scale ground drops one base item Level (danger.js DANGER_GROUNDS gearLevel); a tier up is the next ground\'s base']],
  /* THE WAGE (src/data/wage.js, lane/w-wage) and the day's town work (src/data/work-day.js, R12): priced or capped outside the register */
  'econ.hunt-block': [['+refill.price', 'a bought hunting block is stamina sold for gold at priceHourPm hours of wage an hour (src/core/wage.js blockPrice)']],
  'econ.wage-base': [['+refill.price', 'every block price is written in hours of wage (wage.js wage, read by blockPrice)'],
    ['+blessing.price', 'the Blessing is written in hours of wage at the hero\'s Level (wage.js blessingPrice, lane/level-costs)'],
    ['+reset.price', 'a Talent reset is written in hours of wage at the hero\'s Level (wage.js resetPrice, lane/level-costs)'],
    ['+sink.other', 'market prices and fees are written in hours of wage too (wave 4)']],
  /* THE PER-HERO COSTS BY LEVEL (lane/level-costs, 2026-11-22): the reset's price is outside the register's formulas */
  'econ.reset-price': [['+reset.price', 'a reset costs hoursPm of an hour of wage at the hero\'s Level, x growth a paid reset that day (src/core/wage.js resetPrice)']],
  'econ.wage-step': [['+refill.price', 'the wage grows by it a Level step, and a block is priced at the hero\'s step'],
    ['+sink.other', 'the same growth by depth for market prices and fees (wave 4)'],
    ['+kill.coin', 'the one coin ratio (lane/econ-levers): an hour a step deeper on the scale pays (1 + payStepCoin) more coin, a pull (1 + payStepCoin)(1 + powerStep) (dangerDial coinPm, COIN_STEP)']],
  'econ.work-day': [['+town.skill', 'more minutes of town work a UTC day are more gathering and bench runs (work-day.js freeMin, hr_work_day)']],
  'econ.work-premium': [['+town.skill', 'Premium\'s extra minutes are more town work a day (work-day.js premiumExtraMin)']],
  /* THE TRADES ON ONE CURVE (src/data/trades.js, src/core/trades.js, lane/trade-formulas): town work and its prices, read by the job slice
     (09 section 6) through 1063-trade-formulas-catalogue.generated.sql; no hunt cell reads them */
  'econ.trade-work': [['+sink.other', 'more work-hours behind a kit-hour raise every crafted good\'s V (trades.js tradeCatalogue, value), so its job fee and the store\'s ask'],
    ['-town.skill', 'more work a good is fewer goods a day for the same XP: XP is time, so the Level a day reaches is unchanged and the goods it makes fall']],
  'econ.trade-curve': [['+gold.day', 'a higher yield, speed or quality makes a work-hour\'s goods worth more (trades.js yieldPm, speedPm, finePm): 0.18 hours of wage at Level 1 to 0.46 at 99 with a Mastery and a bench']],
  'econ.trade-table': [['-town.skill', 'more hours to 99 lower the trade Level a day of work reaches (trades.js tradeXpTable, hr_trade_xp)']],
  'econ.job-fee': [['+sink.other', 'a share of every finished good\'s V burned at its job\'s start (trades.js jobFee, hr_trade_job_fee)']],
  'econ.store-lag': [['~sink.other', 'a store further behind asks V at a lower step (a smaller sink, a weaker good); a higher floor share bids more for surplus (a larger faucet, inside the day budget)']],
  'econ.tool-wear': [['-sink.other', 'a longer tool life buys fewer tools and rents fewer hours (trades.js toolLifeMs, toolRentPerHour)']],
  'econ.stream-cover': [['+sink.other', 'a higher cover burns more hunted parts and remains a kit-hour (trades.js tradeCatalogue hunted)']],
  'econ.trade-kinds': [['~sink.other', 'which goods exist and what each is made from decide which streams a hunted hour feeds']],
  /* THE GOLD ESTIMATE (src/data/gold-estimate.js, lane/gold-per-hour): a printed number only; no fight, purse or clock reads it */
  'econ.gold-estimate-risk': [],
});
