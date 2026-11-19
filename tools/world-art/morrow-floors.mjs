// ════════════════════════════════════════════════════════════════════════
// tools/world-art/morrow-floors.mjs — TWO OF CARTER'S REST'S FLOORS OF THEIR OWN (lane/b-morrow-kit, 2026-11-19).
//
// The first paint gave the brewhouse the cellar's own stone a step lighter and the stable a brown earth: neither said what the room was.
//   brewBricks   the brewhouse is laid in brick (running bond, 10x5 px bricks seen from above, each lit along its top and left, the
//                mortar dark), wet: damp patches a step down, water standing in the low joints, and a gutter down the floor's middle
//                to an iron drain grate, so the wort the kettles spill runs off.
//   stableStraw  the stable is straw over earth: stalls along its north wall (low plank partitions, a lit top rail, a post at each
//                end) bedded deep in straw, the aisle trodden thin. Straw is short strands on the diagonal, lit at one end.
// Both stay dim (art/briefs/morrow-hills-art-rules.txt 1): bodies 0.03-0.05, lit edges under the floor cap (0.12). Pixels by rule on
// hr-world-56-v2, nothing scaled. A doorway's cells keep the floor they had (their threshold is the sill, morrow-roofs.mjs sills).
// mutant-anchors: none — an import tool; tests/world-assets.mjs judges what it writes
// ════════════════════════════════════════════════════════════════════════
import { hash2, noise } from './ground-finish.mjs';

const T = 32;
const rgb = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
const put = (g, x, y, h) => { if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data.set(rgb(h), (y * g.width + x) * 4); };
const cellsOf = (grid, ch, doorway) => { const out = []; for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) if (grid[y][x] === ch && !doorway(x, y)) out.push([x, y]); return out; };

