// ════════════════════════════════════════════════════════════════════════
// src/data/text/bag.js — THE INVENTORY WINDOW'S WORDS (src/shell/windows/inventory/*).
//
// One row per sentence or label, read by t('bag.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: the selection and its bulk tools (Tyler 2026-11-11:
// "Inventory management still kind of sucks"), and the key help line.
// ════════════════════════════════════════════════════════════════════════

export const BAG_TEXT = Object.freeze({
  /* COPY LOOT PLAN FROM <HERO> (audit 2026-11-15 F11; src/shell/windows/inventory/plan-copy.js, 2027-04-24-loot-plan-copy.sql): one press per
     other hero of the account, a confirm that says what the copy does, then the server's plan on screen. */
  plan_copy_from: 'Copy loot plan from {hero}',
  plan_copy_hero: 'Hero {slot}',
  plan_copy_this: 'This hero',
  plan_copy_confirm_label: 'Confirm copying the loot plan',
  plan_copy_q: '{to} takes {from}\'s loot plan: {count} items planned.',
  plan_copy_q_one: '{to} takes {from}\'s loot plan: 1 item planned.',
  plan_copy_q_unread: '{to} takes {from}\'s loot plan.',
  plan_copy_note: 'Anything {from} keeps goes back to Keep in bag here. Locks stay as they are.',
  plan_copy_yes: 'Copy the plan',
  plan_copy_busy: 'Copying the loot plan…',
  plan_copy_done: 'This hero now follows {from}\'s loot plan.',
  plan_copy_skipped: '{count} of its plans can\'t be used for this hero and were left out.',
  /* The selection line over the bulk tools: how many stacks, and what the shop would pay for them (the server's bids). */
  selected: '{count} selected',
  selected_worth: '{count} selected, worth {worth}',
  selected_worth_unpriced: '{count} selected, worth {worth} ({unpriced} with no shop price)',
  /* (The bulk tools beside it say the glossary's words: controls.sell_selected, deposit, lock / unlock, clear.) */
  /* Deposit: ONE storage move of every selected stack, whole (all or nothing); the count is the server's. */
  putting_away: 'Putting them away…',
  put_away: { one: 'Put away {count} stack.', other: 'Put away {count} stacks.' },
  storage_away: 'Your storage is at home and your hero is out hunting. Leave the hunt to use it.',
  /* Lock and Unlock: ONE lock of every selected stack (all or nothing). */
  locking: 'Locking…',
  unlocking: 'Unlocking…',
  locked_n: { one: 'Locked {count} stack.', other: 'Locked {count} stacks.' },
  unlocked_n: { one: 'Unlocked {count} stack.', other: 'Unlocked {count} stacks.' },
  locks_reading: 'Reading your locks…',
  /* The Storage window (src/shell/windows/storage.js). Its Expand reads the server's offer (hr_bag_expand_view). */
  store_search: 'Search items',
  store_in_storage: 'In storage',
  store_in_bag: 'In your bag',
  store_bag_of: 'Bag {n} / {cap}',
  store_no_match: 'Nothing here matches.',
  store_empty: 'Your storage is empty. All your characters share it. Press a stack in your bag to put it away.',
  store_bag_empty: 'Your bag is empty.',
  store_reading: 'Reading your storage…',
  store_help_touch: 'Press a stack to move one across. Hold it to choose how many.',
  store_help_mouse: 'Press a stack to move one across. Shift-press moves all of it. Right-click (or hold) to choose how many.',
  store_more_room: 'More room comes from storage chests, built in the House (E). Next: the {name}, {n} more stacks.',
  store_all_built: 'Every storage chest is built.',
  store_taking: 'Taking it out…',
  store_putting: 'Putting it away…',
  store_grow_reading: 'Reading your bag\'s room…',
  store_grow_top: 'Your bag is as big as it gets.',
  store_gold_reading: 'Reading your gold…',
  store_grow_short: 'You need {gold} more to expand your bag.',
  store_expand_at: 'Expand (+{n}) for {gold}',
  store_expand_tip: 'Room for {n} more stacks in your bag',
  store_expanding: 'Expanding your bag…',
  store_expanded: 'Your bag holds {n} stacks now.',
  store_expanded_plain: 'Your bag is bigger now.',
  /* The key help at the window's foot, one hint a row: the key, then "to" and what it does (grid.js keyHintHtml sets the key apart). */
  key_search: '/ to search',
  key_move: 'Arrows to move',
  key_use: 'Enter to use',
  key_select: 'Space or Ctrl+click to select',
  key_range: 'Shift+click or Shift+arrows to select a range',
  key_all: 'Ctrl+A to select or deselect all',
  key_clear: 'Esc to deselect',
  key_sell: 'Delete to sell',
  key_lock: 'L to lock',
});
