// ════════════════════════════════════════════════════════════════════════
// src/world/core/shadows.js — ONE SHADOW RULE FOR EVERYTHING.
//
// Art carries no baked shadow; each manifest sprite names its runtime shadow
// ({kind:'ellipse', w, h, dx, dy} or {kind:'cast', height, base}) and the
// renderer draws every shadow into ONE mask composited once at
// --world-shadow-alpha, so two overlapping shadows never darken twice.
//   ellipse  centred on the contact point, offset as the W2 stills place it
//            (dx - 2, dy - 1); a flier's contact is its GROUND point, so its
//            shadow stays down while its sprite hovers.
//   cast     the sprite's own silhouette laid on the floor down-right: a pixel
//            h px above the contact row lands SHEAR.x * h right and SHEAR.y * h
//            below it — one affine map per sprite (castMatrix).
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

export const SHEAR = Object.freeze({ x: 0.5, y: 0.22 });

/** The ellipse for a sprite whose contact point is (cx, cy), art px. */
export function ellipseShadow(spec, cx, cy) {
  return { cx: cx + spec.dx - 2, cy: cy + spec.dy - 1, w: spec.w, h: spec.h };
}

/** Where a world pixel (px, py) of a sprite standing on contact row `cy` falls as cast shadow. */
export function castPoint(px, py, cy) {
  const hgt = cy - py;
  return [px + SHEAR.x * hgt, cy + SHEAR.y * hgt];
}

/** castPoint as a canvas transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export function castMatrix(cy) {
  return [1, 0, -SHEAR.x, -SHEAR.y, SHEAR.x * cy, (1 + SHEAR.y) * cy];
}

/**
 * The box a cast shadow falls in, art px: its sprite's corners through the matrix, a pixel more on every side for the
 * edge a sheared blit softens. What a frame shows of it is decided by this box, never by its sprite's (it falls past it).
 * @param {{x:number, y:number, w:number, h:number}} s  the sprite's drawn box
 * @param {number[]} m  castMatrix()
 * @returns {{x:number, y:number, w:number, h:number}}
 */
export function castBox(s, m) {
  const [a, b, c, d, e, f] = m;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 4; i++) {
    const px = s.x + (i & 1 ? s.w : 0), py = s.y + (i & 2 ? s.h : 0);
    const x = a * px + c * py + e, y = b * px + d * py + f;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 };
}
