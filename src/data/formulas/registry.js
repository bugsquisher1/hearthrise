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
//              binds the id to it; data never imports core)
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
]);

/** The registry by id. */
export const FORMULA_INDEX = Object.freeze(FORMULAS.reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));
