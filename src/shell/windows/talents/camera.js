// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/camera.js — THE ROADS MAP'S CAMERA: THE THREE ZOOM TIERS, PAN AND ZOOM ABOUT A POINT (lane/r-ui-roads).
//
// docs/design/redesign/18-roads-review-ux.md section 3. A camera is { cx, cy, s }: the map point at the stage's centre and the scale
// (map units to screen px). Stones and labels keep their screen size at every scale, so zooming adds room, never size.
//   Country  the whole map fitted to the stage (about 0.25 here)   regions, trunks, crossroads, towns, owned vows, country names
//   Road     about 1 (0.92 on a phone): the default, every stone, move names, vow names
//   Node     2.5: a crossroads opens into its signpost, the options named
// The wheel and a pinch zoom freely inside a tier and snap to the next tier's own scale when they cross TIER_AT (0.7 and 1.8).
// Display state only (the window's scratch): nothing reads it but the map.
// PURE: no DOM.
// ════════════════════════════════════════════════════════════════════════

export const TIERS = Object.freeze(['country', 'road', 'node']);
/* where a tier ends (18 section 3: "snap between tiers at 0.7x and 1.8x") and each tier's own scale */
export const TIER_AT = Object.freeze({ road: 0.7, node: 1.8 });
export const TIER_SCALE = Object.freeze({ road: 1, roadPhone: 0.92, node: 2.5 });
const S_MAX = 3.2;

/** The scale that fits `bounds` into a stage `w` x `h` (Country). */
export function fitScale(bounds, w, h) {
  const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
  return Math.max(0.05, Math.min(w / bw, h / bh, TIER_AT.road * 0.98));
}

/** The tier a scale reads as. */
export const tierOf = (s) => (s < TIER_AT.road ? 'country' : s < TIER_AT.node ? 'road' : 'node');

/** A tier's own scale on this stage. */
export function scaleOf(tier, fit, phone) {
  if (tier === 'country') return fit;
  if (tier === 'node') return TIER_SCALE.node;
  return phone ? TIER_SCALE.roadPhone : TIER_SCALE.road;
}

/** The map point under screen point (sx, sy) of a `w` x `h` stage. */
export const toMap = (cam, w, h, sx, sy) => ({ x: cam.cx + (sx - w / 2) / cam.s, y: cam.cy + (sy - h / 2) / cam.s });
/** The screen point of map point (x, y). */
export const toScreen = (cam, w, h, x, y) => ({ x: (x - cam.cx) * cam.s + w / 2, y: (y - cam.cy) * cam.s + h / 2 });

/** `cam` held over the map: its centre inside `bounds`, its scale inside [fit, S_MAX]. */
export function clampCam(cam, bounds, fit) {
  const s = Math.min(S_MAX, Math.max(fit, cam.s));
  return { cx: Math.min(bounds.x1, Math.max(bounds.x0, cam.cx)), cy: Math.min(bounds.y1, Math.max(bounds.y0, cam.cy)), s };
}

/** The camera at scale `s2`, the map point under screen (sx, sy) kept under it. */
export function zoomAbout(cam, w, h, sx, sy, s2) {
  const p = toMap(cam, w, h, sx, sy);
  return { cx: p.x - (sx - w / 2) / s2, cy: p.y - (sy - h / 2) / s2, s: s2 };
}

/**
 * A wheel or pinch step: the scale times `factor`, free inside the tier, snapped to the next tier's own scale when it crosses into it.
 * @returns {number} the new scale
 */
export function stepScale(s, factor, fit, phone) {
  const want = Math.min(S_MAX, Math.max(fit, s * factor));
  const from = tierOf(s), to = tierOf(want);
  if (from === to) return want;
  const i = TIERS.indexOf(from), j = TIERS.indexOf(to);
  /* one tier at a time: a fast wheel lands on the next tier, never past it */
  return scaleOf(TIERS[i + Math.sign(j - i)], fit, phone);
}

/** One tier in from `s` (a double press), or the same scale at the last tier. */
export function tierIn(s, fit, phone) {
  const i = TIERS.indexOf(tierOf(s));
  return i < TIERS.length - 1 ? scaleOf(TIERS[i + 1], fit, phone) : s;
}
