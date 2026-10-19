// ============================================================
// src/core/hunt/events.js — WHAT A SWING TELLS THE CLIENT (spec §1.1, §1.5)
//
// The one schema for the hunt's events and track. Every event is
// `{ type, atMs, ...fields }`: `atMs` an integer server instant, `type` a key
// of EVENT_TYPES, and every field that type REQUIRES present. A type may carry
// more fields (a primitive, or a plain object of primitives such as `xpLost`),
// never fewer. A track step is `{ u, x, y, atMs }`: unit `u` started its step
// onto tile (x, y) at `atMs`; the client rolls it there at the unit's speed
// and never invents a step (spec §1.4 playback).
//
// The list names every module's events up front so each core lane emits into
// a schema it does not have to edit (spec §1.6). A new type, or a changed
// required field, bumps EVENT_VERSION.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

export const EVENT_VERSION = 3;

/* type → its required fields. `u` acts, `t` is acted on (unit ids). */
export const EVENT_TYPES = Object.freeze({
  /* the span (combat-sim.js simulateHuntSpan) */
  ended: Object.freeze(['reason']),
  death: Object.freeze(['monster', 'xpLost']),
  rare_drop: Object.freeze(['item']),
  slot_dry: Object.freeze(['item']),
  /* leash.js / pull-cycle.js */
  pack_reset: Object.freeze(['pocket']),
  pull: Object.freeze(['pocket']),
  respawn: Object.freeze(['pocket']),
  wipe: Object.freeze([]),
  /* targeting.js */
  target: Object.freeze(['u', 't']),
  challenge: Object.freeze(['u']),
  /* damage.js */
  dmg: Object.freeze(['u', 't', 'amount']),
  miss: Object.freeze(['u', 't']),
  immune: Object.freeze(['u', 't']),
  kill: Object.freeze(['u', 't']),
  /* abilities.js */
  cast: Object.freeze(['u', 'ability']),
  heal: Object.freeze(['u', 't', 'amount']),
  shield: Object.freeze(['u', 't', 'amount']),
  mark: Object.freeze(['u', 't']),
  /* status.js */
  status_on: Object.freeze(['t', 'status']),
  status_tick: Object.freeze(['t', 'status', 'amount']),
  status_off: Object.freeze(['t', 'status']),
  /* consumables.js */
  eat: Object.freeze(['u', 'item']),
  drink: Object.freeze(['u', 'item']),
  /* xp-share.js */
  xp: Object.freeze(['u', 'amount']),
  xp_group: Object.freeze(['amount']),
  level: Object.freeze(['u', 'skill', 'level']),
  /* conditions.js / damage.js: a stop rule met; an attack item's shot (the decision: its rule id and the conditions that passed) */
  rule_stop: Object.freeze(['u', 'rule']),
  shot: Object.freeze(['u', 't', 'item', 'rule']),
  /* a rule whose conditions held but whose action could not happen (why: conditions.js WAIT_WHY) */
  rule_wait: Object.freeze(['u', 't', 'rule', 'why']),
});

const isPrim = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const isFieldValue = (v) => isPrim(v) || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isPrim));

/** Every problem with one event, as strings. Empty = valid. */
export function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') return ['event is not an object'];
  const req = EVENT_TYPES[ev.type];
  if (!req) return ['unknown event type ' + String(ev.type)];
  const out = [];
  if (!Number.isInteger(ev.atMs)) out.push(ev.type + ': atMs must be an integer, got ' + ev.atMs);
  for (const k of req) if (ev[k] === undefined) out.push(ev.type + ': missing ' + k);
  for (const [k, v] of Object.entries(ev)) {
    if (k !== 'type' && k !== 'atMs' && !isFieldValue(v)) out.push(ev.type + ': field ' + k + ' is not a primitive or flat object');
  }
  return out;
}

/** Build an event; refuses (throws) one the schema does not admit. */
export function makeEvent(type, atMs, fields) {
  const ev = Object.assign({ type, atMs }, fields);
  const bad = validateEvent(ev);
  if (bad.length) throw new Error('makeEvent: ' + bad.join('; '));
  return ev;
}

/** One track step: unit `u` starts its step onto (x, y) at `atMs`. */
export function trackStep(u, x, y, atMs) {
  if (![u, x, y, atMs].every(Number.isInteger)) throw new Error('trackStep: every field is an integer');
  return { u, x, y, atMs };
}
