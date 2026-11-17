#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/seams.mjs — WHERE TWO GROUND MATERIALS MEET (lane/a-ground-seams; ART_DIRECTION §5: "two fills never meet on a
// hard seam", "a road ends in an edging").
//
// A wang pair from a tileset draws its border on the cell grid: every edge tile is the same profile, so a long border is a ruler
// line, a diagonal is a staircase, and the same kerb or pebble row repeats every 32 px. This tool redraws a border from the two
// materials' OWN pixels (no pixel of its own, so a palette-locked ground stays locked), in one of these styles:
//   ragged   the border wanders (domain-warped noise, blobs not specks); for soft floors: grass, earth, ash, mud
//   stagger  a stone floor ends on its own stones: every stone (a component of its fill tile between the mortar lines) is laid
//            WHOLE or not at all, so the edge steps along the joints; for stone meeting stone (flagstone and cobble)
//   scatter  stagger, and the stones thin out: loose stones lie past the edge, a few are missing inside it, both fading with the
//            distance; for stone meeting a soft floor (cobble and gravel, rock and grass)
//   kerb     stagger, plus a course of dressed kerb stones (the stone's own pixels, the top lit one ramp step, a dark joint at
//            every stone) laid along the border; for paving that is meant to end on a built edge
//   bank     ragged, the ground's rim darkened where it is wet and the water's lip lit one step; for water and its bank
// Every style lays its UPPER material (the higher `z`) over the lower one, so a stone sits on the earth, never under it.
//
//   reseam(img, o)              a PAINTED ground redrawn along its borders, in place of the tileset's straight ones.
//        o { rows (one string per cell row), mats { ch: { z, unit, mortar } }, pairs [{ a, b, style, warp, scale, loose, holes,
//            fade }], keep (chars never touched: a wall mass), seed, T = 32 }. Only cells within one cell of a listed pair change.
//   transitionTiles(lower, upper, o)   a WANG-16 pair (the dual grid compose.js draws), `variants` tiles per key, every one built
//        from the two 32x32 fill tiles. A variant's outer ring is the key's own (the warp is pinned to 0 at the tile's edge), so
//        any variant sits beside any other: list them all under the key and compose.js's cell hash picks one per cell.
//
//   node tools/world-art/seams.mjs tiles --lower L.png --upper U.png --style scatter [--variants 4] [--seed 7] --out sheet.png
//        a wang sheet: one row per variant, the 16 keys across in WANG_KEYS order (NW NE SW SE, '1' = upper); + sheet.json
//   node tools/world-art/seams.mjs --selftest   determinism, the variant ring, palette closure, a straight seam broken
// Deterministic: a seed per ground or pair, so an import is repeatable.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePNG, encodePNG, createImage } from './png.mjs';
import { RAMPS } from './palette.mjs';
import { hash2, noise } from './ground-finish.mjs';
import { WANG_KEYS } from '../../src/data/world/art-budget.js';
import { isMain } from '../../tests/_is-main.mjs';

const LIN = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const lumAt = (d, p) => 0.2126 * LIN[d[p]] + 0.7152 * LIN[d[p + 1]] + 0.0722 * LIN[d[p + 2]];
const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));

/* one value step along a palette colour's own ramp (k > 0 lighter); an off-palette colour is left as it is */
const RAMP_AT = new Map();
for (const ramp of Object.values(RAMPS)) ramp.forEach((c, k) => RAMP_AT.set(c.toLowerCase(), { ramp, k }));
function stepRgb(r, g, b, k) {
  const at = RAMP_AT.get(hexOf(r, g, b));
  if (!at) return [r, g, b];
  return rgbOf(at.ramp[Math.max(0, Math.min(at.ramp.length - 1, at.k + k))]);
}

export const STYLES = Object.freeze(['ragged', 'stagger', 'scatter', 'kerb', 'bank']);
const DEFAULTS = Object.freeze({ sweep: 9, reach: 96, warp: 6, scale: 26, mid: 2.5, fine: 0.8, loose: 0.55, holes: 0.3, fade: 14, fadeIn: 10, kerb: 5, lift: 1, wet: 3 });

/* noise in [-1, 1] (ground-finish's three rotated octaves, stretched: it sits round 0.5 with a narrow spread) */
/* the pixels a joint looks to for a laid stone it outlines */
const JOINT_REACH = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const sn = (x, y, s, seed) => Math.max(-1, Math.min(1, (noise(x, y, s, seed) - 0.5) * 3.2));

