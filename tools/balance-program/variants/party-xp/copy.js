// balance-variant: party-xp/copy
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/party-xp/copy.js — THE COPY OVERLAY of the rule slot `party-xp` (tools/balance-program/slots.json).
//
// It changes nothing: every export is the shipped module's, which a scratch copy keeps beside it as party-class-xp.shipped.js. Played in
// place of src/data/party-class-xp.js it must play every cell byte-identical to the tree (candidate C0-copy, variants.mjs --identity).
// A shelf file: it lives only on a scratch copy and tools/pack-edge.mjs refuses any bundle that carries it.
// ════════════════════════════════════════════════════════════════════════
export * from './party-class-xp.shipped.js';
