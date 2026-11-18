// ════════════════════════════════════════════════════════════════════════
// src/data/text/catacomb.js — THE UNMARKED CATACOMBS' WORDS (the Tower window's Catacombs tab, src/shell/windows/tower-catacombs.js; an armor
// key at the Hearth Chest, src/shell/windows/tower-chest.js; a descent's end and fall words).
//
// One row per label, read by t('catacomb.<key>'). LABELS, NOT SENTENCES (Tyler 2026-11-14, widened; 2026-11-16 on the Tower window:
// "weird AI text"): genre-standard labels and values ("Deepest Room: 23", "Time limit: 3 min per room"), never an explanation and never
// "you". The descent's story is a draft the designer owes Tyler (the board's "2026-11-16 The Unmarked Catacombs descent" §1), so none is
// here. Every number in a row is the server's (the `catacomb` section, a refusal's or an answer's own figures). Words the Tower window
// already says the same way are read from src/data/text/tower.js, never written twice.
// ════════════════════════════════════════════════════════════════════════

export const CATACOMB_TEXT = Object.freeze({
  /* The Tower window's tab (shown only while the server sends the `catacomb` section). */
  tab: 'Catacombs',
  /* the window's band on that tab (Tyler 2026-11-16: "Unmarked Catacombs", no "The") */
  title: 'Unmarked Catacombs',

  /* THE WINGS, picked before Enter (Tyler 2026-11-16): one slot a wing the server lists, its name and the hero's deepest room in it. */
  wings_head: 'Wing',
  /* the wing slot's one line (2026-11-18 phone shots: "Deepest Room: None" wrapped at 922 px): the genre's short label and an empty mark */
  wing_best: 'Deepest: {room}',
  wing_none: 'Deepest: —',

  /* THE COLUMN: label, value (each value the server's: the wing's deepest room, the boards, the mode's pay, the rules). */
  best_head: 'Deepest Room',
  rank_solo: 'Rank',
  rank_party: 'Party Rank',
  descent_head: 'Descent',
  time_value: '{room} min per room',
  door_time: 'Vault door time limit',
  door_time_value: '{room} min',

  /* THE VAULT DOORS, top to bottom (a Keeper Dunn every door_every rooms): the room, the key it gives in this wing, the start picked,
     the next key past the deepest room. A door past the record is dim and no press. */
  doors_head: 'Vault Doors',
  door_room: 'Room {room}',
  entrance: 'Entrance',
  door_start: 'Start {room}',
  door_next: 'Next key',

  /* THE START, on the foot beside Enter: the room after a vault door the server lists for this wing (0: room 1). */
  start_head: 'Start Room',
  start_room: 'Room {room}',
  run_now: 'Descending: {name}, {wing}, room {room}',
  run_ready: 'Entering: {name}, {wing}, room {room}',
  busy_start: 'Entering…',
  started: 'Descent started: {name}',

  /* Why Enter is off, said before the press (the rest are the Tower's: tower.off_hunting, off_leader, off_level, off_checking). */
  off_descending: 'Already descending',
  off_wing: 'Pick a wing',
  off_pick: 'Pick a room',
  off_no_start: 'No start room available',
  bad_room: 'Room not available',

  /* THE KEYS: each family's week (the server's family rows) and the Catacomb keys held, a press opens the chest on one. */
  keys_head: 'Keys',
  open_chest: 'Open chest',

  /* THE PARTY: every other seat's deepest room in the picked wing (the section's party). */
  party_head: 'Party',
  party_room: 'Room {room}',

  /* THE LAST DESCENT, as label rows (the section's `last`). */
  last_head: 'Last Descent',
  last_wing: 'Wing',
  last_rooms: 'Rooms cleared',
  last_rooms_value: '{from} to {to}',
  last_keys: 'Keys',
  last_withheld: 'Key limit reached',
  last_not_dropped: '{count} not dropped',
  last_rank: 'Rank',

  /* AN ARMOR KEY AT THE HEARTH CHEST (2027-05-08-catacombs.sql): its chance, the slot it leans to, and what came out. */
  armor_chance: 'Armor chance: {pct}',
  /* a key whose armor is not in the chest yet (the server's chest_not_ready, `ready` false: Gold and Platinum until their pieces ship) */
  not_ready: 'Armor coming soon',
  helmet_lean: 'Helmets: {pct}',
  slot_helmet: 'Helmet',
  slot_boots: 'Boots',
  weight_heavy: 'Heavy',
  weight_medium: 'Medium',
  weight_light: 'Light',
  armor_found: '{slot}, {weight}',

  /* THE HUNT BAR during a descent (display only: the live view's room and its clock, replaced by every server answer). */
  bar_room: 'Room {room}',
  bar_door: 'Room {room}, Keeper',

  /* A FALL IN THE CATACOMBS (session-modes.js `catacomb`: no death loss): Keeper Dunn carries the hero up, it never "died". */
  fell: '{name} was carried up',
  end_carried: 'Carried up, no XP lost',
  alert_carried: '{name}: carried up out of the Catacombs, no XP lost',
  again_off: 'Start: Catacombs tab, Great Hearth',
});
