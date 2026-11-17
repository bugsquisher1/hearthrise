#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-art.mjs — THE HEARTH CHEST AND ITS REVEALS (lane/a-tower-art; the chest redrawn lane/a-tower-art-gen 2026-11-16).
//
// The Burning Tower's chest (Tyler 2026-11-14: "burning tower chests that sit on the ledge of the Great Hearth"; ONE chest, "varies loot
// based on the key"; the locked story: "the Keepers locked them all in one big chest on the ledge, with a different lock for the better
// ones"). It is ONE generated object in two states, both kept in art/world-src/gen-2026-11-16/02-chest (01-note.json, "chest"):
//   SHUT  create_image_pro_flash 40x44 on hr-world-56-v2 (ba0d7de0, style the Hold's toll box): a great iron-bound oak chest, curved lid,
//         four lock plates on its front band. Every pixel came back on the palette.
//   OPEN  edit_image_pro_flash of that very chest (6f025e0b, laid on a 40x56 canvas so the lid has room): the lid swung up, a bed of
//         embers inside. The box below the lid's seam is the shut chest's, pixel for pixel. The edit draws off the palette, so it is
//         snapped here: the ember bed onto the fire ramp (shadow, cloth, blood, torch), everything else onto the whole palette.
// This tool cuts both to the shut chest's box, lays the four lock plates in each key's soot-dulled metal (LOCKS: Bronze, Silver, Gold,
// Platinum, left to right; the generation drew two of them grey, and the window's bright METALS read as candy dots on the Hearth,
// lane/fix137-hearth-chest-art), and lays the frames. Every pixel is a palette entry (art/world/palette.json, read by
// palette.mjs: no colour is written here as a literal), binary alpha, nothing scaled.
//
//   art/world/common/hearth_chest.png             the chest on the Hearth's ledge (src/data/world/town/sites.js AMBIENT): the shut chest,
//                                                  8 frames of the fire's light on its iron facing the fire and a glint passing over
//                                                  its locks (FLICKER, glintsAt)
//   assets/ui/tower/chest-open-<key>.png          THE KEY'S OPENING (the Tower window's Chest tab, src/shell/windows/tower-chest.js):
//                                                  8 frames of FW x FH in a row, shown at x2: the key's own lock catches the light, the
//                                                  lid cracks on a line of fire, opens, and embers climb out
//   assets/ui/tower/chest-column-<key>.png        THE WEAPON'S REVEAL over the open chest's last frame: 4 frames of FW x FH, a stepped
//                                                  light column in the key's metal rising out of it (three bands, no bloom:
//                                                  ART_DIRECTION §8); the weapon's own icon rises in it (CSS, whole pixels)
// A key row with no metal here is a finding (a later key is a row in src/data/chests.js CHEST_KEYS; its lock and column need a ramp).
//
//   node tools/world-art/tower-art.mjs           write them
//   node tools/world-art/tower-art.mjs --check   exit 1 when a written file differs from a fresh drawing, or a key has no metal
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG, decodePNG } from './png.mjs';
import { snapTo } from './lock.mjs';
import { PALETTE, RAMPS } from './palette.mjs';
import { CHEST_KEYS } from '../../src/data/chests.js';
import { AMBIENT } from '../../src/data/world/town/sites.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'art/world-src/gen-2026-11-16/02-chest/';
/* the two kept generations, and where the shut chest's box sits in each canvas (x, y, w, h) */
const SHUT = Object.freeze({ file: SRC + 'r2-shut-s97-ba0d7de0.png', box: [4, 7, 31, 29] });
const OPEN = Object.freeze({ file: SRC + 'r2-open-edit-s7-6f025e0b.png', box: [4, 25, 31, 29], lid: 20 });

/* the palette entries the paint uses, by ramp and step (hr-world-56-v2) */
const R = (ramp, i) => RAMPS[ramp][i];
const C = Object.freeze({
  K: R('shadow', 0), k1: R('shadow', 1), k2: R('shadow', 2), k3: R('shadow', 3),
  ember: R('blood', 1), flame: R('torch', 0), hot: R('torch', 1),
});
/* EACH KEY'S METAL in the window's light: the reveal's column and the Climb tab's landing plates, dark to light (palette ramps: bronze,
   steel, bronze-and-gold, mithril) */
