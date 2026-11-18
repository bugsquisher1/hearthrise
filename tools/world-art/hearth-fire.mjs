#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/hearth-fire.mjs — THE GREAT HEARTH AND ITS FIRE LOOP, CUT FROM THEIR GENERATIONS (lane/fix138-hearth-chest-big, 2026-11-17).
//
// Tyler 2026-11-17, on the redrawn Hearth: "I would like the flame to be a bit more flamey". The Hearth's art keeps an embers-only
// firebox; the town lays this loop over it (src/data/world/town/sites.js AMBIENT hearth_fire).
//   HEARTH  FINAL-s602-bannerH-crest, 384 x 448, its 319 px of art centred: shipped with CUT_X transparent columns cut off each side, so
//           its frame is its 11-tile footprint (352 px) and nothing of its frame box stands over a stand beside it (tests/town-stations ST-1)
// The fire, made as the first fire was (its sidecar):
//   BASE    the final Hearth's firebox crop, 128 x 128 with its top-left on the FINAL canvas's px (CROP_AT)
//   STILL   inpaint_image_pro_flash of that crop in MASK (tall roaring flames filling the arch, seed 9, aa2c98e5)
//   FRAMES  animate_image of the still (seed 12, job d1764a77): f0 the still, f1-f8 the loop
// A pixel of a loop frame is FIRE where it differs from the base by more than CUT (the sum of its three channel differences) inside
// MASK; the loop is cut to the box every frame's fire fits, its anchor the mask's centre (the firebox's), 8 frames at the town's beat.
// The frames come back off the palette (animate_image draws free), so the sidecar's material is `light`, graded and snapped by the
// build as the first fire was. Its colour variants (tools/world-art/hearth-flames.mjs) need the flame pixels marked: this writes the
// verdigris twin that marks them by rule, the HOT pixels (the flames and the firebox they light: red over CUT_HOT, leading blue by HOT_LEAD and green by HOT_OVER_GREEN; the logs and the iron are not) poured by
// value onto the verdigris ramp, where the first fire's twin was painted by hand.
//
//   node tools/world-art/hearth-fire.mjs           write art/world/hearth/great_hearth.png, hearth_fire.{png,json} and hearth_fire_verdigris.{png,json}
//   node tools/world-art/hearth-fire.mjs --check   exit 1 when a written file differs from a fresh cut
// Then: node tools/world-art/hearth-flames.mjs, node tools/world-art/build.mjs --set common
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, decodePNG, encodePNG, pixelHash, crop } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = 'art/world-src/gen-2026-11-17/great-hearth/';
export const CROP_AT = Object.freeze([128, 248]);
const FINAL = SRC + 'FINAL-s602-bannerH-crest.png', CUT_X = 16;
const BASE = SRC + 'firebox-crop-128x128-at128-248.png';
const FRAMES = Object.freeze(Array.from({ length: 8 }, (_, i) => SRC + 'fire-anim-s12-d1764a77/f' + (i + 1) + '.png'));
const MASK = Object.freeze([34, 34, 64, 62]);
const CUT = 90, CUT_HOT = 110, HOT_LEAD = 60, HOT_OVER_GREEN = 35;
/* the verdigris ramp, dark to light: the first fire's hand-painted twin used exactly these three for its flames */
const VERDIGRIS = Object.freeze(['#4f7a80', '#7ccf4a', '#c8e6e0']);

const read = (rel) => decodePNG(readFileSync(join(ROOT, rel)));
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The loop: { frames: [img], box: [x0, y0, w, h] in the crop, anchor: [x, y] in the frame, at: [x, y] the frame's top-left on the hearth }. */
export function cutFire() {
  const base = read(BASE), raw = FRAMES.map(read);
  const [mx, my, mw, mh] = MASK;
  const fire = (img, x, y) => { const i = (y * img.width + x) * 4; return [0, 1, 2].reduce((s, k) => s + Math.abs(img.data[i + k] - base.data[i + k]), 0) > CUT; };
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const img of raw) for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) if (fire(img, x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const frames = raw.map((img) => {
    const out = createImage(w, h);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!fire(img, x, y)) continue;
      const i = (y * img.width + x) * 4;
      out.data.set([img.data[i], img.data[i + 1], img.data[i + 2], 255], ((y - y0) * w + x - x0) * 4);
    }
    return out;
  });
  const cx = mx + Math.floor(mw / 2), cy = my + Math.floor(mh / 2);
  return { frames, box: [x0, y0, w, h], anchor: [cx - x0, cy - y0], at: [CROP_AT[0] - CUT_X + x0, CROP_AT[1] + y0] };
}

/** The loop's top-left on the hearth frame (the Tower window's FIRE_AT is held to it, tools/world-art/tower-window-art.mjs). */
export const fireAt = () => cutFire().at;

