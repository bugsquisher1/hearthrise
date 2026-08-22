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

import { isServerOfRecord, recordValue } from './record.js?v=433';

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
  };
}
