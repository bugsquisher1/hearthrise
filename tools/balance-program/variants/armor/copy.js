// balance-variant: armor/copy
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/armor/copy.js — THE COPY OVERLAY of the rule slot `armor` (tools/balance-program/slots.json).
//
// It changes nothing: every export is the shipped module's, which a scratch copy keeps beside it as mitigation.shipped.js. Played in
// place of src/core/mitigation.js it must play every cell byte-identical to the tree (candidate C0-copy, variants.mjs --identity).
// A shelf file: it lives only on a scratch copy and tools/pack-edge.mjs refuses any bundle that carries it.
// ════════════════════════════════════════════════════════════════════════
export * from './mitigation.shipped.js';
