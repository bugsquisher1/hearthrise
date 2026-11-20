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
// ONE TILE SIZE, ANY ART GRID (src/data/world/art-budget.js GRIDS). The rule
// above is the base grid's (T 32). A scene drawn on another grid keeps the
// same on-screen TILE: the 64 px sandbox grid (hd64) is drawn at x1, so its
// tile is the town's 64 CSS px. Above WIDE_CSS it stays x1 (96 / 64 is not a
// whole number) and shows more world. Still read off the window, once per
// screen class and grid, never fitted to a room.
//
// THE INSET. The shell docks HUD panels over the World and passes the covered
// strips (art px here); the camera frames the UNCOVERED part: a small room is
// centred in it, and a followed hero is kept inside it with a tile of margin,
// so a docked panel never covers the hero. The art still draws under it, and a
// panel is shorter than its strip, so the strip's art shows around it: the
// whole view stays on the map's art wherever the hero allows (NO VOID, in town
// and in a hunt). In a hunt the viewed hero is at the middle of that part
// unless that would show the void (frameView).
//
// A SHOWPIECE. A walked map may name a landmark the camera frames when the hero
// stands near it (map row `shows`, map-compile.js): it looks up to the
// landmark's top and across its width as far as the hero allows (showAt).
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

import { GRIDS } from '../../data/world/art-budget.js?v=0.2.142';

export const MOBILE_QUERY = '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)';

/** CSS px per art pixel on every screen class but the widest (the base grid's row in GRIDS). */
export const DENSITY = GRIDS.base.density;
/** A window wider than this (CSS px) draws each base art pixel GRIDS.base.wideDensity CSS px square. */
export const WIDE_CSS = 2400;

/**
 * Device pixels per art pixel for a window `innerWidth` CSS px wide at `dpr`, on art grid `grid`
 * (a GRIDS row; the base grid when absent). Never fitted to a scene or a room.
 * `pick`: THE VIEWER'S TOWN ZOOM (Tyler 2026-10-26, "a bit too zoomed in"; src/data/world/view-zoom.js),
 * CSS px per base art px, chosen by the player, never by the map. A whole pick is rounded to whole device px
 * like the screen class's (x1 at DPR 1.25 stays crisp at 1); a fractional one is kept as chosen: x1.5 at DPR 1
 * is 1.5 device px per art px, drawn nearest-neighbour (blitPlan keeps its uneven columns fixed to the world).
 */
