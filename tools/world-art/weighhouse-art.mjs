#!/usr/bin/env node
// tools/world-art/weighhouse-art.mjs — THE WEIGHHOUSE, FIVE STAGES OF ONE BUILDING (lane/c-town-works, 2026-11-04).
//
// Stage 4 is one PixelLab image (art/review/town-works-2026-11-04/weighhouse-finished-raw.png, create_image_pro, the
// same tool and style family as every Havora lot); every other stage is cut from it or drawn here, 0 generations:
//   havora_weighhouse_staked    0        trodden earth, rope and stakes, a board with the scale painted on it
//   havora_weighhouse_footings  100,000  the stone footing (the finished wall's stones), beams, sacks, crates, a wheel
//   havora_weighhouse_framed    300,000  the finished timbers with the plaster, stone, slate and scale taken away
//   havora_weighhouse_walled    600,000  walls up, roof open to its rafters, doorway and windows still empty
//   havora_weighhouse_finished  1,000,000 the image, plaque poured in gold, pans in bronze
//   havora_weighhouse_plaque    the 32 px board that stands at plan (103, 53)
// All five stages are one frame (256 x 256) on one anchor (128, 255) over one footprint (8 x 6), so a swap moves nothing.
// Everything is locked here and written as material 'native': the five share the exact same colours.
//
//   node tools/world-art/weighhouse-art.mjs [--out DIR]     write the PNGs and sidecars (default art/world/havora)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit, cloneImage } from './png.mjs';
import { lock } from './lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = 'art/review/town-works-2026-11-04/weighhouse-finished-raw.png';
const F = 256, T = 32, FOOT_TOP = F - 6 * T;   /* the footprint is rows 64..255 of the frame */
const PAL = {};
for (const [k, r] of Object.entries(JSON.parse(readFileSync(join(ROOT, 'art/world/palette.json'), 'utf8')).ramps)) r.forEach((c, i) => { PAL[k + i] = [1, 3, 5].map((n) => parseInt(c.slice(n, n + 2), 16)); });
const NAME = new Map(Object.entries(PAL).map(([k, [r, g, b]]) => [(r << 16) | (g << 8) | b, k]));

const at = (im, x, y) => (x < 0 || y < 0 || x >= im.width || y >= im.height || im.data[(y * im.width + x) * 4 + 3] < 128 ? null : NAME.get((im.data[(y * im.width + x) * 4] << 16) | (im.data[(y * im.width + x) * 4 + 1] << 8) | im.data[(y * im.width + x) * 4 + 2]));
const put = (im, x, y, c) => { if (x < 0 || y < 0 || x >= im.width || y >= im.height) return; const i = (y * im.width + x) * 4; if (c == null) { im.data.fill(0, i, i + 4); return; } const p = PAL[c]; im.data[i] = p[0]; im.data[i + 1] = p[1]; im.data[i + 2] = p[2]; im.data[i + 3] = 255; };
const rampOf = (n) => (n ? n.replace(/\d+$/, '') : null);
const isWood = (n) => n != null && (rampOf(n) === 'earth' || rampOf(n) === 'shadow');
const isIronish = (n) => n != null && (rampOf(n) === 'iron' || rampOf(n) === 'steel' || n === 'stone0' || n === 'stone1');
const isDark = (n) => isIronish(n) || n === 'shadow0' || n === 'shadow1';
const rect = (im, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(im, x, y, c); };
/** Copy a box of `src` to (dx, dy); `keep(name)` picks which pixels come over (default all opaque). */
function stamp(dst, src, x0, y0, x1, y1, dx, dy, keep = (n) => n != null) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const n = at(src, x, y); if (keep(n, x, y)) put(dst, dx + x - x0, dy + y - y0, n); }
}
/** One dark outline round every opaque shape: a transparent pixel next to an opaque non-outline pixel goes black. */
function outlined(im) {
  const out = cloneImage(im);
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    if (at(im, x, y) != null) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(im, x + a, y + b); if (n != null && n !== 'shadow0') { put(out, x, y, 'shadow0'); break; } }
  }
  return out;
}
/** Remove opaque specks smaller than `min` pixels (8-connected). */
function despeck(im, min) {
  const seen = new Uint8Array(im.width * im.height), W = im.width;
  for (let s = 0; s < seen.length; s++) {
    if (seen[s] || at(im, s % W, Math.floor(s / W)) == null) continue;
    const blob = [], st = [s]; seen[s] = 1;
    while (st.length) {
      const i = st.pop(), x = i % W, y = (i - x) / W; blob.push(i);
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const X = x + a, Y = y + b, j = Y * W + X; if (X >= 0 && Y >= 0 && X < W && Y < im.height && !seen[j] && at(im, X, Y) != null) { seen[j] = 1; st.push(j); } }
    }
    if (blob.length < min) for (const i of blob) put(im, i % W, Math.floor(i / W), null);
  }
  return im;
}
const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* ── the finished image's geometry (frame px, measured on the raw) ──────────────────────────────── */
const CX = 127.5;
const rakeDist = (x, y) => Math.abs(x - CX) - (y - 3) * 1.01;                   /* > 0: outside the gable's outer edge */
const inSlate = (x, y) => y >= 34 && y <= 94 && x >= 17 && x <= 250 && rakeDist(x, y) > 0;
const POSTS = [[105, 113], [145, 152]];                                          /* the posts between the three bays */
const WINDOW_SRC = [115, 108, 143, 152], WINDOW_AT = [68, 164];                  /* the middle window, clean */
const DOOR_MID = 128.5, DOOR_R = 28, DOOR_SPRING = 214;
const inDoor = (x, y) => y >= DOOR_SPRING - DOOR_R && y <= 255 && (y >= DOOR_SPRING ? Math.abs(x - DOOR_MID) <= DOOR_R : (x - DOOR_MID) ** 2 + (y - DOOR_SPRING) ** 2 <= DOOR_R ** 2);
const WINDOWS = [[68, 108, 96, 152], [115, 108, 143, 152], [164, 108, 192, 152], [55, 195, 82, 232], [178, 195, 205, 232]];

