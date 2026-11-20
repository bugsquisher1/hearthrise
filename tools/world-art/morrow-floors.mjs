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
  /* the open drain wanders (b5: "a dead-straight pipe"), its width 4-8 px, one cover stone */
  const gxAt = (py) => gx + Math.round((noise(0, py, 60, seed + 9) - 0.5) * 44 + (noise(0, py, 13, seed + 10) - 0.5) * 6), cover = (py) => Math.abs(py - (y0 * T + (grateY - y0 * T) * 0.55)) < 6;
  const half = (py) => 2 + Math.round(2.4 * noise(0, py, 30, seed + 11));
  const BODY = ['#3d2a1d', '#4a2e18', '#3d2a1d', '#2f2723'], WET = { '#3d2a1d': '#2a1c14', '#4a2e18': '#2a1c14', '#2f2723': '#231d1f', '#553a26': '#3d2a1d' };
  let bricks = 0, drain = 0;
  for (let py = y0 * T; py < (y1 + 1) * T; py++) for (let px = x0 * T; px < (x1 + 1) * T; px++) {
    if (!is(px, py)) continue;
    /* b5 (CR): running-bond brick read as a wall laid flat; the floor is worn FLAGS, each stone its own size (a jittered lattice of
       about 15 px, warped), its own tone, the joints dark */
    const wx = px + (noise(px, py, 11, seed + 40) - 0.5) * 7, wy = py + (noise(px, py, 11, seed + 41) - 0.5) * 7, S = 15, gx0 = Math.floor(wx / S), gy0 = Math.floor(wy / S);
    let d1 = 1e9, d2 = 1e9, sid = 0, cx = 0, cy = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const sx = (gx0 + a + 0.15 + hash2(gx0 + a, gy0 + b, seed + 42) * 0.7) * S, sy = (gy0 + b + 0.15 + hash2(gx0 + a, gy0 + b, seed + 43) * 0.7) * S, d = Math.hypot(wx - sx, wy - sy); if (d < d1) { d2 = d1; d1 = d; sid = (gx0 + a) * 131 + gy0 + b; cx = sx; cy = sy; } else if (d < d2) d2 = d; }
    /* b7 (CR) ranked 4: the brown flags stood evenly scattered and warm; the floor is grey stone, the brown ones only where the wort
       has soaked in over the years (a slow field over the stones' centres), most of those the dull warm grey, a few the earth brown */
    const soak = noise(cx, cy, 70, seed + 50), pick = hash2(sid, 1, seed + 44);
    const FLAG = soak > 0.66 ? (pick < 0.4 ? '#3d2a1d' : '#2f2723') : soak > 0.56 ? (pick < 0.5 ? '#2f2723' : pick < 0.8 ? '#2c2e33' : '#3a3a3e') : (pick < 0.5 ? '#3a3a3e' : pick < 0.93 ? '#2c2e33' : '#231d1f');
    let col = d2 - d1 < 1.3 ? '#17141a' : FLAG;
    if (d2 - d1 < 2.4 && d2 - d1 >= 1.3 && hash2(px, py, seed + 45) > 0.5) col = '#231d1f';
    /* wet: stains of every size (two scales), a step down, water standing in the joints inside them */
    const damp = Math.max(noise(px * 1.1 + 17, py * 0.9, 41, seed + 12), noise(px, py, 13, seed + 46) - 0.06);
    if (damp > 0.63) col = WET[col] || ({ '#3a3a3e': '#2c2e33', '#4f4e52': '#3a3a3e', '#2c2e33': '#231d1f', '#17141a': '#0b0a0c' })[col] || col;
    /* the gutter: 6 px down the middle from the north wall to the grate, its west lip lit, water along its floor */
    const dx = px - gxAt(py);
    if (py < grateY && Math.abs(dx + 0.5) <= half(py) + 0.5) {
      /* the channel: a lit lip on its west (upper-left) side, a dark one east, wet in its bed; a flat cover stone over it twice */
      const hw = half(py); col = cover(py) ? (dx === -hw - 1 ? '#6a6865' : '#4f4e52') : dx <= -hw ? '#3a3a3e' : dx >= hw ? '#17141a' : Math.abs(dx + 0.5) <= hw - 2 ? (noise(px, py, 5, seed + 13) > 0.55 ? '#1a2c44' : '#17141a') : '#231d1f';
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
    /* b5: the partitions read as 1 px lines at x1: a plank wall 6 px across, its top rail lit, its east side in shade, plank joints */
    for (let y = SY0; y < SY0 + STALL_D; y++) { put(g, x - 2, y, '#0b0a0c'); put(g, x - 1, y, '#8a6440'); put(g, x, y, '#6e4c30'); put(g, x + 1, y, '#6e4c30'); put(g, x + 2, y, '#553a26'); put(g, x + 3, y, '#3d2a1d'); put(g, x + 4, y, '#2a1c14'); put(g, x + 5, y, '#0b0a0c'); if ((y - SY0) % 9 === 8) { put(g, x + 1, y, '#3d2a1d'); put(g, x + 2, y, '#2a1c14'); } }
    for (let v = 0; v < 8; v++) for (let u = -2; u <= 4; u++) put(g, x + u, SY0 + STALL_D + v, u === -2 || u === 4 || v === 7 ? '#0b0a0c' : v < 2 ? (u < 1 ? '#8a6440' : '#6e4c30') : u < 1 ? '#553a26' : '#3d2a1d');
    stalls++;
  }
  return { strands, stalls };
}
