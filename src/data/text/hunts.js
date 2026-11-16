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
  /* the Tally widget's folded title when every held task is done (src/shell/widgets/tally-hud.js) */
  tally_done: 'Done',
  /* Who lives here: one note under the line names each area caster's spells (src/shell/windows/hunt-detail.js), so no card grows a line. */
  casts: '{name} casts {spells}.',
  /* A hall built for a group: a warning, never a gate (Tyler 2026-11-08). {n} is a number word (count_2 …). */
  party_boss: '{boss} is built for a group of {n} or more. Alone, you still fight him, and he can kill you.',
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
  packs: { one: '{count} pack of {size}, respawning every {secs} seconds', other: '{count} packs of {size}, respawning every {secs} seconds' },
  packs_boss: { one: '{count} pack of {size} and a boss, respawning every {secs} seconds', other: '{count} packs of {size} and a boss, respawning every {secs} seconds' },

  /* What a tier does. */
  tier_choice: '{tier}: {head}.',

  /* The band, and a ground above the hero. */
  band: 'Level {lo} to {hi}',
  band_you: 'Level {lo} to {hi}, you are {level}',
  above_level: 'Its monsters are stronger than you. You’ll spend more on supplies and you might die, but you get more XP and better loot.',
  far_above_level: 'Its monsters are far stronger than you. You’ll spend a lot more on supplies and you might die, but you get more XP and better loot.',
  range_under: { one: 'You\'re {count} Level under this ground.', other: 'You\'re {count} Levels under this ground.' },
  range_die: 'If you die, the hunt ends and you lose {loss}% of your Level XP.',
  /* the same, with Blessings on: the share a death would really take, the server's held cut (hr_blessing_view permille) */
  range_die_blessed: 'If you die, the hunt ends. With your Blessings on, you lose {loss}% of your Level XP.',
  /* The away card: the hunt's best find, gear or a Rare (src/shell/away-recap.js). */
  away_best: 'Your best find this hunt was the {item}.',
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
  /* A ground whose band holds the Level but is built tough (Tyler 2026-11-11: "no good hunt" over a row reading "In your range" was a lie). */
  right_but_tough: '{ground} is right for {levels}, but its monsters are tough. {easier} (Level {lo} to {hi}) is the easier hunt.',
  right_easier: '{ground} is right for {levels}. {easier} (Level {lo} to {hi}) is the easier hunt.',
  /* the same, when the server's best alone there lost gold (hunt_bests balanceH < 0) */
  right_but_lost: '{ground} is right for {levels}, but alone you lost {gold} an hour there. {easier} (Level {lo} to {hi}) is the easier hunt.',
  tag_right_party: 'Right for your party',
  tag_right_level: 'Right for your level',
  tag_next_step: 'Next step up',

  /* This hero's bests. */
  best_rate: '{xp} Level XP and a balance of {gold} per hour',
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

  /* SCALED HUNT (audit F26; src/shell/windows/scale-pane.js): an outgrown early ground fought at the leader's Level, hours bought with gold.
     Labels only (Tyler 2026-11-14). The dials are Tyler's ("+x% exp +x% more damage from monsters +x% more gold from monsters", and HP), as multiples: +4,627% read worse than x47. */
  scale_head: 'Scaled hunt',
  scale_tag: 'Scalable',
  scale_tag_on: 'Scaled: Level {level}',
  scale_locked: 'Unlocks at Level {level}',
  scale_level: 'Scaled to Level {level}',
  scale_price: 'Price: {price} / hour',
  scale_banked: 'Banked: {time}',
  scale_banked_none: 'Banked: none',
  scale_xp: 'Level XP ×{times}',
  scale_gold: 'Gold ×{times}',
  scale_dmg: 'Monster damage ×{times}',
  scale_hp: 'Monster HP ×{times}',
  scale_drops: 'Drops unchanged',
  scale_active: 'Active: Level {level}',
  scale_party: 'Party: leader\'s hours apply',
  scale_bank_full: 'Bank full: {max} h',
  scale_day_full: 'Daily limit: {max} h',
  scale_short: 'Not enough gold',
  scale_use: 'Use scaled hours',
  scale_hours_label: 'Hours',
  scale_hours: '{hours} h',
  scale_buy: 'Buy {hours} h for {price}',
  scale_confirm_q: 'Buy {hours} h for {price}?',
  scale_confirm_after: 'Gold after: {gold}',
  scale_confirm_yes: 'Buy',
  scale_buying: 'Buying…',
  scale_bought: '{hours} h added',
  scale_saving: 'Saving…',
});
