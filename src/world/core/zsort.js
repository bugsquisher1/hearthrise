// ════════════════════════════════════════════════════════════════════════
// src/world/core/zsort.js — WHO IS IN FRONT OF WHOM.
//
// Everything that stands up out of the ground (wall slices, doors, props,
// trees, units) is drawn in ONE list, ordered by `row`: the pixel row its
// contact line sits on (compose.js), so whatever is further south covers
// whatever is north of it. A unit's row is interpolated while it moves (a
// hero halfway from tile row 4 to 5 sorts halfway between them). Small
// authored biases ride in `row` itself: a wall face sorts half a pixel BEFORE
// anything on its own row, so a hero beside a wall slice is in front of it.
// Equal rows fall back to placement order (`seq`), so the sort is total and
// two frames of the same scene never swap equal neighbours. Walls are 1-tile
// slices for exactly this reason: a whole wall keyed by one row would be in
// front of or behind a unit along its entire length.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

/** Total order over drawables `{ row, seq }`. */
export function compareDraw(a, b) {
  return (a.row - b.row) || ((a.seq || 0) - (b.seq || 0));
}

/** A new array in draw order. Each item gets a `seq` (its input position) if it has none. */
export function ySort(list) {
  return list.map((d, i) => (d.seq == null ? Object.assign({}, d, { seq: i }) : d)).sort(compareDraw);
}
