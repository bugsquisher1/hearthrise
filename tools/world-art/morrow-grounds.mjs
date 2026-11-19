#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/morrow-grounds.mjs — THE MORROW HILLS' KIT ON THE GROUND: CARTER'S REST (lane/b-morrow-kit, 2026-11-19).
//
//   node tools/world-art/morrow-grounds.mjs ground          paint art/world/morrow/carters_rest_ground.png from the map's rows
//   node tools/world-art/morrow-grounds.mjs patch OUT.png   the same painter on a small review patch (moor, road, yard, wall, gate)
//
// The rules are art/briefs/morrow-hills-art-rules.txt (the sample's, three unanchored rounds) on top of ART_DIRECTION.md:
//   FLOORS  every cell takes a VARIETY tile of its floor's fill (tools/world-art/variety.mjs, picked as src/world/core/ground-variety.js
//           picks), so no floor shows its 32 px repeat; every border between two floors is redrawn from the two fills' own pixels
//           (tools/world-art/seams.mjs). The Hills paint dim: the moor is the sample's moor shaded 3 (its earth colours 1), the road
//           shaded 1, so a lifted troll reads 3:1; the inn's floors were born dim on the palette (gen-2026-11-19/morrow-kit 1-3).
//   ROAD    it must read in greyscale (rule 5): its verge is worn a step lighter than its middle, pebbles lie on it a step up, two
//           broken ruts run along its middle. The moor gets olive and dead-bracken patches of its own value (the round-3 carry-overs).
//   WALLS   the inn's mass is a slate roof stepped down; a mass cell over a floor shows a FACE (a 32x60 slice of the inn wall run, its
//           cap lit, features every sixth cell: a boarded window, a plank door, the taproom's hearth; an END piece where a run stands
//           free); its other edges show the cap seen from above. The yard's dry stone wall is the 24 px stub run with its two
//           tumbled end pieces at the gate. Nothing is drawn by hand: every wall pixel is a kept piece's, snapped to the palette.
// mutant-anchors: none — an import tool; tests/world-assets.mjs judges what it writes
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit, crop } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { lock, shadeGround, liftBody } from './lock.mjs';
import { RAMPS } from './palette.mjs';
import { reseam } from './seams.mjs';
import { varietyTiles, decalOf } from './variety.mjs';
import { stepPatches, bakeDecals, noise, hash2 } from './ground-finish.mjs';
import { toneAt, varietyIndex } from '../../src/world/core/ground-variety.js';
import { isMain } from '../../tests/_is-main.mjs';

const T = 32;
export const SRC = 'art/world-src/gen-2026-11-19/morrow-kit';
export const SET = 'morrow', GROUND = 'carters_rest_ground';
const abs = (p) => join(ROOT, p);
const rd = (p) => decodePNG(readFileSync(abs(p)));
const hexAt = (im, p) => '#' + [0, 1, 2].map((k) => im.data[p + k].toString(16).padStart(2, '0')).join('');
const rgb = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
const EARTH = new Set(RAMPS.earth);

/* ── the fills ── */
const metaOf = (dir) => { const f = readdirSync(abs(dir)).find((n) => n.endsWith('-metadata.json')); return { meta: JSON.parse(readFileSync(abs(dir + '/' + f), 'utf8')), sheet: rd(dir + '/' + f.replace('-metadata.json', '-sheet.png')) }; };
function fillOf(dir, key) {
  const { meta, sheet } = metaOf(dir);
  const t = meta.tileset_data.tiles.find((q) => ['NW', 'NE', 'SW', 'SE'].map((c) => (q.corners[c] === 'upper' ? '1' : '0')).join('') === key);
  return crop(sheet, t.bounding_box.x, t.bounding_box.y, T, T);
}
/** The Hills' shade (the sample's): greens and greys `deep` steps down, the earth ramp `earth` steps (rule 1). */
export function hillsShade(img, deep = 3, earth = 1) {
  const a = shadeGround(img, deep), b = earth ? shadeGround(img, earth) : img;
  for (let p = 0; p < img.data.length; p += 4) if (EARTH.has(hexAt(img, p))) a.data.set(b.data.subarray(p, p + 3), p);
  return a;
}
/** Every colour of `img` mapped through `map` ({ '#from': '#to' }). */
function remap(img, map) {
  const o = createImage(img.width, img.height); o.data.set(img.data);
  for (let p = 0; p < o.data.length; p += 4) { const to = map[hexAt(o, p)]; if (to) o.data.set(rgb(to), p); }
  return o;
}
/* the slate a step down (the walked roof): stone into iron and shadow, as the Hold's wall-walk */
/* the brewhouse's flags: the cellar's stone a step lighter (shadow into stone: liftBody leaves the shadow ramp where it is) */
const BREW_LIFT = { '#17141a': '#231d1f', '#231d1f': '#2f2723', '#2f2723': '#3a3a3e', '#2c2e33': '#3a3a3e', '#3a3a3e': '#4f4e52' };
const SLATE_1 = { '#3a3a3e': '#2c2e33', '#4a4d54': '#3a3a3e', '#4f4e52': '#3a3a3e', '#6e727a': '#4a4d54', '#6a6865': '#4f4e52', '#2c2e33': '#231d1f' };

