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
import { lock, inPalette } from './lock.mjs';
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
/* THE MOUNTAIN'S ROCK (lane/a-havora-rock 2026-11-17; Tyler's gate: the mountain read as "a flat grey field of cobble/flagstone plates
   with boulders on it"). The rock is no longer the old pair's plated fill: it is the top of a granite pro tileset drawn on the palette
   (PixelLab 6c5f1090, 15 gens; hr-world-56-v2's stone, shadow, moss and earth ramps, max 10 colours: rough, low-contrast mottled rock
   with no slabs; the four other rolls are kept beside it, art/world-src/gen-2026-11-17/01-havora-rock/01-note.json), imported as it
   came (every pixel is a palette entry, checked), and its cliff is that tileset's own drawn face: 14 rows of its tall cliff tile
   (vertical cracks and ledges, darkest at the foot) laid down every south edge by seams.mjs rise's `faceTex`, and a 4 px strip of
   the same wall down each side, the west side lit. */
export const CRAG_SHEET = 'art/world-src/gen-2026-11-17/01-havora-rock/r5-6c5f1090/6c5f1090-sheet.png';
/* the mountain's slopes ('^'): the granite as drawn */
const CRAG_LOW = Object.freeze({ sheet: CRAG_SHEET, at: Object.freeze([0, 192]) });
/* its upper terraces ('M'): the same granite, its body a value step up, so each terrace's face steps up onto a sunlit top */
const UP = Object.freeze({ '#4f4e52': '#6a6865', '#6a6865': '#8a867d' });
const CRAG = Object.freeze(Object.assign({ tones: UP }, CRAG_LOW));
const CRAG_LAB = Object.freeze({ tool: 'create_topdown_tileset', id: '6c5f1090-69c7-4038-99b7-97275609804b', upper: '1024560d-ecae-42a3-905f-7776b5d71c3e',
  params: Object.freeze({ mode: 'pro', tile_size: 32, view: 'high top-down', transition_size: 0.5, max_colors: 10, detail: 'low detail', palette: 'hr-world-56-v2 stone, shadow, moss, earth ramps' }), cost: 15 });
/* THE QUARRY FLOOR (lane/a-havora-quarry 2026-11-17; Tyler on live: the floor between the terraces was "a flat, featureless blue-grey
   with even dots", the old pair's iron-ramp gravel): the granite family worn down. The slope granite one value step down its stone ramp,
   with the chips of a quarry-grit pro tileset (PixelLab 65e9d685, 15 gens, same palette ramps, max 9 colours) laid over it, each chip a
   step down and its brightest orange to an earth brown: trodden grit on the mountain's own rock, warm, no blue. */
const QUARRY_CHIPS = 'art/world-src/gen-2026-11-17/02-havora-quarry/r2-65e9d685/65e9d685-sheet.png';
const DOWN = Object.freeze({ '#8a867d': '#6a6865', '#6a6865': '#4f4e52', '#4f4e52': '#3a3a3e', '#3a3a3e': '#2f2723' });
const QUARRY = Object.freeze(Object.assign({ tones: DOWN }, CRAG_LOW, { over: Object.freeze({ sheet: QUARRY_CHIPS, at: Object.freeze([0, 96]), skip: Object.freeze(['#6a6865']),
  tones: Object.freeze({ '#4f4e52': '#3a3a3e', '#3a3a3e': '#231d1f', '#aaa49a': '#8a867d', '#8a6440': '#6e4c30', '#c49a5c': '#8a6440' }) }) }));
const QUARRY_LAB = Object.freeze({ tool: 'create_topdown_tileset', id: '65e9d685-2f7f-48ad-a936-f176cb6560fb', upper: '4ef8c0bd-0618-4d34-9a2c-e3fd3bdad9ee',
  params: Object.freeze({ mode: 'pro', tile_size: 32, view: 'high top-down', transition_size: 0, max_colors: 9, detail: 'low detail', palette: 'hr-world-56-v2 stone, shadow, earth ramps' }), cost: 15 });
/* the face: the cliff tile at sheet x96 (its top row the rock's lip, the face from row 18 to its foot at 40); rows 19-32 */
const FACE = Object.freeze({ sheet: CRAG_SHEET, rect: Object.freeze([96, 19, 32, 14]) });
/* the mountain: a raised mass (seams.mjs `rise`); a wide sweep so a run of rock cells is no ruler, a face of 14 px (the drawn cliff's
   own rows, `faceTex`) under a lit lip, and 4 px of that wall down each side */
