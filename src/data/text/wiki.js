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
  level_trains: 'Kill monsters on a hunt. Nothing else earns Level XP.',
  level_feeds: 'Your health grows with every Level, and each hunting ground opens at its own Level.',

  /* A ground's page. */
  band: 'Level {lo} to {hi}',
  monsters: 'Monsters',
  monster_line: 'Level {level}',
  monster_boss: 'Level {level} boss',
  drops: 'Notable drops',
  drop_from: 'from the {monster}',
  drop_here: 'from any kill here',
  no_drops: 'Nothing rare drops here yet.',

  /* The formulas. Each page states the rule in words, then works one example with the engine's own function. */
  example: 'Worked example',
  hit_name: 'Your chance to hit',
  hit_words: 'Your chance to land a blow starts at {base}%. Each Level of your weapon skill and each point of accuracy on your gear adds {per}%, and each point of the monster\'s defense takes {per}% away. A weapon the monster is weak to lands {weak}% more often. It never goes below {min}% or above {max}%.',
  hit_tiers: 'On the tougher tiers a monster\'s defense counts for more against your chance to hit, {list}.',
  hit_tier: '{pct}% more on tier {tier}',
  hit_example: 'Melee {level} with no gear against the {monster}, with {def} defense, lands {result}% of its blows.',
  max_name: 'Your max hit',
  max_words: 'Your max hit is {lvl} times your weapon skill Level, plus {str} times the strength on your gear, plus {flat}, rounded down. Then the monster takes {cut} times its defense off it, rounded down. A weapon the monster is weak to hits {weak}% harder. A blow that lands deals anything from 1 up to your max hit.',
  max_example: 'Melee {level} with no gear against the {monster} has a max hit of {result}.',
  mon_hit_name: 'A monster\'s chance to hit you',
  mon_hit_words: 'A monster lands a blow {base}% of the time. Each point of its attack adds {per}%, and each Level of your Defense and each point of guard on your gear takes {per}% away. Some monsters start at a chance of their own instead. It never goes below {min}% or above {max}%.',
  mon_hit_example: 'The {monster} starts at {start}% and has {atk} attack, so it lands {result}% of its blows on a hero with Defense {def}.',
  mon_max_name: 'A monster\'s max hit',
  mon_max_words: 'A monster\'s max hit is its attack times {scale}, rounded down. Tougher monsters use a smaller number, {list}.',
  mon_max_tier: '{scale} from tier {tier}',
  mon_max_example: 'The {monster}, with {atk} attack, hits for up to {result}.',
  level_curve_name: 'Level XP',
  level_curve_words: 'Each row of the table starts at a Level. The next Level from there costs the base, plus the step for each Level past the row\'s start, plus the curve times the square of that count.',
  level_from: 'From Level',
  level_base: 'Base',
  level_step: 'Step',
  level_curve: 'Curve',
  level_curve_example: 'You need {result} XP to reach Level {level}.',
  skill_xp_name: 'Combat skill XP',
  skill_xp_words: 'Going from Level s to the next costs {base} times s times s, times {growth} to the power of one less than s, rounded down. {skills} have no cap. Gathering and crafting skills stop at Level {cap} and use a fixed table.',
  skill_xp_example: 'You need {result} XP to reach Melee {level}.',
  death_name: 'The cost of a death',
  death_words: 'A death takes {share}% of your total Level XP and {share}% of each combat skill\'s progress toward its next Level. It can take a Level, but never below Level 1. Blessings cut that loss by {cuts}.',
  death_cut: '{pct}% with {count} held',
  death_example: 'A hero with {xp} Level XP loses {result} XP, or {blessed} XP with one Blessing held.',
});
