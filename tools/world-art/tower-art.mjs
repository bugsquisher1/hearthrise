#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-art.mjs — THE HEARTH CHEST AND ITS REVEALS (lane/a-tower-art, 2026-11-16; 0 generations).
//
// The Burning Tower's chest (Tyler 2026-11-14: "burning tower chests that sit on the ledge of the Great Hearth"; ONE chest, "varies loot
// based on the key"; the locked story: "the Keepers locked them all in one big chest on the ledge, with a different lock for the better
// ones"). It is the style-1 iron-bound chest the cottage already ships (art/world/cottage/chest_iron: PixelLab image 75c00296 cell 1,
// its shipped, palette-locked pixels in assets/world/atlas-cottage.png) with its one latch replaced by FOUR lock plates, one in each
// key's metal, left to right Bronze, Silver, Gold, Platinum. The world's rule (tools/world-art/style1.mjs): a thing that stands in the
// world comes from the kit, so this tool paints on the kit's chest and never draws a new one. Every pixel is a palette entry
// (art/world/palette.json hr-world-56-v2), binary alpha, nothing scaled.
//
//   art/world/common/hearth_chest.png (+ .json)   the chest on the Hearth's ledge (src/data/world/town/sites.js AMBIENT)
//   assets/ui/tower/chest-open-<key>.png          THE KEY'S OPENING (the Tower window's Chest tab, src/shell/windows/tower-chest.js):
//                                                  8 frames of 48x48 in a row, 10 fps, shown at x3: the key's own lock catches the
//                                                  light, the lid cracks on a line of fire, lifts, and embers climb out
//   assets/ui/tower/chest-column-<key>.png        THE WEAPON'S REVEAL over the open chest's last frame: 4 frames of 48x48, a stepped
//                                                  light column in the key's metal rising out of it (three bands, no bloom:
//                                                  ART_DIRECTION §8); the weapon's own icon rises in it (CSS, whole pixels)
// The lid's open poses (UI only) are painted here on the kit's chest: its own wood and iron, its inside lit by the haul.
// A key row with no metal here is a finding (a later key is a row in src/data/chests.js CHEST_KEYS; its lock and column need a ramp).
//
//   node tools/world-art/tower-art.mjs           write them
//   node tools/world-art/tower-art.mjs --check   exit 1 when a written file differs from a fresh drawing, or a key has no metal
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG, decodePNG } from './png.mjs';
import { CHEST_KEYS } from '../../src/data/chests.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* the kit's chest, as shipped (its locked pixels) */
const BASE = Object.freeze({ set: 'cottage', id: 'chest_iron' });

/* the palette entries the paint uses (hr-world-56-v2) */
const C = Object.freeze({
  K: '#0b0a0c', k1: '#17141a', k2: '#231d1f', k3: '#2f2723',
  e0: '#2a1c14', e1: '#3d2a1d', e2: '#553a26', e3: '#6e4c30',
  i0: '#2c2e33', s0: '#3a3a3e', s1: '#4f4e52', s2: '#6a6865',
  ember: '#c23a2a', flame: '#f2a03a', hot: '#ffd36a',
});
/* EACH KEY'S METAL: its lock plate and its column, dark to light (palette ramps: bronze, steel, bronze-and-gold, mithril) */
export const METALS = Object.freeze({
  bronze: Object.freeze(['#4a2e18', '#a8743a', '#cfa25c']),
  silver: Object.freeze(['#3a4652', '#8a9aa8', '#c4ccd2']),
  gold: Object.freeze(['#a8743a', '#e8c547', '#ffd36a']),
  platinum: Object.freeze(['#4f7a80', '#86b4b4', '#c8e6e0']),
});

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function put(img, x, y, hex) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const [r, g, b] = rgb(hex);
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
}
function clear(img, x, y) { if (x >= 0 && y >= 0 && x < img.width && y < img.height) img.data[(y * img.width + x) * 4 + 3] = 0; }
const opaque = (img, x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] === 255;
/* one dark outline round what was painted in the box: every empty pixel touching a drawn one (4 ways) */
function outline(img, x0, y0, w, h) {
  const add = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (opaque(img, x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => opaque(img, x + dx, y + dy))) add.push([x, y]);
  }
  for (const [x, y] of add) put(img, x, y, C.K);
}

/** The kit's chest as shipped: { w, h, ax, ay, px } (RGBA of its one frame). */
export function kitChest() {
  const m = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + BASE.set + '.json'), 'utf8'));
  const s = m.sprites[BASE.id];
  if (!s) throw new Error('the kit chest ' + BASE.id + ' is not in atlas-' + BASE.set);
  const [sx, sy] = s.anims.idle.dirs.s[0];
  const [w, h] = s.frame;
  const sheet = decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-' + BASE.set + '.png')));
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((sy + y) * sheet.width + sx + x) * 4;
    px.set(sheet.data.subarray(i, i + 4), (y * w + x) * 4);
  }
  return { w, h, ax: s.anchor[0], ay: s.anchor[1], px };
}

