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
  /* Equip: what Equip upgrades would put on (src/shell/upgrade-plan.js), its words under the count (Tyler 2026-11-16: "1 upgrade in your bag"). */
  equip_n: { one: '1 upgrade in your bag', other: '{count} upgrades in your bag' },
  /* Sell: every stack the loot plan marks Sell, at the shop's bids. */
  sell_n: { one: 'Sell 1 stack for {total}', other: 'Sell {count} stacks for {total}' },
  sell_words: 'Marked to sell: {names}',
  /* Deposit: every stack the loot plan marks Deposit, with its worth when the shop bids on any of it. */
  deposit_n: { one: 'Deposit 1 stack', other: 'Deposit {count} stacks' },
  deposit_worth: { one: 'Deposit 1 stack worth {worth}', other: 'Deposit {count} stacks worth {worth}' },
  deposit_words: { one: 'Marked to deposit: {names} (frees 1 bag space)', other: 'Marked to deposit: {names} (frees {count} bag spaces)' },
  /* Bless: the Blessings not on, each at the price the server quotes now. */
  bless_n: 'Bless {names}',
  bless_free: 'Free until level {level}. Lose less XP when you die.',
  bless_cost: 'Costs {total}. Lose less XP when you die.',
  /* The answers. */
  selling: 'Selling…',
  depositing: 'Depositing…',
  sold: 'Sold for {gold}',
  sold_plain: 'Sold',
  deposited: { one: 'Deposited 1 stack', other: 'Deposited {count} stacks' },

  /* WHY THE HUNT ENDED (src/hunt-view/summary-model.js END_WORDS, one per END_ORDER name): the end card's line. end_stamina and the
     forfeit lines end on a period: stamina_now writes the stamina left after them. */
  end_died: 'You died',
  died_in: '{name} died in {ground}',
  end_boss_felled: 'Boss defeated. You earned a new title.',
  end_party_member_died: 'A party member died, so the party came home',
  end_party_member_left: 'A party member left, so the party came home',
  end_heals_out: 'Out of healing supplies',
  end_ammo_out: 'Out of ammo',
  end_runes_out: 'Out of runes',
  end_no_fight: 'Your hero couldn\'t land a hit, so it came home',
  end_gold_out: 'You hit your gold reserve, so your hero stopped buying supplies',
  end_rule: 'Your stop rule was met',
  end_stamina: 'Out of stamina. It comes back an hour for every hour you\'re not hunting.',
  end_hours: 'Time limit reached',
  end_boss_time: 'Time ran out, so the party came home',
  end_left: 'You left the hunt',
  end_changed: 'Moved to another hunt',
  end_server: 'Ended by the server',
  end_plain: 'Hunt ended',
  /* the server forfeited the hunt's last window (six refused in a row) */
  forfeit_server: 'Stopped. The last few minutes didn\'t go through, so nothing from them counts.',
  forfeit_left: 'You left. The last few minutes didn\'t go through, so nothing from them counts.',
  stamina_now: '{why} Stamina left: {left}',
  /* Hunt again, off for a party member */
  again_elsewhere: 'Your party is hunting somewhere else',
  again_leader: 'Your party leader picks the hunt',
});
