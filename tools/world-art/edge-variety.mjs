#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/edge-variety.mjs — A TRANSITION NEVER STAMPS ONE EDGE (lane/a-havora-art 2026-11-16; Tyler: "the ground
// transitions look like shit"; ART_DIRECTION section 5).
//
// A wang16 pair has ONE tile per corner key, so every straight run of a town edge (grass to dirt, grass to the river) repeated
// the same nubs, pebbles and rim every 32 px. This writes VARIANTS of each pair's fourteen transition tiles from the tile's own
// pixels, drawing nothing of its own: each variant is the tile resampled through a smooth displacement field that is ZERO on
// every edge of the tile (a product of two sine windows, a skewed peak, a second harmonic, a seeded sign), so the boundary
// wanders up to `amp` px inside the tile and meets its neighbours exactly where the original did: no seam, whichever variant
// the neighbour drew. compose.js already picks a key's variant per dual tile (cellHash). The two one-material tiles (0000,
// 1111) are untouched: their variety (variety.mjs) is their own.
//
// The pair's untouched sheet is kept at art/world-src/havora-edges/<id>.png; the source this writes is that sheet with
// `variants` warped copies laid below it, and the sidecar's tiles list the original first, then the copies. Deterministic, so a
// rerun writes the same pixels (--check). The warp only moves the source's own (un-locked) pixels: the build locks it as before.
//
//   node tools/world-art/edge-variety.mjs            write every pair in PAIRS
//   node tools/world-art/edge-variety.mjs --check    exit 1 if a committed source or sidecar differs from a fresh run
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, createImage, blit, pixelHash } from './png.mjs';
import { hash2 } from './ground-finish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = 32;
export const BASE_DIR = 'art/world-src/havora-edges';
/* the town's NATURAL edges (a paved or built edge, a kerb, a quay, a pier, stays straight: it was laid straight) */
export const PAIRS = Object.freeze([
  Object.freeze({ ref: 'common/havora_grass_earth', variants: 3, amp: 4.5, seed: 11 }),
  Object.freeze({ ref: 'common/havora_grass_water', variants: 3, amp: 3.5, seed: 13 }),
]);

const PLAIN = new Set(['0000', '1111']);

/** The displacement at (u, v) of variant `v` of tile key `key`: [dx, dy] px, zero on the tile's edges. */
export function field(u, v, key, n, o) {
  const r = (k) => hash2(parseInt(key, 2) * 31 + n, k, o.seed);
  const skew = (t, g) => Math.pow((t + 0.5) / T, g);
  const gx = 0.7 + 0.7 * r(1), gy = 0.7 + 0.7 * r(2);
  const wx = Math.sin(Math.PI * skew(u, gx)), wy = Math.sin(Math.PI * skew(v, gy));
  const h2x = Math.sin(2 * Math.PI * skew(u, gx)) * (r(3) - 0.5) * 0.8, h2y = Math.sin(2 * Math.PI * skew(v, gy)) * (r(4) - 0.5) * 0.8;
  const ax = o.amp * (0.35 + 0.65 * r(5)) * (r(6) < 0.5 ? -1 : 1), ay = o.amp * (0.35 + 0.65 * r(7)) * (r(8) < 0.5 ? -1 : 1);
  return [ax * wx * wy * (1 + h2y), ay * wx * wy * (1 + h2x)];
}

/** One warped copy of the T x T tile at (sx, sy) of `sheet`, written at (dx, dy) of `out`. */
function warpTile(sheet, sx, sy, out, dx, dy, key, n, o) {
  for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
    const [fx, fy] = field(u, v, key, n, o);
    const su = Math.max(0, Math.min(T - 1, Math.round(u - fx))), sv = Math.max(0, Math.min(T - 1, Math.round(v - fy)));
    const s = ((sy + sv) * sheet.width + sx + su) * 4, d = ((dy + v) * out.width + dx + u) * 4;
    out.data[d] = sheet.data[s]; out.data[d + 1] = sheet.data[s + 1]; out.data[d + 2] = sheet.data[s + 2]; out.data[d + 3] = sheet.data[s + 3];
  }
}

/** A pair's source and sidecar from its kept sheet: { sheet, sc }. Pure given the files. */
export function edgePair(p) {
  const [set, id] = p.ref.split('/');
  const sc = JSON.parse(readFileSync(join(ROOT, 'art/world', set, id + '.json'), 'utf8'));
  const base = decodePNG(readFileSync(join(ROOT, BASE_DIR, id + '.png')));
  const rows = base.height / T;
  const sheet = createImage(base.width, base.height * (1 + p.variants));
  blit(sheet, base, 0, 0, base.width, base.height, 0, 0);
  const tiles = {};
  for (const [key, cells] of Object.entries(sc.tiles)) {
    const [c, r] = cells[0];
    tiles[key] = [[c, r]];
    if (PLAIN.has(key)) continue;
    for (let n = 1; n <= p.variants; n++) {
      warpTile(base, c * T, r * T, sheet, c * T, (r + n * rows) * T, key, n, p);
      tiles[key].push([c, r + n * rows]);
    }
  }
  sc.tiles = tiles;
  sc.edges = { tool: 'tools/world-art/edge-variety.mjs', base: BASE_DIR + '/' + id + '.png', variants: p.variants, amp: p.amp, seed: p.seed };
  return { set, id, sheet, sc };
}

function main() {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const p of PAIRS) {
    const [set, id] = p.ref.split('/');
    const keep = join(ROOT, BASE_DIR, id + '.png');
    if (!existsSync(keep)) {
      if (check) { console.log('✗ edge-variety: no kept sheet for', p.ref); bad++; continue; }
      mkdirSync(join(ROOT, BASE_DIR), { recursive: true });
      copyFileSync(join(ROOT, 'art/world', set, id + '.png'), keep);
    }
    const { sheet, sc } = edgePair(p);
    const srcPath = join(ROOT, 'art/world', set, sc.source), scPath = join(ROOT, 'art/world', set, id + '.json');
    const json = JSON.stringify(sc, null, 2) + '\n';
    if (check) {
      const same = pixelHash(decodePNG(readFileSync(srcPath))) === pixelHash(sheet) && readFileSync(scPath, 'utf8').replace(/\r\n/g, '\n') === json;
      if (!same) { console.log('✗ edge-variety:', p.ref, 'differs from a fresh run'); bad++; }
      continue;
    }
    writeFileSync(srcPath, encodePNG(sheet));
    writeFileSync(scPath, json);
    console.log('✓', p.ref, (Object.keys(sc.tiles).length - 2) * p.variants, 'edge variants');
  }
  if (check) console.log(bad ? '✗ edge-variety: RED' : '✓ edge-variety: every pair is a fresh run');
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main();
