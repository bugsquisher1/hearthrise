// ════════════════════════════════════════════════════════════════════════
// tools/world-art/barrow-grounds.mjs — THE FLOORS, WALLS AND PROPS OF THE SLAKE, THE PYRE FIELD AND KRELL'S HOLD
// (the ground half of import-barrow-2026-11-14.mjs, which runs it; lane/b-barrow-art-import).
//
//   slake  brief 22: the copper silt/reeds and river/mud pairs (wang16, native), four kit props, and the floor painted on
//          those two pairs from the map's rows (slakeGrid).
//   pyre   brief 23's ash family painted from the map's rows (the grid is cut here and saved in art/briefs), the Great Pyre
//          with its ember loop (b9), the burnt pyres and the Stokers' props (brief 24).
//   hold   brief 29's floors painted from the map's rows, the wall mass laid over the paint (a painted ground carries its
//          own walls: compose.js draws no kit over it), the Hall Fire, the gatehouse and the props (brief 30).
//
// THE PYRE'S PAINT GRID. The ash meets scorched earth, cinder and charred wood; burnt grass meets scorched earth, charred
// wood and the March's grass; nothing else has a pair (23-note.json). So: '.' and the Great Pyre's cells are ash, 'o' cinder,
// ':' scorched earth except where it touches timber or a pit (ash there: no scorched/charred pair), '#' charred timber for
// two cells from the field, then burnt grass, then the March's grass at the map's rim.
//
// THE HOLD'S WALLS. Every '#' cell is wall mass. One with floor to its south shows a FACE (a 32x60 slice standing on the
// cell, its cap in the cell above); every other is the dark top of the mass, with capstones along each edge that meets a
// floor. A face run takes the plain slice, a feature every sixth cell (arrow loop, torch bracket, buttress in turn), and an
// END slice only where the run's end stands free (27-note.json). Nothing is drawn: every wall pixel is a kept slice's.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit, crop } from './png.mjs';
import { ROOT, ART_DIR } from './build.mjs';
import { lock } from './lock.mjs';
import { stepPatches, bakeDecals, noise as wearNoise } from './ground-finish.mjs';
import { reseam } from './seams.mjs';
import { wangTiles } from './tileset.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import PYRE_MAP from '../../src/data/grounds/pyre_field/map.js';
import HOLD_MAP from '../../src/data/grounds/krells_hold/map.js';
import SLAKE_MAP from '../../src/data/grounds/the_slake/map.js';

