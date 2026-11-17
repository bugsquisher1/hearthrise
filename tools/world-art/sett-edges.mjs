#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/sett-edges.mjs — A COBBLE LANE FRAYS INTO THE DIRT (lane/a-havora-art 2026-11-16; Tyler: "can't we have a
// tile that blends the cobblestone into the dirt better").
//
// Havora's cobble lanes are the square_*_flag pairs (grey setts in dark joints), and every edge tile laid its setts to a ruled
// line with bare dirt or grass beyond it. This writes VARIANTS of each pair's fourteen transition tiles from the tiles' own
// pixels: the setts are found as blocks (connected runs of non-joint pixels in the pair's all-setts tile), and along the edge,
// per variant and seeded, a sett is LIFTED (its place filled with the dirt or grass that tile has there) or a LOOSE sett is
// laid out in the dirt where one would have been, a pixel off its grid, ringed in its own joint colour, thinning out with the
// distance from the edge. Only blocks clear of the tile's border change, so every variant meets its neighbours exactly as the
// original tile does, and compose.js picks one per dual tile (cellHash). Nothing is drawn that is not a sett, a joint or the
// ground the tile already holds.
//
// The pair's untouched sheet is kept at art/world-src/havora-edges/<id>.png; this LOCKS it as the build does (material terrain)
// and writes the sheet on the palette with the variants below it, so the sidecar is material `native` and the original tiles
// are the old atlas's pixel for pixel. Deterministic (--check).
//
//   node tools/world-art/sett-edges.mjs            write every pair in PAIRS
//   node tools/world-art/sett-edges.mjs --check    exit 1 if a committed source or sidecar differs from a fresh run
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, createImage, blit, pixelHash } from './png.mjs';
import { lock } from './lock.mjs';
import { hash2 } from './ground-finish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = 32;
export const BASE_DIR = 'art/world-src/havora-edges';
export const PAIRS = Object.freeze([
  Object.freeze({ ref: 'common/square_dirt_flag', variants: 3, seed: 31 }),
  Object.freeze({ ref: 'common/square_grass_flag', variants: 3, seed: 37 }),
]);
/* a joint: the dark greys between the setts (and the outline darks) */
const JOINT = new Set(['#0b0a0c', '#17141a', '#231d1f', '#2f2723', '#3a3a3e', '#4f4e52', '#2c2e33']);
const PLAIN = new Set(['0000', '1111']);

const hexAt = (d, i) => '#' + [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('');
const at = (img, x, y) => (y * img.width + x) * 4;

/* a sett's stone: the light greys of the stone ramp (and a bone highlight) */
const STONE = new Set(['#6a6865', '#8a867d', '#aaa49a', '#c9bfa0', '#6e727a']);

/** The setts of the tile at (sx, sy): [{ px: [[u, v]], ring: [[u, v]], box: [u0, v0, u1, v1] }]; a sett's pixels pass `stone`. */
function blocksOf(img, sx, sy, stone = (hex) => !JOINT.has(hex)) {
  const seen = new Uint8Array(T * T), out = [];
  const isStone = (u, v) => stone(hexAt(img.data, at(img, sx + u, sy + v)));
  for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
    if (seen[v * T + u] || !isStone(u, v)) continue;
    const px = [], stack = [[u, v]];
    seen[v * T + u] = 1;
    while (stack.length) {
      const [a, b] = stack.pop(); px.push([a, b]);
      for (const [c, d] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
        if (c < 0 || d < 0 || c >= T || d >= T || seen[d * T + c] || !isStone(c, d)) continue;
        seen[d * T + c] = 1; stack.push([c, d]);
      }
    }
    if (px.length < 12) continue;
    const us = px.map((p) => p[0]), vs = px.map((p) => p[1]);
    const box = [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
    const inBlock = new Set(px.map(([a, b]) => a + ',' + b)), ring = [];
    for (const [a, b] of px) for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
      const c = a + du, d = b + dv, k = c + ',' + d;
      if (c < 0 || d < 0 || c >= T || d >= T || inBlock.has(k)) continue;
      inBlock.add(k); ring.push([c, d]);
    }
    out.push({ px, ring, box });
  }
  return out;
}

