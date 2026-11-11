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
  how_pull: 'only with a party or a harder hunt',

  /* In a fight. */
  h_fight: 'In a fight',
  on_tier: 'on {tier}, alone or in a party',
  hp: 'Health',
  /* The game's own label for a monster's biggest hit, and its number only (Tyler 2026-11-11: "it should just say Max Hit"). */
  max_hit: 'Max Hit',
  swing: 'It attacks',
  swing_value: 'every {secs} s',
  deals: 'Its damage',
  weak: 'Weak to',
  weak_sword: 'Swords. They deal {pct}% more damage and hit {acc}% more often.',
  weak_hammer: 'Hammers. They deal {pct}% more damage and hit {acc}% more often.',
  weak_ranged: 'Bows and crossbows. They deal {pct}% more damage and hit {acc}% more often.',
  weak_magic: 'Magic. It deals {pct}% more damage and hits {acc}% more often.',
  takes: 'It takes',
  takes_all: 'Full damage from every element',
  el_less: '{pct}% less from {element}',
  el_more: '{pct}% more from {element}',
  el_ember: 'Fire',
  el_frost: 'Ice',
  el_poison: 'Poison',
  el_physical: 'Physical',
  harder: 'A harder hunt changes these numbers. The hunt\'s page says by how much.',

  /* A kill. */
  h_kill: 'What a kill gives',
  pay_shared: 'shared by the heroes who were there',
  xp: 'Level XP',
  gold: 'Gold',
  gold_value: '{lo} to {hi} gp',
  gold_one: '{lo} gp',

  /* Its drops. */
  h_drops: 'Drops',
  per_kill: 'Chance per kill. In a party, each drop goes to one hero.',
  no_drops: 'It drops nothing.',
  band_common: 'Common',
  band_uncommon: 'Uncommon',
  band_scarce: 'Scarce',
  band_rare: 'Rare',
  band_trophy: 'Trophy',
  band_always: 'Always',
});
