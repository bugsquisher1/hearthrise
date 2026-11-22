// ════════════════════════════════════════════════════════════════════════
// src/shell/setup-words.js — WHEN EVERY SETUP SLOT IS USED, IN WORDS. PURE.
//
// Saving a setup is free (redesign direction 9, 1049-setups-free.sql): every hero holds the whole limit and nothing sells another.
// The count comes from `setup_slots` or hr_setup_locked's answer; nothing here knows the limit.
// ════════════════════════════════════════════════════════════════════════

/** "This hero's 5 setup slots are full. Delete one to save a new setup." */
export function setupFullWords(count) {
  const held = count === 1 ? 'This hero\'s 1 setup slot is full.' : 'This hero\'s ' + count + ' setup slots are full.';
  return held + ' Delete one to save a new setup.';
}
