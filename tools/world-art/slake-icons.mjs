#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// tools/world-art/slake-icons.mjs — THE SLAKE'S FOUR ICONS (AND THE FORD'S TOLL TOKEN), DRAWN BY HAND
// (lane a-import-slake-art, 2026-11-10; no generation: the brief's ~20 gens for them were never spent).
//
// green_rivet    a domed copper rivet gone green, on a short shaft
// barge_nail     a long iron barge nail with a flat head, one rust-green streak
// mudlark_hook   the Mudlark's short iron boathook, a bent point, green at the tip
// color_cord     the Banded Company's twisted red-and-bone cord in a loop, its two tassels hanging
// toll_token     Hask's Ford's toll: a round bronze disc with a square hole and a stamped band
//
// Each is a stroke or a disc per feature (lit from the upper left, one tone step lit and one shadow), then the
// set's outline: 1 px #0b0a0c, 4-neighbour. Every colour is an entry of hr-world-56-v2 (art/world/palette.json),
// binary alpha, 32x32, shapes held in 75-94% of the cell like the set's other icons.
//
//   node tools/world-art/slake-icons.mjs            write the five PNGs into assets/icons-bundle/pixel/items/
//   node tools/world-art/slake-icons.mjs --print    print the grids, write nothing
//   node tools/world-art/slake-icons.mjs --check    fail when a file differs from what the script draws
// ═══════════════════════════════════════════════════════════
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const K = '#0b0a0c';
/* ramps (palette.json): light -> dark */
const COPPER = ['#cfa25c', '#a8743a', '#7a4f26', '#4a2e18'];
const GREEN = ['#c8e6e0', '#86b4b4', '#4f7a80', '#2e4a52'];
const IRON = ['#969aa1', '#6e727a', '#4a4d54', '#2c2e33'];
const RED = ['#c23a2a', '#8e1f1f', '#5e1a1f', '#3e1216'];
const BONE = ['#e6dcbc', '#c9bfa0', '#a88457', '#6e4c30'];
const BRONZE = ['#e8c547', '#cfa25c', '#a8743a', '#7a4f26'];

const grid = () => Array.from({ length: 32 }, () => Array(32).fill(null));
/** A stroke from (x0, y0) to (x1, y1), `w` px wide: tone 0 on the lit (upper-left) edge, the last on the shadow edge. */
function stroke(g, [x0, y0], [x1, y1], w, ramp) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  /* the normal pointing down-right is the shadow side */
  let nx = -dy / len, ny = dx / len;
  if (nx + ny < 0) { nx = -nx; ny = -ny; }
  for (let i = 0; i <= n; i++) {
    const cx = x0 + (dx * i) / n, cy = y0 + (dy * i) / n;
    for (let k = 0; k < w; k++) {
      const o = k - (w - 1) / 2;
      const x = Math.round(cx + nx * o), y = Math.round(cy + ny * o);
      if (x < 0 || y < 0 || x > 31 || y > 31) continue;
      const tone = w === 1 ? 1 : Math.min(ramp.length - 1, Math.round((k / (w - 1)) * (ramp.length - 2)));
      g[y][x] = ramp[tone];
    }
  }
}
/** A disc (or an ellipse) at (cx, cy): the lit rim to the upper left, the shadow to the lower right. */
function disc(g, cx, cy, rx, ry, ramp) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1.0) continue;
    const lit = (-u - v) / 1.4;          // -1 (shadow) .. 1 (lit)
    const tone = lit > 0.45 ? 0 : lit > -0.05 ? 1 : lit > -0.55 ? 2 : 3;
    g[y][x] = ramp[Math.min(tone, ramp.length - 1)];
  }
}
const put = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < 32 && y < 32) g[y][x] = c; };
const clear = (g, x, y) => put(g, x, y, null);

/** Wrap the interior in the set's 4-neighbour outline. */
function outline(g) {
  const o = grid();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g[y][x]) { o[y][x] = g[y][x]; continue; }
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx])) o[y][x] = K;
  }
  return o;
}

