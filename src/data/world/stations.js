// ════════════════════════════════════════════════════════════════════════
// src/data/world/stations.js — WHERE PEOPLE STAND, AND WHAT A TAP OPENS.
//
// A town or home map row names its stand tiles by activity kind (`stations:
// { combat, gather, artisan, idle }`) for the map lint; the local hero never
// walks to one on its own (Tyler 2026-10-19: it moves only when steered or
// sent). Other players stand where they walked
// (src/world/town-scene.js, from the town presence).
//
// TAP_OPENS: a placed sprite the player can tap, and the existing screen it
// opens. Exits are not listed: an object standing on a map exit opens that
// exit (a hunt map names its hunt and the pane opens Hunts on it; a town/home map switches the
// scene), so a new hatch is a map row, not a row here.
// Display data only: nothing here is a server number, and no tap sends an
// intent — every action is navigation to a screen that already exists.
// ════════════════════════════════════════════════════════════════════════

export const TAP_OPENS = Object.freeze({
  anvil: Object.freeze({ open: 'skill', skill: 'smithing' }),
  woodpile: Object.freeze({ open: 'skill', skill: 'woodcutting' }),
});
