// ════════════════════════════════════════════════════════════════════════
// src/world/core/camera.js — ZOOM, FOLLOW, THE INSET, AND THE ONE BLIT.
//
// ONE PIXEL DENSITY PER SCREEN CLASS (WORLD_SHELL §1, Tyler 10-14: "the
// scaling seems off"). Every art pixel is DENSITY CSS px square in town, the
// cottage and the cellar alike — the size of the shell's item icons and gear
// figure: x2 on the desktop and on the phone, x3 only on a window wider than
// WIDE_CSS. It is read off the WINDOW, once per screen class, never per scene
// or per room: there is no fitted zoom. In device px that is
// z = round(density x devicePixelRatio), a whole number so every art pixel
// stays square. A room smaller than the view is centred with darkness around
// it; a bigger one scrolls with the camera.
//
// THE INSET. The shell docks windows over the World and passes the covered
// strips (art px here); the camera frames the UNCOVERED part: a small room is
// centred in it, and a followed hero is kept inside it with a tile of margin,
// so a docked window never covers the hero. The art still draws under it.
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

export const MOBILE_QUERY = '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)';

/** CSS px per art pixel on every screen class but the widest. */
export const DENSITY = 2;
/** A window wider than this (CSS px) draws each art pixel DENSITY + 1 CSS px square. */
export const WIDE_CSS = 2400;

/** Device pixels per art pixel for a window `innerWidth` CSS px wide at `dpr`. Never per scene. */
export function zoomFor(innerWidth, dpr) {
  const css = (innerWidth || 0) > WIDE_CSS ? DENSITY + 1 : DENSITY;
  return Math.max(1, Math.round(css * (dpr || 1)));
}

/** Frames per second for the device class. */
export function fpsFor(isMobile) {
  return isMobile ? 30 : 60;
}

/** The covered strips {left, right, top, bottom}: numbers, never negative, 0 when absent. */
export function cleanInset(inset) {
  const v = (k) => Math.max(0, Number(inset && inset[k]) || 0);
  return { left: v('left'), right: v('right'), top: v('top'), bottom: v('bottom') };
}

/*
 * One camera axis. The view is `v` long with `a` covered before and `b` after;
 * the world (or the room) spans [lo, hi]. A span that fits the uncovered part is
 * centred in it; a bigger one follows `t`, keeps `k` (the hero, when given) at
 * least `m` inside the uncovered part, and clamps to the span. Returns where the
 * whole view starts (the covered strip before it included).
 */
function axis(t, k, v, a, b, lo, hi, m) {
  const u = Math.max(1, v - a - b), span = hi - lo;
  const keep = Math.min(m, u / 2);
  const hold = (c) => (k != null ? Math.min(k - keep, Math.max(k + keep - u, c)) : c);
  let c;
  if (span <= u) c = lo + (span - u) / 2;
  else {
    c = hold(t - u / 2);
    /* NO VOID (Tyler 10-18): a docked window is shorter than the World, so what
       lies under it shows around it. A world at least as long as the WHOLE view
       keeps the whole view on it, covered strips included; only the hero may
       pull it past (standing within a window's width of the far edge). */
    if (span >= v) c = hold(Math.min(hi - u - b, Math.max(lo + a, c)));
    c = Math.min(hi - u, Math.max(lo, c));
  }
  return c - a;
}

/**
 * Camera top-left (art px) for a `view` over a `world` ({x?, y?, w, h}, art px),
 * looking at `target` in the part of the view `inset` leaves uncovered, and
 * keeping `keep` (when given) `margin` inside that part.
 */
export function follow(target, view, world, inset, keep, margin) {
  const i = cleanInset(inset), x0 = world.x || 0, y0 = world.y || 0;
  return {
    x: axis(target.x, keep ? keep.x : null, view.w, i.left, i.right, x0, x0 + world.w, margin || 0),
    y: axis(target.y, keep ? keep.y : null, view.h, i.top, i.bottom, y0, y0 + world.h, margin || 0),
  };
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
 * Everything one frame needs to know about the camera, for a `vw` x `vh` art-px
 * view at zoom z. The camera looks at `look` (tiles: the hero, or the point a
 * walk scene leans it toward; the room's middle when null) inside the part the
 * docked windows leave uncovered (`o.inset`, art px), keeps `o.keep` (the hero,
 * tiles) a tile inside that part, and is bounded by the map's room `frame` when
 * it has one (a hunt room), else by the whole map. `open` is the uncovered part
 * in world art px.
 */
export function frameView(look, vw, vh, map, z, T, o = {}) {
  const fr = map.frame;
  const bounds = fr ? { x: fr.x * T, y: fr.y * T, w: fr.w * T, h: fr.h * T } : { x: 0, y: 0, w: map.w * T, h: map.h * T };
  const mid = (p) => (p ? { x: (p.x + 0.5) * T, y: (p.y + 0.5) * T } : null);
  const target = mid(look) || { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const inset = cleanInset(o.inset);
  const cam = follow(target, { w: vw, h: vh }, bounds, inset, mid(o.keep), T);
  const plan = blitPlan(cam, z, T);
  const open = { x: cam.x + inset.left, y: cam.y + inset.top, w: Math.max(1, vw - inset.left - inset.right), h: Math.max(1, vh - inset.top - inset.bottom) };
  return { cam, plan, open, view: { ox: plan.ox, oy: plan.oy, w: Math.ceil(vw) + 2 * T + 1, h: Math.ceil(vh) + 2 * T + 1 } };
}