/* WHERE THE KIT CHEST IS: its 18 x 18 frame, the lid rows 0..11 (its lip 10..11), the front 12..17; the latch was x 7..10, rows 12..15.
   The four plates, 2 x 3 each, on the front band, rows 12..14. */
const LID_TO = 11, PLATES = Object.freeze([3, 6, 10, 13]), PLATE_Y = 12;

/* THE CHEST at (ox, oy) in `img`. lid: 0 shut, 1 cracked on a line of fire, 2 half up, 3 open; lit: a key's lock catching the light. */
function chest(img, ox, oy, o = {}) {
  const base = kitChest();
  const lid = o.lid || 0;
  const up = lid === 1 ? 1 : 0;
  for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) {
    const i = (y * base.w + x) * 4;
    if (base.px[i + 3] < 128) continue;
    if (lid >= 2 && y <= LID_TO) continue;
    const hex = '#' + [0, 1, 2].map((k) => base.px[i + k].toString(16).padStart(2, '0')).join('');
    put(img, ox + x, oy + y - (y <= LID_TO ? up : 0), hex);
  }
  /* the latch's iron, gone: the front band's own wood and iron under the plates */
  for (let y = 12; y <= 15; y++) for (let x = 7; x <= 10; x++) put(img, ox + x, oy + y, y === 12 ? C.k2 : y === 15 ? C.k3 : x === 7 || x === 10 ? C.s0 : C.e1);
  /* THE FOUR LOCKS (Bronze, Silver, Gold, Platinum, left to right) */
  CHEST_KEYS.slice(0, PLATES.length).forEach((k, n) => {
    const m = METALS[k.id];
    const x0 = ox + PLATES[n], y0 = oy + PLATE_Y, on = o.lit === k.id;
    const rows = on ? [[C.hot, m[2]], [m[2], C.hot], [m[1], m[1]]] : [[m[2], m[1]], [m[1], C.K], [m[0], m[0]]];
    rows.forEach((r, dy) => r.forEach((c, dx) => put(img, x0 + dx, y0 + dy, c)));
  });
  if (lid === 1) for (let x = 2; x < base.w - 2; x++) put(img, ox + x, oy + LID_TO, x % 4 === 1 ? C.hot : C.flame);
  if (lid >= 2) {
    /* THE MOUTH, rows 8..11: the box's rim (its own iron), the back wall in shadow, the haul alight in the middle */
    for (let y = 8; y <= LID_TO; y++) for (let x = 0; x < base.w; x++) {
      const rim = x <= 1 || x >= base.w - 2 || y === LID_TO;
      const mid = Math.abs(x - 8.5);
      let c = rim ? (y === LID_TO ? C.s1 : x <= 1 ? C.s2 : C.s0) : y === 8 ? C.k1 : C.k2;
      if (!rim && y >= 9 && mid < 6) c = mid < 2 && y === 10 ? C.hot : mid < 4 ? C.flame : C.ember;
      put(img, ox + x, oy + y, c);
    }
    /* THE LID, up behind the mouth: half (2) a short band, open (3) its whole underside, oak in shadow, its far edge iron, lit from below */
    const tall = lid === 2 ? 3 : 7;
    for (let y = 0; y < tall; y++) for (let x = 1; x < base.w - 1; x++) {
      let c = y === 0 ? C.s1 : (x <= 2 || x >= base.w - 3 ? C.i0 : y % 3 === 1 ? C.e0 : C.e1);
      if (y >= tall - 2 && Math.abs(x - 8.5) < (y === tall - 1 ? 6 : 3)) c = y === tall - 1 ? C.ember : C.e3;
      put(img, ox + x, oy + 8 - tall + y, c);
    }
  }
  if (lid >= 2) outline(img, ox - 2, oy - 8, base.w + 4, base.h + 10);
}

/* THE FIRE'S LIGHT ON IT: the Great Hearth's fire burns just right of the chest (its 8-frame loop at 8 fps, hearth_fire), so the chest's
   right-hand iron takes that light, one value step up its own stone ramp, over more or fewer of its rows frame by frame. An ambient row
   loops on the town's clock (tests/world-core.mjs W2), and in town something always moves (ART_DIRECTION §3). */
export const FLICKER = Object.freeze([1, 2, 4, 3, 5, 2, 3, 1]);
const STEP_UP = Object.freeze({ '#2f2723': '#3a3a3e', '#3a3a3e': '#4f4e52', '#4f4e52': '#6a6865', '#6a6865': '#8a867d', '#6e727a': '#969aa1' });

