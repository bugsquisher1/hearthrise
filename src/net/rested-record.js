// ============================================================================
// src/net/rested-record.js — THE READ SIDE OF SERVER-OWNED RESTED XP.
//
// src/net/record.js moved the RECORD (the coupled `restedXp` + `restedAt`
// entries, shipped DORMANT). This module is the read side, the analogue of
// src/net/marks-record.js: the ONE accessor every rested read must go through so
// that, once RESTED_RECORD_ARM_ENABLED is flipped, the rested bank is read from
// the server's player_state.rested_xp/rested_at and NEVER from the client-authored
// save blob — and an un-arrived bank reads as UNKNOWN, never as a forgeable local
// number.
//
// ── COUPLED, BY CONTRACT ─────────────────────────────────────────────────────
// The bank is TWO facts — the charge count (`restedXp`) and the watermark it was
// banked to (`restedAt`) — and they are meaningless apart: a charge count with no
// watermark cannot accrue, a watermark with no count is not a bank. hr_state_of
// ALWAYS projects both, so under arm this reader requires BOTH to be `known`; if
// either is UNKNOWN the whole bank is UNKNOWN, fail-closed. That mirrors the
// events.js snapshot rule that treats restedXp/restedAt as "both fields or
// neither" and the ONE shared arm flag in record.js.
//
// ── THREE STATES, SAME CONTRACT AS balance.js / marks-record.js ──────────────
//   KNOWN    a finite non-negative charge count + a finite watermark ms.
//   UNKNOWN  the bank has not arrived (armed only). NOT zero. NOT stale.
//   n/a      not applicable (no G).
//
// It never WRITES rested. Not a default, not a repair. DOM-free. Node-importable.
// ============================================================================

import { isServerOfRecord, recordValue } from './record.js?v=492';

/** The one read. Everything else is a shape of this answer.
 *  @returns {{known, xp, at, source, reason}} xp/at are null when !known. */
export function restedOf(G) {
  if (!G || typeof G !== 'object') {
    return { known: false, xp: null, at: null, reason: 'no-state', source: 'none' };
  }
  /* THE REGISTRY FIRST, AND IT IS FINAL. Once the rested entries are on the
     active registry, presence in G proves nothing (record.js b347 fingerprint) —
     BOTH the count and its watermark must have arrived from a server envelope. */
  if (isServerOfRecord('restedXp')) {
    const rx = recordValue(G, 'restedXp');
    const ra = recordValue(G, 'restedAt');
    if (!rx.known || !ra.known) {
      return { known: false, xp: null, at: null,
        reason: (!rx.known ? (rx.source || 'unknown') : (ra.source || 'unknown')),
        source: 'record' };
    }
    const xp = Number(rx.value);
    const at = Number(ra.value);
    if (!Number.isFinite(xp) || xp < 0 || !Number.isFinite(at) || at <= 0) {
      return { known: false, xp: null, at: null, reason: 'not-finite', source: 'record' };
    }
    return { known: true, xp: Math.floor(xp), at: Math.floor(at), reason: 'ok', source: 'server' };
  }
  /* NOT MOVED (dormant) — the client owns `G.restedXp`/`G.restedAt`, read as
     before. An absent count coalesces to a KNOWN 0 (matching the live
     `(G.restedXp||0)` reads); an absent watermark is reported as null-but-known
     because a fresh save has not stamped it yet (ensureRestedState does that
     lazily), and a dormant reader must not turn that into UNKNOWN. */
  const xp = Number(G.restedXp) || 0;
  const rawAt = G.restedAt;
  const at = (typeof rawAt === 'number' && Number.isFinite(rawAt) && rawAt > 0) ? Math.floor(rawAt) : null;
  if (xp < 0) return { known: false, xp: null, at: null, reason: 'not-finite', source: 'local' };
  return { known: true, xp: Math.floor(xp), at, reason: 'ok', source: 'local' };
}

/** Is the rested bank known at all? */
export function isRestedKnown(G) { return restedOf(G).known; }

/** THE CHARGE COUNT — a number, or null for UNKNOWN. Branch on null. */
export function restedCharges(G) {
  const b = restedOf(G);
  return b.known ? b.xp : null;
}

/** THE EXPLICIT-FALLBACK FORM — greppable, unlike `(G.restedXp||0)`. For a read
 *  that is genuinely not authority (a diagnostic, a display tally). */
export function restedChargesOr(G, fallback) {
  const b = restedOf(G);
  return b.known ? b.xp : (fallback === undefined ? 0 : fallback);
}

if (typeof window !== 'undefined') {
  window.HearthriseRested = { restedOf, isRestedKnown, restedCharges, restedChargesOr };
}