export const METALS = Object.freeze({
  bronze: Object.freeze([R('bronze', 0), R('bronze', 2), R('bronze', 3)]),
  silver: Object.freeze([R('steel', 0), R('steel', 2), R('steel', 3)]),
  gold: Object.freeze([R('bronze', 2), R('gold', 0), R('torch', 1)]),
  platinum: Object.freeze([R('mithril', 1), R('mithril', 2), R('mithril', 3)]),
});
/* EACH KEY'S LOCK ON THE CHEST, [dark, body, lit corner, glint] (lane/fix137-hearth-chest-art, Tyler 2026-11-17: the plates in the window's
   bright metals read as candy dots on the sooty Hearth). Old metal dulled by the fire like the Hearth's own iron: a lock is told by its body's
   metal and value (bronze brown, silver cool iron, gold tan, platinum pale warm grey), and its shine is one glint pixel, never a coloured plate. */
export const LOCKS = Object.freeze({
  bronze: Object.freeze([R('bronze', 0), R('bronze', 1), R('bronze', 2), R('bronze', 3)]),
  silver: Object.freeze([R('iron', 1), R('iron', 2), R('iron', 3), R('steel', 3)]),
  gold: Object.freeze([R('bronze', 2), R('bronze', 3), R('gold', 0), R('torch', 1)]),
  platinum: Object.freeze([R('stone', 2), R('stone', 3), R('stone', 4), R('bone', 1)]),
});
/* WHICH SIDE THE FIRE IS ON: the chest's ambient row against the fire's (src/data/world/town/sites.js), so its light falls on the iron that
   faces the firebox wherever the chest is seated */
const AT = Object.fromEntries(AMBIENT.map((a) => [a.id, a]));
export const FIRE_SIDE = AT.hearth_chest && AT.hearth_fire && AT.hearth_chest.x > AT.hearth_fire.x ? 'left' : 'right';
/* THE EMBER BED: an edit pixel in the open box's mouth that came back warm is poured by its red onto the fire ramp, never onto the planks'
   earth (a nearest-colour snap reads the edit's hottest orange, 225,63,5, as blood red and the bed goes flat). [least red, colour] */
const FIRE = Object.freeze([[200, R('torch', 0)], [160, R('blood', 1)], [120, R('blood', 0)], [85, R('cloth', 1)], [60, R('cloth', 0)], [0, R('shadow', 1)]]);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexAt = (img, x, y) => { const i = (y * img.width + x) * 4; return '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join(''); };
const opaque = (img, x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] === 255;
function put(img, x, y, hex) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const [r, g, b] = rgb(hex);
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
}
function cut(img, x0, y0, w, h) {
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * img.width + x0 + x) * 4;
    if (img.data[i + 3] >= 128) { out.data.set(img.data.subarray(i, i + 3), (y * w + x) * 4); out.data[(y * w + x) * 4 + 3] = 255; }
  }
  return out;
}

/* THE MOUTH of the open chest, in its box's frame (x, y from the box's top-left; the lid stands above row 0): the ember bed */
const MOUTH = Object.freeze({ x0: 5, x1: 25, y0: 1, y1: 10 });
/* WHERE THE LOCKS ARE, in the box's frame: four plates on the front band, rows 15..17, the keyhole the shadow pixel in row 16 */
const PLATES = Object.freeze([[6, 8], [12, 14], [17, 19], [22, 24]]), PLATE_Y = 15;

/** The shut chest's box: { w, h, img } (31 x 29, on the palette as generated). */
export function shutChest() {
  const [x, y, w, h] = SHUT.box;
  return { w, h, img: cut(decodePNG(readFileSync(join(ROOT, SHUT.file))), x, y, w, h) };
}
/** The open chest: the box's frame plus the lid's rows above it ({ w, h, lid, img }, h = box + lid), snapped onto the palette. */
export function openChest() {
  const [x, y, w, h] = OPEN.box, raw = cut(decodePNG(readFileSync(join(ROOT, OPEN.file))), x, y - OPEN.lid, w, h + OPEN.lid);
  const all = snapTo(raw, PALETTE);
  for (let yy = MOUTH.y0; yy <= MOUTH.y1; yy++) for (let xx = MOUTH.x0; xx <= MOUTH.x1; xx++) {
    const i = ((yy + OPEN.lid) * w + xx) * 4;
    const [r, g, b] = raw.data.subarray(i, i + 3);
    /* the fire, not the oak or the iron: red leads green and blue by a margin */
    if (raw.data[i + 3] === 255 && r > 40 && r - b > 15 && r - g > 15) all.data.set([...rgb(FIRE.find(([min]) => r >= min)[1]), 255], i);
  }
  /* the box below the seam is the shut chest's own pixels (the edit kept them; this holds them exactly) */
  const shut = shutChest().img;
  for (let yy = PLATE_Y - 3; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const s = (yy * w + xx) * 4, d = ((yy + OPEN.lid) * w + xx) * 4;
    all.data.set(shut.data.subarray(s, s + 4), d);
  }
  return { w, h: h + OPEN.lid, lid: OPEN.lid, img: all };
}

