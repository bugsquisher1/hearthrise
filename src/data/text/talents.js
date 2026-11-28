// ════════════════════════════════════════════════════════════════════════
// src/data/text/talents.js — THE TALENTS TAB'S WORDS (src/shell/windows/character/talents.js, the Roads sample's card).
//
// One row per label, read by t('talents.<key>'). LABELS, NOT SENTENCES (Tyler 2026-11-14): genre-standard label and value
// ("Points: 11", "Next Fork: Mend, Crossroads I"), never an explanation and never "you". Every number is the server's (the `talents`
// section). The options' own names and tips are the Roads' data (src/data/talents.js), not words of this tab.
// ════════════════════════════════════════════════════════════════════════

export const TALENTS_TEXT = Object.freeze({
  tab: 'Talents',
  /* the door while the map and its stylesheet load (src/shell/windows/talents.js) */
  loading: 'Loading the map…',
  /* the points line: the server's points less its spent ones */
  points: 'Points: {count}',
  points_none: 'Points: 0',
  /* the next fork on the suggested road, named by its move ("Mend, Crossroads I") */
  fork: 'Next Fork: {move}{node}',
  fork_move: '{move}, ',
  /* how far the fork is: the points still to spend on the way, itself included */
  fork_next: 'Next point',
  fork_away: '{count} points away',
  suggested: '{name} (Suggested)',
  take: 'Take',
  spend_suggested: 'Spend as suggested',
  /* why Spend as suggested and Take are off (tests/say-why.mjs SW-2): no point left to spend */
  no_points: 'No points',
  /* the busy and done lines of a press */
  spending: 'Spending…',
  taking: 'Taking…',
  spent_one: '1 point spent',
  spent_many: '{count} points spent',
  taken: 'Taken',
  /* the tab's link to the map (src/shell/windows/talents/, the Talents window) */
  open_map: 'Open map',

  /* THE ROADS MAP (src/shell/windows/talents/*.js, lane/r-ui-roads): labels and values, never sentences */
  map: 'The Roads',
  havora: 'Havora',
  points_label: 'Points',
  vows_label: 'Vows',
  vows_of: '{held} of {open}',
  next_label: 'Next',
  show: 'Show',
  recenter: 'Recenter',
  tier_country: 'Country',
  tier_road: 'Road',
  tier_node: 'Node',
  close: 'Close',
  /* a country's name, and its owned count ("12 of 34") */
  country_hearth: 'The Hearth',
  country_shield: 'Shield',
  country_restoration: 'Restoration',
  country_sword: 'Sword',
  country_club: 'Club',
  country_dual_axe: 'Dual Axe',
  country_ranged: 'Ranged',
  country_destruction: 'Destruction',
  country_count: '{owned} of {total}',
  /* what a stone is ("Crossroads · Greater Mend") */
  kind_of: '{kind} · {of}',
  kind_start: 'Start',
  kind_rank: 'Rank stone',
  kind_crossroads: 'Crossroads',
  kind_waystone: 'Waystone',
  kind_open: 'Open road',
  kind_vow: 'Vow',
  kind_border: 'Border town',
  kind_hybrid: 'Hybrid crossroads',
  kind_crossing: 'Crossing',
  kind_final: 'Final form',
  kind_milepost: 'Milepost',
  rank_name: '{move} +1 rank',
  /* the map's key (the card with nothing picked): a stone's states, as roads.css draws them */
  key: 'Key',
  state_locked: 'Locked',
  state_open: 'Can buy',
  state_route: 'On route',
  state_plan: 'Planned',
  state_owned: 'Owned',
  owned: 'Owned',
  owned_n: 'Owned: {count} points',
  picked: '{name} (Picked)',
  take_more: 'Take +1',
  opens_at: 'Opens at Level {level}',
  /* a lent move's band at a town or the crossing (card.js): its opening Level once reached, its price, or none offered here */
  open_from: 'From Level {level}',
  price: '−{pct}% power',
  full_power: 'Full power',
  not_offered: 'Not offered',
  /* the route to a stone (18-roads-review-ux.md section 5) */
  route: 'Route',
  cost: 'Cost',
  have: 'You have',
  reach: 'Reach at',
  level: 'Level {level}',
  n_points: Object.freeze({ one: '{count} point', other: '{count} points' }),
  on_way: 'On the way',
  way_ranks: Object.freeze({ one: '{count} rank stone', other: '{count} rank stones' }),
  way_picks: Object.freeze({ one: '{count} choice', other: '{count} choices' }),
  way_ways: Object.freeze({ one: '{count} waystone', other: '{count} waystones' }),
  requires: 'Requires',
  need: 'Crossroads in {country}: {state}',
  away: Object.freeze({ one: '{count} point away', other: '{count} points away' }),
  vow_need: 'Level {level}',
  next_step: 'Next step: {name}',
  /* a spend problem the refusal table has no words for (a town's move not offered yet) */
  locked: 'Not offered yet',

  /* THE STANDING RULE (lane/r-ui-roads-2, 1069): the band's one toggle, and its answer */
  auto_on: 'Spend as suggested: On',
  auto_off: 'Spend as suggested: Off',
  /* THE PLAN (lane/r-ui-roads-2): a saved build for the hero's hunt, paid one point at a time */
  plan_route: 'Plan route',
  plan: 'Plan',
  planned: 'Planned',
  planned_pick: '{name} (Planned)',
  plan_label: 'Plan',
  plan_to_go: 'To go',
  plan_next: 'Next step',
  plan_none: 'None',
  plan_done: 'Done',
  plan_spend: 'Spend on plan',
  plan_clear: 'Clear plan',
  plan_waiting: 'Waiting for a Level',
  plan_no_ground: 'Requires a planned hunt',
  planning: 'Saving…',
  plan_saved: 'Plan saved',
  plan_cleared: 'Plan cleared',
  /* FIND TALENT AND THE FILTERS (lane/r-ui-roads-2, 18 section 3) */
  find: 'Find talent',
  find_none: 'No match',
  find_road: 'Road',
  filter_vow: 'Vows',
  filter_crossroads: 'Crossroads',
  filter_town: 'Towns',
});
