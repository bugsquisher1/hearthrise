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
  lost: 'You lost {xp}',
  lost_none: 'You lost no XP',
  town: '{name} is back in town with full HP and mana.',
  /* Said only when the row's level_to is under its level_from. */
  level_dropped: '{name} dropped from level {from} to level {to}.',
  /* No Blessing was held. {free} is free_until while Blessings are free for this hero, else nothing. */
  no_blessing: 'You had no Blessings. They cut what a death costs{free}. Get them in the Shop\'s Services tab.',
  free_until: ' and are free until level {level}',
  /* {count} is how many Blessings the death used up (the row's `blessings`), {xp} what they kept. */
  blessing_kept: { one: 'Your Blessing saved {xp} and is now used up', other: 'Your {count} Blessings saved {xp} and are now used up' },
  blessing_used: { one: 'Your Blessing is used up', other: 'Your {count} Blessings are used up' },
  /* WHAT WOULD HAVE HELPED, at the Level died at (death-popup.js whyWords): advice, one short sentence. A boss room (a call
     or a hall) is one pull, so it never says to pull less. */
  why_in_range: 'Better armor, eating sooner or fewer monsters at once would help.',
  why_in_room: 'Better armor, eating sooner or a healer in your party would help.',
  /* ...for a party that had a Healer (death-popup.js hasHealer): never suggest what it already has */
  why_in_room_healed: 'Better armor, better food or a healer who heals sooner would help.',
  /* {count} Levels under the ground's floor */
  why_under: { one: 'You were {count} level under this hunt. More levels or better armor would help.', other: 'You were {count} levels under this hunt. More levels or better armor would help.' },
});
