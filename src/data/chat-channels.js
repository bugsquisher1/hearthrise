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
});

/* The words for a refusal the server sends back, in plain English. */
export const CHAT_REFUSALS = Object.freeze({
  empty: 'Type something first.',
  too_long: 'That message is too long.',
  too_many_links: 'Link at most three items in one message.',
  bad_link: 'One of those item links is not a real item.',
  rate_limited: 'Slow down a little, then try again.',
  no_party: 'You are not in a party.',
  no_character: 'Pick a character first.',
  no_player: 'No player by that name.',
  self: 'That is you.',
  unavailable: 'You cannot message that player.',
  already_friends: 'You are already friends.',
  too_many: 'Your list is full.',
  no_request: 'That request has gone.',
});
