#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/hearth-plaza.mjs — THE GREAT HEARTH'S RING, LAID IN HEARTHSTONE (lane/a-havora-art 2026-11-16).
//
// Tyler 2026-11-16: "the cobblestone/hearth could be more distinct, I would like the hearth area to be perfect considering it's
// the focal point of the game"; then (step 2b) the outer course "reads like leftover grey slabs", the speckle "is noise", "the
// ring and the Hearth should feel like one build", and the lane's setts met the square's flags on "an awkward cutoff line".
// Hearth Square's painted paving (havora_square_plaza: a 24 x 24 tile PixelLab field, its edge band, and concentric rings of
// curved slabs centred on the Hearth's front step) is re-laid from its own pixels, the lane's setts and the Hearth's colours:
//   hearth's stone  the disc and the first course (the step-down from the Hearth) are the Hearth's own stone: its greys, its
//                   warm-dark joints and its rust flecks (the Hearth's apron, measured: #2f2723 / #3d2a1d about 14%)
//   hearthstone     the courses beyond, warm buff: each slab one step lighter, its grain worn back to its body (a highlight kept
//                   only on its upper-left edge, a shade only on its lower-right: lit from the upper left), a few hairline cracks
//   kerb            the ring's rim, one course of one dark stone (the Hearth's dark grey, its grain compressed to three values),
//                   a clean black outer edge, a lit lip on the inside, a joint every ~30 px of arc
//   apron           the square's edge band is the LANE's setts carried on into the square on the lane's own grid (the blend draws
//                   the lanes half a tile off the cell grid), so a lane never meets the square on a seam; a narrow kerb course
//                   (the ring's kerb) parts the setts from the square's big flags: a deliberate border, not a cut
//   soot, wear      a grained gradient of soot and a few ash grains before the firebox; a polished walk where heroes come up
// Deterministic (seeded). Reads the untouched paving (art/world-src/havora-hearth/havora_square_plaza_base.png), locks it as
// the build locked it (material terrain), and writes the result ON the palette (material `native`, lock.mjs [regrade]).
//
//   node tools/world-art/hearth-plaza.mjs            write art/world/common/havora_square_plaza.png
//   node tools/world-art/hearth-plaza.mjs --check    exit 1 if the committed source differs from a fresh run
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, pixelHash } from './png.mjs';
import { lock, inPalette } from './lock.mjs';
import { RAMPS } from './palette.mjs';
import { hash2, noise } from './ground-finish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASE = 'art/world-src/havora-hearth/havora_square_plaza_base.png';
export const OUT = 'art/world/common/havora_square_plaza.png';
/* the lane's setts: the all-setts tile ('1111') of the square's flagstone pair, wherever its sidecar lays it (on the palette) */
export const SETTS = Object.freeze({ sidecar: 'art/world/common/square_grass_flag.json', sheet: 'art/world/common/square_grass_flag.png' });
const T = 32;

/* the ring's centre (the Hearth's front step, local tile 11.5, 12.5) and its courses' outer radii, measured on the paving's joints
   along five rays (the joints sit at r 38-48, 78-92, 118-127, 158-167, 196-205, 233-237) */
export const CENTRE = Object.freeze([366, 400]);
export const COURSES = Object.freeze([44, 86, 124, 163, 201, 240]);
const RING = COURSES[COURSES.length - 1];
/* the kerb: the ring's outermost 15 px */
const KERB_IN = RING - 15;
/* the courses laid in the Hearth's own stone: the disc and the first course */
const HEARTH_COURSES = 2;
/* the Hearth's front row in the paving's px (footprint plan y45-48 = local tiles 9-12): its art covers everything north of it */
const HEARTH_FRONT = 416;
/* the square's edge band (the old kerbstone strip) and the narrow kerb inside it */
const BAND = 32, BAND_KERB = 4;

const MORTAR = new Set(['#0b0a0c', '#17141a', '#231d1f', '#2f2723']);
const MOSS = new Set(['#16241a', '#1f3322', '#2c4a2c', '#4a5a2a', '#6b7a38']);

/* the tones, colour to colour (all on hr-world-56-v2) */
const JOINTS = Object.freeze({ '#3a3a3e': '#553a26', '#2c2e33': '#3d2a1d', '#17141a': '#3d2a1d', '#231d1f': '#3d2a1d', '#0b0a0c': '#2f2723', '#2f2723': '#2f2723' });
const BUFF = Object.freeze(Object.assign({
  '#aaa49a': '#c9bfa0', '#8a867d': '#aaa49a', '#6a6865': '#8a867d', '#4f4e52': '#6a6865', '#6e727a': '#8a867d' }, JOINTS));
