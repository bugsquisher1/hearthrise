#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/hearth-plaza.mjs — THE GREAT HEARTH'S RING, LAID IN HEARTHSTONE (lane/a-havora-art 2026-11-16).
//
// Tyler 2026-11-16: "the cobblestone/hearth could be more distinct, I would like the hearth area to be perfect considering it's
// the focal point of the game". Hearth Square's painted paving (havora_square_plaza: a 24 x 24 tile PixelLab field, its kerb, and
// concentric rings of curved slabs centred on the Hearth's front step) was one grey: the ring read as more of the square, and the
// square as more of the town's cobble. This pass re-lays the ring from the paving's own pixels, drawing no shape of its own:
//   courses    every slab inside the ring (a connected run of non-mortar pixels) takes a tone: the inner courses hearthstone, each
//              slab BUFF (a step lighter, toward bone) or RUST (its own value, its shade turned to the Hearth's rust browns), picked
//              per slab so the ring reads hand-laid; the joints warm dark; the outermost course a darker BORDER band, so the ring
//              meets the square's flags on a clear edge.
//   flecks     the Hearth's own stone is speckled rust-brown (#2f2723 / #3d2a1d, about 14% of its apron, measured): the
//              hearthstone takes a share of the same flecks, so the ring reads as the Hearth's stone run out into the square.
//   wear       where heroes walk up to throw fuel (the two stand rows across the Hearth's front, the walk up from the south) a
//              stone's grain and hairline cracks are worn back to its body, and here and there it is a step lighter: polished.
//   soot       a grained gradient of soot and a few ash grains before the firebox, dense on the step, gone by the second course.
// Deterministic (seeded), so a rerun writes the same pixels. Reads the untouched paving (art/world-src/havora-hearth/
// havora_square_plaza_base.png), locks it exactly as the build locked it (material terrain), and writes the result ON the
// palette, so the sidecar is material `native` (lock.mjs [regrade]). Outside the ring every pixel is the old atlas's.
//
//   node tools/world-art/hearth-plaza.mjs            write art/world/common/havora_square_plaza.png
//   node tools/world-art/hearth-plaza.mjs --check    exit 1 if the committed source differs from a fresh run
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, pixelHash } from './png.mjs';
import { lock, inPalette } from './lock.mjs';
import { hash2, noise } from './ground-finish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASE = 'art/world-src/havora-hearth/havora_square_plaza_base.png';
export const OUT = 'art/world/common/havora_square_plaza.png';

/* the ring's centre (the Hearth's front step, local tile 11.5, 12.5) and its courses' outer radii, measured on the paving's joints
   along five rays (the joints sit at r 38-48, 78-92, 118-127, 158-167, 196-205, 233-237) */
export const CENTRE = Object.freeze([366, 400]);
export const COURSES = Object.freeze([44, 86, 124, 163, 201, 240]);
const RING = COURSES[COURSES.length - 1];
/* the Hearth's front row in the paving's px (footprint plan y45-48 = local tiles 9-12): its art covers everything north of it */
const HEARTH_FRONT = 416;

const MORTAR = new Set(['#0b0a0c', '#17141a', '#231d1f', '#2f2723']);
const MOSS = new Set(['#16241a', '#1f3322', '#2c4a2c', '#4a5a2a', '#6b7a38']);

/* the tones, colour to colour (all on hr-world-56-v2) */
const JOINTS = Object.freeze({ '#3a3a3e': '#553a26', '#2c2e33': '#3d2a1d', '#17141a': '#3d2a1d', '#231d1f': '#3d2a1d', '#0b0a0c': '#2f2723', '#2f2723': '#2f2723' });
const BUFF = Object.freeze(Object.assign({
  '#aaa49a': '#c9bfa0', '#8a867d': '#aaa49a', '#6a6865': '#8a867d', '#4f4e52': '#6a6865', '#6e727a': '#8a867d' }, JOINTS));
const RUST = Object.freeze(Object.assign({
  '#aaa49a': '#aaa49a', '#8a867d': '#8a867d', '#6a6865': '#6e4c30', '#4f4e52': '#553a26', '#6e727a': '#8a867d' }, JOINTS));
