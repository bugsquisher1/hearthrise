#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/palisade-art.mjs — HAVORA'S WALL IN ONE PERSPECTIVE (lane/a-havora-seams-2; Tyler's gate: "props drawn in a
// different style"; the audit: the west run's pale stakes were seen from above beside the north run's dark front-view stakes, the
// north run overhung the corner by a tile, the west run stopped in open grass on a cut).
//
// The east-west runs are slices of one 256 px front-view strip (havora_palisade_h0..h7, PixelLab, kept). A north-south run seen by
// the same camera is the same stakes, one behind the other: each stands upright at its own foot, the next one south drawn over
// it, so the run reads as a column of stake tips falling toward the viewer with the last stake whole. This lays that column from
// the strip's own stakes (no pixel of its own):
//   havora_palisade_v0..v3   a seamless 128 px loop, one 32 px row each: three stakes to a row, feet 11 px apart, staggered a
//                            px or two either way of the band's middle (where the east-west run's end post stands), cut whole
//   havora_palisade_vn       the north end of a free run: the same, its first stake's tip the run's top
//   havora_palisade_vs       the south end: two stakes and the strip's thick post as the last, a run that ends on a post
// Each frame is 64 x 128 (footprint 2 x 1, the row's bottom the anchor): a stake rises 96 px over its foot. At a corner the
// east-west run ends on its own end post over the band's middle (town/palisade.js), so the two runs meet on one post.
// Deterministic. Reads the strip's slices, writes the six sources and their sidecars' frame, anchor and notes.
//
//   node tools/world-art/palisade-art.mjs            write
//   node tools/world-art/palisade-art.mjs --check    exit 1 if a committed source or sidecar differs from a fresh run
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, createImage, pixelHash } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = 'art/world/havora';
const STRIP_W = 256, H = 96;
/* the strip's stakes, outline to outline (columns measured on the strip: its dark joint columns), and its thick post */
export const STAKES = Object.freeze([[1, 11], [11, 20], [20, 30], [30, 40], [40, 50], [50, 59], [86, 95], [95, 105], [105, 114], [115, 124],
  [124, 134], [134, 144], [144, 153], [153, 163], [163, 172], [173, 182], [182, 191], [191, 200], [201, 211], [217, 226], [226, 235], [236, 246]]);
export const POST = Object.freeze([71, 86]);
/* the column: the band's middle (frame x 32 of 64, the anchor), stakes' feet 11 px apart down a row, the last on the row's foot,
   set alternately 3-5 px either side of the middle (a palisade's stakes are driven in a staggered pair of files, so the run has
   the band's body and not one pole's) */
const VW = 64, VH = 128, CX = 32, FEET = Object.freeze([9, 20, 31]);
const JIGGLE = Object.freeze([-5, 4, -4, 5, -3, 4, -5, 3, -4, 5, -4, 4]);

/** The 256 x 96 strip from its eight slices. */
export function strip(read) {
  const out = createImage(STRIP_W, H);
  for (let k = 0; k < 8; k++) {
    const im = read('havora_palisade_h' + k);
    for (let y = 0; y < H; y++) out.data.set(im.data.subarray(y * 32 * 4, (y + 1) * 32 * 4), (y * STRIP_W + k * 32) * 4);
  }
  return out;
}

/* lay strip columns [a, b] with their foot at (fx, fy) of `dst`, the column's middle at fx */
function stand(dst, src, [a, b], fx, fy) {
  const w = b - a + 1, x0 = Math.round(fx - (w - 1) / 2);
  for (let y = 0; y < H; y++) for (let i = 0; i < w; i++) {
    const s = (y * STRIP_W + a + i) * 4;
    if (src.data[s + 3] === 0) continue;
    const X = x0 + i, Y = fy - (H - 1) + y;
    if (X < 0 || Y < 0 || X >= dst.width || Y >= dst.height) continue;
    dst.data.set(src.data.subarray(s, s + 4), (Y * dst.width + X) * 4);
  }
}

/** The six pieces: { id: image }. */
export function pieces(src) {
  const out = {};
  const row = (k, last) => {
    const im = createImage(VW, VH);
    FEET.forEach((f, j) => {
      const n = k * 3 + j;
      const which = last && j === FEET.length - 1 ? POST : STAKES[(n * 7 + 3) % STAKES.length];
      stand(im, src, which, CX + (last && j === FEET.length - 1 ? 0 : JIGGLE[n % JIGGLE.length]), VH - 32 + f);
    });
    return im;
  };
  for (let k = 0; k < 4; k++) out['havora_palisade_v' + k] = row(k, false);
  out.havora_palisade_vn = row(0, false);
  out.havora_palisade_vs = row(3, true);
  return out;
}

const NOTES = Object.freeze({
  havora_palisade_v0: 'Slice 0 of a seamless 128 px loop of a north-south palisade run: the front-view strip\'s own stakes (havora_palisade_h0..h7) stood one behind the other, three to a row, feet 11 px apart, so the run reads in the same perspective as the east-west runs (tools/world-art/palisade-art.mjs, no generation; town/palisade.js).',
  havora_palisade_v1: 'Slice 1 of the north-south loop (tools/world-art/palisade-art.mjs: the strip\'s stakes stood one behind the other).',
  havora_palisade_v2: 'Slice 2 of the north-south loop (tools/world-art/palisade-art.mjs: the strip\'s stakes stood one behind the other).',
  havora_palisade_v3: 'Slice 3 of the north-south loop (tools/world-art/palisade-art.mjs: the strip\'s stakes stood one behind the other).',
  havora_palisade_vn: 'The north end of a free north-south run: the loop\'s first row, its first stake\'s tip the run\'s top (tools/world-art/palisade-art.mjs).',
  havora_palisade_vs: 'The south end of a north-south run: two stakes and the strip\'s thick post last, so a run ends on a post (tools/world-art/palisade-art.mjs).',
});

function main() {
  const check = process.argv.includes('--check');
  const read = (id) => decodePNG(readFileSync(join(ROOT, DIR, id + '.png')));
  const out = pieces(strip(read));
  let bad = 0;
  for (const [id, img] of Object.entries(out)) {
    const scPath = join(ROOT, DIR, id + '.json');
    const sc = JSON.parse(readFileSync(scPath, 'utf8'));
    const next = Object.assign({}, sc, { frame: [img.width, img.height], anchor_px: [VW / 2, VH - 1], notes: NOTES[id] });
    delete next.restyle;
    if (sc.pixellab) next.pixellab = sc.pixellab;
    const json = JSON.stringify(next, null, 2) + '\n';
    if (check) {
      const same = pixelHash(read(id)) === pixelHash(img) && readFileSync(scPath, 'utf8').replace(/\r\n/g, '\n') === json;
      if (!same) { console.log('✗ palisade-art:', id, 'differs from a fresh run'); bad++; }
      continue;
    }
    writeFileSync(join(ROOT, DIR, id + '.png'), encodePNG(img));
    writeFileSync(scPath, json);
    console.log('✓', id, img.width + 'x' + img.height);
  }
  if (check) console.log(bad ? '✗ palisade-art: RED' : '✓ palisade-art: every piece is a fresh run');
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main();
