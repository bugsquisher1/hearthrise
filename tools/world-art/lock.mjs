// tools/world-art/lock.mjs — grade a sprite by its material class, then snap every
// pixel to the locked world palette (art/world/palette.json).
//
// Grade = saturation multiplier then value multiplier (GRADE[material]); snap =
// nearest palette colour in CIE Lab with lightness weighted 1.3 (value reads before
// hue at a ×3 zoom). Alpha is cut at ALPHA_CUT: the world's art has no partial alpha.
// Pure and deterministic: the same pixels and palette give the same output, which is
// what lets build.mjs --check compare a rebuild against the committed atlas.
import { GRADE, ALPHA_CUT } from '../../src/data/world/palette.js';
import { PALETTE, RAMPS } from './palette.mjs';
import { createImage } from './png.mjs';

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const u = i / 255; LIN[i] = u > 0.04045 ? Math.pow((u + 0.055) / 1.055, 2.4) : u / 12.92; }
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.9505;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.089;
  return [116 * fLab(y) - 16, 500 * (fLab(x) - fLab(y)), 200 * (fLab(y) - fLab(z))];
}
const PAL_RGB = PALETTE.map(hexRgb);
const PAL_LAB = PAL_RGB.map(([r, g, b]) => lab(r, g, b));
const PAL_KEYS = new Set(PAL_RGB.map(([r, g, b]) => (r << 16) | (g << 8) | b));

/** True when (r,g,b) is exactly a palette colour. */
export function inPalette(r, g, b) {
  return PAL_KEYS.has((r << 16) | (g << 8) | b);
}

/** Index of the nearest palette colour to (r,g,b). Ties go to the earlier ramp colour. */
export function nearest(r, g, b) {
  const [L, A, B] = lab(r, g, b);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < PAL_LAB.length; i++) {
    const p = PAL_LAB[i];
    const d = Math.round(((L - p[0]) ** 2 * 1.3 + (A - p[1]) ** 2 + (B - p[2]) ** 2) * 1e6);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// HLS saturation scale (and an optional hue turn, in degrees), the model the v3
// mockups were graded in.
function grade(r, g, b, sat, dk, hue = 0) {
  if (sat !== 1 || hue) {
    const R = r / 255, G = g / 255, B = b / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      let s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      let h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
      h = (h / 6 + hue / 360 + 1) % 1; s = Math.min(1, s * sat);
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const ch = (t) => { t = t < 0 ? t + 1 : t > 1 ? t - 1 : t; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      r = Math.round(ch(h + 1 / 3) * 255); g = Math.round(ch(h) * 255); b = Math.round(ch(h - 1 / 3) * 255);
    }
  }
  return [Math.min(255, Math.floor(r * dk)), Math.min(255, Math.floor(g * dk)), Math.min(255, Math.floor(b * dk))];
}

/**
 * Snap to a chosen subset of the palette (hex colours) with lock's own metric. The plain lock
 * measured a dun-brown rat onto the stone ramp: a warm grey is nearest a grey, and every rat came
 * out the Giant Rat's charcoal. A creature whose hue is its identity is snapped to its own ramps
 * first and declared `material: native`, which the lock then leaves alone.
 */
export function snapTo(img, colours) {
  const rgb = colours.map(hexRgb), labs = rgb.map(([r, g, b]) => lab(r, g, b));
  const out = createImage(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < ALPHA_CUT) continue;
    const [L, A, B] = lab(img.data[i], img.data[i + 1], img.data[i + 2]);
    let best = 0, bestD = Infinity;
    labs.forEach((p, k) => { const d = (L - p[0]) ** 2 * 1.3 + (A - p[1]) ** 2 + (B - p[2]) ** 2; if (d < bestD) { bestD = d; best = k; } });
    out.data[i] = rgb[best][0]; out.data[i + 1] = rgb[best][1]; out.data[i + 2] = rgb[best][2]; out.data[i + 3] = 255;
  }
  return out;
}

/**
 * One value step up its own ramp, `steps` times, for every body pixel of an on-palette image (ART_DIRECTION section 4: a
 * body on a dark floor lifts up its ramp, never to another hue). The silhouette's edge, the shadow ramp and the accents
 * (a Drain Rat's orange teeth stay orange) keep their value.
 */
const UNLIFTED = Object.freeze(['shadow', 'torch', 'blood', 'frost', 'venom', 'gold']);
export function liftBody(img, steps) {
  const at = {};
  for (const [name, ramp] of Object.entries(RAMPS)) ramp.forEach((c, k) => { at[c] = UNLIFTED.includes(name) ? c : ramp[Math.min(ramp.length - 1, k + steps)]; });
  const out = createImage(img.width, img.height);
  const on = (x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] >= ALPHA_CUT;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!on(x, y)) continue;
    const i = (y * img.width + x) * 4;
    const hex = '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join('');
    const c = on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1) ? hexRgb(at[hex]) : [img.data[i], img.data[i + 1], img.data[i + 2]];
    out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
  }
  return out;
}

/** Grade by material class and snap to the palette. Returns a new image. */
export function lock(img, material) {
  const gr = GRADE[material];
  if (!gr) throw new Error(`unknown material class "${material}" — add it to GRADE in src/data/world/palette.js`);
  const out = createImage(img.width, img.height);
  const cache = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < ALPHA_CUT) continue;
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    let c = cache.get(key);
    if (c === undefined) {
      const [r, g, b] = grade(img.data[i], img.data[i + 1], img.data[i + 2], gr.sat, gr.dk, gr.hue || 0);
      c = PAL_RGB[nearest(r, g, b)];
      cache.set(key, c);
    }
    out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
  }
  return out;
}
