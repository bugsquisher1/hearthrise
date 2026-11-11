// ════════════════════════════════════════════════════════════════════════
// src/data/text/summary.js — THE HUNT SUMMARY'S "BACK IN TOWN" WORDS (src/shell/back-in-town.js,
// src/shell/windows/hunt-summary.js).
//
// One row per sentence or label, read by t('summary.<key>'). The trip home is a list of
// presses on the summary (UX flow audit 2026-11-11, flow C): each row names its count and
// its value as the server holds them, and the control words are the glossary's (Equip, Sell,
// Deposit, Bless, Hunt again).
// ════════════════════════════════════════════════════════════════════════

export const SUMMARY_TEXT = Object.freeze({
  town_head: 'Back in town',
  done: 'Done',
  /* The one press of each row: the glossary's words (src/data/text/controls.js: Equip, Sell, Deposit); Bless is the Services tab's own word. */
  bless: 'Bless',
  /* Equip: what Equip upgrades would put on (src/shell/upgrade-plan.js), its words under the count. */
  equip_n: { one: 'Equip 1 better piece', other: 'Equip {count} better pieces' },
  /* Sell: every stack the loot plan marks Sell, at the shop's bids. */
  sell_n: { one: 'Sell 1 stack for {total}', other: 'Sell {count} stacks for {total}' },
  sell_words: 'Your loot plan marks {names} for the shop.',
  /* Deposit: every stack the loot plan marks Deposit, with its worth when the shop bids on any of it. */
  deposit_n: { one: 'Deposit 1 stack', other: 'Deposit {count} stacks' },
  deposit_worth: { one: 'Deposit 1 stack worth {worth}', other: 'Deposit {count} stacks worth {worth}' },
  deposit_words: { one: 'Your loot plan marks {names} for Storage, and that frees 1 bag space.', other: 'Your loot plan marks {names} for Storage, and that frees {count} bag spaces.' },
  /* Bless: the Blessings not on, each at the price the server quotes now. */
  bless_n: 'Bless {names}',
  bless_free: 'Free until Level {level}. A death costs you less with them on.',
  bless_cost: 'Costs {total}. A death costs you less with them on.',
  /* The answers. */
  selling: 'Selling…',
  depositing: 'Putting it away…',
  sold: 'The shop paid {gold}.',
  sold_plain: 'Sold.',
  deposited: { one: 'Put away 1 stack.', other: 'Put away {count} stacks.' },
});