/** Paint chars: H moor, R road, Y yard cobble, S stable straw, B taproom boards, F brewhouse flags, C cellar stone, O the walked roof,
    M the inn's mass (its roof), W the dry stone wall's line (painted as the yard behind it). */
export function materials() {
  const F = (n) => `${SRC}/${n}`;
  const tufts = ['common/square_decal_tuft_a', 'common/square_decal_tuft_b'].map((r) => hillsShade(decalOf(ROOT, ART_DIR, r)));
  const cellar = fillOf(F('3-cellar-slate'), '0000'), slate = fillOf(F('3-cellar-slate'), '1111');
  return {
    H: { fill: hillsShade(rd(F('0-moor-road/fill-moor.png'))), v: { seed: 41, tone: 'soft', shift: true, details: tufts } },
    R: { fill: shadeGround(rd(F('0-moor-road/fill-road-ranked.png')), 1), v: { seed: 43, tone: 'soft', shift: true } },
    Y: { fill: fillOf(F('1-cobble-flagstone'), '0000'), v: { seed: 51, tone: 'soft', spots: 'down' } },
    S: { fill: shadeGround(fillOf(F('2-straw-boards'), '0000'), 1), v: { seed: 53, tone: 'soft', shift: true } },
    B: { fill: fillOf(F('2-straw-boards'), '1111'), v: { seed: 57, tone: 'soft', spots: 'down' } },
    /* the brewhouse is the cellar's own stone a step lighter (one family of stone, two rooms told apart by their light) */
    F: { fill: remap(cellar, BREW_LIFT), v: { seed: 59, tone: 'soft', spots: 'down' } },
    C: { fill: cellar, v: { seed: 61, tone: 'damp', spots: 'down' } },
    O: { fill: remap(slate, SLATE_1), v: { seed: 63, tone: 'soft', spots: 'down' } },
    /* the inn's intact roof over the mass: the slate as it was drawn (nobody stands on it); the walked roof is a step under it */
    M: { fill: slate, v: { seed: 67, tone: 'soft', spots: 'down' } },
    /* layout A (Tyler's pick, 2026-11-19): the yard and the cart lane are the road's packed earth (no ruts: they are no road), its paths
       the stable's straw trodden out of the door; cobble only on the wheel track */
    E: { fill: shadeGround(rd(F('0-moor-road/fill-road-ranked.png')), 1), v: { seed: 71, tone: 'soft', shift: true } },
    P: { fill: shadeGround(fillOf(F('2-straw-boards'), '0000'), 1), v: { seed: 73, tone: 'soft', shift: true } },
  };
}

/* ── the grid: the map's rows to paint chars ── */
/** The inn's three ranges (their '#' cells are its mass), and the dry stone wall's cells: [x0, y0, x1, y1] inclusive. */
export const RANGES = Object.freeze([[11, 22, 46, 35], [1, 4, 15, 18], [42, 4, 56, 20]]);
export const DRY_STONE = Object.freeze([[16, 13, 41, 13]]);
const LEG = Object.freeze({ ':': 'R', e: 'E', p: 'P', '.': 'Y', y: 'S', '=': 'B', f: 'F', c: 'C', r: 'O' });
const inR = (rs, x, y) => rs.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
export function paintGrid(rows, ranges = RANGES, dry = DRY_STONE) {
  return rows.map((row, y) => [...row].map((ch, x) => {
    if (ch !== '#') { if (!LEG[ch]) throw new Error('no paint for map char ' + ch); return LEG[ch]; }
    return inR(dry, x, y) ? 'W' : inR(ranges, x, y) ? 'M' : 'H';
  }).join(''));
}

