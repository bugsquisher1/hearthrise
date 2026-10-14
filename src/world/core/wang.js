// ════════════════════════════════════════════════════════════════════════
// src/world/core/wang.js — GROUND TRANSITIONS FROM A VERTEX GRID.
//
// A wang16 terrain (assets/world manifests, `kind:'wang16'`) has one tile per
// corner combination of its two materials, keyed NW NE SW SE with '1' for the
// UPPER material. Maps are authored per tile, so each tile corner (a vertex
// where four tiles meet; the map's edge repeats its border tiles) takes the
// upper material when at least three of those four are upper — a lone upper
// tile melts into its surroundings, a straight edge stays straight, and a
// field runs whole to the map's edge. Each map tile is then drawn with the tile
// whose key its four corners spell. This is the W2 stills' rule
// (scratchpad wlib.vgrid_from) with the edge repeated instead of melted.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

/** (w+1) x (h+1) vertex flags from a per-tile predicate `isUpper(x, y)`. */
export function vertexGrid(isUpper, w, h) {
  const g = new Uint8Array((w + 1) * (h + 1));
  for (let vy = 0; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      let up = 0;
      for (let y = vy - 1; y <= vy; y++) for (let x = vx - 1; x <= vx; x++) {
        if (isUpper(Math.min(w - 1, Math.max(0, x)), Math.min(h - 1, Math.max(0, y)))) up++;
      }
      g[vy * (w + 1) + vx] = up >= 3 ? 1 : 0;
    }
  }
  return g;
}

/** The tile key (NW NE SW SE, '1' = upper) of map tile (x, y). */
export function tileKey(g, w, x, y) {
  const at = (vx, vy) => g[vy * (w + 1) + vx];
  return '' + at(x, y) + at(x + 1, y) + at(x, y + 1) + at(x + 1, y + 1);
}
