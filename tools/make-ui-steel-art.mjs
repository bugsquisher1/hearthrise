#!/usr/bin/env node
// tools/make-ui-steel-art.mjs - draws the FORGED STEEL chrome (Tyler approved skin 1 on 2026-10-24; ART_DIRECTION §9).
//   node tools/make-ui-steel-art.mjs             write the PNGs into assets/ui/
//   node tools/make-ui-steel-art.mjs --check     exit 1 if a committed PNG differs from what this draws
//   node tools/make-ui-steel-art.mjs --selftest  prove --check bites: one changed pixel in each PNG is caught
// Hand-drawn by rule, hr-world-56-v2 colours only (art/world/palette.json: shadow, iron, bronze, gold), lit from
// the upper left like the world, shown at the one density: every art pixel is 2x2 screen px (image-rendering:
// pixelated), so a border-image slice of N art px is always drawn 2N px wide. The fills stay tokens (CSS).
//   steel-frame.png       16x16, slice 6 (12 px): a window's thin steel frame, a square stud in each corner
//   steel-frame-thin.png   8x8,  slice 3 (6 px): tooltips, menus, fold-outs, phone dialogs, HUD panels
//   steel-grain.png       32x32: sparse specks laid over a panel's fill (alpha; it fades with the fill)
//   steel-diamond.png      7x7: the small gold diamond at the middle of a heading's rule
//   gold-plate.png        10x12, slice 3 3 5 3: the one primary action, a raised gold plate with a lip
//   gold-plate-down.png   10x12, the same plate pressed (no lip, the shadow falls in at the top)
//   steel-arrow.png        3x5: the dark arrow on a primary that goes somewhere (Enter)
//   ground-shadow.png     24x5: the shadow a creature stands on in a window (shadow at half alpha)
import { readFileSync, writeFileSync } from 'node:fs';
import { createImage, encodePNG, decodePNG } from './world-art/png.mjs';
import { isMain } from '../tests/_is-main.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/* hr-world-56-v2 entries only (art/world/palette.json). */
const P = {
  out: '#0b0a0c', sh1: '#17141a',
  i0: '#2c2e33', i1: '#4a4d54', i2: '#6e727a', i3: '#969aa1',
  b1: '#7a4f26', b2: '#a8743a', b3: '#cfa25c', g: '#e8c547',
};

function img(W, H = W) {
  const im = createImage(W, H);
  im.put = (x, y, c, a = 255) => { if (c && x >= 0 && y >= 0 && x < W && y < H) im.data.set([...hex(c), a], (y * W + x) * 4); };
  return im;
}
const ring = (S, x, y) => Math.min(x, y, S - 1 - x, S - 1 - y);
const litAt = (S, x, y, d) => (x === d && y < S - 1 - d) || (y === d && x < S - 1 - d);

/* The window frame: outline, a lit steel line, a dark channel, an inner steel line, outline; a 6x6 square stud
   in each corner (outline, a lit bevel, a dark centre). */
function frame() {
  const S = 16, C = 6, im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = ring(S, x, y), lit = litAt(S, x, y, d);
    const c = d === 0 ? P.out : d === 1 ? (lit ? P.i3 : P.i2) : d === 2 ? P.i0 : d === 3 ? P.sh1 : d === 4 ? (lit ? P.i2 : P.i1) : d === 5 ? P.out : null;
    im.put(x, y, c);
  }
  for (const [ox, oy] of [[0, 0], [S - C, 0], [0, S - C], [S - C, S - C]]) {
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const d = ring(C, x, y), lit = litAt(C, x, y, d);
      im.put(ox + x, oy + y, d === 0 ? P.out : d === 1 ? (lit ? P.i3 : P.i0) : P.sh1);
    }
  }
  return im;
}

/* The thin frame: outline, a lit steel line, outline; a 3x3 stud in each corner with one lit pixel. */
function thin() {
  const S = 8, C = 3, im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = ring(S, x, y), lit = litAt(S, x, y, d);
    im.put(x, y, d === 0 ? P.out : d === 1 ? (lit ? P.i2 : P.i1) : d === 2 ? P.out : null);
  }
  for (const [ox, oy] of [[0, 0], [S - C, 0], [0, S - C], [S - C, S - C]]) {
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) im.put(ox + x, oy + y, x === 1 && y === 1 ? P.i3 : P.out);
  }
  return im;
}

