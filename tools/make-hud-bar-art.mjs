#!/usr/bin/env node
// tools/make-hud-bar-art.mjs - draws the action bar's pixel art (ART_DIRECTION §9, 2026-10-22 de-boxing pass).
//   node tools/make-hud-bar-art.mjs            write the four PNGs into assets/ui/
//   node tools/make-hud-bar-art.mjs --check    exit 1 if a committed PNG differs from what this draws
// Hand-drawn by rule, hr-world-56-v2 colours only (art/world/palette.json: shadow, iron, steel, bronze, gold),
// lit from the upper left like the world, shown at the one density (x2, image-rendering: pixelated):
//   bar-plate.png    18x18, slice 6 (12 px): the forged iron plate the bar is mounted on. A lit bevel, a two-tone
//                    band, a dark seam and a rivet in each corner. No fill: the plate's face is the HUD token.
//   bar-crest.png    18x18, slice 6: the raised housing round the vitals hub; the same profile, its corners
//                    clipped one step so it reads as a forged boss rising out of the plate, not a second box.
//   bar-socket.png   6x6, slice 2 (4 px): a slot cut into the plate. Its upper-left wall is in shadow, its
//                    lower-right wall catches the light; no fill, so the floor stays a token (hover, drop, states).
//   bar-medal.png    52x52 (104 px): the hub's medallion. Outer iron bezel with four steel studs, the gauge
//                    channel the HP and mana arcs fill (r 19-23), the inner bezel, a bronze rim the XP arc gilds
//                    (r 14.5-16) and a sunk well for the level. bar-medal-sm.png is the same at 32x32 (64 px, phone).
// The arcs in vitals-hub.js are drawn on a 52-unit viewBox so they land in this art's channel and rim.
import { readFileSync, writeFileSync } from 'node:fs';
import { createImage, encodePNG } from './world-art/png.mjs';
import { isMain } from '../tests/_is-main.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/* hr-world-56-v2 entries only (art/world/palette.json). */
const P = {
  out: '#0b0a0c', sh1: '#17141a',
  i0: '#2c2e33', i1: '#4a4d54', i2: '#6e727a', i3: '#969aa1',
  st1: '#5c6c7a', st3: '#c4ccd2',
  b0: '#4a2e18', b1: '#7a4f26', b2: '#a8743a', b3: '#cfa25c',
};

function img(S) {
  const im = createImage(S, S);
  im.put = (x, y, c) => { if (c && x >= 0 && y >= 0 && x < S && y < S) im.data.set([...hex(c), 255], (y * S + x) * 4); };
  im.clear = (x, y) => im.data.set([0, 0, 0, 0], (y * S + x) * 4);
  return im;
}

/* The plate profile, outside in: outline, lit/dark bevel, two-tone band, seam, cast shadow on the face. */
function plate(S = 18, clip = 0) {
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
  /* Clipped corners (the crest): the outermost `clip` steps of each corner are cut and re-outlined. */
  for (let k = 0; k < clip; k++) for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [S - 1, 0, -1, 1], [0, S - 1, 1, -1], [S - 1, S - 1, -1, -1]]) {
    for (let i = 0; i <= clip - k - 1; i++) im.clear(cx + sx * i, cy + sy * k);
  }
  if (clip) for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [S - 1, 0, -1, 1], [0, S - 1, 1, -1], [S - 1, S - 1, -1, -1]]) {
    for (let k = 0; k <= clip; k++) im.put(cx + sx * (clip - k), cy + sy * k, P.out);
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

/* The medallion on an S grid; radii are fractions of 52 so the phone size keeps the same geometry. */
function medal(S) {
  const im = img(S), c = S / 2, k = S / 52;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy) / k;
    const lit = -(dx + dy) / (Math.hypot(dx, dy) || 1);   // +1 upper-left, -1 lower-right
    let col = null;
    if (d > 26) col = null;
    else if (d > 25) col = P.out;
    else if (d > 23.2) col = lit > 0.4 ? P.i3 : lit < -0.4 ? P.i0 : P.i2;          // outer bezel
    else if (d > 22.6) col = P.out;
    else if (d > 19.4) col = P.sh1;                                                // the gauge channel
    else if (d > 18.6) col = P.out;
    else if (d > 16.4) col = lit > 0.4 ? P.i2 : lit < -0.4 ? P.i0 : P.i1;          // inner bezel
    else if (d > 14.4) col = lit > 0.5 ? P.b1 : P.b0;                              // the bronze rim the XP gilds
    else if (d > 13.4) col = P.out;
    else if (d > 12.4) col = lit > 0 ? P.out : P.i0;                               // the well's cut: shadow up-left
    else col = P.sh1;
    im.put(x, y, col);
  }
  /* Four steel studs on the outer bezel at the compass points (the gauge gaps sit top and bottom). */
  const r = 24.1 * k, s = Math.max(1, Math.round(2 * k));
  for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const px = Math.floor(c + ax * r - s / 2), py = Math.floor(c + ay * r - s / 2);
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) im.put(px + i, py + j, i === 0 && j === 0 ? P.st3 : (i + j === 2 * (s - 1) ? P.out : P.st1));
  }
  return im;
}

export const ART = {
  'bar-plate.png': () => plate(18, 0),
  'bar-crest.png': () => plate(18, 2),
  'bar-socket.png': socket,
  'bar-medal.png': () => medal(52),
  'bar-medal-sm.png': () => medal(32),
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
