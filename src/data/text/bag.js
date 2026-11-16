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
  selected_worth_unpriced: '{count} selected, worth {worth}, {unpriced} unpriced',
  /* (The bulk tools beside it say the glossary's words: controls.sell_selected, deposit, lock / unlock, clear.) */
  /* Select outgrown (audit F18): the selection becomes the gear below what the hero wears in its slot, Rares in, locked stacks out. */
  select_outgrown: 'Select outgrown ({count})',
  select_outgrown_tip: 'Gear below the worn tier',
  /* A sale's confirmation: the Rares in it, and the stacks one sale leaves for the next press (64 a sale). */
  confirm_rares: 'Rares: {count}',
  confirm_remaining: { one: 'Remaining: {count} stack', other: 'Remaining: {count} stacks' },
  /* Deposit: ONE storage move of every selected stack, whole (all or nothing); the count is the server's. */
  putting_away: 'Putting them away…',
  put_away: { one: 'Put away {count} stack.', other: 'Put away {count} stacks.' },
  storage_away: 'Storage is in town',
  /* Lock and Unlock: ONE lock of every selected stack (all or nothing). */
  locking: 'Locking…',
  unlocking: 'Unlocking…',
  locked_n: { one: 'Locked {count} stack.', other: 'Locked {count} stacks.' },
  unlocked_n: { one: 'Unlocked {count} stack.', other: 'Unlocked {count} stacks.' },
  locks_reading: 'Loading locks…',
  /* The Storage window (src/shell/windows/storage.js). Its Expand reads the server's offer (hr_bag_expand_view). */
  store_search: 'Search items',
  store_in_storage: 'In storage',
  store_in_bag: 'In bag',
  store_bag_of: 'Bag {n} / {cap}',
  store_no_match: 'Nothing here matches.',
  store_empty: 'Storage empty',
  store_bag_empty: 'Bag empty',
  store_reading: 'Loading storage…',
  store_help_touch: 'Press: move one. Hold: choose how many',
  store_help_mouse: 'Press: move one. Shift-press: move all. Right-click or hold: choose how many',
  store_more_room: 'More room: storage chests in the House. Next: {name}, +{n} stacks',
  store_all_built: 'Every storage chest is built.',
  store_taking: 'Withdrawing…',
  store_putting: 'Depositing…',
  /* the answer: {n} the count, {item} its name, {slower} the tool-loss line or nothing */
  store_took: 'Withdrew {n} {item}',
  store_put: 'Deposited {n} {item}',
  store_aria_take: '{item}: withdraw',
  store_aria_put: '{item}: deposit',
  store_kept: { one: '{count} more kept free for market listings', other: '{count} more kept free for market listings' },
  store_dispatch_tip: 'Deposits stacks planned Deposit, sells stacks planned Sell',
  store_how_many: '{verb} how many {item}?',
  store_how_many_label: '{verb} how many',
  store_grow_reading: 'Loading bag size…',
  store_grow_top: 'Bag at max size',
  store_gold_reading: 'Loading gold…',
  store_grow_short: 'Need {gold} more to expand',
  store_expand_at: 'Expand (+{n}) for {gold}',
  store_expand_tip: 'Room for {n} more stacks',
  store_expanding: 'Expanding bag…',
  store_expanded: 'Bag now holds {n} stacks',
  store_expanded_plain: 'Bag expanded',
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
