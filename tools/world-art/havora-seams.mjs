#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/havora-seams.mjs — HAVORA'S EDGES, DRAWN BY THE SEAMS TOOL (lane/a-havora-art 2026-11-16; Tyler: "the ground
// transitions look like shit", "can't we have a tile that blends the cobblestone into the dirt better").
//
// The town's ground is wang16 pairs drawn on the dual grid (compose.js blendTiles). Each pair's tileset had ONE tile per corner key,
// so every border was a ruled line with the same nubs every 32 px. This rebuilds the town's natural and cobble pairs with
// tools/world-art/seams.mjs transitionTiles (lane/a-ground-seams): from the pair's own two fill tiles (its '0000' and '1111',
// locked as the build locks them), `variants` tiles per key, each keeping the key's outer ring so any variant sits beside any
// other; compose.js's cellHash picks one per dual tile. Styles: ragged (grass and dirt, grass and the beach), bank (the river and
// the sea against grass and the beach), scatter (the square's setts on dirt and on grass: setts laid whole, loose ones out in the
// ground, a few missing, fading), rise (the mountain's rock over grass, dirt and the quarry's gravel: a raised mass with a face
// where the floor lies below it, lane/a-havora-seams-2, Tyler's gate: the rock read as flat grey paving cut on a ruler).
// The cell-scale raggedness of the same borders is src/world/core/ground-rough.js; the square's own edge is its painted apron
// (tools/world-art/hearth-plaza.mjs).
//
// A pair is one of two kinds:
//   kept     its untouched PixelLab sheet (art/world-src/havora-edges/<id>.png) and its base tile positions (the first rect of each
//            key in the sidecar, recorded in `edges.baseTiles` the first time) give its two fills
//   derived  (`fills`) no sheet of its own: each fill is a kept pair's fill ({ ref, key }), stepped up its ramps by `tones` (the
//            beach is the town dirt one value step paler: the sea washed it). Its sidecar is written whole (`lower`, `upper`).
// Either way the pair's source is written as a seams sheet (one row per variant, the 16 keys across, ON the palette, so the sidecar
// is material `native`) with its tiles. The one-material tiles keep only their plain fill (their variety is variety.mjs's), and
// that fill is the kept sheet's locked pixel for pixel. Deterministic (--check).
//
//   node tools/world-art/havora-seams.mjs            write every pair in PAIRS
//   node tools/world-art/havora-seams.mjs --check    exit 1 if a committed source or sidecar differs from a fresh run
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, crop, pixelHash, cloneImage } from './png.mjs';
import { lock } from './lock.mjs';
import { transitionTiles, tileSheet } from './seams.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = 32;
export const BASE_DIR = 'art/world-src/havora-edges';
/* the beach: the town dirt's colours one value step up their ramps, its stone pebbles gone to bleached shell */
const BEACH = Object.freeze({ '#a88457': '#c49a5c', '#8a6440': '#a88457', '#6e4c30': '#8a6440', '#553a26': '#6e4c30', '#aaa49a': '#c9bfa0' });
const GRASS = Object.freeze({ ref: 'common/havora_grass_water', key: '0000' });
const WATER = Object.freeze({ ref: 'common/havora_grass_water', key: '1111' });
const SAND = Object.freeze({ ref: 'common/havora_grass_earth', key: '1111', tones: BEACH });
const DIRT = Object.freeze({ ref: 'common/havora_grass_earth', key: '1111' });
const ROCK = Object.freeze({ ref: 'havora-floor/havora_grass_rock', key: '1111' });
/* the upper tier: the rock's joints and shadows one value step up (its body, lichen and moss as they are): weathered smooth, the cracks
   faint, so the high rock reads apart from the rock at its foot without a lighter field of paving */
