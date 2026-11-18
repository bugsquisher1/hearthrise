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
  /* THE RESULT, FIRST (UI audit 2026-11-18 #1 and #2; src/shell/result-block.js): the Level line, then three figures, each a genre label
     over the server's number and one small line under it. {name} is "Level" or a skill's name. */
  lv_name: 'Level',
  lv_at: '{name} {level}',
  lv_arrow: '→',
  skill_up: '{skill} {from} → {to}',
  fig_xp: 'Level XP',
  fig_gold: 'Gold',
  fig_kills: 'Kills',
  fig_time: 'Time',
  fig_per_hour: '{amount} per hour',
  fig_loot: '{gold} in loot',
  fig_in: 'in {time}',
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
  deposit_words: { one: 'Marked Deposit: {names}, frees 1 bag space', other: 'Marked Deposit: {names}, frees {count} bag spaces' },
  /* Bless: the Blessings not on, each at the price the server quotes now. */
  bless_n: 'Bless {names}',
  bless_free: 'Free until Level {level}',
  bless_cost: 'Cost: {total}',
  /* THE NEXT BUY (src/shell/next-buy.js; audit 2026-11-15 F12/F20: a million gold by Level 50 and the card said nothing): the one most
     useful thing the purse covers, its press opening where it is bought. {gains}: what the piece adds ("+1 Defense"); {pct}: the next rung's total. */
  buy_gear: 'Next buy: {item} ({price})',
  buy_gear_better: '{gains} vs {worn}',
  buy_gear_empty: '{gains}, empty {slot} slot',
  buy_temper: 'Next buy: Temper {piece} ({price})',
  buy_temper_blows: 'Damage and heals +{pct}',
  buy_temper_armor: 'Damage taken −{pct}',
  buy_dummy: 'Next buy: House dummy skill ({price})',
  buy_dummy_words: 'Train at home, no hourly fee',
  buy_room: 'Next buy: {room} upgrade ({price})',
  buy_room_words: 'Next: {rung}',
  /* The answers. */
  selling: 'Selling…',
  depositing: 'Depositing…',
  sold: 'Sold for {gold}',
  sold_plain: 'Sold',
  deposited: { one: 'Deposited 1 stack', other: 'Deposited {count} stacks' },

  /* WHY THE HUNT ENDED (src/hunt-view/summary-model.js END_WORDS, one per END_ORDER name): labels on the end card. */
  end_died: 'Died',
  died_in: '{name} died in {ground}',
  end_boss_felled: 'Boss defeated, new title earned',
  end_party_member_died: 'Party member died',
  end_party_member_left: 'Party member left',
  end_heals_out: 'Out of healing supplies',
  end_ammo_out: 'Out of ammunition',
  end_runes_out: 'Out of runes',
  end_no_fight: 'No hits landed',
  end_gold_out: 'Gold reserve reached',
  end_rule: 'Stop rule met',
  end_stamina: 'Out of stamina · Stamina refills 1 h per hour',
  end_hours: 'Time limit reached',
  end_boss_time: 'Time ran out',
  end_floor_time: 'Floor time ran out',
  end_left: 'Left the hunt',
  end_changed: 'Moved to another hunt',
  end_server: 'Ended by the server',
  end_plain: 'Hunt ended',
  /* the server forfeited the hunt's last window (six refused in a row) */
  forfeit_server: 'Stopped by the server. The last minutes did not count',
  forfeit_left: 'Left the hunt. The last minutes did not count',
  stamina_now: '{why}. Stamina now: {left}',
  /* Hunt again, off for a party member */
  again_elsewhere: 'Party hunting elsewhere',
  again_leader: 'Party leader picks the hunt',
});