/* ── the painter ── */
const SEAMS = Object.freeze({
  seed: 71, keep: 'MW',
  mats: { H: { z: 1 }, R: { z: 0 }, E: { z: 0 }, P: { z: 1 }, Y: { z: 2, unit: true, mortar: 0.3 }, S: { z: 1 }, B: { z: 1 }, F: { z: 3, unit: true, mortar: 0.12 },
    C: { z: 3, unit: true, mortar: 0.12 }, O: { z: 1, unit: true, mortar: 0.1 } },
  pairs: [
    { a: 'R', b: 'H', style: 'ragged', sweep: 9, warp: 7, scale: 26, mid: 2 },
    { a: 'E', b: 'H', style: 'ragged', sweep: 7, warp: 6, scale: 24, mid: 2 }, { a: 'E', b: 'R', style: 'ragged', sweep: 5, warp: 5 },
    { a: 'E', b: 'P', style: 'ragged', sweep: 4, warp: 5, scale: 16, mid: 2 }, { a: 'S', b: 'P', style: 'ragged', sweep: 4, warp: 4 },
    { a: 'Y', b: 'E', style: 'scatter', jitter: 2, loose: 0.35, holes: 0.08, sweep: 3, warp: 4 },
    { a: 'E', b: 'S', style: 'ragged', sweep: 4, warp: 4 }, { a: 'E', b: 'B', style: 'stagger' }, { a: 'R', b: 'B', style: 'stagger' },
    { a: 'E', b: 'O', style: 'stagger' }, { a: 'E', b: 'F', style: 'kerb', course: 'F' }, { a: 'E', b: 'C', style: 'kerb', course: 'C' },
    { a: 'Y', b: 'R', style: 'scatter', jitter: 2, holes: 0.06, sweep: 3, warp: 4 },
    { a: 'Y', b: 'S', style: 'scatter', jitter: 2, loose: 0.3, holes: 0.08, sweep: 3, warp: 4 },
    { a: 'Y', b: 'B', style: 'kerb', course: 'Y' }, { a: 'Y', b: 'O', style: 'stagger' },
    { a: 'Y', b: 'F', style: 'kerb', course: 'F' }, { a: 'Y', b: 'C', style: 'kerb', course: 'C' },
  ],
});
const PHASES = Object.freeze({ Y: 'Y1234', C: 'C5678', F: 'Fabcd' });
const PHASE_AT = Object.freeze([[0, 0], [13, 9], [21, 19], [7, 23], [26, 5]]);
/** Each cell an UNTONED variety tile of its floor (key 0: the texture shifted, a spot or a kept decal, as ground-variety.js picks j);
    the tone patches go on after the borders (tonePatches), so a redrawn border band is toned like the rest and never shows as a box. */
function paintCells(grid, mats) {
  const h = grid.length, w = grid[0].length, img = createImage(w * T, h * T);
  const vs = Object.fromEntries(Object.entries(mats).map(([ch, m]) => [ch, varietyTiles(m.fill, m.v)]));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = grid[y][x] === 'W' ? 'E' : grid[y][x], seed = mats[ch].v.seed, v = vs[ch];
    blit(img, v[varietyIndex(0, x, y, seed) % v.length], 0, 0, T, T, x * T, y * T);
    if (ch === 'B') planks(img, x, y, mats.B.fill);
  }
  return img;
}
/* the boards run left to right in bands: each band of the whole floor is the fill's band at its own phase, so the butt joints and the
   knots never stand in a column every 32 px (the fill wraps left to right, so a band stays seamless along its length) */
const BAND_ROWS = 4;
function planks(img, cx, cy, fill) {
  for (let v = 0; v < T; v++) {
    const band = Math.floor((cy * T + v) / BAND_ROWS), phase = Math.floor(hash2(band, 7, 211) * T);
    for (let u = 0; u < T; u++) { const q = (v * T + ((u + cx * T + phase) % T)) * 4; img.data.set(fill.data.subarray(q, q + 4), ((cy * T + v) * img.width + cx * T + u) * 4); }
  }
}
/* the tone the variety would have given (its 'soft' state: the colours above the fill's median a ramp step down), laid in soft patches
   across cells after the borders are drawn */