/* ── the finished stage: the image, its small plaque poured in gold, its pans in bronze ─────────── */
function finish(locked) {
  const im = cloneImage(locked);
  const PLAQUE = { earth6: 'gold0', bone0: 'torch1', bone1: 'torch1', earth5: 'bronze3', earth4: 'bronze2', earth3: 'bronze1' };
  for (let y = 210; y <= 222; y++) for (let x = 165; x <= 178; x++) { const m = PLAQUE[at(im, x, y)]; if (m) put(im, x, y, m); }
  const PAN = { earth1: 'bronze0', earth2: 'bronze1', earth3: 'bronze2', earth4: 'bronze2', earth5: 'bronze3', earth6: 'gold0', bone0: 'torch1' };
  for (const cx of [91.5, 164]) for (let y = 113; y <= 138; y++) for (let x = Math.floor(cx - 22); x <= cx + 22; x++) {
    if (((x - cx) / 22) ** 2 + ((y - 125) / 13) ** 2 > 1) continue;
    const m = PAN[at(im, x, y)]; if (m) put(im, x, y, m);
  }
  return im;
}

/* ── the building with the great scale lifted off: what the frame and the walls are cut from ────── */
function withoutScale(locked) {
  const im = cloneImage(locked);
  /* the chains, over plaster and over the eave beam: masked, then each pixel takes the nearest clear pixel of its row */
  const mask = new Uint8Array(F * F);
  for (const cx of [92, 163]) for (let y = 68; y <= 118; y++) {
    const half = (y - 68) * 0.3 + 4;
    for (let x = Math.ceil(cx - half); x <= cx + half; x++) if (isDark(at(im, x, y))) mask[y * F + x] = 1;
  }
  for (let y = 68; y <= 118; y++) for (let x = 0; x < F; x++) {
    if (!mask[y * F + x]) continue;
    for (let d = 1; d < 40; d++) {
      const a = x - d, b = x + d;
      if (a >= 0 && !mask[y * F + a] && at(locked, a, y) != null) { put(im, x, y, at(locked, a, y)); break; }
      if (b < F && !mask[y * F + b] && at(locked, b, y) != null) { put(im, x, y, at(locked, b, y)); break; }
    }
  }
  /* the beam and its hooks: plaster, then the two braces run through to the rake where the beam hid them */
  rect(im, 84, 58, 122, 72, 'stone4'); rect(im, 133, 58, 171, 72, 'stone4');
  for (let y = 56; y <= 73; y++) for (let x = 78; x <= 124; x++) {
    if (x - y >= 22 && x - y <= 37) { const n = at(locked, x + 16, y + 16); if (isWood(n)) put(im, x, y, n); }
    const mx = 255 - x;
    if (x - y >= 22 && x - y <= 37) { const n = at(locked, mx - 16, y + 16); if (isWood(n)) put(im, mx, y, n); }
  }
  /* the boss on the king post: the post's own clean rows (27-40) run down it, the collar closes over its top */
  for (let y = 49; y <= 80; y++) stamp(im, locked, 121, 27 + (y - 49) % 14, 134, 27 + (y - 49) % 14, 121, y);
  for (let y = 41; y <= 48; y++) for (let x = 121; x <= 134; x++) put(im, x, y, at(locked, 119, y));
  /* the pans: the side windows' upper rows come from the clean middle window, the plaster behind each pan is plaster */
  const [wx0, wy0, wx1] = WINDOW_SRC;
  [91.5, 164].forEach((cx, i) => {
    for (let y = 111; y <= 140; y++) for (let x = Math.floor(cx - 23); x <= cx + 23; x++) {
      if (((x - cx) / 23) ** 2 + ((y - 125) / 14) ** 2 <= 1) put(im, x, y, 'stone4');
    }
    stamp(im, locked, wx0, wy0, wx1, 140, WINDOW_AT[i], wy0);
  });
  /* the post beside each bay, its edge eaten by the outer chain and the pan */
  for (const [x0, x1] of POSTS) for (let y = 103; y <= 140; y++) stamp(im, locked, x0, 141 + (y % 4), x1, 141 + (y % 4), x0, y);
  /* what the lifting left on the gable's plaster: dark crumbs of chain and hook, too small to be timber */
  const crumb = createImage(F, F);
  for (let y = 50; y <= 94; y++) for (let x = 70; x <= 186; x++) { const n = at(im, x, y); if (n != null && n !== 'stone2' && n !== 'stone3' && n !== 'stone4') put(crumb, x, y, n); }
  const big = despeck(cloneImage(crumb), 16);
  for (let y = 50; y <= 94; y++) for (let x = 70; x <= 186; x++) if (at(crumb, x, y) != null && at(big, x, y) == null) put(im, x, y, 'stone4');
  return im;
}

