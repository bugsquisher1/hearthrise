// ============================================================================
// src/net/rooms-record.js — THE READ SIDE OF SERVER-OWNED HOUSE ROOMS (b431).
//
// src/net/record.js moved the RECORD (the `rooms` map entry, shipped DORMANT).
// This module is the read side, the exact analogue of src/net/skill-record.js:
// the ONE accessor every `G.rooms` read must go through so that, once
// ROOMS_RECORD_ARM_ENABLED is flipped, a room's rung is read from the server's
// permanent `progress` rows (`room:<id>` unlocks, shaped by pickRooms) and NEVER
// from the client-authored `G.rooms` blob — and an un-arrived map reads as a
// SAFE EMPTY map, never as a forgeable local rung, and never as `undefined`.
//
// ── WHY THE FAIL-CLOSED VALUE IS AN EMPTY OBJECT, NOT null ───────────────────
// Gold/marks fail-closed to UNKNOWN (a scalar the caller must branch on). Rooms
// CANNOT, because every room read site iterates: `Object.values(G.rooms)`,
// `G.rooms[id]`, `(G.rooms||{}).kitchen`. A `null`/`undefined` there THROWS at
// boot — the exact class of crash gold hit on `G.gold.toLocaleString()` before
// balance.js, except here it locks every player out because the map is walked on
// the first render. So this accessor's contract is: the fail-closed value is a
// SAFE, NON-THROWING, EMPTY object.
//
//   • `Object.values(roomsMap(G))` NEVER throws — it is always a real object.
//   • An UNKNOWN room state degrades to "no rooms confirmed yet" (no house
//     bonus, no owned rooms) for the width of one `hr_load` — the acceptable,
//     honest, online-only state, exactly like gold's pending em dash.
//   • It NEVER degrades to "all rooms" or a local rung: a forged/blob room can
//     never cross into a bonus the server has not confirmed.
//
// That is the ONE deliberate divergence from skill-record.js's UNKNOWN scalar:
// a map read cannot express UNKNOWN without crashing its iterating callers, so
// the safe empty map IS the UNKNOWN signal for rooms, and `isRoomsKnown()` is
// provided for the rare caller that must distinguish "confirmed empty" from
// "not yet arrived" (both render as no rooms, so almost nobody needs it).
//
// ── DORMANT TODAY, A NO-OP BY CONSTRUCTION ──────────────────────────────────
// While `rooms` is not on the ACTIVE registry (arm flag off), isServerOfRecord
// is false and every accessor here falls through to `G.rooms` and returns
// exactly what a raw read returned — byte-for-byte. That is what makes wiring a
// read site through this module safe to ship BEFORE the arm: it changes nothing
// until the flip, then it is already correct. Mirrors skill-record.js's no-op.
//
// It never WRITES a room. Not a default, not a repair. DOM-free. Node-importable.
// ============================================================================

import { isServerOfRecord, recordValue } from './record.js?v=498';

/** A frozen empty map, returned for the UNKNOWN case. Frozen so a caller that
 *  (wrongly) tries to WRITE a rung into the fail-closed value cannot mutate a
 *  shared object — the arm intent is that writes go through the server, and a
 *  silent local grant on the shared empty map would be a two-sources bug. */
const EMPTY_ROOMS = Object.freeze({});

/** The one read. Everything else is a shape of this answer.
 *  @returns {{known, map, source, reason}} `map` is ALWAYS a real object — an
 *  empty (frozen) one when !known — so callers may iterate it without a guard. */
export function roomsOf(G) {
  if (!G || typeof G !== 'object') {
    return { known: false, map: EMPTY_ROOMS, reason: 'no-state', source: 'none' };
  }
  /* THE REGISTRY FIRST, AND IT IS FINAL — same rule as skillXpOf. Once `rooms`
     is on the active registry, presence in G proves nothing (record.js b347):
     the map must have arrived from a server envelope (pickRooms → decodeRooms). */
  if (isServerOfRecord('rooms')) {
    const rv = recordValue(G, 'rooms');
    if (!rv.known) {
      return { known: false, map: EMPTY_ROOMS, reason: rv.source || 'unknown', source: 'record' };
    }
    const map = rv.value;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return { known: false, map: EMPTY_ROOMS, reason: 'not-map', source: 'record' };
    }
    /* decodeRooms already floored every rung to a finite int >= 0 (a bad cell
       condemns the whole map to UNKNOWN there), so the value is trustworthy as
       given. `{}` is a KNOWN "owns no rooms yet" — a real, common state. */
    return { known: true, map, reason: 'ok', source: 'server' };
  }
  /* NOT MOVED (dormant) — the client owns `G.rooms`, read it as before. An absent
     or non-object map coalesces to a KNOWN empty map, matching the live
     `(G.rooms||{})` reads so a wired site behaves identically today. */
  const raw = G.rooms;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { known: true, map: EMPTY_ROOMS, reason: 'ok', source: 'local' };
  }
  return { known: true, map: raw, reason: 'ok', source: 'local' };
}

/** Is the room map known at all? Rarely needed — both KNOWN-empty and UNKNOWN
 *  render as "no rooms" — but available for a diagnostic that must tell the
 *  boot UNKNOWN window apart from a genuinely fresh (roomless) character. */
export function isRoomsKnown(G) { return roomsOf(G).known; }

/** THE MAP FORM — ALWAYS a real object, safe to `Object.values()` / iterate /
 *  index. This is the replacement for every raw `G.rooms` / `(G.rooms||{})`
 *  read. Under arm + UNKNOWN it is the frozen empty map (no rooms confirmed). */
export function roomsMap(G) { return roomsOf(G).map; }

/** THE RUNG FORM — the integer rung of one room, 0 when not owned OR UNKNOWN.
 *  Fail-closed: an un-arrived map answers 0 (not owned), never a local rung and
 *  never a throw. The greppable replacement for `G.rooms[id]||0`. */
export function roomRung(G, id) {
  const map = roomsMap(G);
  const key = String(id == null ? '' : id);
  const n = Object.prototype.hasOwnProperty.call(map, key) ? Number(map[key]) : 0;
  return (Number.isFinite(n) && n > 0) ? Math.floor(n) : 0;
}

/** THE OWNERSHIP FORM — does the player own this room at rung >= 1? Fail-closed:
 *  UNKNOWN answers false (not owned). The greppable replacement for the
 *  `((G.rooms||{}).kitchen||0) > 0` idiom. */
export function roomOwned(G, id) { return roomRung(G, id) > 0; }

if (typeof window !== 'undefined') {
  window.HearthriseRooms = { roomsOf, isRoomsKnown, roomsMap, roomRung, roomOwned };
}
