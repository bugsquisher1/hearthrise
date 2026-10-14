// ════════════════════════════════════════════════════════════════════════
// src/world/core/wang.js — GROUND TRANSITIONS ON A DUAL GRID.
//
// The ground is drawn on a grid offset half a tile from the map grid: each
// drawn tile sits on a VERTEX where four map tiles meet, and those four tiles
// are its four corners. One terrain's 16 corner-Wang tiles then cover every
// transition with no hand-placed edge tiles. Terrains are layered (TERRAIN
// `layer`): each one is drawn as an overlay that is transparent where a corner
// is not that terrain, lowest layer first.
//
// BIT ORDER (the atlas frame `wang:<terrain>:<index>` follows it):
//   NW = 8, NE = 4, SW = 2, SE = 1  ·  15 = all four corners are the terrain.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

/** The Wang index of four corner flags. */
export function cornerIndex(nw, ne, sw, se) {
  return (nw ? 8 : 0) | (ne ? 4 : 0) | (sw ? 2 : 0) | (se ? 1 : 0);
}

/** The Wang index at vertex (vx, vy) for terrain `id`; tiles past the edge repeat the edge. */
function wangAt(ground, w, h, vx, vy, id) {
  const at = (x, y) => ground[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] === id;
  return cornerIndex(at(vx - 1, vy - 1), at(vx, vy - 1), at(vx - 1, vy), at(vx, vy));
}

/** Every overlay tile to draw, lowest layer first: [{ vx, vy, id, idx }] (idx 0 skipped). */
export function wangLayers(ground, w, h, terrain) {
  const ids = [...new Set(ground)].sort((a, b) => ((terrain[a] || {}).layer || 0) - ((terrain[b] || {}).layer || 0) || (a < b ? -1 : 1));
  const out = [];
  for (const id of ids) {
    for (let vy = 0; vy <= h; vy++) {
      for (let vx = 0; vx <= w; vx++) {
        const idx = wangAt(ground, w, h, vx, vy, id);
        if (idx) out.push({ vx, vy, id, idx });
      }
    }
  }
  return out;
}
