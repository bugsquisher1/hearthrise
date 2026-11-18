// ════════════════════════════════════════════════════════════════════════
// src/data/text/training.js — THE TRAINING YARD'S AND THE HOUSE DUMMY'S WORDS (src/shell/windows/training.js,
// src/shell/windows/house-dummy.js, src/shell/training-words.js).
//
// One row per line, read by t('training.<key>'). Labels, not sentences (Tyler 2026-11-14: everything outside lore reads as the genre's
// standard UI, "Requires Level 30", "Not enough gold"; lane/c-training-gear-arm swept the Training window, its refusals, the hunt bar
// and the world line to it; the House dummy's rows are still to sweep). Every number in a row is the server's (the `training` section,
// a refusal's own figures); the windows fill them in and never work one out.
// ════════════════════════════════════════════════════════════════════════

export const TRAINING_TEXT = Object.freeze({
  /* What the yard is, said once at the top. */
  lead: 'Skill XP only, no stamina cost',
  purse: 'Gold: {gold}',

  /* The choices. */
  skill_head: 'Skill',
  where_head: 'Where',
  where_yard: 'Training Yard',
  where_house: 'Home dummy',

  /* The picked skill's quote, every number the server's. */
  fee: '{gold} gold/h',
  fee_house: 'No fee',
  xp: '{xp} {skill} XP/h',
  xp_item: '{xp} {skill} XP/h at 200%',
  to_level: 'About {hours} to {skill} {level}',
  max_hours: 'Max session: {hours} h',
  paid_ahead: 'Paid hourly in advance',

  /* The press and its answer. */
  press_start: 'Start training',
  busy_start: 'Starting…',
  busy_stop: 'Stopping…',
  started: 'Training started',

  /* While it runs. */
  run_now: 'Training {skill}',
  run_where_yard: 'Training Yard, {gold} gold/h',
  run_where_house: 'Home dummy, no fee',
  run_clock: 'Elapsed: {time}',
  run_paid: 'Paid: {gold} gold',

  /* Why the last run ended (the section's last_stop.reason, a training session's end reason): a label, never a hunt's words (Tyler
     2026-11-16), in the end card's label form (src/data/text/summary.js end_*). The Training window, the end card, the away line and
     the alert all read these. {hours} the longest session. */
  ended_gold_out: 'Training ended (out of gold)',
  ended_hours: 'Training ended ({hours} h reached)',
  ended_left: 'Training stopped',
  ended_other: 'Training ended',
  /* THE AWAY LINE (src/shell/away-recap.js) and THE ALERT (src/shell/alerts.js) for a training session. {at} the bar's place words,
     {why} one of the labels above, {time} how long ago it ended. */
  away_trained: '{name} trained {skill} {at}',
  away_still: 'Still training.',
  away_ended_ago: '{why}, {time} ago.',
  alert_ended: '{name}: {why}',

  /* Why Start is off, said before the press; the same words answer the server's refusal. */
  closed: 'Training Yard closed',
  hunting: 'Not available while hunting',
  in_party: 'Not available in a party',
  short_gold: 'Not enough gold (need {fee}, have {purse})',
  low_level: 'Requires Level {need}',
  dummy_busy: 'Dummy in use by {who}',

  /* THE TRAINING ITEMS (2027-04-23-training-gear.sql, Tyler 2026-11-14): labels, the server's numbers, and one card line. */
  gear_head: 'Training item',
  gear_left: '{item} switched off, {time} left',
  gear_left_on: '{item} at 200%, {time} left',
  gear_use: 'Use {item}',
  /* {item} is the catalogue's name with its size, "Training Sword (12 h)" (src/data/training.js). */
  gear_bound: '{item}, bound',
  gear_confirm: '{item}: {price} gold',
  gear_in_bag: '{count} in bag',
  gear_in_storage: '{count} in Storage',
  gear_price: '{gold} gold',
  /* what the day's count counts (audit 2026-11-18 A14: "Daily limit: 0/10" named nothing) */
  gear_today: 'Bought today: {today} / {max}',
  gear_card: 'Effect: 200% {skill} XP while training',
  gear_closed: 'Not for sale yet',
  press_buy: 'Buy',
  press_open: 'Open',
  busy_buy: 'Buying…',
  busy_open: 'Opening…',
  bought: 'Bought {item}',
  opened: 'Opened {item}',
  gear_short: 'Not enough gold (need {price}, have {purse})',
  gear_limit: 'Daily limit reached ({max}/{max})',
  gear_still_open: 'Training item already active',
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
     figure the server's last stop for it, as the result block's labels (its level line is the summary's "Defense 12 → 14"). {skill} the skill's name. */
  card_xp: '{skill} XP',
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
  coach_next: 'Next: {skill} {level} in about {hours}',

  /* THE WORLD WHILE A HERO TRAINS (src/world/world-boot.js): where it is, and the window that runs it. */
  world_line: 'Training {skill} at the Training Yard',
  world_line_house: 'Training {skill} on the home dummy',
  world_open: 'Open Training',
});