/** The brewhouse's wet brick floor and its drain. */
export function brewBricks(g, grid, doorway, ch = 'F', seed = 131) {
  const cells = cellsOf(grid, ch, doorway); if (!cells.length) return { bricks: 0, drain: 0 };
  const on = new Set(cells.map(([x, y]) => x + ',' + y)), is = (px, py) => on.has(Math.floor(px / T) + ',' + Math.floor(py / T));
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1; for (const [x, y] of cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const gx = Math.round(x0 * T + ((x1 + 1 - x0) * T) * 0.64), grateY = (y1 + 1) * T - 44;
  const gxAt = (py) => gx + Math.round((noise(0, py, 70, seed + 9) - 0.5) * 14), cover = (py) => [0.3, 0.62].some((f) => Math.abs(py - (y0 * T + (grateY - y0 * T) * f)) < 6);
  const BODY = ['#3d2a1d', '#4a2e18', '#3d2a1d', '#2f2723'], WET = { '#3d2a1d': '#2a1c14', '#4a2e18': '#2a1c14', '#2f2723': '#231d1f', '#553a26': '#3d2a1d' };
  let bricks = 0, drain = 0;
  for (let py = y0 * T; py < (y1 + 1) * T; py++) for (let px = x0 * T; px < (x1 + 1) * T; px++) {
    if (!is(px, py)) continue;
    const row = Math.floor(py / 5), r = py - row * 5, off = row % 2 ? 5 : 0, j = Math.floor((px + off) / 10), c = (px + off) - j * 10;
    let col = r === 4 || c === 9 ? '#17141a' : BODY[Math.floor(hash2(j, row, seed) * BODY.length)];
    if (r === 0 && c < 9) col = hash2(j, row, seed + 1) < 0.7 ? '#553a26' : col;
    else if (c === 0 && r < 4) col = '#553a26';
    /* wet: damp blobs a step down, water standing in the joints inside them */
    const damp = noise(px * 1.1 + 17, py * 0.9, 41, seed + 12);
    if (damp > 0.6) col = WET[col] || col;
    /* the gutter: 6 px down the middle from the north wall to the grate, its west lip lit, water along its floor */
    const dx = px - gxAt(py);
    if (py < grateY && Math.abs(dx + 0.5) <= 3) {
      /* the channel: a lit lip on its west (upper-left) side, a dark one east, wet in its bed; a flat cover stone over it twice */
      col = cover(py) ? (Math.abs(dx + 0.5) === 2.5 || Math.abs(py - Math.round(py / 1)) ? (dx === -3 ? '#6a6865' : '#4f4e52') : '#4f4e52') : dx === -3 ? '#553a26' : dx === 2 ? '#17141a' : Math.abs(dx + 0.5) <= 1 ? '#1a2c44' : '#231d1f';
      drain++;
    }
    put(g, px, py, col); bricks++;
  }
  /* the drain grate: iron bars over the dark, a lit rim on its top and left */
  for (let v = 0; v < 14; v++) for (let u = 0; u < 22; u++) {
    const x = gxAt(grateY) - 11 + u, y = grateY + v;
    const rim = u === 0 || v === 0 || u === 21 || v === 13, lit = (u === 1 || v === 1) && !rim;
    put(g, x, y, rim ? '#0b0a0c' : lit ? '#4a4d54' : u % 4 === 2 ? '#2c2e33' : '#0b0a0c'); drain++;
  }
  return { bricks, drain };
}

/** The stable's straw: stalls bedded along the north wall, the aisle trodden thin. */
export function stableStraw(g, grid, doorway, ch = 'S', seed = 137) {
  const cells = cellsOf(grid, ch, doorway); if (!cells.length) return { strands: 0, stalls: 0 };
  const on = new Set(cells.map(([x, y]) => x + ',' + y)), is = (px, py) => on.has(Math.floor(px / T) + ',' + Math.floor(py / T));
  let x0 = Infinity, x1 = -1, y0 = Infinity; for (const [x, y] of cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
  const SX0 = x0 * T, SY0 = y0 * T, STALL_D = 52, STALL_W = 58;   /* each stall 58 px wide, 52 deep from the north wall */
  const nStall = Math.floor(((x1 - x0 + 1) * T - 20) / STALL_W);
  let strands = 0, stalls = 0;
  /* the straw: strands 3-5 px on the diagonal, the dark of each at its foot, its tip lit; deep bedding in the stalls, thin in the aisle */
  for (let gy = SY0; gy < g.height; gy += 3) for (let gx = SX0; gx < (x1 + 1) * T; gx += 3) {
    const px = gx + Math.floor(hash2(gx, gy, seed) * 3), py = gy + Math.floor(hash2(gx, gy, seed + 1) * 3);
    if (!is(px, py) || !is(px + 4, py + 4)) continue;
    const inStall = py - SY0 < STALL_D && px - SX0 < nStall * STALL_W, keep = inStall ? 0.75 : 0.22 * (0.5 + noise(px, py, 30, seed + 2));
    if (hash2(gx, gy, seed + 3) > keep) continue;
    const len = 3 + Math.floor(hash2(gx, gy, seed + 4) * 3), dir = hash2(gx, gy, seed + 5) < 0.5 ? 1 : -1, bright = inStall && hash2(gx, gy, seed + 6) < 0.35;
    for (let t = 0; t < len; t++) put(g, px + t, py + (dir > 0 ? Math.floor(t / 2) : -Math.floor(t / 2)), t === len - 1 ? (bright ? '#8a6440' : '#6e4c30') : t === 0 ? '#2a1c14' : bright ? '#6e4c30' : '#553a26');
    strands++;
  }
  /* the stalls' partitions: a plank wall running south from the north wall, its top rail lit on the west, shaded on the east, a post
     at its foot with its south face showing */
  for (let k = 1; k <= nStall; k++) {
    const x = SX0 + 10 + k * STALL_W - 3;
    if (k === nStall && x > (x1 + 1) * T - 8) continue;
    for (let y = SY0; y < SY0 + STALL_D; y++) { put(g, x - 1, y, '#0b0a0c'); put(g, x, y, '#6e4c30'); put(g, x + 1, y, '#553a26'); put(g, x + 2, y, '#3d2a1d'); put(g, x + 3, y, '#0b0a0c'); if ((y - SY0) % 9 === 8) { put(g, x, y, '#3d2a1d'); put(g, x + 1, y, '#2a1c14'); } }
    for (let v = 0; v < 8; v++) for (let u = -2; u <= 4; u++) put(g, x + u, SY0 + STALL_D + v, u === -2 || u === 4 || v === 7 ? '#0b0a0c' : v < 2 ? (u < 1 ? '#8a6440' : '#6e4c30') : u < 1 ? '#553a26' : '#3d2a1d');
    stalls++;
  }
  return { strands, stalls };
}
