#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// tools/world-art/call-icons.mjs — THE TWO CALL-ONLY PIECES' ICONS, DRAWN BY RULE (lane/d-boss-call-drops, designer 2026-11-14;
// src/data/boss-calls.js CALL_ITEMS). A first pass for the shelf, from each piece's own flavour line; the Asset Director's
// style-1 pass may replace either (edit this script and rerun it, never the PNG).
//
//   kingstooth    "the Rat King's long front tooth, set in an iron hilt": the Iron Sword's own icon (its outline, hilt and
//                 shape, so it reads as a sword of that tier) with the blade's iron ramp turned to old yellowed bone.
//   cauldron_lid  "the lid off the cauldron Chief Coppercap wears as a crown": a round copper lid seen from above at a slant,
//                 lit from the upper left, a dark rim band, and a cast knob, in the ramp of Coppercap's Cauldron's own icon.
//
// Every colour is an entry of hr-world-56-v2 (art/world/palette.json), binary alpha, 32x32, a 1 px #0b0a0c outline with its
// corners cut. tests/pixel-icons.mjs holds the files to the palette, the size and the alpha.
//
//   node tools/world-art/call-icons.mjs            write assets/icons-bundle/pixel/items/<id>.png
//   node tools/world-art/call-icons.mjs --out <d>  write to a folder instead (a preview)
// ═════════════════════════════════════════════════════════════════════════
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, decodePNG, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const K = '#0b0a0c';

const hexAt = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return img.data[i + 3] ? '#' + [0, 1, 2].map((j) => img.data[i + j].toString(16).padStart(2, '0')).join('') : null;
};
const toImage = (grid) => {
  const img = createImage(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = grid[y][x];
    if (!c) continue;
    const i = (y * 32 + x) * 4;
    img.data[i] = parseInt(c.slice(1, 3), 16); img.data[i + 1] = parseInt(c.slice(3, 5), 16); img.data[i + 2] = parseInt(c.slice(5, 7), 16); img.data[i + 3] = 255;
  }
  return img;
};

/* The Iron Sword's blade ramp, light to dark, and the bone it becomes (a tooth yellowed in the drains). */
const TOOTH = Object.freeze({ '#aaa49a': '#e6dcbc', '#969aa1': '#e6dcbc', '#8a867d': '#c9bfa0', '#6a6865': '#a88457', '#4f4e52': '#8a6440', '#3a3a3e': '#6e4c30' });

function kingstooth(dir) {
  const src = decodePNG(readFileSync(join(dir === DEFAULT_DIR ? dir : DEFAULT_DIR, 'iron_sword.png')));
  return Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => { const c = hexAt(src, x, y); return c && TOOTH[c] ? TOOTH[c] : c; }));
}

/* Coppercap's Cauldron's own ramp, light to dark. */
const COPPER = ['#ffd36a', '#f2a03a', '#cfa25c', '#b5835f', '#a8743a', '#7a4f26', '#4a2e18', '#3d2a1d'];

function cauldronLid() {
  const g = Array.from({ length: 32 }, () => Array(32).fill(null));
  const cx = 15.5, cy = 18, rx = 13.4, ry = 9.2;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, r = Math.hypot(dx, dy);
    if (r > 1) continue;
    /* the rim band, darker on the lower right where the slant turns it away */
    if (r > 0.8) { g[y][x] = dx + dy > 0.2 ? COPPER[6] : dx + dy < -0.5 ? COPPER[3] : COPPER[5]; continue; }
    const lit = -(dx + dy * 1.3);
    g[y][x] = lit > 0.75 ? COPPER[1] : lit > 0.35 ? COPPER[2] : lit > -0.1 ? COPPER[3] : lit > -0.5 ? COPPER[4] : COPPER[5];
  }
  /* a hammered ring halfway out, and the knob: a cast copper button on a short neck, lit on its upper left */
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (g[y][x] && r > 0.48 && r < 0.56 && (x + y) % 2 === 0) g[y][x] = COPPER[5];
  }
  for (const [x, y, c] of [[14, 15, COPPER[5]], [15, 15, COPPER[5]], [16, 15, COPPER[6]], [17, 15, COPPER[6]],
    [13, 12, COPPER[2]], [14, 12, COPPER[1]], [15, 12, COPPER[0]], [16, 12, COPPER[2]], [17, 12, COPPER[3]], [18, 12, COPPER[4]],
    [13, 13, COPPER[2]], [14, 13, COPPER[1]], [15, 13, COPPER[2]], [16, 13, COPPER[3]], [17, 13, COPPER[4]], [18, 13, COPPER[5]],
    [14, 14, COPPER[3]], [15, 14, COPPER[4]], [16, 14, COPPER[4]], [17, 14, COPPER[5]],
    [14, 11, COPPER[3]], [15, 11, COPPER[2]], [16, 11, COPPER[3]], [17, 11, COPPER[4]]]) g[y][x] = c;
  /* the set's outline: every empty pixel 4-touching art turns #0b0a0c, so corners stay cut */
  const out = g.map((r) => r.slice());
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g[y][x]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g[y + dy] && g[y + dy][x + dx]) { out[y][x] = K; break; }
  }
  return out;
}

const CALL_ICONS = Object.freeze({ kingstooth, cauldron_lid: cauldronLid });

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const dir = i > 0 ? process.argv[i + 1] : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  for (const [id, draw] of Object.entries(CALL_ICONS)) {
    writeFileSync(join(dir, id + '.png'), encodePNG(toImage(draw(dir))));
    console.log('wrote ' + join(dir, id + '.png'));
  }
}
