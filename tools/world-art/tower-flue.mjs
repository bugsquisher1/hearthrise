#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-flue.mjs — THE BURNING TOWER'S ROOM: the flue's floor and walls → art/world/tower/ (lane/a-tower-art-gen, 2026-11-16).
//
//   node tools/world-art/tower-flue.mjs        paint burning_tower_ground, then lay the soot-brick walls over the paint
//
// Every pixel is a kept tile's or a kept wall slice's (art/world-src/gen-2026-11-16/01-note.json), moved along the palette's own ramps.
//   FLOOR  src/data/world/maps/burning_tower.js rows → a paint grid: I the iron landing (the plate), A the swept ash (the Pyre Field's
//          own ash, chained: both sets share base tile ed88d179 byte for byte), # the brick mass. The room is one round flue, mirror-
//          symmetric about x30 (round 5); the hearthstone (median #6a6865, too dark under a pocket) is the walls' top only.
//   FINISH (round 3) a hand-placed list (FINISH): the climbers' worn path, ash drifts against the walls, pale and warm patches, cinder
//          scatter, and the landing's 64 px sections and raised rim. It throws if the floor's median under the spawns leaves #8a867d.
//          The plain ash it leaves is varied per cell at runtime (art/world/tower/flue_ash_variety.json, src/world/core/ground-variety.js).
//   WALLS  the ember run (cracks glowing in three cells) and the plain run (its brown flecks remapped to the ember run's stone and
//          shadow, 0 gens), cut at cells x0,32,..160 into 32x60 slices and laid as the Hold's walls are (barrow-grounds.mjs holdWalls):
//          a '#' cell with floor to its south shows a face, an ember-cracked face every sixth, a pier every twelfth; one with floor to its
//          north shows its south face below the floor's edge; the side walls show their coping; the rest of the mass is a wall's top.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodePNG, encodePNG, crop, blit, createImage } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { noise, hash2, bakeDecals } from './ground-finish.mjs';
import { RAMPS } from './palette.mjs';
import { wangTiles } from './tileset.mjs';
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

/** The flue's floor in cells: its bounds and its mirror axis (the room is symmetric about the middle of its widest row). */
export function flueShape(map = TOWER_MAP) {
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  map.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '#') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
  return { x0, y0, x1, y1, axis: (x0 + x1) / 2 };
}

/** The room's paint rows: I the iron landing, A ash, # mass. THE ASH RUNS TO THE WALLS (round 5): in the round flue every cell off the fight
    is a rim cell, so hearthstone patches laid there read as straight slab bands boxing the room in; the drifts and pale patches break the ash. */
export function flueGrid(rows) {
  return rows.map((row) => [...row].map((ch) => (ch === '#' ? '#' : ch === 'i' ? 'I' : 'A')).join(''));
}

/* ── THE FLOOR'S FINISH, BY HAND (round 3, 2026-11-16: "break the flat pale ash; give the iron landing a rim and seams") ──
   Every feature is a row here in map cells, placed by eye against the room and moved by editing the row. Fight cells take paint, never
   props. No colour is new: a pixel moves one step along its own ramp, to a warmer twin of about its value, or takes a cinder
   from the soot and fire ramps. Seeds are fixed, so the paint is the same on every run. The room is mirror-symmetric about x30 (cell
   centre 30.5 here), so every feature off the axis has its twin at 61 - cx (a drift's turn negated); the scatter inside each is its own. */
