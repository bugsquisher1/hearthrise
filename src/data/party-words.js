// ════════════════════════════════════════════════════════════════════════
// src/data/party-words.js — WHAT A PARTY SAYS HAPPENED, IN PLAIN WORDS (blind three-friends panel 2026-11-01).
//
// Display data only, for the client (never imported by the engine). The server decides and records every one of
// these: the notices are its `party_notices` section (2027-02-18-party-truth.sql), a friend's end reason its hr_hunt_view
// `end_by_why`, a friend's low stamina its party view's `stamina_low_ms`. Nothing here gates or spends anything.
// PURE ESM.
// ════════════════════════════════════════════════════════════════════════
import { END_REASON_COPY } from './hunt-sessions.js?v=0.2.127';

/* A notice's line: {who} the other player's hero, {name} this hero, {ground} the ground a warning names ("Mosslight Glade, Level 16 and up"). */
export const PARTY_NOTICE_WORDS = Object.freeze({
  declined: '{who} said no to your party invite.',
  removed: '{who} removed {name} from the party.',
  disbanded: '{who} closed the party.',
  left: '{who} left the party.',
  dropped: '{who} was away too long and lost their party seat.',
  ground_warn: '{who} wants to take the party to {ground}, above {name}’s level. It will hit hard, and {name} could die. Leave the party to stay out.',
});

/* Why a friend's own end sent this hero home (`end_by_why`, an END_ORDER name). "left" and an unknown name keep the plain line. */
const CAME_HOME_BECAUSE = Object.freeze({
  stamina: '{member} ran out of stamina, so {name} came home too.',
  gold_out: '{member} ran out of gold for supplies, so {name} came home too.',
  heals_out: '{member} ran out of healing food, so {name} came home too.',
  ammo_out: '{member} ran out of ammunition, so {name} came home too.',
  runes_out: '{member} ran out of runes, so {name} came home too.',
  rule: '{member}’s stop rule was met, so {name} came home too.',
  hours: '{member}’s time limit was up, so {name} came home too.',
  no_fight: '{member} went too long without landing a blow, so {name} came home too.',
  changed: '{member} moved on to another hunt, so {name} came home too.',
  server: 'The server stopped {member}’s hunt, so {name} came home too.',
});

/** "Mira ran out of stamina, so Oren came home too." for a hero a friend's end sent home; '' for any other end. Pure. */
export function cameHomeWords(reason, by, why, hero) {
  if (reason !== 'party_member_left' && reason !== 'party_member_died') return '';
  const line = (reason === 'party_member_left' && typeof why === 'string' && Object.prototype.hasOwnProperty.call(CAME_HOME_BECAUSE, why) && CAME_HOME_BECAUSE[why])
    || END_REASON_COPY[reason].one;
  return line.replace('{member}', (by && String(by)) || 'A party member').replace('{name}', (typeof hero === 'string' && hero) || 'your hero');
}

/** One notice as a line, or '' for a kind this client does not know. `ctx`: { name, ground }. Pure. */
export function noticeWords(n, ctx = {}) {
  const line = n && Object.prototype.hasOwnProperty.call(PARTY_NOTICE_WORDS, n.kind) ? PARTY_NOTICE_WORDS[n.kind] : '';
  return line.replaceAll('{who}', n ? n.who : '').replaceAll('{name}', ctx.name || 'your hero').replaceAll('{ground}', ctx.ground || 'a hunt');
}

/** "Mira has 14 min of stamina left. Their hunt ends then, and Oren comes home too." (`together`: this hero's own box). Pure. */
export function staminaLowWords(member, ms, hero, together) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  return member + ' has ' + min + ' min of stamina left. Their hunt ends then' + (together ? ', and ' + hero + ' comes home too.' : '.');
}
