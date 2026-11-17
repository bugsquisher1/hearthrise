// tools/world-art/restyle.mjs — a sidecar's `restyle`: whole-pixel repaints on the palette, applied by the build after the lock
// (build.mjs lockOf, before a `lift`), so a sprite drawn in another hand meets the dominant style and its source stays the drawing
// (lane/a-style-fix 2026-11-16: the whole-world style audit, tools/world-art/style-audit.mjs; ART_DIRECTION sections 2 and 4).
// A frame is restyled on its own pixels only: nothing moves, nothing is added outside the shape, no colour leaves the palette.
//
//   restyle: { map?: { "#from": "#to", ... }, step?: { <ramp>: n, ... }, clamp?: { <ramp>: [lo, hi], ... },
//              outline?: true | { seams: "ns" } }
//     map      one palette colour for another, for a colour the lock snapped onto the wrong ramp (a pale grain gone steel blue).
//     step     every pixel of that ramp n whole steps along it (negative = darker, held at its ends): a prop's planks moved onto
//              the buildings' timber, a body or a decal toned toward the floor it lies on.
//     clamp    every pixel of that ramp held to steps lo..hi: the speckle of a too-busy drawing (its top and bottom steps) folded
//              into the steps beside them, the contrast a calmer neighbour has.
//     outline  every RIM pixel (opaque, with a side on transparency or the frame's edge) still lighter than a line takes the
//              world's line: #0b0a0c, or the darkest leaf #16241a on foliage (leaf, moss) as the buildings ring their own grass.
//              A pixel one wide (a strand, a chip) takes its own ramp's darkest step instead when that reads as a line.
//              "Lighter than a line" is luma 60 and up, the style audit's own outline cut. A slice of a longer strip (a palisade run)
//              names its `seams`: the frame edges (n, s, e, w) where the strip goes on into the next slice, which are no rim.
// Order: map, then step, then clamp, on every pixel but the rim when `outline` is set (the rim is the line's, read before any op).
// The shadow ramp is the line itself: no op moves it or maps onto or off it. An op touches only the ramps it names.
import { RAMPS } from './palette.mjs';
import { createImage } from './png.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';

export const LINE = '#0b0a0c';
export const LEAF_LINE = '#16241a';
export const LINE_LUMA = 60;
const FOLIAGE = Object.freeze(['leaf', 'moss']);
const OPS = Object.freeze(['map', 'step', 'clamp', 'outline']);

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOf = (d, i) => '#' + [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('');
const lumaOf = (h) => { const [r, g, b] = hexRgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };
const PLACE = {};
for (const [name, ramp] of Object.entries(RAMPS)) ramp.forEach((c, k) => { PLACE[c] = { name, k }; });

/** What is wrong with a `restyle` spec (strings; empty = sound). */
export function restyleProblems(spec) {
  const out = [];
  if (!spec || typeof spec !== 'object') return ['restyle is not an object'];
  for (const k of Object.keys(spec)) if (!OPS.includes(k)) out.push('restyle has an unknown op ' + k);
  for (const [a, b] of Object.entries(spec.map || {})) {
    if (!PLACE[a] || !PLACE[b]) out.push(`restyle.map ${a} -> ${b} leaves the palette`);
    else if (PLACE[a].name === 'shadow' || PLACE[b].name === 'shadow') out.push(`restyle.map ${a} -> ${b} moves the line (the shadow ramp)`);
  }
  for (const [r, n] of Object.entries(spec.step || {})) {
    if (!RAMPS[r]) out.push('restyle.step names no ramp ' + r);
    else if (r === 'shadow') out.push('restyle.step moves the line (the shadow ramp)');
    else if (!Number.isInteger(n) || !n) out.push('restyle.step.' + r + ' is not a whole number of steps');
  }
  for (const [r, lh] of Object.entries(spec.clamp || {})) {
    if (!RAMPS[r]) out.push('restyle.clamp names no ramp ' + r);
    else if (r === 'shadow') out.push('restyle.clamp moves the line (the shadow ramp)');
    else if (!Array.isArray(lh) || lh.length !== 2 || !lh.every(Number.isInteger) || lh[0] < 0 || lh[1] >= RAMPS[r].length || lh[0] > lh[1]) out.push('restyle.clamp.' + r + ' is not [lo, hi] inside its ramp');
  }
  const o = spec.outline;
  if (o !== undefined && o !== true && !(o && typeof o === 'object' && Object.keys(o).join() === 'seams' && /^[nsew]{1,4}$/.test(o.seams))) out.push('restyle.outline is not true or { seams: "nsew" }');
  return out;
}

/** `img` (one locked frame) restyled by `spec`. Pure: a new image. */
export function restyle(img, spec) {
  const bad = restyleProblems(spec);
  if (bad.length) throw new Error(bad.join('; '));
  const { width: w, height: h } = img;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] >= ALPHA_CUT;
  /* off the frame on a seam is the next slice of the strip: opaque for the rim test */
  const seams = (spec.outline && spec.outline.seams) || '';
  const off = (x, y) => (y < 0 && seams.includes('n')) || (y >= h && seams.includes('s')) || (x < 0 && seams.includes('w')) || (x >= w && seams.includes('e'));
  const solid = (x, y) => on(x, y) || off(x, y);
  const map = spec.map || {}, step = spec.step || {}, clamp = spec.clamp || {};
  const out = createImage(w, h);
  out.data.set(img.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const i = (y * w + x) * 4, hex = hexOf(img.data, i);
    const rim = !(solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1));
    let c = hex;
    if (rim && spec.outline) {
      /* a pixel one wide (open on both sides of an axis: a blade, a strand, a chip) is all rim: it keeps its own ramp's darkest
         step when that reads as a line, so a strand of net or a wood chip darkens instead of turning into a black dot */
      const at = PLACE[hex], own = at && RAMPS[at.name][0];
      const thin = (!solid(x - 1, y) && !solid(x + 1, y)) || (!solid(x, y - 1) && !solid(x, y + 1));
      if (lumaOf(hex) >= LINE_LUMA) c = at && FOLIAGE.includes(at.name) ? LEAF_LINE : thin && own && lumaOf(own) < LINE_LUMA ? own : LINE;
    } else {
      c = map[c] || c;
      const at = PLACE[c];
      if (at && (step[at.name] || clamp[at.name])) {
        const ramp = RAMPS[at.name], lh = clamp[at.name];
        let k = Math.max(0, Math.min(ramp.length - 1, at.k + (step[at.name] || 0)));
        if (lh) k = Math.max(lh[0], Math.min(lh[1], k));
        c = ramp[k];
      }
    }
    if (c !== hex) out.data.set(hexRgb(c), i);
  }
  return out;
}
