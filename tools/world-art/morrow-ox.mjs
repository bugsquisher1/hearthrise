// ════════════════════════════════════════════════════════════════════════
// tools/world-art/morrow-ox.mjs — THE OX ROAD'S OWN GROUND PIECES on the Morrow Hills kit (lane/b-morrow-kit, 2026-11-19; layout A,
// Tyler's pick: one long road, the train nose to tail on it, the bridge down under its last wagon). Used by morrow-grounds.mjs.
//
//   fills    the stream (Q): the March's slow river (gen-2026-11-14/22-river-mud) taken into the deep blue (a peaty moor stream, never the brightest mass); the ford (V): the same water
//            a step lighter where it runs shallow; the coal path (J): the Hold's dark grit (29-hold-tiles/2-gravel-earth); the bridge's
//            deck (G): the taproom's boards turned to run across the way; the crag (K): the moor/crag pro tileset (81c5eca9, born on the
//            palette, chained to the moor's base tile) top, raised by seams.mjs `rise` with its own drawn face (the south-edge tile's rows).
//   finish   the ford's stepping stones, the bridge's beams and its broken span (plank ends snapped over the gap, planks down in the
//            stream), coal lumps along the runners' path. Every pixel is a palette colour; capFloor holds the floor under the actors.
// mutant-anchors: none — an import tool; tests/world-assets.mjs judges what it writes
// ════════════════════════════════════════════════════════════════════════
import { createImage, crop } from './png.mjs';
import { shadeGround } from './lock.mjs';
import { hash2, noise } from './ground-finish.mjs';

const T = 32;
const rgb = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
const turn = (im) => { const o = createImage(im.height, im.width); for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) o.data.set(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4), (x * o.width + (im.height - 1 - y)) * 4); return o; };

export const CRAG = Object.freeze({ dir: 'art/world-src/gen-2026-11-19/morrow-kit/4-moor-crag', id: '81c5eca9-81fa-4e8b-9fe3-e58fa54089f7' });
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
/** The Ox Road's fills: { Q, V, J, G, K } from the readers the painter passes (rd: path -> image; fillOf: dir, corner key -> 32 px tile; boards). */
export function oxFills({ rd, fillOf, boards, road }) {
  const river = rd(RIVER), crag = fillOf(CRAG.dir, '1111');
  return {
    Q: { fill: remap(river, PEAT), v: { seed: 83, tone: 'soft', shift: true } },
    V: { fill: remap(river, SHALLOW), v: { seed: 89, tone: 'soft', shift: true } },
    /* batch-1 review: the grit read as asphalt or a ditch; the path is the road's warm earth a step down, the coal lumps say what it is */
    J: { fill: shadeGround(road, 1), v: { seed: 85, tone: 'soft', shift: true } },
    G: { fill: turn(boards), v: { seed: 87, tone: 'soft', spots: 'down' } },
    K: { fill: shadeGround(crag, 1), v: { seed: 81, tone: 'soft', spots: 'down' } },
  };
}
/** The crag's drawn face: rows 15-20 of the tileset's south-edge tile (corners 1100, at sheet x96): its lit lip, then the face to its foot. */
export const cragFace = (sheet) => shadeGround(crop(sheet, 96, 15, 32, 6), 1);

/** The pairs the Ox Road's floors meet in (seams.mjs styles; z: the higher is laid over the lower). */
export const OX_MATS = Object.freeze({ Q: { z: -1 }, V: { z: -0.5 }, J: { z: 0.5 }, G: { z: 2, unit: true, mortar: 0.1 }, K: { z: 4 } });
export const oxPairs = (face) => [
  { a: 'Q', b: 'H', style: 'bank', sweep: 9, warp: 7, scale: 26, mid: 2, wet: 5, wetDeep: 2 },
  { a: 'Q', b: 'R', style: 'bank', sweep: 4, warp: 4, wet: 3 }, { a: 'Q', b: 'J', style: 'bank', sweep: 4, warp: 4, wet: 3 },
  { a: 'V', b: 'H', style: 'bank', sweep: 6, warp: 5, wet: 4 }, { a: 'V', b: 'Q', style: 'ragged', sweep: 12, warp: 10, scale: 18, mid: 3 },
  { a: 'V', b: 'J', style: 'bank', sweep: 4, warp: 4, wet: 3 },
  { a: 'J', b: 'H', style: 'trail' },
  { a: 'G', b: 'R', style: 'stagger' }, { a: 'G', b: 'H', style: 'stagger' }, { a: 'G', b: 'Q', style: 'kerb', course: 'G' },
  { a: 'K', b: 'H', style: 'rise', sweep: 10, warp: 9, scale: 30, face: 6, drop: 3, faceTex: face, side: 2 },
  { a: 'K', b: 'Q', style: 'rise', sweep: 8, warp: 8, face: 6, drop: 2, faceTex: face, side: 2 },
  { a: 'K', b: 'J', style: 'rise', sweep: 8, warp: 8, face: 6, drop: 2, faceTex: face, side: 2 },
];

