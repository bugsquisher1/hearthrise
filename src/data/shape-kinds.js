// ============================================================
// src/data/shape-kinds.js — WHAT A DATA ROW'S AREA SHAPE MAY SAY: the kinds, the one parameter each reads, and the bounds
// (moved down from src/core/hunt/shapes.js 2026-11-19, lane/c-delivery: the data rows that validate a shape, abilities.js and
// monster-spells.js, imported the engine to do it, two of the layering breaches in tests/layering.baseline.json). The
// geometry (place, covers, tilesOf) stays in src/core/hunt/shapes.js, which re-exports these.
//
// A SPEC (a data row's half): { shape, n?, r?, len? }, bounded by SHAPE_BOUNDS.
//
// PURE ESM. Data and one pure check.
// ============================================================

/* The kinds and the one parameter each reads; `at`: where `place` puts its origin. */
export const SHAPE_KINDS = Object.freeze({
  square: Object.freeze({ param: 'n', at: 'aim' }),
  blast: Object.freeze({ param: 'r', at: 'aim' }),
  ring: Object.freeze({ param: 'r', at: 'caster' }),
  cone: Object.freeze({ param: 'len', at: 'caster' }),
  line: Object.freeze({ param: 'len', at: 'caster' }),
  group: Object.freeze({ param: null, at: 'caster' }),
});
/* THE BOUNDS a data row's shape lives in (bounds, not balance values: a bad row can never strike a whole ground). */
export const SHAPE_BOUNDS = Object.freeze({ n: Object.freeze([1, 5]), r: Object.freeze([1, 2]), len: Object.freeze([1, 4]) });

/** Why a spec ({ shape, n?, r?, len? }) is refused, or null. */
export function shapeProblem(spec) {
  const k = spec && SHAPE_KINDS[spec.shape];
  if (!k) return 'unknown shape ' + (spec && spec.shape);
  if (!k.param) {
    for (const p of Object.keys(SHAPE_BOUNDS)) if (spec[p] !== undefined) return spec.shape + ' reads no ' + p;
    return null;
  }
  const v = spec[k.param];
  const [lo, hi] = SHAPE_BOUNDS[k.param];
  if (!Number.isInteger(v) || v < lo || v > hi) return spec.shape + ' needs ' + k.param + ' ' + lo + '..' + hi + ', got ' + v;
  for (const p of Object.keys(SHAPE_BOUNDS)) if (p !== k.param && spec[p] !== undefined) return spec.shape + ' reads no ' + p;
  return null;
}
