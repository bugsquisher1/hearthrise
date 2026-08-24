// ============================================================================
// src/net/skill-record.js — THE READ SIDE OF SERVER-OWNED SKILL XP (b429).
//
// src/net/record.js moved the RECORD (the `skills` entry, shipped DORMANT).
// This module is the read side, the exact analogue of src/net/balance.js for
// gold/gems: the ONE accessor every skill-xp read must go through so that, once
// SKILLS_RECORD_ARM_ENABLED is flipped, a skill's xp is read from the server's
// map and NEVER from the client-authored `G.skills` blob — and an un-arrived map
// reads as UNKNOWN, never as a forgeable local number.
//
// ── THE MAP-VS-SCALAR SHAPE, RESTATED WHERE IT IS CONSUMED ──────────────────
// `gold` is one scalar; `skills` is ONE record entry whose value is the whole
// map `{skill_id: xp}`. So `recordValue(G,'skills')` answers known/unknown for
// the ENTIRE map at once — there is no per-skill provenance, and there must not
// be, because the server sends one object with one version. This accessor slices
// an individual skill out of that one answer:
//   • map UNKNOWN            → every skill is UNKNOWN (fail-closed).
//   • map KNOWN, id present  → that xp, floored, is the value.
//   • map KNOWN, id ABSENT   → 0 xp, KNOWN. The server is authoritative; a skill
//                              it does not list is genuinely at 0 (level 1), not
//                              unknown. This is the one place "absent" is a claim
//                              rather than a gap, and it is only reachable once
//                              the whole map is known-from-the-server.
//
// ── THREE STATES, SAME CONTRACT AS balance.js ───────────────────────────────
//   KNOWN    a finite non-negative integer xp the client may show/level.
//   UNKNOWN  the map has not arrived (or was overwritten by a non-server writer,
//            caught by record.js's b347 fingerprint). NOT zero. NOT stale.
//   n/a      not applicable (no G).
//
// ── DORMANT TODAY, A NO-OP BY CONSTRUCTION ──────────────────────────────────
// While `skills` is not on the ACTIVE registry (arm flag off), isServerOfRecord
// is false and every accessor here falls through to `G.skills[id]` and returns
// exactly what a raw read returned — byte-for-byte. That is what makes wiring a
// read site through this module safe to ship BEFORE the arm: it changes nothing
// until the flip, then it is already correct. Mirrors balance.js's "no-op today"
// property (its header, "WHY UNKNOWN IS REACHABLE WITHOUT THE REGISTRY ARMED").
//
// It never WRITES a skill. Not a default, not a repair. DOM-free. Node-importable.
// ============================================================================

import { isServerOfRecord, recordValue, recordLastKnown, clientMayWrite } from './record.js?v=469';
import { predictedXp, predictedXpMap } from './predict.js?v=469';

/** The one read. Everything else is a shape of this answer.
 *  @returns {{id, known, value, reason, source}} value is null when !known. */
export function skillXpOf(G, id) {
  const key = String(id == null ? '' : id);
  if (!G || typeof G !== 'object') {
    return { id: key, known: false, value: null, reason: 'no-state', source: 'none' };
  }
  /* THE REGISTRY FIRST, AND IT IS FINAL — same rule as balanceOf. Once `skills`
     is on the active registry, presence in G proves nothing (record.js b347). */
  if (isServerOfRecord('skills')) {
    const rv = recordValue(G, 'skills');
    if (!rv.known) {
      return { id: key, known: false, value: null, reason: rv.source || 'unknown', source: 'record' };
    }
    const map = rv.value;
    if (!map || typeof map !== 'object') {
      return { id: key, known: false, value: null, reason: 'not-map', source: 'record' };
    }
    const has = Object.prototype.hasOwnProperty.call(map, key);
    const n = has ? Number(map[key]) : 0;   // server-authoritative: absent skill == 0 xp
    if (!Number.isFinite(n) || n < 0) {
      return { id: key, known: false, value: null, reason: 'not-finite', source: 'record' };
    }
    return { id: key, known: true, value: Math.floor(n), reason: 'ok', source: 'server' };
  }
  /* NOT MOVED (dormant) — the client owns `G.skills`, read it as before. */
  const map = (G.skills && typeof G.skills === 'object' && !Array.isArray(G.skills)) ? G.skills : null;
  if (!map) return { id: key, known: false, value: null, reason: 'absent', source: 'local' };
  const raw = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : 0;
  const n = Number(raw) || 0;
  if (!Number.isFinite(n) || n < 0) {
    return { id: key, known: false, value: null, reason: 'not-finite', source: 'local' };
  }
  return { id: key, known: true, value: Math.floor(n), reason: 'ok', source: 'local' };
}

