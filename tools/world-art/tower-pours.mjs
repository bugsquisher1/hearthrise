#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-pours.mjs — THE BURNING TOWER'S POURS, READ BEFORE THEY SHIP (lane/a-tower-art, 2026-11-16).
//
// src/world/pour.js re-pours a monster's own pixels when it stands in the Tower (ash, and its landing's Keeper). This tool runs the SAME
// function over the shipped atlases, so the review strip and the guard read exactly what the game draws:
//   node tools/world-art/tower-pours.mjs --review DIR   DIR/tower-pours-<n>.png: every monster the Tower's floors can stand (the ladder of
//                                                       src/core/hunt/tower.js), as drawn | ash | keeper, its south idle still at x2 on
//                                                       the stand-in room's floor tone and on the flue's soot (the room kit's planned floor)
//   node tools/world-art/tower-pours.mjs --check        every pour's output is on the palette and every Tower monster reads 3:1 by its ring
//                                                       (ART_DIRECTION §4) on the soot floor poured ash, and the Keeper reads hotter than
//                                                       its room (its mean lightness over ash's). Exit 0 green, 1 red, 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePNG, encodePNG, createImage } from './png.mjs';
import { ROOT } from './build.mjs';
import { pourPixels, lightness, POURS } from '../../src/world/pour.js';
import { towerRoom } from '../../src/core/hunt/tower.js';
import { TOWER_RULES } from '../../src/data/tower.js';
import { HUNT_ART_ALIAS } from '../../src/data/monster-art.js';
import { ATLAS_SETS } from '../../src/data/world/atlas-sets.js';
import { isMain } from '../../tests/_is-main.mjs';

/* THE FLOORS a Tower monster is read on: the stand-in (the Sewer's flags, its median) and the flue's planned soot (shadow 2). */
export const FLOORS = Object.freeze({ standin: '#3a3a3e', ash: '#8a867d' });
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const relLum = (r, g, b) => { const f = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Every monster id (its art) the Tower's floors 1..floorTop can stand, and the Keepers' kinds. */
export function towerKinds() {
  const room = new Set(), keepers = new Set();
  for (let f = 1; f <= TOWER_RULES.floorTop; f++) {
    const r = towerRoom(f);
    for (const id of r.monsters) room.add(HUNT_ART_ALIAS[id] || id);
    if (r.keeper) keepers.add(HUNT_ART_ALIAS[r.keeper] || r.keeper);
  }
  return { room: [...room].sort(), keepers: [...keepers].sort() };
}

/* every set's manifest, by sprite id */
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  const sets = ATLAS_SETS;
  for (const set of sets) {
    const m = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
    for (const [id, s] of Object.entries(m.sprites || {})) INDEX.set(id, { set, s });
  }
  return INDEX;
}
const SHEETS = new Map();
const sheetOf = (set) => { if (!SHEETS.has(set)) SHEETS.set(set, decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.png')))); return SHEETS.get(set); };

/** A sprite's every distinct frame, packed in a row: { img, cells: [[sx, sy] -> x] , w, h }, as monster-pour.js packs them. */
export function framesOf(id) {
  const hit = index().get(id);
  if (!hit) throw new Error('no sprite ' + id + ' in any atlas');
  const { set, s } = hit;
  const [w, h] = s.frame;
  const seen = new Map();
  for (const clip of Object.values(s.anims)) for (const list of Object.values(clip.dirs)) for (const [sx, sy] of list) { const k = sx + ',' + sy; if (!seen.has(k)) seen.set(k, seen.size); }
  const img = createImage(w * seen.size, h);
  const src = sheetOf(set);
  for (const [k, n] of seen) {
    const [sx, sy] = k.split(',').map(Number);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((sy + y) * src.width + sx + x) * 4, o = (y * img.width + n * w + x) * 4;
      img.data[o] = src.data[i]; img.data[o + 1] = src.data[i + 1]; img.data[o + 2] = src.data[i + 2]; img.data[o + 3] = src.data[i + 3];
    }
  }
  const still = (s.anims.idle || Object.values(s.anims)[0]).dirs;
  const sd = still.s || Object.values(still)[0];
  return { img, w, h, still: seen.get(sd[0].join(',')), dirs: Object.fromEntries(['s', 'e', 'n', 'w'].filter((d) => still[d]).map((d) => [d, seen.get(still[d][0].join(','))])) };
}

/** One frame `n` of a packed row as its own image. */
function frame(f, img, n) {
  const out = createImage(f.w, f.h);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i = (y * img.width + n * f.w + x) * 4, o = (y * f.w + x) * 4;
    out.data.set(img.data.subarray(i, i + 4), o);
  }
  return out;
}

/** The ring (ART_DIRECTION §4): body pixels that touch the outline's or the air's edge, their median luminance. */
function ringLum(img) {
  const { width: W, height: H, data } = img;
  const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] >= 128;
  const isOutline = (x, y) => { const i = (y * W + x) * 4; return data[i] === 0x0b && data[i + 1] === 0x0a && data[i + 2] === 0x0c; };
  const lums = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!op(x, y) || isOutline(x, y)) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !op(x + dx, y + dy) || isOutline(x + dx, y + dy));
    if (!edge) continue;
    const i = (y * W + x) * 4;
    lums.push(relLum(data[i], data[i + 1], data[i + 2]));
  }
  lums.sort((a, b) => a - b);
  return lums.length ? lums[lums.length >> 1] : 0;
}
const meanL = (img) => { let s = 0, n = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] >= 128) { s += lightness(img.data[i], img.data[i + 1], img.data[i + 2]); n++; } return n ? s / n : 0; };

