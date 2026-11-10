// ════════════════════════════════════════════════════════════════════════
// src/data/text/hunts.js — THE HUNTS LIST'S WORDS: a ground's band, packs, tier,
// who may come, the advice and the warnings (src/shell/hunt-list.js).
//
// One row per sentence or label, read by t('hunts.<key>'). A tier line is its
// head (tier_pull* / tier_same*: what a pull brings and how much harder) closed
// by tier_head_end or tier_head_blow, then tier_cost. The *_mid heads stand
// inside a sentence ("Deadly: the same monsters, hitting 50% harder.").
// ════════════════════════════════════════════════════════════════════════

export const HUNTS_TEXT = Object.freeze({
  /* A party-only hall. {n} is a number word (count_2 …). */
  party_boss: 'The {boss} wants a party of {n} or more. Alone, you skip that hall.',
  party_hall: 'One hall here wants a party of {n} or more. Alone, you skip it.',
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
  twice_as_hard: 'twice as hard',
  times_as_hard: '{x} times as hard',
  pct_harder: '{pct} harder',
  twice_the_hp: 'twice the HP',
  times_the_hp: '{x} times the HP',
  pct_more_hp: '{pct} more HP',
  tier_pull: '{n} monsters a pull',
  tier_pull_hard: '{n} monsters a pull, hitting {harder}',
  tier_pull_tough: '{n} monsters a pull, with {tougher}',
  tier_pull_hard_tough: '{n} monsters a pull, hitting {harder}, with {tougher}',
  tier_same: 'The same monsters',
  tier_same_hard: 'The same monsters, hitting {harder}',
  tier_same_tough: 'The same monsters, with {tougher}',
  tier_same_hard_tough: 'The same monsters, hitting {harder}, with {tougher}',
  tier_same_mid: 'the same monsters',
  tier_same_mid_hard: 'the same monsters, hitting {harder}',
  tier_same_mid_tough: 'the same monsters, with {tougher}',
  tier_same_mid_hard_tough: 'the same monsters, hitting {harder}, with {tougher}',
  tier_head_end: '{head}.',
  tier_head_blow: '{head}, and the biggest blow here is {hit}, not {was}.',
  tier_cost: 'Each kill earns {xp} more Level XP, with the same gold and drops. Expect a bigger food bill, and you can die. A death ends the hunt and costs {loss}% of your XP.',
  tier_choice: '{tier}: {head}.',

  /* The band, and a ground above the hero. */
  band: 'Level {lo} to {hi}',
  band_you: 'Level {lo} to {hi}, you are {level}',
  above_level: 'Its monsters are stronger than you. Expect to spend more on supplies, or to die. More XP and better loot.',
  far_above_level: 'Its monsters are far stronger than you. Expect to spend much more on supplies, or to die. More XP and better loot.',
  range_under: { one: 'You\'re {count} Level under this ground.', other: 'You\'re {count} Levels under this ground.' },
  range_die: 'If you die, the hunt ends and you lose {loss}% of your XP.',
  seat_level: '{name} (Level {level})',
  seats_under: { one: '{who} is under this ground’s Level {level}. It will hit them hard, and they could die.',
    other: '{who} are under this ground’s Level {level}. It will hit them hard, and they could die.' },
  share_you: 'You earn {pct}% of a full share of Level XP here, so far under Level {top}.',
  share_seat: '{name} earns {pct}% of a full share of Level XP here, so far under Level {top}.',

  /* The advice. */
  level_one: 'Level {level}',
  levels_range: 'Levels {lo} to {hi}',
  no_ground_solo: 'There\'s no ground for one hero at {levels} yet.',
  no_ground_party: 'There\'s no ground for your party at {levels} yet.',
  nearest_below: '{ground} (Level {lo} to {hi}) is the nearest below.',
  bring_party: '{ground} is right for your level if you bring a party.',
  tag_right_party: 'Right for your party',
  tag_right_level: 'Right for your level',
  tag_next_step: 'Next step up',
  best_with_party: 'Best with a party of 2–{max}',

  /* This hero's bests. */
  best_rate: '{xp} Level XP per hour · balance {gold} per hour',
  best_alone: 'Best alone: {rate}',
  best_party: 'Best in a party: {rate}',
  best_none: 'No best here yet. A hunt of {min} min or more sets your best.',
  best_line: 'Best {xp} Level XP/h',
  best_line_none: 'No best yet',

  /* Where the hero stands, and who may come. */
  fit_above: 'Above your level',
  fit_far: 'Far above your level',
  fit_below: 'Below your level',
  fit_in: 'In your range',
  heroes_solo_from: 'Best with 2 to {n}, and alone it pays from Level {level}',
  heroes_lone_ok: 'Best with 2 to {n}, and a lone hero can enter',
  heroes_up_to: 'Alone or with up to {n} more',
  heroes_one: 'One hero',
});