/* the iron flashing along the gable belongs to the slates: until they come it is one more timber */
function woodenRake(im) {
  const out = cloneImage(im);
  const WOOD = { iron0: 'earth1', iron1: 'earth2', iron2: 'earth3', iron3: 'earth4', steel0: 'earth1', steel1: 'earth3', steel2: 'earth4', stone0: 'earth1', stone1: 'earth2' };
  for (let y = 0; y <= 100; y++) for (let x = 0; x < F; x++) { const d = rakeDist(x, y); if (d <= 1 && d >= -14) { const m = WOOD[at(im, x, y)]; if (m) put(out, x, y, m); } }
  return out;
}

/* ── the open roof ──────────────────────────────────────────────────────────────────────────────── */
function postStrip(src, x0, x1) { return (dst, dx, y0, y1, keep) => { for (let y = y0; y <= y1; y++) stamp(dst, src, x0, 106 + (y % 50), x1, 106 + (y % 50), dx, y, keep); }; }
const RAFTERS = [20, 38, 56, 74, 180, 198, 216, 236];
function rafters(dst, src, onSlate) {
  const post = postStrip(src, 59, 66);
  for (const py of [50, 72]) for (let x = 17; x <= 250; x++) for (let r = 0; r <= 6; r++) if (inSlate(x, py + r)) put(dst, x, py + r, at(src, x, 27 + r));
  for (const rx of RAFTERS) for (let y = 34; y <= 94; y++) for (let x = 0; x <= 7; x++) if (onSlate(rx + x, y)) { const n = at(src, 59 + x, 106 + (y % 50)); if (isWood(n)) put(dst, rx + x, y, n); }
  void post;
}

