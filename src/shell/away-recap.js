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
// EXCEPT AN END THAT IS PART OF THE RETURN (audit 2026-11-15 F9: 12 h of stamina, 12 h away; the first envelope still showed the hunt, the settle ended it seconds
// later, and the card went with "Level 17 to 24", the best line of the return, twice in a row). A hunt whose end the server dates no later than RETURN_SETTLE_MS after
// the card came up (both the server's clock) ended while the player was away or as they walked in: the card stays and says it ended, as a card raised after the end does.
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
//
// THE RETURN NEVER LIES OR GOES SILENT (full-game audit 2026-11-18, A2 A6 A22):
//   GOLD is what the purse kept: the coins the absence looted less the store gold its supplies took (the analyzer's `coins` and `waste`,
//     both stamped), never the coins alone ("+6,182 gold" while the purse rose 1,843), and less the fee of a yard that took over (the
//     training section's, post-140 audit C3: +29,219 said while the purse rose 25,925); a yard fee the server has not said, no Gold.
//   THE YARD THAT TOOK OVER a hunt (its plan, src/shell/hunt-after.js) leaves the hunt's line standing: the stamp's hunt ended while the
//     player was away and the server opened the training session after the stamp, so the line tells that hunt from what outlives it (the
//     Level, the death row) and then the yard. A 12 h hunt and a death went untold because the newest session was the yard's.
//     Its Gold, Kills and Best find are the hunt's own tally, which the envelope no longer carries (its analyzer is the yard's): the server's
//     answer for that one session, read once by the alert centre (src/session/past-hunt.js, post-patch audit B4); until it comes, none is said.
//   A SKILL THE ABSENCE TRAINED says its levels: the stamp keeps the server's level of the skill a training session (or the yard a hunt
//     goes on to) trains, and the return says "Melee 28 to 34" from two server answers.
// ════════════════════════════════════════════════════════════════════════
import { levelOf, deathLogOf } from '../session/character-sections.js?v=0.2.142';
import { huntOf, analyzerOf, serverNowOf, staminaOf, goldFloorOf } from '../session/hunt-sections.js?v=0.2.142';
import { nameOf, skillsOf } from '../session/item-sections.js?v=0.2.142';
import { huntAfterOf } from '../session/hunt-after-sections.js?v=0.2.142';
import { pastHuntOf } from '../session/past-hunt.js?v=0.2.142';
import { luckOf } from '../session/luck-sections.js?v=0.2.142';
import { AFTER_INDEX } from '../data/hunt-after.js?v=0.2.142';
import { deathWords } from './death-popup.js?v=0.2.142';
import { huntName } from '../session/party-sections.js?v=0.2.142';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.142';
import { cameHomeWords } from '../data/party-words.js?v=0.2.142';
import { whole } from '../render/format.js?v=0.2.142';
import { isWorkStamp, workStampOf, awayWorkLineOf, awayWorkSettled } from './away-work.js?v=0.2.142';
import { bestFind, END_WORDS, goldOutWords } from '../hunt-view/summary-model.js?v=0.2.142';
import { itemName } from './widgets/bits.js?v=0.2.142';
import { t } from '../render/player-text.js?v=0.2.142';
import { afterHuntOf, afterHuntWords, spanWords, spareSupplyOf, staminaFreeOf, WAITED_FROM_MS } from './after-hunt.js?v=0.2.142';
import { afterDoneWords } from './hunt-after.js?v=0.2.142';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.142';
import { trainingOf as trainedBy } from '../data/training.js?v=0.2.142';
import { trainingPhrase, yardPaidOf } from '../session/training-sections.js?v=0.2.142';
import { skillWord, endedWords as trainingEndWords } from './training-words.js?v=0.2.142';

