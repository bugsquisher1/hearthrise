#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/signature-icons.mjs — THE SIGNATURES' PIXEL ICONS, DRAWN BY RULE
// (Art Director, lane/icons-arrowheads-signatures, 2026-11-28; v0.3.0 A1 step 2, HANDOFFS 2026-11-26 a1-rare-frame item 3).
//
// A Signature is a named piece with one fixed rule (src/data/signatures.js), and its icon sits inside the Signature frame (a double
// gold rule with cut corners, bits.js itemIconHtml, drawn under the icon's outer 2 art px). So each icon keeps its four corners clear,
// and each reads as a DIFFERENT OBJECT from its slot's plain piece at x1 in a 36 px phone pocket: the silhouette carries it, not a dye.
// One accent hue each, on about a tenth of its pixels at most. The in-band eight first (the brief's order):
//   bannermans_pavise    #1  shield     a tall pavise, painted per pale in the Bannerman's red and bone, a centre keel, and a pennon
//                                       flying from a staff over its top (no plain shield has a flag)
//   lock_keepers_chain   #19 necklace   a heavy iron chain hung with a bronze key ring of three keys (the Gatekeeper's Chain is a
//                                       padlock), the ring's one gold glint the Gold lock it comes from
//   greened_bracers      #20 gloves     a pair of bronze vambraces, no hands, crusted green where the Sickness got in
//   slake_waders         #22 boots      thigh-high waders in waxed dark leather, strapped at the top, wet to the shin
//   stokers_ring         #24 ring       a broad iron band set with a cracked coal, alight in its cracks
//   the_cold_candle      #25 necklace   a stub of bone-white candle in an iron cup on a cord, its flame frost blue
//   riverstone_earrings  #27 earrings   a pair of smooth banded river stones, each on a bronze hook
//   the_cellar_key       #31 necklace   one big old iron key, ring bow at the top, hung on a leather cord
// Every colour is an entry of hr-world-56-v2 (art/world/palette.json), binary alpha, 32x32, a 1 px #0b0a0c outline with its corners
// cut, lit from the upper left. The ids have no ITEMS row yet (S1 owes them), so they stand in item-art.js ITEM_ART_AHEAD until each
// row lands. tests/pixel-icons.mjs rule `drawn` holds the files to this script: edit the script and rerun it, never the PNG.
//
//   node tools/world-art/signature-icons.mjs            write assets/icons-bundle/pixel/items/<id>.png
//   node tools/world-art/signature-icons.mjs --out <d>  write to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');

/* hr-world-56-v2 ramps, dark to light */
const K = '#0b0a0c';
const SHADOW = ['#0b0a0c', '#17141a', '#231d1f', '#2f2723'];
const STONE = ['#3a3a3e', '#4f4e52', '#6a6865', '#8a867d', '#aaa49a'];
const EARTH = ['#2a1c14', '#3d2a1d', '#553a26', '#6e4c30', '#8a6440', '#a88457', '#c49a5c'];
const BRONZE = ['#4a2e18', '#7a4f26', '#a8743a', '#cfa25c'];
const IRON = ['#2c2e33', '#4a4d54', '#6e727a', '#969aa1'];
const STEEL = ['#3a4652', '#5c6c7a', '#8a9aa8', '#c4ccd2'];
const BONE = ['#c9bfa0', '#e6dcbc'];
const CLOTH = ['#3e1216', '#5e1a1f'];
const BLOOD = ['#8e1f1f', '#c23a2a'];
const TORCH = ['#f2a03a', '#ffd36a'];
const FROST = ['#4fa8e8', '#a8e4ff'];
const WATER = ['#1a2c44', '#2b4a6a'];
const MOSS = ['#4a5a2a', '#6b7a38'];
const LEAF = ['#16241a', '#1f3322', '#2c4a2c', '#3d6234', '#557a3e', '#73944c'];
const VENOM = '#7ccf4a', GOLD = '#e8c547';