/* the Hearth's stone: its greys as they are, its darks its own, its joints its warm darks */
const HEARTH = Object.freeze({
  '#aaa49a': '#aaa49a', '#8a867d': '#8a867d', '#6a6865': '#6a6865', '#4f4e52': '#4f4e52', '#6e727a': '#8a867d',
  '#3a3a3e': '#2f2723', '#2c2e33': '#2f2723', '#17141a': '#2f2723', '#231d1f': '#2f2723', '#0b0a0c': '#231d1f', '#2f2723': '#2f2723' });
const HEARTH_FLECK = Object.freeze({ '#aaa49a': '#8a6440', '#8a867d': '#3d2a1d', '#6a6865': '#2f2723', '#4f4e52': '#2f2723' });
/* the kerb's dark stone: any grain compressed onto three values of the Hearth's darks */
const KERB = Object.freeze({
  '#c9bfa0': '#6a6865', '#aaa49a': '#6a6865', '#8a867d': '#4f4e52', '#6a6865': '#4f4e52', '#6e727a': '#4f4e52', '#4f4e52': '#3a3a3e',
  '#3a3a3e': '#3a3a3e', '#2c2e33': '#3a3a3e', '#17141a': '#3a3a3e', '#231d1f': '#3a3a3e', '#0b0a0c': '#3a3a3e', '#2f2723': '#3a3a3e',
  '#16241a': '#3a3a3e', '#1f3322': '#3a3a3e', '#2c4a2c': '#3a3a3e', '#4a5a2a': '#3a3a3e', '#6b7a38': '#4f4e52' });
const KERB_EDGE = '#17141a', KERB_LIP = '#6a6865', KERB_JOINT = '#231d1f';
/* a hairline crack on a buff slab */
const CRACK = '#8a6440';
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

/* one value step along a palette colour's own ramp (k > 0 lighter); a colour on no ramp is left as it is */
const RAMP_AT = new Map();
for (const ramp of Object.values(RAMPS)) ramp.forEach((c, k) => RAMP_AT.set(c.toLowerCase(), { ramp, k }));
const stepHex = (hex, k) => { const at = RAMP_AT.get(hex); return at ? at.ramp[Math.max(0, Math.min(at.ramp.length - 1, at.k + k))] : hex; };

/** The square's flags outside the ring and inside the apron, re-laid at one-px density (in place). */
function flags(img) {
  const { width: W, height: H, data } = img;
  const inField = (x, y) => x >= 0 && y >= 0 && x < W && y < H && radius(x, y) >= RING + 1 && Math.min(x, y, W - 1 - x, H - 1 - y) >= BAND + BAND_KERB;
  /* a joint: the mortar, the moss in it, and the field's two darkest greys (its joints' shadowed side) */
  const joint = (x, y) => { const c = hexAt(data, (y * W + x) * 4); return MORTAR.has(c) || MOSS.has(c) || c === '#2c2e33' || c === '#3a3a3e'; };
  /* the flags: 4-connected runs of stone in the field */
  const own = new Int32Array(W * H).fill(-1), list = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (own[y * W + x] >= 0 || !inField(x, y) || joint(x, y)) continue;
    const px = [], stack = [y * W + x];
    own[y * W + x] = list.length;
    while (stack.length) {
      const j = stack.pop(); px.push(j);
      const jx = j % W, jy = (j - jx) / W;
      for (const [nx, ny] of [[jx + 1, jy], [jx - 1, jy], [jx, jy + 1], [jx, jy - 1]]) {
        if (!inField(nx, ny) || own[ny * W + nx] >= 0 || joint(nx, ny)) continue;
        own[ny * W + nx] = list.length; stack.push(ny * W + nx);
      }
    }
    const tally = {};
    for (const j of px) { const c = hexAt(data, j * 4); tally[c] = (tally[c] || 0) + 1; }
    list.push({ px, body: Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] });
  }
  const flagAt = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? own[y * W + x] : -1);
  /* a dark speck inside one flag is that flag's */
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!inField(x, y) || own[y * W + x] >= 0) continue;
    const k = flagAt(x - 1, y);
    if (k >= 0 && flagAt(x + 1, y) === k && flagAt(x, y - 1) === k && flagAt(x, y + 1) === k) { own[y * W + x] = k; list[k].px.push(y * W + x); }
  }
  /* a two-px joint: its upper (or left) px goes to the flag above (or left of) it, as that flag's shaded edge */
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!inField(x, y) || !joint(x, y)) continue;
    let k = -1;
    if (joint(x, y + 1) && !joint(x, y - 1) && flagAt(x, y - 1) >= 0) k = flagAt(x, y - 1);
    else if (joint(x + 1, y) && !joint(x - 1, y) && flagAt(x - 1, y) >= 0) k = flagAt(x - 1, y);
    if (k < 0) continue;
    own[y * W + x] = k; list[k].px.push(y * W + x);
  }
  /* each flag: its body, its lit upper-left edge and shaded lower-right edge, one px each, a pit or two */
  for (const [k, f] of list.entries()) {
    for (const j of f.px) {
      const x = j % W, y = (j - x) / W;
      const out = (dx, dy) => flagAt(x + dx, y + dy) !== k;
      let c = f.body;
      if (out(1, 0) || out(0, 1)) c = stepHex(f.body, -1);
      else if (out(-1, 0) || out(0, -1)) c = stepHex(f.body, 1);
      else if (hash2(x, y, 97) < 0.012) c = stepHex(f.body, -1);
      put(data, j * 4, c);
    }
  }
}

