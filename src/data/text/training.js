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
  lead: 'Pick one combat skill and train it here. You pay by the hour and earn skill XP for that skill only. No Level XP, no loot, and no stamina used.',
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
  xp: 'About {xp} {skill} XP an hour',
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
  ended_gold_out: '{name} stopped training {skill}. You ran out of gold for the next hour.',
  ended_hours: '{name} finished {skill} training. That was the longest one session can run.',
  ended_left: 'You stopped {name}\'s {skill} training.',
  ended_other: '{name} stopped training {skill}.',

  /* Why Start is off, said before the press; the same words answer the server's refusal. */
  closed: 'The training yard is closed right now.',
  hunting: '{name} is out hunting. Come back to town to train.',
  in_party: '{name} is in a party. Training is solo, so leave the party first.',
  short_gold: 'The first hour costs {fee} gold. You have {purse}.',
  dummy_busy: '{who} is on your dummy at home right now. Only one hero can use it at a time.',

  /* THE HOUSE DUMMY (the House window). */
  dummy_head: 'Training dummy',
  dummy_lead: 'Your account gets one dummy. It trains as fast as the yard and costs no fee. Unlock one skill at a time. Each one costs more.',
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
});
