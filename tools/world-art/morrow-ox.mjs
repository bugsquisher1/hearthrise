// ════════════════════════════════════════════════════════════════════════
// tools/world-art/morrow-ox.mjs — THE OX ROAD'S OWN GROUND PIECES on the Morrow Hills kit (lane/b-morrow-kit, 2026-11-19; layout A,
// Tyler's pick: one long road, the train nose to tail on it, the bridge down under its last wagon). Used by morrow-grounds.mjs.
//
//   fills    the stream (Q): the March's slow river (gen-2026-11-14/22-river-mud) taken into the deep blue (a peaty moor stream, never the brightest mass); the ford (V): the same water
//            a step lighter where it runs shallow; the coal path (J): the Hold's dark grit (29-hold-tiles/2-gravel-earth); the bridge's
//            deck (G): the taproom's boards turned to run across the way. The crag (K) is no fill: cragDual lays the moor/crag pro tileset's
//            (81c5eca9) own wang tiles on a dual grid over the painted moor, with its faces, lit lips, shade and rubble by rule.
//   finish   the bridge's beams and its broken span (plank ends snapped over the gap, planks down in the stream), coal lumps along
//            the runners' path, reeds at the ford (its water and stones: morrow-ox-ground.mjs oxWater). Every pixel is a palette colour; capFloor holds the floor under the actors.
// mutant-anchors: none — an import tool; tests/world-assets.mjs judges what it writes
// ════════════════════════════════════════════════════════════════════════
import { createImage, crop } from './png.mjs';
import { shadeGround } from './lock.mjs';
import { hash2, noise } from './ground-finish.mjs';
import { RAMPS } from './palette.mjs';
import { varietyTiles } from './variety.mjs';
import { varietyIndex } from '../../src/world/core/ground-variety.js';

const T = 32;
const rgb = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
const stepUp = (c) => ({ '#2a1c14': '#3d2a1d', '#3d2a1d': '#553a26', '#553a26': '#6e4c30' })[c] || c;
const stepDown = (c) => ({ '#553a26': '#3d2a1d', '#3d2a1d': '#2a1c14', '#2a1c14': '#231d1f' })[c] || c;
const turn = (im) => { const o = createImage(im.height, im.width); for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) o.data.set(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4), (x * o.width + (im.height - 1 - y)) * 4); return o; };

/* the crag: the bedded-slab pro tileset (95b2cb35, 15 gens, 2026-11-19 after review b1c: the first set, 81c5eca9 in 4-moor-crag, read as crazy paving) */
export const CRAG = Object.freeze({ dir: 'art/world-src/gen-2026-11-19/morrow-kit/5-moor-crag-beds', id: '95b2cb35-4d04-45c1-8844-8eba1aa3404a' });
export const RIVER = 'art/world-src/gen-2026-11-14/22-river-mud/fill-lower.png';
export const GRIT = 'art/world-src/gen-2026-11-14/29-hold-tiles/2-gravel-earth/fill-upper.png';

/* the stream is peat water: the river's teal is the brightest thing on a dim moor, so it goes into the deep blue ramp (its body as dark
   as the moor, its ripples the teal's own darkest); the ford runs shallow over stones, the river's darkest teal with its ripples a step down */
/* batch-1 review: the navy read as the most saturated ground on a danger map, so the peat goes to the near-neutral shadow and slate ramps;
   the ford keeps the river's own dark teal, lighter and greener, so it reads shallow */
const PEAT = Object.freeze({ '#2e4a52': '#2c2e33', '#4f7a80': '#2e4a52', '#86b4b4': '#3a4652', '#c8e6e0': '#5c6c7a' });
const SHALLOW = Object.freeze({ '#86b4b4': '#4f7a80', '#c8e6e0': '#86b4b4' });
const hexAt = (im, p) => '#' + [0, 1, 2].map((k) => im.data[p + k].toString(16).padStart(2, '0')).join('');
const remap = (img, map) => { const o = createImage(img.width, img.height); o.data.set(img.data); for (let p = 0; p < o.data.length; p += 4) { const to = map[hexAt(o, p)]; if (to) o.data.set(rgb(to), p); } return o; };
/** The Ox Road's fills: { Q, V, J, G } from the readers the painter passes (rd: path -> image; boards; road). */
export function oxFills({ rd, boards, road }) {
  const river = rd(RIVER);
  return {
    Q: { fill: remap(river, PEAT), v: { seed: 83, tone: 'soft', shift: true } },
    V: { fill: remap(river, SHALLOW), v: { seed: 89, tone: 'soft', shift: true } },
    /* batch-1 review: the grit read as asphalt or a ditch; the path is the road's warm earth a step down, the coal lumps say what it is */
    J: { fill: shadeGround(road, 1), v: { seed: 85, tone: 'soft', shift: true } },
    G: { fill: turn(boards), v: { seed: 87, tone: 'soft', spots: 'down' } },
  };
}

/** The pairs the Ox Road's floors meet in (seams.mjs styles; z: the higher is laid over the lower). */
export const OX_MATS = Object.freeze({ Q: { z: -1 }, V: { z: -0.5 }, J: { z: 0.5 }, G: { z: 2, unit: true, mortar: 0.1 } });
export const oxPairs = Object.freeze([
  { a: 'Q', b: 'H', style: 'bank', sweep: 9, warp: 7, scale: 26, mid: 2, wet: 5, wetDeep: 2 },
  { a: 'Q', b: 'R', style: 'bank', sweep: 4, warp: 4, wet: 3 }, { a: 'Q', b: 'J', style: 'bank', sweep: 4, warp: 4, wet: 3 },
  { a: 'V', b: 'H', style: 'bank', sweep: 6, warp: 5, wet: 4 }, { a: 'V', b: 'Q', style: 'ragged', sweep: 12, warp: 10, scale: 18, mid: 3 },
  { a: 'V', b: 'J', style: 'bank', sweep: 4, warp: 4, wet: 3 },
  { a: 'J', b: 'H', style: 'trail' },
  { a: 'G', b: 'R', style: 'stagger' }, { a: 'G', b: 'H', style: 'stagger' }, { a: 'G', b: 'Q', style: 'kerb', course: 'G' },
]);

/** The coal path is a TRAIL (seams.mjs): one worn line through its cells' centres over the moor, never a staircase of squares, carried
    across the road and the ford (its links) */
