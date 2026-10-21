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
//            bag, 'restart' sends the restart intent, 'show'
//            switches to the character, 'join' accepts a party invite
//   decline  a second button's words (the invite's No thanks), or none
//   button   the button's words
// ════════════════════════════════════════════════════════════════════════

export const ALERT_KINDS = Object.freeze([
  Object.freeze({ id: 'rare', label: 'Rare drops', glyph: 'uiGem', action: 'bag', button: 'Open your inventory' }),
  Object.freeze({ id: 'death', label: 'Deaths', glyph: 'uiSkull', action: 'show', button: 'See the hunt' }),
  /* Only a hero set to end its hunt on empty can run out (the store pays per use otherwise): show that hunt. */
  Object.freeze({ id: 'low', label: 'Low supplies', glyph: 'uiWarn', action: 'show', button: 'See the hunt' }),
  Object.freeze({ id: 'ended', label: 'Hunt ended', glyph: 'uiHourglass', action: 'restart', button: 'Start again' }),
  /* PARTY_SPEC §1.3: an invite reaches a stranger anywhere in the game, Join / No thanks (the server's party_invites). */
  Object.freeze({ id: 'invite', label: 'Party invites', glyph: 'uiPeople', action: 'join', button: 'Join', decline: 'No thanks' }),
]);

export const ALERT_INDEX = Object.freeze(Object.fromEntries(ALERT_KINDS.map((k) => [k.id, k])));

/** How many alerts the widget keeps on screen at once (newest first). */
export const ALERTS_SHOWN = 4;