const HIGHER = Object.freeze({ '#3a3a3e': '#4f4e52', '#4f4e52': '#6a6865' });
/* the mountain: a raised mass (seams.mjs `rise`); a wide sweep so a run of rock cells is no ruler, a face of 6 px under a lit lip */
const RISE = Object.freeze({ style: 'rise', variants: 4, sweep: 10, warp: 10, arch: true, face: 6, drop: 3 });
/* a shore that wanders: the border bows between the tile's pinned crossings (seams.mjs `arch`) */
const WANDER = Object.freeze({ sweep: 10, warp: 10, arch: true });
export const PAIRS = Object.freeze([
  Object.freeze({ ref: 'common/havora_grass_earth', style: 'ragged', variants: 4, seed: 11 }),
  Object.freeze(Object.assign({ ref: 'common/havora_grass_water', style: 'bank', variants: 4, seed: 13 }, WANDER)),
  Object.freeze({ ref: 'common/square_dirt_flag', style: 'scatter', unitUpper: true, variants: 4, seed: 31 }),
  Object.freeze({ ref: 'common/square_grass_flag', style: 'scatter', unitUpper: true, variants: 4, seed: 37 }),
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_grass_rock', seed: 41 }, RISE)),
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_earth_rock', seed: 43 }, RISE)),
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_gravel_rock', seed: 47 }, RISE)),
  /* the shore (lane/a-havora-seams-2: the sea met the grass on one ruled line): a beach between the meadow and the sea */
  Object.freeze({ ref: 'havora-floor/havora_grass_beach', style: 'ragged', variants: 4, seed: 53, sweep: 10, warp: 10, arch: true, lower: 'grass', upper: 'beach',
    fills: Object.freeze({ lower: GRASS, upper: SAND }),
    notes: 'The shore: the meadow grass ragged onto a beach of the town dirt one value step paler (tools/world-art/havora-seams.mjs, no generation).' }),
  Object.freeze({ ref: 'havora-floor/havora_beach_water', style: 'bank', variants: 4, seed: 59, sweep: 10, warp: 10, arch: true, shore: true, lower: 'beach', upper: 'water',
    fills: Object.freeze({ lower: SAND, upper: WATER }),
    notes: 'The shore: the beach wet along the sea\'s edge, the water\'s lip lit (tools/world-art/havora-seams.mjs, no generation).' }),
  /* the mountain's upper tier (lane/a-havora-seams-2): the rock a step lighter, risen over the rock on a second face, so the
     massif reads as a slope climbing away from the town and not one flat field of stone */
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_rock_peak', seed: 67 }, RISE, { lower: 'cliff', upper: 'peak',
    fills: Object.freeze({ lower: ROCK, upper: Object.freeze(Object.assign({ tones: HIGHER }, ROCK)) }),
    notes: 'The mountain\'s upper tier: its rock one value step up its ramps, risen over the rock with a face (tools/world-art/havora-seams.mjs, no generation).' })),
  /* the quarry's gravel against the dirt road, drawn from the town dirt and the quarry floor's own gravel (no second dirt) */
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_earth_gravel', style: 'ragged', variants: 4, seed: 73, lower: 'earth', upper: 'gravel',
    fills: Object.freeze({ lower: DIRT, upper: Object.freeze({ ref: 'havora-floor/havora_gravel_rock', key: '0000' }) }),
    notes: 'The quarry floor against the dirt road: the town dirt ragged onto the quarry gravel (tools/world-art/havora-seams.mjs, no generation; was a PixelLab pair with its own dirt and a sawtooth border).' }, WANDER)),
  Object.freeze({ ref: 'havora-floor/havora_earth_beach', style: 'ragged', variants: 4, seed: 61, sweep: 10, warp: 10, arch: true, lower: 'earth', upper: 'beach',
    fills: Object.freeze({ lower: DIRT, upper: SAND }),
    notes: 'The shore: the town dirt ragged onto the beach (tools/world-art/havora-seams.mjs, no generation).' }),
]);
const PLAIN = new Set(['0000', '1111']);

/** One pair's sheet and sidecar tiles from its two fill tiles. */
export function pairFromFills(p, lower, upper) {
  const o = { style: p.style, variants: p.variants, seed: p.seed, unitUpper: !!p.unitUpper };
  for (const k of ['sweep', 'warp', 'arch', 'face', 'drop', 'shore']) if (p[k] !== undefined) o[k] = p[k];
  const set = transitionTiles(lower, upper, o);
  for (const key of PLAIN) if (pixelHash(set.tiles[key][0]) !== pixelHash(key === '0000' ? lower : upper)) throw new Error(`havora-seams: ${p.ref} ${key} is not its own fill`);
  const { img, rects } = tileSheet(set);
  const tiles = {};
  for (const [key, list] of Object.entries(rects)) tiles[key] = (PLAIN.has(key) ? list.slice(0, 1) : list).map(([x, y]) => [x / T, y / T]);
  return { img, tiles };
}

/** One pair's sheet and sidecar tiles from its kept sheet and the sidecar's base tiles. */
export function pairSheet(p, sc, base) {
  const locked = lock(base, 'terrain');
  const fill = (key) => { const [c, r] = sc.tiles[key][0]; return crop(locked, c * T, r * T, T, T); };
  return pairFromFills(p, fill('0000'), fill('1111'));
}