const BUFF_SHARE = 0.75;
const BORDER = Object.freeze({
  '#aaa49a': '#8a867d', '#8a867d': '#6a6865', '#6a6865': '#4f4e52', '#4f4e52': '#3a3a3e', '#6e727a': '#4f4e52', '#3a3a3e': '#2f2723',
  '#2c2e33': '#231d1f', '#17141a': '#0b0a0c', '#231d1f': '#0b0a0c', '#0b0a0c': '#0b0a0c', '#2f2723': '#0b0a0c',
});
/* flecks on a hearthstone slab: the Hearth's rust (a share of its body pixels; a rust slab 1.6 times the share), each a warm colour
   at about its stone's own value, so the slab reads warm and never peppered (Coordinator 11-16: the first pass read sandy) */
const FLECK = Object.freeze({ '#c9bfa0': '#c49a5c', '#aaa49a': '#a88457', '#8a867d': '#8a6440' });
const FLECK_SHARE = 0.045;
/* soot (a step down toward the fire's black) and ash (pale grey grains) */
const SOOT = Object.freeze({ '#c9bfa0': '#8a867d', '#aaa49a': '#6a6865', '#8a867d': '#4f4e52', '#6a6865': '#3a3a3e', '#a88457': '#553a26',
  '#8a6440': '#3d2a1d', '#6e4c30': '#2f2723', '#4f4e52': '#2f2723', '#3a3a3e': '#2f2723' });
const ASH = '#aaa49a';
/* wear: a stone's body one step lighter */
const WEAR = Object.freeze({ '#aaa49a': '#c9bfa0', '#8a867d': '#aaa49a' });

const hexAt = (d, p) => '#' + [0, 1, 2].map((k) => d[p + k].toString(16).padStart(2, '0')).join('');
const put = (d, p, hex) => { d[p] = parseInt(hex.slice(1, 3), 16); d[p + 1] = parseInt(hex.slice(3, 5), 16); d[p + 2] = parseInt(hex.slice(5, 7), 16); };
const radius = (x, y) => Math.hypot(x - CENTRE[0], y - CENTRE[1]);
const courseOf = (r) => COURSES.findIndex((c) => r < c);
const soft = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));

/** Where heroes come up to throw fuel, 0-1 with soft edges: the two stand rows across the Hearth's front (local tiles x5-17,
    y13-14) and the walk up the ring from the south. */
export function walk(x, y) {
  const rows = soft(y, HEARTH_FRONT - 4, HEARTH_FRONT + 18) * (1 - soft(y, 472, 500)) * soft(x, 150, 190) * (1 - soft(x, 546, 586));
  const up = soft(y, 470, 500) * (1 - soft(Math.abs(x - CENTRE[0]), 26, 58)) * (1 - soft(y, 560, 700));
  return Math.max(rows, up);
}

