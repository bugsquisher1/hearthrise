#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-flue.mjs — THE BURNING TOWER'S ROOM: the flue's floor and walls → art/world/tower/ (lane/a-tower-art-gen, 2026-11-16).
//
//   node tools/world-art/tower-flue.mjs        paint burning_tower_ground, then lay the soot-brick walls over the paint
//
// Every pixel is a kept tile's or a kept wall slice's (art/world-src/gen-2026-11-16/01-note.json); nothing is drawn by hand.
//   FLOOR  src/data/world/maps/burning_tower.js rows → a paint grid: I the iron landing (the plate), A the swept ash (the Pyre Field's
//          own ash, chained: both sets share base tile ed88d179 byte for byte), H hearthstone patches where the ash is thin, laid only
//          off the fight area (its median #6a6865 is too dark under a pocket, tower-pours.mjs --check), # the brick mass (void).
//   WALLS  the ember run (cracks glowing in three cells) and the plain run (its brown flecks remapped to the ember run's stone and
//          shadow, 0 gens), cut at cells x0,32,..160 into 32x60 slices and laid as the Hold's walls are (barrow-grounds.mjs holdWalls):
//          a '#' cell with floor to its south shows a face, an ember-cracked face every sixth, a pier every twelfth.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodePNG, encodePNG, crop, blit } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { noise, bakeDecals } from './ground-finish.mjs';
import { isMain } from '../../tests/_is-main.mjs';
import TOWER_MAP from '../../src/data/world/maps/burning_tower.js';

const G16 = 'art/world-src/gen-2026-11-16/01-flue-sample';
const abs = (p) => join(ROOT, p);
const T = 32, WALL_H = 60;
const metaOf = (dir) => JSON.parse(readFileSync(abs(dir + '/' + readdirSync(abs(dir)).find((f) => f.endsWith('-metadata.json'))), 'utf8'));
const on = (im, x, y) => x >= 0 && y >= 0 && x < im.width && y < im.height && im.data[(y * im.width + x) * 4 + 3] >= ALPHA_CUT;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/* the plain run's flecks and iron tones onto the ember run's own stone and shadow ramp (one palette, one wall) */
const PLAIN_TO_EMBER = Object.freeze({ '#553a26': '#2f2723', '#6e4c30': '#4f4e52', '#2c2e33': '#231d1f', '#4a4d54': '#4f4e52', '#6e727a': '#6a6865', '#8a867d': '#aaa49a' });
function remap(img, map) {
  const m = Object.fromEntries(Object.entries(map).map(([a, b]) => [a, rgb(b)]));
  for (let i = 0; i < img.width * img.height; i++) {
    const k = '#' + [0, 1, 2].map((j) => img.data[i * 4 + j].toString(16).padStart(2, '0')).join('');
    if (img.data[i * 4 + 3] >= ALPHA_CUT && m[k]) img.data.set(m[k], i * 4);
  }
  return img;
}

/** The room's paint rows: I the iron landing, A ash, H hearthstone (a noise patch off the fight area, every neighbour ash, patch or wall), # mass. */
export function flueGrid(rows) {
  const h = rows.length, w = rows[0].length;
  const base = rows.map((row) => [...row].map((ch) => (ch === '#' ? '#' : ch === 'i' ? 'I' : 'A')));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : base[y][x]);
  /* the fight area (the engine's pockets x51-57 y17-29 and the lane to the landing) stays swept ash: bright, 3:1 under the charred */
  const fight = (x, y) => x >= 51 && x <= 58 && y >= 18 && y <= 29;
  const out = base.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (base[y][x] !== 'A' || fight(x, y) || noise(x * T, y * T, 3 * T, 61) <= 0.4) continue;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) { const q = at(x + dx, y + dy); if (q !== 'A' && q !== '#') { ok = false; break; } }
    if (ok) out[y][x] = 'H';
  }
  return out.map((r) => r.join(''));
}

function run(tool, argv) {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'world-art', tool), ...argv], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); throw new Error(tool + ' exit ' + r.status); }
}

export function paintFloor() {
  const dirs = [G16 + '/4-iron-pyreash', G16 + '/5-pyreash-hearthstone'], metas = dirs.map(metaOf);
  const iron = metas[0].base_tile_ids.lower, ash = metas[0].base_tile_ids.upper, stone = metas[1].base_tile_ids.upper;
  if (metas[1].base_tile_ids.lower !== ash) throw new Error('the ash pair does not chain: ' + ash + ' vs ' + metas[1].base_tile_ids.lower);
  const rows = flueGrid(TOWER_MAP.rows);
  const grid = 'art/briefs/burning-tower-grid-2026-11-16.txt';
  writeFileSync(abs(grid), ['THE BURNING TOWER\'S PAINT GRID (lane/a-tower-art-gen, 2026-11-16), cut from src/data/world/maps/burning_tower.js rows by flueGrid in',
    'tools/world-art/tower-flue.mjs: I the iron landing, A swept ash, H hearthstone patches (off the fight area), # the brick mass (void, walls laid over).', '', 'PAINT', ...rows, ''].join('\n'));
  run('port-pixellab.mjs', ['paint', '--set', 'tower', '--id', 'burning_tower_ground', '--grid', abs(grid), '--tilesets', dirs.map(abs).join(','), '--use', metas.map((m) => m.id.slice(0, 8)).join(','),
    '--legend', `I=${iron.slice(0, 8)},A=${ash.slice(0, 8)},H=${stone.slice(0, 8)}`, '--void', '#', '--void-fill', '#0b0a0c', '--material', 'native']);
  /* wear (ART_DIRECTION §5, decals on a jittered grid, never two alike in a row): the sweep's soot and scorch on the ash, the iron's own cracks and soot */
  const file = join(ROOT, ART_DIR, 'tower', 'burning_tower_ground.png');
  const img = decodePNG(readFileSync(file));
  const laid = bakeDecals(img, { rows, seed: 41, every: 3.4, decals: {
    A: ['common/square_decal_soot', 'yard/ty_scorch'],
    I: ['common/square_decal_soot'],
  } });
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' Wear: ' + laid.length + ' kept decals baked on a jittered grid (' + [...new Set(laid.map((d) => d.id))].join(', ') + ') by tools/world-art/ground-finish.mjs.';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ tower/burning_tower_ground: ' + laid.length + ' decals');
}

