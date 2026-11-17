// ════════════════════════════════════════════════════════════════════════
// tools/world-art/catacomb-ground.mjs — THE UNMARKED CATACOMBS' OWN VAULT FLOOR (lane/a-catacomb-art 2026-11-17; the ground stood on the
// Sewer's painted ground until now). Run by import-catacombs-2026-11-16.mjs --only ground, never by hand.
//
// THE FAMILY (art/world-src/gen-2026-11-17/vault-tiles, every pair a pro tileset born on hr-world-56-v2 and chained, so each material is
// one tile everywhere): vault flagstone, the Carters' packed earth, the Keepers' setts, black standing water and the vault rock (the dark
// top of the wall mass). The rock and the water pairs are raised a quarter tile: a thin pale lime rim runs where stone meets the rock or
// drops into the water. Flagstone is the hub; the earth meets the flagstone and the rock; the setts meet the flagstone only.
//
// THE PAINT GRID (vaultGrid): the map's rows, '#' rock R, '.' flagstone F, ':' earth E, '~' and '=' water W (the plank bridge is its
// cw_plank_bridge objects, laid over the water), 's' setts S. A setts cell that touches anything but setts (8 ways) is flagstone: the
// Keepers' setts lie inside a flagstone border, which is also why the family needs no setts/rock or setts/water pair.
//
// THE WEAR (ART_DIRECTION §5, tools/world-art/ground-finish.mjs): damp patches step the flagstone one value down its ramp, and kept
// Greenhaven decals (cracked slabs, a little bone, bare earth) are baked on a jittered grid, about one in twelve floor tiles, never under a
// placed object.
//
// THE WALLS: every rock cell with floor or water to its south shows a FACE, a 32 px slice of one lime-washed wall run (vault-walls/
// run-61369edf.png, create_image_pro_flash 192x64, 6 gens), standing on the cell's south row, its cap up in the cell above, the run's four inside slices
// cycled by column. A painted ground draws its own walls (compose.js), so they are laid into the
// paint, north to south. The Bone Room's faces carry the ossuary (uc_ossuary_wall, hanging objects the map places on them).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { stepPatches, bakeDecals } from './ground-finish.mjs';
import CATACOMBS from '../../src/data/grounds/unmarked_catacombs/map.js';

const G17 = 'art/world-src/gen-2026-11-17';
const abs = (p) => join(ROOT, p);
const T = 32;
export const SET = 'vault', GROUND = 'unmarked_catacombs_ground';
export const GRID_FILE = 'art/briefs/unmarked-catacombs-grid-2026-11-17.txt';

/** The pairs, in the order they were rolled (each folder holds the GET /mcp/tilesets/<id>/metadata answer and its sheet). */
export const VAULT_PAIRS = Object.freeze(['1-flagstone-rock', '2-earth-rock', '3-flagstone-earth', '4-water-flagstone', '5-water-rock', '6-flagstone-setts']
  .map((d) => `${G17}/vault-tiles/${d}`));
/** Each material's PixelLab terrain (base tile) id: one tile per material across every pair. */
export const VAULT_TERRAINS = Object.freeze({
  flagstone: '4910e009-f5cb-4ad3-a791-f1f821162d4d', rock: 'd5704cc2-79d3-4f92-ac2d-a0c148306547', earth: 'a42b0770-b391-434b-8ee2-bc0e0c3ce45b',
  water: '164582a7-835e-44ef-b079-95a8cba10cbe', setts: '25040f9c-4ece-489a-9928-b76631e60dff',
});
const LEGEND = Object.freeze({ F: 'flagstone', R: 'rock', E: 'earth', W: 'water', S: 'setts' });

/** The paint grid from the map's rows (the header says why each cell is what it is). Pure. */
export function vaultGrid(rows) {
  const h = rows.length, w = rows[0].length;
  const base = rows.map((r) => [...r].map((c) => ({ '#': 'R', '.': 'F', ':': 'E', '~': 'W', '=': 'W', s: 'S' })[c] || '?'));
  if (base.some((r) => r.includes('?'))) throw new Error('vaultGrid: a map character with no paint');
  return base.map((r, y) => r.map((c, x) => {
    if (c !== 'S') return c;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = base[Math.min(h - 1, Math.max(0, y + dy))][Math.min(w - 1, Math.max(0, x + dx))];
      if (q !== 'S') return 'F';
    }
    return 'S';
  }).join(''));
}

