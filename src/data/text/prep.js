// ════════════════════════════════════════════════════════════════════════
// src/data/text/prep.js — THE HUNT PREP WINDOW'S WORDS (src/shell/windows/hunt-prep.js and its
// hunt-prep/ modules: the setups column, the builder and its footer).
//
// One row per label, read by t('prep.<key>'). LABELS, NOT SENTENCES (Tyler 2026-11-14): a hint, status or requirement is the
// short form players know from MMOs ("Requires a staff", "Need 50 gp more"). The controls (Use, Use equipped, New setup, Delete,
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
  setups_none_named: 'Not saved: {name}',
  in_use: 'In use',
  gear_count: { one: '{count} piece of gear', other: '{count} pieces of gear' },
  not_saved: 'not saved',
  setup_n: 'Setup {n}',
  name_this: 'Name this setup',
  setup_name: 'Setup name',
  rename_label: 'New name for this setup',
  save: 'Save',
  use_equipped_hint: 'Copy your worn gear into {name}',
  use_equipped_ask: 'Replace {name} with your worn gear?',
  count_line: '{n} of {max} setups',
  town_only: 'Changes in town only (a running hunt keeps its bar)',
  need_more: 'You need {gold} more.',

  /* FIGHTS AS: read only, the worn weapon decides it. A dim role says how to get it. */
  fights_as: 'Fights as',
  fights_weapon: 'Weapon: {weapon}',
  fights_weapon_shield: 'Weapon: {weapon} and {shield}',
  fights_none: 'Weapon: none (bare hands)',
  fights_tank: 'Requires a sword and a shield',
  fights_melee_dps: 'Requires a sword, two axes or a club, no shield',
  fights_ranger: 'Requires a bow or a crossbow',
  fights_mage: 'Requires a wand',
  fights_healer: 'Requires a staff',

  /* STANCE, TARGET, DISTANCE AND GOLD: the setup's own fight options. */
  stance: 'Stance',
  stance_balanced: 'Normal damage dealt and taken',
  stance_more: '+{dealt}% damage dealt, +{taken}% damage taken',
  stance_less: '-{dealt}% damage dealt, -{taken}% damage taken',
  target: 'Target',
  target_line: 'Who it hits first',
  distance: 'Distance',
  chase: 'Chase',
  closer: 'Closer',
  farther: 'Farther',
  chase_on: 'Chase on: runs up to its target',
  chase_off: { one: 'Chase off: stays {count} tile away', other: 'Chase off: stays {count} tiles away' },
  gold: 'Gold to keep',
  keep_at_least: 'Keep at least',
  gold_word: 'gold',
  gold_line: 'Never spends below this (sells loot, then stops)',

  /* THE ACTION BAR GRID. */
  bar: 'Action bar',
  bar_count: '{n} of {max} slots',
  bar_hint: 'Drag to move or swap, + to fill, slot 1 fires first',
  slot_empty: 'Slot {n}: empty',
  slot_filled: 'Slot {n}: {name}.',
  slot_off: 'Off',
  slot_always: 'Fires when ready',
  sorted: 'Sorted: moves, food and drink, then ammo',
  cleared: 'Cleared (weapon moves only until you fill it)',

  /* THE FOOTER. */
  save_and_use: 'Save and use',
  unsaved: 'Unsaved changes',
  changed: 'Changed on the bar, load again to save',
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
  replaced: 'Replaced {name} with your worn gear and bar',
  deleting: 'Deleting…',
  deleted: 'Deleted {name}',
  renaming: 'Renaming…',
  renamed: 'Renamed to {name}',
  buying: 'Buying…',
  bought: 'Setup slots: {n}',

  /* CARRY IN, while this hero hunts (src/shell/carry-in.js). */
  carry_head: 'Carry into this hunt',
  carry_note: 'Uses carried supplies, then the store. New items wait in your backpack',
  carry_none: 'Nothing to carry in',
  carry_line: '{have} in backpack, {inHunt} in hunt',
  carry_press: 'Carry {n}',

  /* BEFORE YOU GO, THE BLESSINGS (src/shell/hunt-go.js blessingWords). Every number is the server's Blessings section:
     {on} held of {of}, {pct} the cut they give now, {price} the next one's price, {level} the Level they stop being free at.
     `_free` while the next one costs nothing, `_cost` once it has a price, the bare row if the server hasn't said which. */
  blessings_none: 'Blessings: none (they cut death XP loss, in the Shop)',
  blessings_none_cost: 'Blessings: none (they cut death XP loss, first one {price} in the Shop)',
  blessings_some: 'Blessings: {on} of {of}, {pct}% less death XP loss (more in the Shop)',
  blessings_some_cost: 'Blessings: {on} of {of}, {pct}% less death XP loss (next one {price} in the Shop)',
  blessings_all: 'Blessings: {of} of {of}, {pct}% less death XP loss',
  /* How long the gold lasts (readiness.js): the gold, and the analyzer's supply spend an hour on the running hunt or, in town, the last one. */
  gold_only: 'Gold: {gold} gp',
  gold_spend_now: 'Gold: {gold} gp, about {hours} h at {spend} gp/h on this hunt',
  gold_spend_last: 'Gold: {gold} gp, about {hours} h at {spend} gp/h (last hunt)',
});
