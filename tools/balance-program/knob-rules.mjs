// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/knob-rules.mjs — WHAT A KNOB DOES TO A WRITTEN NUMBER (lane/c-balance-matrix, 2026-11-21).
//
// THE KNOB LIST is tools/balance-program/formulas/knobs.json (schema hearthrise.balance-knobs/1: the audited set of
// 44-formula-architecture.md section 5, lane/d-formula-architecture). It is the ONE list: the matrix's --diff and --sweep
// (matrix-scratch.mjs readKnobs) and Balance Lab v3's bundle (tools/balance-lab/build.mjs, a generated module) both read it.
// This file holds only the rules every reader must apply the same way, so the scratch copy and the lab's bundle can never
// scale a number two ways:
//   knobValue(text, m, float)   a number as the source writes it, scaled by m: whole stays whole (rounded) unless the pick
//                               says `float`; a decimal keeps 6 places at most
//   composeMultipliers(ms)      two knobs that pick the same number on one line (knobs.json `sharesLineWith`) multiply
//   STYLE_GROUPS                the five headings of Tyler's sketch and the weapon ways (tools/balance-sim/styles.mjs) each holds
//
// PURE ESM. Imports nothing (the lab bundles it).
// ════════════════════════════════════════════════════════════════════════

export const KNOB_SCHEMA = 'hearthrise.balance-knobs/1';
export const KNOB_FILE = 'tools/balance-program/formulas/knobs.json';

/** A number as the source writes it (`text`), scaled by `m`. */
export function knobValue(text, m, float = false) {
  const v = Number(text) * m;
  if (!String(text).includes('.') && !float) return String(Math.round(v));
  return String(Math.round(v * 1e6) / 1e6);
}

/** The multiplier of several knobs on one number: their product (1 when none). */
export const composeMultipliers = (ms) => ms.reduce((a, b) => a * b, 1);

/* Fist: the hidden two-row sample (src/data/fists.js FIST_LINE.live false) has no way in the engine's style list yet, so its row says so. */
export const STYLE_GROUPS = Object.freeze({
  Melee: Object.freeze(['tank', 'sword', 'hammer', 'axes']), Ranged: Object.freeze(['bow', 'crossbow']), Destruction: Object.freeze(['mage']),
  Restoration: Object.freeze(['healer']), Fist: Object.freeze([]),
});
