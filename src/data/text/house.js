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
  perk_farm_plots: { one: '{count} more shared farm bed', other: '{count} more shared farm beds' },
  perk_trophy_mounts: 'a trophy wall with room for {count} bestiary trophies',

  /* A step's cost, line by line, against the bag and the Storage. */
  held_none: 'none in bag',
  held_none_anywhere: 'none in bag or Storage',
  held_bag: '{count} in bag',
  held_storage: '{count} in Storage',
  held_both: '{bag} in bag + {storage} in Storage',
  cost_gold_short: '{price} (have {purse})',
  cost_item: '{item} {qty}',
  cost_item_held: '{item} {qty} ({held})',

  /* The window's frame. */
  cost_aria: 'Cost',
  deed_head: 'The deed',
  deed_aria: 'The property',
  rooms_head: 'Rooms',
  chests_head: 'Storage chests',
  confirm_aria: 'Confirm the purchase',
  tier_n: 'tier {n}',
  your_house: 'House',
  loading: 'Loading the house…',
  head_note: 'Shared house · Gold: shared purse · Materials: bag, then Storage',
  head_note_named: 'Shared house · Gold: shared purse · Materials: {name}\'s bag, then Storage',

  /* The deed. */
  deed_yours: 'Owned',
  deed_yours_home: 'Owned, current home',
  deed_opens: 'Opens {rooms}',
  deed_opens_room: 'the {room}',
  deed_next_home: 'Next home',
  deed_after: 'After the {tier}',
  upgrade: 'Upgrade',
  build: 'Build',

  /* A room. */
  rung_named: '{rung}, {level} of {rungs}',
  rung_first: 'Rung {level}',
  rung_next: 'rung {rung}',
  room_not_built: 'Not built yet',
  room_opens_with: 'Opens with the {tier}',
  room_nothing: 'Nothing to build yet',
  room_nothing_built: '{now} · Nothing to build yet',
  room_finished: '{now} · Finished',
  room_finished_does: '{now}: {does} · Finished',
  room_next_after: '{now} · Next: {next} (after the {tier})',
  room_next_after_does: '{now}: {does} · Next: {next} (after the {tier})',
  room_next: '{now} · Next: {next}, {nextDoes}',
  room_next_does: '{now}: {does} · Next: {next}, {nextDoes}',

  /* The Storage chests. */
  chests_used: '{used} of {cap} stacks used',
  chest_stacks: '+{stacks} stacks',
  chest_built: 'Built',
  chest_next: 'Next to build',
  chest_needs: 'Requires the {tier}',
  chest_after: 'After the {name}',
  chest_after_first: 'After the previous chest',

  /* The confirmation, and what a press says. */
  confirm_build: 'Build the {name}?',
  confirm_buy: 'Buy the {name}?',
  mat_qty: '{qty} {item}',
  confirm_cost: 'Costs {price} from the shared purse',
  confirm_cost_mats: 'Costs {price} and {mats}',
  confirm_cost_mats_named: 'Costs {price} and {mats} from {name}\'s bag',
  pay: 'Pay {price}',
  step_room: '{room}: {rung}',
  building: 'Building…',
  built: '{name} built',
  buying: 'Buying…',
  bought: 'Bought the {name}',
});
