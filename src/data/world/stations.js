// ════════════════════════════════════════════════════════════════════════
// src/data/world/stations.js — WHERE PEOPLE STAND, AND WHAT A TAP OPENS.
//
// A town or home map row names its stand tiles by activity kind (`stations:
// { combat, gather, artisan, idle }`). The local hero walks to its own kind's
// tile after IDLE_TO_STATION_MS without a tap. A kind a map has no tile for
// stands at STATION_FALLBACK. Other players stand where they walked
// (src/world/town-scene.js, from the town presence).
//
// TAP_OPENS: a placed sprite the player can tap, and the existing screen it
// opens. Exits are not listed: an object standing on a map exit opens that
// exit (a hunt map names its hunt and the pane opens Hunts on it; a town/home map switches the
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
