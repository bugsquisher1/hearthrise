// ════════════════════════════════════════════════════════════════════════
// src/world/render/canvas-backend.js — THE WORLD ON A 2D CANVAS.
//
// Interface { mount, setMap, sync, snapshot, destroy } — the same as
// null-backend.js, and both draw composeFrame()'s list, so what the node tests
// assert is what this paints.
//
// One frame:
//   1. compose at ART resolution (T = 32) on an offscreen canvas: baked ground
//      chunks (16x16 tiles each, baked once per map from the Wang overlays),
//      decals, the ONE shadow mask at --world-shadow-alpha, the y-sorted
//      sprites, canopies, roofs, then light (a multiplied ambient with additive
//      point lights; a vignette by day);
//   2. copy it to the screen in ONE nearest-neighbour drawImage at zoom z,
//      offset by the camera's whole-device-pixel remainder (core/camera.js);
//   3. draw the nameplates at SCREEN resolution so text stays crisp.
// Colours come from --world-* tokens through `css` (the caller's token reader).
// ════════════════════════════════════════════════════════════════════════
import { T } from '../core/grid.js?v=574';
import { zoomFor, frameView } from '../core/camera.js?v=574';
import { composeFrame } from '../core/compose.js?v=574';
import { wangLayers } from '../core/wang.js?v=574';
import { TERRAIN } from '../../data/world/terrain.js?v=574';

const CHUNK = 16 * T;

/**
 * @param {{win: Window, doc: Document, book: object, css: (token: string) => string}} o
 *   css('--world-void') → the token's current value
 */
