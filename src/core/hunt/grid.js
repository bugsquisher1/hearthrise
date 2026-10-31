// ============================================================
// src/core/hunt/grid.js — THE HUNT GROUND AS TILES (spec §1.1; parity GR-01..06)
//
// Walkable and opaque tests, distances, line of sight, A*, breadth-first and
// free-tile searches. Everything is integer: distances are Chebyshev or SQUARED
// Euclid, path costs are millitiles (HUNT_TUNING.stepCost), so two runtimes
// can never disagree on a float. Every search scans in a fixed order and
// breaks ties by that order, so the same inputs give the same tile.
//
// PURE ESM, dual-runtime (run by the hr-accrue edge). No DOM, no clock,
// no Math.random.
// ============================================================

import { HUNT_TUNING } from '../../data/hunt-tuning.js?v=0.2.77';

/* The 8 neighbours, in the one order every search uses. */
const NEIGHBOURS = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]);

/**
 * Build a grid. `walkAt(x, y)` / `opaqueAt(x, y)` answer for each tile once;
 * the grid keeps two byte masks. Outside the grid nothing is walkable and
 * everything is opaque.
 */
export function makeGrid(w, h, walkAt, opaqueAt) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) throw new Error('makeGrid: bad size ' + w + 'x' + h);
  const walk = new Uint8Array(w * h);
  const opaque = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      walk[y * w + x] = walkAt(x, y) ? 1 : 0;
      opaque[y * w + x] = opaqueAt(x, y) ? 1 : 0;
    }
  }
  return Object.freeze({ w, h, walk, opaque });
}

export const inside = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h;
export const walkable = (g, x, y) => inside(g, x, y) && g.walk[y * g.w + x] === 1;
export const isOpaque = (g, x, y) => !inside(g, x, y) || g.opaque[y * g.w + x] === 1;
export const tileKey = (g, x, y) => y * g.w + x;

/** Chebyshev distance: king moves. */
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** Squared Euclid distance: integer, and ordered exactly as the Euclid distance is. */
export const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** The cost of one step from a to an adjacent b, in millitiles. */
export const stepCost = (ax, ay, bx, by) => (ax !== bx && ay !== by ? HUNT_TUNING.stepCost.diagonal : HUNT_TUNING.stepCost.straight);

/**
 * A* over 8 directions with no corner cutting (a diagonal needs both of its
 * orthogonal tiles walkable). `blocked(x, y)` vetoes any tile but the start —
 * the caller decides whether the goal itself may be occupied. Answers the
 * tiles to step through, start excluded: [] when already there, null when no
 * path exists within `cap` expanded nodes.
 */
export function astar(g, sx, sy, tx, ty, blocked, cap) {
  if (sx === tx && sy === ty) return [];
  if (!walkable(g, tx, ty) || (blocked && blocked(tx, ty))) return null;
  const limit = Number.isInteger(cap) && cap > 0 ? cap : HUNT_TUNING.pathNodeCap;
  const D = HUNT_TUNING.stepCost.diagonal; const S = HUNT_TUNING.stepCost.straight;
  const hOf = (x, y) => { const dx = Math.abs(x - tx); const dy = Math.abs(y - ty); return S * Math.max(dx, dy) + (D - S) * Math.min(dx, dy); };
  const gCost = new Map(); const from = new Map(); const closed = new Set();
  const start = tileKey(g, sx, sy);
  gCost.set(start, 0);
  /* open entries: [f, h, seq, x, y]; the minimum is chosen by (f, h, seq). */
  const open = [[hOf(sx, sy), hOf(sx, sy), 0, sx, sy]];
  let seq = 1; let expanded = 0;
  while (open.length && expanded < limit) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i]; const b = open[bi];
      if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) bi = i;
    }
    const [, , , x, y] = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    const k = tileKey(g, x, y);
    if (closed.has(k)) continue;
    closed.add(k); expanded++;
    if (x === tx && y === ty) {
      const path = []; let c = k;
      while (c !== start) { path.push([c % g.w, (c - (c % g.w)) / g.w]); c = from.get(c); }
      return path.reverse();
    }
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx; const ny = y + dy;
      if (!walkable(g, nx, ny)) continue;
      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;
      if (blocked && blocked(nx, ny)) continue;
      const nk = tileKey(g, nx, ny);
      if (closed.has(nk)) continue;
      const ng = gCost.get(k) + (dx && dy ? D : S);
      if (!gCost.has(nk) || ng < gCost.get(nk)) {
        gCost.set(nk, ng); from.set(nk, k);
        const h = hOf(nx, ny);
        open.push([ng + h, h, seq++, nx, ny]);
      }
    }
  }
  return null;
}