export function zoomFor(innerWidth, dpr, grid, pick) {
  const g = grid || GRIDS.base;
  if (Number.isFinite(pick) && pick > 0) {
    const z = (pick * (dpr || 1)) / (g.scale || 1);
    return Number.isInteger(pick) ? Math.max(1, Math.round(z)) : z;
  }
  const css = (innerWidth || 0) > WIDE_CSS ? g.wideDensity : g.density;
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

/* A window opening or closing changes the inset at once; the CAMERA eases to its new place over
   this long (Tyler 10-18: the World snapped a whole dock width in one frame). The camera, not the
   inset, is eased: the framing rules (centre, follow, keep the hero, no void) are not linear in the
   inset, so an eased inset still jumps where a rule switches over. */
export const INSET_EASE_MS = 200;

/**
 * The camera `ms` after an inset change moved it from `from` toward `to` (art px): an ease-out
 * cubic, exactly `to` from INSET_EASE_MS on, and `to` at once with no `from` or no finite `ms`. Pure.
 */
export function easedCam(from, to, ms) {
  if (!from || !Number.isFinite(ms)) return to;
  const k = Math.max(0, Math.min(1, ms / INSET_EASE_MS));
  if (k >= 1) return to;
  const e = 1 - Math.pow(1 - k, 3);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}

/*
 * A SHOWPIECE ON ONE AXIS (follow's `o.show`): where the uncovered part would start to show the span
 * [s.lo, s.hi] whole with the least move from `c` (a span longer than the part: its middle), never
 * moving the hero `k` more than s.reach x u off the part's middle nor past `hold`; then s.w of the way
 * there. The weight scales the move the hero allows, not the wish, so easing off never outruns the walk.
 */
function shown(c, u, k, s, hold) {
  if (!s || !(s.w > 0)) return c;
  let aim = s.hi - s.lo <= u ? Math.min(s.lo, Math.max(s.hi - u, c)) : (s.lo + s.hi - u) / 2;
  if (k != null) aim = hold(Math.min(k - u / 2 + s.reach * u, Math.max(k - u / 2 - s.reach * u, aim)));
  return c + s.w * (aim - c);
}

/*
 * One camera axis. The view is `v` long with `a` covered before and `b` after;
 * the world (or the room) spans [lo, hi]. A span that fits the uncovered part is
 * centred in it; a bigger one follows `t` (a showpiece leaning it, `show`), keeps
 * `k` (the hero, when given) at least `m` inside the uncovered part, and clamps to
 * the span. `whole`: the whole view, covered strips included, stays on the span
 * (NO VOID). `art` (a hunt): the map's art [lo, hi] the whole view stays on, the
 * span being the room inside it. Returns where the whole view starts (the covered
 * strip before it included).
 */
function axis(t, k, v, a, b, lo, hi, m, whole, art, show) {
  const u = Math.max(1, v - a - b), span = hi - lo;
  const keep = Math.min(m, u / 2);
  const hold = (c) => (k != null ? Math.min(k - keep, Math.max(k + keep - u, c)) : c);
  let c;
  if (span <= u) c = lo + (span - u) / 2;
  else c = shown(t - u / 2, u, k, show, hold);
  if (art) {
    /* A HUNT (frameView): the uncovered part on the hero and inside the room; then NO VOID on the
       map's art, which outranks the middle; then the hero, which outranks everything (it is never
       under a panel: only a hero within a panel's width of the art's edge pulls the void in). */
    if (span > u) c = Math.min(hi - u, Math.max(lo, c));
    if (art[1] - art[0] >= v) c = Math.min(art[1] - u - b, Math.max(art[0] + a, c));
    return hold(c) - a;
  }
  if (span > u) {
    c = hold(c);
    /* NO VOID (Tyler 10-18): a docked window is shorter than the World, so what
       lies under it shows around it. A world at least as long as the WHOLE view
       keeps the whole view on it, covered strips included; only the hero may
       pull it past (standing within a window's width of the far edge). */
    if (whole && span >= v) c = hold(Math.min(hi - u - b, Math.max(lo + a, c)));
    c = Math.min(hi - u, Math.max(lo, c));
  }
  return c - a;
}

/**
 * Camera top-left (art px) for a `view` over a `world` ({x?, y?, w, h}, art px),
 * looking at `target` in the part of the view `inset` leaves uncovered, and
 * keeping `keep` (when given) `margin` inside that part. By default the whole
 * view stays on the world (NO VOID); `o.wholeView === false` clamps only the
 * uncovered part to it. `o.art` ({x, y, w, h}, a hunt, frameView): the world is
 * the room and the whole view stays on this art instead. `o.show` ({x, y}: each
 * an axis's {lo, hi, w, reach}, showAt) leans the camera toward a showpiece.
 * @param {{wholeView?: boolean, art?: any, show?: any}} [o]
 */
export function follow(target, view, world, inset, keep, margin, o = {}) {
  const i = cleanInset(inset), x0 = world.x || 0, y0 = world.y || 0, whole = o.wholeView !== false, A = o.art, S = o.show;
  return {
    x: axis(target.x, keep ? keep.x : null, view.w, i.left, i.right, x0, x0 + world.w, margin || 0, whole, A && [A.x, A.x + A.w], S && S.x),
    y: axis(target.y, keep ? keep.y : null, view.h, i.top, i.bottom, y0, y0 + world.h, margin || 0, whole, A && [A.y, A.y + A.h], S && S.y),
  };
}

/* A hunt's fight is never under a panel: the viewed hero's tile and the eight touching it stay inside the uncovered
   part (its middle this many tiles in), where a walked map keeps the hero's own tile in (one tile). */
export const HUNT_KEEP_TILES = 1.5;
/* A SHOWPIECE'S FRAME (Tyler's UI audit 2026-11-18: a fresh login never showed the Great Hearth's chimney, banner and
   crest). A landmark rises NORTH of where you stand, so the camera may look up to its top (SHOW_AIR art px over it) as
   far as the hero's hold allows; across, it fits the landmark's width but keeps the hero in the middle half
   (SHOW_REACH_X of the uncovered part off its middle), so the way on either side stays in view. A World over the
   panels under SHOW_MIN_SHARE of the landmark's height frames none (a phone's 139 px of the Hearth's 390: the move
   would push the hero into a corner for a sliver of the art). */
const SHOW_AIR = 4;
const SHOW_REACH_X = 0.25;
const SHOW_MIN_SHARE = 0.5;
const smooth = (q) => q * q * (3 - 2 * q);

/**
 * The showpiece a hero standing at `at` (tiles) frames on compiled `map` (map-compile.js `shows`) with `uh` art px of
 * World uncovered top to bottom, as follow's `o.show`, or null: weight 1 on its `near` tiles, easing to 0 over `fade`
 * tiles past them (smoothstep on the farther axis distance, so the camera never jumps), the strongest when two overlap.
 */
export function showAt(map, at, uh) {
  if (!at || !map.shows || !map.shows.length) return null;
  let best = null, bw = 0;
  for (const s of map.shows) {
    const n = s.near, d = Math.max(n.x - at.x, at.x - (n.x + n.w - 1), n.y - at.y, at.y - (n.y + n.h - 1), 0);
    const w = d <= 0 ? 1 : d < s.fade ? 1 - smooth(d / s.fade) : 0;
    if (w > bw) { best = s.box; bw = w; }
  }
  if (!best || !(uh >= SHOW_MIN_SHARE * best.h)) return null;
  const top = best.y - SHOW_AIR;
  return { x: { lo: best.x, hi: best.x + best.w, w: bw, reach: SHOW_REACH_X }, y: { lo: top, hi: top, w: bw, reach: 0.5 } };
}

/**
 * Where to compose and how to blit, for camera `cam` (art px) at zoom `z`.
 *   ox, oy   compose-canvas origin in world art px (whole numbers; one tile of overscan)
 *   dx, dy   blit offset in device px (whole numbers)
 * A world art pixel at X lands on screen at (X - ox) * z + dx = X * z - round(cam.x * z).
 */
export function blitPlan(cam, z, T) {
  const q = alignOf(z);
  const cx = Math.round(cam.x * z), cy = Math.round(cam.y * z);
  const ox = Math.floor((Math.floor(cx / z) - T) / q) * q, oy = Math.floor((Math.floor(cy / z) - T) / q) * q;
  return { ox, oy, dx: Math.round(ox * z - cx), dy: Math.round(oy * z - cy) };
}

/**
 * The art-px step the compose origin moves in at zoom z: the least q (1..8) with q x z whole. At a whole z
 * it is 1 (every pixel); at x1.5 it is 2, so the origin lands on a whole device pixel and an art pixel's
 * screen width (1 or 2 device px) is fixed to the WORLD: a pan slides the pattern, it never shimmers.
 */
export function alignOf(z) {
  for (let q = 1; q <= 8; q++) if (Math.abs(q * z - Math.round(q * z)) < 1e-9) return q;
  return 1;
}

/**
 * Everything one frame needs to know about the camera, for a `vw` x `vh` art-px
 * view at zoom z. The camera looks at `look` (tiles: the hero, or the point a
 * walk scene leans it toward; the room's middle when null) inside the part the
 * docked HUD leaves uncovered (`o.inset`, art px), keeps `o.keep` (the hero,
 * tiles) a tile inside that part, and is bounded by the map's room `frame` when
 * it has one, else by the whole map. On a walked map a showpiece the hero stands
 * near leans it (showAt). `open` is the uncovered part in world art px.
 *
 * A HUNT ROOM (map kind 'hunt') IS FRAMED ON THE VIEWED HERO (Tyler 2026-10-22,
 * "this is ridiculous": the hero stood at the analyzer's edge with most of the
 * World empty cave wall): the hero sits at the middle of the uncovered part, which
 * stays inside the room. NO VOID ON THE ART outranks the middle (Tyler's UI audit
 * 2026-11-18, N10: a black band showed under and below the short panels, the
 * first hunt on 95% of its floor at 1440x900): the whole view stays on the map's
 * art, so near the art's edge the hero moves toward that panel rather than the
 * void showing. The hero's fight (its tile and the ring round it) is never under
 * a panel, which outranks both: only there does the void come back.
 * @param {{inset?: any, keep?: any, from?: any, sinceMs?: number}} [o]
 */
export function frameView(look, vw, vh, map, z, T, o = {}) {
  const fr = map.frame;
  const bounds = fr ? { x: fr.x * T, y: fr.y * T, w: fr.w * T, h: fr.h * T } : { x: 0, y: 0, w: map.w * T, h: map.h * T };
  const mid = (p) => (p ? { x: (p.x + 0.5) * T, y: (p.y + 0.5) * T } : null);
  const target = mid(look) || { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const inset = cleanInset(o.inset);
  const hunt = map.kind === 'hunt';
  const rule = hunt ? { art: { x: 0, y: 0, w: map.w * T, h: map.h * T } } : { show: showAt(map, o.keep, vh - inset.top - inset.bottom) };
  const margin = hunt ? HUNT_KEEP_TILES * T : T;
  /* o.from / o.sinceMs: where the camera stood when the inset last changed, and how long ago (easedCam). */
  const cam = easedCam(o.from, follow(target, { w: vw, h: vh }, bounds, inset, mid(o.keep), margin, rule), o.sinceMs);
  const plan = blitPlan(cam, z, T), q = alignOf(z);
  const open = { x: cam.x + inset.left, y: cam.y + inset.top, w: Math.max(1, vw - inset.left - inset.right), h: Math.max(1, vh - inset.top - inset.bottom) };
  return { cam, plan, open, view: { ox: plan.ox, oy: plan.oy, w: Math.ceil((Math.ceil(vw) + 2 * T + q) / q) * q, h: Math.ceil((Math.ceil(vh) + 2 * T + q) / q) * q } };
}
