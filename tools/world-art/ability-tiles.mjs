#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/ability-tiles.mjs — THE ABILITY TILES THE SET WAS MISSING, DRAWN BY RULE
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
//   FROST SLAM (2026-11-19) the tank's steel sabaton stamping down, ice bursting out from under it every way.
//   SHELTER    (2026-11-19) the earth's dome over the party: the tank's great helm in front, a mage's hat and a healer's hood.
//         These two draw their emblems from the world palette only (ON_WORLD_PALETTE; the writer refuses a stray colour).
//   STAGGER (2026-11-23, wave 3: Quarry Blow reworked, the same tile) the hammer coming down on a quarried stone, split under it.
//   PARRY   (2026-11-23, wave 3) a sword held across, a blow glancing off its blade in a spark: the sword's guard.
//   GASH    (2026-11-23, wave 3) a hatchet's head in the middle and its cut swept round it in four red slashes: the axes' ring.
//         The three wave-3 tiles draw on the world palette only, as the tank's two.
//
//   node tools/world-art/ability-tiles.mjs            write assets/icons-bundle/pixel/abilities/<id>.png
//   node tools/world-art/ability-tiles.mjs --out <d>  write to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/* ── THE TANK'S TWO RUNE SPELLS (lane/b-tank-rune-tiles, 2026-11-19) ─────────────────────────────────────────────────────────────
   Both keep the family's frame and field, and draw their emblems ONLY from the world palette (art/world/palette.json, hr-world-56-v2)
   plus the family's ink and white: ON_WORLD_PALETTE below, and the writer refuses a tile that strays. Both lean on the tank's steel, so
   they sit with Challenge and read as the shield's spells, not the Mage's or the Healer's. */

/** Rows of characters as shape pixels at (ox, oy): each character a colour from `legend`, any other character left alone. */
function paint(rows, legend, ox, oy) {
  const out = [];
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (legend[ch]) out.push([ox + i, oy + j, legend[ch]]); }));
  return out;
}

const STEEL = { d: '#3a4652', c: '#5c6c7a', b: '#8a9aa8', a: '#c4ccd2', k: INK };                // the palette's steel ramp
const ICE = { low: '#2b4a6a', mid: '#4fa8e8', lit: '#a8e4ff', pale: '#c8e6e0', spark: STUD };     // water, frost, mithril's top

/* FROST SLAM: a steel sabaton stamping down and the ice bursting out from under it every way (the spell chills everyone beside the tank).
   Not Hoarfrost's standing crystal or Frost Lance's flying shard: the boot is the verb. Tried and dropped: a gauntlet fist knuckles-down
   (its cuff and thumb read as a great helm's crown and visor), shards fanned both ways (a crab's legs), a filled frost ring (a foot in a
   basin). */
