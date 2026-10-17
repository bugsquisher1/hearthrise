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
// The rest of the spec's catalogue (Bag B, Gear C, Skills K, Homestead H,
// Bestiary L, Market M, Chat Enter, Settings Esc) lands with its renderer in the
// cutover: a launcher never opens a window that does not exist yet (§1).
// ════════════════════════════════════════════════════════════════════════

export const SHELL_WINDOWS = Object.freeze([
  Object.freeze({ id: 'hud', label: 'HUD layout', key: 'u', glyph: 'uiSettings', width: 380, object: 'plain', launcher: false }),
]);