/* Less time away than this is a reload or a quick look, not an absence. */
export const AWAY_MIN_MS = 10 * 60 * 1000;
/* A new hero's first return (see the header): the shortest absence its first line speaks of. */
export const FIRST_AWAY_MIN_MS = 3 * 60 * 1000;
/* A hero is new under the Level of the first ground past the tutorial room (hunt-tutorial.js: the coach's first hour ends there). */
const NEW_HERO_BELOW = HUNT_INDEX.meadowbrook_thicket.band[0];
/* How often the last-seen stamp is renewed while a hunt runs on screen, for a tab that dies with no goodbye. */
export const STAMP_EVERY_MS = AWAY_MIN_MS;
/* An end the server dates within this of the card coming up is the return's own (the settle catching up with a hunt that ran out while away), not one the player watched. */
const RETURN_SETTLE_MS = 2 * 60 * 1000;
const endedOnReturn = (h, a) => Number.isFinite(h.endedAtMs) && Number.isFinite(a.cameAt) && h.endedAtMs <= a.cameAt + RETURN_SETTLE_MS;
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

/* The coins this hero's hunt has taken, and the store gold its supplies took (the analyzer's session tally, `coins` and `waste`), or null. */
const coinsOf = (a) => (a && a.hero && Number.isSafeInteger(a.hero.gold) && a.hero.gold >= 0 ? a.hero.gold : null);
const spentOf = (a) => (a && a.hero && Number.isSafeInteger(a.hero.waste) && a.hero.waste >= 0 ? a.hero.waste : null);

/* The skill this session trains: a training session's own, or the yard skill the running hunt's plan goes on to (hunt_after.now,
   frozen at Enter), or null. */
function trainedSkillOf(cs, h) {
  const own = trainedBy(h.huntId);
  if (own) return own.skill;
  const a = huntAfterOf(cs);
  const row = a && a.now && a.now.session === h.sessionId ? AFTER_INDEX[a.now.choice] : null;
  return row && row.runs === 'training' && a.now.skill ? a.now.skill : null;
}

/** The numbers to stamp now (server's), or null when there is no hunt or the server has not said yet. */
function awayStampOf(cs, h) {
  const lv = levelOf(cs);
  const now = serverNowOf(cs);
  if (!h || !lv || !Number.isFinite(now)) return null;
  const a = analyzerOf(cs);
  const kills = a && a.hero && Number.isFinite(a.hero.kills) ? Math.floor(a.hero.kills) : null;
  const gold = coinsOf(a), sp = spentOf(a);
  const k = trainedSkillOf(cs, h);
  const sk = k ? (skillsOf(cs) || {})[k] : null;
  /* `mf`: the Magic Find the server said (the luck section, absent while Luck is dark), for the return's "Magic Find 15% to 16%" */
  const lk = luckOf(cs);
  /* `lv`: the Level the server said with that XP. The return compares it with the Level the server says then; a Level
     worked out here from the stamped XP would be this build's curve (character-sections.js levelOf). `sl` likewise for skill `k`. */
  return { s: h.sessionId, at: Math.floor(now), xp: lv.xp, lv: lv.level, ...(h.huntId ? { h: h.huntId } : {}), ...(gold !== null ? { gold } : {}),
    ...(gold !== null && sp !== null ? { sp } : {}), ...(kills !== null ? { kills } : {}), ...(sk ? { k, sx: sk.xp, sl: sk.level } : {}),
    ...(lk ? { mf: lk.magicFind } : {}) };
}

/** The gold the purse kept over the absence: { net, looted, paid, yard }, each two server answers, or null when the stamp kept no store spend
    (a stamp from before `sp`: the coins alone are never said as gold). `yard`: what the yard that took over billed (all of it inside the
    absence: it opened after the stamp), the server's; null when it has not said, and then no gold is said (post-140 audit C3). */
function goldOf(was, a, yard = 0) {
  const coins = coinsOf(a), spent = spentOf(a);
  if (!Number.isSafeInteger(was.gold) || !Number.isSafeInteger(was.sp) || coins === null || spent === null || !Number.isSafeInteger(yard)) return null;
  const looted = Math.max(0, coins - was.gold), paid = Math.max(0, spent - was.sp);
  return looted || paid || yard ? { net: looted - paid - yard, looted, paid, yard } : null;
}

