// ════════════════════════════════════════════════════════════════════════
// src/data/text/monster.js — THE MONSTER PAGE'S WORDS: one creature's facts, read like a page of an
// encyclopedia (src/shell/windows/monster.js, from src/shell/monster-facts.js).
//
// One row per sentence or label, read by t('monster.<key>'). Every number in a row is a placeholder the
// page fills from the data rows. weak_<weapon>, el_<element>, band_<band> and how_<how> are picked by
// the row's own value, so a new weapon, element, band or share needs its row here.
// ════════════════════════════════════════════════════════════════════════

export const MONSTER_TEXT = Object.freeze({
  /* A page with nothing picked. */
  none: 'Pick a creature on a hunt\'s page to read about it.',
  open_hunts: 'Open Hunts',

  /* Under the name. */
  kind: '{family} · Level {level}',
  kind_boss: '{family} · Level {level} · Boss',

  /* Where it lives. */
  h_homes: 'Where it lives',
  home: 'Level {lo} to {hi} · {how}',
  how_common: 'common',
  how_uncommon: 'uncommon',
  how_rare: 'rare',
  how_boss: 'boss',
  how_pull: 'only a harder hunt summons it',

  /* In a fight. Each stat is the game's own label and its value, nothing more (Tyler 2026-11-11: "it should just say Max Hit";
     the labels are the approved wiki mock's). Tier names the tier the numbers are for. A line that explains how the game works
     instead of stating a fact about this monster is cut (Tyler 2026-11-11, on "shared by the heroes who were there"). */
  h_fight: 'In a fight',
  tier: 'Tier',
  hp: 'Health',
  max_hit: 'Max Hit',
  swing: 'Attack Speed',
  swing_value: '{secs} s',
  deals: 'Damage Type',
  weak: 'Weak to',
  weak_sword: 'Swords. They deal {pct}% more damage and hit {acc}% more often.',
  weak_hammer: 'Hammers. They deal {pct}% more damage and hit {acc}% more often.',
  weak_ranged: 'Bows and crossbows. They deal {pct}% more damage and hit {acc}% more often.',
  weak_magic: 'Magic. It deals {pct}% more damage and hits {acc}% more often.',
  takes: 'Elements',
  takes_all: 'Full damage from every element',
  el_less: '{pct}% less from {element}',
  el_more: '{pct}% more from {element}',
  el_ember: 'Fire',
  el_frost: 'Ice',
  el_poison: 'Poison',
  el_physical: 'Physical',
  /* What each harder tier does to it, on the ground its page was opened from (Tyler 2026-11-11: "cant this just say 'difficulty
     increases by x% on dangerous/deadly'"). The numbers are that ground's own dials (hunt-tiers.js GROUND_TIERS), the ones the
     engine fights with: {hp} is the Health dial in percent more, {hits} is hits_pct or, from twice as hard up, hits_times. */
  tier_both: 'On {tier} it has {hp}% more Health and hits {hits}.',
  tier_hits: 'On {tier} it hits {hits}.',
  tier_hp: 'On {tier} it has {hp}% more Health.',
  hits_pct: '{pct}% harder',
  hits_times: '{times} times as hard',

  /* A kill. */
  h_kill: 'What a kill gives',
  xp: 'Level XP',
  gold: 'Gold',
  gold_value: '{lo} to {hi} gp',
  gold_one: '{lo} gp',

  /* Its drops. */
  h_drops: 'Drops',
  per_kill: 'Chance per kill',
  no_drops: 'It drops nothing.',
  band_common: 'Common',
  band_uncommon: 'Uncommon',
  band_scarce: 'Scarce',
  band_rare: 'Rare',
  band_trophy: 'Trophy',
  band_always: 'Always',
});