/* ── the site: trodden earth, footing, rope ─────────────────────────────────────────────────────── */
function earthPatch({ islands = [], door = false } = {}) {
  const sc = JSON.parse(readFileSync(join(ROOT, 'art/world/common/havora_grass_earth.json'), 'utf8'));
  const sheet = lock(decodePNG(readFileSync(join(ROOT, 'art/world/common/havora_grass_earth.png'))), sc.material);
  /* the corners of the 8 x 6 tiles: earth inside, grass on the rim and on any island; `door` runs a tongue out to the front */
  const v = (x, y) => (((x >= 1 && x <= 7 && y >= 1 && y <= 5) || (door && y === 6 && x >= 3 && x <= 5)) && !islands.some(([a, b]) => a === x && b === y) ? '1' : '0');
  const out = createImage(F, F);
  for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 8; tx++) {
    const [c, r] = sc.tiles[v(tx, ty) + v(tx + 1, ty) + v(tx, ty + 1) + v(tx + 1, ty + 1)][0];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = at(sheet, c * T + x, r * T + y);
      /* the grass of the tile is left to the town's own ground underneath */
      if (n != null && rampOf(n) !== 'leaf' && rampOf(n) !== 'moss') put(out, tx * T + x, FOOT_TOP + ty * T + y, n);
    }
  }
  return despeck(out, 6);
}

/* The footing: the finished wall's own stones, seen from above; a low front run with a gap for the door. */
function footing(locked) {
  const r = rng(1855), LIFT = { stone0: 'stone1', stone1: 'stone2', stone2: 'stone3', stone3: 'stone4', earth2: 'earth3', earth3: 'earth4' };
  const stone = (x, y) => at(locked, 36 + ((x % 60) + 60) % 60, 179 + ((y % 16) + 16) % 16);
  const X0 = 33, X1 = 227, RY = 96, FY = 238, YB = 255, W = 12;
  const out = createImage(F, F);
  /* a worn edge: each stretch of 6-13 px sits 0-2 px in from the true line */
  const worn = (n) => { const a = []; while (a.length < n) { const k = r(), len = 6 + Math.floor(r() * 8), d = k < 0.45 ? 0 : k < 0.85 ? 1 : 2; for (let i = 0; i < len; i++) a.push(d); } return a; };
  const topRear = worn(F), topFront = worn(F), left = worn(F), right = worn(F), inRear = worn(F), inFront = worn(F), inL = worn(F), inR = worn(F);
  for (let y = RY; y <= YB; y++) for (let x = X0; x <= X1; x++) {
    /* cut corners */
    const cx = Math.min(x - X0, X1 - x), cy = Math.min(y - RY, YB - y);
    if (cx + cy < 4) continue;
    const l = x - X0 >= left[y], rr = X1 - x >= right[y], t = y - RY >= topRear[x];
    if (!l || !rr || !t) continue;
    const inRearRun = y <= RY + W + inRear[x], inFrontRun = y >= FY + inFront[x], inLeft = x <= X0 + W + inL[y], inRight = x >= X1 - W - inR[y];
    if (!(inRearRun || inFrontRun || inLeft || inRight)) continue;
    if (inFrontRun && !inLeft && !inRight && x >= 97 && x <= 159 && y < YB - 4) continue;   /* the door's gap, a low sill across it */
    const face = (inFrontRun && y >= FY + 7) || (inRearRun && y >= RY + 7 && !inLeft && !inRight);
    const n = stone(x, y);
    put(out, x, y, face ? n : (LIFT[n] || n));
  }
  void topFront;
  return outlined(despeck(out, 8));
}

/* ── the small things ───────────────────────────────────────────────────────────────────────────── */
function stakeAt(im, x, y) {   /* (x, y) the stake's foot; 5 wide, 13 tall, its top cut to a point */
  rect(im, x - 2, y - 11, x + 2, y, 'shadow0');
  put(im, x - 2, y - 11, null); put(im, x + 2, y - 11, null); rect(im, x - 1, y - 12, x + 1, y - 12, 'shadow0'); put(im, x, y - 13, 'shadow0');
  for (let r = y - 11; r < y; r++) { put(im, x - 1, r, 'earth5'); put(im, x, r, 'earth4'); put(im, x + 1, r, 'earth3'); }
  put(im, x, y - 12, 'earth5');
}
function ropeRun(im, ax, ay, bx, by, sag) {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * sag);
    put(im, x, y + 1, 'earth2'); put(im, x, y, (i % 4 === 0) ? 'earth5' : 'earth6');
  }
}
function ropeAndStakes(im) {
  /* eight corners (the plot's corners are cut), stakes between them on the long runs */
  const P = [[28, 84], [128, 80], [228, 84], [244, 100], [246, 172], [244, 240], [228, 255], [128, 255], [28, 255], [12, 240], [10, 172], [12, 100]];
  P.forEach(([x, y], i) => { const [a, b] = P[(i + 1) % P.length]; const flat = Math.abs(b - x) > Math.abs(a - y) ? 0 : 0; ropeRun(im, x, y - 8, a, b - 8, Math.abs(a - x) > 40 ? 3 : 1 + flat); });
  for (const [x, y] of P.slice().sort((p, q) => p[1] - q[1])) stakeAt(im, x, y);
}