/** The trained skill's levels over the absence: { skill, from, to, xp }, two server answers, or null (no skill stamped, no gain). */
function trainOf(cs, was) {
  const sk = typeof was.k === 'string' ? (skillsOf(cs) || {})[was.k] : null;
  if (!sk || !Number.isSafeInteger(was.sl) || !Number.isSafeInteger(was.sx) || sk.xp <= was.sx) return null;
  return { skill: was.k, from: was.sl, to: sk.level, xp: sk.xp - was.sx };
}
/* "Melee 28 to 34, +120,000 Melee XP" (the level only when it rose). */
const trainWords = (tr) => (tr.to > tr.from ? [skillWord(tr.skill) + ' ' + tr.from + ' to ' + tr.to] : []).concat(signed(tr.xp, skillWord(tr.skill) + ' XP'));

/**
 * THE YARD TOOK OVER (see the header): `h`, the session the server says now, is a training session it opened after the stamp's hunt
 * ended (its plan), so that hunt's line still stands. The server's own link while the yard runs (hunt_after.last names the stamp's
 * hunt, the newest ended one), else the yard's start past the stamp. A training stamp is never taken over: the plan opens none after one.
 */
function yardTookOver(cs, was, h) {
  if (!trainedBy(h.huntId) || (typeof was.h === 'string' && trainedBy(was.h))) return false;
  const a = huntAfterOf(cs);
  if (a && a.last && a.last.session === was.s) return true;
  return Number.isFinite(h.huntFromMs) && h.huntFromMs > was.at;
}

/* The death that ended the stamp's hunt, in the death popup's words (every number the server's row), or ''. `card`: the card's line, which
   leaves the Level it took to the card's own Level line ("Level 12 → 11"). */
function diedWords(cs, session, card = false) {
  const log = deathLogOf(cs);
  const row = log ? log.find((r) => r.session === session) : null;
  if (!row) return '';
  const w = deathWords(cs, { session, row });
  return [w.title, w.killed, w.lost, card ? '' : w.level, w.saved].filter(Boolean).map(dot).join(' ');
}

/**
 * The away line for this character against its stamp, or null. Pure (reads the sections and the residue).
 * @returns {{id: string, kind: 'away', session: string, text: string, said?: string, ended?: boolean, at?: number, cameAt?: number, minutes?: number, levels?: number, facts?: object}|null}
 */
export function awayRecapOf(cs) {
  return awayRecapFrom(cs, stampOf(cs));
}

/** awayRecapOf against a given stamp `was` (the line keeps its own, `stamp`: the alert centre judges it again once the hunt the yard took
    over has been read, src/session/past-hunt.js, whether or not the residue has moved on since). Pure. */
