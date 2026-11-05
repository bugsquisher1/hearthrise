#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/twin-icons.mjs — ITEMS THAT WORE ANOTHER ITEM'S PICTURE GET THEIR OWN, DRAWN BY RULE
// (lane a-art-batch-0, 2026-11-04; art audit gap 2, the free sample of about five, CLAUDE.md section 10).
//
// Each icon's shape is data and its shading a rule, as in longbow-icon.mjs, and each is drawn from the item's own
// flavour line (src/data/shields.js, item-descriptions.js), not from the picture it wore:
//   bronze_rimmed_shield  "a plank round with a hammered bronze rim": dark planks, a bright dented rim and bronze
//                         boss, so it stands apart from the Practice Shield's pale boards and grey iron at the bag's 1x.
//   kingsgrate            "the Rat King's drain grate, bent into a buckler": a barred iron square with a crown's three
//                         teeth on it, a bronze boss where the bars cross, the sewer's rust and slime, gold rivets
//                         and tooth tips because it is the rare. Not a round.
//   iron_hatchets         a pair of real axe heads, bearded, in the iron ramp, on darker wrapped hafts. The practice
//                         pair's pale stone fans keep their own look.
//   oak_crossbow          a thick iron prod with a loaded bolt on a stout oak stock, where the practice one is a thin
//                         bronze line on a stick.
//   crown_shard           "a sliver of the Rat King's crown": a snapped piece of its ring on the diagonal, three gilt
//                         points, the crown's dark lining and beads, raw drain-grate iron where it broke. Beside the
//                         crown it reads as a piece of that crown; the crown itself keeps the crown.
//
// Every colour is an entry of hr-world-56-v2 (art/world/palette.json), binary alpha, 32x32, a 1 px #0b0a0c outline
// with its corners cut, lit from the upper left. tests/pixel-icons.mjs rule `drawn` holds the files to this script:
// edit the script and rerun it, never the PNG.
//
//   node tools/world-art/twin-icons.mjs            write assets/icons-bundle/pixel/items/<id>.png
//   node tools/world-art/twin-icons.mjs --out <d>  write to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');

const K = '#0b0a0c', VOID = '#17141a', SOOT = '#231d1f';
const EARTH = ['#2a1c14', '#3d2a1d', '#553a26', '#6e4c30', '#8a6440', '#a88457', '#c49a5c'];
const BRONZE = ['#4a2e18', '#7a4f26', '#a8743a', '#cfa25c'];
const IRON = ['#2c2e33', '#4a4d54', '#6e727a', '#969aa1'];
const STEEL_HI = '#c4ccd2', BONE = '#c9bfa0', BONE_HI = '#e6dcbc', GOLD = '#e8c547', TORCH_HI = '#ffd36a';
const MOSS = ['#4a5a2a', '#6b7a38'], BLOOD = '#8e1f1f', BLOOD_HI = '#c23a2a', CLOTH = '#3e1216';

const blank = () => Array.from({ length: 32 }, () => Array(32).fill(null));
const put = (g, x, y, c) => { if (x >= 0 && x < 32 && y >= 0 && y < 32) g[y][x] = c; };

/** The set's outline: every empty pixel 4-touching art turns #0b0a0c, so corners stay cut. */
function outlined(g) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g[y][x]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = g[y + dy] && g[y + dy][x + dx];
      if (c) { out[y][x] = K; break; }
    }
  }
  return out;
}

/** True when the pixel centre (x, y) is inside the polygon (even-odd). */
function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function fill(g, pts, fn) {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (inside(pts, x, y)) { const c = fn(x, y); if (c) g[y][x] = c; }
}

