// ════════════════════════════════════════════════════════════════════════
// src/data/text/party.js — THE PARTY WINDOW'S XP LINE: what a party of its size earns
// each hero against hunting alone (src/shell/windows/party-roster.js). Party XP reads the
// party's size alone since Tyler 2026-11-21 (S-10 c), so the line counts no classes.
//
// One row per sentence, read by t('party.<key>'). {pct} is the measured answer
// (src/data/party-class-xp.js PARTY_VS_ALONE), never the table's factor. Tyler's voice
// (2026-11-09): a sentence each, no colon joins.
// ════════════════════════════════════════════════════════════════════════

export const PARTY_TEXT = Object.freeze({
  xp_none: 'No extra Level XP in {place}',
  xp_same: 'Level XP each: about the same as solo in {place}',
  xp_more: 'Level XP each: about +{pct}% vs solo in {place}',
  xp_less: 'Level XP each: about -{pct}% vs solo in {place}',
  /* {place} on a harder tier the leader picked: each tier has its own measured line (lane/d-party-pace), so the line names it */
  place_tier: '{place} ({tier})',
  /* An invite by name refused `already_in_party`: the server says it of the hero invited, never of the one inviting
     (hr_party_seat_own; audit 2026-11-15 F16 read "You are already in a party" to a hero in none). A label (Tyler 2026-11-14). */
  invitee_partied: 'Already in a party: {name} (switch to them, press Leave party)',
});
