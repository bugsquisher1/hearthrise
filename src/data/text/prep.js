// ════════════════════════════════════════════════════════════════════════
// src/data/text/prep.js — THE HUNT PREP WINDOW'S WORDS (src/shell/windows/hunt-prep.js and its
// hunt-prep/ modules: the setups column, the builder and its footer).
//
// One row per sentence or label, read by t('prep.<key>'). The control words are the
// game's standard ones (Save, Save and use, Close, Clear, Sort, Use, Use equipped, New).
// ════════════════════════════════════════════════════════════════════════

export const PREP_TEXT = Object.freeze({
  /* Before `hunt_presets` has arrived: the none line. */
  setups_reading: 'Reading your saved setups…',
  /* Before `setup_slots` has arrived: no slot is free until the server says how many, and Save is off. */
  slots_reading: 'Reading your setup slots…',

  /* THE SETUPS COLUMN. */
  setups: 'Setups',
  setups_none: 'No saved setups yet.',
  in_use: 'In use',
  gear_count: { one: '{count} piece of gear', other: '{count} pieces of gear' },
  not_saved: 'not saved',
  new: 'New',
  setup_n: 'Setup {n}',
  name_this: 'Name this setup',
  setup_name: 'Setup name',
  rename_label: 'New name for this setup',
  save: 'Save',
  use: 'Use',
  use_equipped: 'Use equipped',
  use_equipped_hint: 'Copies what you have on into {name}',
  use_equipped_ask: 'Replace {name} with what you have on?',
  keep: 'Keep',
  delete: 'Delete',
  delete_ask: 'Delete it?',
  count_line: '{n} of {max} setups',
  town_only: 'Setups change in town. This hunt keeps the bar it set off with.',
  need_more: 'You need {gold} more.',

  /* FIGHTS AS: read only, the worn weapon decides it. A dim role says how to get it. */
  fights_as: 'Fights as',
  fights_weapon: 'Your weapon decides this. You have {weapon} on.',
  fights_weapon_shield: 'Your weapon decides this. You have {weapon} and {shield} on.',
  fights_none: 'Your weapon decides this. You have no weapon on, so you fight with your bare hands.',
  fights_tank: 'Wear a sword and a shield to fight as Melee (shield).',
  fights_melee_dps: 'Wear a sword, two axes or a club with no shield to fight as Melee.',
  fights_ranger: 'Wear a bow or a crossbow to fight as a Ranger.',
  fights_mage: 'Wear a wand to fight as a Mage.',
  fights_healer: 'Wear a staff to fight as a Healer.',

  /* STANCE, TARGET, DISTANCE AND GOLD: the setup's own fight options. */
  stance: 'Stance',
  stance_balanced: 'Deals and takes normal damage.',
  stance_more: 'Deals {dealt}% more damage and takes {taken}% more.',
  stance_less: 'Deals {dealt}% less damage and takes {taken}% less.',
  target: 'Target',
  target_line: 'Who it hits first.',
  distance: 'Distance',
  chase: 'Chase',
  closer: 'Closer',
  farther: 'Farther',
  chase_on: 'Chase on. Runs up to its target.',
  chase_off: { one: 'Chase off. Stays {count} tile away and backs off.', other: 'Chase off. Stays {count} tiles away and backs off.' },
  gold: 'Gold to keep',
  keep_at_least: 'Keep at least',
  gold_word: 'gold',
  gold_line: 'The hunt sells loot, then stops, rather than spend below this.',

  /* THE ACTION BAR GRID. */
  bar: 'Action bar',
  bar_count: '{n} of {max} slots',
  bar_hint: 'Drag a slot to move it. Drop it on another to swap them. Press + to fill one. Slot 1 is tried first.',
  slot_empty: 'Slot {n}. Empty. Press to choose what goes here.',
  slot_filled: 'Slot {n}. {name}. Press to change it, drag to move it.',
  slot_off: 'Switched off.',
  slot_always: 'Fires whenever it is ready.',
  sort: 'Sort',
  sorted: 'Sorted. Moves first, then food and drink, then ammo. In each, a slot with a rule goes before a plain one.',
  clear: 'Clear',
  cleared: 'Cleared. Save keeps it, and your hero fights with its weapon\'s own moves until you fill the bar again.',

  /* THE FOOTER. */
  close: 'Close',
  save_and_use: 'Save and use',
  unsaved: 'Not saved yet. Save keeps it, Close throws it away.',
  changed: 'This setup changed on the bar. Load it again before you save.',
  load_again: 'Load again',
  reading_setup: 'Reading this setup…',
  ready_head: 'Ready to hunt?',
  ready_label: 'Press to see every hero\'s checklist',

  /* THE ANSWERS. */
  saving: 'Saving…',
  saved: 'Saved {name}.',
  saved_on: 'Saved {name} and put it on.',
  putting_on: 'Putting the setup on…',
  put_on: 'Setup on.',
  replaced: 'Replaced {name} with the bar and gear you have on.',
  deleting: 'Deleting…',
  deleted: 'Deleted {name}.',
  renaming: 'Renaming…',
  renamed: 'Renamed to {name}.',
  buying: 'Buying…',
  bought: 'Bought. You have {n} setup slots now.',

  /* CARRY IN, while this hero hunts (src/shell/carry-in.js). */
  carry_head: 'Carry into this hunt',
  carry_note: 'This hunt uses only the supplies it carries, then buys from the store. What you got after you set out waits in your backpack until you carry it in.',
  carry_none: 'Nothing in your backpack can be carried into a hunt.',
  carry_line: '{have} in your backpack · {inHunt} in this hunt',
  carry_press: 'Carry {n}',

  /* BEFORE YOU GO, THE BLESSINGS (src/shell/hunt-go.js blessingWords). Every number is the server's Blessings section:
     {on} held of {of}, {pct} the cut they give now, {price} the next one's price, {level} the Level they stop being free at.
     `_free` while the next one costs nothing, `_cost` once it has a price, the bare row if the server hasn't said which. */
  blessings_none: 'You have no Blessings on. They cut the XP you lose when you die. Get them in the Shop\'s Services tab.',
  blessings_none_free: 'You have no Blessings on. They cut the XP you lose when you die, and they\'re free until Level {level}. Get them in the Shop\'s Services tab.',
  blessings_none_cost: 'You have no Blessings on. They cut the XP you lose when you die. The first one costs {price} in the Shop\'s Services tab.',
  blessings_some: 'You have {on} of {of} Blessings on. You lose {pct}% less XP when you die. Get the rest in the Shop\'s Services tab.',
  blessings_some_free: 'You have {on} of {of} Blessings on. You lose {pct}% less XP when you die. The rest are free until Level {level} in the Shop\'s Services tab.',
  blessings_some_cost: 'You have {on} of {of} Blessings on. You lose {pct}% less XP when you die. The next one costs {price} in the Shop\'s Services tab.',
  blessings_all: 'You have all {of} Blessings on. You lose {pct}% less XP when you die.',
});
