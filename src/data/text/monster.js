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
  none: 'Select a creature on a hunt\'s page',
  open_hunts: 'Open Hunts',

  /* Under the name. */
  kind: '{family}, Level {level}',
  kind_boss: '{family} boss, Level {level}',

  /* Where it lives. */
  h_homes: 'Where it lives',
  home: 'Levels {lo}–{hi}, {how}',
  how_common: 'common',
  how_uncommon: 'uncommon',
  how_rare: 'rare',
  how_boss: 'boss',
  how_pull: 'only a harder hunt summons it',

  /* In a fight. Each stat is the game's own label and its value, nothing more (Tyler 2026-11-11: "it should just say Max Hit";
     the labels are the approved wiki mock's). A line that explains how the game works
     instead of stating a fact about this monster is cut (Tyler 2026-11-11, on "shared by the heroes who were there"). */
  h_fight: 'In a fight',
  hp: 'Health',
  max_hit: 'Max Hit',
  swing: 'Attack Speed',
  swing_value: '{secs} s',
  deals: 'Damage Type',
  weak: 'Weak to',
  weak_sword: 'Swords: +{pct}% damage, +{acc}% accuracy',
  weak_hammer: 'Hammers: +{pct}% damage, +{acc}% accuracy',
  weak_ranged: 'Bows and crossbows: +{pct}% damage, +{acc}% accuracy',
  weak_magic: 'Magic: +{pct}% damage, +{acc}% accuracy',
  takes: 'Elements',
  takes_all: 'Full damage from every element',
  el_less: '{pct}% less from {element}',
  el_more: '{pct}% more from {element}',
  el_ember: 'Fire',
  el_frost: 'Ice',
  el_poison: 'Poison',
  el_physical: 'Physical',


  /* A kill. */
  h_kill: 'What a kill gives',
  xp: 'Level XP',
  gold: 'Gold',
  gold_value: '{lo} to {hi} gp',
  gold_one: '{lo} gp',

  /* Its drops. */
  h_drops: 'Drops',
  per_kill: 'Chance per kill',
  no_drops: 'No drops',
  band_common: 'Common',
  band_uncommon: 'Uncommon',
  band_scarce: 'Scarce',
  band_rare: 'Rare',
  band_key: 'Key',
  band_trophy: 'Trophy',
  band_always: 'Always',
});