/* ── the fill tile of a material: the most common 32x32 of its deep cells (all eight neighbours the same material) ── */
export function fillTileOf(img, rows, ch, T) {
  const W = rows[0].length, H = rows.length;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : rows[y][x]);
  const seen = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (rows[y][x] !== ch) continue;
    let deep = true;
    for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) { const q = at(x + dx, y + dy); if (q !== null && q !== ch) { deep = false; break; } }
    if (!deep) continue;
    let h = 0;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { const p = ((y * T + j) * img.width + x * T + i) * 4; h = (Math.imul(h, 31) + ((img.data[p] << 16) | (img.data[p + 1] << 8) | img.data[p + 2])) | 0; }
    const s = seen.get(h) || { n: 0, x, y };
    s.n++;
    seen.set(h, s);
  }
  const best = [...seen.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) throw new Error(`seams: material '${ch}' has no deep cell (a cell with all eight neighbours the same) to take its fill from`);
  const tile = createImage(T, T);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const s = ((best.y * T + j) * img.width + best.x * T + i) * 4, d = (j * T + i) * 4;
    tile.data.set(img.data.subarray(s, s + 4), d);
  }
  return tile;
}

/* ── the stones of a fill tile: components of the pixels above the mortar cut, on the torus (a stone may wrap the tile's edge).
   Per pixel: its stone (-1 mortar) and the offset from the stone's centre, so any pixel names its stone's centre in the plane. ── */
export function stonesOf(tile, o = {}) {
  const T = tile.width, N = T * T;
  const lum = new Float64Array(N);
  for (let i = 0; i < N; i++) lum[i] = lumAt(tile.data, i * 4);
  /* the mortar: the darkest `mortar` share of the tile (ties included), or Otsu's cut between the joints and the stone */
  const sorted = [...lum].sort((a, b) => a - b);
  let cut, mortar;
  if (o.mortar) { cut = sorted[Math.floor(o.mortar * N)]; mortar = (i) => lum[i] <= cut; }
  else {
    let best = -1;
    for (let k = 1; k < N; k++) {
      if (sorted[k] === sorted[k - 1]) continue;
      const w0 = k / N, m0 = sorted.slice(0, k).reduce((a, b) => a + b, 0) / k, m1 = sorted.slice(k).reduce((a, b) => a + b, 0) / (N - k);
      const v = w0 * (1 - w0) * (m0 - m1) ** 2;
      if (v > best) { best = v; cut = sorted[k]; }
    }
    mortar = (i) => lum[i] < cut;
  }
  const lab = new Int32Array(N).fill(-1), ux = new Int32Array(N), uy = new Int32Array(N);
  const cx = [], cy = [], area = [], wraps = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] !== -1 || mortar(s0)) continue;
    const id = cx.length, q = [s0];
    lab[s0] = id; ux[s0] = s0 % T; uy[s0] = Math.floor(s0 / T);
    let sx = 0, sy = 0, n = 0, wrap = false;
    while (q.length) {
      const p = q.pop();
      sx += ux[p]; sy += uy[p]; n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = ux[p] + dx, y = uy[p] + dy, i = ((y % T) + T) % T * T + ((x % T) + T) % T;
        if (mortar(i)) continue;
        /* met again by another way round the torus: an endless strip, no stone */
        if (lab[i] !== -1) { if (ux[i] !== x || uy[i] !== y) wrap = true; continue; }
        lab[i] = id; ux[i] = x; uy[i] = y;
        q.push(i);
      }
    }
    cx.push(sx / n); cy.push(sy / n); area.push(n); wraps.push(wrap);
  }
  /* a speck is no stone: it joins the mortar; a component that fills most of the tile, or wraps it, is no stone either */
  const minArea = o.minArea || 4;
  const big = area.some((a, k) => a > N * 0.6 || wraps[k]);
  const dx = new Float32Array(N), dy = new Float32Array(N), sid = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const k = lab[i];
    if (k < 0 || area[k] < minArea || big) continue;
    sid[i] = k; dx[i] = ux[i] - cx[k]; dy[i] = uy[i] - cy[k];
  }
  /* every joint pixel belongs to its NEAREST stone (a breadth-first fill over the joints, on the torus): a wide joint between two
     laid stones is drawn, and the outline a laid stone takes is its own half of each joint */
  const nsid = new Int32Array(N).fill(-1), ndx = new Float32Array(N), ndy = new Float32Array(N);
  let front = [];
  for (let i = 0; i < N; i++) if (sid[i] >= 0) { nsid[i] = sid[i]; ndx[i] = dx[i]; ndy[i] = dy[i]; front.push(i); }
  while (front.length) {
    const next = [];
    for (const p of front) {
      const px = p % T, py = Math.floor(p / T);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = (((py + oy) % T + T) % T) * T + (((px + ox) % T + T) % T);
        if (nsid[i] >= 0) continue;
        nsid[i] = nsid[p]; ndx[i] = ndx[p] + ox; ndy[i] = ndy[p] + oy;
        next.push(i);
      }
    }
    front = next;
  }
  return { sid, dx, dy, nsid, ndx, ndy, count: cx.length, cut, ok: !big };
}