/** The finished paving: the base locked as the build locks it, the ring re-laid, the apron and its kerb. Pure but for `setts`. */
export function hearthPlaza(base, setts) {
  const img = lock(base, 'terrain');
  const { width: W, height: H, data } = img;
  const { list, owner } = slabs(img);
  /* 1. the courses' tones: the Hearth's stone near the Hearth, buff hearthstone beyond (the kerb is laid over the rim below) */
  for (const s of list) {
    s.tone = s.course < HEARTH_COURSES ? 'hearth' : 'buff';
    const map = s.tone === 'hearth' ? HEARTH : BUFF;
    const tally = {};
    for (const i of s.px) {
      const p = i * 4, c = hexAt(data, p);
      if (map[c]) put(data, p, map[c]); else if (MOSS.has(c)) put(data, p, '#4a5a2a');
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
    const map = r < COURSES[HEARTH_COURSES - 1] + 2 ? HEARTH : JOINTS;
    if (map[c]) put(data, p, map[c]);
  }
  const mine = (i, j) => j >= 0 && j < owner.length && owner[j] === owner[i];
  /* 2. buff slabs worn smooth: grain back to the body, a highlight kept only on the upper-left edge, a shade only on the lower-right */
  for (const s of list) {
    if (s.tone !== 'buff') continue;
    for (const i of s.px) {
      const p = i * 4, c = hexAt(data, p);
      if (c === s.body) continue;
      const x = i % W, upLeft = !mine(i, i - 1) || !mine(i, i - W), downRight = !mine(i, i + 1) || !mine(i, i + W);
      const light = c === '#c9bfa0', dark = c === '#8a867d' || c === '#6a6865';
      if ((light && upLeft) || (dark && downRight)) continue;
      if (hash2(x, (i - x) / W, 73) < 0.06) continue;
      put(data, p, s.body);
    }
  }
  /* 2b. the square's big flags (outside the ring, inside the apron) at the Hearth's pixel density (lane/a-havora-seams-2: the generated
     field's joints, edges and grain ran two px wide beside the one-px setts and Hearth): every two-px joint thinned to one, the px
     given back to the flag on its upper-left as its shaded edge; each flag's grain worn back to its body, a one-px lit edge on its
     upper left and a one-px shade on its lower right, a pit here and there */
  flags(img);
  /* 3. the Hearth's rust flecks on its own stone, in small clumps */
  for (const s of list) {
    if (s.tone !== 'hearth') continue;
    for (const i of s.px) {
      const x = i % W, y = (i - x) / W;
      if (hash2(x, y, 41) >= 0.12 * (0.4 + noise(x, y, 7, 43))) continue;
      for (const j of hash2(x, y, 47) < 0.45 ? [i, i + 1] : [i]) {
        if (!mine(i, j)) continue;
        const p = j * 4, c = hexAt(data, p);
        if (HEARTH_FLECK[c]) put(data, p, HEARTH_FLECK[c]);
      }
    }
  }
  /* 4. a few hairline cracks: one slab in four, a short wandering line off the slab's edges */
  list.forEach((s, k) => {
    if (s.tone !== 'buff' || s.px.length < 220 || hash2(k, 0, 83) >= 0.28) return;
    let i = s.px[Math.floor(hash2(k, 1, 83) * s.px.length)];
    const len = 6 + Math.floor(hash2(k, 2, 83) * 10);
    let dx = hash2(k, 3, 83) < 0.5 ? 1 : -1, dy = hash2(k, 4, 83) < 0.5 ? 1 : 0;
    for (let n = 0; n < len; n++) {
      const inner = [1, -1, W, -W].every((d) => mine(i, i + d) && mine(i, i + 2 * d));
      if (!inner) break;
      put(data, i * 4, CRACK);
      if (hash2(k, n + 10, 83) < 0.35) [dx, dy] = hash2(k, n + 40, 83) < 0.5 ? [dx, dy ^ 1] : [dx, 0];
      i += dx + dy * W;
    }
  });
  /* 5. the ring's kerb: one course of the Hearth's dark stone, a black outer edge, a lit lip inside, a joint every ~30 px of arc */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = radius(x, y);
    if (r < KERB_IN || r >= RING + 0.5) continue;
    const p = (y * W + x) * 4, c = hexAt(data, p);
    const a = Math.atan2(y - CENTRE[1], x - CENTRE[0]) * 233 / 30;
    const joint = Math.abs(a - Math.round(a)) * 30 < 0.6;
    if (r >= RING - 1) put(data, p, KERB_EDGE);
    else if (r < KERB_IN + 1) put(data, p, KERB_LIP);
    else if (joint) put(data, p, KERB_JOINT);
    else put(data, p, KERB[c] || '#4f4e52');
  }
  /* 6. the apron: the lane's setts on the lane's grid (half a tile off the cells), a narrow kerb course inside it */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d >= BAND + BAND_KERB) continue;
    const p = (y * W + x) * 4;
    if (d < BAND) {
      const sp = (((y + 16) % T + setts.cy) * setts.img.width + ((x + 16) % T + setts.cx)) * 4;
      put(data, p, hexAt(setts.img.data, sp));
      continue;
    }
    /* the kerb course: dark stone between two black edges, a joint every 64 px along it */
    const k = d - BAND, along = d === Math.min(x, W - 1 - x) ? y : x;
    if (k === 0 || k === BAND_KERB - 1) put(data, p, k === 0 ? KERB_EDGE : KERB_JOINT);
    else if (along % 64 === 31) put(data, p, KERB_JOINT);
    else put(data, p, k === 1 ? KERB_LIP : (hash2(x, y, 91) < 0.25 ? '#3a3a3e' : '#4f4e52'));
  }
  /* 7. the polished walk: a stone's grain and hairline cracks worn back to its body, its body here and there a step lighter */
  for (let y = HEARTH_FRONT; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (owner[i] < 0 || radius(x, y) >= KERB_IN) continue;
    const s = list[owner[i]];
    const w = walk(x, y) * (0.55 + 0.45 * noise(x, y, 16, 61));
    if (w <= 0.05) continue;
    const p = i * 4, c = hexAt(data, p);
    if (c !== s.body) { if (hash2(x, y, 67) < w * 0.85) put(data, p, s.body); continue; }
    if (hash2(x, y, 71) < w * 0.22 && WEAR[c]) put(data, p, WEAR[c]);
  }
  /* 8. soot and ash before the firebox: a grained gradient, dense on the Hearth's step and thinning out over about 70 px */
  for (let y = HEARTH_FRONT; y < HEARTH_FRONT + 80; y++) for (let x = CENTRE[0] - 130; x <= CENTRE[0] + 130; x++) {
    const fall = 1 - Math.hypot((x - CENTRE[0]) / 130, (y - HEARTH_FRONT) / 74);
    if (fall <= 0) continue;
    const i = y * W + x, p = i * 4, c = hexAt(data, p);
    const k = Math.pow(fall, 1.6) * (0.45 + 0.55 * noise(x, y, 7, 53));
    if (hash2(x, y, 57) < k * 0.7 && SOOT[c]) put(data, p, SOOT[c]);
    else if (owner[i] >= 0 && hash2(x, y, 59) < 0.02 * fall) put(data, p, ASH);
  }
  return img;
}

function main() {
  const sheet = decodePNG(readFileSync(join(ROOT, SETTS.sheet)));
  const [sc, sr] = JSON.parse(readFileSync(join(ROOT, SETTS.sidecar), 'utf8')).tiles['1111'][0];
  const setts = { img: sheet, cx: sc * T, cy: sr * T };
  const img = hearthPlaza(decodePNG(readFileSync(join(ROOT, BASE))), setts);
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
if (isMain(import.meta.url)) main();
