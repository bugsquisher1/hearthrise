// ════════════════════════════════════════════════════════════════════════
// src/data/text/tower.js — THE BURNING TOWER'S AND THE HEARTH CHEST'S WORDS (src/shell/windows/tower.js, tower-chest.js,
// src/shell/tower-words.js, the hunt bar and the end card).
//
// One row per sentence, read by t('tower.<key>'). Tyler's voice (2026-11-09): what happens to the player, short, plain, "you". The
// summary, the card and the chest lines are the designer's drafts (the board's "2026-11-14 The Burning Tower" §5 (c) and §8, and
// "2026-11-15 The Hearth Chest" C5), not through the reader gate. The story is Tyler's, LOCKED (2026-11-14, "I like it for the lore /
// story"): never reword it here. Every number in a row is the server's (the `tower` section, a refusal's or an answer's own figures).
// ════════════════════════════════════════════════════════════════════════

export const TOWER_TEXT = Object.freeze({
  /* The window's two tabs and its one link. */
  tab_climb: 'Climb',
  tab_chest: 'Chest',
  story_link: 'Story',
  story_hide: 'Hide',

  /* What the Tower is, in plain words: the first thing the window shows (Tyler 2026-11-14: "a quick summary"). */
  sum_climb: 'The Tower is a climb. Every floor is one room of monsters, and every floor is harder than the last.',
  sum_hunt: 'Your hero fights it like a hunt, alone for now. It uses your stamina and your supplies.',
  sum_death: 'Dying here costs you nothing. You go back to town and you lose no XP.',
  sum_keys: 'Every {every}th floor gives you a key, and higher floors give better keys.',
  sum_chest: 'Use a key on the chest at the Great Hearth. You always get something, and sometimes a tower weapon you can use or trade.',
  sum_xp: 'Alone you get about half the XP you would hunting, and no gold or loot.',
  xp_rule: 'Kill XP: {pct}% of normal',

  /* The story (LOCKED, Tyler 2026-11-14). */
  story_1: 'The Great Hearth has a chimney, and everybody in Havora calls it the Burning Tower. It goes up a lot farther on the inside than it does on the outside, and nobody\'s found the top.',
  story_2: 'For a few hundred years people brought their dead to the Hearth, and they\'d leave the dead person\'s sword or bow on the ledge, the way you\'d leave flowers. Nobody wanted to sell a dead man\'s sword, and nobody wanted to throw it out either. So the Keepers locked them all in one big chest on the ledge, with a different lock for the better ones, and hung the keys up inside the chimney. One key every ten floors, the good ones higher up, so no hearth-hand would get ideas.',
  story_3: 'Then the fire got into the chimney, and it\'s never gone out. That fire has eaten every bone anybody ever fed the Hearth, and it remembers all of them. Climb up there and it throws them at you, floor after floor. The old Keepers are still on the landings holding the keys, and they don\'t hand them over.',
  story_4: 'Here\'s the good part. It can\'t kill you. It\'s the Hearth\'s own fire, and the Hearth only takes the dead. The second you feel death coming for you, it spits you out. You land on the ledge smelling like smoke, no worse off, and Holly tells you to mind the ash pile.',
  story_5: 'Keeper Rowe says any key you can reach is yours. Harry says he\'s hauled wood to that Hearth for years and never seen anybody carry a stick of it up there, so he\'d like to know what\'s burning.',

  /* The Havora window's Hearth tab: the Tower's second door. */
  havora_line: 'The Burning Tower is up the Hearth\'s chimney.',
  havora_open: 'Burning Tower',

  /* THE CLIMB. Status lines and page facts are labels, the genre's own form (Tyler 2026-11-14: "Recommended: 4+ players" ... "do it
     like that for everything outside of actual lore"); the summary above is the plain-language one he asked for, the story is lore. */
  best: 'Best floor: {floor}',
  best_none: 'Best floor: none yet',
  start_head: 'Start floor',
  start_on: 'Start: floor {floor}',
  start_note: 'Starts: floor {first}, or after a landing you cleared this week',
  limits: 'Time limit: {floor} min per floor, {landing} min per landing',
  week_taken: 'Keys this week: {count}',
  week_open: 'Keys to claim: {list}',
  week_next: 'Next landing: floor {floor}, {key}',
  floor_one: 'floor {list}',
  floor_many: 'floors {list}',
  week_resets: 'Week resets: {when}',
  run_now: 'Climbing: {name}, floor {floor}',
  run_ready: 'Entering: {name}, floor {floor}',
  busy_start: 'Entering…',
  started: '{name} entered the Tower.',

  /* Why Enter is off, said before the press; the same words answer the server's refusal. */
  off_hunting: 'Not available while hunting',
  off_climbing: 'Already climbing',
  off_party: 'Solo only: leave your party',
  off_pick: 'Pick a floor',
  bad_floor: 'Floor not available this week',

  /* THE CHEST (the design's "one menu that shows all of it"). */
  keys_head: 'Keys',
  chest_lead: 'One chest on the Hearth\'s ledge, and every key opens it. Higher keys hold more.',
  cinders: 'Tower Cinders: {count}',
  no_keys: 'No keys held (every {every}th floor gives one)',
  key_have: '{key}: {count}',
  key_where: 'Bag: {bag}, Storage: {storage}',
  key_base: 'Weapon chance: {pct}',
  key_warm: 'Hearth\'s warmth: x{times} ({count} keys without a weapon)',
  key_cold: 'Hearth\'s warmth: none (each key without a weapon adds some)',
  stoke_head: 'Stokes',
  stoke_none: 'None',
  stoke_1: 'Once',
  stoke_word_1: 'once',
  stoke_word_2: 'twice',
  stoke_word_n: '{count} times',
  stoke_2: 'Twice',
  stoke_n: '{count} times',
  stoked: 'Stoked {times}: x{mult} chance, {cost} of your {cinders} Cinders',
  stoke_short: 'Not enough Cinders (fewer stokes are used)',
  stoke_saved: 'Saved for every {key}',
  stoke_off: 'No stokes (Cinders kept for Inner Flame)',
  chance: 'Your chance: {pct}',
  own: 'Equipped type: {family} ({pct} of weapons)',
  own_none: 'Equipped type: none (every type even)',
  inside: 'Always inside: {list}',
  skill_plus: 'Weapon bonus: +{plus} combat skill',
  not_ready: 'Weapons not in the chest yet',
  today: 'Keys used today: {today} / {max}',
  busy_open: 'Opening…',
  busy_stoke: 'Saving…',
  opened_weapon: 'Found: {item}',
  opened_none: 'No weapon',
  opened_many: 'Keys used: {count}, weapons found: {weapons}',
  haul: 'Received: {list}',

  /* KEY FAMILIES (Tyler 2026-11-16): the cap is chests OPENED a week per hero per family, and a family's held keys have a limit. Both
     numbers are the server's (src/session/tower-sections.js familyOf, PROVISIONAL names until lane/c-tower-chest lands them). */
  week_opened: 'Chests opened this week: {count} / {max}',
  keys_held: 'Keys held: {count} / {max}',
  key_family_tower: 'Tower keys',
  key_family_catacomb: 'Catacomb keys',

  /* Why Use is off (the screen's own knowledge of the server's numbers; the server still judges). */
  off_no_key: 'Key not held',
  off_day: 'Daily limit reached ({max})',
  off_week: 'Weekly limit reached ({max})',

  /* The weapon families, as a label names them (gear-tiers.js WEAPON_FAMILIES keys; the crush family is "Hammer", Tyler 10-24). */
  family_sword: 'Sword',
  family_warhammer: 'Hammer',
  family_bow: 'Bow',
  family_staff: 'Staff',
  family_wand: 'Wand',
  family_hatchets: 'Hatchets',
  family_crossbow: 'Crossbow',

  /* THE HUNT BAR during a climb (display only: the live view's floor and the room's clock, replaced by every server answer). */
  bar_floor: 'Floor {floor}',
  bar_keeper: 'Floor {floor}, Keeper',
  bar_left: '{time} left',
  bar_keeper_tip: 'A landing. Beat its Keeper for a {key}.',

  /* THE END CARD of a climb. */
  end_spat: 'The Hearth spat you out on floor {floor}. You lost no XP.',
  end_spat_plain: 'The Hearth spat you out. You lost no XP.',
  end_time: 'You didn\'t clear that floor in time, so the climb ended and you came back to the ledge.',
  again_off: 'You start a climb from the Tower window, at the Great Hearth.',
  end_climbed: 'You climbed from floor {from} to floor {to}.',
  end_no_floor: 'You didn\'t clear a floor this time.',
  end_key: 'You got a {key}. Use it on the chest at the Great Hearth.',
  end_keys: 'You got {list}. Use them on the chest at the Great Hearth.',
  end_open: 'Open chest',
  alert_spat: '{name} was spat out of the Burning Tower. No XP lost.',
});
