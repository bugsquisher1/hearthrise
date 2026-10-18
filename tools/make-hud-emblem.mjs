#!/usr/bin/env node
// tools/make-hud-emblem.mjs - draws assets/ui/emblem-hearth.png, the hunt HUD's level medallion.
//   node tools/make-hud-emblem.mjs
// 32x32 art px (64 px at the x2 density), hr-world-56-v2 colours only: a gold rim over an iron ring,
// lit from the upper left like the world, with a hollow centre for the level number. Four steel studs sit
// on the ring's compass points. It replaces a CSS circle (a web mark on pixel stone, ART_DIRECTION §9).
import { writeFileSync } from 'node:fs';
import { createImage, encodePNG } from './world-art/png.mjs';
import { isMain } from '../tests/_is-main.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = {
  out: '#0b0a0c', rimLit: '#e8c547', rimMid: '#cfa25c', rimDark: '#a8743a', rimEdge: '#4a2e18',
  ironLit: '#969aa1', ironMid: '#6e727a', ironDark: '#4a4d54', well: '#17141a', wellLit: '#2c2e33', stud: '#c4ccd2',
};
const S = 32, c = (S - 1) / 2;

export function emblem() {
  const im = createImage(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy), lit = -(dx + dy) / (d || 1);   // +1 upper-left, -1 lower-right
    let col = null;
    if (d > 16) col = null;
    else if (d > 15) col = C.out;
    else if (d > 13.5) col = lit > 0.45 ? C.rimLit : lit < -0.45 ? C.rimDark : C.rimMid;
    else if (d > 12.5) col = C.rimEdge;
    else if (d > 10.5) col = lit > 0.35 ? C.ironLit : lit < -0.35 ? C.ironDark : C.ironMid;
    else if (d > 9.5) col = lit > 0 ? C.out : C.wellLit;
    else col = C.well;
    if (col) im.data.set([...hex(col), 255], (y * S + x) * 4);
  }
  for (const [x, y] of [[15, 4], [16, 4], [15, 27], [16, 27], [4, 15], [4, 16], [27, 15], [27, 16]]) im.data.set([...hex(C.stud), 255], (y * S + x) * 4);
  return im;
}

if (isMain(import.meta.url)) {
  writeFileSync(new URL('../assets/ui/emblem-hearth.png', import.meta.url), encodePNG(emblem()));
  console.log('wrote assets/ui/emblem-hearth.png (32x32)');
}
