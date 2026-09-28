// src/data/deeds.js — DEEDS OF THE REALM: the thirty long goals the Achievements
// sheet grades. Every row is graded on a count the SERVER keeps (CLAUDE.md §6):
//   tally:<key>     a permanent `stat` row, read through window.HearthriseLifetime
//   skill:highest   the highest server skill level (HearthriseSkillRecord.skillLevelOf)
//   skill:minMelee  the lowest of attack, strength, defense and hitpoints
//   rooms:house     house rooms at rung 1 or more (HearthriseRooms.roomsOf)
//   monster:<id>    the server's lifetime kills of one monster (HearthriseTrophies)
// A goal the realm cannot count is not a deed: lifetime gold earned, buff foods
// eaten and the play streak (a current run that resets) are retired for that.
// `{n}` in a desc is the target; `{monster}` is MONSTERS[id].name. A null target
// is the size of window.ROOMS. Client-only display data: never edge-imported.
// Guarded by tests/deeds.mjs (DEED-1..7).

export const DEED_GROUPS = Object.freeze([
  ['fight', 'Fighting'], ['gather', 'Gathering'], ['bench', 'At the bench'], ['home', 'Home'], ['skills', 'Skills'],
]);

const row = (group, id, name, glyph, source, target, desc, lore) =>
  Object.freeze({ id, group, name, glyph, source, target, desc, lore });

const ANY = 'Reach level {n} in any skill';
const MELEE = 'Train Attack, Strength, Defense and Hitpoints to level {n}';

