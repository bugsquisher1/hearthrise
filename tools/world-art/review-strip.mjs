#!/usr/bin/env node
// tools/world-art/review-strip.mjs - the mandatory walk check as a picture.
//   node tools/world-art/review-strip.mjs <sprite id> [out dir] [facing]
// Writes <out>/<id>_<facing>_walk.png: row 1 the reference knight's walk, row 2 the sprite's walk (its
// idle frame when it has no walk: an NPC), both from the art/world/<set> source sheets (any set),
// every frame at x3 on a flat ground colour, a one-pixel guide on the anchor row. Read it before
// calling a re-cut done.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit, scaleNearest } from './png.mjs';
import { FACINGS, CLASSES } from '../../src/data/world/art-budget.js';
import { ROOT } from './build.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const K = 3;
function frames(id, facing) {
  const set = readdirSync(join(ROOT, 'art/world')).find((d) => existsSync(join(ROOT, 'art/world', d, id + '.json')));
  if (!set) throw new Error(id + ': no sidecar under art/world/*');
  const sc = JSON.parse(readFileSync(join(ROOT, 'art/world', set, id + '.json'), 'utf8'));
  const im = decodePNG(readFileSync(join(ROOT, 'art/world', set, id + '.png')));
  const [fw, fh] = (CLASSES[sc.class] && CLASSES[sc.class].frame) || [48, 48];
  const walk = sc.anims.find((a) => a.name === 'walk');
  const row = walk && sc.anims.length > 1 ? FACINGS.length + FACINGS.indexOf(facing) : FACINGS.indexOf(facing);
  const n = (walk || sc.anims[0]).dirs[facing];
  return { fw, fh, anchor: sc.anchor_px, list: Array.from({ length: n }, (_, i) => { const f = createImage(fw, fh); blit(f, im, i * fw, row * fh, fw, fh, 0, 0); return f; }) };
}

export function strip(ids, facing = 's') {
  const sets = ids.map((id) => frames(id, facing));
  const cols = Math.max(...sets.map((s) => s.list.length)), cell = 64 * K;
  const out = createImage(cols * cell, sets.length * cell);
  for (let i = 0; i < out.data.length; i += 4) out.data.set([74, 78, 70, 255], i);
  sets.forEach((s, r) => s.list.forEach((f, c) => {
    const sc = scaleNearest(f, K);
    blit(out, sc, 0, 0, sc.width, sc.height, c * cell, r * cell + (cell - sc.height), true);
    const gy = r * cell + (cell - sc.height) + (s.anchor[1] + 1) * K - 1;
    for (let x = 0; x < cell; x += 4) out.data.set([200, 60, 60, 255], (gy * out.width + c * cell + x) * 4);
  }));
  return out;
}

if (isMain(import.meta.url)) {
  const [id, dir = 'art/review/held-sprites', facing = 's'] = process.argv.slice(2);
  if (!id) { console.error('usage: review-strip.mjs <sprite id> [out dir] [facing]'); process.exit(2); }
  mkdirSync(join(ROOT, dir), { recursive: true });
  writeFileSync(join(ROOT, dir, `${id}_${facing}_walk.png`), encodePNG(strip(['outfit_knight', id], facing)));
  console.log(`wrote ${dir}/${id}_${facing}_walk.png`);
}