export const OX_TRAILS = Object.freeze({ J: { host: 'H', links: 'RV', half: 9, swell: 4, sweep: 4, warp: 4 } });
/** The bridge's two abutments (G cells), drawn plank by plank (review b5: "the X motif repeats, comb ends, no thickness or piles"):
    planks laid across the way, each its own width (4-6 px), tone and grain, a dark gap between, nails over the stringers, the cart
    track worn pale along the ruts; a beam along the north edge and along the south a FASCIA with posts (the deck's thickness, its
    shadow on what is under it). Where the deck stops on water (the span that went down) its three STRINGERS stick out over the gap,
    snapped and splintered, and two PILE STUMPS stand in the water where the middle trestle was; planks lie in the stream below. */
export function bridgeDeck(g, grid) {
  const h = grid.length, w = grid[0].length, G = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'G';
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data.set(rgb(c), (y * g.width + x) * 4); };
  let beams = 0, ends = 0, planks = 0;
  /* the decks: each run of G cells along a row band */
  const blocks = [];
  for (let cx = 0; cx < w; cx++) for (let cy = 0; cy < h; cy++) {
    if (!G(cx, cy) || G(cx, cy - 1) || (G(cx - 1, cy) && blocks.some((k) => k.x1 === cx - 1 && k.y0 === cy))) continue;
    let y1 = cy; while (G(cx, y1 + 1)) y1++; let x1 = cx; while (G(x1 + 1, cy)) x1++;
    blocks.push({ x0: cx, y0: cy, x1, y1 });
  }
  for (const k of blocks) {
    const X0 = k.x0 * T, X1 = (k.x1 + 1) * T - 1, Y0 = k.y0 * T, Y1 = (k.y1 + 1) * T - 1, track = [TRAIN_ROW * T + 5, TRAIN_ROW * T + 27];
    let x = X0, p = 0;
    while (x <= X1) {
      const pw = 4 + Math.floor(hash2(p, k.x0, 501) * 3), tone = ['#3d2a1d', '#553a26', '#3d2a1d', '#2a1c14', '#553a26'][Math.floor(hash2(p, k.x0, 503) * 5)];
      for (let xx = x; xx < Math.min(x + pw, X1 + 1); xx++) for (let y = Y0; y <= Y1; y++) {
        let c = xx === x + pw - 1 ? '#17141a' : tone;
        if (c !== '#17141a') {
          if (track.some((t) => Math.abs(y - t) < 3) && hash2(xx, y, 505) > 0.3) c = stepUp(tone);
          else if (noise(xx * 3, y * 0.4, 4, 507) > 0.7) c = stepDown(tone);
          if (xx === x && hash2(xx, y, 509) > 0.5) c = stepUp(c);
        }
        put(xx, y, c);
      }
      for (const ny of [Y0 + 6, Y1 - 7]) { const nx = x + (pw >> 1) - 1; put(nx, ny, '#4a4d54'); put(nx, ny + 1, '#17141a'); }
      x += pw; p++; planks++;
    }
    /* the north beam and the south fascia with its posts */
    for (let xx = X0; xx <= X1; xx++) {
      put(xx, Y0, '#553a26'); put(xx, Y0 + 1, '#3d2a1d'); put(xx, Y0 + 2, '#17141a');
      put(xx, Y1 - 4, '#553a26'); put(xx, Y1 - 3, '#2a1c14'); put(xx, Y1 - 2, '#2a1c14'); put(xx, Y1 - 1, (xx - X0) % 18 < 3 ? '#3d2a1d' : '#2a1c14'); put(xx, Y1, '#0b0a0c');
      if ((xx - X0) % 18 === 0) put(xx, Y1 - 2, '#3d2a1d');
      beams++;
    }
    /* the broken end over the gap: the stringers snapped and splintered, the last plank's end ragged */
    for (const dir of [1, -1]) {
      const edgeCx = dir > 0 ? k.x1 : k.x0; if (!grid[k.y0] || grid[k.y0][edgeCx + dir] !== 'Q') continue;
      const xe = dir > 0 ? X1 + 1 : X0 - 1;
      for (const [sy, len] of [[Y0 + 7, 14 + Math.floor(hash2(k.x0, 1, 511) * 9)], [((Y0 + Y1) >> 1) - 1, 6 + Math.floor(hash2(k.x0, 2, 513) * 6)], [Y1 - 11, 16 + Math.floor(hash2(k.x0, 3, 515) * 8)]]) {
        for (let d = 0; d < len; d++) {
          const ragged = d > len - 4 ? Math.floor(hash2(d, sy, 517) * 3) : 0;
          for (let r = ragged; r < 4; r++) put(xe + dir * d, sy + r, r === 0 ? '#553a26' : r === 3 ? '#17141a' : '#3d2a1d');
        }
        put(xe + dir * len, sy + 1, '#553a26'); put(xe + dir * (len + 1), sy + 2, '#3d2a1d');
        for (let d = 0; d < len; d++) put(xe + dir * d, sy + 5, '#0b0a0c');   /* its shadow on the water */
        ends++;
      }
      for (let y = Y0 + 3; y < Y1 - 4; y++) if (hash2(y, k.x0, 519) > 0.55) put(xe - dir, y, '#17141a');
      /* two pile stumps in the gap where the middle trestle stood */
      const gx = xe + dir * 22;
      for (const sy of [Y0 + 14, Y1 - 20]) {
        /* a round post sawn off ragged: its top end-grain lit, its side down to the water dark, a ring of broken water round its foot */
        for (let b2 = -3; b2 <= 7; b2++) for (let a2 = -4; a2 <= 4; a2++) {
          const top = (a2 / 3.6) ** 2 + ((b2 + 0.5) / 2.2) ** 2 <= 1, side = Math.abs(a2) <= 3 && b2 > -1 && b2 <= 5;
          if (top) put(gx + a2, sy + b2, a2 + b2 < -1 ? '#6e4c30' : a2 < 2 ? '#553a26' : '#3d2a1d');
          else if (side) put(gx + a2, sy + b2, a2 === -3 ? '#3d2a1d' : a2 === 3 ? '#0b0a0c' : b2 > 3 ? '#17141a' : '#2a1c14');
        }
        put(gx - 1, sy - 3, '#2a1c14'); put(gx + 2, sy - 3, '#2a1c14');
        for (let a2 = -6; a2 <= 6; a2++) if (hash2(a2, sy, 521) > 0.3) put(gx + a2, sy + 7 + (Math.abs(a2) > 4 ? 1 : 0), a2 < 0 ? '#5c6c7a' : '#3a4652');
      }
    }
  }
  /* the planks down in the stream: under each broken span, four boards at a slant, the near end lit, a dark waterline under each */
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    if (grid[cy][cx] !== 'Q' || !(G(cx - 1, cy) || G(cx - 2, cy) || G(cx - 3, cy)) || !(G(cx + 1, cy) || G(cx + 2, cy) || G(cx + 3, cy))) continue;
    if (hash2(cx, cy, 51) < 0.35) continue;
    const X = cx * T + 6 + Math.floor(hash2(cx, cy, 53) * 18), Y = cy * T + 6 + Math.floor(hash2(cx, cy, 55) * 18), a = (hash2(cx, cy, 57) - 0.5) * 1.6 + 1.3;
    const c = Math.cos(a), s = Math.sin(a);
    for (let t = -11; t <= 11; t++) for (let k = -1; k <= 2; k++) {
      const x = Math.round(X + t * c - k * s), y = Math.round(Y + t * s + k * c);
      if (k === 2) { if (noise(x, y, 4, 61) > 0.35) put(x, y, '#1a2c44'); continue; }
      if (Math.abs(t) > 9 + (k ? 0 : 1) && noise(t, k, 3, 63) < 0.5) continue;
      put(x, y, k === -1 ? (t < -5 ? '#6e4c30' : '#553a26') : k === 0 ? '#553a26' : '#3d2a1d');
    }
    planks++;
  }
  return { beams, ends, planks };
}