function bronzeRimmedShield() {
  const g = blank();
  const cx = 15.5, cy = 15.5, R = 13.2;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r > R) continue;
    const lit = -(dx + dy) / (Math.SQRT2 * Math.max(r, 0.01));              // +1 upper left, -1 lower right
    if (r > 9.9) {                                                         // the rim, dented in hammer-wide steps
      const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) * 180 / Math.PI) / 24);
      const base = lit > 0.5 ? 3 : lit > -0.3 ? 2 : 1;
      const dent = seg % 2 === 1 && r > 11.2 ? 1 : 0;
      g[y][x] = BRONZE[Math.max(0, base - dent)];
      if (r > 12.3 && lit > 0.2 && seg % 2 === 0) g[y][x] = BRONZE[3];
      if (r > 12.3 && lit < -0.4) g[y][x] = BRONZE[0];
    } else if (r > 9) {                                                    // the rim's dark seat on the planks
      g[y][x] = EARTH[0];
    } else if (r < 3.7) {                                                  // the boss
      g[y][x] = r > 2.9 ? BRONZE[0] : lit > 0.25 ? BRONZE[3] : lit > -0.45 ? BRONZE[2] : BRONZE[1];
    } else {                                                               // four boards, a seam between each
      const board = Math.floor((x - 3) / 6.5);
      const onSeam = [9, 15, 22].includes(x);
      if (onSeam) { g[y][x] = EARTH[0]; continue; }
      const step = (board % 2 ? 2 : 3) + (lit > 0.45 ? 1 : lit < -0.45 ? -1 : 0);
      const firstCol = [10, 16, 23].includes(x) || x === 4;
      g[y][x] = EARTH[Math.max(1, firstCol ? step + 1 : step)];
    }
  }
  // the boss's glint, the grain, and the rim's rivets
  put(g, 14, 14, TORCH_HI);
  for (const [x, y, c] of [[6, 12, 1], [7, 18, 1], [12, 8, 2], [12, 19, 1], [13, 24, 1], [19, 9, 2], [19, 22, 1], [25, 15, 1], [25, 20, 1], [20, 14, 1]]) put(g, x, y, EARTH[c]);
  for (const a of [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]) {
    const x = Math.round(cx + Math.cos(a * Math.PI / 180) * 11.2), y = Math.round(cy + Math.sin(a * Math.PI / 180) * 11.2);
    put(g, x, y, a > 180 && a < 270 ? GOLD : BRONZE[3]);
    put(g, x + 1, y + 1, BRONZE[0]);
  }
  return outlined(g);
}

function kingsgrate() {
  const g = blank();
  // the mask per row, [first x, last x]: a square bent into a buckler, corners cut
  const spans = { 8: [6, 25], 9: [5, 26], 10: [4, 27], 25: [4, 27], 26: [4, 27], 27: [5, 26], 28: [6, 25], 29: [7, 24] };
  for (let y = 11; y <= 24; y++) spans[y] = [3, 28];
  for (const [y, [a, b]] of Object.entries(spans)) for (let x = a; x <= b; x++) g[y][x] = IRON[2];
  // the crown's three teeth stand on its top edge: the Rat King's own iron
  for (const [y, runs] of Object.entries({ 2: [[15, 16]], 3: [[8, 8], [15, 16], [23, 23]], 4: [[8, 9], [14, 17], [22, 23]], 5: [[7, 9], [14, 17], [22, 24]], 6: [[7, 10], [13, 18], [21, 24]], 7: [[6, 10], [13, 18], [21, 25]] })) {
    for (const [a, b] of runs) for (let x = a; x <= b; x++) g[y][x] = IRON[2];
  }
  // the bevel: a lit edge up and left, a dark one down and right, the plate falling away from the light between
  const solid = g.map((r) => r.map(Boolean));
  const on = (x, y) => solid[y] && solid[y][x];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!solid[y][x]) continue;
    if (!on(x - 1, y) || !on(x, y - 1)) g[y][x] = IRON[3];
    else if (!on(x + 1, y) || !on(x, y + 1)) g[y][x] = IRON[0];
    else g[y][x] = x + y < 26 ? IRON[2] : x + y < 40 ? IRON[1] : IRON[0];
  }
  // the openings: four bays in two tiers, black behind the bars
  for (const [ya, yb] of [[11, 16], [19, 25]]) for (const [xa, xb] of [[6, 9], [12, 14], [17, 19], [22, 25]]) for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) g[y][x] = y === ya ? K : VOID;
  // each bar lit on its left, shaded on its right; the cross bar lit on top
  for (const x of [10, 15, 20]) for (let y = 11; y <= 25; y++) { g[y][x] = IRON[3]; g[y][x + 1] = IRON[1]; }
  for (let x = 6; x <= 25; x++) { g[17][x] = IRON[3]; g[18][x] = IRON[1]; }
  // the sewer: rust running down from each joint, slime along the foot
  for (const [x, y, c] of [[10, 19, 2], [10, 20, 1], [11, 20, 1], [10, 21, 1], [20, 19, 2], [20, 20, 1], [21, 21, 1], [15, 11, 1], [15, 12, 2], [15, 13, 1], [5, 12, 1], [5, 13, 2], [5, 14, 1], [27, 19, 1], [27, 20, 0], [4, 21, 2], [4, 22, 1]]) put(g, x, y, BRONZE[c]);
  for (const [x, y, c] of [[8, 27, 1], [9, 27, 0], [10, 28, 1], [11, 28, 0], [13, 27, 1], [14, 28, 1], [18, 28, 0], [19, 27, 1], [20, 27, 0], [23, 27, 0], [6, 26, 1], [7, 27, 0]]) put(g, x, y, MOSS[c]);
  // a bronze boss where the bars cross: a grate that became a shield. Gold rivets and tooth tips: the rare
  for (let y = 16; y <= 19; y++) for (let x = 14; x <= 17; x++) g[y][x] = (x + y < 33) ? BRONZE[3] : (x + y < 35) ? BRONZE[2] : BRONZE[0];
  put(g, 14, 16, BRONZE[1]); put(g, 17, 16, BRONZE[1]); put(g, 14, 19, BRONZE[1]); put(g, 17, 19, BRONZE[0]); put(g, 15, 17, GOLD);
  for (const [x, y] of [[6, 10], [25, 10], [6, 26], [25, 26]]) { put(g, x, y, GOLD); put(g, x + 1, y + 1, BRONZE[0]); }
  for (const [x, y, c] of [[15, 2, TORCH_HI], [16, 2, GOLD], [15, 3, GOLD], [16, 3, BRONZE[3]], [8, 3, TORCH_HI], [8, 4, GOLD], [9, 4, BRONZE[3]], [23, 3, GOLD], [23, 4, BRONZE[3]], [22, 4, GOLD]]) put(g, x, y, c);
  return outlined(g);
}

