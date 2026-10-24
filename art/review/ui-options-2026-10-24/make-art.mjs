#!/usr/bin/env node
// art/review/ui-options-2026-10-24/make-art.mjs — THROWAWAY mock art for the 2026-10-24 UI options.
//   node art/review/ui-options-2026-10-24/make-art.mjs      write the PNGs into a/ and c/
// Hand-drawn by rule like tools/make-hud-bar-art.mjs: hr-world-56-v2 colours only (art/world/palette.json),
// lit from the upper left, shown at the one density (x2, image-rendering: pixelated). Not wired into src/.
//
// A (Forged): a-win    20x20, slice 7: the window case. Iron bevel + band + seam, a gilded corner cap with a rivet.
//             a-hud    12x12, slice 4: a HUD widget's lighter iron band, a rivet in each corner, no gold.
//             a-plaque 40x20, slices 0 12: the nameplate that hangs over a window's top edge (3-slice, fill).
//             a-btn     8x8,  slice 3: a raised iron plate (the picked tab, a quiet button, a picked row).
//             a-gold    8x8,  slice 3: the struck-gold plate of the one primary action (fill).
//             a-slate  32x32: the slate the windows are cut from, an alpha overlay laid on the charcoal token.
//             a-medal  20x20: a party portrait's iron medal; a-medal-self the gilded one (yours).
//             a-well    3x3,  slice 1: a 1-art-px sunk rim (gauges, trays).
// C (Rails):  c-rail    8x8,  slice 3: the machined lip a rail shows the world on its free sides only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createImage, encodePNG } from '../../../tools/world-art/png.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/* hr-world-56-v2 entries only. */
const P = {
  out: '#0b0a0c', sh1: '#17141a', sh2: '#231d1f',
  i0: '#2c2e33', i1: '#4a4d54', i2: '#6e727a', i3: '#969aa1',
  st1: '#5c6c7a', st3: '#c4ccd2',
  b2: '#a8743a', b3: '#cfa25c', g: '#e8c547',
};

function img(W, H = W) {
  const im = createImage(W, H);
  im.put = (x, y, c, a = 255) => { if (c && x >= 0 && y >= 0 && x < W && y < H) im.data.set([...hex(c), a], (y * W + x) * 4); };
  return im;
}
const rivet = (im, x, y) => { im.put(x, y, P.st3); im.put(x + 1, y, P.st1); im.put(x, y + 1, P.st1); im.put(x + 1, y + 1, P.out); };

/* A (Forged) — the window case: outline, lit/dark bevel, two-tone band, seam, an inner lip; gilded caps in the corners. */
function aWin(S = 20, cap = 7) {
  const im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const lit = (x === d && y < S - 1 - d) || (y === d && x < S - 1 - d);
    const corner = (x < cap || x > S - 1 - cap) && (y < cap || y > S - 1 - cap);
    /* The cap is a gilded plate over the whole band in each corner (lit on its upper-left faces), cut off from the
       iron by a dark seam; a steel rivet sits in it. */
    const seam = corner && ((x === cap - 1 || x === S - cap) || (y === cap - 1 || y === S - cap)) && d >= 1 && d <= 4;
    let c = null;
    if (d === 0) c = P.out;
    else if (seam) c = P.out;
    else if (d === 1) c = corner ? (lit ? P.g : P.b2) : (lit ? P.i3 : P.i0);
    else if (d === 2) c = corner ? (lit ? P.b3 : P.b2) : (lit ? P.i2 : P.i1);
    else if (d === 3) c = corner ? P.b3 : P.i1;
    else if (d === 4) c = corner ? P.b2 : P.i0;
    else if (d === 5) c = P.out;
    else if (d === 6) c = lit ? P.out : null;   // the case's shadow falls on the face's upper-left lip only
    im.put(x, y, c);
  }
  for (const [x, y] of [[3, 3], [S - 5, 3], [3, S - 5], [S - 5, S - 5]]) rivet(im, x, y);
  return im;
}

/* A — a HUD widget's band: lighter than the window (outline, bevel, band, seam), a rivet in each corner. */
function aHud(S = 14, cap = 5) {
  const im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const lit = (x === d && y < S - 1 - d) || (y === d && x < S - 1 - d);
    const corner = (x < cap || x > S - 1 - cap) && (y < cap || y > S - 1 - cap);
    let c = null;
    if (d === 0) c = P.out;
    else if (d === 1) c = corner ? (lit ? P.i3 : P.i1) : (lit ? P.i2 : P.i0);
    else if (d === 2) c = corner ? P.i2 : P.i1;
    else if (d === 3) c = corner ? P.i1 : P.out;
    else if (d === 4) c = corner ? P.out : null;
    im.put(x, y, c);
  }
  /* an iron corner plate with a steel rivet: the widget is bolted, not bordered */
  for (const [x, y] of [[1, 1], [S - 4, 1], [1, S - 4], [S - 4, S - 4]]) rivet(im, x + 1, y + 1);
  return im;
}