const LUM = (h) => { const [r, g, b] = rgb(h).map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function toneMap(fill) {
  const RAMP_AT = new Map(); for (const ramp of Object.values(RAMPS)) ramp.forEach((c, k) => RAMP_AT.set(c, { ramp, k }));
  const n = new Map(); for (let p = 0; p < fill.data.length; p += 4) { const h = hexAt(fill, p); n.set(h, (n.get(h) || 0) + 1); }
  const by = [...n.keys()].sort((a, b) => LUM(a) - LUM(b)), med = LUM(by[Math.floor(by.length / 2)]);
  return Object.fromEntries(by.filter((h) => LUM(h) > med && RAMP_AT.get(h) && RAMP_AT.get(h).k > 0).map((h) => [h, RAMP_AT.get(h).ramp[RAMP_AT.get(h).k - 1]]));
}
/** The road's own wear (rule 5): two broken ruts along its middle, a lighter worn verge along both edges, pebbles a step up. */
function roadWear(g, grid) {
  const h = grid.length, w = grid[0].length, isR = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'R';
  const RAMP_AT = new Map(); for (const ramp of Object.values(RAMPS)) ramp.forEach((c, k) => RAMP_AT.set(c, { ramp, k }));
  const step = (px, py, d, only = EARTH) => { const p = (py * g.width + px) * 4, hx = hexAt(g, p), a = RAMP_AT.get(hx); if (!a || !only.has(hx)) return 0;
    g.data.set(rgb(a.ramp[Math.max(0, Math.min(a.ramp.length - 1, a.k + d))]), p); return 1; };
  let rut = 0, verge = 0, peb = 0;
  /* along the road: per pixel line across it, its middle is the mean of its cells' centres, smoothed over three cells so the ruts bend
     where the road does and never jump a step at a cell line. The road runs the way its cells spread furthest (east-west on Carter's Rest) */
  let rx0 = w, rx1 = -1, ry0 = h, ry1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isR(x, y)) { rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x); ry0 = Math.min(ry0, y); ry1 = Math.max(ry1, y); }
  const ew = rx1 - rx0 > ry1 - ry0, len = ew ? g.width : g.height;
  const at = (a, b) => (ew ? [a, b] : [b, a]);   /* a along the road, b across it -> [px, py] */
  const raw = []; for (let a = 0; a < len; a++) { const ca = Math.floor(a / T), bs = []; for (let b = 0; b < (ew ? h : w); b++) if (isR(...at(ca, b))) bs.push(b * T + T / 2); raw.push(bs.length ? bs.reduce((u, v) => u + v) / bs.length : null); }
  for (let a = 0; a < len; a++) {
    if (raw[a] == null) continue;
    let s = 0, k = 0; for (let d = -48; d <= 48; d++) { const v = raw[a + d]; if (v != null) { s += v; k++; } }
    const c = s / k, wob = (noise(0, a, 90, 5) - 0.5) * 12 + (noise(0, a, 23, 6) - 0.5) * 3;
    for (const off of [-11, 10]) {
      if (noise(off, a, 18, 9) < 0.3) continue;
      const b = Math.round(c + off + wob + (noise(off, a, 31, 7) - 0.5) * 2);
      rut += step(...at(a, b), -1) + step(...at(a, b + 1), -1);
      if (hash2(off, a, 3) > 0.35) step(...at(a, b - 1), 1);
    }
  }
  /* the verge: road pixels within 3-8 px of the moor, worn a step lighter, broken by noise so it never rules a line */
  const moorNear = (px, py, r) => { for (let d = -r; d <= r; d++) for (const [qx, qy] of [[px + d, py], [px, py + d]]) {
    if (qx < 0 || qy < 0 || qx >= g.width || qy >= g.height) continue; const hx = hexAt(g, (qy * g.width + qx) * 4); if (RAMPS.leaf.includes(hx) || RAMPS.moss.includes(hx)) return true; } return false; };
  for (let py = 0; py < g.height; py++) for (let px = 0; px < g.width; px++) {
    if (!isR(Math.floor(px / T), Math.floor(py / T))) continue;
    const p = (py * g.width + px) * 4; if (!EARTH.has(hexAt(g, p))) continue;
    const r = 3 + Math.floor(noise(px, py, 24, 13) * 5);
    if (noise(px, py, 11, 17) > 0.15 && moorNear(px, py, r)) verge += step(px, py, hexAt(g, p) === '#2a1c14' ? 2 : 1);
  }
  /* pebbles: a 2-3 px stone a step up (stone 2-3, a lit top-left pixel, a dark foot), on a jittered grid, never two touching */
  for (let gy = 0; gy < g.height; gy += 13) for (let gx = 0; gx < g.width; gx += 13) {
    const px = gx + Math.floor(hash2(gx, gy, 21) * 10), py = gy + Math.floor(hash2(gx, gy, 22) * 10);
    if (px + 3 >= g.width || py + 3 >= g.height || hash2(gx, gy, 23) > 0.5 || noise(px, py, 40, 25) < 0.35) continue;
    if (![[0, 0], [2, 2]].every(([dx, dy]) => isR(Math.floor((px + dx) / T), Math.floor((py + dy) / T)) && EARTH.has(hexAt(g, ((py + dy) * g.width + px + dx) * 4)))) continue;
    const big = hash2(gx, gy, 24) > 0.35;
    const put = (x, y, h) => g.data.set(rgb(h), ((py + y) * g.width + px + x) * 4);
    put(0, 0, '#8a867d'); put(1, 0, '#6a6865'); if (big) { put(0, 1, '#6a6865'); put(1, 1, '#6a6865'); put(2, 1, '#2a1c14'); put(1, 2, '#2a1c14'); } else put(1, 1, '#2a1c14');
    peb++;
  }
  return { rut, verge, peb };
}
/* the moor's tone patches (the round-3 carry-over): dead bracken a brown of the moor's own value, olive where the grass is drier */
const BRACKEN = { '#1f3322': '#3d2a1d', '#2c4a2c': '#553a26', '#16241a': '#2a1c14' };
const OLIVE = { '#2c4a2c': '#4a5a2a' };
/* the heather in clumps (the sample): outside soft blobs its sprigs go to the grass's dark step */
const HEATH = { '#8a6440': '#16241a', '#553a26': '#16241a', '#4a2e18': '#16241a' };
/* the walked roof stripped: slates pulled off in blobs, the boards under them showing (the taproom's own boards, the battens) */
function stripRoof(g, grid, boards) {
  let n = 0;
  for (let py = 0; py < g.height; py++) for (let px = 0; px < g.width; px++) {
    const cx = Math.floor(px / T), cy = Math.floor(py / T);
    if (grid[cy][cx] !== 'O' || noise(px, py, 30, 81) < 0.66) continue;
    const p = (py * g.width + px) * 4, q = ((py % T) * T + (px % T)) * 4;
    g.data.set(boards.data.subarray(q, q + 3), p);
    /* the slates' broken edge: a dark line where the hole's upper edge meets the slates */
    if (noise(px, py - 1, 30, 81) < 0.66) g.data.set(rgb('#17141a'), p);
    n++;
  }
  return n;
}
/* the inn's intact roof is old: here and there a slate has slipped, the batten under it showing, its upper edge a dark line */
function slipSlates(g, grid, boards) {
  let n = 0;
  for (let py = 0; py < g.height; py++) for (let px = 0; px < g.width; px++) {
    const cx = Math.floor(px / T), cy = Math.floor(py / T);
    if (grid[cy][cx] !== 'M') continue;
    const hole = (y) => noise(px * 1.6, y * 2.4, 9, 83) > 0.86;
    if (!hole(py)) continue;
    const p = (py * g.width + px) * 4, q = ((py % T) * T + (px % T)) * 4;
    g.data.set(hole(py - 1) ? boards.data.subarray(q, q + 3) : rgb('#17141a'), p);
    n++;
  }
  return n;
}
/* the clutter rule (ART_DIRECTION 4): nothing on the floor is brighter than the dimmest actor body. A floor pixel over FLOOR_MAX (a
   decal's glint, a speck) steps down its ramp until it is under; the walls are laid after and are no floor */