function ironHatchets() {
  const g = blank();
  /** One hatchet: the haft down `y = x + 3`, the head at its top with the bearded blade towards the outside. `flip` mirrors it. */
  const paint = (flip) => {
    const X = (x) => (flip ? 31 - x : x);
    for (let i = 0; i < 21; i++) {
      const x = 6 + i, y = 9 + i;
      const wrap = i > 13 && i < 20;
      put(g, X(x), y, wrap ? (i % 2 ? BRONZE[0] : BRONZE[1]) : EARTH[flip ? 4 : 5]);
      put(g, X(x + 1), y, wrap ? BRONZE[0] : EARTH[3]);
      put(g, X(x), y + 1, wrap ? (i % 2 ? BRONZE[1] : BRONZE[0]) : EARTH[2]);
    }
    for (const [x, y, c] of [[26, 29, 3], [27, 29, 2], [26, 30, 1], [27, 30, 1]]) put(g, X(x), y, IRON[c]);
    // the head: a bearded blade, its cutting edge towards the lower left
    const blade = [[10, 3], [12.5, 5.5], [11.5, 8], [13, 9.5], [10.5, 12], [8.5, 11], [7, 13], [6.5, 19], [3.5, 18], [2, 15], [1.5, 11], [2.5, 7], [4.5, 4.5], [7, 6.5]];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (!inside(blade, x, y)) continue;
      const edge = x + (y - 13) * -0.25 < 4.1;                             // the honed edge, one bright band
      const up = y - x;                                                    // large = towards the beard
      let c = up > 10 ? IRON[1] : up > 3 ? IRON[2] : IRON[3];
      if (edge) c = STEEL_HI;
      if (x > 7 && y > 8) c = IRON[1];                                     // the eye's collar
      put(g, X(x), y, c);
    }
    for (const [x, y, c] of [[10, 7, IRON[0]], [9, 8, IRON[0]], [10, 8, IRON[1]], [8, 9, IRON[0]], [6, 8, IRON[2]], [5, 10, IRON[1]], [6, 13, IRON[1]], [11, 5, IRON[3]]]) put(g, X(x), y, c);
  };
  paint(true);
  paint(false);
  // a thong binds the pair where they cross, as the practice pair's does
  for (const [x, y, c] of [[15, 18, BLOOD], [16, 18, BLOOD_HI], [15, 19, BLOOD], [16, 19, BLOOD]]) put(g, x, y, c);
  return outlined(g);
}

