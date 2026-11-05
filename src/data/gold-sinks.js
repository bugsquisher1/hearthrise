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
// PURE ESM DATA. No imports, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/* THE POWDERS, as the World and the window show them. Three colors of their own, drawn by tools/world-art/hearth-flames.mjs (its RAMPS): the five named
   colors are never for sale. A bought flame is 30 s against a named fuel's 60-90, with no burst and no item link. */
const flame = (id, label, words) => Object.freeze({ fire: 'hearth_fire_' + id, flare: 'hearth_flare_' + id, sparks: 'hearth_burn_sparks_' + id, label, words });
export const SHOW_FLAMES = Object.freeze({
  cinnabar: flame('cinnabar', 'Cinnabar', 'burns red'),
  quicklime: flame('quicklime', 'Quicklime', 'burns white'),
  borax: flame('borax', 'Borax', 'burns green'),
});
/** The pinch a hero throws on the fire (tools/world-art/round-fireworks.mjs). */
export const POWDER_CHUNK = 'fuel_powder';
/** The catalogue id hr_town_show takes for a round. */
export const ROUND_OFFER = 'round';
/* THE ROUND, as the World draws it (src/world/town-shows.js): one program, so two viewers of a round see one show. A shell climbs from the square for riseMs over riseTiles,
   then bursts for at most playMs (tools/world-art/round-fireworks.mjs), and everything steps on tickMs, so a show repaints the town at most 24 times a second.
   A row is [ms into the round, shell, tiles east of the ambient `from`, tiles south of it]: where it bursts, high over Hearth Square's west and middle, where the idle heroes stand and look.
   A shell at the Hearth's own column is gone in a moment, so the fire keeps showing; the last five seconds are the finale. */
const GOLD = 'fx_round_gold', CINDER = 'fx_round_cinder', FROST = 'fx_round_frost';
export const ROUND_SHOW = Object.freeze({
  from: 'hearth_fire', rise: 'fx_round_rise', riseMs: 416, riseTiles: 6, playMs: 1500, tickMs: 1000 / 24,
  program: Object.freeze([
    [700, GOLD, -6, -2], [1800, CINDER, -8, -1], [2600, FROST, 4, -1], [3800, CINDER, -4, -1], [4300, GOLD, -3, -1], [5600, FROST, -1, -3], [6500, CINDER, 1, -4], [7700, GOLD, 3, -3],
    [8200, CINDER, -11, -1], [9500, FROST, -9, -4], [10400, CINDER, -10, -3], [11600, GOLD, -5, -4], [12100, FROST, -2, -2], [13400, CINDER, 0, -1], [14300, GOLD, 2, -1], [15500, CINDER, -7, -1],
    [16000, FROST, -6, -2], [17300, CINDER, -8, -1], [18200, GOLD, 4, -1], [19400, FROST, -4, -1], [19900, CINDER, -3, -1], [21200, GOLD, -1, -3], [22100, CINDER, 1, -4], [23300, FROST, 3, -3],
    [23800, CINDER, -11, -1], [25100, GOLD, -9, -4], [26000, FROST, -10, -3], [27200, CINDER, -5, -4], [27700, GOLD, -2, -2], [29000, CINDER, 0, -1], [29900, FROST, 2, -1], [31100, CINDER, -7, -1],
    [31600, GOLD, -6, -2], [32900, FROST, -8, -1], [33800, CINDER, 4, -1], [35000, GOLD, -4, -1], [35500, CINDER, -3, -1], [36800, FROST, -1, -3], [37700, CINDER, 1, -4], [38400, GOLD, 3, -3],
    [38800, FROST, -11, -1], [39300, CINDER, -9, -4], [39700, GOLD, -10, -3], [40200, CINDER, -5, -4], [40600, FROST, -2, -2], [41100, CINDER, 0, -1], [41500, GOLD, 2, -1], [42000, FROST, -7, -1],
    [42600, GOLD, -6, -2],
  ].map(Object.freeze)),
});

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
