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
  hp_rate_fight: 'Health regen between fights, {rate} in a fight',
  mana: 'Mana',
  mana_k: 'MP',
  mana_rate: 'Mana regen per second',
  medal: 'Level and experience',
  lv: 'Lv',
  level: 'Level',
  level_to_next: 'Level {level}: {pct}% to {next}',
  stamina: 'Stamina: hunting time left',
  charm: 'Charm',
  charm_empty: 'Charm socket: empty',
  food_store: 'Food: store',
  food_n: 'Food ×{n}',
  /* the socket's tooltip: {where} is where_hunt or where_bag */
  where_hunt: 'hunt bag',
  where_bag: 'bag',
  food_title: 'Food in {where}: {n} (mostly {item})',
  food_store_title: 'No food in {where}. Bar buys {item} ({price} each)',
  food_none_title: 'No food in {where}, no store food on the bar',

  /* A BOUGHT HUNTING BLOCK (the "+" after the timer, and the Shop's Services tab asks the same). {hours} "2 h", {price} "1,750 gp". */
  stam_ask: 'Buy {hours} of stamina for {price}?',
  stam_buy: 'Buy stamina',
  stam_head: 'Stamina',
  stam_now: '{left} of {cap}',
  stam_premium: 'Premium: +{hours} h stamina cap',
  stam_unpriced: 'No block price yet',
  stam_quote: 'One block: +{hours} for {price}',
  stam_day: 'Blocks today: {n} of {max}. Each one costs more',
  stam_go: 'Buy',
  stam_go_for: 'Buy for {price}',
  stam_go_plus: 'Buy +{hours} for {price}',
  stam_buying: 'Buying stamina…',
  stam_done: 'Stamina added',

  /* PLAYERS ONLINE (src/shell/widgets/online.js, src/social/players-online.js; Tyler 2026-11-18). The server's total, every hero
     playing in a browser or still active with the game closed; on hover or focus, its lines by what they are doing. {n} a whole
     number. online_none: no fresh answer from the server. */
  online_n: '{n} online',
  online_none: '— online',
  online_hunting: 'Hunting {n}',
  online_tower: 'Tower {n}',
  online_gathering: 'Gathering {n}',
  online_crafting: 'Crafting {n}',
  online_training: 'Training {n}',
  online_hearth: 'Feeding the Hearth {n}',
  online_town: 'In town {n}',

  /* THE TALLY WIDGET. {board} where her board stands; {ground} a hunt's name. */
  tally_aria: 'Tallies',
  tally_open: 'Open the Tally (drag to move)',
  tally: 'Tally',
  tally_none: 'Kill tasks: Tamsin\'s board, {board}',
  tally_done_row: 'done',
  tally_not_here_row: 'not here',
  tally_counts_in: 'Counts only in {ground}',

  /* THE HUNT'S TOP BAR. {s} seconds; {ground} the hunt's name. */
  top_aria: 'Hunt',
  top_clock: 'Time in this hunt',
  top_details_aria: 'Hunt details',
  top_details_word: 'details',
  top_hunt_word: 'Hunt',
  top_leave_word: 'Leave',
  top_leave_wide: 'hunt',
  top_summary: 'Summary',
  top_leave_aria: 'Leave hunt',
  leaving: 'Leaving…',
  leaving_now: 'Leaving now…',
  leaving_late: 'Still leaving…',
  leaving_lost: 'No connection yet…',
  leaving_slow: 'Waiting for server…',
  leaving_in: 'Leaving in {s}s',
  /* @sentence: the phone's one line under the bar says what the countdown is for */
  leave_why: 'Finishes the current fight, then heads home',
  hunting: 'Hunting',
  last_hunt: 'Last hunt: {ground}',
  /* the Danger scale's live depth beside the ground's name (hunt-topbar.js; danger-sections.js depthOf): {stance} Careful, Steady or Bold */
  depth_now: '{stance}, Depth {depth} of {of}',
  leave_failed: 'Hunt not ended. {why}',

  /* THE HUNT ANALYZER (src/shell/widgets/analyzer.js). {min} minutes. */
  an_title: 'Hunt analyzer',
  an_skill: 'Skill',
  an_later: 'Per hour: after {min} min',
  an_later_premium: 'Per hour: after {min} min',
  an_tab_session: 'Session',
  an_tab_training: 'Training',
  an_tab_taken: 'Taken',
  an_tab_dealt: 'Dealt',
  an_sec_totals: 'Session',
  an_kills: 'Monsters killed',
  an_level_xp: 'Level XP',
  /* the hunt's coins (the server's `coins`), so it is never read as the gold the purse kept: the cards' Gold is coins less supplies
     (src/shell/result-block.js goldFig; post-patch audit 2026-11-18). The Party tab's row is the same figure, summed. */
  an_gold: 'Coins',
  an_loot_value: 'Unsold loot value',
  an_supplies_cost: 'Supplies cost',
  an_balance: 'Balance',
  an_sec_rates: 'Per hour',
  an_level_xp_h: 'Level XP per hour',
  /* the even share of each kill (the server's raw_xp): what was paid less the party's class cell or the solo boost, the only Level XP
     bonuses. "Before bonuses" read as a party cutting a hero's XP (lane/a-honest-lines, re-landed by lane/a-honesty-rescue). The summary
     card's row says the same (hunt-summary.js). */
  /* Level XP before the party, solo and live-event shares (xp-share.js `raw`): it says the event too, so a weekend never goes unsaid */
  an_raw_xp_h: 'Level XP per hour (no party, solo or event bonus)',
  an_gold_loot_h: 'Coins and loot value per hour',
  an_supplies_h: 'Supplies per hour',
  an_balance_h: 'Balance per hour',
  an_sec_supplies: 'Supplies used',
  an_sec_loot: 'Loot collected',
  an_sec_training: 'Training',
  an_training_xp: 'Training XP',
  an_training_xp_h: 'Training XP per hour',
  an_sec_skill: 'By skill',
  an_sec_by_monster: 'Taken from each monster',
  an_sec_taken_el: 'Taken by damage type',
  an_sec_by_attack: 'Dealt by each attack',
  an_sec_dealt_el: 'Dealt by damage type',
  an_none: 'Nothing yet',
  an_scope: 'Whose numbers',
  an_hero: 'This hero',
  an_party: 'Party',
  an_close: 'Close the hunt analyzer',
  an_close_title: 'Close',
  an_wait: 'Fills in once the hunt has run a moment',
  an_ended: 'Hunt ended: session summary',
  an_session: 'Session',
  an_next: 'Next level in',
  an_more: 'More detail: premium',
  an_per_hour: '{n} an hour',
  an_next_in: 'next level in {time}',
  an_from_bag: 'from bag',
});
