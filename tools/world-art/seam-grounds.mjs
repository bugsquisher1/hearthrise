#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/seam-grounds.mjs — THE BORDERS OF THE GROUNDS PIXELLAB'S MAP TOOL PAINTED (lane/a-ground-seams).
//
// The Barrow March's floors are painted here from a grid (barrow-grounds.mjs runs seams.mjs between paint and wear). The older
// grounds are stitched view_map renders of PixelLab maps: no grid was kept, and their borders are the tilesets' ruler lines (a
// brook cut straight down its banks, a bridge painted flat on the water). This driver redraws them with tools/world-art/seams.mjs:
//   SOURCE  art/world-src/seams/<ground>.png, the paint as PixelLab drew it (kept before its first reseam), so a rerun is
//           byte-identical and never reseams its own output.
//   GRID    read back from the pixels: each open cell takes the material whose sample cell (its floor variety's `at`, a plain cell)
//           shares the most of its colours; a cell the map rows make solid keeps the rows' material (`rows`); `cells` overrides.
//           A ground painted from a brief (`grid`: art/briefs/…, its PAINT rows) takes those rows instead: a pixel read misreads a
//           shaded paint (the Ford's darkened bank cells read as thicket). The brief's ROWS must still be the map's.
//   OVER    materials whose painted edge is kept (`over`: the alder canopy's round crowns, a reed bed's scallops) are in no
//           pair, so their cells are never redrawn; what they hang over a redrawn neighbour is laid back from the paint, or the
//           canopy would end on the cell line.
//   BRIDGES a crossing drawn as a sprite of its own (WK_FOOTBRIDGE): the rows' plank cells are painted as the water they cross.
//   A floor variety's `at` cell (src/world/core/compose.js keys every variant on that cell's tile) is never redrawn: the run stops.
//
//   node tools/world-art/seam-grounds.mjs [--only <ground>]   write art/world/<set>/<ground>.png (+ its sidecar's note)
//   then: node tools/world-art/build.mjs --set <set>, node tests/world-assets.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit, crop } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { reseam, fillTileOf } from './seams.mjs';
import { lock } from './lock.mjs';
import { mapRowOf } from '../../src/data/world/maps/index.js';
import { isMain } from '../../tests/_is-main.mjs';

const T = 32;
const SRC = 'art/world-src/seams';

/**
 * The paint grid of a ground read back from its pixels: one character per cell.
 *   rows     the map rows; `solid` maps a row character to the grid character it always is (water, a wall)
 *   samples  { ch: [cx, cy] } a plain cell of each open material; an open cell is the material most of its colours belong to
 */
export function gridFromPixels(img, rows, { solid = {}, samples = {}, cells = {}, only = {} }) {
  const W = rows[0].length, H = rows.length;
  /* a cell's mean colour (the renders are not palette-locked, so colours are compared, never matched) */
  const mean = (cx, cy) => {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { const p = ((cy * T + j) * img.width + cx * T + i) * 4; r += img.data[p]; g += img.data[p + 1]; b += img.data[p + 2]; }
    return [r / T / T, g / T / T, b / T / T];
  };
  const refs = Object.entries(samples).map(([ch, [sx, sy]]) => [ch, mean(sx, sy)]);
  return rows.map((row, y) => [...row].map((r, x) => {
    if (cells[x + ',' + y]) return cells[x + ',' + y];
    if (solid[r]) return solid[r];
    const m = mean(x, y);
    let best = null, bd = Infinity;
    /* `only`: a material a cell may be read as only where the rows allow it (water never on a walked ford) */
    for (const [ch, c] of refs) { if (only[ch] && !only[ch].includes(r)) continue; const d = (m[0] - c[0]) ** 2 + (m[1] - c[1]) ** 2 + (m[2] - c[2]) ** 2; if (d < bd) { bd = d; best = ch; } }
    return best;
  }).join(''));
}