const GREEN = new Set(['#16241a', '#1f3322', '#2c4a2c', '#3d6234', '#557a3e', '#4a5a2a', '#6b7a38', '#73944c']);
const hexOf = (g, x, y) => hexAt(g, (y * g.width + x) * 4);
/** Coal along the runners' path (J cells): lumps of 2-3 px, near black with one cool lit pixel, thicker where the path is worn. */
export function coalLumps(g, grid) {
  const h = grid.length, w = grid[0].length; let n = 0;
  const put = (x, y, c) => g.data.set(rgb(c), (y * g.width + x) * 4);
  for (let py = 0; py < h * T - 3; py += 5) for (let px = 0; px < w * T - 3; px += 5) {
    const X = px + Math.floor(hash2(px, py, 71) * 4), Y = py + Math.floor(hash2(px, py, 73) * 4);
    if (grid[Math.floor(Y / T)][Math.floor(X / T)] !== 'J' || grid[Math.floor((Y + 2) / T)][Math.floor((X + 2) / T)] !== 'J' || hash2(px, py, 75) > 0.32) continue;
    if ([[0, 0], [2, 2]].some(([a, b]) => GREEN.has(hexOf(g, X + a, Y + b)))) continue;   /* only on the trodden line, never on the moor beside it */
    const big = hash2(px, py, 77) > 0.6;
    put(X, Y, '#2c2e33'); put(X + 1, Y, '#0b0a0c'); put(X, Y + 1, '#0b0a0c'); put(X + 1, Y + 1, '#17141a');
    if (big) { put(X + 2, Y + 1, '#0b0a0c'); put(X + 1, Y + 2, '#0b0a0c'); put(X + 2, Y + 2, '#17141a'); }
    n++;
  }
  return n;
}

/* ── THE CRAG ON A DUAL GRID (batch-1 review c REDO: a fish-scale fill on a 32 px repeat, a toothed blueprint rim, no cap, face or
   light, the grass's value). The tileset's own sixteen wang tiles are laid on a grid offset half a cell, each display tile's corners
   the four crag cells round it, so the outcrop's edge is the tileset's drawn shape and its crag-only tiles are varied (never one tile
   on a 32 px repeat). Only a tile's rock pixels are laid; its grass is the painted moor already under it. Then, by rule on the rock:
   the tileset's black transition band (the toothed rim) comes off; the cap's north and west edges catch the light, its east edge
   falls into shade; every south edge gets a FACE 9-13 px tall (gritstone blocks on bedding joints, each block lit on its left, its
   foot in shadow); the cap past two cells from the moor a step into shade and past four cells two (the map's edge falls dark), with
   soft blobs a step down anywhere so no slab pattern lines up; and rubble lies at the foot. ── */
