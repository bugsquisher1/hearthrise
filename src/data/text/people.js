// ════════════════════════════════════════════════════════════════════════
// src/data/text/people.js — THE NAMES OF THE PEOPLE A PLAYER MEETS, ONE ROW EACH (the board's "2026-11-14 The Morrow Hills" §4).
//
// A name may change (Tyler 2026-11-14: "for now lets just call him Harry"), so every line that says one reads it from here, and no
// item, place or piece id spells it (src/data/factions.js validateFactions). Renaming a person is one edit.
// ════════════════════════════════════════════════════════════════════════

export const PEOPLE_TEXT = Object.freeze({
  /* The First Flame's hero. A hero joins that side through her. */
  holly: 'Holly',
  /* The Last Ember's quartermaster. A hero joins that side through her. */
  venn: 'Quartermaster Venn',
  /* Holly's teacher, the Keeper at the Great Hearth. Neutral. */
  rowe: 'Rowe',
  /* Venn's cart driver. */
  harry: 'Harry',
});