const G14 = 'art/world-src/gen-2026-11-14', B13 = 'art/world-src/gen-2026-11-09b';
const abs = (p) => join(ROOT, p);
const rd = (p) => decodePNG(readFileSync(abs(p)));
const T = 32;
const metaOf = (dir) => JSON.parse(readFileSync(abs(dir + '/' + readdirSync(abs(dir)).find((f) => f.endsWith('-metadata.json'))), 'utf8'));
const on = (im, x, y) => x >= 0 && y >= 0 && x < im.width && y < im.height && im.data[(y * im.width + x) * 4 + 3] >= ALPHA_CUT;
function boxOf(ims) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const im of ims) for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (on(im, x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

/** A prop that moves in place (a fire, embers): its frames cut to their joint box, snapped to the palette, one idle loop (and more clips). */
function clipProp({ set, id, cls, clips, footprint = [1, 1], pixellab, notes }) {
  const all = clips.flatMap((c) => c.frames);
  const [x0, y0, x1, y1] = boxOf(all);
  const w = x1 - x0 + 1 + ((x1 - x0 + 1) % 2), h = y1 - y0 + 1;
  const cols = Math.max(...clips.map((c) => c.frames.length));
  const sheet = createImage(cols * w, clips.length * h);
  clips.forEach((c, r) => c.frames.forEach((f, i) => blit(sheet, lock(crop(f, x0, y0, w, h), 'native'), 0, 0, w, h, i * w, r * h)));
  const dir = join(ROOT, ART_DIR, set);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, id + '.png'), encodePNG(sheet));
  const sc = { id, class: cls, style: 's1', material: 'native', source: id + '.png', frame: [w, h], anchor_px: [Math.floor(w / 2), h - 1], footprint,
    anims: clips.map((c) => ({ name: c.name, fps: c.fps, loop: c.loop, dirs: { s: c.frames.length } })), pixellab, notes };
  writeFileSync(join(dir, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ ' + set + '/' + id + ' (' + cls + ', ' + w + 'x' + h + ', ' + clips.map((c) => c.name + ' ' + c.frames.length).join(' + ') + ')');
}
const framesOf = (dir, pick) => { const fs = readdirSync(abs(dir)).filter((f) => f.endsWith('.png')).sort().map((f) => rd(dir + '/' + f)); return pick ? pick.map((i) => fs[i]) : fs; };

/** The grid brief port-pixellab.mjs paint reads: a header and the PAINT rows. */
function writeGrid(file, head, rows) {
  writeFileSync(abs(file), head.join('\n') + '\n\nPAINT\n' + rows.join('\n') + '\n');
}

export function groundParts(run) {
  const prop = (set, id, cls, file, image) => run('port-pixellab.mjs', ['object', '--set', set, '--id', id, '--class', cls, '--file', abs(file), '--object', image, '--material', 'wood']);
  const pair = (set, id, dir, lower, upper) => {
    const meta = readdirSync(abs(dir)).find((f) => f.endsWith('-metadata.json'));
    run('port-pixellab.mjs', ['tileset', '--set', set, '--id', id, '--meta', abs(dir + '/' + meta), '--file', abs(dir + '/' + meta.replace('-metadata.json', '-sheet.png')), '--lower', lower, '--upper', upper]);
  };
  const parts = {};

  /* ── THE SLAKE (brief 22) ── */
  parts.slake = () => {
    pair('slake', 'sl_silt_reeds', G14 + '/22-silt-reeds', 'silt', 'reeds');
    pair('slake', 'sl_river_mud', G14 + '/22-river-mud', 'river', 'mud');
    for (const [id, src, cls] of SLAKE_PROPS) prop('slake', id, cls, `${G14}/22-slake-props/${src}.png`, 'c681a578');
    /* the floor repainted on the kit's own pairs (lane/b-hold-art; the 11-10 paint was the old silt and the March shallows) */
    const dirs = [G14 + '/22-silt-reeds', G14 + '/22-river-mud'], metas = dirs.map(metaOf);
    const [sr, rm] = metas.map((m) => m.base_tile_ids);
    const grid = 'art/briefs/the-slake-grid-2026-11-14.txt';
    writeGrid(grid, ['THE SLAKE\'S PAINT GRID (lane/b-hold-art, 2026-11-14), cut from src/data/grounds/the_slake/map.js rows by tools/world-art/barrow-grounds.mjs',
      'slakeGrid: S silt (the bars and the walked crossings), W the deep channels, R reeds and banks. The kit has no reeds/water pair, so a bank',
      'cell that touches water (8 ways) is silt. Painted by port-pixellab.mjs paint from brief 22\'s two pairs; the river pair\'s mud is the silt (--same).'], slakeGrid(SLAKE_MAP.rows));
    run('port-pixellab.mjs', ['paint', '--set', 'slake-floor', '--id', 'the_slake_ground', '--grid', abs(grid), '--tilesets', dirs.map(abs).join(','), '--use', metas.map((m) => m.id.slice(0, 8)).join(','),
      '--legend', `S=${sr.lower.slice(0, 8)},W=${rm.lower.slice(0, 8)},R=${sr.upper.slice(0, 8)}`, '--same', `${rm.upper}=${sr.lower}`, '--material', 'native']);
    seam('slake-floor', 'the_slake_ground', slakeGrid(SLAKE_MAP.rows), SLAKE_SEAMS);
    finish('slake-floor', 'the_slake_ground', slakeGrid(SLAKE_MAP.rows), SLAKE_FINISH);
  };

  /* ── THE PYRE FIELD ── */
  parts.pyre = () => {
    const A = `${G14}/23-ash-family`;
    const dirs = ['1-ash-scorched', '3-ash-cinder', '4-ash-charred-wood', '5-scorched-burnt-grass', '6-burnt-grass-charred-wood', '7-burnt-grass-march-grass'].map((d) => `${A}/${d}`);
    const metas = dirs.map(metaOf);
    const ash = metas[0].base_tile_ids.lower;
    const rows = pyreGrid(PYRE_MAP.rows);
    const grid = 'art/briefs/pyre-field-grid-2026-11-14.txt';
    writeGrid(grid, ['THE PYRE FIELD\'S PAINT GRID (lane/b-barrow-art-import, 2026-11-14), cut from src/data/grounds/pyre_field/map.js rows by',
      'tools/world-art/barrow-grounds.mjs (its header says why each cell is what it is): A ash, S scorched earth, C cinder pit,',
      'W charred timber, G burnt grass, M the March\'s grass. Painted by port-pixellab.mjs paint from brief 23\'s six pairs.'], rows);
    run('port-pixellab.mjs', ['paint', '--set', 'pyre', '--id', 'pyre_field_ground', '--grid', abs(grid), '--tilesets', dirs.map(abs).join(','), '--use', metas.map((m) => m.id.slice(0, 8)).join(','),
      '--legend', `A=${ash.slice(0, 8)},S=${metas[0].base_tile_ids.upper.slice(0, 8)},C=${metas[1].base_tile_ids.upper.slice(0, 8)},W=${metas[2].base_tile_ids.upper.slice(0, 8)},G=${metas[3].base_tile_ids.upper.slice(0, 8)},M=${metas[5].base_tile_ids.upper.slice(0, 8)}`,
      /* pairs 3 and 4 were rolled unchained: their ash is the family's ash born again (23-note.json "the same ash family") */
      '--same', `${metas[1].base_tile_ids.lower}=${ash},${metas[2].base_tile_ids.lower}=${ash}`, '--material', 'native']);
    finish('pyre', 'pyre_field_ground', rows, PYRE_FINISH, objectCells(PYRE_MAP, [[25, 16, 10, 5]]));
    pyreRows();
    /* the Great Pyre (b9): the kept one-bed pyre, its embers the round-2 lay (still a b a) of the cut laid back at its crop */
    const still = rd(`${B13}/b9-great-pyre/t1-inpainted-one-bed.png`);
    const lay = JSON.parse(readFileSync(abs(`${B13}/b9-great-pyre/embers/lay.json`), 'utf8'));
    const cuts = framesOf(`${B13}/b9-great-pyre/embers/cut`);
    const frames = lay.loop.map((k) => { const f = createImage(still.width, still.height); blit(f, still, 0, 0, still.width, still.height, 0, 0); blit(f, cuts[k], 0, 0, cuts[k].width, cuts[k].height, 48, 60, true); return f; });
    clipProp({ set: 'pyre', id: 'pf_great_pyre', cls: 'building', footprint: [10, 5], clips: [{ name: 'idle', fps: lay.fps, loop: true, frames }],
      pixellab: { tool: 'create_image_pro + inpaint_image + animate_image', image: '648b1161-0859-4ba5-9dac-994523b2dae9', embers: 'c24b8e34-ae90-418d-b9cf-f475400ea73a', lay: lay.loop },
      notes: 'The Great Pyre (brief 13 Q7 / b9, t1-inpainted-one-bed.png): the kept pyre with its ember loop, the cut frames ' + lay.loop.join(' ') + ' laid back at their crop (48,60), by tools/world-art/barrow-grounds.mjs; pixels unscaled, snapped to the palette by the lock\'s own metric.' });
    for (const [id, cls] of PYRE_PROPS) prop('pyre', id, cls, `${G14}/24-pyre-props/${id}.png`, '9efc5d93');
  };

  /* ── KRELL'S HOLD ── */
  parts.hold = () => {
    const H = `${G14}/29-hold-tiles`;
    const dirs = ['1-earth-cobble', '3-flagstone-cobble', '4-setts-flagstone', '5-planks-flagstone', '6-gravel-cobble', '7-gravel-flagstone'].map((d) => `${H}/${d}`)
      .concat(['1-earth-grass', '2-gravel-grass', '3-grass-rock'].map((d) => `${G14}/33-hold-hill/${d}`));
    const metas = dirs.map(metaOf);
    const id8 = (t) => t.slice(0, 8);
    const grid = 'art/briefs/krells-hold-grid-2026-11-14.txt';
    writeGrid(grid, ['KRELL\'S HOLD\'S PAINT GRID (lane/b-barrow-art-import, 2026-11-14; the hill lane/b-hold-art): src/data/grounds/krells_hold/map.js rows,',
      'their rock split by holdGrid in tools/world-art/barrow-grounds.mjs. . cobble, : the cart road\'s earth, f flagstone, s setts, = the Hall\'s',
      'boards, g gravel, # the castle\'s wall mass (no floor: the walls are laid over the paint), h the hill\'s grass, k the hill\'s rock.',
      'Painted by port-pixellab.mjs paint from brief 29\'s six pairs and the hill\'s three (gen-2026-11-14/33-hold-hill).'], holdGrid(HOLD_MAP.rows));
    run('port-pixellab.mjs', ['paint', '--set', 'hold', '--id', 'krells_hold_ground', '--grid', abs(grid), '--tilesets', dirs.map(abs).join(','), '--use', metas.map((m) => id8(m.id)).join(','),
      '--legend', `.=${id8(metas[0].base_tile_ids.upper)},:=${id8(metas[0].base_tile_ids.lower)},f=${id8(metas[1].base_tile_ids.upper)},s=${id8(metas[2].base_tile_ids.upper)},==${id8(metas[3].base_tile_ids.upper)},g=${id8(metas[4].base_tile_ids.upper)}`
        + `,h=${id8(metas[6].base_tile_ids.upper)},k=${id8(metas[8].base_tile_ids.upper)}`,
      '--void', '#', '--void-fill', WALL_TOP, '--material', 'native']);
    /* the borders before the wear, so a decal lies across a redrawn border as it would across any floor */
    seam('hold', 'krells_hold_ground', holdGrid(HOLD_MAP.rows), HOLD_SEAMS);
    /* the wear goes on before the walls, so a wall face stands over a decal at its foot, never under it */
    /* the hall's back row stays bare: the Hall Fire and its banners stand along it */
    finish('hold', 'krells_hold_ground', holdGrid(HOLD_MAP.rows), HOLD_FINISH, objectCells(HOLD_MAP, [[41, 1, 16, 2]]));
    holdWalls();
    /* the Hall Fire (brief 30): the trough's flicker, and the flare the boss line calls every 20 s (f06 is nearly out: it ends on f05) */
    const F = `${G14}/30-hold-props/hall-fire`;
    const flick = framesOf(`${F}/kh_hall_fire`), flare = framesOf(`${F}/kh_hall_fire_flare`, [0, 1, 2, 3, 4, 5]);
    /* both clips on one frame: the flicker (128x48) stands on the flare's (128x64) floor row */
    const tall = (f) => { const o = createImage(128, 64); blit(o, f, 0, 0, f.width, f.height, 0, 64 - f.height); return o; };
    clipProp({ set: 'hold', id: 'kh_hall_fire', cls: 'hallfire', footprint: [4, 1],
      clips: [{ name: 'idle', fps: 8, loop: true, frames: flick.map(tall) }, { name: 'flare', fps: 8, loop: false, frames: flare.map(tall) }],
      pixellab: { tool: 'create_image_pro_flash + animate_image', image: '32c4ae4c', flicker: '28cf6fc5', flare: 'd6b2b139' },
      notes: 'The Hall Fire (brief 30): a gray stone trough of logs and embers, its flicker (f00-f04) and its flare (f00-f05) on one frame, by tools/world-art/barrow-grounds.mjs; pixels unscaled, snapped to the palette by the lock\'s own metric.' });
    for (const id of ['kh_brazier', 'kh_candle_stand']) {
      clipProp({ set: 'hold', id, cls: 'fixture', clips: [{ name: 'idle', fps: 8, loop: true, frames: framesOf(`${G14}/30-hold-props/props-clips/${id}`) }],
        pixellab: { tool: 'create_image_pro_flash + animate_image', image: 'c8de9701' },
        notes: 'Brief 30 sheet C (c8de9701), the kept cell and its four-frame flame: the stand does not move. By tools/world-art/barrow-grounds.mjs; pixels unscaled, snapped to the palette.' });
    }
    prop('hold', 'kh_gatehouse', 'gate', wideGate(rd(`${H}/gatehouse/kh_gatehouse-586d798e.png`)), '586d798e');
    for (const [id, cls, sheet] of HOLD_PROPS) prop('hold', id, cls, `${G14}/30-hold-props/props/${id}.png`, sheet);
    hungBanner();
  };
  return parts;
}

/* ── THE FINISH: wear on each floor (tools/world-art/ground-finish.mjs), lane/b-march-floors ──
   patches  [cell characters, lattice px, cut, seed, { from: to }]: the colours are the fills' own (a census of each fill tile), each
            moved one step down its ramp, so a patch is the same stone damp or sooted, never a new texture.
   decals   the floors each kept decal may lie on, and the jitter cell (`every` tiles: one decal per every^2 tiles at most). */
const SLAKE_FINISH = Object.freeze({
  /* the silt's chevron rows come from its one green wave (#1f3322): bare mud patches drop it, damp patches darken the mud */
  patches: [['S', 192, 0.5, 11, { '#1f3322': '#2f2723' }], ['S', 160, 0.62, 12, { '#2f2723': '#231d1f', '#553a26': '#3d2a1d' }]],
});
const PYRE_FINISH = Object.freeze({
  patches: [['A', 72, 0.58, 21, { '#8a867d': '#6a6865', '#6a6865': '#4f4e52' }]],
  every: 4.4, seed: 22,
  /* the Banded Company's gear where it fell, and the burn's own marks (the bones and skulls stand as the map's objects) */
  /* (the Company's round shield was tried: on the ash it read as the map's cart wheel, a dozen times over) */
  decals: { A: ['march/hf_pikes_fallen', 'march/hf_helm_heap', 'muster/mu_standard_fallen', 'yard/ty_scorch', 'common/square_decal_soot'] },
});
const HOLD_FINISH = Object.freeze({
  every: 3.2, seed: 31,
  decals: {
    /* the courts: rain, soot and the woodyard's chips (the Drill Yard fed the pyres) */
    '.': ['common/square_decal_puddle_a', 'common/square_decal_puddle_b', 'common/square_decal_soot', 'common/square_decal_chips_a', 'common/square_decal_chips_b', 'sewer/exposed_dirt'],
    f: ['sewer/cracked_flagstone', 'common/square_decal_soot', 'common/square_decal_puddle_b'],
    s: ['sewer/bones', 'mill/bone_pile', 'sewer/moss_puddle', 'common/square_decal_puddle_a'],
    '=': ['mill/straw', 'common/square_decal_chips_b'],
    /* never a stone that stands up off the floor (scree read as a rock in the way): flat marks only */
    g: ['common/square_decal_puddle_a', 'common/square_decal_soot', 'sewer/exposed_dirt'],
    h: ['common/square_decal_tuft_a', 'common/square_decal_tuft_b'],
  },
});
/* ── THE SEAMS: every border between two floors redrawn from the two fills' own pixels (tools/world-art/seams.mjs, lane/a-ground-seams) ──
   The kit's pairs drew each border on the cell grid: the courts' cobble met the Hall's flagstone and the gravel on ruler lines, the
   gravel patches read as dug pits with a lit rim, the hill's rock sat in rounded boxes on the grass. Now: the Hall's slabs end on a
   kerb course where they meet the courts; cobble and flagstone break up into the gravel stone by stone, loose stones past the edge;
   the hill's rock breaks through the grass as whole stones; the verges wander. z: what lies over what. */
const HOLD_SEAMS = Object.freeze({
  seed: 29, keep: '#',
  mats: {
    '.': { z: 2, unit: true, mortar: 0.48 }, f: { z: 3, unit: true, mortar: 0.1 }, s: { z: 3, unit: true, mortar: 0.2 }, '=': { z: 2 },
    g: { z: 1 }, ':': { z: 0 }, h: { z: 1 }, k: { z: 3, unit: true, mortar: 0.16 },
  },
  pairs: [
    { a: '.', b: 'f', style: 'kerb' }, { a: '=', b: 'f', style: 'kerb', course: 'f' },
    { a: 'f', b: 's', style: 'stagger', jitter: 6 },
    /* the worn patches are one to three cells: a calm warp keeps each a broken blob, the default sweep drew it as a splash */
    { a: 'f', b: 'g', style: 'scatter', jitter: 8, loose: 0.35, sweep: 3, warp: 5, scale: 22 },
    { a: '.', b: 'g', style: 'scatter', jitter: 2, loose: 0.4, holes: 0.06, fade: 10, sweep: 3, warp: 4, scale: 20, mid: 1.5 },
    { a: '.', b: ':', style: 'scatter', jitter: 2, holes: 0.06, sweep: 3, warp: 4 },
    { a: 'h', b: 'k', style: 'scatter', jitter: 5, holes: 0, loose: 0.3, fade: 10, sweep: 4, warp: 4, scale: 24, bias: { k: 0.08 } },
    { a: 'g', b: 'h', style: 'ragged' }, { a: ':', b: 'h', style: 'ragged' },
  ],
});
/* The Slake: the channels were rounded boxes and the reed beds staircases. The water now has a shore (a wet band in the silt, a lit
   lip), drawn back inside its own cells and never onto the walked silt (own, bias: [wet]); the reeds' edge wanders. */
const SLAKE_SEAMS = Object.freeze({
  seed: 23,
  mats: { W: { z: 0, own: true }, S: { z: 1 }, R: { z: 2 } },
  pairs: [{ a: 'W', b: 'S', style: 'bank', bias: { S: 0.3 }, sweep: 7, warp: 5 }, { a: 'S', b: 'R', style: 'ragged' }],
});
function seam(set, id, rows, cfg) {
  const file = join(ROOT, ART_DIR, set, id + '.png');
  const r = reseam(decodePNG(readFileSync(file)), Object.assign({ rows }, cfg));
  writeFileSync(file, encodePNG(r.img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' Seams (lane/a-ground-seams, tools/world-art/seams.mjs): ' + r.changed + ' px of ' + cfg.pairs.length + ' borders redrawn from the fills\' own pixels ('
    + [...new Set(cfg.pairs.map((p) => p.style))].join(', ') + ').';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ ' + set + '/' + id + ': seams, ' + r.changed + ' px redrawn');
}

/** Every cell a map object stands on (its anchor tile), and the rectangles [x, y, w, h] given: no decal is baked under them. */
function objectCells(map, rects = []) {
  const s = new Set(map.objects.map((o) => o.x + ',' + o.y));
  for (const [x0, y0, w, h] of rects) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) s.add(x + ',' + y);
  return (x, y) => s.has(x + ',' + y);
}
function finish(set, id, rows, f, skip) {
  const file = join(ROOT, ART_DIR, set, id + '.png');
  const img = decodePNG(readFileSync(file));
  let moved = 0;
  for (const [chars, scale, cut, seed, map] of f.patches || []) moved += stepPatches(img, { rows, on: (ch) => chars.includes(ch), scale, cut, seed, map });
  const laid = f.decals ? bakeDecals(img, { rows, seed: f.seed, every: f.every, decals: f.decals, skip }) : [];
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' Wear (lane/b-march-floors, tools/world-art/ground-finish.mjs): ' + moved + ' px of the fills stepped one value down their ramps in noise patches'
    + (laid.length ? ', ' + laid.length + ' kept decals baked on a jittered grid (' + [...new Set(laid.map((d) => d.id))].join(', ') + ')' : '') + '.';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ ' + set + '/' + id + ': wear, ' + moved + ' px stepped, ' + laid.length + ' decals');
}

/* ── Krell's red on the walls (lane/b-march-floors): the banner stand's own crossbar and cloth (brief 30, 3d9dadd3) hung on a wall
   face, no pole and no foot, 0 gens. Class `hanging`: it never blocks a step, so it costs the pack no cell, and it stands on the
   face's own row (its frame's foot is the floor line, the cloth hangs 8 px clear of it). */
const BANNER_ROWS = [3, 43];   /* the stand's crossbar to the cloth's swallowtail; its finial and pole are left behind */
function hungBanner() {
  const src = rd(`${ART_DIR}/hold/kh_banner_stand.png`);
  const [y0, y1] = BANNER_ROWS, fh = 48;
  const out = createImage(src.width, fh);
  blit(out, src, 0, y0, src.width, y1 - y0, 0, 0);
  const dir = join(ROOT, ART_DIR, 'hold');
  writeFileSync(join(dir, 'kh_banner_hung.png'), encodePNG(out));
  const sc = { id: 'kh_banner_hung', class: 'hanging', style: 's1', material: 'native', source: 'kh_banner_hung.png', frame: [src.width, fh], anchor_px: [src.width >> 1, fh - 1], footprint: [1, 1],
    anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }], pixellab: { tool: 'derived (0 gens)', from: 'kh_banner_stand', image: '3d9dadd3' },
    notes: 'Krell\'s red hung on a wall face: rows ' + y0 + '-' + (y1 - 1) + ' of kh_banner_stand (its crossbar and cloth) by tools/world-art/barrow-grounds.mjs hungBanner; pixels unscaled, nothing drawn.' };
  writeFileSync(join(dir, 'kh_banner_hung.json'), JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ hold/kh_banner_hung (hanging, ' + src.width + 'x' + fh + ')');
}

/* raw name -> the kit's name (mr_: the March's river pieces), class */
const SLAKE_PROPS = Object.freeze([['mr_stake_net_post', 'sl_stake_net_post', 'wreck'], ['mr_rope_coil', 'sl_rope_coil', 'wreck'], ['mr_drowned_cart', 'sl_drowned_cart', 'fixture']]);
const PYRE_PROPS = Object.freeze([['pf_burnt_pyre', 'wreck'], ['pf_burnt_pyre_small', 'log'], ['pf_burnt_pyre_scatter', 'log'], ['ma_fire_rake', 'fixture'], ['ma_log_stack', 'wreck'], ['ma_ash_barrow', 'wreck'], ['ma_charred_stake', 'fixture']]);
const HOLD_PROPS = Object.freeze([
  ['kh_high_seat', 'fixture', 'c20648fa'], ['kh_lectern', 'fixture', 'c20648fa'], ['kh_hall_table', 'station', 'c20648fa'], ['kh_hall_table_runner', 'station', 'c20648fa'],
  ['kh_banner_stand', 'fixture', '3d9dadd3'], ['kh_colors_upside_down', 'fixture', '3d9dadd3'],
  ['kh_pell', 'fixture', '80ea6463'], ['kh_weapon_rack', 'wreck', '80ea6463'], ['kh_woodpile', 'wreck', '80ea6463'], ['kh_well', 'wreck', '80ea6463'],
  ['kh_coffin_open', 'fixture', 'c8de9701'], ['kh_chapel_bench', 'wreck', 'c8de9701'], ['kh_toll_box', 'barrel', 'c8de9701']]);

/* ── the gatehouse widened to the cart road's three-tile gate (lane/b-hold-art) ──
   Brief 29's kept gatehouse (586d798e) has a 41 px arch: a one-tile gate on a road the map keeps three wide (no choke, no bridge).
   GATE_WIDEN px go into it at the arch, each band of rows repeating its own period so nothing is drawn: the battlements and the
   courses above the crown repeat a merlon and its gap (15 px, cut at x113), the crown's keystone and the opening's portcullis
   repeat a keystone's width and two bars (6 px, cut at x104), so the arch becomes a flat arch of voussoirs. The bands meet on the
   two plain course lines (rows 86 and 92). The result is cropped round the arch's centre, so the bottom-centre anchor is the gate's. */
const GATE_WIDEN = 60;
const GATE_BANDS = Object.freeze([[0, 93, 113, 15], [93, 999, 104, 6]]);   /* [first row, end row, cut column, period] */
function wideGate(src) {
  const W = src.width + GATE_WIDEN, out = createImage(W, src.height);
  for (const [r0, r1, c, P] of GATE_BANDS) for (let y = r0; y < Math.min(r1, src.height); y++) for (let x = 0; x < W; x++) {
    const sx = x < c ? x : x < c + GATE_WIDEN ? c - P + ((x - c) % P) : x - GATE_WIDEN;
    out.data.set(src.data.subarray((y * src.width + sx) * 4, (y * src.width + sx) * 4 + 4), (y * W + x) * 4);
  }
  /* the arch: the opening's dark run on its floor row, its centre the crop's centre */
  const [x0, , x1] = boxOf([out]);
  const centre = 102 + GATE_WIDEN / 2, half = Math.max(centre - x0, x1 - centre) + 2;
  openArch(out, centre);
  const file = `${G14}/33-hold-hill/gatehouse/kh_gatehouse_wide.png`;
  mkdirSync(abs(`${G14}/33-hold-hill/gatehouse`), { recursive: true });
  writeFileSync(abs(file), encodePNG(crop(out, centre - half, 0, half * 2, out.height)));
  return file;
}

/* ── the open gate (lane/b-march-floors): the passage was painted dark stone, so a unit in the gate or just inside it stood behind
   the sprite and vanished. The opening is cut out: below the raised portcullis every pixel between the jambs, and between its bars
   the dark gaps, so the road and whoever stands on it show through, as through any open gate. The jambs keep a 1 px edge. ── */
const ARCH = Object.freeze({ bars: 104, open: 116, sill: 151, jamb: 70, gap: 50, probe: 120 });
function openArch(img, cx) {
  const L = (x, y) => { const p = (y * img.width + x) * 4; return img.data[p + 3] < ALPHA_CUT ? 255 : 0.3 * img.data[p] + 0.59 * img.data[p + 1] + 0.11 * img.data[p + 2]; };
  let l = cx, r = cx;
  while (l > 0 && L(l - 1, ARCH.probe) < ARCH.jamb) l--;
  while (r < img.width - 1 && L(r + 1, ARCH.probe) < ARCH.jamb) r++;
  if (r - l < 60) throw new Error('openArch: the opening at row ' + ARCH.probe + ' is ' + (r - l + 1) + ' px, not the widened arch');
  for (let y = ARCH.bars; y <= ARCH.sill; y++) for (let x = l + 1; x <= r - 1; x++) {
    if (y < ARCH.open && L(x, y) >= ARCH.gap) continue;
    img.data[(y * img.width + x) * 4 + 3] = 0;
  }
}

/** The Slake's paint rows from its map rows: '~' water, '#' reeds unless it touches water, every other cell silt. */
function slakeGrid(rows) {
  const h = rows.length, w = rows[0].length;
  const at = (x, y) => rows[Math.min(h - 1, Math.max(0, y))][Math.min(w - 1, Math.max(0, x))];
  const wet = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === '~') return true; return false; };
  return rows.map((row, y) => [...row].map((ch, x) => (ch === '~' ? 'W' : ch === '#' && !wet(x, y) ? 'R' : 'S')).join(''));
}

