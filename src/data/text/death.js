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
  /* Said only when the row's level_to is under its level_from. */
  level_dropped: '{name}: Level {from} to Level {to}',
  /* No Blessing was held. {free} is free_until while Blessings are free for this hero, else nothing. */
  no_blessing: 'No Blessings{free}. Shop → Services',
  free_until: ' (free until Level {level})',
  /* {count} is how many Blessings the death used up (the row's `blessings`), {xp} what they kept. */
  blessing_kept: { one: 'Blessing saved {xp}, used up', other: '{count} Blessings saved {xp}, used up' },
  blessing_used: { one: 'Blessing used up', other: '{count} Blessings used up' },
  /* The press to Shop → Services while the hero lacks a Blessing: "Bless again" once this death used them up (QA audit 2026-11-18 A3). */
  bless: 'Blessings',
  bless_again: 'Bless again',
  /* WHAT WOULD HAVE HELPED, at the Level died at (death-popup.js whyWords): advice, kept as short sentences. A boss room (a call
     or a hall) is one pull, so it never says to pull less. */
  why_in_range: 'Tip: better armor, eat sooner, or a smaller pull',
  why_in_room: 'Tip: better armor, eat sooner, or bring a healer',
  /* ...for a party that had a Healer (death-popup.js hasHealer): never suggest what it already has */
  why_in_room_healed: 'Tip: better armor, better food, or heal sooner',
  /* {count} Levels under the ground's floor */
  why_under: { one: '{count} Level under this ground', other: '{count} Levels under this ground' },
  /* ...in a boss room, {count} Levels under the boss's own Level; {boss} as a sentence names him ("the Rat King", "Lord Krell") */
  why_under_boss: { one: '{count} Level under {boss}', other: '{count} Levels under {boss}' },
});