export function awayRecapFrom(cs, was) {
  /* A hero working in town when the player left: what the job did (./away-work.js). */
  if (isWorkStamp(was)) {
    const now = serverNowOf(cs);
    return Number.isFinite(now) && now - was.at >= AWAY_MIN_MS && awayWorkSettled(cs, was, AWAY_MIN_MS) ? awayWorkLineOf(cs, was, awayWords) : null;
  }
  const h = huntOf(cs);
  const lv = levelOf(cs);
  const now = serverNowOf(cs);
  if (!was || !h || !lv || !Number.isFinite(now)) return null;
  /* the session the stamp is of, or the yard that took over from it (the header); any other session is never compared with the stamp's */
  const over = h.sessionId !== was.s;
  if (over && !yardTookOver(cs, was, h)) return null;
  const gone = now - was.at;
  if (gone < awayMinMsOf(cs, was)) return null;
  /* A hunt that was over when the player left is no part of the absence (crafter's panel 2026-11-01). */
  if (!over && h.ended && Number.isFinite(h.endedAtMs) && h.endedAtMs <= was.at) return null;
  const name = nameOf(cs) || 'Hero';
  /* A TRAINING SESSION is no hunt (Tyler 2026-11-16): "Wren trained Ranged at the Training Yard", never "hunted Training Yard". */
  const yard = over ? null : trainingPhrase(h.huntId);
  /* the stamp's hunt: the session's own, else (the yard took over) the ground the stamp or its death row names */
  const died = over ? diedWords(cs, was.s) : '';
  const deathRow = over ? (deathLogOf(cs) || []).find((r) => r.session === was.s) : null;
  const hunt = !over ? h.huntId : typeof was.h === 'string' ? was.h : deathRow ? deathRow.hunt : null;
  const parts = [];
  /* two server answers, the stamp's Level and this one's; a stamp from before `lv` was kept says no Levels, only the XP */
  const from = Number.isSafeInteger(was.lv) && was.lv >= 1 ? was.lv : null;
  if (from !== null && lv.level > from) parts.push('Level ' + from + ' to ' + lv.level);
  if (lv.xp > was.xp) parts.push(signed(lv.xp - was.xp, 'Level XP'));
  /* the hunt's own tally (gold, kills, its best find) is the session's. Once the yard took over, the envelope's analyzer is the yard's: the
     hunt's is the server's answer for that session (src/session/past-hunt.js, audit 2026-11-18-139 B4), and until it has come nothing is guessed */
  const a = over ? pastHuntOf(cs, was.s) : analyzerOf(cs);
  /* ...and the yard that took over bills the same purse: its fee is in the Gold, or the card says more than the purse moved (C3) */
  const gold = goldOf(was, a, over ? yardPaidOf(cs, h) : 0);
  if (gold) parts.push(signed(gold.net, 'gold'));
  const kills = a && a.hero && Number.isFinite(a.hero.kills) && Number.isSafeInteger(was.kills) ? Math.floor(a.hero.kills) - was.kills : null;
  if (kills !== null && kills > 0) parts.push(whole(kills) + ' kills');
  /* LUCK (src/data/luck.js, itemization plan §15 "Return card"): the Magic Find the absence brought, two server answers (the stamp's and the
     luck section now). Dark, or a stamp from before `mf`, says nothing. */
  const lk = luckOf(cs);
  const mfFrom = lk && Number.isSafeInteger(was.mf) && lk.magicFind > was.mf ? was.mf : null;
  if (mfFrom !== null) parts.push(t('luck.away', { from: mfFrom, to: lk.magicFind }));
  const train = over || yard ? trainOf(cs, was) : null;
  if (train && yard) parts.push(...trainWords(train));
  /* one sentence a fact, never clauses on colons (QA audit 2026-11-18 N6): "Away 7 days. Wren hunted Mill Cellar. Level 5 to 10, +1,200 Level XP." */
  const head = t('away.card_head', { time: awayWords(gone),
    who: yard ? t('training.away_trained', { name, skill: skillWord(trainedBy(h.huntId).skill), at: yard.at })
      : hunt ? t('away.card_hunted', { name, ground: huntName(hunt) }) : t('away.card_hunted_off', { name }) });
  /* the hunt's best find, gear or a Rare, from the server's loot tally (designer re-read 2026-11-11: the card never named the Iron Platebody). The
     tally is the whole hunt's, so the line says so: the stamp holds no loot, and the absence alone is not known here. */
  const best = a && a.hero ? bestFind(a.hero.loot) : null;
  /* the yard that took over: how the hunt ended when the server knows (a death), then the yard and what it trained */
  const then = over ? t('away.done_started', { name, skill: skillWord(trainedBy(h.huntId).skill) }) : '';
  const tail = over ? [died, then, train ? dot(trainWords(train).join(', ')) : ''].filter(Boolean).join(' ') : '';
  const said = head + (parts.length ? ' ' + t('away.card_facts', { facts: parts.join(', ') }) : '') + (best ? ' ' + t('hunts.away_best', { item: itemName(best) }) + '.' : '')
    + (tail ? ' ' + tail : '');
  /* `minutes`, `levels`: the absence and the Levels gained, as the line says them (telemetry reads them, alerts.js: nothing else does).
     `facts`: the same differences for the away card (windows/away.js, UI audit 2026-11-18 #2), each two server answers or null. The id is the
     stamp's, so a line is told once whichever session it follows; `session` is the one the record says now (awayLineNow follows it). */
  return { id: 'away:' + was.s.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 64) + ':' + was.at, kind: 'away', session: h.sessionId, said, ended: h.ended,
    at: was.at, cameAt: now, minutes: Math.floor(gone / 60000), levels: from !== null ? Math.max(0, lv.level - from) : 0,
    facts: { name, hunt, place: yard ? yard.doing : hunt ? huntName(hunt) : '', gone, lvFrom: from, lvTo: lv.level, xp: Math.max(0, lv.xp - was.xp),
      gold: gold ? gold.net : null, looted: gold ? gold.looted : null, paid: gold ? gold.paid : null, yard: gold ? gold.yard : null, kills: kills !== null ? Math.max(0, kills) : null, best,
      mfFrom, mfTo: mfFrom !== null ? lk.magicFind : null,
      train, died: over ? diedWords(cs, was.s, true) : '', after: then, tookOver: over,
      /* `ask`: the session whose tally the line still waits for; `deathSession`: a death during the absence (the card's Bless again) */
      ask: over && !a ? was.s : null, deathSession: over ? (deathRow ? was.s : null) : h.ended && h.endReason === 'died' ? h.sessionId : null },
    stamp: was,
    text: (said + nowWords(cs, h, now)).trim() };
}

