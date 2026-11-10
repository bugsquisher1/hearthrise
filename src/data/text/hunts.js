// ════════════════════════════════════════════════════════════════════════
// src/data/text/hunts.js — THE HUNTS LIST'S WORDS: a ground's band, packs, tier,
// who may come, the advice and the warnings (src/shell/hunt-list.js).
//
// One row per sentence or label, read by t('hunts.<key>'). A harder tier says its
// plain line (src/data/hunt-tiers.js TIER_LINES, Tyler 2026-11-08: no numbers on a
// card) and its death line; tier_choice names it beside Enter ("Deadly: big groups
// that hit hard.").
// ════════════════════════════════════════════════════════════════════════

export const HUNTS_TEXT = Object.freeze({
  /* A hall built for a group: a warning, never a gate (Tyler 2026-11-08). {n} is a number word (count_2 …). */
  party_boss: 'The {boss} is built for a group of {n} or more. Alone, you still fight him, and he can kill you.',
  party_hall: 'One hall here is built for a group of {n} or more. Alone, you still fight it, and it can kill you.',
  count_1: 'one',
  count_2: 'two',
  count_3: 'three',
  count_4: 'four',
  count_5: 'five',
  count_6: 'six',
  count_7: 'seven',
  count_8: 'eight',

  /* How crowded a ground is. {size} is a count or pack_range. */
  pack_range: '{min} to {max}',
  packs: { one: '{count} pack of {size} · back in {secs} s', other: '{count} packs of {size} · back in {secs} s' },
  packs_boss: { one: '{count} pack of {size}, a boss · back in {secs} s', other: '{count} packs of {size}, a boss · back in {secs} s' },

  /* What a tier does. */
  tier_choice: '{tier}: {head}.',

  /* The band, and a ground above the hero. */
  band: 'Level {lo} to {hi}',
  band_you: 'Level {lo} to {hi}, you are {level}',
  above_level: 'Its monsters are stronger than you. You’ll spend more on supplies and you might die, but you get more XP and better loot.',
  far_above_level: 'Its monsters are far stronger than you. You’ll spend a lot more on supplies and you might die, but you get more XP and better loot.',
  range_under: { one: 'You\'re {count} Level under this ground.', other: 'You\'re {count} Levels under this ground.' },
  range_die: 'If you die, the hunt ends and you lose {loss}% of your Level XP.',
  seat_level: '{name} (Level {level})',
  seats_under: { one: '{who} is under this ground’s Level {level}. It will hit them hard, and they could die.',
    other: '{who} are under this ground’s Level {level}. It will hit them hard, and they could die.' },
  share_you: 'You earn {pct}% of a full share of Level XP here, so far under Level {top}.',
  share_seat: '{name} earns {pct}% of a full share of Level XP here, so far under Level {top}.',

  /* The advice. */
  level_one: 'Level {level}',
  levels_range: 'Levels {lo} to {hi}',
  no_ground: 'There’s no good hunt for {levels} yet.',
  nearest_below: '{ground} (Level {lo} to {hi}) is the nearest below.',
  tough_at_level: '{ground} is at your level. Its monsters are tough, so alone you’ll spend more than you earn.',
  tag_right_party: 'Right for your party',
  tag_right_level: 'Right for your level',
  tag_next_step: 'Next step up',

  /* This hero's bests. */
  best_rate: '{xp} Level XP per hour · balance {gold} per hour',
  best_alone: 'Best alone: {rate}',
  best_party: 'Best in a party: {rate}',
  best_none: 'No best here yet. Hunt {min} minutes or more to set one.',
  best_line: 'Best {xp} Level XP/h',
  best_line_none: 'No best yet',

  /* Where the hero stands, and who may come. */
  fit_above: 'Above your level',
  fit_far: 'Far above your level',
  fit_below: 'Below your level',
  fit_in: 'In your range',
  heroes_up_to: 'Alone or with up to {n} more',
  heroes_one: 'One hero',
});