/**
 * BREADTH-FIRST to the NEAREST tile `goal(x, y)` accepts, from (sx, sy): 8 directions,
 * no corner cutting, `blocked(x, y)` vetoes any tile but the start. One search for a
 * set of goals (A* takes one goal; "any free tile beside this monster" is up to
 * eight), linear in the tiles it expands. Answers the tiles to step through, start
 * excluded: [] when the start is a goal, null when none is reached within `cap`.
 */
export function bfsTo(g, sx, sy, goal, blocked, cap) {
  if (goal(sx, sy)) return [];
  const limit = Number.isInteger(cap) && cap > 0 ? cap : HUNT_TUNING.pathNodeCap;
  const start = tileKey(g, sx, sy);
  const from = new Map([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length && head < limit; head++) {
    const k = queue[head];
    const x = k % g.w; const y = (k - x) / g.w;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx; const ny = y + dy;
      if (!walkable(g, nx, ny)) continue;
      if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;
      const nk = tileKey(g, nx, ny);
      if (from.has(nk) || (blocked && blocked(nx, ny))) continue;
      from.set(nk, k);
      if (goal(nx, ny)) {
        const path = []; let c = nk;
        while (c !== start) { path.push([c % g.w, (c - (c % g.w)) / g.w]); c = from.get(c); }
        return path.reverse();
      }
      queue.push(nk);
    }
  }
  return null;
}

/**
 * EVERY TILE WITHIN `depth` MOVES of (sx, sy), breadth-first: 8 directions, no corner cutting,
 * `blocked(x, y)` vetoes any tile but the start. Answers { tiles: [[x, y, moves], …] in the order
 * found (fewest moves first, then NEIGHBOURS order; start excluded), pathTo(x, y) } where pathTo
 * gives the tiles to step through to a found tile, start excluded. Linear in the tiles it finds.
 */
export function bfsWithin(g, sx, sy, depth, blocked) {
  const start = tileKey(g, sx, sy);
  const from = new Map([[start, -1]]);
  const tiles = [];
  let ring = [start];
  for (let d = 1; d <= depth && ring.length; d++) {
    const next = [];
    for (const k of ring) {
      const x = k % g.w; const y = (k - x) / g.w;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx; const ny = y + dy;
        if (!walkable(g, nx, ny)) continue;
        if (dx && dy && (!walkable(g, x + dx, y) || !walkable(g, x, y + dy))) continue;
        const nk = tileKey(g, nx, ny);
        if (from.has(nk)) continue;
        if (blocked && blocked(nx, ny)) continue;
        from.set(nk, k);
        tiles.push([nx, ny, d]);
        next.push(nk);
      }
    }
    ring = next;
  }
  const pathTo = (x, y) => {
    const path = []; let c = tileKey(g, x, y);
    if (!from.has(c)) return null;
    while (c !== start) { path.push([c % g.w, (c - (c % g.w)) / g.w]); c = from.get(c); }
    return path.reverse();
  };
  return { tiles, pathTo };
}

/** Line of sight (Bresenham): no opaque tile strictly between a and b. */
export function los(g, a, b) {
  let x = a.x; let y = a.y;
  const dx = Math.abs(b.x - x); const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1; const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const end = x === b.x && y === b.y;
    if (!end && !(x === a.x && y === a.y) && isOpaque(g, x, y)) return false;
    if (end) return true;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** The first walkable tile `taken` does not refuse, ring by ring out to r (GR-05). */
export function freeNear(g, x, y, r, taken) {
  for (let d = 0; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const nx = x + dx; const ny = y + dy;
        if (walkable(g, nx, ny) && !(taken && taken(nx, ny))) return [nx, ny];
      }
    }
  }
  return null;
}

/** The free tile on the ring of radius r round `t` nearest to `from` (GR-06). */
export function ringFree(g, t, r, from, taken) {
  let best = null; let bd = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = t.x + dx; const y = t.y + dy;
      if (!walkable(g, x, y) || (taken && taken(x, y))) continue;
      const d = dist2({ x, y }, from);
      if (d < bd) { bd = d; best = [x, y]; }
    }
  }
  return best;
}
