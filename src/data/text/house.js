// ════════════════════════════════════════════════════════════════════════
// src/data/text/house.js — THE HOUSE WINDOW'S WORDS (src/shell/windows/house.js).
//
// One row per sentence, read by t('house.<key>'). A room's line is one row per
// shape (built or not, finished or not, what the next rung waits on); {now} is
// the room's rung ("Kitchen, 2 of 5") and {does} what that rung does, a list of
// the perk_* phrases joined by commas.
// ════════════════════════════════════════════════════════════════════════

export const HOUSE_TEXT = Object.freeze({
  /* What a room rung does (src/data/perks.js), each a phrase in a comma list. */
  perk_cook_speed: 'cooking {pct}% faster',
  perk_no_burn: '{pct}% less burnt food',
  perk_smith_speed: 'smithing {pct}% faster',
  perk_craft_speed: 'crafting {pct}% faster',
  perk_craft_save: '{pct}% chance to save the materials',
  perk_flame_speed: 'fueling the Great Hearth {pct}% faster',
  perk_rune_speed: 'rune binding {pct}% faster',
  perk_buff_duration: 'food and drink effects last {pct}% longer',
  perk_farm_plots: { one: '{count} more farm bed on the land your heroes share', other: '{count} more farm beds on the land your heroes share' },
  perk_trophy_mounts: 'a trophy wall with room for {count} bestiary trophies',

  /* A step's cost, line by line, against the bag and the Storage. */
  held_none: 'none in your bag',
  held_none_anywhere: 'none in your bag or Storage',
  held_bag: '{count} in your bag',
  held_storage: '{count} in Storage',
  held_both: '{bag} in your bag + {storage} in Storage',
  cost_gold_short: '{price} (you have {purse})',
  cost_item: '{item} {qty}',
  cost_item_held: '{item} {qty} ({held})',
  cost_where: '{where}.',

  /* The window's frame. */
  cost_aria: 'Cost',
  deed_head: 'The deed',
  deed_aria: 'The property',
  rooms_head: 'Rooms',
  chests_head: 'Storage chests',
  confirm_aria: 'Confirm the purchase',
  cancel: 'Cancel',
  tier_n: 'tier {n}',
  your_house: 'Your house',
  loading: 'Reading your house from the server…',
  head_note: 'One house for all your characters. Gold comes from your shared purse, and materials from this hero\'s bag first, then Storage.',
  head_note_named: 'One house for all your characters. Gold comes from your shared purse, and materials from {name}\'s bag first, then Storage.',

  /* The deed. */
  deed_yours: 'Yours',
  deed_yours_home: 'Yours, your home now',
  deed_opens: 'Opens {rooms}.',
  deed_opens_room: 'the {room}',
  deed_next_home: 'The next home.',
  deed_after: 'After the {tier}.',
  buy: 'Buy',
  upgrade: 'Upgrade',
  build: 'Build',

  /* A room. */
  rung_named: '{rung}, {level} of {rungs}',
  rung_first: 'Rung {level}',
  rung_next: 'rung {rung}',
  room_not_built: 'Not built yet',
  room_opens_with: 'Opens with the {tier}.',
  room_nothing: 'Nothing to build here yet.',
  room_nothing_built: '{now}. Nothing to build here yet.',
  room_finished: '{now}. Finished.',
  room_finished_does: '{now}: {does}. Finished.',
  room_next_after: '{now}. Next: {next}, after the {tier}.',
  room_next_after_does: '{now}: {does}. Next: {next}, after the {tier}.',
  room_next: '{now}. Next: {next}, {nextDoes}.',
  room_next_does: '{now}: {does}. Next: {next}, {nextDoes}.',

  /* The Storage chests. */
  chests_used: '{used} of {cap} stacks used',
  chest_stacks: '+{stacks} stacks.',
  chest_built: 'Built.',
  chest_next: 'Next to build.',
  chest_needs: 'Needs the {tier}.',
  chest_after: 'After the {name}.',
  chest_after_first: 'After the one before.',

  /* The confirmation, and what a press says. */
  confirm_build: 'Build the {name}?',
  confirm_buy: 'Buy the {name}?',
  mat_qty: '{qty} {item}',
  confirm_cost: 'Costs {price} from your shared purse.',
  confirm_cost_mats: 'Costs {price} from your shared purse, and {mats} from this hero\'s bag first, then Storage.',
  confirm_cost_mats_named: 'Costs {price} from your shared purse, and {mats} from {name}\'s bag first, then Storage.',
  pay: 'Pay {price}',
  step_room: '{room}: {rung}',
  building: 'Building…',
  built: 'The {name} is built.',
  buying: 'Buying…',
  bought: 'The {name} is yours.',
});