const RISE = Object.freeze({ style: 'rise', variants: 4, sweep: 10, warp: 10, arch: true, face: 14, drop: 3, faceTex: FACE, side: 4 });
/* a shore that wanders: the border bows between the tile's pinned crossings (seams.mjs `arch`) */
const WANDER = Object.freeze({ sweep: 10, warp: 10, arch: true });
export const PAIRS = Object.freeze([
  Object.freeze({ ref: 'common/havora_grass_earth', style: 'ragged', variants: 4, seed: 11 }),
  Object.freeze(Object.assign({ ref: 'common/havora_grass_water', style: 'bank', variants: 4, seed: 13 }, WANDER)),
  Object.freeze({ ref: 'common/square_dirt_flag', style: 'scatter', unitUpper: true, variants: 4, seed: 31 }),
  Object.freeze({ ref: 'common/square_grass_flag', style: 'scatter', unitUpper: true, variants: 4, seed: 37 }),
  /* the rock pairs keep their kept sheet's floor (grass, dirt, the quarry's gravel) and take the crag as their rock */
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_grass_rock', seed: 41, upperFill: CRAG_LOW }, RISE)),
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_earth_rock', seed: 43, upperFill: CRAG_LOW }, RISE)),
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_gravel_rock', seed: 47, upperFill: CRAG_LOW, lowerFill: QUARRY }, RISE)),
  /* where the mountain meets the sea: the crag risen out of the water on its face (was the old plated rock on a rocky shore) */
  Object.freeze(Object.assign({ ref: 'havora/havora_water_rock', seed: 79, upperFill: CRAG_LOW }, RISE)),
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
    fills: Object.freeze({ lower: CRAG_LOW, upper: CRAG }),
    notes: 'The mountain\'s upper tier: its rock one value step up its ramps, risen over the rock with a face (tools/world-art/havora-seams.mjs, no generation).' })),
  /* the quarry's gravel against the dirt road, drawn from the town dirt and the quarry floor's own gravel (no second dirt) */
  Object.freeze(Object.assign({ ref: 'havora-floor/havora_earth_gravel', style: 'ragged', variants: 4, seed: 73, lower: 'earth', upper: 'gravel',
    fills: Object.freeze({ lower: DIRT, upper: QUARRY }),
    notes: 'The quarry floor against the dirt road: the town dirt ragged onto the quarry gravel (tools/world-art/havora-seams.mjs, no generation; was a PixelLab pair with its own dirt and a sawtooth border).' }, WANDER)),
  Object.freeze({ ref: 'havora-floor/havora_earth_beach', style: 'ragged', variants: 4, seed: 61, sweep: 10, warp: 10, arch: true, lower: 'earth', upper: 'beach',
    fills: Object.freeze({ lower: DIRT, upper: SAND }),
    notes: 'The shore: the town dirt ragged onto the beach (tools/world-art/havora-seams.mjs, no generation).' }),
]);
const PLAIN = new Set(['0000', '1111']);

/** One pair's sheet and sidecar tiles from its two fill tiles. */
export function pairFromFills(p, lower, upper) {
  const o = { style: p.style, variants: p.variants, seed: p.seed, unitUpper: !!p.unitUpper };
  for (const k of ['sweep', 'warp', 'arch', 'face', 'drop', 'shore', 'side']) if (p[k] !== undefined) o[k] = p[k];
  if (p.faceTex) o.faceTex = sheetCut(p.faceTex.sheet, p.faceTex.rect);
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
  return pairFromFills(p, p.lowerFill ? fillOf(p.lowerFill) : fill('0000'), p.upperFill ? fillOf(p.upperFill) : fill('1111'));
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

/** A rect of a palette-born sheet (a pro tileset made on hr-world-56-v2), as it came: every opaque pixel must be a palette entry. */
export function sheetCut(file, [x, y, w, h]) {
  const img = crop(decodePNG(readFileSync(join(ROOT, file))), x, y, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    if (!inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) throw new Error('havora-seams: ' + file + ' has an off-palette pixel at ' + (x + (i / 4) % w) + ',' + (y + Math.floor(i / 4 / w)));
  }
  return cloneImage(img);
}

/** A derived pair's fill: a kept pair's fill tile, locked as it is (or a palette-born sheet's tile), its colours stepped by `tones`. */
export function fillOf(f) {
  let tile;
  if (f.sheet) tile = sheetCut(f.sheet, [f.at[0], f.at[1], T, T]);
  else {
    const k = kept(f.ref);
    const [c, r] = k.baseTiles[f.key][0];
    tile = cloneImage(crop(lock(k.base, 'terrain'), c * T, r * T, T, T));
  }
  if (f.over) {
    /* another palette-born tile's pixels laid over this one (all but its `skip` colours), stepped by its own `tones` */
    const o = sheetCut(f.over.sheet, [f.over.at[0], f.over.at[1], T, T]), d = tile.data;
    for (let i = 0; i < d.length; i += 4) {
      const hex = '#' + [0, 1, 2].map((j) => o.data[i + j].toString(16).padStart(2, '0')).join('');
      if (f.over.skip.includes(hex)) continue;
      const to = (f.over.tones && f.over.tones[hex]) || hex;
      for (let j = 0; j < 3; j++) d[i + j] = parseInt(to.slice(1 + 2 * j, 3 + 2 * j), 16);
    }
  }
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
        const lab = [p.fills.lower, p.fills.upper].map((fl) => {
          if (fl.sheet) return { sheet: fl.sheet, at: fl.at, tool: CRAG_LAB.tool, id: CRAG_LAB.id, over: fl.over ? { sheet: fl.over.sheet, id: QUARRY_LAB.id } : undefined };
          const pl = kept(fl.ref).sc.pixellab || {}; return { ref: fl.ref, key: fl.key, tool: pl.tool, id: pl.id || pl.map };
        });
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
        for (const k of ['sweep', 'warp', 'arch', 'face', 'drop', 'side', 'upperFill', 'lowerFill', 'faceTex']) if (p[k] !== undefined) out.edges[k] = p[k];
        if (p.upperFill) out.pixellab = Object.assign({}, k.sc.pixellab, { rock: CRAG_LAB }, p.lowerFill ? { quarry: QUARRY_LAB } : {});
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
