// ════════════════════════════════════════════════════════════════════════
// src/data/text/training.js — THE TRAINING YARD'S AND THE HOUSE DUMMY'S WORDS (src/shell/windows/training.js,
// src/shell/windows/house-dummy.js, src/shell/training-words.js).
//
// One row per sentence, read by t('training.<key>'). Tyler's voice (2026-11-09): what happens to the player, short, plain,
// "you". Every number in a row is the server's (the `training` section, a refusal's own figures); the windows fill them in
// and never work one out.
// ════════════════════════════════════════════════════════════════════════

export const TRAINING_TEXT = Object.freeze({
  /* What the yard is, said once at the top. */
  lead: 'Trains any skill at the same rate. Hourly fee, no stamina used',
  your_hero: 'Hero',
  purse: 'Gold: {gold}',

  /* The choices. */
  skill_head: 'Skill',
  where_head: 'Where',
  where_yard: 'The yard',
  where_house: 'Home dummy',

  /* The picked skill's quote, every number the server's. */
  fee: '{gold} gold an hour',
  fee_house: 'No fee at home',
  xp: '{xp} {skill} XP/h',
  xp_item: '{xp} {skill} XP/h at 200%',
  to_level: 'About {hours} to {skill} {level}',
  max_hours: 'Max {hours} hours a session',
  paid_ahead: 'Paid at the start of each hour',

  /* The press and its answer. */
  press_start: 'Start training',
  busy_start: 'Heading to the yard…',
  busy_stop: 'Stopping…',
  started: '{name} started training {skill}.',

  /* While it runs. */
  run_now: '{name} is training {skill}.',
  run_where_yard: 'Fee: {gold} gold an hour',
  run_where_house: 'Home dummy, no fee',
  run_clock: 'Training for {time}.',
  run_paid: 'Paid so far: {gold} gold',

  /* Why the last run ended (the section's last_stop.reason). */
  ended_gold_out: '{name} stopped training {skill}: out of gold',
  ended_hours: '{name} finished training {skill} (session max reached)',
  ended_left: 'Stopped {name}\'s {skill} training',
  ended_other: '{name} stopped training {skill}.',

  /* Why Start is off, said before the press; the same words answer the server's refusal. */
  closed: 'The training yard is closed right now.',
  hunting: '{name} is hunting. Training is in town only',
  in_party: '{name} is in a party. Training is solo only',
  short_gold: 'First hour: {fee} gold. Gold: {purse}',
  low_level: 'Requires Level {need}. Level now: {level}',
  dummy_busy: 'Dummy in use by {who}',

  /* THE TRAINING ITEMS (2027-04-23-training-gear.sql, Tyler 2026-11-14): labels, the server's numbers, and one card line. */
  gear_head: 'Training item',
  gear_left: '{item} switched off, {time} left',
  gear_left_on: '{item} at 200%, {time} left',
  gear_use: 'Use {item}',
  gear_held: '{item}, {hours} h',
  gear_bound: '{item}, {hours} h, bound',
  gear_in_bag: '{count} in bag',
  gear_in_storage: '{count} in Storage',
  gear_price: '{gold} gold',
  gear_today: '{today} of {max} bought today',
  gear_card: '200% {skill} XP while training',
  gear_closed: 'Training items not for sale yet',
  press_buy: 'Buy',
  press_open: 'Open',
  busy_buy: 'Buying…',
  busy_open: 'Opening…',
  bought: 'Bought {item}',
  opened: '{item} opened, {skill} training at 200%',
  gear_short: 'Price: {price} gold. Gold: {purse}',
  gear_limit: 'Daily limit: {max} training items',
  gear_still_open: '{item} still has hours left',
  gear_none_held: 'None in bag or Storage',

  /* THE HOUSE DUMMY (the House window). */
  dummy_head: 'Training dummy',
  dummy_lead: 'One per account: yard speed, no fee',
  dummy_owned: 'Unlocked',
  dummy_locked: 'Locked',
  dummy_next: 'Next unlock: {price} gold',
  dummy_all: 'Every skill is unlocked.',
  dummy_needs_home: 'Requires the {home}',
  dummy_short: 'Next unlock: {price} gold. Gold: {purse}',
  dummy_in_use: '{who} is training on it now.',
  dummy_confirm: 'Unlock {skill} on the dummy for {price} gold?',
  dummy_buying: 'Unlocking…',
  dummy_bought: 'Dummy now trains {skill}',

  /* A span of time. */
  time_hours: { one: '{count} hour', other: '{count} hours' },
  time_minutes: { one: '{count} minute', other: '{count} minutes' },
  time_both: '{hours} {minutes}',
  time_under_minute: 'less than a minute',

  /* A SESSION'S END CARD (src/shell/windows/hunt-summary.js; the designer's coherence pass 2026-11-15): what it gave and cost, each
     figure the server's last stop for it. {skill} the skill's name. */
  card_xp: '{skill} XP',
  card_level: '{skill} level',
  card_level_up: '{from} to {to}',
  card_fee: 'Paid at the yard',
  card_again: 'Train again',
  card_again_title: 'Opens the Training window.',

  /* THE HUNT BAR AND THE ANALYZER WHILE A HERO TRAINS (src/shell/training-now.js): what it does, where, and the server's figures.
     The hero's tab line says the two together ("Training Melee at the Training Yard", src/session/party-sections.js). */
  bar_doing: 'Training {skill}',
  bar_at_yard: 'at the Training Yard',
  bar_at_house: 'on the home dummy',
  bar_left: '{time} left',
  bar_left_title: 'Time before this training session stops',
  bar_fee: '{gold} gold/h',
  bar_details: 'Details',
  bar_stop: 'Stop',
  bar_stop_wide: 'training',
  an_title: 'Training',
  an_level: '{skill} level {level}',
  an_xp_h: '{skill} XP per hour',
  an_xp_h_item: '{xp} at 200%',
  an_fee_h: 'Fee per hour',
  an_fee_house: 'None at home',
  an_paid: 'Paid so far',

  /* THE COACH'S "WHAT NEXT" WHILE A HERO TRAINS (src/data/hunt-tutorial.js nextGoal): the trained skill's next level, the server's hours. */
  coach_next: 'Train {skill} to {level}: about {hours}',

  /* THE WORLD WHILE A HERO TRAINS (src/world/world-boot.js): where it is, and the window that runs it. */
  world_line: '{name} is training {skill} at the Training Yard.',
  world_line_house: '{name} is training {skill} on the home dummy',
  world_open: 'Open Training',
});
