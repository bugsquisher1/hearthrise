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
// the hunt session, the server clock, Level XP and the Level the server made of it, the coins THIS hero's hunt has taken
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
//
// THE CARD NEVER OUTLIVES ITS LAST WORDS (friends' panel 2026-11-01: "Still hunting" in town, hours after the hunt ended). What
// happened while away is history and stays as it came up. What the hunt is doing now is read from each new envelope (awayLineNow,
// src/shell/alerts.js scan), and a hunt that ends with the card up takes the card: its summary or its own alert is the notice now.
//
// ONLY A RETURN IS JUDGED (src/shell/alerts.js): this page's first read of the hero, or its first after the page was left. A hunt on
// screen past the stamp's age is being watched, not missed: it renews the stamp and says nothing.
//
// A NEW HERO'S FIRST RETURN SPEAKS SOONER (designer 2026-11-10, played: the return was the best moment of the game, and a new player who
// came back at minute 5 got nothing). Until this hero has come back to a hunt once (residue `coach.back`), and while the stamp is of a hero
// under the first real ground's Level, the shortest absence is FIRST_AWAY_MIN_MS and the stamp is renewed that often. After that first
// return, AWAY_MIN_MS as ever. Only when the line speaks moves: its numbers are still two server answers.
//
// IN VIEW, A TIME SKIP (tools/qa/local-world.mjs) IS NOT AN ABSENCE. It moves the hunt, not the clock, so the stamp stays as young as
// real time says; a tab closed with no goodbye right after one reports the skipped stretch too. No real clock can do that: a stamp is
// never older than the absence it reports plus the renewal below, and its time and its numbers are the same stamp's.
// ════════════════════════════════════════════════════════════════════════
import { levelOf } from '../session/character-sections.js?v=0.2.126';
import { huntOf, analyzerOf, serverNowOf, staminaOf } from '../session/hunt-sections.js?v=0.2.126';
import { nameOf } from '../session/item-sections.js?v=0.2.126';
import { huntName } from '../session/party-sections.js?v=0.2.126';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.126';
import { cameHomeWords } from '../data/party-words.js?v=0.2.126';
import { whole } from '../render/format.js?v=0.2.126';
import { isWorkStamp, workStampOf, awayWorkLineOf, awayWorkSettled } from './away-work.js?v=0.2.126';
import { bestFind } from '../hunt-view/summary-model.js?v=0.2.126';
import { itemName } from './widgets/bits.js?v=0.2.126';
import { t } from '../render/player-text.js?v=0.2.126';
import { afterHuntOf, afterHuntWords, spanWords, WAITED_FROM_MS } from './after-hunt.js?v=0.2.126';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.126';

/* Less time away than this is a reload or a quick look, not an absence. */
export const AWAY_MIN_MS = 10 * 60 * 1000;
/* A new hero's first return (see the header): the shortest absence its first line speaks of. */
export const FIRST_AWAY_MIN_MS = 3 * 60 * 1000;
/* A hero is new under the Level of the first ground past the tutorial room (hunt-tutorial.js: the coach's first hour ends there). */
const NEW_HERO_BELOW = HUNT_INDEX.meadowbrook_thicket.band[0];
/* How often the last-seen stamp is renewed while a hunt runs on screen, for a tab that dies with no goodbye. */
export const STAMP_EVERY_MS = AWAY_MIN_MS;
/* The most often leaving writes (one residue put per character): a page that flickers in and out of view is no absence. */
export const LEAVE_EVERY_MS = 60 * 1000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const stampOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.awaySeen;
  return isObj(r) && typeof r.s === 'string' && Number.isSafeInteger(r.at) ? r : null;
};

/**
 * The shortest absence the line speaks of for this hero, which is also how often its stamp is renewed in view: FIRST_AWAY_MIN_MS until
 * its first return has been told, while it is new by the server's Level in the stamp (else its `level` block now; neither: not new), else AWAY_MIN_MS. `was`: the stamp
 * being judged; the return markBack recorded for that very stamp is still the first (a second read of it says the same line).
 */
export function awayMinMsOf(cs, was) {
  const coach = cs && cs.record && cs.record.residue && cs.record.residue.coach;
  const told = isObj(coach) && typeof coach.back === 'string';
  if (told && !(was && coach.back === was.s && coach.backAt === was.at)) return AWAY_MIN_MS;
  const lv = levelOf(cs);
  const level = was && Number.isSafeInteger(was.lv) && was.lv >= 1 ? was.lv : lv ? lv.level : 0;
  return level >= 1 && level < NEW_HERO_BELOW ? FIRST_AWAY_MIN_MS : AWAY_MIN_MS;
}

