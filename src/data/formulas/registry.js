// ════════════════════════════════════════════════════════════════════════
// src/data/formulas/registry.js — THE FORMULA REGISTRY: one row per formula the game publishes.
//
// Tyler 2026-11-08: "I do plan on being transparent about the damage and other formulas for our systems in an
// in game wiki". Every formula lives in ONE data source, carries no hidden case, and the wiki renders it from
// data. This file is what the wiki reads, and what tests/formula-single-source.mjs holds the code to.
//
// A ROW
//   id         '<system>.<what>', never reused
//   title      the wiki page's heading, plain words
//   expr       the formula as the wiki prints it, one step a line, in the same words as `params`
//   params     the numbers, as LIVE REFERENCES to the frozen rows that hold them. Never retyped here: a designer's
//              edit to the row is the wiki's edit.
//   consts     the exported data constants those numbers live in, `file: [names]`. Each name is exported ONCE in
//              the whole tree, from that file, and nothing else may type it (the guard).
//   keys       (optional) the row's own key names inside a constant, when they are distinctive enough to police
//              the same way (`rawRate`); a common word (`base`, `perLevel`) is not listed
//   retired    names the numbers used to carry in code. Nothing may give one a number again.
//   evaluator  'file function': the ONE pure function that computes it (src/core/formulas/evaluators.js EVALUATORS
//              binds the id to it; data never imports core). In src/core, or in the system's own data file when
//              it is the small function that prices that file's rows (blessings.js blessingPrice): the server
//              prices those in SQL from the generated rows and the client draws the server's number.
//   readers    `file: function`: who must CALL the evaluator instead of working the number out again
//
// WHERE A FORMULA'S NUMBERS LIVE. In the system's own data module when it has one (core-model.js, blessings.js,
// stamina-refill.js, temper.js ...), else in a file beside this one (sale.js). Never in src/core, the edge, a
// tool or SQL: core evaluates, the generators copy rows into SQL, the edge and the client import the same
// function. The server stays the only authority: the client calls an evaluator to draw a number, never to send one.
//
// The inventory of every formula and the order they move here: .claude/coordination/formula-home-2026-11-10.md.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { SALE } from './sale.js?v=0.2.114';
import {
  VENDOR_GEAR_RATES, VENDOR_GEAR_TYPES, VENDOR_HOURLY_ARMOR_SLOTS, VENDOR_HOURLY_ARMOR_T2_RATE,
} from '../loot-bands.js?v=0.2.114';
import { VITALS, ARMOUR_SLOTS, FLAME_REGEN, LEVEL_CURVE, SKILL_CURVE, CAPPED_CURVE } from '../core-model.js?v=0.2.114';
import { HUNT_TUNING } from '../hunt-tuning.js?v=0.2.114';
import { DEATH_XP_LOSS, STAMINA_MAX_MS } from '../hunt-sessions.js?v=0.2.114';
import { BLESSING_RULES, BLESSING_CUT_PERMILLE, BLESSING_TIERS } from '../blessings.js?v=0.2.114';
import { STAMINA_REFILL } from '../stamina-refill.js?v=0.2.114';
import { SCALED_HUNTS } from '../scaled-hunts.js?v=0.2.114';
import { TEMPER_RUNGS, TEMPER_RUNG_PM, TEMPER_TIERS } from '../temper.js?v=0.2.114';
import { BENCH_TAX, BENCH_TAX_FREE_UNDER_MG } from '../bench-tax.js?v=0.2.114';
import { HERO_RENAME } from '../hero-rename.js?v=0.2.114';

const row = (r) => Object.freeze({ ...r, expr: Object.freeze(r.expr), params: Object.freeze(r.params), consts: Object.freeze(r.consts),
  keys: Object.freeze(r.keys || []), retired: Object.freeze(r.retired || []), readers: Object.freeze(r.readers || {}) });

