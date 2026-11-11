// ════════════════════════════════════════════════════════════════════════
// src/data/text/windows.js — THE WINDOW HEADER'S WORDS (src/shell/window-head.js): the way back's tooltip,
// the help button and each window's one help line.
//
// One row per sentence or label, read by t('windows.<key>'). A row in src/data/shell-windows.js names its help
// line with `help: 'windows.help_<id>'`; the shell adds key_line ("H opens this window.") when the row has a key
// and the screen has a keyboard. Back and Close are the glossary's (src/data/text/controls.js).
// ════════════════════════════════════════════════════════════════════════

export const WINDOWS_TEXT = Object.freeze({
  /* The header's Back: its tooltip names where it goes. */
  back_to: 'Back to {window}',
  /* The help button's label and the key sentence added to a help line. */
  help: 'Help',
  key_line: '{key} opens this window.',

  /* Each window's one help line: what it is for, in a sentence or two. */
  help_hunts: 'Pick a hunt, then press Enter. Your hero walks there and fights on its own, even after you close the game.',
  help_inventory: 'Press a stack to pick it, then use the buttons under the bag. Right-click a stack (or hold it) for everything you can do with it.',
  help_storage: 'Storage is shared by every hero on your account. Press a stack to move one across, or Shift-press to move all of it.',
  help_shop: 'Buy tools and gear, sell what you found, and get your Blessings on the Services tab. R opens the Shop on Services.',
  help_skills: 'Press a skill to gather or make something. Your hero keeps at it while you are away, until you stop it or start a hunt.',
  help_prep: 'Pick a setup and press Use to put it on before a hunt. New setup saves what your hero has on right now.',
});
