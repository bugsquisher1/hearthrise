// ============================================================
// src/core/formulas/evaluators.js — THE EVALUATORS: each published formula's id bound to the one pure function
// that computes it.
//
// The rows (what the wiki prints) are src/data/formulas/registry.js FORMULAS; this is the other half, kept in core
// so data never imports core. A wiki calculator ("what does my hero get") calls EVALUATORS[id], which is the
// function the engine, the edge and the SQL generators run: the page cannot disagree with the game.
// tests/formula-single-source.mjs holds the two files to each other (every row has a function, every function
// a row, and the function is the one the row names).
//
// The files beside this one hold the evaluators that used to live in the wrong layer (the edge, a tool, the
// client). An evaluator that already sits in a core module is bound from where it is, and so is the small
// function a data file keeps to price its own rows (blessings, the stamina refill, scaled hunts, a rename).
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { salePriceOf } from './sale.js?v=0.2.114';
import { premiumPriceOf, supplyPriceOf } from './shop.js?v=0.2.114';
import { maxHpFor, maxManaFor, regenPermille } from '../vitals.js?v=0.2.114';
import { charXpForLevel, skillXpForLevel, xpForLevel } from '../xp.js?v=0.2.114';
import { deathXpLoss } from '../action-rules.js?v=0.2.114';
import { blowsPmOf } from '../temper.js?v=0.2.114';
import { feeMgOf } from '../bench-tax.js?v=0.2.114';
import { blessingPrice } from '../../data/blessings.js?v=0.2.114';
import { refillPrice } from '../../data/stamina-refill.js?v=0.2.114';
import { pricePerHour } from '../../data/scaled-hunts.js?v=0.2.114';
import { renamePrice } from '../../data/hero-rename.js?v=0.2.114';

export const EVALUATORS = Object.freeze({
  'sale.price': salePriceOf,
  'vitals.max_hp': maxHpFor,
  'vitals.max_mana': maxManaFor,
  'vitals.regen': regenPermille,
  'level.curve': charXpForLevel,
  'skill.combat_curve': skillXpForLevel,
  'skill.capped_curve': xpForLevel,
  'death.share': deathXpLoss,
  'blessing.price': blessingPrice,
  'stamina.refill': refillPrice,
  'scaled.price': pricePerHour,
  'temper.effect': blowsPmOf,
  'bench.tax': feeMgOf,
  'rename.price': renamePrice,
  'shop.price': premiumPriceOf,
  'supply.price': supplyPriceOf,
});
