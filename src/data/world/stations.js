// ════════════════════════════════════════════════════════════════════════
// src/data/world/stations.js — WHERE PEOPLE STAND, AND WHAT A TAP OPENS.
//
// A town or home map row names its stand tiles by activity kind (`stations:
// { combat, gather, artisan, idle }`, the kinds hr_town_of sends). The local
// hero walks to its own kind's tile after IDLE_TO_STATION_MS without a tap;
// peers stand around their kind's tile (src/world/town-scene.js). A kind a map
// has no tile for stands at STATION_FALLBACK, so a kind this build has never
// heard of still shows up as people.
//
// TAP_OPENS: a placed sprite the player can tap, and the existing screen it
// opens. Exits are not listed: an object standing on a map exit opens that
// exit (a hunt map opens Adventures on its hunt; a town/home map switches the
// scene), so a new hatch is a map row, not a row here.
// Display data only: nothing here is a server number, and no tap sends an
// intent — every action is navigation to a screen that already exists.
// ════════════════════════════════════════════════════════════════════════

export const STATION_FALLBACK = 'idle';

/** A hero left alone this long walks to its activity's station. */
export const IDLE_TO_STATION_MS = 3000;

export const TAP_OPENS = Object.freeze({
  anvil: Object.freeze({ open: 'skill', skill: 'smithing' }),
  woodpile: Object.freeze({ open: 'skill', skill: 'woodcutting' }),
});

/* Until the server derives a look from gear (the W5 presence view's `look`),
   a peer's sprite is picked from these by a hash of their name, so the same
   name always wears the same one. */
export const PEER_LOOKS = Object.freeze(['peer_knight', 'peer_mage', 'peer_ranger']);

/** The sprite that voices the crier feed: its latest line floats over it. */
export const CRIER_SPRITE = 'npc_crier';
