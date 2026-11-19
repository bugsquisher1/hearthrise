// ════════════════════════════════════════════════════════════════════════
// src/data/text/bag.js — THE INVENTORY WINDOW'S WORDS (src/shell/windows/inventory/*).
//
// One row per sentence or label, read by t('bag.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: the selection and its bulk tools (Tyler 2026-11-11:
// "Inventory management still kind of sucks"), and the key help line.
// ════════════════════════════════════════════════════════════════════════

export const BAG_TEXT = Object.freeze({
  /* +SKILL while worn (src/core/combat.js SKILL_PLUS_FIELDS: a tower weapon's), the item card's stat names */
  stat_melee_plus: 'Melee skill',
  stat_ranged_plus: 'Ranged skill',
  stat_magic_plus: 'Magic skill',
  stat_defense_plus: 'Defense skill',
  /* COPY LOOT PLAN FROM <HERO> (audit 2026-11-15 F11; src/shell/windows/inventory/plan-copy.js, 2027-04-24-loot-plan-copy.sql): one press per
     other hero of the account, a confirm that says what the copy does, then the server's plan on screen. */
  plan_copy_from: 'Copy loot plan from {hero}',
  plan_copy_hero: 'Hero {slot}',
  plan_copy_this: 'This hero',
  plan_copy_confirm_label: 'Confirm copying the loot plan',
  plan_copy_q: 'Copy {from}\'s loot plan to {to}: {count} items',
  plan_copy_q_one: 'Copy {from}\'s loot plan to {to}: 1 item',
  plan_copy_q_unread: 'Copy {from}\'s loot plan to {to}',
  plan_copy_note: 'Items {from} keeps: reset to Keep (locks unchanged)',
  plan_copy_yes: 'Copy',
  plan_copy_busy: 'Copying…',
  plan_copy_done: 'Loot plan copied from {from}',
  plan_copy_skipped: '{count} skipped (not usable by this hero)',
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
  confirm_super_rares: 'Super Rare: {count}',
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
  /* An outfit's bundle (the Key Warden): Use owns the outfit for this hero (src/shell/windows/inventory/outfit-bundle.js). Labels. */
  bundle_owned: 'Outfit already owned',
  /* the first press arms the use (a tradeable item, used for good): the second unlocks it */
  bundle_confirm: 'Press again to unlock for good',
  bundle_busy: 'Unpacking…',
  bundle_used: 'Outfit unlocked: {outfit}',
  /* A pattern (src/data/patterns.js): Learn opens its recipe for this hero (src/shell/windows/inventory/pattern.js). Labels. */
  pattern_known: 'Pattern already learned',
  /* the first press arms the learn (a tradeable Rare, used up): the second learns it */
  pattern_confirm: 'Press again to learn it for this hero',
  pattern_busy: 'Learning…',
  pattern_learned: 'Recipe learned: {recipe}',
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
  store_more_room: 'More room: build storage chests in the House. Next: {name} (+{n} stacks)',
  store_all_built: 'Every storage chest is built.',
  store_taking: 'Withdrawing…',
  store_putting: 'Depositing…',
  /* the answer: {n} the count, {item} its name, {slower} the tool-loss line or nothing */
  store_took: 'Withdrew {n} {item}',
  store_put: 'Deposited {n} {item}',
  store_aria_take: '{item}: withdraw',
  store_aria_put: '{item}: deposit',
  store_kept: { one: '{count} more kept free for market listings', other: '{count} more kept free for market listings' },
  store_dispatch_tip: 'Deposits and sells each stack as planned',
  /* DEPOSIT ALL MATERIALS (audit 2026-11-18 A8): one press for every Material stack that fits; {n} the stacks it names now */
  store_mats_n: 'Deposit all materials ({n})',
  store_mats_tip: 'Every Material stack in the bag, unlocked, whole',
  store_mats_left: { one: 'Storage full: {count} material stack stays in the bag', other: 'Storage full: {count} material stacks stay in the bag' },
  /* a press made while another is out waits its turn (the same audit: fast presses were dropped or refused) */
  store_queued: { one: 'Moving… {count} more waiting', other: 'Moving… {count} more waiting' },
  store_took_stacks: { one: 'Withdrew {count} stack', other: 'Withdrew {count} stacks' },
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
  /* The Key Ring tab (src/shell/windows/inventory/key-ring.js; Tyler 2026-11-16): labels, the server's price. */
  ring_tab: 'Key Ring',
  ring_locked: 'Locked',
  ring_empty: 'No keys',
  ring_unlock: 'Unlock: {gold}',
  ring_unlocking: 'Unlocking…',
  ring_unlocked: 'Key Ring unlocked',
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