export const DRAW = {
  green_rivet(g) {
    stroke(g, [12, 14], [23, 25], 5, COPPER);                 // the shaft, down to the right
    stroke(g, [22, 23], [24, 25], 5, COPPER);
    disc(g, 10, 11, 6.2, 5.6, COPPER);                         // the domed head
    disc(g, 9, 10, 3.2, 2.8, COPPER);
    /* verdigris crust: the head's lower rim and the shaft's lower half */
    for (const [x, y, c] of [[13, 15, 2], [14, 14, 1], [15, 13, 2], [13, 16, 1], [12, 16, 2], [6, 14, 2], [7, 15, 1], [8, 16, 2], [9, 16, 1], [11, 16, 2],
      [16, 18, 1], [17, 18, 2], [16, 17, 2], [15, 17, 1], [17, 17, 1], [18, 19, 1], [19, 19, 2], [17, 19, 2], [18, 20, 1], [19, 21, 2], [20, 22, 1], [21, 23, 1], [16, 19, 2], [18, 21, 2], [20, 23, 2], [19, 20, 1], [15, 16, 1], [14, 17, 2], [11, 8, 0], [10, 7, 0]]) put(g, x, y, GREEN[c]);
    put(g, 8, 9, COPPER[0]); put(g, 9, 9, COPPER[0]);
  },
  barge_nail(g) {
    stroke(g, [10, 10], [25, 25], 3, IRON);                    // the long shank
    stroke(g, [24, 25], [26, 27], 1, IRON);                    // the point
    stroke(g, [4, 13], [13, 4], 4, IRON);                      // the flat head, across the shank's top
    stroke(g, [5, 12], [12, 5], 1, IRON.map((_, i) => IRON[Math.max(0, i - 1)]));
    for (const [x, y, c] of [[15, 15, 2], [16, 17, 1], [17, 18, 2], [18, 18, 1], [19, 20, 2], [14, 15, 1], [20, 21, 1]]) put(g, x, y, GREEN[c]);
    put(g, 11, 9, IRON[0]); put(g, 8, 8, IRON[0]); put(g, 7, 9, IRON[0]); put(g, 12, 10, IRON[0]); put(g, 10, 11, IRON[1]);
  },
  mudlark_hook(g) {
    stroke(g, [5, 26], [19, 10], 3, IRON);                     // the pole's iron socket and shaft, up to the right
    stroke(g, [19, 10], [24, 6], 3, IRON);
    stroke(g, [24, 6], [26, 11], 3, IRON);                     // the hook's belly bends back down
    stroke(g, [26, 11], [22, 15], 3, IRON);
    stroke(g, [22, 15], [20, 15], 2, IRON);                    // and its point turns in toward the shaft
    /* the wooden grip: copper-brown bands at the foot */
    stroke(g, [4, 27], [9, 22], 3, COPPER);
    for (const [x, y, c] of [[20, 16, 1], [21, 16, 2], [22, 15, 0], [21, 15, 1], [23, 14, 1], [25, 9, 2], [26, 10, 1], [24, 7, 1], [20, 11, 2], [16, 13, 1], [15, 14, 2]]) put(g, x, y, GREEN[c]);
    put(g, 20, 9, IRON[0]); put(g, 22, 7, IRON[0]); put(g, 25, 6, IRON[0]); put(g, 10, 20, IRON[0]); put(g, 12, 18, IRON[0]);
  },
  color_cord(g) {
    /* a loop of twisted cord, red and bone, with a knot at the bottom and two tassels */
    const ring = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; ring.push([Math.round(16 + Math.cos(a) * 8.5), Math.round(12 + Math.sin(a) * 7.5)]); }
    ring.forEach(([x, y], i) => { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) put(g, x + dx, y + dy, i % 6 < 3 ? RED[i % 6 === 0 ? 0 : 1] : BONE[i % 6 === 3 ? 0 : 1]); });
    ring.forEach(([x, y], i) => { if (i % 6 === 5) put(g, x + 1, y + 1, RED[2]); });
    disc(g, 16, 20, 3.2, 2.6, RED);                           // the knot
    stroke(g, [14, 22], [12, 28], 3, RED);                     // the tassels
    stroke(g, [18, 22], [20, 28], 3, BONE);
    for (let t = 0; t < 3; t++) { put(g, 11 + t, 28, RED[1 + (t % 2)]); put(g, 19 + t, 28, BONE[1 + (t % 2)]); }
    for (const y of [24, 25]) { put(g, y === 24 ? 13 : 12, y, RED[3]); put(g, y === 24 ? 19 : 19, y, BONE[2]); }
  },
  toll_token(g) {
    disc(g, 16, 16, 10.6, 10.6, BRONZE);
    /* the stamped rim: one darker ring a pixel in */
    for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; const x = Math.round(16 + Math.cos(t) * 8.6), y = Math.round(16 + Math.sin(t) * 8.6); put(g, x, y, (-Math.cos(t) - Math.sin(t)) > 0.3 ? BRONZE[0] : BRONZE[3]); }
    /* the square hole, and a band across the disc's face (the Banded Company's stamp) */
    for (let y = 13; y <= 18; y++) for (let x = 13; x <= 18; x++) clear(g, x, y);
    for (let x = 8; x <= 23; x++) for (const y of [8, 9]) if (g[y][x] && Math.abs(x - 16) < 8) put(g, x, y, BRONZE[3]);
    for (let x = 8; x <= 23; x++) for (const y of [23]) if (g[y][x] && Math.abs(x - 16) < 8) put(g, x, y, BRONZE[3]);
  },
};

export function toImage(grid32) {
  const img = createImage(32, 32);
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = grid32[y][x];
    if (!c) continue;
    const [r, gg, b] = rgb(c), i = (y * 32 + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  return img;
}
export function drawn(id) { const g = grid(); DRAW[id](g); return outline(g); }

if (isMain(import.meta.url)) {
  const arg = process.argv[2];
  let red = 0;
  for (const id of Object.keys(DRAW)) {
    const g = drawn(id), png = Buffer.from(encodePNG(toImage(g))), file = join(DIR, id + '.png');
    if (arg === '--print') { console.log(id); console.log(g.map((r) => r.map((c) => (c ? (c === K ? '#' : '+') : '.')).join('')).join('\n')); continue; }
    if (arg === '--check') { if (!existsSync(file) || !readFileSync(file).equals(png)) { console.log('  x ' + id + '.png differs from what slake-icons.mjs draws'); red++; } continue; }
    writeFileSync(file, png);
    console.log('  wrote ' + id + '.png');
  }
  if (arg === '--check') { console.log(red ? 'slake-icons: RED' : 'slake-icons: green'); process.exit(red ? 1 : 0); }
}
