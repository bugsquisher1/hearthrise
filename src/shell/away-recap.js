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
// so the purse moves with every hero) and the session's kills. On the next visit the
// first envelope is compared with that stamp: if at least AWAY_MIN_MS of server time
// has passed, one alert line says what changed (src/shell/alerts.js, kind `away`),
// once (its id carries the stamp's time, and alerts remember the ids they showed).
// Every number in the line is a difference of two server answers; nothing is
// predicted or spendable.
//
// WHEN IT IS WRITTEN (beta cost 2026-11-01: a put a minute per hero, 1 of a hunt's 8.3 requests a minute). When the page
// is left, for every open hero (hidden, closed, signed out: alerts.js leaving, src/app/boot.js), on a fetch that outlives
// the page. A hunt the page has not stamped yet is stamped at once, and a hunt on screen is renewed every AWAY_MIN_MS, so a
// tab killed with no goodbye still has an answer, its absence overstated by less than the shortest one the line speaks of.
// A page flickering in and out of view writes at most once per LEAVE_EVERY_MS. A hunt that ended in view gets one last
// stamp with its final numbers, or the return would credit what the player watched.
//
// THE RETURN (panel 2026-11-01, played): the line says what to do next: the stamina left, or how long ago a hunt ended and
// the stamina rested since. And markBack records the hunt the player came back to (residue `coach.back`), so the coach's
// "just now" cards stand aside and no card opens over it (hunt-tutorial.js fresh_hunt, launcher.js restsNow).
// ════════════════════════════════════════════════════════════════════════
import { levelOf } from '../session/character-sections.js?v=0.2.80';
import { huntOf, analyzerOf, serverNowOf, staminaOf } from '../session/hunt-sections.js?v=0.2.80';
import { nameOf } from '../session/item-sections.js?v=0.2.80';
import { huntName } from '../session/party-sections.js?v=0.2.80';
import { charLevelFromXp } from '../core/xp.js?v=0.2.80';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.80';
import { whole } from '../render/format.js?v=0.2.80';

/* Less time away than this is a reload or a quick look, not an absence. */
export const AWAY_MIN_MS = 10 * 60 * 1000;
/* How often the last-seen stamp is renewed while a hunt runs on screen, for a tab that dies with no goodbye. */
export const STAMP_EVERY_MS = AWAY_MIN_MS;
/* The most often leaving writes (one residue put per character): a page that flickers in and out of view is no absence. */
export const LEAVE_EVERY_MS = 60 * 1000;

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
/* Plain words where the shared copy says "1:1" (that copy ships in the engine's bundle; this line is the client's). How it comes back is the end card's. */
const STAMINA_WORDS = Object.freeze({ stamina: 'Out of stamina, so {name} came home.' });
const signed = (n, unit) => (n >= 0 ? '+' : '−') + whole(Math.abs(n)) + ' ' + unit;

/* The coins this hero's hunt has taken (the analyzer's session tally), or null. */
const coinsOf = (a) => (a && a.hero && Number.isSafeInteger(a.hero.gold) && a.hero.gold >= 0 ? a.hero.gold : null);

/** The numbers to stamp now (server's), or null when there is no hunt or the server has not said yet. */
function awayStampOf(cs, h) {
  const lv = levelOf(cs);
  const now = serverNowOf(cs);
  if (!h || !lv || !Number.isFinite(now)) return null;
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
  const st = staminaOf(cs);
  const stamina = st && st.msLeft > 0 ? awayWords(st.msLeft) : null;
  const ago = h.ended && Number.isFinite(h.endedAtMs) && now - h.endedAtMs >= AWAY_MIN_MS ? ' ' + awayWords(now - h.endedAtMs) + ' ago' : '';
  const end = h.ended
    ? ' The hunt has ended' + ago + '. ' + (STAMINA_WORDS[h.endReason] || (END_REASON_COPY[h.endReason] && END_REASON_COPY[h.endReason].one) || '')
      .replace('{name}', name).replace('{ground}', where).replace('{member}', h.endBy || 'A party member').replace('{item}', 'a supply').replace('{hunt}', 'another hunt')
      + (stamina ? ' Stamina now: ' + stamina + '.' : '')
    : stamina ? ' Still hunting, with ' + stamina + ' of stamina left.' : ' Still hunting.';
  return { id: 'away:' + h.sessionId.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 64) + ':' + was.at, kind: 'away', session: h.sessionId, text: (head + body + end).trim() };
}

/** Record the hunt the player came back to (see the header). Written once per return; display state only. */
export function markBack(cs, session) {
  if (typeof session !== 'string' || typeof cs.setResidue !== 'function') return false;
  const r = (cs.record && cs.record.residue && cs.record.residue.coach) || {};
  return r.back === session ? false : cs.setResidue('coach', Object.assign({}, r, { back: session }));
}

/**
 * Renew the stamp when it is due: a hunt not stamped yet, one last stamp for a hunt seen ended, else by age (see the header).
 * @param {object} cs
 * @param {boolean} [leaving]  the page is being left: the stamp is now, unless the last one is under LEAVE_EVERY_MS old
 */
export function stampAway(cs, leaving = false) {
  if (typeof cs.setResidue !== 'function') return false;
  const h = huntOf(cs);
  const next = awayStampOf(cs, h);
  if (!next) return false;
  const was = stampOf(cs);
  if (h.ended) {
    /* only the hunt this stamp is for, once (this stamp lands past the end, the last one before it: a write re-runs this through its
       listeners, so a clock short of the end must not stamp at all), and never over a line still due: a new stamp would be a new line about the same hunt */
    if (!was || was.s !== next.s || !(was.at < h.endedAtMs && next.at >= h.endedAtMs) || awayRecapOf(cs)) return false;
  } else if (was && was.s === next.s && next.at - was.at < (leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS)) return false;
  return cs.setResidue('awaySeen', next);
}
