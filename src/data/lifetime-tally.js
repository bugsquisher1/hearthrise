// src/data/lifetime-tally.js — the lifetime counts the Hero tab and Lifetime Stats show.
// Every key is a permanent `stat` row the server writes (hr_state_of `progress`,
// kind 'stat', period ''); src/features/lifetime-tally.js folds them from each
// envelope. Client-only display data: never edge-imported. Guarded by
// tests/lifetime-tally.mjs (TALLY-1 every key has a writer, TALLY-2 every
// written key is listed or skipped with a reason, TALLY-4 the lore lines).

export const LIFETIME_KEYS = Object.freeze([
  'kills', 'crits', 'rare_drops', 'deaths', 'bounty_turnins',
  'gathered', 'chopped', 'mined', 'fished', 'tool_doubles',
  'ev:planted', 'ev:harvest',
  'cooked', 'burnt', 'smithed', 'crafted',
]);

export const LIFETIME_SKIP = Object.freeze({
  refined: 'always smithed + crafted (src/core/artisan.js BENCH_COUNTERS)',
});

export const LIFETIME_LORE = Object.freeze({
  fighting: 'The lodge keeps its tally in chalk on a slate by the door, and nobody has ever talked the lodge into rubbing a mark away',
  kinds: 'A hunter learns a kind by the dozen and never by the one, so the lodge keeps a separate slate for every kind of beast it knows',
  gathering: 'The woodpile, the ore heap and the smoking rack each keep their own count, and not one of them has ever been caught in a lie',
  bench: 'A bench remembers the work done at it in scorch marks and worn grain, long after the hands that did the work have moved on',
  purse: 'Only what sits in the purse today; the counting-house keeps no tally of what came in or went out in all the years before',
});
