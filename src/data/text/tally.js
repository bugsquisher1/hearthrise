// ════════════════════════════════════════════════════════════════════════
// src/data/text/tally.js — TAMSIN'S TALLY WINDOW'S WORDS (src/shell/windows/tally.js).
//
// One row per sentence or label, read by t('tally.<key>'). Tamsin talks in the
// first person, one line per state (the mock lane 2026-11-11, Tyler: "the menu /
// ui itself sucks"): the window picks the line from the server's tally section
// and her board, never from anything the client counted. Every number in a line
// is the server's (kills, target, gold, the pick, the day's count).
// ════════════════════════════════════════════════════════════════════════

export const TALLY_TEXT = Object.freeze({
  /* HER LINE, one per state (@sentence: Tamsin talking, and NPC talk is lore). {task} is "25 Giant Rats" or "The Rat King, 5 times"; {ground} the hunt's name. */
  say_first: 'I kept the mill\'s rats down myself for thirty years. Then they got a king, so now I pay people to do it. Take one off my board.',
  say_none: 'Board\'s full of work. Take one and go hunt, and I\'ll pay you when you\'re back.',
  say_taken: '{task} in {ground}. Every kill counts, even while you\'re away, so off you go.',
  say_counting: '{down} down, {left} to go. Every one counts, even while you\'re away.',
  say_done_hunting: 'That\'s all {count}. Come back to town and I\'ll pay you.',
  say_done_town: 'That\'s all {count}. Let me get your pay.',
  say_done_bag: 'That\'s all {count}, but your bag\'s full. Make room and I\'ll pay you.',
  say_paid: 'There you go, {gold} gold and {pick}. Want another?',
  say_capped: 'That\'s {n} today, and {n}\'s all I pay for. Bring the {label} back tomorrow.',
  say_capped_none: 'That\'s {n} today, and {n}\'s all I pay for. Come back tomorrow.',
  count_1: 'one',
  count_2: 'two',
  count_3: 'three',

  /* The day's count beside her name, from the server's cap fields. {left} is "6 h" or "20 m". */
  day_paid: 'Paid today: {paid} of {perDay}',
  day_resets: 'Resets in {left}',

  /* Section heads. */
  head_mine: 'Your tasks',
  head_mine_count: '{held} of {max}',
  head_board: 'Task board',

  /* A held task's entry: what she pays for it (her board's own line), and a done one's next step. The two are joined by a space. */
  get: 'Reward: {gold} and {pick}',
  once: 'If two tasks offer the same piece, she only pays it for the first one you finish.',
  done_hunting: 'Done. Collect in town.',
  done_town: 'Done. Collecting now.',
  done_tomorrow: 'Done. Collect tomorrow.',
  done_bag: 'Done, but your bag is full.',
  counting_here: 'Counting kills in {ground}',
  not_here: 'Not counting in this hunt',
  keep_on: 'This task repeats after she pays you.',
  keep_off: 'This task won\'t repeat after she pays you.',
  given_up: 'Abandoned {label}. Your progress is lost.',
  taken: 'Task taken: {counts}',
  taken_weight: 'Task taken: {counts}. She pays in {weight} armor.',

  /* Her board: the rows she still has for you, and the one line that says why every Take is off. */
  board_loading: 'Loading her board…',
  board_hunting: 'You can take more tasks in town',
  board_full: 'You can hold {n} tasks. Finish or abandon one first.',
  board_level: 'Level {level}',
  board_level_party: 'Level {level} (party)',
  board_party: 'Best with a party',
  take_held_why: 'You already have this task',
  no_weight: 'Pick an armor weight first',

  /* Her pick, folded to one line at the foot; Change opens the picker (Take, Abandon, Keep and Close are the glossary's, src/data/text/controls.js). */
  pick_label: 'Armor weight she pays in',
  order_label: 'Order she fills your slots in',
  pick_line: 'Paid in {weight} armor: {first}, then {second} and {third}',
  pick_none: 'No armor weight picked yet.',
  /* Before the server answers her first-visit ask (tally.js suggestedWeight): the weight that suits and why, said once. {role} is "a shield tank". */
  suggest_worn: 'Suggested: {weight} (what you wear most)',
  suggest_role: 'Suggested: {weight} (for {role})',
  change: 'Change',
  weight_heavy: 'Heavy',
  weight_medium: 'Medium',
  weight_light: 'Light',
  weight_set: 'Now paid in {weight} armor',
  order_how: 'Tap a slot to move it first',
  slot_first_why: 'This one already comes first.',
  rule_worn: 'She skips slots where you already wear that tier or better. After that, she pays in materials.',
  slot_helmet: 'Head',
  slot_body: 'Body',
  slot_pants: 'Legs',
  slot_boots: 'Feet',
  slot_gloves: 'Hands',
  slot_belt: 'Waist',

  /* While an ask is out, and what she says when it lands. */
  checking: 'Checking tasks…',
  paid_for: { one: 'Tamsin paid for {count} task', other: 'Tamsin paid for {count} tasks' },
  taking: 'Taking it…',
  giving_up: 'Abandoning…',
  saving: 'Saving…',
});
