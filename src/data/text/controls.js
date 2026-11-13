// ════════════════════════════════════════════════════════════════════════
// src/data/text/controls.js — THE CONTROL GLOSSARY: one standard word per action, everywhere.
//
// Tyler, 2026-11-11, after "Start from what you wear" became "Use equipped": "Try to standardize language like
// that a bit more please." A control (a button, a tab, a column head, a menu item, a toggle, a select option) says
// the genre's one word for its action, the same word in every window. Sentences in his voice are for explanations,
// coach cards, crier lines and lore, never for a control (docs/DESIGN_STANDARDS.md §3 "Controls").
//
// Every control string in src/shell/** and src/app/** either reads a row here with t('controls.…') or matches one of
// these words exactly; tests/copy-lint.mjs (control-long, control-period, control-synonym) holds the line: a control
// longer than three words, one that ends in a period, or a near-synonym of a word here (Put away for Deposit, Wear for
// Equip, Forget it for Cancel) is a slip. A feature keeps its name as a noun (Dispatch loot, Bless all, Hunt again).
// The windows, 2026-11-11 (.claude/coordination/control-glossary-2026-11-11.md has the before/after table):
//   Equip / Unequip      bag primary and menu, the doll (was Wear / Take off), the Outfit tab (was Wear this outfit),
//                        the Titles tab (was Wear / Take off)
//   Use / Use equipped   Hunt prep: put a setup on; save what you have on over the picked setup (was Save here)
//   New setup            Hunt prep (was Save current setup; the setup builder's mock says the same)
//   Delete / Delete it?  Hunt prep
//   Cancel               every confirm and draft (Hunt prep's armed Delete was Keep; the Market's draft was Forget it;
//                        a friend request you sent was Withdraw, which Storage uses for gold and goods)
//   Close                Farm, All characters, the legal reader, every window's corner
//   Back                 Hunts, Market (was Back to the list), Settings (was All settings), Gathering and crafting
//                        (was All skills), Create a hero (was Back to your characters)
//   Take / Abandon       Tamsin's tally: take a task, drop one (was Give up)
//   Enter                Hunts: Enter, Enter anyway, Enter with party (was Start with party / Start anyway)
//   Leave party          the party panel, Hunts
//   Buy / Sell           Shop tabs, the House, the bag, the Market, the loot plan
//   Deposit / Withdraw   Storage (was Store / Take), the loot plan (was Deposit in storage)
//   Keep                 the loot plan (was Keep in bag)
//   Lock / Unlock        the bag menu
//   Select / Deselect    the bag menu (was Select / Unselect)
//   Sort / Filter        bag, Storage, Market, crafting; Chat's Combat tab (was Filter lines)
//   Search               Party finder; the bag, Storage and Market search fields
//   Clear                the bag's selection
//   Play / Show / Rename / Sign out   All characters and the character strip
//   Accept / Decline / Join / Invite  Friends, Party, the invite alert (was Join / No thanks)
//   Show in finder / Hide from finder   Party (was Show in the finder / Hide from the finder)
//   Refresh              the Market (Chat's Send is a literal: the file binds t for its tabs)
//   List                 the Market's verb: List, List an item (was List something), List on market (the bag menu, was
//                        List on the market…), List again; Buy again
//   Max affordable       the Market's quantity chip (was Most I can afford)
//   Pick                 Pick a hunt (Party, was Pick a hunt for the party), Pick a weight, Pick colors
//   Stop / Remove / Disband          the bag, crafting, the party panel
//   Dispatch loot / Sell selected / Sell all   the bag's tools (Dispatch loot is a feature's name)
//   Insert here          the bar's drop menu, a literal there (was Insert here (shift the rest))
// Window names (Hunts, Inventory, Settings…) live in src/data/shell-windows.js; the hotkey help is src/data/hunt-hud.js.
// ════════════════════════════════════════════════════════════════════════
export const CONTROLS_TEXT = Object.freeze({
  equip: 'Equip',
  unequip: 'Unequip',
  use: 'Use',
  use_equipped: 'Use equipped',
  new_setup: 'New setup',
  delete: 'Delete',
  delete_confirm: 'Delete it?',
  cancel: 'Cancel',
  close: 'Close',
  back: 'Back',
  take: 'Take',
  abandon: 'Abandon',
  enter: 'Enter',
  enter_anyway: 'Enter anyway',
  enter_with_party: 'Enter with party',
  leave_party: 'Leave party',
  buy: 'Buy',
  sell: 'Sell',
  sell_selected: 'Sell selected',
  sell_all_cat: 'Sell all {category}',
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  keep: 'Keep',
  lock: 'Lock',
  unlock: 'Unlock',
  select: 'Select',
  deselect: 'Deselect',
  sort: 'Sort',
  filter: 'Filter',
  filter_off: 'Filter ({count} off)',
  search: 'Search',
  clear: 'Clear',
  play: 'Play',
  show: 'Show',
  rename: 'Rename',
  sign_out: 'Sign out',
  accept: 'Accept',
  decline: 'Decline',
  join: 'Join',
  refresh: 'Refresh',
  list: 'List',
  list_item: 'List an item',
  list_on_market: 'List on market',
  list_again: 'List again',
  buy_again: 'Buy again',
  show_in_finder: 'Show in finder',
  hide_from_finder: 'Hide from finder',
  max_affordable: 'Max affordable',
  pick_hunt: 'Pick a hunt',
  pick_weight: 'Pick a weight',
  pick_colors: 'Pick colors',
  stop: 'Stop',
  remove: 'Remove',
  disband: 'Disband',
  dispatch_loot: 'Dispatch loot',
  hunt_again: 'Hunt again',
  open_bag: 'Open bag',
  expand: 'Expand',
  expand_bag: 'Expand bag',
});
