// ════════════════════════════════════════════════════════════════════════
// src/data/chat-channels.js — THE CHAT WINDOW'S TABS, AS DATA.
//
// One row per fixed tab, in the order the window shows them. A whisper is a
// tab per open conversation (WHISPER below), made when one starts.
//   id           the tab id (and the store's key for its lines)
//   label        the tab's word
//   send         the channel KIND hr_chat_send takes (global | party | clan),
//                or null for a read-only tab
//   placeholder  the input's words: who you are talking to
//   needs        'party' shows the tab only while the character is in a party;
//                'clan' only while the account is in a clan (the server's answer
//                names the clan's channel: hr_chat_recent's `clan`)
//   unread       false: the tab never shows an unread dot (the combat log
//                streams for as long as a hunt runs)
// The server names the concrete channel (the party, the clan): the client
// never sends one (supabase/migrations/2026-10-25-chat-channels.sql). There is
// no Local tab: hunts are instanced, so 'here' is a party, which has its tab, and
// criers speak in Global (GR-69, Tyler 2026-11-21; 1041-social-clans.sql).
// ════════════════════════════════════════════════════════════════════════

/**
 * One fixed tab of the chat window (the fields above).
 * @typedef {object} ChatTab
 * @property {string} id
 * @property {string} label
 * @property {'global'|'party'|'clan'|null} send
 * @property {string} placeholder
 * @property {'party'|'clan'} [needs]
 * @property {false} [unread]
 */

/** @type {ReadonlyArray<Readonly<ChatTab>>} */
export const CHAT_TABS = Object.freeze([
  Object.freeze({ id: 'global', label: 'Global', send: 'global', placeholder: 'Message everyone online…' }),
  Object.freeze({ id: 'party', label: 'Party', send: 'party', placeholder: 'Message the party…', needs: 'party' }),
  Object.freeze({ id: 'clan', label: 'Clan', send: 'clan', placeholder: 'Message your clan…', needs: 'clan' }),
  Object.freeze({ id: 'system', label: 'System', send: null, placeholder: 'Server notices, alerts and drops' }),
  Object.freeze({ id: 'combat', label: 'Combat', send: null, placeholder: 'Combat log', unread: false }),
]);

/* THE TOWN CRIER's words on the Global tab (src/shell/windows/chat-crier.js). Prices and counts are the server's. */
export const CRIER = Object.freeze({
  label: 'Town Crier',
  mark: 'Crier',
  cry: 'Cry it',
  done: 'No more lines today',
  empty: 'Type the line first',
  note: (q) => 'Goes to everyone online, in gold. ' + q.n + ' of ' + q.perDay + ' today.',
});

/* A whisper conversation's tab: id 'w:<user id>', the other player's name as the label. */
export const WHISPER = Object.freeze({ prefix: 'w:', placeholder: (name) => 'Message ' + name + '…' });

/* The client mirrors the server's body rules so a refusal is rare, never so it can be skipped. */
export const CHAT_LIMITS = Object.freeze({
  bodyMax: 240,          // hr_chat_body_fault c_max_len
  linksMax: 3,           // hr_chat_body_fault c_max_links
  linesPerTab: 200,      // kept in memory per tab; older lines drop off the top
  whisperTabsMax: 6,     // open conversations; the oldest quiet one closes first
  friendsPollMs: 30000,  // hr_social_state (also the presence stamp, floor 20 s server-side)
  /* A hidden page's slower poll, only the stamp that keeps the account online for its friends (SocialSession.setAway). The server
     reads "online" as seen inside 75 s (hr_social_state c_online), and a browser may hold a hidden page's timer to once a minute:
     under 60 s so that minute's firing still asks, whichever cadence the page gets. */
  friendsPollAwayMs: 55000,
  /* Private broadcast topics one client may join for chat at once (src/social/realtime.js): global and
     system are two, and the account's inbox (its whispers, its party's lines and its clan's lines) is the
     third; the rest is slack. Each join is one authorization and one socket subscription on Realtime,
     so the ceiling is a cost bound, not a feature (2026-12-26-chat-broadcast.sql, 1041-social-clans.sql). */
  realtimeBindingsMax: 5,
  /* After a topic (re)joins, the history is re-read this long later, once for the whole burst of joins,
     to add the lines the socket missed while it was down. */
  catchUpMs: 250,
});

/* THE WORLD'S NOTICES: lines only the SERVER writes, never a player (Tyler's "super-rare drop moments": a
   broadcast). One row per kind; supabase/migrations/2026-11-24-rare-broadcast.sql seeds hr_world_notice_rules
   from it and tests/chat-social.mjs RB-1 holds the two equal.
     channel             the chat channel a notice is written to (System: no player can write it)
     perCharacterPerDay  notices one character may post per UTC day; a streak past it is journalled, not posted */
export const WORLD_NOTICES = Object.freeze({
  rare_drop: Object.freeze({ channel: 'system', perCharacterPerDay: 3 }),
});

/* ONE GLOBAL FOR THE WHOLE SERVER, IN SMALL BATCHES WITH A SLOW MODE WHEN CROWDED (Tyler 2026-11-20, 28-6, and 2026-11-21, 31-1).
   tools/gen-social-catalogue.mjs writes the server's rows from these (hr_chat_global_rule, hr_chat_slow_mode; --check holds them equal).
   GLOBAL_BATCH  the server sends Global's new lines to everyone listening once every `everyS` seconds, as one message, never one a line:
                 a line is sent once it is `settleS` old (so a send still committing is not skipped), at most `maxLines` a batch. The
                 sender sees its own line at once, from its send's answer. JUDGMENT: a few seconds is chat, and one message a batch is the
                 whole of the bill (31-1: "it costs nothing extra").
   SLOW_MODE     how long one account waits between Global lines, by how many lines the whole room sent in the last minute: the
                 busiest row at or under the room's rate applies; under the first row only the send limit holds. JUDGMENT, the
                 playtest reads it: a room of a few is never slowed, a crowded one tightens as it grows. */
export const GLOBAL_BATCH = Object.freeze({ everyS: 5, settleS: 2, maxLines: 100 });
export const SLOW_MODE = Object.freeze([
  Object.freeze({ linesPerMin: 12, gapS: 10 }),
  Object.freeze({ linesPerMin: 30, gapS: 30 }),
  Object.freeze({ linesPerMin: 60, gapS: 60 }),
]);

/* THE FRIEND LINK AT SIGN-UP (GR-72; 1044-friend-link.sql): an account this many hours old or newer may arrive by a friend's link, once. */
export const FRIEND_LINK = Object.freeze({ newAccountHours: 24 });

/* THE WORDS A SLOW MODE REFUSAL READS (the server's `wait_s`). */
export const SLOW_MODE_WORDS = Object.freeze({
  wait: (s) => 'Global is busy. You can send again in ' + s + (s === 1 ? ' second.' : ' seconds.'),
});