function frostSlam() {
  const g = frame();
  // the burst: one jagged star round the sole, squashed onto the ground, its points uneven
  const cx = 15.5, cy = 20, outer = [12, 10, 9, 10, 11, 12, 13, 11, 11, 13.5], inner = 6, n = outer.length;
  const point = (i) => (i % 2 === 0 ? outer[(i / 2) % n] : inner);
  const burst = [];
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const dx = x - cx, dy = (y - cy) / 0.85, r = Math.hypot(dx, dy);
    const a = ((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * n * 2;
    const k = Math.floor(a), f = a - k;
    const R = point(k % (2 * n)) * (1 - f) + point((k + 1) % (2 * n)) * f;
    if (r > R) continue;
    const e = r / R, lit = dx + dy < 0;
    burst.push([x, y, e < 0.4 ? ICE.spark : e < 0.62 ? ICE.pale : e < 0.85 ? (lit ? ICE.lit : ICE.mid) : (lit ? ICE.mid : ICE.low)]);
  }
  stamp(g, burst);
  // the sabaton, toe to the right, its greave running off the top: a tall shaft and a long low foot that tapers to its toe (a high
  // instep read as a bell, a round toe as a slipper). Per row: y, left edge, right edge.
  const rows = [[3, 8, 14], [4, 8, 14], [5, 8, 14], [6, 9, 14], [7, 9, 14], [8, 9, 14], [9, 9, 14], [10, 9, 14], [11, 9, 14],
    [12, 9, 15], [13, 8, 17], [14, 8, 19], [15, 8, 21], [16, 8, 22]];
  const top = (x) => rows.find(([, L, R]) => x >= L && x <= R)[0];
  const boot = [];
  for (const [y, L, R] of rows) for (let x = L; x <= R; x++) {
    const c = y < 12 ? (x === L ? STEEL.b : x === L + 1 ? STEEL.a : x === R ? STEEL.d : x === R - 1 ? STEEL.c : STEEL.b)
      : y === top(x) && x > 14 ? STEEL.a : x === L ? STEEL.b : y === 16 ? STEEL.c : STEEL.b;
    boot.push([x, y, c]);
  }
  for (let x = 8; x <= 22; x++) boot.push([x, 17, x === 22 ? STEEL.c : STEEL.d]);   // the sole
  stamp(g, boot);
  // the greave's two bands, the ankle's rivet, and the toe's lames: a dark edge with a lit plate after it
  for (const y of [5, 11]) for (let x = 9; x <= 14; x++) g[y][x] = STEEL.d;
  g[13][11] = STUD; g[14][11] = STEEL.c;
  for (const [x0, y0] of [[16, 13], [18, 14], [20, 15]]) for (let y = y0; y <= 16; y++) {
    g[y][x0] = STEEL.d;
    if (g[y][x0 + 1] === STEEL.b || g[y][x0 + 1] === STEEL.c) g[y][x0 + 1] = STEEL.a;
  }
  // a streak of frost either side of the shaft: it is coming down
  for (const [x, y0, y1] of [[6, 7, 11], [17, 4, 8]]) for (let y = y0; y <= y1; y++) g[y][x] = y === y1 ? ICE.pale : ICE.mid;
  return g;
}

/* SHELTER: the earth's dome over the party, the tank in front in a steel great helm, a mage's pointed hat and a healer's hood behind it.
   Not the Ward's ring round one green shield, nor the Barrier's blue disc: three heads under one roof is the whole party. Tried and dropped:
   three tower shields (cardboard boxes; under an arch, a chest with a handle) and three alike helms (one knight in pauldrons). */
const EARTHLIGHT = { hi: '#ffd36a', mid: '#e8c547', low: '#cfa25c' };                             // torch, gold, bronze's top
const SKIN = { s: '#dcae86', t: '#b5835f' };
const TANK = { rows: ['..abbc..', '.abbbbc.', 'abbbbbcd', 'akkkkkkd', 'abbkkbcd', '.bbkkbc.', '..cddc..', '.abbbbbbcd.', 'abdbbbbdbcd'], at: -1, ink: STEEL };
const MAGE = { rows: ['....a..', '...ab..', '...abc.', '..aabc.', '..abbc.', 'aabbbcc', '.cssst.', '.ctsst.', '.abbbc.', 'aabbbcc'], at: 0,
  ink: { a: '#4fa8e8', b: '#2b4a6a', c: '#1a2c44', ...SKIN } };                                   // frost and water
const HEALER = { rows: ['.abc..', 'aabbc.', 'abbbcd', 'absscd', 'abtscd', 'abbbcd'], at: 0,
  ink: { a: '#73944c', b: '#557a3e', c: '#3d6234', d: '#2c4a2c', ...SKIN } };                     // leaf

/** One of the party with the crown of its head at (x0, y0): its rows, the last two (the shoulders) set `at` px left of the head and the
 *  last repeated down to the field's foot. */
function partyMember(x0, y0, who) {
  const head = who.rows.slice(0, -2), body = who.rows.slice(-2);
  const below = 29 - (y0 + head.length);
  const rows = [...body, ...Array(Math.max(0, below - body.length)).fill(body[1])];
  return [...paint(head, who.ink, x0, y0), ...paint(rows, who.ink, x0 + who.at, y0 + head.length)];
}

function shelter() {
  const g = frame();
  // the dome: a squared arch from the ground on one side to the ground on the other, lit at its upper left
  const arch = [];
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const e = Math.pow(Math.pow(Math.abs(x - 15.5) / 12.4, 2.5) + Math.pow(Math.abs(y - 28.5) / 23.6, 2.5), 1 / 2.5);
    if (e < 0.91 || e > 1.0) continue;
    arch.push([x, y, e > 0.955 ? (x < 15.5 && y < 18 ? EARTHLIGHT.hi : EARTHLIGHT.mid) : x < 20 ? EARTHLIGHT.mid : EARTHLIGHT.low]);
  }
  stamp(g, arch);
  stamp(g, partyMember(6, 10, MAGE));
  stamp(g, partyMember(20, 13, HEALER));
  stamp(g, partyMember(12, 15, TANK));
  return g;
}

/* QUARRY BLOW (lane/c-spell-rule, 2026-11-21: the hammer's Earth rune strike, Tyler call 32-5): a war hammer's steel head coming down on a
   quarried stone block, the block split under it and its chips thrown up. The stone is the verb's object, as the ice is Frost Slam's: not
   the Ward's shield or the Barrier's disc (the Earth family's shells), and not Power Strike's star. World palette only, as the tank's two. */
