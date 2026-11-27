// ════════════════════════════════════════════════════════════════════════
// src/app/whats-new.js — "WHAT'S NEW": ONE CARD ON THE CHARACTERS SCREEN, ONCE AN ACCOUNT (lane/wn-sh WN, 2026-11-26).
//
// docs/design/redesign/20-v030-the-roads.md band 5 WN: one card on the first sign-in to a release that has one (src/data/whats-new.js),
// with a "you start fresh" line for a RETURNING account (one made before that release: the release starts every hero fresh, CLAUDE.md
// section 1, no back-compat).
//
// WHERE THE SEEN MARK LIVES, AND WHY. Not the residue (src/session/residue.js): that is each HERO's display state (player_state.
// client_state), and the card is the ACCOUNT's, shown on the characters screen before any hero is open, to an account that after a wipe
// has no hero at all. It is the account coach's reads (src/session/account-coach.js, 1039-account-coach.sql): server-held display state an
// account, written only as a raise-only union through hr_account_coach, read once a login. So the mark survives a reload, a second tab and
// a second device, and it gates, spends and ranks nothing. The character wipe clears account_coach, so after a wipe every account sees
// the card once. If the coach cannot be read, no card shows (better unseen than shown on every sign-in).
//
//   whatsNewOf(o)                 the card to show, or null. Pure
//   paintWhatsNew(box, account, o)  read the account's coach, then fill `box` with the card (or leave it hidden); Got it marks it read
// ════════════════════════════════════════════════════════════════════════
import { WHATS_NEW, semverCmp } from '../data/whats-new.js';
import { BUILD } from '../build-info.js';
import { t } from '../render/player-text.js';
import { escapeHtml as esc } from '../utils/dom.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * THE CARD for an account: the newest row at or under `version`, unless its mark is in `read`. `createdAtMs` is when the account was made
 * (the auth user's created_at), `buildDate` the running build's date (BUILD.date): an account made before the row's day is RETURNING and
 * reads the fresh line; a new one sees the card only when the row says forNew.
 * @param {{ version?: string, read?: { has: (id: string) => boolean } | null, createdAtMs?: number | null, buildDate?: string,
 *   rows?: ReadonlyArray<{ version: string, card: string, lead?: string | null, lines: readonly string[], fresh: string | null, since: string | null,
 *   forNew: boolean }> }} [o]
 * @returns {null | { card: string, version: string, lead: string | null, lines: string[], fresh: string | null }}
 */
export function whatsNewOf({ version = BUILD.version, read, createdAtMs = null, buildDate = BUILD.date, rows = WHATS_NEW } = {}) {
  const row = rows.filter((r) => semverCmp(r.version, version) <= 0).pop() || null;
  if (!row || (read && typeof read.has === 'function' && read.has(row.card))) return null;
  const day = row.since || (semverCmp(row.version, version) === 0 && DAY.test(String(buildDate)) ? buildDate : null);
  const since = day ? Date.parse(day + 'T00:00:00Z') : NaN;
  const returning = Number.isFinite(createdAtMs) && Number.isFinite(since) && createdAtMs < since;
  if (!returning && !row.forNew) return null;
  return { card: row.card, version: row.version, lead: row.lead ? t(row.lead) : null, lines: row.lines.map((id) => t(id)),
    fresh: returning && row.fresh ? t(row.fresh) : null };
}

/* A feature line is a label, "Risk · Careful, Steady or Bold": its glossary word before the first " · " stands out. */
const lineHtml = (l) => {
  const at = l.indexOf(' · ');
  return '<li>' + (at > 0 ? '<b>' + esc(l.slice(0, at)) + '</b>' + esc(l.slice(at)) : esc(l)) + '</li>';
};
/** The card's markup (escaped): the fresh line first (what a returning player needs before anything), the lead, the features. */
const cardHtml = (c) => '<h2 class="whats-new-head">' + esc(t('share.news_head', { version: c.version })) + '</h2>'
  + (c.fresh ? '<p class="auth-lead whats-new-fresh">' + esc(c.fresh) + '</p>' : '')
  + (c.lead ? '<p class="auth-lead">' + esc(c.lead) + '</p>' : '')
  + (c.lines.length ? '<ul class="whats-new-list">' + c.lines.map(lineHtml).join('') + '</ul>' : '')
  + '<p class="whats-new-do"><button type="button" class="hh-tool whats-new-ok">' + esc(t('share.news_got_it')) + '</button></p>';

/**
 * Fill `box` (a hidden section of the characters card) with the account's card once its coach is read; hidden when there is none.
 * Got it marks the card read (one raise-only write, AccountCoach.mark) and the card goes. `o`: { createdAtMs, version, buildDate }.
 * @returns {Promise<boolean>} whether a card is shown
 */
export async function paintWhatsNew(box, account, o = {}) {
  const coach = account && account.coach;
  if (!box || !coach || typeof coach.load !== 'function') return false;
  let ok = false;
  try { ok = await coach.load(); } catch (e) { ok = false; }
  /* the screen moved on while the coach was read, or it could not be read */
  if (!ok || !box.isConnected) return false;
  const card = whatsNewOf({ ...o, read: coach.read });
  box.hidden = !card;
  if (!card) { box.innerHTML = ''; return false; }
  box.innerHTML = cardHtml(card);
  box.querySelector('.whats-new-ok').addEventListener('click', () => {
    coach.mark('read', [card.card]);
    box.hidden = true;
    box.innerHTML = '';
  });
  return true;
}
