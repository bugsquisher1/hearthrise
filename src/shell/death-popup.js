// ════════════════════════════════════════════════════════════════════════
// src/shell/death-popup.js — THE DEATH POPUP: WHEN IT OPENS, AND WHAT IT SAYS.
//
// Tyler 2026-10-19: a death opens a centred popup (the `death` modal row,
// src/data/shell-windows.js; windows/death.js draws it), not a side alert.
// Every fact is the server's: the death row (`death_log`, hr_death_log_view):
// the ground, the killer, the XP the settle debited and the XP a Blessing kept
// (2026-11-07-death-popup-blessing.sql); "what happened" is the hunt summary's
// death explanation (summary-recorder.js), made from the server's own events
// while the hunt was watched. Nothing is counted or priced in the browser, and
// a number the server did not send is never shown.
//
// WHEN: the character's hunt section says it ended `died`, and the newest death
// row is that session's. Once dismissed (OK, Hunt summary or the close) the
// session's id `died:<session>` is in the residue's `alerts.seen` (display
// state), so a reload or another device never shows the same death twice; the
// alert centre (alerts.js) reads the same id, so a seen death never comes back
// as a side line. A party member's death stays an alert line.
// ════════════════════════════════════════════════════════════════════════
import { ALERTS_SEEN_MAX } from '../session/residue.js?v=0.2.51';
import { huntOf } from '../session/hunt-sections.js?v=0.2.51';
import { deathLogOf, levelOf } from '../session/character-sections.js?v=0.2.51';
import { nameOf, blessingsOf } from '../session/item-sections.js?v=0.2.51';
import { huntName } from '../session/party-sections.js?v=0.2.51';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.51';
import { whole } from '../render/format.js?v=0.2.51';
import { summariesOf } from '../hunt-view/summary-recorder.js?v=0.2.51';
import { monsterName } from './widgets/bits.js?v=0.2.51';

const seenOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.alerts;
  return r && typeof r === 'object' ? r : {};
};
/** The dismissal id of a death: its hunt session's (the alert centre reads the same one). */
const deathSeenId = (session) => 'died:' + session;
/* ", and they're free until Level 30" while the server's Blessings are free for this hero (board 2026-10-25 #9: the
   popup never said so, and the player walked back into the same death unblessed), else nothing. */
function freeWords(cs) {
  const b = blessingsOf(cs), lv = levelOf(cs);
  return b && Number.isInteger(b.freeUntil) && lv && lv.level < b.freeUntil ? ', and they\'re free until Level ' + b.freeUntil : '';
}

/** Does this hero hold fewer Blessings than the server offers? (the popup's Blessings button) Null when unknown. */
export function blessingsMissing(cs) {
  const b = blessingsOf(cs);
  return b && b.tiers.length ? b.tiers.some((t) => !t.held) : null;
}
/* Dismissed on this page: an envelope that lands before the residue put cannot bring one back. */
const DISMISSED = new WeakMap();
const dismissedOf = (cs) => { let s = DISMISSED.get(cs); if (!s) { s = new Set(); DISMISSED.set(cs, s); } return s; };

/** Has this character's death in `session` been dismissed (this page, or the residue)? */
export function deathSeen(cs, session) {
  const seen = seenOf(cs).seen;
  return dismissedOf(cs).has(session) || (Array.isArray(seen) && seen.includes(deathSeenId(session)));
}

/** The death the popup shows for this character now, as { session, row }, or null. */
export function deathPopupOf(cs) {
  const h = huntOf(cs);
  if (!h || !h.ended || h.endReason !== 'died' || deathSeen(cs, h.sessionId)) return null;
  const log = deathLogOf(cs);
  const row = log && log[0];
  /* The newest row must be THIS hunt's death (a row with no session is an older server's: the newest). */
  if (!row || (row.session !== null && row.session !== h.sessionId)) return null;
  return { session: h.sessionId, row };
}

/** Mark one death as seen (display state only); sent at once, so a reload right after OK never shows it again. */
function dismissDeath(cs, session) {
  dismissedOf(cs).add(session);
  const r = seenOf(cs);
  const seen = Array.isArray(r.seen) ? r.seen : [];
  if (seen.includes(deathSeenId(session))) return;
  const ok = cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: seen.concat(deathSeenId(session)).slice(-ALERTS_SEEN_MAX) });
  if (ok && typeof cs.flushResidue === 'function') cs.flushResidue().catch(() => {});
}

const xpName = (k) => (k === 'level' ? 'Level' : (SKILLS_DEF[k] && SKILLS_DEF[k].name) || k);
/* "1,200 Level XP, 40 Melee XP and 12 Defense XP", Level first. */
const xpWords = (m) => {
  const parts = Object.keys(m).sort((a, b) => (a === 'level' ? -1 : b === 'level' ? 1 : a < b ? -1 : 1)).map((k) => whole(m[k]) + ' ' + xpName(k) + ' XP');
  return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
};

/**
 * The popup's words for one character's death (pure; every number is the server's row).
 * @returns {{title: string, killed: string, what: string, lost: string, saved: string, town: string}}
 */
export function deathWords(cs, d) {
  const who = nameOf(cs) || 'Your hero';
  const row = d.row;
  const story = summariesOf(cs).find((s) => s.id === d.session);
  return {
    title: row.hunt ? who + ' died in ' + huntName(row.hunt) : who + ' died',
    killed: row.monster ? 'Killed by ' + monsterName(row.monster) + '.' : '',
    what: story && story.deaths.length ? story.deaths[0] : '',
    /* xp null: the server has not priced it (an older row); say nothing rather than guess. */
    lost: Object.keys(row.xpLost).length ? 'Dying cost ' + xpWords(row.xpLost) + '.' : row.xp === null ? '' : 'Dying cost no XP.',
    /* undefined: the server did not say whether a Blessing was used, so nothing is said about one. */
    saved: row.saved === undefined ? ''
      : row.saved === null ? 'No Blessing was active. Blessings, in the Shop\'s Services tab, lower what dying costs' + freeWords(cs) + '.'
      : Object.keys(row.saved).length ? 'Your Blessing kept ' + xpWords(row.saved) + ', and is now used up.' : 'Your Blessing is now used up.',
    town: who + ' is back in town with full health and mana.',
  };
}

/**
 * Open the popup on this shell when its character dies (on mount too: a death
 * while away shows on return), and record the dismissal however it closes.
 * Returns the unsubscribe.
 */
export function followDeaths(ctx) {
  const cs = ctx.character;
  if (!cs || typeof cs.subscribe !== 'function') return () => {};
  let showing = null;
  const check = () => {
    const d = deathPopupOf(cs);
    if (!d || ctx.wm.isOpen('death')) return;
    showing = d.session;
    ctx.wm.open('death');
  };
  const offWm = ctx.wm.subscribe(() => {
    if (showing !== null && !ctx.wm.isOpen('death')) { const s = showing; showing = null; dismissDeath(cs, s); }
  });
  const offCs = cs.subscribe((s, why) => { if (why !== 'closed') check(); });
  check();
  return () => { offWm(); offCs(); };
}