/* ── the engine: one pixel of a border, given the cells round it ──
   o { T, cellAt(cx, cy), mats { ch: { z, stones? } }, tiles { ch: fill tile }, pairOf(a, b), seed, phase (the fills' and the
   joints' origin: 0 on a painted ground, T/2 in a wang tile), warpEnv(x, y) (0..1: the wang tile pins its edge), pinned (the
   kerb's joints fall on the tile's edges, the same in every variant) }. draw(x, y, S) -> { m, c: [r, g, b], kerb } */
function engine(o) {
  const { T, cellAt, mats, tiles, pairOf, warpEnv } = o;
  const seed = o.seed || 1, phase = o.phase || 0;
  const z = (m) => (mats[m] && mats[m].z) || 0;
  const unit = (m) => !!(mats[m] && mats[m].stones);
  const wrap = (v) => ((((v - phase) % T) + T) % T);
  const fillAt = (m, x, y) => { const d = tiles[m].data, p = (wrap(y) * T + wrap(x)) * 4; return [d[p], d[p + 1], d[p + 2]]; };
  /* a fill's body (its commonest colour) and joint (its darkest common colour): the kerb's own */
  const tone = {};
  for (const m of Object.keys(tiles)) {
    const n = new Map(), d = tiles[m].data;
    for (let i = 0; i < d.length; i += 4) { const k = hexOf(d[i], d[i + 1], d[i + 2]); n.set(k, (n.get(k) || 0) + 1); }
    const common = [...n.entries()].filter(([, c]) => c >= d.length / 4 * 0.03).map(([k]) => k);
    const lum = (h) => { const c = rgbOf(h); return lumAt([c[0], c[1], c[2]], 0); };
    tone[m] = { body: rgbOf([...n.entries()].sort((a, b) => b[1] - a[1])[0][0]), joint: rgbOf(common.sort((a, b) => lum(a) - lum(b))[0]) };
  }
  /* the share of material m in the bilinear blend of the four cell centres round (px, py): 0.5 on the cell edge between two */
  function share(m, px, py, S) {
    const fx = px / T - 0.5, fy = py / T - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    let wm = 0, wt = 0;
    for (const [ci, cj, w] of [[i, j, (1 - u) * (1 - v)], [i + 1, j, u * (1 - v)], [i, j + 1, (1 - u) * v], [i + 1, j + 1, u * v]]) {
      const c = cellAt(ci, cj);
      if (!S.includes(c)) continue;
      wt += w;
      if (c === m) wm += w;
    }
    return wt > 0 ? wm / wt : 0;
  }
  /* the material that wins at (x, y), warped by the pair's noise; margin = its lead in px (how deep inside its own side) */
  function winAt(x, y, S, p, fine) {
    const e = warpEnv ? warpEnv(x, y) : 1;
    /* four octaves: the border's long meander (`sweep` px over `reach`: a run of ten cells is no longer one line), its sweep (`warp`
       px over `scale`), its bays (`mid` over 10 px) and, pixel by pixel, its grain (`fine`) */
    const ox = p.sweep * sn(x, y, p.reach, seed + 7) + p.warp * sn(x, y, p.scale, seed);
    const oy = p.sweep * sn(x, y, p.reach, seed + 8) + p.warp * sn(x, y, p.scale, seed + 1);
    const wx = x + e * (ox + (fine ? p.mid * sn(x, y, 10, seed + 5) + p.fine * sn(x, y, 4, seed + 3) : 0));
    const wy = y + e * (oy + (fine ? p.mid * sn(x, y, 10, seed + 6) + p.fine * sn(x, y, 4, seed + 4) : 0));
    /* a material held to its own cells (`own`: water beside open floor) may draw back inside them, never spread out of them, so a
       tile a hero stands on is never painted under water (tests/world-assets.mjs [wet]) */
    const home = cellAt(Math.floor(x / T), Math.floor(y / T));
    let best = null, bv = -1, second = -1;
    for (const m of S) {
      if (mats[m] && mats[m].own && m !== home) continue;
      const v = share(m, wx, wy, S) + (p.bias && p.bias[m] || 0);
      if (v > bv || (v === bv && z(m) > z(best))) { second = bv; bv = v; best = m; } else if (v > second) second = v;
    }
    return { m: best, margin: (bv - Math.max(0, second)) * T / 2 };
  }
  /* the stone a joint pixel at (x, y) belongs to (its nearest), its centre in the plane */
  function jointOf(m, x, y) {
    const st = mats[m].stones, i = wrap(y) * T + wrap(x);
    return st.nsid[i] < 0 ? null : { gx: x - st.ndx[i], gy: y - st.ndy[i], k: st.nsid[i] };
  }
  /* a unit material's stone at (x, y): the stone's centre in the plane, or null on the mortar */
  function stoneAt(m, x, y) {
    const st = mats[m].stones, i = wrap(y) * T + wrap(x);
    if (st.sid[i] < 0) return null;
    return { gx: x - st.dx[i], gy: y - st.dy[i], k: st.sid[i] };
  }
  /* whether the stone of m centred at (gx, gy) is laid: its centre's winner, thinned near the border (scatter) */
  const claimCache = new Map();
  function claimed(m, s, S, p) {
    const key = m + ':' + Math.round(s.gx * 4) + ':' + Math.round(s.gy * 4);
    if (claimCache.has(key)) return claimCache.get(key);
    const w = winAt(s.gx + 0.5, s.gy + 0.5, S, p, false);
    const gx = Math.round(s.gx * 2), gy = Math.round(s.gy * 2);
    const h = hash2(gx, gy, seed + 11 + s.k);
    /* how deep the stone lies on its own side (px, < 0 outside), give or take a stone's own jitter: big slabs step along their joints */
    const deep = (w.m === m ? w.margin : -w.margin) + (p.jitter || 0) * (2 * hash2(gx, gy, seed + 23) - 1);
    let on;
    if (deep > 0) on = !(p.style === 'scatter' && deep < p.fadeIn && h < p.holes * (1 - deep / p.fadeIn) ** 1.5);
    else on = p.style === 'scatter' && -deep < p.fade && h < p.loose * (1 + deep / p.fade) ** 1.6;
    claimCache.set(key, on);
    return on;
  }
  /* ── the kerb: a course of dressed stones `p.kerb` px wide laid just inside the course material's edge ──
     Its joints fall every 7-13 px along the border (on a painted ground) or on the tile's thirds (a wang tile, the same in every
     variant). Each stone: the course material's own grain with its joints filled, lifted `p.lift` steps; its outer edge and its
     joints the material's joint colour; its edge that faces the light (up-left) one step lighter, the far end one step darker;
     one stone in four stands a pixel proud, one in eight sits a pixel back. */
  function kerbAt(x, y, S, K, p) {
    const sk = share(K, x + 0.5, y + 0.5, S);
    const d = (sk - 0.5) * T;
    if (d < -1 || d >= p.kerb) return null;
    const gx = share(K, x + 1.5, y + 0.5, S) - share(K, x - 0.5, y + 0.5, S), gy = share(K, x + 0.5, y + 1.5, S) - share(K, x + 0.5, y - 0.5, S);
    if (!gx && !gy) return null;
    const vertical = Math.abs(gx) >= Math.abs(gy);
    const t = vertical ? y : x, line = vertical ? Math.floor((x + T / 2) / T) : Math.floor((y + T / 2) / T);
    /* the joints along this line: every T/3 on a wang tile's thirds, else every 10 give or take 3 */
    let a, b, k;
    if (o.pinned) { const s = T / 3, q = t - phase; k = Math.floor(q / s); a = phase + Math.floor(k * s); b = phase + Math.floor((k + 1) * s); }
    else {
      const jt = (n) => n * 10 + Math.floor(hash2(n, line * 2 + (vertical ? 1 : 0), seed + 31) * 7) - 3;
      k = Math.floor(t / 10);
      a = jt(k); b = jt(k + 1);
      if (t < a) { b = a; k--; a = jt(k); } else if (t >= b) { k++; a = b; b = jt(k + 1); }
    }
    const hs = o.pinned ? 0.5 : hash2(k, line * 2 + (vertical ? 1 : 0), seed + 37);
    const lo = hs < 0.25 ? -1 : hs > 0.875 ? 1 : 0;   /* proud, flush, set back */
    if (d < lo) return null;
    const out = (gx > 0 || gy > 0) ? 'lit' : 'shade';   /* K lies right or below: the course's outer edge faces up-left, the light */
    let c;
    if (t === a || d < lo + 1 || d >= p.kerb - 1) c = tone[K].joint;
    else {
      const f = fillAt(K, x, y), isJoint = f[0] === tone[K].joint[0] && f[1] === tone[K].joint[1] && f[2] === tone[K].joint[2];
      c = stepRgb(...(isJoint ? tone[K].body : f), p.lift);
      if ((out === 'lit' && d < lo + 2) || (out === 'shade' && d >= p.kerb - 2) || t === a + 1) c = stepRgb(...c, 1);
      else if (t === b - 1) c = stepRgb(...c, -1);
    }
    return c;
  }
  /** The pixel at (x, y) among the materials S (the cell's and its listed neighbours'): { m, c, kerb }. */
  function draw(x, y, S) {
    const order = S.slice().sort((a, b) => z(b) - z(a));
    const p = pairOf(order[0], order[1]);
    if (p.style === 'kerb') {
      const K = p.course || order[0];
      const c = kerbAt(x, y, S, K, p);
      if (c) return { m: K, c, kerb: true };
    }
    const w = winAt(x + 0.5, y + 0.5, S, p, true);
    let pick = null;
    for (const m of order) {
      if (unit(m) && (p.style === 'stagger' || p.style === 'scatter')) {
        const s = stoneAt(m, x, y);
        if (s) { if (claimed(m, s, S, p)) { pick = m; break; } continue; }
        /* a joint is drawn with the stone it belongs to (its nearest: a wide joint between two laid stones never shows the floor
           beneath), and as the outline of any laid stone it touches */
        const j = jointOf(m, x, y);
        let edge = !!(j && claimed(m, j, S, p));
        for (const [dx, dy] of JOINT_REACH) { if (edge) break; const n = stoneAt(m, x + dx, y + dy); if (n && claimed(m, n, S, p)) edge = true; }
        if (edge) { pick = m; break; }
        continue;
      }
      if (w.m === m) { pick = m; break; }
    }
    pick = pick || order[order.length - 1];
    return { m: pick, c: fillAt(pick, x, y) };
  }
  return { draw, share };
}

