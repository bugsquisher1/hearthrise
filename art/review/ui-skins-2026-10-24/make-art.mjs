#!/usr/bin/env node
// art/review/ui-skins-2026-10-24/make-art.mjs — THROWAWAY mock art for the Hunts-window skins (2026-10-24).
//   node art/review/ui-skins-2026-10-24/make-art.mjs      write the PNGs beside this file
// Hand-drawn by rule (the tools/make-hud-bar-art.mjs pattern): hr-world-56-v2 colours only
// (art/world/palette.json), lit from the upper left, every PNG shown at exactly x2 (one art px = 2x2 screen
// px, image-rendering: pixelated); a border-image slice of N art px is always drawn 2N px wide. Not in src/.
//   shared   gold-btn.png / gold-btn-down.png (the primary, raised / pressed), arrow.png, tex-*.png (fills)
//   skin 1   s1-frame.png  thin steel frame, square corner studs (Tyler's "B Forged Steel" reference)
//            s1-swords.png the window's crossed swords, gold; s1-diamond.png the rule's centre
//   skin 2   s2-frame.png  carved stone blocks with mortar joints; s2-chevron.png the gold marker
//   skin 3   s3-frame.png  tooled leather edge with a stitch line; s3-stitch.png a stitched rule; s3-tab.png
import { writeFileSync } from 'node:fs';
import { createImage, encodePNG } from '../../../tools/world-art/png.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const P = {
  out: '#0b0a0c', sh1: '#17141a',
  i0: '#2c2e33', i1: '#4a4d54', i2: '#6e727a', i3: '#969aa1',
  s0: '#3a3a3e', s1: '#4f4e52', s2: '#6a6865', s3: '#8a867d', s4: '#aaa49a',
  b1: '#7a4f26', b2: '#a8743a', b3: '#cfa25c', g: '#e8c547',
};
function img(W, H = W) {
  const im = createImage(W, H);
  im.put = (x, y, c, a = 255) => { if (c && x >= 0 && y >= 0 && x < W && y < H) im.data.set([...hex(c), a], (y * W + x) * 4); };
  return im;
}
const ring = (S, x, y) => Math.min(x, y, S - 1 - x, S - 1 - y);
const litAt = (S, x, y, d) => (x === d && y < S - 1 - d) || (y === d && x < S - 1 - d);

/* SKIN 1 — the thin steel frame: outline, a lit steel line, a dark channel, an inner steel line, outline.
   Each corner is a square stud (6x6) with a lit bevel and a dark centre. Slice 6 (12 px). */
function s1Frame() {
  const S = 16, C = 6, im = img(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = ring(S, x, y), lit = litAt(S, x, y, d);
    let c = null;
    if (d === 0) c = P.out;
    else if (d === 1) c = lit ? P.i3 : P.i2;
    else if (d === 2) c = P.i0;
    else if (d === 3) c = P.sh1;
    else if (d === 4) c = lit ? P.i2 : P.i1;
    else if (d === 5) c = P.out;
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
/* The crossed swords, gold, 14x14: two blades on the diagonals, a guard across each, a pommel. */
function s1Swords() {
  const S = 16, im = img(S);
  /* One sword drawn tip up-left, hilt down-right; the other is its mirror. */
  const put = (flip, x, y, c) => im.put(flip ? S - 1 - x : x, y, c);
  const sword = (flip) => {
    for (let i = 1; i <= 9; i++) { put(flip, i, i, i === 1 ? P.b3 : P.g); put(flip, i + 1, i, P.b2); }   // a two-px blade, lit edge up
    for (let k = -3; k <= 3; k++) put(flip, 11 + k, 10 - k, Math.abs(k) === 3 ? P.b2 : P.b3);            // the guard, across the blade
    put(flip, 12, 12, P.b1); put(flip, 13, 13, P.b1);                                                        // the grip
    put(flip, 14, 14, P.g); put(flip, 15, 14, P.b2); put(flip, 14, 15, P.b2);                               // the pommel
  };
  sword(true); sword(false);
  return im;
}
/* The rule's centre: a small hollow gold diamond, 7x7. */
function s1Diamond() {
  const S = 7, im = img(S), c = 3;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x - c) + Math.abs(y - c);
    if (d === 3) im.put(x, y, x + y < 6 ? P.g : P.b2);
    else if (d === 2) im.put(x, y, P.out);
    else if (d < 2) im.put(x, y, P.b1);
  }
  return im;
}

/* SKIN 2 — carved stone: blocks with a chamfer lit up-left, a face with chisel specks, mortar joints every
   12 art px along the edges, a square block at each corner. Slice 6 (12 px); the edges repeat (24 art px). */
function s2Frame() {
  const S = 24, C = 6, im = img(S);
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = ring(S, x, y), lit = litAt(S, x, y, d);
    if (d > 5) continue;
    let c = d === 0 ? P.out : d === 1 ? (lit ? P.s3 : P.s0) : d === 5 ? P.out : P.s1;
    if (d >= 2 && d <= 4 && rnd() < 0.12) c = rnd() < 0.5 ? P.s2 : P.s0;   // chisel specks
    if (d === 4 && !lit) c = P.s0;
    im.put(x, y, c);
  }
  /* mortar joints: corner blocks cut off from the edges, and one joint in the middle of each edge */
  for (const j of [C - 1, S - C, S / 2]) for (let k = 1; k <= 4; k++) {
    im.put(j, k, P.out); im.put(j, S - 1 - k, P.out); im.put(k, j, P.out); im.put(S - 1 - k, j, P.out);
    im.put(j + 1, k, P.s3); im.put(k, j + 1, P.s3);   // the joint's lit lip
  }
  return im;
}
/* The gold marker for the picked row: a small chevron, 5x7. */
function s2Chevron() {
  const im = img(5, 7);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
    const dy = Math.abs(y - 3);
    if (x === 3 - dy + 1 || x === 3 - dy) im.put(x, y, y < 3 ? P.g : y === 3 ? P.b3 : P.b2);
  }
  return im;
}

