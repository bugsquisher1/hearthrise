// ════════════════════════════════════════════════════════════════════════
// src/data/text/wiki.js — THE WIKI'S WORDS (src/shell/windows/wiki.js, from src/shell/wiki-model.js).
//
// One row per sentence or label, read by t('wiki.<key>'). Every number in a row is a placeholder the
// model fills from the data rows and the engine's own constants, so a retuned number never leaves a
// stale sentence behind. The pages themselves are generated: nothing here names a skill, a ground or
// a monster.
// ════════════════════════════════════════════════════════════════════════

export const WIKI_TEXT = Object.freeze({
  /* The search and the three sections. */
  search: 'Search the book',
  tab_skills: 'Skills',
  tab_grounds: 'Hunting grounds',
  tab_formulas: 'Formulas',
  none: 'Nothing in the book matches "{query}".',

  /* A skill's page. */
  trained_by: 'Trained by',
  good_for: 'Good for',
  top_level: 'Highest Level',
  no_cap: 'No cap',
  xp_head: 'XP to reach',
  xp_level: 'Level {level}',
  level_name: 'Level',
  level_trains: 'Earned only from monster kills',
  level_feeds: 'Each Level: more health, harder hunting grounds',

  /* A ground's page. */
  band: 'Levels {lo}–{hi}',
  monsters: 'Monsters',
  monster_line: 'Level {level}',
  monster_boss: 'Level {level} boss',
  drops: 'Notable drops',
  drop_from: 'from the {monster}',
  drop_here: 'from any kill here',
  no_drops: 'Nothing rare drops here yet.',

  /* The formulas. Each page states the rule as labels, then works one example with the engine's own function. A tougher
     monster's own factors are listed by value ({list}, joined with `or`): no page shows a monster's tier. */
  example: 'Worked example',
  or: 'or',
  /* The two hit chances are one rule, your rating against theirs (src/data/to-hit.js, 2026-11-20). */
  hit_name: 'Hit chance',
  hit_words: 'Your attack: {base} + weapon skill Level + accuracy\nAttack at or over the monster\'s evasion: 100% − evasion ÷ (2 × attack)\nAttack under its evasion: attack ÷ (2 × evasion)\nWeakness: +{weak}%\nRange: {min}% to {max}%',
  hit_example: 'Melee {level}, no gear, vs the {monster}, {evasion} evasion: {result}%',
  max_name: 'Max Hit',
  max_words: 'Max Hit: {lvl} × weapon skill Level + {str} × gear strength + {flat}\nMonster defense: −{cut} × defense\nWeakness: +{weak}%\nEach blow: 1 to Max Hit',
  max_example: 'Melee {level}, no gear, vs the {monster}: Max Hit {result}',
  mon_hit_name: 'Monster hit chance',
  mon_hit_words: 'Your defense: {base} + Defense Level + guard\nThe monster\'s aim at or over it: 100% − defense ÷ (2 × aim)\nIts aim under it: aim ÷ (2 × defense)\nRange: {min}% to {max}%',
  mon_hit_example: 'The {monster}, {aim} aim, vs Defense {def}: {result}%',
  mon_max_name: 'Monster Max Hit',
  mon_max_words: 'Monster Max Hit: attack × {scale}\nTougher monsters: attack × {list}',
  mon_max_example: 'The {monster}, {atk} attack: Max Hit {result}',
  /* The two XP tables (Tyler 2026-11-17: an experience table, read like any MMO wiki's). */
  level_curve_name: 'Level XP',
  skill_xp_name: 'Combat skill XP',
  xp_level_col: 'Level',
  xp_skill_col: 'Skill Level',
  xp_next: 'XP to next Level',
  xp_total: 'Total XP',
  skill_uncapped: 'Combat skills: no max Level',
  skill_capped: 'Gathering and crafting: max Level {cap}',
  death_name: 'The cost of a death',
  death_words: 'Death: −{share}% total Level XP, at most {hours} hours of progress at your Level, −{share}% combat skill progress\nBlessings: {cuts}',
  death_cut: '−{pct}% loss with {count}',
  death_example: 'Level {level} ({xp} XP): −{result} XP, −{blessed} with 1 Blessing',
});