/** A board on two legs with the scale painted on it (32 wide, 34 tall); (x, y) its top-left. */
function signBoard(im, x, y) {
  for (const lx of [5, 24]) { rect(im, x + lx - 1, y + 18, x + lx + 3, y + 33, 'shadow0'); rect(im, x + lx, y + 18, x + lx + 1, y + 32, 'earth3'); put(im, x + lx + 2, y + 25, 'earth2'); rect(im, x + lx + 2, y + 18, x + lx + 2, y + 32, 'earth2'); }
  rect(im, x, y, x + 31, y + 22, 'shadow0');
  rect(im, x + 1, y + 1, x + 30, y + 21, 'earth3');
  for (let r = y + 1; r <= y + 21; r++) { if ((r - y) % 7 === 0) rect(im, x + 1, r, x + 30, r, 'earth2'); }
  rect(im, x + 1, y + 1, x + 30, y + 1, 'earth5'); rect(im, x + 1, y + 21, x + 30, y + 21, 'earth1');
  /* the scale, in bone paint: a post, a beam, two pans */
  rect(im, x + 15, y + 4, x + 16, y + 18, 'bone0'); rect(im, x + 12, y + 18, x + 19, y + 19, 'bone0');
  rect(im, x + 6, y + 5, x + 25, y + 6, 'bone0');
  for (const px of [7, 24]) {
    for (let i = 0; i < 6; i++) { put(im, x + px - Math.floor(i / 2), y + 7 + i, 'bone0'); put(im, x + px + Math.floor(i / 2), y + 7 + i, 'bone0'); }
    rect(im, x + px - 4, y + 13, x + px + 4, y + 13, 'bone0'); rect(im, x + px - 3, y + 14, x + px + 3, y + 14, 'bone0');
  }
}

/** Squared beams stacked, cut from the finished ridge beam. (x, y) the stack's lower-left. */
function beams(im, locked, x, y, len) {
  const LIT = { shadow2: 'earth1', shadow3: 'earth2', earth1: 'earth2', earth2: 'earth3', earth3: 'earth4', earth4: 'earth5' };
  for (const [dx, dy, l] of [[2, -12, len - 14], [6, -6, len - 8], [0, 0, len]]) {
    /* the ridge's clear stretch (rows 27-33), left of where the gable crosses it, lit one step: this one lies in the sun */
    for (let r = 0; r <= 6; r++) for (let i = 0; i < l; i++) { const n = at(locked, 24 + i, 27 + r); put(im, x + dx + i, y + dy - 6 + r, LIT[n] || n); }
    /* the sawn end, and the butt's outline */
    rect(im, x + dx + l, y + dy - 6, x + dx + l + 6, y + dy, 'shadow0'); rect(im, x + dx + l, y + dy - 5, x + dx + l + 5, y + dy - 1, 'earth6'); rect(im, x + dx + l + 2, y + dy - 4, x + dx + l + 3, y + dy - 2, 'earth5');
    rect(im, x + dx - 1, y + dy - 6, x + dx - 1, y + dy, 'shadow0');
  }
}

