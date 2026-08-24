// ============================================================================
// src/net/marks-record.js — THE READ SIDE OF SERVER-OWNED BOUNTY MARKS.
//
// src/net/record.js moved the RECORD (the `marks` scalar entry, shipped DORMANT).
// This module is the read side, the exact analogue of src/net/balance.js for
// gold/gems: the ONE accessor every marks-balance read must go through so that,
// once MARKS_RECORD_ARM_ENABLED is flipped, the marks balance is read from the
// server's player_state.marks and NEVER from the client-authored save blob — and
// an un-arrived balance reads as UNKNOWN, never as a forgeable local number.
//
// ── THE STORAGE LOCATION, NOW MIGRATED (b44x) ───────────────────────────────
// Marks used to live NESTED at `G.bountyHunter.marks`; they now live at the
// TOP-LEVEL scalar `G.marks`, exactly like gold. That migration is what makes the
// record framework's strip correct: the strip removes a TOP-LEVEL key, so the
// client home had to be top-level too — otherwise a stale nested copy would
// coexist with the server record under arm (the two-sources bug). A legacy save
// with only the old nested value is normalized up to `G.marks` in
// ensureBountyState() on load, so there is exactly ONE client home.
//   • DORMANT  → marks is not on the active registry → read `G.marks`
//                (coalescing absent to 0), so a wired site is byte-for-byte
//                unchanged.
//   • ARMED    → marks is on the registry → recordValue(G,'marks') is the ONLY
//                authority (including record.js's b347 fingerprint check), and an
//                un-arrived / overwritten balance is UNKNOWN, fail-closed.
//
// ── THREE STATES, SAME CONTRACT AS balance.js ───────────────────────────────
//   KNOWN    a finite non-negative integer the client may show/spend.
//   UNKNOWN  the balance has not arrived (armed only). NOT zero. NOT stale.
//   n/a      not applicable (no G).
//
// It never WRITES marks. Not a default, not a repair. DOM-free. Node-importable.
// ============================================================================

import { isServerOfRecord, recordValue } from './record.js?v=473';

/** The one read. Everything else is a shape of this answer.
 *  @returns {{known, value, reason, source}} value is null when !known. */
export function marksOf(G) {
  if (!G || typeof G !== 'object') {
    return { known: false, value: null, reason: 'no-state', source: 'none' };
  }
  /* THE REGISTRY FIRST, AND IT IS FINAL — same rule as balanceOf. Once `marks`
     is on the active registry, presence in G proves nothing (record.js b347). */
  if (isServerOfRecord('marks')) {
    const rv = recordValue(G, 'marks');
    if (!rv.known) {
      return { known: false, value: null, reason: rv.source || 'unknown', source: 'record' };
    }
    const n = Number(rv.value);
    if (!Number.isFinite(n) || n < 0) {
      return { known: false, value: null, reason: 'not-finite', source: 'record' };
    }
    return { known: true, value: Math.floor(n), reason: 'ok', source: 'server' };
  }
  /* NOT MOVED (dormant) — the client owns the TOP-LEVEL scalar `G.marks`. The
     storage migrated nested→top-level (b44x) so the client home matches the record
     field the framework strip keys on: while dormant this reads `G.marks`, and under
     arm the branch above reads the server record instead. Absent coalesces to 0 (a
     KNOWN zero), matching the live reads so a wired site behaves identically today.
     A legacy save carrying only the old nested `G.bountyHunter.marks` is normalized
     up to `G.marks` in ensureBountyState() on load, so the nested value is never the
     authority here. */
  const raw = G.marks;
  const n = Number(raw) || 0;
  if (!Number.isFinite(n) || n < 0) {
    return { known: false, value: null, reason: 'not-finite', source: 'local' };
  }
  return { known: true, value: Math.floor(n), reason: 'ok', source: 'local' };
}

/** Is the marks balance known at all? */
export function isMarksKnown(G) { return marksOf(G).known; }

/** THE ARITHMETIC FORM — a number, or null for UNKNOWN. Branch on null (or use
 *  marksOr for a deliberate fallback). */
export function marksNum(G) {
  const b = marksOf(G);
  return b.known ? b.value : null;
}

/** THE EXPLICIT-FALLBACK FORM — greppable, unlike `(G.bountyHunter.marks||0)`.
 *  For a read that is genuinely not authority (a diagnostic, a lifetime tally).
 *  NEVER for a spend decision — that must respect UNKNOWN (use canAffordMarks). */
export function marksOr(G, fallback) {
  const b = marksOf(G);
  return b.known ? b.value : (fallback === undefined ? 0 : fallback);
}

/** THE DECISION FORM — FAIL-CLOSED. An unknown balance cannot afford anything;
 *  you may not spend a number you have not been told. */
export function canAffordMarks(G, cost) {
  const c = Number(cost);
  if (!Number.isFinite(c)) return false;
  const b = marksOf(G);
  return b.known && b.value >= c;
}

/** THE DISPLAY FORM — a string, always. UNKNOWN renders as an em dash. */
export function fmtMarks(G, opts) {
  const o = opts || {};
  const b = marksOf(G);
  if (!b.known) return o.unknown === undefined ? '—' : String(o.unknown);
  if (typeof o.format === 'function') return String(o.format(b.value));
  return b.value.toLocaleString();
}

if (typeof window !== 'undefined') {
  window.HearthriseMarks = {
    marksOf, isMarksKnown, marksNum, marksOr, canAffordMarks, fmtMarks,
  };
}
