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
//   BRIDGES a crossing drawn as a sprite of its own (WK_FOOTBRIDGE): the rows' plank cells are painted as the water they cross.
//
//   node tools/world-art/seam-grounds.mjs [--only <ground>]   write art/world/<set>/<ground>.png (+ its sidecar's note)
//   then: node tools/world-art/build.mjs --set <set>, node tests/world-assets.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
});

function run(id) {
  const g = GROUNDS[id], row = mapRowOf(g.map);
  if (g.before) g.before();
  /* locked to the palette first (the grade the build would give it), so a kerb's or a bank's one-step rims land on real ramps */
  const img = lock(decodePNG(readFileSync(join(ROOT, SRC, id + '.png'))), g.material || 'terrain');
  const rows = gridFromPixels(img, row.rows, g);
  /* each open floor's fill is its sample cell's own tile (a one-tile path has no deep cell to take it from); the rest, the commonest */
  const fills = {};
  for (const [ch, [sx, sy]] of Object.entries(g.samples)) fills[ch] = crop(img, sx * T, sy * T, T, T);
  /* cells the rows paint as another material (a causeway under a new bridge) take that material's fill before the borders */
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
    const m = (g.repaint || {})[row.rows[y][x]];
    if (!m) continue;
    fills[m] = fills[m] || fillTileOf(img, rows, m, T);
    blit(img, fills[m], 0, 0, T, T, x * T, y * T);
  }
  const r = reseam(img, { rows, mats: g.mats, pairs: g.pairs, keep: g.keep || '', seed: g.seed, fills });
  const file = join(ROOT, ART_DIR, g.set, id + '.png');
  writeFileSync(file, encodePNG(r.img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes = sc.notes.replace(/ Seams \(lane\/a-ground-seams.*$/, '') + ' Seams (lane/a-ground-seams, tools/world-art/seam-grounds.mjs from ' + SRC + '/' + id + '.png): '
    + r.changed + ' px of ' + g.pairs.length + ' borders redrawn from the fills\' own pixels (' + [...new Set(g.pairs.map((p) => p.style))].join(', ') + ').';
  sc.material = 'native';   /* locked above: the build's lock is now the identity */
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  mkdirSync(join(ROOT, 'art/review/ground-seams'), { recursive: true });
  writeFileSync(join(ROOT, 'art/review/ground-seams', id + '-grid.txt'), rows.join('\n') + '\n');
  console.log('  ✓ ' + g.set + '/' + id + ': seams, ' + r.changed + ' px redrawn');
}

function main(argv) {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  for (const id of Object.keys(GROUNDS)) if (!only || only === id) run(id);
  return 0;
}
if (isMain(import.meta.url)) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('seam-grounds: ' + (e && e.message || e)); process.exit(2); } }
