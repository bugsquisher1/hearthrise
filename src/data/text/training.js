// ════════════════════════════════════════════════════════════════════════
// src/data/text/training.js — THE TRAINING WINDOW'S WORDS (src/shell/windows/training.js, src/shell/training-words.js).
//
// One row per sentence, read by t('training.<key>'). Tyler's voice (2026-11-09, docs/DESIGN_STANDARDS.md §3): what happens to
// the player, short, plain, "you", never the machinery. Every number in a row is the server's (the `training` section, a
// refusal's own figures) or the server's clock against the run's end; the window fills them in, it never works one out.
// A refusal that names no number reads from src/data/refusal-words.js (REFUSAL_VERB_WORDS training_start / training_stop).
// ════════════════════════════════════════════════════════════════════════

export const TRAINING_TEXT = Object.freeze({
  /* What the yard is, said once at the top. */
  lead: 'Train a combat skill at the yard. It costs gold by the hour and gives skill XP. You get no Level XP and no loot.',
  rate: 'At Level {level}, an hour here earns {xp} skill XP and costs {gold} gold.',
  purse: 'You have {gold} gold.',
  /* Before the server has named the hero (never once a hero is loaded). */
  your_hero: 'Your hero',

  /* The three choices. */
  skill_head: 'Skill',
  next_level: '{skill} is {level}. The next level takes about {time} here.',
  hours_head: 'How long',
  hours_none: 'Until I stop it',
  keep_head: 'Keep at least',
  keep_note: 'Training stops when your gold gets down to this.',

  /* The press and its answer. */
  press_start: 'Start training',
  press_stop: 'Stop training',
  busy_start: 'Heading to the yard…',
  busy_stop: 'Stopping…',
  /* the run itself is said above the press: this only says the hero is on the way */
  started: '{name} heads to the yard.',

  /* While it runs: the section's run, settled by the server about once a minute. */
  run_now: '{name} is training {skill}.',
  run_so_far: 'So far {name} has earned {xp} XP and spent {gold} gold.',
  run_left: 'It stops in {time}.',
  run_until: 'It runs until you stop it.',
  run_keep: 'It also stops if your gold gets down to {keep}.',
  run_keep_none: 'It also stops if your gold runs out.',

  /* Why the last run ended (the section's last_stop.reason), and what it came to. */
  ended_stop_after: '{name} finished {time} of {skill} training.',
  ended_keep_gold: '{name} stopped training {skill}. You\'re down to the gold you chose to keep.',
  ended_stopped: 'You stopped {name}\'s {skill} training.',
  ended_hunt: '{name} stopped training {skill} to go hunting.',
  ended_switched: '{name} stopped training {skill} to do something else.',
  ended_feature_off: 'The yard closed, so {name} stopped training {skill}.',
  ended_catalogue: 'The yard doesn\'t train {skill} anymore, so {name} stopped.',
  earned: '{name} earned {xp} {skill} XP for {gold} gold.',

  /* Why Start is off, said before the press; the same words answer the server's refusal. */
  closed: 'The training yard is closed right now.',
  hunting: '{name} is out hunting. Come back to town to train.',
  level_low: 'The yard opens at Level {need}. {name} is Level {level}.',
  keep_over_purse: 'You have {purse} gold. Keep less than that to train.',
  keep_typed: 'Type how much gold to keep, as a whole number.',
  keep_max: 'You can keep at most {max} gold.',

  /* The server's refusals that carry its numbers. */
  cannot_pay: 'You have {purse} gold and want to keep {keep}. That isn\'t enough to start.',
  bad_hours: 'Pick {min} to {max} hours, or until you stop it.',
  not_training: '{name} isn\'t training right now.',
  settle_first: '{name} is still finishing a job in town. Try again in a few seconds.',

  /* A span of time, inside the rows above. */
  time_hours: { one: '{count} hour', other: '{count} hours' },
  time_minutes: { one: '{count} minute', other: '{count} minutes' },
  time_both: '{hours} {minutes}',
  time_under_minute: 'less than a minute',
});