const mirror = (list, turnAt = -1) => list.flatMap((r) => [r, r.map((v, i) => (i === 0 ? 61 - v : i === turnAt ? -v : v))]);
export const FINISH = Object.freeze({
  /* the climbers' worn path, up the axis: from the stair at the landing's south edge, over the iron, across the ash to the irons in the north wall */
  path: Object.freeze([[30.5, 25.7], [30.5, 14.6]]),
  /* ash drifts blown against the walls and round the curves: [cx, cy, rx, ry, turn] (cells; turn in radians) */
  drifts: Object.freeze(mirror([[23.5, 19.6, 0.5, 2.0, 0], [26.0, 16.0, 1.7, 0.45, -0.72], [25.5, 23.4, 1.3, 0.42, 0.78]], 4)),
  /* the draught down the flue leaves pale, clean ash under the irons and along the side walls; the heaps' embers and the landing's braziers
     warm theirs: [cx, cy, r] */
  pale: Object.freeze([[30.5, 16.4, 3.0], ...mirror([[24.0, 18.6, 1.4]])]),
  warm: Object.freeze(mirror([[24.4, 20.6, 1.5], [26.4, 23.4, 1.3]])),
  /* cinders: what falls from the flue under the irons, what spills round the heaps, the sacks and the scuttle: [cx, cy, r, count] */
  cinders: Object.freeze([[30.5, 14.9, 0.8, 40], ...mirror([[24.2, 20.6, 1.1, 60], [24.6, 22.6, 0.6, 16], [27.6, 19.6, 0.9, 22], [26.6, 15.6, 0.6, 14]])]),
  /* the landing's plate sections: a heavy seam every 64 px on the tile's own 16 px seams (x at 9, y at 7 within the plate), the
     verticals as near the axis's mirror as those seams allow */
  section: Object.freeze({ x0: 29 * T + 9, y0: 24 * T + 23, every: 64 }),
});
const R = (ramp, i) => RAMPS[ramp][i];
/* the worn path's wander (px either way, over about three cells) and the px over which its edge thins out (lane/a-late-grounds-seams) */
const PATH_WANDER = 7, PATH_FEATHER = 5;
/* the side walls' skirting: the floor's last px against a side wall's coping a step down its ramp, the first two (ART_DIRECTION section 5:
   a room's floor meets its wall on a darker contact strip; the sides showed only a pale coping on pale ash, with nothing to stand on) */
