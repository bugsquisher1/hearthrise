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
  more_cost_gold: { one: 'Heroes: {count} of {most}. More slots cost gold.', other: 'Heroes: {count} of {most}. More slots cost gold.' },
  /* The line over the roster with a slot left to fill, or nothing for sale (labels, Tyler 2026-11-14). */
  play_one: 'One hero at a time',
  play_up_to: 'Up to {most} heroes at once',
  play_owned: { one: 'Heroes: {count} of {most}', other: 'Heroes: {count} of {most}' },
  /* The offer block under the roster: the server's quote. {nth} is "Second", {cost} and {gold} whole numbers. */
  offer_nth: '{nth} hero slot: {cost} gold',
  offer_nth_max: '{nth} hero slot: {cost} gold (max {max} heroes)',
  offer_any: 'Another hero slot: {cost} gold',
  offer_any_max: 'Another hero slot: {cost} gold (max {max} heroes)',
  purse: 'Gold: {gold}',
  short: 'You need {gold} more gold',
  buying: 'Buying…',
  buy: 'Buy a hero slot for {cost} gold',
  /* A refused purchase (hr_hero_slot_buy). */
  refused_owned: 'You already own that slot',
  refused_cap: 'You own every hero slot',
  refused_previous: 'Buy the earlier slots first',
  refused_daily: 'Daily slot limit reached',
  refused_rate: 'Too many tries. Wait a minute and try again.',
  refused_no_hero: 'Create a hero first',
  refused_unpriced: 'That slot isn\'t for sale',
  refused_gold: 'Not enough gold',
  refused_other: 'Couldn\'t buy the slot. Try again.',
  /* Under the offer, only while the account has one hero (designer 2026-11-09, table E). @sentence: guidance a label can't carry (what to do meanwhile). */
  one_hero_note: 'Want company? Open Party → Find a party to hunt with other players.',
});
