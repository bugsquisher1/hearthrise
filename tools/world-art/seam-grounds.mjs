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
//           shaded paint (the Ford's darkened bank cells read as thicket). The brief's ROWS must still be the map's. A cell an
//           override gives another floor than its paint is redrawn whole with the cells round it (the old floor's rims go).
//   TRAILS  a path a cell wide (`trails`, lane/a-ground-paths) is drawn along its line, over the grass, through the map's crossing
//           cells (planks, a ford: `links`), never on its cells (seams.mjs trailLine): no ruler sides, no staircase diagonals.
//   WATER   held to its `walk` (seams.mjs own): never on an open cell's foot (crossings.mjs FOOT), so a bank may bend through the
//           painted bank cells the map rows block, and swell round a walked foot.
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
import { caveWalls, wallOnWalk } from './cave-walls.mjs';
import { lock } from './lock.mjs';
import { varietyTiles } from './variety.mjs';
import { mapRowOf } from '../../src/data/world/maps/index.js';
import { MATERIALS } from '../../src/data/world/terrain.js';
import { FOOT, FOOTHOLD_IDS } from './crossings.mjs';
import { VARIETY } from '../../src/world/core/ground-variety.js';
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

/* ── boards as wide as the trail: the goblins' plank span with its deck widened by its own planks ──
   cw_plank_bridge carries a 10 px deck between its rails: half the width of the trail it carries (Mosslight's sluice boards, the
   Warrens' Drop: "a half-tile plank ladder"). Its posts and rails kept, its plank columns laid twice more between them (cols 19-24,
   then 21-26 mirrored, so no 6 px repeat runs along a board): a 22 px deck. Same frame height, foot and class (span). */
