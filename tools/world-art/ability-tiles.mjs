#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/ability-tiles.mjs — THE THREE ABILITY TILES THE SET WAS MISSING, DRAWN BY RULE
// (lane a-art-batch-0, 2026-11-04; art audit gap 3: Mend, Rend and Protective Ward showed a grey glyph
// beside framed tiles in Configure action, and Mend is every hero's heal).
//
// THE FAMILY, NOT THE WORLD PALETTE (Art Director's call, 2026-11-04). The 13 shipped tiles came over from
// the hunt sim's set: 29-60 colours, none on hr-world-56-v2, and a coherent family all the same: a hot gold
// frame with white corner studs, a slate field lit from the top, one black-outlined emblem. Snapping the 13
// to the palette was tried and read worse at the bar's size: the frame's oranges split into bronze and blood
// and went patchy, and every glow (Power Strike's star, the Barrier's core) lost its top step. A cleanup over
// shipped art is what Tyler rejected on 10-22, and a bar half on one palette and half on the other is the
// worst result, so these three wear the family's own colours (FRAME, FIELD, and each emblem's sibling tile).
//
// The shape of each emblem is data and its shading is a rule, as in longbow-icon.mjs; nothing is read from a
// shipped file, so the output is fixed by this script (tests/pixel-icons.mjs rule `drawn`).
//   MEND  one leaf, torn and sewn back up: Greater Mend's green and its white plus, but a single stitched leaf
//         rather than a plant in leaf, so the humble spell reads as the humble spell.
//   REND  three torn gashes and the drops they shed: Challenge's reds. Nothing else on the bar is a wound, and
//         Cleave's hatchet is one tile away, so this one shows what the axes do, not the axes.
//   WARD  a gold-rimmed heater shield with a leaf on it inside a pale bubble: a shield put on someone else, not
//         Challenge's steel one held up, and not the Barrier's blue disc.
//   UNDERTOW (2026-11-09) a whirlpool winding down to a dark eye, foam on its lit outer turn: the Healer's own strike,
//         water that drags, not Frost Lance's ice shard or the Barrier's disc.
//
//   node tools/world-art/ability-tiles.mjs            write assets/icons-bundle/pixel/abilities/<id>.png
//   node tools/world-art/ability-tiles.mjs --out <d>  write to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'abilities');

const STUD = '#fdfeff', RUST = '#a63f00', AMBER = '#dc6600', GILT = '#fada47', ORANGE = '#ea9100', ORANGE2 = '#e88e00', SHADE = '#d96200', SHADE2 = '#d86900', DEEP = '#540b03';
const BEVEL = '#2e3646', BEVEL2 = '#2b3242', BEVEL3 = '#222938', BEVEL4 = '#1f2635';
const BANDS = ['#4a6571', '#405262', '#3e4e5f', '#3d495c', '#3c4559', '#394256'];
const INK = '#000000';

/** The grid every tile starts from: frame and field. The field's lit band runs a little lower on the left, as Challenge's does. */
function frame() {
  const g = Array.from({ length: 32 }, () => Array(32).fill(null));
  for (let x = 0; x < 32; x++) { g[0][x] = RUST; g[31][x] = DEEP; g[1][x] = GILT; g[30][x] = SHADE2; g[2][x] = BEVEL2; g[29][x] = x > 19 ? BEVEL4 : BEVEL2; }
  for (let y = 0; y < 32; y++) { g[y][0] = RUST; g[y][31] = DEEP; }
  for (let y = 1; y < 31; y++) {
    g[y][1] = y < 16 ? ORANGE : AMBER;
    g[y][30] = y < 16 ? ORANGE2 : SHADE;
    g[y][2] = y < 17 ? BEVEL : BEVEL2;
    g[y][29] = y < 9 ? BEVEL2 : y < 15 ? BEVEL3 : BEVEL4;
  }
  for (const [x, y, c] of [[1, 1, AMBER], [30, 1, AMBER], [1, 2, GILT], [30, 2, GILT], [1, 29, AMBER], [1, 30, RUST], [30, 29, SHADE], [30, 30, DEEP], [28, 30, AMBER]]) g[y][x] = c;
  for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) g[y][x] = STUD;
  for (let x = 3; x < 7; x++) g[2][x] = BEVEL;
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const step = Math.round((28 - x) / 25 * 4);
    const row = y - step;
    g[y][x] = row < 9 ? BANDS[0] : row < 10 ? BANDS[1] : row < 11 ? BANDS[2] : row < 12 ? BANDS[3] : row < 13 ? BANDS[4] : BANDS[5];
  }
  return g;
}

/** Paint `shape` ([x, y, colour]) over the grid, with a 1 px ink outline where its pixels meet the field (4-neighbour, corners cut, as the set does). */
function stamp(g, shape) {
  const at = new Set(shape.map(([x, y]) => x + ',' + y));
  for (const [x, y] of shape) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (!at.has(nx + ',' + ny) && nx >= 3 && nx < 29 && ny >= 3 && ny < 29) g[ny][nx] = INK;
  }
  for (const [x, y, c] of shape) if (x >= 3 && x < 29 && y >= 3 && y < 29) g[y][x] = c;
}