/** The Pyre Field's paint rows from its map rows (the header's rule). */
function pyreGrid(rows) {
  const h = rows.length, w = rows[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : rows[y][x]);
  const near = (x, y, r, test) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (test(at(x + dx, y + dy))) return true; return false; };
  const base = rows.map((row, y) => [...row].map((ch, x) => {
    if (ch === 'o') return 'C';
    if (ch === ':') return near(x, y, 1, (c) => c === '#' || c === 'o') ? 'A' : 'S';
    if (ch !== '#') return 'A';
    if (near(x, y, 2, (c) => c !== '#')) return 'W';
    return near(x, y, 4, (c) => c !== '#') ? 'G' : 'M';
  }));
  /* BURN SCARS (lane/b-march-floors): the open ash is one fill, so blobs of a 3-cell noise lattice lay scorched earth on it, away from
     the timber and the pits (no scorched/charred or scorched/cinder pair). Burnt grass at the heart of the larger ones was tried: its
     fill is a lime green that read as fresh turf. The Great Pyre's cells stay ash under it. Paint only: every cell blocks or opens a
     step as its row says. */
  const g = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 'W' : base[y][x]);
  const all8 = (x, y, test) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!test(g(x + dx, y + dy), x + dx, y + dy)) return false; return true; };
  const pyre = (x, y) => x >= 25 && x < 35 && y >= 16 && y < 21;
  const scar = base.map((r, y) => r.map((c, x) => c === 'A' && !pyre(x, y) && all8(x, y, (q) => q === 'A' || q === 'S') && wearNoise(x * 32, y * 32, 3 * 32, 41) > 0.7));
  /* a lone cell of scar is a square stamp, not a burn: a scar keeps a neighbour of its own, or goes */
  const lone = (x, y) => ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => scar[y + dy] && scar[y + dy][x + dx]);
  return base.map((r, y) => r.map((c, x) => (scar[y][x] && !lone(x, y) ? 'S' : c)).join(''));
}

