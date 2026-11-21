// ════════════════════════════════════════════════════════════════════════
// src/shell/live-events-view.js — WHAT A PLAYER READS OF THE CALENDAR (Tyler 2026-11-07 "live events from data"; the 28 day cycle and the
// Hearthrise are the designer's ruling D-7; the server, supabase/migrations/2027-03-22-live-events.sql and 1037-hearthrise.sql).
//
// PURE. One reader for every surface, so the plate, a Hunts line, a ground's page, the Character sheet and the Great Hearth say the same:
//   plateLines(cs)            the plate over the World (widgets/event-plate.js): an event on now, or starting within a day; on a quiet
//                             weekend ONE quiet line naming what comes next and in how many days (D-7: the banner always says what is next)
//   rowLines(cs, hunt)        a Hunts line: an XP event only where it names the ground
//   groundLines(cs, hunt)     the ground's page: every XP event on now that reaches this ground
//   sheetXpLine(cs)           the Character sheet's experience bonus line: every XP event on now, its name and what it adds
//   fireLines(cs)             the Great Hearth's fire (D-7 section 1.5): its marks, when it lights and at what size, the fuel to the next mark
//
// THE SERVER DECIDES EVERYTHING. The events are the envelope's `live_events` (null when every switch is off: then every reader here
// answers nothing, so nothing new shows anywhere), the fire its `hearth_fire`. The percent is the server's dial (the Hearthrise's lit
// size, or before it lights the size the fire would light at now), the times are its windows read against its clock
// (CharacterSession.serverNow). A window that has closed on the server's clock is gone at once, before the next envelope says so.
// ════════════════════════════════════════════════════════════════════════
import { liveEventsOf, fireOf } from '../session/live-event-sections.js';
import { serverNowOf } from '../session/hunt-sections.js';
import { LIVE_EVENTS, LIVE_EVENT_SHOWN } from '../data/live-events.js';
import { FIRE_WORDS } from '../data/hearthrise.js';
import { HUNT_INDEX } from '../data/hunts.js';
import { localWhen, whole } from '../render/format.js';
import { t } from '../render/player-text.js';

const MIN_MS = 60000;
const DAY_MS = 86400000;
const ON = new Set(['on', 'ending']);

/* A permille dial as the percent it adds: 1250 reads 25, 1255 reads 25.5. */
const pctOf = (pm) => (pm - 1000) / 10;
const minsLeft = (e, now) => String(Math.max(1, Math.ceil((e.endsMs - now) / MIN_MS)));

/* An event's words filled: {pct} the server's dial, {start} and {end} its window in the player's clock (long form, the day named against
   `ref`), {mins} the minutes left on the server's clock. */
function fill(line, x) {
  const vars = { pct: String(pctOf(x.e.pm)), start: localWhen(x.e.startsMs, x.ref, true), end: localWhen(x.e.endsMs, x.ref, true),
    mins: x.now === null ? '' : minsLeft(x.e, x.now) };
  return String(line || '').replace(/\{(pct|start|end|mins)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k]));
}

/* soon | on | ending | later | null (over), on the SERVER's clock; with no clock yet, the server's own `live` at its read. */
function stateOf(e, now) {
  if (now === null) return e.live ? 'on' : 'later';
  if (now >= e.endsMs) return null;
  if (now >= e.startsMs) return e.endsMs - now <= LIVE_EVENT_SHOWN.endingMs ? 'ending' : 'on';
  return e.startsMs - now <= LIVE_EVENT_SHOWN.soonMs ? 'soon' : 'later';
}

const clockOf = (cs) => { const c = serverNowOf(cs); return Number.isFinite(c) ? c : null; };

/**
 * The server's events this hero can read, each with its words and its state: [{ e, w, state, now, ref }]. `now` is the server's
 * clock (null before one came), `ref` the instant that names a day (the server's, else this machine's: a word, never a number). An
 * event the data has no words for (or names under another type) is left out: its words ship with its catalogue row, never guessed.
 */
function eventsNow(cs) {
  const list = liveEventsOf(cs);
  if (!list) return [];
  const now = clockOf(cs);
  const ref = now === null ? Date.now() : now;
  const out = [];
  for (const e of list) {
    const row = Object.hasOwn(LIVE_EVENTS, e.id) ? LIVE_EVENTS[e.id] : null;
    if (!row || row.type !== e.type) continue;
    const state = stateOf(e, now);
    if (state) out.push({ e, w: row.words, state, now, ref });
  }
  return out;
}

const reaches = (e, id) => e.scope.includes('world') || e.scope.includes(id);
const ending = (x) => x.state === 'ending' && x.now !== null;
/* The ground a press on the plate opens Hunts on: the first an XP event names, or null (the window as it was). */
const groundOf = (e) => (e.dial === 'xpPm' ? e.scope.find((s) => s !== 'world') || null : null);

/**
 * The plate: [{ id, head, when, title, soon, gain, ending, hunt }] for each event on now or starting within a day, in the server's
 * order; with none, ONE quiet line for what comes next ("Next: Hearthrise in 9 days"), so the calendar never reads as nothing.
 * `hunt` is the ground a press opens Hunts on (null: the window as it was).
 */
