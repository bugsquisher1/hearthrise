// ════════════════════════════════════════════════════════════════════════
// src/data/text/fight.js — THE FIGHT'S OWN NAMES (src/render/source-names.js).
//
// One row per engine piece a hunt event names that no data row names: a blow the engine lands itself (the `ability` of its `dmg`).
// Read by t('fight.piece_<id>') wherever the id is written as words: the combat log, the analyzer's attacks, the hunt report.
// LABELS, NOT SENTENCES (Tyler 2026-11-14): one genre word each.
// ════════════════════════════════════════════════════════════════════════

export const FIGHT_TEXT = Object.freeze({
  /* src/core/hunt/damage.js landOn: the share of a blow at a back-row ally a Bodyguard takes */
  piece_bodyguard: 'Bodyguard',
  /* src/core/hunt/reactions.js carry: what a killing blow had past the HP it took, landed on the nearest monster */
  piece_carry: 'Overkill',
  /* src/core/hunt/reactions.js burst: a share of a fallen monster's health on every monster beside it (Hall Fire Wand) */
  piece_burst: 'Explosion',
  /* src/core/hunt/reactions.js reflect: a share of what a ward took, back on its attacker (Drover's Hat) */
  piece_reflect: 'Reflect',
});