/** Slates waiting on a pallet: four courses, each a step in or out of the last. (x, footY) its lower-left. */
function slateStack(im, x, footY) {
  rect(im, x, footY - 3, x + 25, footY, 'shadow0'); rect(im, x + 1, footY - 2, x + 24, footY - 2, 'earth4'); rect(im, x + 1, footY - 1, x + 24, footY - 1, 'earth2');
  for (let i = 0; i < 2; i++) put(im, x + 7 + i * 10, footY - 1, 'shadow0');
  [[2, 21], [3, 20], [1, 22], [3, 19]].forEach(([dx, w], c) => {
    const y = footY - 8 - c * 4, x0 = x + dx;
    rect(im, x0, y, x0 + w + 1, y + 4, 'shadow0');
    rect(im, x0 + 1, y + 1, x0 + w, y + 1, 'steel2'); rect(im, x0 + 1, y + 2, x0 + w, y + 2, 'steel1'); rect(im, x0 + 1, y + 3, x0 + w, y + 3, 'iron1');
    for (let s = 4 + c * 3; s < w; s += 7) { put(im, x0 + s, y + 2, 'iron0'); put(im, x0 + s, y + 3, 'iron0'); }
  });
}

function prop(set, id) {
  const sc = JSON.parse(readFileSync(join(ROOT, 'art/world', set, id + '.json'), 'utf8'));
  return lock(decodePNG(readFileSync(join(ROOT, 'art/world', set, id + '.png'))), sc.material);
}
const seat = (dst, im, x, footY) => blit(dst, im, 0, 0, im.width, im.height, x, footY - im.height + 1, true);
const over = (dst, im) => blit(dst, im, 0, 0, im.width, im.height, 0, 0, true);

function ladder(im, x, y0, y1) {   /* straight against the wall: two rails, rungs every 8 px */
  for (const rx of [x, x + 10]) { rect(im, rx - 1, y0, rx + 3, y1, 'shadow0'); for (let y = y0 + 1; y <= y1; y++) { put(im, rx, y, 'earth4'); put(im, rx + 1, y, 'earth3'); put(im, rx + 2, y, 'earth2'); } }
  for (let y = y0 + 6; y <= y1 - 3; y += 8) { rect(im, x + 3, y - 1, x + 9, y + 2, 'shadow0'); rect(im, x + 3, y, x + 9, y, 'earth4'); rect(im, x + 3, y + 1, x + 9, y + 1, 'earth2'); }
}

/* ── the stages ─────────────────────────────────────────────────────────────────────────────────── */
function staked() {
  const im = earthPatch({ islands: [[1, 1], [5, 1], [7, 5], [1, 5]] });
  ropeAndStakes(im);
  signBoard(im, 54, 198);
  return im;
}

function footings(locked) {
  const im = earthPatch({ door: true });
  over(im, footing(locked));
  signBoard(im, 54, 198);
  seat(im, prop('common', 'woodpile'), 58, 150);
  beams(im, locked, 114, 150, 72);
  seat(im, prop('sewer', 'crates'), 176, 196);
  seat(im, prop('mill', 'sack_stack'), 92, 198);
  seat(im, prop('mill', 'sack_stack'), 118, 212);
  seat(im, prop('common', 'woodpile'), 160, 232);
  seat(im, prop('cottage', 'cart_wheel'), 231, 254);
  return im;
}

function framed(locked, clean) {
  const wood = woodenRake(clean);
  const frame = createImage(F, F);
  /* the timbers above the ground floor: everything of the cut image that is wood, windows and slate left behind */
  for (let y = 0; y <= 170; y++) for (let x = 0; x < F; x++) {
    const n = at(wood, x, y);
    if (!isWood(n) || inSlate(x, y)) continue;
    if (WINDOWS.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) continue;
    put(frame, x, y, n);
  }
  despeck(frame, 14);
  /* the corbels under the jetty: the runs of columns that are wood all the way down */
  let run = -1;
  for (let x = 33; x <= 229; x++) {
    let wooden = true;
    for (let y = 172; y <= 175; y++) if (!isWood(at(clean, x, y))) wooden = false;
    if (wooden && run < 0) run = x;
    if (!wooden && run >= 0) { if (x - run >= 5) stamp(frame, clean, run, 171, x - 1, 179, run, 171, isWood); run = -1; }
  }
  /* the ground floor's frame, cut from the same posts, braces and beam */
  const postK = (n) => isWood(n);
  for (const px of [33, 91, 158, 220]) for (let y = 171; y <= 242; y++) stamp(frame, clean, 59, 106 + (y % 50), 66, 106 + (y % 50), px, y, postK);
  stamp(frame, clean, 89, 163, 170, 170, 89, 188);
  stamp(frame, clean, 33, 104, 58, 162, 41, 178, (n, x, y) => isWood(n) && x - 33 < 26 && Math.abs((y - 104) * 0.4 - (x - 33)) < 12);
  stamp(frame, clean, 199, 104, 224, 162, 192, 178, (n, x, y) => isWood(n) && Math.abs((y - 104) * 0.4 - (224 - x)) < 12);
  rafters(frame, clean, inSlate);
  const out = earthPatch({ door: true });
  over(out, footing(locked));
  seat(out, prop('common', 'woodpile'), 166, 228);
  seat(out, prop('mill', 'sack_stack'), 50, 234);
  over(out, outlined(frame));
  ladder(out, 206, 150, 250);
  return out;
}

