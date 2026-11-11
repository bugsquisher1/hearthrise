// ════════════════════════════════════════════════════════════════════════
// src/data/text/work.js — THE GATHERING AND CRAFTING WINDOW'S WORDS (src/shell/windows/work.js).
//
// One row per sentence or label, read by t('work.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: the Sort menu over a crafting station's recipes
// (src/shell/station-sort.js; Andy, Discord 2026-11-11).
// ════════════════════════════════════════════════════════════════════════

export const WORK_TEXT = Object.freeze({
  /* The menu's label, and its three orders: what the bag can make first (the default), the required level low to high, the name A to Z. */
  sort_can: 'Can make',
  sort_level: 'Level',
  sort_name: 'Name',
});
