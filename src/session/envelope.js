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
//   E2 a FRAME (the push channel, {t:'delta', frame, patch}) replaces the
//      top-level keys it STATES, each one whole; a key it does not state is
//      untouched. Never a field-level merge inside a key.
//   E3 versions are raise-only: an envelope older than the record is refused
//      ('stale'); a frame must be strictly newer ('duplicate' / 'reorder').
//      A full envelope at the SAME version restates the record and is applied.
//   E4 a frame before the first full envelope is refused ('not_loaded'): a
//      partial answer cannot stand in for a character the client never read.
//   E5 a frame may carry the bag (`inventory`, `bank`) only when the frame
//      itself says `inventory_complete === true` — never a partial bag.
//   E6 anything malformed is refused, and a refusal changes nothing; a "full"
//      answer with no `state` object is not a restatement and is refused
//      ('incomplete') rather than allowed to replace the record with less.
// ════════════════════════════════════════════════════════════════════════

import { residueOf } from './residue.js?v=590';

/** Envelope keys that describe the answer, not the character. */
const META = Object.freeze(['ok', 'error', 'accrued']);
/** The keys hr_frame_send may state (2026-09-22-frame-push-channel.sql). */
const FRAME_KEYS = Object.freeze(['state', 'skills', 'buffs', 'place', 'dungeon_cooldowns',
  'inventory', 'bank', 'equipment', 'enchant', 'workers', 'farm', 'progress', 'inventory_complete']);
const BAG_KEYS = Object.freeze(['inventory', 'bank']);

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
  for (const k of Object.keys(env)) if (!META.includes(k) && k !== 'client_state') data[k] = copy(env[k]);
  return { applied: true, verdict: 'replaced', record: record(env.version, data, residueOf(env.client_state)) };
}

/** The broadcast message as { version, patch }, or null when it is not a well-formed frame. */
function frameOf(msg) {
  if (!isObj(msg) || msg.t !== 'delta' || !isVersion(msg.frame) || !isObj(msg.patch)) return null;
  const keys = Object.keys(msg.patch);
  if (!keys.length || keys.some((k) => !FRAME_KEYS.includes(k))) return null;
  if ('state' in msg.patch && !isObj(msg.patch.state)) return null;
  if ('inventory_complete' in msg.patch && typeof msg.patch.inventory_complete !== 'boolean') return null;
  return { version: msg.frame, patch: msg.patch };
}

/**
 * Apply one pushed frame. Same return shape as applyEnvelope.
 * @param {object|null} current
 * @param {object} msg  the broadcast payload
 */
export function applyFrame(current, msg) {
  const keep = (verdict) => ({ applied: false, verdict, record: current || null });
  const f = frameOf(msg);
  if (!f) return keep('malformed');
  if (!current) return keep('not_loaded');
  if (f.version === current.version) return keep('duplicate');
  if (f.version < current.version) return keep('reorder');
  if (BAG_KEYS.some((k) => k in f.patch) && f.patch.inventory_complete !== true) return keep('bag_incomplete');
  const data = Object.assign({}, current.data);
  for (const k of Object.keys(f.patch)) data[k] = copy(f.patch[k]);
  return { applied: true, verdict: 'fresh', record: record(f.version, data, current.residue) };
}

/** The record with one residue field replaced (display state only; the version does not move). */
export function withResidue(current, field, value) {
  const residue = Object.assign({}, current ? current.residue : {}, residueOf({ [field]: value }));
  return record(current ? current.version : -1, current ? Object.assign({}, current.data) : {}, residue);
}
