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
  /* the setup in use after a mid-hunt swap: its bar is on, another setup's gear is still worn */
  in_use_bar: 'In use (bar only)',
  gear_count: { one: '{count} piece of gear', other: '{count} pieces of gear' },
  not_saved: 'not saved',
  setup_n: 'Setup {n}',
  name_this: 'Name this setup',
  setup_name: 'Setup name',
  rename_label: 'New name for this setup',
  save: 'Save',
  use_equipped_hint: 'Copy worn gear into {name}',
  use_equipped_ask: 'Replace {name} with worn gear?',
  count_line: '{n} of {max} setups',
  /* While hunting (Tyler 2026-11-17, "Bar only, keep gear"): Use swaps the bar; New and Use equipped take the worn gear, in town. */
  town_only: 'Mid-hunt: bar swap only, gear changes in town',
  /* A row's Use, off in a hunt: the setup fights with another weapon type (its ability list, the server's discipline). */
  needs_shield: 'Town only: needs a sword and shield',
  needs_sword: 'Town only: needs a sword, no shield',
  needs_dual_axe: 'Town only: needs hatchets',
  needs_club: 'Town only: needs a club or hammer',
  needs_ranged: 'Town only: needs a bow or crossbow',
  needs_destruction: 'Town only: needs a wand',
  needs_restoration: 'Town only: needs a staff',
  needs_weapon: 'Town only: needs another weapon',
  need_more: 'Need {gold} more',

  /* FIGHTS AS: read only, the worn weapon decides it. A dim role says how to get it. */
  fights_as: 'Fights as',
  fights_weapon: 'Weapon: {weapon}',
  fights_weapon_shield: 'Weapon: {weapon} and {shield}',
  fights_none: 'Weapon: none',
  fights_tank: 'Requires a sword and a shield',
  fights_melee_dps: 'Requires a sword, hatchets, a hammer or a club (no shield)',
  fights_ranger: 'Requires a bow or a crossbow',
  fights_mage: 'Requires a wand',
  fights_healer: 'Requires a staff',

  /* STANCE, TARGET, DISTANCE AND GOLD: the setup's own fight options. */
  stance: 'Stance',
  stance_balanced: 'Normal damage dealt and taken',
  stance_more: '+{dealt}% damage dealt, +{taken}% damage taken',
  stance_less: '-{dealt}% damage dealt, -{taken}% damage taken',
  target: 'Target',
  target_line: 'Target priority',
  distance: 'Distance',
  chase: 'Chase',
  closer: 'Closer',
  farther: 'Farther',
  chase_on: 'Chase on: runs up to its target',
  chase_off: { one: 'Chase off: stays {count} tile away', other: 'Chase off: stays {count} tiles away' },
  /* THE GOLD RESERVE (core/action-rules.js floorOf): a store buy never takes the purse below it; one that would sells this hunt's
     loot, cheapest first, just enough to pay, and only when that is not enough does the hunt end gold_out. */
  gold: 'Gold reserve',
  keep_at_least: 'Gold reserve, gp',
  gold_word: 'gp',
  gold_line: 'Below this, stops buying supplies and ends the hunt',

  /* THE ACTION BAR GRID. */
  bar: 'Action bar',
  bar_count: '{n} of {max} slots',
  bar_hint: 'Drag to move or swap. + to fill. Slot 1 fires first',
  slot_empty: 'Slot {n}: empty',
  slot_filled: 'Slot {n}: {name}.',
  slot_off: 'Off',
  slot_always: 'Fires when ready',
  sorted: 'Sorted: moves, food and drink, then ammo',
  cleared: 'Cleared (weapon moves kept)',
  /* a label, not a sentence (Tyler 2026-11-14: everything outside lore is a genre-standard label) */
  basic_loaded: 'Basic setup: unsaved',
  /* THE BASIC SETUP PRESS names what it loads under its name: the weapon type the server says the setup fights as (its ability
     discipline, src/data/basic-setups.js), bare hands on the club's list (builder.js basicPress). Tyler 2026-11-17: he did not find it. */
  basic_for: 'Basic setup: {weapon}',
  basic_weapon_shield: 'Sword and shield',
  basic_weapon_sword: 'Sword',
  basic_weapon_dual_axe: 'Axes',
  basic_weapon_club: 'Club or hammer',
  basic_weapon_bare: 'Bare hands',
  basic_weapon_ranged: 'Bow or crossbow',
  basic_weapon_destruction: 'Wand',
  basic_weapon_restoration: 'Staff',
  basic_none: 'Weapon type unknown',

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
  swapping: 'Swapping bar…',
  bar_swapped: 'Bar swapped, gear kept',
  put_on: 'Setup equipped',
  replaced: 'Replaced {name} with worn gear and bar',
  deleting: 'Deleting…',
  deleted: 'Deleted {name}',
  renaming: 'Renaming…',
  renamed: 'Renamed to {name}',
  buying: 'Buying…',
  bought: 'Setup slots: {n}',

  /* STORE FOOD TOO WEAK HERE (src/shell/weak-food.js, the one rule): a ground's Before you go and a keyed hall's door. {where} the bar's
     slots holding it (food_where*), {food} the bar's best store food, {want} the store food measured safe here. */
  food_weak: '{where}: {food} heals too little here. Pick {want}',
  /* the same with the server's numbers, when it has sent this hero's HP: {heal} what one {food} heals, {hp} the hero's full HP */
  food_weak_hp: '{where}: {food} heals {heal} of {hp} HP. Pick {want}',
  /* {n} the slot number ("4"), or the numbers ("4 and 6"); {name} another hero of this account in the party */
  food_where: 'Slot {n}',
  food_where_many: 'Slots {n}',
  food_where_peer: '{name}\'s slot {n}',
  food_where_peer_many: '{name}\'s slots {n}',

  /* CARRY IN, while this hero hunts (src/shell/carry-in.js). */
  carry_head: 'Carry into this hunt',
  carry_note: 'Uses carried supplies first, then the store',
  carry_none: 'Nothing to carry in',
  carry_line: '{have} in backpack, {inHunt} in hunt',
  carry_press: 'Carry {n}',

  /* BEFORE YOU GO, THE BLESSINGS (src/shell/hunt-go.js blessingWords). Every number is the server's Blessings section:
     {on} held of {of}, {pct} the cut they give now, {price} the next one's price, {level} the Level they stop being free at.
     `_free` while the next one costs nothing, `_cost` once it has a price, the bare row if the server hasn't said which. */
  blessings_none: 'Blessings: none (Shop → Services)',
  blessings_none_cost: 'Blessings: none (first: {price}, Shop → Services)',
  blessings_some: 'Blessings: {on} of {of}, -{pct}% death XP loss',
  blessings_some_cost: 'Blessings: {on} of {of}, -{pct}% death XP loss, next {price}',
  blessings_all: 'Blessings: {of} of {of}, -{pct}% death XP loss',
  /* How long the gold lasts (readiness.js): the gold, and the analyzer's supply spend an hour on the running hunt or, in town, the last one. */
  /* BEFORE YOU GO's own lines (src/shell/hunt-go.js). {left} "2 h 5 min"; {gold} "500 gp"; {setup} a setup's name. */
  go_bare_food: 'HP returns only between fights',
  go_bare_drink: 'Mana returns only between fights',
  go_no_cast: 'Nothing to cast',
  go_no_tamsin: 'Tamsin tasks count elsewhere: {counts}',
  go_no_food_drink: 'Food and drink: none',
  go_other_setup: 'Supplies: set by {setup}’s bar',
  go_no_weapon: 'Weapon: none',
  go_no_stamina: 'Stamina: none',
  go_stamina_low: 'Stamina: {left} left',
  go_stamina: 'Stamina: {left}',
  go_gold: 'Gold: {gold}',
  go_no_gold: 'Gold: none (hunt ends when supplies run out)',
  /* EVERY HERO'S CHECKLIST (src/shell/readiness.js). {n} the slot, 1 first. */
  ready_character: 'Character {n}',
  ready_loading: 'Loading this character…',
  ready_short_loading: 'not loaded yet',
  ready_weapon: 'Weapon: {item}',
  ready_no_weapon: 'Weapon: none',
  ready_short_weapon: 'no weapon',
  ready_bar_later: 'Action bar: set when a hunt is picked',
  ready_stamina: 'Stamina: {left} left',
  ready_no_stamina: 'Stamina: none',
  ready_short_stamina: 'no stamina',
  /* the bar's store food heals less than the hero's ground is measured safe on (readiness.js, the one weak-food rule) */
  ready_short_food_weak: 'weak food',
  gold_only: 'Gold: {gold} gp',
  gold_spend_now: 'Gold: {gold} gp, about {hours} h at {spend} gp/h on this hunt',
  gold_spend_last: 'Gold: {gold} gp, about {hours} h at {spend} gp/h last hunt',
});
