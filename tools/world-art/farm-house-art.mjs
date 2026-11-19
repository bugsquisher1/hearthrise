#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/farm-house-art.mjs — THE FARM'S PLOT AND THE HOUSE'S PICTURE (lane/b-farm-house-faction-art, ART_DIRECTION §12:
// "the Farm soil plots from the world's tiles, the House rooms in the world's style").
//
//   assets/ui/farm-plot.png     ONE PLOT: a raised bed of the town's tilled soil in a plank frame, the empty ground every plot of the Farm
//                               window stands on (.hw-soil, windows.css); the crop's icon sits on it
//   assets/ui/house-tiers.png   THE HOME YOU HOLD: one 64x64 picture per property tier, in src/data/homestead-tiers.js PROPERTY_TIERS
//                               order (the camp's tent, the cottage, the farmstead, the manor, the keep, the castle), side by side; the
//                               House window's head shows the server's tier (.hw-house-pic, its --hw-tier)
//
//   node tools/world-art/farm-house-art.mjs           write them
//   node tools/world-art/farm-house-art.mjs --check   exit 1 when a written file differs from a fresh one, or windows.css lays a piece
//                                                     at a size other than its own; write nothing
//
// EVERY PIECE IS A PIXELLAB PICK (art/world-src/gen-2026-11-18/farm-plot/picks/plot.png, house/picks/<tier id>.png; the calls, the gens
// and every candidate in each folder's note.json and candidates-*.png), drawn on hr-world-56-v2 and kept as returned: the plot is cut to
// its opaque box, a house keeps its 64x64 cell (every pick stands its base on row 61, so the six line up). Nothing is scaled and nothing
// is drawn here; a pick off the palette or with a partial alpha stops the run. The window lays them at x2 (calc(N * var(--art-px))).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { inPalette } from './lock.mjs';
import { PROPERTY_TIERS } from '../../src/data/homestead-tiers.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'art', 'world-src', 'gen-2026-11-18');
export const PLOT_FILE = 'assets/ui/farm-plot.png';
export const HOUSE_FILE = 'assets/ui/house-tiers.png';
/** A house picture's cell, art px. */
export const HOUSE_CELL = 64;
const CSS = 'src/styles/windows.css';

/** `img` checked: every opaque pixel on the palette, alpha binary. Throws with the first offence. */
function checked(name, img) {
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (!a) continue;
    if (a !== 255) throw new Error(name + ': partial alpha at ' + ((i / 4) % img.width) + ',' + Math.floor(i / 4 / img.width));
    if (!inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) throw new Error(name + ': off the palette at ' + ((i / 4) % img.width) + ',' + Math.floor(i / 4 / img.width));
  }
  return img;
}
const pick = (rel) => { const f = join(SRC, rel); if (!existsSync(f)) throw new Error('no pick ' + rel); return checked(rel, decodePNG(readFileSync(f))); };

/** The plot: its pick cut to its opaque box. */
export function plotImage() {
  const img = pick('farm-plot/picks/plot.png');
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!img.data[(y * img.width + x) * 4 + 3]) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < 0) throw new Error('farm-plot/picks/plot.png is empty');
  const out = createImage(x1 - x0 + 1, y1 - y0 + 1);
  blit(out, img, x0, y0, out.width, out.height, 0, 0);
  return out;
}

/** The six house pictures side by side, PROPERTY_TIERS order. */
export function houseSheet() {
  const out = createImage(HOUSE_CELL * PROPERTY_TIERS.length, HOUSE_CELL);
  PROPERTY_TIERS.forEach((t, i) => {
    const img = pick('house/picks/' + t.id + '.png');
    if (img.width !== HOUSE_CELL || img.height !== HOUSE_CELL) throw new Error('house/picks/' + t.id + '.png is ' + img.width + 'x' + img.height + ', want ' + HOUSE_CELL + 'x' + HOUSE_CELL);
    blit(out, img, 0, 0, HOUSE_CELL, HOUSE_CELL, i * HOUSE_CELL, 0);
  });
  return out;
}

/** How windows.css must lay each piece: its own size in art px, never another. Sentences for every miss; empty = it does. */
export function cssProblems(css, plot = plotImage()) {
  const out = [];
  const n = PROPERTY_TIERS.length, c = HOUSE_CELL;
  const want = [
    [PLOT_FILE, `url('../../${PLOT_FILE}') 50% 50% / calc(${plot.width} * var(--art-px)) calc(${plot.height} * var(--art-px)) no-repeat`],
    [HOUSE_FILE, `url('../../${HOUSE_FILE}') calc(var(--hw-tier, 0) * -${c} * var(--art-px)) 0 / calc(${n * c} * var(--art-px)) calc(${c} * var(--art-px)) no-repeat`],
    [HOUSE_FILE + ' cell', `width: calc(${c} * var(--art-px)); height: calc(${c} * var(--art-px));`],
  ];
  for (const [what, s] of want) if (!css.includes(s)) out.push(CSS + ' does not lay ' + what + ' as `' + s + '`');
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const plot = plotImage();
  const files = [[PLOT_FILE, encodePNG(plot)], [HOUSE_FILE, encodePNG(houseSheet())]];
  let bad = 0;
  for (const [rel, png] of files) {
    const file = join(ROOT, rel);
    if (check) { const cur = existsSync(file) ? readFileSync(file) : null; if (!cur || !cur.equals(png)) { console.error('stale: ' + rel); bad++; } }
    else writeFileSync(file, png);
  }
  for (const p of cssProblems(readFileSync(join(ROOT, CSS), 'utf8'), plot)) { console.error(p); bad++; }
  const tail = ' (the plot ' + plot.width + 'x' + plot.height + ', ' + PROPERTY_TIERS.length + ' house pictures)';
  if (check) { console.log((bad ? 'farm-house-art --check: ' + bad + ' finding(s)' : 'farm-house-art --check: fresh') + tail); process.exit(bad ? 1 : 0); }
  console.log('farm-house-art: wrote' + tail + (bad ? ', and windows.css still lays them wrong (' + bad + ')' : ''));
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error('farm-house-art: ' + (e && e.message || e)); process.exit(2); }
}
