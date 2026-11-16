#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/march-shield-icons.mjs — THE BARROW MARCH'S THREE SHIELDS, DRAWN BY RULE
// (designer, lane/d-audit-balance-1, 2026-11-15; the playthrough audit's F8. The Art Director judges and may replace each.)
//
// A Rare is a reveal, so a shield with no picture can't drop (tests/hunt-core/drop-tables.mjs loot-structure). Each icon's
// shape is data and its shading a rule, as in twin-icons.mjs, drawn from the item's own line (src/data/shields.js) in its
// tier's colours (the tier's sword and platebody use the same ramps), and each has its own outline so the three read apart
// from each other and from the round, the grate and the capped shield under them at the bag's 1x:
//   mithril_faced_shield  "a maple shield with a sheet of mithril over the front": a heater (flat top, pointed foot), a maple
//                         edge showing round a mithril face, a crease down the middle, four rivets.
//   runebound_shield      "a rune-metal shield the company gave its front rank": a long oval in the rune tier's blue steel,
//                         bound with a pale cross band and a boss where the bands meet.
//   ember_tower_shield    "a tall Emberforged shield ... still black from the pyres": a tall board with cut corners in dark
//                         iron, ember-red seams, soot at the foot.
//
// Every colour is an entry of hr-world-56-v2 (art/world/palette.json), binary alpha, 32x32, a 1 px #0b0a0c outline with its
// corners cut, lit from the upper left. tests/pixel-icons.mjs rule `drawn` holds the files to this script: edit the script
// and rerun it, never the PNG.
//
//   node tools/world-art/march-shield-icons.mjs            write assets/icons-bundle/pixel/items/<id>.png
//   node tools/world-art/march-shield-icons.mjs --out <d>  write to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { toImage } from './twin-icons.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');

const K = '#0b0a0c', SOOT = '#231d1f', SHADE = '#2f2723';
const EARTH = ['#2a1c14', '#3d2a1d', '#553a26', '#6e4c30', '#8a6440', '#a88457', '#c49a5c'];
const IRON = ['#2c2e33', '#4a4d54', '#6e727a', '#969aa1'];
const STEEL = ['#3a4652', '#5c6c7a', '#8a9aa8', '#c4ccd2'];
const MITHRIL = ['#2e4a52', '#4f7a80', '#86b4b4', '#c8e6e0'];
const FROST = ['#4fa8e8', '#a8e4ff'], BLOOD = ['#8e1f1f', '#c23a2a'], TORCH = ['#f2a03a', '#ffd36a'];

const CX = 15.5;
const blank = () => Array.from({ length: 32 }, () => Array(32).fill(null));
const put = (g, x, y, c) => { if (x >= 0 && x < 32 && y >= 0 && y < 32 && g[y][x]) g[y][x] = c; };

/** The set's outline: every empty pixel 4-touching art turns #0b0a0c, so corners stay cut. */
function outlined(g) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g[y][x]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = g[y + dy] && g[y + dy][x + dx];
      if (c) { out[y][x] = K; break; }
    }
  }
  return out;
}

/** A shield from its outline: `half(y)` is the half-width of row y (0 = no row). `paint(x, y, edge, lit)` colours a pixel: `edge` is how
    many pixels it sits inside the outline (0 = the outermost), `lit` runs +1 at the upper left to -1 at the lower right. */
function shield(half, paint, top, foot) {
  const g = blank();
  const inRow = (x, y) => y >= top && y <= foot && Math.abs(x - CX) <= half(y);
  const depth = (x, y) => {
    for (let d = 0; d < 4; d++) for (const [dx, dy] of [[d + 1, 0], [-d - 1, 0], [0, d + 1], [0, -d - 1]]) if (!inRow(x + dx, y + dy)) return d;
    return 4;
  };
  const cy = (top + foot) / 2, span = (foot - top) / 2 + 11;
  for (let y = top; y <= foot; y++) for (let x = 0; x < 32; x++) {
    if (!inRow(x, y)) continue;
    g[y][x] = paint(x, y, depth(x, y), -((x - CX) + (y - cy)) / span);
  }
  return g;
}
const step = (ramp, lit, at = [0.35, -0.05, -0.45]) => ramp[lit > at[0] ? 3 : lit > at[1] ? 2 : lit > at[2] ? 1 : 0];

