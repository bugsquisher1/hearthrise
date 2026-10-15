// ════════════════════════════════════════════════════════════════════════
// src/world/core/facing.js — EIGHT FACINGS, AND WHAT TO SHOW WHEN THE ART HAS FOUR.
//
// A unit carries two facings: `dir`, the cardinal (n e s w) every clip has,
// chosen by the walk's own rule (steer-local.js facingFor, choreo.js dirOf),
// and `diag`, the diagonal (ne se sw nw) of a diagonal step, or null. A clip
// that has the diagonal shows it; one that has not shows `dir`, so an atlas
// with four facings draws exactly what it drew before the diagonals existed,
// and a diagonal batch (PixelLab R2) lights up with no code change.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

/* tan(22.5°): a heading closer than this to an axis is that axis's facing, not a diagonal. */
const OCTANT = Math.tan(Math.PI / 8);

/**
 * The diagonal facing of a heading (dx, dy) — 'se' for (+1, +1) — when it lies
 * in a diagonal's 45° sector; null for a heading nearer an axis, or none.
 */
export function diagonalOf(dx, dy) {
  const ax = Math.abs(dx || 0), ay = Math.abs(dy || 0);
  if (!ax || !ay || Math.min(ax, ay) / Math.max(ax, ay) < OCTANT) return null;
  return (dy > 0 ? 's' : 'n') + (dx > 0 ? 'e' : 'w');
}

/**
 * Which of a clip's facings to draw. `dirs` is the clip's facing → frames map.
 * The diagonal when the clip has it; else `dir`; a diagonal asked for as `dir`
 * itself falls to its nearest cardinal (its north/south half, then its east/west
 * half); then 's'; then the clip's first facing.
 */
export function pickFacing(dirs, dir, diag) {
  if (diag && dirs[diag]) return diag;
  if (dir && dirs[dir]) return dir;
  if (dir && dir.length === 2) {
    if (dirs[dir[0]]) return dir[0];
    if (dirs[dir[1]]) return dir[1];
  }
  return dirs.s ? 's' : Object.keys(dirs)[0];
}
