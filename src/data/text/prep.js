// ════════════════════════════════════════════════════════════════════════
// src/data/text/prep.js — THE HUNT PREP WINDOW'S WORDS (src/shell/windows/hunt-prep.js).
//
// One row per sentence or label, read by t('prep.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: the lines shown before the server's setup sections
// arrive (audit 11-09 F5, F11: both are projected, so the window says it is
// reading, never that the server does not keep them).
// ════════════════════════════════════════════════════════════════════════

export const PREP_TEXT = Object.freeze({
  /* Before `hunt_presets` has arrived: the none line. */
  setups_reading: 'Reading your saved setups…',
  /* Before `setup_slots` has arrived: no slot is free until the server says how many, and Save is off. */
  slots_reading: 'Reading your setup slots…',

  /* BEFORE YOU GO, THE BLESSINGS (src/shell/hunt-go.js blessingWords). Every number is the server's Blessings section:
     {on} held of {of}, {pct} the cut they give now, {price} the next one's price, {level} the Level they stop being free at.
     `_free` while the next one costs nothing, `_cost` once it has a price, the bare row if the server hasn't said which. */
  blessings_none: 'You have no Blessings on. They cut the XP you lose when you die. Get them in the Shop\'s Services tab.',
  blessings_none_free: 'You have no Blessings on. They cut the XP you lose when you die, and they\'re free until Level {level}. Get them in the Shop\'s Services tab.',
  blessings_none_cost: 'You have no Blessings on. They cut the XP you lose when you die. The first one costs {price} in the Shop\'s Services tab.',
  blessings_some: 'You have {on} of {of} Blessings on. You lose {pct}% less XP when you die. Get the rest in the Shop\'s Services tab.',
  blessings_some_free: 'You have {on} of {of} Blessings on. You lose {pct}% less XP when you die. The rest are free until Level {level} in the Shop\'s Services tab.',
  blessings_some_cost: 'You have {on} of {of} Blessings on. You lose {pct}% less XP when you die. The next one costs {price} in the Shop\'s Services tab.',
  blessings_all: 'You have all {of} Blessings on. You lose {pct}% less XP when you die.',
});
