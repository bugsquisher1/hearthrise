// ════════════════════════════════════════════════════════════════════════
// src/world/render/canvas-backend.js — THE WORLD ON A 2D CANVAS.
//
// Interface { mount, setMap, sync, snapshot, destroy } — the same as
// null-backend.js, and both draw composeFrame()'s list over the same manifest
// book, so what the node tests assert is what this paints.
//
// One frame:
//   1. compose at ART resolution (T = 32) on an offscreen canvas: ground
//      chunks (16x16 tiles, baked once per map from groundTiles()), decals,
//      the ONE shadow mask at --world-shadow-alpha (ellipses, polygons and
//      cast silhouettes sheared by castMatrix), the y-sorted sprites, the
//      raised layer (rock tops, capstones, roofs), then light: the map's
//      ambient multiplied with stepped point-light pools added in, and a
//      vignette outdoors;
//   2. copy it to the screen in ONE nearest-neighbour drawImage at zoom z,
//      offset by the camera's whole-device-pixel remainder (core/camera.js);
//   3. draw the nameplates at SCREEN resolution so text stays crisp.
// Colours come from --world-* tokens through `css` (the caller's token reader).
// ════════════════════════════════════════════════════════════════════════
import { T } from '../core/grid.js?v=578';
import { zoomFor, frameView, fitZoom, frameCentre } from '../core/camera.js?v=578';
import { composeFrame, groundTiles } from '../core/compose.js?v=578';
import { paintStub } from '../stub-atlas.js?v=578';

const CHUNK = 16 * T;
const LIGHT_BANDS = 4;   // stepped pools: pixel-art light, no airbrush

/**
 * @param {{win: Window, doc: Document, book: object, images: object, tables: object,
 *          css: (token: string) => string}} o   css('--world-void') → the token's value
 */