/** THE CHEST ON THE LEDGE: the kit chest's frame with its four locks, 8 frames of the fire's light in a row (18 x 18 each). */
export function drawChest() {
  const b = kitChest();
  const img = createImage(b.w * FLICKER.length, b.h);
  FLICKER.forEach((rows, f) => {
    const one = createImage(b.w, b.h);
    chest(one, 0, 0);
    /* the lit rows: the right-hand iron (x 14..17) from the lid's top down `rows` x 2 rows */
    for (let y = 1; y < Math.min(b.h - 1, 1 + rows * 2); y++) for (let x = 14; x < b.w; x++) {
      const i = (y * b.w + x) * 4;
      if (one.data[i + 3] !== 255) continue;
      const hex = '#' + [0, 1, 2].map((k) => one.data[i + k].toString(16).padStart(2, '0')).join('');
      if (STEP_UP[hex]) put(one, x, y, STEP_UP[hex]);
    }
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const i = (y * b.w + x) * 4;
      img.data.set(one.data.subarray(i, i + 4), (y * img.width + f * b.w + x) * 4);
    }
  });
  return img;
}

/* Embers climbing out of an open chest: a fixed set, each a pixel, higher and fewer frame by frame. [dx, rise, kind] */
const EMBERS = Object.freeze([[-7, 2, 1], [-4, 5, 0], [-1, 1, 2], [1, 6, 1], [3, 3, 0], [6, 5, 2], [8, 1, 1], [-6, 8, 2], [2, 9, 0], [-2, 11, 1], [5, 10, 2]]);
function embers(img, cx, mouthY, step) {
  for (const [dx, rise, kind] of EMBERS) {
    const y = mouthY - rise - step * 4;
    if (y < 1 || step * 3 + kind > 11) continue;
    const drift = Math.round(Math.sin((rise + step) * 1.7));
    put(img, cx + dx + drift, y, kind === 0 ? C.hot : kind === 1 ? C.flame : C.ember);
  }
}

const FW = 48, FH = 48, OX = 15, OY = 29;   /* the chest's top-left in a 48 x 48 frame: its foot on row 46 */
/** THE KEY'S OPENING, 8 frames of 48 x 48 in a row. */
export function drawOpen(keyId) {
  if (!METALS[keyId]) throw new Error('no metal for key ' + keyId);
  const n = 8, img = createImage(FW * n, FH);
  const plan = [{ lid: 0 }, { lid: 0, lit: keyId }, { lid: 1, lit: keyId }, { lid: 2, e: 0 }, { lid: 3, e: 0 }, { lid: 3, e: 1 }, { lid: 3, e: 2 }, { lid: 3, e: 3 }];
  plan.forEach((s, i) => {
    const one = createImage(FW, FH);
    chest(one, OX, OY, s);
    if (s.e !== undefined) embers(one, OX + 9, OY + 8, s.e);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const a = (y * FW + x) * 4, b = (y * img.width + i * FW + x) * 4;
      img.data.set(one.data.subarray(a, a + 4), b);
    }
  });
  return img;
}

/** THE WEAPON'S COLUMN, 4 frames of 48 x 48 in a row, over the opening's last frame: three bands of the key's metal, rising. */
export function drawColumn(keyId) {
  const m = METALS[keyId];
  if (!m) throw new Error('no metal for key ' + keyId);
  const n = 4, img = createImage(FW * n, FH);
  const cx = OX + 8, foot = OY + 9;
  [10, 20, 30, 30].forEach((r, i) => {
    const top = foot - r;
    /* three straight bands, the outer shortest: the head steps in, the lightest band alone at its tip; the last frame shimmers */
    for (const [w, c, drop] of [[4, m[0], 5], [2, m[1], 2], [0, m[2], 0]]) {
      for (let y = top + drop; y <= foot; y++) {
        const cc = c === m[2] && i === 3 && (y & 2) ? m[1] : c;
        for (let x = cx - w; x <= cx + w + 1; x++) put(img, i * FW + x, y, cc);
      }
    }
  });
  for (let i = 0; i < FW * n * FH; i++) if (img.data[i * 4 + 3] !== 255) clear(img, i % (FW * n), Math.floor(i / (FW * n)));
  return img;
}

/** Every file this tool writes: path -> PNG bytes. */
export function drawAll() {
  const out = new Map();
  out.set('art/world/common/hearth_chest.png', encodePNG(drawChest()));
  for (const k of CHEST_KEYS) {
    out.set('assets/ui/tower/chest-open-' + k.id + '.png', encodePNG(drawOpen(k.id)));
    out.set('assets/ui/tower/chest-column-' + k.id + '.png', encodePNG(drawColumn(k.id)));
  }
  return out;
}

function main(argv) {
  const check = argv.includes('--check');
  const missing = CHEST_KEYS.filter((k) => !METALS[k.id]);
  if (missing.length) { console.error('tower-art: no metal for ' + missing.map((k) => k.id).join(', ') + ' (METALS)'); return 1; }
  let stale = 0;
  for (const [rel, png] of drawAll()) {
    const file = join(ROOT, rel);
    if (check) { let cur = null; try { cur = readFileSync(file); } catch { /* missing */ } if (!cur || !cur.equals(png)) { console.error('stale: ' + rel); stale++; } }
    else { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, png); console.log('wrote ' + rel); }
  }
  if (check) console.log(stale ? 'tower-art --check: ' + stale + ' stale' : 'tower-art --check: fresh');
  return stale ? 1 : 0;
}

if (isMain(import.meta.url)) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('tower-art: ' + (e && e.stack || e)); process.exit(2); } }
