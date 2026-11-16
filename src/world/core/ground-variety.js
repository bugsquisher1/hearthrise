// ════════════════════════════════════════════════════════════════════════
// src/world/core/ground-variety.js — WHICH VARIANT OF A FLOOR TILE A CELL DRAWS.
//
// A floor drawn from one tile shows that tile every 32 px (Tyler 2026-11-16: "you can see the tile repeat"). A VARIETY
// is one floor tile made into many (tools/world-art/variety.mjs, built into its atlas), and this picks one per cell from
// the cell's own position, with no cycle and no randomness, so a cell draws the same tile on every load.
//
// The variants are laid key-major: index = key * VARIETY.sub + j.
//   key  the tile's four TONE corners, NW NE SW SE as bits 8 4 2 1: a corner is toned (a damp, darker patch) when value
//        noise over the world says so AND the corner is OPEN, i.e. every cell that touches it is this same floor. Two tiles
//        that share a corner agree on it, so a patch runs across tiles with no seam, and a tile beside another floor
//        (a transition) keeps its edge exactly as drawn.
//   j    < VARIETY.micro: the plain tile or one of its small worn / damp spots (inside the tile, off its edges)
//        >= VARIETY.micro: one of its DETAIL tiles (a tuft, leaves, rubble: kept style-1 decals, off its edges), at about
//        one cell in ten, never on a grid and never beside another detail in a row or a column (ART_DIRECTION section 5).
// Used by the art build (painted grounds: variety.mjs) and by compose.js (the town's blended ground) alike.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

/** The layout and rates every variety shares. */
export const VARIETY = Object.freeze({
  /* variants per tone key: `micro` plain-or-spot tiles, then `sub - micro` detail tiles */
  sub: 6,
  micro: 4,
  /* tone patches: value noise on a lattice of `scale` tiles, a corner toned above `cut` (about a quarter of open corners) */
  scale: 3.4,
  cut: 0.64,
  /* a cell is a detail candidate one time in `detailOdds` (after spacing, about one in ten) */
  detailOdds: 8,
});

/** An integer hash of a cell and a seed (uint32). */
export function vhash(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((seed | 0) ^ 0x5bd1e995, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 15)) >>> 0;
}
const unit = (x, y, seed) => vhash(x, y, seed) / 4294967296;

/** Smooth value noise in [0, 1) at world point (x, y) in tiles: two octaves, each on its own rotated lattice, so a patch's
    edge never runs along the tile grid. */
/* the two octaves' lattice turns (cos, sin), worked out once: the town asks for ~15k corners */
const TURN = Object.freeze([[Math.cos(0.52), Math.sin(0.52)], [Math.cos(1.31), Math.sin(1.31)]]);
function octave(x, y, s, sd, [c, n]) {
  const fx = (x * c - y * n) / s + 0.37 * (sd & 15), fy = (x * n + y * c) / s - 0.21 * (sd & 15);
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const p = unit(i, j, sd), q = unit(i + 1, j, sd), r = unit(i, j + 1, sd), t = unit(i + 1, j + 1, sd);
  return (p * (1 - su) + q * su) * (1 - sv) + (r * (1 - su) + t * su) * sv;
}
function toneNoise(x, y, seed) {
  return octave(x, y, VARIETY.scale, seed, TURN[0]) * 0.72 + octave(x, y, VARIETY.scale / 2.4, seed + 7, TURN[1]) * 0.28;
}

/** Is world corner (x, y) toned (before the open test)? */
export const toneAt = (x, y, seed) => (toneNoise(x, y, seed) > VARIETY.cut ? 1 : 0);

/* a cell's raw detail roll; the spacing rule reads its west and north neighbours' rolls, so the pick stays a pure function */
const rolls = (x, y, seed) => vhash(x, y, seed + 101) % VARIETY.detailOdds === 0;

/** The cell's j: a detail tile when it rolled one and neither its west nor its north neighbour did, else a plain / spot tile. */
export function subAt(x, y, seed) {
  const h = vhash(x, y, seed + 211);
  if (rolls(x, y, seed) && !rolls(x - 1, y, seed) && !rolls(x, y - 1, seed)) return VARIETY.micro + (h >>> 8) % (VARIETY.sub - VARIETY.micro);
  return h % VARIETY.micro;
}

/** The variant index of a cell whose tone corners are `key` (NW NE SW SE bits 8 4 2 1). */
export const varietyIndex = (key, x, y, seed) => key * VARIETY.sub + subAt(x, y, seed);

/** How many variants a variety holds. */
export const VARIETY_COUNT = 16 * VARIETY.sub;
