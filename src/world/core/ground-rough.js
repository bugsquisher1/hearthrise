// ════════════════════════════════════════════════════════════════════════
// src/world/core/ground-rough.js — A NATURAL EDGE IS NEVER RULED STRAIGHT (lane/a-havora-art 2026-11-16; Tyler: "the ground
// transitions look like shit"; ART_DIRECTION section 5).
//
// Havora's ground is the blueprint traced x2 (town/ground.js): every grass block and dirt road meets the next on a dead-straight
// run of whole tiles. A ROUGH rule (map.blend.rough) lets the BLEND draw a ragged edge between two materials that are both
// open ground (grass and dirt: never a wall, rock or water, so what a cell looks like never lies about whether it can be walked):
// a cell on that edge is DRAWN as its neighbour's material where smooth value noise says so, in runs of a few cells, the dirt
// spilling into the grass in one place and the grass creeping onto the dirt in another. The map's own ground (the lint, the
// walk mask, the stands) never changes: this is how the edge is drawn, not where anything stands.
//   rough { seed, pairs: [[lower, upper, spill?, bite?, deep?]], spill (0-1: the lower side's cell is drawn as the upper above it),
//           bite (0-1: the upper side's cell is drawn as the lower below it), scale (tiles), deep (cells; a pair's own deep for a band
//           only two cells wide, the square's setts between its paving and the dirt, lane/a-havora-seams-2) }
// A cell is drawn as its neighbour only when it has a 4-neighbour of that material, all eight neighbours are one of the pair's
// two materials, and its own side runs on `deep` cells behind it (so a two-wide road is never narrowed, only widened, and a
// strip never pinches to nothing). Read from the map as it was authored, never from cells already re-drawn: one pass.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { vhash } from './ground-variety.js?v=0.2.143';

const unit = (x, y, seed) => vhash(x, y, seed) / 4294967296;
/** Smooth value noise in [0, 1) at cell (x, y) on a lattice of `s` cells, turned off the grid (two octaves). */
export function edgeNoise(x, y, s, seed) {
  const oct = (sc, sd, a) => {
    const c = Math.cos(a), n = Math.sin(a);
    const fx = (x * c - y * n) / sc + 0.37 * (sd & 15), fy = (x * n + y * c) / sc - 0.21 * (sd & 15);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return (unit(i, j, sd) * (1 - su) + unit(i + 1, j, sd) * su) * (1 - sv) + (unit(i, j + 1, sd) * (1 - su) + unit(i + 1, j + 1, sd) * su) * sv;
  };
  return oct(s, seed, 0.61) * 0.7 + oct(s / 2.2, seed + 5, 1.37) * 0.3;
}

const DIRS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

/**
 * The materials as DRAWN: a copy of `mat` (Int16Array, W x H, -1 = no material) with the rough rule's edge cells re-drawn,
 * the generator's return value. `idOf` maps a material name to its index in `mat`; a pair naming a material the map has no
 * index for is skipped. Made as STEPS, one row of one pass each, the same cells in the same order however it is run: two
 * whole-map passes per pair, six pairs on Havora, were ONE unit of the town's sliced ground, 70 ms on CI (compose.js
 * groundOfSliced; nightly 44730692384, the town made after a death).
 */
export function* roughEdgeSteps(mat, W, H, idOf, rough) {
  const out = Int16Array.from(mat);
  if (!rough || !rough.pairs) return out;
  const { seed = 1, spill = 0.6, bite = 0.4, scale = 2.6, deep: deepAll = 4 } = rough;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : mat[y * W + x]);
  for (const [lowName, upName, pSpill = spill, pBite = bite, pDeep = deepAll] of rough.pairs) {
    const deep = pDeep;
    const lo = idOf.get(lowName), up = idOf.get(upName);
    if (lo === undefined || up === undefined) continue;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = mat[y * W + x];
        if (a !== lo && a !== up) continue;
        const b = a === lo ? up : lo;
        let ok = true, touches = false;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
          const m = at(x + dx, y + dy);
          if (m !== lo && m !== up) { ok = false; break; }
        }
        if (!ok) continue;
        for (const [dx, dy] of DIRS) {
          if (at(x + dx, y + dy) !== b) continue;
          touches = true;
          for (let k = 1; k < deep; k++) if (at(x - dx * k, y - dy * k) !== a) { ok = false; break; }
          if (!ok) break;
        }
        if (!touches || !ok) continue;
        const n = edgeNoise(x, y, scale, seed);
        if (a === lo ? n > pSpill : n < pBite) out[y * W + x] = b;
      }
      yield;
    }
    /* no pinholes: a cell of the pair left with all four neighbours the other material (a lone square of grass in the road)
       is drawn as its neighbours */
    const after = Int16Array.from(out);
    const was = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : after[y * W + x]);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = after[y * W + x];
        if (a !== lo && a !== up) continue;
        const b = a === lo ? up : lo;
        if (DIRS.every(([dx, dy]) => was(x + dx, y + dy) === b)) out[y * W + x] = b;
      }
      yield;
    }
  }
  return out;
}