const LOWER = new Set(['moss', 'leaf', 'earth', 'bronze']);
const RAMP_OF = new Map(); for (const [name, ramp] of Object.entries(RAMPS)) ramp.forEach((c, k) => RAMP_OF.set(c, { name, k }));
/* one cool grey ladder for the cap's shade (iron and stone fall into the shadow ramp under their own bottom step) */
const LADDER = ['#0b0a0c', '#17141a', '#231d1f', '#2c2e33', '#3a3a3e', '#4a4d54', '#6a6865', '#8a867d'];
const RUNG = { '#0b0a0c': 0, '#17141a': 1, '#231d1f': 2, '#2f2723': 2, '#2c2e33': 3, '#3a3a3e': 4, '#3a4652': 4, '#4a4d54': 5, '#4f4e52': 5, '#6a6865': 6, '#5c6c7a': 6, '#6e727a': 6, '#8a867d': 7 };
export const CRAG_LOOK = { base: 1, shadeAt: [2.3, 4.3], blob: 0.64, face: [24, 8], mass: 118 };
export function cragDual(g, grid, { sheet, meta }) {
  const h = grid.length, w = grid[0].length, W = g.width, H = g.height;
  const key = (t) => ['NW', 'NE', 'SW', 'SE'].map((c) => (t.corners[c] === 'upper' ? '1' : '0')).join('');
  const tiles = {}; for (const t of meta.tileset_data.tiles) tiles[key(t)] = crop(sheet, t.bounding_box.x, t.bounding_box.y, T, T);
  const vars = varietyTiles(tiles['1111'], { seed: 81, tone: 'soft', shift: true });
  const K = (x, y) => grid[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))] === 'K';
  const kind = (im, q) => { const a = RAMP_OF.get(hexAt(im, q)); return !a || LOWER.has(a.name) ? 0 : a.name === 'shadow' ? 2 : 1; };
  const cr = createImage(W, H), cap = new Uint8Array(W * H);
  /* 1 lay the tiles. In a mixed tile the band is its shadow pixels joined to its grass through shadow, at most 8 px deep */
  let laid = 0, banded = 0;
  for (let dy = -1; dy < h; dy++) for (let dx = -1; dx < w; dx++) {
    const k = [K(dx, dy), K(dx + 1, dy), K(dx, dy + 1), K(dx + 1, dy + 1)].map((b) => (b ? '1' : '0')).join('');
    if (k === '0000') continue;
    const src = k === '1111' ? vars[varietyIndex(0, dx + 1, dy + 1, 81) % vars.length] : tiles[k];
    const kd = new Uint8Array(T * T); for (let i = 0; i < T * T; i++) kd[i] = kind(src, i * 4);
    const depth = new Int8Array(T * T).fill(-1), queue = [];
    if (k !== '1111') for (let i = 0; i < T * T; i++) if (!kd[i]) { depth[i] = 0; queue.push(i); }
    while (queue.length) {
      const i = queue.shift(), u = i % T, v = (i / T) | 0; if (depth[i] >= 8) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const uu = u + a, vv = v + b; if (uu < 0 || vv < 0 || uu >= T || vv >= T) continue; const j = vv * T + uu; if (depth[j] < 0 && kd[j] === 2) { depth[j] = depth[i] + 1; queue.push(j); } }
    }
    for (let i = 0; i < T * T; i++) {
      const X = dx * T + T / 2 + (i % T), Y = dy * T + T / 2 + ((i / T) | 0); if (X < 0 || Y < 0 || X >= W || Y >= H || !kd[i]) continue;
      if (depth[i] > 0) { banded++; continue; }
      cr.data.set(src.data.subarray(i * 4, i * 4 + 4), (Y * W + X) * 4); cap[Y * W + X] = 1; laid++;
    }
  }
  /* the layer warped by a smooth field (+-8 px over about 28 px): the pro tileset's edge runs straight along the cell lines and its
     slabs line up like paving; warped, the outcrop's edge wanders and its slabs lean, the tileset's own pixels moved, none drawn */
  { const cr0 = createImage(W, H); cr0.data.set(cr.data); const cap0 = cap.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.round(x + (noise(x, y, 28, 201) - 0.5) * 26), sy = Math.round(y + (noise(x, y, 28, 203) - 0.5) * 26);
      const P = y * W + x;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) { cap[P] = cap0[P]; continue; }
      cap[P] = cap0[sy * W + sx]; cr.data.set(cr0.data.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), P * 4);
    } }
  /* specks of cap left by the band's removal (a pixel or two) go back to the moor */
  for (let pass = 0; pass < 2; pass++) for (let p = 0; p < W * H; p++) if (cap[p]) {
    const x = p % W, y = (p / W) | 0; let n = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= W || yy >= H || cap[yy * W + xx]) n++; }
    if (n < 2) cap[p] = 0;
  }
  /* review b5: pale 1 px spikes stood along the south crag's top edge (cap one pixel across, left by the warp and lit as a rim): a
     sliver one pixel wide or one pixel tall goes back to the moor (the map's edge counts as crag) */
  /* (they were 2-3 px tendrils: an OPENING of the cap by a disc of radius 2, eroded then grown back, takes anything under 5 px across) */
  { const R2 = [[0, 0]]; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if ((a || b) && a * a + b * b <= 5) R2.push([a, b]);
    const at = (m, x, y) => x < 0 || y < 0 || x >= W || y >= H || m[y * W + x] === 1;
    const er = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cap[y * W + x]) er[y * W + x] = R2.every(([a, b]) => at(cap, x + a, y + b)) ? 1 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cap[y * W + x] && !R2.some(([a, b]) => x + a >= 0 && y + b >= 0 && x + a < W && y + b < H && er[(y + b) * W + x + a])) cap[y * W + x] = 0; }
  /* holes in the cap (the tileset's grass in its joints, a pocket under 60 px not joined to the open moor) are joints: dark, and part of
     the cap, so no lit rim rings them (review b1d: "the grout lines lighter than the stones") */
  /* review b5's spikes: the flood here used to stop early on a big pocket, leaving its frontier as walls, and the rest of the open moor
     filled in as thin 'holes'; each pocket is now flooded whole */
  { const seen = new Uint8Array(W * H); let holes = 0;
    for (let p0 = 0; p0 < W * H; p0++) {
      if (cap[p0] || seen[p0]) continue;
      const comp = [p0], st = [p0]; seen[p0] = 1; let open = false;
      while (st.length) { const p = st.pop(), x = p % W, y = (p / W) | 0; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) open = true;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (!cap[q] && !seen[q]) { seen[q] = 1; comp.push(q); st.push(q); if (comp.length > 60) open = true; } } }
      if (open || comp.length > 60) continue;
      for (const p of comp) { cap[p] = 1; cr.data.set(rgb(hash2(p, 1, 205) > 0.75 ? '#16241a' : '#17141a'), p * 4); holes++; }
    } }
  const C = (x, y) => x < 0 || y < 0 || x >= W || y >= H || cap[y * W + x] === 1;
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g.data.set(rgb(c), (y * W + x) * 4); };
  /* 2 the cap's distance from the moor, in cells (8-way), read at each pixel between the cell centres */
  const dist = Array.from({ length: h }, () => new Array(w).fill(99)), q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!K(x, y)) { dist[y][x] = 0; q.push([x, y]); }
  while (q.length) {
    const [x, y] = q.shift();
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; if (dist[yy][xx] > dist[y][x] + 1) { dist[yy][xx] = dist[y][x] + 1; q.push([xx, yy]); } }
  }
  const dAt = (px, py) => {
    const fx = Math.max(0, Math.min(w - 1.001, px / T - 0.5)), fy = Math.max(0, Math.min(h - 1.001, py / T - 0.5)), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const D = (a, b) => Math.min(dist[Math.min(h - 1, b)][Math.min(w - 1, a)], 8);
    return (D(i, j) * (1 - u) + D(i + 1, j) * u) * (1 - v) + (D(i, j + 1) * (1 - u) + D(i + 1, j + 1) * u) * v;
  };
  let shaded = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cap[y * W + x]) continue;
    const d = dAt(x, y) + (noise(x, y, 26, 211) - 0.5) * 1.4;
    const s = CRAG_LOOK.base + (d > CRAG_LOOK.shadeAt[0] ? 1 : 0) + (d > CRAG_LOOK.shadeAt[1] ? 1 : 0) + (noise(x, y, 44, 213) > CRAG_LOOK.blob ? 1 : 0);
    const hx = hexAt(cr, (y * W + x) * 4);
    put(x, y, s && RUNG[hx] != null ? LADDER[Math.max(0, RUNG[hx] - s)] : hx); if (s) shaded++;
  }
  /* 2a BOULDER MASSES (review b5: "the tops an even crack net = flagstone, the moor's grey value; group into 3-5 boulder masses lit
     upper left, dark lower right"). Seeds on a jittered lattice (CRAG_LOOK.mass px); each cap pixel belongs to its nearest seed, warped
     so the masses are lumpy; in a mass the upper left lifts a rung and the lower right falls one or two; where two masses meet, a dark
     cleft; on a mass's lit side the tileset's fine joints mostly fill in, so its form reads over the net of cracks */
  let massed = 0, clefts = 0;
  { const S = CRAG_LOOK.mass, gx1 = Math.ceil(W / S) + 1, seed = (gx, gy) => [(gx + 0.2 + hash2(gx, gy, 301) * 0.6) * S, (gy + 0.2 + hash2(gx, gy, 303) * 0.6) * S];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!cap[y * W + x]) continue;
      const wx = x + (noise(x, y, 26, 305) - 0.5) * 34, wy = y + (noise(x, y, 26, 307) - 0.5) * 34, cx = Math.floor(wx / S), cy = Math.floor(wy / S);
      let d1 = 1e9, d2 = 1e9, s1 = null;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { if (cx + a < -1 || cx + a > gx1) continue; const sd = seed(cx + a, cy + b), d = Math.hypot(wx - sd[0], (wy - sd[1]) * 1.15); if (d < d1) { d2 = d1; d1 = d; s1 = sd; } else if (d < d2) d2 = d; }
      if (d2 - d1 < 2.4) { put(x, y, d2 - d1 < 1.2 ? '#0b0a0c' : '#17141a'); clefts++; continue; }
      const l = -((wx - s1[0]) * 0.8 + (wy - s1[1])) / S, delta = l > 0.2 ? 1 : l < -0.42 ? -2 : l < -0.14 ? -1 : 0;
      let r = RUNG[hexAt(g, (y * W + x) * 4)]; if (r == null) continue;
      if (r <= 2 && delta >= 0 && noise(x, y, 5, 309) < 0.62) r = 4;
      put(x, y, LADDER[Math.max(0, Math.min(LADDER.length - 1, r + delta))]); massed++;
    } }
  /* 2b the moor creeps onto the cap: in soft blobs its dark joints grow grass (the moor's darkest greens, a tuft pixel here and
     there); and a few long fissures cross it (a dark line wandering 20-60 px, its lower lip lit), so the slabs never read as paving */
  let grass = 0, cracks = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cap[y * W + x] || noise(x, y, 30, 215) < 0.66) continue;
    const hx = hexAt(g, (y * W + x) * 4); if (hx !== '#17141a' && hx !== '#0b0a0c' && hx !== '#231d1f') continue;
    put(x, y, hash2(x, y, 217) > 0.86 ? '#2c4a2c' : hash2(x, y, 219) > 0.5 ? '#1f3322' : '#16241a'); grass++;
  }
  for (let i = 0; i < Math.round((W * H) / 9000); i++) {
    let x = Math.floor(hash2(i, 1, 281) * W), y = Math.floor(hash2(i, 2, 283) * H); if (!cap[y * W + x]) continue;
    let a = hash2(i, 3, 285) * Math.PI * 2; const n = 20 + Math.floor(hash2(i, 4, 287) * 40);
    for (let k = 0; k < n; k++) {
      a += (noise(k, i, 6, 289) - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a);
      const X = Math.round(x), Y = Math.round(y); if (!C(X, Y) || !C(X, Y + 1) || !C(X, Y - 1) || X >= W || Y >= H) break;
      put(X, Y, '#17141a'); if (hash2(X, Y, 291) > 0.3) put(X, Y + 1, '#4f4e52'); cracks++;
    }
  }
  /* 3 THE FACE, cut into the crag's own cells (review b1d: "a comb of teeth ... a kerb, not a cliff"; asked for a bedded face of a tile
     or more). Under every south edge of the cap the bottom 24-31 px of the mass are its face, so its foot stands on the cell line and
     what blocks a step is what looks raised. The face is BEDDED: courses 6-10 px tall of blocks 7-20 px wide, the joints staggered
     course to course; each block lit along its top and down its left (the light is the upper left), its right and underside dark, the
     upper courses a step over the lower; the bottom course in shadow, the foot black. A mass too thin for a full face is all face. */
  const face = new Uint8Array(W * H), feet = [], lipAt = new Uint8Array(W * H);
  let faces = 0;
  const blockAt = (x, k) => { /* course k's block edges: a walk of widths 7-20 from a per-course start */ let e = -Math.floor(hash2(k, 3, 231) * 20), i = 0; while (true) { const n = 10 + Math.floor(hash2(i, k, 233) * 18); if (x < e + n) return [i, e, e + n]; e += n; i++; } };
  for (let x = 0; x < W; x++) for (let y = 0; y < H - 1; y++) {
    if (!(C(x, y) && !C(x, y + 1))) continue;
    let run = 0; while (run < 60 && C(x, y - run - 1) && y - run - 1 >= 0) run++;
    const F = Math.min(run + 1, CRAG_LOOK.face[0] + Math.floor(noise(x, y, 40, 241) * CRAG_LOOK.face[1]));
    const top = y - F + 1;
    if (top - 1 >= 0 && C(x, top - 1)) lipAt[(top - 1) * W + x] = 1;
    let k = 0, c0 = 0;
    for (let r = 0; r < F; r++) {
      const Y = top + r, rb = F - 1 - r;
      /* courses from the top: heights 6-10, the k-th course's height by its block */
      let [bi, bx0, bx1] = blockAt(x, k);
      const ch = 6 + Math.floor(hash2(bi, k, 235) * 5);
      if (r - c0 >= ch) { k++; c0 = r; [bi, bx0, bx1] = blockAt(x, k); }
      const rr = r - c0, hh = 6 + Math.floor(hash2(bi, k, 235) * 5), u = x - bx0, wd = bx1 - bx0;
      const low = r > F * 0.55, body = low ? (hash2(x, Y, 237) > 0.85 ? '#3a3a3e' : '#2c2e33') : (hash2(x, Y, 239) > 0.85 ? '#2c2e33' : '#3a3a3e');
      let col;
      if (rb === 0) col = '#0b0a0c';
      else if (rb === 1) col = '#17141a';
      else if (rb <= 4) col = rr === 0 ? '#2c2e33' : u === 0 ? '#17141a' : hash2(x, Y, 243) > 0.6 ? '#231d1f' : '#2c2e33';
      /* a slab, not a brick: its bed joint broken here and there, a vertical joint only on some blocks and only part way down, its
         top lit, its left lit only near the top (a rounded arris) */
      else if (rr === hh - 1 && hash2(x >> 2, k, 259) > 0.2) col = '#17141a';
      else if (u === wd - 1 && hash2(bi, k, 261) > 0.35 && rr < hh - 2 - Math.floor(hash2(bi, k, 263) * 3)) col = '#17141a';
      else if (rr === hh - 2 && hash2(x >> 2, k, 259) > 0.2) col = '#231d1f';
      else if (rr === 0 || (u === 0 && rr < 3 && hash2(bi, k, 261) > 0.35)) col = low ? '#3a3a3e' : '#4f4e52';
      else col = body;
      put(x, Y, col); face[Y * W + x] = 1; faces++;
    }
    feet.push([x, y + 1]);
  }
  /* 4 the cap's edges: lit along its front (over the face) and its north and west rims (the light is the upper left), dark on the east */
  let lips = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!C(x, y) || face[y * W + x]) continue;
    const lit = hash2(x, y, 221) > 0.25 ? '#6a6865' : '#4f4e52';
    if (lipAt[y * W + x] || !C(x, y - 1) || !C(x - 1, y)) { put(x, y, lit); lips++; if (C(x, y + 1) && !face[(y + 1) * W + x] && hash2(x, y, 223) > 0.5) put(x, y + 1, '#4f4e52'); }
    else if (!C(x + 1, y)) { put(x, y, '#17141a'); put(x - 1, y, '#2c2e33'); }
  }
  /* 5 rubble at the foot: stones of 2-4 px (a boulder of 5-6 now and then), the top a step over the moor, its upper-left pixel lit,
     a dark foot and right side; never on the cap or a face, never two touching, thinning out away from the foot */
  const used = new Uint8Array(W * H); let rubble = 0;
  const stone = (X, Y, sz) => {
    for (let b = -1; b <= sz + 1; b++) for (let a = -1; a <= sz + 1; a++) { const xx = X + a, yy = Y + b; if (xx < 0 || yy < 0 || xx >= W || yy >= H || C(xx, yy) || face[yy * W + xx] || used[yy * W + xx]) return 0; }
    for (let b = 0; b < sz; b++) for (let a = 0; a < sz; a++) {
      if (sz > 2 && ((a === 0 && b === 0) || (a === sz - 1 && b === sz - 1) || (sz > 4 && a === sz - 1 && b === 0))) continue;
      put(X + a, Y + b, a + b <= (sz > 3 ? 1 : 0) ? '#6a6865' : b >= sz - 1 || a >= sz - 1 ? '#2c2e33' : '#4f4e52');
    }
    for (let a = 1; a <= sz; a++) put(X + a, Y + sz, '#17141a');
    put(X + sz, Y + sz - 1, '#17141a');
    for (let b = -1; b <= sz + 1; b++) for (let a = -1; a <= sz + 1; a++) used[(Y + b) * W + X + a] = 1;
    rubble++; return 1;
  };
  for (const [x, y] of feet) {
    if (hash2(x, y, 261) < 0.32) stone(x + Math.floor((hash2(x, y, 263) - 0.5) * 4), y + 1 + Math.floor(hash2(x, y, 265) ** 2 * 8), 2 + Math.floor(hash2(x, y, 267) * 3));
    else if (hash2(x, y, 269) < 0.06) stone(x - 2, y, 5 + Math.floor(hash2(x, y, 271) * 3));
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (C(x, y) && !C(x, y - 1) && y > 0 && hash2(x, y, 273) < 0.03) stone(x - 1, y - 4 - Math.floor(hash2(x, y, 275) * 3), 2);
  return { laid, banded, shaded, massed, clefts, lips, faces, rubble };
}

