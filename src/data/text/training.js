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
  lead: 'Any skill, same rate, paid hourly. Skill XP only, no stamina',
  your_hero: 'Your hero',
  purse: 'You have {gold} gold.',

  /* The choices. */
  skill_head: 'Skill',
  where_head: 'Where',
  where_yard: 'The yard',
  where_house: 'Your dummy at home',

  /* The picked skill's quote, every number the server's. */
  fee: '{gold} gold an hour',
  fee_house: 'No fee at home',
  xp: '{xp} {skill} XP/h',
  xp_item: '{xp} {skill} XP/h (200%)',
  to_level: 'About {hours} to {skill} {level}',
  max_hours: 'Training stops after {hours} hours. Start it again to keep going.',
  paid_ahead: 'You pay each hour when it starts.',

  /* The press and its answer. */
  press_start: 'Start training',
  busy_start: 'Heading to the yard…',
  busy_stop: 'Stopping…',
  started: '{name} started training {skill}.',

  /* While it runs. */
  run_now: '{name} is training {skill}.',
  run_where_yard: 'You pay {gold} gold an hour at the yard.',
  run_where_house: 'Your dummy at home trains for free.',
  run_clock: 'Training for {time}.',
  run_paid: 'So far you have paid {gold} gold.',

  /* Why the last run ended (the section's last_stop.reason). */
  ended_gold_out: '{name} stopped training {skill} (out of gold)',
  ended_hours: '{name} finished {skill} training. That was the longest one session can run.',
  ended_left: 'You stopped {name}\'s {skill} training.',
  ended_other: '{name} stopped training {skill}.',

  /* Why Start is off, said before the press; the same words answer the server's refusal. */
  closed: 'The training yard is closed right now.',
  hunting: '{name} is out hunting. Come back to town to train.',
  in_party: '{name} is in a party (training is solo)',
  short_gold: 'The first hour costs {fee} gold. You have {purse}.',
  low_level: 'Training opens at Level {need}. You are Level {level}.',
  dummy_busy: 'Dummy in use by {who} (one hero at a time)',

  /* THE TRAINING ITEMS (2027-04-23-training-gear.sql, Tyler 2026-11-14): labels, the server's numbers, and one card line. */
  gear_head: 'Training item',
  gear_left: '{item} switched off, {time} left',
  gear_left_on: '{item} at 200%, {time} left',
  gear_use: 'Use {item}',
  gear_held: '{item} ({hours} h)',
  gear_bound: '{item} ({hours} h), bound',
  gear_in_bag: '{count} in bag',
  gear_in_storage: '{count} in Storage',
  gear_price: '{gold} gold',
  gear_today: '{today} of {max} bought today',
  gear_card: '200% {skill} XP (yard or home dummy), hours run only while training',
  gear_closed: 'Training items aren\'t for sale yet.',
  press_buy: 'Buy',
  press_open: 'Open',
  busy_buy: 'Buying…',
  busy_open: 'Opening…',
  bought: 'You bought a {item}.',
  opened: '{item} opened. Your {skill} training is at 200% while its hours last.',
  gear_short: 'It costs {price} gold. You have {purse}.',
  gear_limit: 'You bought {max} training items today. The Arms Master sells more tomorrow.',
  gear_still_open: '{item} still has hours left (next one opens after it)',
  gear_none_held: 'You don\'t have one in your bag or Storage.',

  /* THE HOUSE DUMMY (the House window). */
  dummy_head: 'Training dummy',
  dummy_lead: 'One per account: yard speed, no fee. Each skill unlock costs more',
  dummy_owned: 'Unlocked',
  dummy_locked: 'Locked',
  dummy_next: 'Next unlock: {price} gold',
  dummy_all: 'Every skill is unlocked.',
  dummy_needs_home: 'You need the {home} before you can put a dummy in.',
  dummy_short: 'The next unlock costs {price} gold. You have {purse}.',
  dummy_in_use: '{who} is training on it now.',
  dummy_confirm: 'Unlock {skill} on your dummy for {price} gold?',
  dummy_buying: 'Unlocking…',
  dummy_bought: 'Your dummy now trains {skill}.',

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

  /* THE WORLD WHILE A HERO TRAINS (src/world/world-boot.js): where it is, and the window that runs it. */
  world_line: '{name} is training {skill} at the Training Yard.',
  world_line_house: '{name} is training {skill} on your dummy at home.',
  world_open: 'Open Training',
});