/* ── the Pyre Field's two pyre rows: burnt-out pyres and log stacks laid on the charred timber ──
   The rows block a step (thicket), and nothing may be PLACED on a blocked cell (map-compile.js L-SPACE), so what stands on them is
   in the paint, as a painted ground's walls are: brief 24's kept pieces, one every four cells of each two-deep run, in turn. */
function pyreRows() {
  const file = join(ROOT, ART_DIR, 'pyre', 'pyre_field_ground.png');
  const img = decodePNG(readFileSync(file));
  const rows = PYRE_MAP.rows, w = rows[0].length;
  const P = `${G14}/24-pyre-props`;
  const pieces = ['pf_burnt_pyre', 'ma_log_stack', 'pf_burnt_pyre_small', 'pf_burnt_pyre', 'pf_burnt_pyre_scatter', 'ma_charred_stake'].map((id) => rd(`${P}/${id}.png`));
  let n = 0;
  for (let y = 0; y + 1 < rows.length; y++) {
    /* a pyre row: two rows deep, open field above and below it somewhere along the run */
    let x = 3;
    while (x < w - 3) {
      const deep = (c) => rows[y][c] === '#' && rows[y + 1][c] === '#' && rows[y - 1] && rows[y - 1][c] !== '#' && rows[y + 2] && rows[y + 2][c] !== '#';
      if (!deep(x)) { x++; continue; }
      let e = x; while (e + 1 < w - 3 && deep(e + 1)) e++;
      for (let c = x + 1; c + 1 <= e; c += 4) {
        const p = pieces[n++ % pieces.length];
        blit(img, p, 0, 0, p.width, p.height, c * T + T - (p.width >> 1), (y + 2) * T - 8 - p.height, true);
      }
      x = e + 1;
    }
  }
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' The two pyre rows carry ' + n + ' burnt-out pyres, log stacks and stakes (brief 24\'s kept pieces) laid on the charred timber by tools/world-art/barrow-grounds.mjs: the rows block a step, so their pieces are in the paint.';
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ pyre/pyre_field_ground: ' + n + ' pieces laid on the pyre rows');
}

