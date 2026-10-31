// ════════════════════════════════════════════════════════════════════════
// src/world/render/canvas-backend.js — THE WORLD ON A 2D CANVAS.
//
// Interface { mount, setMap, prepare, ready, setInset, sync, snapshot, destroy } — the same as
// null-backend.js, and both draw composeFrame()'s list over the same manifest
// book, so what the node tests assert is what this paints. The screen adds
// pick / screenOf: a tap's client point ↔ the last frame's tiles and sprites.
//
// One frame:
//   1. compose at ART resolution (the map's T) on an offscreen canvas: ground
//      chunks (16x16 tiles, ground-chunks.js: baked in slices, ahead of the view), decals,
//      the ONE shadow mask at --world-shadow-alpha (ellipses, polygons and
//      cast silhouettes sheared by castMatrix), the y-sorted sprites, the
//      raised layer (rock tops, capstones, roofs), then light: the map's
//      ambient multiplied with stepped point-light pools added in, and a
//      vignette outdoors; both masks are re-drawn only on a changed signature;
//   2. copy it to the screen in ONE nearest-neighbour drawImage at zoom z,
//      offset by the camera's whole-device-pixel remainder (core/camera.js);
//   3. draw the nameplates, the walk mark and speech bubbles at SCREEN
//      resolution so text stays crisp.
// A FRAME IS PAINTED ONLY WHEN ITS DRAW LIST CHANGED (frame-sig.js, tests/perf-budget.mjs PB-IDLE): composeFrame
// runs every frame, and a list equal to the one on the canvas leaves the canvas as it is. So anything that animates
// (a walker, a fire's clip, a hit) paints on the frame it changes, at full rate, and a still town costs no pixels.
// THE GROUND IS KEPT WHILE THE CAMERA STANDS (groundLayer): void, chunks and decals, composed once for that view.
// Moving, a frame composes them directly: nothing is copied twice on the way to the screen.
// Colours: --world-* tokens via `css`. Tile, chunk, zoom: the map's grid (zs = z x T / 32).
// ════════════════════════════════════════════════════════════════════════
import { zoomFor, frameView, cleanInset } from '../core/camera.js?v=0.2.76';
import { composeFrame } from '../core/compose.js?v=0.2.76';
import { createGroundChunks } from './ground-chunks.js?v=0.2.76';
import { createFrameSig } from './frame-sig.js?v=0.2.76';
import { paintStub } from '../stub-atlas.js?v=0.2.76';

const LIGHT_BANDS = 4;   // stepped pools: pixel-art light, no airbrush
const FLASH_ALPHA = 0.7; // a hit's silhouette over the frame
const CHUNK_KEEP = 24;   // baked ground chunks kept (LRU): a 192 x 116 town is 96 of ~1 MB each
const WARM_MS = 8;       // a new map's first view: ground baked per frame while the last frame stays
const AHEAD_MS = 6;      // the chunks just off screen: baked per idle slice, so walking onto one bakes nothing
const OPAQUE = Object.freeze({ alpha: false });   // a layer every frame covers whole: the browser copies it, never blends it
/* A held picture is painted again this often, whatever the list says: a canvas a browser blanked without telling (no
   contextrestored) heals itself rather than staying blank. A tenth of a percent of what a still town used to paint. */
const HEAL_MS = 5000;

/**
 * @param {{win: Window, doc: Document, book: object, images: object, tables: object,
 *          css: (token: string) => string}} o   css('--world-void') → the token's value
 */
