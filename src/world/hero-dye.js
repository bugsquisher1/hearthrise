// ════════════════════════════════════════════════════════════════════════
// src/world/hero-dye.js — HEROES IN THEIR COLORS, FOR EVERYONE WHO SEES THEM (lane/c-hero-colors).
//
// A hero's colors are four dye INDICES the server holds (player_outfits.base_colors; the key "head.body.legs.feet",
// src/data/outfits.js dyeKeyOf). A dye's colour is the token --dye-N, so no client colour value ever crosses to another player.
// A LOOK is one outfit in one set of colors: every frame of its sprite (the `hunt` atlas), recoloured where its mask
// (`hunt-masks`, tools/world-art/outfit-masks.mjs) keys a region: each pixel keeps its value and takes the dye's hue and
// saturation, so the shading stays (dyeRamp, recolourPixels). Two sets that differ only in a region this outfit doesn't show are the
// same look (a knight has no legs to dye), so they share a sheet.
//
// THE COST, AND ITS BOUNDS (Tyler ranks performance first; measured on the real game, lane/c-hero-colors' perf pass):
//   memory   a sheet holds an outfit's frames and nothing else: 56 x 64 x 64 x 4 bytes = 0.92 MB, 21 MB at the cap. Each outfit in use keeps its source pixels once more
//            (0.92 MB, at most 7: 6.4 MB), so a bake copies them rather than reading a canvas back. The masks' image is 6.9 MB decoded.
//   time     at most ONE bake per frame (pump): about 1.2 ms, at worst 2.3 ms, on a desktop core. A look not ready draws undyed for that frame, never a stub and never a wait.
//   first load  nothing: the masks load on the first dyed hero in view (MASK_SET is not in ATLAS_SETS), and only then.
// THE CAP IS AN LRU THAT NEVER FIGHTS THE SCREEN: only a look not drawn for STALE_MS may be evicted. With DYE_LOOKS on screen a 25th look
// draws undyed rather than evict one someone is looking at (evicting per frame would re-bake forever). The hero you play is the one exception: yours
// takes the slot of the least recently drawn other look, because you just paid for it.
//
// A frame's use: want(...) for every dyed unit it will draw, pump(), then source(...) while painting. PURE of globals: the document, the tokens and the clock are handed in.
// ════════════════════════════════════════════════════════════════════════
import { BASE_REGIONS, MASK_COLOURS } from '../data/outfits.js?v=0.2.99';
import { loadAtlasSet } from './atlas.js?v=0.2.99';

