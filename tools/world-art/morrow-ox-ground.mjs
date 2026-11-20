// ════════════════════════════════════════════════════════════════════════
// tools/world-art/morrow-ox-ground.mjs — THE OX ROAD'S MOOR, WATER AND GROUND STORY (lane/b-morrow-kit, 2026-11-19, batch 6 after the
// b5 whole-map review's ranked list 1-5). Used by morrow-grounds.mjs on the Ox Road only (Carter's Rest never calls it).
//
//   oxMoor   the moor a step darker and clear; a few large bogs by the stream and in the pockets; three kinds of moor decal by rule
//   oxWater  the stream's depth from its bank, a lit lip, a shore band; the ford a gravel bar under shallow water with wet stones
//   oxStory  the ground's story under the wrecks: the slewed wagon's gouge, ore spilled to the dropped heap, the lost wheel's track,
//            hoof scuffs where the teams stood and fell, ruts that braid round the wrecks
//   oxDeck   the bridge's two abutments drawn plank by plank (no fill motif), the deck's thickness and its piles, the broken span's
//            stringers snapped over the gap, two pile stumps standing in it
// Every pixel is a palette colour. mutant-anchors: none — an import tool; tests/world-assets.mjs judges what it writes
// ════════════════════════════════════════════════════════════════════════
import { hash2, noise } from './ground-finish.mjs';
import { RAMPS } from './palette.mjs';

const T = 32;
const rgb = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
const hexAt = (im, p) => '#' + [0, 1, 2].map((k) => im.data[p + k].toString(16).padStart(2, '0')).join('');
const px = (g, x, y) => hexAt(g, (y * g.width + x) * 4);
const pt = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data.set(rgb(c), (y * g.width + x) * 4); };
const RAMP_OF = new Map(); for (const [name, ramp] of Object.entries(RAMPS)) ramp.forEach((c, k) => RAMP_OF.set(c, { name, k }));
const stepC = (hx, d) => { const a = RAMP_OF.get(hx); if (!a) return hx; const r = RAMPS[a.name]; return r[Math.max(0, Math.min(r.length - 1, a.k + d))]; };
/** Each cell's distance in cells (8-way) to the nearest cell whose paint char is in `of`. */
function cellDist(grid, of) {
  const h = grid.length, w = grid[0].length, d = Array.from({ length: h }, () => new Array(w).fill(99)), q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (of.includes(grid[y][x])) { d[y][x] = 0; q.push([x, y]); }
  while (q.length) { const [x, y] = q.shift(); for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const X = x + a, Y = y + b; if (X < 0 || Y < 0 || X >= w || Y >= h || d[Y][X] <= d[y][x] + 1) continue; d[Y][X] = d[y][x] + 1; q.push([X, Y]); } }
  return d;
}
/** A pixel distance transform (chamfer, px) of `inside` (1 = in) to the nearest outside pixel, capped at `cap`. */
function pxDist(W, H, inside, cap = 64) {
  const D = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) D[p] = inside[p] ? cap : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!D[p]) continue; let v = D[p];
    if (x > 0) v = Math.min(v, D[p - 1] + 1); if (y > 0) { v = Math.min(v, D[p - W] + 1); if (x > 0) v = Math.min(v, D[p - W - 1] + 1.414); if (x < W - 1) v = Math.min(v, D[p - W + 1] + 1.414); } D[p] = v; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const p = y * W + x; if (!D[p]) continue; let v = D[p];
    if (x < W - 1) v = Math.min(v, D[p + 1] + 1); if (y < H - 1) { v = Math.min(v, D[p + W] + 1); if (x < W - 1) v = Math.min(v, D[p + W + 1] + 1.414); if (x > 0) v = Math.min(v, D[p + W - 1] + 1.414); } D[p] = v; }
  return D;
}

/* ── THE MOOR (b5 ranked 1, then b6: "evenly scattered peat blobs ... camouflage"; "saturated red specks"). The fill's sprigs (its one
   orange tuft on a 32 px repeat) become grass and the grass goes a step darker, its old middle green kept as the lit grain. The open moor
   stays clear: no drifts, no scattered peat. The wet ground gathers instead in a FEW LARGE BOGS (OX_BOGS) that follow the stream's banks
   or sit in the pockets: black pools with a sky glint on the far rim, tussocks lit on top, rushes by the water, wet peat between, and a
   fringe of dead heather (the peat's browns, never the cloth ramp) where a bog gives way to the grass. ── */
