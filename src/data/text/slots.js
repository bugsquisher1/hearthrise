// ════════════════════════════════════════════════════════════════════════
// src/data/text/slots.js — THE CHARACTERS SCREEN'S HERO-SLOT WORDS: the line
// over the roster and the note under the offer (src/app/slot-offer.js).
//
// One row per sentence, read by t('slots.<key>'). Prices are never written
// here: the offer block shows the server's quote (hr_account_view). One slot to
// start, the second about a week of play (Tyler 2026-11-09).
// ════════════════════════════════════════════════════════════════════════

export const SLOTS_TEXT = Object.freeze({
  /* The line over the roster when more slots can be bought. {count} the slots owned, {most} how many heroes can play at once. */
  more_cost_gold: {
    one: 'You own {count} hero slot. Up to {most} heroes can play at once, and more slots cost gold.',
    other: 'You own {count} hero slots. Up to {most} heroes can play at once, and more slots cost gold.',
  },
  /* Under the offer, only while the account has one hero (designer 2026-11-09, table E). */
  one_hero_note: 'Most players can buy a second hero after about a week. Until then, use Find a party in the Party window to hunt with other players.',
});