/** How many dyed looks stay in memory: past this, heroes draw undyed. */
export const DYE_LOOKS = 24;
/** A look not drawn for this long may give up its place. */
export const STALE_MS = 3000;
const MASK_SET = 'hunt-masks';
const COLS = 8;
const ALPHA_OPAQUE = 128;

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16) || 0);
function hueSat(r8, g8, b8) {
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx];
}
function hsv(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c, i = Math.floor(h / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** One dye as a lookup: a pixel of value V (0..255) becomes [ramp[3V], ramp[3V + 1], ramp[3V + 2]]. Pure. */
export function dyeRamp(hex) {
  const [h, s, dv] = hueSat(...hexRgb(hex));
  const ramp = new Uint8ClampedArray(768);
  for (let v = 0; v < 256; v++) {
    const [r, g, b] = hsv(h, s, (v / 255) * (0.4 + 0.6 * dv));
    ramp[3 * v] = r; ramp[3 * v + 1] = g; ramp[3 * v + 2] = b;
  }
  return ramp;
}

/** Which region a mask pixel keys (an index into BASE_REGIONS), or -1. Pure. */
export function regionOfKey(r, g, b, a) {
  if (a < ALPHA_OPAQUE) return -1;
  for (let i = 0; i < MASK_COLOURS.length; i++) {
    const k = MASK_COLOURS[i];
    if (Math.abs(r - k[0]) < 8 && Math.abs(g - k[1]) < 8 && Math.abs(b - k[2]) < 8) return i;
  }
  return -1;
}

/**
 * Recolour RGBA pixels in place by region. PURE over arrays.
 * @param {Uint8ClampedArray|number[]} px    the sprite's RGBA
 * @param {Uint8ClampedArray|number[]} mask  the mask's RGBA, same size
 * @param {(string|null)[]} dyes             per BASE_REGIONS index: '#rrggbb' or null (left as drawn)
 */
export function recolourPixels(px, mask, dyes) {
  const ramps = dyes.map((hex) => (hex ? dyeRamp(hex) : null));
  if (!ramps.some(Boolean)) return px;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const ramp = ramps[regionOfKey(mask[i], mask[i + 1], mask[i + 2], mask[i + 3])];
    if (!ramp) continue;
    const v = Math.max(px[i], px[i + 1], px[i + 2]) * 3;
    px[i] = ramp[v]; px[i + 1] = ramp[v + 1]; px[i + 2] = ramp[v + 2];
  }
  return px;
}

/** The masks, loaded once per page on first need: Promise<{ manifest, image }>. */
let MASKS = null;
export function loadMasks(doc, version) {
  if (!MASKS) MASKS = loadAtlasSet({ doc, version }, MASK_SET).catch((e) => { MASKS = null; throw e; });
  return MASKS;
}

/**
 * THE PAGE'S DYED LOOKS, ONE PER DOCUMENT: a World pane is remounted on every switch of the viewed character, and a look baked for it stays good.
 * @param {{doc: Document, version: string}} o
 */
const PAGES = new WeakMap();
export function heroDyeOf(o) {
  let d = PAGES.get(o.doc);
  if (!d) PAGES.set(o.doc, d = createHeroDye(o));
  return d;
}

/**
 * @param {{doc: Document, version: string, css?: (token: string) => string, now?: () => number,
 *          masks?: () => Promise<{manifest: object, image: object}>, cap?: number}} o   css, now, masks, cap: a test's own
 */
export function createHeroDye(o) {
  const now = o.now || (() => o.doc.defaultView.performance.now());
  const cap = o.cap || DYE_LOOKS;
  const getMasks = o.masks || (() => loadMasks(o.doc, o.version));
  const css = o.css || ((t) => o.doc.defaultView.getComputedStyle(o.doc.documentElement).getPropertyValue(t));
  const hexes = new Map();
  let masks = null, asked = false, failed = false;
  /* sprite id -> its source (below), or null when the art has no mask (the druid draws undyed, and costs nothing) */
  const sources = new Map();
  /* every baked look: `<sprite>|<look key>` -> { canvas, at, own, id, key } */
  const looks = new Map();
  /* sprite id -> set key -> look key, so a frame never rebuilds a string */
  const keyOf = new Map();
  let queue = [];
  const queued = new Set();
  const stats = { bakes: 0, evicted: 0, refused: 0, bakeMs: 0, bakeMaxMs: 0 };
  /* A dye's colour, from its token: a walker's index that names no token is left as drawn. */
  const hexOf = (i) => {
    if (!hexes.has(i)) { const v = String(css('--dye-' + i) || '').trim(); hexes.set(i, /^#[0-9a-f]{6}$/i.test(v) ? v : null); }
    return hexes.get(i);
  };
  const out = { img: null, sx: 0, sy: 0 };

  /* AN OUTFIT'S SOURCE, once: its frames laid out in a compact sheet, their pixels and every masked pixel's offset and region. */
  function sourceOf(id, row, image) {
    if (sources.has(id)) return sources.get(id);
    const m = masks.manifest.sprites[id + '_mask'];
    if (!m) { sources.set(id, null); return null; }
    const [fw, fh] = row.frame;
    const cells = new Map();
    const pairs = [];
    for (const [anim, clip] of Object.entries(row.anims)) {
      for (const [dir, list] of Object.entries(clip.dirs)) {
        const ml = m.anims[anim] && m.anims[anim].dirs[dir];
        list.forEach(([sx, sy], i) => {
          const k = sx * 65536 + sy;
          if (cells.has(k)) return;
          const n = cells.size;
          cells.set(k, [(n % COLS) * fw, Math.floor(n / COLS) * fh]);
          pairs.push({ sx, sy, dx: (n % COLS) * fw, dy: Math.floor(n / COLS) * fh, mask: ml && ml[i] });
        });
      }
    }
    const W = COLS * fw, H = Math.ceil(cells.size / COLS) * fh;
    const scratch = o.doc.createElement('canvas');
    scratch.width = W; scratch.height = H;
    const g = scratch.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    for (const p of pairs) g.drawImage(image, p.sx, p.sy, fw, fh, p.dx, p.dy, fw, fh);
    const px = g.getImageData(0, 0, W, H).data;
    g.clearRect(0, 0, W, H);
    for (const p of pairs) if (p.mask) g.drawImage(masks.image, p.mask[0], p.mask[1], fw, fh, p.dx, p.dy, fw, fh);
    const mk = g.getImageData(0, 0, W, H).data;
    const shows = new Set();
    const offs = [], regs = [];
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const r = regionOfKey(mk[i], mk[i + 1], mk[i + 2], mk[i + 3]);
      if (r < 0) continue;
      offs.push(i); regs.push(r); shows.add(r);
    }
    scratch.width = scratch.height = 0;
    const s = { id, W, H, px, cells, shows, offs: Int32Array.from(offs), regs: Uint8Array.from(regs) };
    sources.set(id, s);
    return s;
  }

  /* The key of a set on this outfit: only the regions its art shows, so a knight's legs never split a look. */
  function lookKey(id, s, key) {
    let m = keyOf.get(id);
    if (!m) keyOf.set(id, m = new Map());
    let k = m.get(key);
    if (k === undefined) {
      const parts = key.split('.');
      k = id + '|' + BASE_REGIONS.map((_, i) => (s.shows.has(i) ? parts[i] : '-')).join('.');
      m.set(key, k);
    }
    return k;
  }

  let scratchCtx = null;
  const scratchContext = () => {
    if (!scratchCtx) { const c = o.doc.createElement('canvas'); c.width = c.height = 1; scratchCtx = c.getContext('2d'); }
    return scratchCtx;
  };
  const canvasOf = (img) => {
    const c = o.doc.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  };
  const free = (l) => { if (l.img && l.img.close) l.img.close(); else if (l.img) l.img.width = 0; l.img = null; };

  function bake(s, id, key, own, k) {
    const t0 = now();
    const parts = key.split('.');
    const ramps = BASE_REGIONS.map((_, i) => { const hex = s.shows.has(i) ? hexOf(Number(parts[i])) : null; return hex ? dyeRamp(hex) : null; });
    const img = scratchContext().createImageData(s.W, s.H);
    const data = img.data;
    data.set(s.px);
    for (let n = 0; n < s.offs.length; n++) {
      const ramp = ramps[s.regs[n]];
      if (!ramp) continue;
      const i = s.offs[n];
      const v = Math.max(data[i], data[i + 1], data[i + 2]) * 3;
      data[i] = ramp[v]; data[i + 1] = ramp[v + 1]; data[i + 2] = ramp[v + 2];
    }
    const look = { img: null, w: s.W, h: s.H, at: now(), own, id, key };
    looks.set(k, look);
    /* A BITMAP WHERE THE BROWSER HAS ONE: one immutable copy, no canvas or context behind it, freed the moment it is closed, and the cheapest thing to draw from. */
    const win = o.doc.defaultView;
    if (win && typeof win.createImageBitmap === 'function') {
      win.createImageBitmap(img).then((b) => { if (looks.get(k) === look) look.img = b; else b.close(); },
        () => { if (looks.get(k) === look) look.img = canvasOf(img); });
    } else look.img = canvasOf(img);
    const ms = now() - t0;
    stats.bakes++; stats.bakeMs += ms; stats.bakeMaxMs = Math.max(stats.bakeMaxMs, ms);
  }

  /* A place for one more look. False: every look is on screen, and this one stays undyed. */
  function roomFor(own) {
    if (looks.size < cap) return true;
    const t = now();
    let oldest = null, forced = null;
    for (const [k, l] of looks) {
      if (t - l.at >= STALE_MS && (!oldest || l.at < looks.get(oldest).at)) oldest = k;
      if (!l.own && (!forced || l.at < looks.get(forced).at)) forced = k;
    }
    const gone = oldest || (own ? forced : null);
    if (!gone) { stats.refused++; return false; }
    free(looks.get(gone));
    looks.delete(gone);
    stats.evicted++;
    return true;
  }

  return {
    /** This frame will draw sprite `id` in colors `key` (`row`: its manifest row; `image`: its atlas; `own`: the hero you play). */
    want(id, key, own, row, image) {
      if (failed || !key) return;
      if (!masks) {
        if (!asked) {
          asked = true;
          getMasks().then((m) => { masks = m; }, (e) => { failed = true; console.warn('[world] the color masks did not load; heroes draw undyed', e && e.message); });
        }
        return;
      }
      if (!row || !image || !row.frame || !row.anims) return;
      const s = sourceOf(id, row, image);
      if (!s) return;
      const k = lookKey(id, s, key);
      const l = looks.get(k);
      if (l) { l.at = now(); l.own = own; return; }
      if (queued.has(k)) return;
      queued.add(k);
      queue.push({ s, id, key, own, k });
    },
    /** Bake at most one wanted look (the hero you play first). True when one landed: the next paint draws it. */
    pump() {
      if (!queue.length) return false;
      const i = Math.max(0, queue.findIndex((q) => q.own));
      const q = queue[i];
      queue.splice(i, 1);
      queued.delete(q.k);
      if (!roomFor(q.own)) return false;
      bake(q.s, q.id, q.key, q.own, q.k);
      return true;
    },
    /** Is this look ready to draw? (A paint's signature reads it: a look landing changes the picture.) */
    has(id, key) {
      const s = sources.get(id);
      const l = s ? looks.get(lookKey(id, s, key)) : null;
      return !!l && !!l.img;
    },
    /** Where to blit this frame from, or null when the look isn't baked: draw undyed. The answer is reused: read it at once. */
    source(id, key, sx, sy) {
      const s = sources.get(id);
      if (!s) return null;
      const l = looks.get(lookKey(id, s, key));
      const c = l && l.img && s.cells.get(sx * 65536 + sy);
      if (!c) return null;
      out.img = l.img; out.sx = c[0]; out.sy = c[1];
      return out;
    },
    /** A test's and the perf pass's view of the cost. */
    stats: () => {
      let bytes = 0;
      for (const l of looks.values()) bytes += l.w * l.h * 4;
      let srcBytes = 0;
      for (const s of sources.values()) if (s) srcBytes += s.px.length + s.offs.byteLength + s.regs.byteLength;
      return { looks: looks.size, queued: queue.length, sheetBytes: bytes, sourceBytes: srcBytes, ...stats };
    },
    destroy() {
      for (const l of looks.values()) free(l);
      looks.clear(); sources.clear(); keyOf.clear(); queue = []; queued.clear();
    },
  };
}
