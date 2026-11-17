#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/krell-icons.mjs — LORD KRELL'S TWO UNIQUE PIECES, DRAWN BY RULE
// (lane/c-krell-uniques, 2026-11-15; Tyler 2026-11-14: "a pair of pally legs a tank shield ... just no weapon". No paid
// generations: each icon's shape is data and its shading a rule, as in twin-icons.mjs and longbow-icon.mjs.)
//
// Each is drawn from the item's own line (src/data/special-attributes.js), not from another item's picture:
//   krells_tollgate   "Krell had his toll house gate cut down into a shield": a tall gate leaf of dark oak boards, its top
//                     sawn flat and its foot cut to a point, two iron straps across it with gold rivets (the unique), and
//                     the toll slot in a bronze plate where the straps frame it, a coin's glint in the slot. Square-topped
//                     and wooden, so at the bag's 1x it is neither the round Bronze-Rimmed Shield nor the barred Kingsgrate.
//   banded_legguards  "from the Banded Company's armor. He left the bronze bands on": dark iron plate legs under a belt,
//                     a bright bronze band round each thigh, shin and boot and a bronze knee cop with a gold boss. Dark
//                     plate with bright bands, where the Dawnsteel Platelegs are pale gold all over.
//
// Every colour is an entry of hr-world-56-v2 (art/world/palette.json), binary alpha, 32x32, a 1 px #0b0a0c outline with
// its corners cut, lit from the upper left. tests/pixel-icons.mjs rule `drawn` holds the files to this script: edit the
// script and rerun it, never the PNG.
//
//   node tools/world-art/krell-icons.mjs            write assets/icons-bundle/pixel/items/<id>.png
//   node tools/world-art/krell-icons.mjs --out <d>  write to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { toImage } from './twin-icons.mjs';
import { isMain } from '../../tests/_is-main.mjs';

export { toImage };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');

const K = '#0b0a0c', VOID = '#17141a';
const EARTH = ['#2a1c14', '#3d2a1d', '#553a26', '#6e4c30', '#8a6440'];
const BRONZE = ['#4a2e18', '#7a4f26', '#a8743a', '#cfa25c'];
const IRON = ['#2c2e33', '#4a4d54', '#6e727a', '#969aa1'];
const GOLD = '#e8c547', TORCH_HI = '#ffd36a';

const blank = () => Array.from({ length: 32 }, () => Array(32).fill(null));

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

function krellsTollgate() {
  const g = blank();
  // the mask per row, [first x, last x]: a gate leaf sawn flat across the top, its foot cut to a point
  const spans = {};
  for (let y = 3; y <= 20; y++) spans[y] = [6, 25];
  for (let y = 21; y <= 28; y++) { const d = y - 20; spans[y] = [6 + d, 25 - d]; }
  spans[2] = [7, 24];
  const on = (x, y) => spans[y] && x >= spans[y][0] && x <= spans[y][1];
  // five oak boards, a dark seam between each, each board lit on its left edge and falling away to its right
  const SEAMS = [10, 14, 18, 22];
  for (let y = 2; y <= 28; y++) for (let x = spans[y][0]; x <= spans[y][1]; x++) {
    if (SEAMS.includes(x)) { g[y][x] = EARTH[0]; continue; }
    const first = x === spans[y][0] || SEAMS.includes(x - 1);
    const last = x === spans[y][1] || SEAMS.includes(x + 1);
    const shade = y > 22 ? 1 : 0;                                            // the foot turns from the light
    g[y][x] = EARTH[Math.max(1, (first ? 4 : last ? 2 : 3) - shade)];
  }
  // the grain, a knot, and the saw's pale cut along the top
  for (const [x, y] of [[8, 6], [8, 7], [12, 15], [12, 16], [16, 5], [20, 24], [24, 8], [24, 9], [16, 25], [12, 23]]) if (on(x, y)) g[y][x] = EARTH[1];
  for (let x = 7; x <= 24; x++) if (!SEAMS.includes(x)) g[2][x] = EARTH[4];
  // two iron straps across the boards, lit on top and dark beneath, a gold rivet on every board
  for (const y0 of [6, 19]) {
    for (let x = spans[y0][0]; x <= spans[y0][1]; x++) { g[y0][x] = IRON[3]; g[y0 + 1][x] = IRON[2]; g[y0 + 2][x] = IRON[0]; }
    for (const x of [8, 12, 16, 20, 24]) if (on(x, y0 + 1)) { g[y0 + 1][x] = GOLD; if (on(x + 1, y0 + 2)) g[y0 + 2][x] = BRONZE[0]; }
  }
  // the toll plate between the straps: bronze, bevelled, with the slot the coins went through and one coin's glint in it
  for (let y = 10; y <= 16; y++) for (let x = 11; x <= 20; x++) {
    g[y][x] = y === 10 || x === 11 ? BRONZE[3] : y === 16 || x === 20 ? BRONZE[0] : x + y < 29 ? BRONZE[2] : BRONZE[1];
  }
  for (let x = 13; x <= 18; x++) { g[13][x] = K; g[14][x] = VOID; }
  g[14][16] = GOLD; g[14][17] = TORCH_HI;
  for (const [x, y] of [[12, 11], [19, 11], [12, 15], [19, 15]]) g[y][x] = GOLD;
  // an iron shoe on the point
  for (let y = 26; y <= 28; y++) for (let x = spans[y][0]; x <= spans[y][1]; x++) g[y][x] = x < 16 ? IRON[2] : IRON[1];
  g[26][spans[26][0]] = IRON[3];
  return outlined(g);
}

