// ════════════════════════════════════════════════════════════════════════
// src/data/text/coach.js — THE COACH'S WORDS (src/data/hunt-tutorial.js).
//
// One row per card line, read by t('coach.<key>') (src/render/player-text.js).
// A card is a short title and a line or two of plain English that says what
// happened and what to press (Tyler 2026-11-16, the natural RPG voice: "Tamsin
// pays for Giant Rats. Hunt some in the Mill Cellar."). A path ("Shop →
// Services") is fine when it is the press. {label} is Tamsin's task monster as
// her board counts it, {count} its kills, {ground} and {next} are hunting
// grounds, {level} the Level that opens {next}, {slot} a bar slot ("slot 4");
// goal_* rows are the What next line's goals.
// ════════════════════════════════════════════════════════════════════════

export const COACH_TEXT = Object.freeze({
  /* every card's two presses (Tyler 2026-11-11: no tip is mandatory): Got it closes this one, Don't show tips hides them all */
  got_it: 'Got it',
  no_tips: 'Don\'t show tips',
  /* Tamsin's rats, the first ten minutes (designer 2026-11-10) */
  tamsins_rats_title: 'Tamsin\'s rats',
  tamsins_rats: 'Tamsin pays for {label}. Take her task, then hunt some in the {ground}.',
  tamsins_rats_in: 'Press Take on the {label}. Kill {count} and she pays you gold and a helmet.',
  rats_count_title: 'Tamsin\'s count',
  rats_count: 'Kill {count} {label} for Tamsin. The tally on screen keeps count.',
  tamsin_owes_title: 'Tamsin owes you',
  tamsin_owes: 'That\'s all {count}. Leave the hunt and collect your pay from Tamsin in town.',
  back_down_title: 'Back to the {ground}',
  back_down: 'Head back to the {ground} until you reach level {level}. Open Hunts, pick it and press Enter.',
  back_down_in: 'Press the {ground}, then Enter. You don\'t have to watch. Your hero keeps hunting with the game closed.',
  keep_hunting: 'You don\'t have to watch. Your hero keeps hunting with the game closed. At level {level} you\'re ready for the {next}.',
  brook: 'Keep hunting here until level {level}. Then you\'re ready for the {next}.',
  /* Tamsin's wolves */
  tamsins_task: 'Tamsin pays for {count} {label}. Open her tally and take the task.',
  tamsins_task_in: 'Pick {weight} armor for your reward, then press Take on the {label}.',
  tamsins_task_in_any: 'Pick an armor weight for your reward, then press Take on the {label}.',
  tamsin_pays: 'Kill {count} {label}. Tamsin pays you {gold} gp and a piece of armor back in town.',
  /* the cards a builder states from the facts (hunt-tutorial.js SAY) */
  styles: 'There are no classes. Your weapon decides how you fight, and you can swap it any time in town.',
  styles_in: 'Press a weapon in your bag, then Equip.',
  load_shot: 'Your weapon has nothing to shoot. Open your bag, press {shot}, then Put on the bar.',
  load_shot_in: 'Press {shot}, then Put on the bar. Your hero shoots them from then on.',
  bar_intro: 'Your hero uses this bar by itself. Press a slot to change what it does.',
  why_waits: 'Press {slot} to change when it fires. Until then your hero fights on without it.',
  spell_runes: 'The spell in {slot} has no runes. Press it, pick {rune} and Save.',
  food_when: 'The food in {slot} eats below an HP you set. Press it and use − or + to pick when your hero eats.',
  food_when_to: 'Eat at {pct}% HP and none of the healing goes to waste. Press {slot} and set it there.',
  food_order_lower: 'Store food in {slot} eats before your own. Press it and lower it to {pct}% HP.',
  food_order_later: 'Store food in {slot} eats before your own. Press it and move it after {own} with Later.',
  food_order_both: 'Store food in {slot} eats before your own. Press it, lower it to {pct}% HP, then press Later.',
  first_spell: 'Your bar has no spell that uses runes yet. Press {slot}, open {tab}, then pick {spell} and {rune}.',
  leave_cellar: 'Leave the hunt to go back to town. Your loot is already in your bag.',
  more_heroes: 'You can play more than one hero at once. Press Characters, then Create hero.',
  leave_party: 'Leaving can take your whole party home. Tell them first, then leave the hunt.',
  bless: 'Past the Mill Cellar you can die. Blessings cut what a death costs, so bless all {n} in the Shop\'s Services tab.',
  first_eat: 'Your hero ate {item} to heal. Cook more before it runs out.',
  first_drink_store: 'Store drinks cost gold. Grow turnips and you can cook your own juice for free.',
  first_drink_own: 'Your hero drank {item}. Make more before it runs out.',
  party_own: 'Your heroes can hunt together. Right-click {name}\'s tab and choose Invite to party.',
  fuel_hearth: 'Burning {fuel} in the Great Hearth raises your Inner Flame. Open your bag, press {fuel}, then Fuel all.',
  fuel_hearth_in: 'Press {fuel}, then Fuel all. Your hero walks to the Hearth and burns them.',
  harvest_ready: 'Harvest them on the Farm, then cook them into Turnip Juice.',
  harvest_cook: 'Cook your turnips into juice. Open Gathering and crafting, press Cooking, then {recipe}.',
  juice_slot: 'Your own {item} is free. Put it in an empty slot on your bar.',
  juice_slot_before: 'Your own {item} is free. Put it in a slot before the store juice in {slot}.',
  club_make: 'Your club can be reforged into a much better one. Open Gathering and crafting, press Smithing, then {recipe}.',
  club_equip: '{club} is in your bag. Press it, then Equip.',
  home_gather: 'Your first house needs {qty} {item}. You have {have}.',
  home_buy: 'You have everything for the {deed}. Open the House and press Buy.',
  purse_goal: 'Your gold can buy another hero, or a deed for your House.',
  /* WHAT NEXT: one goal a line (hunt-tutorial.js nextGoal) */
  goal_armor: 'Your Defense isn\'t training. Buy gloves or a belt in the Shop.',
  goal_free_hero: 'You have a free hero slot. Create your {nth} hero in Characters.',
  goal_slot: 'You can buy a {nth} hero slot for {gold}.',
  goal_top_up: 'Stamina is almost out. Press + to buy {hours} more hours for {gold}.',
  goal_step_up: 'Next challenge: {ground} (level {level}+)',
  goal_harvest: 'Crops ready: {crops}. Harvest them on the Farm (J).',
  goal_tally: 'Tamsin has work for you. Take a task on her tally (Q).',
  goal_deed: 'You can afford the {deed}. Buy it in the House.',
  goal_temper: 'The smith can temper your {piece} for {gold}. Find it in the Shop\'s Services tab.',
  goal_saving: 'Save up for a {nth} hero slot ({gold}).',
  goal_party: '{ground} is at your level. Find a party to hunt it.',
  goal_party_how: 'Invite a friend, or create a second hero to party with.',
  goal_party_how_own: 'Right-click your other hero\'s tab and choose Invite to party.',
  goal_gear: 'Next upgrade at level {level}: {gear}',
  goal_gear_made: 'Next upgrade at level {level}: {gear} (made with {skill})',
  goal_gear_made_at: 'Next upgrade at level {level}: {gear} (requires {skill} {req})',
  goal_ground: 'Next hunting ground: {ground} (level {level}+)',
  goal_ground_party: 'Next hunting ground: {ground} (level {level}+, bring a party)',
  goal_plant: 'Nothing is growing. Plant some seeds on the Farm (J).',
  goal_skill: 'At {skill} {level} you unlock {unlock}.',
});
