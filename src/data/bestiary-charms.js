// ════════════════════════════════════════════════════════════════════════
// src/data/bestiary-charms.js — THE BESTIARY CHARM LADDER, AS DATA
//
// Game Designer ruling, 2026-09-13 (final): ONE ladder shared by all eleven
// monster classes. A character's rank in a class is DERIVED on every read from
// the server's own kill counters and is NEVER STORED — there is no
// `charm_rank` column, no residue field and nothing to migrate, which is the
// whole reason the ruling landed this shape.
//
// ── WHY ONE LADDER AND NOT ELEVEN ───────────────────────────────────────────
// Eleven ladders is eleven balance surfaces, eleven places a future class has
// to be added to, and eleven ways for "Vermin rank 3" and "Dragon rank 3" to
// mean different things to a player who has to hold both in their head. One
// ladder makes the sentence learnable once ("25 kills studies a class") and
// makes adding the twelfth class a row in MONSTER_CLASSES and nothing here.
// It also means the thresholds are ABSOLUTE kill counts rather than a fraction
// of a roster, so a class the monster workstream grows from 6 to 30 members
// does not silently re-price its own charms.
//
// ── WHY THE RANK IS DERIVED, NEVER STORED ───────────────────────────────────
// The counters already exist and are already server-owned: `player_progress`
// rows at `kind='stat'`, `period_key=''`, `key='ev:kill_monster:<id>'`, written
// ONLY by hr_apply out of the engine's combat delta and read by
// `hr_bestiary_of` (2026-08-20-bestiary.sql). A stored rank would be a SECOND
// copy of a derivable fact — i.e. a thing that can disagree with the counters,
// that needs a backfill for every existing character, and that a client could
// hold AHEAD of the server. That last one is the residue-ahead bug class this
// codebase has already paid for twice (CLAUDE.md §6). Deriving costs one
// comparison per class per read and cannot drift.
//
// ── PHASE 2 ARMED `drop`; `dmg` IS STILL PHASE 3 ────────────────────────────
// `drop` is now read in combat by the ONE engine: `charmDropMultFor` is applied
// inside `weaknessInfo` (src/core/combat.js), which is the single expression the
// live tick and the Edge accrual replay both call, so a charm pays an away night
// exactly as it pays an attended one. `dmg` is still read by NOTHING: maxHit is
// an integer and `weak.damageMult` is applied through `Math.floor`, so 1.01
// would round away to nothing on most loadouts — phase 3 arms it (same
// expression, under MAX_TOTAL_DAMAGE_MULT) with its own review.
// `reveal` is the column Phase 1 acted on:
// it lifts the `hiddenElement` curtain that src/data/monster-classes.js
// documents ("the data carries `elementWeak` so the combat engine can resolve
// it; the RENDERER is what hides it"), which is PROG-01's proof of value and
// costs no power at all.
//
// ── THE MAGNITUDES ARE TINY ON PURPOSE ──────────────────────────────────────
// 1% → 2% → 3% at 100 / 500 / 2000 kills. A charm is a MEMORY of work done,
// not a build-defining multiplier: bane gear is 1.40 against one class and a
// full weapon slot, and a charm must never grow into a second, free bane. The
// two ceilings below are therefore stated as invariants of the formula in
// src/core/charms.js (`charmDropMultFor` / `charmDamageMultFor` clamp against
// them) and not as a promise this table keeps — the same argument
// `MAX_BANE_MULT` won in src/core/bane.js: a magnitude that lives in a data
// table is a magnitude an author can get wrong; a magnitude that lives in the
// formula is not.
//
// PURE ESM. Data only — no DOM, no window, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════

/**
 * The ladder, ASCENDING by `at`. Every row frozen, and the array frozen, so a
 * consumer that finds a row cannot edit the ladder it came from — these
 * objects are handed out by `charmRankAt()` and a mutable one would be a
 * global the first careless caller could re-price.
 *
 * Fields:
 *   rank   1..4, the number a player sees on the badge. Also the array index+1.
 *   id     the stable name ('studied' / 'marked' / 'hunter' / 'banesworn').
 *          This is what a save key, a broadcast or a cosmetic would key on if
 *          one is ever added, so it may not be renamed casually.
 *   at     the CLASS kill total that earns this rank (Σ over every monster in
 *          the class, not a per-monster count).
 *   drop   the drop multiplier phase 2 will apply. 1.00 at rank 1 deliberately:
 *          rank 1 is the REVEAL, and paying power for it too would make the
 *          first 25 kills of every class mandatory rather than interesting.
 *   dmg    the damage multiplier phase 3 will apply.
 *   reveal whether this rank lifts the `hiddenElement` curtain. True from rank
 *          1 — that IS rank 1's reward.
 */
export const CHARM_RANKS = Object.freeze([
  Object.freeze({ rank: 1, id: 'studied',   at: 25,   drop: 1.00, dmg: 1.00, reveal: true }),
  Object.freeze({ rank: 2, id: 'marked',    at: 100,  drop: 1.01, dmg: 1.00, reveal: true }),
  Object.freeze({ rank: 3, id: 'hunter',    at: 500,  drop: 1.02, dmg: 1.01, reveal: true }),
  Object.freeze({ rank: 4, id: 'banesworn', at: 2000, drop: 1.03, dmg: 1.03, reveal: true }),
]);

/** The hard ceiling on a charm drop multiplier. Applied by the formula. */
export const MAX_CHARM_DROP_MULT = 1.03;

/** The hard ceiling on a charm damage multiplier. Applied by the formula. */
export const MAX_CHARM_DAMAGE_MULT = 1.03;

/** The top rank on the ladder. Derived, so adding a rung needs no edit here. */
export const MAX_CHARM_RANK = CHARM_RANKS.length;

/** Display names, separated from the ids so copy can change and keys cannot. */
export const CHARM_RANK_NAMES = Object.freeze({
  studied: 'Studied',
  marked: 'Marked',
  hunter: 'Hunter',
  banesworn: 'Banesworn',
});