const MOOR_LOOK = Object.freeze({ decalEvery: 12, decalGap: 70 });
/* [cell x, cell y, rx px, ry px]: the west bank north of the bridge, the east bank by the ford, the west bank south of it; pockets 2, 3, 5 */
const OX_BOGS = Object.freeze([[44.2, 9.5, 64, 150], [51.5, 30, 56, 96], [44.6, 35.5, 52, 84], [26.5, 31.6, 104, 66], [40, 32.2, 150, 58], [31.4, 10.4, 92, 62]]);
const LEAFS = new Set(RAMPS.leaf.concat(RAMPS.moss));
const EARTHS2 = new Set(RAMPS.earth.concat(RAMPS.bronze));
const SPRIG = new Set(['#8a6440', '#6e4c30', '#553a26', '#4a2e18', '#3d2a1d', '#2a1c14', '#a88457', '#7a4f26']);
export function oxMoor(g, grid, { skip = () => false } = {}) {
  const h = grid.length, w = grid[0].length, W = g.width, H = g.height;
  const cell = (x, y) => grid[Math.min(h - 1, y >> 5)][Math.min(w - 1, x >> 5)];
  /* how far (px) a pixel is from the road, the bridge and the turnout (a bog may reach the water, never the road) */
  const clear = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = cell(x, y); clear[y * W + x] = 'RGE'.includes(c) ? 0 : 1; }
  const FAR = pxDist(W, H, clear, 99), far = (x, y) => FAR[y * W + x];
  const moorCell = (x, y) => { const c = cell(x, y); return c === 'H' || c === 'J'; };
  /* a bog reaches the stream's real bank (the moor the seam left inside the water's cells), never stopping on a cell line */
  const boggy = (x, y) => moorCell(x, y) || ('QV'.includes(cell(x, y)) && LEAFS.has(px(g, x, y)));
  /* how deep into a bog a pixel is: > 0 inside, its edge wandering on two scales */
  /* each bog a cluster of lobes strung along its long axis, each lobe its own size, so no bog is an ellipse or a box */
  const LOBES = OX_BOGS.flatMap(([cx, cy, rx, ry], b) => Array.from({ length: 4 }, (_, i) => { const t = (i / 3 - 0.5) * 1.3, j = hash2(b, i, 657); return [cx * T + (rx > ry ? t * rx : (j - 0.5) * rx * 0.6), cy * T + (rx > ry ? (j - 0.5) * ry * 0.6 : t * ry), Math.min(rx, ry) * (0.75 + 0.5 * hash2(b, i, 659))]; }));
  const bog = (x, y) => { let m = -9; for (const [cx, cy, r] of LOBES) { const e = 1 - ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); if (e > m) m = e; } m += (noise(x, y, 40, 661) - 0.5) * 1.5 + (noise(x, y, 16, 662) - 0.5) * 0.6 + (noise(x, y, 6, 663) - 0.5) * 0.25; return far(x, y) < 30 ? Math.min(m, (far(x, y) - 30) / 24 + (noise(x, y, 11, 664) - 0.5) * 0.9) : m; };
  const pool = (x, y) => bog(x, y) > 0.35 && noise(x + 7 * (noise(x, y, 20, 665) - 0.5), y, 8, 667) > 0.72;
  const tussock = (x, y) => noise(x, y, 3.4, 669) > 0.72;
  let darker = 0, bogged = 0, fringe = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = px(g, x, y), cc = cell(x, y);
    /* the path's own trodden pixels are redrawn later (oxPath); inside a bog they become bog now, so no cell line of them survives */
    if (!(moorCell(x, y) || boggy(x, y)) || (cc === 'J' && !LEAFS.has(c) && bog(x, y) <= 0.06) || (!moorCell(x, y) && bog(x, y) <= 0.06)) { if (LEAFS.has(c) && cc !== 'K') { const to = c === '#1f3322' ? (noise(x, y, 3.1, 621) > 0.62 ? '#1f3322' : '#16241a') : stepC(c, -1); if (to !== c) { pt(g, x, y, to); darker++; } } continue; }
    const b = bog(x, y);
    if (b > 0.06) {
      let col;
      if (pool(x, y)) col = !pool(x, y - 1) ? (hash2(x, y, 671) > 0.4 ? '#3a4652' : '#2c2e33') : !pool(x, y + 1) ? '#231d1f' : noise(x, y, 4, 673) > 0.8 ? '#1a2c44' : '#17141a';
      else if (tussock(x, y)) col = !tussock(x, y - 1) ? (hash2(x, y, 675) > 0.4 ? '#2c4a2c' : '#1f3322') : !tussock(x, y + 1) ? '#16241a' : '#1f3322';
      else if (pool(x, y - 1) || pool(x, y - 2)) col = '#17141a';
      /* the wet peat: one calm dark ground, a fine grain, a lighter crumb here and there (b6: the scatter read as camouflage) */
      else col = noise(x, y, 7, 676) > 0.66 && hash2(x, y, 677) > 0.6 ? '#3d2a1d' : noise(x, y, 2.4, 679) > 0.62 ? '#231d1f' : '#2a1c14';
      pt(g, x, y, col); bogged++; continue;
    }
    if (b > -0.12) {
      /* the fringe: dead heather sprigs in the grass, thinning out */
      const p = (b + 0.12) / 0.18;
      if (noise(x, y, 4.5, 681) < 0.42 + 0.35 * p) { const tip = noise(x, y - 1, 4.5, 681) >= 0.42 + 0.35 * p; pt(g, x, y, tip ? '#3d2a1d' : '#2a1c14'); fringe++; continue; }
    }
    if (LEAFS.has(c) || SPRIG.has(c)) {
      const grain = noise(x, y, 3.1, 621) > 0.62;
      const to = c === '#2c4a2c' || c === '#3d6234' || c === '#557a3e' ? (grain ? '#1f3322' : '#16241a') : c === '#4a5a2a' || c === '#6b7a38' ? '#1f3322'
        : grain && c === '#1f3322' ? '#1f3322' : '#16241a';
      if (to !== c) { pt(g, x, y, to); darker++; }
    }
  }
  /* rushes stand where a bog's pools meet its peat: strokes 3-6 px, a brown seed tip */
  let rushes = 0;
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(hash2(i, 1, 683) * W), y = Math.floor(hash2(i, 2, 685) * H);
    if (!moorCell(x, y) || bog(x, y) < 0.1 || pool(x, y) || !(pool(x, y + 2) || pool(x + 2, y) || pool(x - 2, y))) continue;
    const ht = 3 + Math.floor(hash2(i, 3, 687) * 4), lean = hash2(i, 4, 689) > 0.5 ? 1 : -1;
    for (let t = 0; t < ht; t++) pt(g, x + (t > ht * 0.6 ? lean : 0), y - t, t === ht - 1 ? '#3d2a1d' : t < 2 ? '#1f3322' : '#2c4a2c');
    rushes++;
  }
  return { darker, bogged, fringe, rushes, bogAt: bog, ...moorDecals(g, grid, far, skip, (x, y) => bog(x, y) > -0.15) };
}
/* ── MOOR DECALS (ART_DIRECTION 5: at least one per 12 floor tiles, never on a grid, never two of the same kind side by side): four
   kinds drawn by rule in palette colours under the floor's limit, off the bogs: STONES half sunk in the grass (2-4, lit upper left, a
   dark foot), DEAD BRACKEN (curled fronds in a fan), an OLD OX SKULL (weathered grey, horn cores out: the road has killed oxen before). ── */
