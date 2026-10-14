// src/world/core/grid.js — the art grid every world module measures in.
// PURE: no DOM, no window, no G. Node-tested by tests/world-core.mjs.

/** T: art pixels per tile. Every sprite, footprint and camera step is measured in it. */
export const T = 32;

/** A building/roof rect as authored ([x, y, w, h], tiles) → an object. */
export function rectOf(r) {
  return { x: r[0], y: r[1], w: r[2], h: r[3] };
}

/** Is tile (x, y) inside rect r (walls included)? */
export function inRect(r, x, y) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/** Is tile (x, y) on rect r's perimeter? */
export function onEdge(r, x, y) {
  return inRect(r, x, y) && (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1);
}

/** Is tile (x, y) one of rect r's four corners? */
export function isCorner(r, x, y) {
  return (x === r.x || x === r.x + r.w - 1) && (y === r.y || y === r.y + r.h - 1);
}

/** The side of rect r a perimeter tile is on: s|n|w|e or a corner sw|se|nw|ne. */
export function sideOf(r, x, y) {
  const ns = y === r.y ? 'n' : (y === r.y + r.h - 1 ? 's' : '');
  const we = x === r.x ? 'w' : (x === r.x + r.w - 1 ? 'e' : '');
  return ns + we;
}