/* ── THE HILL: the castle's rock split into its walls and the hillside it stands on (lane/b-hold-art) ──
   The v0.2.130 gate read the whole '#' as wall mass, so the cart road climbed between black wall tops: a castle's inside.
   Now a '#' cell is the CASTLE when it touches a castle floor (cobble, flagstone, setts, boards: a wall one thick), or lies two
   rows south of one (a south wall is two thick, so a face standing on the outer row keeps its cap on the inner one, never on the
   floor), or when it is shut inside the castle (no way out to the map's edge through other rock), or is one of the gate's tower
   cells. Every other '#' cell is the HILL: grass, with gray rock breaking through where a smooth noise (a 3-cell lattice)
   runs high, more of it at the foot of the walls, never beside the road or the gravel (the kit has no rock/earth or
   rock/gravel pair). The hill blocks a step as the rock always did: only its paint changed. */
const CASTLE_FLOORS = '.fs=';
const GATE_TOWERS = Object.freeze([[27, 38], [27, 39], [31, 38], [31, 39]]);
export function holdCastle(rows) {
  const h = rows.length, w = rows[0].length;
  const rock = (x, y) => x < 0 || y < 0 || x >= w || y >= h || rows[y][x] === '#';
  const near = (x, y, r, test) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && test(rows[Y][X])) return true; } return false; };
  const castle = new Uint8Array(w * h);
  const floorAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && CASTLE_FLOORS.includes(rows[y][x]);
  const southWall = (x, y) => floorAt(x - 1, y - 2) || floorAt(x, y - 2) || floorAt(x + 1, y - 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rock(x, y) && (near(x, y, 1, (c) => CASTLE_FLOORS.includes(c)) || southWall(x, y))) castle[y * w + x] = 1;
  for (const [x, y] of GATE_TOWERS) castle[y * w + x] = 1;
  /* the hill: rock reachable from the map's edge through rock that is not castle; what is left is shut in, the castle's. Since
     lane/b-march-floors the hill runs round all four sides (it was the south half only, so the castle stood in a black margin) */
  const hill = new Uint8Array(w * h), stack = [];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (rock(x, y) && !castle[y * w + x]) stack.push(x, y);
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (rock(x, y) && !castle[y * w + x]) stack.push(x, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop(), i = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || hill[i] || castle[i] || !rock(x, y)) continue;
    hill[i] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  for (let i = 0; i < w * h; i++) if (rows[Math.floor(i / w)][i % w] === '#' && !hill[i]) castle[i] = 1;
  return { castle, hill, w, h };
}
function holdGrid(rows) {
  const { castle, hill, w, h } = holdCastle(rows);
  const lat = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const fx = x / 3, fy = y / 3, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    return (lat(i, j) * (1 - u) + lat(i + 1, j) * u) * (1 - v) + (lat(i, j + 1) * (1 - u) + lat(i + 1, j + 1) * u) * v;
  };
  const any8 = (x, y, test) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && test(X, Y)) return true; } return false; };
  const base = rows.map((row, y) => [...row].map((ch, x) => {
    const i = y * w + x;
    if (castle[i]) return '#';
    if (!hill[i]) return ch;
    if (any8(x, y, (X, Y) => !castle[Y * w + X] && !hill[Y * w + X])) return 'h';   /* beside a floor: the road's and the path's verge */
    return noise(x, y) + (any8(x, y, (X, Y) => castle[Y * w + X]) ? 0.2 : 0) > 0.74 ? 'k' : 'h';
  }));
  return holdPatches(base).map((r) => r.join(''));
}

