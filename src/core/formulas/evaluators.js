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
// client). An evaluator that already sits in a core module is bound from where it is.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { salePriceOf } from './sale.js?v=0.2.114';

export const EVALUATORS = Object.freeze({
  'sale.price': salePriceOf,
});
