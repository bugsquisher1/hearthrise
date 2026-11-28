#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/arrowhead-icons.mjs — THE ARROWHEADS, ONE FAMILY, DRAWN BY RULE
// (Art Director, lane/icons-arrowheads-signatures, 2026-11-28; replaces job-face-icons.mjs's re-dyed Barrow Nail, which read as a
// nail or a peg beside the arrows it makes).
//
// An arrowhead is a fletcher's good, not an arrow: so no shaft and no vanes (those are the arrows' own read), two loose barbed heads
// lying parallel on the diagonal, the near one large, the far one smaller and behind, points to the upper right. Each head is a
// polygon in its own axis (tip, the widest point, the swept barb, the notch, the socket) rasterised at pixel centres, then shaded by
// rule: the face toward the light (upper left) one step up, a centre ridge the top step, the face away one step down, the rims at the
// ends of the ramp, the socket a tube with a bound ring and a dark mouth. Tiers differ by their bar's own metal (the bars and the
// arrows use the same ramps), and the two top bands by one mark each:
//   bronze, iron, steel, mithril   their metal ramps (art/world/palette.json), plain
//   rune                           a steel head with a frost rune cut down the lit face (the Rune Arrows' frost)
//   ember                          a blackened head whose edges are still hot: blood into torch on the rims, the tip torch-white
// Every colour is an entry of hr-world-56-v2, binary alpha, 32x32, a 1 px #0b0a0c outline with its corners cut, lit from the upper
// left. tests/pixel-icons.mjs rule `drawn` holds the files to this script: edit the script and rerun it, never the PNG.
//
//   node tools/world-art/arrowhead-icons.mjs            write assets/icons-bundle/pixel/items/<id>.png
//   node tools/world-art/arrowhead-icons.mjs --out <d>  write to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');

const K = '#0b0a0c';
/* each tier: [deep, dark, mid, lit, top] (dark to light) and the socket's binding */
const METAL = Object.freeze({
  bronze: ['#2f2723', '#4a2e18', '#7a4f26', '#a8743a', '#cfa25c'],
  iron: ['#231d1f', '#2c2e33', '#4a4d54', '#6e727a', '#969aa1'],
  steel: ['#2c2e33', '#3a4652', '#5c6c7a', '#8a9aa8', '#c4ccd2'],
  mithril: ['#231d1f', '#2e4a52', '#4f7a80', '#86b4b4', '#c8e6e0'],
  rune: ['#17141a', '#2c2e33', '#3a4652', '#5c6c7a', '#8a9aa8'],
  ember: ['#17141a', '#2f2723', '#4f4e52', '#6a6865', '#8a867d'],
  /* band 6 (lane/kit-bands-6-9, 09 4.16): plain, in Dawnsteel's ramp (step-tier-icons.mjs RAMPS.dawn), a placeholder for the Art Director */
  dawn: ['#3a4652', '#5c6c7a', '#8a9aa8', '#c4ccd2', '#e6dcbc'],
});
const FROST = ['#4fa8e8', '#a8e4ff'];
const HOT = ['#8e1f1f', '#c23a2a', '#f2a03a', '#ffd36a'];

/* A head on the pixel lattice, so every edge is a clean pixel line. From its tip pixel (x, y), p = dy - dx runs down the axis toward
   the socket (lower left) and q = -(dx + dy) across it, positive on the lit (upper left) side; a step of one pixel moves p or q by 1.
   The cutting edges run at q = p / 3 (a 1:2 pixel stair), the barbs' backs along the axis (a 45 degree run), their inner edges back
   to the socket at 45 degrees in (p, q) (a straight pixel row or column). P1 the widest point (H = P1 / 3), P2 the barb's tip, S the
   socket's half width, PL the socket's end. */
const HEADS = Object.freeze([
  { tip: [29, 14], P1: 15, P2: 20, S: 1, PL: 27 },
  { tip: [25, 3], P1: 21, P2: 27, S: 2, PL: 36 },
]);