const DECAL_KINDS = ['stones', 'bracken', 'stones', 'bracken', 'skull'];
function moorDecals(g, grid, far, skip, isPeat) {
  const W = g.width, H = g.height, placed = [], count = {};
  let cells = 0; for (const r of grid) for (const ch of r) if (ch === 'H') cells++;
  const want = Math.round(cells / MOOR_LOOK.decalEvery);
  for (let i = 0; i < want * 14 && placed.length < want; i++) {
    const x = 8 + Math.floor(hash2(i, 1, 701) * (W - 16)), y = 8 + Math.floor(hash2(i, 2, 703) * (H - 16));
    if (!'HJ'.includes(grid[y >> 5][x >> 5]) || far(x, y) < 12 || skip(x >> 5, y >> 5) || isPeat(x, y)) continue;
    let nearest = null, nd = 1e9; for (const d of placed) { const e = Math.hypot(d.x - x, d.y - y); if (e < nd) { nd = e; nearest = d; } }
    if (nd < MOOR_LOOK.decalGap) continue;
    let k = DECAL_KINDS[Math.floor(hash2(i, 3, 705) * DECAL_KINDS.length)];
    if (k === 'skull' && (count.skull || 0) >= 3) k = 'bracken';
    if (nearest && nearest.k === k) k = { stones: 'bracken', bracken: 'stones', skull: 'stones' }[k];
    ({ stones: dStones, bracken: dBracken, skull: dSkull })[k](g, x, y, i);
    placed.push({ x, y, k }); count[k] = (count[k] || 0) + 1;
  }
  return { decalKinds: count, moorDecals: placed.length };
}
function dStones(g, X, Y, i) {
  const n = 2 + Math.floor(hash2(i, 9, 711) * 3);
  for (let s = 0; s < n; s++) {
    const cx = X + Math.round((hash2(i, 10 + s, 713) - 0.5) * 14), cy = Y + Math.round((hash2(i, 20 + s, 715) - 0.5) * 8), rx = 1.5 + hash2(i, 30 + s, 717) * 2.6, ry = rx * (0.6 + hash2(i, 40 + s, 719) * 0.3);
    for (let b = -4; b <= 4; b++) for (let a = -5; a <= 5; a++) {
      if ((a / rx) ** 2 + (b / ry) ** 2 + (hash2(cx + a, cy + b, 721) - 0.5) * 0.35 > 1) continue;
      pt(g, cx + a, cy + b, a + b < -rx * 0.55 ? '#4f4e52' : b > ry * 0.45 ? '#2c2e33' : '#3a3a3e');
    }
    for (let a = -Math.ceil(rx) + 1; a <= Math.ceil(rx); a++) pt(g, cx + a, cy + Math.ceil(ry) + 1, '#0b0a0c');
    pt(g, cx + Math.ceil(rx) + 1, cy + 1, '#17141a');
    for (let a = -Math.ceil(rx); a <= Math.ceil(rx); a += 2) if (hash2(cx + a, cy, 723) > 0.55) pt(g, cx + a, cy + Math.ceil(ry), '#1f3322');
  }
}
function dBracken(g, X, Y, i) {
  const n = 3 + Math.floor(hash2(i, 9, 741) * 3);
  for (let f = 0; f < n; f++) {
    const a0 = -2.6 + (f / (n - 1)) * 2.1 + (hash2(i, 10 + f, 743) - 0.5) * 0.3, L = 5 + Math.floor(hash2(i, 20 + f, 745) * 4), curl = (f < n / 2 ? -1 : 1) * 0.12;
    let x = X, y = Y, a = a0;
    for (let s = 0; s < L; s++) {
      x += Math.cos(a); y += Math.sin(a) * 0.8; a += curl * (s > L * 0.6 ? 2.5 : 1);
      const ix = Math.round(x), iy = Math.round(y);
      pt(g, ix, iy, s === L - 1 ? '#2a1c14' : s < 2 ? '#3d2a1d' : '#553a26');
      if (s > 1 && s < L - 1 && s % 2 === 0) pt(g, ix + (Math.sin(a) > 0 ? -1 : 1), iy + 1, '#3d2a1d');
    }
  }
  pt(g, X, Y + 1, '#17141a');
}
function dSkull(g, X, Y) {
  const rows = ['h.......h', 'hh.....hh', '.hhSSSShh', '..SSSSS..', '..SoSoS..', '..SSSSS..', '...SSS...', '...SdS...', '....S....'];
  for (let b = 0; b < rows.length; b++) for (let a = 0; a < rows[b].length; a++) {
    const ch = rows[b][a]; if (ch === '.') continue;
    pt(g, X - 4 + a, Y - 4 + b, ch === 'o' || ch === 'd' ? '#0b0a0c' : ch === 'h' ? (a < 4 ? '#3a3a3e' : '#2c2e33') : a + b < 6 ? '#4f4e52' : '#3a3a3e');
  }
  for (let a = -1; a < 3; a++) pt(g, X + a, Y + 6, '#17141a');
}

