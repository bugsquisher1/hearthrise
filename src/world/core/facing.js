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

/* The eight facings round the compass, clockwise on screen (y grows south): one step is 45°. */
export const RING = Object.freeze(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']);

/**
 * A ONE-SHOT CLIP'S FACING (the hunt's swing, flinch and fall: src/hunt-view/clip-hook.js). A clip plays only on a
 * facing it HAS: the unit's own (`diag` when it stands on a diagonal, else `dir`), else the nearest one the clip has
 * at most `reach` 45° steps round the ring, the tie broken by the heading (hx, hy). Null when none is that near: the
 * caller shows what it showed before the clip existed. Unlike pickFacing it never falls to 's' or the first facing
 * (a flinch drawn for the south shown on a unit facing north), and nothing is ever mirrored.
 * @param {Record<string, any>} dirs  the clip's facing -> frames map
 * @param {string} dir  the cardinal
 * @param {string|null} diag  the diagonal, or null
 * @param {number} reach  how many 45° steps the clip may turn the unit (0: its own facing only)
 * @param {number} [hx]  the heading the tie is broken by
 * @param {number} [hy]
 * @returns {string|null}
 */
export function clipFacing(dirs, dir, diag, reach, hx = 0, hy = 0) {
  if (!dirs) return null;
  const want = diag || dir || 's';
  if (dirs[want]) return want;
  const at = RING.indexOf(want);
  if (at < 0) return null;
  const heading = hx || hy ? Math.atan2(hy, hx) : null;
  const off = (f) => { const a = (RING.indexOf(f) * Math.PI) / 4; return heading === null ? 0 : Math.abs(Math.atan2(Math.sin(a - heading), Math.cos(a - heading))); };
  for (let k = 1; k <= Math.min(4, reach); k++) {
    const near = [RING[(at + k) % 8], RING[(at - k + 8) % 8]].filter((f) => dirs[f]);
    if (near.length) return near.length === 1 || off(near[0]) <= off(near[1]) ? near[0] : near[1];
  }
  return null;
}

/** The (dir, diag) pair that draws facing `f` exactly (compose.js asks book.facing(dir, diag)). */
export function asDirDiag(f) {
  return f && f.length === 2 ? { dir: f[0], diag: f } : { dir: f, diag: null };
}
