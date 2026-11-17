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
  search: 'Search the wiki',
  tab_skills: 'Skills',
  tab_grounds: 'Hunting grounds',
  tab_formulas: 'Formulas',
  none: 'Nothing in the wiki matches "{query}".',

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

  /* The formulas. Each page states the rule in words, then works one example with the engine's own function. */
  example: 'Worked example',
  hit_name: 'Hit chance',
  hit_words: 'Base: {base}%\nWeapon skill Level or accuracy point: +{per}% each\nMonster defense point: −{per}% each\nWeakness: +{weak}%\nRange: {min}% to {max}%',
  hit_tiers: 'Monster defense on tougher tiers: {list}',
  hit_tier: '{pct}% more on tier {tier}',
  hit_example: 'Melee {level}, no gear, vs the {monster}, {def} defense: {result}%',
  max_name: 'Max Hit',
  max_words: 'Max Hit: {lvl} × weapon skill Level + {str} × gear strength + {flat}\nMonster defense: −{cut} × defense\nWeakness: +{weak}%\nEach blow: 1 to Max Hit',
  max_example: 'Melee {level}, no gear, vs the {monster}: Max Hit {result}',
  mon_hit_name: 'Monster hit chance',
  mon_hit_words: 'Base: {base}%\nMonster attack point: +{per}% each\nDefense Level or guard point: −{per}% each\nSome monsters: their own base\nRange: {min}% to {max}%',
  mon_hit_example: 'The {monster}: base {start}%, {atk} attack, vs Defense {def}: {result}%',
  mon_max_name: 'Monster Max Hit',
  mon_max_words: 'Monster Max Hit: attack × {scale}\nTougher monsters: {list}',
  mon_max_tier: '{scale} from tier {tier}',
  mon_max_example: 'The {monster}, with {atk} attack, hits for up to {result}.',
  level_curve_name: 'Level XP',
  level_curve_words: 'Next Level: base + step × Levels past the row + curve × that count²',
  level_from: 'From Level',
  level_base: 'Base',
  level_step: 'Step',
  level_curve: 'Curve',
  level_curve_example: 'Level {level}: {result} XP',
  skill_xp_name: 'Combat skill XP',
  skill_xp_words: 'Next Level from s: {base} × s × s × {growth} to the power s−1\nNo cap: {skills}\nGathering and crafting: max Level {cap}, fixed table',
  skill_xp_example: 'Melee {level}: {result} XP',
  death_name: 'The cost of a death',
  death_words: 'Death: −{share}% total Level XP, −{share}% combat skill progress\nNever below Level 1\nBlessings: {cuts}',
  death_cut: '{pct}% with {count} held',
  death_example: 'Hero with {xp} Level XP loses {result} XP ({blessed} with one Blessing)',
});
