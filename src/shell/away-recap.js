// ════════════════════════════════════════════════════════════════════════
// src/shell/away-recap.js — "WHILE YOU WERE AWAY": ONE LINE ON RETURN.
//
// The fresh-hero play (designer 2026-10-22): back after an hour, the hero was
// still hunting (good), but nothing said what had happened: no Levels gained,
// no coin, no kills, no reason a hunt stopped. Hunts run on the server with the
// game closed (Tyler 2026-10-18), so the return is the moment that sells it.
//
// HOW. While a character's hunt runs on screen, its last-seen SERVER numbers are
// stamped into the display-only residue field `awaySeen` (src/session/residue.js):
// the hunt session, the server clock, Level XP, the coins THIS hero's hunt has taken
// (the analyzer's, never the purse: gold is the account's, 2026-12-15-account-gold.sql,
// so the purse moves with every hero) and the session's kills, at
// most once a minute. On the next visit the first envelope is compared with that
// stamp: if at least AWAY_MIN_MS of server time has passed, one alert line says
// what changed (src/shell/alerts.js, kind `away`), once (its id carries the
// stamp's time, and alerts remember the ids they showed). Every number in the
// line is a difference of two server answers; nothing is predicted or spendable.
// ════════════════════════════════════════════════════════════════════════
import { levelOf } from '../session/character-sections.js?v=0.2.59';
import { huntOf, analyzerOf, serverNowOf } from '../session/hunt-sections.js?v=0.2.59';
import { nameOf } from '../session/item-sections.js?v=0.2.59';
import { huntName } from '../session/party-sections.js?v=0.2.59';
import { charLevelFromXp } from '../core/xp.js?v=0.2.59';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.59';
import { whole } from '../render/format.js?v=0.2.59';

/* Less time away than this is a reload or a quick look, not an absence. */
export const AWAY_MIN_MS = 10 * 60 * 1000;
/* How often the last-seen stamp is renewed while a hunt runs on screen (one residue put per character). */
export const STAMP_EVERY_MS = 60 * 1000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const stampOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.awaySeen;
  return isObj(r) && typeof r.s === 'string' && Number.isSafeInteger(r.at) ? r : null;
};

/** "1 h 58 min", "25 min". */
function awayWords(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min';
}
const signed = (n, unit) => (n >= 0 ? '+' : '−') + whole(Math.abs(n)) + ' ' + unit;

/* The coins this hero's hunt has taken (the analyzer's session tally), or null. */
const coinsOf = (a) => (a && a.hero && Number.isSafeInteger(a.hero.gold) && a.hero.gold >= 0 ? a.hero.gold : null);

/** The numbers to stamp now (server's), or null when no hunt runs or the server has not said yet. */
function awayStampOf(cs) {
  const h = huntOf(cs);
  const lv = levelOf(cs);
  const now = serverNowOf(cs);
  if (!h || h.ended || !lv || !Number.isFinite(now)) return null;
  const a = analyzerOf(cs);
  const kills = a && a.hero && Number.isFinite(a.hero.kills) ? Math.floor(a.hero.kills) : null;
  const gold = coinsOf(a);
  return { s: h.sessionId, at: Math.floor(now), xp: lv.xp, ...(gold !== null ? { gold } : {}), ...(kills !== null ? { kills } : {}) };
}

/**
 * The away line for this character against its stamp, or null. Pure (reads the sections and the residue).
 * @returns {{id: string, kind: 'away', session: string, text: string}|null}
 */
export function awayRecapOf(cs) {
  const was = stampOf(cs);
  const h = huntOf(cs);
  const lv = levelOf(cs);
  const now = serverNowOf(cs);
  if (!was || !h || h.sessionId !== was.s || !lv || !Number.isFinite(now)) return null;
  const gone = now - was.at;
  if (gone < AWAY_MIN_MS) return null;
  const parts = [];
  const from = charLevelFromXp(was.xp);
  if (lv.level > from) parts.push('Level ' + from + ' to ' + lv.level);
  if (lv.xp > was.xp) parts.push(signed(lv.xp - was.xp, 'Level XP'));
  const a = analyzerOf(cs);
  const gold = coinsOf(a);
  if (Number.isSafeInteger(was.gold) && gold !== null && gold > was.gold) parts.push(signed(gold - was.gold, 'gold'));
  const kills = a && a.hero && Number.isFinite(a.hero.kills) && Number.isSafeInteger(was.kills) ? Math.floor(a.hero.kills) - was.kills : null;
  if (kills !== null && kills > 0) parts.push(whole(kills) + ' kills');
  const name = nameOf(cs) || 'Your hero';
  const where = huntName(h.huntId);
  const head = 'While you were away (' + awayWords(gone) + '), ' + name + ' hunted ' + where;
  const body = parts.length ? ': ' + parts.join(', ') + '.' : '.';
  const end = h.ended
    ? ' The hunt has ended. ' + ((END_REASON_COPY[h.endReason] && END_REASON_COPY[h.endReason].one) || '')
      .replace('{name}', name).replace('{ground}', where).replace('{member}', h.endBy || 'A party member').replace('{item}', 'a supply').replace('{hunt}', 'another hunt')
    : ' Still hunting.';
  return { id: 'away:' + h.sessionId.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 64) + ':' + was.at, kind: 'away', session: h.sessionId, text: (head + body + end).trim() };
}

/** Renew the stamp when it is due (a hunt runs, and the last stamp is a minute old or for another hunt). */
export function stampAway(cs) {
  const next = awayStampOf(cs);
  if (!next || typeof cs.setResidue !== 'function') return false;
  const was = stampOf(cs);
  if (was && was.s === next.s && next.at - was.at < STAMP_EVERY_MS) return false;
  return cs.setResidue('awaySeen', next);
}
