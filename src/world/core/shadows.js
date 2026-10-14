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