const ROCK = { lit: '#aaa49a', top: '#8a867d', face: '#6a6865', dark: '#4f4e52', deep: '#3a3a3e' };   // the palette's stone ramp
const HAFT = { lit: '#a8743a', mid: '#7a4f26', dark: '#4a2e18' };                                    // bronze: a worn wooden haft

function quarryBlow() {
  const g = frame();
  // the block: a squat cut stone sitting on the field's foot, lit on its top face, its crack running down from the blow
  const block = [];
  for (let y = 18; y < 29; y++) for (let x = 5; x < 27; x++) {
    const topFace = y < 21, left = x < 8;
    block.push([x, y, topFace ? (x < 14 ? ROCK.lit : ROCK.top) : left ? ROCK.top : y > 25 ? ROCK.dark : ROCK.face]);
  }
  stamp(g, block);
  // the split: a dark zigzag from under the head to the foot, its lit lip beside it
  for (const [x, y] of [[16, 18], [16, 19], [15, 20], [15, 21], [16, 22], [17, 23], [17, 24], [16, 25], [16, 26], [17, 27], [17, 28]]) {
    g[y][x] = ROCK.deep;
    if (g[y][x - 1] === ROCK.face || g[y][x - 1] === ROCK.top) g[y][x - 1] = ROCK.lit;
  }
  // the hammer's head, square-faced, coming down on the block from the upper right, its haft running off to the corner
  const head = paint(['abbbbbbc', 'abbbbbbc', 'aabbbbcc', 'abbbbbbc', 'abbbbbbc', 'dddddddd'],
    { a: STEEL.a, b: STEEL.b, c: STEEL.c, d: STEEL.d }, 12, 11);
  stamp(g, head);
  stamp(g, lens([19, 13], [27, 4], () => 1.1, (t, d) => (d > 0.2 ? HAFT.lit : d > -0.5 ? HAFT.mid : HAFT.dark)));
  // the chips the blow throws up, and the dust on either side of the head
  for (const [x, y, c] of [[9, 14, ROCK.top], [10, 12, ROCK.lit], [7, 16, ROCK.face], [23, 16, ROCK.top], [24, 14, ROCK.lit]]) g[y][x] = c;
  for (const [x, y] of [[8, 17], [11, 16], [22, 17], [25, 17]]) g[y][x] = ROCK.lit;
  return g;
}

/* ── THE WAVE-3 ANSWERS (lane/moves-wave-3, 2026-11-23; docs/design/redesign/23-spell-audit.md section 4) ─────────────────────────
   STAGGER is Quarry Blow reworked (the hammer's Earth rune strike that ends a wind-up), so it keeps Quarry Blow's tile above: the hammer
   coming down on the stone. PARRY and GASH are new, both on the world palette only. */
const SPARK = { core: STUD, hot: '#ffd36a', warm: '#f2a03a' };                                     // white, the torch ramp
const GUARD = { lit: '#e8c547', mid: '#cfa25c', dark: '#7a4f26' };                                 // gold, bronze
const CUT = { lit: '#c23a2a', mid: '#8e1f1f', deep: '#5e1a1f' };                                    // blood, cloth's dark red

/* PARRY: a sword held across the tile, point up and to the right, a blow glancing off the blade in a spark, the strike's two streaks
   thrown off past it. The sword's guard, not Challenge's shield held up and not Power Strike's star on its own: the blade is the verb. */
function parry() {
  const g = frame();
  // the blade: a long steel lens from the guard to the point, lit on its upper edge
  stamp(g, lens([10, 22], [26, 6], (t) => (t > 0.86 ? 1.6 * (1 - t) / 0.14 + 0.3 : 1.6), (t, d, w) => (d > 0.35 * w ? STEEL.a : d > -0.45 * w ? STEEL.b : STEEL.c)));
  // the fuller: a dark line down the blade's middle
  for (let t = 0.1; t < 0.78; t += 0.02) { const x = Math.round(10 + 16 * t), y = Math.round(22 - 16 * t); if (g[y][x] === STEEL.b) g[y][x] = STEEL.d; }
  // the crossguard across the blade, gold, and the grip and pommel below it
  stamp(g, lens([7, 19], [13, 25], () => 1.1, (t, d) => (d > 0.2 ? GUARD.lit : d > -0.4 ? GUARD.mid : GUARD.dark)));
  stamp(g, lens([9, 23], [5, 27], () => 1, (t, d) => (d > 0.2 ? HAFT.lit : d > -0.4 ? HAFT.mid : HAFT.dark)));
  stamp(g, [[4, 27, GUARD.lit], [4, 28, GUARD.mid], [5, 28, GUARD.dark]]);
  // the blow glancing off: a spark on the blade's edge, white at its heart, torch light round it
  const sx = 18, sy = 12;
  for (const [dx, dy, c] of [[0, 0, SPARK.core], [-1, 0, SPARK.core], [0, -1, SPARK.core], [1, 0, SPARK.hot], [0, 1, SPARK.hot], [-2, 0, SPARK.hot], [0, -2, SPARK.hot],
    [-1, -1, SPARK.hot], [1, -1, SPARK.hot], [-1, 1, SPARK.hot], [-3, 0, SPARK.warm], [-4, 0, SPARK.warm], [0, -3, SPARK.warm], [0, -4, SPARK.warm],
    [-2, -2, SPARK.warm], [-3, -3, SPARK.warm], [2, -2, SPARK.warm], [3, -3, SPARK.warm], [-2, 2, SPARK.warm], [2, 2, SPARK.warm]]) g[sy + dy][sx + dx] = c;
  // the strike's streaks, thrown off up and away from the blade
  for (const [x, y] of [[14, 5], [15, 6], [16, 7], [11, 7], [12, 8], [13, 9]]) g[y][x] = STEEL.a;
  return g;
}