const blank = () => Array.from({ length: 32 }, () => Array(32).fill(null));
const inb = (x, y) => x >= 0 && x < 32 && y >= 0 && y < 32;
const put = (g, x, y, c) => { if (inb(x, y)) g[y][x] = c; };
const line = (g, x0, y0, x1, y1, c) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) put(g, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
};
/** A mask from a predicate over pixel centres. */
const mask = (fn) => Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => !!fn(x + 0.5, y + 0.5)));
const inPoly = (pts) => (x, y) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/**
 * Paint a mask as one lit volume in `ramp` (dark to light): rims facing up or left the top step, rims facing down or right the
 * bottom step, the inside falling from light to dark along x + y across the mask's own extent. `skip` keeps pixels already painted.
 */
function shade(g, m, ramp, { skip = false, rimTop = true, rimDark = true } = {}) {
  let lo = 99, hi = -1;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (m[y][x]) { lo = Math.min(lo, x + y); hi = Math.max(hi, x + y); }
  const on = (x, y) => inb(x, y) && m[y][x];
  const n = ramp.length;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!m[y][x] || (skip && g[y][x])) continue;
    const t = (x + y - lo) / Math.max(1, hi - lo);
    let i = Math.max(1, Math.min(n - 2, Math.round((1 - t) * (n - 2.2) + 0.6)));
    if (rimTop && (!on(x - 1, y) || !on(x, y - 1))) i = n - 1;
    else if (rimDark && (!on(x + 1, y) || !on(x, y + 1))) i = 0;
    g[y][x] = ramp[i];
  }
}

/** The set's outline: every empty pixel 4-touching art turns #0b0a0c, so corners stay cut. */
function outlined(g) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g[y][x]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && g[y + dy][x + dx]) { out[y][x] = K; break; }
  }
  return out;
}

/** Overlay a mask's own outline onto g (a part in front of another: its edge cuts in). */
function edge(g, m) {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (m[y][x]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && m[y + dy][x + dx]) { g[y][x] = K; break; }
  }
}

/* ── #1 Bannerman's Pavise ─────────────────────────────────────────── */
function bannermansPavise() {
  const g = blank();
  // the staff behind the shield's top, then the pennon flying right off it
  for (let y = 3; y <= 9; y++) { put(g, 15, y, EARTH[5]); put(g, 16, y, EARTH[3]); }
  put(g, 15, 2, BRONZE[3]); put(g, 16, 2, BRONZE[2]);
  const pennon = mask(inPoly([[17, 3], [27, 4.2], [23.5, 6], [27, 8], [17, 8.2]]));
  shade(g, pennon, [CLOTH[0], CLOTH[1], BLOOD[0], BLOOD[1]]);
  for (let x = 18; x <= 22; x++) put(g, x, 5, x % 2 ? BLOOD[1] : BLOOD[0]);
  // the pavise: a tall board, its top a shallow arch, its foot squared
  const body = mask((x, y) => x > 6 && x < 25 && y > 9 + Math.pow((x - 16) / 9, 2) * 2.6 && y < 29);
  shade(g, body, IRON);
  // the painted face inside a one-pixel iron rim: per pale, red at the left, bone at the right, the keel down the middle
  const face = mask((x, y) => x > 8 && x < 23 && y > 11.2 + Math.pow((x - 16) / 9, 2) * 2.6 && y < 28);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!face[y][x]) continue;
    const down = y > 22 ? 1 : 0;
    g[y][x] = x < 15 ? [BLOOD[1], BLOOD[0], CLOTH[1]][Math.min(2, (x === 9 ? 0 : 1) + down)] : x > 16 ? [BONE[1], BONE[0], STONE[4], STONE[3]][Math.min(3, (x >= 21 ? 2 : x === 17 ? 0 : 1) + down)] : null;
  }
  for (let y = 10; y <= 28; y++) { put(g, 15, y, STEEL[3]); put(g, 16, y, IRON[1]); }
  // a gold mark on the red: the bannerman's chevron, and the rim's rivets
  for (const [x, y] of [[10, 18], [11, 17], [12, 16], [13, 17], [14, 18], [10, 19], [14, 19]]) put(g, x, y, GOLD);
  for (const [x, y] of [[8, 13], [23, 13], [8, 28], [23, 28]]) put(g, x, y, STEEL[3]);
  return outlined(g);
}