const FLOOR_MAX = 0.12;
function capFloor(g, grid) {
  const RAMP_AT = new Map(); for (const ramp of Object.values(RAMPS)) ramp.forEach((c, k) => RAMP_AT.set(c, { ramp, k }));
  let n = 0;
  for (let p = 0; p < g.data.length; p += 4) {
    const px = (p / 4) % g.width, py = Math.floor(p / 4 / g.width); if ('MHW'.includes(grid[Math.floor(py / T)][Math.floor(px / T)])) continue;
    let h = hexAt(g, p); if (LUM(h) <= FLOOR_MAX) continue;
    const a = RAMP_AT.get(h); if (!a) continue;
    let k = a.k; while (k > 0 && LUM(a.ramp[k]) > FLOOR_MAX) k--;
    g.data.set(rgb(a.ramp[k]), p); n++;
  }
  return n;
}
/* the contact strip (ART_DIRECTION 5): where a floor meets a wall's foot, its first rows a value step down, the first one two */
function skirt(g, grid) {
  const h = grid.length, w = grid[0].length, RAMP_AT = new Map();
  for (const ramp of Object.values(RAMPS)) ramp.forEach((c, k) => RAMP_AT.set(c, { ramp, k }));
  const down = (p, d) => { const a = RAMP_AT.get(hexAt(g, p)); if (a) g.data.set(rgb(a.ramp[Math.max(0, a.k - d)]), p); };
  let n = 0;
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y - 1][x] !== 'M' || ['M', 'H', 'W'].includes(grid[y][x])) continue;
    for (let px = x * T; px < x * T + T; px++) {
      const deep = 2 + (hash2(px, y, 41) > 0.6 ? 1 : 0);
      for (let v = 0; v < deep; v++) { down(((y * T + v) * g.width + px) * 4, v === 0 ? 2 : 1); n++; }
    }
  }
  return n;
}
const DECALS = Object.freeze({
  every: 4.6, seed: 73,
  decals: {
    Y: ['common/square_decal_chips_a'],
    E: ['common/square_decal_chips_b', 'sewer/exposed_dirt', 'common/square_decal_chips_a'],
    S: ['common/square_decal_chips_b', 'sewer/exposed_dirt'],
    B: ['common/square_decal_soot'],
    F: ['common/square_decal_puddle_a', 'common/square_decal_soot', 'sewer/cracked_flagstone'],
    C: ['sewer/moss_puddle', 'common/square_decal_puddle_b', 'sewer/cracked_flagstone'],
  },
});