/** One row of frames as a sheet. */
function row(frames) {
  const w = frames[0].width, h = frames[0].height, img = createImage(w * frames.length, h);
  frames.forEach((f, n) => { for (let y = 0; y < h; y++) img.data.set(f.data.subarray(y * w * 4, (y + 1) * w * 4), (y * img.width + n * w) * 4); });
  return img;
}
/** The verdigris twin: the loop with its HOT pixels poured by value onto VERDIGRIS (hearth-flames.mjs reads the difference as the flame). */
export function verdigrisOf(sheet) {
  const out = { width: sheet.width, height: sheet.height, data: Uint8Array.from(sheet.data) };
  const hot = [];
  for (let i = 0; i < out.data.length; i += 4) {
    const [r, g, b] = out.data.subarray(i, i + 3);
    if (out.data[i + 3] && r >= CUT_HOT && r - b >= HOT_LEAD && r - g >= HOT_OVER_GREEN) hot.push([i, 0.299 * r + 0.587 * g + 0.114 * b]);
  }
  const ls = hot.map((p) => p[1]).sort((a, b) => a - b);
  for (const [i, l] of hot) {
    const k = Math.min(VERDIGRIS.length - 1, Math.floor((ls.indexOf(l) / ls.length) * VERDIGRIS.length));
    out.data.set(rgb(VERDIGRIS[k]), i);
  }
  return out;
}

const PL = Object.freeze({ tool: 'animate_image of an inpaint_image_pro_flash still (the flames) on the final Hearth\'s firebox crop', image: 'd1764a77', seed: 12,
  still: 'aa2c98e5 (seed 9; alternate 6a2cde9a, seed 31)', source: 'art/world-src/gen-2026-11-17/great-hearth (firebox-crop-128x128-at128-248, fire-still-s9-aa2c98e5, fire-anim-s12-d1764a77)' });
function sidecar(id, f, notes) {
  return { id, class: 'vfx', style: 's1', material: 'light', source: id + '.png', frame: [f.box[2], f.box[3]], anchor_px: f.anchor, footprint: [1, 1],
    anims: [{ name: 'idle', fps: 8, loop: true, dirs: { s: f.frames.length } }], pixellab: PL, notes };
}

/** Every file this tool writes: path -> bytes. */
export function drawAll() {
  const f = cutFire(), sheet = row(f.frames), out = new Map();
  const at = '(' + f.at.join(', ') + ')', anchorAt = '(' + (f.at[0] + f.anchor[0]) + ', ' + (f.at[1] + f.anchor[1]) + ')';
  const fin = read(FINAL);
  out.set('art/world/hearth/great_hearth.png', encodePNG(crop(fin, CUT_X, 0, fin.width - 2 * CUT_X, fin.height)));
  out.set('art/world/hearth/hearth_fire.png', encodePNG(sheet));
  out.set('art/world/hearth/hearth_fire.json', Buffer.from(JSON.stringify(sidecar('hearth_fire', f, 'The Great Hearth idle fire (redrawn with the Hearth, lane/fix138-hearth-chest-big; Tyler 2026-11-17: "a bit more flamey"): an 8-frame loop at 8 fps, the pixels of PixelLab animate_image frames 1-8 that differ from the Hearth\'s embers-only firebox by more than 90, cut to the firebox by tools/world-art/hearth-fire.mjs. Lies over great_hearth with its top-left on the hearth frame px ' + at + ': the anchor is hearth px ' + anchorAt + ', the firebox centre.'), null, 2) + '\n'));
  out.set('art/world/hearth/hearth_fire_verdigris.png', encodePNG(verdigrisOf(sheet)));
  out.set('art/world/hearth/hearth_fire_verdigris.json', Buffer.from(JSON.stringify(sidecar('hearth_fire_verdigris', f, 'hearth_fire with its hot pixels poured by value onto the verdigris ramp (copper green) by tools/world-art/hearth-fire.mjs: the twin tools/world-art/hearth-flames.mjs reads as the flame mask. Same placement as hearth_fire.'), null, 2) + '\n'));
  return out;
}

function main(argv) {
  const check = argv.includes('--check');
  let stale = 0;
  for (const [rel, bytes] of drawAll()) {
    const file = join(ROOT, rel);
    if (check) {
      let cur = null; try { cur = readFileSync(file); } catch { /* missing */ }
      const same = cur && (rel.endsWith('.json') ? JSON.stringify(JSON.parse(cur.toString('utf8'))) === JSON.stringify(JSON.parse(bytes.toString('utf8')))
        : pixelHash(decodePNG(cur)) === pixelHash(decodePNG(bytes)));
      if (!same) { console.error('stale: ' + rel); stale++; }
    } else { writeFileSync(file, bytes); console.log('wrote ' + rel); }
  }
  if (check) console.log(stale ? 'hearth-fire --check: ' + stale + ' stale' : 'hearth-fire --check: fresh');
  return stale ? 1 : 0;
}

if (isMain(import.meta.url)) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('hearth-fire: ' + (e && e.stack || e)); process.exit(2); } }