/* ── #19 Lock-Keeper's Chain ───────────────────────────────────────── */
function lockKeepersChain() {
  const g = blank();
  // the chain: a link every 2.6 px of arc round an ellipse, face-on rings and edge-on bars in turn, the near side lit
  const cx = 15.5, cy = 11.5, rx = 11.5, ry = 8.8;
  let acc = 0, k = 0, px = cx + Math.cos(Math.PI * 0.6) * rx, py = cy + Math.sin(Math.PI * 0.6) * ry;
  for (let a = Math.PI * 0.6; a <= Math.PI * 2.4; a += 0.01) {
    const fx = cx + Math.cos(a) * rx, fy = cy + Math.sin(a) * ry;
    acc += Math.hypot(fx - px, fy - py); px = fx; py = fy;
    if (acc < 2.6) continue;
    acc = 0; k++;
    const x = Math.round(fx), y = Math.round(fy), lit = Math.cos(a) + Math.sin(a) < 0.3;
    if (k % 2) {
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) put(g, x + dx, y + dy, dx + dy < 0 ? (lit ? IRON[3] : IRON[2]) : dx + dy === 0 ? IRON[2] : IRON[1]);
      put(g, x, y, SHADOW[1]);
    } else if (!g[y][x]) { put(g, x, y, lit ? STEEL[3] : IRON[3]); if (!g[y + 1][x + 1]) put(g, x + 1, y + 1, IRON[1]); }
  }
  // the key ring: a thick bronze hoop at the chain's foot, its gold glint the Gold lock
  const ring = mask((x, y) => { const d = Math.hypot((x - 15.5) / 4, (y - 20) / 3); return d <= 1 && d >= 0.45; });
  shade(g, ring, BRONZE);
  put(g, 13, 17, GOLD);
  // two big keys hung off the ring, splayed: a round bow on the ring, a two-pixel shank lit on its left, a stepped bit
  const key = (bx, by, side) => {
    const bow = mask((x, y) => { const d = Math.hypot(x - bx - 0.5, y - by - 0.5); return d <= 2.3 && d >= 0.9; });
    shade(g, bow, BRONZE);
    for (let i = 0; i < 8; i++) { const x = bx + side * Math.round(i * 0.35), y = by + 2 + i; put(g, x, y, BRONZE[3]); put(g, x + 1, y, BRONZE[1]); }
    const xe = bx + side * Math.round(7 * 0.35), ye = by + 9, tx = side > 0 ? xe + 2 : xe - 1;
    for (const [dx, dy, c] of [[0, 0, 2], [0, -1, 0], [0, -2, 2], [side, 0, 1], [side, -2, 1]]) put(g, tx + dx, ye + dy, BRONZE[c]);
  };
  key(10, 20, -1); key(20, 20, 1);
  return outlined(g);
}

