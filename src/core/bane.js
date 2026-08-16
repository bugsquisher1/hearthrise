// ============================================================
// src/core/bane.js — CLASS-TARGETED WEAPON MULTIPLIERS ("bane gear")
//
// docs/design/review-book-content.md, Library 2 §"Bane gear", and the rule the
// Game Designer routed with it, quoted verbatim because it is the whole reason
// this file exists rather than five `getBonus` keys:
//
//   > it is a *class multiplier inside `weaknessInfo`*, not a `getBonus` key —
//   > so it never touches the throughput fuse and it reads identically on the
//   > server. Ceiling must be an invariant of the expression (`MAX_BANE_MULT`).
//
// ── WHY NOT A `getBonus` KEY (this is the load-bearing part) ────────────────
// `getBonus` is a client-side chain of monkey-patch wrappers (see
// src/features/power-budget.js's header). The Edge accrual engine does NOT run
// that chain — it is handed a `bonus(key)` reader built from `hr_perks_of`,
// which knows nothing about equipment. A bane expressed as `getBonus('baneUndead')`
// would therefore read as a real number awake and as **ZERO** during away
// accrual: a weapon that works while you watch and stops working while you
// sleep. In an idle game that is the worst possible failure mode, and it would
// be invisible in every client-side test.
//
// `weaknessInfo(monster, eq)` has no such split. It is ONE expression with two
// callers — src/core/combat.js `playerCombatRolls` (live tick AND away replay,
// since b325 there is only one combat loop) and
// supabase/functions/hr-accrue/accrual.js:950 `weakness(m)`. Both are handed the
// same `equipmentStats()` output. Putting bane there means there is nowhere left
// to add it to only one of them — the same argument `swingIntervalMs` won.
//
// ── THE CEILING IS AN INVARIANT OF THE EXPRESSION ──────────────────────────
// `MAX_BANE_MULT` is applied by `baneMultFor()`, not promised by the item table.
// A hostile or fat-fingered `bane:{class:'undead',mult:40}` row is clamped to
// 1.40 at read time. The clamp is the last word, exactly as `STYLE_SPEED_MIN`
// is for combat styles (b329) — a magnitude that lives in a data table is a
// magnitude an author can get wrong; a magnitude that lives in the formula is
// not.
//
// ── HOW IT COMPOSES WITH THE WEAPON-WEAKNESS BONUS ─────────────────────────
// Bane MULTIPLIES the existing weapon-weakness damage factor rather than
// replacing it. Four of the five approved bane weapons are already the class's
// weak weapon type (a hammer for Undead, a bow for Dragon, a sword for Plant, a
// hammer for Vermin), so those reach 1.20 × 1.40 = **1.68** against exactly one
// class and 1.00 against everything else. That is deliberate and is what the
// review book means by `FUSE: scoped` — the power exists only inside a class
// the player had to choose in advance, and a second weapon on the belt is the
// price. `MAX_COMBINED_DAMAGE_MULT` below states that ceiling so a future
// third factor cannot quietly stack past it.
//
// ── SCALING ────────────────────────────────────────────────────────────────
// The index is a map class → best multiplier, not a running product, so
// equipping five bane pieces that all name Undead grants 1.40 and not 1.40^5.
// Adding a bane piece is a data row; nothing here counts items or knows how
// many bane weapons exist.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/** The hard ceiling on any single class multiplier. Applied by the formula. */
export const MAX_BANE_MULT = 1.40;

/** The ceiling on weapon-weakness × bane combined. Also applied by the formula. */
export const MAX_COMBINED_DAMAGE_MULT = 1.68;

/**
 * Legacy `family` labels → the eleven-class taxonomy of Library 1.
 *
 * The monster workstream re-points `family` on every row; until that lands (and
 * for any save/content that predates it) these keep bane gear honest rather
 * than silently inert.
 *
 * `Mythic` is DELIBERATELY ABSENT. It covers both `lesser_demon` (→ Demon) and
 * `dragon` (→ Dragon) in the live table, so there is no single correct answer
 * and guessing one would make Dragonrib Bow fire at demons. An unmapped family
 * yields NO bane match, which is the strict direction. See the report note.
 */
export const CLASS_ALIAS = Object.freeze({
  beast: 'mammal',
  goblinoid: 'humanoid',
  arcane: 'human',
  // vermin / undead / plant / human / dragon / demon / elemental / construct /
  // extra_dimensional need no alias — they normalise to themselves.
});

/** The eleven classes bane gear may target (Library 1 §1A). */
export const MONSTER_CLASSES = Object.freeze([
  'mammal', 'vermin', 'plant', 'humanoid', 'human', 'undead',
  'demon', 'dragon', 'elemental', 'construct', 'extra_dimensional',
]);

const CLASS_SET = new Set(MONSTER_CLASSES);

/**
 * One canonical spelling for a class, so `'Extra Dimensional'`,
 * `'extra_dimensional'` and `'ExtraDimensional'` are the same key.
 *
 * This exists because the monster workstream and this file are landing in
 * parallel and the exact casing of the `family` string is theirs to choose.
 * Normalising at BOTH ends means neither of us can break the other with a
 * space.
 */
export function normalizeClass(raw) {
  if (typeof raw !== 'string') return null;
  const k = raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')   // ExtraDimensional → Extra_Dimensional
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!k) return null;
  const mapped = CLASS_ALIAS[k] || k;
  return CLASS_SET.has(mapped) ? mapped : null;
}

/** The class a monster row belongs to. `class` wins over `family` if present. */
export function classOfMonster(monster) {
  if (!monster) return null;
  return normalizeClass(monster.class) || normalizeClass(monster.family);
}

/**
 * Build `{ [class]: bestMult }` from the equipped items.
 *
 * NULL PROTOTYPE, deliberately: the class key is derived from an item's own
 * data and is later used as a lookup key. On a plain object `__proto__` and
 * `constructor` are truthy, and this codebase already has that receipt
 * (`indexGatherNodes`, catalogue.js header).
 *
 * Returns `null` when nothing equipped is bane gear, so the common case costs
 * one truthiness check downstream and `equipmentStats` stays cheap.
 */
export function baneIndex(equipment, items) {
  if (!equipment) return null;
  let out = null;
  for (const slot in equipment) {
    const it = items && items[equipment[slot]];
    const b = it && it.bane;
    if (!b) continue;
    const list = Array.isArray(b) ? b : [b];
    for (const entry of list) {
      const cls = normalizeClass(entry && entry.class);
      const mult = Number(entry && entry.mult);
      if (!cls || !(mult > 1)) continue;
      if (!out) out = Object.create(null);
      if (!(out[cls] >= mult)) out[cls] = mult;
    }
  }
  return out;
}

/** The clamped multiplier this loadout gets against `cls`. Always ≥ 1. */
export function baneMultFor(cls, index) {
  if (!cls || !index) return 1;
  const raw = index[cls];
  if (!(raw > 1)) return 1;
  return raw > MAX_BANE_MULT ? MAX_BANE_MULT : raw;
}