/* ── the walls ── */
const W_SRC = `${SRC}/walls`;
const snap = (im) => lock(im, 'native');
function wallPieces() {
  const run = snap(rd(`${W_SRC}/inn-run.png`)), cycle = snap(rd(`${W_SRC}/inn-run-plain.png`)), door = snap(rd(`${W_SRC}/inn-door.png`)), hearth = snap(rd(`${W_SRC}/inn-hearth.png`)), ends = snap(rd(`${W_SRC}/inn-ends.png`));
  /* the right quoin's own right edge goes a step into shadow (light from the upper left) */
  const right = crop(ends, 160, 0, 32, 60);
  const dark = shadeGround(right, 1);
  for (let y = 0; y < 60; y++) for (let x = 29; x < 32; x++) { const p = (y * 32 + x) * 4; if (right.data[p + 3] >= 128) right.data.set(dark.data.subarray(p, p + 3), p); }
  const ds = snap(rd(`${W_SRC}/drystone-run.png`)), dsl = snap(rd(`${W_SRC}/drystone-left.png`));
  return {
    /* the plain cycle: four slices of one seamless 128 px run (its two joints inpainted, a9fa1bdc), so no joint shows every 128 px */
    plain: [0, 32, 64, 96].map((x) => crop(cycle, x, 0, 32, 60)),
    window: crop(run, 64, 0, 64, 60), door: crop(door, 64, 0, 64, 60), hearth: crop(hearth, 48, 0, 96, 60),
    endL: crop(ends, 0, 0, 32, 60), endR: right,
    cap: crop(run, 0, 5, 32, 8),
    /* the tumbled ends are two cells each: the right is the run's own fall (x128-191), the left its inpainted fall and the run's
       first slice after it (678621ce), so neither meets the run on a step */
    stub: [0, 32, 64, 96].map((x) => crop(ds, x, 0, 32, 24)), stubR: crop(ds, 128, 0, 64, 24), stubL: crop(dsl, 0, dsl.height - 24, 64, 24),
  };
}
const transpose = (im) => { const o = createImage(im.height, im.width); for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) o.data.set(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4), (x * o.width + y) * 4); return o; };
/** The features a face run carries, by what it faces: [cells, piece] at run index i, or null for a plain slice. */
function featureAt(i, n, kind) {
  if (kind === 'hearth' && n >= 7 && i === Math.floor(n / 2) - 1) return [3, 'hearth'];
  if (i % 6 !== 3 || n - i < 3) return null;
  if (kind === 'yard') return [2, Math.floor(i / 6) % 2 ? 'door' : 'window'];
  return [2, 'window'];
}
function layWalls(img, grid, P) {
  const h = grid.length, w = grid[0].length;
  const mass = (x, y) => x < 0 || y < 0 || x >= w || y >= h || grid[y][x] === 'M';
  const open = (x, y) => !mass(x, y);
  let faces = 0, caps = 0, stubs = 0;
  /* the caps first: seen from above along each edge of the mass that meets open ground (a face cell carries its own) */
  const capV = transpose(P.cap);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mass(x, y) || open(x, y + 1)) continue;
    if (open(x, y - 1)) { blit(img, P.cap, 0, 0, T, 8, x * T, y * T, true); caps++; }
    if (open(x - 1, y)) { blit(img, capV, 0, 0, 8, T, x * T, y * T, true); caps++; }
    if (open(x + 1, y)) { blit(img, capV, 0, 0, 8, T, x * T + T - 8, y * T, true); caps++; }
  }
  /* the faces, north to south so a nearer wall stands over a farther one */
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!(mass(x, y) && open(x, y + 1))) { x++; continue; }
      let e = x; while (e + 1 < w && mass(e + 1, y) && open(e + 1, y + 1)) e++;
      const n = e - x + 1, below = grid[y + 1] ? grid[y + 1][x] : 'H';
      const kind = below === 'B' && grid[y + 2] && grid[y + 2][x] === 'B' ? 'hearth' : 'EYRBP'.includes(below) ? 'yard' : 'out';
      for (let i = 0; i < n; i++) {
        const c = x + i;
        const freeL = i === 0 && open(x - 1, y) && n > 1, freeR = i === n - 1 && open(e + 1, y) && n > 1;
        const f = !freeL && !freeR ? featureAt(i, n, kind) : null;
        if (f && i + f[0] - 1 < n - 1) {
          blit(img, P[f[1]], 0, 0, f[0] * T, 60, c * T, y * T + T - 60, true);
          faces += f[0]; i += f[0] - 1; continue;
        }
        const s = freeL ? P.endL : freeR ? P.endR : P.plain[c % P.plain.length];
        blit(img, s, 0, 0, T, 60, c * T, y * T + T - 60, true);
        faces++;
      }
      x = e + 1;
    }
  }
  /* the dry stone wall: the stub run cycled, a tumbled end where a run stands free (the gate) */
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (grid[y][x] !== 'W') { x++; continue; }
      let e = x; while (e + 1 < w && grid[y][e + 1] === 'W') e++;
      const freeL = x > 0 && !['W', 'M'].includes(grid[y][x - 1]), freeR = e < w - 1 && !['W', 'M'].includes(grid[y][e + 1]);
      for (let c = x; c <= e; c++) {
        const i = c - x;
        if (freeR && c >= e - 1) { if (c === e - 1) blit(img, P.stubR, 0, 0, 64, 24, c * T, y * T + T - 24, true); stubs++; continue; }
        if (freeL && i < 2) { if (i === 0) blit(img, P.stubL, 0, 0, 64, 24, c * T, y * T + T - 24, true); stubs++; continue; }
        /* after a left end the run goes on from its second slice (the end's right half is the run's first) */
        blit(img, P.stub[(freeL ? i - 1 : c) % P.stub.length], 0, 0, T, 24, c * T, y * T + T - 24, true);
        stubs++;
      }
      x = e + 1;
    }
  }
  return { faces, caps, stubs };
}

