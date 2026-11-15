// ════════════════════════════════════════════════════════════════════════
// src/data/text/bag.js — THE INVENTORY WINDOW'S WORDS (src/shell/windows/inventory/*).
//
// One row per sentence or label, read by t('bag.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: the selection and its bulk tools (Tyler 2026-11-11:
// "Inventory management still kind of sucks"), and the key help line.
// ════════════════════════════════════════════════════════════════════════

export const BAG_TEXT = Object.freeze({
  /* The selection line over the bulk tools: how many stacks, and what the shop would pay for them (the server's bids). */
  selected: '{count} selected',
  selected_worth: '{count} selected, worth {worth}',
  selected_worth_unpriced: '{count} selected, worth {worth} ({unpriced} with no shop price)',
  /* (The bulk tools beside it say the glossary's words: controls.sell_selected, deposit, lock / unlock, clear.) */
  /* Deposit: ONE storage move of every selected stack, whole (all or nothing); the count is the server's. */
  putting_away: 'Putting them away…',
  put_away: { one: 'Put away {count} stack.', other: 'Put away {count} stacks.' },
  storage_away: 'Storage is in town (leave the hunt to use it)',
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
  store_empty: 'Storage empty (shared by all heroes). Press a bag stack to deposit.',
  store_bag_empty: 'Your bag is empty.',
  store_reading: 'Reading your storage…',
  store_help_touch: 'Press: move one. Hold: choose how many',
  store_help_mouse: 'Press: move one. Shift-press: move all. Right-click or hold: choose how many',
  store_more_room: 'More room: storage chests (House, E). Next: {name}, +{n} stacks',
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
