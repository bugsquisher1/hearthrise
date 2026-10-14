// ════════════════════════════════════════════════════════════════════════
// src/world/core/camera.js — ZOOM, FOLLOW, AND THE ONE BLIT.
//
// ZOOM is a whole number of device pixels per art pixel, measured from the
// WINDOW (not the panel, which changes with every chrome tweak):
//     z = max(2, round(innerHeight x devicePixelRatio / ART_ROWS))
// x3 at 1080p and at 1440x900, x4 on a 922x423 phone at DPR 3 (about ten
// tile rows on screen). A whole number keeps every art pixel square.
//
// THE BLIT. A frame is composed at art resolution on an offscreen canvas whose
// origin is a whole art pixel, with one tile of overscan on every side, then
// copied to the screen in one nearest-neighbour drawImage scaled by z. The
// camera is rounded to a whole DEVICE pixel and the remainder is applied as the
// blit's offset, so the world scrolls in one-device-pixel steps and never
// shimmers.
//
// FRAME RATE: 30 fps under the canonical mobile query, 60 elsewhere.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

export const ART_ROWS = 320;
export const MOBILE_QUERY = '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)';

/** Device pixels per art pixel for a window `innerHeight` CSS px tall at `dpr`. */
export function zoomFor(innerHeight, dpr) {
  return Math.max(2, Math.round(((innerHeight || 0) * (dpr || 1)) / ART_ROWS));
}

/** Frames per second for the device class. */
export function fpsFor(isMobile) {
  return isMobile ? 30 : 60;
}

/**
 * Camera top-left (art px) that centres `target` in a `view`, clamped to the world.
 * A world narrower or shorter than the view is centred on that axis instead.
 */
export function follow(target, view, world) {
  const axis = (t, v, wd) => (wd <= v ? (wd - v) / 2 : Math.min(wd - v, Math.max(0, t - v / 2)));
  return { x: axis(target.x, view.w, world.w), y: axis(target.y, view.h, world.h) };
}

/**
 * Where to compose and how to blit, for camera `cam` (art px) at zoom `z`.
 *   ox, oy   compose-canvas origin in world art px (whole numbers; one tile of overscan)
 *   dx, dy   blit offset in device px (whole numbers)
 * A world art pixel at X lands on screen at (X - ox) * z + dx = X * z - round(cam.x * z).
 */
export function blitPlan(cam, z, T) {
  const cx = Math.round(cam.x * z), cy = Math.round(cam.y * z);
  const ox = Math.floor(cx / z) - T, oy = Math.floor(cy / z) - T;
  return { ox, oy, dx: ox * z - cx, dy: oy * z - cy };
}

/**
 * Everything one frame needs to know about the camera: follow the hero (or the
 * map's centre) in a `vw` x `vh` art-px view, then plan the compose region that
 * covers the screen after the blit offset.
 */
export function frameView(hero, vw, vh, map, z, T) {
  const target = hero ? { x: (hero.x + 0.5) * T, y: (hero.y + 0.5) * T } : { x: (map.w * T) / 2, y: (map.h * T) / 2 };
  const cam = follow(target, { w: vw, h: vh }, { w: map.w * T, h: map.h * T });
  const plan = blitPlan(cam, z, T);
  return { cam, plan, view: { ox: plan.ox, oy: plan.oy, w: Math.ceil(vw) + 2 * T + 1, h: Math.ceil(vh) + 2 * T + 1 } };
}