const pairDefaults = (p) => Object.assign({}, DEFAULTS, p.style === 'kerb' ? { sweep: 0, warp: 0, mid: 0, fine: 0 } : {}, p);

/**
 * A painted ground's borders redrawn. Returns { img (a new image), changed (px) }.
 *   o.rows   the paint grid: one string per cell row, one character per cell (the same grid the ground was painted from)
 *   o.mats   { ch: { z: layer (upper over lower), unit: true for a stone floor (laid stone by stone), mortar: the joints' share } }
 *   o.pairs  [{ a, b, style, warp, scale, fine, jitter, loose, holes, fade, fadeIn, bias, course, kerb, lift }]: the borders to
 *            redraw (others stay as painted). Every pair of materials that touch should be listed, or its border is left as painted
 *            beside a redrawn one.
 *   o.keep   characters never touched and never drawn into (a wall mass the importer lays over the paint)
 */
export function reseam(img, o) {
  const T = o.T || 32, rows = o.rows, W = rows[0].length, H = rows.length;
  if (img.width !== W * T || img.height !== H * T) throw new Error(`seams: the ground is ${img.width}x${img.height}, the grid ${W}x${H} cells of ${T}`);
  const keep = o.keep || '';
  const cellAt = (x, y) => rows[Math.max(0, Math.min(H - 1, y))][Math.max(0, Math.min(W - 1, x))];
  const pairs = (o.pairs || []).map((p) => { if (!STYLES.includes(p.style)) throw new Error(`seams: unknown style '${p.style}' (${STYLES.join(', ')})`); return pairDefaults(p); });
  const pairOf = (a, b) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)) || pairDefaults({ style: 'ragged' });
  const listed = (a, b) => pairs.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  /* the planes: each material's fill tile, repeated on the image's own 32 px phase */
  const used = new Set(pairs.flatMap((p) => [p.a, p.b]));
  const mats = {}, tiles = {};
  for (const ch of used) {
    tiles[ch] = o.fills && o.fills[ch] ? o.fills[ch] : fillTileOf(img, rows, ch, T);
    const m = Object.assign({ z: 0 }, (o.mats || {})[ch]);
    if (m.unit) { const st = stonesOf(tiles[ch], m); if (st.ok) m.stones = st; }
    mats[ch] = m;
  }
  const eng = engine({ T, cellAt, mats, tiles, pairOf, seed: o.seed || 1 });
  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  const lab = new Uint8Array(img.width * img.height);   /* 1 where this pass drew, for the rims */
  const matOf = new Array(img.width * img.height);
  let changed = 0;
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    const c = rows[cy][cx];
    if (keep.includes(c) || !used.has(c)) continue;
    const S = [c];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = cellAt(cx + dx, cy + dy);
      if (!keep.includes(q) && !S.includes(q) && listed(c, q)) S.push(q);
    }
    if (S.length < 2) continue;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const x = cx * T + i, y = cy * T + j;
      const r = eng.draw(x, y, S);
      const d = (y * img.width + x) * 4;
      out.data[d] = r.c[0]; out.data[d + 1] = r.c[1]; out.data[d + 2] = r.c[2]; out.data[d + 3] = 255;
      lab[y * img.width + x] = 1;
      matOf[y * img.width + x] = r.kerb ? null : r.m;
      if (out.data[d] !== img.data[d] || out.data[d + 1] !== img.data[d + 1] || out.data[d + 2] !== img.data[d + 2]) changed++;
    }
  }
  rims(out, lab, matOf, pairOf, mats, img.width, img.height);
  return { img: out, changed };
}