/* a kept pair's sidecar, kept sheet and base tiles */
function kept(ref) {
  const [set, id] = ref.split('/');
  const keep = join(ROOT, BASE_DIR, id + '.png');
  if (!existsSync(keep)) throw new Error('havora-seams: no kept sheet for ' + ref + ' at ' + keep);
  const sc = JSON.parse(readFileSync(join(ROOT, 'art/world', set, id + '.json'), 'utf8'));
  const baseTiles = (sc.edges && sc.edges.baseTiles) || Object.fromEntries(Object.entries(sc.tiles).map(([k, v]) => [k, [v[0]]]));
  return { sc, base: decodePNG(readFileSync(keep)), baseTiles };
}

/** A derived pair's fill: a kept pair's fill tile, locked as it is, its colours stepped by `tones`. */
export function fillOf(f) {
  const k = kept(f.ref);
  const [c, r] = k.baseTiles[f.key][0];
  const tile = cloneImage(crop(lock(k.base, 'terrain'), c * T, r * T, T, T));
  if (f.tones) {
    const d = tile.data;
    for (let i = 0; i < d.length; i += 4) {
      const hex = '#' + [0, 1, 2].map((j) => d[i + j].toString(16).padStart(2, '0')).join('');
      const to = f.tones[hex];
      if (to) for (let j = 0; j < 3; j++) d[i + j] = parseInt(to.slice(1 + 2 * j, 3 + 2 * j), 16);
    }
  }
  return tile;
}

function main() {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const p of PAIRS) {
    const [set, id] = p.ref.split('/');
    const scPath = join(ROOT, 'art/world', set, id + '.json');
    let img, tiles, out;
    try {
      if (p.fills) {
        ({ img, tiles } = pairFromFills(p, fillOf(p.fills.lower), fillOf(p.fills.upper)));
        /* its pixels are its fills' own, cut from the kept PixelLab pairs: their provenance is its (the weighhouse's cut earth does the same) */
        const lab = [p.fills.lower, p.fills.upper].map((fl) => { const pl = kept(fl.ref).sc.pixellab || {}; return { ref: fl.ref, key: fl.key, tool: pl.tool, id: pl.id || pl.map }; });
        out = { id, class: 'terrain', kind: 'wang16', style: 's1', material: 'native', source: id + '.png', lower: p.lower, upper: p.upper, tiles,
          pixellab: { tool: 'cut', id: Array.from(new Set(lab.map((l) => l.id))).join(','), sources: lab, cost: 0 },
          edges: { tool: 'tools/world-art/havora-seams.mjs (tools/world-art/seams.mjs transitionTiles)', fills: p.fills, style: p.style,
            variants: p.variants, seed: p.seed, sweep: p.sweep, warp: p.warp, arch: p.arch, shore: p.shore }, notes: p.notes };
      } else {
        const k = kept(p.ref);
        ({ img, tiles } = pairSheet(p, { tiles: k.baseTiles }, k.base));
        out = Object.assign({}, k.sc, { material: 'native', tiles,
          edges: { tool: 'tools/world-art/havora-seams.mjs (tools/world-art/seams.mjs transitionTiles)', base: BASE_DIR + '/' + id + '.png',
            style: p.style, variants: p.variants, seed: p.seed, baseTiles: k.baseTiles } });
        for (const k of ['sweep', 'warp', 'arch', 'face', 'drop']) if (p[k] !== undefined) out.edges[k] = p[k];
      }
    } catch (e) { console.log('✗', e.message); bad++; continue; }
    const json = JSON.stringify(out, null, 2) + '\n';
    const srcPath = join(ROOT, 'art/world', set, out.source);
    if (check) {
      const same = existsSync(srcPath) && existsSync(scPath) && pixelHash(decodePNG(readFileSync(srcPath))) === pixelHash(img)
        && readFileSync(scPath, 'utf8').replace(/\r\n/g, '\n') === json;
      if (!same) { console.log('✗ havora-seams:', p.ref, 'differs from a fresh run'); bad++; }
      continue;
    }
    mkdirSync(dirname(srcPath), { recursive: true });
    writeFileSync(srcPath, encodePNG(img));
    writeFileSync(scPath, json);
    console.log('✓', p.ref, p.style, (Object.keys(tiles).length - 2) * p.variants, 'edge tiles');
  }
  if (check) console.log(bad ? '✗ havora-seams: RED' : '✓ havora-seams: every pair is a fresh run');
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main();
