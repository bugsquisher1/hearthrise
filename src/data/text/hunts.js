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

  /* THE WINDOW (src/shell/windows/hunts.js, hunt-detail.js): heads, the lead line, presses and answers. {ground} a hunt's name. */
  win_list: 'Hunts',
  win_page: 'The picked hunt',
  head_packs: 'The packs',
  head_tiers: 'Tiers',
  head_lives: 'Who lives here',
  head_drops: 'Drops',
  head_mats: 'Materials',
  head_rares: 'Rare drops',
  head_best: 'Your best here',
  head_go_as: 'Go as',
  head_before: 'Before you go',
  /* under Go as: Hunt prep, where the setups are made (its icon left the top bar, 2026-11-16) */
  go_prep: 'Change setups',
  head_party: 'With a party',
  rares_per: 'chance per kill of its creature',
  per_kill_alone: 'chance per kill, hunting alone',
  per_kill_party: 'chance per kill (party of {n}, one hero gets each drop)',
  level_band: 'Level {lo}–{hi}',
  /* the lead line over the list */
  lead_hunting: 'Hunting in {ground} (leave it to go elsewhere)',
  lead_follower: 'Your party leader picks the hunt. You enter with your own setup.',
  lead_party: 'Pick a hunt, then Enter with party (each hero uses their setup)',
  /* @sentence: the first line a new player reads in the window; it teaches the loop */
  lead_solo: 'Pick a hunt, then Enter. Your hero walks there and fights on its own.',
  off_follower: 'Party: {leader} picks the hunt (leave the party to pick your own)',
  your_leader: 'your leader',
  bag_empty: 'Hunt bag: empty',
  bag_holds: 'Hunt bag: {items}',
  party_lead: 'Party leader ({n} heroes)',
  party_finder: 'Open the party finder',
  party_find: 'Find a party',
  /* @sentence: how a second hero joins; the Characters screen is a step a label can't name */
  party_others: 'Your other heroes can come too. Play one from Characters and it shows here. Up to four play at once.',
  party_bring: 'Bring {name}',
  go_on_now: 'on now',
  go_puts_on: 'Enter equips {setup} first (gear and bar)',
  tier_set_by: 'Set by {leader}: {tier}',
  tier_leader_picks: 'Tier: set by your party leader',
  tier_kept_party: 'Your pick: for the whole party, kept for this ground',
  tier_kept: 'Kept for this ground',
  bringing: 'Bringing {name}…',
  joined: '{name} joined your party',
  telling: 'Telling your party…',
  party_warned: 'Party warned. Press Enter anyway to go.',
  enter_anyway_hint: 'Press Enter anyway to go',
  gathering: 'Gathering the party for {ground}…',
  party_on_way: 'Party heading to {ground}',
  setting_off: 'Setting off for {ground}…',
  on_way: 'Heading to {ground}',
});