/* ── the rims a style adds on the pixels it drew: the bank's wet ground and lit water lip; the soft edge's shadow ── */
function rims(out, lab, matOf, pairOf, mats, w, h) {
  const z = (m) => (mats[m] && mats[m].z) || 0;
  const step = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!lab[i] || matOf[i] === null) continue;
    const m = matOf[i];
    /* the bank: ground within `wet` px of the water (a ragged band: the wet line is no ruler either) is a step down */
    let wetBy = null;
    for (let r = 1; r <= 3 && !wetBy; r++) for (let dy = -r; dy <= r && !wetBy; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h || !lab[Y * w + X]) continue;
      const n = matOf[Y * w + X];
      if (n === m || n === null) continue;
      const p = pairOf(m, n);
      if (p.style === 'bank' && z(n) < z(m) && r <= p.wet - (hash2(x, y, 41) < 0.35 ? 1 : 0)) { wetBy = n; break; }
    }
    if (wetBy) { step.push([i, -1]); continue; }
    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h || !lab[Y * w + X]) continue;
      const n = matOf[Y * w + X];
      if (n === m || n === null) continue;
      const p = pairOf(m, n);
      if (p.style === 'bank') {
        /* the lower material is the water: its first pixel under the bank's lit side is a lit lip */
        if (z(m) < z(n) && dx <= 0 && dy <= 0) step.push([i, 1]);
      } else if (p.style === 'ragged' && z(n) > z(m) && (dx < 0 || dy < 0)) {
        /* a soft upper floor (grass over earth) casts a pixel of shadow down-right onto the lower */
        step.push([i, -1]);
      }
      break;
    }
  }
  for (const [i, k] of step) { const d = i * 4; const c = stepRgb(out.data[d], out.data[d + 1], out.data[d + 2], k); out.data[d] = c[0]; out.data[d + 1] = c[1]; out.data[d + 2] = c[2]; }
}

