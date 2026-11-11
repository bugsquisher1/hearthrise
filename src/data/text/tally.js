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
  /* HER LINE, one per state. {task} is "25 Giant Rats" or "The Rat King, 5 times"; {ground} the hunt's name. */
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
  day_paid: 'Paid today {paid} of {perDay}',
  day_resets: 'resets in {left}',

  /* Section heads. */
  head_mine: 'Your tallies',
  head_mine_count: '{held} of {max}',
  head_board: 'Her board',

  /* A held task's entry: what she pays for it (her board's own line), and a done one's next step. */
  get: 'You\'ll get {gold} and {pick}.',
  once: 'She gives it once, to the first of these she pays.',
  done_hunting: 'Done. I\'ll pay you when you\'re back in town.',
  done_town: 'Done. I\'ll pay you now.',
  done_tomorrow: 'Done. I\'ll pay you for this one tomorrow.',
  done_bag: 'Done. Make room in your bag and I\'ll pay you.',
  counting_here: 'Counting here in {ground}.',
  not_here: 'Not here',
  keep_on: 'You get this task again as soon as she pays for it.',
  keep_off: 'Once she pays for it, it won\'t come back by itself.',
  given_up: 'You gave up the {label}. Its count is gone.',
  taken: 'Taken. {counts}',
  taken_weight: 'Taken. {counts} She\'ll pay you in {weight} armor.',

  /* Her board: the rows she still has for you, and the one line that says why every Take is off. */
  board_loading: 'Loading her board…',
  board_hunting: 'You can take more when you\'re back in town.',
  board_full: 'You have {n} of mine already. Finish one or give one up.',
  board_level: 'Level {level}',
  board_level_party: 'Level {level}, party',
  board_party: 'Best with a party',
  take_held_why: 'You already have this task.',
  first_take_worn: 'Your first Take asks her for {weight} armor, the weight you wear most. Change it below any time.',
  first_take_role: 'Your first Take asks her for {weight} armor, which suits {role}. Change it below any time.',
  no_weight: 'Pick the armor weight she pays you in first. You can change it later.',

  /* Her pick, folded to one line at the foot; Change opens the picker (Take, Abandon, Keep and Close are the glossary's, src/data/text/controls.js). */
  pick_label: 'The armor weight she pays you in',
  order_label: 'The order she fills your slots in',
  pick_line: 'She pays you in {weight} armor, {first} first, then {second} and {third}.',
  pick_none: 'Pick the armor weight she pays you in.',
  pick_none_suggest: 'Your first Take picks the armor weight for you, or pick it here.',
  change: 'Change',
  weight_heavy: 'Heavy',
  weight_medium: 'Medium',
  weight_light: 'Light',
  weight_set: 'She\'ll pay you in {weight} armor from now on.',
  order_how: 'She fills your slots in this order. Tap one to have it first.',
  slot_first_why: 'This one already comes first.',
  rule_worn: 'She skips a slot you already wear at that tier or better. Once she\'s out of pieces for a ground, she pays in materials.',
  slot_helmet: 'Head',
  slot_body: 'Body',
  slot_pants: 'Legs',
  slot_boots: 'Feet',
  slot_gloves: 'Hands',
  slot_belt: 'Waist',

  /* While an ask is out, and what she says when it lands. */
  checking: 'Tamsin checks your tasks…',
  paid_for: { one: 'Tamsin paid you for {count} task.', other: 'Tamsin paid you for {count} tasks.' },
  taking: 'Taking it…',
  giving_up: 'Giving it up…',
  saving: 'Saving…',
});
