// ════════════════════════════════════════════════════════════════════════
// tools/world-art/variety.mjs — ONE FLOOR TILE MADE INTO MANY (ART_DIRECTION section 5; Tyler 2026-11-16: the floors show
// their tile repeat). Built by build.mjs as a terrain of kind 'variety', picked per cell by src/world/core/ground-variety.js.
//
// From one locked, self-seamless floor tile, VARIETY_COUNT variants. None draws a colour of its own: every pixel is a pixel
// of the tile, one value step along its own ramp, or a pixel of a kept style-1 decal.
//   tone    the key's four corner bits. A toned corner pulls the tile toward its TONE state (soft: the colours above the
//           tile's median value step down, the highlights flatten; damp: that, and about a third of the body's pixels step
//           down too; or a map { '#from': '#to' } of palette colours: a mossy cobble's moss gone to its mortar) in a dithered field that is bilinear between the corners and wobbles only inside the tile. So an edge
//           whose two corners are plain is the base tile's edge pixel for pixel (no seam against a transition, a painted
//           wall or the plain tile), and a patch runs on across tiles.
//   shift   j 1..micro-1 of a noise-like floor (grass, dirt, ash, silt: `shift: true`): the tile's own texture, moved by a
//           seeded offset inside a ragged region 2+ px off the edges, so the same blades and pebbles no longer stand on
//           a 32 px grid. A structured floor (cobble, flags, planks) never shifts: a stone would be cut.
//   spot    j 1..micro-1 of a structured floor: one ragged patch in the tone state (or, `spots: 'both'`, every other one
//           in the lifted state: the shadows fill, a dry worn place), 3+ px off the edges
//   detail  j >= micro: one kept decal (a tuft, leaves, rubble: its first frame, locked by its own material), at a seeded
//           place 2+ px off the edges, never flipped (the light stays upper-left)
// Deterministic: the same base, options and decals are the same variants.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloneImage, crop, decodePNG } from './png.mjs';
import { lock } from './lock.mjs';
import { RAMPS } from './palette.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { VARIETY, vhash } from '../../src/world/core/ground-variety.js';

