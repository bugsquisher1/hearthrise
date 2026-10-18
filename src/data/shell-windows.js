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
// The rest of the spec's catalogue (Homestead H, Bestiary L, Market M) lands
// with its renderer: a launcher never opens a window that does not exist yet
// (§1). Chat opens on its Combat tab. Hunt prep and Find are reached from the
// launcher row too: one gesture from anywhere, never buried in another window.
// ════════════════════════════════════════════════════════════════════════

export const SHELL_WINDOWS = Object.freeze([
  Object.freeze({ id: 'bag', label: 'Bag', key: 'b', glyph: 'navInventory', width: 420, object: 'satchel' }),
  Object.freeze({ id: 'gear', label: 'Gear', key: 'c', glyph: 'navCharacter', width: 380, object: 'doll' }),
  Object.freeze({ id: 'skills', label: 'Skills', key: 'k', glyph: 'navSkills', width: 380, object: 'ledger' }),
  Object.freeze({ id: 'shop', label: 'Shop', key: 'v', glyph: 'navStore', width: 420, object: 'ledger' }),
  Object.freeze({ id: 'hunt-prep', label: 'Hunt prep', key: 'p', glyph: 'uiCheck', width: 420, object: 'plain' }),
  Object.freeze({ id: 'find', label: 'Find an item', key: 'f', glyph: 'uiSearch', width: 380, object: 'plain' }),
  /* Week plan step 16 + QoL 3: the party, and every open character on one screen (opened from the
     character strip's "All characters", so it takes no launcher icon). */
  Object.freeze({ id: 'hunt-party', label: 'Party', key: 'y', glyph: 'uiPeople', width: 440, object: 'plain' }),
  Object.freeze({ id: 'characters', label: 'All characters', key: 'o', glyph: 'navProfile', width: 460, object: 'ledger', launcher: false }),
  Object.freeze({ id: 'hud', label: 'HUD layout', key: 'u', glyph: 'uiSettings', width: 380, object: 'plain', launcher: false }),
  Object.freeze({ id: 'hunt-settings', label: 'Hunt settings', key: 'j', glyph: 'uiTarget', width: 440, object: 'plain' }),
  Object.freeze({ id: 'chat', label: 'Chat', key: 'enter', glyph: 'uiChat', width: 400, object: 'plain' }),
  Object.freeze({ id: 'settings', label: 'Settings', key: 'escape', glyph: 'uiSettings', width: 540, object: 'plain', escape: true }),
]);