function oakCrossbow() {
  const g = blank();
  // the string first: it runs behind everything, from each nock to the nut
  const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) put(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); };
  line(5, 16, 14, 21, BONE); line(26, 16, 17, 21, BONE);
  // the prod: a thick arc of iron, tips swept back
  const Y = (x) => 8 + Math.pow(Math.abs(x - 15.5) / 13, 2.1) * 8.5;
  for (let x = 2; x <= 29; x++) {
    const top = Math.round(Y(x)), far = Math.abs(x - 15.5), th = far < 6 ? 4 : far < 11 ? 3 : 2;
    for (let k = 0; k < th; k++) put(g, x, top + k, k === 0 ? (x < 16 ? IRON[3] : IRON[2]) : k === th - 1 ? IRON[0] : (k === 1 ? IRON[2] : IRON[1]));
  }
  for (const [x, y] of [[2, 15], [3, 15], [2, 16], [3, 16], [28, 15], [29, 15], [28, 16], [29, 16]]) put(g, x, y, BONE_HI);
  // the stirrup above the prod
  for (const [x, y] of [[13, 3], [14, 2], [15, 2], [16, 2], [17, 2], [18, 3], [13, 4], [18, 4], [13, 5], [18, 5], [13, 6], [18, 6]]) put(g, x, y, x < 15 ? IRON[3] : IRON[2]);
  // the stock: oak in its own browns, a four-wide fore and a butt that widens
  const half = (y) => (y < 20 ? 2 : y < 24 ? 3 : 4);
  for (let y = 6; y <= 29; y++) {
    const h = half(y), L = 16 - h, R = 15 + h;
    for (let x = L; x <= R; x++) g[y][x] = x === L ? EARTH[5] : x === R ? EARTH[2] : x === R - 1 ? EARTH[3] : EARTH[4];
  }
  // the groove, dark, and the bolt lying in it: a one-pixel shaft, a steel head, a pale fletch
  for (let y = 6; y <= 19; y++) { put(g, 15, y, BONE); put(g, 16, y, EARTH[1]); }
  for (const [x, y, c] of [[15, 3, STEEL_HI], [16, 3, IRON[2]], [15, 4, STEEL_HI], [16, 4, IRON[1]], [15, 5, IRON[3]], [16, 5, EARTH[1]], [14, 18, BONE_HI], [15, 18, BONE_HI], [14, 19, BONE], [15, 19, BONE_HI]]) put(g, x, y, c);
  // the iron collars where prod meets stock, the nut, the grain and the butt plate
  for (const y of [7, 12]) for (let x = 13; x <= 18; x++) put(g, x, y, x < 15 ? IRON[3] : x > 16 ? IRON[1] : IRON[2]);
  for (let x = 13; x <= 18; x++) put(g, x, 20, x < 15 ? IRON[2] : IRON[1]);
  for (const [x, y] of [[14, 22], [14, 23], [16, 24], [16, 25], [16, 26], [14, 26], [14, 27], [18, 26], [18, 27]]) put(g, x, y, EARTH[3]);
  for (let x = 12; x <= 19; x++) put(g, x, 29, x < 15 ? IRON[2] : IRON[1]);
  // the trigger under the stock
  for (const [x, y, c] of [[19, 21, IRON[2]], [20, 22, IRON[2]], [20, 23, IRON[1]]]) put(g, x, y, c);
  return outlined(g);
}

function crownShard() {
  const g = blank();
  // a sliver of the crown's ring, on the diagonal: the arc sags towards the lower right, as the near side of a crown does
  const A = [3, 27], B = [28, 13], SAG = 3;
  const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
  const nx = dy / len, ny = -dx / len;                                     // the normal, towards the upper left, the way the points stand
  const P = (t) => [A[0] + dx * t - nx * SAG * Math.sin(Math.PI * t), A[1] + dy * t - ny * SAG * Math.sin(Math.PI * t)];
  // the three points first, so the band's trim laps over their feet: dark metal, a lit left edge, gilt tips, as the crown's are
  const POINTS = [[0.2, 12, 2.4], [0.5, 16, 2.9], [0.8, 11, 2.4]];
  for (const [t, h, base] of POINTS) {
    const [px, py] = P(t);
    const tip = [px + nx * h, py + ny * h];
    const ux = dx / len, uy = dy / len;
    const tri = [[px - ux * base, py - uy * base], tip, [px + ux * base, py + uy * base]];
    const wide = (x, y) => base * Math.hypot(x - tip[0], y - tip[1]) / h;  // the point's half-width at this pixel
    fill(g, tri, (x, y) => {
      const along = (x - tip[0]) * ux + (y - tip[1]) * uy;                 // across the point: negative is its lit, left facet
      const fromTip = Math.hypot(x - tip[0], y - tip[1]);
      if (fromTip < 2.2) return TORCH_HI;
      if (fromTip < 4.4) return GOLD;
      if (along < -wide(x, y) + 1.05) return BRONZE[3];
      return along < 0.5 ? BRONZE[1] : BRONZE[0];
    });
  }
  // the band: snapped raggedly at both ends, gilt along its top edge, the crown's dark lining below it
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let best = 99, bt = 0, bd = 0;
    for (let i = 0; i <= 120; i++) { const t = i / 120, [px, py] = P(t), d = Math.hypot(x - px, y - py); if (d < best) { best = d; bt = t; bd = (x - px) * nx + (y - py) * ny; } }
    if (best > 3.1) continue;
    const rag = 0.05 * Math.abs(Math.sin(bd * 2.3)) + 0.015;
    if (bt < rag || bt > 1 - rag) continue;
    g[y][x] = bd > 2 ? BRONZE[3] : bd > 1 ? BRONZE[1] : bd > -1.6 ? CLOTH : bd > -2.5 ? BRONZE[1] : BRONZE[0];
  }
  // its beads, the crown's bone and bronze with the one ruby, and raw drain-grate iron showing where it broke
  for (const [t, c] of [[0.17, BONE_HI], [0.29, BRONZE[3]], [0.4, BONE_HI], [0.5, BLOOD_HI], [0.6, BONE_HI], [0.71, BRONZE[3]], [0.83, BONE_HI]]) { const [px, py] = P(t); put(g, Math.round(px), Math.round(py), c); }
  for (const [t, d, c] of [[0.06, 0, IRON[3]], [0.09, -1.5, IRON[2]], [0.07, 1.4, IRON[2]], [0.94, 0.5, IRON[2]], [0.92, -1, IRON[1]], [0.95, 1.9, IRON[2]]]) { const [px, py] = P(t); put(g, Math.round(px + nx * d), Math.round(py + ny * d), c); }
  return outlined(g);
}

