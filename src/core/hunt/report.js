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
//   deep   ON THE DANGER SCALE (danger.js pullEnds' `danger` events; R2,
//          lane/r2-danger-falls): the deepest step the company stood at, a
//          pull made or a step reached. Absent off the scale.
//   falls  ON THE DANGER SCALE: each fall back and each death, [{ at (the
//          pull's end, server instant), from, to (the steps), hero (the
//          seat of the hero that broke the pull off; absent when it had
//          none), pm (its HP permille then, 0: it died), monster (the kind
//          whose blow took it there, 'unknown' for none) }], oldest first,
//          the last HUNT_REPORT.fallsMax kept. One entry an instant, so the
//          party's fold of its heroes (each credited the company's falls)
//          and any cut of the windows keep the same list. Absent with none.
//   Both are the company's: every hero of the hunt is credited them alike.
//   THE LEDGER (19-power-ledger L7), ON THE DANGER SCALE (the tally's roster carries `scale`: the step the window ended at, its span and
//   each hero's seat; off it none of these is counted):
//   heal   the company's healing by source: { ability | item | 'heal': n } off every hero's `heal` (a monster's mend is no hero's),
//          credited to every hero alike
//   took   the company's damage taken by seat: { seat: n } off every blow at a hero from anyone but a hero, every hero alike
//   sup    the hero's OWN store bill and time by held step: { bucket: [gold, ms] }, the bucket the step's first HUNT_REPORT.supStep
//          multiple. The step at an event is walked off the window's `danger` events (the step changes only where a pull ends): the
//          first one's `step` before it, each one's `to` after it, the roster's end step with none. The time is the window's span cut
//          at those instants, so any cut of the windows adds to the same sums. (The party fold over its heroes adds the company's maps
//          once a hero; nothing reads the party's report.)
// The edge adds what the events do not hold (hr-accrue accrue-hunt.js): the
// bar as played (`bar`) and the gear worn (`gear`); the database adds when an
// own stack ran dry (`dry`, its own hunt_session_events rows).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_REPORT } from '../../data/hunt-report.js';
import { ARMOUR_SLOTS } from '../../data/gear-tiers.js';
import { DANGER, RISKS } from '../../data/danger.js';

/* The Danger scale's bounds a fall is read against (the server's own, hr_danger_rules.step_max and hr_danger_stances.fall_pm): no step
   past the scale's last, and a fall back reads under some stance's trigger (a death reads 0). */
const STEP_MAX = DANGER.stepMax;
const FALL_PM_MAX = Math.max(...Object.values(RISKS).map((s) => s.fallPm));

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
export function reportEvent(ev, ids, kinds, reportOf, scale = null) {
  if (scale) ledgerEvent(ev, ids, reportOf, scale);
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
    case 'danger': {
      /* a pull on the Danger scale ended: the company's deepest step, and a fall back or a death with its cause, for every hero */
      const step = nat(ev.step), to = nat(ev.to);
      if (step === null || to === null) return;
      const fall = (ev.why === 'fall' || ev.why === 'death') ? fallOf(ev) : null;
      for (const id of [...ids].sort((a, b) => a - b)) {
        const r = reportOf(id, ev);
        r.deep = Math.max(nat(r.deep) === null ? 0 : r.deep, step, to);
        if (fall) r.falls = foldFalls(r.falls, [fall]);
      }
      return;
    }
    default:
  }
}