export const DEEDS = Object.freeze([
  row('fight', 'first_kill', 'First Blood', 'uiSword', 'tally:kills', 1, 'Slay your first monster',
    'Everyone remembers the first one: the shaking hands, the long walk home, and a story that grew taller with every telling'),
  row('fight', 'kill_50', 'Slayer', 'uiSkull', 'tally:kills', 50, 'Slay {n} monsters',
    'The camp has stopped asking how the day went, because the pack you carry home each evening answers the question for you'),
  row('fight', 'kill_250', 'Champion', 'uiShield', 'tally:kills', 250, 'Slay {n} monsters',
    'Farmers along the valley road wave you through now, and a few leave the gate unbarred on the nights they hear you pass'),
  row('fight', 'kill_1000', 'Hero of the Realm', 'uiTrophy', 'tally:kills', 1000, 'Slay {n} monsters',
    'Children play at being you in the lanes and argue over who gets the part, and not one of them will agree to be the monster'),
  row('fight', 'kill_5000', 'Legendary', 'uiCrown', 'tally:kills', 5000, 'Slay {n} monsters',
    'The old hunters no longer tell stories about the beasts of the valley; they tell stories about you, and they tell them carefully'),
  row('fight', 'crit_100', 'Keen Edge', 'uiArrow', 'tally:crits', 100, 'Land {n} critical hits',
    'A clean blow in the right place ends a fight before it has properly begun, and your hands have started finding that place alone'),
  row('fight', 'crit_1000', 'Deadeye', 'uiBow', 'tally:crits', 1000, 'Land {n} critical hits',
    'You no longer look for the gap in the armour; your eye is already there, and the blow is away before you know you chose it'),
  row('fight', 'rare_drop', 'Lucky', 'uiSpark', 'tally:rare_drops', 1, 'Loot your first rare drop',
    'Something rare turned up among the bones and the scraps, and you will spend a long evening turning it over in the lamplight'),
  row('fight', 'rare_25', 'Loot Goblin', 'uiChest', 'tally:rare_drops', 25, 'Loot {n} rare drops',
    'The goblins have begun to speak of you with a sort of professional respect, which is as close as a goblin ever comes to envy'),
  row('fight', 'bounty_1', 'Bounty Hunter', 'navBounty', 'tally:bounty_turnins', 1, 'Turn in your first bounty',
    'The first notice torn from the board, the first purse handed across the counter, and a hunt master who now knows your name'),
  row('fight', 'bounty_50', 'Wanted Poster', 'uiScroll', 'tally:bounty_turnins', 50, 'Turn in {n} bounties',
    'The hunt masters pin the hardest notices where you will see them first, and the other hunters have learned not to argue'),
  row('fight', 'dragon_slayer', 'Dragon Slayer', 'uiFire', 'monster:dragon', 1, 'Slay the {monster}',
    'Somewhere in the hills a hoard has no keeper tonight, and every tavern from here to the coast has a song that is nearly true'),

  row('gather', 'wood_500', 'Lumberjack', 'woodcutting', 'tally:chopped', 500, 'Cut {n} logs',
    'The woodpile by the door became a wall, the wall became a windbreak, and the stove has not once gone cold since it began'),
  row('gather', 'mine_500', 'Quarryman', 'mining', 'tally:mined', 500, 'Mine {n} ore',
    'The hill gives up its ore one stubborn swing at a time, and you have swung enough of them that the hill has started to give'),
  row('gather', 'fish_500', 'Angler', 'fishing', 'tally:fished', 500, 'Catch {n} fish',
    'The river keeps its secrets from most folk, but it has told you a good many of them, one patient cast at a time from the bank'),
  row('gather', 'plant_100', 'Green Thumb', 'farming', 'tally:ev:harvest', 100, 'Harvest {n} crops',
    'Seed, water, wait and pull: a slow rhythm the valley has kept for generations, and one your hands now keep without a thought'),
  row('gather', 'sow_250', 'Sower', 'uiSeed', 'tally:ev:planted', 250, 'Plant {n} crops',
    'Row after row of seed pressed into the dark with a thumb, and the valley has started to look like a quilt of your making'),
  row('gather', 'tool_100', 'Good Tools', 'uiPickaxe', 'tally:tool_doubles', 100, 'Have a good tool double your work {n} times',
    'A well-made tool pays its keeper back in the quiet moments, when the work comes out twice over and nobody but you notices'),

  row('bench', 'cook_100', 'Chef', 'cooking', 'tally:cooked', 100, 'Cook {n} dishes',
    'The whole camp drifts toward your fire at supper, and even the ones who swore they were not hungry find a bowl in their hands'),
  row('bench', 'burnt_50', 'Charcoal Cook', 'uiPot', 'tally:burnt', 50, 'Burn {n} dishes',
    'Smoke in the rafters, a black crust on the pan and a dog that will eat anything; every good cook has a season like this one'),
  row('bench', 'smith_500', 'Anvil-Ringer', 'uiAnvil', 'tally:smithed', 500, 'Finish {n} smithing jobs',
    'The neighbours set their mornings by the sound of your hammer, and the few who once complained have long since given up'),
  row('bench', 'craft_500', 'Steady Hand', 'crafting', 'tally:crafted', 500, 'Finish {n} crafts',
    'Planks, bows, bindings and rings: things you made are in use all over the valley, and most of their owners never knew your name'),

  row('home', 'house_lv1', 'Homebody', 'uiHome', 'rooms:house', 1, 'Build your first house room',
    'Four walls, a roof that mostly keeps the rain out, and a room that is yours; a small thing, and it changes everything after it'),
  row('home', 'house_all', 'Estate Owner', 'uiCastle', 'rooms:house', null, 'Build all {n} house rooms',
    'Kitchen, forge, library and all the rest under one roof, and travellers on the road have started calling it a manor'),

  row('skills', 'lv25_any', 'Apprentice', 'uiXp', 'skill:highest', 25, ANY,
    'You have stopped following instructions and started noticing where the instructions were wrong, which is where it begins'),
  row('skills', 'lv50_any', 'Master', 'uiStar', 'skill:highest', 50, ANY,
    'The work that once took every scrap of your attention now leaves room to think, and those starting out come to you for advice'),
  row('skills', 'lv75_any', 'Grandmaster', 'uiMedal', 'skill:highest', 75, ANY,
    'Few left in the valley can teach you anything about this craft, and the ones who can have started asking you questions instead'),
  row('skills', 'lv99_any', '99 Club', 'uiCrown', 'skill:highest', 99, ANY,
    'There is nothing left in this craft that can surprise you, and the valley will be telling stories about your hands for an age'),
  row('skills', 'all_25', 'Well-Rounded', 'uiTarget', 'skill:minMelee', 25, MELEE,
    'A sword arm, a strong back, a steady guard and a body that can take a blow: a fighter built from all four sides at once'),
  row('skills', 'all_50', 'Combat Master', 'navCombat', 'skill:minMelee', 50, MELEE,
    'Every part of the fight is yours now, the striking, the enduring and the guarding, and the foes of the valley have noticed'),
]);