/* ── THE WATER (ranked 2: "no shore band, no lit lip, no depth; the ford a teal rectangle, its stones identical UI dots"). The water is
   found by its colours in and beside its cells and given DEPTH by its distance from the bank: a lit lip on the edge (brighter where
   the bank is above or to the left of it), a shallow shelf, the channel a step down, the deep middle two; current streaks downstream,
   broken. On the land a SHORE BAND: wet black at the waterline, then peat mud, ragged. The FORD is a gravel bar under shallow water:
   pebbles seen through it, a dozen irregular wet stones, each with a pillow of water on its upstream face and a broken wake below,
   the bar fading into the pool above and below. No teal: steel, iron, stone and shadow. ── */
const LAND = new Set(RAMPS.leaf.concat(RAMPS.moss, RAMPS.earth, RAMPS.bronze));
const WATERS = new Set(['#2c2e33', '#2e4a52', '#3a4652', '#5c6c7a', '#4f7a80', '#86b4b4', '#c8e6e0', '#1a2c44', '#2b4a6a']);
export function oxWater(g, grid) {
  const h = grid.length, w = grid[0].length, W = g.width, H = g.height;
  const cell = (x, y) => grid[Math.min(h - 1, Math.max(0, y >> 5))][Math.min(w - 1, Math.max(0, x >> 5))];
  const near = cellDist(grid, 'QV');
  const wet = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = cell(x, y), n = near[y >> 5][x >> 5]; if (c === 'G' || n > 1) continue;
    const hx = px(g, x, y);
    /* the ford's cells are wet where the bank's seam left them water, never a straight cell edge */
    if ((c === 'V' && !LAND.has(hx)) || (WATERS.has(hx) && (c === 'Q' || n === 1))) wet[y * W + x] = 1;
  }
  /* b6: the ford's sides were a straight vertical edge (its cells reach bank to bank): within 14 px of either side the bank wanders in
     and out on two scales, the moor carried over from beside it */
  { let vx0 = w, vx1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === 'V') { vx0 = Math.min(vx0, x); vx1 = Math.max(vx1, x); }
    if (vx1 >= 0) for (let y = 0; y < H; y++) for (let x = vx0 * T; x < (vx1 + 1) * T; x++) {
      if (cell(x, y) !== 'V') continue;
      const dl = x - vx0 * T, dr = (vx1 + 1) * T - 1 - x, e = Math.min(dl, dr), bite = 13 * noise(x * 0.4, y, 22, 873) + 4 * (noise(x, y, 6, 875) - 0.5);
      if (e < bite) { wet[y * W + x] = 0; const sx = dl < dr ? vx0 * T - 4 - (dl % 8) : (vx1 + 1) * T + 3 + (dr % 8); g.data.set(g.data.subarray((y * W + sx) * 4, (y * W + sx) * 4 + 4), (y * W + x) * 4); }
    } }
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x, n = wet[p - 1] + wet[p + 1] + wet[p - W] + wet[p + W];
    if (wet[p] && n < 2) wet[p] = 0; else if (!wet[p] && n >= 3 && cell(x, y) !== 'G') wet[p] = 1;
  }
  /* the depth is measured from the banks, not the bridge: the deck stands over the water, which runs on under it */
  const deepIn = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) deepIn[p] = wet[p] || cell(p % W, (p / W) | 0) === 'G' ? 1 : 0;
  const D = pxDist(W, H, deepIn, 80), dry = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) dry[p] = wet[p] ? 0 : 1;
  const L = pxDist(W, H, dry, 12);
  let fy0 = h, fy1 = -1, fx0 = w, fx1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === 'V') { fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y); fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); }
  const fordT = (x, y) => { if (fy1 < 0) return 0; const top = fy0 * T, bot = (fy1 + 1) * T, j = 10 * (noise(x, y, 18, 801) - 0.5); const d = y < top ? top - y + j : y > bot ? y - bot + j : 0; return Math.max(0, Math.min(1, 1 - d / 52)); };
  let lip = 0, deep = 0, band = 0, streak = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!wet[p]) {
      /* b6: the band read as a kerb (one width); now 1-9 px on a slow field, in stretches no more than the wet line */
      const c = cell(x, y), sl = noise(x, y, 64, 803), wide = sl < 0.36 ? 1.3 : 1.3 + 8 * ((sl - 0.36) / 0.64) ** 1.3, l = L[p] + (noise(x, y, 5, 804) - 0.5) * 2.4;
      if (c === 'G' || c === 'K' || l > wide || (c === 'R' && l > 2)) continue;
      pt(g, x, y, l < 1.2 ? (hash2(x, y, 806) > 0.2 ? '#17141a' : '#231d1f') : l < wide * 0.6 ? (hash2(x, y, 805) > 0.35 ? '#2a1c14' : '#231d1f') : hash2(x, y, 807) > 0.45 ? '#2a1c14' : hash2(x, y, 808) > 0.5 ? '#3d2a1d' : px(g, x, y)); band++;
      continue;
    }
    /* the bed rises to the ford: its depth falls away smoothly over 52 px above and below it, so the pool shelves up onto the bar */
    const t = fordT(x, y), d = D[p] < 1.5 ? D[p] : Math.max(1.5, D[p] * (1 - 0.88 * t)), edgeN = !deepIn[p - W] || !deepIn[p - 1];
    let col;
    if (d < 1.5) { const on = noise(x, y, 6, 831) > 0.4; col = on ? (edgeN && noise(x, y, 9, 833) > 0.62 ? '#5c6c7a' : '#3a4652') : '#2c2e33'; lip++; }
    else if (d < 3 + 2 * noise(x, y, 11, 809)) col = noise(x, y, 2.2, 811) > 0.55 ? '#3a4652' : '#2c2e33';
    else if (d < 15) col = '#2c2e33';
    /* b6: the deep middle read as tar; the channel is a step under the water beside it, never black */
    else if (d < 22) { col = noise(x, y, 2.6, 813) > 0.62 ? '#231d1f' : '#2c2e33'; deep++; }
    else { col = noise(x, y, 2.6, 813) > 0.3 ? '#231d1f' : '#2c2e33'; deep++; }
    /* over the bar the water breaks: riffles across the current (broken horizontal dashes), a step lighter */
    if (t > 0.5 && d >= 1.5 && noise(x * 0.35, y * 2.2, 6, 817) > 0.7 && hash2(x, y, 819) > 0.3) col = t > 0.85 && hash2(x, y, 820) > 0.85 ? '#5c6c7a' : '#3a4652';
    pt(g, x, y, col);
  }
  for (let i = 0; i < (W * H) / 380; i++) {
    const x = Math.floor(hash2(i, 1, 821) * W), y0 = Math.floor(hash2(i, 2, 823) * H), p = y0 * W + x;
    if (!wet[p] || D[p] < 5 || fordT(x, y0) > 0.3) continue;
    const len = 3 + Math.floor(hash2(i, 3, 825) * 6), sway = hash2(i, 4, 827) > 0.5 ? 1 : 0;
    for (let k = 0; k < len; k++) { const y = y0 + k, xx = x + (k > len / 2 ? sway : 0), q = y * W + xx; if (y >= H || !wet[q] || hash2(xx, y, 829) < 0.18) continue; pt(g, xx, y, stepC(px(g, xx, y), 1)); streak++; }
  }
  /* GLINTS (b6: "the stream needs a surface: stepped glints"): short dashes across the current where the sky catches the ripples, each
     stepped (a two-pixel core a step over its ends), thicker in the channel's middle and in soft runs, never in an even scatter */
  let glints = 0;
  for (let i = 0; i < (W * H) / 260; i++) {
    const x = Math.floor(hash2(i, 5, 891) * W), y = Math.floor(hash2(i, 6, 893) * H), p = y * W + x;
    if (!wet[p] || D[p] < 4 || fordT(x, y) > 0.4 || noise(x, y, 70, 895) < 0.42 || hash2(i, 7, 897) > 0.25 + D[p] / 60) continue;
    const len = 3 + Math.floor(hash2(i, 8, 899) * 5), core = hash2(i, 9, 901) > 0.55;
    for (let k = 0; k < len; k++) { const q = y * W + x + k; if (x + k >= W || !wet[q]) break; pt(g, x + k, y, core && k > 0 && k < len - 1 && k < 3 ? '#5c6c7a' : '#3a4652'); }
    glints++;
  }
  return { lip, deep, band, streak, glints, ...fordGravel(g, wet, D, fordT, fx0, fx1, fy0, fy1) };
}
function fordGravel(g, wet, D, fordT, fx0, fx1, fy0, fy1) {
  if (fy1 < 0) return { pebbles: 0, fordStones: 0 };
  const W = g.width, H = g.height; let pebbles = 0, stones = 0;
  for (let y = (fy0 - 1) * T; y < (fy1 + 2) * T; y += 3) for (let x = (fx0 - 1) * T; x < (fx1 + 2) * T; x += 3) {
    const X = x + Math.floor(hash2(x, y, 841) * 2), Y = y + Math.floor(hash2(x, y, 843) * 2); if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    /* gravel lies in bars (soft fields), thick where the bar is shallowest, a dark gap under each pebble */
    const p = Y * W + X, t = fordT(X, Y), bar = noise(X, Y * 1.6, 22, 846); if (!wet[p] || D[p] < 2 || t < 0.35 || hash2(x, y, 845) > (bar - 0.42) * 1.3 * t) continue;
    const lit = hash2(x, y, 847) > 0.6;
    pt(g, X, Y, lit ? '#4f4e52' : '#3a3a3e'); if (hash2(x, y, 849) > 0.5) pt(g, X + 1, Y, '#3a3a3e'); pt(g, X, Y + 1, '#17141a'); if (hash2(x, y, 850) > 0.5) pt(g, X + 1, Y + 1, '#231d1f'); pebbles++;
  }
  const N = 11, L = fx0 * T - 2, R = (fx1 + 1) * T + 2, top = fy0 * T + 6, bot = (fy1 + 1) * T - 6, used = [];
  for (let i = 0; i < N * 6 && stones < N; i++) {
    const X = Math.round(L + hash2(i, 1, 851) * (R - L)), Y = Math.round(top + hash2(i, 2, 853) * (bot - top));
    const rx = 4 + hash2(i, 3, 855) * 5, ry = rx * (0.5 + hash2(i, 4, 857) * 0.35), lean = (hash2(i, 5, 859) - 0.5) * 0.9;
    if (used.some(([a, b, r]) => Math.hypot(a - X, (b - Y) * 1.4) < r + rx + 4) || !wet[Y * W + X]) continue;
    used.push([X, Y, rx]);
    const inS = (a, b) => { const u = a * Math.cos(lean) + b * Math.sin(lean), v = -a * Math.sin(lean) + b * Math.cos(lean); return (u / rx) ** 2 + (v / ry) ** 2 + (noise(X + a, Y + b, 2.5, 861 + i) - 0.5) * 0.55 <= 1; };
    for (let b = -9; b <= 9; b++) for (let a = -10; a <= 10; a++) {
      if (!inS(a, b)) continue;
      const lit = !inS(a - 1, b - 1) || !inS(a, b - 1), low = b > ry * 0.25;
      pt(g, X + a, Y + b, lit && !low ? '#6a6865' : low ? (b > ry * 0.6 ? '#231d1f' : '#2c2e33') : a + b < -1 ? '#4f4e52' : '#3a3a3e');
    }
    for (let a = -10; a <= 10; a++) {
      let lo = null, hi = null; for (let b = -9; b <= 9; b++) if (inS(a, b)) { if (hi === null) hi = b; lo = b; }
      if (lo === null) continue;
      pt(g, X + a, Y + lo + 1, '#17141a');
      if (hash2(X + a, Y, 863) > 0.3) pt(g, X + a, Y + hi - 1, '#5c6c7a');
      for (const k of [3, 6]) if (Math.abs(a) <= rx + k * 0.4 && hash2(X + a, k, 865) > 0.45) pt(g, X + a, Y + lo + k + Math.round((a / (rx + 2)) ** 2 * 2), k === 3 ? '#5c6c7a' : '#3a4652');
    }
    stones++;
  }
  return { pebbles, fordStones: stones };
}