/** The finished sheet and its tiles: the locked base, then `variants` copies of the base's layout with frayed edges. */
export function settSheet(base, sc, p) {
  const locked = lock(base, sc.material === 'native' ? 'native' : 'terrain');
  const rows = locked.height / T, cols = locked.width / T;
  const sheet = createImage(locked.width, locked.height * (1 + p.variants));
  blit(sheet, locked, 0, 0, locked.width, locked.height, 0, 0);
  const cell = (key) => sc.tiles[key][0];
  const [fc, fr] = cell('1111'), [lc, lr] = cell('0000');
  /* the lane's WHOLE setts (clear of its tile's border, not a sliver), the stone a loose piece is broken from */

  const flagAt = (u, v) => hexAt(locked.data, at(locked, fc * T + u, fr * T + v));
  const lowAt = (u, v) => hexAt(locked.data, at(locked, lc * T + u, lr * T + v));
  const tiles = {};
  for (const [key, cells] of Object.entries(sc.tiles)) {
    const [c, r] = cells[0];
    tiles[key] = [[c, r]];
    if (PLAIN.has(key)) continue;
    const tileAt = (u, v) => hexAt(locked.data, at(locked, c * T + u, r * T + v));
    const inT = (u, v) => u >= 0 && v >= 0 && u < T && v < T;
    /* the tile's own ground (dirt or grass: not a stone grey, not a joint) and its own setts */
    const isLow = (u, v) => inT(u, v) && !STONE.has(tileAt(u, v)) && !JOINT.has(tileAt(u, v));
    const isSett = (u, v) => inT(u, v) && STONE.has(tileAt(u, v));
    const near = (pxs, test, d) => pxs.some(([u, v]) => { for (let dv = -d; dv <= d; dv++) for (let du = -d; du <= d; du++) if (test(u + du, v + dv)) return true; return false; });
    for (let n = 1; n <= p.variants; n++) {
      const ox = c * T, oy = (r + n * rows) * T;
      blit(sheet, locked, c * T, r * T, T, T, ox, oy);
      const put = (u, v, hex) => { const i = at(sheet, ox + u, oy + v); sheet.data[i] = parseInt(hex.slice(1, 3), 16); sheet.data[i + 1] = parseInt(hex.slice(3, 5), 16); sheet.data[i + 2] = parseInt(hex.slice(5, 7), 16); sheet.data[i + 3] = 255; };
      const taken = new Set();
      /* loose setts out in the ground: a broken piece of a sett from the lane (a w x h patch of its stone, all stone, corners
         knocked off, ringed in the joint grey, its lower and right side in the deeper grey: lit from the upper left), laid
         where the ground has room for it, clear of the border, close to the edge (and once in a while a little further out) */
      let laid = 0;
      const roll0 = hash2(parseInt(key, 2), n, p.seed + 19), want = roll0 < 0.45 ? 0 : roll0 < 0.85 ? 1 : 2;
      for (let t = 0; t < 120 && laid < want; t++) {
        const w = 5 + Math.floor(hash2(t, n, p.seed + 11) * 4), h = 4 + Math.floor(hash2(t, n, p.seed + 13) * 3);
        const su = Math.floor(hash2(t, n, p.seed + 15) * (T - w)), sv = Math.floor(hash2(t, n, p.seed + 17) * (T - h));
        let stone = true;
        for (let j = 0; j < h && stone; j++) for (let i = 0; i < w; i++) if (!STONE.has(flagAt(su + i, sv + j))) { stone = false; break; }
        if (!stone) continue;
        const u0 = 2 + Math.floor(hash2(t, n, p.seed + 5) * (T - 4 - w)), v0 = 2 + Math.floor(hash2(t, n, p.seed + 7) * (T - 4 - h));
        const corner = (i, j) => (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
        const inBody = (i, j) => i >= 0 && j >= 0 && i < w && j < h && !corner(i, j);
        const body = [], ring = [];
        for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
          if (inBody(i, j)) { body.push([u0 + i, v0 + j, su + i, sv + j]); continue; }
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inBody(i + a, j + b))) ring.push([u0 + i, v0 + j, i >= w - 1 || j >= h - 1]);
        }
        if (!body.concat(ring).every(([u, v]) => u >= 1 && v >= 1 && u < T - 1 && v < T - 1 && isLow(u, v) && !taken.has(u + ',' + v))) continue;
        const pxs = body.map(([u, v]) => [u, v]);
        const close = near(pxs, isSett, 5), mid = !close && near(pxs, isSett, 11);
        if (!(close ? hash2(t, n, p.seed + 9) < 0.45 : mid && hash2(t, n, p.seed + 9) < 0.7)) continue;
        for (const [u, v, low] of ring) { put(u, v, low ? '#3a3a3e' : '#4f4e52'); taken.add(u + ',' + v); }
        for (const [u, v, a, b] of body) { const hex = flagAt(a, b); put(u, v, STONE.has(hex) ? hex : '#8a867d'); taken.add(u + ',' + v); }
        laid++;
      }
      tiles[key].push([c, r + n * rows]);
    }
  }
  return { sheet, tiles, cols };
}

function main() {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const p of PAIRS) {
    const [set, id] = p.ref.split('/');
    const keep = join(ROOT, BASE_DIR, id + '.png');
    const scPath = join(ROOT, 'art/world', set, id + '.json');
    const sc = JSON.parse(readFileSync(scPath, 'utf8'));
    if (!existsSync(keep)) {
      if (check) { console.log('✗ sett-edges: no kept sheet for', p.ref); bad++; continue; }
      mkdirSync(join(ROOT, BASE_DIR), { recursive: true });
      copyFileSync(join(ROOT, 'art/world', set, sc.source), keep);
    }
    /* the sidecar's base tiles are the first of each key's list; its material is the base's (terrain) until this writes it */
    const baseSc = Object.assign({}, sc, { material: 'terrain', tiles: Object.fromEntries(Object.entries(sc.tiles).map(([k, v]) => [k, [v[0]]])) });
    const { sheet, tiles } = settSheet(decodePNG(readFileSync(keep)), baseSc, p);
    const out = Object.assign({}, sc, { material: 'native', tiles,
      edges: { tool: 'tools/world-art/sett-edges.mjs', base: BASE_DIR + '/' + id + '.png', variants: p.variants, seed: p.seed } });
    const json = JSON.stringify(out, null, 2) + '\n';
    const srcPath = join(ROOT, 'art/world', set, sc.source);
    if (check) {
      const same = pixelHash(decodePNG(readFileSync(srcPath))) === pixelHash(sheet) && readFileSync(scPath, 'utf8').replace(/\r\n/g, '\n') === json;
      if (!same) { console.log('✗ sett-edges:', p.ref, 'differs from a fresh run'); bad++; }
      continue;
    }
    writeFileSync(srcPath, encodePNG(sheet));
    writeFileSync(scPath, json);
    console.log('✓', p.ref, (Object.keys(tiles).length - 2) * p.variants, 'frayed edge variants');
  }
  if (check) console.log(bad ? '✗ sett-edges: RED' : '✓ sett-edges: every pair is a fresh run');
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main();