/**
 * A wang-16 pair built from two fill tiles: { tiles: { key: [img x variants] } }, keys NW NE SW SE with '1' the upper material.
 *   o { style, variants = 4, seed = 7, warp, scale, jitter, loose, holes, fade, kerb, lift, unitLower, unitUpper, mortarLower,
 *       mortarUpper, course: 'L' | 'U' (the kerb's material; default the upper) }
 * Variant 0 of each key is the plain border (no warp); the others wander inside the tile and meet the edge as variant 0 does.
 */
export function transitionTiles(lower, upper, o = {}) {
  const T = lower.width;
  if (lower.width !== lower.height || upper.width !== T || upper.height !== T) throw new Error('seams: the two fill tiles must be square and the same size');
  const variants = o.variants || 4;
  const mats = { L: { z: 0, unit: !!o.unitLower, mortar: o.mortarLower }, U: { z: 1, unit: !!o.unitUpper, mortar: o.mortarUpper } };
  const tiles = { L: lower, U: upper };
  for (const k of ['L', 'U']) if (mats[k].unit) { const st = stonesOf(tiles[k], mats[k]); if (st.ok) mats[k].stones = st; }
  const p = pairDefaults(Object.assign({}, o, { a: 'L', b: 'U', style: o.style || 'ragged' }));
  const out = {};
  /* a 2x2 grid of cells, their centres the tile's corners: the tile is the square between the centres, [T/2, 3T/2) */
  const half = T / 2, M = Math.max(3, Math.round(T / 6));
  for (const key of WANG_KEYS) {
    out[key] = [];
    const bits = [...key].map((b) => (b === '1' ? 'U' : 'L'));
    const cellAt = (x, y) => bits[Math.max(0, Math.min(1, y)) * 2 + Math.max(0, Math.min(1, x))];
    for (let v = 0; v < variants; v++) {
      /* pinned: no warp within M px of the tile's edge (so the ring is variant 0's), full warp from 2M in */
      const env = (x, y) => {
        if (v === 0) return 0;
        const d = Math.min(x - half, y - half, half + T - 1 - x, half + T - 1 - y);
        return Math.max(0, Math.min(1, (d - M) / M));
      };
      const eng = engine({ T, cellAt, mats, tiles, pairOf: () => p, seed: (o.seed || 7) * 131 + v * 17, warpEnv: env, phase: half, pinned: true });
      const flat = engine({ T, cellAt, mats: { L: { z: 0 }, U: { z: 1 } }, tiles, pairOf: () => p, seed: 1, warpEnv: () => 0, phase: half, pinned: true });
      const img = createImage(T, T), lab = new Uint8Array(T * T), matOf = new Array(T * T);
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const x = half + i, y = half + j;
        /* within the pinned ring a stone floor is drawn pixel by pixel, so a stone cut by the edge is cut the same in every variant */
        const ring = Math.min(i, j, T - 1 - i, T - 1 - j) < M;
        const r = (ring || v === 0 ? flat : eng).draw(x, y, ['L', 'U']);
        const d = (j * T + i) * 4;
        img.data[d] = r.c[0]; img.data[d + 1] = r.c[1]; img.data[d + 2] = r.c[2]; img.data[d + 3] = 255;
        lab[j * T + i] = 1; matOf[j * T + i] = r.kerb ? null : r.m;
      }
      rims(img, lab, matOf, () => p, mats, T, T);
      out[key].push(img);
    }
  }
  return { tiles: out, T, variants };
}

