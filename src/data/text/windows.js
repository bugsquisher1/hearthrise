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
  help_hunts: 'Pick a hunt, then press Enter',
  help_talents: 'Drag to move · Wheel or pinch to zoom · Press a stone for its route',
  help_inventory: 'Press a stack: Equip, Use or Sell',
  help_storage: 'Press a stack: move to bag or back',
  help_wiki: 'Chronicle · Search skills, grounds and formulas',
  help_shop: 'Tools, gear and loot · Blessings under Services',
  help_skills: 'Select a skill: gather or craft',
  help_prep: 'Pick a setup · Press Use before a hunt',
});
