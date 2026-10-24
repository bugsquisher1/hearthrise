#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/longbow-icon.mjs — THE LONGBOW'S PIXEL ICON, DRAWN BY HAND
// (lane a-longbow-icon, 2026-10-24; player feedback a43: "String Longbow sprite looks more like a
// larger crossbow").
//
// The old longbow.png was a thick diagonal limb across a grey stock: a crossbow silhouette. A longbow
// is a TALL SINGLE STAVE and a STRING and nothing else: no stock, no prod, no tiller, no bolt. This
// script draws it from the stave's own left/right edges per row, so the shape is data and the shading
// is a rule, not a re-colour of the old file:
//   - STAVE: one curve, convex to the left, leaning a little to the right at the top like the set's
//     swords and staves (tip to the upper right). Per row, the first stave pixel is the lit edge
//     (upper left), the last is the shadow edge; the middle steps follow the stave's width.
//   - GRIP: five rows of bronze leather wrap, alternating light and dark, at the stave's belly.
//   - NOCKS: a bone cap at each tip, where the string ends.
//   - STRING: one pale 1 px line, a straight stair-step (runs of three) from nock to nock. It has
//     its own dark outline on both sides, so it never fuses with the stave.
//   - OUTLINE: 1 px #0b0a0c, 4-neighbour (corners cut), exactly as the rest of pixel/items.
// Every colour is a palette entry of hr-world-56-v2 (art/world/palette.json), binary alpha, 32x32.
//
//   node tools/world-art/longbow-icon.mjs            write assets/icons-bundle/pixel/items/longbow.png
//   node tools/world-art/longbow-icon.mjs --print    print the grid, write nothing
//   node tools/world-art/longbow-icon.mjs --out <p>  write somewhere else (a preview)
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items', 'longbow.png');

/* Palette entries (all in hr-world-56-v2). Wood is the `earth` ramp; leather is `bronze`; the string and nocks are `bone`. */
export const COLOURS = Object.freeze({
  K: '#0b0a0c',                                   // outline (shadow ramp)
  6: '#c49a5c', 5: '#a88457', 4: '#8a6440', 3: '#6e4c30', 2: '#553a26',   // the stave, lit -> shadow
  h: '#a8743a', g: '#7a4f26', G: '#4a2e18',       // leather wrap: light, mid, dark
  n: '#c9bfa0', N: '#e6dcbc',                     // bone: nock caps and the string
  s: '#e6dcbc', t: '#c9bfa0',                     // string: lit, shaded
});

/* The stave per row: [row, leftmost x, rightmost x]. The top tip is at the upper right, the bottom tip lower left. */
export const STAVE = Object.freeze([
  [3, 19, 20], [4, 17, 19], [5, 16, 18], [6, 15, 17], [7, 14, 16], [8, 13, 15], [9, 12, 14], [10, 11, 13],
  [11, 11, 13], [12, 10, 12], [13, 10, 12], [14, 10, 12], [15, 10, 12], [16, 10, 12], [17, 10, 11], [18, 10, 11],
  [19, 10, 11], [20, 11, 12], [21, 11, 12], [22, 11, 12], [23, 12, 13], [24, 12, 13], [25, 12, 13], [26, 13, 13], [27, 13, 13],
]);
/* The string: [x, first row, last row]. Runs of three, one step left each run. */
export const STRING = Object.freeze([[22, 3, 5], [21, 6, 8], [20, 9, 11], [19, 12, 14], [18, 15, 17], [17, 18, 20], [16, 21, 23], [15, 24, 26], [14, 27, 28]]);
/* The leather grip: rows over the stave's belly, light/dark alternating. */
export const GRIP_ROWS = Object.freeze([12, 13, 14, 15, 16]);
/* Bone nock caps [x, y, colour]. */
export const NOCKS = Object.freeze([[21, 2, 'N'], [22, 2, 'n'], [21, 3, 'n'], [13, 28, 'n'], [14, 28, 'n']]);

/** The interior grid (no outline): 32 rows of 32 chars, '.' empty. */
export function drawInterior() {
  const g = Array.from({ length: 32 }, () => Array(32).fill('.'));
  for (const [y, a, b] of STAVE) {
    const w = b - a + 1;
    const ramp = w === 1 ? ['5'] : w === 2 ? ['6', '3'] : w === 3 ? ['6', '5', '3'] : ['6', '5', '3', '2'];
    for (let i = 0; i < w; i++) g[y][a + i] = ramp[i];
    if (GRIP_ROWS.includes(y)) {
      const light = (y - GRIP_ROWS[0]) % 2 === 0;
      for (let i = 0; i < w; i++) g[y][a + i] = light ? (i === w - 1 ? 'g' : 'h') : (i === w - 1 ? 'G' : 'g');
    }
  }
  for (const [x, a, b] of STRING) for (let y = a; y <= b; y++) g[y][x] = 's';
  for (const [x, y, c] of NOCKS) g[y][x] = c;
  return g;
}

/** The finished grid: the interior plus a 4-neighbour 1 px outline. */
export function drawGrid() {
  const g = drawInterior();
  const out = g.map((r) => r.slice());
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g[y][x] !== '.') continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 32 && ny < 32 && g[ny][nx] !== '.') { out[y][x] = 'K'; break; }
    }
  }
  return out;
}

export function toImage(grid) {
  const img = createImage(32, 32);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === '.') return;
    const c = COLOURS[ch];
    if (!c) throw new Error('no colour for ' + ch);
    const o = (y * 32 + x) * 4;
    [img.data[o], img.data[o + 1], img.data[o + 2]] = rgb(c);
    img.data[o + 3] = 255;
  }));
  return img;
}

function main() {
  const grid = drawGrid();
  if (process.argv.includes('--print')) { grid.forEach((r, y) => console.log(String(y).padStart(2, '0') + ' ' + r.join(''))); return; }
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : DEFAULT_OUT;
  writeFileSync(out, encodePNG(toImage(grid)));
  console.log('wrote ' + out);
}

if (isMain(import.meta.url)) main();