/* ── the sheet the town's lane imports: one row per variant, the 16 keys across ── */
export function tileSheet(set) {
  const T = set.T, img = createImage(16 * T, set.variants * T), rects = {};
  WANG_KEYS.forEach((key, k) => set.tiles[key].forEach((t, v) => {
    for (let j = 0; j < T; j++) img.data.set(t.data.subarray(j * T * 4, (j + 1) * T * 4), ((v * T + j) * img.width + k * T) * 4);
    (rects[key] = rects[key] || []).push([k * T, v * T]);
  }));
  return { img, rects };
}

/* ── the straightness of a border, the selftest's yardstick: the share of rows whose material switch sits on the same column ── */
export function straightness(labels, w, h, x0, y0, len) {
  let same = 0, first = null;
  for (let y = y0; y < y0 + len; y++) {
    let sw = null;
    for (let x = x0 - 16; x < x0 + 16; x++) if (labels[y * w + x] !== labels[y * w + x + 1]) { sw = x; break; }
    if (first === null) first = sw;
    if (sw === first) same++;
  }
  return same / len;
}

function selftest() {
  let bad = 0;
  const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) bad++; };
  /* two fills off the palette's own ramps: a cobble of stone-grey stones on dark joints, an earth of two browns */
  const T = 32;
  const cobble = createImage(T, T), earth = createImage(T, T);
  const J = rgbOf(RAMPS.stone[0]), S1 = rgbOf(RAMPS.stone[2]), S2 = rgbOf(RAMPS.stone[3]), E1 = rgbOf(RAMPS.earth[2]), E2 = rgbOf(RAMPS.earth[3]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const joint = x % 8 === 0 || (y + (Math.floor(x / 8) % 2) * 4) % 8 === 0;
    cobble.data.set([...(joint ? J : (x + y) % 5 ? S1 : S2), 255], (y * T + x) * 4);
    earth.data.set([...(hash2(x, y, 3) < 0.2 ? E2 : E1), 255], (y * T + x) * 4);
  }
  /* a 6 x 4 ground: earth left, cobble right, a dead-straight vertical border four cells long */
  const rows = ['::::....', '::::....', '::::....', '::::....'];
  const img = createImage(8 * T, 4 * T);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) img.data.set((rows[Math.floor(y / T)][Math.floor(x / T)] === '.' ? cobble : earth).data.subarray(((y % T) * T + (x % T)) * 4, ((y % T) * T + (x % T)) * 4 + 4), (y * img.width + x) * 4);
  const o = { rows, mats: { '.': { z: 1, unit: true }, ':': { z: 0 } }, pairs: [{ a: '.', b: ':', style: 'scatter' }], seed: 5 };
  const a = reseam(img, o), b = reseam(img, o);
  ok(Buffer.compare(Buffer.from(a.img.data), Buffer.from(b.img.data)) === 0, 'reseam is deterministic');
  ok(a.changed > 0, 'reseam drew the border (' + a.changed + ' px changed)');
  const labelsOf = (im) => { const l = new Uint8Array(im.width * im.height); for (let i = 0; i < l.length; i++) { const p = i * 4; l[i] = hexOf(im.data[p], im.data[p + 1], im.data[p + 2]) === hexOf(...E1) || hexOf(im.data[p], im.data[p + 1], im.data[p + 2]) === hexOf(...E2) ? 0 : 1; } return l; };
  const before = straightness(labelsOf(img), img.width, img.height, 4 * T, 0, 4 * T), after = straightness(labelsOf(a.img), img.width, img.height, 4 * T, 0, 4 * T);
  ok(before === 1 && after < 0.35, `the straight border is broken: ${Math.round(before * 100)}% of rows switch on one column before, ${Math.round(after * 100)}% after`);
  const pal = new Set([cobble, earth].flatMap((t) => { const s = []; for (let i = 0; i < t.data.length; i += 4) s.push(hexOf(t.data[i], t.data[i + 1], t.data[i + 2])); return s; }));
  let off = 0;
  for (let i = 0; i < a.img.data.length; i += 4) { const hx = hexOf(a.img.data[i], a.img.data[i + 1], a.img.data[i + 2]); if (!pal.has(hx) && !RAMP_AT.has(hx)) off++; }
  ok(off === 0, 'every pixel drawn is a fill pixel or a ramp step of one (' + off + ' off)');
  /* the wang set: every variant of a key shares variant 0's outer ring */
  const set = transitionTiles(earth, cobble, { style: 'scatter', unitUpper: true, variants: 4, seed: 3 });
  let ringBad = 0, inner = 0;
  for (const key of WANG_KEYS) for (let v = 1; v < 4; v++) {
    const t0 = set.tiles[key][0].data, tv = set.tiles[key][v].data;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const p = (y * T + x) * 4, edge = x === 0 || y === 0 || x === T - 1 || y === T - 1;
      const same = t0[p] === tv[p] && t0[p + 1] === tv[p + 1] && t0[p + 2] === tv[p + 2];
      if (edge && !same) ringBad++;
      if (!edge && !same) inner++;
    }
  }
  ok(ringBad === 0, 'every variant meets the tile edge as variant 0 does (' + ringBad + ' ring px differ)');
  ok(inner > 0, 'the variants differ inside the tile (' + inner + ' px)');
  ok(WANG_KEYS.every((k) => set.tiles[k].length === 4), 'all 16 keys carry 4 variants');
  console.log(bad ? `✗ seams selftest: ${bad} failed` : '✓ seams selftest');
  return bad ? 1 : 0;
}

function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  if (argv[0] === 'tiles') {
    const lower = decodePNG(readFileSync(arg('--lower'))), upper = decodePNG(readFileSync(arg('--upper')));
    const set = transitionTiles(lower, upper, { style: arg('--style', 'ragged'), variants: +arg('--variants', 4), seed: +arg('--seed', 7),
      unitLower: argv.includes('--unit-lower'), unitUpper: argv.includes('--unit-upper') });
    const { img, rects } = tileSheet(set);
    const out = arg('--out');
    writeFileSync(out, encodePNG(img));
    writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify({ T: set.T, variants: set.variants, keys: rects }, null, 1) + '\n');
    console.log('  ✓ ' + out + ': 16 keys x ' + set.variants + ' variants');
    return 0;
  }
  console.error('usage: seams.mjs tiles --lower L.png --upper U.png --style ' + STYLES.join('|') + ' [--variants N] [--seed N] [--unit-lower] [--unit-upper] --out sheet.png | --selftest');
  return 2;
}
if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
