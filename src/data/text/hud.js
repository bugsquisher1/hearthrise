// ════════════════════════════════════════════════════════════════════════
// src/data/text/hud.js — THE TOWN AND HUNT HUD'S WORDS: the vitals hub around the Level medal, the stamina
// refill, the Tally widget and the hunt's top bar (src/shell/widgets/vitals-hub.js, stamina-buy.js,
// tally-hud.js, hunt-topbar.js).
//
// One row per label, read by t('hud.<key>'). Labels, not sentences (Tyler 2026-11-14): a tooltip or a status
// line is the short form players know from MMOs.
// ════════════════════════════════════════════════════════════════════════

export const HUD_TEXT = Object.freeze({
  /* THE VITALS HUB. {rate} "0.6/s"; {level}, {next} Levels; {pct} a whole percent. */
  hp: 'Health',
  hp_k: 'HP',
  hp_rate: 'Health regen per second',
  hp_rate_rest: '+{rate}/s rest',
  hp_rate_fight: 'Health regen between fights (in a fight: {rate})',
  mana: 'Mana',
  mana_k: 'MP',
  mana_rate: 'Mana regen per second',
  medal: 'Level and experience',
  lv: 'Lv',
  level: 'Level',
  level_xp: 'Level {level}: {pct}% to {next}',
  stamina: 'Stamina: hunting time left',
  charm: 'Charm',
  charm_empty: 'Charm socket: empty',
  food_store: 'Food: store',
  food_n: 'Food ×{n}',
  /* the socket's tooltip: {where} is where_hunt or where_bag */
  where_hunt: 'hunt bag',
  where_bag: 'bag',
  food_title: 'Food in {where}: {n} (most: {item})',
  food_store_title: 'No food in {where} (your bar buys {item} at {price} each)',
  food_none_title: 'No food in {where}, no store food on your bar',

  /* THE STAMINA REFILL (the "+" after the timer, and the Shop's Services tab asks the same). {hours} "4 h", {price} "1,600 gp". */
  stam_ask: 'Buy {hours} of stamina for {price}?',
  stam_buy: 'Buy stamina',
  stam_head: 'Stamina',
  stam_now: '{left} of {cap}',
  stam_premium: 'Premium: +{hours} h stamina cap',
  stam_unpriced: 'No refill price yet',
  stam_quote: 'One refill: +{hours} for {price}',
  stam_day: 'Bought today: {n} of {max} (each costs more)',
  stam_go: 'Buy',
  stam_go_for: 'Buy for {price}',
  stam_go_plus: 'Buy +{hours} for {price}',
  stam_buying: 'Buying stamina…',
  stam_done: 'Stamina restored',

  /* THE TALLY WIDGET. {board} where her board stands; {ground} a hunt's name. */
  tally_aria: 'Your tallies',
  tally_open: 'Open the Tally (drag to move)',
  tally: 'Tally',
  tally_none: 'Kill tasks: Tamsin\'s board, {board}',
  tally_done_row: '(done)',
  tally_not_here_row: '(not here)',
  tally_counts_in: 'Counts only in {ground}',

  /* THE HUNT'S TOP BAR. {s} seconds; {ground} the hunt's name. */
  top_aria: 'Hunt',
  top_clock: 'Time in this hunt',
  top_details_aria: 'Hunt details',
  top_summary: 'Summary',
  top_leave_aria: 'Leave hunt',
  leaving: 'Leaving…',
  leaving_now: 'Leaving now…',
  leaving_late: 'Still leaving…',
  leaving_lost: 'No connection yet…',
  leaving_slow: 'Waiting for server…',
  leaving_in: 'Leaving in {s}s',
  /* @sentence: the phone's one line under the bar says what the countdown is for */
  leave_why: 'Your hero finishes the fight under way, then heads home.',
  hunting: 'Hunting',
  last_hunt: 'Last hunt: {ground}',
  leave_failed: 'Hunt not ended. {why}',
});
