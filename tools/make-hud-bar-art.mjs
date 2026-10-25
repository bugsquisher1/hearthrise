#!/usr/bin/env node
// tools/make-hud-bar-art.mjs - draws the action bar's pixel art (ART_DIRECTION §9, 2026-10-22 de-boxing pass).
//   node tools/make-hud-bar-art.mjs            write the two PNGs into assets/ui/
//   node tools/make-hud-bar-art.mjs --check    exit 1 if a committed PNG differs from what this draws
// Hand-drawn by rule, hr-world-56-v2 colours only (art/world/palette.json: shadow, iron, steel),
// lit from the upper left like the world, shown at the one density (x2, image-rendering: pixelated):
//   bar-plate.png    18x18, slice 6 (12 px): the forged iron plate the bar is mounted on. A lit bevel, a two-tone
//                    band, a dark seam and a rivet in each corner. No fill: the plate's face is the HUD token.
//   bar-socket.png   6x6, slice 2 (4 px): a slot cut into the plate. Its upper-left wall is in shadow, its
//                    lower-right wall catches the light; no fill, so the floor stays a token (hover, drop, states).
// The hub's ring is no longer pixel art: Tyler 10-25 ("the circle just needs to be smoothed out") made it one smooth
// vector ring (vitals-hub.js), so bar-medal.png and bar-medal-sm.png are retired.
import { readFileSync, writeFileSync } from 'node:fs';
import { createImage, encodePNG } from './world-art/png.mjs';
import { isMain } from '../tests/_is-main.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/* hr-world-56-v2 entries only (art/world/palette.json). */
const P = {
  out: '#0b0a0c', sh1: '#17141a',
  i0: '#2c2e33', i1: '#4a4d54', i2: '#6e727a', i3: '#969aa1',
  st1: '#5c6c7a', st3: '#c4ccd2',
};

function img(S) {
  const im = createImage(S, S);
  im.put = (x, y, c) => { if (c && x >= 0 && y >= 0 && x < S && y < S) im.data.set([...hex(c), 255], (y * S + x) * 4); };
  im.clear = (x, y) => im.data.set([0, 0, 0, 0], (y * S + x) * 4);
  return im;
}

/* The plate profile, outside in: outline, lit/dark bevel, two-tone band, seam, cast shadow on the face. */
function plate(S = 18) {
  const im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const lit = (x === d && y < S - 1 - d) || (y === d && x < S - 1 - d);
    let c = null;
    if (d === 0) c = P.out;
    else if (d === 1) c = lit ? P.i3 : P.i0;
    else if (d === 2) c = lit ? P.i2 : P.i1;
    else if (d === 3) c = P.i1;
    else if (d === 4) c = P.out;
    else if (d === 5) c = lit ? P.out : null;   // the frame's shadow falls on the face's upper-left edge only
    im.put(x, y, c);
  }
  /* A rivet in each corner of the band: a steel head, lit upper-left, its shadow down-right. */
  for (const [x, y] of [[2, 2], [S - 4, 2], [2, S - 4], [S - 4, S - 4]]) {
    im.put(x, y, P.st3); im.put(x + 1, y, P.st1); im.put(x, y + 1, P.st1); im.put(x + 1, y + 1, P.out);
  }
  return im;
}

/* A socket: no outline of its own (containment is earned), only the cut: shadowed upper-left walls, a lit lower-right lip. */
function socket() {
  const S = 6, im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const tl = (x === d && y <= S - 1 - d) || (y === d && x <= S - 1 - d);
    let c = null;
    if (d === 0) c = tl ? P.out : P.i1;
    else if (d === 1) c = tl ? P.sh1 : P.i0;
    im.put(x, y, c);
  }
  /* The two corners where the shadow meets the lit lip split on the diagonal. */
  im.put(S - 1, 0, P.i0); im.put(0, S - 1, P.i0);
  return im;
}

export const ART = {
  'bar-plate.png': () => plate(18),
  'bar-socket.png': socket,
};

if (isMain(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const [name, draw] of Object.entries(ART)) {
    const url = new URL('../assets/ui/' + name, import.meta.url);
    const png = encodePNG(draw());
    if (check) {
      let same = false;
      try { same = Buffer.compare(readFileSync(url), Buffer.from(png)) === 0; } catch { same = false; }
      if (!same) { bad++; console.log('differs: assets/ui/' + name); }
    } else { writeFileSync(url, png); console.log('wrote assets/ui/' + name); }
  }
  if (check) { console.log(bad ? bad + ' bar art file(s) differ from tools/make-hud-bar-art.mjs' : 'bar art matches its tool'); process.exit(bad ? 1 : 0); }
}
