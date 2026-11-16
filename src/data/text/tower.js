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
  sum_keys: 'Every {every}th floor gives you a key. Each of your heroes can earn {keys} keys a week, and higher floors give better keys.',
  sum_chest: 'Use a key on the chest at the Great Hearth. You always get something, and sometimes a tower weapon you can use or trade.',
  sum_xp: 'Alone you get about half the XP you would hunting, and no gold or loot.',
  xp_rule: 'Each kill gives {pct}% of its usual XP.',

  /* The story (LOCKED, Tyler 2026-11-14). */
  story_1: 'The Great Hearth has a chimney, and everybody in Havora calls it the Burning Tower. It goes up a lot farther on the inside than it does on the outside, and nobody\'s found the top.',
  story_2: 'For a few hundred years people brought their dead to the Hearth, and they\'d leave the dead person\'s sword or bow on the ledge, the way you\'d leave flowers. Nobody wanted to sell a dead man\'s sword, and nobody wanted to throw it out either. So the Keepers locked them all in one big chest on the ledge, with a different lock for the better ones, and hung the keys up inside the chimney. One key every ten floors, the good ones higher up, so no hearth-hand would get ideas.',
  story_3: 'Then the fire got into the chimney, and it\'s never gone out. That fire has eaten every bone anybody ever fed the Hearth, and it remembers all of them. Climb up there and it throws them at you, floor after floor. The old Keepers are still on the landings holding the keys, and they don\'t hand them over.',
  story_4: 'Here\'s the good part. It can\'t kill you. It\'s the Hearth\'s own fire, and the Hearth only takes the dead. The second you feel death coming for you, it spits you out. You land on the ledge smelling like smoke, no worse off, and Holly tells you to mind the ash pile.',
  story_5: 'Keeper Rowe says any key you can reach is yours. Harry says he\'s hauled wood to that Hearth for years and never seen anybody carry a stick of it up there, so he\'d like to know what\'s burning.',

  /* The Havora window's Hearth tab: the Tower's second door. */
  havora_line: 'The Burning Tower is up the Hearth\'s chimney.',
  havora_open: 'Burning Tower',

  /* THE CLIMB. */
  best: 'Your best is floor {floor}.',
  best_none: 'You haven\'t climbed yet.',
  start_head: 'Start on floor',
  start_on: 'You start on floor {floor}.',
  start_note: 'You can start on floor {first}, or on the floor after any landing you cleared this week.',
  limits: 'You get {floor} minutes on a floor and {landing} on a landing. If you don\'t clear it in time, the climb ends.',
  week_taken: 'You took {count} keys this week.',
  week_taken_one: 'You took 1 key this week.',
  week_none: 'You haven\'t taken a key this week.',
  week_open: 'The keys on {list} are still yours to take this week.',
  week_next: 'Your next new landing is floor {floor}. It gives a {key}.',
  floor_one: 'floor {list}',
  floor_many: 'floors {list}',
  week_resets: 'A new week of keys starts {when}.',
  run_now: '{name} is climbing. Floor {floor} now.',
  run_ready: '{name} is heading up to floor {floor}.',
  busy_start: 'Heading into the Hearth…',
  started: '{name} went into the Tower.',

  /* Why Enter is off, said before the press; the same words answer the server's refusal. */
  off_hunting: '{name} is out hunting. Come back to town to climb.',
  off_climbing: '{name} is already in the Tower.',
  off_party: 'The Tower is climbed alone for now. Leave your party first.',
  off_pick: 'Pick a floor to start on.',
  bad_floor: 'You can\'t start on that floor this week. Pick one from the list.',

  /* THE CHEST (the design's "one menu that shows all of it"). */
  keys_head: 'Keys',
  chest_lead: 'One chest on the Hearth\'s ledge, and every key opens it. Higher keys hold more.',
  cinders: 'You have {count} Tower Cinders.',
  no_keys: 'You don\'t have a key yet. Every {every}th floor of the Tower gives you one.',
  key_have: '{key}. You have {count}.',
  key_where: 'You have {bag} in your bag and {storage} in Storage.',
  key_base: '{pct} to find a tower weapon.',
  key_warm: 'The Hearth is warm from your last {count} keys, so your chance is {times} times the usual.',
  key_cold: 'The Hearth is cold. Every key that finds no weapon warms it for the next.',
  stoke_head: 'Stoke the fire for good luck.',
  stoke_none: 'None',
  stoke_1: 'Once',
  stoke_word_1: 'once',
  stoke_word_2: 'twice',
  stoke_word_n: '{count} times',
  stoke_2: 'Twice',
  stoke_n: '{count} times',
  stoked: 'Stoking {times} makes it x{mult} and burns {cost} of your {cinders} Cinders.',
  stoke_short: 'Your Cinders don\'t cover that, so the key goes in with as many stokes as they do.',
  stoke_saved: 'Your stokes are saved for every {key}.',
  stoke_off: 'No stokes. Your Cinders go to the Hearth for Inner Flame instead.',
  chance: 'Your chance is {pct}.',
  own: 'Half the time it\'s the type you have equipped. Right now that\'s {family}.',
  own_none: 'You have no weapon on, so every type is as likely.',
  inside: 'You always get {list}.',
  skill_plus: 'A tower weapon adds +{plus} to its combat skill.',
  not_ready: 'This key\'s weapons aren\'t in the chest yet. Keep it, it\'ll open soon.',
  today: 'You used {today} of {max} keys today.',
  busy_open: 'Opening the chest…',
  busy_stoke: 'Saving…',
  opened_weapon: 'The chest gave you a {item}.',
  opened_none: 'No weapon this time.',
  opened_many: '{count} keys used, {weapons} weapons found.',
  haul: 'You got {list}.',

  /* Why Use is off (the screen's own knowledge of the server's numbers; the server still judges). */
  off_out: '{name} is out on a hunt. The chest opens when they\'re back in town.',
  off_no_key: 'You don\'t have this key.',
  off_day: 'You used {max} keys today. The chest opens again tomorrow.',

  /* The weapon families, as a player says them (gear-tiers.js WEAPON_FAMILIES keys; the crush family is "Hammer", Tyler 10-24). */
  family_sword: 'a sword',
  family_warhammer: 'a hammer',
  family_bow: 'a bow',
  family_staff: 'a staff',
  family_wand: 'a wand',
  family_hatchets: 'hatchets',
  family_crossbow: 'a crossbow',

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