/* ── WORN PATCHES IN THE HOLD'S FLOORS (lane/b-march-floors) ──
   Each court was one fill tile end to end. Blobs of a 4-cell noise lattice lay a second material of the kit inside a floor, where the
   kit has the pair: gravel where the cobble or the flagstone has broken up, flagstone relaid in the Crypt's setts (the cart road's
   earth was tried in the courts and read as bright square digs on the dark cobble). A patch cell keeps its floor's own material round it (all 8 neighbours its floor, the wall
   mass or the same patch), so no vertex meets a pair the kit cannot draw. Paint only: the map rows say what blocks a step. */
const HOLD_PATCHES = Object.freeze([
  /* [floor, patch material, noise cut, seed] */
  ['.', 'g', 0.68, 52], ['f', 'g', 0.78, 53], ['s', 'f', 0.68, 54],
]);
function holdPatches(base) {
  const h = base.length, w = base[0].length;
  const out = base.map((r) => r.slice());
  for (const [floor, mat, cut, seed] of HOLD_PATCHES) {
    const cand = (x, y) => base[y][x] === floor && out[y][x] === floor && wearNoise(x * 32, y * 32, 4 * 32, seed) > cut;
    const pick = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!cand(x, y)) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = out[y + dy][x + dx];
        /* never beside another floor or another patch's material (earth and gravel have no pair) */
        if (q !== floor && q !== '#' && q !== mat) { ok = false; break; }
      }
      if (ok) pick.push([x, y]);
    }
    for (const [x, y] of pick) out[y][x] = mat;
  }
  return out;
}