/** "1 h 58 min", "25 min". */
const awayWords = spanWords;
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
  /* `lv`: the Level the server said with that XP. The return compares it with the Level the server says then; a Level
     worked out here from the stamped XP would be this build's curve (character-sections.js levelOf). */
  return { s: h.sessionId, at: Math.floor(now), xp: lv.xp, lv: lv.level, ...(gold !== null ? { gold } : {}), ...(kills !== null ? { kills } : {}) };
}

/**
 * The away line for this character against its stamp, or null. Pure (reads the sections and the residue).
 * @returns {{id: string, kind: 'away', session: string, text: string, said?: string, ended?: boolean, at?: number, minutes?: number, levels?: number}|null}
 */
export function awayRecapOf(cs) {
  const was = stampOf(cs);
  /* A hero working in town when the player left: what the job did (./away-work.js). */
  if (isWorkStamp(was)) {
    const now = serverNowOf(cs);
    return Number.isFinite(now) && now - was.at >= AWAY_MIN_MS && awayWorkSettled(cs, was, AWAY_MIN_MS) ? awayWorkLineOf(cs, was, awayWords) : null;
  }
  const h = huntOf(cs);
  const lv = levelOf(cs);
  const now = serverNowOf(cs);
  if (!was || !h || h.sessionId !== was.s || !lv || !Number.isFinite(now)) return null;
  const gone = now - was.at;
  if (gone < awayMinMsOf(cs, was)) return null;
  /* A hunt that was over when the player left is no part of the absence (crafter's panel 2026-11-01). */
  if (h.ended && Number.isFinite(h.endedAtMs) && h.endedAtMs <= was.at) return null;
  const parts = [];
  /* two server answers, the stamp's Level and this one's; a stamp from before `lv` was kept says no Levels, only the XP */
  const from = Number.isSafeInteger(was.lv) && was.lv >= 1 ? was.lv : null;
  if (from !== null && lv.level > from) parts.push('Level ' + from + ' to ' + lv.level);
  if (lv.xp > was.xp) parts.push(signed(lv.xp - was.xp, 'Level XP'));
  const a = analyzerOf(cs);
  const gold = coinsOf(a);
  if (Number.isSafeInteger(was.gold) && gold !== null && gold > was.gold) parts.push(signed(gold - was.gold, 'gold'));
  const kills = a && a.hero && Number.isFinite(a.hero.kills) && Number.isSafeInteger(was.kills) ? Math.floor(a.hero.kills) - was.kills : null;
  if (kills !== null && kills > 0) parts.push(whole(kills) + ' kills');
  const name = nameOf(cs) || 'Your hero';
  const head = 'While you were away (' + awayWords(gone) + '), ' + name + ' hunted ' + huntName(h.huntId);
  /* the hunt's best find, gear or a Rare, from the server's loot tally (designer re-read 2026-11-11: the card never named the Iron Platebody). The
     tally is the whole hunt's, so the line says so: the stamp holds no loot, and the absence alone is not known here. */
  const best = a && a.hero ? bestFind(a.hero.loot) : null;
  const said = head + (parts.length ? ': ' + parts.join(', ') + '.' : '.') + (best ? ' ' + t('hunts.away_best', { item: itemName(best) }) : '');
  /* `minutes`, `levels`: the absence and the Levels gained, as the line says them (telemetry reads them, alerts.js: nothing else does) */
  return { id: 'away:' + h.sessionId.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 64) + ':' + was.at, kind: 'away', session: h.sessionId, said, ended: h.ended,
    at: was.at, minutes: Math.floor(gone / 60000), levels: from !== null ? Math.max(0, lv.level - from) : 0,
    text: (said + nowWords(cs, h, now)).trim() };
}

/* What the hunt is doing now, from the envelope: the stamina left, or how long ago it ended and the stamina rested since. */
function nowWords(cs, h, now) {
  const name = nameOf(cs) || 'Your hero';
  const where = huntName(h.huntId);
  const st = staminaOf(cs);
  const stamina = st && st.msLeft > 0 ? awayWords(st.msLeft) : null;
  /* WHAT CAME AFTER (./after-hunt.js, designer re-read 2026-11-11 #2): the job the server put the hero back on, or how long it
     waited in town and the one thing that would have filled that time. A wait says the time itself, so "ago" is not said twice. */
  const state = h.ended && typeof cs.read === 'function' ? cs.read('state') : null;
  const after = h.ended ? afterHuntOf(state, h, now) : null;
  const waited = !!after && after.kind === 'waited' && after.idleMs >= WAITED_FROM_MS;
  const ago = h.ended && !waited && Number.isFinite(h.endedAtMs) && now - h.endedAtMs >= AWAY_MIN_MS ? ' ' + awayWords(now - h.endedAtMs) + ' ago' : '';
  const then = after ? ' ' + afterHuntWords(state, h, now, name) : '';
  return h.ended
    /* a friend's end says what ended it (`end_by_why`, the alert's and the summary's words): "left the hunt" for a friend whose stamina ran out was the panel's report */
    ? ' The hunt has ended' + ago + '. ' + (cameHomeWords(h.endReason, h.endBy, h.endWhy, name) || STAMINA_WORDS[h.endReason] || (END_REASON_COPY[h.endReason] && END_REASON_COPY[h.endReason].one) || '')
      .replace('{name}', name).replace('{ground}', where).replace('{item}', 'a supply').replace('{hunt}', 'another hunt')
      + then + (stamina ? ' Stamina now: ' + stamina + '.' : '')
    : stamina ? ' Still hunting, with ' + stamina + ' of stamina left.' : ' Still hunting.';
}