/** Is a skill's xp known at all? */
export function isSkillXpKnown(G, id) { return skillXpOf(G, id).known; }

/** THE ARITHMETIC FORM — a number, or null for UNKNOWN. A caller that does
 *  arithmetic on the result without checking gets `null + n === n`, which is
 *  wrong; branch on null (or use skillXpOr for a deliberate fallback). */
export function skillXpNum(G, id) {
  const b = skillXpOf(G, id);
  return b.known ? b.value : null;
}

/** THE EXPLICIT-FALLBACK FORM — greppable, unlike `(G.skills[id]||0)`. For a
 *  read that is genuinely not authority (a diagnostic, a session tally). NEVER
 *  for a levelling/combat decision — those must respect UNKNOWN. */
export function skillXpOr(G, id, fallback) {
  const b = skillXpOf(G, id);
  return b.known ? b.value : (fallback === undefined ? 0 : fallback);
}

/** THE LEVEL FORM — fail-closed. `null` when the xp is UNKNOWN, so a UI/combat
 *  read cannot silently treat an un-arrived skill as level 1. `levelFn` defaults
 *  to the game's canonical curve (window.HearthriseCore.xp.levelFromXp); pass one
 *  explicitly in Node/tests. Returns null if no curve is available rather than
 *  guessing a level. */