/* a heater: flat across the top, straight to the middle, then drawn in to a point */
function mithrilFacedShield() {
  const half = (y) => (y <= 14 ? 11.5 : 11.5 * Math.sqrt(Math.max(0, 1 - ((y - 14) / 14.6) ** 2)));
  const g = shield(half, (x, y, edge, lit) => {
    if (edge <= 1) return EARTH[lit > 0.3 ? 5 : lit > -0.3 ? 4 : 3];           // the maple edge
    if (edge === 2) return MITHRIL[0];                                          // the sheet's turned lip
    if (x === 15) return MITHRIL[3];                                            // the crease: a lit ridge, its shade beside it
    if (x === 16) return MITHRIL[0];
    return step(MITHRIL, lit + (x < 15 ? 0.12 : -0.12));
  }, 3, 28);
  for (const [x, y] of [[8, 7], [23, 7], [9, 17], [22, 17]]) { put(g, x, y, MITHRIL[3]); put(g, x + 1, y + 1, MITHRIL[0]); }   // rivets
  for (const [x, y] of [[10, 9], [11, 8], [12, 7]]) put(g, x, y, MITHRIL[3]);    // a glint across the upper left
  return outlined(g);
}

/* a long oval, bound with a cross band and a boss */
function runeboundShield() {
  const half = (y) => 10.5 * Math.sqrt(Math.max(0, 1 - ((y - 15.5) / 13.6) ** 2)) + 0.4;
  const g = shield(half, (x, y, edge, lit) => {
    if (edge === 0) return STEEL[lit > 0.2 ? 2 : 0];                             // the rolled rim
    const band = x === 15 || x === 16 || y === 15 || y === 16;
    if (band) return lit > 0 ? FROST[1] : FROST[0];                             // the binding
    if (x === 14 || x === 17 || y === 14 || y === 17) return STEEL[0];          // the band's seat
    return step(STEEL, lit, [0.4, 0, -0.4]);
  }, 2, 29);
  for (let y = 13; y <= 18; y++) for (let x = 13; x <= 18; x++) {              // the boss where the bands meet
    const r = Math.hypot(x - CX, y - 15.5);
    if (r > 3.1) continue;
    put(g, x, y, r > 2.3 ? STEEL[0] : (x + y) < 30 ? STEEL[3] : (x + y) < 32 ? STEEL[2] : STEEL[1]);
  }
  put(g, 14, 14, FROST[1]);
  for (const [x, y] of [[9, 9], [22, 9], [9, 22], [22, 22]]) put(g, x, y, STEEL[3]);   // a stud in each quarter
  return outlined(g);
}

/* a tall board with cut corners, burned black, the seams still glowing */
function emberTowerShield() {
  const half = (y) => (y === 2 || y === 29 ? 6.5 : y === 3 || y === 28 ? 7.5 : 8.5);
  const g = shield(half, (x, y, edge, lit) => {
    if (edge === 0) return IRON[lit > 0.25 ? 3 : lit > -0.25 ? 2 : 1];           // the iron frame
    if (edge === 1) return IRON[0];
    if (y >= 25) return (x + y) % 2 ? SOOT : SHADE;                             // soot at the foot
    if (x === 15 || x === 16) return y % 5 === 0 ? TORCH[0] : x === 15 ? BLOOD[1] : BLOOD[0];   // the middle seam
    if (y === 11 || y === 19) return x % 4 === 1 ? TORCH[0] : BLOOD[0];         // the cross seams
    return lit > 0.3 ? IRON[2] : lit > -0.2 ? IRON[1] : IRON[0];
  }, 2, 29);
  for (const [x, y] of [[10, 5], [21, 5], [10, 26], [21, 26]]) put(g, x, y, IRON[3]);   // the frame's bolts
  put(g, 15, 10, TORCH[1]); put(g, 16, 20, TORCH[1]);                            // the hottest points
  for (const [x, y] of [[11, 7], [12, 14], [20, 16], [19, 22], [12, 22]]) put(g, x, y, SOOT);   // burn pits
  return outlined(g);
}

export const DRAW = Object.freeze({ mithril_faced_shield: mithrilFacedShield, runebound_shield: runeboundShield, ember_tower_shield: emberTowerShield });
export { toImage };

if (isMain(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  const dir = at > 0 ? process.argv[at + 1] : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  for (const [id, draw] of Object.entries(DRAW)) writeFileSync(join(dir, id + '.png'), encodePNG(toImage(draw())));
  console.log('march-shield-icons: wrote ' + Object.keys(DRAW).length + ' icons to ' + dir);
}