const metaOf = (dir) => JSON.parse(readFileSync(abs(dir + '/' + readdirSync(abs(dir)).find((f) => f.endsWith('-metadata.json'))), 'utf8'));

/* the wear: [cells, lattice px, cut, seed, { from: to }] and the decals each floor may carry */
const VAULT_FINISH = Object.freeze({
  /* damp slabs: the flagstone's own fill one step down the shadow ramp */
  patches: [['F', 96, 0.6, 71, { '#2f2723': '#231d1f' }]],
  every: 3.4, seed: 72,
  decals: {
    /* tried and dropped: the grey puddles (on the dark slabs they read as loose rocks, brighter than the bodies), the straw (haystacks
       on the earth) and the moss (all over a lime-washed vault; the map's own puddles keep the Flooded Vault damp) */
    F: ['sewer/cracked_flagstone', 'mill/bone_pile', 'sewer/bones'],
    E: ['sewer/exposed_dirt'],
    S: ['sewer/bones', 'mill/bone_pile'],
  },
});

/** The cells a map object stands on: no decal is baked under one. */
function objectCells(map) {
  const s = new Set(map.objects.map((o) => o.x + ',' + o.y));
  return (x, y) => s.has(x + ',' + y);
}

/** The lime-washed faces over the paint (the header). Returns the number of faces laid. */
function vaultWalls(img, grid) {
  const run = decodePNG(readFileSync(abs(`${G17}/vault-walls/run-61369edf.png`)));
  /* the run's art stands on its row 58: a face's row 58 lands on its cell's south pixel row */
  /* the run's two end slices carry its outline down their outer side: only the four inside ones cycle, so a face never shows a seam */
  const FOOT = 58, slices = Math.floor(run.width / T) - 2;
  const h = grid.length, w = grid[0].length;
  let faces = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] !== 'R' || grid[y + 1][x] === 'R') continue;
    blit(img, run, (1 + (x % slices)) * T, 0, T, FOOT + 1, x * T, y * T + T - 1 - FOOT, true);
    faces++;
  }
  return faces;
}

/** Paint, wear and walls: art/world/vault/unmarked_catacombs_ground.png + its sidecar. `run(tool, argv)` runs a world-art tool. */
export function catacombGround(run) {
  const grid = vaultGrid(CATACOMBS.rows);
  writeFileSync(abs(GRID_FILE), ['THE UNMARKED CATACOMBS\' PAINT GRID (lane/a-catacomb-art, 2026-11-17), cut from src/data/grounds/unmarked_catacombs/map.js rows by',
    'tools/world-art/catacomb-ground.mjs vaultGrid (its header says why each cell is what it is): F vault flagstone, R the vault rock,',
    'E the Carters\' packed earth, W standing water (the bridge is laid over it), S the Keepers\' setts inside a flagstone border.',
    'Painted by port-pixellab.mjs paint from the vault family\'s six pairs (art/world-src/gen-2026-11-17/vault-tiles).'].join('\n') + '\n\nPAINT\n' + grid.join('\n') + '\n');
  const metas = VAULT_PAIRS.map(metaOf);
  run('port-pixellab.mjs', ['paint', '--set', SET, '--id', GROUND, '--grid', abs(GRID_FILE), '--tilesets', VAULT_PAIRS.map(abs).join(','),
    '--use', metas.map((m) => m.id.slice(0, 8)).join(','), '--legend', Object.entries(LEGEND).map(([c, m]) => c + '=' + VAULT_TERRAINS[m].slice(0, 8)).join(','),
    '--material', 'native']);
  const file = join(ROOT, ART_DIR, SET, GROUND + '.png');
  const img = decodePNG(readFileSync(file));
  let moved = 0;
  for (const [chars, scale, cut, seed, map] of VAULT_FINISH.patches) moved += stepPatches(img, { rows: grid, on: (ch) => chars.includes(ch), scale, cut, seed, map });
  const laid = bakeDecals(img, { rows: grid, seed: VAULT_FINISH.seed, every: VAULT_FINISH.every, decals: VAULT_FINISH.decals, skip: objectCells(CATACOMBS) });
  const faces = vaultWalls(img, grid);
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' Wear (tools/world-art/ground-finish.mjs): ' + moved + ' px of the flagstone stepped one value down in damp patches, ' + laid.length
    + ' kept decals baked on a jittered grid (' + [...new Set(laid.map((d) => d.id))].join(', ') + '). Walls (tools/world-art/catacomb-ground.mjs): '
    + faces + ' lime-washed faces from one wall run (create_image_pro_flash 61369edf), laid north to south.';
  sc.pixellab.wall_run = '61369edf-9ead-4dbe-80c2-832f472cb0a3';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ ' + SET + '/' + GROUND + ': wear ' + moved + ' px, ' + laid.length + ' decals, ' + faces + ' wall faces');
}

