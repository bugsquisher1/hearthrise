// ════════════════════════════════════════════════════════════════════════
// src/world/core/mark-shapes.js — A DANGER MARK AS HARD PIXELS (the area spells' warning, design §5 and §6).
//
// PURE. The hunt scene's marks (src/hunt-view/spell-marks.js) in tiles become rectangles in art px, so the
// canvas draws them with fillRect alone: whole pixels, no smoothing, no glow (ART_DIRECTION §2, §3), and the
// null backend's tests read exactly what the canvas paints. A mark sits ON THE GROUND, under every actor
// (canvas-backend.js draws it after the shadows and before the sprites): it never hides a unit.
//   ground  a marked spell's tiles: one even wash over the whole shape and a hazard hatch over it, both deepening in
//           the scene's 8 steps as the windup fills, and the shape's outer edge as a solid 1 art px line (2 in the last
//           quarter), its convex corners cut by a pixel (the cut-corner standard every wall edge keeps). A one-tile hole
//           the shape closes round (a ring's caster stands in it) is drawn filled: one shape, never a box round the caster
//   group   a group spell on one hero: a 2:1 ground ring at its feet that closes in from 1.5 tiles across to
//           half a tile as the windup fills, solid, with the same wash and hatch inside it
// Colours are the canvas's (--world-mark-fill the wash, --world-mark-line the hatch and the line, in tokens.css);
// `fillAlpha` and `hatchAlpha` carry the Danger marks slider (src/data/fx-alpha.js). The line is always solid.
// ════════════════════════════════════════════════════════════════════════

/* The wash: its opacity at an empty windup and how much a full one adds (times the Danger marks slider). The ring:
   its half-width at an empty windup and at the landing, in tiles. */
export const MARK_LOOK = Object.freeze({ washFrom: 0.25, washAdd: 0.3, hatchFrom: 0.3, hatchAdd: 0.5, heavyFrom: 0.75, ringFrom: 0.75, ringTo: 0.3 });

function groundShape(m, T) {
  const on = new Set(m.tiles.map(([x, y]) => x + ',' + y));
  const has = (x, y) => on.has(x + ',' + y);
  /* a one-tile hole the shape closes round on all four sides is part of its look */
  const tiles = m.tiles.slice();
  for (const [x, y] of m.tiles) for (const [hx, hy] of [[x + 1, y], [x, y + 1]]) {
    if (!has(hx, hy) && has(hx - 1, hy) && has(hx + 1, hy) && has(hx, hy - 1) && has(hx, hy + 1)) { on.add(hx + ',' + hy); tiles.push([hx, hy]); }
  }
  const th = m.fill >= MARK_LOOK.heavyFrom ? 2 : 1;
  const fill = [], line = [];
  for (const [x, y] of tiles) {
    const px = x * T, py = y * T;
    fill.push([px, py, T, T]);
    const L = !has(x - 1, y), R = !has(x + 1, y), U = !has(x, y - 1), D = !has(x, y + 1);
    const l = L ? th : 0, r = R ? th : 0, u = U ? th : 0, d = D ? th : 0;
    if (U) line.push([px + l, py, T - l - r, th]);
    if (D) line.push([px + l, py + T - th, T - l - r, th]);
    if (L) line.push([px, py + u, th, T - u - d]);
    if (R) line.push([px + T - th, py + u, th, T - u - d]);
  }
  return { fill, line };
}

/* One row's half-width of a 2:1 ellipse of half-width rx and half-height ry, dy rows from its middle. */
const halfAt = (rx, ry, dy) => (ry > 0 && Math.abs(dy) <= ry ? Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry))) : -1);

function groupShape(m, T) {
  const cx = Math.round((m.x + 0.5) * T), cy = Math.round((m.y + 1) * T) - Math.round(T / 5);
  const rx = Math.max(4, Math.round(T * (MARK_LOOK.ringFrom - (MARK_LOOK.ringFrom - MARK_LOOK.ringTo) * m.fill)));
  const ry = Math.max(2, Math.round(rx / 2));
  const fill = [], line = [];
  for (let dy = -ry; dy <= ry; dy++) {
    const wo = halfAt(rx, ry, dy), wi = halfAt(rx - 2, ry - 1, dy);
    if (wo < 0) continue;
    if (wi < 0) { line.push([cx - wo, cy + dy, 2 * wo + 1, 1]); continue; }
    line.push([cx - wo, cy + dy, wo - wi, 1], [cx + wi + 1, cy + dy, wo - wi, 1]);
    fill.push([cx - wi, cy + dy, 2 * wi + 1, 1]);
  }
  return { fill, line };
}

/**
 * The scene's marks as rectangles in art px: [{ fill: [[x, y, w, h]], line: [[x, y, w, h]], fillAlpha, hatchAlpha }] (the hatch
 * covers the fill's rectangles).
 * @param {{kind: string, tiles?: number[][], x?: number, y?: number, fill: number, alpha: number}[]} marks
 * @param {number} T  the map's tile size in art px
 */
export function markShapes(marks, T) {
  const out = [];
  for (const m of marks || []) {
    const s = m.kind === 'group' ? groupShape(m, T) : m.kind === 'ground' && Array.isArray(m.tiles) ? groundShape(m, T) : null;
    const a = Math.max(0, Math.min(1, m.alpha));
    if (s) out.push(Object.assign(s, { fillAlpha: a * (MARK_LOOK.washFrom + MARK_LOOK.washAdd * m.fill), hatchAlpha: a * (MARK_LOOK.hatchFrom + MARK_LOOK.hatchAdd * m.fill) }));
  }
  return out;
}