/* ── the Hold's wall mass over its paint ── */
const WALL_TOP = '#17141a';
const ROOF_DIR = `${G14}/34-march-floors/1-flagstone-roof`;
/* the flagstone's colours (a census of the fill) one step down: iron and stone into the shadow ramp */
const WALK_STEP = Object.freeze({ '#2c2e33': '#17141a', '#3a3a3e': '#231d1f', '#4f4e52': '#2c2e33', '#4a4d54': '#2c2e33' });
function holdWalls() {
  const file = join(ROOT, ART_DIR, 'hold', 'krells_hold_ground.png');
  const img = decodePNG(readFileSync(file));
  const rows = HOLD_MAP.rows, h = rows.length, w = rows[0].length;
  /* the castle's mass only: the hill is painted ground, so a wall that meets it shows its face or its capstones as at a floor */
  const { castle } = holdCastle(rows);
  const wall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || castle[y * w + x] === 1;
  const floor = (x, y) => !wall(x, y);
  const W = `${G14}/29-hold-tiles/walls`, W26 = `${G14}/26-hold-sample/walls`;
  const S = { plain: rd(`${W26}/kh_wall_plain_b.png`), loop: rd(`${W26}/kh_wall_arrow_loop.png`), torch: rd(`${W26}/kh_wall_torch_bracket.png`), buttress: rd(`${W}/kh_wall_buttress.png`),
    cracked: rd(`${W}/kh_wall_cracked.png`), left: rd(`${W}/kh_wall_end_left.png`), right: rd(`${W}/kh_wall_end_right.png`) };
  for (const [k, s] of Object.entries(S)) if (s.width !== T || s.height !== 60) throw new Error('wall slice ' + k + ' is ' + s.width + 'x' + s.height + ', not 32x60');
  const strip = rd(`${W}/kh_wallcap_strip-7e08f2e8.png`);
  const [sx0, , sx1] = boxOf([strip]);
  /* the cap a run of capstones shows from above, east-west: the plain slice's own cap rows (its first opaque row down to the face) */
  let capY = 0; while (!on(S.plain, 16, capY)) capY++;
  const CAP = 10;
  /* 1: the mass's top (lane/b-march-floors: it was flat WALL_TOP, and the inner keep read as a black hole). A cell shut in by wall
     on all eight sides is ROOF, the slate fill of gen-2026-11-14/34-march-floors/1-flagstone-roof (born on the palette); the rest */
  const roofMeta = metaOf(ROOF_DIR), roofSheet = rd(ROOF_DIR + '/' + readdirSync(abs(ROOF_DIR)).find((f) => f.endsWith('-sheet.png')));
  const { tiles: rtiles } = wangTiles(roofMeta, { sheet: roofSheet }), rt = rtiles['1111'], wt = rtiles['0000'];
  const walk = crop(roofSheet, wt.x, wt.y, T, T);
  stepPatches(walk, { rows: ['w'], on: () => true, scale: 1, cut: -1, seed: 0, band: 0, map: WALK_STEP });
  const inner = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!wall(x + dx, y + dy)) return false; return true; };
  let roofs = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!wall(x, y)) continue;
    if (inner(x, y)) { blit(img, roofSheet, rt.x, rt.y, T, T, x * T, y * T); roofs++; continue; }
    /* the rest of the mass is the wall-walk: the same tileset's flagstone (the Hold's own, chained) one value step down, so it reads
       as the top of a wall in shadow and never as the floor beside it */
    blit(img, walk, 0, 0, T, T, x * T, y * T);
  }
  /* 2: capstones on each edge of the top that meets a floor (a face cell carries its own cap) */
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!wall(x, y) || floor(x, y + 1)) continue;
    if (floor(x, y - 1)) blit(img, S.plain, 0, capY, T, CAP, x * T, y * T, true);
    if (floor(x + 1, y)) blit(img, strip, sx0, (y * T) % strip.height, sx1 - sx0 + 1, T, x * T + T - (sx1 - sx0 + 1), y * T, true);
    if (floor(x - 1, y)) blit(img, strip, sx0, (y * T) % strip.height, sx1 - sx0 + 1, T, x * T, y * T, true);
  }
  /* 3: the faces, north to south so a nearer wall stands over a farther one */
  let faces = 0;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!(wall(x, y) && floor(x, y + 1))) { x++; continue; }
      let e = x; while (e + 1 < w && wall(e + 1, y) && floor(e + 1, y + 1)) e++;
      for (let c = x; c <= e; c++) {
        const i = c - x, n = e - x + 1;
        const slice = i === 0 && floor(x - 1, y) && n > 1 ? S.left : c === e && floor(e + 1, y) && n > 1 ? S.right
          : i % 6 === 3 ? [S.loop, S.torch, S.buttress][Math.floor(i / 6) % 3] : i % 6 === 0 && i > 0 && n - i > 2 ? S.cracked : S.plain;
        blit(img, slice, 0, 0, T, 60, c * T, y * T + T - 60, true);
        faces++;
      }
      x = e + 1;
    }
  }
  writeFileSync(file, encodePNG(img));
  const jp = file.replace(/\.png$/, '.json'), sc = JSON.parse(readFileSync(jp, 'utf8'));
  sc.notes += ' The wall mass is laid over the paint by tools/world-art/barrow-grounds.mjs: ' + faces + ' face slices (brief 26 and 29\'s kept runs), capstones on the top\'s other edges, the top a wall-walk of the Hold\'s flagstone'
    + ' and ' + roofs + ' cells of the keep\'s slate roof (tileset ' + roofMeta.id + ') where the mass is wall on all sides.';
  sc.pixellab.tileset += ',' + roofMeta.id;
  writeFileSync(jp, JSON.stringify(sc, null, 2) + '\n');
  console.log('  ✓ hold/krells_hold_ground: ' + faces + ' wall faces laid over the paint');
}