/* GASH: the axes' cut swept round the hero in four red slashes, each swelling in its middle and running to a point, with the hatchet's
   head in the middle and a drop shed off each slash. Rend's three gashes are one target's wounds; this is a ring. */
function gash() {
  const g = frame();
  const cx = 15.5, cy = 16, r0 = 9.2;
  const ring = [];
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) {
    const r = Math.hypot(x - cx, y - cy), a = (Math.atan2(y - cy, x - cx) * 180 / Math.PI + 360) % 360;
    // four slashes of 70 degrees, each starting 20 degrees past a quarter turn, swelling in their middle
    const k = Math.floor(((a + 340) % 360) / 90), f = (((a + 340) % 360) - 90 * k) / 70;
    if (f < 0 || f > 1) continue;
    const w = 0.45 + 1.55 * Math.sin(Math.PI * f);
    const d = r - r0;
    if (Math.abs(d) > w) continue;
    const lit = Math.cos((a - 225) * Math.PI / 180) > -0.2;               // the slashes facing the upper-left light
    ring.push([x, y, d < 0.25 * w ? (lit || d < -0.3 * w ? CUT.lit : CUT.mid) : d < 0.6 * w ? CUT.mid : CUT.deep]);
  }
  stamp(g, ring);
  // the hatchet's head in the middle: a steel bit with its edge lit, on a short bronze haft
  const head = paint(['..abbc', '.abbbc', 'abbbbd', 'abbbbd', '.abbbc', '..abbc'], { a: STEEL.a, b: STEEL.b, c: STEEL.c, d: STEEL.d }, 12, 13);
  stamp(g, head);
  stamp(g, lens([17, 16], [21, 20], () => 0.9, (t, d) => (d > 0.2 ? HAFT.lit : d > -0.4 ? HAFT.mid : HAFT.dark)));
  // a drop shed off each slash, outward
  for (const [x, y] of [[26, 9], [24, 27], [5, 22], [8, 5]]) { g[y][x] = CUT.lit; g[y + 1][x] = CUT.deep; }
  return g;
}

export const DRAW = Object.freeze({ mend, rend, protective_ward: ward, undertow, frost_slam: frostSlam, shelter, stagger: quarryBlow, parry, gash });

/** The tiles whose emblems are locked to the world palette (the four above them wear their sibling tiles' colours, as the header says). */
const ON_WORLD_PALETTE = Object.freeze(['frost_slam', 'shelter', 'stagger', 'parry', 'gash']);

/** The colours in tile `id` that are neither the world palette's nor the family frame's (frame, field, ink, white): [] when it is locked. */
function offPalette(id) {
  const ramps = JSON.parse(readFileSync(join(ROOT, 'art', 'world', 'palette.json'), 'utf8')).ramps;
  const ok = new Set([...Object.values(ramps).flat(), ...frame().flat().filter(Boolean), INK, STUD].map((c) => c.toLowerCase()));
  return [...new Set(DRAW[id]().flat().filter((c) => c && !ok.has(c.toLowerCase())))];
}

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
  const strays = ON_WORLD_PALETTE.map((id) => [id, offPalette(id)]).filter(([, off]) => off.length);
  if (strays.length) { console.error('ability-tiles: off the world palette, nothing written: ' + JSON.stringify(strays)); process.exit(1); }
  mkdirSync(dir, { recursive: true });
  for (const [id, draw] of Object.entries(DRAW)) writeFileSync(join(dir, id + '.png'), encodePNG(toImage(draw())));
  console.log('ability-tiles: wrote ' + Object.keys(DRAW).length + ' tiles to ' + dir);
}