function widePlanks() {
  const id = 'cw_plank_bridge_wide', dir = join(ROOT, ART_DIR, 'warren');
  const src = decodePNG(readFileSync(join(dir, 'cw_plank_bridge.png'))), sc0 = JSON.parse(readFileSync(join(dir, 'cw_plank_bridge.json'), 'utf8'));
  const cols = [...Array(25).keys(), 19, 20, 21, 22, 23, 24, 26, 25, 24, 23, 22, 21, ...Array.from({ length: src.width - 25 }, (_, i) => 25 + i)];
  const out = createImage(cols.length, src.height);
  cols.forEach((sx, x) => blit(out, src, sx, 0, 1, src.height, x, 0));
  writeFileSync(join(dir, id + '.png'), encodePNG(out));
  /* the deck (cols 14-43) centred on the tile */
  const sc = Object.assign({}, sc0, { id, source: id + '.png', frame: [out.width, src.height], anchor_px: [29, sc0.anchor_px[1]],
    pixellab: Object.assign({}, sc0.pixellab, { derived: 'cw_plank_bridge, 0 gens' }),
    notes: 'cw_plank_bridge\'s posts and rails, its plank columns laid twice more between them (19-24, then 26-21), a 22 px deck as wide as the trail it carries, by tools/world-art/seam-grounds.mjs; pixels unscaled, nothing drawn.' });
  writeFileSync(join(dir, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ warren/' + id + ' (span, ' + out.width + 'x' + src.height + ')');
}

/* ── a ford laid by hand: the meadow stones' own three stones, laid again a tile at a time (lane/a-cave-walls) ──
   Wickstead's ford was one cluster sprite stamped on all twelve tiles of a 4 x 3 block: a grid. mb_stepping_stones holds three
   stones (a big one, a middle one behind it, a small one to its right): each is cut out (every opaque px to the stone whose
   middle is nearest along the art) and laid again in a variant of its own. The step under the walker's foot is the big stone
   or, now and then, the middle one (a smaller step), nudged a few px; the other two move round it or are left out. A stone's
   px are never turned or flipped: the light stays upper left (ART_DIRECTION §1), so a "turned" cluster is a different laying.
   Every variant covers the foot (crossings.mjs FOOT) with stone, and the map gives no two neighbouring tiles the same one. */
export const FORD_STONES = Object.freeze(['mb_stepping_stones_1', 'mb_stepping_stones_2', 'mb_stepping_stones_3', 'mb_stepping_stones_4', 'mb_stepping_stones_5', 'mb_stepping_stones_6']);
/* [main stone, its nudge x, y; then [stone, x, y] for each other stone, its top-left in the frame] */
const FORD_LAYINGS = Object.freeze([
  ['big', -2, 0, ['mid', 13, 3], ['small', 3, 7]],
  ['big', 3, -1, ['small', 2, 9]],
  ['mid', -1, 2, ['small', 20, 12]],
  ['big', 0, 1, ['mid', 3, 4]],
  ['big', 2, 0, ['small', 1, 11], ['mid', 14, 2]],
  ['mid', 2, 1, ['big', 1, 4], ['small', 22, 9]],
]);
function fordStones() {
  const src = decodePNG(readFileSync(join(ROOT, ART_DIR, 'forest', 'mb_stepping_stones.png'))), sc0 = JSON.parse(readFileSync(join(ROOT, ART_DIR, 'forest', 'mb_stepping_stones.json'), 'utf8'));
  const w = src.width, h = src.height, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src.data[(y * w + x) * 4 + 3] >= 128;
  /* each opaque px to the stone whose middle is nearest through the art (a breadth-first walk from the three middles) */
  const seeds = { mid: [10, 11], small: [24, 14], big: [14, 22] }, lab = new Array(w * h).fill(null);
  let front = Object.entries(seeds).map(([k, [x, y]]) => { lab[y * w + x] = k; return [x, y]; });
  while (front.length) {
    const next = [];
    for (const [x, y] of front) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (!on(X, Y) || lab[Y * w + X]) continue;
      lab[Y * w + X] = lab[y * w + x]; next.push([X, Y]);
    }
    front = next;
  }
  const stone = {};
  for (const k of Object.keys(seeds)) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lab[y * w + x] === k) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    stone[k] = { x0, y0, x1, y1, lay: (out, ox, oy) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (lab[y * w + x] === k) { const X = x - x0 + ox, Y = y - y0 + oy; if (X >= 0 && Y >= 0 && X < w && Y < h) out.data.set(src.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (Y * w + X) * 4); } } };
  }
  FORD_LAYINGS.forEach(([main, nx, ny, ...rest], i) => {
    const id = FORD_STONES[i], out = createImage(w, h), m = stone[main];
    /* the step: its bottom on the art's own foot row (3 px over the contact row, under the walker's shadow), centred, nudged */
    const mx = 16 - ((m.x1 - m.x0 + 1) >> 1) + nx, my = stone.big.y1 - (m.y1 - m.y0) + ny;
    /* the far stones first: a nearer stone lies over a farther one */
    const laid = rest.map(([k, x, y]) => ({ k, x, y })).concat([{ k: main, x: mx, y: my }]).sort((a, b) => (a.y + stone[a.k].y1 - stone[a.k].y0) - (b.y + stone[b.k].y1 - stone[b.k].y0));
    for (const s of laid) stone[s.k].lay(out, s.x, s.y);
    let foot = 0, n = 0;
    for (let y = h - 1 - FOOT.rise - 3; y <= h - 1 - 3; y++) for (let x = 16 - FOOT.half; x <= 16 + FOOT.half; x++) { n++; if (out.data[(y * w + x) * 4 + 3] >= 128) foot++; }
    if (foot * 2 < n) throw new Error(id + ': its step covers ' + foot + ' of the foot\'s ' + n + ' px');
    const dir = join(ROOT, ART_DIR, 'forest');
    writeFileSync(join(dir, id + '.png'), encodePNG(out));
    const sc = Object.assign({}, sc0, { id, source: id + '.png', pixellab: Object.assign({}, sc0.pixellab, { derived: 'mb_stepping_stones, 0 gens' }),
      notes: 'mb_stepping_stones\' own three stones laid again (' + laid.map((s) => s.k).join(', ') + ', the ' + main + ' one the step), a ford stone of Wickstead\'s laid by hand, by tools/world-art/seam-grounds.mjs; pixels unscaled, never turned or flipped, nothing drawn.' });
    writeFileSync(join(dir, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
  });
  console.log('  ✓ forest/' + FORD_STONES[0] + '..' + FORD_STONES.length + ' (the ford\'s stones, each its own laying)');
}

/** { 'x,y': ch } for every cell of a w x h block: a `cells` override for a block the pixel read gets wrong */
const rect = (x0, y0, w, h, ch) => Object.fromEntries(Array.from({ length: w * h }, (_, i) => [(x0 + (i % w)) + ',' + (y0 + Math.floor(i / w)), ch]));
/* grass, thicket, path: the meadow family's three open floors (their varieties' cells) */
const meadow = (g, m, p) => ({ T: g, G: m, D: p });
/* THE MEADOW TRAIL (lane/a-ground-paths, Tyler's gate: no ruler-straight cut between two floors, no staircase on a diagonal).
   The dirt path was one cell wide on the grid: ruler sides, every diagonal a staircase of squares. It is drawn along its line
   (seams.mjs trailLine) over the grass, through its crossings (`links`: the map's planks and ford cells, so it meets a bridge's
   end and a ford's water, never a strip of grass short of it). Its fill is the family's dirt tile with no rim: the three meadow
   grounds were painted from one tile, pixel for pixel inside its rims, and only Wickstead's ford is wide enough to hold a cell of
   it with no border (x29 y31). Each trail cell draws one of four of that tile (the plain and three shifted: variety.mjs, the
   2 px ring kept, so two of them meet with no seam), the 32 px repeat broken as the path variety broke it. */
const TRAIL_FILL = Object.freeze(['wickstead_ground', 29, 31]);
const TRAIL = Object.freeze({ D: { host: 'G', links: '=:', blockGrow: 20, blockWarp: 11, variety: { seed: 32, tone: 'damp', shift: true } } });
const TRAIL_PAIR = Object.freeze({ a: 'D', b: 'G', style: 'trail' });
/* Wickstead's ford (x28-31 y30-32) was a dirt square stamped through the brook: it is the brook again (its `cells`), a stone on
   every open tile (src/data/world/maps/wickstead.js), the trail run on to the water's edge on each bank; the banks there wander */
const FORD_BANK = Object.freeze({ bias: { G: 0.05 }, sweep: 12, warp: 10, mid: 5 });
/* the meadow grounds' banks, and their thicket wall in crowns over the water (leaning out over it), the grass and the path; no
   soil line: the meadow canopy's painted edge had none, its crowns cast a shadow instead */
/* a thicket wall's long meander: its edge swings over about five cells, never a straight run; a bay at most half a cell deep into
   the thicket's blocked cells, a bulge a few px over the grass (a deeper bay reads as ground a hero could walk) */
const MEANDER = Object.freeze({ sweep: 18, reach: 160, swing: 0.2, swingScale: 110 });
const BANKS = (wet, grass = {}, wall = 0.06) => [
  Object.assign({ a: 'W', b: 'G', style: 'bank', bias: { G: 0.3 }, sweep: 7, warp: 5, wet }, grass),
  { a: 'W', b: 'D', style: 'bank', bias: { D: 0.3 }, sweep: 5, warp: 4, wet },
  WALL('W', Object.assign({ bias: { T: 0.3 } }, MEANDER)), WALL('G', Object.assign({ bias: { T: wall } }, MEANDER)), WALL('D', Object.assign({ bias: { T: wall } }, MEANDER)),
];
/* the warp's noise spreads about 0.4 of its reach, so a border meant to wander a few px either way takes about twice the defaults'
   octaves: WILD for a soft border with bays (a bank, a mound: an earthwork stays round), TRACK for a two-cell track whose two edges
   must not pinch it */
const WILD = Object.freeze({ style: 'ragged', sweep: 9, warp: 8, mid: 4 });
const TRACK = Object.freeze({ style: 'ragged', sweep: 6, warp: 6, mid: 3 });
/* the alder/thicket wall: whole crowns along a wavy line (seams.mjs canopy), off the walked cells' feet, a soil line where it stands
   on earth or grass */
const CROWNS = Object.freeze({ spacing: 18, jitter: 3 });
const WALL = (floor, o = {}) => Object.assign({ a: 'T', b: floor, style: 'canopy', sweep: 9, warp: 8 }, o);
/* the meadow thicket in depth (seams.mjs canopy.depth: every crown of the mass drawn, lit, clustered, a hollow here and there,
   where it was one flat leaf tile), its crowns a tree wide (24 px), its edge meandering over five cells (MEANDER) */
const MEADOW_MATS = { W: { z: 0, own: true }, D: { z: 1 }, G: { z: 2 }, T: { z: 3, canopy: { spacing: 24, jitter: 4, clearFeet: true, depth: { hollows: 0.06 } } } };
/* the brook may fill its painted bank cells (map cells nobody stands on) so a jog in it bends, never a walked foot (`walk`) */
const BROOK_MATS = Object.assign({}, MEADOW_MATS, { W: { z: 0, own: 'walk', banks: 'G' } });
/* Mosslight's brook was one straight band three cells wide the width of the map, its banks two ruler lines. It bends now: a row
   up or down inside its five rows of brook (y19-23, which nobody stands on but at the ford and the boards), wider at two pools,
   each jog a bend two cells long (smooth). It keeps y20-22 at the ford (x7-13: its stones) and at the boards (x43-46).
   [x0, x1, first water row, last] */
const MOSSLIGHT_BENDS = [[0, 13, 20, 22], [14, 17, 19, 21], [18, 20, 19, 22], [21, 27, 20, 22], [28, 34, 21, 23], [35, 38, 20, 22],
  [39, 42, 19, 21], [43, 46, 20, 22], [47, 51, 21, 23], [52, 55, 20, 23], [56, 59, 20, 22]];
/* the north trail came down x45 to the boards on x44, a cell to their right: it steps over at y17, onto the boards' line */
const MOSSLIGHT_CELLS = Object.assign({}, ...MOSSLIGHT_BENDS.flatMap(([x0, x1, y0, y1]) => Array.from({ length: x1 - x0 + 1 }, (_, i) =>
  Object.fromEntries([19, 20, 21, 22, 23].map((y) => [(x0 + i) + ',' + y, y >= y0 && y <= y1 ? 'W' : 'G'])))),
{ '45,17': 'G', '45,18': 'G', '44,17': 'D', '44,18': 'D' });
/* THE WARRENS' WALLS (lane/a-cave-walls, Tyler's gate: no right-angle staircases). The tileset drew every wall on the grid, its
   south faces a row too high (floor painted on the blocked row under them: a torch hung on floor, a pillar's last row looked
   walkable). tools/world-art/cave-walls.mjs draws them again from the map rows, the foot curving inside the wall cells only,
   in the paint's own px read here (each strip on the paint's 32 px phase, its x or y a multiple of 32 where it repeats):
     face   the long south face over the Copper Face's floor: 30 rows from x512 y184, every 32 px the same
     sideE  the Spoil Heap's west wall, its edge looking east: x99 (the outline) back to x91, rows y288-319
     sideW  the Tool Store's east wall, its edge looking west: x1852 (the outline) on to x1861, rows y512-543
     lip    the Copper Face's north edge over the hall below it: y448 (the outline) down to y451, x576-607
   The floor fill is E's (the variety's `at` cell); `keep` holds the chasm the borders drew (C) as it is. */
const WARRENS_WALLS = Object.freeze({ wall: 'X', floor: 'E', keep: 'C', seed: 61, face: [512, 184, 30], sideE: [99, 288, -1, 9], sideW: [1852, 512, 1, 10], lip: [576, 448, 4] });
export const GROUNDS = Object.freeze({
  /* the brook ran dead straight down its banks and the footbridge was planks painted flat on the water */
  wickstead_ground: { set: 'stead-floor', map: 'wickstead', seed: 41, solid: { '~': 'W', '=': 'W', '#': 'T' }, samples: meadow([0, 0], [5, 3], [15, 8]),
    repaint: { '=': 'W' }, mats: Object.assign({ F: { z: 2.5, unit: true } }, BROOK_MATS), smooth: true, trails: TRAIL, fillFrom: { D: TRAIL_FILL },
    /* the Burned House's floor (x39-51 y33-35) was a pale slab of one flagstone tile ruled straight into the grass: it ends on its
       own stones, the edge ones loose in the grass and a few gone inside (scatter), the slab's corners lost to the meander */
    pairs: BANKS(2, FORD_BANK, 0.35).concat([TRAIL_PAIR, { a: 'F', b: 'G', style: 'scatter', sweep: 10, warp: 9, mid: 4, loose: 0.5, holes: 0.35, fade: 16, fadeIn: 14 }, WALL('F')]),
    /* the tilled plot (x50-55 y23-24) is dark enough to read as thicket: it is its own floor, never touched (it would be crowned) */
    cells: Object.assign(rect(50, 23, 6, 2, 'P'), rect(39, 33, 13, 3, 'F'), rect(28, 30, 4, 3, 'W')), keep: 'P',
    before: () => { raft({ set: 'stead', id: 'wk_footbridge', cells: 4, footprint: [2, 1], what: 'The Wickstead footbridge' }); fordStones(); } },
  /* the brook's banks stepped down the grid, and its two rafts (144 px of logs on 96 px of water) sat a row below the
     trail. Its brook cells carry their own grassy banks, so the water is read from the pixels as the floors are */
  meadowbrook_ground: { set: 'forest-floor', map: 'meadowbrook_thicket', seed: 43, solid: { '#': 'T' },
    samples: Object.assign(meadow([0, 0], [6, 2], [16, 5]), { W: [30, 2] }), mats: BROOK_MATS, smooth: true, trails: TRAIL, fillFrom: { D: TRAIL_FILL },
    pairs: BANKS(2).concat([TRAIL_PAIR]),
    before: () => raft({ set: 'forest', id: 'mb_log_bridge_long', cells: 3, footprint: [1, 1], what: 'The Meadowbrook footbridge' }) },
  /* the sewage channel's L was cut straight into the cobble with no edge: a built channel ends on a kerb course */
  sewer_ground: { set: 'sewer', map: 'millrace_sewer', seed: 53, solid: { '#': 'X', '~': 'W' }, samples: { F: [4, 2] }, keep: 'X',
    mats: { W: { z: 0, own: true }, F: { z: 1 } }, pairs: [{ a: 'W', b: 'F', style: 'kerb', course: 'F' }] },
  /* the chasm was a hard rectangle cut into the cave floor; it is held to its own cells (it blocks a step) */
  warrens_ground: { set: 'warren', map: 'coppercap_warrens', seed: 61, solid: { '#': 'X' }, samples: { E: [9, 0], C: [52, 21] }, only: { C: '~=' }, keep: 'X',
    /* the Drop was a box of one tile with a half-tile plank ladder over it: its rim wanders (smooth, wilder), its far wall shows
       under its north lip and it sinks into the dark (pit), and the boards are as wide as the corridor's trail (widePlanks) */
    mats: { C: { z: 0, own: true, pit: { face: 'E', rows: 10 } }, E: { z: 1 } }, smooth: true, before: widePlanks,
    pairs: [{ a: 'C', b: 'E', style: 'ragged', bias: { E: 0.45 }, sweep: 9, warp: 8, mid: 4 }],
    /* the Drop's two end lips (x47, x57: chasm on the rows, "part of it") were painted floor a cell and a half wide, ground a hero
       could not walk round it on: the chasm runs wall to wall, and the walls' bays beside it fall into it (cave-walls `keep`) */
    cells: Object.assign(rect(47, 20, 1, 3, 'C'), rect(57, 20, 1, 3, 'C')),
    /* every wall was a right-angle step on the grid, its south faces a row too high: drawn again from the map rows */
    walls: WARRENS_WALLS },
  /* the river was one straight band edged by a hairline the length of the map */
  mosslight_ground: { set: 'glade-floor', map: 'mosslight_glade', seed: 47, solid: { '#': 'T' },
    samples: Object.assign(meadow([0, 0], [23, 2], [36, 6]), { W: [30, 21] }), mats: BROOK_MATS, smooth: true, trails: TRAIL, fillFrom: { D: TRAIL_FILL },
    pairs: BANKS(2).concat([TRAIL_PAIR]), cells: MOSSLIGHT_CELLS, before: widePlanks },
  /* the river's banks were sawteeth on the grid, the ford a rectangle of shallows cut straight into its landings and banks, the
     mud track and the barrow banks stepped down the cells. The alder canopy keeps its painted edge (`over`): its crowns and dark rim are
     what tells a player the wall from the grass at night, and a crown cut by the noise loses both */
  hasks_ford_ground: { set: 'ford', map: 'hasks_ford', seed: 61, grid: 'art/briefs/hasks-ford-grid-2026-10-28.txt',
    samples: { G: [46, 4], M: [29, 15] },
    /* the river never reaches a walked cell (the ford's shallows and bars, grass, the track); it may lap into the reed beds */
    mats: { W: { z: 0, own: 'SVGM' }, S: { z: 1 }, V: { z: 2, relief: { from: 'S', steps: 2 } }, M: { z: 3 }, G: { z: 4 }, R: { z: 5 }, B: { z: 6 }, T: { z: 7, canopy: CROWNS } },
    /* the shallows ended on a straight cut into the river four cells long at each end: they taper into it, a cell or two further on
       river cells nobody stands on, rounded by the B-spline (smooth); the gravel bars, flattened to one grey by the palette lock,
       take the shallows' pebbles pressed into their own grey (relief: two steps up, the ground's shade 3 flattens one) */
    smooth: true, cells: { '21,19': 'S', '20,20': 'S', '21,20': 'S', '21,21': 'S', '36,19': 'S', '37,20': 'S', '37,21': 'S', '38,21': 'S', '37,22': 'S' },
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
      WALL('G', { bias: { G: 0.25 }, soil: 'M' }), WALL('R'), WALL('B'),
    ] },
  /* the barrow mounds were blocks stepped on the grid, the mud track's edges hexagon steps, and at shade 3 the turf was the track's
     own dark brown: the turf is lifted a step (`lift`). The reed beds keep their painted scallops and earth rim (`over`): a cut
     through the reeds read as a box */
  muster_barrows_ground: { set: 'muster-floor', map: 'muster_barrows', seed: 67, grid: 'art/briefs/muster-barrows-grid-2026-10-29.txt', over: 'R',
    samples: { G: [39, 4], M: [16, 9] },
    mats: { M: { z: 0 }, G: { z: 1 }, R: { z: 2 }, B: { z: 3, lift: 2 }, T: { z: 4, canopy: CROWNS } },
    pairs: [
      { a: 'M', b: 'G', ...TRACK },
      { a: 'M', b: 'B', ...TRACK, outline: 2 },
      { a: 'G', b: 'B', ...WILD, outline: 2, skirt: 'M' },
      WALL('G', { bias: { G: 0.25 }, soil: 'M' }), WALL('B'),
    ] },
});

