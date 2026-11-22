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
  /* "Bring your heroes" empty because this account's other heroes sit in a party this one is not in (audit 2026-11-15 F23):
     who, whose party, and the way out. {names} is a list ("Corwen, Ilsa and Maren"); {count} how many it names. Labels (Tyler 2026-11-14). */
  party_others_in: {
    one: 'In {leader}\'s party: {names} (switch to them, press Leave party)',
    other: 'In {leader}\'s party: {names} (switch to each, press Leave party)',
  },
  party_others_in_a: {
    one: 'In another party: {names} (switch to them, press Leave party)',
    other: 'In another party: {names} (switch to each, press Leave party)',
  },
  /* A ground where a hero alone spends more on food than the hunt pays (supplies.js healerWanted, measured): said under the ground's
     name to a party with no Healer. A warning, never a gate. {monster} is the ground's hardest hitter. The party_size shape. */
  wants_healer: 'Recommended: Healer ({monster} hits too hard for food)',

  /* How crowded a ground is. {size} is a count or pack_range. */
  pack_range: '{min} to {max}',
  packs: { one: '{count} pack of {size}, respawn {secs}s', other: '{count} packs of {size}, respawn {secs}s' },
  packs_boss: { one: '{count} pack of {size} + boss, respawn {secs}s', other: '{count} packs of {size} + boss, respawn {secs}s' },

  /* What a tier does. */
  tier_choice: '{tier}: {head}.',
  /* A tier where a party with no Healer was measured to die on this ground, under a Level (a pack's healerTiers, hunt-tiers.js HEALER_TIERS):
     one line of the tier note, said to a hero alone and to a party alike. A warning, never a gate. The wants_healer shape. */
  tier_healer: 'Recommended: Healer (parties without one die here)',

  /* The band, and a ground above the hero. */
  band: 'Levels {lo}–{hi}',
  band_you: 'Levels {lo}–{hi} (you: {level})',
  /* Three lines (Tyler 2026-11-14): "{n} Levels under" / "Higher risk, better loot" / "Death: −6% Level XP" */
  above_level: 'Higher risk, better loot',
  far_above_level: 'Much higher risk, better loot',
  range_under: { one: '{count} Level under', other: '{count} Levels under' },
  range_die: 'Death: −{loss}% Level XP',
  /* the same, with Blessings on: the share a death would really take, the server's held cut (hr_blessing_view permille) */
  range_die_blessed: 'Death: −{loss}% Level XP (with Blessings)',
  /* The away card: the hunt's best find, gear or a Rare (src/shell/away-recap.js). */
  away_best: 'Best find: {item}',
  seat_level: '{name}, Level {level}',
  seats_under: { one: 'Under Level {level} (death risk): {who}', other: 'Under Level {level} (death risk): {who}' },
  share_you: 'Level XP share: {pct}% (far under Level {top})',
  share_seat: '{name}\'s Level XP share: {pct}% (far under Level {top})',

  /* The advice: the ground at the Level and why, then the easier pick on its own line. */
  level_one: 'Level {level}',
  levels_range: 'Levels {lo}–{hi}',
  no_ground: 'No good hunt for {levels} yet',
  nearest_below: 'Nearest below: {ground} (Levels {lo}–{hi})',
  /* A ground whose band holds the Level but is built tough (Tyler 2026-11-11: "no good hunt" over a row reading "In your range" was a lie). */
  right_but_tough: '{ground}: right for {levels}, tough monsters',
  right_easier: '{ground}: right for {levels}',
  /* the same, when the server's best alone there lost gold (hunt_bests balanceH < 0) */
  right_but_lost: '{ground}: right for {levels}, but lost {gold}/h solo',
  easier: 'Easier: {easier} (Levels {lo}–{hi})',
  tag_right_level: 'Recommended',
  tag_next_step: 'Next step up',

  /* This hero's bests. */
  best_rate: '{xp} Level XP/h, balance {gold}/h',
  best_alone: 'Best alone: {rate}',
  best_party: 'Best in a party: {rate}',
  best_none: 'No record yet (hunt {min}+ min)',
  best_line: 'Best {xp} Level XP/h',
  best_line_none: 'No record yet',

  /* Where the hero stands, and who may come. */
  fit_above: 'Above level',
  fit_far: 'Far above level',
  fit_below: 'Below level',
  fit_in: 'In range',
  /* a ground whose hunt ends at a Level this hero stands at (hunt-grounds.js endsAtLevel: the Mill Cellar's 5): the server refuses it */
  fit_outgrown: 'Outgrown',
  heroes_up_to: 'Players: 1 to {max}',
  heroes_one: 'Players: 1',

  /* THE WINDOW (src/shell/windows/hunts.js, hunt-detail.js): heads, the lead line, presses and answers. {ground} a hunt's name. */
  win_list: 'Hunts',
  win_page: 'The picked hunt',
  head_packs: 'The packs',
  head_tiers: 'Tiers',
  head_lives: 'Enemies',
  head_drops: 'Drops',
  head_mats: 'Loot',
  /* the loot rows past the first few (hunt-detail.js LOOT_SHOWN): {count} more, the press that lists them */
  loot_more: { one: '+{count} more', other: '+{count} more' },
  head_rares: 'Rare drops',
  head_best: 'Best here',
  head_go_as: 'Go as',
  /* THE COMPANY'S PLAN ON A GROUND (src/shell/windows/company-pane.js, 1051-company-start.sql) */
  plan_here: 'Go here at the next Start',
  plan_set: 'Next Start goes here. Press to undo',
  plan_saved: 'The next Start goes to {ground}',
  plan_undone: 'The next Start goes where this hero hunted last',
  setup_saved: 'This Setup goes to {ground} from now on',
  head_before: 'Before entering',
  head_party: 'With a party',
  rares_per: 'chance per kill of its creature',
  per_kill_alone: 'chance per kill, hunting alone',
  per_kill_party: 'chance per kill in a party of {n} (one hero gets each drop)',
  level_band: 'Levels {lo}–{hi}',
  /* the lead line over the list */
  lead_hunting: 'Hunting in {ground}. Leave to switch hunts',
  lead_follower: 'Party leader picks the hunt',
  lead_party: 'Pick a hunt, then Enter with party',
  /* @sentence: the first line a new player reads in the window; it teaches the loop */
  lead_solo: 'Pick a hunt, then Enter',
  off_follower: 'Party: {leader} picks the hunt',
  /* A ground whose hunt ends at a Level (hunt-grounds.js endsAtLevel), reached by this hero or a seat (hunt-list.js seatsOutgrown): Enter is off,
     the door would refuse it. {level} the exit Level, {who} "Wren, Level 5" per seat. */
  off_outgrown: 'Ground outgrown at Level {level}, pick a harder one',
  off_outgrown_party: 'Ground outgrown at Level {level}: {who}',
  /* ...and the server's own seat refusal of it (hr_hunt_party_start not_ready, a seat's `outgrown`), after the hero's name: "Wren has outgrown Mill Cellar" */
  seat_outgrown: 'has outgrown {ground}',
  seat_outgrown_that: 'that ground',
  your_leader: 'the leader',
  bag_empty: 'Hunt bag: empty',
  bag_holds: 'Hunt bag: {items}',
  party_lead: 'Party leader, {n} heroes',
  party_finder: 'Open the party finder',
  party_find: 'Find a party',
  /* @sentence: how a second hero joins; the Characters screen is a step a label can't name */
  party_others: 'Play other heroes from Characters to bring them',
  party_bring: 'Bring {name}',
  go_on_now: 'on now',
  go_puts_on: 'Enter equips {setup} first',
  /* THE DANGER SCALE ON A GROUND'S PAGE (src/shell/windows/company-pane.js, 1056-danger-scale.sql). {depth} of {of}: the depth bar's notch. */
  head_stance: 'How hard to push',
  stance_careful: 'Careful',
  stance_steady: 'Steady',
  stance_bold: 'Bold',
  stance_line_careful: 'Careful: backs off early. Slower, and rarely loses anyone.',
  stance_line_steady: 'Steady: goes as deep as the party holds well. A death now and then.',
  stance_line_bold: 'Bold: pushes close to the edge for better pay. Expect deaths.',
  stance_none: 'Pick how hard to push. The party goes deeper by itself while the fights stay clean, and backs off when they get close.',
  stance_saved: 'Next hunt plays {stance}',
  stance_next: 'Plays from your next hunt',
  stance_leader: 'The party leader picks how hard to push',
  depth_held: 'Last time here: depth {depth} of {of}',
  depth_new: 'First time here: the party starts shallow and works its way deeper',
  tier_set_by: 'Set by {leader}: {tier}',
  tier_leader_picks: 'Tier: set by the party leader',
  tier_kept_party: 'Tier applies to the whole party, saved for this ground',
  tier_kept: 'Kept for this ground',
  bringing: 'Bringing {name}…',
  joined: '{name} joined the party',
  telling: 'Telling the party…',
  party_warned: 'Party warned. Press Enter anyway to go',
  enter_anyway_hint: 'Press Enter anyway to go',
  gathering: 'Gathering the party for {ground}…',
  party_on_way: 'Party heading to {ground}',
  setting_off: 'Setting off for {ground}…',
  on_way: 'Heading to {ground}',

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
  scale_drops: 'Drops ×{times}',
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