export function createCanvasBackend(o) {
  const { win, doc, css } = o;
  let { book, images, tables } = o;
  const tone = (name) => css('--world-' + name);
  const layer = (opts) => { const c = doc.createElement('canvas'); return { c, g: c.getContext('2d', opts) }; };
  const comp = layer(OPAQUE), floor = layer(OPAQUE), shade = layer(), lit = layer(), rim = layer();
  /* THE MASKS ARE KEPT (tests/perf-budget.mjs): full-size raster passes most frames would repeat. */
  let shadeSig = null, litSig = null, rimSig = null;
  const masks = { shadow: 0, light: 0, vignette: 0, kept: 0 };
  /* THE FRAME AND THE GROUND ARE KEPT (frame-sig.js): what is on the canvas, and what the ground layer holds. */
  const frameSig = createFrameSig(), floorSig = createFrameSig();
  let floorGood = false, paintedAt = -Infinity;
  const kept = { painted: 0, held: 0, floorMade: 0, floorKept: 0 };
  const repaint = () => { frameSig.forget(); };
  /* a canvas the browser lost and gave back is blank: draw its mask (and so the frame) again */
  shade.c.addEventListener('contextrestored', () => { shadeSig = null; repaint(); });
  lit.c.addEventListener('contextrestored', () => { litSig = null; repaint(); });
  rim.c.addEventListener('contextrestored', () => { rimSig = null; repaint(); });
  floor.c.addEventListener('contextrestored', () => { floorGood = false; repaint(); });
  comp.c.addEventListener('contextrestored', repaint);
  const stubs = new Map();
  let host = null, canvas = null, ctx = null, ro = null, onResize = null;
  let map = null;
  const ground = createGroundChunks({ doc, tone, now: () => win.performance.now() });
  let hold = true, ring = [], aheadId = 0;   // hold: a new view's ground is not baked yet (ready())
  let z = 2, dpr = 1, W = 1, H = 1, dirty = true, inset = cleanInset(null);
  /* the viewer's zoom (camera.js zoomFor pick; null: the screen class's) */
  let zoomPick = null;
  let T = 32, CHUNK = 16 * T, zs = z;
  /* Ease after an inset change (camera.js easedCam); the FIRST inset is the start, never eased (hero switch). */
  let lastCam = null, camFrom = null, insetSince = -Infinity, insetHeard = false;
  const reduceMotion = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let frames = 0, msAvg = 0, msLast = 0, last = null, lastView = null;
  /* The names drawn last frame that belong to someone, in canvas px: a press on a name picks its owner. */
  let plateHits = [];

  const sizeTo = (c, w, h) => { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; };

  function measure() {
    dpr = win.devicePixelRatio || 1;
    z = zoomFor(win.innerWidth, dpr, map && map.grid, zoomPick);
    zs = (z * T) / 32;
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    sizeTo(canvas, W, H);
    dirty = false;
  }

  /** The source to blit a draw-list entry from: its atlas image, or a stub box. */
  function source(d) {
    if (d.set && images[d.set]) return { img: images[d.set], sx: d.sx, sy: d.sy };
    let s = stubs.get(d.w + 'x' + d.h);
    if (!s) {
      s = doc.createElement('canvas');
      s.width = d.w; s.height = d.h;
      paintStub(s.getContext('2d'), d.w, d.h, tone);
      stubs.set(d.w + 'x' + d.h, s);
    }
    return { img: s, sx: 0, sy: 0 };
  }

  function blit(g, d, view) {
    if (d.kind === 'void') { g.fillStyle = tone('void'); g.fillRect(d.x - view.ox, d.y - view.oy, d.w, d.h); return; }
    const s = source(d);
    g.drawImage(s.img, s.sx, s.sy, d.w, d.h, d.x - view.ox, d.y - view.oy, d.w, d.h);
  }

  /* THE TWO UNIT VARIANTS of an atlas, built once per set on first use: `flash`, the
     silhouette in --world-flash (a hit), and `corpse`, each pixel's lightness laid onto
     the --world-corpse-0..4 ramp (VW-05). Both are palette colours from tokens, so the
     art never leaves the palette; neither is ever smoothed. */
  const variants = new Map();
  function variant(set, kind) {
    const key = set + ':' + kind;
    if (variants.has(key)) return variants.get(key);
    const img = images[set];
    let c = null;
    if (img) {
      c = doc.createElement('canvas');
      c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      const v = c.getContext('2d');
      v.imageSmoothingEnabled = false;
      v.drawImage(img, 0, 0);
      if (kind === 'flash') {
        v.globalCompositeOperation = 'source-in';
        v.fillStyle = tone('flash');
        v.fillRect(0, 0, c.width, c.height);
      } else {
        const ramp = [0, 1, 2, 3, 4].map((i) => rgbOf(tone('corpse-' + i)));
        const px = v.getImageData(0, 0, c.width, c.height);
        const a = px.data;
        for (let i = 0; i < a.length; i += 4) {
          if (!a[i + 3]) continue;
          const L = (a[i] * 299 + a[i + 1] * 587 + a[i + 2] * 114) / 255000;
          const r = ramp[Math.min(ramp.length - 1, Math.floor(L * ramp.length))];
          a[i] = r[0]; a[i + 1] = r[1]; a[i + 2] = r[2];
        }
        v.putImageData(px, 0, 0);
      }
    }
    variants.set(key, c);
    return c;
  }
  /* A token's colour as [r, g, b]: the browser parses it, so any CSS colour form works. */
  function rgbOf(value) {
    const c = doc.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d');
    g.fillStyle = value || 'transparent';
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }

  /* A unit: its colour frame, crossfaded to its corpse tone by `grey`, or its hit flash. */
  function blitUnit(g, d, view) {
    const base = d.alpha == null ? 1 : d.alpha;
    const alt = d.set ? (d.flash ? variant(d.set, 'flash') : variant(d.set, 'corpse')) : null;
    if (!alt) { g.globalAlpha = base; blit(g, d, view); return; }
    if (d.flash) {
      /* the frame, then its silhouette over it: bright, with the shape still readable */
      g.globalAlpha = base; blit(g, d, view);
      g.globalAlpha = base * FLASH_ALPHA;
      g.drawImage(alt, d.sx, d.sy, d.w, d.h, d.x - view.ox, d.y - view.oy, d.w, d.h);
      return;
    }
    if (d.grey < 1) { g.globalAlpha = base * (1 - d.grey); blit(g, d, view); }
    g.globalAlpha = base * d.grey;
    g.drawImage(alt, d.sx, d.sy, d.w, d.h, d.x - view.ox, d.y - view.oy, d.w, d.h);
  }

  /* EFFECTS, after the light (a spell is its own light): at the anchor, rotated for a
     projectile, additively when the manifest says so. Art resolution, no smoothing. */
  function effects(g, list, view) {
    for (const e of list.fx || []) {
      if (!e.set || !images[e.set]) continue;
      g.globalCompositeOperation = e.blend === 'add' ? 'lighter' : 'source-over';
      if (e.angle) {
        g.save();
        g.translate(e.cx - view.ox, e.cy - view.oy);
        g.rotate(e.angle);
        g.drawImage(images[e.set], e.sx, e.sy, e.w, e.h, -e.ax, -e.ay, e.w, e.h);
        g.restore();
      } else {
        g.drawImage(images[e.set], e.sx, e.sy, e.w, e.h, e.x - view.ox, e.y - view.oy, e.w, e.h);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  /* A mask's signature: the view, its colour, and every shape (a cast by its frame) or lamp (the hero's moves). */
  function shadeSigOf(list, view) {
    let k = view.ox + ',' + view.oy + ',' + view.w + ',' + view.h + '|' + tone('shadow');
    for (const sh of list.shadows) {
      if (sh.type === 'cast') { const d = sh.sprite; k += '|c' + d.set + ',' + d.sx + ',' + d.sy + ',' + d.w + ',' + d.h + ',' + d.x + ',' + d.y + ',' + sh.m.join(','); }
      else if (sh.type === 'ellipse') k += '|e' + sh.cx + ',' + sh.cy + ',' + sh.w + ',' + sh.h;
      else k += '|p' + sh.pts.join(';');
    }
    return k;
  }

  function shadows(g, list, view) {
    const sig = shadeSigOf(list, view);
    if (sig !== shadeSig) { shadeSig = sig; masks.shadow++; drawShadowMask(list, view); } else masks.kept++;
    g.globalAlpha = parseFloat(tone('shadow-alpha')) || 0;
    g.drawImage(shade.c, 0, 0);
    g.globalAlpha = 1;
  }

  function drawShadowMask(list, view) {
    sizeTo(shade.c, view.w, view.h);
    const s = shade.g;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, view.w, view.h);
    s.fillStyle = tone('shadow');
    for (const sh of list.shadows) {
      if (sh.type === 'cast') {
        const [a, b, c, d, e, f] = sh.m;
        s.setTransform(a, b, c, d, e - view.ox, f - view.oy);
        const src = source(sh.sprite);
        s.drawImage(src.img, src.sx, src.sy, sh.sprite.w, sh.sprite.h, sh.sprite.x, sh.sprite.y, sh.sprite.w, sh.sprite.h);
        s.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      s.beginPath();
      if (sh.type === 'ellipse') s.ellipse(sh.cx - view.ox, sh.cy - view.oy, sh.w / 2, sh.h / 2, 0, 0, Math.PI * 2);
      else sh.pts.forEach(([x, y], i) => (i ? s.lineTo(x - view.ox, y - view.oy) : s.moveTo(x - view.ox, y - view.oy)));
      s.fill();
    }
    /* Silhouettes arrive in their own colours: flatten the whole mask to one tone. */
    s.globalCompositeOperation = 'source-in';
    s.fillRect(0, 0, view.w, view.h);
    s.globalCompositeOperation = 'source-over';
  }

  function drawLight(points, view, kind) {
    sizeTo(lit.c, view.w, view.h);
    const l = lit.g;
    l.globalCompositeOperation = 'source-over';
    l.globalAlpha = 1;
    l.fillStyle = tone('light-' + kind);
    l.fillRect(0, 0, view.w, view.h);
    l.globalCompositeOperation = 'lighter';
    l.globalAlpha = 1 / (LIGHT_BANDS + 1);
    for (const p of points) {
      l.fillStyle = tone('light-' + p.tint);
      for (let k = 1; k <= LIGHT_BANDS; k++) {
        l.beginPath();
        l.ellipse(p.x - view.ox, p.y - view.oy, p.r * k / (LIGHT_BANDS + 1), p.r * k / (LIGHT_BANDS + 1) / 1.15, 0, 0, Math.PI * 2);
        l.fill();
      }
    }
    l.globalAlpha = 1;
  }

  function light(g, list, view, fv) {
    const { kind, points, vignette } = list.lights;
    if (kind !== 'day' || points.length) {
      let sig = view.ox + ',' + view.oy + ',' + view.w + ',' + view.h + '|' + kind + ':' + tone('light-' + kind);
      for (const p of points) sig += '|' + p.x + ',' + p.y + ',' + p.r + ',' + tone('light-' + p.tint);
      if (sig !== litSig) { litSig = sig; masks.light++; drawLight(points, view, kind); } else masks.kept++;
      g.globalCompositeOperation = 'multiply';
      g.drawImage(lit.c, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    if (vignette) {
      /* the vignette rings the uncovered World where it sits on the SCREEN: the camera's walk moves it by under an art px
         here, so it is held on a whole one and its mask outlives the walk (a gradient per frame was a full-view raster) */
      const vw = fv.open.w, vh = fv.open.h;
      const cx = Math.round(fv.open.x - fv.cam.x + T + vw / 2), cy = Math.round(fv.open.y - fv.cam.y + T + vh / 2);
      const sig = view.w + ',' + view.h + '|' + vw + ',' + vh + '|' + cx + ',' + cy + '|' + tone('vignette');
      if (sig !== rimSig) { rimSig = sig; masks.vignette++; drawVignette(view, vw, vh, cx, cy); } else masks.kept++;
      g.drawImage(rim.c, 0, 0);
    }
  }

  function drawVignette(view, vw, vh, cx, cy) {
    sizeTo(rim.c, view.w, view.h);
    const r = rim.g;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.clearRect(0, 0, view.w, view.h);
    r.translate(cx, cy);
    r.scale(vw / 2, vh / 2);
    const v = r.createRadialGradient(0, 0, 0.55, 0, 0, 1.55);
    v.addColorStop(0, 'transparent');
    v.addColorStop(1, tone('vignette'));
    r.fillStyle = v;
    r.fillRect((-1 - cx) * 2 / vw, (-1 - cy) * 2 / vh, (view.w + 2) * 2 / vw, (view.h + 2) * 2 / vh);
    r.setTransform(1, 0, 0, 1, 0, 0);
  }

  const platesOf = (list) => list.plates.slice().sort((a, b) => (b.kind === 'self') - (a.kind === 'self'));

  /* Screen-resolution marks: the target square, HP bars, damage floats, then
     nameplates on top. Sizes scale with the zoom so they track the art. */
  function overlay(list, view, plan) {
    const at = (x, y) => [Math.round((x - view.ox) * z + plan.dx), Math.round((y - view.oy) * z + plan.dy)];
    const unitPx = Math.max(1, Math.round(zs / 2));
    if (list.target) {
      const [x, y] = at(list.target.x, list.target.y);
      ctx.strokeStyle = tone('target');
      ctx.lineWidth = Math.max(2, unitPx);
      ctx.strokeRect(x, y, list.target.w * zs, list.target.h * zs);
    }
    for (const b of list.bars || []) {
      const [x, y] = at(b.x - b.w / 2, b.y);
      const w = b.w * zs, h = Math.max(3, Math.round(1.5 * zs));
      const mh = b.mana == null ? 0 : Math.max(2, Math.round(0.75 * zs));
      ctx.fillStyle = tone('bar-back');
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2 + (mh ? mh + 1 : 0));
      ctx.fillStyle = tone(b.kind === 'hero' ? 'bar-hero' : b.kind === 'foe' ? 'bar-foe' : 'bar-' + b.kind);
      ctx.fillRect(x, y, Math.round(w * b.pct), h);
      if (mh) { ctx.fillStyle = tone('bar-mana'); ctx.fillRect(x, y + h + 1, Math.round(w * b.mana), mh); }
    }
    /* VW-08: a bleed badge with its stack count, right of the bar. */
    for (const k of list.badges || []) {
      const [x, y] = at(k.x, k.y);
      const px = Math.max(Math.round(4.5 * zs), Math.round(11 * dpr));
      ctx.font = '800 ' + px + 'px ' + (css('--f-ui') || 'sans-serif');
      const text = '×' + k.n, w = Math.ceil(ctx.measureText(text).width) + Math.round(px * 0.6), h = px + 2;
      ctx.fillStyle = tone('bar-back');
      ctx.fillRect(x - 1, y - h - 1, w + 2, h + 2);
      ctx.fillStyle = tone('bleed');
      ctx.fillRect(x, y - h, w, h);
      ctx.fillStyle = tone('bleed-ink');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y - h / 2);
    }
    const font = (k) => Math.max(Math.round(k * zs), Math.round(12 * dpr));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    for (const f of list.floats || []) {
      const big = f.kind === 'kill' || f.big;
      const px = Math.max(Math.round((big ? 9 : 8) * zs), Math.round((big ? 20 : 16) * dpr));
      ctx.font = '800 ' + px + 'px ' + (css('--f-ui') || 'sans-serif');
      ctx.lineWidth = Math.max(2, Math.round(px / 5));
      ctx.globalAlpha = f.alpha;
      const [x, y] = at(f.x, f.y);
      ctx.strokeStyle = tone('plate-line');
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = tone('float-' + f.kind);
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
    if (list.mark) {
      const [x, y] = at(list.mark.x, list.mark.y);
      ctx.strokeStyle = tone('walk-mark');
      ctx.lineWidth = Math.max(2, unitPx);
      ctx.beginPath();
      ctx.ellipse(x, y, 9 * zs, 4 * zs, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    /* Names never print over each other: yours first, then each plate that would
       touch one already placed steps up a line until it is clear. */
    const placed = [];
    plateHits = [];
    for (const p of platesOf(list)) {
      const px = font(p.kind === 'self' ? 5 : 4.5);
      ctx.font = '700 ' + px + 'px ' + (css('--f-ui') || 'sans-serif');
      ctx.lineWidth = Math.max(2, Math.round(px / 6));
      ctx.globalAlpha = p.alpha == null ? 1 : p.alpha;
      const [ax, y0] = at(p.x, p.y - 3);
      const half = ctx.measureText(p.text).width / 2 + px / 3;
      /* a name whose owner is (even half) on the canvas slides in from the edge rather than being cut */
      const x = ax >= -16 * zs && ax <= W + 16 * zs ? Math.max(half, Math.min(W - half, ax)) : ax;
      let y = y0;
      for (let k = 0; k < 6 && placed.some((q) => x - half < q.r && x + half > q.l && y - px < q.b && y > q.t); k++) y -= px + 2;
      placed.push({ l: x - half, r: x + half, t: y - px, b: y });
      if (p.ref) plateHits.push({ l: x - half, r: x + half, t: y - px, b: y, id: p.id, ref: p.ref });
      ctx.strokeStyle = tone('plate-line');
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = tone('plate-' + (p.kind || 'self'));
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
    for (const b of list.bubbles || []) bubble(b, at, font(4.2));
  }

  /* A speech bubble: a boxed line with a tail, its foot on (b.x, b.y). */
  function bubble(b, at, px) {
    ctx.font = '600 ' + px + 'px ' + (css('--f-ui') || 'sans-serif');
    const padX = Math.round(px * 0.6), padY = Math.round(px * 0.45), tail = Math.round(px * 0.5);
    const w = Math.ceil(ctx.measureText(b.text).width) + 2 * padX, h = px + 2 * padY;
    const [x, y] = at(b.x, b.y);
    /* Kept on the canvas: slid in from the sides, and dropped below the top edge (the tail is then left off). */
    const left = Math.max(4, Math.min(W - w - 4, Math.round(x - w / 2))), top = Math.max(4, y - h - tail);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(left, top, w, h, Math.round(px / 3));
    else ctx.rect(left, top, w, h);
    if (top === y - h - tail) {
      ctx.moveTo(x - tail, top + h);
      ctx.lineTo(x, top + h + tail);
      ctx.lineTo(x + tail, top + h);
    }
    ctx.fillStyle = tone('bubble-bg');
    ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(dpr));
    ctx.strokeStyle = tone('bubble-line');
    ctx.stroke();
    ctx.fillStyle = tone('bubble-ink');
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, left + w / 2, top + h / 2);
    ctx.textBaseline = 'bottom';
  }

  function viewOf(state, t0) {
    /* ONE zoom for every scene (measure()); the camera looks at the hero (or `state.camera`) inside, and keeps
       the hero in, the part of the stage the docked windows leave uncovered */
    const k = dpr / z;
    return frameView(state.camera || state.hero, W / z, H / z, map, z, T,
      { inset: { left: inset.left * k, right: inset.right * k, top: inset.top * k, bottom: inset.bottom * k }, keep: state.hero,
        from: camFrom, sinceMs: t0 - insetSince });
  }
  /** The [cx, cy] chunks on the map under `view` grown by `pad` art px on every side. */
  function chunksOf(view, pad) {
    const out = [], mw = map.w * T, mh = map.h * T;
    for (let cy = Math.floor((view.oy - pad) / CHUNK); cy * CHUNK < view.oy + view.h + pad; cy++) {
      for (let cx = Math.floor((view.ox - pad) / CHUNK); cx * CHUNK < view.ox + view.w + pad; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= mw || cy * CHUNK >= mh) continue;
        out.push([cx, cy]);
      }
    }
    return out;
  }
  const later = (fn) => (win.requestIdleCallback ? win.requestIdleCallback(fn, { timeout: 250 }) : win.setTimeout(fn, 0));
  const unlater = (id) => (win.cancelIdleCallback ? win.cancelIdleCallback(id) : win.clearTimeout(id));
  function bakeAhead() {
    aheadId = 0;
    if (map && !ground.bake(ring, win.performance.now() + AHEAD_MS)) aheadId = later(bakeAhead);
  }

  /* Does this frame draw anything the canvas does not already show? Everything a paint reads: the list (walked whole),
     where it lands, and which of its sheets have arrived (a stub box gives way to its art). */
  function frameChanged(list, fv) {
    const s = frameSig;
    s.begin();
    s.add(W); s.add(H); s.add(z); s.add(fv.view.ox); s.add(fv.view.oy); s.add(fv.view.w); s.add(fv.view.h);
    s.add(fv.plan.dx); s.add(fv.plan.dy); s.add(fv.open.w); s.add(fv.open.h);
    s.add(list);
    for (const l of [list.decals, list.sprites, list.raised, list.fx]) for (const d of l) s.add(!!images[d.set]);
    return s.end();
  }

  /* THE GROUND (void, chunks, decals) OF ONE VIEW. The camera moved: drawn straight onto the frame, as nothing can reuse
     it. It stood for a frame: composed once into its own layer, and that layer is the ground until the camera moves or a
     decal changes. A frame's pixels are the same either way (tests/perf-budget.mjs PB-PIX). */
  function groundLayer(g, decals, view) {
    const s = floorSig;
    s.begin();
    s.add(view.ox); s.add(view.oy); s.add(view.w); s.add(view.h);
    s.add(decals);
    if (s.end()) { floorGood = false; groundOn(g, decals, view); return; }
    if (!floorGood) {
      sizeTo(floor.c, view.w, view.h);
      floor.g.imageSmoothingEnabled = false;
      groundOn(floor.g, decals, view);
      floorGood = true;
      kept.floorMade++;
    } else kept.floorKept++;
    g.drawImage(floor.c, 0, 0);
  }
  function groundOn(g, decals, view) {
    g.fillStyle = tone('void');
    g.fillRect(0, 0, view.w, view.h);
    for (const [cx, cy] of chunksOf(view, 0)) g.drawImage(ground.get(cx, cy), cx * CHUNK - view.ox, cy * CHUNK - view.oy);
    for (const d of decals) blit(g, d, view);
  }

  function draw(state) {
    const t0 = win.performance.now();
    if (dirty) measure();
    const fv = viewOf(state, t0);
    lastCam = fv.cam;
    const { view, plan } = fv;
    const list = composeFrame(map, book, state, view, tables, T);
    ring = chunksOf(view, CHUNK / 2);   // half a chunk off screen, baked in idle time (bakeAhead); the LRU keeps two rings
    ground.fit(Math.max(CHUNK_KEEP, 2 * ring.length));
    if (!aheadId && !ground.whole(ring)) aheadId = later(bakeAhead);
    hold = false;
    const changed = frameChanged(list, fv);
    frames++;
    last = list;
    lastView = fv;
    if (!changed && t0 - paintedAt < HEAL_MS) {
      /* the same picture: nothing is painted, and what a press on a name finds is this frame's record */
      let i = 0;
      for (const p of platesOf(list)) if (p.ref) plateHits[i++].ref = p.ref;
      kept.held++;
      return;
    }
    kept.painted++;
    paintedAt = t0;
    sizeTo(comp.c, view.w, view.h);
    const g = comp.g;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    groundLayer(g, list.decals, view);
    shadows(g, list, view);
    for (const d of list.sprites) {
      if (d.kind === 'unit' && (d.flash || d.grey)) blitUnit(g, d, view);
      else { g.globalAlpha = d.alpha == null ? 1 : d.alpha; blit(g, d, view); }
    }
    g.globalAlpha = 1;
    for (const d of list.raised) { g.globalAlpha = d.alpha; blit(g, d, view); }
    g.globalAlpha = 1;
    light(g, list, view, fv);
    effects(g, list, view);
    ctx.imageSmoothingEnabled = false;
    /* a tile of overscan on every side (core/camera.js frameView): this covers the whole canvas, so nothing is cleared */
    ctx.drawImage(comp.c, plan.dx, plan.dy, view.w * z, view.h * z);
    overlay(list, view, plan);
    msLast = win.performance.now() - t0;
    msAvg = kept.painted > 1 ? msAvg * 0.9 + msLast * 0.1 : msLast;
  }

  /** Device px on the canvas for a client point, and back: the last frame's camera. */
  function toArt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height || !lastView) return null;
    const { view, plan } = lastView;
    return [((clientX - r.left) * (W / r.width) - plan.dx) / z + view.ox, ((clientY - r.top) * (H / r.height) - plan.dy) / z + view.oy];
  }

  return {
    mount(el) {
      host = el;
      canvas = doc.createElement('canvas');
      canvas.className = 'world-canvas';
      canvas.setAttribute('aria-label', 'The world');
      host.appendChild(canvas);
      ctx = canvas.getContext('2d', OPAQUE);
      /* a canvas the browser lost and gave back is blank, and a held frame would leave it so */
      canvas.addEventListener('contextrestored', repaint);
      /* the names' letters change shape when the web font lands */
      if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', repaint);
      dirty = true;
      if (typeof win.ResizeObserver === 'function') { ro = new win.ResizeObserver(() => { dirty = true; }); ro.observe(host); }
      onResize = () => { dirty = true; };
      win.addEventListener('resize', onResize);
    },
    /** Show map `m`, drawn with `art` ({book, images, tables}) or the constructor's; the zoom is re-measured. */
    setMap(m, art) {
      map = m;
      if (art) ({ book, images, tables } = art); else ({ book, images, tables } = o);
      T = m.T || 32; CHUNK = 16 * T;
      dirty = true;
      ground.use(m, { book, tables, images });
      hold = true;
      last = null;
      repaint(); floorSig.forget(); floorGood = false;
      lastCam = camFrom = null;   // a new map never eases in from the old one
    },
    /** Bin map `m`'s ground ahead of its first frame: at once, or in slices (`sl`, compose.js sliced) → a promise. */
    prepare(m, art, sl) { return ground.prepare(m, art || o, sl); },
    /** May the next sync draw? A new map's (or zoom's) view first bakes its ground, WARM_MS a frame; the frame after draws. */
    ready(state) {
      if (!hold || !map || !canvas) return true;
      if (dirty) measure();
      const t0 = win.performance.now();
      const shown = chunksOf(viewOf(state, t0).view, 0);
      if (ground.whole(shown)) { hold = false; return true; }
      ground.bake(shown, t0 + WARM_MS);
      return false;
    },
    sync(state) { if (map && canvas) draw(state); },
    /** Something no draw list names changed (a colour token): every kept layer is made again on the next sync. */
    invalidate() { repaint(); floorGood = false; shadeSig = litSig = rimSig = null; },
    /** The viewer's zoom (CSS px per base art px; null: the screen class's), from the next frame on. */
    setZoom(v) { const next = Number.isFinite(v) && v > 0 ? v : null; if (next !== zoomPick) { zoomPick = next; dirty = true; hold = true; lastCam = camFrom = null; } },
    /**
     * THE CAMERA INSET: the strips of the stage a docked window covers, in CSS
     * px ({left, right, top, bottom}; null uncovers it). The camera frames the
     * rest, so the hero is never under a window; the art still draws there.
     */
    setInset(o) {
      const next = cleanInset(o), first = !insetHeard;
      insetHeard = true;
      if (next.left === inset.left && next.right === inset.right && next.top === inset.top && next.bottom === inset.bottom) return;
      camFrom = reduceMotion() || first ? null : lastCam;
      insetSince = win.performance.now();
      inset = next;
    },
    /**
     * What is under a client point in the last frame: { tile: [x, y], hits } —
     * hits are the drawn props, units and decals there, top-most first. Under a
     * roof that is showing, nothing below it is hit (the tap is on the building).
     */
    pick(clientX, clientY) {
      const p = last && canvas && toArt(clientX, clientY);
      if (!p) return null;
      const [X, Y] = p;
      const under = (d) => X >= d.x && X < d.x + d.w && Y >= d.y && Y < d.y + d.h;
      const roofed = last.raised.some((d) => d.kind === 'roof' && d.alpha > 0.5 && under(d));
      /* A name sits over everything (the overlay): a press on it is a press on its owner, top-most. */
      const r = canvas.getBoundingClientRect();
      const cx = (clientX - r.left) * (W / r.width), cy = (clientY - r.top) * (H / r.height);
      const named = plateHits.filter((q) => cx >= q.l && cx <= q.r && cy >= q.t && cy <= q.b).reverse()
        .map((q) => ({ id: q.id, tx: null, ty: null, ref: q.ref }));
      const hits = named.concat(roofed ? [] : last.sprites.filter(under).reverse().concat(last.decals.filter(under).reverse())
        .filter((d) => d.kind !== 'wall' && d.kind !== 'stub' && d.kind !== 'door')
        .map((d) => ({ id: d.id, tx: d.tx, ty: d.ty, ref: d.ref })));
      return { tile: [Math.floor(X / T), Math.floor(Y / T)], hits };
    },
    /** The client point over the middle of tile (x, y) in the last frame, or null. */
    screenOf(tx, ty) {
      const r = canvas && lastView && canvas.getBoundingClientRect();
      if (!r || !r.width) return null;
      const { view, plan } = lastView;
      return { x: r.left + (((tx + 0.5) * T - view.ox) * z + plan.dx) * (r.width / W), y: r.top + (((ty + 0.5) * T - view.oy) * z + plan.dy) * (r.height / H) };
    },
    snapshot() {
      return {
        map: map && map.id, z, dpr, size: [W, H], frames, msAvg, msLast, inset: Object.assign({}, inset), masks: Object.assign({}, masks), kept: Object.assign({}, kept),
        heroBuilding: last ? last.heroBuilding : null,
        names: canvas ? plateHits.map((q) => {   // in CLIENT px, for a test aiming a right-click
          const r = canvas.getBoundingClientRect(), sx = r.width / W, sy = r.height / H;
          return { name: q.ref.player ? q.ref.player.name : null, l: r.left + q.l * sx, r: r.left + q.r * sx, t: r.top + q.t * sy, b: r.top + q.b * sy };
        }) : [],
        sprites: last ? last.sprites.length : 0,
        stubbed: last ? last.sprites.concat(last.raised).filter((d) => d.kind !== 'void' && !(d.set && images[d.set])).map((d) => d.id) : [],
        roofs: last ? last.roofs : [],
      };
    },
    destroy() {
      if (ro) ro.disconnect();
      if (onResize) win.removeEventListener('resize', onResize);
      if (doc.fonts && doc.fonts.removeEventListener) doc.fonts.removeEventListener('loadingdone', repaint);
      if (canvas) { canvas.remove(); canvas.width = 0; canvas.height = 0; }
      host = canvas = ctx = ro = onResize = map = last = lastView = null;
      plateHits = [];
      if (aheadId) unlater(aheadId);
      aheadId = 0; ring = [];
      ground.clear();
      /* every layer's pixels back at once, the atlas-sized variants above all (ground-chunks.js release: the pane's canvases
         left to the collector came due as one long pause in a later frame) */
      for (const c of [comp.c, floor.c, shade.c, lit.c, rim.c, ...variants.values(), ...stubs.values()]) if (c) { c.width = 0; c.height = 0; }
      variants.clear(); stubs.clear();
    },
  };
}