/** The whole painter: grid (paint chars) -> the ground image and what each step did. `skip(x, y)`: no decal under a placed object. */
export function paintGround(grid, { skip = () => false } = {}) {
  const mats = materials();
  let img = paintCells(grid, mats);
  const fills = Object.fromEntries(Object.entries(mats).map(([ch, m]) => [ch, m.fill]));
  /* the dry stone wall's line is the yard behind it, so the road and the cobbles meet round its foot as anywhere else */
  const seamRows = grid.map((r) => r.replace(/W/g, 'E'));
  /* THE STONE FLOORS RE-LAID: one fill tile repeats every 32 px. The yard's cobbles and the cellar's and brewhouse's flags are each a
     patchwork of their fill at five phases, a phase a cell, and every border between two phases is laid stone by stone (seams.mjs
     stagger), so no stone is cut and the lattice breaks. The phases are the same pixels, so each is still the one floor. */
  let phased = seamRows, pairs = SEAMS.pairs;
  const mats2 = Object.assign({}, SEAMS.mats);
  for (const [base, chars] of Object.entries(PHASES)) {
    phased = phased.map((r, y) => [...r].map((c, x) => (c !== base ? c : chars[Math.min(chars.length - 1, Math.floor(hash2(x, y, 97 + base.charCodeAt(0)) * chars.length))])).join(''));
    for (const [k, ch] of [...chars].entries()) if (k) {
      const [dx, dy] = PHASE_AT[k], f = fills[base], s = createImage(T, T);
      for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) { const q = (((v + dy) % T) * T + ((u + dx) % T)) * 4; s.data.set(f.data.subarray(q, q + 4), (v * T + u) * 4); }
      fills[ch] = s; mats2[ch] = SEAMS.mats[base];
      for (let y = 0; y < phased.length; y++) for (let x = 0; x < phased[0].length; x++) if (phased[y][x] === ch) blit(img, s, 0, 0, T, T, x * T, y * T);
    }
    const as = (p, c) => Object.assign({}, p, p.a === base ? { a: c } : { b: c }, p.course === base ? { course: c } : {});
    pairs = pairs.flatMap((p) => (p.a === base || p.b === base ? [...chars].map((c) => as(p, c)) : [p]))
      .concat([...chars].flatMap((a, i) => [...chars].slice(i + 1).map((b) => ({ a, b, style: 'stagger' }))));
  }
  const r = reseam(img, Object.assign({ rows: phased, fills }, SEAMS, { mats: mats2, pairs }));
  img = r.img;
  let toned = 0;
  for (const [ch, m] of Object.entries(mats)) toned += stepPatches(img, { rows: seamRows, on: (c) => c === ch, scale: 70, cut: 0.56, seed: m.v.seed + 100, map: toneMap(m.fill) });
  const road = roadWear(img, grid);
  const heath = stepPatches(img, { rows: grid, on: (ch) => ch === 'H', scale: 58, cut: 0.55, seed: 61, map: HEATH });
  const bracken = stepPatches(img, { rows: grid, on: (ch) => ch === 'H', scale: 44, cut: 0.74, seed: 91, map: BRACKEN });
  const olive = stepPatches(img, { rows: grid, on: (ch) => ch === 'H', scale: 52, cut: 0.6, seed: 93, map: OLIVE });
  const damp = stepPatches(img, { rows: grid, on: (ch) => ch === 'R', scale: 18, cut: 0.74, seed: 17, map: Object.fromEntries(RAMPS.earth.slice(1).map((c, k) => [c, RAMPS.earth[k]])) });
  const stripped = stripRoof(img, grid, mats.B.fill);
  const slipped = slipSlates(img, grid, mats.B.fill);
  const laid = bakeDecals(img, { rows: grid, seed: DECALS.seed, every: DECALS.every, decals: DECALS.decals, skip });
  const skirting = skirt(img, grid);
  const capped = capFloor(img, grid);
  const walls = layWalls(img, grid, wallPieces());
  return { img, report: { seams: r.changed, toned, ...road, heath, bracken, olive, damp, stripped, slipped, skirting, capped, decals: laid.length, decalIds: [...new Set(laid.map((d) => d.id))], ...walls } };
}

