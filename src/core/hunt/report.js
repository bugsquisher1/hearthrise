// ============================================================
// src/core/hunt/report.js — THE HUNT REPORT'S COUNTERS (GR-66; build plan FB-7)
//
// What the report reads after every hunt, counted off a window's events by the
// analyzer tally (./tally.js tallyEvents, one `report` a hero) and folded
// window by window, the same way the database folds them (hr_hunt_report_add,
// supabase/migrations/1053-hunt-report.sql). Display counters only: no value
// moves on them and nothing spends them.
//
//   low    the LOWEST HEALTH the hero reached: { pm (permille of its max HP
//          after the blow), by (the monster kind that struck it), blow (the
//          ability, 'basic' for a swing), at (the blow's server instant) }.
//          A `dmg` at a hero carries its HP after the blow and its max
//          (damage.js landHit `hp`, `max`). The lowest wins; a tie keeps the
//          earlier blow, so the fold is the same however windows are cut.
//          null until the hero is struck.
//   close  CLOSE CALLS: blows that took the hero from at least a quarter of
//          its health to under it (data/hunt-report.js closeCallPm). Each is
//          read off its own blow (HP before = HP after + the blow), so no
//          window needs the one before it.
//   fired  each bar rule's uses: { rule id: n } off `cast`, `shot`, `eat` and
//          `drink` events the bar picked (they name their `rule`).
//   waits  why a rule whose conditions held could not act: { rule id:
//          { why: n } } off `rule_wait` (conditions.js noteWait: once per
//          change, persisted on the unit, so a cut never repeats one).
// The edge adds what the events do not hold (hr-accrue accrue-hunt.js): the
// bar as played (`bar`) and the gear worn (`gear`); the database adds when an
// own stack ran dry (`dry`, its own hunt_session_events rows).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_REPORT } from '../../data/hunt-report.js';

/** A report with nothing in it. */
export function emptyReport() {
  return { low: null, close: 0, fired: {}, waits: {} };
}

const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const bump = (o, k, n) => { o[k] = (o[k] || 0) + n; };

/* The lower of two lowest-health readings: the lower share, a tie to the earlier blow. */
function lower(a, b) {
  if (!isMap(b)) return a ? Object.assign({}, a) : null;
  if (!isMap(a)) return Object.assign({}, b);
  if (b.pm < a.pm || (b.pm === a.pm && b.at < a.at)) return Object.assign({}, b);
  return Object.assign({}, a);
}

/**
 * Credit one event to the reports of the heroes it names. `reportOf(id, ev)`
 * answers that hero's report (the tally makes it); `ids` the heroes, `kinds`
 * every unit's kind.
 */
export function reportEvent(ev, ids, kinds, reportOf) {
  switch (ev.type) {
    case 'dmg': {
      /* a blow at a hero from anyone but a hero, with its HP after it and its max */
      if (!ids.has(ev.t) || ids.has(ev.u)) return;
      const hp = nat(ev.hp), max = nat(ev.max), amount = nat(ev.amount);
      if (hp === null || max === null || max <= 0 || amount === null) return;
      const r = reportOf(ev.t, ev);
      const line = HUNT_REPORT.closeCallPm;
      if ((hp + amount) * 1000 >= max * line && hp * 1000 < max * line) r.close += 1;
      const pm = Math.min(1000, Math.floor((hp * 1000) / max));
      r.low = lower(r.low, { pm, by: (ev.u !== null && kinds[ev.u]) || 'unknown', blow: ev.ability || 'basic', at: ev.atMs });
      return;
    }
    case 'cast': case 'shot': case 'eat': case 'drink':
      if (ids.has(ev.u) && typeof ev.rule === 'string' && ev.rule) bump(reportOf(ev.u, ev).fired, ev.rule, 1);
      return;
    case 'rule_wait': {
      if (!ids.has(ev.u) || typeof ev.rule !== 'string' || !ev.rule || typeof ev.why !== 'string' || !ev.why) return;
      const w = reportOf(ev.u, ev).waits;
      if (!isMap(w[ev.rule])) w[ev.rule] = {};
      bump(w[ev.rule], ev.why, 1);
      return;
    }
    default:
  }
}

/* Count maps added key by key (two levels for `waits`). */
function addCounts(a, b, deep) {
  const out = {};
  for (const src of [a, b]) {
    if (!isMap(src)) continue;
    for (const [k, v] of Object.entries(src)) {
      if (deep) out[k] = addCounts(out[k], v, false);
      else if (Number.isFinite(v)) out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

/**
 * Two reports folded into a NEW one (neither is changed): the lower `low`,
 * `close`, `fired` and `waits` added, and for what a window states whole
 * (`bar`, `gear`) the later one's; `dry` keeps each item's first instant.
 * The database's hr_hunt_report_add is the same fold.
 */
export function addReport(a, b) {
  const x = isMap(a) ? a : emptyReport(), y = isMap(b) ? b : emptyReport();
  const out = { low: lower(x.low, y.low), close: (nat(x.close) || 0) + (nat(y.close) || 0),
    fired: addCounts(x.fired, y.fired, false), waits: addCounts(x.waits, y.waits, true) };
  for (const k of ['bar', 'gear']) { const v = k in y ? y[k] : x[k]; if (v !== undefined) out[k] = v; }
  if (isMap(x.dry) || isMap(y.dry)) {
    const dry = Object.assign({}, x.dry);
    for (const [item, at] of Object.entries(isMap(y.dry) ? y.dry : {})) if (!(item in dry) || at < dry[item]) dry[item] = at;
    out.dry = dry;
  }
  return out;
}

/**
 * THE ONE WORD (GR-66): 'near' when a hero fell under a tenth of its health or
 * the hunt held three or more close calls, 'close' when a hero fell under
 * half, else 'safe'. `lowPm` null (never struck) reads as whole health.
 */
export function riskWord(lowPm, close) {
  const pm = Number.isFinite(lowPm) ? lowPm : 1000;
  if (pm < HUNT_REPORT.nearPm || (Number(close) || 0) >= HUNT_REPORT.nearCalls) return 'near';
  if (pm < HUNT_REPORT.closePm) return 'close';
  return 'safe';
}

/** A party's reading from its heroes' reports: the lowest health of any hero, and every hero's close calls. */
export function partyRisk(reports) {
  let low = null, close = 0;
  for (const r of Array.isArray(reports) ? reports : []) {
    if (!isMap(r)) continue;
    low = lower(low, r.low);
    close += nat(r.close) || 0;
  }
  return { low, close, word: riskWord(low ? low.pm : null, close) };
}
