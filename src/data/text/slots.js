// ════════════════════════════════════════════════════════════════════════
// src/data/text/slots.js — THE CHARACTERS SCREEN'S HERO-SLOT WORDS: the line over the roster (src/app/slot-offer.js).
//
// One row per sentence, read by t('slots.<key>'). All four hero slots are the account's from the start (Tyler
// 2026-11-21), so nothing here is a price or an offer.
// ════════════════════════════════════════════════════════════════════════

export const SLOTS_TEXT = Object.freeze({
  /* The line over the roster (labels, Tyler 2026-11-14). {most} how many heroes can play at once, {count} the empty slots. */
  play_one: 'Heroes at once: 1',
  play_up_to: 'Heroes at once: up to {most}',
  play_to_make: { one: 'Heroes at once: up to {most} · {count} more to create', other: 'Heroes at once: up to {most} · {count} more to create' },
});
