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
//
// The rest of the spec's catalogue (Homestead, Bestiary L, Market M) lands
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
  Object.freeze({ id: 'hunts', label: 'Hunts', key: 'h', glyph: 'uiMap', width: 440, object: 'plain' }),
  Object.freeze({ id: 'inventory', label: 'Inventory', key: 'b', glyph: 'navInventory', width: 452, object: 'satchel' }),
  Object.freeze({ id: 'character', label: 'Character', key: 'c', glyph: 'navCharacter', width: 560, object: 'ledger' }),
  Object.freeze({ id: 'skills-trade', label: 'Gathering and crafting', key: 'g', glyph: 'uiPickaxe', width: 380, object: 'ledger' }),
  Object.freeze({ id: 'storage', label: 'Storage', key: 't', glyph: 'uiChest', width: 452, object: 'satchel' }),
  Object.freeze({ id: 'shop', label: 'Shop', key: 'v', glyph: 'navStore', width: 420, object: 'ledger' }),
  /* Lane S2: stamina refills, blessings and the character's name, each priced by the server. */
  Object.freeze({ id: 'services', label: 'Services', key: 'r', glyph: 'uiHourglass', width: 400, object: 'ledger' }),
  Object.freeze({ id: 'hunt-prep', label: 'Hunt prep', key: 'p', glyph: 'uiCheck', width: 420, object: 'plain' }),
  /* Week plan step 16 + QoL 3: the party, and every open character on one screen (opened from the
     character strip's "All characters", so it takes no launcher icon). */
  Object.freeze({ id: 'hunt-party', label: 'Party', key: 'y', glyph: 'uiPeople', width: 440, object: 'plain' }),
  Object.freeze({ id: 'characters', label: 'All characters', key: 'o', glyph: 'navProfile', width: 460, object: 'ledger', launcher: false }),
  Object.freeze({ id: 'hunt-summary', label: 'Hunt summary', key: 'l', glyph: 'uiCheck', width: 420, object: 'ledger', launcher: false }),
  Object.freeze({ id: 'hud', label: 'HUD layout', key: 'u', glyph: 'uiSettings', width: 380, object: 'plain', launcher: false }),
  Object.freeze({ id: 'hunt-settings', label: 'Hunt settings', key: 'j', glyph: 'uiTarget', width: 440, object: 'plain' }),
  /* One bar slot: what it does and when (opened by a press on a bar slot, in town or in a hunt). */
  Object.freeze({ id: 'configure-action', label: 'Configure action', key: 'k', glyph: 'uiTarget', width: 600, object: 'plain', launcher: false, modal: true }),
  Object.freeze({ id: 'chat', label: 'Chat', key: 'enter', glyph: 'uiChat', width: 400, object: 'plain' }),
  /* The social side (2026-10-18): friends, and a read-only look at another player's worn gear
     (opened from the player menu, so it takes no launcher icon). */
  Object.freeze({ id: 'friends', label: 'Friends', key: 'n', glyph: 'navProfile', width: 380, object: 'ledger' }),
  Object.freeze({ id: 'inspect', label: 'Inspect', key: 'i', glyph: 'navCharacter', width: 340, object: 'doll', launcher: false }),
  Object.freeze({ id: 'settings', label: 'Settings', key: 'escape', glyph: 'uiSettings', width: 540, object: 'plain', escape: true }),
]);