/** One section of a grid brief (the lines after a `ROWS` or `PAINT` line, quotes and commas stripped, up to a blank line). */
export function briefSection(text, name) {
  const lines = text.split(/\r?\n/), at = lines.findIndex((l) => new RegExp('^\\s*' + name + '\\b').test(l));
  if (at < 0) throw new Error('the brief has no ' + name + ' section');
  const rows = [];
  for (const l of lines.slice(at + 1)) { const r = l.replace(/['",\s]/g, ''); if (!r) break; rows.push(r); }
  return rows;
}
/** The paint grid a ground was painted from: the brief's PAINT rows, once its ROWS are the map's own (a moved row is a repaint). */
export function gridFromBrief(text, mapRows) {
  const walk = briefSection(text, 'ROWS'), paint = briefSection(text, 'PAINT');
  const moved = mapRows.findIndex((r, y) => r !== walk[y]);
  if (walk.length !== mapRows.length || moved >= 0) throw new Error('the brief\'s ROWS are not the map\'s (row ' + moved + '): repaint before reseaming');
  if (paint.length !== mapRows.length || paint.some((r) => r.length !== mapRows[0].length)) throw new Error('the brief\'s PAINT rows are not the map\'s size');
  return paint;
}

/**
 * The painted edge of `ch` laid back over the cells round it that were redrawn, within `reach` px of a `ch` cell: its crowns (a
 * pixel whose paint is one of `ch`'s own colours, its deep cells', none of its own cell's fill, and 6 px clear of any other floor's
 * cell), then the soil line they stand on (the paint within 2 px of a crown, unless it is a colour of another floor the cell borders
 * or lies within 8 px of that floor's cell: the old straight seam there, and the rim the tileset drew along it, stay gone).
 * Returns the pixels restored.
 */
export function overhang(out, src, rows, ch, fills, T, reach = T / 2) {
  const W = rows[0].length, H = rows.length, w = src.width;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : rows[y][x]);
  const key = (d, p) => (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
  const own = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let deep = rows[y][x] === ch;
    for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) { const q = at(x + dx, y + dy); if (q !== null && q !== ch) { deep = false; break; } }
    if (!deep) continue;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) own.add(key(src.data, ((y * T + j) * w + x * T + i) * 4));
  }
  const fillCols = {};
  const colsOf = (m) => fillCols[m] || (fillCols[m] = new Set(Array.from({ length: T * T }, (_, i) => key(fills[m].data, i * 4))));
  /* the cells a crown may hang over: each with its own fill's colours, the other floors' it borders, its ch neighbours */
  const cells = [];
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const m = rows[cy][cx];
    if (m === ch || !fills[m]) continue;
    const near = [], seams = [], others = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = at(cx + dx, cy + dy);
      if (q === ch) near.push([cx + dx, cy + dy]);
      else if (q !== null && q !== m && fills[q]) { seams.push([cx + dx, cy + dy]); for (const c of colsOf(q)) others.add(c); }
    }
    if (near.length) cells.push({ cx, cy, m, near, seams, others });
  }
  const dist = (list, x, y) => Math.min(Infinity, ...list.map(([nx, ny]) => Math.hypot(Math.max(nx * T - x - 0.5, 0, x + 0.5 - (nx + 1) * T), Math.max(ny * T - y - 0.5, 0, y + 0.5 - (ny + 1) * T))));
  const within = (c, x, y) => dist(c.near, x, y) <= reach;
  const crown = new Uint8Array(w * src.height);
  let put = 0;
  const lay = (p) => { out.data[p] = src.data[p]; out.data[p + 1] = src.data[p + 1]; out.data[p + 2] = src.data[p + 2]; put++; };
  for (const c of cells) {
    const not = colsOf(c.m);
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const x = c.cx * T + i, y = c.cy * T + j, p = (y * w + x) * 4, k = key(src.data, p);
      /* a pixel hard by another floor's cell is that floor's old rim, whatever its colour (a mound's dark rim is the canopy's darkest) */
      if (!own.has(k) || not.has(k) || !within(c, x, y) || dist(c.seams, x, y) < 6) continue;
      crown[y * w + x] = 1;
      if (k !== key(out.data, p)) lay(p);
    }
  }
  for (const c of cells) for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const x = c.cx * T + i, y = c.cy * T + j, p = (y * w + x) * 4, k = key(src.data, p);
    if (crown[y * w + x] || k === key(out.data, p) || c.others.has(k) || !within(c, x, y) || dist(c.seams, x, y) < 8) continue;
    let by = false;
    for (let dy = -2; dy <= 2 && !by; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < src.height && crown[Y * w + X]) { by = true; break; } }
    if (by) lay(p);
  }
  return put;
}

