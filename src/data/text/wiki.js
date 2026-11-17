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
  none: 'No results for "{query}".',

  /* A skill's page. */
  trained_by: 'How to train',
  good_for: 'What it does',
  top_level: 'Max level',
  no_cap: 'No cap',
  xp_head: 'XP needed',
  xp_level: 'Level {level}',
  level_name: 'Level',
  level_trains: 'Kill monsters. Nothing else gives Level XP.',
  level_feeds: 'More health with every level, so you can take on harder hunts',

  /* A ground's page. */
  band: 'Levels {lo}–{hi}',
  monsters: 'Monsters',
  monster_line: 'Level {level}',
  monster_boss: 'Level {level} boss',
  drops: 'Notable drops',
  drop_from: 'from {monster}',
  drop_here: 'from any monster here',
  no_drops: 'Nothing rare drops here yet.',

  /* The formulas: wiki reference prose, one short sentence a line (the window makes each line a paragraph), then one example
     worked by the engine's own function. hit_tiers is added after hit_words' last line, in the same paragraph. */
  example: 'Example:',
  hit_name: 'Chance to hit',
  hit_words: 'Your chance to hit starts at {base}%.\nEach level of your weapon skill adds {per}%, and so does each point of accuracy on your gear.\nEach point of the monster\'s defense takes {per}% away.\nHitting a monster\'s weakness adds {weak}%.\nYour chance never goes below {min}% or above {max}%.',
  hit_tiers: 'Defense counts for more on stronger monsters ({list}).',
  hit_tier: '+{pct}% at tier {tier}',
  hit_example: 'With Melee {level} and no gear, you have a {result}% chance to hit the {monster} ({def} defense).',
  max_name: 'Max Hit',
  max_words: 'Your Max Hit is {lvl} × your weapon skill level, plus {str} × your gear\'s strength, plus {flat}.\nThe monster\'s defense lowers it by {cut} per point, rounded down.\nHitting a monster\'s weakness adds {weak}%.\nEach hit that lands does anywhere from 1 up to your Max Hit.',
  max_example: 'With Melee {level} and no gear, your Max Hit on the {monster} is {result}.',
  mon_hit_name: 'Monster chance to hit',
  mon_hit_words: 'A monster\'s chance to hit you starts at {base}%.\nEach point of its attack adds {per}%.\nEach level of your Defense takes {per}% away, and so does each guard point on your gear.\nA few monsters start from a different chance.\nIt never goes below {min}% or above {max}%.',
  mon_hit_example: 'The {monster} starts at {start}% and has {atk} attack. Against Defense {def}, it hits you {result}% of the time.',
  mon_max_name: 'Monster Max Hit',
  mon_max_words: 'A monster\'s Max Hit is its attack × {scale}.\nStronger monsters use their own multiplier ({list}).',
  mon_max_tier: '× {scale} at tier {tier}',
  mon_max_example: 'The {monster} has {atk} attack, so its Max Hit is {result}.',
  level_curve_name: 'Level XP',
  level_curve_words: 'Find the row your level falls in.\nThe next level costs that row\'s Base, plus its Step for each level past the row\'s start, plus its Curve × that count squared.',
  level_from: 'From level',
  level_base: 'Base',
  level_step: 'Step',
  level_curve: 'Curve',
  level_curve_example: 'Reaching level {level} takes {result} XP in total.',
  skill_xp_name: 'Combat skill XP',
  skill_xp_words: 'Going from skill level s to the next takes {base} × s × s × {growth} to the power of s−1 XP.\n{skills} have no level cap.\nGathering and crafting skills stop at level {cap} and use a fixed XP table.',
  skill_xp_example: 'Reaching Melee {level} takes {result} XP in total.',
  death_name: 'Death penalty',
  death_words: 'When you die, the hunt ends. You lose {share}% of your total Level XP and {share}% of your progress in each combat skill.\nYou can lose a level this way, but you never drop below level 1.\nBlessings shrink the loss ({cuts}).',
  death_cut: '{pct}% less with {count}',
  death_example: 'A hero with {xp} Level XP loses {result} XP. With one Blessing, they lose {blessed}.',
});
