// ════════════════════════════════════════════════════════════════════════
// tools/world-art/ground-finish.mjs — WEAR ON A PAINTED GROUND (lane/b-march-floors; ART_DIRECTION §5: "wear is authored, not
// tiled: decals at least one per 12 floor tiles, never on a grid, never two of the same in a row").
//
// A ground painted from one fill tile per material repeats that tile every 32 px: the Slake's silt showed its chevron in rows, the
// Hold's courts and the Pyre's ash read as one stamp. Two passes over the paint break it, neither drawing a pixel of its own:
//   stepPatches  inside soft blobs of value noise, every pixel of a listed colour becomes another palette colour (one step down its
//                ramp, or the green of a silt wave back to the silt): damp, soot, bare patches. The blob's edge is a per-pixel
//                hash dither, so it is never a tile seam and never a regular pattern.
//   bakeDecals   kept style-1 decals (cracks, puddles, soot, bones: each sprite's first frame, locked by its own material) laid on
//                a jittered grid of cells, each one wholly on the floors it is listed for and never the id its neighbours drew.
// Both are deterministic (a seed per ground), so an import is repeatable. The painted ground stays on hr-world-56-v2.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, crop } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { lock } from './lock.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';

const T = 32;
/** A hash of two integers and a seed into [0, 1). */
export function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1): three octaves on a lattice of `scale` px, each on its own rotated grid (one axis-aligned lattice
    draws its blobs' edges along the lattice lines: the Slake's first patches had straight seams). */
export function noise(x, y, scale, seed) {
  const oct = (s, sd, a) => {
    const c = Math.cos(a), n = Math.sin(a);
    const fx = (x * c - y * n) / s + 0.37 * sd, fy = (x * n + y * c) / s - 0.21 * sd, i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const p = hash2(i, j, sd), q = hash2(i + 1, j, sd), r = hash2(i, j + 1, sd), t = hash2(i + 1, j + 1, sd);
    return (p * (1 - su) + q * su) * (1 - sv) + (r * (1 - su) + t * su) * sv;
  };
  return oct(scale, seed, 0.52) * 0.6 + oct(scale / 2.3, seed + 7, 1.31) * 0.28 + oct(scale / 5.1, seed + 13, 2.07) * 0.12;
}

const hexOf = (d, p) => '#' + [0, 1, 2].map((k) => d[p + k].toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));

/**
 * Remap listed colours inside noise blobs, on the cells `on(ch)` accepts (ch = the cell's character in `rows`).
 *   o { rows, on, scale (px), cut (0-1: higher = fewer, smaller blobs), seed, map: { '#from': '#to' }, band = 0.06 }
 * Returns the number of pixels changed.
 */
export function stepPatches(img, o) {
  const { rows, on, scale, cut, seed, band = 0.06 } = o;
  const map = Object.fromEntries(Object.entries(o.map).map(([a, b]) => [a.toLowerCase(), rgbOf(b)]));
  const h = rows.length, w = rows[0].length;
  let n = 0;
  for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
    const cx = Math.floor(px / T), cy = Math.floor(py / T);
    if (cx >= w || cy >= h || !on(rows[cy][cx], cx, cy)) continue;
    const p = (py * img.width + px) * 4;
    const to = map[hexOf(img.data, p)];
    if (!to) continue;
    if (noise(px, py, scale, seed) <= cut + (hash2(px, py, seed + 3) - 0.5) * band) continue;
    img.data.set(to, p);
    n++;
  }
  return n;
}

/** A kept sprite's first frame, locked by its sidecar's material: set/id -> image. */
function decalImage(ref) {
  const [set, id] = ref.split('/');
  const sc = JSON.parse(readFileSync(join(ROOT, ART_DIR, set, id + '.json'), 'utf8'));
  if (sc.class !== 'decal') throw new Error(ref + ' is class ' + sc.class + ', not a decal: only flat art is baked into a floor');
  const sheet = decodePNG(readFileSync(join(ROOT, ART_DIR, set, sc.source)));
  const [fw, fh] = sc.frame || [sheet.width, sheet.height];
  return lock(crop(sheet, 0, 0, fw, fh), sc.material || 'terrain');
}

/**
 * Lay decals on a jittered grid of `every` x `every` cells (one per cell at most, so about one per every^2 floor tiles).
 *   o { rows, seed, every, decals: { ch: ['set/id', ...] } (the floors each list may lie on), skip?: (cx, cy) => bool }
 * A decal lies only where every opaque pixel falls on a cell of ITS floor character (a cobble decal never spills onto a wall or the
 * flagstone), and never shows the id the cell to its west or north drew. Returns [{ id, x, y }] in art px (its top-left).
 */
export function bakeDecals(img, o) {
  const { rows, seed, every, decals, skip } = o;
  const h = rows.length, w = rows[0].length;
  const cache = new Map();
  const imgOf = (ref) => { if (!cache.has(ref)) cache.set(ref, decalImage(ref)); return cache.get(ref); };
  const gw = Math.ceil(w / every), gh = Math.ceil(h / every);
  const drew = new Array(gw * gh).fill(null), laid = [];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const near = [gx > 0 ? drew[gy * gw + gx - 1] : null, gy > 0 ? drew[(gy - 1) * gw + gx] : null, gx > 0 && gy > 0 ? drew[(gy - 1) * gw + gx - 1] : null];
    /* a few tries a cell: a random point in it, the floor under it, a decal of that floor's list the neighbours did not draw */
    for (let t = 0; t < 6; t++) {
      const r = (k) => hash2(gx * 31 + t, gy * 17 + k, seed);
      const px = Math.floor((gx * every + r(1) * every) * T), py = Math.floor((gy * every + r(2) * every) * T);
      const cx = Math.floor(px / T), cy = Math.floor(py / T);
      if (cx >= w || cy >= h) continue;
      const ch = rows[cy][cx], list = decals[ch];
      if (!list || (skip && skip(cx, cy))) continue;
      const pool = list.filter((ref) => !near.includes(ref));
      if (!pool.length) continue;
      const ref = pool[Math.floor(r(3) * pool.length)], d = imgOf(ref);
      const x0 = px - (d.width >> 1), y0 = py - (d.height >> 1);
      let fits = x0 >= 0 && y0 >= 0 && x0 + d.width <= img.width && y0 + d.height <= img.height;
      for (let y = 0; fits && y < d.height; y++) for (let x = 0; x < d.width; x++) {
        if (d.data[(y * d.width + x) * 4 + 3] < ALPHA_CUT) continue;
        const qx = Math.floor((x0 + x) / T), qy = Math.floor((y0 + y) / T);
        if (rows[qy][qx] !== ch || (skip && skip(qx, qy))) { fits = false; break; }
      }
      if (!fits) continue;
      for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
        const s = (y * d.width + x) * 4;
        if (d.data[s + 3] >= ALPHA_CUT) img.data.set([d.data[s], d.data[s + 1], d.data[s + 2], 255], ((y0 + y) * img.width + x0 + x) * 4);
      }
      drew[gy * gw + gx] = ref;
      laid.push({ id: ref, x: x0, y: y0 });
      break;
    }
  }
  return laid;
}