/** Pixels within a lens between two points; `fn(t, d, w)` colours one: t along the axis 0-1, d across it (positive on the upper-left, lit side), w the half-width there. */
function lens([ax, ay], [bx, by], width, fn) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), out = [];
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const px = x - ax, py = y - ay, t = (px * dx + py * dy) / (len * len);
    if (t < 0 || t > 1) continue;
    const d = (px * dy - py * dx) / len, w = width(t);
    if (Math.abs(d) <= w) out.push([x, y, fn(t, d, w)]);
  }
  return out;
}

const LEAF = { lit: '#a6e8da', hi: '#7dcf4c', mid: '#5fb83f', low: '#379638', deep: '#21802e', dark: '#0c552f', stem: '#0a452c' };
const THREAD = '#fdfeff';

function mend() {
  const g = frame();
  const A = [8, 25], B = [25, 7];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len;
  /** The pixel `d` across the rib (positive = the lit, upper-left side) at `t` along it. */
  const P = (t, d) => [Math.round(A[0] + (B[0] - A[0]) * t + d * uy), Math.round(A[1] + (B[1] - A[1]) * t - d * ux)];
  const leaf = lens(A, B, (t) => 7.4 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.8), (t, d, w) => {
    const e = Math.abs(d) / w;
    if (d > 0) return e > 0.78 ? (t > 0.3 && t < 0.72 ? LEAF.lit : LEAF.hi) : e > 0.2 ? LEAF.hi : LEAF.mid;
    return e > 0.78 ? LEAF.dark : e > 0.45 ? LEAF.deep : LEAF.low;
  });
  stamp(g, leaf);
  // veins: dark steps off the rib on the lit half, light steps on the shaded half
  for (const t of [0.24, 0.4, 0.56, 0.72]) {
    for (const d of [1, 2, 3, 4]) { const [x, y] = P(t + d * 0.024, d); if (g[y][x] !== INK) g[y][x] = LEAF.mid; }
    for (const d of [1, 2, 3]) { const [x, y] = P(t + d * 0.024, -d); if (g[y][x] !== INK) g[y][x] = LEAF.mid; }
  }
  // the torn rib: a dark seam, and white stitches across it
  for (let t = 0.04; t < 0.95; t += 0.01) { const [x, y] = P(t, 0); if (g[y][x] !== INK) g[y][x] = LEAF.dark; }
  for (const t of [0.3, 0.5, 0.7]) for (const d of [-1, 0, 1]) { const [x, y] = P(t, d); g[y][x] = THREAD; }
  // the stem
  stamp(g, [[7, 25, LEAF.deep], [6, 26, LEAF.deep], [5, 27, LEAF.dark], [6, 25, LEAF.dark], [5, 26, LEAF.dark]]);
  // the plus, Greater Mend's: white on a dark halo
  for (const [x, y] of [[9, 4], [8, 5], [9, 5], [10, 5], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [8, 7], [9, 7], [10, 7], [9, 8]]) g[y][x] = LEAF.dark;
  for (const [x, y] of [[9, 5], [8, 6], [9, 6], [10, 6], [9, 7]]) g[y][x] = THREAD;
  return g;
}

const GASH = { core: '#fe0010', mid: '#d10011', low: '#87001c' };

function rend() {
  const g = frame();
  // each gash swells low and runs out to a point, a lit lip over a shaded one: fuller and it read as three chillies at the bar's x2
  const gashes = [
    [[5, 21], [17, 4], 1.5],
    [[9, 28], [25, 5], 2],
    [[17, 28], [28, 13], 1.5],
  ];
  for (const [a, b, wide] of gashes) {
    const swell = (t) => wide * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.8);
    stamp(g, lens(a, b, swell, (t, d, w) => (d > 0.15 * w ? GASH.core : d > -0.5 * w ? GASH.mid : GASH.low)));
  }
  // the drops they shed
  for (const [x, y] of [[4, 24], [21, 26]]) stamp(g, [[x, y, GASH.core], [x, y + 1, GASH.low]]);
  return g;
}

const SHIELD = { rim: GILT, rim2: '#e99200', lit: '#3baa43', face: '#21802e', dark: '#0c552f', deep: '#0a452c', leaf: '#d7f4fc', leaf2: '#7dcf4c' };
const BUBBLE = { hi: '#d7f4fc', mid: '#7ddfc9', low: '#47b9d2', spark: '#fdfeff' };

