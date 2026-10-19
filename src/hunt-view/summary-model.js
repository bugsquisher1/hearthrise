// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/summary-model.js — THE END-OF-HUNT SUMMARY, FROM SERVER FACTS (QoL 8).
//
// PURE (no DOM, no clock). When a hunt's session ends (any END_ORDER reason)
// the player gets one card: how long, kills, XP, gold, top loot, supplies used
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
import { sanitizeSummary, sanitizeSummaries } from '../session/hunt-summaries.js?v=0.2.9';

export { sanitizeSummaries };


/** Why a hunt ended, as a sentence (one per END_ORDER name; a guard in tests/hunt-summary.mjs keeps them equal). */
export const END_WORDS = Object.freeze({
  died: 'Your hero died and returned to town.',
  party_member_died: 'A party member died, so the party returned to town.',
  heals_out: 'You ran out of healing supplies.',
  ammo_out: 'You ran out of ammunition.',
  gold_out: 'Ran out of gold for supplies, returned to town.',
  rule: 'One of your stop rules was met, so you headed home.',
  stamina: 'Your stamina ran out.',
  hours: 'The hunt reached its time limit.',
  left: 'You left the hunt.',
  changed: 'You moved on to another hunt.',
  server: 'The hunt was ended by the server.',
});

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const ID = /^[a-z0-9_]{1,64}$/;
const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const ms = (v) => { if (typeof v === 'number' && Number.isFinite(v)) return v; const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

/** The plain-words end reason; an unknown name still reads as a sentence. */
export function endWords(reason) { return END_WORDS[reason] || 'The hunt ended.'; }

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
  const t = s.tally || {};
  const dur = an && an.sessionMs !== null && an.sessionMs !== undefined ? an.sessionMs
    : s.enteredMs !== null && s.endedMs !== null ? Math.max(0, s.endedMs - s.enteredMs) : null;
  const loot = hero ? hero.loot.filter((l) => id(l.item) && num(l.count) !== null).map((l) => [l.item, l.count]) : countPairs(t.loot);
  loot.sort((a, b) => b[1] - a[1]);
  const supplies = hero ? hero.supplies.filter((x) => id(x.item) && num(x.count) !== null).map((x) => [x.item, x.source, x.count])
    : countPairs(t.supplies).map(([item, n]) => [item, 'own', n]);
  return sanitizeSummary({
    id: s.id, hunt: s.hunt, at: s.endedMs, reason: s.reason, ms: dur,
    kills: hero ? hero.kills : int(t.kills), xp: hero ? hero.xp : num(t.xp), gold: hero ? hero.gold : num(t.coins),
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