function run(id) {
  const g = GROUNDS[id], row = mapRowOf(g.map);
  if (g.before) g.before();
  /* locked to the palette first (the grade the build would give it), so a kerb's or a bank's one-step rims land on real ramps */
  const img = lock(decodePNG(readFileSync(join(ROOT, SRC, id + '.png'))), g.material || 'terrain');
  /* a brief's grid takes the ground's `cells` overrides too (a shallows widened into the river past its walked cells) */
  const brief = g.grid ? gridFromBrief(readFileSync(join(ROOT, g.grid), 'utf8'), row.rows) : null;
  const rows = brief ? brief.map((r, y) => [...r].map((c, x) => (g.cells || {})[x + ',' + y] || c).join('')) : gridFromPixels(img, row.rows, g);
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
  /* a fill taken from a sibling ground painted from the same tile (fillFrom: { ch: [ground, x, y] }), locked as this one is */
  for (const [ch, [src, sx, sy]] of Object.entries(g.fillFrom || {})) fills[ch] = crop(lock(decodePNG(readFileSync(join(ROOT, SRC, src + '.png'))), g.material || 'terrain'), sx * T, sy * T, T, T);
  /* a hero stands on the map's open cells; water held to its `walk` never covers an open cell's FOOT (crossings.mjs, the box rule
     [wet] reads) but may bite into its other px (the water's edge beside a ford is no ruler line on the cell edge). A foot a
     bridge's planks or a stone hold (crossings.mjs FOOTHOLD_IDS) is dry whatever is under it */
  const open = (x, y) => { const m = MATERIALS[row.legend[row.rows[y][x]]]; return !!m && !m.solid; };
  const held = new Set((row.objects || []).filter((ob) => FOOTHOLD_IDS.includes(ob.id)).map((ob) => ob.x + ',' + ob.y));
  row.rows.forEach((r, y) => [...r].forEach((c, x) => { if (row.legend[c] === 'planks') held.add(x + ',' + y); }));
  const dry = (px, py) => {
    const cx = Math.floor(px / T), cy = Math.floor(py / T);
    if (cx < 0 || cy < 0 || cx >= row.rows[0].length || cy >= row.rows.length || !open(cx, cy) || held.has(cx + ',' + cy)) return false;
    const fx = cx * T + (T >> 1), fy = cy * T + T - 1;
    return Math.abs(px - fx) <= FOOT.half && py >= fy - FOOT.rise;
  };
  /* the clip alone leaves the foot's box cut into the water: the water's claim also fades out round every open foot (gone within
     10 px of its middle, whole again 26 px off, the radius wobbling), so the bank swells round a foot as a rounded bay */
  const dryness = (px, py) => {
    const cx0 = Math.floor(px / T), cy0 = Math.floor(py / T);
    let d = Infinity;
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      if (cx < 0 || cy < 0 || cx >= row.rows[0].length || cy >= row.rows.length || !open(cx, cy) || held.has(cx + ',' + cy)) continue;
      d = Math.min(d, Math.hypot(px - cx * T - (T >> 1), py - cy * T - T + 1 + (FOOT.rise >> 1)));
    }
    return 1.5 * Math.max(0, Math.min(1, (26 + 4 * Math.sin(px * 0.21 + py * 0.13) - d) / 16));
  };
  /* a trail runs on over the map's crossing cells (its links: planks, a ford) and draws one of its fill's variants per cell */
  const trails = g.trails && Object.fromEntries(Object.entries(g.trails).map(([ch, t]) => {
    const crossing = (x, y) => (t.links || '').includes(row.rows[y][x]);
    const variants = t.variety ? varietyTiles(fills[ch], t.variety).slice(0, VARIETY.micro) : null;
    return [ch, Object.assign({}, t, { crossing, variants })];
  }));
  /* a cell the overrides give another floor than its paint is redrawn whole, and the cells round it (the old floor's rims) */
  let redraw = null;
  if (g.cells) {
    const read = brief || gridFromPixels(img, row.rows, Object.assign({}, g, { cells: {} }));
    redraw = new Set();
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) if (read[y][x] !== rows[y][x] && !(g.keep || '').includes(rows[y][x])) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) redraw.add((x + dx) + ',' + (y + dy));
  }
  const r = reseam(img, { rows, mats: g.mats, pairs: g.pairs, keep: g.keep || '', seed: g.seed, fills, smooth: !!g.smooth, open, dry, dryness, trails, redraw });
  /* the thicket never says one thing while the walk mask says another: a walked foot under its crowns, or a blocked thicket cell
     opened to more grass than crown, is counted (printed with the run; a bay or a bulge never costs a whole cell) */
  const C = Object.keys(g.mats).find((m) => g.mats[m].canopy);
  let under = 0, opened = 0;
  if (C) for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
    let n = 0, k = 0;
    if (open(x, y)) {
      for (let py = y * T + T - 1 - FOOT.rise; py < y * T + T; py++) for (let px = x * T + 16 - FOOT.half; px <= x * T + 16 + FOOT.half; px++) { n++; if (r.matAt(px, py) === C) k++; }
      if (k * 2 > n) under++;
    } else if (rows[y][x] === C) {
      for (let py = y * T; py < y * T + T; py++) for (let px = x * T; px < x * T + T; px++) { n++; if (r.matAt(px, py) !== C) k++; }
      if (k * 2 > n) opened++;
    }
  }
  let kept = 0;
  for (const ch of g.over || '') kept += overhang(r.img, img, rows, ch, fills, T);
  /* a cave's walls drawn again from the map rows (cave-walls.mjs) in the paint's own px. A px of a walked cell drawn as wall is
     counted twice (the pass's own and the map's materials) and stops the run: the picture never shows rock where a hero walks */
  let out = r.img, walls = null;
  if (g.walls) {
    const wl = g.walls;
    const side = ([x0, y0, dir, n]) => { const s = createImage(n, T); for (let d = 0; d < n; d++) blit(s, img, x0 + dir * d, y0, 1, T, d, 0); return s; };
    const face = crop(img, wl.face[0], wl.face[1], T, wl.face[2]);
    const tex = { top: fillTileOf(img, rows, wl.wall, T), floor: fills[wl.floor], face, rows: [...Array(wl.face[2]).keys()],
      sideE: side(wl.sideE), sideW: side(wl.sideW), lip: crop(img, wl.lip[0], wl.lip[1], T, wl.lip[2]), dark: darkest(face) };
    const cw = caveWalls(out, { rows, wall: wl.wall, T, seed: wl.seed, tex, keep: (x, y) => r.matAt(x, y) === wl.keep });
    const onWalk = wallOnWalk(cw.wall, row.rows, T, open);
    if (onWalk || cw.offWall) throw new Error(id + ': the cave walls drew ' + onWalk + ' px of rock on walked cells, ' + cw.offWall + ' off the wall cells');
    out = cw.img;
    walls = { changed: cw.changed, onWalk };
  }
  varietiesKept(g.set, id, img, out);
  const file = join(ROOT, ART_DIR, g.set, id + '.png');
  writeFileSync(file, encodePNG(out));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes = sc.notes.replace(/ Seams \(lane\/a-ground-seams.*$/, '') + ' Seams (lane/a-ground-seams, tools/world-art/seam-grounds.mjs from ' + SRC + '/' + id + '.png): '
    + r.changed + ' px of ' + g.pairs.length + ' borders redrawn from the fills\' own pixels (' + [...new Set(g.pairs.map((p) => p.style))].join(', ') + ')'
    + (g.grid ? ' on the paint grid ' + g.grid : '') + (g.over ? ', the ' + [...g.over].join(' and ') + ' edges kept as painted (' + kept + ' px laid back)' : '')
    + (walls ? '; the walls drawn again from the map rows (tools/world-art/cave-walls.mjs, lane/a-cave-walls): ' + walls.changed + ' px, none on a walked cell' : '') + '.';
  sc.material = 'native';   /* locked above: the build's lock is now the identity */
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  mkdirSync(join(ROOT, 'art/review/ground-seams'), { recursive: true });
  writeFileSync(join(ROOT, 'art/review/ground-seams', id + '-grid.txt'), rows.join('\n') + '\n');
  console.log('  ✓ ' + g.set + '/' + id + ': seams, ' + r.changed + ' px redrawn' + (g.over ? ', ' + kept + ' px of ' + [...g.over].join(' and ') + ' laid back' : '') + (C ? '; walked feet under the ' + C + ' crowns: ' + under + ', blocked ' + C + ' cells mostly open: ' + opened : '')
    + (walls ? '; walls ' + walls.changed + ' px, px of a walked cell drawn as wall: ' + walls.onWalk : ''));
}

/** The darkest colour of an image (a strip's outline). */
function darkest(im) {
  let best = null, bl = Infinity;
  for (let i = 0; i < im.data.length; i += 4) { const l = im.data[i] * 3 + im.data[i + 1] * 6 + im.data[i + 2]; if (l < bl) { bl = l; best = [im.data[i], im.data[i + 1], im.data[i + 2]]; } }
  return best;
}

/* every floor variety of this ground keys its variants on its `at` cell's tile (compose.js): a redrawn `at` cell would be a tile of
   its own, and the floor would lose its variety everywhere else. Names a plain cell of the same tile to move it to. */
function varietiesKept(set, id, before, after) {
  /* a variety may live in a companion set (forest-floor holds the Meadowbrook's): every set is read */
  const sidecars = readdirSync(join(ROOT, ART_DIR)).flatMap((d) => { try { return readdirSync(join(ROOT, ART_DIR, d)).filter((f) => f.endsWith('.json')).map((f) => join(ROOT, ART_DIR, d, f)); } catch { return []; } });
  for (const file of sidecars) {
    const v = JSON.parse(readFileSync(file, 'utf8'));
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