/* THE LEDGER'S COUNTERS off one event (the header's `heal`, `took`, `sup` gold); `scale.at` the step the walk stands at (ledgerWalk). */
function ledgerEvent(ev, ids, reportOf, scale) {
  const every = (ev2, fn) => { for (const id of [...ids].sort((a, b) => a - b)) fn(reportOf(id, ev2)); };
  if (ev.type === 'heal' && ids.has(ev.u)) {
    const n = nat(ev.amount), src = ev.ability || ev.item || 'heal';
    if (n > 0 && ID64.test(src)) every(ev, (r) => { r.heal = r.heal || {}; bump(r.heal, src, n); });
  } else if (ev.type === 'dmg' && ids.has(ev.t) && !ids.has(ev.u)) {
    const n = nat(ev.amount), seat = scale.seats ? scale.seats[ev.t] : undefined;
    if (n > 0 && Number.isSafeInteger(seat) && seat >= 0 && seat <= 9) every(ev, (r) => { r.took = r.took || {}; bump(r.took, String(seat), n); });
  } else if ((ev.type === 'eat' || ev.type === 'drink' || ev.type === 'cast') && ev.source === 'store' && ids.has(ev.u)) {
    const g = nat(ev.gold);
    if (g > 0) supAdd(reportOf(ev.u, ev), scale.at, g, 0);
  } else if (ev.type === 'danger' && nat(ev.to) !== null) scale.at = ev.to;
}

const bucketOf = (step) => String(Math.floor(step / HUNT_REPORT.supStep) * HUNT_REPORT.supStep);
function supAdd(r, step, g, ms) {
  if (nat(step) === null) return;
  r.sup = r.sup || {};
  const k = bucketOf(step), x = r.sup[k] || [0, 0];
  r.sup[k] = [x[0] + g, x[1] + ms];
}

/**
 * THE LEDGER'S WALK over one window (the tally calls it): `scale` = { step (the window's END step), fromMs, toMs, seats { unit: seat } }.
 * Answers the walker the events are read with (`at` the step before the first pull end), and `close(reportOf, ids)` credits each hero
 * the window's time by the step it stood at.
 */
export function ledgerWalk(events, scale) {
  const ends = events.filter((e) => e.type === 'danger' && nat(e.step) !== null && nat(e.to) !== null);
  /** @type {{ seats: any, at: any, close?: (reportOf: any, ids: any) => void }} */
  const walk = { seats: scale.seats || null, at: ends.length ? ends[0].step : nat(scale.step) };
  const from = nat(scale.fromMs), to = nat(scale.toMs);
  walk.close = (reportOf, ids) => {
    if (from === null || to === null || to <= from) return;
    let at = from, step = ends.length ? ends[0].step : nat(scale.step);
    const spans = [];
    for (const e of ends) { const t = Math.min(to, Math.max(at, nat(e.atMs) || 0)); if (t > at) spans.push([step, t - at]); at = t; step = e.to; }
    if (to > at) spans.push([step, to - at]);
    for (const id of [...ids].sort((a, b) => a - b)) for (const [st, ms] of spans) supAdd(reportOf(id, null), st, 0, ms);
  };
  return walk;
}

/* One fall back off its `danger` event (the header's `falls` entry), or null when the event cannot say one. */
function fallOf(ev) {
  const at = nat(ev.atMs), from = nat(ev.step), to = nat(ev.to), pm = nat(ev.low);
  if (at === null || from === null || to === null || pm === null) return null;
  return { at, from, to, ...(nat(ev.hero) !== null ? { hero: ev.hero } : {}), pm: Math.min(1000, pm),
    monster: typeof ev.monster === 'string' && ID64.test(ev.monster) ? ev.monster : 'unknown' };
}

/* Two fall lists folded into a NEW one: one entry an instant (the first kept), oldest first, the last HUNT_REPORT.fallsMax. Associative
   and order-stable, so it is the same however the windows are cut and however many heroes carry the same list. The database's
   hr_hunt_report_add (1057-danger-falls.sql) is the same fold. */