/* A squat crock heaped with salts ("bone ash and iron filings", item-descriptions.js): the pot in `ramp`, a lit rim, the heap in two tones with filings' flecks. */
function saltCrock(ramp, heapLo, heapHi, fleck) {
  const g = blank();
  const cx = 15.5;
  for (let y = 13; y <= 28; y++) {                                         // the belly, widest low, lit from the upper left
    const t = (y - 21) / 8;
    const half = Math.round(10.4 * Math.sqrt(Math.max(0, 1 - t * t * 0.62)));
    for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
      const lit = (-(x - cx) / Math.max(half, 1)) * 0.75 - t * 0.45;
      g[y][x] = ramp[lit > 0.5 ? 3 : lit > 0.05 ? 2 : lit > -0.5 ? 1 : 0];
    }
  }
  for (let x = 7; x <= 24; x++) { g[11][x] = x < 16 ? ramp[3] : ramp[2]; g[12][x] = x < 12 ? ramp[2] : ramp[1]; g[13][x] = ramp[0]; }   // the rim, and its shadow on the belly
  for (let y = 3; y <= 10; y++) {                                          // the heap
    const t = (10.5 - y) / 7.6;
    const half = Math.round(8.2 * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
      const lit = (-(x - cx) / Math.max(half, 1)) * 0.7 + t * 0.6;
      g[y][x] = lit > 0.2 ? heapHi : heapLo;
    }
  }
  for (const [x, y] of [[12, 6], [17, 5], [14, 9], [19, 8], [10, 9], [16, 8]]) put(g, x, y, fleck);
  for (const [x, y] of [[11, 18], [12, 19], [11, 20]]) put(g, x, y, ramp[3]);   // a glint on the belly
  return outlined(g);
}
const temperSalts = () => saltCrock([EARTH[1], EARTH[2], EARTH[3], EARTH[4]], BONE, BONE_HI, IRON[1]);

export const DRAW = Object.freeze({ temper_salts: temperSalts, bronze_rimmed_shield: bronzeRimmedShield, kingsgrate, iron_hatchets: ironHatchets, oak_crossbow: oakCrossbow, crown_shard: crownShard });

/** A grid (hex or null per pixel) as a binary-alpha 32x32 image. */
export function toImage(g) {
  const img = createImage(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = g[y][x];
    if (!c) continue;
    const i = (y * 32 + x) * 4;
    img.data[i] = parseInt(c.slice(1, 3), 16); img.data[i + 1] = parseInt(c.slice(3, 5), 16); img.data[i + 2] = parseInt(c.slice(5, 7), 16); img.data[i + 3] = 255;
  }
  return img;
}

if (isMain(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  const dir = at > 0 ? process.argv[at + 1] : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  for (const [id, draw] of Object.entries(DRAW)) writeFileSync(join(dir, id + '.png'), encodePNG(toImage(draw())));
  console.log('twin-icons: wrote ' + Object.keys(DRAW).length + ' icons to ' + dir);
}
