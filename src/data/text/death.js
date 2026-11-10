// ════════════════════════════════════════════════════════════════════════
// src/data/text/death.js — THE DEATH POPUP'S WORDS: the Level a death took and
// what the Blessings kept (src/shell/death-popup.js).
//
// One row per sentence, read by t('death.<key>'). Every number is the server's
// death row (hr_death_log_view): a death costs a share of the total Level XP
// and can take a Level (Tyler 2026-11-09, 2027-03-25-death-share.sql).
// ════════════════════════════════════════════════════════════════════════

export const DEATH_TEXT = Object.freeze({
  /* Said only when the row's level_to is under its level_from. */
  level_dropped: '{name} dropped from Level {from} to Level {to}.',
  /* No Blessing was held. {free} is free_until while Blessings are free for this hero, else nothing. */
  no_blessing: 'You had no Blessing. Blessings in the Shop\'s Services tab make dying cost less{free}.',
  free_until: ', and they\'re free until Level {level}',
  /* {count} is how many Blessings the death used up (the row's `blessings`), {xp} what they kept. */
  blessing_kept: { one: 'Your Blessing saved you {xp}. It\'s used up now.', other: 'Your {count} Blessings saved you {xp}. They\'re used up now.' },
  blessing_used: { one: 'Your Blessing is now used up.', other: 'Your {count} Blessings are now used up.' },
});
