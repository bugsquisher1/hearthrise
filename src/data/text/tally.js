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
  day_resets: 'resets in {left}',

  /* Section heads. */
  head_mine: 'Tallies',
  head_mine_count: '{held} of {max}',
  head_board: 'Her board',

  /* A held task's entry: what she pays for it (her board's own line), and a done one's next step. */
  get: 'Reward: {gold} and {pick}',
  once: 'Shared piece: paid once, on the first task done',
  done_hunting: 'Done, collect in town',
  done_town: 'Done, collecting now',
  done_tomorrow: 'Done, collect tomorrow',
  done_bag: 'Done, bag full',
  counting_here: 'Counting in {ground}',
  not_here: 'Not here',
  /* the box on a held task (audit 2026-11-15 F6: it read "Keep" beside Abandon, and nothing said keep what): its label, and its hover */
  keep: 'Repeat',
  keep_why: 'Ticked: repeats after payout',
  keep_on: 'Repeats as soon as she pays',
  keep_off: 'Does not repeat after she pays',
  given_up: 'Abandoned {label}, count lost',
  taken: 'Taken: {counts}',
  taken_weight: 'Taken: {counts}, paid in {weight} armor',

  /* Her board: the rows she still has for you, and the one line that says why every Take is off. */
  board_loading: 'Loading her board…',
  board_hunting: 'Take more in town',
  board_full: 'Max tasks: {n} · Finish or abandon one',
  board_level: 'Level {level}',
  board_level_party: 'Level {level}, party',
  board_party: 'Best with a party',
  take_held_why: 'Task already held',
  no_weight: 'Pick an armor weight first',

  /* Her pick, folded to one line at the foot; Change opens the picker (Take, Abandon, Keep and Close are the glossary's, src/data/text/controls.js). */
  pick_label: 'Reward armor weight',
  order_label: 'Reward slot order',
  pick_line: 'Paid in {weight} armor: {first}, then {second} and {third}',
  pick_none: 'Armor weight: none',
  /* Before the server answers her first-visit ask (tally.js suggestedWeight): the weight that suits and why, said once. {role} is "a shield tank". */
  suggest_worn: 'Suggested: {weight}, worn most',
  suggest_role: 'Suggested: {weight}, for {role}',
  change: 'Change',
  weight_heavy: 'Heavy',
  weight_medium: 'Medium',
  weight_light: 'Light',
  weight_set: 'Now paid in {weight} armor',
  order_how: 'Tap a slot to move it first',
  slot_first_why: 'Already first',
  rule_worn: 'Skips slots worn at that tier or better, then pays materials',
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
  giving_up: 'Giving it up…',
  saving: 'Saving…',
});
