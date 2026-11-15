// ════════════════════════════════════════════════════════════════════════
// src/data/text/death.js — THE DEATH POPUP'S WORDS: the Level a death took and
// what the Blessings kept (src/shell/death-popup.js).
//
// One row per sentence, read by t('death.<key>'). Every number is the server's
// death row (hr_death_log_view): a death costs a share of the total Level XP
// and can take a Level (Tyler 2026-11-09, 2027-03-25-death-share.sql).
// ════════════════════════════════════════════════════════════════════════

export const DEATH_TEXT = Object.freeze({
  /* The popup's head and lines (src/shell/death-popup.js deathWords). {xp} "1,200 Level XP and 40 Melee XP". */
  title: '{name} died',
  title_in: '{name} died in {ground}',
  killed: 'Killed by {monster}',
  lost: 'Death cost: {xp}',
  lost_none: 'Death cost: no XP',
  town: '{name}: back in town, full HP and mana',
  /* why: advice, kept as short sentences */
  under: { one: '{count} Level under this ground', other: '{count} Levels under this ground' },
  tip_under: 'Better armor, eating sooner, a healer or more Levels would help.',
  tip: 'Better armor, eating sooner or a smaller pull would help.',
  /* Said only when the row's level_to is under its level_from. */
  level_dropped: '{name}: Level {from} to Level {to}',
  /* No Blessing was held. {free} is free_until while Blessings are free for this hero, else nothing. */
  no_blessing: 'No Blessings (they cut death loss, Shop, Services tab{free})',
  free_until: ', free until Level {level}',
  /* {count} is how many Blessings the death used up (the row's `blessings`), {xp} what they kept. */
  blessing_kept: { one: 'Blessing saved {xp} (used up)', other: '{count} Blessings saved {xp} (used up)' },
  blessing_used: { one: 'Blessing used up', other: '{count} Blessings used up' },
});