/* ── a raft as long as its brook is wide: the Meadowbrook raft's own logs, lengthened by its plain middle ──
   mb_log_bridge carries 72 px of logs, shorter than any brook it stood on. Its left end and first lashing, its plain log body
   repeated, its right lashing and end: one raft that rests about 18 px on each bank. The frame is the logs' own box and its contact
   row their foot, so placed on the walked row the logs lie over that row's feet, not a row below the trail. */
function raft({ set, id, cells, footprint, what }) {
  const src = decodePNG(readFileSync(join(ROOT, ART_DIR, 'forest', 'mb_log_bridge.png')));
  let x0 = src.width, x1 = -1, y0 = src.height, y1 = -1;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (src.data[(y * src.width + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, end = 26, mid = w - 2 * end, want = cells * T + 2 * 18;
  const reps = Math.max(1, Math.round((want - 2 * end) / mid)), out = createImage(2 * end + reps * mid, h);
  blit(out, src, x0, y0, end, h, 0, 0);
  for (let r = 0; r < reps; r++) blit(out, src, x0 + end, y0, mid, h, end + r * mid, 0);
  blit(out, src, x1 - end + 1, y0, end, h, end + reps * mid, 0);
  const dir = join(ROOT, ART_DIR, set);
  writeFileSync(join(dir, id + '.png'), encodePNG(out));
  const sc = { id, class: 'bridge', style: 's1', material: 'wood', source: id + '.png', frame: [out.width, h], anchor_px: [out.width >> 1, h - 1],
    footprint, anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }],
    pixellab: Object.assign({}, JSON.parse(readFileSync(join(ROOT, ART_DIR, 'forest', 'mb_log_bridge.json'), 'utf8')).pixellab, { derived: 'mb_log_bridge, 0 gens' }),
    notes: what + ': mb_log_bridge\'s ends and lashings, its plain log body repeated ' + reps + ' times between them (' + out.width + ' px over a ' + cells * T + ' px brook), by tools/world-art/seam-grounds.mjs; pixels unscaled, nothing drawn.' };
  writeFileSync(join(dir, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ ' + set + '/' + id + ' (bridge, ' + out.width + 'x' + h + ', ' + reps + ' log lengths)');
}

/* grass, thicket, path: the meadow family's three open floors (their varieties' cells) */
const meadow = (g, m, p) => ({ T: g, G: m, D: p });
const BANKS = (wet) => [
  { a: 'W', b: 'G', style: 'bank', bias: { G: 0.3 }, sweep: 7, warp: 5, wet },
  { a: 'W', b: 'T', style: 'bank', bias: { T: 0.3 }, sweep: 7, warp: 5, wet: 1 },
  { a: 'W', b: 'D', style: 'bank', bias: { D: 0.3 }, sweep: 5, warp: 4, wet },
];
const MEADOW_MATS = { W: { z: 0, own: true }, D: { z: 1 }, G: { z: 2 }, T: { z: 3 } };
/* the warp's noise spreads about 0.4 of its reach, so a border meant to wander a few px either way takes about twice the defaults'
   octaves: WILD for a soft border with bays (a bank, a mound: an earthwork stays round), TRACK for a two-cell track whose two edges
   must not pinch it */
const WILD = Object.freeze({ style: 'ragged', sweep: 9, warp: 8, mid: 4 });
const TRACK = Object.freeze({ style: 'ragged', sweep: 6, warp: 6, mid: 3 });
export const GROUNDS = Object.freeze({
  /* the brook ran dead straight down its banks and the footbridge was planks painted flat on the water */
  wickstead_ground: { set: 'stead', map: 'wickstead', seed: 41, solid: { '~': 'W', '=': 'W', '#': 'T' }, samples: meadow([0, 0], [5, 3], [15, 8]),
    repaint: { '=': 'W' }, mats: MEADOW_MATS, pairs: BANKS(2),
    before: () => raft({ set: 'stead', id: 'wk_footbridge', cells: 4, footprint: [2, 1], what: 'The Wickstead footbridge' }) },
  /* the brook's banks stepped down the grid, and its two rafts (144 px of logs on 96 px of water) sat a row below the
     trail. Its brook cells carry their own grassy banks, so the water is read from the pixels as the floors are */
  meadowbrook_ground: { set: 'forest', map: 'meadowbrook_thicket', seed: 43, solid: { '#': 'T' },
    samples: Object.assign(meadow([0, 0], [6, 2], [16, 5]), { W: [30, 2] }), mats: MEADOW_MATS, pairs: BANKS(2),
    before: () => raft({ set: 'forest', id: 'mb_log_bridge_long', cells: 3, footprint: [1, 1], what: 'The Meadowbrook footbridge' }) },
  /* the sewage channel's L was cut straight into the cobble with no edge: a built channel ends on a kerb course */
  sewer_ground: { set: 'sewer', map: 'millrace_sewer', seed: 53, solid: { '#': 'X', '~': 'W' }, samples: { F: [4, 2] }, keep: 'X',
    mats: { W: { z: 0, own: true }, F: { z: 1 } }, pairs: [{ a: 'W', b: 'F', style: 'kerb', course: 'F' }] },
  /* the chasm was a hard rectangle cut into the cave floor; it is held to its own cells (it blocks a step) */
  warrens_ground: { set: 'warren', map: 'coppercap_warrens', seed: 59, solid: { '#': 'X' }, samples: { E: [9, 0], C: [52, 21] }, keep: 'X',
    mats: { C: { z: 0, own: true }, E: { z: 1 } }, pairs: [{ a: 'C', b: 'E', style: 'ragged', bias: { E: 0.3 }, sweep: 5, warp: 5 }] },
  /* the river was one straight band edged by a hairline the length of the map */
  mosslight_ground: { set: 'glade', map: 'mosslight_glade', seed: 47, solid: { '#': 'T' },
    samples: Object.assign(meadow([0, 0], [23, 2], [36, 6]), { W: [30, 21] }), mats: MEADOW_MATS, pairs: BANKS(2) },
  /* the river's banks were sawteeth on the grid, the ford a rectangle of shallows cut straight into its landings and banks, the
     mud track and the barrow banks stepped down the cells. The alder canopy keeps its painted edge (`over`): its crowns and dark rim are
     what tells a player the wall from the grass at night, and a crown cut by the noise loses both */
  hasks_ford_ground: { set: 'ford', map: 'hasks_ford', seed: 61, grid: 'art/briefs/hasks-ford-grid-2026-10-28.txt', over: 'T',
    samples: { G: [46, 4], M: [29, 15] },
    /* the river never reaches a walked cell (the ford's shallows and bars, grass, the track); it may lap into the reed beds */
    mats: { W: { z: 0, own: 'SVGM' }, S: { z: 1 }, V: { z: 2 }, M: { z: 3 }, G: { z: 4 }, R: { z: 5 }, B: { z: 6 } },
    pairs: [
      { a: 'W', b: 'R', style: 'bank', bias: { R: 0.2 }, sweep: 9, warp: 7, mid: 4, wet: 2 },
      { a: 'W', b: 'S', style: 'bank', bias: { S: 0.5 }, sweep: 10, warp: 8, mid: 4, wet: 2 },
      { a: 'S', b: 'R', style: 'bank', bias: { R: 0.15 }, sweep: 8, warp: 6, mid: 3.5, wet: 1 },
      { a: 'S', b: 'M', style: 'bank', sweep: 8, warp: 6, mid: 3.5, wet: 2 },
      { a: 'S', b: 'V', style: 'bank', sweep: 6, warp: 6, mid: 3, wet: 1 },
      { a: 'M', b: 'G', ...TRACK },
      { a: 'M', b: 'R', ...WILD },
      { a: 'M', b: 'B', ...TRACK, outline: 2 },
      { a: 'G', b: 'R', ...WILD },
      { a: 'G', b: 'B', ...WILD, outline: 2, skirt: 'M' },
    ] },
});

function run(id) {
  const g = GROUNDS[id], row = mapRowOf(g.map);
  if (g.before) g.before();
  /* locked to the palette first (the grade the build would give it), so a kerb's or a bank's one-step rims land on real ramps */
  const img = lock(decodePNG(readFileSync(join(ROOT, SRC, id + '.png'))), g.material || 'terrain');
  const rows = g.grid ? gridFromBrief(readFileSync(join(ROOT, g.grid), 'utf8'), row.rows) : gridFromPixels(img, row.rows, g);
  /* each open floor's fill is its sample cell's own tile (a one-tile path has no deep cell to take it from); the rest, the commonest */
  const fills = {};
  for (const [ch, [sx, sy]] of Object.entries(g.samples)) fills[ch] = crop(img, sx * T, sy * T, T, T);
  /* a kept edge needs the fill of every material it hangs over (its pixels that are that floor's own are never put back) */
  if (g.over) for (const ch of new Set(rows.join(''))) if (!g.over.includes(ch) && !(g.keep || '').includes(ch)) fills[ch] = fills[ch] || fillTileOf(img, rows, ch, T);
  /* cells the rows paint as another material (a causeway under a new bridge) take that material's fill before the borders */
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
    const m = (g.repaint || {})[row.rows[y][x]];
    if (!m) continue;
    fills[m] = fills[m] || fillTileOf(img, rows, m, T);
    blit(img, fills[m], 0, 0, T, T, x * T, y * T);
  }
  const r = reseam(img, { rows, mats: g.mats, pairs: g.pairs, keep: g.keep || '', seed: g.seed, fills });
  let kept = 0;
  for (const ch of g.over || '') kept += overhang(r.img, img, rows, ch, fills, T);
  varietiesKept(g.set, id, img, r.img);
  const file = join(ROOT, ART_DIR, g.set, id + '.png');
  writeFileSync(file, encodePNG(r.img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes = sc.notes.replace(/ Seams \(lane\/a-ground-seams.*$/, '') + ' Seams (lane/a-ground-seams, tools/world-art/seam-grounds.mjs from ' + SRC + '/' + id + '.png): '
    + r.changed + ' px of ' + g.pairs.length + ' borders redrawn from the fills\' own pixels (' + [...new Set(g.pairs.map((p) => p.style))].join(', ') + ')'
    + (g.grid ? ' on the paint grid ' + g.grid : '') + (g.over ? ', the ' + [...g.over].join(' and ') + ' edges kept as painted (' + kept + ' px laid back)' : '') + '.';
  sc.material = 'native';   /* locked above: the build's lock is now the identity */
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  mkdirSync(join(ROOT, 'art/review/ground-seams'), { recursive: true });
  writeFileSync(join(ROOT, 'art/review/ground-seams', id + '-grid.txt'), rows.join('\n') + '\n');
  console.log('  ✓ ' + g.set + '/' + id + ': seams, ' + r.changed + ' px redrawn' + (g.over ? ', ' + kept + ' px of ' + [...g.over].join(' and ') + ' laid back' : ''));
}

/* every floor variety of this ground keys its variants on its `at` cell's tile (compose.js): a redrawn `at` cell would be a tile of
   its own, and the floor would lose its variety everywhere else. Names a plain cell of the same tile to move it to. */
function varietiesKept(set, id, before, after) {
  for (const f of readdirSync(join(ROOT, ART_DIR, set)).filter((f) => f.endsWith('.json'))) {
    const v = JSON.parse(readFileSync(join(ROOT, ART_DIR, set, f), 'utf8'));
    if (v.kind !== 'variety' || v.of !== set + '/' + id || !v.at) continue;
    const cell = (im, x, y) => Buffer.from(crop(im, x * T, y * T, T, T).data);
    const base = cell(before, v.at[0], v.at[1]);
    if (!Buffer.compare(base, cell(after, v.at[0], v.at[1]))) continue;
    let to = null;
    /* a cell painted with that tile that still is (the build packs a repeated tile once, so it keys the same variants) */
    const W = before.width / T, H = before.height / T;
    for (let y = 0; y < H && !to; y++) for (let x = 0; x < W && !to; x++) if (!Buffer.compare(base, cell(before, x, y)) && !Buffer.compare(base, cell(after, x, y))) to = [x, y];
    throw new Error(v.id + ': its at cell ' + v.at + ' was redrawn; ' + (to ? 'move it to ' + to + ' (the same tile, untouched)' : 'no untouched cell keeps its tile'));
  }
}

function main(argv) {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  for (const id of Object.keys(GROUNDS)) if (!only || only === id) run(id);
  return 0;
}
if (isMain(import.meta.url)) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('seam-grounds: ' + (e && e.message || e)); process.exit(2); } }
