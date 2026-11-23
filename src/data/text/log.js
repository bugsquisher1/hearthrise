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
  /* A HEAL THAT NAMES ITS SOURCE ({source}: src/render/source-names.js): a heal over time's tick, a Roads reaction, a leech, a share on a
     second ally. A heal that names none reads as it always has. */
  heal_with: '{who} heals {target} for {n} with {source}.',
  heal_self_with: '{who} heals for {n} with {source}.',
  /* A BODYGUARD'S SHARE (src/core/hunt/damage.js landOn): the guard takes part of a monster's blow at a back-row ally. */
  guard: '{target} guards an ally and takes {n}.',
  /* A STATUS landing or ending ({status}: its row's name, src/data/statuses.js). A harmful one affects, a helpful one is gained (a heal
     over time, a guard, a boon), a ground patch is left by the hero holding it. A status may have its own pair (status_on_<id>). */
  status_on: '{who} is affected by {status}.',
  status_on_good: '{who} gains {status}.',
  status_on_ground: '{who} leaves {status} behind.',
  status_off: '{who} is free of {status}.',
  status_off_good: '{who}’s {status} ends.',
  status_off_ground: '{who}’s {status} fades.',
  status_on_bleed: '{who} is bleeding.',
  status_off_bleed: '{who} stops bleeding.',
});
