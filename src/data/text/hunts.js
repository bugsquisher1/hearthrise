// ════════════════════════════════════════════════════════════════════════
// src/data/text/hunts.js — THE HUNTS LIST'S WORDS: a ground's band, packs, tier,
// who may come, the advice and the warnings (src/shell/hunt-list.js).
//
// One row per label, read by t('hunts.<key>'). LABELS, NOT SENTENCES (Tyler 2026-11-14: "Recommended: 4+ players" is
// "Perfect. Now do it like that for everything outside of actual lore"): a fact, warning or hint here is the short form
// players know from MMOs, no period. A line built from several labels puts each on its own line (hunt-list.js joins
// with a line break). A harder tier says its plain line (src/data/hunt-tiers.js TIER_LINES) and its death line;
// tier_choice names it beside Enter ("Deadly: big groups that hit hard.").
// ════════════════════════════════════════════════════════════════════════

export const HUNTS_TEXT = Object.freeze({
  /* the Tally widget's folded title when every held task is done (src/shell/widgets/tally-hud.js) */
  tally_done: 'Done',
  /* Who lives here: one note under the line names each area caster's spells (src/shell/windows/hunt-detail.js), so no card grows a line. */
  casts: '{name} casts {spells}.',
  /* A hall built for a group: a warning, never a gate (Tyler 2026-11-08). {n} is the pocket's forParty, a digit (Tyler 2026-11-14). */
  party_size: 'Recommended: {n}+ players',

  /* How crowded a ground is. {size} is a count or pack_range. */
  pack_range: '{min} to {max}',
  packs: { one: '{count} pack of {size}, respawn {secs}s', other: '{count} packs of {size}, respawn {secs}s' },
  packs_boss: { one: '{count} pack of {size} + boss, respawn {secs}s', other: '{count} packs of {size} + boss, respawn {secs}s' },

  /* What a tier does. */
  tier_choice: '{tier}: {head}.',

  /* The band, and a ground above the hero. */
  band: 'Level {lo} to {hi}',
  band_you: 'Level {lo} to {hi} (you: {level})',
  /* Three lines (Tyler 2026-11-14): "{n} Levels under" / "Higher risk, better loot" / "Death: −6% Level XP" */
  above_level: 'Higher risk, better loot',
  far_above_level: 'Much higher risk, better loot',
  range_under: { one: '{count} Level under', other: '{count} Levels under' },
  range_die: 'Death: −{loss}% Level XP',
  /* the same, with Blessings on: the share a death would really take, the server's held cut (hr_blessing_view permille) */
  range_die_blessed: 'Death: −{loss}% Level XP (Blessings on)',
  /* The away card: the hunt's best find, gear or a Rare (src/shell/away-recap.js). */
  away_best: 'Best find: {item}',
  seat_level: '{name} (Level {level})',
  seats_under: { one: 'Under Level {level}, death risk: {who}', other: 'Under Level {level}, death risk: {who}' },
  share_you: 'Your Level XP share: {pct}% (far under Level {top})',
  share_seat: '{name}\'s Level XP share: {pct}% (far under Level {top})',

  /* The advice: the ground at the Level and why, then the easier pick on its own line. */
  level_one: 'Level {level}',
  levels_range: 'Levels {lo} to {hi}',
  no_ground: 'No good hunt for {levels} yet',
  nearest_below: 'Nearest below: {ground} (Level {lo} to {hi})',
  /* A ground whose band holds the Level but is built tough (Tyler 2026-11-11: "no good hunt" over a row reading "In your range" was a lie). */
  right_but_tough: '{ground}: right for {levels}, tough monsters',
  right_easier: '{ground}: right for {levels}',
  /* the same, when the server's best alone there lost gold (hunt_bests balanceH < 0) */
  right_but_lost: '{ground}: right for {levels}, lost {gold}/h alone',
  easier: 'Easier: {easier} (Level {lo} to {hi})',
  tag_right_party: 'Right for your party',
  tag_right_level: 'Right for your level',
  tag_next_step: 'Next step up',

  /* This hero's bests. */
  best_rate: '{xp} Level XP/h, balance {gold}/h',
  best_alone: 'Best alone: {rate}',
  best_party: 'Best in a party: {rate}',
  best_none: 'No best yet (hunt {min}+ min to set one)',
  best_line: 'Best {xp} Level XP/h',
  best_line_none: 'No best yet',

  /* Where the hero stands, and who may come. */
  fit_above: 'Above your level',
  fit_far: 'Far above your level',
  fit_below: 'Below your level',
  fit_in: 'In your range',
  heroes_up_to: 'Players: 1 to {max}',
  heroes_one: 'Players: 1',
});