export function layWalls() {
  const file = join(ROOT, ART_DIR, 'tower', 'burning_tower_ground.png');
  const img = decodePNG(readFileSync(file));
  const rows = TOWER_MAP.rows, h = rows.length, w = rows[0].length;
  const wall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || rows[y][x] === '#';
  const floor = (x, y) => !wall(x, y);
  const W = abs(G16 + '/walls');
  const ember = decodePNG(readFileSync(W + '/run-ember-237933ea.png'));
  const plain = remap(decodePNG(readFileSync(W + '/run-plain2-c83bef3f.png')), PLAIN_TO_EMBER);
  const cell = (run, i) => crop(run, i * T, 0, T, WALL_H);
  /* a run's two end cells carry 4-5 transparent columns (the run's own margins) and a rounded cap end: the clean middle columns a..b, cycled out to
     32, so no face leaves a gap beside its neighbour */
  const widen = (run, i, a, b) => {
    const out = crop(run, i * T, 0, T, WALL_H);
    for (let x = 0; x < T; x++) blit(out, run, i * T + a + (x % (b - a + 1)), 0, 1, WALL_H, x, 0);
    return out;
  };
  /* flat faces: the plain run's two clean cells, alternating; the ember run's three cracked cells; its big pier is the buttress */
  const S = { plain: [widen(plain, 0, 8, 31), widen(plain, 5, 0, 23)], ember: [widen(ember, 0, 8, 31), cell(ember, 2), widen(ember, 5, 0, 23)], pier: cell(ember, 1) };
  let capY = 0; while (!on(S.plain[0], 16, capY)) capY++;
  const CAP = 10;
  /* 0: the mass is solid: a cell beside the floor takes shadow, the rest the flue's black (the paint blends a floor tile half a cell into a wall cell) */
  const near = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (floor(x + dx, y + dy)) return true; return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!wall(x, y)) continue;
    const c = rgb(near(x, y) ? '#17141a' : '#0b0a0c');
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) img.data.set([...c, 255], ((y * T + py) * img.width + x * T + px) * 4);
  }
  /* 1: capstones on the mass's top edges that meet a floor (a face cell carries its own cap); east and west edges take the cap's cross-section */
  const cap = S.plain[0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!wall(x, y) || floor(x, y + 1)) continue;
    if (floor(x, y - 1)) blit(img, cap, 0, capY, T, CAP, x * T, y * T, true);
    /* a side edge is the cap seen end-on: the cap's own three values, light at the floor, in a 6 px strip */
    for (const dx of [1, -1]) {
      if (!floor(x + dx, y)) continue;
      const band = ['#aaa49a', '#6a6865', '#4f4e52', '#3a3a3e', '#3a3a3e', '#231d1f'];
      for (let k = 0; k < band.length; k++) {
        const px = dx > 0 ? x * T + T - 1 - k : x * T + k;
        for (let py = 0; py < T; py++) img.data.set([...rgb(band[k]), 255], ((y * T + py) * img.width + px) * 4);
      }
    }
  }
  /* 2: the faces, north to south */
  let faces = 0, cracked = 0;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!(wall(x, y) && floor(x, y + 1))) { x++; continue; }
      let e = x; while (e + 1 < w && wall(e + 1, y) && floor(e + 1, y + 1)) e++;
      for (let c = x; c <= e; c++) {
        const i = c - x;
        const slice = i % 12 === 7 ? S.pier : i % 6 === 3 ? S.ember[Math.floor(i / 6) % 3] : S.plain[i % 2];
        if (slice !== S.pier && i % 6 === 3) cracked++;
        blit(img, slice, 0, 0, T, WALL_H, c * T, y * T + T - WALL_H, true);
        faces++;
      }
      x = e + 1;
    }
  }
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' The soot-brick wall faces are laid over the paint by tools/world-art/tower-flue.mjs: ' + faces + ' slices (' + cracked + ' ember-cracked) of the two kept pro-flash runs (gen-2026-11-16/01-flue-sample/walls), the plain run remapped onto the ember run\'s ramp.';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ tower/burning_tower_ground: ' + faces + ' wall faces (' + cracked + ' ember-cracked)');
}

if (isMain(import.meta.url)) {
  try { paintFloor(); layWalls(); } catch (e) { console.error('tower-flue: ' + (e && e.stack || e)); process.exit(2); }
}
