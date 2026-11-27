// ════════════════════════════════════════════════════════════════════════
// src/data/text/party.js — THE PARTY WINDOW'S CLASS LINE: how many classes the party
// holds and what that pays each hero against hunting alone (src/shell/windows/party-roster.js).
//
// One row per sentence, read by t('party.<key>'). {pct} is the measured answer
// (src/data/party-class-xp.js PARTY_VS_ALONE), never the table's factor. Tyler's voice
// (2026-11-09): a sentence each, no colon joins. Since one pack on Normal for every
// group (Tyler 2026-11-11) a one-class party loses a lot there, so its line says how to
// get more (lane/d-party-xp-cells).
// ════════════════════════════════════════════════════════════════════════

export const PARTY_TEXT = Object.freeze({
  class_have: 'Classes: {have} of {of}',
  class_none: 'No extra Level XP in {place}',
  class_same: 'Level XP each: about the same as solo in {place}',
  class_more: 'Level XP each: about +{pct}% vs solo in {place}',
  class_less: 'Level XP each: about -{pct}% vs solo in {place} · Mix {classes} for more',
  class_less_full: 'Level XP each: about -{pct}% vs solo in {place}',
  /* {place} on a harder tier the leader picked: each tier has its own measured line (lane/d-party-pace), so the line names it */
  /* THE LEADER (designer D-2 section 2.2): the words under a party of the account's own heroes, and its two presses */
  lead_words: 'Leader: {name} (walks in front, picks the hunt)',
  lead_pin: 'Lead',
  lead_unpin: 'Let the front lead',
  lead_pinned: 'The party has a new leader',
  lead_unpinned: 'The hero in front leads again',
  /* An invite by name refused `already_in_party`: the server says it of the hero invited, never of the one inviting
     (hr_party_seat_own; audit 2026-11-15 F16 read "You are already in a party" to a hero in none). A label (Tyler 2026-11-14). */
  invitee_partied: 'Already in a party: {name} (switch to them, press Leave party)',
});