function bandedLegguards() {
  const g = blank();
  // the mask per row, a list of [first x, last x] runs: a belt, the hip plates, two thighs that part at the crotch, a knee cop
  // standing proud of each leg, shins that taper, and boots with the toes turned out
  const rows = {};
  for (let y = 3; y <= 5; y++) rows[y] = [[8, 23]];                           // the belt
  rows[6] = [[7, 24]]; rows[7] = [[6, 25]]; rows[8] = [[5, 26]]; rows[9] = [[5, 26]];   // the hip plates flare
  rows[10] = [[5, 15], [16, 26]]; rows[11] = [[6, 15], [16, 25]];
  for (let y = 12; y <= 15; y++) rows[y] = [[6, 14], [17, 25]];               // the thighs
  rows[16] = [[5, 14], [17, 26]]; rows[17] = [[4, 15], [16, 27]]; rows[18] = [[4, 15], [16, 27]]; rows[19] = [[5, 14], [17, 26]];   // the knee cops
  for (let y = 20; y <= 24; y++) rows[y] = [[7, 13], [18, 24]];               // the shins
  rows[25] = [[6, 14], [17, 25]];
  rows[26] = [[5, 14], [17, 26]]; rows[27] = [[4, 14], [17, 27]]; rows[28] = [[4, 14], [17, 27]];   // the boots
  /* what a row is made of: p = dark iron plate, B = a bronze band's lit row, b = its shaded row, k = the knee cop */
  const KIND = { 3: 'B', 4: 'B', 5: 'b', 13: 'B', 14: 'b', 16: 'k', 17: 'k', 18: 'k', 19: 'k', 22: 'B', 23: 'b', 26: 'B' };
  for (const [ys, runs] of Object.entries(rows)) {
    const y = Number(ys), kind = KIND[y] || 'p';
    for (const [a, b] of runs) for (let x = a; x <= b; x++) {
      const t = (x - a) / Math.max(1, b - a);                                // 0 the lit left of this run, 1 its shaded right
      if (kind === 'B') g[y][x] = t < 0.3 ? BRONZE[3] : t > 0.8 ? BRONZE[1] : BRONZE[2];
      else if (kind === 'b') g[y][x] = t > 0.6 ? BRONZE[0] : BRONZE[1];
      else if (kind === 'k') g[y][x] = y === 16 ? (t < 0.5 ? BRONZE[3] : BRONZE[2]) : y === 19 ? BRONZE[0] : t < 0.25 ? BRONZE[3] : t < 0.7 ? BRONZE[2] : BRONZE[1];
      else g[y][x] = y === 28 ? IRON[0] : t < 0.22 ? IRON[2] : t < 0.7 ? IRON[1] : IRON[0];
    }
  }
  // the belt's buckle, the split between the hip plates, a lit ridge down each plate, and a gold boss on each knee cop
  for (let y = 3; y <= 5; y++) { g[y][15] = GOLD; g[y][16] = y === 3 ? TORCH_HI : GOLD; }
  for (let y = 6; y <= 9; y++) { g[y][15] = IRON[0]; g[y][16] = VOID; }
  for (const x of [8, 19]) for (const y of [7, 8, 10, 11, 12, 15, 20, 21, 24, 25]) g[y][x] = IRON[3];
  for (const x of [9, 21]) { g[17][x] = GOLD; g[17][x + 1] = TORCH_HI; g[18][x] = BRONZE[0]; g[18][x + 1] = GOLD; }
  return outlined(g);
}

/** The icons this script draws, by item id. */
export const DRAW = Object.freeze({ krells_tollgate: krellsTollgate, banded_legguards: bandedLegguards });

if (isMain(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  const dir = at > 0 ? process.argv[at + 1] : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  for (const [id, draw] of Object.entries(DRAW)) writeFileSync(join(dir, id + '.png'), encodePNG(toImage(draw())));
  console.log('krell-icons: wrote ' + Object.keys(DRAW).length + ' icons to ' + dir);
}