/* THE FOUR LOCKS on a chest image whose box's top-left is (left, top): each 3 x 3 plate laid in its key's LOCKS, lit from the upper left
   (the lit corner, the body, the shade right and below; the keyhole and the outline stay shadow). `glint`: the keys whose lock catches the
   fire this frame (its corner the glint, the next pixel lit); `lit`: the key being used in the reveal, its whole plate in the light. */
const PLATE = Object.freeze(['LBB', 'BkD', 'BDD']);
const PLATE_GLINT = Object.freeze(['GLB', 'BkD', 'BDD']), PLATE_LIT = Object.freeze(['GLL', 'LkB', 'BBD']);
function locks(img, left, top, lit, glint = []) {
  CHEST_KEYS.slice(0, PLATES.length).forEach((k, n) => {
    const [dark, body, light, shine] = LOCKS[k.id];
    const plate = lit === k.id ? PLATE_LIT : glint.includes(k.id) ? PLATE_GLINT : PLATE;
    const x0 = left + PLATES[n][0];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = x0 + c, y = top + PLATE_Y + r;
      if (!opaque(img, x, y) || RAMPS.shadow.includes(hexAt(img, x, y))) continue;
      put(img, x, y, { L: light, B: body, D: dark, G: shine }[plate[r][c]]);
    }
  });
}

/* THE FIRE'S LIGHT ON IT: the Great Hearth's fire burns beside the chest (its 8-frame loop at 8 fps, hearth_fire), so the chest's iron on the
   fire's side (FIRE_SIDE) takes that light, one value step up its own ramp, over more or fewer of its rows frame by frame, and its locks
   catch it in turn: the lock nearest the fire leads, each next one two frames behind, a glint where the fire is high (GLINT_AT). An ambient
   row loops on the town's clock (tests/world-core.mjs W2), and in town something always moves (ART_DIRECTION §3). */
export const FLICKER = Object.freeze([1, 2, 4, 3, 5, 2, 3, 1]);
const GLINT_AT = 4, GLINT_LAG = 2;
const upRamp = (n) => RAMPS[n].slice(0, -1).map((c, i) => [c, RAMPS[n][i + 1]]);
const STEP_UP = Object.freeze(Object.fromEntries([[R('shadow', 3), R('stone', 0)], ...upRamp('stone'), ...upRamp('iron')]));
const LIT_COLS = 6;

/** The keys whose lock glints on frame f: the lock nearest the fire first. */
export function glintsAt(f) {
  const keys = CHEST_KEYS.slice(0, PLATES.length).map((k) => k.id);
  const fromFire = FIRE_SIDE === 'right' ? keys.slice().reverse() : keys;
  return fromFire.filter((id, n) => FLICKER[(f + FLICKER.length - (n * GLINT_LAG) % FLICKER.length) % FLICKER.length] >= GLINT_AT);
}

/** THE CHEST ON THE LEDGE: the shut chest with its four locks, 8 frames of the fire's light in a row. */
export function drawChest() {
  const b = shutChest();
  const img = createImage(b.w * FLICKER.length, b.h);
  FLICKER.forEach((rows, f) => {
    const one = createImage(b.w, b.h);
    one.data.set(b.img.data);
    locks(one, 0, 0, null, glintsAt(f));
    /* the lit rows: the fire side's iron from the lid's top down `rows` x 3 rows */
    const xs = FIRE_SIDE === 'right' ? b.w - LIT_COLS : 0;
    for (let y = 1; y < Math.min(b.h - 1, 1 + rows * 3); y++) for (let x = xs; x < xs + LIT_COLS; x++) {
      const up = opaque(one, x, y) && STEP_UP[hexAt(one, x, y)];
      if (up) put(one, x, y, up);
    }
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const i = (y * b.w + x) * 4;
      img.data.set(one.data.subarray(i, i + 4), (y * img.width + f * b.w + x) * 4);
    }
  });
  return img;
}