function ward() {
  const g = frame();
  // the bubble: an open ring, brightest at the upper left
  const ring = [];
  const cx = 15.5, cy = 15.5;
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const r = Math.hypot(x - cx, y - cy);
    if (r < 10.7 || r > 11.8) continue;
    const a = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    if (a > 62 && a < 118) continue;                                  // open at the foot
    ring.push([x, y, a < -30 && a > -170 ? BUBBLE.hi : a > -30 && a < 25 ? BUBBLE.mid : BUBBLE.low]);
  }
  stamp(g, ring);
  // the shield: per row its half-width, a shallow crown at the top and a point at the foot
  const rows = [5, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 5, 5, 4, 3, 2, 1];
  const top = 8, mid = 15.5;
  const face = [];
  rows.forEach((w, i) => {
    const y = top + i, L = Math.ceil(mid - w), R = Math.floor(mid + w);
    for (let x = L; x <= R; x++) {
      let c;
      if (i <= 1 || x === L) c = SHIELD.rim;
      else if (x === R || i === rows.length - 1) c = SHIELD.rim2;
      else if (x < mid && i < 9) c = SHIELD.lit;
      else if (x < mid || i < 9) c = SHIELD.face;
      else c = SHIELD.dark;
      face.push([x, y, c]);
    }
  });
  stamp(g, face);
  // the leaf on it: a pale lit side, a green shaded one, a dark stalk
  for (const [x, y, c] of [[18, 11, SHIELD.leaf], [17, 12, SHIELD.leaf], [18, 12, SHIELD.leaf2], [16, 13, SHIELD.leaf], [17, 13, SHIELD.leaf2], [18, 13, SHIELD.leaf2], [15, 14, SHIELD.leaf], [16, 14, SHIELD.leaf2], [17, 14, SHIELD.leaf2], [14, 15, SHIELD.leaf], [15, 15, SHIELD.leaf2], [16, 15, SHIELD.leaf2], [14, 16, SHIELD.leaf2], [15, 16, SHIELD.leaf2], [13, 17, SHIELD.deep], [12, 18, SHIELD.deep]]) g[y][x] = c;
  // a glint on the bubble
  for (const [x, y] of [[7, 7], [6, 8], [8, 8], [7, 9]]) g[y][x] = BUBBLE.hi;
  g[8][7] = BUBBLE.spark;
  return g;
}

/* UNDERTOW (lane/b-one-difficulty, 2026-11-09: the Healer's strike when it hunts alone): a whirlpool that pulls down, the
   Water family's blues taken from its sibling tiles (Frost Lance's ice, the Barrier's deep blue) and the set's white foam.
   One arm wound inward: bright foam where the outer turn meets the light (upper left), darker the deeper it winds. */
const WATER = { foam: '#fdfeff', crest: '#b7f9fa', light: '#8be1fc', mid: '#60b1dc', body: '#3680b3', low: '#1173b6', deep: '#07497f' };

function undertow() {
  const g = frame();
  const cx = 15.5, cy = 16, top = 3.55 * Math.PI, r0 = 1.4, grow = 2.75 / Math.PI;
  const arm = [];
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const rho = Math.hypot(x - cx, y - cy), phi = (Math.atan2(y - cy, x - cx) + 2 * Math.PI) % (2 * Math.PI);
    let best = null;
    for (let k = 0; k < 3; k++) {
      const th = phi + 2 * Math.PI * k;
      if (th > top) break;
      const d = rho - (r0 + grow * th), w = 0.75 + 1.25 * (th / top);
      if (Math.abs(d) <= w && (!best || Math.abs(d) < Math.abs(best.d))) best = { th, d, w };
    }
    if (!best) continue;
    const t = best.th / top, e = best.d / best.w;
    const lit = Math.cos(phi - 1.25 * Math.PI) > 0.2;                   // facing the upper-left light
    const c = e > 0.35 && lit ? (t > 0.7 ? WATER.foam : WATER.crest)
      : e < -0.45 ? (t > 0.55 ? WATER.body : WATER.deep)
      : e > 0.35 ? WATER.light : t > 0.75 ? WATER.mid : t > 0.45 ? WATER.body : WATER.low;
    arm.push([x, y, c]);
  }
  stamp(g, arm);
  // the eye it pulls down into
  for (const [x, y] of [[15, 16], [16, 16], [15, 15]]) g[y][x] = WATER.deep;
  // spray thrown off the outer turn
  for (const [x, y, c] of [[25, 6, WATER.foam], [26, 7, WATER.crest], [23, 4, WATER.crest]]) g[y][x] = c;
  return g;
}

export const DRAW = Object.freeze({ mend, rend, protective_ward: ward, undertow });

/** A grid (hex or null per pixel) as an opaque 32x32 image. */
export function toImage(g) {
  const img = createImage(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = g[y][x];
    if (!c) continue;
    const i = (y * 32 + x) * 4;
    img.data[i] = parseInt(c.slice(1, 3), 16); img.data[i + 1] = parseInt(c.slice(3, 5), 16); img.data[i + 2] = parseInt(c.slice(5, 7), 16); img.data[i + 3] = 255;
  }
  return img;
}

if (isMain(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  const dir = at > 0 ? process.argv[at + 1] : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  for (const [id, draw] of Object.entries(DRAW)) writeFileSync(join(dir, id + '.png'), encodePNG(toImage(draw())));
  console.log('ability-tiles: wrote ' + Object.keys(DRAW).length + ' tiles to ' + dir);
}
