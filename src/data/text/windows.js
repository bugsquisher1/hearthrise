// ════════════════════════════════════════════════════════════════════════
// src/data/text/windows.js — THE WINDOW HEADER'S WORDS (src/shell/window-head.js): the way back's tooltip,
// the help button and each window's one help line.
//
// One row per sentence or label, read by t('windows.<key>'). A row in src/data/shell-windows.js names its help
// line with `help: 'windows.help_<id>'`; the shell adds key_line ("Shortcut: H") when the row has a key
// and the screen has a keyboard. Back and Close are the glossary's (src/data/text/controls.js).
// ════════════════════════════════════════════════════════════════════════

export const WINDOWS_TEXT = Object.freeze({
  /* The header's Back: its tooltip names where it goes. */
  back_to: 'Back to {window}',
  /* The help button's label and the key sentence added to a help line. */
  help: 'Help',
  key_line: 'Shortcut: {key}',

  /* Each window's one help line: what it is for, in a sentence or two. @sentence: the ? button teaches the window, a label can't. */
  help_hunts: 'Pick a hunt and press Enter.',
  help_inventory: 'Select an item to equip, use or sell it.',
  help_storage: 'Select an item to move it between your bag and Storage. All your heroes share Storage.',
  help_wiki: 'Look up any skill, hunting ground or formula.',
  help_shop: 'Buy supplies and gear, or sell your loot. Blessings and tempering are under Services.',
  help_skills: 'Pick a skill to start gathering or crafting.',
  help_prep: 'Pick a setup and press Use before you hunt.',
});
