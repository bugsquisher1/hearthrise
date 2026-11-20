// ════════════════════════════════════════════════════════════════════════
// src/data/bestiary.js — THE PER-MONSTER TROPHY LADDER, GENERATED FROM THE ROSTER
//
// Game Designer ruling. Design: docs/design/BESTIARY_LADDER.md.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
// This is the LONG ladder: four absolute kill totals — 2,500 / 5,000 / 10,000 /
// 20,000 — reached against ONE monster, each a claimable trophy. It is the
// hundreds-of-hours chase. It moves no drop: the class charm ladder beside it is
// cut and the Bestiary's reward is Luck (src/data/luck.js LUCK_STAGES, per
// account; itemization plan §15, Tyler 2026-11-20).
//
// ── NOTHING HERE IS HAND-TYPED TWICE ────────────────────────────────────────
// `BESTIARY` is BUILT by `buildBestiary()` from `MONSTERS` at module load. A
// monster added to the roster gets a ladder for free; a monster removed loses
// one; neither needs an edit here. That is the same property the gear curves
// buy (docs/SYSTEMS_MAP.md §1): content grows by adding a data row, and the
// derived table cannot fall behind the table it derives from — there is no
// second list for it to disagree with.
//
// ── WHY THE THRESHOLDS ARE UNIFORM ACROSS 108 MONSTERS ──────────────────────
// A tier-6 dragon at 2,500 kills is far more work than a tier-1 slime at 2,500
// kills, and that asymmetry is the POINT rather than a bug to be scaled away:
// the dragon is also worth far more per kill, so the long ladder prices itself
// in time-at-that-spawn no matter where a player stands. Per-tier thresholds
// would make the ladder a second balance surface — 108 numbers an author can
// get wrong — and would make the sentence a player has to learn six sentences
// instead of one.
//
// ── THE STAGE IS DERIVED, NEVER STORED ──────────────────────────────────────
// The kill counters already exist and are already server-owned: `player_progress`
// rows at kind='stat', period_key='', key='ev:kill_monster:<id>', written ONLY by
// hr_apply out of a settled combat delta and read by `hr_bestiary_of`. A stored
// stage would be a SECOND copy of a derivable fact — one that can disagree with
// the counters, needs a backfill for every existing character, and can be held
// AHEAD of the server by a client. That is the residue-ahead class CLAUDE.md §6
// names. Deriving costs one comparison per monster per read and cannot drift.
//
// The CLAIM (docs/design/BESTIARY_LADDER.md §4) is a separate, journalled act
// that writes a `collection` trophy row. It grants NO power — the power is
// already derived — so a player who never opens the panel is never behind, and
// a forged claim cannot mint a multiplier because there is no multiplier column
// to forge.
//
// ── THE MAGNITUDES ARE TINY ON PURPOSE ──────────────────────────────────────
// A trophy is a MEMORY of work done, not a build. Bane gear is 1.40 against one
// class and costs a whole weapon slot; a ladder that grew into a second, free
// bane would make 20,000 kills mandatory rather than interesting. The ceilings
// below are therefore invariants of the FORMULA (a future src/core/trophies.js
// clamps against them, exactly as src/core/bane.js clamps against MAX_BANE_MULT)
// and not promises this table keeps — a magnitude in a data table is a magnitude
// an author can get wrong; a magnitude in the formula is not.
//
// PURE ESM. Data + pure derivation — no DOM, no window, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════

import { MONSTERS } from './monsters.js';

/**
 * The ladder, ASCENDING by `at`. One shared, frozen array: every monster points
 * at THIS object rather than owning a copy, so "the ladder" is one identity and
 * a consumer that finds a row cannot re-price the roster it came from.
 *
 * Fields:
 *   stage  1..4, the number on the badge. Also the array index + 1.
 *   id     the stable name. This is what a trophy key, a broadcast or a
 *          cosmetic keys on (`trophyKey`), so it may not be renamed casually.
 *   at     the kill total against THIS monster that earns the stage. Absolute
 *          and cumulative, not an increment: 20,000 kills holds all four.
 *   dmg    the damage multiplier against this monster.
 *   trophy whether the stage grants a claimable trophy row. True from stage 1 —
 *          that IS stage 1's reward, and paying power for it too would make the
 *          first 2,500 kills of every monster mandatory rather than chosen.
 */
export const TROPHY_STAGES = Object.freeze([
  Object.freeze({ stage: 1, id: 'quarry',  at: 2500,  dmg: 1.00, trophy: true }),
  Object.freeze({ stage: 2, id: 'stalker', at: 5000,  dmg: 1.00, trophy: true }),
  Object.freeze({ stage: 3, id: 'slayer',  at: 10000, dmg: 1.00, trophy: true }),
  Object.freeze({ stage: 4, id: 'nemesis', at: 20000, dmg: 1.01, trophy: true }),
]);

