#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/jewelry-icons.mjs — CRAFTED JEWELRY'S GRADES AND GEMS, DRAWN BY RULE FROM THE SHIPPED PIECES
// (lane/c-jewelry-sample, 2026-11-05; the designer's spec: "Art: 0 generations. A perk's stone is a palette-locked pip over the plain
// icon; Hallmarked adds a gold band and mark. Scripted").
//
// Each graded row of src/data/jewelry.js wears its plain piece's own icon with one stone per perk SET INTO THE PIECE (STONE_AT, per
// piece: the first perk's stone where a signet's face would be, the second below it), each a 3x3 stone in the perk's colour inside a
// 1 px #0b0a0c setting, lit from the upper left; a Hallmarked row's band is GILT (the piece's light steel re-cut to the gold ramps), the
// maker's mark. So a bag tells plain, Fine and Hallmarked apart at 1x, and two Fine rings by their stone. The Road Garnet is the shipped Ruby re-cut a step darker on its own ramps (blood to cloth), so the
// gem reads as a garnet beside it. Every colour is an entry of art/world/palette.json; binary alpha; 32x32 (tests/pixel-icons.mjs).
// The Art Director judges and may replace these with bespoke art; until then edit THIS script and rerun it, never the PNG.
//
//   node tools/world-art/jewelry-icons.mjs            write assets/icons-bundle/pixel/items/<id>.png
//   node tools/world-art/jewelry-icons.mjs --check    exit 1 when a written icon differs from what this draws
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, cloneImage } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';
import { JEWELRY_ITEMS, JEWEL_TIERS } from '../../src/data/jewelry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const K = '#0b0a0c';
/* Each perk's stone, dark -> light (palette ramps): Keen a torch spark, Surge a frost charge, Follow-through blood, Thrift leaf,
   Deflect iron, Second Wind venom green. */
export const STONES = Object.freeze({
  keen: ['#f2a03a', '#ffd36a'], surge: ['#4fa8e8', '#a8e4ff'], follow: ['#8e1f1f', '#c23a2a'],
  thrift: ['#557a3e', '#73944c'], deflect: ['#6e727a', '#969aa1'], second_wind: ['#3d6234', '#7ccf4a'],
});
/* Where each piece's stones sit (the stone's top-left pixel), first perk then second: a new piece is a row here. */
export const STONE_AT = Object.freeze({ banded_signet: [[13, 6], [15, 21]] });
/* A Hallmarked band: the piece's light steel re-cut to gold, light to dark. */
const GILT = Object.freeze({ '#c8e6e0': '#ffd36a', '#c4ccd2': '#e8c547', '#8a9aa8': '#cfa25c' });
/* The Ruby re-cut as a garnet: each red one step darker on its ramp. */
const GARNET_CUT = Object.freeze({ '#c23a2a': '#8e1f1f', '#8e1f1f': '#5e1a1f', '#5e1a1f': '#3e1216' });
/* The gems this script cuts: each tier's gem from a shipped gem it re-cuts. */
const GEMS = Object.freeze({ road_garnet: { from: 'ruby', cut: GARNET_CUT } });

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function put(img, x, y, hex) {
  const i = (y * img.width + x) * 4, [r, g, b] = rgb(hex);
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
}
const read = (id) => decodePNG(readFileSync(join(DIR, id + '.png')));

/* A 3x3 stone at (x, y) in a 1 px setting: the dark tone, a light pip top-left. */
function stone(img, x, y, [dark, light]) {
  for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 3; dx++) {
    const edge = dx < 0 || dy < 0 || dx > 2 || dy > 2;
    if (edge && (dx < 0 || dx > 2) && (dy < 0 || dy > 2)) continue;   // the setting's corners are cut
    put(img, x + dx, y + dy, edge ? K : dx === 0 && dy === 0 ? light : dark);
  }
}

/* Every pixel of a colour in `cut` re-cut to its partner (the gilt band, the garnet). */
function recut(img, cut) {
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const h = '#' + [0, 1, 2].map((j) => img.data[i + j].toString(16).padStart(2, '0')).join('');
    if (cut[h]) { const [r, g, b] = rgb(cut[h]); img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; }
  }
  return img;
}

/** Every icon this script draws, by id: an image. */
export function drawAll() {
  const out = {};
  for (const [id, it] of Object.entries(JEWELRY_ITEMS)) {
    const at = STONE_AT[it.jewelBase];
    if (!at) throw new Error('jewelry-icons: no STONE_AT row for ' + it.jewelBase);
    const img = cloneImage(read(it.jewelBase));
    if (it.jewelGrade === 'hallmarked') recut(img, GILT);
    Object.keys(it.jewelPerks).forEach((p, n) => stone(img, at[n][0], at[n][1], STONES[p]));
    out[id] = img;
  }
  for (const t of Object.values(JEWEL_TIERS)) {
    const g = GEMS[t.gem];
    if (!g) continue;
    out[t.gem] = recut(cloneImage(read(g.from)), g.cut);
  }
  return out;
}

if (isMain(import.meta.url)) {
  const all = drawAll();
  if (process.argv.includes('--check')) {
    const bad = Object.keys(all).filter((id) => {
      let was;
      try { was = readFileSync(join(DIR, id + '.png')); } catch { return true; }
      return Buffer.compare(was, encodePNG(all[id])) !== 0;
    });
    if (bad.length) { console.error('jewelry-icons --check: not what this script draws: ' + bad.join(', ') + '. Run node tools/world-art/jewelry-icons.mjs'); process.exit(1); }
    console.log('jewelry-icons --check: OK, ' + Object.keys(all).length + ' icons');
  } else {
    for (const [id, img] of Object.entries(all)) writeFileSync(join(DIR, id + '.png'), encodePNG(img));
    console.log('jewelry-icons: wrote ' + Object.keys(all).join(', '));
  }
}
