// ════════════════════════════════════════════════════════════════════════
// src/data/text/hunts.js — THE HUNTS LIST'S WORDS: a ground's band, packs, tier,
// who may come, the advice and the warnings (src/shell/hunt-list.js).
//
// One row per line, read by t('hunts.<key>'). A label stays a short label ("Recommended: 4+ players", Tyler 2026-11-14);
// a line that explains is one or two short real sentences (the natural RPG voice, Tyler 2026-11-16). A harder tier says
// its plain line (src/data/hunt-tiers.js TIER_LINES) and its death line; tier_choice names it beside Enter.
// ════════════════════════════════════════════════════════════════════════

export const HUNTS_TEXT = Object.freeze({
  /* the Tally widget's folded title when every held task is done (src/shell/widgets/tally-hud.js) */
  tally_done: 'Done',
  /* Who lives here: one note under the line names each area caster's spells (src/shell/windows/hunt-detail.js), so no card grows a line. */
  casts: '{name} casts {spells}.',
  /* A hall built for a group: a warning, never a gate (Tyler 2026-11-08). {n} is the pocket's forParty, a digit (Tyler 2026-11-14). */
  party_size: 'Recommended: {n}+ players',

  /* How crowded a ground is. {size} is a count or pack_range. */
  pack_range: '{min}–{max}',
  packs: { one: '{count} pack of {size} (respawns every {secs}s)', other: '{count} packs of {size} (respawn every {secs}s)' },
  packs_boss: { one: '{count} pack of {size} plus a boss (respawns every {secs}s)', other: '{count} packs of {size} plus a boss (respawn every {secs}s)' },

  /* What a tier does. */
  tier_choice: '{tier}: {head}.',

  /* The band, and a ground above the hero. */
  band: 'Levels {lo}–{hi}',
  band_you: 'Levels {lo}–{hi} (you\'re level {level})',
  /* Three lines (Tyler 2026-11-14): "{n} Levels under" / "Higher risk, better loot" / "Death: −6% Level XP" */
  above_level: 'Higher risk, better loot',
  far_above_level: 'Much higher risk, better loot',
  range_under: { one: '{count} Level under', other: '{count} Levels under' },
  range_die: 'Death: −{loss}% Level XP',
  /* the same, with Blessings on: the share a death would really take, the server's held cut (hr_blessing_view permille) */
  range_die_blessed: 'Death: −{loss}% Level XP (with Blessings)',
  /* The away card: the hunt's best find, gear or a Rare (src/shell/away-recap.js). */
  away_best: 'Best find: {item}',
  seat_level: '{name} (level {level})',
  seats_under: { one: '{who} is under level {level} and could die here', other: '{who} are under level {level} and could die here' },
  share_you: 'You get {pct}% of the Level XP (you\'re far under level {top})',
  share_seat: '{name} gets {pct}% of the Level XP (far under level {top})',

  /* The advice: the ground at the Level and why, then the easier pick on its own line. */
  level_one: 'level {level}',
  levels_range: 'levels {lo}–{hi}',
  no_ground: 'No good hunt for {levels} yet',
  nearest_below: 'Closest easier hunt: {ground} (levels {lo}–{hi})',
  /* A ground whose band holds the Level but is built tough (Tyler 2026-11-11: "no good hunt" over a row reading "In your range" was a lie). */
  right_but_tough: '{ground} is right for {levels}, but its monsters are tough.',
  right_easier: '{ground} is right for {levels}.',
  /* the same, when the server's best alone there lost gold (hunt_bests balanceH < 0) */
  right_but_lost: '{ground} is right for {levels}, but your best solo run there lost {gold} an hour.',
  easier: 'Easier: {easier} (levels {lo}–{hi})',
  tag_right_party: 'Recommended for your party',
  tag_right_level: 'Recommended',
  tag_next_step: 'Next step up',

  /* This hero's bests. */
  best_rate: '{xp} Level XP and {gold} an hour',
  best_alone: 'Solo record: {rate}',
  best_party: 'Party record: {rate}',
  best_none: 'No record yet. Hunt {min} minutes to set one.',
  best_line: 'Record: {xp} Level XP/h',
  best_line_none: 'No record yet',

  /* Where the hero stands, and who may come. */
  fit_above: 'Above your level',
  fit_far: 'Far above your level',
  fit_below: 'Below your level',
  fit_in: 'Your level',
  heroes_up_to: 'Players: 1–{max}',
  heroes_one: 'Solo only',

  /* THE WINDOW (src/shell/windows/hunts.js, hunt-detail.js): heads, the lead line, presses and answers. {ground} a hunt's name. */
  win_list: 'Hunts',
  win_page: 'Hunt details',
  head_packs: 'Packs',
  head_tiers: 'Tiers',
  head_lives: 'Who lives here',
  head_drops: 'Drops',
  head_mats: 'Materials',
  head_rares: 'Rare drops',
  head_best: 'Your records',
  head_go_as: 'Enter as',
  head_before: 'Before you go',
  head_party: 'Party',
  rares_per: 'chance per kill of that monster',
  per_kill_alone: 'chance per kill (solo)',
  per_kill_party: 'chance per kill (party of {n}, one hero gets each drop)',
  level_band: 'Levels {lo}–{hi}',
  /* the lead line over the list */
  lead_hunting: 'You\'re hunting in {ground}. Leave it to pick another hunt.',
  lead_follower: 'Your party leader picks the hunt. You go in with your own setup.',
  lead_party: 'Choose a hunt for your party',
  lead_solo: 'Choose a hunt',
  off_follower: 'The hunt is picked by {leader}. Leave the party to pick your own.',
  your_leader: 'your leader',
  bag_empty: 'Hunt bag: empty',
  bag_holds: 'Hunt bag: {items}',
  party_lead: 'Party leader ({n} heroes)',
  party_finder: 'Party finder',
  party_find: 'Find a party',
  party_others: 'Your other heroes can come too. Play one from Characters and it shows up here.',
  party_bring: 'Bring {name}',
  go_on_now: 'equipped',
  go_puts_on: 'Equips {setup} when you enter',
  tier_set_by: '{tier} (set by {leader})',
  tier_leader_picks: 'Your party leader sets the tier',
  tier_kept_party: 'Applies to the whole party. Remembered for this hunt.',
  tier_kept: 'Remembered for this hunt',
  bringing: 'Bringing {name}…',
  joined: '{name} joined your party',
  telling: 'Telling your party…',
  party_warned: 'Your party has been warned. Press Enter anyway to go.',
  enter_anyway_hint: 'Press Enter anyway to go',
  gathering: 'Gathering the party for {ground}…',
  party_on_way: 'Your party is heading to {ground}',
  setting_off: 'Setting off for {ground}…',
  on_way: 'Heading to {ground}',

  /* SCALED HUNT (audit F26; src/shell/windows/scale-pane.js): an outgrown early ground fought at the leader's Level, hours bought with gold.
     Labels only (Tyler 2026-11-14). The dials are Tyler's ("+x% exp +x% more damage from monsters +x% more gold from monsters", and HP), as multiples: +4,627% read worse than x47. */
  scale_head: 'Scaled hunt',
  scale_tag: 'Scalable',
  scale_tag_on: 'Scaled to level {level}',
  scale_locked: 'Unlocks at level {level}',
  scale_level: 'Scaled to level {level}',
  scale_price: '{price} per hour',
  scale_banked: 'Hours banked: {time}',
  scale_banked_none: 'Hours banked: none',
  scale_xp: 'Level XP ×{times}',
  scale_gold: 'Gold ×{times}',
  scale_dmg: 'Monster damage ×{times}',
  scale_hp: 'Monster HP ×{times}',
  scale_drops: 'Same drops',
  scale_active: 'Active at level {level}',
  scale_party: 'Uses the party leader\'s hours',
  scale_bank_full: 'You can bank up to {max} hours',
  scale_day_full: 'Daily limit reached ({max} hours)',
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