/* SKIN 3 — tooled leather: a rolled edge (lit up-left), a stitch line of light thread on a dark groove,
   the corner cut round by two art px. Slice 6 (12 px); the edges repeat (16 art px, stitches every 4). */
function s3Frame() {
  const S = 17, im = img(S);   /* slice 6: the edge's middle is 5 art px, one stitch period (3 on, 2 off) */
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = ring(S, x, y), lit = litAt(S, x, y, d);
    const cx = Math.min(x, S - 1 - x), cy = Math.min(y, S - 1 - y);
    if (cx + cy < 2) continue;                          // the rounded corner
    let c = null;
    if (d === 0 || cx + cy === 2) c = P.out;
    else if (d === 1) c = lit ? P.s3 : P.s1;
    else if (d === 2) c = lit ? P.s2 : P.s0;
    else if (d === 3) {                                 // the stitch line: thread on a groove, 3 on, 2 off
      const along = ((y === 3 || y === S - 4) ? x : y) - 6;
      c = ((along % 5) + 5) % 5 < 3 ? P.s3 : P.sh1;
    } else if (d === 4) c = P.s0;
    else if (d === 5) c = P.out;
    im.put(x, y, c);
  }
  return im;
}
/* A stitched rule: thread 3 on, 2 off, on a dark groove with a lit lip under it, 5x3 (repeat-x). */
function s3Stitch() {
  const im = img(5, 3);
  for (let x = 0; x < 5; x++) { im.put(x, 0, P.sh1); im.put(x, 1, x < 3 ? P.s3 : P.sh1); im.put(x, 2, P.s1); }
  return im;
}
/* The gold ribbon bookmark marking the picked row: 4 art px wide, 22 tall, a notch cut in its end. */
function s3Tab() {
  const W = 4, H = 22, im = img(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y === H - 1 && (x === 1 || x === 2)) continue;   // the notch: two px cut from the middle of the end
    im.put(x, y, x === 0 ? P.g : x === W - 1 ? P.b1 : P.b3);
  }
  return im;
}

/* SHARED — the primary: a raised gold plate. Outline, lit gold up-left, a bronze lip two art px deep along
   the bottom; the face is the fill. Slices 3 3 5 3. The pressed one has no lip and its face sits lower. */
function goldBtn(down) {
  const W = 10, H = 12, im = img(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const top = y, left = x, right = W - 1 - x, bottom = H - 1 - y;
    let c = P.b3;
    if (Math.min(top, left, right, bottom) === 0) c = P.out;
    else if (!down && bottom <= 2) c = bottom === 1 ? P.b1 : P.b2;          // the lip
    else if (down && top === 1) c = P.b1;                                     // pressed: the shadow falls in at the top
    else if (top === 1 || left === 1) c = down ? P.b2 : P.g;
    else if (right === 1 || bottom === (down ? 1 : 3)) c = P.b2;
    im.put(x, y, c);
  }
  return im;
}
/* The button's arrow, ink-dark, 3x5. */
function arrow() {
  const im = img(3, 5);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (x <= 2 - Math.abs(y - 2)) im.put(x, y, P.sh1);
  return im;
}
/* A fill texture: sparse specks over the charcoal token (alpha overlay, deterministic). */
function texture(seed0, n, light, dark, aL, aD, rows = null) {
  const S = 32, im = img(S);
  let seed = seed0; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  if (rows) for (const r of rows) { let x = Math.floor(rnd() * S); const len = 5 + Math.floor(rnd() * 10); for (let i = 0; i < len; i++) im.put((x + i) % S, r, dark, aD); }
  for (let i = 0; i < n; i++) { const l = rnd() < 0.5; im.put(Math.floor(rnd() * S), Math.floor(rnd() * S), l ? light : dark, l ? aL : aD); }
  return im;
}

const ART = {
  'gold-btn.png': () => goldBtn(false), 'gold-btn-down.png': () => goldBtn(true), 'arrow.png': arrow,
  'tex-steel.png': () => texture(3, 34, P.i1, P.out, 34, 60),
  'tex-stone.png': () => texture(5, 70, P.s1, P.out, 40, 70, [6, 19, 27]),
  'tex-leather.png': () => texture(9, 150, P.s1, P.out, 30, 50),
  's1-frame.png': s1Frame, 's1-swords.png': s1Swords, 's1-diamond.png': s1Diamond,
  's2-frame.png': s2Frame, 's2-chevron.png': s2Chevron,
  's3-frame.png': s3Frame, 's3-stitch.png': s3Stitch, 's3-tab.png': s3Tab,
};
for (const [name, draw] of Object.entries(ART)) { writeFileSync(new URL('./' + name, import.meta.url), encodePNG(draw())); console.log('wrote ' + name); }
