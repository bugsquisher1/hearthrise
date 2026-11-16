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

  /* What the Tower is: the first rows the Climb tab shows, each a label the server's own rows fill (the mode's pay, the rules). */
  sum_floors: 'Floors: one room each, harder each floor',
  sum_party: 'Party: solo or party',
  sum_death: 'Death penalty: none',
  sum_uses: 'Uses: stamina and supplies',
  sum_loot: 'Gold and loot: none',
  sum_keys: 'Key drop: every {every}th floor',
  sum_chest: 'Keys open: the Hearth Chest',
  xp_rule: 'Kill XP: {pct}%',

  /* The story (LOCKED, Tyler 2026-11-14). */
  story_1: 'The Great Hearth has a chimney, and everybody in Havora calls it the Burning Tower. It goes up a lot farther on the inside than it does on the outside, and nobody\'s found the top.',
  story_2: 'For a few hundred years people brought their dead to the Hearth, and they\'d leave the dead person\'s sword or bow on the ledge, the way you\'d leave flowers. Nobody wanted to sell a dead man\'s sword, and nobody wanted to throw it out either. So the Keepers locked them all in one big chest on the ledge, with a different lock for the better ones, and hung the keys up inside the chimney. One key every ten floors, the good ones higher up, so no hearth-hand would get ideas.',
  story_3: 'Then the fire got into the chimney, and it\'s never gone out. That fire has eaten every bone anybody ever fed the Hearth, and it remembers all of them. Climb up there and it throws them at you, floor after floor. The old Keepers are still on the landings holding the keys, and they don\'t hand them over.',
  story_4: 'Here\'s the good part. It can\'t kill you. It\'s the Hearth\'s own fire, and the Hearth only takes the dead. The second you feel death coming for you, it spits you out. You land on the ledge smelling like smoke, no worse off, and Holly tells you to mind the ash pile.',
  story_5: 'Keeper Rowe says any key you can reach is yours. Harry says he\'s hauled wood to that Hearth for years and never seen anybody carry a stick of it up there, so he\'d like to know what\'s burning.',

  /* The Havora window's Hearth tab: the Tower's second door (a button, no line). */
  havora_open: 'Burning Tower',

  /* THE CLIMB. */
  best: 'Best Floor: {floor}',
  best_none: 'Best Floor: none',
  start_head: 'Start Floor',
  start_floor: 'Floor {floor}',
  start_note: 'Checkpoints: every {every}th floor, up to Best Floor',
  start_note_party: 'Checkpoints: every {every}th floor, up to the party\'s lowest Best Floor',
  limits: 'Time limit: {floor} min per floor, {landing} min per landing',
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

  /* THE CHEST (the design's "one menu that shows all of it"). */
  chest_head: 'Hearth Chest',
  keys_head: 'Keys',
  cinders: '{name}: {count}',
  no_keys: 'Keys: 0',
  key_drop: 'Key drop: every {every}th floor',
  key_have: '{key}: {count}',
  key_bag: 'Bag: {count}',
  key_storage: 'Storage: {count}',
  key_ring: 'Key Ring: {count}',
  key_base: 'Weapon chance: {pct}',
  key_warm: 'Hearth\'s Warmth: x{times}',
  key_cold: 'Hearth\'s Warmth: none',
  stoke_head: 'Stokes',
  stoke_none: 'None',
  stoke_1: 'Once',
  stoke_2: 'Twice',
  stoke_n: '{count} times',
  stoked: 'Stoke cost: {cost} Cinders (x{mult})',
  stoke_short: 'Not enough Cinders',
  stoke_saved: 'Default for {key}',
  stoke_off: 'Stokes: none',
  chance: 'Chance: {pct}',
  own: 'Equipped type ({family}): {pct}',
  own_none: 'Equipped type: none',
  inside: 'Contents: {list}',
  skill_plus: 'Weapon bonus: +{plus} combat skill',
  not_ready: 'Not available yet',
  busy_open: 'Opening…',
  busy_stoke: 'Saving…',
  loot_head: 'Loot',
  opened_many: 'Keys used: {count}',
  loot_item: '{item} x{count}',

  /* KEY FAMILIES (Tyler 2026-11-16): the cap is chests OPENED a week per hero per family, and a family's held keys have a limit. Both
     numbers and the family's name are the server's (src/session/tower-sections.js familyOf, hr_chest_section's families). */
  week_opened: 'Opened this week: {count} / {max}',
  keys_held: 'Keys held: {count} / {max}',
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

  /* THE END CARD of a climb: one label a row. */
  end_spat: 'Spat out: floor {floor}',
  end_spat_plain: 'Spat out',
  end_xp: 'XP lost: none',
  end_time: 'Ended: floor time limit',
  again_off: 'Start: Tower window, Great Hearth',
  end_climbed: 'Floors cleared: {from} to {to}',
  end_no_floor: 'Floors cleared: none',
  end_keys: 'Keys: {list}',
  end_key_count: '{key} x{count}',
  end_withheld: 'Key limit reached: {count} not dropped',
  end_open: 'Open chest',
  alert_spat: '{name}: spat out of the Burning Tower, no XP lost',
});