function walled(locked, clean) {
  const im = woodenRake(clean);
  /* the roof, open: the dark of the attic, then purlins and rafters */
  for (let y = 34; y <= 94; y++) for (let x = 17; x <= 250; x++) if (inSlate(x, y) && at(im, x, y) != null) put(im, x, y, y < 40 ? 'shadow1' : 'shadow2');
  rafters(im, clean, (x, y) => inSlate(x, y) && at(locked, x, y) != null);
  /* no glass yet, no door yet, no plaque, no weights */
  for (const [a, b, c, d] of WINDOWS) for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) if (isIronish(at(im, x, y))) put(im, x, y, 'shadow2');
  for (let y = 180; y <= 255; y++) for (let x = 95; x <= 162; x++) if (inDoor(x, y)) put(im, x, y, y < 205 ? 'shadow1' : y < 240 ? 'shadow2' : y < 250 ? 'shadow3' : 'earth1');
  stamp(im, locked, 205, 208, 218, 221, 165, 208);
  for (let y = 231; y <= 255; y++) for (let x = 17; x <= 39; x++) { if (x < 33) put(im, x, y, null); else put(im, x, y, at(locked, x, y - 40)); }
  for (let y = 236; y <= 255; y++) for (let x = 206; x <= 226; x++) put(im, x, y, at(locked, x, y - 40));
  ladder(im, 206, 130, 250);
  slateStack(im, 4, 255);
  return im;
}

function plaque(locked) {
  const im = createImage(32, 32);
  /* the post and its stone foot, cut from the finished building */
  for (let y = 20; y <= 29; y++) stamp(im, locked, 59, 106 + y, 66, 106 + y, 12, y, isWood);
  rect(im, 9, 28, 22, 31, 'shadow0'); stamp(im, locked, 40, 186, 51, 187, 10, 29);
  /* the board */
  rect(im, 1, 2, 30, 22, 'shadow0');
  rect(im, 0, 3, 31, 21, 'shadow0');
  rect(im, 2, 3, 29, 21, 'bronze2'); rect(im, 1, 4, 30, 20, 'bronze2');
  rect(im, 2, 3, 29, 3, 'bronze3'); rect(im, 1, 4, 1, 20, 'bronze3'); rect(im, 2, 21, 29, 21, 'bronze0'); rect(im, 30, 4, 30, 20, 'bronze1');
  rect(im, 4, 6, 27, 18, 'gold0');
  rect(im, 3, 5, 28, 5, 'bronze1'); rect(im, 3, 19, 28, 19, 'bronze1'); rect(im, 3, 5, 3, 19, 'bronze1'); rect(im, 28, 5, 28, 19, 'bronze1');
  /* worked metal, not paint: a glint across the upper left, the lower right falling off into bronze */
  for (let y = 6; y <= 18; y++) for (let x = 4; x <= 27; x++) { const d = x + y; if (d <= 13 || (d >= 17 && d <= 18)) put(im, x, y, 'torch1'); else if (d >= 38) put(im, x, y, 'bronze3'); }
  /* the names, engraved */
  for (const [y, a, b] of [[9, 7, 24], [12, 7, 21], [15, 7, 23]]) { rect(im, a, y, b, y, 'bronze1'); put(im, a + 8, y, 'gold0'); put(im, a + 13, y, 'gold0'); }
  for (const [x, y] of [[2, 4], [29, 4], [2, 20], [29, 20]]) put(im, x, y, 'bronze0');
  /* a small pediment over the board */
  rect(im, 11, 0, 20, 3, 'shadow0'); put(im, 11, 0, null); put(im, 20, 0, null);
  rect(im, 12, 1, 19, 3, 'bronze2'); rect(im, 12, 1, 19, 1, 'bronze3'); rect(im, 15, 2, 16, 2, 'gold0');
  return im;
}