/* ── #20 Greened Bracers ───────────────────────────────────────────── */
function greenedBracers() {
  const g = blank();
  /** one vambrace on the diagonal: its wide elbow cuff at the upper right, its wrist at the lower left, lit on its upper-left side */
  const brace = (ex, ey, len) => {
    const at = (x, y) => { const dx = x - ex, dy = y - ey; return { u: (dy - dx) * Math.SQRT1_2, v: -(dx + dy) * Math.SQRT1_2 }; };
    const halfAt = (u) => 4.5 - (u / len) * 1.7;
    const m = mask((x, y) => { const { u, v } = at(x, y); return u >= 0 && u <= len && Math.abs(v) <= halfAt(u); });
    const s1 = len * 0.36, s2 = len * 0.68;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (!m[y][x]) continue;
      const { u, v } = at(x + 0.5, y + 0.5), w = v / halfAt(u);
      let c = w > 0.45 ? BRONZE[3] : w > -0.1 ? BRONZE[2] : w > -0.6 ? BRONZE[1] : BRONZE[0];
      const strap = Math.abs(u - s1) < 0.8 || Math.abs(u - s2) < 0.8;
      if (u < 2.2 && Math.abs(w) < 0.62) c = u < 1.1 ? SHADOW[1] : SHADOW[3];      // the hollow at the elbow: a tube to wear
      else if (u < 1.5 || u > len - 1.5) c = w > 0 ? BRONZE[3] : BRONZE[1];          // the rolled cuffs
      else if (strap) c = w > 0.2 ? EARTH[3] : EARTH[1];                             // two leather straps
      else if (w > 0.45 && w < 0.8 && u > 3 && u < len - 3) c = BONE[1];             // the polished metal's shine
      else if (w < -0.2 && (Math.floor(u) % 6 < 3 || Math.abs(u - s1) < 2.2 || Math.abs(u - s2) < 2.2)) {
        c = w < -0.6 ? MOSS[0] : Math.floor(u + w * 3) % 4 === 0 ? VENOM : MOSS[1];  // the verdigris: in the shade and by the straps
      }
      g[y][x] = c;
    }
    return m;
  };
  brace(26.5, 12, 18);
  const front = brace(21, 5.5, 19);
  edge(g, front);
  return outlined(g);
}

/* ── #22 Slake Waders ──────────────────────────────────────────────── */
function slakeWaders() {
  const g = blank();
  /** one wader: a tall leg from its strapped top to a broad foot pointing left */
  const wader = (x0, top) => {
    const leg = mask((x, y) => y > top && y < 27 && x > x0 + (y - top) * 0.06 && x < x0 + 7.2 - (y - top) * 0.04);
    const foot = mask((x, y) => y >= 23 && y < 29 && x > x0 - 4.5 + (y - 23) * 0.2 && x < x0 + 7 && !(y < 26 && x < x0 + 0.5));
    const m = leg.map((r, y) => r.map((v, x) => v || foot[y][x]));
    shade(g, m, [SHADOW[2], EARTH[0], EARTH[1], EARTH[2], EARTH[3]]);
    // the strapped top: a turned cuff and a bronze buckle
    for (let x = 0; x < 32; x++) { if (m[top + 1] && m[top + 1][x]) put(g, x, top + 1, EARTH[4]); if (m[top + 2] && m[top + 2][x]) put(g, x, top + 2, EARTH[1]); }
    put(g, x0 + 5, top + 1, BRONZE[3]); put(g, x0 + 5, top + 2, BRONZE[1]);
    // wet to the shin: water sheen and the Slake's mud
    const wet = new Map([[EARTH[3], STEEL[2]], [EARTH[2], STEEL[1]], [EARTH[1], WATER[1]], [EARTH[0], WATER[0]]]);
    for (let y = 18; y < 31; y++) for (let x = 0; x < 32; x++) {
      if (!m[y] || !m[y][x]) continue;
      if (y === 18) g[y][x] = MOSS[1];
      else if (y === 19) g[y][x] = MOSS[0];
      else if (wet.has(g[y][x])) g[y][x] = wet.get(g[y][x]);
    }
    put(g, x0 + 1, 21, FROST[1]); put(g, x0 + 1, 22, FROST[0]);
    return m;
  };
  wader(19, 3);
  const front = wader(9, 5);
  edge(g, front);
  return outlined(g);
}