export function createCanvasBackend(o) {
  const { win, doc, book, css } = o;
  const tone = (name) => css('--world-' + name);
  const layer = () => { const c = doc.createElement('canvas'); return { c, g: c.getContext('2d') }; };
  const comp = layer(), shade = layer(), lit = layer();
  let host = null, canvas = null, ctx = null, ro = null, onResize = null;
  let map = null, wang = [], chunks = new Map();
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

  function chunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = chunks.get(key);
    if (c) return c;
    c = doc.createElement('canvas');
    c.width = CHUNK; c.height = CHUNK;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (const t of wang) {
      const px = t.vx * T - T / 2, py = t.vy * T - T / 2;
      if (px >= x0 + CHUNK || py >= y0 + CHUNK || px + T <= x0 || py + T <= y0) continue;
      const f = book.frame('wang:' + t.id + ':' + t.idx, 'wang');
      g.drawImage(f.src, f.sx, f.sy, f.w, f.h, px - x0, py - y0, T, T);
    }
    chunks.set(key, c);
    return c;
  }

  function blit(g, d, view, cls) {
    const f = book.frame(d.sprite, cls);
    const crop = d.crop || 0;
    g.drawImage(f.src, f.sx, f.sy + crop, f.w, f.h - crop, d.x - view.ox, d.y - view.oy, f.w, f.h - crop);
  }

  function roof(g, r, view) {
    const f = book.frame(r.sprite, 'roof');
    const x = r.x - view.ox, y = r.y - view.oy;
    if (!f.nine) { g.drawImage(f.src, f.sx, f.sy, f.w, f.h, x, y, r.w, r.h); return; }
    const [l, t, rr, b] = f.nine;
    const cols = [[0, l, 0, l], [l, f.w - l - rr, l, r.w - l - rr], [f.w - rr, rr, r.w - rr, rr]];
    const rows = [[0, t, 0, t], [t, f.h - t - b, t, r.h - t - b], [f.h - b, b, r.h - b, b]];
    for (const [sx, sw, dx, dw] of cols) for (const [sy, sh, dy, dh] of rows) {
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) g.drawImage(f.src, f.sx + sx, f.sy + sy, sw, sh, x + dx, y + dy, dw, dh);
    }
  }

  function light(g, list, view, fv) {
    const { kind, points } = list.lights;
    if (kind === 'day') {
      const cx = fv.cam.x + W / z / 2 - view.ox, cy = fv.cam.y + H / z / 2 - view.oy;
      const rad = Math.max(W, H) / z * 0.75;
      const v = g.createRadialGradient(cx, cy, rad * 0.45, cx, cy, rad);
      v.addColorStop(0, 'transparent');
      v.addColorStop(1, tone('vignette'));
      g.fillStyle = v;
      g.fillRect(0, 0, view.w, view.h);
      return;
    }
    sizeTo(lit.c, view.w, view.h);
    const l = lit.g;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = tone('light-' + kind);
    l.fillRect(0, 0, view.w, view.h);
    l.globalCompositeOperation = 'lighter';
    for (const p of points) {
      const x = p.x - view.ox, y = p.y - view.oy;
      const grad = l.createRadialGradient(x, y, 0, x, y, p.r);
      grad.addColorStop(0, tone('light-' + p.tint));
      grad.addColorStop(1, 'transparent');
      l.fillStyle = grad;
      l.fillRect(x - p.r, y - p.r, 2 * p.r, 2 * p.r);
    }
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lit.c, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  function plates(list, view, plan) {
    if (!list.plates.length) return;
    const px = Math.round(12 * dpr);
    ctx.font = '700 ' + px + 'px ' + (css('--f-ui') || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const p of list.plates) {
      const sx = Math.round((p.x - view.ox) * z + plan.dx), sy = Math.round((p.y - view.oy) * z + plan.dy) - Math.round(4 * dpr);
      const w = Math.ceil(ctx.measureText(p.text).width) + Math.round(10 * dpr), h = px + Math.round(6 * dpr);
      ctx.fillStyle = tone('plate-bg');
      ctx.fillRect(sx - w / 2, sy - h, w, h);
      ctx.fillStyle = tone('plate-ink');
      ctx.fillText(p.text, sx, sy - Math.round(3 * dpr));
    }
  }

  function draw(state) {
    const t0 = win.performance.now();
    if (dirty) measure();
    const fv = frameView(state.hero, W / z, H / z, map, z, T);
    const { view, plan } = fv;
    sizeTo(comp.c, view.w, view.h);
    const list = composeFrame(map, book.geometry, state, view, T);
    const g = comp.g;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = tone('void');
    g.fillRect(0, 0, view.w, view.h);
    const mw = map.w * T + T, mh = map.h * T + T;
    for (let cy = Math.floor(view.oy / CHUNK); cy * CHUNK < view.oy + view.h; cy++) {
      for (let cx = Math.floor(view.ox / CHUNK); cx * CHUNK < view.ox + view.w; cx++) {
        if (cx * CHUNK >= mw || cy * CHUNK >= mh || (cx + 1) * CHUNK <= -T || (cy + 1) * CHUNK <= -T) continue;
        g.drawImage(chunk(cx, cy), cx * CHUNK - view.ox, cy * CHUNK - view.oy);
      }
    }
    for (const d of list.decals) blit(g, d, view, d.cls);
    sizeTo(shade.c, view.w, view.h);
    const s = shade.g;
    s.clearRect(0, 0, view.w, view.h);
    s.fillStyle = tone('shadow');
    for (const sh of list.shadows) {
      s.beginPath();
      if (sh.type === 'ellipse') s.ellipse(sh.cx - view.ox, sh.cy - view.oy, sh.w / 2, sh.h / 2, 0, 0, Math.PI * 2);
      else sh.pts.forEach(([x, y], i) => (i ? s.lineTo(x - view.ox, y - view.oy) : s.moveTo(x - view.ox, y - view.oy)));
      s.fill();
    }
    g.globalAlpha = parseFloat(tone('shadow-alpha')) || 0;
    g.drawImage(shade.c, 0, 0);
    g.globalAlpha = 1;
    for (const d of list.sprites) blit(g, d, view, d.cls);
    for (const c of list.canopies) { g.globalAlpha = c.alpha; blit(g, c, view, 'canopy'); }
    for (const r of list.roofs) { if (r.alpha > 0) { g.globalAlpha = r.alpha; roof(g, r, view); } }
    g.globalAlpha = 1;
    light(g, list, view, fv);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(comp.c, plan.dx, plan.dy, view.w * z, view.h * z);
    plates(list, view, plan);
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
      wang = wangLayers(m.ground, m.w, m.h, TERRAIN);
      chunks = new Map();
      last = null;
    },
    /** Real art arrived: re-bake the ground from it. */
    invalidate() { chunks = new Map(); },
    sync(state) { if (map && canvas) draw(state); },
    snapshot() {
      return {
        map: map && map.id, z, dpr, size: [W, H], frames, msAvg, msLast,
        heroBuilding: last ? last.heroBuilding : null,
        sprites: last ? last.sprites.length : 0,
        roofs: last ? last.roofs.map((r) => ({ id: r.id, alpha: r.alpha })) : [],
      };
    },
    destroy() {
      if (ro) ro.disconnect();
      if (onResize) win.removeEventListener('resize', onResize);
      if (canvas) canvas.remove();
      host = canvas = ctx = ro = onResize = map = last = null;
      chunks = new Map();
    },
  };
}
