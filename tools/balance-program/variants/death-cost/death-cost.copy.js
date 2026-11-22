// balance-variant: death-cost/copy
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/death-cost/death-cost.copy.js — THE COPY OVERLAY of the rule slot `death-cost` (tools/balance-program/rule-slots.json).
//
// It changes nothing: every export is the shipped module's, which a scratch copy keeps beside it as action-rules.shipped.js. Played in
// place of src/core/action-rules.js it must play every cell byte-identical to the tree (candidate C0-copy, variants.mjs --identity).
// A shelf file: it lives only on a scratch copy and tools/pack-edge.mjs refuses any bundle that carries it.
// ════════════════════════════════════════════════════════════════════════
export * from './action-rules.shipped.js';
