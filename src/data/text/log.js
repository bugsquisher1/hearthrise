// ════════════════════════════════════════════════════════════════════════
// src/data/text/log.js — THE COMBAT LOG'S WORDS (src/hunt-view/combat-log.js).
//
// One row per sentence, read by t('log.<key>'). {who} is a unit's name as the
// log names it, {spell} a monster spell's name (src/data/monster-spells.js).
// The log's older lines are still written in combat-log.js (tests/text-home.mjs
// ratchets them down); a new line starts here.
// ════════════════════════════════════════════════════════════════════════

export const LOG_TEXT = Object.freeze({
  /* A monster's spell winding up: the screen marks it, the log names it. A group spell reaches everyone in the fight. */
  spell: '{who} is casting {spell}.',
  spell_group: '{who} is casting {spell} on the whole party.',
  /* A skill level that unlocks a move (abilities.js unlock): the player adds it to the action bar. */
  unlocked: 'You can now use {moves}. Add it to your action bar.',
});
