// ════════════════════════════════════════════════════════════════════════
// src/core/charms.js — BESTIARY CHARMS: class kill totals → rank → multipliers.
//
// Deliberately shaped as a MIRROR of src/core/bane.js, because it answers the
// same question from a different input: "what does this character get against
// this monster CLASS?". bane.js reads the equipment; this reads the server's
// kill counters. Same null-prototype index, same `…MultFor(cls, index)` call
// shape, same rule that the ceiling is an invariant of the FORMULA and not a
// promise the data table keeps. A future reader who has read one has read both.
//
// ── PHASE 2 IS ARMED: `charmDropMultFor` HAS EXACTLY ONE CALLER ─────────────
// It is read inside `weaknessInfo` (src/core/combat.js) — one expression, two
// callers: the live tick and the Edge replay — and NOT as a `getBonus` key.
// bane.js's header states the whole argument: the Edge engine does not run the
// client's monkey-patch bonus chain, so a charm expressed as a bonus key would
// work awake and read ZERO while the player slept. Do not arm it anywhere else.
//
// THE RANK IS AN INPUT TO THAT EXPRESSION, NEVER A WIRE FIELD. The Edge folds
// `hr_bestiary_of`'s own rows (`killsByClass` → `charmIndex`) inside the engine
// and is the only authority; the client folds the `bestiary.kills_by_class`
// block the server projected, purely so the loot preview and the live tick
// predict the same numbers, and every kill it predicts is re-resolved server
// side. There is no request field carrying a rank, so there is none to forge.
//
// ⚠ `charmDamageMultFor` IS STILL CALLERLESS, ON PURPOSE (phase 3). `maxHit` is
//   an integer and `playerCombatRolls` applies `weak.damageMult` through
//   `Math.floor`, so the ladder's 1.01 at rank 3 would round away to nothing on
//   most loadouts — a stated effect that does nothing. When the Designer's phase
//   3 lands it multiplies into `damageMult` inside that same one expression,
//   under MAX_TOTAL_DAMAGE_MULT, and nowhere else.
//
// ── WHY THE CLASS TOTAL IS RESOLVED THROUGH bane.js AND NOT `m.cls` ─────────
// There are TWO live spellings of the eleventh class in this repo:
// src/data/monster-classes.js keys it `extradimensional` (which is what every
// roster row's `cls` field carries) and the bane taxonomy keys it
// `extra_dimensional`. `normalizeClass` only inserts a separator at a
// lower→upper case boundary, so `normalizeClass('extradimensional')` is NULL —
// measured. `classOfMonster` gets the right answer anyway because it reads
// `class || family` and `family` is `'Extra Dimensional'` with the space
// (verified over the whole roster: all 108 rows resolve, 6 of them to
// extra_dimensional). That is a two-hop coincidence, not a contract, so
// `killsByClass` routes through `classOfMonster` — the one function that owns
// the reconciliation — and never reads a class field itself. A future reader who
// "simplifies" this to `monsters[id].cls` will silently drop Extra Dimensional:
// the exact class whose hidden element weakness the charm exists to reveal.
//
// ── SCALING ─────────────────────────────────────────────────────────────────
// `killsByClass` is one pass over the counters the server sent (one row per
// monster ever killed, ≤ the roster size) and knows nothing about how many
// monsters or classes exist. `charmIndex` is one pass over the classes present.
// Adding a monster or a class is a data row; nothing here counts either.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no clock.
// ════════════════════════════════════════════════════════════════════════

import { CHARM_RANKS, MAX_CHARM_DROP_MULT, MAX_CHARM_DAMAGE_MULT } from '../data/bestiary-charms.js?v=555';
import { classOfMonster } from './bane.js?v=555';

/**
 * Fold `{monsterId: kills}` into `{class: kills}`.
 *
 * `monsters` is passed IN rather than imported so this module stays pure and so
 * the Edge Function hands it the same sealed catalogue it hands the combat
 * engine. A monster id the catalogue does not know, or one whose class does not
 * normalise, is DROPPED rather than bucketed under a junk key: a charm is a
 * capability, and inventing a class from an unknown id is how a capability
 * becomes forgeable from a stale save.
 *
 * NULL PROTOTYPE: the keys are derived from data and are later used as lookup
 * keys, and on a plain object `__proto__`/`constructor` are truthy. Same
 * receipt as `baneIndex` and `indexGatherNodes`.
 *
 * @returns {object|null} null when nothing resolved, so the common "never
 *   fought anything" case costs one truthiness check downstream.
 */
export function killsByClass(killsByMonsterId, monsters) {
  if (!killsByMonsterId || typeof killsByMonsterId !== 'object') return null;
  let out = null;
  for (const id of Object.keys(killsByMonsterId)) {
    const n = Number(killsByMonsterId[id]);
    if (!(n > 0)) continue;
    const cls = classOfMonster(monsters && monsters[id]);
    if (!cls) continue;
    if (!out) out = Object.create(null);
    out[cls] = (out[cls] || 0) + Math.floor(n);
  }
  return out;
}

