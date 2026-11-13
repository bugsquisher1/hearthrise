// ════════════════════════════════════════════════════════════════════════
// src/shell/live-events-view.js — WHAT A PLAYER READS OF THE LIVE EVENTS (Tyler 2026-11-07 "live events from data"; the mocks and
// their spec, .claude/coordination/mocks/2026-11-10/SPEC.md §2; the server, supabase/migrations/2027-03-22-live-events.sql).
//
// PURE. One reader for every surface, so the plate, a Hunts line, a ground's page and Call out say the same thing:
//   plateLines(cs)            the plate over the World (widgets/event-plate.js): an event on now, or starting within a day
//   rowLines(cs, hunt)        a Hunts line: Open Halls on a ground whose boss it frees; an XP event only where it names the ground
//   groundLines(cs, hunt)     the ground's page: every event on now that reaches this ground or its boss
//   callEventWords(cs, call, quote)   Call out's line, press, warning and confirm while the SERVER'S QUOTE says an event set its price
//   feeKey(cs, call)          which fee events are on for this call now: a change reads the quote again (boss-call-pane.js)
//
// THE SERVER DECIDES EVERYTHING. The events are the envelope's `live_events` (null when every switch is off: then every reader
// here answers nothing, so nothing new shows anywhere). The percent is the server's dial, the times are its windows read against
// its clock (CharacterSession.serverNow), and the Call out price is only ever the quote's. A window that has closed on the
// server's clock is gone at once, before the next envelope says so; a dial the words can't say truthfully (a fee event that
// isn't free) shows no line rather than a wrong one.
// ════════════════════════════════════════════════════════════════════════
import { liveEventsOf } from '../session/live-event-sections.js?v=0.2.129';
import { serverNowOf } from '../session/hunt-sections.js?v=0.2.129';
import { LIVE_EVENTS, LIVE_EVENT_SHOWN } from '../data/live-events.js?v=0.2.129';
import { BOSS_CALLS, callFromGround } from '../data/boss-calls.js?v=0.2.129';
import { localWhen } from '../render/format.js?v=0.2.129';
import { t } from '../render/player-text.js?v=0.2.129';

const MIN_MS = 60000;
const ON = new Set(['on', 'ending']);

/* A permille dial as the percent it adds: 1250 reads 25, 1255 reads 25.5. */
const pctOf = (pm) => (pm - 1000) / 10;
const minsLeft = (e, now) => String(Math.max(1, Math.ceil((e.endsMs - now) / MIN_MS)));

/* An event's words filled: {pct} the server's dial, {start} and {end} its window in the player's clock (long form, the day named
   against `ref`), {mins} the minutes left on the server's clock, {boss} and {Boss} the call's. */
function fill(line, x, more) {
  const vars = Object.assign({ pct: String(pctOf(x.e.pm)), start: localWhen(x.e.startsMs, x.ref, true), end: localWhen(x.e.endsMs, x.ref, true),
    mins: x.now === null ? '' : minsLeft(x.e, x.now) }, more);
  return String(line || '').replace(/\{(pct|start|end|mins|boss|Boss)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k]));
}

/* soon | on | ending | later | null (over), on the SERVER's clock; with no clock yet, the server's own `live` at its read. */
function stateOf(e, now) {
  if (now === null) return e.live ? 'on' : 'later';
  if (now >= e.endsMs) return null;
  if (now >= e.startsMs) return e.endsMs - now <= LIVE_EVENT_SHOWN.endingMs ? 'ending' : 'on';
  return e.startsMs - now <= LIVE_EVENT_SHOWN.soonMs ? 'soon' : 'later';
}

/**
 * The server's events this hero can read, each with its words and its state: [{ e, w, state, now, ref }]. `now` is the server's
 * clock (null before one came), `ref` the instant that names a day (the server's, else this machine's: a word, never a number). An
 * event the data has no words for (or names under another type) is left out: its words ship with its catalogue row, never guessed.
 */
