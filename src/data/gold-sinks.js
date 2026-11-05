// ════════════════════════════════════════════════════════════════════════
// src/data/gold-sinks.js — WHAT GOLD BUYS BEYOND SUPPLIES: PRICES, CLIMBS, CAPS AND SECONDS (data; the source of truth).
//
// Tyler 2026-11-04: "I want all of those that you said other than the avoid ones." The designer's rows (priority board,
// "2026-11-04 Gold sinks"); every price is a row Tyler can overrule. Change a row here, then `node tools/gen-gold-sinks.mjs`
// regenerates the server's copy (hr_sink_rules); its --check fails a stale one. The server never reads a price from the client:
// a verb takes the price the player SAW, re-quotes from hr_sink_rules on the server clock and answers quote_changed if it moved.
//
// NOTHING IS ROLLED: every row buys a known thing. No XP, no drop chance, no power. A sink row never reaches the Hearthrise event.
//
// THE ROW (one per sink; a row with no `prices` is priced by Level):
//   scope          whose count it climbs on: 'account' (what others see, so four heroes share one ladder), 'hero' (what a hero wears)
//   offers         the catalogue ids a verb may name; empty when the verb names nothing
//   prices         the climbing ladder: the (n+1)th purchase costs prices[n]. Past its end there is nothing left to buy
//   priceBase, pricePerLevel  a price that reads the hero's Level instead: base + per level x Level
//   perDay         how many a UTC day (absent: never resets)
//   free           how many the hero has before the ladder starts
//   seconds        how long one show plays; bookS  how far ahead the town books them
//   gapS           the server-wide gap between two lines; minLevel  the Level a line takes; maxLetters  a line's length
//   perMinute      the verb's own rate bucket
//
// SETUP SLOTS: "a free couple" (Tyler). The designer would give 3: that is this one row, free: 3, prices: [15000, 40000]. The
// generator refuses a row whose free + prices is not the hero's setup limit (rule-subjects ACTION_SET_LIMITS.presets).
//
// BOUGHT FLAMES STAY OUT OF src/data/hearth.js: recipes.js pulls that file into the hr-accrue bundle, so a row there moves the
// edge hash. This file reaches no edge import.
//
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/** One row per sink, keyed by the server's sink id. */
export const SINK_RULES = Object.freeze({
  powder: Object.freeze({
    scope: 'account', offers: Object.freeze(['cinnabar', 'quicklime', 'borax']),
    prices: Object.freeze([2000, 4000, 6000, 8000, 10000]), perDay: 5, seconds: 30, bookS: 300, perMinute: 10,
  }),
  round: Object.freeze({
    scope: 'account', offers: Object.freeze(['round']),
    prices: Object.freeze([5000, 10000, 20000]), perDay: 3, seconds: 45, bookS: 180, perMinute: 10,
  }),
  crier: Object.freeze({
    scope: 'account', offers: Object.freeze([]),
    prices: Object.freeze([1000, 2000, 4000, 8000, 16000]), perDay: 5, gapS: 30, minLevel: 10, maxLetters: 120, perMinute: 3,
  }),
  setup_slot: Object.freeze({
    scope: 'hero', offers: Object.freeze([]),
    free: 2, prices: Object.freeze([5000, 15000, 40000]),
  }),
  hero_colors: Object.freeze({
    scope: 'hero', offers: Object.freeze([]),
    priceBase: 1500, pricePerLevel: 50, perDay: 10,
  }),
});
