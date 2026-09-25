// ════════════════════════════════════════════════════════════════════════
// src/core/trophies.js — THE BESTIARY TROPHY LADDER: per-monster kill totals
// → stage → multipliers.
//
// Design: docs/design/BESTIARY_LADDER.md. Data: src/data/bestiary.js.
// Guard: tests/bestiary-trophy.mjs (plain + --selftest).
//
// Deliberately shaped as a MIRROR of src/core/charms.js, which is itself a
// mirror of src/core/bane.js, because all three answer the same question from a
// different input: "what does this character get against THIS monster?".
// bane.js reads the equipment; charms.js reads the server's kill counters
// folded per CLASS; this reads the SAME counters per MONSTER. Same
// null-prototype index, same `…MultFor(key, index)` call shape, same
// own-property receipt, same rule that the ceiling is an invariant of the
// FORMULA and not a promise the data table keeps. A reader who has read one has
// read all three.
//
// ── THE STAGE IS DERIVED ON EVERY READ, NEVER STORED ────────────────────────
// There is no `trophy_stage` column, no residue field and nothing to back-fill.
// The input is `hr_bestiary_of`'s own `{monsterId: kills}` rows — written only
// by hr_apply out of a SETTLED combat delta — so a stage cannot be held ahead of
// the server by a client, because the client holds no counter this reads. A
// second copy of a derivable fact is a thing that can disagree; that is the
// residue-ahead class CLAUDE.md §6 names.
//
// The CLAIM (hr_trophy_claim) writes a `collection` trophy ROW and grants NO
// power. The power is already on. So a player who never opens the Bestiary is
// never behind, and a forged claim cannot mint a multiplier because there is no
// multiplier column to forge.
//
// ── DROP IS ARMED; DAMAGE IS NOT, AND THE OMISSION IS THE DESIGN ────────────
// `trophyDropMultFor` has exactly ONE caller: `weaknessInfo` (src/core/combat.js)
// — one expression, two callers, the live tick and the Edge replay. It is NOT a
// `getBonus` key, and the reason is the whole of bane.js's header: the Edge
// engine does not run the client's monkey-patched bonus chain, so a trophy
// expressed as a bonus key would work awake and read ZERO while the player
// slept. That is the difference between a bonus that pays an away night and one
// that quietly does not.
//
// `trophyDamageMultFor` is gated behind TROPHY_DAMAGE_ARM_ENABLED (below) for
// the reason BESTIARY_LADDER.md §3.1 states: `maxHit` is an INTEGER and
// `playerCombatRolls` applies `weak.damageMult` through `Math.floor`, so the
// x1.01 at `nemesis` rounds away on most loadouts. It arms in the SAME change
// that arms the charm's damage half, so one review covers one expression once.
//
// ── THE PRODUCT IS THIS MODULE'S JOB, NOT THE CALLER'S ──────────────────────
// Both remembered-kills ladders apply to the same monster at the same time, so
// what a reviewer approves is their PRODUCT. `memoryDropMult` is the one place
// that product is formed and the one place MAX_MEMORY_DROP_MULT is applied —
// two ladders that each clamp only themselves are two ladders whose product is
// nobody's job (BESTIARY_LADDER.md §2.3).
//
// ── SCALING ─────────────────────────────────────────────────────────────────
// `trophyIndex` is one pass over the counters the server sent (one row per
// monster ever killed, ≤ the roster size) and knows nothing about how many
// monsters exist. Adding a monster is a data row; nothing here counts them.
//
// PURE ESM. Data + pure derivation — no DOM, no window, no clock, no
// Math.random. Dual-runtime: imported by src/core-bridge.js on the client and
// vendored into supabase/functions/hr-accrue by tools/pack-edge.mjs.
// ════════════════════════════════════════════════════════════════════════

import {
  TROPHY_STAGES, MAX_TROPHY_STAGE, MAX_TROPHY_DROP_MULT, MAX_TROPHY_DAMAGE_MULT,
  MAX_MEMORY_DROP_MULT, trophyStageAt,
} from '../data/bestiary.js?v=553';

