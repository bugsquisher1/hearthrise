// ════════════════════════════════════════════════════════════════════════
// src/world/core/zsort.js — WHO IS IN FRONT OF WHOM.
//
// Everything that stands up out of the ground (wall slices, doors, props, tree
// trunks, units) is drawn in ONE list, ordered by the row its feet are on:
//
//   row   a static's SOUTH-MOST footprint row; a unit's INTERPOLATED row (a
//         unit halfway from row 4 to row 5 is at 4.5). Smaller rows draw first,
//         so whatever is further south covers whatever is north of it.
//   bias  on the same row a wall/door draws first, then props and trunks, then
//         units — a hero standing beside a wall slice is in front of it.
//   x     then west to east, then authoring order: the sort is total, so two
//         frames of the same scene never swap equal neighbours.
//
// Walls are 1-tile slices for exactly this reason: a whole wall keyed by one
// row would be in front of or behind a unit along its entire length.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

export const BIAS = Object.freeze({ wall: 0, door: 0, prop: 1, trunk: 1, unit: 2 });

/** Total order over drawables `{ row, bias, x, seq }`. */
export function compareDraw(a, b) {
  return (a.row - b.row) || (a.bias - b.bias) || (a.x - b.x) || ((a.seq || 0) - (b.seq || 0));
}

/** A new array in draw order. Each item gets a `seq` (its input position) if it has none. */
export function ySort(list) {
  return list.map((d, i) => (d.seq == null ? Object.assign({}, d, { seq: i }) : d)).sort(compareDraw);
}