/** Every pour of one monster: { plain, ash, keeper } packed rows (the same pixels the game bakes). */
export function poursOf(id) {
  const f = framesOf(id);
  const plain = f.img;
  const ash = createImage(plain.width, plain.height); ash.data.set(plain.data); pourPixels(ash.data, 'char');
  const keeper = createImage(plain.width, plain.height); keeper.data.set(plain.data); pourPixels(keeper.data, 'keeper');
  return { f, plain, ash, keeper };
}

/** The findings: off-palette output, a ring under 3:1 on ash, a Keeper no hotter than its ash. */
export function findings() {
  const pal = new Set(Object.values(JSON.parse(readFileSync(join(ROOT, 'art/world/palette.json'), 'utf8')).ramps).flat());
  const out = [];
  for (const [name, p] of Object.entries(POURS)) for (const h of [...p.ladder, ...(p.glow || []).map((g) => g[1])]) if (!pal.has(h)) out.push('pour ' + name + ': ' + h + ' is not on hr-world-56-v2');
  const { room, keepers } = towerKinds();
  const floor = relLum(...rgb(FLOORS.ash));
  for (const id of room) {
    const { f, ash, keeper } = poursOf(id);
    for (const [dir, n] of Object.entries(f.dirs)) {
      const c = contrast(ringLum(frame(f, ash, n)), floor);
      if (c < 3) out.push(id + ' ash ' + dir + ': ring ' + c.toFixed(2) + ':1 on ash (under 3:1)');
    }
    if (keepers.includes(id)) {
      const ka = meanL(frame(f, keeper, f.still)), aa = meanL(frame(f, ash, f.still));
      const kc = contrast(ringLum(frame(f, keeper, f.still)), floor);
      if (kc < 3) out.push(id + ' keeper: ring ' + kc.toFixed(2) + ':1 on ash (under 3:1)');
      if (!(ka > aa)) out.push(id + ' keeper: no hotter than its ash (' + ka.toFixed(1) + ' vs ' + aa.toFixed(1) + ' L*)');
    }
  }
  return out;
}

/** The review strips: as drawn | ash | keeper, each on the stand-in floor then on ash, x2, ten monsters a sheet. */
function review(dir) {
  mkdirSync(dir, { recursive: true });
  const { room, keepers } = towerKinds();
  const per = 10, k = 2, cellW = 64 * k, cellH = 64 * k, cols = 6;
  for (let sheet = 0; sheet * per < room.length; sheet++) {
    const ids = room.slice(sheet * per, sheet * per + per);
    const img = createImage(cols * cellW, ids.length * cellH);
    ids.forEach((id, row) => {
      const { f, plain, ash, keeper } = poursOf(id);
      [[plain, 'standin'], [ash, 'standin'], [keepers.includes(id) ? keeper : null, 'standin'], [plain, 'ash'], [ash, 'ash'], [keepers.includes(id) ? keeper : null, 'ash']].forEach(([src, fl], col) => {
        const bg = rgb(FLOORS[fl]);
        for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) { const o = ((row * cellH + y) * img.width + col * cellW + x) * 4; img.data[o] = bg[0]; img.data[o + 1] = bg[1]; img.data[o + 2] = bg[2]; img.data[o + 3] = 255; }
        if (!src) return;
        const fr = frame(f, src, f.still);
        const ox = col * cellW + Math.floor((cellW - f.w * k) / 2), oy = row * cellH + Math.max(0, cellH - f.h * k);
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
          const i = (y * f.w + x) * 4;
          if (fr.data[i + 3] < 128) continue;
          for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
            const X = ox + x * k + xx, Y = oy + y * k + yy;
            if (X < col * cellW || X >= (col + 1) * cellW || Y < row * cellH || Y >= (row + 1) * cellH) continue;
            const o = (Y * img.width + X) * 4;
            img.data[o] = fr.data[i]; img.data[o + 1] = fr.data[i + 1]; img.data[o + 2] = fr.data[i + 2]; img.data[o + 3] = 255;
          }
        }
      });
    });
    const file = join(dir, 'tower-pours-' + (sheet + 1) + '.png');
    writeFileSync(file, encodePNG(img));
    console.log('wrote ' + file + ': ' + ids.join(' '));
  }
}

function main(argv) {
  if (argv.includes('--review')) { review(resolve(argv[argv.indexOf('--review') + 1] || 'art/review/tower-pours')); return 0; }
  const bad = findings();
  for (const b of bad) console.log('  ✗ ' + b);
  const { room, keepers } = towerKinds();
  console.log(bad.length ? 'tower-pours --check: ' + bad.length + ' finding(s)' : 'tower-pours --check: ' + room.length + ' Tower monsters read 3:1 poured ash on ash, ' + keepers.length + ' Keepers burn hotter, every pour on the palette');
  return bad.length ? 1 : 0;
}

if (isMain(import.meta.url)) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('tower-pours: ' + (e && e.stack || e)); process.exit(2); } }