function eventsNow(cs) {
  const list = liveEventsOf(cs);
  if (!list) return [];
  const clock = serverNowOf(cs);
  const now = Number.isFinite(clock) ? clock : null;
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
/* A fee event's words say "free": only a dial of 0 makes them true. */
const freeCall = (x, call) => x.e.dial === 'feePm' && x.e.pm === 0 && !!call && reaches(x.e, call.id);
/* The ground a press on the plate opens Hunts on: the first whose boss a fee event frees, the first an XP event names, or null. */
function groundOf(e) {
  if (e.dial !== 'feePm') return e.scope.find((s) => s !== 'world') || null;
  const call = Object.values(BOSS_CALLS).find((c) => reaches(e, c.id));
  return call ? call.from : null;
}
const endsIn = (x) => t('events.ends_in', { mins: minsLeft(x.e, x.now) });
const ending = (x) => x.state === 'ending' && x.now !== null;

/**
 * The plate: [{ id, head, when, title, soon, gain, ending, hunt }] for each event on now or starting within a day, in the server's
 * order. `hunt` is the ground a press opens Hunts on (null: the window as it was).
 */
export function plateLines(cs) {
  const out = [];
  for (const x of eventsNow(cs)) {
    if (x.state === 'later') continue;
    const { e, w } = x;
    const soon = x.state === 'soon';
    const when = soon ? t('events.plate_starts', { at: localWhen(e.startsMs, x.ref) })
      : ending(x) ? t('events.plate_ends_in', { mins: minsLeft(e, x.now) }) : t('events.plate_ends', { at: localWhen(e.endsMs, x.ref) });
    out.push({ id: e.id, head: soon ? w.name : fill(w.chip, x), when, title: fill(soon ? w.soon : w.on, x),
      soon, gain: e.dial === 'xpPm', ending: ending(x), hunt: groundOf(e) });
  }
  return out;
}

/** A Hunts line's event words: [{ id, words }]. Open Halls on a ground whose boss it frees; an XP event only on a ground it names. */
export function rowLines(cs, hunt) {
  const call = callFromGround(hunt);
  const out = [];
  for (const x of eventsNow(cs)) {
    if (!ON.has(x.state)) continue;
    if (freeCall(x, call)) out.push({ id: x.e.id, words: fill(x.w.hunts, x, { boss: call.boss, Boss: call.Boss }) });
    else if (x.e.dial === 'xpPm' && x.e.scope.includes(hunt)) out.push({ id: x.e.id, words: fill(x.w.hunts, x) });
  }
  return out;
}

/**
 * The ground's page: [{ id, head, tail, plain }] for each event on now that reaches it: an XP event's percent and when it ends,
 * Open Halls on a ground whose boss it frees ("plain": no gain colour, it moves a fee, not XP).
 */
export function groundLines(cs, hunt) {
  const call = callFromGround(hunt);
  const out = [];
  for (const x of eventsNow(cs)) {
    if (!ON.has(x.state)) continue;
    if (x.e.dial === 'xpPm' && reaches(x.e, hunt)) {
      out.push({ id: x.e.id, head: fill(x.w.page, x), plain: false,
        tail: ending(x) ? endsIn(x) : t('events.ends_at', { at: localWhen(x.e.endsMs, x.ref, true) }) });
    } else if (freeCall(x, call)) {
      const named = { boss: call.boss, Boss: call.Boss };
      out.push({ id: x.e.id, head: fill(x.w.page, x), plain: true,
        tail: ending(x) ? fill(x.w.pageFree, x, named) + ' ' + endsIn(x) : fill(x.w.pageUntil, x, named) });
    }
  }
  return out;
}

/**
 * CALL OUT WHILE AN EVENT SET THE PRICE: the words for the SERVER'S quote, or null for today's. Only a quote that names its event
 * (`event`) and quotes 0 reads as free; the line names the event's end when the section lists it. Every number stays the quote's:
 * { line, press, warn, confirm } are words (boss-call-pane.js fills {boss} and {minutes} through callWords).
 */
export function callEventWords(cs, call, quote) {
  if (!call || !quote || quote.price !== 0 || !quote.event || !Object.hasOwn(LIVE_EVENTS, quote.event)) return null;
  const w = LIVE_EVENTS[quote.event].words;
  if (!w.hunts || !w.warning || !w.confirm) return null;
  const x = eventsNow(cs).find((y) => y.e.id === quote.event && ON.has(y.state)) || null;
  const line = !x ? '' : ending(x) ? fill(w.callEnding, x) : fill(w.callLine, x);
  return { line, press: w.hunts, warn: w.warning, confirm: w.confirm };
}

/** Which fee events are on for `call` now, as one key: when it changes the quote is read again, since the price may have moved. */
export function feeKey(cs, call) {
  if (!call) return '';
  return eventsNow(cs).filter((x) => ON.has(x.state) && x.e.dial === 'feePm' && reaches(x.e, call.id)).map((x) => x.e.id + '@' + x.e.startsMs).join(',');
}
