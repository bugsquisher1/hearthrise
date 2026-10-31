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
//   share    a Share button's words: the rare find's card (src/shell/share-card.js)
//   button   the button's words
//   fadeMs   a line that only says what happened leaves by itself after this long (the panel 2026-10-31: Tamsin's
//            payment was still over the hunt an hour later); one that asks for an answer has none
// ════════════════════════════════════════════════════════════════════════

export const ALERT_KINDS = Object.freeze([
  /* share: a second button that makes the find's card (src/shell/share-card.js), a PNG the player copies or saves. */
  Object.freeze({ id: 'rare', label: 'Rare drops', glyph: 'uiGem', action: 'bag', button: 'Open your inventory', share: 'Share' }),
  Object.freeze({ id: 'death', label: 'Deaths', glyph: 'uiSkull', action: 'show', button: 'See the hunt' }),
  /* Only a hero set to end its hunt on empty can run out (the store pays per use otherwise): show that hunt. */
  Object.freeze({ id: 'low', label: 'Low supplies', glyph: 'uiWarn', action: 'show', button: 'See the hunt', fadeMs: 30000 }),
  Object.freeze({ id: 'ended', label: 'Hunt ended', glyph: 'uiHourglass', action: 'restart', button: 'Start again' }),
  /* "While you were away" on return (src/shell/away-recap.js, designer 2026-10-22): what the hunt did meanwhile. */
  Object.freeze({ id: 'away', label: 'While you were away', glyph: 'uiHourglass', action: 'show', button: 'See the hunt' }),
  /* PARTY_SPEC §1.3: an invite reaches a stranger anywhere in the game, Join / No thanks (the server's party_invites). */
  Object.freeze({ id: 'invite', label: 'Party invites', glyph: 'uiPeople', action: 'join', button: 'Join', decline: 'No thanks' }),
  /* Tamsin paid a tally (2026-12-23-tally-tasks.sql): her gold and her pick, once per payment the server made. */
  Object.freeze({ id: 'tally', label: 'Tamsin pays for a task', glyph: 'navBounty', action: 'bag', button: 'Open your inventory', fadeMs: 30000 }),
]);

export const ALERT_INDEX = Object.freeze(Object.fromEntries(ALERT_KINDS.map((k) => [k.id, k])));

/** How many alerts the widget keeps on screen at once (newest first). */
export const ALERTS_SHOWN = 4;