/** The slabs inside the ring: connected runs (4-neighbour) of non-mortar pixels, each { px: [indices], course }. */
function slabs(img) {
  const { width: W, height: H, data } = img;
  const seen = new Int32Array(W * H).fill(-1);
  const out = [];
  const open = (x, y) => radius(x, y) < RING && !MORTAR.has(hexAt(data, (y * W + x) * 4));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (seen[i] >= 0 || !open(x, y)) continue;
    const px = [], stack = [i];
    seen[i] = out.length;
    let sr = 0;
    while (stack.length) {
      const j = stack.pop(); px.push(j);
      const jx = j % W, jy = (j - jx) / W;
      sr += radius(jx, jy);
      for (const [nx, ny] of [[jx + 1, jy], [jx - 1, jy], [jx, jy + 1], [jx, jy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (seen[k] >= 0 || !open(nx, ny)) continue;
        seen[k] = out.length; stack.push(k);
      }
    }
    out.push({ px, course: courseOf(sr / px.length) });
  }
  return { list: out, owner: seen };
}

/** The finished paving: the base locked as the build locks it, then the ring re-laid. Pure. */
export function hearthPlaza(base) {
  const img = lock(base, 'terrain');
  const { width: W, data } = img;
  const { list, owner } = slabs(img);
  const last = COURSES.length - 1;
  /* 1. the courses: a slab's pixels by its course and tone; a joint inside the ring by the nearer course (border joints black) */
  for (const s of list) {
    const i0 = s.px[0];
    s.tone = s.course === last ? 'border' : hash2(i0 % W, (i0 / W) | 0, 31) < BUFF_SHARE ? 'buff' : 'rust';
    const map = s.tone === 'border' ? BORDER : s.tone === 'buff' ? BUFF : RUST;
    const tally = {};
    for (const i of s.px) {
      const p = i * 4, c = hexAt(data, p);
      if (map[c]) put(data, p, map[c]); else if (MOSS.has(c)) put(data, p, s.tone === 'border' ? '#2c4a2c' : '#4a5a2a');
      const d = hexAt(data, p); tally[d] = (tally[d] || 0) + 1;
    }
    s.body = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  }
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] >= 0) continue;
    const x = i % W, y = (i - x) / W, r = radius(x, y);
    if (r >= RING + 1) continue;
    const p = i * 4, c = hexAt(data, p);
    if (!MORTAR.has(c) && !MOSS.has(c)) continue;
    const map = r >= COURSES[last - 1] - 1 ? BORDER : JOINTS;
    if (map[c]) put(data, p, map[c]);
  }
  /* 2. flecks on the hearthstone, in small clumps (a pixel and sometimes its east neighbour); fewer on the polished walk */
  for (const s of list) {
    if (s.tone === 'border') continue;
    const share = s.tone === 'rust' ? FLECK_SHARE * 1.6 : FLECK_SHARE;
    for (const i of s.px) {
      const x = i % W, y = (i - x) / W;
      if (hash2(x, y, 41) >= share * (0.5 + noise(x, y, 9, 43)) * (1 - 0.8 * walk(x, y))) continue;
      for (const j of hash2(x, y, 47) < 0.4 ? [i, i + 1] : [i]) {
        if (owner[j] !== owner[i]) continue;
        const p = j * 4, c = hexAt(data, p);
        if (FLECK[c]) put(data, p, FLECK[c]);
      }
    }
  }
  /* 3. the polished walk: a stone's grain and hairline cracks worn back to its body, its body here and there a step lighter */
  for (let y = HEARTH_FRONT; y < img.height; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (owner[i] < 0) continue;
    const s = list[owner[i]];
    if (s.tone === 'border') continue;
    const w = walk(x, y) * (0.55 + 0.45 * noise(x, y, 16, 61));
    if (w <= 0.05) continue;
    const p = i * 4, c = hexAt(data, p);
    if (c !== s.body) { if (hash2(x, y, 67) < w * 0.85) put(data, p, s.body); continue; }
    if (hash2(x, y, 71) < w * 0.22 && WEAR[c]) put(data, p, WEAR[c]);
  }
  /* 4. soot and ash before the firebox: a grained gradient, dense on the Hearth's step and thinning out over about 70 px */
  for (let y = HEARTH_FRONT; y < HEARTH_FRONT + 80; y++) for (let x = CENTRE[0] - 130; x <= CENTRE[0] + 130; x++) {
    const fall = 1 - Math.hypot((x - CENTRE[0]) / 130, (y - HEARTH_FRONT) / 74);
    if (fall <= 0) continue;
    const i = y * W + x, p = i * 4, c = hexAt(data, p);
    const k = Math.pow(fall, 1.6) * (0.45 + 0.55 * noise(x, y, 7, 53));
    if (hash2(x, y, 57) < k * 0.75 && SOOT[c]) put(data, p, SOOT[c]);
    else if (owner[i] >= 0 && hash2(x, y, 59) < 0.02 * fall) put(data, p, ASH);
  }
  return img;
}

function main() {
  const img = hearthPlaza(decodePNG(readFileSync(join(ROOT, BASE))));
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] >= 128 && !inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) { console.error('✗ off-palette pixel at', i / 4); process.exit(1); }
  }
  if (process.argv.includes('--check')) {
    const ok = pixelHash(decodePNG(readFileSync(join(ROOT, OUT)))) === pixelHash(img);
    console.log(ok ? '✓ hearth-plaza: the committed paving is a fresh run' : '✗ hearth-plaza: the committed paving differs from a fresh run');
    process.exit(ok ? 0 : 1);
  }
  writeFileSync(join(ROOT, OUT), encodePNG(img));
  console.log('✓ wrote', OUT);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
