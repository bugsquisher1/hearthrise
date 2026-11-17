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
  /* A monster that shoots (monsters.js `range`: Hask's Lookout): its plain blow is a shot, its miss a missed shot, a dodge dodges the shot. */
  shot: '{who} shoots {target} for {n}.',
  shot_miss: '{who} shoots at {target} and misses.',
  shot_dodge: '{target} dodges {who}’s shot.',
  /* A skill level that unlocks a move (abilities.js unlock): the player adds it to the action bar. */
  unlocked: 'Unlocked: {moves}',
});