/** The hard ceiling on a trophy DAMAGE multiplier. Applied by the formula. */
export const MAX_TROPHY_DAMAGE_MULT = 1.01;

/* NO DROP FIELD (Luck v3.1, itemization plan §15 "The cuts", Tyler 2026-11-20): a stage paid a drop multiplier
   that nothing read, beside a class charm ladder that is cut. The Bestiary pays Luck now (src/data/luck.js LUCK_STAGES)
   and Magic Find is the one drop lever (tests/bestiary-trophy.mjs T3, tests/luck.mjs L10). */

/** The top stage. Derived, so adding a rung needs no edit here. */
export const MAX_TROPHY_STAGE = TROPHY_STAGES.length;

/** The kill total that holds the whole ladder. Derived from the last rung. */
export const TROPHY_LADDER_KILLS = TROPHY_STAGES[TROPHY_STAGES.length - 1].at;

/** Display names, separated from the ids so copy can change and keys cannot. */
export const TROPHY_STAGE_NAMES = Object.freeze({
  quarry: 'Quarry',
  stalker: 'Stalker',
  slayer: 'Slayer',
  nemesis: 'Nemesis',
});

/**
 * The trophy row key: `trophy:<monsterId>:<stage>`.
 *
 * Written as a `collection` row at period_key='' (permanent). The longest
 * roster id today is well inside `player_progress`'s 1..64 CHECK and the guard
 * asserts that for every monster, because a key that overflows is a claim that
 * throws in production and nowhere else.
 *
 * Deliberately NOT the `ev:` namespace: `ev:` keys are ENGINE counters written
 * by hr_apply out of a delta, and a trophy is written by its own claim RPC. A
 * shared prefix would put a claimable row inside `hr_bestiary_of`'s
 * `ev:kill_monster:%` sweep the first time someone loosened the LIKE.
 */
export function trophyKey(monsterId, stage) {
  return `trophy:${monsterId}:${stage}`;
}

/**
 * Kills against ONE monster → the stage row held, or null below the first rung.
 * Linear over four rows; the ladder is short by design and a binary search here
 * would be three lines of cleverness saving nothing measurable.
 */
export function trophyStageAt(kills) {
  const n = Number(kills);
  if (!Number.isFinite(n) || n <= 0) return null;
  let held = null;
  for (const row of TROPHY_STAGES) {
    if (n >= row.at) held = row; else break;
  }
  return held;
}

/**
 * The NEXT rung and how far it is, or null at the top of the ladder. This is
 * what the panel renders as "8,120 more to Slayer" — a number a player can act
 * on, which is the whole retention argument for the ladder.
 */
export function nextTrophyAt(kills) {
  const n = Math.max(0, Number(kills) || 0);
  for (const row of TROPHY_STAGES) {
    if (n < row.at) return Object.freeze({ row, remaining: row.at - n });
  }
  return null;
}

/**
 * Build the per-monster census from a roster.
 *
 * `monsters` is passed IN rather than read from the import so the generator is
 * pure and testable against a synthetic roster — which is how the guard proves
 * the table is GENERATED rather than merely consistent with the roster it
 * happens to have been written against.
 *
 * NULL PROTOTYPE: the keys are monster ids from data and are later used as
 * lookup keys, and on a plain object `__proto__` / `constructor` are truthy.
 * Same receipt as `baneIndex` and `killsByClass`.
 */
export function buildBestiary(monsters) {
  const out = Object.create(null);
  if (!monsters || typeof monsters !== 'object') return Object.freeze(out);
  for (const id of Object.keys(monsters)) {
    const m = monsters[id];
    /* A called boss is no entry: the Bestiary never counts him (Call out, src/data/boss-calls.js). */
    if (!m || typeof m !== 'object' || m.called === true) continue;
    /* Nor is a training dummy (src/data/training.js): it never falls. */
    if (m.dummy === true) continue;
    out[id] = Object.freeze({
      id,
      name: String(m.name || id),
      tier: Number(m.tier) || 0,
      cls: String(m.cls || ''),
      /* The SHARED frozen ladder, not a copy. One identity, one price. */
      stages: TROPHY_STAGES,
      /* Convenience for the panel, derived so it cannot disagree. */
      ladderKills: TROPHY_LADDER_KILLS,
    });
  }
  return Object.freeze(out);
}

/** The shipped census: every monster in the roster, with its ladder. */
export const BESTIARY = buildBestiary(MONSTERS);
