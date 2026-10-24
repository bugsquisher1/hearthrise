// ════════════════════════════════════════════════════════════════════════
// src/data/shell-windows.js — THE WORLD SHELL'S WINDOW CATALOGUE.
//
// One row per window (docs/design/WORLD_SHELL.md §4). A window is this row plus
// a renderer of the same id in src/shell/renderers.js; tests/shell-renderers.mjs
// fails the build when either half is missing. The launcher row, the shortcut
// keys and the dock widths are all read from here, so nothing about a window is
// typed twice.
//
//   id       stable id; the renderer key and the [data-hs-win] attribute
//   label    the title and the launcher tooltip
//   key      KeyboardEvent.key, lower-cased ('b', 'enter'); unique. Digits 1-0
//            belong to the action bar and are refused by the window manager
//   glyph    a window.HR_GLYPHS key (src/data/glyphs.js)
//   width    docked width on desktop, CSS px (the phone uses one sheet width)
//   object   the frame's object variant (ART_DIRECTION §6): plain | satchel | doll | ledger | deed | book
//   launcher false keeps a window off the icon row (reached from another window)
//   escape   true on at most one row: Esc with nothing open opens it (Settings)
//   home     'bl': opens floating at the World's bottom-left, never docked (window-manager.js)
//   resizable true: a grip resizes it, the size kept per character (src/shell/window-sizes.js)
//   height   the starting height of a home or resizable row, CSS px
//
// The rest of the spec's catalogue (Bestiary L, Market M) lands
// with its renderer: a launcher never opens a window that does not exist yet
// (§1). Chat opens on Global (or the tab it showed last).
//
// Tyler's first playtest (10-18) shaped the row: Hunts comes first (going
// hunting must be obvious from the first minute; a hunt's door in the World
// opens it too); the bag and the gear are ONE Inventory window (the paper doll
// beside the item grid); the skills are two windows, combat and the rest, so
// neither scrolls; Storage is reachable anywhere; and finding an item is the
// search inside Inventory and Storage, not a window of its own.
// ════════════════════════════════════════════════════════════════════════

export const SHELL_WINDOWS = Object.freeze([
  Object.freeze({ id: 'hunts', label: 'Hunts', key: 'h', glyph: 'uiMap', width: 800, object: 'plain' }),
  Object.freeze({ id: 'inventory', label: 'Inventory', key: 'b', glyph: 'navInventory', width: 452, object: 'satchel' }),
  Object.freeze({ id: 'character', label: 'Character', key: 'c', glyph: 'navCharacter', width: 560, object: 'ledger' }),
  Object.freeze({ id: 'skills-trade', label: 'Gathering and crafting', key: 'g', glyph: 'uiPickaxe', width: 380, object: 'ledger' }),
  Object.freeze({ id: 'storage', label: 'Storage', key: 't', glyph: 'uiChest', width: 452, object: 'satchel' }),
  Object.freeze({ id: 'shop', label: 'Shop', key: 'v', glyph: 'navStore', width: 420, object: 'ledger' }),
  /* The farm plots (P1 2026-10-22: no client door to farming). Per hero: each hero has its own plots on the server. */
  Object.freeze({ id: 'farm', label: 'Farm', key: 'j', glyph: 'uiSprout', width: 440, object: 'plain' }),
  /* Lane S2: stamina refills, blessings and the character's name, each priced by the server. */
  /* The account's one house (Tyler 2026-10-15): the property, its rooms and the storage chests, bought from any character. */
  Object.freeze({ id: 'house', label: 'House', key: 'e', glyph: 'navHouse', width: 480, object: 'deed' }),
  Object.freeze({ id: 'services', label: 'Services', key: 'r', glyph: 'uiHourglass', width: 400, object: 'ledger' }),
  /* Tamsin's tally (2026-12-23-tally-tasks.sql): kill tasks counted by the server, paid in town. Her board on the
     Common opens it too (src/data/world/stations.js TAP_OPENS), and so does the HUD's tally. */
  Object.freeze({ id: 'tally', label: 'Tamsin\'s tally', key: 'q', glyph: 'navBounty', width: 460, object: 'ledger' }),
  Object.freeze({ id: 'hunt-prep', label: 'Hunt prep', key: 'p', glyph: 'uiCheck', width: 420, object: 'plain' }),
  /* Week plan step 16 + QoL 3: the party, and every open character on one screen (opened from the
     character strip's "All characters", so it takes no launcher icon). */
  Object.freeze({ id: 'hunt-party', label: 'Party', key: 'y', glyph: 'uiPeople', width: 440, object: 'plain' }),
  Object.freeze({ id: 'characters', label: 'All characters', key: 'o', glyph: 'navProfile', width: 460, object: 'ledger', launcher: false }),
  Object.freeze({ id: 'hunt-summary', label: 'Hunt summary', key: 'l', glyph: 'uiCheck', width: 420, object: 'ledger', launcher: false }),
  Object.freeze({ id: 'hud', label: 'HUD layout', key: 'u', glyph: 'uiSettings', width: 380, object: 'plain', launcher: false }),
  /* One bar slot: what it does and when (opened by a press on a bar slot, in town or in a hunt). */
  Object.freeze({ id: 'configure-action', label: 'Configure action', key: 'k', glyph: 'uiTarget', width: 800, object: 'plain', launcher: false, modal: true }),
  /* Tyler 2026-10-19: a death opens a centred popup (src/shell/death-popup.js opens it; its key shows the last death). */
  Object.freeze({ id: 'death', label: 'You died', key: 'x', glyph: 'uiSkull', width: 420, object: 'ledger', launcher: false, modal: true }),
  /* Tyler 2026-10-22: Chat opens floating at the bottom-left (never docked) and the player resizes it (kept in the residue). */
  Object.freeze({ id: 'chat', label: 'Chat', key: 'enter', glyph: 'uiChat', width: 400, height: 280, home: 'bl', resizable: true, object: 'plain' }),
  /* The social side (2026-10-18): friends, and a read-only look at another player's worn gear
     (opened from the player menu, so it takes no launcher icon). */
  Object.freeze({ id: 'friends', label: 'Friends', key: 'n', glyph: 'navProfile', width: 380, object: 'ledger' }),
  Object.freeze({ id: 'inspect', label: 'Inspect', key: 'i', glyph: 'navCharacter', width: 340, object: 'doll', launcher: false }),
  Object.freeze({ id: 'settings', label: 'Settings', key: 'escape', glyph: 'uiSettings', width: 540, object: 'plain', escape: true }),
  /* A player's problem report, straight to the team through the bug-report bridge (also in Settings, Help). */
  Object.freeze({ id: 'report', label: 'Report a problem', key: 'f', glyph: 'uiWarn', width: 420, object: 'plain' }),
]);
