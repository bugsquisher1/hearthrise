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
  sell_words: 'Marked Sell: {names}',
  /* Deposit: every stack the loot plan marks Deposit, with its worth when the shop bids on any of it. */
  deposit_n: { one: 'Deposit 1 stack', other: 'Deposit {count} stacks' },
  deposit_worth: { one: 'Deposit 1 stack worth {worth}', other: 'Deposit {count} stacks worth {worth}' },
  deposit_words: { one: 'Marked Deposit: {names} (frees 1 bag space)', other: 'Marked Deposit: {names} (frees {count} bag spaces)' },
  /* Bless: the Blessings not on, each at the price the server quotes now. */
  bless_n: 'Bless {names}',
  bless_free: 'Free until Level {level}, less death loss',
  bless_cost: 'Costs {total}, less death loss',
  /* The answers. */
  selling: 'Selling…',
  depositing: 'Depositing…',
  sold: 'Sold for {gold}',
  sold_plain: 'Sold',
  deposited: { one: 'Deposited 1 stack', other: 'Deposited {count} stacks' },

  /* WHY THE HUNT ENDED (src/hunt-view/summary-model.js END_WORDS, one per END_ORDER name): labels on the end card. */
  end_died: 'Died (back in town)',
  end_boss_felled: 'Boss defeated (new title: Character, Titles)',
  end_party_member_died: 'Party member died (you came home too)',
  end_party_member_left: 'Party member left (you came home too)',
  end_heals_out: 'Out of healing supplies',
  end_ammo_out: 'Out of ammunition',
  end_gold_out: 'Out of gold for supplies',
  end_rule: 'Stop rule met',
  end_stamina: 'Out of stamina (refills hour for hour in town)',
  end_hours: 'Time limit reached',
  end_boss_time: 'Time ran out (10 min), party came home',
  end_left: 'You left the hunt',
  end_changed: 'Moved to another hunt',
  end_server: 'Ended by the server',
  end_plain: 'Hunt ended',
  /* the server forfeited the hunt's last window (six refused in a row) */
  forfeit_server: 'Stopped: last minutes not accepted, nothing from them counted',
  forfeit_left: 'You left: last minutes not accepted, nothing from them counted',
  stamina_now: '{why}. Stamina now: {left}',
  /* Hunt again, off for a party member */
  again_elsewhere: 'Party hunting elsewhere (only that ground)',
  again_leader: 'Your party leader picks the hunt and starts it.',
});