/* The end reasons and next-thing lines are labels with no period (src/data/text/summary.js, away.js); in this card's prose each one ends a sentence. */
const dot = (s) => (s && !/[.!?…]$/.test(s) ? s + '.' : s);

/**
 * What the hunt is doing now, from the envelope, as facts (the away card draws them, nowWords says them): `ended`, `ago` how long ago it
 * ended ("6 days", '' when just now or when a wait says the time itself), `why` its end in words, `next` what the hero did after,
 * `stamina` the stamina left in words (none on a training session: the yard spends none, Tyler 2026-11-16), `training`.
 */
function nowFacts(cs, h, now) {
  const name = nameOf(cs) || 'Hero';
  const where = huntName(h.huntId);
  const st = staminaOf(cs);
  const stamina = st && st.msLeft > 0 ? awayWords(st.msLeft) : null;
  /* WHAT CAME AFTER (./after-hunt.js, designer re-read 2026-11-11 #2): the job the server put the hero back on, or how long it
     waited in town and the one thing that would have filled that time. A wait says the time itself, so "ago" is not said twice. */
  const state = h.ended && typeof cs.read === 'function' ? cs.read('state') : null;
  const after = h.ended ? afterHuntOf(state, h, now) : null;
  const waited = !!after && after.kind === 'waited' && after.idleMs >= WAITED_FROM_MS;
  const ago = h.ended && !waited && Number.isFinite(h.endedAtMs) && now - h.endedAtMs >= AWAY_MIN_MS ? awayWords(now - h.endedAtMs) : '';
  /* the hunt's own choice first (Tyler 2026-11-15, the itinerary): gone to the yard, or why it waited instead */
  const done = h.ended ? afterDoneWords(cs, h.sessionId, name) : '';
  const said = done || (after ? afterHuntWords(state, h, now, name, spareSupplyOf(cs), staminaFreeOf(cs).flatMap((l) => l.words)) : '');
  const next = said ? dot(said) : '';
  /* the stamina end's sentence already names the stamina-free loops, so the away card's row of them goes without its own line */
  const freeSaid = !done && !!after && after.kind === 'waited' && after.next === 'away.next_stamina' && !!said;
  if (trainedBy(h.huntId)) return { training: true, ended: h.ended, ago, why: h.ended ? trainingEndWords({ reason: h.endReason }) : '', next, stamina: null };
  /* a friend's end says what ended it (`end_by_why`, the alert's and the summary's words): "left the hunt" for a friend whose stamina ran out was the panel's report */
  /* OUT OF GOLD SAYS WHY (post-patch audit 2026-11-18 B3): what the store's supplies cost against the coins, the hunt's own tally, and the
     reserve it fell to, the server's setting (summary-model.js goldOutWords, the end card's same words) */
  const tally = h.ended && h.endReason === 'gold_out' ? analyzerOf(cs) : null;
  const goldOut = h.ended && h.endReason === 'gold_out'
    ? goldOutWords(tally && tally.hero ? { gold: tally.hero.gold, lootValue: tally.hero.lootValue, balance: tally.hero.balance } : {}, goldFloorOf(cs)) : '';
  const why = goldOut ? dot(goldOut) : h.ended ? dot((cameHomeWords(h.endReason, h.endBy, h.endWhy, name) || STAMINA_WORDS[h.endReason] || END_WORDS[h.endReason] || '')
    .replace('{name}', name).replace('{ground}', where).replace('{item}', 'a supply').replace('{hunt}', 'another hunt')) : '';
  return { training: false, ended: h.ended, ago, why, next, stamina, freeSaid };
}