/* ── THE GROUND'S STORY (ranked 4: "a slew gouge behind the slewed wagon, an ore trail from the broken wagon to the dropped ore, a track
   to the lost wheel, hoof scuffs"). Each mark is drawn from where the props stand in the map row (`objects`), on the road's earth only:
   the SLEWED wagon's tail dragged sideways off the ruts (two short smears, wide and dark, a lit spoil lip on their outer side); ORE
   spilled in lumps from the broken wagon's bed to the heap by the road (iron grey, a dark foot, a rust fleck in some); the LOST WHEEL's
   narrow wobbling track from the broken corner to where it lies; cloven HOOF prints churned where each team went down and strung along
   the crown between them. ── */
export function oxStory(g, grid, objects, { row = 22 } = {}) {
  const h = grid.length, w = grid[0].length, W = g.width;
  const earthy = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= g.height) return false; const c = grid[Math.min(h - 1, y >> 5)][Math.min(w - 1, x >> 5)]; const a = RAMP_OF.get(px(g, x, y)); return (c === 'R') && !!a && (a.name === 'earth' || a.name === 'shadow' || a.name === 'iron' || a.name === 'stone'); };
  const put = (x, y, col) => { if (earthy(x, y)) { pt(g, x, y, col); return 1; } return 0; };
  const of = (id) => objects.filter((o) => o.id === id), mid = (o) => [o.x * T + 32, o.y * T + 31];
  const rut = row * T + 16;
  const bez = (p0, p1, p2, n, f) => { for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; f(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], t); } };
  let gouge = 0, ore = 0, track = 0, hoof = 0;
  /* 1 the slewed wagon's tail dragged south off the ruts: from each rut east of it, a smear curving down under its rear wheels */
  for (const o of of('mh_ore_wagon_slewed')) {
    const [cx] = mid(o);
    for (const [y0, y1, x0] of [[rut - 11, rut + 2, cx + 30], [rut + 11, rut + 22, cx + 26]]) {
      bez([x0 + 16, y0], [x0 + 4, y0 + 1], [x0 - 6, y1], 40, (x, y, t) => {
        const wd = Math.round(1 + 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.15))), X = Math.round(x), Y = Math.round(y);
        for (let k = -wd; k <= wd; k++) gouge += put(X + k, Y, Math.abs(k) === wd ? '#231d1f' : '#17141a');
        gouge += put(X + wd + 1, Y + 1, '#553a26') + put(X + wd + 1, Y, '#3d2a1d');
      });
    }
  }
  /* 2 ore spilled from the broken wagon's bed to the heap by the road: lumps of 1-3 px, thicker at the wagon, along a wandering line */
  const heaps = of('mh_ore_dropped');
  for (const o of of('mh_ore_wagon_broken')) {
    const [cx, cy] = mid(o), heap = heaps.reduce((b, q) => (!b || Math.abs(q.x * T - cx) < Math.abs(b.x * T - cx) ? q : b), null);
    if (heap) {
      const hx = heap.x * T + 16, hy = heap.y * T + 22, sx = cx - 22, sy = cy - 14;
      for (let i = 0; i < 46; i++) {
        const t = hash2(i, 1, 901) ** 1.6, x = Math.round(sx + (hx - sx) * t + (hash2(i, 2, 903) - 0.5) * (10 + 8 * (1 - t))), y = Math.round(sy + (hy - sy) * t + Math.sin(t * 5) * 3 + (hash2(i, 3, 905) - 0.5) * (12 - 6 * t));
        const sz = hash2(i, 4, 907) > 0.7 ? 2 : 1;
        for (let b = 0; b < sz; b++) for (let a = 0; a < sz; a++) ore += put(x + a, y + b, a + b === 0 ? '#6e727a' : '#4a4d54');
        put(x + sz, y + sz - 1, '#0b0a0c'); put(x, y + sz, '#0b0a0c'); if (sz > 1) put(x + 1, y + sz, '#0b0a0c');
        if (hash2(i, 5, 909) > 0.86) put(x + sz - 1, y, '#7a4f26');
      }
    }
    /* 3 the lost wheel's track: a narrow wobbling line from the broken corner to where it lies, its lower edge lit */
    for (const wo of of('mh_lost_wheel')) {
      const wx = wo.x * T + 16, wy = wo.y * T + 22;
      bez([cx + 20, cy - 4], [(cx + 20 + wx) / 2 + 10, cy + 2], [wx - 4, wy - 2], 60, (x, y, t) => {
        if (noise(x, y, 6, 911) < 0.3) return;
        const X = Math.round(x), Y = Math.round(y + Math.sin(t * 13) * 1.2);
        track += put(X, Y, '#231d1f') + put(X, Y + 1, '#2a1c14') + put(X, Y + 2, '#553a26');
      });
    }
  }
  /* 4 hoof prints: churned where each team went down (west of it, where they stood and staggered), strung along the crown between */
  const print = (x, y) => { if (!earthy(x, y) || !earthy(x + 2, y + 2)) return 0; for (const [a, b] of [[0, 0], [0, 1], [2, 0], [2, 1]]) put(x + a, y + b, '#231d1f'); put(x + 1, y + 2, '#553a26'); put(x, y - 1, '#2a1c14'); return 1; };
  for (const id of ['mh_yoked_dead', 'mh_yoked_one']) for (const o of of(id)) {
    const [cx] = mid(o);
    for (let i = 0; i < 26; i++) hoof += print(Math.round(cx - 34 - hash2(i, o.x, 913) * 40), Math.round(rut - 18 + hash2(i, o.x, 915) * 36));
  }
  for (let i = 0; i < 70; i++) { const x = Math.floor(hash2(i, 1, 917) * W), y = Math.round(rut + (hash2(i, 2, 919) - 0.5) * 14); hoof += print(x, y); }
  /* 5 HOLLY'S VIGIL as one place (b6): the ground round her brazier and wood trodden bare, ragged into the grass, ash and charcoal
     crumbs nearest the fire */
  let camp = 0;
  for (const o of of('mh_vigil_brazier')) {
    const fx = o.x * T + 16, fy = o.y * T + 28, cx = fx - 26, cy = fy - 6;
    for (let y = cy - 50; y < cy + 50; y++) for (let x = cx - 96; x < cx + 96; x++) {
      if (x < 0 || y < 0 || x >= W || y >= g.height || !'HR'.includes(grid[Math.min(h - 1, y >> 5)][Math.min(w - 1, x >> 5)])) continue;
      const e = ((x - cx) / 84) ** 2 + ((y - cy) / 40) ** 2 + (noise(x, y, 18, 921) - 0.5) * 0.7 + (noise(x, y, 5, 923) - 0.5) * 0.25; if (e > 1) continue;
      const c = px(g, x, y), a = RAMP_OF.get(c); if (!a || (a.name !== 'leaf' && a.name !== 'moss' && a.name !== 'earth')) continue;
      const ash = Math.hypot(x - fx, (y - fy) * 1.3) < 18 + 6 * noise(x, y, 6, 925);
      pt(g, x, y, ash ? (hash2(x, y, 927) > 0.7 ? '#2c2e33' : hash2(x, y, 928) > 0.5 ? '#17141a' : '#231d1f') : e > 0.8 && hash2(x, y, 929) > 0.5 ? '#16241a' : noise(x, y, 3, 931) > 0.62 ? '#3d2a1d' : hash2(x, y, 933) > 0.85 ? '#1f3322' : '#2a1c14');
      camp++;
    }
  }
  /* 6 LIGHT POOLS (b6: "each lantern and the brazier gets a stepped light pool"). A day map draws no pool at run time (canvas-backend
     drawLight adds the pools on a white ambient, where they saturate), so each lit prop's pool is laid in the ground: two hard bands
     on an ellipse under its flame, the outer a step up its ramp, the inner two (the grass toward the moss's warmer olive) */
  let lit = 0;
  const POOL = { mh_vigil_brazier: [56, 40, 0], mh_lantern_stake: [32, 23, 9], mh_lantern_pole: [32, 23, 8], mh_lantern_cairn: [30, 22, 1] };
  for (const o of objects) {
    const P = POOL[o.id]; if (!P) continue;
    /* b7: on the moor the pools read as identical flat lime ovals with a hard rim, markers rather than light. Each pool is now its own
       size; the floor steps up ITS OWN ramp (the grass's green, never the moss's olive), one step, two in a small core; the rim is
       DITHERED (a 4x4 ordered threshold over the outer third), so the light thins out instead of stopping on a line */
    const sz = 0.8 + 0.45 * hash2(o.x, o.y, 937), [rx, ry] = [P[0] * sz, P[1] * sz], dx = P[2], cx = o.x * T + 16 + dx, cy = o.y * T + 26;
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= g.height) continue;
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (noise(x, y, 9, 935) - 0.5) * 0.25; if (e > 1) continue;
      const c = px(g, x, y), a = RAMP_OF.get(c); if (!a || !['leaf', 'moss', 'earth', 'shadow', 'stone', 'iron'].includes(a.name)) continue;
      const fade = e < 0.62 ? 1 : 1 - (e - 0.62) / 0.38, th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (fade < th) continue;
      let to = stepC(c, 1);
      if (e < 0.16 && th < 0.5) to = stepC(to, 1);
      if (a.name === 'leaf' && RAMPS.leaf.indexOf(to) > 2) to = RAMPS.leaf[2];   /* the grass tops out at its middle green */
      if (to !== c) { pt(g, x, y, to); lit++; }
    }
  }
  return { gouge, ore, track, hoof, camp, lit };
}