/* the ramps a step never moves: outlines, water and the accents (as lock.mjs shadeGround) */
const FIXED = Object.freeze(['shadow', 'torch', 'blood', 'frost', 'venom', 'gold', 'water']);
const hexAt = (d, i) => '#' + [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const lum = (h) => {
  const [r, g, b] = rgbOf(h).map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const u01 = (x, y, s) => vhash(x, y, s) / 4294967296;
/** Inside margin m of a T tile? */
const inside = (u, v, T, m) => u >= m && v >= m && u < T - m && v < T - m;

/* one step along its own ramp: hex -> hex (dir -1 down, +1 up), the FIXED ramps and a ramp's end staying */
function stepMap(dir) {
  const at = {};
  for (const [name, ramp] of Object.entries(RAMPS)) ramp.forEach((c, k) => { at[c] = FIXED.includes(name) ? c : ramp[Math.max(0, Math.min(ramp.length - 1, k + dir))]; });
  return at;
}
const DOWN = stepMap(-1), UP = stepMap(1);

/**
 * The tile's two states, each a recolour (hex, u, v) -> hex: `tone` (soft or damp, above) and `lift` (the colours below the
 * median step up). The median is by pixel count, so the colour that IS the floor (most of its pixels) never moves in soft.
 */
function statesOf(base, tone) {
  const seen = new Map();
  for (let i = 0; i < base.data.length; i += 4) { const h = hexAt(base.data, i); seen.set(h, (seen.get(h) || 0) + 1); }
  const byLum = [...seen.entries()].sort((x, y) => lum(x[0]) - lum(y[0]));
  let acc = 0, mid = 0;
  for (const [h, n] of byLum) { acc += n; if (acc >= base.data.length / 8) { mid = lum(h); break; } }
  const body = [...seen.entries()].sort((x, y) => y[1] - x[1])[0][0];
  const soft = (h) => (lum(h) > mid ? DOWN[h] || h : h);
  if (tone && typeof tone === 'object') {
    const map = Object.fromEntries(Object.entries(tone).map(([a, b]) => [a.toLowerCase(), b.toLowerCase()]));
    return { tone: (h) => map[h] || h, lift: (h) => (lum(h) < mid ? UP[h] || h : h) };
  }
  return {
    tone: tone === 'damp' ? (h, u, v, s) => (h === body && u01(u, v, s) < 0.35 ? DOWN[h] || h : soft(h)) : (h) => soft(h),
    lift: (h) => (lum(h) < mid ? UP[h] || h : h),
  };
}

/* smooth noise in a tile's own pixels (cell size `s` px), for the wobble of a patch's edge inside the tile */
function wobble(u, v, s, seed) {
  const fx = u / s + 0.5, fy = v / s + 0.5, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
  const sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
  return (u01(i, j, seed) * (1 - sa) + u01(i + 1, j, seed) * sa) * (1 - sb) + (u01(i, j + 1, seed) * (1 - sa) + u01(i + 1, j + 1, seed) * sa) * sb;
}

/** A kept decal's first frame, cropped to its opaque box and locked by its own material: 'set/id' under artDir. */
export function decalOf(root, artDir, ref) {
  const [set, id] = ref.split('/');
  const sc = JSON.parse(readFileSync(join(root, artDir, set, id + '.json'), 'utf8'));
  if (sc.class !== 'decal') throw new Error(`variety: ${ref} is class ${sc.class}, not a decal: only flat art lies in a floor`);
  const sheet = decodePNG(readFileSync(join(root, artDir, set, sc.source)));
  const [fw, fh] = sc.frame || [sheet.width, sheet.height];
  const f = lock(crop(sheet, 0, 0, fw, fh), sc.material || 'terrain');
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (f.data[(y * fw + x) * 4 + 3] >= ALPHA_CUT) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error(`variety: ${ref} is blank`);
  return crop(f, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/**
 * The VARIETY_COUNT variants of `base` (a locked, opaque, self-seamless T x T floor tile), laid as ground-variety.js reads
 * them (index = key * VARIETY.sub + j).
 *   o { seed, tone: 'soft' | 'damp' | { '#from': '#to' }, shift: bool, spots: 'down' | 'both', details: [img] (decalOf) }
 */
export function varietyTiles(base, o) {
  const T = base.width, seed = o.seed | 0, details = o.details || [];
  if (details.some((d) => d.width > T - 4 || d.height > T - 4)) throw new Error('variety: a detail is wider than the tile less its 2 px margins');
  const st = statesOf(base, o.tone);
  const at = (img, u, v) => hexAt(img.data, (v * T + u) * 4);
  const put = (img, u, v, h) => img.data.set(rgbOf(h), (v * T + u) * 4);
  const out = [];
  for (let key = 0; key < 16; key++) {
    const nw = (key >> 3) & 1, ne = (key >> 2) & 1, sw = (key >> 1) & 1, se = key & 1;
    for (let j = 0; j < VARIETY.sub; j++) {
      const img = cloneImage(base);
      const h = vhash(key, j, seed + 4099);
      const micro = j > 0 && j < VARIETY.micro;
      /* shift: the texture moved by (dx, dy) inside a ragged region round the middle */
      if (micro && o.shift) {
        const dx = 7 + (h % 19), dy = 7 + ((h >>> 5) % 19);
        for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
          if (!inside(u, v, T, 2)) continue;
          const e = 1 - ((u - 15.5) / 12.5) ** 2 - ((v - 15.5) / 12.5) ** 2 + 0.6 * (wobble(u, v, 5, seed * 71 + j) - 0.5);
          if (e > 0.12 + (u01(u, v, seed * 389 + j) - 0.5) * 0.3) put(img, u, v, at(base, (u + dx) % T, (v + dy) % T));
        }
      }
      /* a spot (a structured floor): a ragged patch, an ellipse 5-9 by 4-7 px torn by noise, its edge dithered */
      if (micro && !o.shift) {
        const lifted = o.spots === 'both' && j % 2 === 0;
        const cx = 10 + (h % 12), cy = 10 + ((h >>> 5) % 12), rx = 5 + ((h >>> 10) % 5), ry = 4 + ((h >>> 14) % 4);
        for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
          if (!inside(u, v, T, 3)) continue;
          const e = 1 - ((u - cx) / rx) ** 2 - ((v - cy) / ry) ** 2 + 0.7 * (wobble(u, v, 4, seed * 53 + key * 7 + j) - 0.5);
          if (e > 0.2 + (u01(u, v, seed * 389 + key * 5 + j) - 0.5) * 0.3) put(img, u, v, lifted ? st.lift(at(img, u, v)) : st.tone(at(img, u, v), u, v, seed));
        }
      }
      /* tone: the corners' field, wobbled inside the tile only (the sin window is zero on every edge), dithered at its edge */
      if (key) {
        for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
          const fu = (u + 0.5) / T, fv = (v + 0.5) / T;
          const bil = nw * (1 - fu) * (1 - fv) + ne * fu * (1 - fv) + sw * (1 - fu) * fv + se * fu * fv;
          const m = bil + 0.55 * Math.sin(Math.PI * fu) * Math.sin(Math.PI * fv) * (2 * wobble(u, v, 7, seed * 31 + j) - 1);
          if (m > 0.5 + (u01(u, v, seed * 977 + key * 13 + j) - 0.5) * 0.24) put(img, u, v, st.tone(at(img, u, v), u, v, seed));
        }
      }
      /* a detail: one decal, drawn over, wholly 2+ px inside the edges */
      if (j >= VARIETY.micro && details.length) {
        const d = details[(j - VARIETY.micro + key) % details.length];
        const x0 = 2 + (h % (T - 4 - d.width + 1)), y0 = 2 + ((h >>> 8) % (T - 4 - d.height + 1));
        for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
          const s = (y * d.width + x) * 4;
          if (d.data[s + 3] >= ALPHA_CUT) img.data.set([d.data[s], d.data[s + 1], d.data[s + 2], 255], ((y0 + y) * T + x0 + x) * 4);
        }
      }
      out.push(img);
    }
  }
  return out;
}
