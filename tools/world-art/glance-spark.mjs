#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/glance-spark.mjs — A BLOW THAT DID NO HARM, DRAWN BY RULE
// (lane/a-miss-spark, 2026-11-04; no generation, $0).
//
// Tyler 2026-11-04: "instead of it saying 'miss' miss miss, i think the characters armor should
// 'spark' or something to show it missing, vs the word being on the screen."
//
// One sign with one meaning, wherever it lands: that blow did nothing. So a plain miss, a dodge and a blow a
// barrier swallowed are all this one spark (the player cannot tell them apart in 150 ms, and the combat log
// names which it was). Two drawings, because which side it lands on is the one thing worth telling apart:
//   fx_glance_spark  on a HERO: white-hot, torch rays, 9 art px at its widest. Your armor held. It is the
//                    only warm thing on a steel or leather body, so it reads at the size of a chest.
//   fx_glance_scuff  on a MONSTER: 7 art px of bone, your blow scraping off. Quiet on purpose: a warm star over a
//                    rat would read as a crit, and hits on the foe are already where the eye is. Bone and not stone:
//                    the first try in the stone ramp vanished on the Mill Cellar's stone floor at real size.
//
// Hard pixels, palette colours only (art/world/palette.json), three frames at 20 fps: 150 ms and gone, the
// fatigue budget of ART_DIRECTION §11. Drawn `over`, never additive, so the colours stay these on any floor.
// The frames are data; nothing is read from a shipped file, so this script fixes the output.
//
//   node tools/world-art/glance-spark.mjs            write art/world/vfx/<id>.{png,json}
//   node tools/world-art/glance-spark.mjs --check    exit 1 when a written source differs from this script
//   node tools/world-art/glance-spark.mjs --out <d>  write the sources to a folder instead (a preview)
// Then: node tools/world-art/build.mjs --set vfx
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, decodePNG, encodePNG, pixelHash } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'art', 'world', 'vfx');
const FPS = 20;

/* Key -> palette colour (hr-world-56-v2: bone, torch, stone). */
const INK = Object.freeze({ W: '#e6dcbc', Y: '#ffd36a', O: '#f2a03a', B: '#c9bfa0', S: '#aaa49a' });

export const SPRITES = Object.freeze({
  fx_glance_spark: [
    [
      '.........',
      '.........',
      '....Y....',
      '...YWY...',
      '..YWWWY..',
      '...YWY...',
      '....Y....',
      '.........',
      '.........',
    ],
    [
      '....O....',
      '....Y....',
      '..O.Y.O..',
      '...YWY...',
      'OYYWWWYYO',
      '...YWY...',
      '..O.Y.O..',
      '....Y....',
      '....O....',
    ],
    [
      '....O....',
      '.O.....O.',
      '.........',
      '....Y....',
      'O..YWY..O',
      '....Y....',
      '.........',
      '.O.....O.',
      '....O....',
    ],
  ],
  fx_glance_scuff: [
    [
      '.......',
      '.......',
      '...B...',
      '..BWB..',
      '...B...',
      '.......',
      '.......',
    ],
    [
      '...S...',
      '...B...',
      '.......',
      'SB.W.BS',
      '.......',
      '...B...',
      '...S...',
    ],
    [
      '...S...',
      '.S...S.',
      '.......',
      'S.....S',
      '.......',
      '.S...S.',
      '...S...',
    ],
  ],
});

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** One sprite's frames, left to right, as one sheet row. */
export function sheetOf(frames) {
  const n = frames[0].length;
  const img = createImage(n * frames.length, n);
  frames.forEach((rows, f) => rows.forEach((line, y) => [...line].forEach((k, x) => {
    if (k === '.') return;
    const i = (y * img.width + f * n + x) * 4;
    const [r, g, b] = rgb(INK[k]);
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  })));
  return img;
}

function sidecarOf(id, frames) {
  const n = frames[0].length, c = (n - 1) / 2;
  return { id, class: 'vfx', style: 's1', material: 'light', source: id + '.png', frame: [n, n], anchor_px: [c, c], footprint: [1, 1],
    anims: [{ name: 'play', fps: FPS, loop: false, dirs: { s: frames.length } }],
    notes: 'A blow that did no harm. Drawn by tools/world-art/glance-spark.mjs: hard pixels, palette colours, no generation.' };
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : DIR;
  mkdirSync(out, { recursive: true });
  let stale = 0;
  for (const [id, frames] of Object.entries(SPRITES)) {
    const img = sheetOf(frames);
    if (check) {
      let have = null;
      try { have = pixelHash(decodePNG(readFileSync(join(out, id + '.png')))); } catch { /* absent */ }
      if (have !== pixelHash(img)) { console.error('stale: ' + id); stale++; }
      continue;
    }
    writeFileSync(join(out, id + '.png'), encodePNG(img));
    writeFileSync(join(out, id + '.json'), JSON.stringify(sidecarOf(id, frames), null, 2) + '\n');
    console.log('wrote ' + id + ' (' + img.width + 'x' + img.height + ')');
  }
  if (stale) process.exit(1);
  if (check) console.log('glance-spark --check: the sources match this script');
}

if (isMain(import.meta.url)) main();
