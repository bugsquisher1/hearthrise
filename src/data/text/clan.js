// ════════════════════════════════════════════════════════════════════════
// src/data/text/clan.js — THE CLAN WINDOW, THE FRIEND LINK AND THE PRESENCE STRIP, IN WORDS (lane/c-social, FB-12).
//
// Read by t('clan.<key>') (src/render/player-text.js). Genre labels where a label will do, a sentence only where the screen must say what
// a room is for (S-18 c: on a server of a few accounts, an empty list says what it is for, never only that it is empty). Plain English,
// American spelling, no semicolons, no dashes, no colon-joined clauses (player-text-plain-english). Every number is the server's.
// ════════════════════════════════════════════════════════════════════════

export const CLAN_TEXT = Object.freeze({
  /* ── NO CLAN YET ── */
  none_title: 'Find a clan',
  none_explain: 'A clan is a team for your account. All four of your heroes carry its tag and share its chat tab. Join one below or found your own.',
  invites_head: 'Invites for you',
  invited_by: 'Invited by {name}',
  search_label: 'Search clans',
  search_hint: 'Clan name or tag',
  search_go: 'Search',
  list_head: 'Clans',
  list_empty: 'No clans yet. Found the first one below, and the players who come after you will find it here.',
  list_no_match: 'No clan matches that. Clear the search to see every clan.',
  members: '{n} of {cap} members',
  policy_open: 'Open',
  policy_invite: 'Invite only',
  leader: 'Led by {name}',
  join: 'Join',
  joined: 'You joined {name}.',
  found_head: 'Found a clan',
  found_name: 'Clan name',
  found_tag: 'Tag',
  found_tag_hint: '2 to 4 letters',
  found_open: 'Anyone can join',
  found_go: 'Found for {gold} gold',
  found_done: '{name} is founded. You lead it.',
  /* ── IN A CLAN ── */
  roster_head: 'Members',
  rank_leader: 'Leader',
  rank_officer: 'Officer',
  rank_member: 'Member',
  level: 'Level {level}',
  online: 'Online',
  offline: 'Offline',
  hunting: 'Hunting in {ground}',
  in_town: 'In town',
  only_you: 'Only you so far. Invite a friend by name below, or tell people the clan name so they can find it in the clan list.',
  make_officer: 'Make officer',
  make_member: 'Make member',
  hand_over: 'Make leader',
  remove: 'Remove',
  invite_head: 'Invite',
  invite_hint: 'A hero\'s name',
  invite_go: 'Invite',
  invite_sent: 'Invite sent to {name}.',
  invited_head: 'Invited',
  withdraw: 'Withdraw',
  set_open: 'Let anyone join',
  set_invite: 'Invite only',
  leave: 'Leave clan',
  leave_confirm: 'Leave for good',
  left: 'You left the clan.',
  loading: 'Loading the clan…',
  /* ── THE FRIEND LINK (GR-72), in the Friends window ── */
  link_head: 'Your friend link',
  link_explain: 'A new player who signs up through this link starts with you on their friends list.',
  link_copy: 'Copy link',
  link_copied: 'Link copied',
  /* ── THE PRESENCE STRIP (MM-20), on a ground's page ── */
  strip_count: Object.freeze({ one: '1 other party is hunting {ground}', other: '{count} other parties are hunting {ground}' }),
  strip_none: 'No other party is hunting {ground} right now. When one does, it shows here.',
  strip_party: '{name}, party of {size}',
  strip_tag: '[{tag}] {name}, party of {size}',
  /* ── QUIET PRESENCE (MM-20), in the Friends window ── */
  quiet_label: 'Quiet presence',
  quiet_hint: 'Leave your heroes off every list other players see.',
});