/* A — the nameplate: an iron bar with pointed, gilded ends and a gilt line top and bottom; the middle stretches. */
function aPlaque(W = 40, H = 20, end = 12) {
  const im = img(W, H);
  const mid = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = x < end ? end - x : x > W - 1 - end ? x - (W - 1 - end) : 0;   // how far into a pointed end
    const half = mid - Math.max(0, ex - 3) * 0.95;                               // the end tapers to a point
    const dy = Math.abs(y - mid);
    if (dy > half + 0.5) continue;
    const edge = dy > half - 0.5;
    const top = y < mid;
    let c;
    if (edge) c = P.out;
    else if (dy > half - 1.5) c = top ? P.g : P.b2;                      // the gilt rim, lit on top
    else if (dy > half - 2.5) c = top ? P.b3 : P.b2;
    else if (dy > half - 3.5) c = P.out;                                 // the seam inside the gilt
    else c = top && dy > half - 4.5 ? P.i1 : P.i0;                       // the iron face, a lit line under the seam
    im.put(x, y, c);
  }
  /* a gold stud at each end's widest point */
  for (const sx of [end - 4, W - end + 2]) { im.put(sx, Math.floor(mid), P.g); im.put(sx + 1, Math.floor(mid), P.b3); im.put(sx, Math.floor(mid) + 1, P.b2); im.put(sx + 1, Math.floor(mid) + 1, P.out); }
  return im;
}

/* A — a raised plate (8x8, slice 3): lit bevel up-left, dark down-right, the face left to the token. */
function aBtn(gold = false) {
  const S = 8, im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const lit = (x === d && y < S - 1 - d) || (y === d && x < S - 1 - d);
    let c = null;
    if (d === 0) c = P.out;
    else if (d === 1) c = gold ? (lit ? P.g : P.b2) : (lit ? P.i2 : P.out);
    else if (d === 2) c = gold ? P.b3 : (lit ? P.i1 : P.i0);
    else c = gold ? P.b3 : null;   // gold is a solid plate (fill); iron keeps the token face
    im.put(x, y, c);
  }
  return im;
}

/* A — slate: sparse strata and specks over the charcoal token (alpha overlay, deterministic). */
function aSlate(S = 32) {
  const im = img(S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const row of [3, 9, 14, 22, 27]) {           // cleavage lines, broken, never a grid
    let x = Math.floor(rnd() * S);
    const len = 6 + Math.floor(rnd() * 12);
    for (let i = 0; i < len; i++) { im.put((x + i) % S, row + (i > len / 2 && rnd() > 0.7 ? 1 : 0), P.out, 110); }
    x = (x + len + 2) % S;
    for (let i = 0; i < 3; i++) im.put((x + i) % S, row + 1, P.i1, 40);   // the lit lip under a cleavage
  }
  for (let i = 0; i < 26; i++) im.put(Math.floor(rnd() * S), Math.floor(rnd() * S), rnd() > 0.5 ? P.i1 : P.out, rnd() > 0.5 ? 46 : 70);
  return im;
}

/* A — a portrait medal: iron (or gilded) bezel, four studs, a sunk well. */
function aMedal(S = 20, gilt = false) {
  const im = img(S), c = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
    const lit = -(dx + dy) / (d || 1);
    let col = null;
    if (d > c) col = null;
    else if (d > c - 1) col = P.out;
    else if (d > c - 3) col = gilt ? (lit > 0.4 ? P.g : lit < -0.4 ? P.b2 : P.b3) : (lit > 0.4 ? P.i3 : lit < -0.4 ? P.i0 : P.i2);
    else if (d > c - 4) col = P.out;
    else if (d > c - 5) col = lit > 0 ? P.out : P.i0;
    else col = P.sh1;
    im.put(x, y, col);
  }
  for (const [x, y] of [[c - 1, 1], [S - 3, c - 1], [c - 1, S - 3], [1, c - 1]]) { im.put(x, y, gilt ? P.g : P.st3); im.put(x + 1, y + 1, P.out); }
  return im;
}

/* A — a 1-art-px sunk rim: shadow up-left, a lit lip down-right (3x3, slice 1). */
function aWell() {
  const im = img(3);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    if (x === 1 && y === 1) continue;
    const tl = x === 0 || y === 0;
    im.put(x, y, tl && !(x === 2 || y === 2) ? P.out : (x === 0 && y === 2) || (x === 2 && y === 0) ? P.i0 : P.i1);
  }
  return im;
}

/* C (Rails) — the machined lip: lit outer line up-left, shadow down-right, a band, the face left to the token. */
function cRail() {
  const S = 8, im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const lit = (x === d && y < S - 1 - d) || (y === d && x < S - 1 - d);
    let c = null;
    if (d === 0) c = lit ? P.i2 : P.out;
    else if (d === 1) c = lit ? P.i1 : P.i0;
    else if (d === 2) c = P.out;
    im.put(x, y, c);
  }
  return im;
}

const ART = {
  'a/a-win.png': () => aWin(),
  'a/a-hud.png': () => aHud(),
  'a/a-plaque.png': () => aPlaque(),
  'a/a-btn.png': () => aBtn(false),
  'a/a-gold.png': () => aBtn(true),
  'a/a-slate.png': () => aSlate(),
  'a/a-medal.png': () => aMedal(20, false),
  'a/a-medal-self.png': () => aMedal(20, true),
  'a/a-well.png': () => aWell(),
  'c/c-rail.png': () => cRail(),
};

for (const [name, draw] of Object.entries(ART)) {
  const url = new URL('./' + name, import.meta.url);
  mkdirSync(new URL('.', url), { recursive: true });
  writeFileSync(url, encodePNG(draw()));
  console.log('wrote ' + name);
}
