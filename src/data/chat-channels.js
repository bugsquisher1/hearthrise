// ════════════════════════════════════════════════════════════════════════
// src/data/chat-channels.js — THE CHAT WINDOW'S TABS, AS DATA.
//
// One row per fixed tab, in the order the window shows them. A whisper is a
// tab per open conversation (WHISPER below), made when one starts.
//   id           the tab id (and the store's key for its lines)
//   label        the tab's word
//   send         the channel KIND hr_chat_send takes (global | local | party),
//                or null for a read-only tab
//   placeholder  the input's words: who you are talking to
//   needs        'party' shows the tab only while the character is in a party;
//                'guild' would show it only once guilds exist — no guild row
//                ships until they do (half-built features stay hidden)
//   unread       false: the tab never shows an unread dot (the combat log
//                streams for as long as a hunt runs)
// The server names the concrete channel (the zone, the party): the client
// never sends one (supabase/migrations/2026-10-25-chat-channels.sql).
// ════════════════════════════════════════════════════════════════════════

export const CHAT_TABS = Object.freeze([
  Object.freeze({ id: 'global', label: 'Global', send: 'global', placeholder: 'Message everyone online…' }),
  Object.freeze({ id: 'local', label: 'Local', send: 'local', placeholder: 'Message everyone here…' }),
  Object.freeze({ id: 'party', label: 'Party', send: 'party', placeholder: 'Message your party…', needs: 'party' }),
  Object.freeze({ id: 'system', label: 'System', send: null, placeholder: 'Server notices, alerts and drops. Nothing to type here.' }),
  Object.freeze({ id: 'combat', label: 'Combat', send: null, placeholder: 'Your hunt’s combat log. Nothing to type here.', unread: false }),
]);

/* A whisper conversation's tab: id 'w:<user id>', the other player's name as the label. */
export const WHISPER = Object.freeze({ prefix: 'w:', placeholder: (name) => 'Message ' + name + '…' });

/* The client mirrors the server's body rules so a refusal is rare, never so it can be skipped. */
export const CHAT_LIMITS = Object.freeze({
  bodyMax: 240,          // hr_chat_body_fault c_max_len
  linksMax: 3,           // hr_chat_body_fault c_max_links
  linesPerTab: 200,      // kept in memory per tab; older lines drop off the top
  whisperTabsMax: 6,     // open conversations; the oldest quiet one closes first
  friendsPollMs: 30000,  // hr_social_state (also the presence stamp, floor 20 s server-side)
  /* Private broadcast topics one client may join for chat at once (src/social/realtime.js): global,
     system and the zone are three, and the account's inbox (its whispers and its party's lines) is the
     fourth; the fifth is slack. Each join is one authorization and one socket subscription on Realtime,
     so the ceiling is a cost bound, not a feature (2026-12-26-chat-broadcast.sql). */
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