/* ── THE TWO SIGNATURE PIECES (region-kits.js grounds.unmarked_catacombs.signature; gen-2026-11-17/vault-pieces, vault-note.json) ──
   uc_wood_book     Dunn's Wood Book: the ledger open on a stone lectern, a tallow candle at each top corner (create_object_pro_flash
                    2942e2cc, one direction, 48x64, 5 gens). A fixture: the Keepers' Room's centrepiece, one solid tile.
   uc_ossuary_wall  the ossuary: skulls and long bones in rows (create_image_pro_flash 114a7acd, a 96x40 run, 5 gens), cut into three 32 px
                    panels (_b, _c the run's middle and right thirds, so a row of them reads on), each HUNG on a wall face: class hanging,
                    so it blocks no step, and the lime of the face shows through between the bones. Its foot stands 2 px above the floor
                    line, on the face's wet band. */
const PIECES = `${G17}/vault-pieces`;
export const OSSUARY = Object.freeze(['uc_ossuary_wall', 'uc_ossuary_wall_b', 'uc_ossuary_wall_c']);
export function catacombPieces(run) {
  run('port-pixellab.mjs', ['object', '--set', SET, '--id', 'uc_wood_book', '--class', 'fixture', '--file', abs(`${PIECES}/uc_wood_book-2942e2cc.png`),
    '--object', '2942e2cc-244d-453f-b8c1-09cef8eb2c05', '--name', 'UC Wood Book']);
  const strip = decodePNG(readFileSync(abs(`${PIECES}/ossuary-run-114a7acd.png`)));
  for (let i = 0; i < strip.data.length; i += 4) if (strip.data[i + 3] && strip.data[i + 3] !== 255) throw new Error('the ossuary run has partial alpha');
  const GAP = 2, fh = strip.height + GAP;
  OSSUARY.forEach((id, k) => {
    const out = createImage(T, fh);
    blit(out, strip, k * T, 0, T, strip.height, 0, 0);
    writeFileSync(join(ROOT, ART_DIR, SET, id + '.png'), encodePNG(out));
    const sc = { id, class: 'hanging', style: 's1', material: 'native', source: id + '.png', frame: [T, fh], anchor_px: [T >> 1, fh - 1], footprint: [1, 1],
      anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }], pixellab: { tool: 'create_image_pro_flash', image: '114a7acd-00cf-460c-bf32-1ad3a956284b', cut: [k * T, 0, T, strip.height] },
      notes: 'The ossuary (art/briefs/ground-unmarked_catacombs.txt): px ' + (k * T) + '-' + (k * T + T - 1) + ' of the 96x40 run, hung on a vault wall face, by tools/world-art/catacomb-ground.mjs; pixels unscaled, nothing drawn.' };
    writeFileSync(join(ROOT, ART_DIR, SET, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
  });
  console.log('  ✓ ' + SET + '/' + OSSUARY.join(', ') + ' (hanging, ' + T + 'x' + fh + ')');
}
