// ════════════════════════════════════════════════════════════════════════
// src/world/core/shadows.js — ONE SHADOW RULE FOR EVERYTHING.
//
// Art carries no baked shadow (the asset validator rejects pixels below the
// contact row). The renderer draws every shadow into ONE mask and composites
// that mask once at --world-shadow-alpha, so two overlapping shadows never
// darken twice.
//   units and props  an ellipse under the contact point: w = 0.8 x footprint
//                    width x T, h = 0.35 w, offset +2,+2. A flier's ellipse
//                    stays on the ground; only its sprite is lifted.
//   walls and trees  the footprint swept down-right by SHADOW_SKEW x height —
//                    a parallelogram for a thin base, and adjacent wall slices'
//                    sweeps overlap into one continuous band.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

export const SHADOW_OFFSET = Object.freeze({ x: 2, y: 2 });
export const SHADOW_SKEW = Object.freeze({ x: 0.5, y: 0.25 });

/** The ground ellipse for a footprint `fw` tiles wide whose contact point is (ax, ay), art px. */
export function ellipseShadow(ax, ay, fw, T) {
  const w = 0.8 * fw * T;
  return { cx: ax + SHADOW_OFFSET.x, cy: ay + SHADOW_OFFSET.y, w, h: 0.35 * w };
}

/**
 * The cast shadow of something `heightPx` tall standing on the base rect
 * x0..x1 by y0..y1 (art px): the rect swept by SHADOW_SKEW x height, as a polygon.
 */
export function castShadow(x0, x1, y0, y1, heightPx) {
  const dx = heightPx * SHADOW_SKEW.x, dy = heightPx * SHADOW_SKEW.y;
  return [[x0, y0], [x1, y0], [x1 + dx, y0 + dy], [x1 + dx, y1 + dy], [x0 + dx, y1 + dy], [x0, y1]];
}