/* What the hunt is doing now, in the line's words: the stamina left, or how long ago it ended and the stamina rested since. */
function nowWords(cs, h, now) {
  const f = nowFacts(cs, h, now);
  const then = f.next ? ' ' + f.next : '';
  /* A TRAINING SESSION says its own label ("Training ended (out of gold), 2 h 5 min ago."), and no stamina. */
  if (f.training) {
    if (!f.ended) return ' ' + t('training.away_still');
    return ' ' + (f.ago ? t('training.away_ended_ago', { why: f.why, time: f.ago }) : f.why + '.') + then;
  }
  return f.ended
    ? ' ' + (f.ago ? t('away.card_ended_ago', { time: f.ago }) : t('away.card_ended')) + ' ' + f.why + then + (f.stamina ? ' Stamina now: ' + f.stamina + '.' : '')
    : f.stamina ? ' Still hunting, with ' + f.stamina + ' of stamina left.' : ' Still hunting.';
}

/**
 * THE AWAY CARD'S NOW (UI audit 2026-11-18 #2; windows/away.js): the facts of the alert `a`'s hunt as the record says them now, or null when
 * the line is over (awayLineNow) or is a town job's (its words are its own). Pure.
 */
export function awayNowOf(cs, a) {
  if (!a || a.work || awayLineNow(cs, a) === null) return null;
  const h = huntOf(cs), now = serverNowOf(cs);
  return h && Number.isFinite(now) ? nowFacts(cs, h, now) : null;
}

/**
 * The away alert `a` (awayRecapOf's) as the record says it now, or null when it is over: another hunt is the character's now, or
 * the hunt was running when the card came up and has ended since (past the return's own settle, endedOnReturn). Pure.
 */
export function awayLineNow(cs, a) {
  const h = huntOf(cs);
  if (a.work) { const w = workStampOf(cs); return (a.still && !(w && w.s === a.work)) || (h && !h.ended) ? null : a.text; }
  if (!h || h.sessionId !== a.session || (h.ended && !a.ended && !endedOnReturn(h, a))) return null;
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
 * ONCE SEEN, IT'S SEEN (full-game audit 2026-11-18 A23: another hero's card, "Away 216 h ... Bryony hunted Wickstead", came back on every
 * return for nine days): a line over an ended hunt the player has read (`told`, the alert centre's) moves the stamp past it, so no later
 * return can raise it again, whatever its id or the saved list's bound.
 * @param {object} cs
 * @param {boolean} [leaving]  the page is being left: the stamp is now, unless the last one is under LEAVE_EVERY_MS old
 * @param {(id: string) => boolean} [told]  has the line with this id been shown and read
 */
export function stampAway(cs, leaving = false, told = null) {
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
    const due = awayRecapOf(cs);
    /* a line read is retired: the stamp lands past the end, where no line is due (its own write re-runs this and finds none) */
    if (due && typeof told === 'function' && told(due.id) && next.at >= h.endedAtMs) return cs.setResidue('awaySeen', next);
    /* only the hunt this stamp is for, once (this stamp lands past the end, the last one before it: a write re-runs this through its
       listeners, so a clock short of the end must not stamp at all), and never over a line still due: a new stamp would be a new line about the same hunt */
    if (!was || was.s !== next.s || !(was.at < h.endedAtMs && next.at >= h.endedAtMs) || due) return false;
  } else if (was && was.s === next.s && next.at - was.at < Math.min(awayMinMsOf(cs, null), (leaving ? LEAVE_EVERY_MS : STAMP_EVERY_MS))) return false;
  return cs.setResidue('awaySeen', next);
}