/* ── THE OX ROAD'S OWN WEAR (batch-1 reviews: the road's lit pixels sat in the 0.07-0.09 dead zone and it was the brightest mass; then
   "one brown with fine noise ... ruts 1-2 px hairlines, the puddles a steel-blue stroke, the pebbles one clump stamped eight times,
   the most saturated mass"). Every road pixel stays under 0.07 (capFloor ROAD_MAX), so the read comes from structure, not light:
   the body is the earth dulled by grey grit in clumps (a step off the saturated brown), the crown between the ruts is clean earth
   (the lightest thing on it), the verges a step darker with the moor's grass creeping in, the south verge's last pixels a lit lip;
   two rut BEDS 4-6 px wide (a shaded north wall, a dark bed, the far south wall lit), broken where the road dried hard; puddles in
   the beds from the road's own darks with one grey glint; loose stones of 1-3 px scattered singly, never a stamped clump. ── */
const EARTHS = new Set(RAMPS.earth.concat(RAMPS.bronze));
/** The row the train stands on (src/data/grounds/ox_road/map.js objects): its wheels run in the ruts. */
export const TRAIN_ROW = 22;
/** Where mh_ore_wagon_slewed stands (map.js objects, x23-24 on TRAIN_ROW): its tail swung south out of the ruts, so the ruts kink south
    under it (review b2: ruts ruler-straight under an even line of rigs). */
