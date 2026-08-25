// ============================================================================
// src/net/equipment-record.js — THE READ SIDE OF SERVER-OWNED EQUIPMENT (b446).
//
// src/net/record.js moved the RECORD (the `equipment` map entry, shipped DORMANT
// in b433 — EQUIPMENT_RECORD_ARM_ENABLED). This module is the read side, the
// exact analogue of src/net/rooms-record.js: the ONE accessor every `G.equipment`
// READ must go through so that, once EQUIPMENT_RECORD_ARM_ENABLED is flipped, the
// worn set is read from the server's `player_equipment` projection (hr_state_of's
// top-level `equipment` sibling, decoded by decodeEquipment) and NEVER from the
// client-authored `G.equipment` blob — and an un-arrived set reads as a SAFE
// EMPTY map (naked), never as a forgeable local item and never as `undefined`.
//
// ── WHY THE FAIL-CLOSED VALUE IS AN EMPTY OBJECT, NOT null (rooms' ruling) ────
// Gold/marks fail-closed to UNKNOWN (a scalar the caller branches on). Equipment
// CANNOT, because ~74 equipment read sites iterate or index: `Object.values(
// G.equipment)`, `Object.keys(G.equipment)`, `for(const s in G.equipment)`,
// `s in G.equipment`, `G.equipment[slot]`. A `null`/`undefined` there THROWS at
// boot/combat — the exact class of lockout gold hit on `G.gold.toLocaleString()`
// before balance.js, and rooms hit on `Object.values(G.rooms)` before
// rooms-record.js. Under the strip (record.js forgetServerOfRecord deletes
// `G.equipment` from a LIVE G on load under arm) a raw read is `undefined`, so
// this accessor's contract is: the fail-closed value is a SAFE, NON-THROWING,
// EMPTY object.
//
//   • `Object.values(equipmentMap(G))` NEVER throws — it is always a real object.
//   • An UNKNOWN worn set degrades to "no gear confirmed yet" (naked) for the
//     width of one `hr_load` — the acceptable, honest, online-only state (the
//     em-dash class). It is NEVER a forged/blob item: a client-authored weapon
//     can never cross into a stat the server has not confirmed.
//   • `equippedItem(G, slot)` fail-closes to `null` (empty slot) — never a
//     forged item id, never a throw.
//
// ── DORMANT TODAY, A NO-OP BY CONSTRUCTION ──────────────────────────────────
// While `equipment` is not on the ACTIVE registry (EQUIPMENT_RECORD_ARM_ENABLED
// off), isServerOfRecord('equipment') is false and every accessor here falls
// through to `G.equipment` and returns exactly what a raw read returned —
// byte-for-byte. That is what makes wiring a read site through this module safe
// to ship BEFORE the arm: it changes nothing until the flip, then it is already
// correct. Mirrors rooms-record.js / skill-record.js's no-op.
//
// It never WRITES a slot. Not a default, not a repair. DOM-free. Node-importable.
// ============================================================================

import { isServerOfRecord, recordValue } from './record.js?v=476';

/** A frozen empty map, returned for the UNKNOWN case. Frozen so a caller that
 *  (wrongly) tries to WRITE a slot into the fail-closed value cannot mutate a
 *  shared object — the arm intent is that writes go through the server (the equip
 *  verb), and a silent local grant on the shared empty map would be the two-
 *  sources bug the whole record framework exists to prevent. */
const EMPTY_EQUIP = Object.freeze({});

/** The one read. Everything else is a shape of this answer.
 *  @returns {{known, map, source, reason}} `map` is ALWAYS a real object — an
 *  empty (frozen) one when !known — so callers may iterate/index it without a
 *  guard. */
export function equipmentOf(G) {
  if (!G || typeof G !== 'object') {
    return { known: false, map: EMPTY_EQUIP, reason: 'no-state', source: 'none' };
  }
  /* THE REGISTRY FIRST, AND IT IS FINAL — same rule as roomsOf/marksOf. Once
     `equipment` is on the active registry, presence in G proves nothing
     (record.js b347): the map must have arrived from a server envelope
     (hr_state_of → decodeEquipment), verified by the b347 fingerprint. */
  if (isServerOfRecord('equipment')) {
    const rv = recordValue(G, 'equipment');
    if (!rv.known) {
      return { known: false, map: EMPTY_EQUIP, reason: rv.source || 'unknown', source: 'record' };
    }
    const map = rv.value;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return { known: false, map: EMPTY_EQUIP, reason: 'not-map', source: 'record' };
    }
    /* decodeEquipment already validated every cell (slot-name grammar, item-id
       grammar or explicit null) and let a bad cell condemn the whole map to
       UNKNOWN, so the value is trustworthy as given. `{}` is a KNOWN "wears
       nothing" — a real, common state (a naked character), NOT the UNKNOWN
       signal (which decodeEquipment reserves for an ABSENT envelope key). */
    return { known: true, map, reason: 'ok', source: 'server' };
  }
  /* NOT MOVED (dormant) — the client owns `G.equipment`, read it as before. An
     absent or non-object map coalesces to a KNOWN empty map, matching the live
     `(G.equipment||{})` reads so a wired site behaves identically today. */
  const raw = G.equipment;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { known: true, map: EMPTY_EQUIP, reason: 'ok', source: 'local' };
  }
  return { known: true, map: raw, reason: 'ok', source: 'local' };
}

/** Is the worn set known at all? Rarely needed — both KNOWN-empty and UNKNOWN
 *  render as "naked" — but available for a diagnostic that must tell the boot
 *  UNKNOWN window apart from a genuinely unequipped character. */
export function isEquipmentKnown(G) { return equipmentOf(G).known; }

/** THE MAP FORM — ALWAYS a real object, safe to `Object.values()` /
 *  `Object.keys()` / `Object.entries()` / `for..in` / index. This is the
 *  replacement for every raw `G.equipment` / `(G.equipment||{})` read. Under
 *  arm + UNKNOWN it is the frozen empty map (no gear confirmed). */
export function equipmentMap(G) { return equipmentOf(G).map; }

/** THE SLOT FORM — the item id worn in one slot, or `null` when the slot is
 *  empty OR the set is UNKNOWN. Fail-closed: an un-arrived set answers null (no
 *  item), never a local/forged id and never a throw. The greppable replacement
 *  for `G.equipment[slot]` / `G.equipment && G.equipment[slot]`. */
export function equippedItem(G, slot) {
  const map = equipmentMap(G);
  const key = String(slot == null ? '' : slot);
  const v = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  return (typeof v === 'string' && v) ? v : null;
}

if (typeof window !== 'undefined') {
  window.HearthriseEquipRead = { equipmentOf, isEquipmentKnown, equipmentMap, equippedItem };
}