/* ── THE COAL PATH redrawn (b5: the runners' path read as a staircase where it crosses the moor on the diagonal: the seams trail joins its
   cells' centres cell to cell). Its trodden earth in the path's cells goes back to the moor, and the path is laid again as ONE smooth line
   through its cells (each run of path cells ordered end to end, its centres smoothed twice), 5-8 px wide and wandering, its edges
   ragged, darker trodden earth down the middle; it runs on to the road and into the ford where its cells meet them. ── */
export function oxPath(g, grid, bogAt = () => -1) {
  const h = grid.length, w = grid[0].length, W = g.width, H = g.height;
  const J = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'J';
  const earth = (c) => { const a = RAMP_OF.get(c); return !!a && (a.name === 'earth' || a.name === 'bronze' || a.name === 'shadow' || a.name === 'stone' || a.name === 'iron'); };
  let erased = 0, laid = 0;
  /* (b7: a path cell that touches the road keeps the road's earth: erasing it cut a green box into the road's edge) */
  const byRoad = (cx, cy) => [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([a, b]) => grid[cy + b] && grid[cy + b][cx + a] === 'R');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (J(x >> 5, y >> 5) && !byRoad(x >> 5, y >> 5) && earth(px(g, x, y)) && bogAt(x, y) <= 0.06) { pt(g, x, y, noise(x, y, 3.1, 621) > 0.62 ? '#1f3322' : '#16241a'); erased++; }
  /* the runs: 8-connected groups of path cells, each walked from an end */
  const seen = new Set(), key = (x, y) => x + ',' + y, runs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!J(x, y) || seen.has(key(x, y))) continue;
    const comp = [], st = [[x, y]]; seen.add(key(x, y));
    while (st.length) { const [a, b] = st.pop(); comp.push([a, b]); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = a + dx, Y = b + dy; if (J(X, Y) && !seen.has(key(X, Y))) { seen.add(key(X, Y)); st.push([X, Y]); } } }
    /* order: start at the cell farthest from the run's first, then always the nearest unvisited */
    const far = (p, list) => list.reduce((m, q) => (Math.hypot(q[0] - p[0], q[1] - p[1]) > Math.hypot(m[0] - p[0], m[1] - p[1]) ? q : m), p);
    let cur = far(comp[0], comp); const left = comp.filter((q) => q !== cur), order = [cur];
    while (left.length) { let bi = 0; for (let i = 1; i < left.length; i++) if (Math.hypot(left[i][0] - cur[0], left[i][1] - cur[1]) < Math.hypot(left[bi][0] - cur[0], left[bi][1] - cur[1])) bi = i; cur = left.splice(bi, 1)[0]; order.push(cur); }
    runs.push(order);
  }
  for (const run of runs) {
    let pts = run.map(([x, y]) => [x * T + 16, y * T + 16]);
    /* carry it a cell on into a road or the ford it ends against */
    for (const end of [0, 1]) { const [x, y] = run[end ? run.length - 1 : 0]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = grid[y + dy] && grid[y + dy][x + dx]; if ((c === 'R' || c === 'V') && !(dx && dy)) { const p = [(x + dx) * T + 16 - dx * 8, (y + dy) * T + 16 - dy * 8]; if (end) pts.push(p); else pts.unshift(p); dx = dy = 2; } } }
    for (let it = 0; it < 3; it++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(pts[pts.length - 1]); pts = o; }
    /* b6: "dotted one-width ruler lines": the line wanders off its cells' centres (a slow sideways drift, pinned at its two ends) */
    pts = pts.map((p, i) => { if (i === 0 || i === pts.length - 1) return p; const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)], dx = q[0] - r[0], dy = q[1] - r[1], l = Math.hypot(dx, dy) || 1, k = Math.min(1, i / 6, (pts.length - 1 - i) / 6), m = (noise(p[0], p[1], 90, 959) - 0.5) * 22 * k; return [p[0] - (dy / l) * m, p[1] + (dx / l) * m]; });
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let k = 0; k < n; k++) {
        /* trodden ground of a varying width (3-11 px), worn widest at the bends and the ends */
        const cx = a[0] + ((b[0] - a[0]) * k) / n, cy = a[1] + ((b[1] - a[1]) * k) / n, half = 2.6 + 3.6 * noise(cx, cy, 70, 951) ** 1.4 + 1.2 * noise(cx, cy, 13, 952);
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
          const X = Math.round(cx + dx), Y = Math.round(cy + dy); if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const c = grid[Y >> 5][X >> 5]; if (c !== 'J' && c !== 'H' && !(c === 'R' && LEAFS.has(px(g, X, Y)))) continue;
          const d = Math.hypot(dx, dy) + (noise(X, Y, 3, 953) - 0.5) * 2; if (d > half) continue;
          /* the edge thins out into the grass pixel by pixel; grass tufts survive in the middle where it is least trodden */
          if (d > half - 1.6 && hash2(X, Y, 954) > 0.5) continue;
          if (d < half * 0.5 && noise(X, Y, 4, 956) > 0.8) { pt(g, X, Y, '#1f3322'); continue; }
          pt(g, X, Y, d < half * 0.45 ? (hash2(X, Y, 955) > 0.7 ? '#2a1c14' : '#3d2a1d') : d > half - 1.6 ? '#2a1c14' : hash2(X, Y, 957) > 0.9 ? '#553a26' : '#3d2a1d'); laid++;
        }
      }
    }
  }
  return { pathErased: erased, pathLaid: laid };
}