function foldFalls(a, b) {
  const byAt = new Map();
  for (const f of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (isMap(f) && nat(f.at) !== null && !byAt.has(f.at)) byAt.set(f.at, Object.assign({}, f));
  }
  return [...byAt.values()].sort((x, y) => x.at - y.at).slice(-HUNT_REPORT.fallsMax);
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
  /** @type {{ low: any, close: number, fired: object, waits: object, bar?: any, gear?: any, dry?: Record<string, number>, falls?: object[], deep?: number, heal?: object, took?: object, sup?: object }} */
  const out = { low: lower(x.low, y.low), close: (nat(x.close) || 0) + (nat(y.close) || 0),
    fired: addCounts(x.fired, y.fired, false), waits: addCounts(x.waits, y.waits, true) };
  for (const k of ['bar', 'gear']) { const v = k in y ? y[k] : x[k]; if (v !== undefined) out[k] = v; }
  if (isMap(x.dry) || isMap(y.dry)) {
    const dry = Object.assign({}, x.dry);
    for (const [item, at] of Object.entries(isMap(y.dry) ? y.dry : {})) if (!(item in dry) || at < dry[item]) dry[item] = at;
    out.dry = dry;
  }
  /* the Danger scale's (absent off it): the deeper step, the falls folded one an instant */
  if (Array.isArray(x.falls) || Array.isArray(y.falls)) out.falls = foldFalls(x.falls, y.falls);
  const deep = [x.deep, y.deep].filter((v) => nat(v) !== null);
  if (deep.length) out.deep = Math.max(...deep);
  /* THE LEDGER (absent off the scale): the counts added, the supplies' gold and time added bucket by bucket */
  for (const k of ['heal', 'took']) if (isMap(x[k]) || isMap(y[k])) out[k] = addCounts(x[k], y[k], false);
  if (isMap(x.sup) || isMap(y.sup)) {
    const sup = {};
    for (const src of [x.sup, y.sup]) for (const [k, v] of Object.entries(isMap(src) ? src : {})) {
      if (!Array.isArray(v)) continue;
      const a = sup[k] || [0, 0];
      sup[k] = [a[0] + (nat(v[0]) || 0), a[1] + (nat(v[1]) || 0)];
    }
    out.sup = sup;
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

/**
 * THE GEAR WORN, as survival is calibrated by it (09-platform-and-measurement.md section 5 item 11, calibrate.mjs C-1): the worn
 * weapon's tier (`w`, 0 with none or an untiered one), the armor pieces worn (`n`, ARMOUR_SLOTS) and their tiers added (`a`, so the
 * mean is a / n). `items` the catalogue the engine read. A reading, never a played number.
 */
export function gearWornOf(equipment, items) {
  const eq = isMap(equipment) ? equipment : {};
  const tierOf = (id) => { const row = typeof id === 'string' && items ? items[id] : null; return row && Number.isSafeInteger(row.tier) && row.tier > 0 ? row.tier : 0; };
  let a = 0, n = 0;
  for (const s of ARMOUR_SLOTS) if (typeof eq[s.slot] === 'string' && eq[s.slot]) { n += 1; a += tierOf(eq[s.slot]); }
  return { w: tierOf(eq.weapon), a, n };
}

/**
 * THE BAR AS PLAYED: the hero's bar rows the engine read (conditions.js heroSlots: enabled slots in bar order, each with its stable rule
 * id and its place `at`), as [rule, what it uses, place], the default attack left out, at most HUNT_REPORT.barMax. The report's rules
 * block names a slot that never fired from this.
 */
export function barPlayedOf(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.rule !== 'string' || !/^[a-z0-9_]{1,24}$/.test(r.rule) || !r.slot || !r.slot.action || r.rule === 'd_attack') continue;
    const id = String(r.slot.action.id || '');
    if (!/^[a-z0-9_]{1,64}$/.test(id)) continue;
    out.push([r.rule, id, Number.isSafeInteger(r.at) && r.at >= 0 ? r.at : out.length]);
    if (out.length >= HUNT_REPORT.barMax) break;
  }
  return out;
}

/* The shape the database accepts (1053-hunt-report.sql hr_hunt_report_ok), so the engine never proposes a report the window would be
   refused for: ids [a-z0-9_] (a rule's 24 long, conditions.js RULE_ID), reasons [a-z_], at most 32 rules and 8 reasons a rule. */