/* ── #24 Stoker's Ring ─────────────────────────────────────────────── */
function stokersRing() {
  const g = blank();
  // the band in three-quarter view: an ellipse ring, thick, lit at its upper left
  const cx = 15.5, cy = 19, rx = 11, ry = 9, th = 3.6;
  const band = mask((x, y) => { const d = Math.hypot((x - cx) / rx, (y - cy) / ry); return d <= 1 && d >= 1 - th / ry; });
  shade(g, band, IRON);
  // the inside of the band seen through: its far wall dark
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!band[y][x]) continue;
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d < 0.78 && y < cy) g[y][x] = IRON[0];
  }
  // the bezel on top and the coal set in it, cracked and alight
  const bezel = mask((x, y) => Math.hypot((x - 15.5) / 6.2, (y - 8.5) / 5.2) <= 1);
  shade(g, bezel, IRON);
  const coal = mask((x, y) => Math.hypot((x - 15.5) / 4.6, (y - 8) / 3.7) <= 1);
  shade(g, coal, [SHADOW[1], SHADOW[2], SHADOW[3], STONE[1]]);
  for (const [x, y, c] of [[13, 7, 0], [14, 8, 1], [15, 8, 2], [16, 9, 1], [17, 9, 0], [16, 7, 1], [17, 6, 0], [14, 9, 0], [18, 8, 0]]) put(g, x, y, [BLOOD[0], BLOOD[1], TORCH[0]][c]);
  put(g, 15, 9, TORCH[1]);
  // prongs holding the coal
  for (const [x, y] of [[10, 6], [21, 6], [10, 10], [21, 10]]) put(g, x, y, IRON[3]);
  return outlined(g);
}

/* ── #25 The Cold Candle ───────────────────────────────────────────── */
function theColdCandle() {
  const g = blank();
  // the cord: a loop round the top, dark leather, meeting at the cup's ring
  for (let a = 200; a <= 340; a += 3) {
    const r = (a * Math.PI) / 180;
    put(g, Math.round(15.5 + Math.cos(r) * 12), Math.round(12 + Math.sin(r) * 9.5), a < 270 ? EARTH[4] : EARTH[3]);
  }
  line(g, 4, 9, 13, 21, EARTH[3]); line(g, 27, 9, 18, 21, EARTH[2]);
  // the iron cup and its drip pan, a ring at its side
  const cup = mask((x, y) => (y >= 21 && y < 25 && x > 10 && x < 21) || (y >= 25 && y < 28 && x > 7.5 && x < 23.5));
  shade(g, cup, IRON);
  // the candle: a short bone-white stub, a drip down its lit side
  const wax = mask((x, y) => y >= 12 && y < 21.5 && x > 12 && x < 19);
  shade(g, wax, [STONE[3], STONE[4], BONE[0], BONE[1]]);
  for (const [x, y] of [[13, 13], [13, 14], [13, 15], [14, 13]]) put(g, x, y, BONE[1]);
  put(g, 16, 11, SHADOW[2]);
  // the flame: frost, not fire
  for (const [x, y, c] of [[16, 10, 0], [16, 9, 1], [15, 9, 0], [16, 8, 1], [17, 8, 0], [16, 7, 1], [16, 6, 0], [15, 7, 0], [17, 10, 0], [15, 10, 0]]) put(g, x, y, FROST[c]);
  put(g, 16, 5, FROST[1]);
  return outlined(g);
}