/* ── THE EDGES FRAMED (b6: "frame the open west, east and north edges"). The run time's outdoor vignette (canvas-backend drawVignette,
   map.outdoor) rings the SCREEN, not the map, so where the camera reaches the map's edge the moor stopped on a cut. The ground falls
   into the dark there: two stepped bands along every edge, ragged, the road and the path running on into them. ── */
export function oxFrame(g, grid) {
  /* b7: a 40 px band with ruler-straight inner edges read as a rectangle, and a hard seam across the road's ends. The falloff is now
     irregular (its depth 10-70 px on a slow field), dithered between its steps, and never on the road or the bridge: the road runs on
     out of the map at full value, the moor and the rock darken round it */
  const W = g.width, H = g.height, h = grid.length, w = grid[0].length; let n = 0;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c0 = grid[Math.min(h - 1, y >> 5)][Math.min(w - 1, x >> 5)]; if (c0 === 'R' || c0 === 'G') continue;
    const d = Math.min(x, W - 1 - x, y, H - 1 - y), depth = 10 + 60 * noise(x, y, 90, 941) + 14 * (noise(x, y, 23, 943) - 0.5);
    if (d >= depth) continue;
    const c = px(g, x, y); if (EARTHS2.has(c) && 'RJ'.includes(c0)) continue;
    const f = 1 - d / depth, th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    if (f < th) continue;
    const to = stepC(c, f > 0.75 && th < 0.5 ? -2 : -1);
    if (to !== c) { pt(g, x, y, to); n++; }
  }
  return { framed: n };
}