export function skillLevelOf(G, id, levelFn) {
  const b = skillXpOf(G, id);
  if (!b.known) return null;
  let fn = typeof levelFn === 'function' ? levelFn : null;
  if (!fn && typeof window !== 'undefined' && window.HearthriseCore
      && window.HearthriseCore.xp && typeof window.HearthriseCore.xp.levelFromXp === 'function') {
    fn = window.HearthriseCore.xp.levelFromXp;
  }
  if (!fn && typeof window !== 'undefined' && typeof window.levelFromXp === 'function') {
    fn = window.levelFromXp;
  }
  if (!fn) return null;
  const lv = Number(fn(b.value));
  return Number.isFinite(lv) ? lv : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE DISPLAY SIDE (b455) — SERVER TRUTH **PLUS** THE PREDICTION
   ══════════════════════════════════════════════════════════════════════════

   Everything above is the AUTHORITY side and stays exactly as it was: it answers
   what the SERVER said, or UNKNOWN, and it never adds a client number. Nothing
   that gates, spends, or crosses to another player may use anything below.

   What is below is what a RENDERER asks. It differs in two deliberate ways and
   both were paid for by the live "woodcutting bouncing lvl 5 → lvl 1" defect:

   1. IT ADDS THE PREDICTION. Under the arm the client no longer writes G.skills
      (legacy.js addXp routes to predict.js instead), so the record stays
      `known:true` and the player would otherwise see NOTHING move for up to the
      server's 90-second settle floor. Display = server xp + predicted delta, so
      every tick moves the bar immediately and the settle is a small snap rather
      than the only event.

   2. IT NEVER ANSWERS "UNKNOWN" ONCE THE SERVER HAS EVER SPOKEN. The authority
      accessor fail-closes the moment anything but applyRecord touches G.skills.
      For a spend that is right. For a renderer it is how one un-gated write
      became a level-1 bounce. So the display walks a LADDER, most-trustworthy
      first, and only the top rung is ever treated as authority:

        (a) record KNOWN            → the server's map. The normal path.
        (b) record CLIENT-OVERWROTE → the local `G.skills` value. Something wrote
                                      it; it is optimistic, not forged-by-design,
                                      and it is strictly better to show than a
                                      collapse to 1. (A devtools forgery shows a
                                      wrong number to the forger and changes
                                      nothing the server does.)
        (c) last-known-good         → the last value the SERVER stated
                                      (record.js `recordLastKnown`), for the case
                                      where G.skills is unreadable entirely.
        (d) nothing has ever landed → UNKNOWN, and the caller must handle it.
                                      Only reachable BEFORE the first envelope.

   Rung (b) is what makes the bounce structurally impossible instead of merely
   fixed: it does not depend on this sweep having found every writer. */

/** THE DISPLAY READ. Same answer shape as skillXpOf, plus `predicted` and the
 *  `rung` it came from (for the diagnostic — a display that silently degrades is
 *  a display nobody notices has degraded). */
export function skillXpForDisplay(G, id) {
  const key = String(id == null ? '' : id);
  if (!G || typeof G !== 'object') {
    return { id: key, known: false, value: null, predicted: 0, rung: 'no-state', source: 'none' };
  }
  /* ⚠ ADDED ONLY WHILE THE CLIENT MAY **NOT** WRITE `skills` — the same predicate
     the write site (legacy.js addXp) branches on. A prediction only exists because
     a write was refused; with the gate open the gain is already in G.skills and
     adding it again would double-count. See balance.js's twin of this comment. */
  const pred = clientMayWrite('skills') ? 0 : predictedXp(G, key);
  if (!isServerOfRecord('skills')) {
    /* DORMANT — the client owns G.skills, so it is BOTH the truth and where any
       gain already landed. Adding a prediction here would double-count; there is
       none to add, because nothing predicts while the write gate is open. */
    const b = skillXpOf(G, key);
    return { id: key, known: b.known, value: b.value, predicted: 0, rung: 'local', source: b.source };
  }
  const rv = recordValue(G, 'skills');
  let base = null;
  let rung = null;
  if (rv.known && rv.value && typeof rv.value === 'object') {
    base = numOrNull(rv.value[key]);
    if (base === null && !Object.prototype.hasOwnProperty.call(rv.value, key)) base = 0;
    rung = 'server';
  }
  /* ⚠ THE PRESENCE GATE, AND IT IS LOAD-BEARING. Rungs (b) and (c) are only
     reachable when `G.skills` is actually THERE. An ABSENT field is the strip
     state — the record framework deleted it on load and nothing has arrived yet
     — and the honest answer to that is UNKNOWN, not a resurrected number. This
     is also what keeps the B353-3 sweep meaningful: deleting a moved field from
     a live G must still render the pending state, or the guard proves nothing. */
  const present = Object.prototype.hasOwnProperty.call(G, 'skills');
  if (base === null && present) {
    const map = (G.skills && typeof G.skills === 'object' && !Array.isArray(G.skills)) ? G.skills : null;
    if (map) {
      base = Object.prototype.hasOwnProperty.call(map, key) ? numOrNull(map[key]) : 0;
      if (base !== null) rung = 'local';
    }
    if (base === null) {
      const last = recordLastKnown(G, 'skills');
      if (last && typeof last === 'object') {
        base = Object.prototype.hasOwnProperty.call(last, key) ? numOrNull(last[key]) : 0;
        if (base !== null) rung = 'last-known';
      }
    }
  }
  if (base === null) {
    return { id: key, known: false, value: null, predicted: pred, rung: 'unknown',
      source: rv.source || 'unknown' };
  }
  /* Clamped at 0: a NEGATIVE prediction (a refunded/reversed grant) must never
     render a negative xp bar, and a level curve fed a negative is undefined. */
  return { id: key, known: true, value: Math.max(0, Math.floor(base + pred)),
    predicted: pred, rung, source: rung === 'server' ? 'server' : rung };
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** The DISPLAY xp as a number, with an explicit fallback. This is what legacy's
 *  `skillXp()` reads. */
export function skillXpForDisplayOr(G, id, fallback) {
  const b = skillXpForDisplay(G, id);
  return b.known ? b.value : (fallback === undefined ? 0 : fallback);
}

/** The DISPLAY level, or `null` when nothing has ever landed. The caller still
 *  decides what "nothing has ever landed" means — but unlike skillLevelOf, this
 *  cannot answer null merely because a local write happened. */
export function skillLevelForDisplay(G, id, levelFn) {
  const b = skillXpForDisplay(G, id);
  if (!b.known) return null;
  const fn = resolveLevelFn(levelFn);
  if (!fn) return null;
  const lv = Number(fn(b.value));
  return Number.isFinite(lv) ? lv : null;
}

/**
 * The DISPLAY skills map — the same ladder as `skillXpForDisplay`, resolved ONCE
 * for the whole map. For the rollups (`totalLevel`, `combatLevel`) and for the
 * combat roll, which need every skill at once. Always an object, never null.
 *
 * ⚠ IT RESOLVES THE LADDER ONCE, NOT ONCE PER KEY, and that is a performance
 *   decision with a reason rather than a micro-optimisation. `recordValue`
 *   fingerprints the ENTIRE map on every call (record.js b347), so a per-key loop
 *   over `skillXpForDisplay` would be O(n²) string building — and `getCombatLevel`
 *   is on the combat render path, i.e. several times a second.
 */
export function skillsForDisplay(G) {
  const out = {};
  if (!G || typeof G !== 'object') return out;
  const moved = isServerOfRecord('skills');
  const pred = (moved && !clientMayWrite('skills')) ? predictedXpMap(G) : {};
  const local = (G.skills && typeof G.skills === 'object' && !Array.isArray(G.skills)) ? G.skills : null;

  /* THE BASE, chosen once, by the same ladder skillXpForDisplay walks. */
  let base = null;
  if (moved) {
    const rv = recordValue(G, 'skills');
    if (rv.known && rv.value && typeof rv.value === 'object') base = rv.value;
    /* PRESENT-BUT-UNVOUCHED → the local optimistic map; ABSENT → last-known, then
       nothing. `hasOwnProperty` rather than truthiness: an absent `skills` is the
       strip state and must not resurrect a number. */
    if (!base && Object.prototype.hasOwnProperty.call(G, 'skills')) base = local;
    if (!base) {
      const last = recordLastKnown(G, 'skills');
      if (last && typeof last === 'object') base = last;
    }
  } else {
    base = local;
  }
  if (base) {
    for (const k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      const n = numOrNull(base[k]);
      if (n !== null) out[k] = n;
    }
  }
  for (const k in pred) {
    if (!Object.prototype.hasOwnProperty.call(pred, k)) continue;
    const n = Number(pred[k]);
    if (Number.isFinite(n)) out[k] = Math.max(0, Math.floor((out[k] || 0) + n));
  }
  return out;
}

function resolveLevelFn(levelFn) {
  if (typeof levelFn === 'function') return levelFn;
  if (typeof window !== 'undefined' && window.HearthriseCore
      && window.HearthriseCore.xp && typeof window.HearthriseCore.xp.levelFromXp === 'function') {
    return window.HearthriseCore.xp.levelFromXp;
  }
  if (typeof window !== 'undefined' && typeof window.levelFromXp === 'function') return window.levelFromXp;
  return null;
}

/** One line for a diagnostic / bug report — never player-facing. */
export function skillState(G, ids) {
  const out = {};
  const list = Array.isArray(ids) ? ids
    : (G && G.skills && typeof G.skills === 'object') ? Object.keys(G.skills) : [];
  for (const id of list) {
    const b = skillXpOf(G, id);
    out[id] = b.known ? b.value : ('UNKNOWN:' + b.reason);
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.HearthriseSkillRecord = {
    skillXpOf, isSkillXpKnown, skillXpNum, skillXpOr, skillLevelOf, skillState,
    skillXpForDisplay, skillXpForDisplayOr, skillLevelForDisplay, skillsForDisplay,
  };
}