export const SLEW = Object.freeze({ at: 24 * T + 20, half: 34, dy: 6 });
export function oxRoad(g, grid, { wrecks = [] } = {}) {
  const h = grid.length, w = grid[0].length, W = g.width;
  const isR = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'R';
  const at = (x, y) => hexAt(g, (y * W + x) * 4), put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < g.height) g.data.set(rgb(c), (y * W + x) * 4); };
  const onRoad = (x, y) => x >= 0 && y >= 0 && x < W && y < g.height && isR(x >> 5, y >> 5) && EARTHS.has(at(x, y));
  const onCell = (x, y) => x >= 0 && y >= 0 && x < W && y < g.height && isR(x >> 5, y >> 5) && !moorAt(x, y);
  const moorAt = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= g.height) return false; const c = at(x, y); return RAMPS.leaf.includes(c) || RAMPS.moss.includes(c); };
  let grit = 0, crown = 0, verge = 0, creep = 0, rut = 0, puddle = 0, stones = 0, warped = 0;
  /* 0 the border warped (batch-1 review b: the apron's cell steps and ruler lines): every pixel of a road cell or a moor cell beside one
     takes the ground of a point up to +-9 px away on a smooth field (only where that ground differs), so the road's edge wanders and
     its corners round off. Never within a cell of the bridge, the ford or the coal path. */
  { const src = createImage(W, g.height); src.data.set(g.data);
    const RH = (cx, cy) => cx < 0 || cy < 0 || cx >= w || cy >= h || 'RHJ'.includes(grid[cy][cx]);
    const near = (cx, cy) => { let r = false; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { if (!RH(cx + a, cy + b)) return false; if (isR(cx + a, cy + b)) r = true; } return r; };
    const ok = []; for (let cy = 0; cy < h; cy++) { ok.push([]); for (let cx = 0; cx < w; cx++) ok[cy].push(near(cx, cy)); }
    for (let y = 0; y < g.height; y++) for (let x = 0; x < W; x++) {
      if (!ok[y >> 5][x >> 5]) continue;
      const sx = Math.round(x + (noise(x, y, 30, 391) - 0.5) * 30), sy = Math.round(y + (noise(x, y, 30, 393) - 0.5) * 30);
      if (sx < 0 || sy < 0 || sx >= W || sy >= g.height || !ok[sy >> 5][sx >> 5]) continue;
      /* only the border moves: a pixel changes only where the warped point is the other ground (the moor's texture is never smeared) */
      const moor = (q) => { const c = hexAt(src, q); return RAMPS.leaf.includes(c) || RAMPS.moss.includes(c); };
      if (moor((sy * W + sx) * 4) === moor((y * W + x) * 4)) continue;
      g.data.set(src.data.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * W + x) * 4); warped++;
    } }
  /* the road's middle per pixel column: its cells' centres averaged over three cells (the road runs east-west) */
  /* the line it runs on: the wheels' line of the train, which stands on one row (TRAIN_ROW) the whole way, so the wagons stand in their
     own ruts (review b1d: a line from the road's cells kinked the ruts into a V at the turnout); a column with no road has none */
  /* the wheels' line sits so a wagon's near wheels (its frame's bottom row) stand in the near rut's bed and its far wheels, 22 px up, in the far one */
  const raw = []; for (let a = 0; a < W; a++) { let any = false; for (let b = 0; b < h; b++) if (isR(a >> 5, b)) any = true; raw.push(any ? TRAIN_ROW * T + 16 : null); }
  const mid = raw.map((_, a) => { let s = 0, k = 0; for (let d = -96; d <= 96; d++) { const v = raw[a + d]; if (v != null) { s += v; k++; } } return k ? s / k + SLEW.dy * Math.exp(-(((a - SLEW.at) / SLEW.half) ** 2)) : null; });
  /* 1 the body: the lit grain down to the body, grey grit in clumps (dulls the brown), the darkest grain kept */
  for (let y = 0; y < g.height; y++) for (let x = 0; x < W; x++) {
    if (!onRoad(x, y)) continue;
    const c = at(x, y);
    /* review b5, ranked 3: the road was the brightest broad ground in grey; its body goes a step down, the old body kept as a lit grain
       in soft patches (the crown and the south lip, step 2, stay the lightest) */
    if (c === '#6e4c30' || c === '#8a6440' || c === '#a88457' || c === '#553a26') put(x, y, noise(x, y, 3.4, 399) > 0.7 + 0.12 * noise(x, y, 60, 398) ? '#553a26' : '#3d2a1d');
    /* the dust: grey grit in CLUMPS of 2-4 px (a fine value noise under a share that drifts in soft patches). Review b1d: random grey
       salt read as plastic; review b4: the 4x4 ordered dither that replaced it read as a screen-door mesh at x2, the loudest tell */
    if ((at(x, y) === '#3d2a1d' || at(x, y) === '#553a26') && noise(x, y, 2.4, 401) < 0.08 + 0.36 * noise(x, y, 40, 403)) { put(x, y, '#2c2e33'); grit++; }
  }
  /* 2 across the road: the crown clean, the verges darker with grass creeping in, the south verge's lip lit */
  for (let x = 0; x < W; x++) {
    if (mid[x] == null) continue;
    const c = mid[x] + (noise(0, x, 150, 5) - 0.5) * 22;
    for (let y = Math.max(0, Math.round(c - 70)); y < Math.min(g.height, Math.round(c + 70)); y++) {
      if (!onCell(x, y)) continue;
      let dn = 0, ds = 0; while (dn < 14 && !moorAt(x, y - dn - 1)) dn++; while (ds < 14 && !moorAt(x, y + ds + 1)) ds++;
      const wob = noise(x, y, 12, 405) * 6;
      if (Math.abs(y - c) < 5 + wob * 0.5 && (at(x, y) === '#2c2e33' || (at(x, y) === '#3d2a1d' && hash2(x, y, 406) > 0.45))) { put(x, y, '#553a26'); crown++; }
      else if (ds < 2 && hash2(x, y, 407) > 0.3) { put(x, y, '#553a26'); verge++; }
      else if ((dn < 4 + wob || ds < 2 + wob * 0.6) && hash2(x, y, 409) < 0.55) { put(x, y, hash2(x, y, 411) > 0.4 ? '#2a1c14' : '#2f2723'); verge++; }
      if ((dn < 3 || ds < 3) && hash2(x, y, 413) < 0.1) { put(x, y, hash2(x, y, 415) > 0.5 ? '#16241a' : '#1f3322'); if (hash2(x, y, 417) > 0.6) put(x, y - 1, '#16241a'); creep++; }
    }
  }
  /* 3 the ruts: two beds a cart's width apart, wandering with the road and each on its own, 4-6 px across (review b5: "two unbroken
     parallel lines = a ruler line: break, puddle, braid"): broken where the road dried hard, and two more pairs ride beside them, fainter
     and narrower: a BRAID that wanders off the main line and back, and a DETOUR the traffic before the train wore round each wreck */
  const bump = (a) => wrecks.reduce((s, wx) => s - 30 * Math.exp(-(((a - wx) / 46) ** 2)), 0);
  const braid = (a) => (noise(0, a, 230, 473) - 0.5) * 70;
  const rutAt = (a, c, off, wd, faint, k) => {
    for (let r = 0; r < wd; r++) {
      const y = c + off + r; if (!onCell(a, y)) continue;
      let col = r === 0 ? '#231d1f' : r === wd - 1 ? (faint ? '#3d2a1d' : '#553a26') : r === wd - 2 && !faint ? '#3d2a1d' : hash2(a, y, 419 + k) > 0.7 ? '#231d1f' : '#2a1c14';
      put(a, y, col); rut++;
    }
  };
  for (let a = 0; a < W; a++) {
    if (mid[a] == null) continue;
    const c = mid[a] + (noise(0, a, 150, 5) - 0.5) * 22;
    for (const off of [-11, 11]) {
      const b = Math.round(c + off + (noise(off, a, 61, 7) - 0.5) * 14 + (noise(off, a, 17, 8) - 0.5) * 3);
      if (noise(off, a, 90, 9) < 0.33) continue;
      const wd = 4 + Math.floor(noise(off, a, 31, 10) * 3.4);
      const wet = noise(off, a, 37, 11) > 0.7;
      for (let r = 0; r < wd; r++) {
        if (!onCell(a, b + r)) continue;
        /* review b4: a near-black north wall read as a crevice; the wall is the shadow ramp's warm dark, a step over black */
        let col = r === 0 ? '#231d1f' : r === wd - 1 ? '#553a26' : r === wd - 2 ? '#3d2a1d' : hash2(a, b + r, 419) > 0.7 ? '#231d1f' : '#2a1c14';
        if (wet && r > 0 && r < wd - 1) { col = r === 1 ? '#17141a' : '#231d1f'; if (r === 2 && hash2(a, b, 421) > 0.88) col = '#2c2e33'; puddle++; }
        put(a, b + r, col); rut++;
      }
    }
    /* the braid, where it has wandered off the main pair, and the detour round a wreck, each a fainter pair 2-3 px wide */
    const bo = braid(a), dt = bump(a);
    for (const [shift, k] of [[bo, 1], [dt, 2]]) {
      if (Math.abs(shift) < 7 || noise(k, a, 40, 475 + k) < 0.38) continue;
      for (const off of [-10, 10]) rutAt(a, Math.round(c + shift + (noise(off + k, a, 50, 477) - 0.5) * 6), off, 2 + (noise(off, a, 23, 479) > 0.6 ? 1 : 0), true, k);
    }
  }
  /* 4 loose stones, one at a time: 1-3 px, grey or the road's own dark, a dark foot; denser where the road is stony, never two touching */
  const used = new Uint8Array(W * g.height);
  for (let i = 0; i < (W * g.height) / 260; i++) {
    const x = Math.floor(hash2(i, 1, 431) * W), y = Math.floor(hash2(i, 2, 433) * g.height);
    if (!onCell(x, y) || hash2(i, 3, 435) > noise(x, y, 70, 437) * 1.4 - 0.2) continue;
    const sz = 1 + Math.floor(hash2(i, 4, 439) ** 2 * 3), grey = hash2(i, 5, 441) > 0.35;
    let ok = true; for (let b = -1; b <= sz + 1 && ok; b++) for (let a = -1; a <= sz + 1; a++) if (!onCell(x + a, y + b) || used[(y + b) * W + x + a]) { ok = false; break; }
    if (!ok) continue;
    for (let b = 0; b < sz; b++) for (let a = 0; a < sz; a++) put(x + a, y + b, grey ? (a + b === 0 && sz > 1 ? '#4f4e52' : '#3a3a3e') : (a + b === 0 ? '#553a26' : '#3d2a1d'));
    for (let a = 0; a <= sz; a++) put(x + a, y + sz, '#17141a');
    for (let b = -1; b <= sz + 1; b++) for (let a = -1; a <= sz + 1; a++) used[(y + b) * W + x + a] = 1;
    stones++;
  }
  return { warped, grit, crown, verge, creep, rut, puddle, loose: stones };
}