const ID64 = /^[a-z0-9_]{1,64}$/, RULE = /^[a-z0-9_]{1,24}$/, WHY = /^[a-z_]{1,16}$/;
const capped = (m, key, max) => Object.fromEntries(Object.entries(isMap(m) ? m : {}).filter(([k, n]) => key.test(k) && nat(n) !== null && n <= 999999999)
  .sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, max));

/** A window's report as the settle proposes it, in the database's shape: only what holds something (an empty map or no low is left out). */
export function reportProposal(r, bar, gear) {
  const out = {};
  if (!isMap(r)) r = emptyReport();
  const l = r.low;
  if (isMap(l) && nat(l.pm) !== null && l.pm <= 1000 && ID64.test(l.by) && ID64.test(l.blow) && nat(l.at) !== null) out.low = { pm: l.pm, by: l.by, blow: l.blow, at: l.at };
  if (nat(r.close) > 0) out.close = Math.min(r.close, 999999999);
  const fired = capped(r.fired, RULE, 32);
  if (Object.keys(fired).length) out.fired = fired;
  const waits = {};
  for (const rule of Object.keys(isMap(r.waits) ? r.waits : {}).filter((k) => RULE.test(k)).sort().slice(0, 32)) {
    const why = capped(r.waits[rule], WHY, 8);
    if (Object.keys(why).length) waits[rule] = why;
  }
  if (Object.keys(waits).length) out.waits = waits;
  if (Array.isArray(bar)) out.bar = bar;
  if (isMap(gear)) out.gear = { w: Math.min(nat(gear.w) || 0, 9999), a: Math.min(nat(gear.a) || 0, 9999), n: Math.min(nat(gear.n) || 0, 9999) };
  /* THE DANGER SCALE'S (1057-danger-falls.sql hr_hunt_report_ok): the deepest step, and the last falls each at or under it, never
     climbing, read under a stance's trigger, a seat of one digit */
  const deep = nat(r.deep);
  if (deep !== null && deep <= STEP_MAX) {
    out.deep = deep;
    const falls = (Array.isArray(r.falls) ? r.falls : []).filter((f) => isMap(f) && nat(f.at) !== null && f.at <= 999999999999999
      && nat(f.from) !== null && f.from <= deep && nat(f.to) !== null && f.to <= f.from && nat(f.pm) !== null && f.pm < FALL_PM_MAX
      && (!('hero' in f) || (nat(f.hero) !== null && f.hero <= 9)) && ID64.test(f.monster)).slice(-HUNT_REPORT.fallsMax);
    if (falls.length) {
      out.falls = falls.map((f) => ({ at: f.at, from: f.from, to: f.to, ...('hero' in f ? { hero: f.hero } : {}), pm: f.pm, monster: f.monster }));
    }
  }
  /* THE LEDGER (1057-danger-falls.sql hr_hunt_report_ok, folded in while staged): healing by source (an id, at most 16), damage taken by
     seat (one digit), the supplies' [gold, ms] by step bucket (at most 32, a step of the scale), whole numbers of at most 12 digits */
  const heal = capped12(r.heal, ID64, 16), took = capped12(r.took, SEAT, 10);
  if (Object.keys(heal).length) out.heal = heal;
  if (Object.keys(took).length) out.took = took;
  const sup = Object.entries(isMap(r.sup) ? r.sup : {}).filter(([k, v]) => /^[0-9]{1,4}$/.test(k) && Number(k) <= STEP_MAX && Array.isArray(v)
    && v.length === 2 && v.every((n) => nat(n) !== null && n <= MAX12) && (v[0] > 0 || v[1] > 0)).sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 32);
  if (sup.length) out.sup = Object.fromEntries(sup.map(([k, v]) => [k, [v[0], v[1]]]));
  return out;
}
const MAX12 = 999999999999, SEAT = /^[0-9]$/;
const capped12 = (m, key, max) => Object.fromEntries(Object.entries(isMap(m) ? m : {}).filter(([k, n]) => key.test(k) && nat(n) !== null && n > 0 && n <= MAX12)
  .sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, max));
