// ════════════════════════════════════════════════════════════════════════
// src/data/text/tower.js — THE BURNING TOWER'S AND THE HEARTH CHEST'S WORDS (src/shell/windows/tower.js, tower-chest.js,
// src/shell/tower-words.js, the hunt bar and the end card).
//
// One row per label, read by t('tower.<key>'). LABELS, NOT SENTENCES (Tyler 2026-11-14, widened; 2026-11-16 on this window: "weird AI
// text"): everything outside the Story is a genre-standard label and value ("Best Floor: 50", "Key drop: every 10th floor", "Opened this
// week: 2 / 6"), never an explanation and never "you". The story is Tyler's, LOCKED (2026-11-14, "I like it for the lore / story"): the
// only sentences here; never reword it. Every number in a row is the server's (the `tower` section, a refusal's or an answer's own figures).
// ════════════════════════════════════════════════════════════════════════

export const TOWER_TEXT = Object.freeze({
  /* The window's two tabs and its one link. */
  tab_climb: 'Climb',
  tab_chest: 'Chest',
  story_link: 'Story',
  story_hide: 'Hide',

  /* THE CLIMB TAB's column: label, value (each value the server's: the mode's pay, the rules, the hero's best). */
  best_head: 'Best Floor',
  /* a record never set (Best Floor, and the Catacombs' Deepest Room): the game's empty mark, never the word None (2026-11-18 review) */
  best_none: '—',
  rank: 'Rank',
  rank_n: '#{rank}',
  /* past the board's depth (the server's `over`, 1,000): the genre's "#1,000+" */
  rank_over: '#{rank}+',
  next_head: 'Next Key',
  climb_head: 'Climb',
  stat_xp: 'Kill XP',
  /* of what (audit 2026-11-18 A5: a bare "37.5%" never said): a kill pays this share of what the same kill pays on a hunt */
  xp_pct: '{pct}% of hunting',
  stat_death: 'Death penalty',
  stat_uses: 'Uses',
  uses_value: 'Stamina, supplies',
  stat_time: 'Time limit',
  time_value: '{floor} min per floor',
  stat_party: 'Party start',
  none: 'None',

  /* THE TOWER DRAWN (src/shell/tower-stage.js): a landing's metal, the picked start, the next key's landing. */
  metal_bronze: 'Bronze',
  metal_silver: 'Silver',
  metal_gold: 'Gold',
  metal_platinum: 'Platinum',
  stage_start: 'Start {floor}',
  stage_next: 'Next key',

  /* The story (LOCKED, Tyler 2026-11-14). Keeper Rowe, not Holly, greets you on the ledge (Tyler 2026-11-16 "Keeper Rowe is cool"; the exact
     words are lane/d-coherence-fixes E row, C8: Holly leads the First Flame and Havora's Hearth is neutral). */
  story_1: 'The Great Hearth has a chimney, and everybody in Havora calls it the Burning Tower. It goes up a lot farther on the inside than it does on the outside, and nobody\'s found the top.',
  story_2: 'For a few hundred years people brought their dead to the Hearth, and they\'d leave the dead person\'s sword or bow on the ledge, the way you\'d leave flowers. Nobody wanted to sell a dead man\'s sword, and nobody wanted to throw it out either. So the Keepers locked them all in one big chest on the ledge, with a different lock for the better ones, and hung the keys up inside the chimney. One key every ten floors, the good ones higher up, so no hearth-hand would get ideas.',
  story_3: 'Then the fire got into the chimney, and it\'s never gone out. That fire has eaten every bone anybody ever fed the Hearth, and it remembers all of them. Climb up there and it throws them at you, floor after floor. The old Keepers are still on the landings holding the keys, and they don\'t hand them over.',
  story_4: 'Here\'s the good part. It can\'t kill you. It\'s the Hearth\'s own fire, and the Hearth only takes the dead. The second you feel death coming for you, it spits you out. You land on the ledge smelling like smoke, no worse off, and Keeper Rowe tells you to mind the ash pile.',
  story_5: 'Keeper Rowe says any key you can reach is yours. Harry says he\'s hauled wood to that Hearth for years and never seen anybody carry a stick of it up there, so he\'d like to know what\'s burning.',

  /* The Havora window's Hearth tab: the Tower's second door (a button, no line). */
  havora_open: 'Burning Tower',

  /* THE CLIMB. */
  start_head: 'Start Floor',
  start_floor: 'Floor {floor}',
  week_resets: 'Week resets: {when}',
  run_now: 'Climbing: {name}, floor {floor}',
  run_ready: 'Entering: {name}, floor {floor}',
  busy_start: 'Entering…',
  started: 'Climb started: {name}',

  /* Why Enter is off, said before the press; the same words answer the server's refusal. */
  off_hunting: 'Not available while hunting',
  off_climbing: 'Already climbing',
  off_leader: 'Party leader only',
  off_party_hunting: 'Party member still hunting',
  off_pick: 'Pick a floor',
  off_no_start: 'No start floor available',
  bad_floor: 'Floor not available',
  /* The door's Level (2027-05-05-entry-gates.sql, Tyler 2026-11-18): the server's own numbers, the hero's and each seat's under it. */
  off_level: 'Requires Level {level}',
  off_checking: 'Checking…',
  seat_level: '{name}: Level {level}',
  refused_seat_level: '{name}: Level {level}, requires {need}',

  /* THE CHEST (the design's "one menu that shows all of it"). */
  keys_head: 'Keys',
  no_keys: 'Keys: 0',
  count: 'x{count}',
  opens_left: 'Opens left',
  held_head: 'Keys held',
  of: '{count} / {max}',
  stoke_head: 'Stoke',
  stoke_none: 'None',
  stoke_x: 'x{count}',
  /* a stoke's price on its button, with its unit (audit 2026-11-18 A5: "150 / 350 / 600" named nothing) */
  stoke_cost: '{cost} Cinders',
  stoke_option: '{label}: {cost} Cinders',
  stoke_short: 'Not enough Cinders',
  chance_head: 'Chance',
  /* a key slot's base weapon chance (QA gate 2026-11-17: a bare "16%" said nothing) */
  weapon_chance: 'Weapon chance: {pct}',
  warm_head: 'Hearth\'s Warmth',
  times: 'x{times}',
  own: 'Equipped type ({family}): {pct}',
  inside: 'Contents: {list}',
  skill_plus: 'Weapon bonus: +{plus} combat skill',
  plus: '+{plus}',
  /* THE SUPER-RARE OUTFIT (the Key Warden, 2027-04-27-tower-chest.sql hr_chest_outfits): its chance on the key's tip, its label in the loot */
  outfit_chance: '{name}: {pct}',
  super_rare: 'Super Rare',
  not_ready: 'Not available yet',
  busy_open: 'Opening…',
  busy_stoke: 'Saving…',
  loot_head: 'Loot',
  opened_many: 'Keys used: {count}',
  loot_item: '{item} x{count}',

  /* KEY FAMILIES (Tyler 2026-11-16): the cap is chests OPENED a week per hero per family, and a family's held keys have a limit. Both
     numbers and the family's name are the server's (src/session/tower-sections.js familyOf, hr_chest_section's families). */
  key_family: '{name} Keys',

  /* Why Use is off (the screen's own knowledge of the server's numbers; the server still judges). */
  off_no_key: 'Key not held',
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
  bar_keeper_tip: 'Keeper: {key}',

  /* THE END CARD of a climb (src/shell/tower-end-card.js, tower-words.js climbEnd): label rows, the run's words on the tower, its presses. */
  end_best: '{floor} (+{plus})',
  end_cleared: 'Floors cleared',
  end_climbed: '{from} to {to}',
  end_spat: 'Spat out',
  end_ended: 'Ended',
  end_time: 'Floor time limit',
  end_member_out: 'Party member spat out',
  end_xp: 'XP lost',
  end_withheld: 'Key limit reached',
  end_not_dropped: '{count} not dropped',
  end_key_count: '{key} x{count}',
  /* the end card's keys: what this climb earned, and the landings each kind came from (Andy 2026-11-19: 18 keys from one climb read as
     keys the chest gave back) */
  end_keys_head: 'Keys earned',
  end_key_floors: 'Floors {from} to {to}',
  end_new_best: 'New Best',
  end_old_best: 'Old best',
  /* the climb's place on the board (the section's last.board): "Rank: #12 (+3)", "Passed: <the best-placed hero it passed>" */
  end_rank_up: '{rank} (+{plus})',
  end_passed: 'Passed',
  end_start: 'Start',
  again_off: 'Start: Tower window, Great Hearth',
  end_open: 'Open chest',
  climb_again: 'Climb again',
  /* "What happened" on a climb's card and in its Just now (death-explain.js words): a Tower fall costs nothing, so it never says "died". */
  fell: '{name} was spat out',
  fell_blow: 'The last blow',
  alert_spat: '{name}: spat out of the Burning Tower · No XP lost',
});