/* ── REEDS AT THE FORD: clumps of reed on the moor where it meets the stream within a few cells of the ford, standing strokes 3-7 px in
   the moor's own dark greens with a lit tip, a few brown seed heads, a dark foot; never on the water, never on a walked path ── */
export function fordReeds(g, grid) {
  const h = grid.length, w = grid[0].length, W = g.width; let n = 0;
  let fx0 = w, fx1 = -1, fy0 = h, fy1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === 'V') { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y); }
  if (fx1 < 0) return 0;
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < g.height) g.data.set(rgb(c), (y * W + x) * 4); };
  const moor = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= g.height) return false; const c = hexAt(g, (y * W + x) * 4); return RAMPS.leaf.includes(c) || RAMPS.moss.includes(c); };
  const wet = (x, y) => { const c = grid[y >> 5] && grid[y >> 5][x >> 5]; return c === 'Q' || c === 'V'; };
  for (let i = 0; i < 900; i++) {
    const x = Math.floor((fx0 - 2) * 32 + hash2(i, 1, 461) * (fx1 - fx0 + 5) * 32), y = Math.floor((fy0 - 3) * 32 + hash2(i, 2, 463) * (fy1 - fy0 + 7) * 32);
    if (!moor(x, y) || grid[y >> 5][x >> 5] !== 'H') continue;
    /* only near the water's edge: water within 7 px left or right */
    let near = false; for (let k = 1; k <= 7 && !near; k++) if (wet(x - k, y) || wet(x + k, y)) near = true;
    if (!near || hash2(i, 3, 465) > 0.55) continue;
    const blades = 3 + Math.floor(hash2(i, 4, 467) * 4);
    for (let b = 0; b < blades; b++) {
      const bx = x + Math.round((hash2(i, 10 + b, 469) - 0.5) * 6), ht = 3 + Math.floor(hash2(i, 20 + b, 471) * 5), lean = hash2(i, 30 + b, 473) > 0.5 ? 1 : -1;
      if (!moor(bx, y)) continue;
      for (let t = 0; t < ht; t++) put(bx + (t > ht * 0.6 ? lean : 0), y - t, t === ht - 1 ? '#3d6234' : t < 2 ? '#1f3322' : '#2c4a2c');
      if (hash2(i, 40 + b, 475) > 0.8) { put(bx + lean, y - ht, '#553a26'); put(bx + lean, y - ht - 1, '#3d2a1d'); }
      put(bx, y + 1, '#16241a');
    }
    n++;
  }
  return n;
}
