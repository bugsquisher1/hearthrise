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
  class_have: 'Your party has {have} of {of} classes.',
  class_none: 'You get no extra Level XP in {place}.',
  class_same: 'Each of you gets about the same Level XP as hunting alone in {place}.',
  class_more: 'Each of you gets about {pct}% more Level XP than hunting alone in {place}.',
  class_less: 'Each of you gets about {pct}% less Level XP than hunting alone in {place}. Mix {classes} to get more.',
});
