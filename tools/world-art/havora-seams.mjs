#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/havora-seams.mjs — HAVORA'S EDGES, DRAWN BY THE SEAMS TOOL (lane/a-havora-art 2026-11-16; Tyler: "the ground
// transitions look like shit", "can't we have a tile that blends the cobblestone into the dirt better").
//
// The town's ground is wang16 pairs drawn on the dual grid (compose.js blendTiles). Each pair's tileset had ONE tile per corner key,
// so every border was a ruled line with the same nubs every 32 px. This rebuilds the town's natural and cobble pairs with
// tools/world-art/seams.mjs transitionTiles (lane/a-ground-seams): from the pair's own two fill tiles (its '0000' and '1111',
// locked as the build locks them), `variants` tiles per key, each keeping the key's outer ring so any variant sits beside any
// other; compose.js's cellHash picks one per dual tile. Styles: ragged (grass and dirt), bank (grass and the river), scatter
// (the square's setts on dirt and on grass: setts laid whole, loose ones out in the ground, a few missing, fading).
// The cell-scale raggedness of the same borders is src/world/core/ground-rough.js; the square's own edge is its painted apron
// (tools/world-art/hearth-plaza.mjs).
//
// Reads each pair's untouched sheet (art/world-src/havora-edges/<id>.png) and its base tile positions (the first rect of each key
// in the sidecar), writes the pair's source as a seams sheet (one row per variant, the 16 keys across, ON the palette, so the
// sidecar is material `native`) and its tiles. The one-material tiles keep only their plain fill (their variety is variety.mjs's),
// and that fill is the old atlas's pixel for pixel. Deterministic (--check).
//
//   node tools/world-art/havora-seams.mjs            write every pair in PAIRS
//   node tools/world-art/havora-seams.mjs --check    exit 1 if a committed source or sidecar differs from a fresh run
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, crop, pixelHash } from './png.mjs';
import { lock } from './lock.mjs';
import { transitionTiles, tileSheet } from './seams.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = 32;
export const BASE_DIR = 'art/world-src/havora-edges';
export const PAIRS = Object.freeze([
  Object.freeze({ ref: 'common/havora_grass_earth', style: 'ragged', variants: 4, seed: 11 }),
  Object.freeze({ ref: 'common/havora_grass_water', style: 'bank', variants: 4, seed: 13 }),
  Object.freeze({ ref: 'common/square_dirt_flag', style: 'scatter', unitUpper: true, variants: 4, seed: 31 }),
  Object.freeze({ ref: 'common/square_grass_flag', style: 'scatter', unitUpper: true, variants: 4, seed: 37 }),
]);
const PLAIN = new Set(['0000', '1111']);

/** One pair's sheet and sidecar from its kept sheet and the sidecar's base tiles. */
export function pairSheet(p, sc, base) {
  const locked = lock(base, 'terrain');
  const fill = (key) => { const [c, r] = sc.tiles[key][0]; return crop(locked, c * T, r * T, T, T); };
  const lower = fill('0000'), upper = fill('1111');
  const set = transitionTiles(lower, upper, { style: p.style, variants: p.variants, seed: p.seed, unitUpper: !!p.unitUpper });
  for (const key of PLAIN) if (pixelHash(set.tiles[key][0]) !== pixelHash(key === '0000' ? lower : upper)) throw new Error(`havora-seams: ${p.ref} ${key} is not its own fill`);
  const { img, rects } = tileSheet(set);
  const tiles = {};
  for (const [key, list] of Object.entries(rects)) tiles[key] = (PLAIN.has(key) ? list.slice(0, 1) : list).map(([x, y]) => [x / T, y / T]);
  return { img, tiles };
}

function main() {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const p of PAIRS) {
    const [set, id] = p.ref.split('/');
    const keep = join(ROOT, BASE_DIR, id + '.png');
    if (!existsSync(keep)) { console.log('✗ havora-seams: no kept sheet for', p.ref, 'at', keep); bad++; continue; }
    const scPath = join(ROOT, 'art/world', set, id + '.json');
    const sc = JSON.parse(readFileSync(scPath, 'utf8'));
    /* the base tiles: the kept sheet's own layout, recorded in `edges.baseTiles` the first time */
    const baseTiles = (sc.edges && sc.edges.baseTiles) || Object.fromEntries(Object.entries(sc.tiles).map(([k, v]) => [k, [v[0]]]));
    const { img, tiles } = pairSheet(p, { tiles: baseTiles }, decodePNG(readFileSync(keep)));
    const out = Object.assign({}, sc, { material: 'native', tiles,
      edges: { tool: 'tools/world-art/havora-seams.mjs (tools/world-art/seams.mjs transitionTiles)', base: BASE_DIR + '/' + id + '.png',
        style: p.style, variants: p.variants, seed: p.seed, baseTiles } });
    const json = JSON.stringify(out, null, 2) + '\n';
    const srcPath = join(ROOT, 'art/world', set, sc.source);
    if (check) {
      const same = pixelHash(decodePNG(readFileSync(srcPath))) === pixelHash(img) && readFileSync(scPath, 'utf8').replace(/\r\n/g, '\n') === json;
      if (!same) { console.log('✗ havora-seams:', p.ref, 'differs from a fresh run'); bad++; }
      continue;
    }
    writeFileSync(srcPath, encodePNG(img));
    writeFileSync(scPath, json);
    console.log('✓', p.ref, p.style, (Object.keys(tiles).length - 2) * p.variants, 'edge tiles');
  }
  if (check) console.log(bad ? '✗ havora-seams: RED' : '✓ havora-seams: every pair is a fresh run');
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main();