/* Sparse specks over the fill: a few lit, more dark, never a grid (a fixed seed, so --check is exact). */
function grain() {
  const S = 32, im = img(S);
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 34; i++) { const lit = rnd() < 0.5; im.put(Math.floor(rnd() * S), Math.floor(rnd() * S), lit ? P.i1 : P.out, lit ? 34 : 60); }
  return im;
}

/* A hollow gold diamond: lit gold up-left, bronze down-right, an outline inside, a bronze heart. */
function diamond() {
  const S = 7, c = 3, im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x - c) + Math.abs(y - c);
    if (d === 3) im.put(x, y, x + y < 6 ? P.g : P.b2);
    else if (d === 2) im.put(x, y, P.out);
    else if (d < 2) im.put(x, y, P.b1);
  }
  return im;
}

/* The primary: a gold plate, lit gold up-left, a bronze lip two art px deep along the bottom; the face is the
   plate's own gold (fill). Pressed, the lip is gone and the shadow falls in along the top. */
function plate(down) {
  const W = 10, H = 12, im = img(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const top = y, left = x, right = W - 1 - x, bottom = H - 1 - y;
    let c = P.b3;
    if (Math.min(top, left, right, bottom) === 0) c = P.out;
    else if (!down && bottom <= 2) c = bottom === 1 ? P.b1 : P.b2;
    else if (down && top === 1) c = P.b1;
    else if (top === 1 || left === 1) c = down ? P.b2 : P.g;
    else if (right === 1 || bottom === (down ? 1 : 3)) c = P.b2;
    im.put(x, y, c);
  }
  return im;
}

/* A dark arrow pointing right, for a primary that takes you somewhere. */
function arrow() {
  const im = img(3, 5);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (x <= 2 - Math.abs(y - 2)) im.put(x, y, P.sh1);
  return im;
}

/* The ground a creature stands on: a flat pixel ellipse, the shadow colour at half alpha. */
function groundShadow() {
  const W = 24, H = 5, im = img(W, H), cx = (W - 1) / 2, cy = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / (W / 2)) ** 2 + ((y - cy) / (H / 2)) ** 2 <= 1) im.put(x, y, P.out, 128);
  return im;
}

export const ART = {
  'steel-frame.png': frame,
  'steel-frame-thin.png': thin,
  'steel-grain.png': grain,
  'steel-diamond.png': diamond,
  'gold-plate.png': () => plate(false),
  'gold-plate-down.png': () => plate(true),
  'steel-arrow.png': arrow,
  'ground-shadow.png': groundShadow,
};

const urlOf = (name) => new URL('../assets/ui/' + name, import.meta.url);
/** The names whose committed PNG differs from what ART draws (`read` returns the committed bytes, or throws). */
export function differing(read = (name) => readFileSync(urlOf(name))) {
  const bad = [];
  for (const [name, draw] of Object.entries(ART)) {
    let same = false;
    try { same = Buffer.compare(read(name), Buffer.from(encodePNG(draw()))) === 0; } catch { same = false; }
    if (!same) bad.push(name);
  }
  return bad;
}

if (isMain(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === '--check') {
    const bad = differing();
    for (const n of bad) console.log('differs: assets/ui/' + n);
    console.log(bad.length ? bad.length + ' steel art file(s) differ from tools/make-ui-steel-art.mjs' : 'steel art matches its tool');
    process.exit(bad.length ? 1 : 0);
  } else if (arg === '--selftest') {
    /* Each PNG with ONE pixel changed must be caught, and the untouched set must pass. */
    const fails = [];
    if (differing().length) fails.push('the committed art differs before any mutant (run without flags, then commit)');
    for (const name of Object.keys(ART)) {
      const im = decodePNG(readFileSync(urlOf(name)));
      im.data[3] = im.data[3] === 255 ? 254 : 255;   // the top-left pixel's alpha
      const planted = Buffer.from(encodePNG(im));
      const caught = differing((n) => (n === name ? planted : readFileSync(urlOf(n))));
      if (!caught.includes(name)) fails.push('a changed pixel in ' + name + ' was not caught');
    }
    for (const f of fails) console.log('SELFTEST: ' + f);
    console.log(fails.length ? 'make-ui-steel-art --selftest RED' : 'make-ui-steel-art --selftest: ' + Object.keys(ART).length + ' of ' + Object.keys(ART).length + ' planted pixels caught');
    process.exit(fails.length ? 1 : 0);
  } else {
    for (const [name, draw] of Object.entries(ART)) { writeFileSync(urlOf(name), encodePNG(draw())); console.log('wrote assets/ui/' + name); }
  }
}
