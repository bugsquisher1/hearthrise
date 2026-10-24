// ════════════════════════════════════════════════════════════════════════
// src/session/envelope.js — ONE CHARACTER'S STATE IS THE SERVER'S LAST WORD.
//
// PURE. A character's record is { version, data, residue }:
//   data     every key of the last envelope the server sent (hr_load, an
//            hr-accrue answer), deep-copied and frozen — the client never
//            writes into it;
//   residue  the allowlisted client-only display state (src/session/residue.js),
//            read from the envelope's `client_state`.
//
// THE RULES (CLAUDE.md §6):
//   E1 a FULL envelope REPLACES the record. Nothing of the previous record
//      survives it: a key the new envelope does not carry is gone, so a
//      number can never be merged upward or outlive the server's answer.
//   E2 a FRAME (the push channel, {t:'state', frame, env}; 2026-12-25-frame-
//      push-revive.sql hr_frame_payload) carries the WHOLE character the server
//      committed: its `env` is the same envelope a load answers, and it
//      replaces the record exactly as E1. Never a subset, never a merge, so a
//      missed frame needs no gap fill: the next one restates everything.
//   E3 versions are raise-only: an envelope older than the record is refused
//      ('stale'); a frame must be strictly newer ('duplicate' / 'reorder').
//      A full envelope at the SAME version restates the record and is applied.
//   E4 a frame before the first full envelope is refused ('not_loaded'): the
//      character's first read is a load (hr_load's name and access answers).
//   E6 anything malformed is refused, and a refusal changes nothing; a "full"
//      answer with no `state` object is not a restatement and is refused
//      ('incomplete') rather than allowed to replace the record with less; a
//      frame whose `frame` is not its envelope's own version is malformed.
// ════════════════════════════════════════════════════════════════════════

import { residueOf } from './residue.js?v=0.2.43';

/** Envelope keys that describe the answer, not the character. */
const META = Object.freeze(['ok', 'error', 'accrued']);
/* The settle response's visual timeline (HUNT_SCREEN_SPEC §1.5): transient,
   played back by src/hunt-view/timeline.js, never part of the record. */
export const TIMELINE_KEYS = Object.freeze(['hunt_track', 'hunt_events', 'hunt_server_now_ms']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isVersion = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function freeze(v) {
  if (v && typeof v === 'object') { Object.freeze(v); for (const k of Object.keys(v)) freeze(v[k]); }
  return v;
}
/** A frozen deep copy of JSON data: the record never aliases a caller's object. */
const copy = (v) => freeze(v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function record(version, data, residue) {
  return Object.freeze({ version, data: Object.freeze(data), residue: freeze(residue) });
}

/**
 * Apply a full envelope. Returns { applied, verdict, record } where `record`
 * is the new record when applied and the old one (possibly null) when not.
 * @param {object|null} current
 * @param {object} env
 */
export function applyEnvelope(current, env) {
  const keep = (verdict) => ({ applied: false, verdict, record: current || null });
  if (!isObj(env)) return keep('malformed');
  if (env.ok !== true) return keep(typeof env.error === 'string' ? env.error : 'not_ok');
  if (!isVersion(env.version)) return keep('unversioned');
  if (!isObj(env.state)) return keep('incomplete');
  if (current && env.version < current.version) return keep('stale');
  const data = {};
  for (const k of Object.keys(env)) if (!META.includes(k) && !TIMELINE_KEYS.includes(k) && k !== 'client_state') data[k] = copy(env[k]);
  return { applied: true, verdict: 'replaced', record: record(env.version, data, residueOf(env.client_state)) };
}

/**
 * One pushed frame, judged (E2-E4, E6): { verdict, env } where `env` is the whole envelope to apply as a load
 * answer (E1) when the frame is well formed, the record is loaded and the frame is strictly newer, else null.
 * @param {object|null} current
 * @param {object} msg  the broadcast payload
 */
export function frameEnvelope(current, msg) {
  if (!isObj(msg) || msg.t !== 'state' || !isVersion(msg.frame) || !isObj(msg.env)
    || msg.env.version !== msg.frame || msg.env.ok !== true || !isObj(msg.env.state)) return { verdict: 'malformed', env: null };
  if (!current) return { verdict: 'not_loaded', env: null };
  if (msg.frame === current.version) return { verdict: 'duplicate', env: null };
  if (msg.frame < current.version) return { verdict: 'reorder', env: null };
  return { verdict: 'fresh', env: msg.env };
}

/** The record with one residue field replaced (display state only; the version does not move). */
export function withResidue(current, field, value) {
  const residue = Object.assign({}, current ? current.residue : {}, residueOf({ [field]: value }));
  return record(current ? current.version : -1, current ? Object.assign({}, current.data) : {}, residue);
}