export const TILESETS = Object.freeze(['5adbc664-7ece-4d86-8ecf-b04be989b72a', 'a8f9871d-1c2a-4e9d-883b-9128f0a7aefe', '8b3fd314-40e7-4e7c-9b70-03d4272a1e15', 'aed84cba-58a9-4ccd-963f-2dc400b9dcec']);
const GRID_FILE = 'art/briefs/carters-rest-grid-2026-11-19.txt';

async function ground() {
  const MAP = (await import('../../src/data/grounds/carters_rest/map.js')).default;
  const grid = paintGrid(MAP.rows);
  writeFileSync(abs(GRID_FILE), ['CARTER\'S REST\'S PAINT GRID (lane/b-morrow-kit, 2026-11-19): src/data/grounds/carters_rest/map.js rows, their rock split by',
    'paintGrid in tools/world-art/morrow-grounds.mjs. H the moor (blocks a step), R the road, Y the yard\'s cobble, S the stable\'s straw, B the taproom\'s',
    'boards, F the brewhouse\'s flags, C the cellar\'s stone, O the walked roof, M the inn\'s mass (its roof and walls laid over), W the dry stone wall.',
    '', 'PAINT', ...grid].join('\n') + '\n');
  const cells = new Set(MAP.objects.map((o) => o.x + ',' + o.y));
  const { img, report } = paintGround(grid, { skip: (x, y) => cells.has(x + ',' + y) });
  const dir = abs(join(ART_DIR, SET));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, GROUND + '.png'), encodePNG(lock(img, 'native')));
  const h = grid.length, w = grid[0].length, all = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) all.push([x, y]);
  const sc = { id: GROUND, class: 'terrain', kind: 'fill', painted: true, style: 's1', material: 'native', source: GROUND + '.png', lower: 'painted', upper: 'painted',
    cycle: [w, h], tiles: { 1111: all },
    pixellab: { tool: 'create-tileset (pro) fills, variety paint + reseam', tileset: TILESETS.join(','), grid: GRID_FILE,
      walls: 'inpaint_image_pro_flash 1ff1ca22 (door), 24506cff (hearth), 9ed6db86 (ends), 678621ce (dry stone left end); the run and the dry stone wall from the approved Morrow sample (round 3)' },
    notes: 'Carter\'s Rest, painted by tools/world-art/morrow-grounds.mjs from ' + GRID_FILE + ': every cell a variety tile of its floor\'s fill (the moor and road of the approved Morrow sample, the inn\'s floors from three pro tilesets born on the palette), '
      + report.seams + ' px of borders redrawn from the fills\' own pixels, the road worn (' + report.rut + ' px of ruts, ' + report.verge + ' px of lighter verge, ' + report.peb + ' pebbles), the moor in heather clumps and bracken and olive patches, the walked roof stripped in '
      + report.stripped + ' px, ' + report.decals + ' kept decals (' + report.decalIds.join(', ') + '), and the inn\'s walls laid over the paint: ' + report.faces + ' face slices, ' + report.caps + ' cap edges, ' + report.stubs + ' dry stone slices. Pixels unscaled, nothing drawn.' };
  writeFileSync(join(dir, GROUND + '.json'), JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ ' + SET + '/' + GROUND + ' ' + w + 'x' + h + ': ' + JSON.stringify(report));
}

async function main() {
  const [cmd, out] = process.argv.slice(2);
  if (cmd === 'ground') return ground();
  if (cmd === 'patch') {
    const rows = JSON.parse(readFileSync(process.argv[4], 'utf8'));
    const { img, report } = paintGround(paintGrid(rows, [[0, 0, 0, 0]].concat(JSON.parse(process.argv[5] || '[]')), JSON.parse(process.argv[6] || '[]')));
    writeFileSync(out, encodePNG(lock(img, 'native')));
    return console.log(out + ' ' + JSON.stringify(report));
  }
  throw new Error('usage: morrow-grounds.mjs ground | patch OUT.png ROWS.json [RANGES] [DRY]');
}
if (isMain(import.meta.url)) main().catch((e) => { console.error('morrow-grounds: ' + (e && e.stack || e)); process.exit(2); });
