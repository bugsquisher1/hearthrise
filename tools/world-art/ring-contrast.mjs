#!/usr/bin/env node
// tools/world-art/ring-contrast.mjs — ART_DIRECTION §4 readability, measured: the ring of body pixels just inside a
// sprite's outline against the median luminance of the floor it stands on. New art passes at 3:1.
//
//   node tools/world-art/ring-contrast.mjs FLOOR.png SPRITE.png[:x,y,w,h] …
//     FLOOR   a crop of the ground the sprite lives on (art/briefs/gen-2026-11-07/refs/floor-ford-mud-64.png)
//     SPRITE  a frame, or a box of a sheet (x,y,w,h) such as a source sheet's first idle cell
//   Prints the ring's median luminance, the floor's, and the ratio; exit 1 when any sprite is under 3:1.
// Read-only and free: a generator checks a candidate with it before handing it in, the art director before an import.
// mutant-anchors: none — a review tool, not a guard
import { readFileSync } from 'node:fs';
import { decodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** The ring's median luminance: opaque pixels, not on the outline, touching an outline pixel. */
export function ringLuminance(im, [bx, by, bw, bh] = [0, 0, im.width, im.height]) {
  const on = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && im.data[((by + y) * im.width + bx + x) * 4 + 3] >= 128;
  const edge = (x, y) => on(x, y) && SIDES.some(([dx, dy]) => !on(x + dx, y + dy));
  const ring = [];
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (on(x, y) && !edge(x, y) && SIDES.some(([dx, dy]) => edge(x + dx, y + dy))) ring.push(lum(im.data, ((by + y) * im.width + bx + x) * 4));
  }
  return ring.length ? median(ring) : null;
}

/** The floor's median luminance. */
export function floorLuminance(im) {
  const all = [];
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) all.push(lum(im.data, i));
  return median(all);
}

export const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * The floor a ground's monsters stand on: the median luminance of the painted ground (a terrain with `painted`, its tiles['1111']
 * cycle) over the tiles of the map's `spawns`, the cells a pack is placed on. Read from the shipped atlas.
 * @param {{spawns: number[][]}} map  @param {{t: object, img: object, T: number}} ter  the ground's terrain row, its atlas, its grid
 */
export function spawnFloorLuminance(map, { t, img, T }) {
  const [cols, crow] = t.cycle || [1, 1];
  const all = [];
  for (const [cx, cy] of map.spawns || []) {
    const [sx, sy] = t.tiles['1111'][(cy % crow) * cols + (cx % cols)];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = ((sy + y) * img.width + sx + x) * 4;
      if (img.data[i + 3] >= 128) all.push(lum(img.data, i));
    }
  }
  return all.length ? median(all) : null;
}

/** The ring of one frame of a shipped atlas sprite: `frame` is its [w, h], `at` the frame's [x, y] on the atlas. */
export const frameRing = (img, at, frame) => ringLuminance(img, [at[0], at[1], frame[0], frame[1]]);

if (isMain(import.meta.url)) {
  const [floorFile, ...specs] = process.argv.slice(2);
  if (!floorFile || !specs.length) { console.error('usage: ring-contrast.mjs FLOOR.png SPRITE.png[:x,y,w,h] …'); process.exit(2); }
  const lf = floorLuminance(decodePNG(readFileSync(floorFile)));
  let under = 0;
  for (const spec of specs) {
    const [file, box] = spec.split(':');
    const lr = ringLuminance(decodePNG(readFileSync(file)), box ? box.split(',').map(Number) : undefined);
    const r = lr === null ? 0 : contrast(lr, lf);
    if (r < 3) under++;
    console.log(`  ${r >= 3 ? 'ok   ' : 'UNDER'} ${spec}: ring ${lr === null ? '-' : lr.toFixed(3)} vs floor ${lf.toFixed(3)} = ${r.toFixed(2)}:1`);
  }
  process.exit(under ? 1 : 0);
}