/** one head's mask: (x, y) -> { p, q, part, PL } or null */
function headMask(h) {
  const H = Math.floor(h.P1 / 3), Pn = h.P2 - (H - h.S);
  const m = Array.from({ length: 32 }, () => Array(32).fill(null));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x - h.tip[0], dy = y - h.tip[1], p = dy - dx, q = -(dx + dy), aq = Math.abs(q);
    let inside;
    if (p < 0 || p > h.PL) inside = false;
    else if (p <= h.P1) inside = aq * 3 <= p + 1;
    else if (p <= h.P2) inside = aq <= H && (aq <= h.S || aq >= h.S + (p - Pn));
    else inside = aq <= h.S;
    if (inside) m[y][x] = { p, q, part: p > Pn ? 'socket' : 'blade', PL: h.PL, P1: h.P1 };
  }
  return m;
}

function shadeHead(m, ramp, tier) {
  const [deep, dark, mid, lit, top] = ramp;
  const g = Array.from({ length: 32 }, () => Array(32).fill(null));
  const inside = (x, y) => y >= 0 && y < 32 && x >= 0 && x < 32 && !!m[y][x];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const p = m[y][x];
    if (!p) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    let c;
    if (p.part === 'socket') {
      const fromEnd = p.PL - p.p;
      if (fromEnd < 2) c = deep;                                   // the socket's mouth
      else if (fromEnd === 4 || fromEnd === 5) c = dark;           // a bound ring
      else c = p.q > 0 ? lit : p.q === 0 ? mid : dark;
    } else if (p.q === 0) c = top;                                 // the ridge
    else if (p.q > 0) c = edge ? top : lit;                        // the lit face, its rim
    else c = p.q === -1 && !edge ? mid : dark;                     // the face away: mid by the ridge, dark to its rim
    if (tier === 'ember' && p.part === 'blade') {
      /* still hot from the forge: the point white-gold, cooling through torch and blood into the blackened body */
      const t = p.p / p.PL, lit = p.q >= 0;
      if (t < 0.1) c = HOT[3];
      else if (t < 0.22) c = lit ? HOT[3] : HOT[2];
      else if (t < 0.34) c = lit ? HOT[2] : HOT[1];
      else if (t < 0.44) c = lit ? HOT[1] : HOT[0];
      else if (t < 0.52 && lit) c = HOT[0];
    }
    g[y][x] = c;
  }
  if (tier === 'rune') {
    /* a frost rune down the lit face: a short stroke and two ticks, cut a pixel in from the ridge */
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const p = m[y][x];
      if (!p || p.part !== 'blade' || p.p < 6 || p.p > 0.75 * p.P1) continue;
      if (p.q === 2) g[y][x] = p.p % 6 < 2 ? FROST[1] : FROST[0];
    }
  }
  return g;
}

/** The finished grid for a tier: the far head, then the near one over it with its own outline. */
export function drawGrid(tier) {
  const ramp = METAL[tier];
  if (!ramp) throw new Error('arrowhead-icons: no tier ' + tier);
  const out = Array.from({ length: 32 }, () => Array(32).fill(null));
  for (const h of HEADS) {
    const m = headMask(h), g = shadeHead(m, ramp, tier);
    /* outline this head against everything under it: the near head's rim cuts into the far one */
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (m[y][x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < 32 && xx >= 0 && xx < 32 && m[yy][xx]) { out[y][x] = K; break; }
      }
    }
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (g[y][x]) out[y][x] = g[y][x];
  }
  return out;
}

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

const IDS = Object.freeze({ bronze_arrowheads: 'bronze', iron_arrowheads: 'iron', steel_arrowheads: 'steel',
  mithril_arrowheads: 'mithril', rune_arrowheads: 'rune', ember_arrowheads: 'ember',
  dawn_arrowheads: 'dawn' });
/** id -> () => the icon's grid. */
export const DRAW = Object.freeze(Object.fromEntries(Object.entries(IDS).map(([id, tier]) => [id, () => drawGrid(tier)])));

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--out'), dir = i > 0 ? process.argv[i + 1] : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  for (const [id, fn] of Object.entries(DRAW)) writeFileSync(join(dir, id + '.png'), encodePNG(toImage(fn())));
  console.log('arrowhead-icons: wrote ' + Object.keys(DRAW).length + ' icons to ' + dir);
}