export const FORMULAS = Object.freeze([
  row({
    id: 'sale.price',
    title: 'What the shop pays for an item',
    expr: [
      'worth = book value',
      'worn gear (gearTypes): worth = book value x the gearRate of its tier, at least 1',
      'tier 2 armor in hourlyArmorSlots: worth = book value x hourlyArmorT2Rate, at least 1',
      'raw material: worth = worth x rawRate, at least 1',
      'the shop also sells it: never more than its cheapest shop price x buybackRate, at least 1',
    ],
    params: {
      rawRate: SALE.rawRate,
      buybackRate: SALE.buybackRate,
      gearTypes: VENDOR_GEAR_TYPES,
      gearRate: VENDOR_GEAR_RATES,
      hourlyArmorSlots: VENDOR_HOURLY_ARMOR_SLOTS,
      hourlyArmorT2Rate: VENDOR_HOURLY_ARMOR_T2_RATE,
    },
    consts: {
      'src/data/formulas/sale.js': ['SALE'],
      'src/data/loot-bands.js': ['VENDOR_GEAR_RATES', 'VENDOR_GEAR_TYPES', 'VENDOR_HOURLY_ARMOR_SLOTS', 'VENDOR_HOURLY_ARMOR_T2_RATE'],
    },
    keys: ['rawRate', 'buybackRate'],
    retired: ['VENDOR_RAW_RATE', 'SHOP_BUYBACK_RATE'],
    evaluator: 'src/core/formulas/sale.js salePriceOf',
    readers: { 'supabase/functions/hr-accrue/catalogue.js': 'salePriceOf' },
  }),

  /* ── VITALS (numbers: core-model.js VITALS, Tyler 2026-10-19 "10 and 10"; the armor shares are his too). armorSlots is the length of
     core-model.js ARMOUR_SLOTS, which is not listed under consts: gear-tiers.js exports another table by the same name (the six armor
     lines), so the name has two homes until that table is renamed (audit S2). ── */
  row({
    id: 'vitals.max_hp',
    title: 'Max HP',
    expr: [
      'base = hpBase + hpPerLevel x (Level - 1)',
      'heavy armor adds heavyHpPermille / 1000 of base for a full set, in proportion to the heavy pieces worn out of armorSlots',
      'rounded down',
    ],
    params: { hpBase: VITALS.hpBase, hpPerLevel: VITALS.hpPerLevel, heavyHpPermille: VITALS.heavyHpPermille, armorSlots: ARMOUR_SLOTS.length },
    consts: { 'src/data/core-model.js': ['VITALS'] },
    keys: ['hpBase', 'hpPerLevel', 'heavyHpPermille'],
    evaluator: 'src/core/vitals.js maxHpFor',
  }),
  row({
    id: 'vitals.max_mana',
    title: 'Max mana',
    expr: [
      'base = manaBase + manaPerLevel x (Level - 1)',
      'light armor adds lightManaPermille / 1000 of base for a full set, in proportion to the light pieces worn out of armorSlots',
      'rounded down',
    ],
    params: { manaBase: VITALS.manaBase, manaPerLevel: VITALS.manaPerLevel, lightManaPermille: VITALS.lightManaPermille, armorSlots: ARMOUR_SLOTS.length },
    consts: { 'src/data/core-model.js': ['VITALS'] },
    keys: ['manaBase', 'manaPerLevel', 'lightManaPermille'],
    evaluator: 'src/core/vitals.js maxManaFor',
  }),
  row({
    id: 'vitals.regen',
    title: 'HP regeneration',
    expr: [
      'HP a second = max HP x rate / 1000 x flame / 1000',
      'rate = inFight during a fight, resting between fights',
      'flame = 1000 + flameMax x Inner Flame level / (Inner Flame level + flameK), rounded down',
    ],
    params: { inFight: VITALS.inFightRegenPermillePerS, resting: HUNT_TUNING.oocRegenPermillePerS, flameMax: FLAME_REGEN.maxPermille, flameK: FLAME_REGEN.k },
    consts: { 'src/data/core-model.js': ['VITALS', 'FLAME_REGEN'], 'src/data/hunt-tuning.js': ['HUNT_TUNING'] },
    keys: ['inFightRegenPermillePerS', 'oocRegenPermillePerS'],
    evaluator: 'src/core/vitals.js regenPermille',
  }),

  /* ── THE CURVES (numbers: core-model.js; the server's hr_level_curve is generated from LEVEL_CURVE by tools/gen-level-curve.mjs) ── */
  row({
    id: 'level.curve',
    title: 'Level XP',
    expr: [
      'the step from a Level to the next costs first + rise x m + bend x m x m XP',
      'm = how many Levels past the start of its bracket (from) the Level is',
      'first is the curve\'s own for the first bracket, and for each later one the step the bracket before it would have charged next',
      'the last bracket runs forever',
    ],
    params: { first: LEVEL_CURVE.first, brackets: LEVEL_CURVE.brackets },
    consts: { 'src/data/core-model.js': ['LEVEL_CURVE'] },
    evaluator: 'src/core/xp.js charXpForLevel',
  }),
  row({
    id: 'skill.combat_curve',
    title: 'Melee, Ranged, Magic, Defense and Inner Flame XP',
    expr: [
      'the step from a level to the next costs base x level x level x (1 + growthPermille / 1000) to the power (level - 1), rounded down',
      'no cap',
    ],
    params: { base: SKILL_CURVE.base, growthPermille: SKILL_CURVE.growthPermille },
    consts: { 'src/data/core-model.js': ['SKILL_CURVE'] },
    keys: ['growthPermille'],
    evaluator: 'src/core/xp.js skillXpForLevel',
  }),
  row({
    id: 'skill.capped_curve',
    title: 'Gathering and crafting XP',
    expr: [
      'the total XP that reaches a level is that level\'s row in totals (level 1 is the first row)',
      'the last level is maxLevel',
    ],
    params: { maxLevel: CAPPED_CURVE.maxLevel, totals: CAPPED_CURVE.totals },
    consts: { 'src/data/core-model.js': ['CAPPED_CURVE'] },
    retired: ['XP_TABLE'],
    evaluator: 'src/core/xp.js xpForLevel',
  }),

  /* ── DEATH AND WHAT GOLD BUYS (each system's own data file; every server copy is generated from these rows) ── */
  row({
    id: 'death.share',
    title: 'What a death costs',
    expr: [
      'Level XP lost = total Level XP x share, rounded down. It can take a Level, never below Level 1',
      'each combat skill loses share of its progress toward its next level, never a level',
      'Blessings cut the loss by blessingCutPermille / 1000, by how many are held',
    ],
    params: { share: DEATH_XP_LOSS, blessingCutPermille: BLESSING_CUT_PERMILLE },
    consts: { 'src/data/hunt-sessions.js': ['DEATH_XP_LOSS'], 'src/data/blessings.js': ['BLESSING_CUT_PERMILLE'] },
    evaluator: 'src/core/action-rules.js deathXpLoss',
  }),
  row({
    id: 'blessing.price',
    title: 'Blessing prices',
    expr: [
      'free under Level freeUntilLevel',
      'from there each Blessing costs its base + its perLevel x (Level - freeUntilLevel)',
    ],
    params: { freeUntilLevel: BLESSING_RULES.freeUntilLevel, tiers: BLESSING_TIERS },
    consts: { 'src/data/blessings.js': ['BLESSING_RULES', 'BLESSING_TIERS'] },
    keys: ['freeUntilLevel'],
    evaluator: 'src/data/blessings.js blessingPrice',
  }),
  row({
    id: 'stamina.refill',
    title: 'Stamina refill price',
    expr: [
      'the day\'s first full refill costs base + perLevel x Level',
      'refill n of the day costs (stepDen + stepNum x (n - 1)) / stepDen of that',
      'a part refill pays for the minutes it restores out of maxMinPerBuy, rounded up',
      'at most perDay refills a day, and never past the cap (capMs, free and premium)',
    ],
    params: { base: STAMINA_REFILL.base, perLevel: STAMINA_REFILL.perLevel, stepNum: STAMINA_REFILL.stepNum, stepDen: STAMINA_REFILL.stepDen,
      maxMinPerBuy: STAMINA_REFILL.maxMinPerBuy, perDay: STAMINA_REFILL.perDay, capMs: STAMINA_MAX_MS },
    consts: { 'src/data/stamina-refill.js': ['STAMINA_REFILL'], 'src/data/hunt-sessions.js': ['STAMINA_MAX_MS'] },
    keys: ['maxMinPerBuy'],
    evaluator: 'src/data/stamina-refill.js refillPrice',
  }),
  row({
    id: 'scaled.price',
    title: 'Scaled hunt price',
    expr: [
      'gold for a banked hour = perLevel x the Level the ground is scaled to',
      'bought in whole hours, minHours to maxHours a purchase',
      'a hero holds at most bankMaxHours a ground and buys at most buyMaxHoursPerDay a day',
    ],
    params: { perLevel: SCALED_HUNTS.price.perLevel, minHours: SCALED_HUNTS.minHours, maxHours: SCALED_HUNTS.maxHours,
      bankMaxHours: SCALED_HUNTS.bankMaxHours, buyMaxHoursPerDay: SCALED_HUNTS.buyMaxHoursPerDay },
    consts: { 'src/data/scaled-hunts.js': ['SCALED_HUNTS'] },
    evaluator: 'src/data/scaled-hunts.js pricePerHour',
  }),
  row({
    id: 'temper.effect',
    title: 'Tempering',
    expr: [
      'each rung adds rungPm / 1000 to the blows and heals of a weapon of that tier, or takes it off every blow at armor of that tier',
      'armor counts piece by piece, by the armor each piece wears',
      'at most rungs rungs a tier. A rung costs the gold in goldByTier, by tier and rung',
    ],
    params: { rungs: TEMPER_RUNGS, rungPm: TEMPER_RUNG_PM, goldByTier: TEMPER_TIERS },
    consts: { 'src/data/temper.js': ['TEMPER_RUNGS', 'TEMPER_RUNG_PM', 'TEMPER_TIERS'] },
    evaluator: 'src/core/temper.js blowsPmOf',
  }),
  row({
    id: 'bench.tax',
    title: 'Bench tax',
    expr: [
      'fee for a job = what the shop pays for the finished item x how many it makes x permille / 1000, by the bench\'s skill',
      'no fee when that is under freeUnderMg thousandths of a gold',
    ],
    params: { permille: BENCH_TAX, freeUnderMg: BENCH_TAX_FREE_UNDER_MG },
    consts: { 'src/data/bench-tax.js': ['BENCH_TAX', 'BENCH_TAX_FREE_UNDER_MG'] },
    evaluator: 'src/core/bench-tax.js feeMgOf',
  }),
  row({
    id: 'rename.price',
    title: 'Name change price',
    expr: ['base + perLevel x Level', 'at most perDay a day'],
    params: { base: HERO_RENAME.base, perLevel: HERO_RENAME.perLevel, perDay: HERO_RENAME.perDay },
    consts: { 'src/data/hero-rename.js': ['HERO_RENAME'] },
    evaluator: 'src/data/hero-rename.js renamePrice',
  }),
]);