/**
 * The ladder row a kill total has earned, or null below the first rung.
 *
 * Walks DOWNWARD so the answer is the HIGHEST rung satisfied — a ladder edited
 * out of ascending order still cannot report a lower rank than earned, which
 * is the strict direction. The returned row is frozen (see the data module).
 */
export function charmRankAt(kills) {
  const n = Number(kills);
  if (!(n > 0)) return null;
  for (let i = CHARM_RANKS.length - 1; i >= 0; i -= 1) {
    if (n >= CHARM_RANKS[i].at) return CHARM_RANKS[i];
  }
  return null;
}

/**
 * The NEXT rung a class is working toward: `{rank, id, at, remaining}`, or null
 * at the ceiling. This is the "next charm at N kills" affordance — a progress
 * statement, never a power one.
 */
export function nextCharmAt(kills) {
  const n = Math.max(0, Math.floor(Number(kills) || 0));
  for (let i = 0; i < CHARM_RANKS.length; i += 1) {
    if (n < CHARM_RANKS[i].at) {
      const r = CHARM_RANKS[i];
      return { rank: r.rank, id: r.id, at: r.at, remaining: r.at - n };
    }
  }
  return null;
}

/**
 * Build `{class: rank}` from `{class: kills}` — the shape every renderer and
 * (later) every multiplier reads.
 *
 * Only classes that have EARNED a rank appear, so `index[cls]` is falsy for
 * "not studied" and no caller needs to know the ladder's first threshold. Null
 * when nothing is ranked, for the same reason `baneIndex` returns null.
 */
export function charmIndex(killsByClassMap) {
  if (!killsByClassMap || typeof killsByClassMap !== 'object') return null;
  let out = null;
  for (const cls of Object.keys(killsByClassMap)) {
    const row = charmRankAt(killsByClassMap[cls]);
    if (!row) continue;
    if (!out) out = Object.create(null);
    out[cls] = row.rank;
  }
  return out;
}

/**
 * The rank an index holds for `cls`, OWN-PROPERTY ONLY — 0 for anything else.
 *
 * ⚠ `index[cls]` IS NOT ENOUGH, measured by the Security review of 2026-09-13:
 *   with `Object.prototype.constructor` truthy on ANY plain object,
 *   `charmDropMultFor('constructor', {})` returned 1.03 — a top-rung charm on a
 *   class nobody has killed anything in. `charmIndex` builds a null-prototype
 *   map, so the live path was never exposed, but this module's own header says
 *   the ceiling is a property of the FORMULA and not of who happens to call it:
 *   a guard that only holds while every caller behaves is not a guard. Same
 *   receipt `catalogueHas` in intents.js already carries.
 */
function rankOf(index, cls) {
  return Object.prototype.hasOwnProperty.call(index, cls) ? index[cls] : 0;
}

/** The ladder row for a rank number, or null. Internal to the two mults + UI. */
export function charmRowOfRank(rank) {
  const r = Number(rank);
  if (!(r >= 1)) return null;
  return CHARM_RANKS[Math.min(CHARM_RANKS.length, Math.floor(r)) - 1] || null;
}

/**
 * The rank this index holds for `cls`, 0..MAX_CHARM_RANK, clamped to the ladder.
 *
 * The RECEIPT's reader: the away card and the loot modal name the rank a night
 * was priced with, and they must read it from the same index the multiplier did
 * rather than re-deriving it from counters that may have moved since the window
 * closed. Own-property only, like the two multipliers.
 */
export function charmRankFor(cls, index) {
  if (!cls || !index) return 0;
  const row = charmRowOfRank(rankOf(index, cls));
  return row ? row.rank : 0;
}

/**
 * The clamped DROP multiplier this character gets against `cls`. Always ≥ 1.
 *
 * READ BY `weaknessInfo` (src/core/combat.js) AND BY NOTHING ELSE — the one
 * expression the live tick and the Edge replay share. The clamp is the last
 * word, so a hostile or fat-fingered ladder row cannot out-argue the formula.
 */
export function charmDropMultFor(cls, index) {
  if (!cls || !index) return 1;
  const row = charmRowOfRank(rankOf(index, cls));
  const raw = Number(row && row.drop);
  if (!(raw > 1)) return 1;
  return raw > MAX_CHARM_DROP_MULT ? MAX_CHARM_DROP_MULT : raw;
}

/**
 * The clamped DAMAGE multiplier this character gets against `cls`. Always ≥ 1.
 * ⚠ NOT READ BY ANYTHING IN THIS BUILD (phase 3). See the header.
 */
export function charmDamageMultFor(cls, index) {
  if (!cls || !index) return 1;
  const row = charmRowOfRank(rankOf(index, cls));
  const raw = Number(row && row.dmg);
  if (!(raw > 1)) return 1;
  return raw > MAX_CHARM_DAMAGE_MULT ? MAX_CHARM_DAMAGE_MULT : raw;
}

/** Does this rank lift the `hiddenElement` curtain? Fail-safe: no rank ⇒ no. */
export function charmRevealsAt(rank) {
  const row = charmRowOfRank(rank);
  return !!(row && row.reveal);
}
