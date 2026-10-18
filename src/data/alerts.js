// ════════════════════════════════════════════════════════════════════════
// src/data/alerts.js — THE STARTER ALERTS (QoL 7, Tyler 10-18).
//
// Display data only. An alert is one line saying what happened to one of the
// account's characters plus ONE button for the next action, so a player
// running four characters never has to go looking (first principle: never
// make the player repeat a check the game can make). Which kinds a character
// shows is display-only residue (`alerts.off`, src/session/residue.js); an
// alert gates and spends nothing.
//
//   id       stable id; the residue's `off` list names it
//   label    the toggle's words in the command center
//   glyph    a window.HR_GLYPHS key
//   action   what the button does (src/shell/alerts.js NEXT): 'bag' opens the
//            bag, 'shop' the shop, 'restart' sends the restart intent, 'show'
//            switches to the character
//   button   the button's words
//
// LOW_SUPPLY_PCT: a restock target counts as low below this share of it
// (designer value; ASSUMED until the Sewer's measured burn rates).
// ════════════════════════════════════════════════════════════════════════

export const ALERT_KINDS = Object.freeze([
  Object.freeze({ id: 'rare', label: 'Rare drops', glyph: 'uiGem', action: 'bag', button: 'Open the bag' }),
  Object.freeze({ id: 'fall', label: 'Knocked out', glyph: 'uiSkull', action: 'show', button: 'See the hunt' }),
  Object.freeze({ id: 'low', label: 'Low supplies', glyph: 'uiWarn', action: 'shop', button: 'Buy supplies' }),
  Object.freeze({ id: 'ended', label: 'Hunt ended', glyph: 'uiHourglass', action: 'restart', button: 'Start again' }),
]);

export const ALERT_INDEX = Object.freeze(Object.fromEntries(ALERT_KINDS.map((k) => [k.id, k])));

/** A restock target is low below this percentage of itself. */
export const LOW_SUPPLY_PCT = 20;

/** How many alerts the widget keeps on screen at once (newest first). */
export const ALERTS_SHOWN = 4;
