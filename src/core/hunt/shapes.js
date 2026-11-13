// ============================================================
// src/core/hunt/shapes.js — THE AREA SHAPES (lane/b-area-engine; Tyler 2026-11-08: "start giving some monsters some
// aoe spells and our heros some more aoe spells")
//
// ONE GEOMETRY FOR BOTH SIDES. Every area a hunt can strike is one of these, whoever strikes it: a hero's area
// ability (abilities.js), an area arrow (damage.js, through conditions.js inFootprint) and a monster's telegraphed
// spell (monster-spells.js). The browser draws a monster's mark from the same function the settle lands it with
// (tilesOf), so the screen shows exactly the tiles the server strikes and never predicts a hit of its own.
//
// A PLACED SHAPE: { kind, ox, oy, dx, dy, n, r, len }
//   ox, oy   its origin tile
//   dx, dy   the offset from the origin to the aim (cone, line); 0, 0 for the others
//   square   n x n round the origin: an odd n is centred, an even n has no centre and reaches south-east
//            (the footprint an area arrow and an 'area' ability have always had; Fireball's 3x3)
//   blast    every tile within r (Chebyshev) of the origin, a ground point: a thrown pot on its target's tile
//   ring     every tile within r of the origin, the origin's own tile excluded: the tiles round a caster
//            (Turning Cut at 1, a spider's spray at 1, a king's squeal at 2)
//   cone     every tile 1..len from the origin inside the 90-degree wedge round (dx, dy)
//   line     len tiles from the origin along the ray through (dx, dy), one tile wide
//   group    EVERY tile: the whole party is struck wherever it stands (Tyler 2026-11-08: "some of the monster area
//            spells ... for the full group to take some damage"). No step-off answers it; its warning marks the heroes, not
//            the ground (tilesOf: none), and only the hero's own armour and resistances do (damage.js, the element step)
// A SPEC (a data row's half): { shape, n?, r?, len? }, bounded by SHAPE_BOUNDS. `place` puts a spec on the ground:
// square and blast on the aim, ring, cone and line on the caster, aimed at the aim.
//
// Integer arithmetic only (squared lengths, cross-multiplied angles, integer rounding of the ray), so the edge and
// every browser cover the same tiles. Terrain is not read: a unit stands only on a walkable tile, so a wall tile
// inside a shape holds nobody, and tilesOf drops those tiles when it is handed the grid (what the screen draws).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { walkable } from './grid.js?v=0.2.129';

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

const int = (v) => (Number.isSafeInteger(v) ? v : 0);

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

/** The [lo, hi] tile offsets of an n x n footprint round its aim (an even n reaches south-east). */
export function footprint(n) {
  const size = Math.max(1, int(n) || 1);
  const lo = size % 2 ? -(size - 1) / 2 : -(size / 2 - 1);
  return [lo, lo + size - 1];
}
/** Is unit `t` inside the n x n footprint aimed at `aim`? */
export function inFootprint(aim, n, t) {
  const [lo, hi] = footprint(n);
  const dx = t.x - aim.x; const dy = t.y - aim.y;
  return dx >= lo && dx <= hi && dy >= lo && dy <= hi;
}

/**
 * Put `spec` on the ground for a caster at `caster` aiming at `aim` (both { x, y }). An aim on the caster's own tile
 * (never a living target: two units never share a tile with a monster) faces south, the engine's standing facing.
 */
export function place(spec, caster, aim) {
  const k = SHAPE_KINDS[spec.shape];
  if (!k) throw new Error('shapes: unknown shape ' + spec.shape);
  const o = k.at === 'aim' ? aim : caster;
  let dx = 0; let dy = 0;
  if (spec.shape === 'cone' || spec.shape === 'line') {
    dx = aim.x - caster.x; dy = aim.y - caster.y;
    if (!dx && !dy) dy = 1;
  }
  return { kind: spec.shape, ox: o.x, oy: o.y, dx, dy, n: int(spec.n), r: int(spec.r), len: int(spec.len) };
}

/* The ray's k-th tile, rounded half up on both axes (exact: the quotient of two small integers). */
const rdiv = (a, b) => Math.floor((2 * a + b) / (2 * b));
function rayTile(s, k) {
  const d = Math.max(Math.abs(s.dx), Math.abs(s.dy));
  return [s.ox + rdiv(k * s.dx, d), s.oy + rdiv(k * s.dy, d)];
}

/** Does placed shape `s` cover tile (x, y)? */
export function covers(s, x, y) {
  const rx = x - s.ox; const ry = y - s.oy;
  const d = Math.max(Math.abs(rx), Math.abs(ry));
  switch (s.kind) {
    case 'square': return inFootprint({ x: s.ox, y: s.oy }, s.n, { x, y });
    case 'blast': return d <= s.r;
    case 'ring': return d >= 1 && d <= s.r;
    case 'cone': {
      if (d < 1 || d > s.len) return false;
      const dot = rx * s.dx + ry * s.dy;
      /* within 45 degrees of the aim: cos >= 1/sqrt(2), squared and cross-multiplied */
      return dot > 0 && 2 * dot * dot >= (rx * rx + ry * ry) * (s.dx * s.dx + s.dy * s.dy);
    }
    case 'line': {
      if (d < 1 || d > s.len) return false;
      const [tx, ty] = rayTile(s, d);
      return tx === x && ty === y;
    }
    case 'group': return true;
    default: return false;
  }
}

/** The farthest any tile of `s` lies from its origin (the box tilesOf scans). */
function reachOf(s) {
  if (s.kind === 'square') { const [lo, hi] = footprint(s.n); return Math.max(-lo, hi); }
  return s.kind === 'blast' || s.kind === 'ring' ? s.r : s.len;
}

/**
 * Every tile `s` covers, row by row (north to south, west to east). Given `grid`, only its walkable tiles: what the
 * screen marks, since no unit can stand anywhere else.
 */
export function tilesOf(s, grid) {
  const out = [];
  /* A group strike marks no ground: it is everywhere the party stands. */
  if (s.kind === 'group') return out;
  const R = reachOf(s);
  for (let y = s.oy - R; y <= s.oy + R; y++) {
    for (let x = s.ox - R; x <= s.ox + R; x++) if (covers(s, x, y) && (!grid || walkable(grid, x, y))) out.push([x, y]);
  }
  return out;
}

/** How many tiles a spec can cover at most (its count's top in the bar's words, conditions.js areaTopOf). */
export function tilesMax(spec) {
  const v = int(spec && spec[(SHAPE_KINDS[spec && spec.shape] || {}).param]);
  switch (spec && spec.shape) {
    case 'square': return v * v;
    case 'blast': return (2 * v + 1) * (2 * v + 1);
    case 'ring': return (2 * v + 1) * (2 * v + 1) - 1;
    case 'line': return v;
    case 'cone': return tilesOf(place(spec, { x: 0, y: 0 }, { x: 1, y: 0 })).length;
    default: return 1;
  }
}