/* ── #27 Riverstone Earrings ───────────────────────────────────────── */
function riverstoneEarrings() {
  const g = blank();
  const stone = (cx, cy, rx, ry) => {
    // the hook: a bronze wire curling over from the stone's top
    for (const [dx, dy] of [[0, -1], [0, -2], [0, -3], [1, -4], [2, -5], [3, -5], [4, -4], [4, -3]]) put(g, cx + dx, Math.round(cy - ry) + dy, dy < -3 ? BRONZE[3] : BRONZE[2]);
    const m = mask((x, y) => Math.hypot((x - cx - 0.5) / rx, (y - cy - 0.5) / ry) <= 1);
    shade(g, m, STONE);
    // the river's band: a pale vein across the stone, and a wet blue bloom on its dark side
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (!m[y][x] || g[y][x] === STONE[0] || g[y][x] === STONE[4]) continue;
      const b = (y - cy) - (x - cx) * 0.45;
      if (b >= 0.5 && b < 2) g[y][x] = BONE[0];
      else if (b >= 3 && x > cx) g[y][x] = WATER[1];
    }
    put(g, cx - Math.round(rx * 0.4), cy - Math.round(ry * 0.45), BONE[1]);
    return m;
  };
  stone(20, 20, 6.2, 7.6);
  const front = stone(9, 17, 6.2, 7.6);
  edge(g, front);
  return outlined(g);
}

/* ── #31 The Cellar Key ────────────────────────────────────────────── */
function theCellarKey() {
  const g = blank();
  // the cord: a leather loop from the bow up and round
  for (let a = 180; a <= 360; a += 3) {
    const r = (a * Math.PI) / 180;
    put(g, Math.round(15.5 + Math.cos(r) * 11.5), Math.round(10 + Math.sin(r) * 8), a < 270 ? EARTH[5] : EARTH[3]);
  }
  line(g, 4, 10, 12, 12, EARTH[4]); line(g, 27, 10, 19, 12, EARTH[3]);
  // the bow: a heavy ring
  const bow = mask((x, y) => { const d = Math.hypot(x - 15.5, y - 13.5); return d <= 4.6 && d >= 2.2; });
  shade(g, bow, IRON);
  // the shank, long and thick, and the bit: two square wards to the right
  const shank = mask((x, y) => x > 14 && x < 17.2 && y > 17.5 && y < 30);
  shade(g, shank, IRON);
  const bit = mask((x, y) => (x > 16.8 && x < 22 && y > 23.5 && y < 29.5) && !(x > 18.8 && x < 20 && y > 25.5));
  shade(g, bit, IRON);
  // a collar where shank meets bow, bronze, the cellar's rust in the wards
  for (const x of [14, 15, 16, 17]) { put(g, x, 18, x < 16 ? BRONZE[3] : BRONZE[1]); put(g, x, 19, BRONZE[0]); }
  for (const [x, y] of [[20, 28], [21, 27], [18, 25], [15, 22], [16, 26]]) put(g, x, y, BRONZE[1]);
  return outlined(g);
}

const DRAWERS = Object.freeze({
  bannermans_pavise: bannermansPavise, lock_keepers_chain: lockKeepersChain, greened_bracers: greenedBracers,
  slake_waders: slakeWaders, stokers_ring: stokersRing, the_cold_candle: theColdCandle,
  riverstone_earrings: riverstoneEarrings, the_cellar_key: theCellarKey,
});

export function toImage(grid) {
  const img = createImage(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = grid[y][x];
    if (!c) continue;
    const n = parseInt(c.slice(1), 16), i = (y * 32 + x) * 4;
    img.data[i] = n >> 16; img.data[i + 1] = (n >> 8) & 255; img.data[i + 2] = n & 255; img.data[i + 3] = 255;
  }
  return img;
}

/** id -> () => the icon's grid. */
export const DRAW = Object.freeze({ ...DRAWERS });
/** The Signature ids this script draws (item-art.js ITEM_ART_AHEAD carries each until its ITEMS row lands). */
export const SIGNATURE_ICON_IDS = Object.freeze(Object.keys(DRAWERS));

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--out'), dir = i > 0 ? process.argv[i + 1] : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  for (const [id, fn] of Object.entries(DRAW)) writeFileSync(join(dir, id + '.png'), encodePNG(toImage(fn())));
  console.log('signature-icons: wrote ' + Object.keys(DRAW).length + ' icons to ' + dir);
}