const SKIRT = Object.freeze([2, 1, 1, 1]);
/* the landing's own colours (its plate, seams, soot, and the bars and seams this finish lays); the ash lip the transition draws is none of them */
const IRON_FAMILY = Object.freeze([R('iron', 0), R('iron', 1), R('iron', 2), R('iron', 3), R('shadow', 0), R('shadow', 1), R('shadow', 2), R('stone', 0)]);
const ASH_FAMILY = Object.freeze([R('stone', 2), R('stone', 3), R('stone', 4), R('bone', 0)]);
const hexAt = (img, x, y) => { const i = (y * img.width + x) * 4; return '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join(''); };
const setHex = (img, x, y, h) => img.data.set([...rgb(h), 255], (y * img.width + x) * 4);
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** The finish over the painted floor `img` (rows: flueGrid's paint grid). Returns a one-line count of what it laid. */
export function finishFloor(img, rows) {
  const W = img.width, H = img.height;
  const cellOf = (x, y) => rows[Math.floor(y / T)][Math.floor(x / T)];
  const ash = (x, y) => { const c = cellOf(x, y); return (c === 'A' || c === 'H') && ASH_FAMILY.includes(hexAt(img, x, y)); };
  /* the patches and drifts are the ash's own: the hearthstone slabs keep their stone (a warm speckle on a slab reads as rust) */
  const loose = (x, y) => cellOf(x, y) === 'A' && ASH_FAMILY.includes(hexAt(img, x, y));
  const swap = (x, y, map, p, seed) => { const h = hexAt(img, x, y); if (map[h] && hash2(x, y, seed) < p) setHex(img, x, y, map[h]); };
  const counts = { pale: 0, warm: 0, drift: 0, path: 0, cinder: 0, seam: 0, rim: 0 };
  /* 1 PALE AND WARM: a soft blob round each centre; pale ash is the ash's own ramp a step up, neutral grey (the steel and iron ramps' cool
     twins read as blue puddles under the indoor light), warm takes the bone's pale and the earth's dark (the orange earths read as rust) */
  const PALE = { [R('stone', 3)]: R('stone', 4), [R('stone', 2)]: R('stone', 3) };
  const PALE_P = { [R('stone', 3)]: 0.4, [R('stone', 2)]: 0.8 };
  const WARM = { [R('stone', 2)]: R('earth', 2), [R('stone', 4)]: R('bone', 0), [R('stone', 3)]: R('bone', 0) };
  const WARM_P = { [R('stone', 2)]: 0.6, [R('stone', 4)]: 1, [R('stone', 3)]: 0.16 };
  for (const [list, map, P, seed, key] of [[FINISH.pale, PALE, PALE_P, 71, 'pale'], [FINISH.warm, WARM, WARM_P, 73, 'warm']]) {
    for (const [cx, cy, r] of list) {
      for (let y = Math.max(0, Math.floor((cy - r) * T)); y < Math.min(H, Math.ceil((cy + r) * T)); y++) for (let x = Math.max(0, Math.floor((cx - r) * T)); x < Math.min(W, Math.ceil((cx + r) * T)); x++) {
        if (!loose(x, y)) continue;
        /* the patch's shape is a big noise blob inside the centre's reach, so it reads as a patch of ash, not a round stain */
        const d = Math.hypot(x / T - cx, y / T - cy) / r, w = smooth((1 - d) * 2) * smooth((noise(x, y, 52, seed) - 0.3) * 3);
        const h = hexAt(img, x, y);
        /* mottled, not salted: a fine noise decides, so a patch is small soft clumps of its colour */
        if (map[h] && noise(x, y, 5, seed) < w * P[h] * 0.75 + 0.06 * hash2(x, y, seed)) { setHex(img, x, y, map[h]); counts[key]++; }
      }
    }
  }
  /* 2 DRIFTS: the body a step lighter, a sparse bone crest on its lit (upper-left) side, a step of shadow along its lower-right foot */
  for (const [k, [cx, cy, rx, ry, turn]] of FINISH.drifts.entries()) {
    const c = Math.cos(turn), sn = Math.sin(turn), reach = Math.max(rx, ry) * 1.5;
    for (let y = Math.max(0, Math.floor((cy - reach) * T)); y < Math.min(H, Math.ceil((cy + reach) * T)); y++) for (let x = Math.max(0, Math.floor((cx - reach) * T)); x < Math.min(W, Math.ceil((cx + reach) * T)); x++) {
      if (!loose(x, y)) continue;
      const dx = x / T - cx, dy = y / T - cy, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      const e = (u / rx) ** 2 + (v / ry) ** 2 + (noise(x, y, 9, 80 + k) - 0.5) * 0.7, h = hexAt(img, x, y), lit = dx + dy < 0;
      if (e < 1) {
        if (h === R('stone', 3) && hash2(x, y, 81 + k) < 0.88) { setHex(img, x, y, R('stone', 4)); counts.drift++; }
        else if (h === R('stone', 2)) setHex(img, x, y, R('stone', 3));
        if (lit && e > 0.6 && hexAt(img, x, y) === R('stone', 4) && hash2(x, y, 83 + k) < 0.3) setHex(img, x, y, R('bone', 0));
      } else if (!lit && e < 1.45 && h === R('stone', 3) && hash2(x, y, 85 + k) < 0.6) setHex(img, x, y, R('stone', 2));
    }
  }
  /* 3 THE PATH: within its ragged half-width the loose light top is trodden down and the grain darkens; on the iron, boots polish the plate */
  const segD = (px, py) => {
    let best = Infinity;
    for (let i = 0; i + 1 < FINISH.path.length; i++) {
      const [ax, ay] = FINISH.path[i].map((n) => n * T), [bx, by] = FINISH.path[i + 1].map((n) => n * T);
      const L = (bx - ax) ** 2 + (by - ay) ** 2, t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L));
      best = Math.min(best, Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay)));
    }
    return best;
  };
  const TROD = { [R('stone', 4)]: R('stone', 3), [R('bone', 0)]: R('stone', 4), [R('steel', 2)]: R('stone', 3) };
  const POLISH = { [R('iron', 0)]: R('iron', 1), [R('shadow', 2)]: R('iron', 0) };
  /* the floor's own bounds, a cell round (src/data/world/maps/burning_tower.js rows), so the finish follows the room wherever it is drawn */
  const S = flueShape();
  for (let y = (S.y0 - 1) * T; y < (S.y1 + 2) * T; y++) for (let x = (S.x0 - 1) * T; x < (S.x1 + 2) * T; x++) {
    /* the path wanders as feet do (lane/a-late-grounds-seams: dead straight up x30 it read as a ruler stripe), and its edge thins out */
    const hw = 13 + (noise(x, y, 14, 91) - 0.5) * 10, d = segD(x - PATH_WANDER * (noise(0, y, 88, 99) - 0.5) * 2, y);
    if (d >= hw) continue;
    const core = 1 - d / hw, cell = cellOf(x, y), h = hexAt(img, x, y);
    if (cell === 'I') { if (POLISH[h] && hash2(x, y, 93) < 0.26 * core) { setHex(img, x, y, POLISH[h]); counts.path++; } continue; }
    if (cell !== 'A' && cell !== 'H') continue;
    if (TROD[h] && hash2(x, y, 96) < smooth((hw - d) / PATH_FEATHER)) { setHex(img, x, y, TROD[h]); counts.path++; }
    else if (h === R('stone', 3) && hash2(x, y, 95) < 0.06 + 0.24 * core) { setHex(img, x, y, R('stone', 2)); counts.path++; }
  }
  /* 4 CINDERS: specks in a falling cluster round each centre, mostly soot, a few still red or alight; some are two pixels */
  const CINDER = [[0.4, R('shadow', 3)], [0.65, R('stone', 0)], [0.85, R('shadow', 1)], [0.93, R('blood', 1)], [0.97, R('torch', 0)], [1, R('earth', 2)]];
  for (const [k, [cx, cy, r, n]] of FINISH.cinders.entries()) {
    for (let i = 0; i < n; i++) {
      const a = hash2(i, k, 101) * Math.PI * 2, rr = Math.sqrt(-2 * Math.log(1 - hash2(i, k, 103) * 0.98)) * r * T * 0.45;
      const x = Math.round(cx * T + Math.cos(a) * rr), y = Math.round(cy * T + Math.sin(a) * rr);
      if (x < 0 || y < 0 || x >= W || y >= H || !ash(x, y)) continue;
      const col = CINDER.find(([p]) => hash2(i, k, 105) < p)[1];
      setHex(img, x, y, col); counts.cinder++;
      if (hash2(i, k, 107) < 0.3 && ash(x + 1, y)) setHex(img, x + 1, y, col === R('torch', 0) ? R('blood', 1) : R('shadow', 2));
    }
  }
  /* 5 THE LANDING: heavy seams between 64 px sections, rivets at their crossings, and a raised rim round the whole plate */
  const iron = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const c = cellOf(x, y);
    if (c === 'I') return IRON_FAMILY.includes(hexAt(img, x, y));
    if (c !== 'A') return false;
    /* the transition's iron reaches a few px into the ash cell beside the landing */
    const nb = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => rows[Math.floor(y / T) + dy] && rows[Math.floor(y / T) + dy][Math.floor(x / T) + dx] === 'I');
    return nb && IRON_FAMILY.includes(hexAt(img, x, y));
  };
  const { x0, y0, every } = FINISH.section;
  const SEAM_PX = { '-1': R('shadow', 1), 0: R('shadow', 0), 1: R('iron', 2), 2: R('iron', 1) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (cellOf(x, y) !== 'I') continue;
    const ox = ((x - x0) % every + every) % every, oy = ((y - y0) % every + every) % every;
    const sx = ox === every - 1 ? -1 : ox <= 2 ? ox : null, sy = oy === every - 1 ? -1 : oy <= 2 ? oy : null;
    const s = sx !== null && sy !== null ? Math.min(sx, sy) : sx !== null ? sx : sy;
    if (s !== null && SEAM_PX[s]) { setHex(img, x, y, SEAM_PX[s]); counts.seam++; }
  }
  for (let Y = y0; Y < H; Y += every) for (let X = x0; X < W; X += every) {
    for (const [rx, ry] of [[4, 4], [-6, 4], [4, -6], [-6, -6]]) {
      const px = X + rx, py = Y + ry;
      if (cellOf(px, py) !== 'I' || cellOf(px + 1, py + 1) !== 'I') continue;
      setHex(img, px, py, R('iron', 3)); setHex(img, px + 1, py, R('iron', 2)); setHex(img, px, py + 1, R('iron', 2)); setHex(img, px + 1, py + 1, R('shadow', 0));
    }
  }
  /* the rim: per iron pixel, the nearest edge within 4 px by side; a lit bar on the north and west, a duller one south and east */
  const RIM = { lit: [R('shadow', 1), R('iron', 3), R('iron', 2), R('shadow', 1)], dull: [R('shadow', 1), R('iron', 2), R('iron', 1), R('iron', 1)] };
  const marks = [];
  for (let y = (S.y0 - 1) * T; y < (S.y1 + 2) * T; y++) for (let x = (S.x0 - 1) * T; x < (S.x1 + 2) * T; x++) {
    if (!iron(x, y)) continue;
    let best = 9, side = null;
    for (const [dx, dy, sd] of [[0, -1, 'n'], [-1, 0, 'w'], [0, 1, 's'], [1, 0, 'e']]) {
      for (let d = 1; d <= 4; d++) if (!iron(x + dx * d, y + dy * d)) { if (d < best) { best = d; side = sd; } break; }
    }
    if (side) marks.push([x, y, best, side]);
  }
  for (const [x, y, d, side] of marks) {
    const lit = side === 'n' || side === 'w', along = lit ? (side === 'n' ? x : y) : (side === 's' ? x : y);
    let c = (lit ? RIM.lit : RIM.dull)[d - 1];
    /* a rivet on the bar every 16 px */
    if (d === 2 && along % 16 === 5) c = lit ? R('steel', 3) : R('iron', 3);
    setHex(img, x, y, c); counts.rim++;
  }
  /* the fight floor's tone is a contract (tower-pours.mjs FLOORS.ash: the charred read 3:1 on #8a867d): the median under the spawn cells holds it */
  const under = [];
  for (const [sx, sy] of TOWER_MAP.spawns) for (let y = sy * T; y < sy * T + T; y++) for (let x = sx * T; x < sx * T + T; x++) under.push(hexAt(img, x, y));
  const lumOf = (hx) => { const [r, g, b] = rgb(hx).map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const med = under.sort((a, b) => lumOf(a) - lumOf(b))[under.length >> 1];
  if (med !== R('stone', 3)) throw new Error('the finish moved the fight floor median under the spawns to ' + med + ' (the pours read on ' + R('stone', 3) + ')');
  return Object.entries(counts).map(([k, n]) => k + ' ' + n + ' px').join(', ') + ', spawn floor median ' + med;
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
    'tools/world-art/tower-flue.mjs: I the iron landing, A swept ash, # the brick mass (void, walls laid over).', '', 'PAINT', ...rows, ''].join('\n'));
  run('port-pixellab.mjs', ['paint', '--set', 'tower', '--id', 'burning_tower_ground', '--grid', abs(grid), '--tilesets', dirs.map(abs).join(','), '--use', metas.map((m) => m.id.slice(0, 8)).join(','),
    '--legend', `I=${iron.slice(0, 8)},A=${ash.slice(0, 8)},H=${stone.slice(0, 8)}`, '--void', '#', '--void-fill', '#0b0a0c', '--material', 'native']);
  /* wear (ART_DIRECTION §5, decals on a jittered grid, never two alike in a row): the sweep's soot and scorch on the ash, the iron's own cracks and soot */
  const file = join(ROOT, ART_DIR, 'tower', 'burning_tower_ground.png');
  const img = decodePNG(readFileSync(file));
  const laid = bakeDecals(img, { rows, seed: 41, every: 3.4, decals: {
    A: ['common/square_decal_soot', 'yard/ty_scorch'],
    I: ['common/square_decal_soot'],
  } });
  const fin = finishFloor(img, rows);
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' Finish laid by hand (tools/world-art/tower-flue.mjs FINISH): ' + fin + '.';
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
  /* 0: THE MASS IS A WALL'S TOP, NOT VOID (round 3: the room closed as Krell's Hold closes its rooms, a wall's top beyond every edge). The
     top is the flue's own hearthstone slab (the 5-pyreash-hearthstone tileset's interior tile, the masonry the chimney is built of) sunk
     down the stone ramp and on into the shadow ramp four steps, so it reads as stone in shadow and never as the floor or as the brick
     faces. ONE flat tone over the whole mass, as the Hold's wall-walk is one step down everywhere: no falloff with distance and no dither
     (a darkening away from the room is a painted shadow, ART_DIRECTION §2). The whole mass is stone: no void. */
  const hsDir = G16 + '/5-pyreash-hearthstone', hsSheet = decodePNG(readFileSync(abs(hsDir) + '/' + readdirSync(abs(hsDir)).find((f) => f.endsWith('-sheet.png'))));
  const ht = wangTiles(metaOf(hsDir), { sheet: hsSheet }).tiles['1111'];
  const slab = crop(hsSheet, ht.x, ht.y, T, T);
  /* the stone ramp bottoms out at #3a3a3e (lock.mjs shadeGround), so the sink runs on down the shadow ramp: one chain, dark to light */
  const CHAIN = [...RAMPS.shadow, ...RAMPS.stone];
  const sink = (im, n) => { const out = crop(im, 0, 0, im.width, im.height); for (let i = 0; i < out.data.length; i += 4) { const k = CHAIN.indexOf('#' + [0, 1, 2].map((j) => out.data[i + j].toString(16).padStart(2, '0')).join('')); if (k >= 0) out.data.set(rgb(CHAIN[Math.max(0, k - n)]), i); } return out; };
  /* laid in RUNNING BOND (lane/a-late-grounds-seams, the seams audit row 17): one slab a cell, square on square, read at 1440x900 as a
     tile grid round the room; every other course is set half a slab over, so the mass reads as the coursed top of a thick wall */
  const top = sink(slab, 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (wall(x, y)) {
    const off = y % 2 ? T >> 1 : 0;
    blit(img, top, off, 0, T - off, T, x * T, y * T);
    if (off) blit(img, top, 0, 0, off, T, x * T + T - off, y * T);
  }
  /* 1: the side walls' coping seen from above: the plain run's cap turned a quarter (its lit row to the west, the light's side), on the edge of
     the mass that meets the floor. A south wall carries its own cap on its face (3). */
  const cap = S.plain[0], capV = createImage(CAP, T);
  for (let r = 0; r < CAP; r++) for (let c = 0; c < T; c++) {
    const s = ((capY + r) * cap.width + c) * 4;
    capV.data.set(cap.data.subarray(s, s + 4), ((T - 1 - c) * CAP + r) * 4);
  }
  let sides = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!wall(x, y) || floor(x, y + 1)) continue;
    if (floor(x - 1, y)) { blit(img, capV, 0, 0, CAP, T, x * T, y * T, true); sides++; }
    if (floor(x + 1, y)) { blit(img, capV, 0, 0, CAP, T, x * T + T - CAP, y * T, true); sides++; }
  }
  /* 1b: the skirting along those copings, on the floor cell beside each (a step down its own ramp; ragged by a px where the hash says) */
  const PLACE = new Map();
  for (const ramp of Object.values(RAMPS)) ramp.forEach((c, k) => PLACE.set(c, { ramp, k }));
  const down = (px, py, n) => { const at = PLACE.get(hexAt(img, px, py)); if (at) setHex(img, px, py, at.ramp[Math.max(0, at.k - n)]); };
  let skirt = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!wall(x, y) || floor(x, y + 1)) continue;
    for (const [dir, fx] of [[1, x + 1], [-1, x - 1]]) {
      if (!floor(fx, y)) continue;
      for (let py = y * T; py < y * T + T; py++) {
        const reach = SKIRT.length - (hash2(fx, py, 111) < 0.4 ? 1 : 0);
        for (let i = 0; i < reach; i++) { down(dir > 0 ? fx * T + i : fx * T + T - 1 - i, py, SKIRT[i]); skirt++; }
      }
    }
  }
  /* 2: the faces, north to south. A face's slice is picked by its distance from the flue's axis, so the rhythm (an ember crack every sixth,
     a pier every twelfth) mirrors left and right: the cracks flank the irons, the piers stand where the curve meets the straight sides */
  const { axis } = flueShape();
  let faces = 0, cracked = 0;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!(wall(x, y) && floor(x, y + 1))) { x++; continue; }
      let e = x; while (e + 1 < w && wall(e + 1, y) && floor(e + 1, y + 1)) e++;
      for (let c = x; c <= e; c++) {
        const i = Math.abs(c - axis);
        const slice = i % 12 === 7 ? S.pier : i % 6 === 3 ? S.ember[Math.floor(i / 6) % 3] : S.plain[i % 2];
        if (slice !== S.pier && i % 6 === 3) cracked++;
        blit(img, slice, 0, 0, T, WALL_H, c * T, y * T + T - WALL_H, true);
        faces++;
      }
      x = e + 1;
    }
  }
  /* 3: THE SOUTH WALLS' FACES (round 3): a wall with the floor to its north shows the face the camera sees, its cap on the floor's south
     edge and its courses running down over the mass below, as the Hold's front wall shows its face over the ground beyond it. The same slices
     and the same rhythm as the north faces, an ember crack every sixth. */
  let south = 0;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!(wall(x, y) && floor(x, y - 1) && !floor(x, y + 1))) { x++; continue; }
      let e = x; while (e + 1 < w && wall(e + 1, y) && floor(e + 1, y - 1) && !floor(e + 1, y + 1)) e++;
      for (let c = x; c <= e; c++) {
        const i = Math.abs(c - axis) + y;
        const slice = i % 6 === 3 ? S.ember[Math.floor(i / 6) % 3] : S.plain[i % 2];
        blit(img, slice, 0, capY, T, WALL_H - capY, c * T, y * T, true);
        south++;
      }
      x = e + 1;
    }
  }
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' The soot-brick walls are laid over the paint by tools/world-art/tower-flue.mjs: ' + faces + ' north face slices (' + cracked + ' ember-cracked) and ' + south + ' south face slices of the two kept pro-flash runs (gen-2026-11-16/01-flue-sample/walls, the plain run remapped onto the ember run\'s ramp), ' + sides + ' side copings (the run\'s cap turned a quarter) with ' + skirt + ' px of skirting on the floor beside them, and the mass beyond every edge a wall\'s top: the flue\'s hearthstone slab sunk 4 steps down the stone and shadow ramps, laid in running bond, one flat tone with no falloff.';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ tower/burning_tower_ground: ' + faces + ' north faces (' + cracked + ' ember-cracked), ' + south + ' south faces, ' + sides + ' side copings');
}

if (isMain(import.meta.url)) {
  try { paintFloor(); layWalls(); } catch (e) { console.error('tower-flue: ' + (e && e.stack || e)); process.exit(2); }
}
