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
  more_cost_gold: { one: 'Hero slots: {count} (up to {most} play at once). More cost gold', other: 'Hero slots: {count} (up to {most} play at once). More cost gold' },
  /* The line over the roster with a slot left to fill, or nothing for sale (labels, Tyler 2026-11-14). */
  play_one: 'Heroes at once: 1',
  play_up_to: 'Heroes at once: up to {most}',
  play_owned: { one: 'Hero slots: {count} (up to {most} play at once)', other: 'Hero slots: {count} (up to {most} play at once)' },
  /* The offer block under the roster: the server's quote. {nth} is "Second", {cost} and {gold} whole numbers. */
  offer_nth: '{nth} hero slot: {cost} gold',
  offer_nth_max: '{nth} hero slot: {cost} gold (max {max} heroes)',
  offer_any: 'Another hero slot: {cost} gold',
  offer_any_max: 'Another hero slot: {cost} gold (max {max} heroes)',
  purse: 'Gold: {gold}',
  short: 'Need {gold} more gold',
  buying: 'Buying…',
  buy: 'Buy a hero slot for {cost} gold',
  /* A refused purchase (hr_hero_slot_buy). */
  refused_owned: 'Slot already owned',
  refused_cap: 'All hero slots owned',
  refused_previous: 'Buy the earlier slots first',
  refused_daily: 'Daily slot limit reached',
  refused_rate: 'Too many tries, wait a minute',
  refused_no_hero: 'Create a hero first',
  refused_unpriced: 'Slot not for sale',
  refused_gold: 'Not enough gold',
  refused_other: 'Slot not bought, try again',
  /* Under the offer, only while the account has one hero (designer 2026-11-09, table E). @sentence: guidance a label can't carry (the week, and what to do meanwhile). */
  one_hero_note: 'Group with other players: Party → Find a party',
});