export function plateLines(cs) {
  const out = [];
  const all = eventsNow(cs);
  for (const x of all) {
    if (x.state === 'later') continue;
    const { e, w } = x;
    const soon = x.state === 'soon';
    const when = soon ? t('events.plate_starts', { at: localWhen(e.startsMs, x.ref) })
      : ending(x) ? t('events.plate_ends_in', { mins: minsLeft(e, x.now) }) : t('events.plate_ends', { at: localWhen(e.endsMs, x.ref) });
    out.push({ id: e.id, head: soon ? w.name : fill(w.chip, x), when, title: fill(soon ? w.soon : w.on, x),
      soon, gain: e.dial === 'xpPm', ending: ending(x), hunt: groundOf(e) });
  }
  if (out.length) return out;
  const next = all.filter((x) => x.state === 'later').sort((a, b) => a.e.startsMs - b.e.startsMs)[0];
  if (!next) return out;
  const days = Math.max(1, Math.ceil((next.e.startsMs - next.ref) / DAY_MS));
  return [{ id: next.e.id, head: t('events.next_in', { event: next.w.name, count: days }), when: '', title: fill(next.w.soon, next),
    soon: true, gain: false, ending: false, hunt: null }];
}

/** A Hunts line's event words: [{ id, words }]. An XP event only on a ground it names. */
export function rowLines(cs, hunt) {
  const out = [];
  for (const x of eventsNow(cs)) {
    if (ON.has(x.state) && x.e.dial === 'xpPm' && x.e.scope.includes(hunt)) out.push({ id: x.e.id, words: fill(x.w.hunts, x) });
  }
  return out;
}

/** The ground's page: [{ id, head, tail, plain }] for each XP event on now that reaches it: its percent and when it ends. */
export function groundLines(cs, hunt) {
  const out = [];
  for (const x of eventsNow(cs)) {
    if (!ON.has(x.state) || x.e.dial !== 'xpPm' || !reaches(x.e, hunt)) continue;
    out.push({ id: x.e.id, head: fill(x.w.page, x), plain: false,
      tail: ending(x) ? t('events.ends_in', { mins: minsLeft(x.e, x.now) }) : t('events.ends_at', { at: localWhen(x.e.endsMs, x.ref, true) }) });
  }
  return out;
}

/**
 * THE CHARACTER SHEET'S EXPERIENCE BONUS FROM EVENTS (retention dive 2026-11-20: "Experience bonuses: None right now" on the sheet while the
 * plate said "+25% Level XP" and the settle paid it): { name, words } for every XP event on now that adds something, its name and its chip
 * ("+25% Level XP"), with the grounds it names when it is not world-wide, or null when none is on. Two events read as one line, joined.
 */
export function sheetXpLine(cs) {
  const on = [];
  for (const x of eventsNow(cs)) {
    if (!ON.has(x.state) || x.e.dial !== 'xpPm' || !(x.e.pm > 1000)) continue;
    const grounds = x.e.scope.includes('world') ? [] : x.e.scope.map((h) => (HUNT_INDEX[h] ? HUNT_INDEX[h].name : null)).filter(Boolean);
    if (!x.e.scope.includes('world') && !grounds.length) continue;
    on.push({ name: x.w.name, words: fill(x.w.chip, x) + (grounds.length ? ' ' + t('events.sheet_where', { where: grounds.join(', ') }) : '') });
  }
  return on.length ? { name: on.map((x) => x.name).join(' and '), words: on.map((x) => x.words).join(', ') } : null;
}

/**
 * THE GREAT HEARTH'S FIRE (D-7 section 1.5, the designer's words): { title, marks, lights, next, explain } as lines, or null while the
 * server sends no fire. While a Hearthrise burns, `lights` is the lit line ("The Hearthrise is lit. +16% Level XP until ...").
 */
export function fireLines(cs) {
  const f = fireOf(cs);
  if (!f) return null;
  const now = clockOf(cs);
  const ref = now === null ? Date.now() : now;
  const pct = (pm) => String(pctOf(pm));
  const lit = f.lit && (now === null || (now >= f.lit.startsMs && now < f.lit.endsMs)) ? f.lit : null;
  const fillOf = (line, vars) => String(line).replace(/\{(marks|start|pct|need|end)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k]));
  return {
    title: FIRE_WORDS.title,
    marks: fillOf(FIRE_WORDS.marks, { marks: String(f.marks) }),
    lights: lit ? fillOf(FIRE_WORDS.lit, { pct: pct(lit.pm), end: localWhen(lit.endsMs, ref, true) })
      : f.next ? fillOf(FIRE_WORDS.lights, { start: localWhen(f.next.startsMs, ref, true), pct: pct(f.pm) }) : '',
    next: f.full ? FIRE_WORDS.full : f.need !== null ? fillOf(FIRE_WORDS.next, { need: whole(f.need) }) : '',
    explain: FIRE_WORDS.explain,
    full: f.full, of: f.of, filled: f.marks,
  };
}