/** The coal path is a TRAIL (seams.mjs): one worn line through its cells' centres over the moor, never a staircase of squares, carried
    across the road and the ford (its links) */
export const OX_TRAILS = Object.freeze({ J: { host: 'H', links: 'RV', half: 9, swell: 4, sweep: 4, warp: 4 } });
/** The ford's stepping stones (V cells): flat stones in staggered rows across the water, a lit top edge, a dark foot and a ring of pale
    water where the stream breaks on each; spaced a stride apart so the line reads as a way across, never a gravel bed. */
export function fordStones(g, grid) {
  const h = grid.length, w = grid[0].length; let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === 'V') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return 0;
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data.set(rgb(c), (y * g.width + x) * 4); };
  const N = 6, L = x0 * T - 4, R = (x1 + 1) * T + 4, mid = ((y0 + y1 + 1) / 2) * T;
  for (let i = 0; i < N; i++) {
    const X = Math.round(L + ((i + 0.5) / N) * (R - L)), Y = Math.round(mid + (i % 2 ? 9 : -9) + (hash2(i, 3, 91) - 0.5) * 4);
    const rx = 7 + Math.floor(hash2(i, 5, 93) * 3), ry = 5 + Math.floor(hash2(i, 7, 95) * 2);
    /* ripples downstream (south), broken arcs */
    for (const k of [1, 2]) for (let dx = -rx - 2 * k; dx <= rx + 2 * k; dx++) if (hash2(X + dx, k, 97) > 0.35) put(X + dx, Y + ry + 3 * k + Math.round((dx / (rx + 2 * k)) ** 2 * -2), '#4f7a80');
    for (let dy = -ry - 1; dy <= ry + 2; dy++) for (let dx = -rx - 2; dx <= rx + 2; dx++) {
      const e = (dx / (rx + 0.5)) ** 2 + (dy / (ry + 0.5)) ** 2, base = (dx / (rx + 2)) ** 2 + ((dy - 1.5) / (ry + 1.5)) ** 2;
      if (e <= 1) put(X + dx, Y + dy, dy <= -ry + 2 && dx <= 1 ? '#8a867d' : (dy <= -ry + 3 && dx <= rx - 2) ? '#6a6865' : dy >= ry - 1 ? '#3a3a3e' : '#4f4e52');
      else if (base <= 1) put(X + dx, Y + dy, dy > 0 ? '#17141a' : '#231d1f');
    }
  }
  return N;
}

/** The bridge (G cells across one row band): a dark beam along its north and south edges with a post every 16 px; where a run of deck
    meets water in the same rows (the broken span) its boards end ragged over the gap, and four planks lie in the stream below it, a
    dark waterline along each. */
export function bridgeDeck(g, grid) {
  const h = grid.length, w = grid[0].length, G = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'G';
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data.set(rgb(c), (y * g.width + x) * 4); };
  let beams = 0, ends = 0, planks = 0;
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    if (!G(cx, cy)) continue;
    /* the beams: north edge (no deck above) and south edge (no deck below) */
    for (const [edge, y0] of [[!G(cx, cy - 1), cy * T], [!G(cx, cy + 1), cy * T + T - 4]]) {
      if (!edge) continue;
      for (let x = cx * T; x < cx * T + T; x++) { put(x, y0, '#553a26'); put(x, y0 + 1, '#3d2a1d'); put(x, y0 + 2, '#3d2a1d'); put(x, y0 + 3, '#17141a'); beams++; if (x % 16 === 4) for (let d = 0; d < 4; d++) { put(x, y0 + d, '#2a1c14'); put(x + 1, y0 + d, '#6e4c30'); } }
    }
    /* the broken ends: deck that stops on water in its own row */
    for (const dir of [1, -1]) {
      const nx = cx + dir; if (nx < 0 || nx >= w || grid[cy][nx] !== 'Q') continue;
      const xe = dir > 0 ? cx * T + T : cx * T - 1;
      for (let y = cy * T; y < cy * T + T; y += 4) {
        const len = 2 + Math.floor(hash2(cx, y, 31) * 9), snap = hash2(cx, y, 37) > 0.7;
        for (let r = 0; r < 3; r++) for (let d = 0; d < len - (r === 2 ? 2 : 0); d++) put(xe + dir * d, y + r, r === 0 ? '#6e4c30' : r === 1 ? '#553a26' : '#2a1c14');
        if (snap) { put(xe + dir * len, y, '#6e4c30'); put(xe + dir * (len + 1), y + 1, '#553a26'); }
        put(xe + dir * len, y + 2, '#17141a'); ends++;
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
