// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/summary-model.js — THE END-OF-HUNT SUMMARY, FROM SERVER FACTS (QoL 8).
//
// PURE (no DOM, no clock). When a hunt's session ends (any END_ORDER reason)
// the player gets one card: how long, kills, XP, gold, balance per hour (raw XP
// per hour for premium), top loot, supplies used
// from the bag vs the store, why it ended in plain words, and the settings to
// go again. Every number is read off the server's own sections:
//   `hunt`           the session (id, hunt, preset, limits, bag, tally, end_reason)
//   `hunt_analyzer`  the session's stats (premium only)
// The card never computes a tally; where a field is missing the card omits it.
//
// The last HISTORY_MAX summaries per character live in the display-only
// residue field `huntSummaries` (src/session/residue.js). Nothing here gates
// or spends anything: "Hunt again" sends the session's own settings back as
// ONE hr_hunt_enter intent, and the server re-checks every one of them.
//
// Reading `hunt`: the server's session record sits under `hunt.session` (the
// section view) and, in the client fixture, flat on `hunt`. Both are read.
// ════════════════════════════════════════════════════════════════════════
import { sanitizeSummary, sanitizeSummaries } from '../session/hunt-summaries.js?v=0.2.77';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.77';

export { sanitizeSummaries };


/** Why a hunt ended, as a sentence (one per END_ORDER name; a guard in tests/hunt-summary.mjs keeps them equal). */
export const END_WORDS = Object.freeze({
  died: 'Your hero died and returned to town.',
  party_member_died: 'A party member fell, so your hero came home too.',
  party_member_left: 'A party member left the hunt, so your hero came home too.',
  heals_out: 'You ran out of healing supplies.',
  ammo_out: 'You ran out of ammunition.',
  gold_out: 'Ran out of gold for supplies, returned to town.',
  rule: 'One of your stop rules was met, so you headed home.',
  stamina: 'Your stamina ran out.',
  hours: 'The hunt reached its time limit.',
  left: 'You left the hunt.',
  changed: 'You moved on to another hunt.',
  no_fight: END_REASON_COPY.no_fight.one,
  server: 'The hunt was ended by the server.',
});

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const ID = /^[a-z0-9_]{1,64}$/;
const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const ms = (v) => { if (typeof v === 'number' && Number.isFinite(v)) return v; const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

/* A hunt ended by the refused-window rule (the session's server-stated `forfeit`: six refused windows in a
   row, hr_hunt_forfeit): what was lost and why, never "by the server" (2026-11-17-hunt-density-home.sql). */
export const FORFEIT_WORDS = Object.freeze({
  server: 'Your hunt was stopped because the server could not accept its last few minutes; nothing from them was counted.',
  left: 'You left the hunt. The server could not accept its last few minutes, so nothing from them was counted.',
});

/** The plain-words end reason (`forfeit`: the server forfeited the hunt's last window); an unknown name still reads as a sentence.
    LEAVE TOGETHER: a hero sent home by another member's end names that member (`by`, the server's end_by) and itself
    (`hero`), "Mira left the hunt, so Oren came home too." (hunt-sessions.js END_REASON_COPY). */
export function endWords(reason, forfeit, by, hero) {
  if (typeof by === 'string' && by && (reason === 'party_member_left' || reason === 'party_member_died')) {
    return END_REASON_COPY[reason].one.replace('{member}', by).replace('{name}', (typeof hero === 'string' && hero) || 'your hero');
  }
  return (forfeit === true && FORFEIT_WORDS[reason]) || END_WORDS[reason] || 'The hunt ended.';
}

/* A tally's loot / supplies, whichever shape the server sent: {item: n}, [{item, count}] or {item: {own, store}}. */
function countPairs(v) {
  const out = [];
  if (Array.isArray(v)) for (const l of v) { if (isObj(l) && id(l.item) && num(l.count) !== null) out.push([l.item, l.count]); }
  else if (isObj(v)) for (const [k, n] of Object.entries(v)) if (id(k) && num(n) !== null) out.push([k, n]);
  return out;
}

/**
 * The hunt section's session, read tolerantly. Null when there is no session
 * or it is still open (`ended` false).
 */
export function endedSessionOf(cs) {
  const h = cs && typeof cs.read === 'function' ? cs.read('hunt') : null;
  if (!isObj(h)) return null;
  const s = isObj(h.session) ? h.session : h;
  const sid = typeof s.id === 'string' ? s.id : typeof s.session_id === 'string' ? s.session_id : typeof h.session_id === 'string' ? h.session_id : null;
  if (!sid) return null;
  const ended = h.ended === true || s.ended === true || s.phase === 'ended' || s.ended_at != null;
  const bag = [];
  if (Array.isArray(s.bag)) {
    for (const b of s.bag.slice(0, 64)) if (isObj(b) && id(b.item) && int(b.loaded) !== null && b.loaded > 0) bag.push([b.item, b.loaded, b.essential === true ? 1 : 0]);
  }
  return {
    id: sid.slice(0, 64), ended,
    hunt: id(s.hunt) || id(s.hunt_id) || id(h.hunt_id), reason: typeof s.end_reason === 'string' ? s.end_reason : typeof h.end_reason === 'string' ? h.end_reason : null,
    /* The server says the hunt's last window was forfeited (hr_hunt_view `forfeit`). */
    forfeit: s.forfeit === true,
    /* LEAVE TOGETHER: the member whose end sent this hero home (hr_hunt_view `end_by`), or null. */
    by: typeof s.end_by === 'string' && s.end_by.trim() ? s.end_by.trim().slice(0, 40) : null,
    preset: int(s.preset), hoursLimit: int(s.hours_limit),
    enteredMs: ms(s.entered_at), endedMs: ms(s.ended_at), bag,
    tally: isObj(s.tally) ? s.tally : null,
    died: int(isObj(s.tally) ? s.tally.deaths : null),
  };
}

/**
 * The summary record for an ended session.
 * @param {object} s         endedSessionOf(cs)
 * @param {object|null} an   analyzerOf(cs) (hunt-sections.js) or null
 * @param {string[]} deaths  the death explanations' headlines (death-explain.js)
 */
export function buildSummary(s, an, deaths) {
  const hero = an && an.hero;
  const ph = hero && hero.perHour ? hero.perHour : null;
  const t = s.tally || {};
  const dur = an && an.sessionMs !== null && an.sessionMs !== undefined ? an.sessionMs
    : s.enteredMs !== null && s.endedMs !== null ? Math.max(0, s.endedMs - s.enteredMs) : null;
  const loot = hero ? hero.loot.filter((l) => id(l.item) && num(l.count) !== null).map((l) => [l.item, l.count]) : countPairs(t.loot);
  loot.sort((a, b) => b[1] - a[1]);
  const supplies = hero ? hero.supplies.filter((x) => id(x.item) && num(x.count) !== null).map((x) => [x.item, x.source, x.count])
    : countPairs(t.supplies).map(([item, n]) => [item, 'own', n]);
  return sanitizeSummary({
    id: s.id, hunt: s.hunt, at: s.endedMs, reason: s.reason, forfeit: s.forfeit === true, by: s.by || null, ms: dur,
    /* `xp` is LEVEL XP only (the tally's `level` key), never Level plus training (Tyler 2026-10-22). */
    kills: hero ? hero.kills : int(t.kills), xp: hero ? hero.levelXp : isObj(t.xp) ? num(t.xp.level) : num(t.xp), gold: hero ? hero.gold : num(t.coins),
    /* `gold` is coin received (the server's coins); the loot's shop price is its own line (Brannoc 10-22). */
    lootValue: hero ? hero.lootValue : null,
    /* The hunt's BALANCE, the server's own (coins + loot value - store supplies): it is there from the first kill,
       where the per-hour figure waits for 10 minutes (core-loop play 2026-10-30: a first 4-minute hunt read "–"). */
    balance: hero ? hero.balance : null,
    /* Per hour, the server's (hr_hunt_stats_of per_hour): balance for every character; Level XP before bonuses
       only when the server sent it (premium: the basic analyzer carries no raw_xp). Never divided here. */
    balanceH: ph ? ph.balance : null, rawXpH: ph ? ph.rawLevelXp : null,
    died: s.died, loot, supplies,
    preset: s.preset, hoursLimit: s.hoursLimit, bag: s.bag, deaths,
  });
}

/** The list with `summary` first (replacing the same session id), bounded. */
export function withSummary(list, summary) {
  const rest = (Array.isArray(list) ? list : []).filter((x) => x.id !== summary.id);
  return sanitizeSummaries([summary, ...rest]);
}

/**
 * The ONE hr_hunt_enter argument set that puts the same hunt back on: the same
 * ground, preset, limits and bag. The party is the server's (the character's
 * current party); the server checks stock, stamina and the ground again.
 * @returns {{hunt: string, bag: {item: string, qty: number, essential?: boolean}[], preset: number, hours: number|null}|null}
 */
export function huntAgainOf(summary) {
  if (!summary || !summary.hunt || summary.preset === null) return null;
  return {
    hunt: summary.hunt, preset: summary.preset, hours: summary.hoursLimit,
    bag: summary.bag.map(([item, qty, ess]) => (ess ? { item, qty, essential: true } : { item, qty })),
  };
}

/**
 * Hunt again with what the bag holds NOW (`pack`: hunt-list.js packFor, Enter's own), never the old hunt's loaded counts:
 * the supplies it ate are gone, so the old counts were refused as "You no longer have that many." while Enter went in
 * at once (blind playtest 2026-10-31). What stays the old hunt's: the ground, the set, the limits, its essential marks.
 */
export function againWithBag(args, pack) {
  const essential = new Set(args.bag.filter((l) => l.essential === true).map((l) => l.item));
  return Object.assign({}, args, { bag: pack.map((l) => (essential.has(l.item) ? { item: l.item, qty: l.qty, essential: true } : { item: l.item, qty: l.qty })) });
}

/**
 * A hero's last-seen vitals and the event buffer for one character's current
 * hunt. `names.name(u)` / `names.isHero(u)` resolve at arrival (the pose
 * forgets a unit once it is gone). An event id counts once; the buffer is the
 * newest `max` events only.
 * @param {{max?: number, names: {name: (u: number) => string, isHero: (u: number) => boolean}}} o
 */
export function createRecorder(o) {
  const max = o.max || 600;
  const seen = new Set();
  let events = [];
  return {
    /** @returns {boolean} true when the event was new */
    add(ev, vitalsOf) {
      if (!ev || typeof ev.type !== 'string') return false;
      const key = ev.key !== undefined ? 'k:' + ev.key : ev.id !== undefined ? 'i:' + ev.id : null;
      if (key === null || seen.has(key)) return false;
      seen.add(key);
      const row = Object.assign({}, ev, { an: Number.isInteger(ev.u) ? o.names.name(ev.u) : undefined, tn: Number.isInteger(ev.t) ? o.names.name(ev.t) : undefined });
      if (ev.type === 'death' && typeof vitalsOf === 'function') row.vitals = vitalsOf(ev.u);
      events.push(row);
      if (events.length > max) {
        const cut = events.splice(0, events.length - max);
        for (const c of cut) seen.delete(c.key !== undefined ? 'k:' + c.key : 'i:' + c.id);
      }
      return true;
    },
    events: () => events,
    reset() { events = []; seen.clear(); },
  };
}
