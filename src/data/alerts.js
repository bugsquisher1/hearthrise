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
//            switches to the character, 'join' accepts a party invite,
//            'party' opens the Party window, 'chat' the conversation, 'friends' the Friends window
//   decline  a second button's words (the invite's Decline), or none
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
  /* PARTY_SPEC §1.3: an invite reaches a stranger anywhere in the game, Join / Decline (the server's party_invites). */
  Object.freeze({ id: 'invite', label: 'Party invites', glyph: 'uiPeople', action: 'join', button: 'Join', decline: 'Decline' }),
  /* What another player's move did to this hero (2027-02-18-party-truth.sql party_notices): said no, removed it, closed the party, left. */
  Object.freeze({ id: 'party', label: 'Party news', glyph: 'uiPeople', action: 'party', button: 'Open your party', fadeMs: 30000 }),
  /* A friend's stamina running low, and the leader about to take the party somewhere above this hero's level. */
  Object.freeze({ id: 'partywarn', label: 'Party warnings', glyph: 'uiWarn', action: 'party', button: 'Open your party', fadeMs: 120000 }),
  /* Tamsin paid a tally (2026-12-23-tally-tasks.sql): her gold and her pick, once per payment the server made. */
  Object.freeze({ id: 'tally', label: 'Tamsin pays for a task', glyph: 'navBounty', action: 'bag', button: 'Open your inventory', fadeMs: 30000 }),
  /* The Weighhouse (market design 2026-10-24): a sale, or goods back in Storage, batched per minute (src/shell/market-watch.js). */
  Object.freeze({ id: 'market', label: 'Weighhouse sales', glyph: 'navMarket', action: 'market', button: 'Open the market', fadeMs: 30000 }),
  /* A private message or a friend request came in (src/shell/social-watch.js). A request waits for its answer. */
  Object.freeze({ id: 'whisper', label: 'Private messages', glyph: 'uiChat', action: 'chat', button: 'Read it', fadeMs: 30000 }),
  Object.freeze({ id: 'friend', label: 'Friend requests', glyph: 'navProfile', action: 'friends', button: 'Open Friends' }),
]);

export const ALERT_INDEX = Object.freeze(Object.fromEntries(ALERT_KINDS.map((k) => [k.id, k])));

/** How many alerts the widget keeps on screen at once (newest first). */
export const ALERTS_SHOWN = 4;
