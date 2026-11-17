#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/sweep-coat-sample.mjs — THE SWEEP'S COAT AS A RECOLOUR: A SAMPLE TO READ, NOT AN OUTFIT (lane/a-tower-art, 2026-11-16).
//
// The Sweep's Coat (the board's "The Burning Tower" §5, Tyler 2026-11-14 "a super rare outfit that can drop from any chest"): "a
// soot-black long coat, a flat cap and knee leathers with a coil of brush rope over one shoulder, scorched at the hems, no glow and no
// flame effect. Recolor regions are the cap, the coat, the trousers and the boots." No paid generation is approved, so this asks how
// near a recolour of a shipped style-1 outfit gets: every outfit's dyeable regions (its mask, tools/world-art/outfit-masks.mjs) poured
// by value onto soot (shadow and stone ramps), the rest as drawn, south and east, idle still and a walk frame, at x4 beside the outfit
// as it ships. It writes a review sheet only (art/review), never an atlas, a sidecar or an OUTFITS row.
//
//   node tools/world-art/sweep-coat-sample.mjs [DIR]
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage } from './png.mjs';
import { lightness } from '../../src/world/pour.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOOT = Object.freeze(['#17141a', '#231d1f', '#2f2723', '#3a3a3e', '#4f4e52']);
const OUTFITS = Object.freeze(['outfit_brute', 'outfit_sorcerer', 'outfit_witch', 'outfit_berserker']);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function sheet(set) {
  return { m: JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8')), img: decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.png'))) };
}
function frameOf(s, id, anim, dir, i) {
  const sp = s.m.sprites[id];
  const [sx, sy] = sp.anims[anim].dirs[dir][i];
  const [w, h] = sp.frame;
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = ((sy + y) * s.img.width + sx + x) * 4;
    out.data.set(s.img.data.subarray(a, a + 4), (y * w + x) * 4);
  }
  return out;
}

/** Every masked (dyeable) pixel of `img` by value onto soot: ranked within the frame so the shading steps stay. */
function soot(img, mask) {
  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  const at = [];
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] >= 128 && mask.data[i + 3] >= 128) at.push([i, lightness(img.data[i], img.data[i + 1], img.data[i + 2])]);
  const ls = [...new Set(at.map(([, l]) => Math.round(l)))].sort((a, b) => a - b);
  for (const [i, l] of at) {
    const k = Math.min(SOOT.length - 1, Math.floor((ls.indexOf(Math.round(l)) / Math.max(1, ls.length)) * SOOT.length));
    out.data.set(rgb(SOOT[k]), i);
  }
  return out;
}

function main(argv) {
  const dir = join(ROOT, argv[0] || 'art/review/tower-art-2026-11-16/sweep');
  mkdirSync(dir, { recursive: true });
  const heroes = sheet('heroes'), masks = sheet('hunt-masks');
  const k = 4, cell = 64 * k, shots = [['idle', 's', 0], ['walk', 's', 2], ['idle', 'e', 0], ['walk', 'e', 2]];
  const img = createImage(cell * shots.length * 2, cell * OUTFITS.length);
  const bg = rgb('#8a867d');
  for (let i = 0; i < img.data.length; i += 4) img.data.set([...bg, 255], i);
  OUTFITS.forEach((id, row) => {
    shots.forEach(([anim, d, n], col) => {
      const plain = frameOf(heroes, id, anim, d, n), mask = frameOf(masks, id + '_mask', anim, d, n);
      [plain, soot(plain, mask)].forEach((f, half) => {
        const ox = (col * 2 + half) * cell, oy = row * cell;
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const a = (y * 64 + x) * 4;
          if (f.data[a + 3] < 128) continue;
          for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) img.data.set(f.data.subarray(a, a + 4), ((oy + y * k + yy) * img.width + ox + x * k + xx) * 4);
        }
      });
    });
  });
  const file = join(dir, 'sweep-coat-recolour-sample.png');
  writeFileSync(file, encodePNG(img));
  console.log('wrote ' + file + ': ' + OUTFITS.join(' ') + ', each as shipped | soot, idle s, walk s, idle e, walk e');
  return 0;
}

if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