/* Embers climbing out of an open chest: a fixed set, each a pixel, higher and fewer frame by frame. [dx, rise, kind] */
const EMBERS = Object.freeze([[-9, 2, 1], [-5, 5, 0], [-1, 1, 2], [2, 6, 1], [4, 3, 0], [8, 5, 2], [10, 1, 1], [-7, 8, 2], [3, 9, 0], [-3, 11, 1], [6, 10, 2], [0, 13, 0]]);
function embers(img, cx, mouthY, step) {
  for (const [dx, rise, kind] of EMBERS) {
    const y = mouthY - rise - step * 5;
    if (y < 1 || step * 3 + kind > 11) continue;
    const drift = Math.round(Math.sin((rise + step) * 1.7));
    put(img, cx + dx + drift, y, kind === 0 ? C.hot : kind === 1 ? C.flame : C.ember);
  }
}

/* THE REVEAL'S FRAME: FW x FH art px, the chest's box foot on its last row but one, centred; the lid and the embers above it */
export const FW = 48, FH = 64;
const BOX = shutChest(), OX = Math.floor((FW - BOX.w) / 2), OY = FH - 1 - BOX.h;   /* the box's top-left in the frame */
const SEAM = PLATE_Y - 3;                                                            /* the lid's lower edge, in the box's frame */

/* one pose of the chest at the frame's box: lid 0 shut, 1-2 cracked that many px on a line of fire, 3 open; lit: a key's lock */
function pose(one, s) {
  if (s.lid >= 3) {
    const o = openChest();
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      const i = (y * o.w + x) * 4;
      if (o.img.data[i + 3] === 255) one.data.set(o.img.data.subarray(i, i + 4), ((OY - o.lid + y) * FW + OX + x) * 4);
    }
  } else {
    const up = s.lid || 0;
    for (let y = 0; y < BOX.h; y++) for (let x = 0; x < BOX.w; x++) {
      const i = (y * BOX.w + x) * 4;
      if (BOX.img.data[i + 3] !== 255) continue;
      one.data.set(BOX.img.data.subarray(i, i + 4), ((OY + y - (y < SEAM ? up : 0)) * FW + OX + x) * 4);
    }
    /* the crack: the seam's rows between the lifted lid and the box, a line of fire inside the outline */
    for (let r = 0; r < up; r++) for (let x = 1; x < BOX.w - 1; x++) {
      const y = OY + SEAM - 1 - r;
      put(one, OX + x, y, x === 1 || x === BOX.w - 2 ? C.K : (x + r) % 4 === 1 ? C.hot : r ? C.ember : C.flame);
    }
  }
  locks(one, OX, OY, s.lit || null);
}

/** THE KEY'S OPENING, 8 frames of FW x FH in a row. */
export function drawOpen(keyId) {
  if (!METALS[keyId]) throw new Error('no metal for key ' + keyId);
  const n = 8, img = createImage(FW * n, FH);
  const plan = [{ lid: 0 }, { lid: 0, lit: keyId }, { lid: 1, lit: keyId }, { lid: 2, lit: keyId }, { lid: 3, e: 0 }, { lid: 3, e: 1 }, { lid: 3, e: 2 }, { lid: 3, e: 3 }];
  plan.forEach((s, i) => {
    const one = createImage(FW, FH);
    pose(one, s);
    if (s.e !== undefined) embers(one, OX + Math.floor(BOX.w / 2), OY + MOUTH.y0 + 2, s.e);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const a = (y * FW + x) * 4, b = (y * img.width + i * FW + x) * 4;
      img.data.set(one.data.subarray(a, a + 4), b);
    }
  });
  return img;
}

/** THE WEAPON'S COLUMN, 4 frames of FW x FH in a row, over the opening's last frame: three bands of the key's metal, rising out of the mouth. */
export function drawColumn(keyId) {
  const m = METALS[keyId];
  if (!m) throw new Error('no metal for key ' + keyId);
  const n = 4, img = createImage(FW * n, FH);
  const cx = OX + Math.floor(BOX.w / 2) - 1, foot = OY + MOUTH.y1 - 2;
  [14, 28, 42, 42].forEach((r, i) => {
    const top = Math.max(1, foot - r);
    /* three straight bands, the outer shortest: the head steps in, the lightest band alone at its tip; the last frame shimmers */
    for (const [w, c, drop] of [[6, m[0], 6], [3, m[1], 3], [1, m[2], 0]]) {
      for (let y = top + drop; y <= foot; y++) {
        const cc = c === m[2] && i === 3 && (y & 2) ? m[1] : c;
        for (let x = cx - w; x <= cx + w + 1; x++) put(img, i * FW + x, y, cc);
      }
    }
  });
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