export function createCanvasBackend(o) {
  const { win, doc, book, images, tables, css } = o;
  const tone = (name) => css('--world-' + name);
  const layer = () => { const c = doc.createElement('canvas'); return { c, g: c.getContext('2d') }; };
  const comp = layer(), shade = layer(), lit = layer();
  const stubs = new Map();
  let host = null, canvas = null, ctx = null, ro = null, onResize = null;
  let map = null, ground = null, chunks = new Map();
  let z = 2, dpr = 1, W = 1, H = 1, dirty = true;
  let frames = 0, msAvg = 0, msLast = 0, last = null;

  const sizeTo = (c, w, h) => { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; };

  function measure() {
    dpr = win.devicePixelRatio || 1;
    z = zoomFor(win.innerHeight, dpr);
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

  function chunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = chunks.get(key);
    if (c) return c;
    c = doc.createElement('canvas');
    c.width = CHUNK; c.height = CHUNK;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const inside = (t) => t.x < x0 + CHUNK && t.y < y0 + CHUNK && t.x + T > x0 && t.y + T > y0;
    g.fillStyle = tone('void');
    for (const v of ground.voids) if (inside(v)) g.fillRect(v.x - x0, v.y - y0, T, T);
    for (const t of ground.tiles) {
      if (!inside(t) || !images[t.set]) continue;
      g.drawImage(images[t.set], t.sx, t.sy, T, T, t.x - x0, t.y - y0, T, T);
    }
    chunks.set(key, c);
    return c;
  }

  function blit(g, d, view) {
    if (d.kind === 'void') { g.fillStyle = tone('void'); g.fillRect(d.x - view.ox, d.y - view.oy, d.w, d.h); return; }
    const s = source(d);
    g.drawImage(s.img, s.sx, s.sy, d.w, d.h, d.x - view.ox, d.y - view.oy, d.w, d.h);
  }

  function shadows(g, list, view) {
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
    g.globalAlpha = parseFloat(tone('shadow-alpha')) || 0;
    g.drawImage(shade.c, 0, 0);
    g.globalAlpha = 1;
  }

  function light(g, list, view, fv) {
    const { kind, points, vignette } = list.lights;
    if (kind !== 'day' || points.length) {
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
      g.globalCompositeOperation = 'multiply';
      g.drawImage(lit.c, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    if (vignette) {
      const vw = W / z, vh = H / z;
      const cx = fv.cam.x + vw / 2 - view.ox, cy = fv.cam.y + vh / 2 - view.oy;
      g.save();
      g.translate(cx, cy);
      g.scale(vw / 2, vh / 2);
      const v = g.createRadialGradient(0, 0, 0.55, 0, 0, 1.55);
      v.addColorStop(0, 'transparent');
      v.addColorStop(1, tone('vignette'));
      g.fillStyle = v;
      g.fillRect(-2, -2, 4, 4);
      g.restore();
    }
  }

  /* Screen-resolution marks: the target square, HP bars, damage floats, then
     nameplates on top. Sizes scale with the zoom so they track the art. */
  function overlay(list, view, plan) {
    const at = (x, y) => [Math.round((x - view.ox) * z + plan.dx), Math.round((y - view.oy) * z + plan.dy)];
    const unitPx = Math.max(1, Math.round(z / 2));
    if (list.target) {
      const [x, y] = at(list.target.x, list.target.y);
      ctx.strokeStyle = tone('target');
      ctx.lineWidth = Math.max(2, unitPx);
      ctx.strokeRect(x, y, list.target.w * z, list.target.h * z);
    }
    for (const b of list.bars || []) {
      const [x, y] = at(b.x - b.w / 2, b.y);
      const w = b.w * z, h = Math.max(3, Math.round(1.5 * z));
      ctx.fillStyle = tone('bar-back');
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = tone(b.kind === 'hero' ? 'bar-hero' : 'bar-foe');
      ctx.fillRect(x, y, Math.round(w * b.pct), h);
    }
    const font = (k) => Math.max(Math.round(k * z), Math.round(12 * dpr));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    for (const f of list.floats || []) {
      const px = Math.max(Math.round((f.kind === 'kill' ? 9 : 8) * z), Math.round((f.kind === 'kill' ? 20 : 16) * dpr));
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
    for (const p of list.plates) {
      const px = font(p.kind === 'self' ? 5 : 4.5);
      ctx.font = '700 ' + px + 'px ' + (css('--f-ui') || 'sans-serif');
      ctx.lineWidth = Math.max(2, Math.round(px / 6));
      ctx.globalAlpha = p.alpha == null ? 1 : p.alpha;
      const [x, y] = at(p.x, p.y - 3);
      ctx.strokeStyle = tone('plate-line');
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = tone('plate-' + (p.kind || 'self'));
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  function draw(state) {
    const t0 = win.performance.now();
    if (dirty) measure();
    /* A map with a `frame` (a hunt room) is shown whole at the largest whole zoom
       that fits; otherwise, and on a phone, the camera follows the hero. */
    const fit = fitZoom(map.frame, W, H, dpr, T);
    z = fit || zoomFor(win.innerHeight, dpr);
    const fv = frameView(fit ? frameCentre(map.frame) : state.hero, W / z, H / z, map, z, T);
    const { view, plan } = fv;
    sizeTo(comp.c, view.w, view.h);
    const list = composeFrame(map, book, state, view, tables, T);
    const g = comp.g;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = tone('void');
    g.fillRect(0, 0, view.w, view.h);
    const mw = map.w * T, mh = map.h * T;
    for (let cy = Math.floor(view.oy / CHUNK); cy * CHUNK < view.oy + view.h; cy++) {
      for (let cx = Math.floor(view.ox / CHUNK); cx * CHUNK < view.ox + view.w; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= mw || cy * CHUNK >= mh) continue;
        g.drawImage(chunk(cx, cy), cx * CHUNK - view.ox, cy * CHUNK - view.oy);
      }
    }
    for (const d of list.decals) blit(g, d, view);
    shadows(g, list, view);
    for (const d of list.sprites) { g.globalAlpha = d.alpha == null ? 1 : d.alpha; blit(g, d, view); }
    g.globalAlpha = 1;
    for (const d of list.raised) { g.globalAlpha = d.alpha; blit(g, d, view); }
    g.globalAlpha = 1;
    light(g, list, view, fv);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(comp.c, plan.dx, plan.dy, view.w * z, view.h * z);
    overlay(list, view, plan);
    msLast = win.performance.now() - t0;
    msAvg = frames ? msAvg * 0.9 + msLast * 0.1 : msLast;
    frames++;
    last = list;
  }

  return {
    mount(el) {
      host = el;
      canvas = doc.createElement('canvas');
      canvas.className = 'world-canvas';
      canvas.setAttribute('aria-label', 'The world');
      host.appendChild(canvas);
      ctx = canvas.getContext('2d');
      dirty = true;
      if (typeof win.ResizeObserver === 'function') { ro = new win.ResizeObserver(() => { dirty = true; }); ro.observe(host); }
      onResize = () => { dirty = true; };
      win.addEventListener('resize', onResize);
    },
    setMap(m) {
      map = m;
      ground = groundTiles(m, book, tables, T);
      chunks = new Map();
      last = null;
    },
    sync(state) { if (map && canvas) draw(state); },
    snapshot() {
      return {
        map: map && map.id, z, dpr, size: [W, H], frames, msAvg, msLast,
        heroBuilding: last ? last.heroBuilding : null,
        sprites: last ? last.sprites.length : 0,
        stubbed: last ? last.sprites.concat(last.raised).filter((d) => d.kind !== 'void' && !(d.set && images[d.set])).map((d) => d.id) : [],
        roofs: last ? last.roofs : [],
      };
    },
    destroy() {
      if (ro) ro.disconnect();
      if (onResize) win.removeEventListener('resize', onResize);
      if (canvas) canvas.remove();
      host = canvas = ctx = ro = onResize = map = last = ground = null;
      chunks = new Map();
    },
  };
}