/* ── write ──────────────────────────────────────────────────────────────────────────────────────── */
function sidecar(id, cls, frame, anchor, footprint, pixellab, notes) {
  return { id, class: cls, style: 's1', material: 'native', source: id + '.png', frame, anchor_px: anchor, footprint,
    anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }], ...(pixellab ? { pixellab } : {}), notes };
}

function main() {
  const a = process.argv.slice(2), dirArg = a.includes('--out') ? a[a.indexOf('--out') + 1] : null;
  const dir = dirArg || join(ROOT, 'art/world/havora');
  mkdirSync(dir, { recursive: true });
  const raw = decodePNG(readFileSync(join(ROOT, RAW)));
  const locked = lock(raw, 'stone');
  const clean = withoutScale(locked);
  const GEN = { tool: 'create_image_pro', image: 'e91449b6-0c23-43c1-aa89-de08c36fb97b', seed: 1855, size: [256, 256], cost: 10, style: 'havora/havora_harbor_office' };
  const CUT = { tool: 'cut', from: 'havora_weighhouse_finished', image: GEN.image, cost: 0 };
  const EARTH = JSON.parse(readFileSync(join(ROOT, 'art/world/common/havora_grass_earth.json'), 'utf8')).pixellab.map;
  const stages = [
    ['havora_weighhouse_staked', staked(), { tool: 'cut', from: 'common/havora_grass_earth', map: EARTH, cost: 0 }, 'Town Works stage 0, 0 gp (plan x94-101 y55-60): trodden earth cut from the havora_grass_earth tiles, rope and stakes with the plot\'s corners cut and a board with the scale painted on it, drawn in the palette. tools/world-art/weighhouse-art.mjs, no generation.'],
    ['havora_weighhouse_footings', footings(locked), CUT, 'Town Works stage 1, 100,000 gp: the stone footing laid from the finished wall\'s own stones, beams cut from its ridge, the shipped woodpile, sack_stack, crates and cart_wheel. tools/world-art/weighhouse-art.mjs, no generation.'],
    ['havora_weighhouse_framed', framed(locked, clean), CUT, 'Town Works stage 2, 300,000 gp: the finished building\'s timbers with its plaster, stone, slate, windows and scale taken away, the ground floor\'s frame cut from the same posts. tools/world-art/weighhouse-art.mjs, no generation.'],
    ['havora_weighhouse_walled', walled(locked, clean), CUT, 'Town Works stage 3, 600,000 gp: walls up, the roof open to its rafters, doorway and windows still empty, slates and a ladder waiting. tools/world-art/weighhouse-art.mjs, no generation.'],
    ['havora_weighhouse_finished', finish(locked), GEN, 'Town Works stage 4, 1,000,000 gp: the Weighhouse. Stone ground floor, half-timbered upper floor, slate roof, the great scale on the gable, a hoist arm, the plaque in gold. PixelLab image locked as stone; plaque and pans repainted in the gold and bronze ramps by tools/world-art/weighhouse-art.mjs. Rises 61 px above its footprint.'],
  ];
  for (const [id, img, pl, notes] of stages) {
    writeFileSync(join(dir, id + '.png'), encodePNG(img));
    writeFileSync(join(dir, id + '.json'), JSON.stringify(sidecar(id, 'lot', [F, F], [128, 255], [8, 6], pl, notes), null, 2) + '\n');
  }
  const pid = 'havora_weighhouse_plaque';
  writeFileSync(join(dir, pid + '.png'), encodePNG(plaque(locked)));
  writeFileSync(join(dir, pid + '.json'), JSON.stringify(sidecar(pid, 'fixture', [32, 32], [16, 31], [1, 1], CUT, 'The Town Works plaque (plan 103, 53): a gold board in a bronze frame, the top givers\' names engraved, drawn in the palette, on a post and stone foot cut from the finished Weighhouse. tools/world-art/weighhouse-art.mjs, no generation.'), null, 2) + '\n');
  console.log('  wrote ' + stages.length + ' stages + the plaque to ' + dir);
}
main();
