// ════════════════════════════════════════════════════════════════════════
// src/data/text/prep.js — THE HUNT PREP WINDOW'S WORDS (src/shell/windows/hunt-prep.js and its
// hunt-prep/ modules: the setups column, the builder and its footer).
//
// One row per line, read by t('prep.<key>'). A label stays short ("Requires a staff"); a line that explains is one or two short
// real sentences (the natural RPG voice, Tyler 2026-11-16). The controls (Use, Use equipped, New setup, Delete,
// Cancel, Close, Sort, Clear) read the glossary, src/data/text/controls.js; Save and Save and use are the builder's own.
// ════════════════════════════════════════════════════════════════════════

export const PREP_TEXT = Object.freeze({
  /* Before `hunt_presets` has arrived: the none line. */
  setups_reading: 'Loading setups…',
  /* Before `setup_slots` has arrived: no slot is free until the server says how many, and Save is off. */
  slots_reading: 'Loading setup slots…',

  /* THE SETUPS COLUMN. */
  setups: 'Setups',
  setups_none: 'No saved setups',
  setups_none_named: '{name} isn\'t saved yet',
  in_use: 'Equipped',
  gear_count: { one: '{count} piece of gear', other: '{count} pieces of gear' },
  not_saved: 'not saved',
  setup_n: 'Setup {n}',
  name_this: 'Name this setup',
  setup_name: 'Setup name',
  rename_label: 'New name for this setup',
  save: 'Save',
  use_equipped_hint: 'Copy what you\'re wearing into {name}',
  use_equipped_ask: 'Replace {name} with what you\'re wearing?',
  count_line: '{n} of {max} setups',
  town_only: 'You can only change setups in town',
  need_more: 'You need {gold} more',

  /* FIGHTS AS: read only, the worn weapon decides it. A dim role says how to get it. */
  fights_as: 'Fights as',
  fights_weapon: 'Weapon: {weapon}',
  fights_weapon_shield: 'Weapon: {weapon} and {shield}',
  fights_none: 'Weapon: none (bare hands)',
  fights_tank: 'Requires a sword and a shield',
  fights_melee_dps: 'Requires a sword, hatchets, a hammer or a club (no shield)',
  fights_ranger: 'Requires a bow or a crossbow',
  fights_mage: 'Requires a wand',
  fights_healer: 'Requires a staff',

  /* STANCE, TARGET, DISTANCE AND GOLD: the setup's own fight options. */
  stance: 'Stance',
  stance_balanced: 'Normal damage dealt and taken',
  stance_more: 'Deal {dealt}% more damage and take {taken}% more',
  stance_less: 'Deal {dealt}% less damage and take {taken}% less',
  target: 'Target',
  target_line: 'Target priority',
  distance: 'Distance',
  chase: 'Chase',
  closer: 'Closer',
  farther: 'Farther',
  chase_on: 'Chase on. Your hero runs up to its target.',
  chase_off: { one: 'Chase off. Your hero stays {count} tile away.', other: 'Chase off. Your hero stays {count} tiles away.' },
  /* THE GOLD RESERVE (core/action-rules.js floorOf): a store buy never takes the purse below it; one that would sells this hunt's
     loot, cheapest first, just enough to pay, and only when that is not enough does the hunt end gold_out. */
  gold: 'Gold reserve',
  keep_at_least: 'Gold reserve (gp)',
  gold_word: 'gp',
  gold_line: 'Your hero won\'t spend gold below this. It sells loot to pay for supplies first, then ends the hunt.',

  /* THE ACTION BAR GRID. */
  bar: 'Action bar',
  bar_count: '{n} of {max} slots',
  bar_hint: 'Drag slots to reorder them. Press + to fill one. Slot 1 goes first.',
  slot_empty: 'Slot {n}: empty',
  slot_filled: 'Slot {n}: {name}',
  slot_off: 'Off',
  slot_always: 'Fires when ready',
  sorted: 'Sorted: moves first, then food and drink, then ammo',
  cleared: 'Cleared. Your hero only uses weapon moves until you fill it.',

  /* THE FOOTER. */
  save_and_use: 'Save and use',
  unsaved: 'Unsaved changes',
  changed: 'Your bar changed since you loaded this. Load it again to save.',
  load_again: 'Load again',
  reading_setup: 'Loading setup…',
  ready_head: 'Ready to hunt?',
  ready_label: 'Show every hero\'s checklist',

  /* THE ANSWERS. */
  saving: 'Saving…',
  saved: 'Saved {name}',
  saved_on: 'Saved and equipped {name}',
  putting_on: 'Equipping setup…',
  put_on: 'Setup equipped',
  replaced: 'Replaced {name} with your current gear and bar',
  deleting: 'Deleting…',
  deleted: 'Deleted {name}',
  renaming: 'Renaming…',
  renamed: 'Renamed to {name}',
  buying: 'Buying…',
  bought: 'You now have {n} setup slots',

  /* BEFORE YOU GO, STORE FOOD TOO WEAK FOR THE GROUND (src/shell/hunt-go.js weakFoodLine): {food} the bar's best store food, {want} the
     store food this ground's bag guide names. */
  food_weak: '{food} heals too little here. Pick {want} for that slot.',

  /* CARRY IN, while this hero hunts (src/shell/carry-in.js). */
  carry_head: 'Carry into this hunt',
  carry_note: 'Your hero uses carried supplies first, then buys from the store.',
  carry_none: 'Nothing to carry in',
  carry_line: '{have} in your backpack, {inHunt} in the hunt',
  carry_press: 'Carry {n}',

  /* BEFORE YOU GO, THE BLESSINGS (src/shell/hunt-go.js blessingWords). Every number is the server's Blessings section:
     {on} held of {of}, {pct} the cut they give now, {price} the next one's price, {level} the Level they stop being free at.
     `_free` while the next one costs nothing, `_cost` once it has a price, the bare row if the server hasn't said which. */
  blessings_none: 'No Blessings. Buy them in the Shop to lose less XP when you die.',
  blessings_none_cost: 'No Blessings. The first one costs {price} in the Shop.',
  blessings_some: 'Blessings: {on} of {of} (lose {pct}% less XP when you die)',
  blessings_some_cost: 'Blessings: {on} of {of} (lose {pct}% less XP when you die). The next costs {price}.',
  blessings_all: 'Blessings: {of} of {of} (lose {pct}% less XP when you die)',
  /* How long the gold lasts (readiness.js): the gold, and the analyzer's supply spend an hour on the running hunt or, in town, the last one. */
  /* BEFORE YOU GO's own lines (src/shell/hunt-go.js). {left} "2 h 5 min"; {gold} "500 gp"; {setup} a setup's name. */
  go_bare_food: 'No food. HP only comes back between fights.',
  go_bare_drink: 'No drinks. Mana only comes back between fights.',
  go_no_cast: 'Nothing to cast',
  go_no_tamsin: 'Your Tamsin tasks don\'t count here ({counts})',
  go_no_food_drink: 'No food or drink',
  go_other_setup: 'Supplies come from {setup}’s bar',
  go_no_weapon: 'No weapon. Equip one from your bag.',
  go_no_stamina: 'No stamina. Rest in town first.',
  go_stamina_low: 'Stamina: {left} left',
  go_stamina: 'Stamina: {left}',
  go_gold: 'Gold: {gold}',
  go_no_gold: 'No gold. The hunt ends when your supplies run out.',
  /* EVERY HERO'S CHECKLIST (src/shell/readiness.js). {n} the slot, 1 first. */
  ready_character: 'Hero {n}',
  ready_loading: 'Loading this hero…',
  ready_short_loading: 'not loaded yet',
  ready_weapon: 'Weapon: {item}',
  ready_no_weapon: 'Weapon: none',
  ready_short_weapon: 'no weapon',
  ready_bar_later: 'Action bar: set when you pick a hunt',
  ready_stamina: 'Stamina: {left} left',
  ready_no_stamina: 'Stamina: none',
  ready_short_stamina: 'no stamina',
  gold_only: 'Gold: {gold} gp',
  gold_spend_now: 'Gold: {gold} gp (about {hours} h at {spend} gp/h on this hunt)',
  gold_spend_last: 'Gold: {gold} gp (about {hours} h at {spend} gp/h, based on your last hunt)',
});