/**
 * The away alert `a` (awayRecapOf's) as the record says it now, or null when it is over: another hunt is the character's now, or
 * the hunt was running when the card came up and has ended since. Pure.
 */
export function awayLineNow(cs, a) {
  const h = huntOf(cs);
  if (a.work) { const w = workStampOf(cs); return (a.still && !(w && w.s === a.work)) || (h && !h.ended) ? null : a.text; }
  if (!h || h.sessionId !== a.session || (h.ended && !a.ended)) return null;
  const now = serverNowOf(cs);
  return Number.isFinite(now) ? (a.said + nowWords(cs, h, now)).trim() : a.text;
}

/** May the line be judged now? False until the record and the server's clock are in, and while a town job's return waits for the settle that pays it (./away-work.js). */
export function awaySettled(cs) {
  if (!cs.record || !Number.isFinite(serverNowOf(cs))) return false;
  const was = stampOf(cs);
  return !isWorkStamp(was) || awayWorkSettled(cs, was, AWAY_MIN_MS);
}

/** Record the hunt the player came back to (see the header), and the stamp its line was told from (`at`, awayMinMsOf). Written once per
    return; display state only. */
export function markBack(cs, session, at) {
  if (typeof session !== 'string' || typeof cs.setResidue !== 'function') return false;
  const r = (cs.record && cs.record.residue && cs.record.residue.coach) || {};
  return r.back === session ? false : cs.setResidue('coach', Object.assign({}, r, { back: session, backAt: Number.isSafeInteger(at) ? at : undefined }));
}

/**
 * A RETURN NO STAMP COVERS (played 2026-11-04: "Your hero just ate" over a hunt ten hours old, the first thing the return said): this page's first read of a hunt it never stamped (a tab killed
 * seconds after Enter), already older than the shortest absence the line speaks of. There are no numbers to tell, but its just-now cards are old, so they stand aside as on any return.
 */
export function backWithNoStamp(cs) {
  const h = huntOf(cs), was = stampOf(cs), a = analyzerOf(cs);
  if (!h || h.ended || (was && was.s === h.sessionId) || !a || !Number.isFinite(a.sessionMs) || a.sessionMs < AWAY_MIN_MS) return false;
  return markBack(cs, h.sessionId);
}

/**
 * Renew the stamp when it is due: a hunt not stamped yet, one last stamp for a hunt seen ended, else by age (see the header).
 * @param {object} cs
 * @param {boolean} [leaving]  the page is being left: the stamp is now, unless the last one is under LEAVE_EVERY_MS old
 */
export function stampAway(cs, leaving = false) {
  if (typeof cs.setResidue !== 'function') return false;
  const was = stampOf(cs);
  const work = workStampOf(cs);
  if (work) {
    const young = leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS;
    return was && was.s === work.s && work.at - was.at < young ? false : cs.setResidue('awaySeen', work);
  }
  const h = huntOf(cs);
  /* A job that stopped in view, with no hunt running: the next return has nothing of it to tell. */
  if (isWorkStamp(was) && (!h || h.ended)) { const now = serverNowOf(cs); return Number.isFinite(now) ? cs.setResidue('awaySeen', { s: 'idle', at: Math.floor(now) }) : false; }
  const next = awayStampOf(cs, h);
  if (!next) return false;
  if (h.ended) {
    /* only the hunt this stamp is for, once (this stamp lands past the end, the last one before it: a write re-runs this through its
       listeners, so a clock short of the end must not stamp at all), and never over a line still due: a new stamp would be a new line about the same hunt */
    if (!was || was.s !== next.s || !(was.at < h.endedAtMs && next.at >= h.endedAtMs) || awayRecapOf(cs)) return false;
  } else if (was && was.s === next.s && next.at - was.at < Math.min(awayMinMsOf(cs, null), (leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS))) return false;
  return cs.setResidue('awaySeen', next);
}
