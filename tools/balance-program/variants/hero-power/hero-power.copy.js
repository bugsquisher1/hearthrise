// balance-variant: hero-power/copy
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/hero-power/hero-power.copy.js — THE COPY OVERLAY of the rule slot `hero-power` (rule-slots.json).
//
// It changes nothing: every export is the shipped module's, which a scratch copy keeps beside it as temper.shipped.js. Played in place of
// src/core/temper.js it must play every cell byte-identical to the tree (candidate C0-copy, variants.mjs --identity).
// A shelf file: it lives only on a scratch copy and tools/pack-edge.mjs refuses any bundle that carries it.
// ════════════════════════════════════════════════════════════════════════
export * from './temper.shipped.js';