/**
 * THE DAMAGE ARM. False, and BESTIARY_LADDER.md §3.1 is the ruling: the x1.01
 * at `nemesis` is floored away by `playerCombatRolls`, so shipping it today
 * would state an effect that does nothing — which is what tests/arm-flag-
 * honesty.mjs exists for. It flips in the same change that arms
 * `charmDamageMultFor`, under one review of one expression.
 *
 * While it is off, `trophyDamageMultFor` returns 1 for every input, and
 * `weaknessInfo` returns no damage readout for the trophy at all: a field
 * naming a bonus the engine does not apply is a renderer's next lie.
 */
export const TROPHY_DAMAGE_ARM_ENABLED = false;

/**
 * Fold the server's `{monsterId: kills}` counters into `{monsterId: stage}`.
 *
 * `monsters` is passed IN rather than imported so this module stays pure and so
 * the Edge Function hands it the same sealed catalogue it hands the combat
 * engine. A monster id the catalogue does not know is DROPPED rather than
 * indexed: a trophy is a capability, and inventing a monster from an unknown id
 * is how a capability becomes forgeable from a stale save. (`charms.js`
 * `killsByClass` drops the same way, for the same reason.)
 *
 * Only monsters that have EARNED a stage appear, so `index[id]` is falsy for
 * "not yet a Quarry" and no caller needs to know the ladder's first threshold.
 *
 * NULL PROTOTYPE: the keys are monster ids from data and are later used as
 * lookup keys, and on a plain object `__proto__` / `constructor` are truthy.
 * Same receipt as `baneIndex`, `killsByClass` and `buildBestiary`.
 *
 * @returns {object|null} null when nothing is staged, so the common "has not
 *   ground 2,500 of anything" case costs one truthiness check downstream.
 */
export function trophyIndex(killsByMonsterId, monsters) {
  if (!killsByMonsterId || typeof killsByMonsterId !== 'object') return null;
  if (!monsters || typeof monsters !== 'object') return null;
  let out = null;
  for (const id of Object.keys(killsByMonsterId)) {
    if (!Object.prototype.hasOwnProperty.call(monsters, id) || !monsters[id]) continue;
    const row = trophyStageAt(killsByMonsterId[id]);
    if (!row) continue;
    if (!out) out = Object.create(null);
    out[id] = row.stage;
  }
  return out;
}

/**
 * The roster KEY for a monster row, or null.
 *
 * The charm resolves its class off the row (`cls`/`family` are ON the row); a
 * trophy needs the row's IDENTITY, and not one of the 108 rows carries an `id`
 * field — measured. So the id has to come from the catalogue the row came out
 * of, and this is the one function that does that lookup.
 *
 * IDENTITY, NOT EQUALITY. Two rows can carry the same `name`, and the id is
 * what the server's counters and the trophy key are built from, so a match on a
 * display field would file a kill under the wrong monster. `row.id` is honoured
 * first for a caller holding a stamped row (the client's `applyClassProfiles`
 * may add fields the sealed server copy does not have).
 *
 * Linear over the roster and called once per weakness read, which is nothing
 * next to the roll it feeds. A cached reverse map would be a second copy of the
 * roster to keep in step, which is the thing this module's data half exists to
 * avoid.
 */
export function monsterIdIn(monsters, row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id === 'string' && row.id) return row.id;
  if (!monsters || typeof monsters !== 'object') return null;
  for (const k of Object.keys(monsters)) { if (monsters[k] === row) return k; }
  return null;
}

/**
 * The stage an index holds for `monsterId`, OWN-PROPERTY ONLY — 0 for anything
 * else.
 *
 * ⚠ `index[id]` IS NOT ENOUGH, and charms.js already paid for learning it: with
 *   `Object.prototype.constructor` truthy on ANY plain object,
 *   `charmDropMultFor('constructor', {})` returned a top-rung charm on a class
 *   nobody had killed anything in (Security review, 2026-09-13). `trophyIndex`
 *   builds a null-prototype map, so the live path is not exposed — but this
 *   module's header says the ceiling is a property of the FORMULA and not of who
 *   happens to call it, and a guard that only holds while every caller behaves
 *   is not a guard.
 */
