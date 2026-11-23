// ============================================================
// src/core/hunt/status-effects.js — WHAT A UNIT'S STATUSES DO NOW (the general status system's one reader, lane/e2-e3-statuses, E2)
//
// Every engine reader of a status effect asks here, never a status by name: damage.js (takenPm, dealtPm, armorPm, slowPm), heal-cut.js
// (healCutPm), monster-spells.js (silence). The rows and their keys are src/data/statuses.js's.
//
// effectPm(u, field)  a unit's value of one effect, permille, over its keys (statuses.js STATUS_KEYS):
//                       strongest  the largest (by size) live stack of the key, alone
//                       add        each row's strongest live stack, the rows added, held to the key's capPm (by size, sign kept)
//                     then the keys summed. A GROUND stack (burning ground) is its holder's patch, never an effect on the holder.
// stackValue          one stack's value of one field: a slow at its landing's tier (statuses.js slowAt), a heal cut on a hero at its
//                     guard (floor(healCutPm.hero x scale / 1000)), a monster's whole, every other field the row's own number
// hasEffect(u, flag)  a live stack whose row carries `flag` (silence)
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { STATUSES, STATUS_KEYS, slowAt } from '../../data/statuses.js';
import { isHero } from './sides.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const rowOfStack = (st) => (st && own(STATUSES, st.s) ? STATUSES[st.s] : null);
const n = (v) => (Number.isInteger(v) ? v : 0);

/* ONE READER A FIELD: a stack's value of it, permille, on unit `u` */
const VALUE = Object.freeze({
  takenPm: (u, row) => n(row.takenPm),
  dealtPm: (u, row) => n(row.dealtPm),
  armorPm: (u, row) => n(row.armorPm),
  slowPm: (u, row, st) => slowAt(row, st.scale),
  healCutPm: (u, row, st) => (!row.healCutPm ? 0
    : isHero(u) ? Math.floor((row.healCutPm.hero * (Number.isInteger(st.scale) ? st.scale : 1000)) / 1000) : row.healCutPm.monster),
});

/** One stack's value of `field` on unit `u`, permille (0 when its row has none; throws on a field no reader knows). */
export function stackValue(u, row, st, field) {
  const f = VALUE[field];
  if (!f) throw new Error('status-effects: no reader for ' + field);
  return f(u, row, st);
}

/** Unit `u`'s value of one effect `field` now, permille: its keys summed, each counted by its combine rule. 0 with none. */
export function effectPm(u, field) {
  const list = u && Array.isArray(u.statuses) ? u.statuses : null;
  if (!list || !list.length) return 0;
  /* key -> { best } (a strongest key) or key -> Map(row id -> best) (an add key) */
  let keys = null;
  for (const st of list) {
    const row = rowOfStack(st);
    if (!row || row.ground || !(st.left > 0)) continue;
    const v = stackValue(u, row, st, field);
    if (!v) continue;
    if (!keys) keys = new Map();
    const add = STATUS_KEYS[row.key].combine === 'add';
    const slot = add ? row.key + '\u0000' + row.id : row.key;
    const was = keys.get(slot);
    if (was === undefined || Math.abs(v) > Math.abs(was)) keys.set(slot, v);
  }
  if (!keys) return 0;
  let total = 0;
  const added = new Map();
  for (const [slot, v] of keys) {
    const cut = slot.indexOf('\u0000');
    if (cut < 0) { total += v; continue; }
    const key = slot.slice(0, cut);
    added.set(key, (added.get(key) || 0) + v);
  }
  for (const [key, v] of added) {
    const cap = STATUS_KEYS[key].capPm;
    total += Number.isInteger(cap) && Math.abs(v) > cap ? Math.sign(v) * cap : v;
  }
  return total;
}

/** True when unit `u` carries a live stack whose row has `flag` (silence). */
export function hasEffect(u, flag) {
  const list = u && Array.isArray(u.statuses) ? u.statuses : null;
  if (!list) return false;
  for (const st of list) { const row = rowOfStack(st); if (row && !row.ground && row[flag] === true && st.left > 0) return true; }
  return false;
}