function stageOf(index, monsterId) {
  if (!index || !monsterId) return 0;
  const n = Object.prototype.hasOwnProperty.call(index, monsterId) ? Number(index[monsterId]) : 0;
  if (!(n >= 1)) return 0;
  return Math.min(MAX_TROPHY_STAGE, Math.floor(n));
}

/** The ladder row for a stage number, or null. Internal to the mults + the UI. */
export function trophyRowOfStage(stage) {
  const s = Number(stage);
  if (!(s >= 1)) return null;
  return TROPHY_STAGES[Math.min(TROPHY_STAGES.length, Math.floor(s)) - 1] || null;
}

/**
 * The stage this index holds against `monsterId`, 0..MAX_TROPHY_STAGE.
 *
 * The RECEIPT's reader: the away card and the monster panel name the stage a
 * night was priced with, and they must read it from the same index the
 * multiplier did rather than re-deriving it from counters that have moved since
 * the window closed. Own-property only, like both multipliers.
 */
export function trophyStageFor(monsterId, index) {
  const row = trophyRowOfStage(stageOf(index, monsterId));
  return row ? row.stage : 0;
}

/**
 * The clamped DROP multiplier this character gets against `monsterId`. ≥ 1.
 *
 * READ BY `weaknessInfo` (src/core/combat.js) AND BY NOTHING ELSE. The clamp is
 * the last word, so a hostile or fat-fingered ladder row cannot out-argue the
 * formula. Stage 1 (`quarry`) authors x1.00 and therefore returns exactly 1 —
 * its reward is the trophy and the revealed drop table, not power.
 */
export function trophyDropMultFor(monsterId, index) {
  const row = trophyRowOfStage(stageOf(index, monsterId));
  const raw = Number(row && row.drop);
  if (!(raw > 1)) return 1;
  return raw > MAX_TROPHY_DROP_MULT ? MAX_TROPHY_DROP_MULT : raw;
}

/**
 * The clamped DAMAGE multiplier this character gets against `monsterId`. ≥ 1.
 *
 * ⚠ RETURNS 1 FOR EVERY INPUT while TROPHY_DAMAGE_ARM_ENABLED is off — see the
 *   header and BESTIARY_LADDER.md §3.1. The arm check is FIRST so that the
 *   dormant build cannot pay a trophy's damage through any path, including a
 *   caller that reaches past `weaknessInfo`.
 */
export function trophyDamageMultFor(monsterId, index) {
  if (!TROPHY_DAMAGE_ARM_ENABLED) return 1;
  const row = trophyRowOfStage(stageOf(index, monsterId));
  const raw = Number(row && row.dmg);
  if (!(raw > 1)) return 1;
  return raw > MAX_TROPHY_DAMAGE_MULT ? MAX_TROPHY_DAMAGE_MULT : raw;
}

/**
 * THE PRODUCT OF EVERY REMEMBERED-KILLS DROP LADDER, clamped ONCE.
 *
 * The class charm (≤1.03, src/core/charms.js) and the monster trophy (≤1.03,
 * above) apply to the same monster at the same time, so the number a reviewer
 * approves is this one — 1.0609 today against a stated MAX_MEMORY_DROP_MULT of
 * 1.07. The headroom is deliberate and it is a TRIPWIRE, not slack: a THIRD
 * ladder cannot be added without moving one visible constant a reviewer will
 * ask about (BESTIARY_LADDER.md §2.3).
 *
 * Every argument is floored at 1 before multiplying, so a caller that passes a
 * junk factor gets the pre-ladder number rather than a discount.
 */
export function memoryDropMult(charmMult, trophyMult) {
  const a = Number(charmMult); const b = Number(trophyMult);
  const product = (a > 1 ? a : 1) * (b > 1 ? b : 1);
  if (!(product > 1)) return 1;
  return product > MAX_MEMORY_DROP_MULT ? MAX_MEMORY_DROP_MULT : product;
}
